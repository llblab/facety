import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { PathWitnessSegmentCache } from '../src/path-witness-segments.mjs';
import { buildPathWitnessTrees, proposePathWitnessFromPrefixes, proposePathWitnessFromSegments, PATH_SEGMENT_PROPOSAL_LIMITS, PATH_PREFIX_RANDOMNESS } from '../src/path-witness-trees.mjs';
import { createPathWitnessPool } from '../src/path-witness-pool.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const deep = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/branch-tree-miss.json', import.meta.url)));
const contract = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/m3-segment-joins-contract-validation.json', import.meta.url)));
const build = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 };
const q = { epoch: 3, maxPrefixHops: 1, maxPrefixes: 4096, maxExpansions: 10000, maxBranches: 64, maxTreeLookups: 1000, maxCandidates: 256, maxPackingSteps: 10000,
  tick: 0, maxSegmentLookups: 65536, maxSegmentChecks: 1024, maxSegmentResults: 256 };
const oq = { epoch: 3, maxExpansions: 10000, maxPaths: 128, maxPackingSteps: 10000 };
function fixture(nodes = deep.nodes, edges = deep.edges, patch = {}, anchors = ['a', 'b'], difficulty = 2, name = 'segment-join-control') {
  const graph = new DirectedGraph(name); nodes.forEach(id => graph.addNode(id)); edges.forEach(([a, b]) => graph.addEdge(a, b));
  const context = structuredClone(base); Object.assign(context.policy, { maxHops: 3 }, patch);
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty, anchors }], removed: [], standing: [] };
  return { graph, context, options, view: () => pathWitnessGraphView(graph, options) };
}
function cache() { return new PathWitnessSegmentCache({ ledgerId: 'software-ledger', maxEntries: 1024, maxBytes: 1048576, ttlTicks: 10 }); }
function advice(nodes = [], mode = 'uniform', maxPoolSize = 64) {
  const pool = createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize, candidates: nodes.map(id => ({ id, score: 0 })) });
  return { pools: nodes.map(subject => ({ subject, pool, loads: mode === 'uniform' ? null : pool.ranked.map(({ id }) => ({ id, load: 0 })) })),
    routing: { seed: 'prefix-software-control', queryId: 'query-1', step: 0, mode } };
}
function put(c, f, v, path, tick = 0) { const r = c.put(v, { ...f.context, subject: path[0] }, { epoch: 3, path, tick }); assert.equal(r.status, 'stored'); return r; }
function run(f, v, forest, c, patch = {}, a = advice(f.graph.toJSON().nodes)) {
  const query = { ...q, ...patch }, r = proposePathWitnessFromSegments(forest, v, f.context, query, a, c), s = r.segments;
  assert.ok(Object.isFrozen(r) && Object.isFrozen(s) && Object.isFrozen(s.work));
  assert.ok(s.stats.pairsExamined <= query.maxSegmentLookups && s.stats.lookupCalls <= s.stats.pairsExamined && s.work.checked <= query.maxSegmentChecks && s.work.returned <= query.maxSegmentResults);
  assert.ok(r.stats.candidatesExamined <= query.maxCandidates && r.stats.treeLookups <= query.maxTreeLookups && r.stats.packingSteps <= query.maxPackingSteps);
  assert.equal(s.joins.length, s.stats.consumedJoins); assert.ok(s.joins.length <= r.stats.candidatesExamined); assert.equal(Object.hasOwn(s.cache, 'lookup'), false);
  if (r.status === 'found') {
    assert.equal(r.feasible, true); for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(r.wire), f.context, v).accepted, true);
  } else { assert.equal(r.feasible, null); assert.equal(r.wire, null); assert.equal(r.witness, null); }
  return r;
}
function noTrees(v) { return buildPathWitnessTrees(v, { ...build, maxTreeNodes: 0 }); }
function pruned(f) { return advice([f.context.subject], 'uniform', 0); }
function oldQuery(query = q) { const { tick, maxSegmentLookups, maxSegmentChecks, maxSegmentResults, ...old } = query; return old; }
// Independent raw arc DFS and direct subfamily search: no production neighbors, joins or packing predicate.
function rawPaths(nodes, edges, source, hops, p, scores) {
  const paths = [], has = (a, b) => edges.some(([x, y]) => a === x && b === y);
  function visit(path) {
    paths.push(path); const node = path.at(-1);
    if (path.length - 1 === hops || (node !== source && p.minStanding !== null && (scores.get(node) ?? -1) < p.minStanding)) return;
    for (const next of nodes) if (!path.includes(next)) {
      const forward = has(node, next), reverse = has(next, node);
      if (p.direction === 'directed-from-anchor' ? reverse : p.undirectedProjection === 'reciprocal-only' ? forward && reverse : forward || reverse) visit([...path, next]);
    }
  }
  visit([source]); return paths;
}
function rawCandidates(prefixes, tails, full, anchors) {
  const allowed = new Set(full.filter(p => p.length > 1 && anchors.includes(p.at(-1))).map(p => JSON.stringify(p))), result = new Set();
  for (const p of prefixes) {
    const direct = JSON.stringify(p); if (allowed.has(direct)) result.add(direct);
    for (const tail of tails) if (tail[0] === p.at(-1)) { const candidate = JSON.stringify(p.slice(0, -1).concat(tail)); if (allowed.has(candidate)) result.add(candidate); }
  }
  return [...result].map(s => JSON.parse(s));
}
function rawFamily(paths, required, from = 0, chosen = []) {
  if (chosen.length === required) return true;
  for (let i = from; i < paths.length; i++) if (chosen.every(old => !old.slice(1).some(v => paths[i].slice(1).includes(v))) && rawFamily(paths, required, i + 1, [...chosen, paths[i]])) return true;
  return false;
}

