import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { buildPathWitnessTrees, proposePathWitnessFromBranches, proposePathWitnessFromPrefixes, PATH_PREFIX_RANDOMNESS } from '../src/path-witness-trees.mjs';
import { createPathWitnessPool, routePathWitnessPool } from '../src/path-witness-pool.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { PathWitnessCache } from '../src/path-witness-cache.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const deep = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/branch-tree-miss.json', import.meta.url)));
const contract = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/m3-prefix-contract-validation.json', import.meta.url)));
const build = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 };
const budget = { epoch: 3, maxPrefixHops: 3, maxPrefixes: 4096, maxExpansions: 10000, maxBranches: 64, maxTreeLookups: 1000, maxCandidates: 256, maxPackingSteps: 10000 };
const oracle = { epoch: 3, maxExpansions: 10000, maxPaths: 128, maxPackingSteps: 10000 };
function fixture(nodes, edges, patch = {}, anchors = ['a', 'b'], difficulty = 2, name = 'prefix-control') {
  const graph = new DirectedGraph(name); nodes.forEach(id => graph.addNode(id)); edges.forEach(([a, b]) => graph.addEdge(a, b));
  const context = structuredClone(base); Object.assign(context.policy, { maxHops: 3 }, patch);
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty, anchors }], removed: [], standing: [] };
  return { graph, context, options, view: () => pathWitnessGraphView(graph, options) };
}
function advice(nodes, mode = 'uniform', maxPoolSize = 64) {
  const pool = createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize, candidates: nodes.map(id => ({ id, score: 0 })) });
  return { pools: nodes.map(subject => ({ subject, pool, loads: mode === 'uniform' ? null : pool.ranked.map(({ id }) => ({ id, load: 0 })) })),
    routing: { seed: 'prefix-software-control', queryId: 'query-1', step: 0, mode } };
}
function checked(f, view, forest, q = budget, a = advice(f.graph.toJSON().nodes)) {
  const r = proposePathWitnessFromPrefixes(forest, view, f.context, q, a);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.prefix)); assert.ok(r.stats.treeLookups <= q.maxTreeLookups && r.stats.candidatesExamined <= q.maxCandidates && r.stats.packingSteps <= q.maxPackingSteps);
  assert.ok(r.prefix.stats.queued <= q.maxPrefixes && r.prefix.stats.neighborTrials <= q.maxExpansions);
  assert.equal(r.prefix.prefixes.length, r.prefix.stats.queued);
  if (r.status === 'found') {
    assert.equal(r.feasible, true); assert.equal(r.witness.paths.length, r.required);
    for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(r.wire), f.context, view).accepted, true);
  } else { assert.equal(r.feasible, null); assert.equal(r.wire, null); }
  return r;
}
// Independent raw-arc DFS enumerates sets, not FIFO order, pool calls or production neighbor access.
function rawPrefixes(nodes, edges, subject, p, depth, scores) {
  const result = [], has = (a, b) => edges.some(([x, y]) => a === x && b === y);
  function visit(path) {
    result.push(path); const node = path.at(-1);
    if (path.length - 1 === depth || (node !== subject && p.minStanding !== null && (scores.get(node) ?? -1) < p.minStanding)) return;
    for (const next of nodes) if (!path.includes(next)) {
      const f = has(node, next), b = has(next, node);
      if (p.direction === 'directed-from-anchor' ? b : p.undirectedProjection === 'reciprocal-only' ? f && b : f || b) visit([...path, next]);
    }
  }
  visit([subject]); return result.map(path => JSON.stringify(path)).sort();
}

