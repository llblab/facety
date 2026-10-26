import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { buildPathWitnessTrees, proposePathWitnessFromTrees, proposePathWitnessFromBranches } from '../src/path-witness-trees.mjs';
import { createPathWitnessPool } from '../src/path-witness-pool.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { PathWitnessCache } from '../src/path-witness-cache.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const single = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/single-tree-miss.json', import.meta.url)));
const deep = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/branch-tree-miss.json', import.meta.url)));
const build = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 };
const budget = { epoch: 3, maxCandidates: 128, maxPackingSteps: 10000, maxBranches: 64, maxTreeLookups: 1000 };
const oracle = { epoch: 3, maxExpansions: 10000, maxPaths: 128, maxPackingSteps: 10000 };
function fixture(nodes, edges, patch = {}, anchors = ['a', 'b'], difficulty = 2) {
  const graph = new DirectedGraph('branch-preservation'); for (const id of nodes) graph.addNode(id); for (const [a, b] of edges) graph.addEdge(a, b);
  const context = structuredClone(base); Object.assign(context.policy, patch);
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty, anchors }], removed: [], standing: [] };
  const view = () => pathWitnessGraphView(graph, options); return { graph, context, options, view };
}
function advice(nodes, mode = 'uniform', maxPoolSize = 64) {
  const pool = createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize, candidates: nodes.map(id => ({ id, score: 0 })) });
  return { pool, routing: { seed: 'branches-software-control', queryId: 'query-1', step: 0, mode, loads: mode === 'uniform' ? null : pool.ranked.map(({ id }) => ({ id, load: 0 })) } };
}
function checked(f, view, forest, q = budget, a = advice(f.graph.toJSON().nodes)) {
  const result = proposePathWitnessFromBranches(forest, view, f.context, q, a);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.branch));
  assert.ok(result.stats.treeLookups <= q.maxTreeLookups && result.stats.candidatesExamined <= q.maxCandidates && result.stats.packingSteps <= q.maxPackingSteps);
  if (result.status === 'found') {
    assert.equal(result.feasible, true); assert.equal(result.witness.paths.length, result.required);
    for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(result.wire), f.context, view).accepted, true);
  } else { assert.equal(result.feasible, null); assert.equal(result.wire, null); }
  return result;
}

test('one-hop branch repairs the retained single-parent counterexample in both modes and composes as a reverified hint', () => {
  const f = fixture(single.nodes, single.edges), view = f.view(), forest = buildPathWitnessTrees(view, build);
  assert.equal(proposePathWitnessFromTrees(forest, view, f.context, { epoch: 3, maxCandidates: 16, maxPackingSteps: 1000 }).status, 'miss');
  for (const mode of ['uniform', 'best-of-two']) {
    const result = checked(f, view, forest, budget, advice(single.nodes, mode)); assert.equal(result.status, 'found');
    assert.deepEqual(result.witness.paths, single.expected.oneValidGlobalFamily); assert.ok(result.branch.duplicatePaths > 0);
    assert.equal(result.branch.route.query.domain, f.context.domain); assert.equal(result.branch.route.query.viewId, view.view().id);
    const cache = new PathWitnessCache({ maxEntries: 4, maxBytes: 10000, ttlTicks: 5 });
    assert.equal(cache.lookup(view, f.context, oracle, { tick: 0, hint: result.wire }).source, 'hint');
  }
});