test('cached x-y-b tail repairs depth1 five-node C3 in both modes without changing its frontier/keys or renewing/learning cache', () => {
  const f = fixture(), v = f.view(), forest = buildPathWitnessTrees(v, build);
  for (const mode of ['uniform', 'best-of-two']) {
    const c = cache(), stored = put(c, f, v, ['x', 'y', 'b']), a = advice(deep.nodes, mode), old = proposePathWitnessFromPrefixes(forest, v, f.context, oldQuery(), a);
    assert.equal(old.status, 'censored'); const r = run(f, v, forest, c, { tick: 1 }, a); assert.equal(r.status, 'found'); assert.deepEqual(r.witness.paths, deep.expected.oneValidGlobalFamily);
    assert.deepEqual(r.prefix, old.prefix); assert.equal(r.prefix.randomness.policy, PATH_PREFIX_RANDOMNESS.policy); assert.equal(findPathWitness(v, f.context, oq).status, 'found');
    assert.ok(r.segments.joins.some(j => j.segmentId === stored.id)); assert.equal(c.stats().entries, 1); assert.equal(c.stats().records[0].storedAt, 0); assert.equal(c.stats().records[0].expiresAt, 10); assert.equal(r.segments.work.refreshed, 0);
    assert.equal(r.segments.stats.inventorySweepEntryUpperBound, r.segments.stats.lookupCalls); const before = c.stats(); JSON.stringify(r); assert.deepEqual(c.stats(), before);
    assert.deepEqual(proposePathWitnessFromPrefixes(forest, v, f.context, oldQuery(), a), old); assert.throws(() => r.segments.joins.pop()); assert.throws(() => { r.segments.cache.config.ttlTicks = 1; });
  }
});

test('768 separate raw-splice/candidate-set/family/M2 controls cover projections, scores and depths without false positives', t => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => b !== a).map(b => [a, b])); let count = 0, found = 0;
  for (let bits = 0; bits < 64; bits++) for (const mode of ['directed', 'any', 'reciprocal']) for (const scored of [false, true]) for (const depth of [0, 1]) {
    const edges = arcs.filter((_, i) => bits & (1 << i)), f = fixture(nodes, edges, { maxHops: 2, minStanding: scored ? 1 : null,
      direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' });
    f.options.standing = [['a', 0], ['b', 1]]; const scores = new Map(f.options.standing), v = f.view(), c = cache(), tails = [];
    for (const source of nodes) for (const path of rawPaths(nodes, edges, source, 2, f.context.policy, scores)) if (path.length > 1 && ['a', 'b'].includes(path.at(-1))) { tails.push(path); put(c, f, v, path); }
    const prefixes = rawPaths(nodes, edges, 'u', depth, f.context.policy, scores), candidates = rawCandidates(prefixes, tails, rawPaths(nodes, edges, 'u', 2, f.context.policy, scores), ['a', 'b']);
    const r = run(f, v, noTrees(v), c, { maxPrefixHops: depth, maxTreeLookups: 0 }), expected = rawFamily(candidates, 2), exact = findPathWitness(v, f.context, oq);
    assert.deepEqual(r.prefix.prefixes.map(p => JSON.stringify(p)).sort(), prefixes.map(p => JSON.stringify(p)).sort());
    assert.equal(r.stats.liveCandidates, candidates.length); assert.equal(r.status === 'found', expected); assert.equal(expected, exact.status === 'found'); count++; if (expected) found++;
  }
  assert.equal(count, 768); assert.equal(found, 224); t.diagnostic('segment-join-raw-controls ' + JSON.stringify({ cases: count, found, observedMismatch: 0 }));
});