test('two-hop prefix/tree join repairs the five-node miss in both modes; depth1 remains unknown and found tolerates truncation', () => {
  const f = fixture(deep.nodes, deep.edges), view = f.view(), forest = buildPathWitnessTrees(view, build);
  for (const mode of ['uniform', 'best-of-two']) {
    const a = advice(deep.nodes, mode), shallow = checked(f, view, forest, { ...budget, maxPrefixHops: 1 }, a);
    assert.equal(shallow.status, 'censored'); assert.equal(shallow.reason, 'prefix-depth-limit');
    const found = checked(f, view, forest, { ...budget, maxPrefixHops: 2 }, a);
    assert.equal(found.status, 'found'); assert.deepEqual(found.witness.paths, deep.expected.oneValidGlobalFamily); assert.equal(found.prefix.coverage.prefixDepthLimit, true);
    assert.ok(found.prefix.prefixes.some(p => JSON.stringify(p) === '["u","x","y"]'));
    assert.equal(findPathWitness(view, f.context, oracle).status, 'found');
    const cache = new PathWitnessCache({ maxEntries: 4, maxBytes: 10000, ttlTicks: 3 }); assert.equal(cache.lookup(view, f.context, oracle, { tick: 0, hint: found.wire }).source, 'hint');
  }
});

test('1152 tiny raw-prefix sets and M2 comparisons cover projections, depths and optional intermediate scores', t => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b])); let sets = 0, found = 0;
  const a = advice(nodes);
  for (let bits = 0; bits < 64; bits++) for (const mode of ['directed', 'any', 'reciprocal']) for (const enabled of [false, true]) for (let depth = 0; depth <= 2; depth++) {
    const edges = arcs.filter((_, i) => bits & (1 << i)), f = fixture(nodes, edges, { maxHops: 2, minStanding: enabled ? 1 : null,
      direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' });
    f.options.standing = [['a', 0], ['b', 1]]; const view = f.view(), forest = buildPathWitnessTrees(view, build);
    const r = checked(f, view, forest, { ...budget, maxPrefixHops: depth }, a);
    assert.deepEqual(r.prefix.prefixes.map(p => JSON.stringify(p)).sort(), rawPrefixes(nodes, edges, 'u', f.context.policy, depth, new Map(f.options.standing)));
    if (!enabled) { assert.equal(r.prefix.stats.scoreReads, 0); assert.equal(r.stats.scoreChecks, 0); }
    const exact = findPathWitness(view, f.context, oracle);
    if (r.status === 'found') { assert.equal(exact.status, 'found'); found++; }
    if (depth === 2 && exact.status === 'found') assert.equal(r.status, 'found');
    sets++;
  }
  assert.equal(sets, 1152); t.diagnostic('prefix-raw-controls ' + JSON.stringify({ sets, found, observedMismatch: 0 }));
});

test('different simple arrivals at one vertex survive without global visited and use literal full-prefix routing keys', () => {
  const nodes = ['u', 'x', 'y', 'z', 'a', 'b'], edges = [['x', 'u'], ['y', 'u'], ['x', 'y'], ['z', 'x'], ['b', 'z'], ['a', 'u']];
  const f = fixture(nodes, edges, { maxHops: 4 }), view = f.view(), a = advice(nodes), r = checked(f, view, buildPathWitnessTrees(view, build), { ...budget, maxPrefixHops: 4 }, a);
  const arrivals = r.prefix.routes.filter(row => row.prefix.at(-1) === 'x'); assert.ok(arrivals.some(row => row.prefix.join() === 'u,x')); assert.ok(arrivals.some(row => row.prefix.join() === 'u,y,x'));
  assert.notEqual(arrivals[0].queryId, arrivals[1].queryId);
  for (const row of r.prefix.routes) {
    const wanted = createHash('sha256').update(JSON.stringify(['path-prefix-routing/v1', a.routing.queryId, row.prefix])).digest('hex'); assert.equal(row.queryId, wanted);
    const node = row.prefix.at(-1), supplied = a.pools.find(p => p.subject === node), visited = new Set(row.prefix);
    const neighbors = nodes.filter(next => !visited.has(next) && edges.some(([x, y]) => x === next && y === node));
    const excluded = supplied.pool.ranked.filter(({ id }) => !neighbors.includes(id)).map(({ id }) => id);
    const child = routePathWitnessPool(supplied.pool, { ...a.routing, queryId: wanted, domain: f.context.domain, viewId: view.view().id, epoch: 3, subject: node,
      start: 0, count: 64, excluded, loads: supplied.loads });
    assert.deepEqual(row.selected, child.selected); assert.deepEqual(row.stats, child.stats);
  }
  assert.deepEqual(PATH_PREFIX_RANDOMNESS, { policy: 'path-prefix-routing/v1', generator: 'sha256-xoshiro128starstar-v2', childPolicy: 'path-pool-keyed/v1' });
});