test('all12288 fixed four-node graph/projection cases compare branch positives/misses with full M2 before cost', t => {
  const nodes = ['u', 'x', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => b !== a).map(b => [a, b]));
  const counts = Object.fromEntries(['directed', 'any', 'reciprocal'].map(mode => [mode, { queries: 0, oracleFound: 0, branchFound: 0, misses: 0 }]));
  const a = advice(nodes), legacyHash = createHash('sha256');
  for (let bits = 0; bits < 4096; bits++) for (const mode of Object.keys(counts)) {
    const f = fixture(nodes, arcs.filter((_, i) => bits & (1 << i)), { maxHops: 3, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected',
      undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' });
    const view = f.view(), forest = buildPathWitnessTrees(view, build), result = checked(f, view, forest, budget, a), exact = findPathWitness(view, f.context, oracle), c = counts[mode];
    const legacy = proposePathWitnessFromTrees(forest, view, f.context, { epoch: 3, maxCandidates: 16, maxPackingSteps: 1000 });
    legacyHash.update(JSON.stringify([forest.toJSON(), legacy])).update('\0');
    assert.ok(['found', 'miss'].includes(result.status)); assert.ok(['found', 'infeasible'].includes(exact.status)); c.queries++;
    if (exact.status === 'found') c.oracleFound++;
    if (result.status === 'found') { c.branchFound++; assert.equal(exact.status, 'found'); }
    else if (exact.status === 'found') c.misses++;
  }
  assert.equal(Object.values(counts).reduce((n, c) => n + c.queries, 0), 12288);
  assert.equal(legacyHash.digest('hex'), 'ef7b416995023b28dd170c6c497126164e622866642435e1d7ade9189d62a691');
  t.diagnostic('one-hop-branch-grid ' + JSON.stringify(counts));
});

test('deeper five-node detour still misses despite complete retained one-hop exploration; full M2 finds the omitted family', () => {
  const f = fixture(deep.nodes, deep.edges, { maxHops: deep.maxHops }), view = f.view(), forest = buildPathWitnessTrees(view, build);
  assert.deepEqual([forest.path('u', 'b'), forest.path('x', 'b')], deep.expected.retainedBPaths);
  for (const mode of ['uniform', 'best-of-two']) {
    const result = checked(f, view, forest, budget, advice(deep.nodes, mode)); assert.equal(result.status, 'miss'); assert.equal(result.stats.validationComplete, true);
    assert.equal(result.branch.route.status, 'partial'); assert.equal(result.branch.eligiblePeers, 2);
    assert.equal(findPathWitness(view, f.context, oracle).status, 'found');
    const cache = new PathWitnessCache({ maxEntries: 0, maxBytes: 0, ttlTicks: 2 });
    assert.equal(cache.lookup(view, f.context, oracle, { tick: 0, hint: result.wire }).status, 'found');
    assert.equal(cache.lookup(view, f.context, { ...oracle, maxExpansions: 0, maxPaths: 0, maxPackingSteps: 0 }, { tick: 1, hint: null }).feasible, null);
  }
});

test('exact/one-less branch/lookup/candidate/packing limits preserve positive prefixes and never certify a negative', () => {
  const f = fixture(single.nodes, single.edges), view = f.view(), forest = buildPathWitnessTrees(view, build), a = advice(single.nodes, 'best-of-two');
  a.routing.loads.find(row => row.id === 'a').load = 9;
  const q = { ...budget, maxBranches: 1, maxTreeLookups: 4 }, found = checked(f, view, forest, q, a);
  assert.equal(found.status, 'found'); assert.deepEqual(found.branch.route.selected, ['x']); assert.equal(found.stats.validationComplete, false);
  assert.equal(checked(f, view, forest, { ...q, maxTreeLookups: 3 }, a).reason, 'tree-lookup-limit');
  assert.equal(checked(f, view, forest, { ...q, maxBranches: 0 }, a).reason, 'branch-limit');
  assert.equal(checked(f, view, forest, { ...q, maxCandidates: 0 }, a).reason, 'candidate-limit');
  assert.equal(checked(f, view, forest, { ...q, maxPackingSteps: 0 }, a).reason, 'packing-limit');
  assert.equal(checked(f, view, forest, { ...q, maxTreeLookups: 0 }, a).reason, 'tree-lookup-limit');
  assert.equal(checked(f, view, forest, { ...q, maxCandidates: found.stats.candidatesExamined, maxPackingSteps: found.stats.packingSteps }, a).status, 'found');
  assert.equal(checked(f, view, forest, { ...q, maxPackingSteps: found.stats.packingSteps - 1 }, a).status, 'censored');
  const partial = buildPathWitnessTrees(view, { ...build, maxTreeNodes: 5 }); assert.equal(partial.meta.complete, false);
  assert.equal(checked(f, view, partial, budget, a).status, 'found');
});

test('current neighbor filtering precedes routing but does not refill pruned top-M or treat partial route shortage as censoring', () => {
  const f = fixture(single.nodes, single.edges), view = f.view(), forest = buildPathWitnessTrees(view, build);
  const a = advice(['ghost', 'u', 'a', 'b', 'x']); const result = checked(f, view, forest, budget, a);
  assert.deepEqual(result.branch.route.selected.slice().sort(), ['a', 'x']); assert.equal(result.branch.route.status, 'partial'); assert.equal(result.status, 'found');
  const pruned = advice(['a'], 'uniform', 1), missed = checked(f, view, forest, budget, pruned);
  assert.equal(missed.status, 'miss'); assert.equal(missed.feasible, null); assert.equal(missed.stats.validationComplete, true);
  const unknown = { pool: createPathWitnessPool({ metric: 'supplied-standing/v1', maxPoolSize: 4, candidates: [{ id: 'x', score: null }] }), routing: pruned.routing };
  assert.equal(checked(f, view, forest, budget, unknown).status, 'miss');
});

test('current scores, edges, emergency endpoints and hop/simple/terminal semantics reject unsafe splices without changing old trees', () => {
  const f = fixture(single.nodes, single.edges, { minStanding: 1 }); f.options.standing = [['x', 1], ['a', 0], ['b', 0]];
  const old = f.view(), forest = buildPathWitnessTrees(old, build); assert.equal(checked(f, old, forest).status, 'found');
  f.options.standing = [['x', 0], ['a', 0], ['b', 0]]; assert.notEqual(checked(f, f.view(), forest).status, 'found');
  f.options.standing = [['x', 1], ['a', 0], ['b', 0]]; f.options.removed = ['b']; assert.notEqual(checked(f, f.view(), forest).status, 'found');
  f.options.removed = []; f.graph.removeEdge('b', 'x'); assert.notEqual(checked(f, f.view(), forest).status, 'found');
  assert.equal(checked(f, old, forest).status, 'found');
  const short = fixture(single.nodes, single.edges, { maxHops: 1 }), sv = short.view(); assert.equal(checked(short, sv, buildPathWitnessTrees(sv, build)).status, 'miss');
  const cycle = fixture(['u', 'x', 'a', 'b'], [['a', 'x'], ['x', 'u'], ['u', 'x'], ['b', 'u']], { maxHops: 3 }), cv = cycle.view();
  const cyclic = checked(cycle, cv, buildPathWitnessTrees(cv, build)); assert.equal(cyclic.status, 'found');
  for (const path of cyclic.witness.paths) assert.equal(new Set(path).size, path.length);
});

test('strict host data, copied capabilities, policy/epoch and wire bounds fail explicitly; unavailable preflight consumes no draws', () => {
  const f = fixture(single.nodes, single.edges), view = f.view(), forest = buildPathWitnessTrees(view, build), a = advice(single.nodes); let calls = 0;
  for (const patch of [{ maxBranches: 65 }, { maxTreeLookups: 65537 }, { maxTreeLookups: -0 }, { extra: 1 }]) assert.throws(() => proposePathWitnessFromBranches(forest, view, f.context, { ...budget, ...patch }, a));
  for (const bad of [null, { ...a, extra: true }, { ...a, pool: { ...a.pool } }, { ...a, routing: { ...a.routing, subject: 'other' } }]) assert.throws(() => proposePathWitnessFromBranches(forest, view, f.context, budget, bad));
  const getter = { ...a.routing }; Object.defineProperty(getter, 'seed', { enumerable: true, get() { calls++; return 'bad'; } });
  assert.throws(() => proposePathWitnessFromBranches(forest, view, f.context, budget, { ...a, routing: getter })); assert.equal(calls, 0);
  assert.throws(() => proposePathWitnessFromBranches({ ...forest }, view, f.context, budget, a)); assert.throws(() => proposePathWitnessFromBranches(forest, { ...view }, f.context, budget, a));
  const mismatch = structuredClone(f.context); mismatch.policy.maxSlack = 0; assert.throws(() => proposePathWitnessFromBranches(forest, view, mismatch, budget, a));
  const unavailable = checked(f, view, forest, { ...budget, epoch: 2 }, a); assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.stats.treeLookups, 0); assert.equal(unavailable.branch.route.stats.draws, 0); assert.equal(unavailable.branch.eligiblePeers, null);
  const tiny = fixture(single.nodes, single.edges, { maxWitnessBytes: 1 }), tv = tiny.view(); assert.equal(checked(tiny, tv, buildPathWitnessTrees(tv, build)).reason, 'witness-byte-bound');
});