test('pair/check/return zero/exact/one-less budgets distinguish pair slots, empty buckets and later direct positives', () => {
  const f = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']]), v = f.view(), forest = noTrees(v), a = pruned(f);
  const c = cache(); for (const id of ['a', 'b']) put(c, f, v, ['u', id]);
  const full = run(f, v, forest, c, { maxSegmentLookups: 2, maxSegmentChecks: 2, maxSegmentResults: 2 }, a); assert.equal(full.status, 'found'); assert.deepEqual(Object.values(full.segments.coverage), [false, false, false]);
  for (const [patch, flag, reason] of [[{ maxSegmentLookups: 1 }, 'segmentLookupLimit', 'segment-lookup-limit'], [{ maxSegmentLookups: 0 }, 'segmentLookupLimit', 'segment-lookup-limit'],
    [{ maxSegmentChecks: 1 }, 'segmentCheckLimit', 'segment-check-limit'], [{ maxSegmentChecks: 0 }, 'segmentCheckLimit', 'segment-check-limit'],
    [{ maxSegmentResults: 1 }, 'segmentResultLimit', 'segment-result-limit'], [{ maxSegmentResults: 0 }, 'segmentResultLimit', 'segment-result-limit']]) {
    const r = run(f, v, forest, c, patch, a); assert.equal(r.status, 'censored'); assert.equal(r.reason, reason); assert.equal(r.segments.coverage[flag], true);
  }
  const empty = run(f, v, forest, cache(), { maxSegmentChecks: 0, maxSegmentResults: 0 }, a); assert.equal(empty.segments.stats.lookupCalls, 2); assert.deepEqual(Object.values(empty.segments.coverage), [false, false, false]);
  const direct = run(f, v, forest, cache(), { maxSegmentLookups: 0, maxTreeLookups: 0 }); assert.equal(direct.status, 'found'); assert.equal(direct.segments.coverage.segmentLookupLimit, true);
  const packExact = run(f, v, forest, c, { maxPackingSteps: full.stats.packingSteps }, a); assert.equal(packExact.status, 'found');
  assert.equal(run(f, v, forest, c, { maxPackingSteps: full.stats.packingSteps - 1 }, a).reason, 'packing-limit');
});

test('returned batches consume use/return budgets even after candidate budget stops; child64 cap has no implicit refill', () => {
  const nodes = ['u', 'a', ...Array.from({ length: 64 }, (_, i) => 'x' + i)], edges = [['a', 'u'], ...nodes.slice(2).flatMap(x => [[x, 'u'], ['a', x]])];
  const f = fixture(nodes, edges, { maxHops: 2 }, ['a'], 1), v = f.view(), forest = noTrees(v), c = cache(); put(c, f, v, ['u', 'a']); for (const x of nodes.slice(2)) put(c, f, v, ['u', x, 'a']);
  const r = run(f, v, forest, c, { maxCandidates: 1 }, pruned(f)); assert.equal(r.status, 'found'); assert.equal(r.segments.work.returned, 64); assert.equal(r.segments.stats.consumedJoins, 1);
  assert.equal(r.segments.stats.lookupCalls, 1); assert.equal(r.segments.coverage.segmentResultLimit, true); assert.equal(c.stats().records.filter(e => e.uses === 1).length, 64); assert.equal(c.stats().records.at(-1).uses, 0);
  assert.deepEqual(Object.keys(r.segments.joins[0]), ['candidateOrdinal', 'prefixOrdinal', 'target', 'segmentId']); assert.equal(r.segments.joins[0].candidateOrdinal, 0); assert.equal(r.segments.joins[0].prefixOrdinal, 0);
  const zero = run(f, v, forest, c, { maxCandidates: 0 }, pruned(f)); assert.equal(zero.reason, 'candidate-limit'); assert.equal(zero.segments.work.returned, 64); assert.equal(zero.segments.joins.length, 0);
  f.graph.addNode('b'); f.graph.addEdge('b', 'u'); f.options.snapshots = [{ epoch: 3, anchors: ['a', 'b'], difficulty: 1 }]; put(c, f, f.view(), ['u', 'b']);
  f.graph.removeEdge('b', 'u'); f.graph.addEdge('b', 'u'); const current = f.view(); put(c, f, current, ['u', 'b']);
  const both = run(f, current, noTrees(current), c, { maxSegmentChecks: 65 }, pruned(f)); assert.equal(both.status, 'found');
  assert.equal(both.segments.coverage.segmentResultLimit, true); assert.equal(both.segments.coverage.segmentCheckLimit, true); assert.equal(both.segments.work.checked, 65); assert.equal(both.segments.work.evicted, 1);
});