test('lifetime queue/neighbor/branch/candidate/packing limits are exact and already queued direct positives survive with zero tail budget', () => {
  const nodes = ['u', 'a', 'b'], f = fixture(nodes, [['a', 'u'], ['b', 'u']], { maxHops: 1 }), view = f.view(), forest = buildPathWitnessTrees(view, build);
  const q = { ...budget, maxPrefixHops: 1, maxPrefixes: 3, maxExpansions: 2, maxTreeLookups: 0 }, full = checked(f, view, forest, q);
  assert.equal(full.status, 'found'); assert.equal(full.prefix.stats.queued, 3); assert.equal(full.prefix.coverage.prefixLimit, false); assert.equal(full.prefix.coverage.expansionLimit, false);
  assert.equal(full.prefix.coverage.treeLookupLimit, true); assert.equal(full.stats.treeLookups, 0);
  for (const [patch, reason] of [[{ maxPrefixes: 0 }, 'prefix-limit'], [{ maxPrefixes: 2 }, 'prefix-limit'], [{ maxExpansions: 1 }, 'expansion-limit'],
    [{ maxBranches: 0 }, 'branch-limit'], [{ maxCandidates: 0 }, 'candidate-limit'], [{ maxPackingSteps: 0 }, 'packing-limit']]) {
    const r = checked(f, view, forest, { ...q, ...patch }); assert.equal(r.status, 'censored'); assert.equal(r.reason, reason);
  }
  const one = fixture(nodes, [['a', 'u'], ['b', 'u']], { maxHops: 1 }, ['a', 'b'], 1), ov = one.view();
  const partial = checked(one, ov, buildPathWitnessTrees(ov, build), { ...q, maxPrefixes: 2 }); assert.equal(partial.status, 'found'); assert.equal(partial.prefix.coverage.prefixLimit, true);
  assert.equal(checked(f, view, forest, { ...q, maxPackingSteps: full.stats.packingSteps }).status, 'found');
  assert.equal(checked(f, view, forest, { ...q, maxPackingSteps: full.stats.packingSteps - 1 }).reason, 'packing-limit');
});

test('missing sparse advice is not empty adjacency; intentional top-M omission is a miss, not graph infeasibility', () => {
  const nodes = ['u', 'a', 'b'], f = fixture(nodes, []), old = f.view(), forest = buildPathWitnessTrees(old, build);
  f.graph.addEdge('a', 'u'); f.graph.addEdge('b', 'u'); const view = f.view();
  const empty = advice([]), missing = checked(f, view, forest, budget, empty); assert.equal(missing.reason, 'pool-unavailable'); assert.equal(missing.prefix.stats.missingPools, 1);
  const pruned = advice(nodes, 'uniform', 0), missed = checked(f, view, forest, budget, pruned);
  assert.equal(missed.status, 'miss'); assert.equal(missed.prefix.stats.omittedNeighbors, 2); assert.equal(missed.stats.validationComplete, true);
  assert.equal(findPathWitness(view, f.context, oracle).status, 'found');
  const recovered = checked(f, view, forest); assert.equal(recovered.status, 'found');
});