test('Native read-only use and frozen route/forest inspection preserve replay and unrelated/future-query prefixes', () => {
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const a of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(a, 'u'));
  const f = fixture(['u', 'a', 'b'], []), view = capturePathWitnessModelView(m, f.options), forest = buildPathWitnessTrees(view, build), a = advice(['u', 'a', 'b']);
  const before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), first = checked(f, view, forest, budget, a);
  forest.toJSON(); forest.path('u', 'a'); JSON.stringify(first.branch.route);
  for (let step = 1; step <= 8; step++) checked(f, view, forest, budget, { ...a, routing: { ...a.routing, queryId: 'other', step } });
  assert.deepEqual(checked(f, view, forest, budget, a), first); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
  assert.throws(() => first.branch.route.selected.pop()); assert.throws(() => { first.branch.branchesExpanded = 99; });
  const one = checked(f, view, forest, { ...budget, maxBranches: 1 }, a); assert.deepEqual(one.branch.route.selected, first.branch.route.selected.slice(0, 1));
});

test('D64/r64 and Unicode delimiter IDs preserve bounded partial positives and no zero-hop self support', () => {
  const anchors = Array.from({ length: 64 }, (_, i) => `a${i}`), f = fixture(['u', ...anchors], anchors.map(id => [id, 'u']), { maxDifficulty: 64, maxHops: 1 }, anchors, 64), view = f.view();
  assert.equal(checked(f, view, buildPathWitnessTrees(view, build), { ...budget, maxCandidates: 64, maxPackingSteps: 64, maxTreeLookups: 64 }).status, 'found');
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'm' + i), 'a'], long = fixture(path, path.slice(1).map((v, i) => [v, path[i]]), { maxHops: 64 }, ['a'], 1), lv = long.view();
  assert.equal(checked(long, lv, buildPathWitnessTrees(lv, build)).witness.paths[0].length, 65);
  const unicode = fixture(['u', 'x\0y', 'é', 'x', 'y\0é'], [['é', 'x\0y'], ['x\0y', 'u'], ['y\0é', 'x'], ['x', 'u']], {}, ['é', 'y\0é']), uv = unicode.view();
  assert.equal(checked(unicode, uv, buildPathWitnessTrees(uv, build)).status, 'found');
});