test('full splice scores/cycles/hops/family conflicts and terminal removal are rechecked; removed transit remains allowed', () => {
  for (const mode of ['score', 'hops', 'terminal', 'transit']) {
    const f = fixture(undefined, undefined, { minStanding: mode === 'score' ? 1 : null, maxHops: mode === 'hops' ? 2 : 3 }, mode === 'transit' ? ['a', 'b', 'y'] : ['a', 'b']);
    f.options.standing = deep.nodes.map(id => [id, id === 'x' ? 0 : 1]); if (mode === 'terminal' || mode === 'transit') f.options.removed = [mode === 'terminal' ? 'b' : 'y'];
    const v = f.view(), c = cache(); put(c, f, v, ['x', 'y', 'b']); const r = run(f, v, buildPathWitnessTrees(v, build), c);
    assert.equal(r.status === 'found', mode === 'transit'); if (mode === 'terminal') { assert.equal(r.segments.joins.length, 0); assert.equal(c.stats().records[0].uses, 0); }
    else assert.ok(r.segments.stats.consumedJoins > 0);
  }
  const f = fixture(['u', 'x', 'a'], [['x', 'u'], ['u', 'x'], ['a', 'u']], {}, ['a'], 1), v = f.view(), c = cache(); put(c, f, v, ['x', 'u', 'a']);
  const r = run(f, v, noTrees(v), c, { maxTreeLookups: 0 }); assert.ok(r.segments.joins.length > 0); assert.equal(r.status, 'found'); assert.deepEqual(r.witness.paths, [['u', 'a']]);
  const conflict = fixture(), cv = conflict.view(), cc = cache(); put(cc, conflict, cv, ['x', 'a', 'b']); assert.notEqual(run(conflict, cv, buildPathWitnessTrees(cv, build), cc).status, 'found');
});

test('stale scores/edges/IDs and expiry evict cache only, while old vertex-only tree witnesses can still pass', () => {
  const f = fixture(['u', 'a', 'b'], [['a', 'u']], {}, ['a'], 1), old = f.view(), forest = buildPathWitnessTrees(old, build), c = cache(); put(c, f, old, ['u', 'a']);
  f.graph.removeEdge('a', 'u'); f.graph.addEdge('a', 'u'); const v = f.view(), r = run(f, v, forest, c, { tick: 1 });
  assert.equal(r.status, 'found'); assert.equal(r.segments.work.evicted, 1); assert.equal(c.stats().entries, 0);
  put(c, f, v, ['u', 'a'], 1); const expired = run(f, v, forest, c, { tick: 11 }); assert.equal(expired.status, 'found'); assert.equal(expired.segments.work.expired, 1);
  const d = fixture(), dv = d.view(), dc = cache(); put(dc, d, dv, ['x', 'y', 'b']); d.graph.removeEdge('b', 'y'); const lost = run(d, d.view(), buildPathWitnessTrees(dv, build), dc); assert.notEqual(lost.status, 'found'); assert.equal(lost.segments.work.evicted, 1);
  const s = fixture(undefined, undefined, { minStanding: 1 }); s.options.standing = deep.nodes.map(id => [id, 1]); const sv = s.view(), sc = cache(); put(sc, s, sv, ['x', 'y', 'b']); s.options.standing = deep.nodes.map(id => [id, id === 'y' ? 0 : 1]);
  assert.equal(run(s, s.view(), buildPathWitnessTrees(sv, build), sc).segments.work.evicted, 1);
});