test('current scores/removals/edges and full-path cycle/hop checks revalidate stale forest and never mutate it', () => {
  const f = fixture(deep.nodes, deep.edges, { minStanding: 1 }); f.options.standing = deep.nodes.map(id => [id, 1]);
  const old = f.view(), forest = buildPathWitnessTrees(old, build), q = { ...budget, maxPrefixHops: 3 };
  const first = checked(f, old, forest, q); assert.equal(first.status, 'found');
  f.options.standing = deep.nodes.map(id => [id, id === 'x' ? 0 : 1]); assert.notEqual(checked(f, f.view(), forest, q).status, 'found');
  f.options.standing = deep.nodes.map(id => [id, 1]); f.options.removed = ['b']; assert.notEqual(checked(f, f.view(), forest, q).status, 'found');
  f.options.removed = []; f.graph.removeEdge('b', 'y'); assert.notEqual(checked(f, f.view(), forest, q).status, 'found'); assert.deepEqual(checked(f, old, forest, q), first);
  const cyclic = fixture(['u', 'x', 'a', 'b'], [['a', 'x'], ['x', 'u'], ['u', 'x'], ['b', 'u']], { maxHops: 2 }), cv = cyclic.view();
  const r = checked(cyclic, cv, buildPathWitnessTrees(cv, build), { ...budget, maxPrefixHops: 2 }); assert.equal(r.status, 'found');
  for (const p of [...r.prefix.prefixes, ...r.witness.paths]) { assert.equal(new Set(p).size, p.length); assert.ok(p.length <= 3); }
  const transit = fixture(['u', 't', 'b'], [['t', 'u'], ['b', 't']], { maxHops: 2 }, ['t', 'b'], 1); transit.options.removed = ['t'];
  const tv = transit.view(), through = checked(transit, tv, buildPathWitnessTrees(tv, build), { ...budget, maxPrefixHops: 2, maxTreeLookups: 0 });
  assert.deepEqual(through.witness.paths, [['u', 't', 'b']]);
});

test('strict raw data preflight precedes unavailable states without accessors, draws or implicit pool defaults', () => {
  const f = fixture(deep.nodes, deep.edges), view = f.view(), forest = buildPathWitnessTrees(view, build), a = advice(deep.nodes); let calls = 0;
  for (const patch of [{ maxPrefixes: 4097 }, { maxPrefixHops: 4 }, { maxExpansions: 1000001 }, { maxBranches: -0 }, { extra: 1 }]) assert.throws(() => proposePathWitnessFromPrefixes(forest, view, f.context, { ...budget, ...patch }, a));
  const badRows = [Array(65).fill(a.pools[0]), [a.pools[0], a.pools[0]], new Array(1), [{ ...a.pools[0], extra: true }], [{ ...a.pools[0], pool: { ...a.pools[0].pool } }], [{ ...a.pools[0], subject: 'é'.repeat(33) }]];
  for (const pools of badRows) assert.throws(() => proposePathWitnessFromPrefixes(forest, view, f.context, budget, { ...a, pools }));
  const accessor = []; Object.defineProperty(accessor, '0', { enumerable: true, get() { calls++; return a.pools[0]; } }); assert.throws(() => proposePathWitnessFromPrefixes(forest, view, f.context, budget, { ...a, pools: accessor }));
  const routing = { ...a.routing }; Object.defineProperty(routing, 'seed', { enumerable: true, get() { calls++; return 'bad'; } }); assert.throws(() => proposePathWitnessFromPrefixes(forest, view, f.context, budget, { ...a, routing }));
  assert.equal(calls, 0); assert.throws(() => proposePathWitnessFromPrefixes(forest, view, f.context, { ...budget, epoch: 2 }, { pools: [], routing: { ...a.routing, seed: '' } }));
  const absent = checked(f, view, forest, { ...budget, epoch: 2 }, a); assert.equal(absent.status, 'unavailable'); assert.equal(absent.prefix.coverage, null); assert.equal(absent.prefix.stats.draws, 0);
  const unknown = { ...f, context: { ...f.context, subject: 'ghost' } }, unavailable = checked(unknown, view, forest, budget, a); assert.equal(unavailable.reason, 'subject-unavailable');
  assert.equal(unavailable.prefix.stats.queued, 0); assert.throws(() => proposePathWitnessFromPrefixes({ ...forest }, view, f.context, budget, a));
  const nullRows = Object.setPrototypeOf([...a.pools], null); assert.equal(checked(f, view, forest, budget, { ...a, pools: nullRows }).status, 'found');
  const best = advice(deep.nodes, 'best-of-two'); best.pools[0].loads = Object.setPrototypeOf([...best.pools[0].loads], null);
  assert.equal(checked(f, view, forest, budget, best).status, 'found');
  assert.throws(() => proposePathWitnessFromPrefixes(forest, view, f.context, budget, { ...a, pools: new (class extends Array {})(...a.pools) }));
  const tiny = fixture(deep.nodes, deep.edges, { maxWitnessBytes: 1 }), tv = tiny.view(); assert.equal(checked(tiny, tv, buildPathWitnessTrees(tv, build)).reason, 'witness-byte-bound');
});

