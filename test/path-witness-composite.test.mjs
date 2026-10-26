import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { pathWitnessContext, verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { PathWitnessCache } from '../src/path-witness-cache.mjs';
import { PathWitnessSegmentCache } from '../src/path-witness-segments.mjs';
import { createPathWitnessPool } from '../src/path-witness-pool.mjs';
import { buildPathWitnessTrees, proposePathWitnessFromSegments, proposePathWitnessFromUnion } from '../src/path-witness-trees.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { queryPathWitness } from '../src/path-witness-pipeline.mjs';
import { queryPathWitnessComposite } from '../src/path-witness-composite.mjs';
import { Random } from '../src/random.mjs';
import { provenance } from '../src/provenance.mjs';
const contract = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/m3-composite-contract-validation.json', import.meta.url))), baseline = contract.existingNativeStreamBaseline;
const { build, prefix, union, fallback, wholeConfig, segmentConfig, baseContext: base } = contract.existingAPIProbe.common;
const deep = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/branch-tree-miss.json', import.meta.url)));
function fixture(nodes = deep.nodes, edges = deep.edges, patch = {}, name = 'composite-contract', anchors = ['a', 'b'], difficulty = 2) {
  const context = structuredClone(base); Object.assign(context.policy, { maxHops: 3 }, patch);
  const graph = new DirectedGraph(name); nodes.forEach(n => graph.addNode(n)); edges.forEach(([a, b]) => graph.addEdge(a, b));
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty, anchors }], removed: [], standing: [] }, pool = createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 64, candidates: nodes.slice(0, 64).map(id => ({ id, score: 0 })) });
  return { context, graph, options, pool, view: () => pathWitnessGraphView(graph, options), advice: (mode = 'uniform') => ({ pools: nodes.slice(0, 64).map(subject => ({ subject, pool, loads: mode === 'uniform' ? null : pool.ranked.map(({ id }) => ({ id, load: 0 })) })), routing: { seed: 'prefix-software-control', queryId: 'query-1', step: 0, mode } }) };
}
function owners(f, view = f.view(), wp = {}, sp = {}) { return { whole: new PathWitnessCache({ ...wholeConfig, ...wp }), segments: new PathWitnessSegmentCache({ ...segmentConfig, ...sp }), forest: buildPathWitnessTrees(view, build), view, context: f.context }; }
function input(tick = 0, pp = {}, up = {}, fp = {}) { return { tick, prefix: { ...prefix, ...pp, tick }, union: { ...union, ...up }, fallback: { ...fallback, ...fp } }; }
const bundle = s => ({ whole: s.whole, segments: s.segments, forest: s.forest });
const state = s => [s.whole.stats(), s.segments.stats()];
function seed(s, f, path, view = f.view()) { return s.segments.put(view, { ...f.context, subject: path[0] }, { epoch: 3, path, tick: 0 }); }
function projection(r) { return Object.fromEntries(['input', 'advice', 'result', 'stages', 'cacheStats', 'work'].map(k => [k, r[k]])); }
function checked(s, request, advice) {
  const before = JSON.stringify([s.view.toJSON(), s.forest.toJSON(), s.context, request, advice]), r = queryPathWitnessComposite(bundle(s), s.view, s.context, request, advice);
  assert.equal(JSON.stringify([s.view.toJSON(), s.forest.toJSON(), s.context, request, advice]), before);
  assert.deepEqual(Object.keys(r), ['schema', 'reference', 'provenance', 'assumptions', 'viewRoot', 'forestRoot', 'context', 'input', 'advice', 'preflight', 'result', 'stages', 'cacheStats', 'work']);
  assert.equal(r.schema, 'facety-path-composite/v1'); assert.equal(r.reference, 'verified-cache-prefix-union-fallback/v1'); assert.deepEqual(r.provenance, provenance()); assert.deepEqual(r.context, pathWitnessContext(s.context));
  assert.deepEqual(r.assumptions, ['Supplied capture/ledger/standing labels assume coherent lineage and facts, not authenticated personhood or funded authorization.', 'D1 preparation is inherited per supplied view object; exact work/proposal digests require equivalent aliasing/prior preparation history or fresh equivalent captures, not viewRoot alone.']);
  assert.deepEqual(r.preflight, { poolChecks: advice.pools.length + 1, poolRows: advice.pools.length, retainedPoolEntries: Array.prototype.reduce.call(advice.pools, (n, r) => n + r.pool.ranked.length, 0), loadRows: Array.prototype.reduce.call(advice.pools, (n, r) => n + (r.loads?.length ?? 0), 0) });
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.input.prefix) && Object.isFrozen(r.cacheStats.segments.after.records)); assert.equal(r.work.cacheAdmissions, r.stages.finish.called ? 2 : 1);
  assert.equal(r.cacheStats.whole.after.queries - r.cacheStats.whole.before.queries, r.work.cacheAdmissions); assert.equal(r.result.source === 'oracle', !!r.work.fullOracleCalls); assert.deepEqual(r.result.query, r.input.fallback);
  for (const st of Object.values(r.stages)) if (!st.called) assert.deepEqual(st, { called: false, inventoryBefore: null, receipt: null });
  if (r.result.status === 'found') { for (const v of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(v(Buffer.from(r.result.wire), s.context, s.view).accepted, true); assert.equal(r.result.witness.epoch, r.input.fallback.epoch); }
  else assert.equal(r.result.feasible, r.result.status === 'infeasible' ? false : null);
  return r;
}
// Separate public caller; no composite normalizers/guards. Fresh equivalent captures preserve actual D1 conditioning.
function native(s, request, advice) {
  const wb = s.whole.stats(), sb = s.segments.stats(), probe = s.whole.probe(s.view, s.context, request.fallback, { tick: request.tick }), skipped = () => ({ called: false, inventoryBefore: null, receipt: null });
  const stages = { probe: { called: true, inventoryBefore: wb.entries, receipt: probe }, prefix: skipped(), union: skipped(), finish: skipped() }; let chosen = probe, source = 'cache';
  if (probe.status !== 'found') {
    const p = proposePathWitnessFromSegments(s.forest, s.view, s.context, request.prefix, advice, s.segments); stages.prefix = { called: true, inventoryBefore: sb.entries, receipt: p }; let hint = p.wire; source = 'prefix';
    if (p.status !== 'found') { const u = proposePathWitnessFromUnion(s.forest, s.view, s.context, request.union); stages.union = { called: true, inventoryBefore: null, receipt: u }; hint = u.wire; source = u.status === 'found' ? 'union' : 'oracle'; }
    const inventory = s.whole.stats(), finish = s.whole.lookup(s.view, s.context, request.fallback, { tick: request.tick, hint }); stages.finish = { called: true, inventoryBefore: inventory.entries, receipt: finish }; chosen = finish;
  }
  const wa = s.whole.stats(), sa = s.segments.stats(), result = { source, ...Object.fromEntries(['status', 'reason', 'feasible', 'required', 'wire', 'witness', 'verification', 'viewRoot', 'reference', 'context', 'query', 'stats'].map(k => [k, chosen[k]])) };
  return { input: request, advice, result, stages, cacheStats: { whole: { before: wb, after: wa }, segments: { before: sb, after: sa } }, work: { cacheAdmissions: wa.queries - wb.queries, cacheSweepEntryUpperBound: wb.entries + (stages.finish.inventoryBefore ?? 0), prefixCalled: stages.prefix.called, unionCalled: stages.union.called, fullOracleCalls: wa.oracleCalls - wb.oracleCalls, segmentLookups: stages.prefix.receipt?.segments.stats.lookupCalls ?? 0, segmentSweepEntryUpperBound: stages.prefix.receipt?.segments.stats.inventorySweepEntryUpperBound ?? 0, routedPeers: stages.prefix.receipt?.prefix.stats.routedPeers ?? 0 } };
}
// Raw three-node physical family condition; both anchors require their own direct support, no other intermediary exists.
function rawExists(edges, projection) { const has = (a, b) => edges.some(([x, y]) => x === a && y === b); return ['a', 'b'].every(a => projection === 'directed' ? has(a, 'u') : projection === 'reciprocal' ? has(a, 'u') && has('u', a) : has(a, 'u') || has('u', a)); }
test('frozen1152-case3456-query stream equals separately conditioned native sequence/raw physical families/full M2', t => {
  const hash = createHash('sha256'), sources = { cache: 0, prefix: 0, union: 0, oracle: 0 }; let cases = 0, observations = 0, positives = 0;
  for (let mask = 0; mask < 64; mask++) for (const mode of ['directed', 'any', 'reciprocal']) for (const profile of baseline.profiles) for (const retention of baseline.retention) {
    const edges = baseline.arcs.filter((_, i) => mask & (1 << i)), f = fixture(baseline.nodes, edges, { maxHops: 2, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' }, baseline.graphName), a = owners(f, undefined, { maxEntries: retention }), b = owners(f, undefined, { maxEntries: retention });
    for (const s of [a, b]) { const sv = f.view(); for (const anchor of ['a', 'b']) seed(s, f, ['u', anchor], sv); }
    const expected = rawExists(edges, mode), rows = []; assert.equal(findPathWitness(f.view(), f.context, fallback).feasible, expected);
    for (const tick of baseline.ticks) { const q = input(tick, profile.prefix, profile.union), r = checked(a, q, f.advice()); assert.deepEqual(projection(r), native(b, q, f.advice())); assert.equal(r.result.feasible, expected); rows.push(projection(r)); sources[r.result.source]++; observations++; positives += Number(r.result.status === 'found'); }
    hash.update(JSON.stringify(rows)).update('\0'); cases++;
  }
  assert.equal(hash.digest('hex'), baseline.digest); assert.deepEqual({ cases, observations, positives, sources }, { cases: baseline.cases, observations: baseline.observations, positives: baseline.positives, sources: baseline.sources }); t.diagnostic('composite-native-stream ' + JSON.stringify({ cases, observations, positives, sources, observedMismatch: 0, digest: baseline.digest }));
});
test('prefix positive, tree-only prefix source, real warm hit and inherited cold/warm D1 preparation stay separate', () => {
  const f = fixture(), view = f.view(), a = owners(f, view), b = owners(f, view); for (const s of [a, b]) assert.equal(seed(s, f, ['x', 'y', 'b']).status, 'stored');
  const r = checked(a, input(), f.advice()), warm = checked(b, input(), f.advice()); assert.equal(r.result.source, 'prefix'); assert.equal(r.stages.union.called, false); assert.equal(r.result.wire, warm.result.wire); assert.deepEqual(r.stages.prefix.receipt.prefix, warm.stages.prefix.receipt.prefix);
  assert.deepEqual([r.stages.prefix.receipt.segments.work.preparedNodes, r.stages.prefix.receipt.segments.work.preparedStorageEdges], [5, 6]); assert.equal(warm.stages.prefix.receipt.segments.work.preparedNodes, 0);
  let draws = 0; const old = Random.prototype.int; Random.prototype.int = function (...args) { draws++; return old.apply(this, args); };
  try { const hit = checked(a, input(1), f.advice('best-of-two')); assert.equal(hit.result.source, 'cache'); assert.deepEqual(hit.cacheStats.segments.before, hit.cacheStats.segments.after); assert.equal(hit.work.routedPeers, 0); assert.equal(draws, 0); } finally { Random.prototype.int = old; }
  const tree = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']], { maxHops: 2 }), tr = checked(owners(tree), input(), tree.advice()); assert.equal(tr.result.source, 'prefix'); assert.equal(tr.stages.prefix.receipt.segments.work.returned, 0);
});
test('nonpositive prefix retains actual offers/returned-unconsumed uses before union/full, supplied loads never fold', () => {
  const f = fixture(); for (const mode of ['uniform', 'best-of-two']) for (const disableUnion of [false, true]) {
    const a = owners(f), b = owners(f); for (const s of [a, b]) { seed(s, f, ['u', 'a']); seed(s, f, ['u', 'x', 'y', 'b']); }
    const advice = f.advice(mode), original = JSON.stringify(advice), q = input(0, { maxTreeLookups: 0, maxCandidates: 0 }, disableUnion ? { maxVertices: 0 } : {}), r = checked(a, q, advice);
    assert.deepEqual(projection(r), native(b, q, f.advice(mode))); assert.equal(r.result.source, disableUnion ? 'oracle' : 'union'); assert.ok(r.work.routedPeers > 0); assert.ok(r.stages.prefix.receipt.segments.work.returned > r.stages.prefix.receipt.segments.stats.consumedJoins); assert.equal(JSON.stringify(advice), original);
    assert.equal(r.cacheStats.segments.after.records.reduce((n, r) => n + r.uses, 0), r.stages.prefix.receipt.segments.work.returned);
  }
});
test('whole hit does not sweep expired-relative segments; unused later segment clock and advice still reject inertly', () => {
  const f = fixture(), s = owners(f, undefined, { ttlTicks: 10 }); seed(s, f, ['x', 'y', 'b']); checked(s, input(), f.advice());
  const hit = checked(s, input(6), f.advice()); assert.equal(hit.result.source, 'cache'); assert.equal(hit.cacheStats.segments.after.lastTick, 0); assert.ok(hit.cacheStats.segments.after.records.every(r => r.expiresAt <= 6));
  const bad = f.advice(); bad.pools[0].loads = []; const before = state(s); assert.throws(() => checked(s, input(7), bad)); assert.deepEqual(state(s), before);
  s.segments.lookup(s.view, s.context, { epoch: 3, to: 'a', tick: 100, maxChecks: 0, maxResults: 0 }); const later = state(s); assert.throws(() => checked(s, input(7), f.advice()), /clock/); assert.deepEqual(state(s), later);
  assert.equal(queryPathWitness(s.whole, s.forest, s.view, s.context, { tick: 7, union, fallback }).result.source, 'cache');
});
test('every unused query field/cap/accessor/clock and raw advice shape rejects before first admission or segment work', () => {
  const f = fixture(), s = owners(f); checked(s, input(), f.advice()); const before = state(s); let reads = 0;
  function rejects(q = input(1), a = f.advice()) { assert.throws(() => queryPathWitnessComposite(bundle(s), s.view, s.context, q, a)); assert.deepEqual(state(s), before); }
  for (const v of [-0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) rejects({ ...input(1), tick: v });
  for (const stage of ['prefix', 'union', 'fallback']) for (const k of Object.keys(input()[stage])) {
    const missing = input(1); delete missing[stage][k]; rejects(missing);
    for (const val of [-0, NaN, Number.MAX_SAFE_INTEGER + 1]) { const q = input(1); q[stage][k] = val; rejects(q); }
    const q = input(1); Object.defineProperty(q[stage], k, { enumerable: true, get() { reads++; return 1; } }); rejects(q);
  }
  for (const q of [input(1, { epoch: 2 }), input(1, { maxPrefixHops: 4 }), input(1, {}, { maxAnchorHops: 4 }), input(1, { maxPrefixes: 4097 }), input(1, { maxBranches: 65 }), input(1, { maxSegmentChecks: 1025 }), input(1, {}, { maxVertices: 4097 }), input(1, {}, {}, { maxPaths: 4097 })]) rejects(q);
  const adviceCases = [null, { ...f.advice(), extra: 1 }, { pools: [], routing: { ...f.advice().routing, seed: '' } }, { pools: [], routing: { ...f.advice().routing, step: -0 } }];
  const sparse = f.advice(); sparse.pools = new Array(1); adviceCases.push(sparse); const index = f.advice(); Object.defineProperty(index.pools, 0, { get() { reads++; return {}; } }); adviceCases.push(index);
  const getter = f.advice(); Object.defineProperty(getter.routing, 'mode', { enumerable: true, get() { reads++; return 'uniform'; } }); adviceCases.push(getter);
  for (const key of ['subject', 'pool', 'loads']) { const a = f.advice(); Object.defineProperty(a.pools[0], key, { enumerable: true, get() { reads++; } }); adviceCases.push(a); }
  const duplicate = f.advice(); duplicate.pools.push(duplicate.pools[0]); adviceCases.push(duplicate); const long = f.advice(); long.pools[0].subject = 'x'.repeat(65); adviceCases.push(long);
  for (const edit of [a => a.pools[0].loads.pop(), a => a.pools[0].loads.push(a.pools[0].loads[0]), a => a.pools[0].loads[0].id = 'unknown', a => a.pools[0].loads[0].load = -0, a => Object.defineProperty(a.pools[0].loads[0], 'load', { get() { reads++; } })]) { const a = f.advice('best-of-two'); edit(a); adviceCases.push(a); }
  for (const a of adviceCases) rejects(input(1), a); assert.equal(reads, 0);
  const q = input(1); q.prefix = Object.assign(Object.create(null), q.prefix); const a = f.advice('best-of-two'); a.pools[0].loads.reverse(); Object.setPrototypeOf(a.pools, null); Object.setPrototypeOf(a.pools[0].loads, null);
  const good = checked(s, q, a); assert.deepEqual(good.advice.pools[0].loads.map(r => r.id), f.pool.ranked.map(r => r.id)); assert.equal(Object.isFrozen(q), false);
});
test('exact owner/view/forest/pool brands and policies reject without invoking fake/subclass callbacks', () => {
  const f = fixture(), s = owners(f), before = state(s); let calls = 0;
  for (const [key, Type, cfg] of [['whole', PathWitnessCache, wholeConfig], ['segments', PathWitnessSegmentCache, segmentConfig]]) for (const value of [Object.create(Type.prototype), new Proxy(s[key], {}), new (class extends Type { stats() { calls++; } })(cfg), { stats() { calls++; } }]) {
    assert.throws(() => queryPathWitnessComposite({ ...bundle(s), [key]: value }, s.view, s.context, input(), f.advice())); assert.deepEqual(state(s), before);
  }
  for (const ff of [null, { ...s.forest }, s.view]) assert.throws(() => queryPathWitnessComposite({ ...bundle(s), forest: ff }, s.view, s.context, input(), f.advice()));
  assert.throws(() => queryPathWitnessComposite(bundle(s), { ...s.view }, s.context, input(), f.advice())); assert.throws(() => queryPathWitnessComposite(bundle(s), s.view, { ...s.context, policy: { ...s.context.policy, maxHops: 2 } }, input(), f.advice()));
  const a = f.advice(); a.pools[0].pool = { ...f.pool }; assert.throws(() => checked(s, input(), a)); assert.equal(calls, 0); assert.deepEqual(state(s), before);
});
test('known negatives remain full-only; zero budgets, unavailable current/forest and old epochs/origins preserve namespaces', () => {
  const f = fixture(); for (const full of [fallback, { ...fallback, maxExpansions: 0, maxPaths: 0, maxPackingSteps: 0 }]) {
    const r = checked(owners(f), input(0, { maxCandidates: 0 }, { maxVertices: 0 }, full), f.advice()); assert.equal(r.result.source, 'oracle'); assert.equal(r.result.status, full === fallback ? 'found' : 'censored'); assert.equal(r.stages.union.receipt.feasible, null);
  }
  const no = fixture(['u', 'a', 'b'], [['b', 'u']]), nr = checked(owners(no), input(0, { maxCandidates: 0 }, { maxVertices: 0 }, { maxExpansions: 0, maxPaths: 0, maxPackingSteps: 0 }), no.advice()); assert.equal(nr.result.status, 'infeasible'); assert.equal(nr.stages.probe.receipt.feasible, null);
  const s = owners(f); f.options.snapshots = []; const missing = owners(f); const r = checked(missing, input(), f.advice()); assert.equal(r.result.status, 'unavailable'); assert.equal(r.work.segmentLookups, 0);
  s.forest = missing.forest; assert.equal(checked(s, input(), f.advice()).result.source, 'oracle'); assert.equal(checked(s, input(1), f.advice()).result.source, 'cache');
  f.options.snapshots = [{ epoch: 2, difficulty: 1, anchors: ['a'] }, { epoch: 3, difficulty: 2, anchors: ['a', 'b'] }]; const e = owners(f);
  for (const [epoch, tick] of [[2, 0], [3, 1], [2, 2], [3, 3]]) { const r = checked(e, input(tick, { epoch }, { epoch }, { epoch }), f.advice()); assert.equal(r.result.witness.epoch, epoch); assert.equal(r.result.required, epoch === 2 ? 1 : 2); }
  const root = e.forest.meta.originRoot; f.graph.addNode('unrelated'); e.view = f.view(); assert.equal(checked(e, input(4), f.advice()).result.source, 'cache'); assert.notEqual(e.view.view().id, root); assert.equal(e.forest.meta.originRoot, root);
});
test('zero/exact/one-more budgets, disabled retention, partial results and maximum safe clocks keep native effects', () => {
  const f = fixture(); for (const pp of [{ maxSegmentLookups: 0 }, { maxSegmentChecks: 0 }, { maxSegmentResults: 0 }, { maxSegmentLookups: 1 }, { maxSegmentChecks: 1, maxSegmentResults: 1 }, { maxBranches: 0 }, { maxPrefixHops: 0 }, { maxTreeLookups: 0 }, { maxPrefixes: 0 }, { maxPackingSteps: 0 }]) {
    const a = owners(f), b = owners(f); for (const s of [a, b]) { seed(s, f, ['u', 'a']); seed(s, f, ['x', 'y', 'b']); } const q = input(0, pp); assert.deepEqual(projection(checked(a, q, f.advice())), native(b, q, f.advice()));
  }
  for (const cfg of [{ maxEntries: 0 }, { maxBytes: 0 }, { maxBytes: 1 }]) { const s = owners(f, undefined, cfg, { maxEntries: 0 }); for (const tick of [0, 1]) { const r = checked(s, input(tick), f.advice()); assert.equal(r.cacheStats.whole.after.entries, 0); assert.notEqual(r.result.source, 'cache'); } }
  const s = owners(f, undefined, { ttlTicks: 1 }, { ttlTicks: 1000000 }); assert.equal(checked(s, input(Number.MAX_SAFE_INTEGER - 1), f.advice()).result.status, 'found'); const before = state(s); assert.throws(() => checked(s, input(Number.MAX_SAFE_INTEGER), f.advice())); assert.deepEqual(state(s), before);
});
test('64x64 complete best-of-two rows and1024 native records preserve bounded preflight/scoped inventories', () => {
  const nodes = ['u', 'a', 'b', ...Array.from({ length: 1022 }, (_, i) => 'n' + i)], edges = nodes.filter(n => !['a', 'b'].includes(n)).map(n => ['a', n]); edges.push(['b', 'u']);
  const f = fixture(nodes, edges), s = owners(f, undefined, {}, { maxEntries: 1024, maxBytes: 1000000 }), seedView = f.view();
  for (const n of nodes.filter(n => !['a', 'b'].includes(n))) assert.equal(seed(s, f, [n, 'a'], seedView).status, 'stored');
  assert.equal(s.segments.stats().entries, 1023); assert.equal(seed(s, f, ['u', 'b'], seedView).status, 'stored');
  const a = f.advice('best-of-two'); for (const row of a.pools) for (const load of row.loads) load.load = Number.MAX_SAFE_INTEGER;
  const r = checked(s, input(0, { maxPrefixHops: 0, maxTreeLookups: 0, maxCandidates: 0 }), a); assert.deepEqual(r.preflight, { poolChecks: 65, poolRows: 64, retainedPoolEntries: 4096, loadRows: 4096 }); assert.equal(r.cacheStats.segments.before.entries, 1024); assert.equal(r.work.segmentSweepEntryUpperBound, r.work.segmentLookups * 1024);
  const before = state(s); for (const edit of [v => v.pools.push(v.pools[0]), v => v.pools[0].loads.push(v.pools[0].loads[0]), v => Object.defineProperty(v.pools, Symbol('extra'), { value: 1 }), v => Object.setPrototypeOf(v.pools, class extends Array {}.prototype)]) { const bad = f.advice('best-of-two'); edit(bad); assert.throws(() => checked(s, input(1), bad)); assert.deepEqual(state(s), before); }
  const empty = checked(s, input(1), { pools: [], routing: a.routing }); assert.equal(empty.preflight.poolChecks, 1); assert.equal(empty.result.source, 'cache');
});
test('native whole/segment counter and metadata faults are detected after actual calls with no rollback', () => {
  const f = fixture(); const originalWhole = PathWitnessCache.prototype.stats, s = owners(f);
  PathWitnessCache.prototype.stats = function () { const v = originalWhole.call(this); return v.queries ? { ...v, queries: v.queries + 1 } : v; };
  try { assert.throws(() => checked(s, input(), f.advice()), /counter/); assert.equal(originalWhole.call(s.whole).queries, 2); assert.equal(originalWhole.call(s.whole).entries, 1); } finally { PathWitnessCache.prototype.stats = originalWhole; }
  const p = owners(f); seed(p, f, ['x', 'y', 'b']); const originalSegments = PathWitnessSegmentCache.prototype.stats;
  PathWitnessSegmentCache.prototype.stats = function () { const v = originalSegments.call(this); return { ...v, records: v.records.map(r => r.uses ? { ...r, uses: r.uses + 1 } : r) }; };
  try { assert.throws(() => checked(p, input(), f.advice()), /returned\/use/); assert.equal(p.whole.stats().queries, 1); assert.ok(originalSegments.call(p.segments).records.some(r => r.uses > 0)); } finally { PathWitnessSegmentCache.prototype.stats = originalSegments; }
  const t = owners(f), originalProbe = PathWitnessCache.prototype.probe; PathWitnessCache.prototype.probe = function (...args) { const r = originalProbe.apply(this, args); return { ...r, cache: { ...r.cache, retained: true } }; };
  try { assert.throws(() => checked(t, input(), f.advice()), /retention/); assert.equal(t.whole.stats().queries, 1); } finally { PathWitnessCache.prototype.probe = originalProbe; }
});
test('silent canonical edge/removal changes reject old whole packets without notices and preserve origin', () => {
  const f = fixture(['u', 'a', 'b', 'c'], [['a', 'u'], ['b', 'u'], ['c', 'u']], {}, 'composite-churn', ['a', 'b', 'c']), s = owners(f); checked(s, input(), f.advice()); const origin = s.forest.meta.originRoot;
  f.graph.removeEdge('a', 'u'); s.view = f.view(); let r = checked(s, input(1), f.advice()); assert.equal(r.stages.probe.receipt.work.cacheChecks, 1); assert.equal(r.cacheStats.whole.after.cacheRejects, 1); assert.deepEqual(r.result.witness.paths.map(p => p.at(-1)), ['b', 'c']);
  f.options.removed = ['b']; s.view = f.view(); r = checked(s, input(2), f.advice()); assert.equal(r.result.status, 'infeasible'); assert.equal(s.forest.meta.originRoot, origin);
});
test('public native receipt faults throw after actual effects, do not retry/rollback, and invalid preflight does not prime', () => {
  const f = fixture(); for (const [method, edit, message] of [['probe', r => ({ ...r, schema: 'wrong' }), /scope/], ['probe', r => ({ ...r, source: 'oracle' }), /probe/], ['probe', r => ({ ...r, work: { ...r.work, oracleCalls: 1 } }), /probe/], ['lookup', r => ({ ...r, wire: r.wire + ' ' }), /packet|wire/], ['lookup', r => ({ ...r, source: 'cache' }), /finish/], ['lookup', r => ({ ...r, required: r.required + 1 }), /verification/]]) {
    const s = owners(f), original = PathWitnessCache.prototype[method]; let calls = 0; PathWitnessCache.prototype[method] = function (...args) { calls++; return edit(original.apply(this, args)); };
    try { assert.throws(() => checked(s, input(), f.advice()), message); assert.equal(calls, 1); assert.equal(s.whole.stats().queries, method === 'probe' ? 1 : 2); } finally { PathWitnessCache.prototype[method] = original; }
  }
  const s = owners(f), original = PathWitnessSegmentCache.prototype.lookup; seed(s, f, ['x', 'y', 'b']); let calls = 0;
  PathWitnessSegmentCache.prototype.lookup = function (...args) { calls++; const r = original.apply(this, args); throw new Error('provider failed after real lookup'); };
  try { assert.throws(() => checked(s, input(), f.advice()), /provider failed/); assert.equal(calls, 1); assert.equal(s.whole.stats().queries, 1); assert.equal(s.segments.stats().lastTick, 0); } finally { PathWitnessSegmentCache.prototype.lookup = original; }
  const cold = owners(f), bad = f.advice(); bad.routing.seed = ''; assert.throws(() => checked(cold, input(), bad)); seed(cold, f, ['x', 'y', 'b']); const r = checked(cold, input(), f.advice()); assert.equal(r.stages.prefix.receipt.segments.work.preparedNodes, 5);
});
test('r64/D64/UTF8-NUL, empty/advice limits, Native nonmutation and conditioned future/inert behavior', () => {
  const anchors = Array.from({ length: 64 }, (_, i) => 'a' + i), big = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), { maxHops: 1, maxDifficulty: 64 }, 'composite64', anchors, 64);
  const r = checked(owners(big), input(0, { maxPrefixHops: 1 }, { maxSubjectHops: 1, maxAnchorHops: 1 }), big.advice()); assert.equal(r.result.witness.paths.length, 64); assert.equal(r.preflight.poolRows, 64);
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'é\0' + i), 'a'], long = fixture(path, path.slice(1).map((n, i) => [n, path[i]]), { maxHops: 64 }, 'composite-long', ['a'], 1), q = input(0, { maxPrefixHops: 0 }, { maxSubjectHops: 64, maxAnchorHops: 0 });
  const s = owners(long), lr = checked(s, q, { ...long.advice(), pools: [] }); assert.equal(lr.result.witness.paths[0].length, 65);
  const f = fixture(), a = owners(f), b = owners(f), first = checked(a, input(), f.advice()), bytes = JSON.stringify(first); assert.deepEqual(first, checked(b, input(), f.advice())); a.whole.stats(); a.segments.stats(); a.forest.toJSON();
  assert.deepEqual(checked(a, input(1), f.advice()), checked(b, input(1), f.advice())); assert.equal(JSON.stringify(first), bytes); assert.throws(() => first.advice.pools.push({})); assert.throws(() => { first.cacheStats.whole.before.queries = 9; });
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const id of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(id, 'u')); const nf = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']]), nv = capturePathWitnessModelView(m, nf.options), before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]);
  assert.equal(checked(owners(nf, nv), input(), nf.advice()).result.status, 'found'); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
});