test('target scan counts ineligible roots and more than64 anchors, but never activates roots outside the retained forest', () => {
  const anchors = Array.from({ length: 65 }, (_, i) => 'a' + i), f = fixture(['u', ...anchors], [[anchors[0], 'u']], { maxHops: 1 }, anchors, 1), old = f.view(), forest = noTrees(old);
  f.options.removed = anchors.slice(0, 64); const r = run(f, f.view(), forest, cache(), { maxPrefixHops: 1, maxSegmentLookups: 2 }, pruned(f));
  assert.equal(r.segments.stats.pairsExamined, 2); assert.equal(r.segments.stats.lookupCalls, 0); assert.equal(r.segments.stats.targetAnchorReads, 2); assert.equal(r.segments.stats.targetRemovalReads, 2); assert.equal(r.segments.coverage.segmentLookupLimit, true);
  const s = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']], {}, ['a'], 1), sv = s.view(), sf = buildPathWitnessTrees(sv, build);
  s.options.snapshots = [{ epoch: 3, anchors: ['a', 'b'], difficulty: 2 }]; const current = s.view(), c = cache(); put(c, s, current, ['u', 'b']); const miss = run(s, current, sf, c, {}, pruned(s));
  assert.equal(miss.status, 'miss'); assert.equal(miss.stats.validationComplete, true); assert.equal(miss.segments.work.returned, 0); assert.equal(findPathWitness(current, s.context, oq).status, 'found');
});