test('full-prefix keys are inert under inspection, unrelated/future work and a larger queued-prefix budget', () => {
  const f = fixture(deep.nodes, deep.edges), view = f.view(), forest = buildPathWitnessTrees(view, build), a = advice(deep.nodes, 'best-of-two');
  const small = checked(f, view, forest, { ...budget, maxPrefixes: 3 }, a), full = checked(f, view, forest, budget, a);
  for (const row of small.prefix.routes) assert.deepEqual(full.prefix.routes.find(x => x.queryId === row.queryId), row);
  for (let i = 0; i < 8; i++) { JSON.stringify(full); forest.toJSON(); checked(f, view, forest, budget, { ...a, routing: { ...a.routing, queryId: `other-${i}`, step: i } }); }
  assert.deepEqual(checked(f, view, forest, budget, a), full); assert.throws(() => full.prefix.prefixes[0].push('fake')); assert.throws(() => full.prefix.routes.pop());
  assert.throws(() => { full.prefix.advice.pools[0].loads[0].load = 99; });
});

test('D64 direct prefixes and r64 Unicode chains fit raw bounds, hash long prefix IDs, and remain read-only on Native capture', () => {
  const anchors = Array.from({ length: 64 }, (_, i) => 'a' + i), f = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), { maxHops: 1, maxDifficulty: 64 }, anchors, 64), view = f.view();
  const a = advice(anchors); a.pools = [{ ...a.pools[0], subject: 'u' }];
  assert.equal(checked(f, view, buildPathWitnessTrees(view, build), { ...budget, maxPrefixHops: 1, maxTreeLookups: 0 }, a).status, 'found');
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'é'.repeat(4) + i), 'a'], long = fixture(path, path.slice(1).map((v, i) => [v, path[i]]), { maxHops: 64 }, ['a'], 1), lv = long.view();
  const pools = path.slice(0, -1).map((subject, i) => ({ subject, pool: createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 1, candidates: [{ id: path[i + 1], score: 0 }] }), loads: null }));
  const r = checked(long, lv, buildPathWitnessTrees(lv, build), { ...budget, maxPrefixHops: 64, maxTreeLookups: 0 }, { pools, routing: advice([]).routing });
  assert.equal(r.status, 'found'); assert.equal(r.witness.paths[0].length, 65); assert.ok(r.prefix.routes.every(row => row.queryId.length === 64));
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const id of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(id, 'u'));
  const nf = fixture(['u', 'a', 'b'], []), nv = capturePathWitnessModelView(m, nf.options), before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]);
  assert.equal(checked(nf, nv, buildPathWitnessTrees(nv, build)).status, 'found'); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
});

test('pre-code12288 one-hop forest/proposal stream remains exact after prefix implementation', () => {
  const nodes = ['u', 'x', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b])), hash = createHash('sha256');
  const p = createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 64, candidates: nodes.map(id => ({ id, score: 0 })) });
  const a = { pool: p, routing: { seed: 'branches-software-control', queryId: 'query-1', step: 0, mode: 'uniform', loads: null } }; let count = 0;
  for (let bits = 0; bits < 4096; bits++) for (const mode of ['directed', 'any', 'reciprocal']) {
    const f = fixture(nodes, arcs.filter((_, i) => bits & (1 << i)), { maxHops: 3, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected',
      undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' }, ['a', 'b'], 2, 'branch-preservation');
    const view = f.view(), forest = buildPathWitnessTrees(view, build), proposal = proposePathWitnessFromBranches(forest, view, f.context, contract.preCodeOneHopCompatibility.query, a);
    hash.update(JSON.stringify([forest.toJSON(), proposal])).update('\0'); count++;
  }
  assert.equal(contract.preCodeOneHopCompatibility.digest, 'e2e4e30870b1f3a8cdb0408248020585f186e61cf18750a5cfe01d744af7b686');
  assert.equal(count, 12288); assert.equal(hash.digest('hex'), contract.preCodeOneHopCompatibility.digest);
});