test('strict brand/query/advice/clock preflight and unavailable states never advance cache or perform frontier/lookup work', () => {
  const f = fixture(), v = f.view(), forest = buildPathWitnessTrees(v, build), c = cache(); put(c, f, v, ['x', 'y', 'b'], 5); const before = c.stats();
  const a = advice(deep.nodes); for (const port of [null, undefined, { ...c }, Object.create(PathWitnessSegmentCache.prototype), new (class extends PathWitnessSegmentCache {})(c.config)]) assert.throws(() => proposePathWitnessFromSegments(forest, v, f.context, { ...q, tick: 5 }, a, port));
  for (const patch of [{ maxSegmentLookups: 65537 }, { maxSegmentChecks: 1025 }, { maxSegmentResults: 257 }, { tick: -0 }, { tick: 4 }, { extra: 1 }]) assert.throws(() => proposePathWitnessFromSegments(forest, v, f.context, { ...q, tick: 5, epoch: 2, ...patch }, a, c));
  assert.throws(() => proposePathWitnessFromSegments(forest, v, f.context, { ...q, tick: 5, epoch: 2 }, { ...a, routing: { ...a.routing, seed: '' } }, c));
  let reads = 0; const bad = { ...q }; Object.defineProperty(bad, 'tick', { enumerable: true, get() { reads++; return 5; } }); assert.throws(() => proposePathWitnessFromSegments(forest, v, f.context, bad, a, c)); assert.equal(reads, 0);
  const unavailable = run(f, v, forest, c, { epoch: 2, tick: Number.MAX_SAFE_INTEGER }); assert.equal(unavailable.status, 'unavailable'); assert.equal(unavailable.segments.coverage, null); assert.equal(unavailable.prefix.coverage, null);
  assert.ok(Object.values(unavailable.segments.work).every(n => n === 0)); assert.equal(unavailable.prefix.stats.draws, 0); assert.deepEqual(c.stats(), before);
  const absent = { ...f, context: { ...f.context, subject: 'ghost' } }; assert.equal(run(absent, v, forest, c, { tick: 5 }).reason, 'subject-unavailable'); assert.deepEqual(c.stats(), before);
  const terminal = run(f, v, forest, c, { tick: Number.MAX_SAFE_INTEGER }); assert.equal(terminal.segments.work.expired, 1); assert.equal(c.stats().lastTick, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(PATH_SEGMENT_PROPOSAL_LIMITS, { maxSegmentLookups: 65536, maxSegmentChecks: 1024, maxSegmentResults: 256 });
  const tiny = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']], { maxWitnessBytes: 1 }), tv = tiny.view(), tc = cache(); for (const id of ['a', 'b']) put(tc, tiny, tv, ['u', id]);
  const bounded = run(tiny, tv, noTrees(tv), tc, {}, pruned(tiny)); assert.equal(bounded.reason, 'witness-byte-bound'); assert.equal(bounded.segments.work.returned, 2);
});

test('unexpected provider status/errors/counter disagreements propagate rather than becoming no-path/miss', () => {
  const f = fixture(), v = f.view(), forest = buildPathWitnessTrees(v, build), c = cache(), original = PathWitnessSegmentCache.prototype.lookup;
  try {
    PathWitnessSegmentCache.prototype.lookup = () => { throw new Error('provider-sentinel'); }; assert.throws(() => run(f, v, forest, c), /provider-sentinel/);
    PathWitnessSegmentCache.prototype.lookup = () => ({ status: 'unavailable' }); assert.throws(() => run(f, v, forest, c), /unexpected lookup status/);
    PathWitnessSegmentCache.prototype.lookup = function (...args) { const r = original.apply(this, args); return { ...r, work: { ...r.work, checked: 1025 } }; }; assert.throws(() => run(f, v, forest, c), /budget disagreement/);
  } finally { PathWitnessSegmentCache.prototype.lookup = original; }
});

test('D64/r64 Unicode, sparse/incomplete forests, alternate arrivals and Native captures retain bounded verification/read-only Model semantics', () => {
  const anchors = Array.from({ length: 64 }, (_, i) => 'a' + i), f = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), { maxHops: 1, maxDifficulty: 64 }, anchors, 64), v = f.view(), c = cache(); for (const a of anchors) put(c, f, v, ['u', a]);
  assert.equal(run(f, v, noTrees(v), c, { maxPrefixHops: 0, maxTreeLookups: 0 }, pruned(f)).status, 'found');
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'é\0' + i), 'a'], long = fixture(path, path.slice(1).map((v, i) => [v, path[i]]), { maxHops: 64 }, ['a'], 1), lv = long.view(), lc = cache(); put(lc, long, lv, path);
  assert.equal(run(long, lv, noTrees(lv), lc, { maxPrefixHops: 0, maxTreeLookups: 0 }, pruned(long)).witness.paths[0].length, 65);
  const alternate = fixture(['u', 'x', 'y', 'a', 'b'], [['x', 'u'], ['y', 'u'], ['x', 'y'], ['b', 'x'], ['a', 'u']]), av = alternate.view(), ac = cache(); put(ac, alternate, av, ['x', 'b']);
  const ar = run(alternate, av, noTrees(av), ac, { maxPrefixHops: 2, maxTreeLookups: 0 }); const arrivals = ar.segments.joins.map(j => ar.prefix.prefixes[j.prefixOrdinal]);
  assert.ok(arrivals.some(p => JSON.stringify(p) === '["u","x"]')); assert.ok(arrivals.some(p => JSON.stringify(p) === '["u","y","x"]'));
  const small = run(alternate, av, noTrees(av), ac, { maxPrefixHops: 2, maxTreeLookups: 0, maxPrefixes: 3 });
  for (const route of small.prefix.routes) assert.deepEqual(ar.prefix.routes.find(row => row.queryId === route.queryId), route);
  const other = advice(alternate.graph.toJSON().nodes); other.routing.queryId = 'unrelated-query'; run(alternate, av, noTrees(av), ac, { maxPrefixHops: 2, maxTreeLookups: 0 }, other);
  assert.deepEqual(run(alternate, av, noTrees(av), ac, { maxPrefixHops: 2, maxTreeLookups: 0 }).prefix, ar.prefix);
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const a of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(a, 'u'));
  const nf = fixture(['u', 'a', 'b'], []), nv = capturePathWitnessModelView(m, nf.options), nc = cache(), before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]); for (const a of ['a', 'b']) put(nc, nf, nv, ['u', a]);
  assert.equal(run(nf, nv, noTrees(nv), nc, {}, pruned(nf)).status, 'found'); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
});

test('pre-code1152 C3 full forest/proposal records remain exact after shared generator refactoring', () => {
  const b = contract.existingAPIProbe.c3StreamBaseline, hash = createHash('sha256'); let pairs = 0, positives = 0;
  for (let bits = 0; bits < 64; bits++) for (const mode of ['directed', 'any', 'reciprocal']) for (const scored of [false, true]) for (let depth = 0; depth <= 2; depth++) {
    const f = fixture(b.nodes, b.arcs.filter((_, i) => bits & (1 << i)), { maxHops: 2, minStanding: scored ? 1 : null,
      direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' }, b.snapshot.anchors, b.snapshot.difficulty, b.graphName);
    f.options.standing = b.standing; const v = f.view(), forest = buildPathWitnessTrees(v, b.build), r = proposePathWitnessFromPrefixes(forest, v, f.context, { ...b.query, maxPrefixHops: depth }, advice(b.nodes));
    hash.update(JSON.stringify([forest.toJSON(), r])).update('\0'); pairs++; if (r.status === 'found') positives++;
  }
  assert.equal(pairs, b.pairs); assert.equal(positives, b.positives); assert.equal(hash.digest('hex'), b.digest);
});
