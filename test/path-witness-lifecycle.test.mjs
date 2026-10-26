import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { pathWitnessContext, verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { PathWitnessCache, PATH_CACHE_LIMITS } from '../src/path-witness-cache.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, repairPathWitnessTrees, PATH_TREE_LIMITS, PATH_TREE_REPAIR_LIMITS, PATH_UNION_LIMITS } from '../src/path-witness-trees.mjs';
import { queryPathWitness } from '../src/path-witness-pipeline.mjs';
import { findPathWitness, PATH_ORACLE_LIMITS } from '../src/path-witness-oracle.mjs';
import { runPathWitnessLifecycle, PATH_LIFECYCLE_LIMITS } from '../src/path-witness-lifecycle.mjs';
import { provenance } from '../src/provenance.mjs';
import { experimentConfig } from '../src/experiment-config.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const precode = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/m3-lifecycle-contract-validation.json', import.meta.url)));
const cacheConfig = { maxEntries: 4, maxBytes: 10000, ttlTicks: 5 }, build = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 };
const repair = { epoch: 3, maxTreeNodes: 1000, maxQueuePops: 10000, maxPredecessorTrials: 10000, maxScheduleTrials: 10000, maxLabelUpdates: 10000 };
const union = { epoch: 3, maxSubjectHops: 2, maxAnchorHops: 2, maxVertices: 4096, maxArcs: 65536, maxTreeRows: 65536, maxBallTrials: 10000, maxExpansions: 10000, maxPaths: 4096, maxPackingSteps: 10000 };
const fallback = { epoch: 3, maxExpansions: 1000, maxPaths: 128, maxPackingSteps: 1000 };
const hash = v => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const clone = v => structuredClone(v);
function fixture(nodes = ['u', 'a', 'b'], edges = [['a', 'u'], ['b', 'u']], patch = {}, anchors = ['a', 'b'], difficulty = 2, name = 'lifecycle-control') {
  const policy = { ...base.policy, maxHops: 3, ...patch }, graph = new DirectedGraph(name);
  for (const id of nodes) graph.addNode(id); for (const [a, b] of edges) graph.addEdge(a, b);
  const options = { policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty, anchors }], removed: [], standing: [] };
  return { graph, options, view: () => pathWitnessGraphView(graph, options) };
}
const frame = (id, view) => ({ id, view });
const maintenance = (op = 'build', id = 'old', patch = {}) => ({ op, frame: id, query: { ...(op === 'repair' ? repair : build), ...patch } });
const q = (id, tick = 0, name = 'old', up = {}, fp = {}, subject = 'u') => ({ op: 'query', id, frame: name, subject, input: { tick, union: { ...union, ...up }, fallback: { ...fallback, ...fp } } });
const inv = (edges = [], anchors = [], name = 'old') => ({ op: 'invalidate', frame: name, notices: { edges, anchors } });
const tape = (frames, steps, patch = {}) => ({ domain: base.domain, cache: { ...cacheConfig, ...patch }, frames, steps });
function descriptor(forest) {
  if (!forest) return null; const m = forest.meta, j = forest.toJSON();
  return { viewRoot: m.originRoot, policyId: m.policyId, epoch: m.epoch, reference: m.reference, status: m.status, reason: m.reason, complete: m.complete, eligibleRoots: forest.anchors().length, retainedRoots: j.parents.length, treeNodes: m.stats.treeNodes };
}
// Separate public caller: actual cache, tracked construction origin, raw G receipts; no lifecycle normalizer/state/compaction helpers.
function manual(input) {
  const cache = new PathWitnessCache(input.cache), frames = new Map(input.frames.map(f => [f.id, f.view])), rows = [], originals = []; let forest = null, origin = null;
  for (const [index, request] of input.steps.entries()) {
    const view = frames.get(request.frame), before = descriptor(forest), cb = cache.stats(), called = request.op === 'build' || request.op === 'invalidate' || forest !== null;
    let result, work = null;
    if (request.op === 'invalidate') { result = cache.invalidate(request.notices); work = { invalidation: result }; }
    else if (request.op === 'query') {
      if (!called) result = { status: 'unavailable', reason: 'forest-missing', feasible: null, required: null, source: 'uncalled', pipelineDigest: null, wireDigest: null, wireBytes: null, verification: null,
        stages: Object.fromEntries(['probe', 'advice', 'finish'].map(k => [k, { called: false, status: null, reason: null, coverage: null }])) };
      else {
        const context = pathWitnessContext({ domain: input.domain, subject: request.subject, policy: view.toJSON().options.policy }), raw = queryPathWitness(cache, forest, view, context, request.input), r = raw.result;
        originals.push({ raw, view, context, request });
        const stages = {};
        for (const name of ['probe', 'advice', 'finish']) { const s = raw.stages[name]; stages[name] = { called: s.called, status: s.called ? s.receipt.status : null, reason: s.called ? s.receipt.reason : null, coverage: name === 'advice' && s.called ? s.receipt.coverage : null }; }
        result = { status: r.status, reason: r.reason, feasible: r.feasible, required: r.required, source: r.source, pipelineDigest: hash(raw), wireDigest: r.wire === null ? null : hash(r.wire), wireBytes: r.wire === null ? null : Buffer.byteLength(r.wire), verification: r.status === 'found' ? { primaryAccepted: true, ref2Accepted: true } : null, stages };
        work = { pipeline: raw.work, probe: raw.stages.probe.receipt.work, union: raw.stages.advice.called ? raw.stages.advice.receipt.work : null,
          finish: raw.stages.finish.called ? { cache: raw.stages.finish.receipt.work, search: raw.stages.finish.receipt.stats } : null, accounting: { pipelineBytesHashed: Buffer.byteLength(JSON.stringify(raw)) } };
      }
    } else if (!called) result = { status: 'unavailable', reason: 'forest-missing', reset: null, deltaComplete: null, retiredRoots: null, rootActions: null };
    else if (request.op === 'build') {
      const f = buildPathWitnessTrees(view, request.query); result = { status: f.meta.status, reason: f.meta.reason, reset: null, deltaComplete: null, retiredRoots: null, rootActions: null }; work = { build: f.meta.stats };
      forest = f.meta.status === 'unavailable' ? null : f; origin = forest ? view : null;
    } else {
      const raw = (request.op === 'refresh' ? refreshPathWitnessTrees : repairPathWitnessTrees)(forest, origin, view, request.query), r = raw.report;
      const actions = r.status === 'unavailable' ? null : Object.fromEntries([...new Set(r.roots.map(x => x.action))].map(k => [k, r.roots.filter(x => x.action === k).length]));
      result = { status: r.status, reason: r.reason, reset: r.reset, deltaComplete: r.deltaComplete, retiredRoots: r.status === 'unavailable' ? null : r.retired.length, rootActions: actions }; work = { forest: raw.forest?.meta.stats ?? null, maintenance: r.work };
      forest = raw.forest; origin = forest ? view : null;
    }
    rows.push({ index, request, called, activeBefore: before, activeAfter: descriptor(forest), cacheBefore: cb, cacheAfter: cache.stats(), result, work });
  }
  return { rows, originals, finalForest: descriptor(forest), finalCache: cache.stats() };
}
function frozen(v) { if (v && typeof v === 'object') { assert.ok(Object.isFrozen(v)); for (const x of Object.values(v)) frozen(x); } }
function checked(input) {
  const bytes = JSON.stringify(input), r = runPathWitnessLifecycle(input), shadow = manual(input); assert.equal(JSON.stringify(input), bytes);
  assert.deepEqual(r.rows, shadow.rows); assert.deepEqual(r.finalCache, shadow.finalCache); assert.deepEqual(r.finalForest, shadow.finalForest); assert.deepEqual(r.provenance, provenance());
  assert.equal(r.schema, 'facety-path-lifecycle/v1'); assert.equal(r.reference, 'supplied-frame-cache-forest/v1'); assert.deepEqual(Object.keys(r).sort(), ['schema', 'reference', 'provenance', 'domain', 'namespace', 'cacheConfig', 'frames', 'preflight', 'rows', 'totals', 'finalForest', 'finalCache'].sort());
  assert.deepEqual(r.preflight, { frames: input.frames.length, steps: input.steps.length, querySteps: input.steps.filter(s => s.op === 'query').length, invalidationSteps: input.steps.filter(s => s.op === 'invalidate').length,
    edgeNotices: input.steps.filter(s => s.op === 'invalidate').reduce((n, s) => n + s.notices.edges.length, 0), anchorNotices: input.steps.filter(s => s.op === 'invalidate').reduce((n, s) => n + s.notices.anchors.length, 0) });
  for (const op of Object.keys(r.totals.operations)) { const rows = r.rows.filter(x => x.request.op === op); assert.deepEqual(r.totals.operations[op], { requested: rows.length, called: rows.filter(x => x.called).length, skipped: rows.filter(x => !x.called).length }); }
  for (const status of Object.keys(r.totals.queries)) assert.equal(r.totals.queries[status], r.rows.filter(x => x.request.op === 'query' && x.result.status === status).length);
  for (const source of Object.keys(r.totals.sources)) assert.equal(r.totals.sources[source], r.rows.filter(x => x.request.op === 'query' && x.result.source === source).length);
  assert.deepEqual(r.totals.pipeline, { cacheAdmissions: shadow.finalCache.queries, cacheSweepEntryUpperBound: shadow.originals.reduce((n, x) => n + x.raw.work.cacheSweepEntryUpperBound, 0), unionCalls: shadow.originals.filter(x => x.raw.work.unionCalled).length, fullOracleCalls: shadow.finalCache.oracleCalls });
  for (const { raw, view, context, request } of shadow.originals) if (raw.result.status === 'found') {
    assert.equal(findPathWitness(view, context, { ...fallback, epoch: request.input.fallback.epoch }).status, 'found');
    for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(raw.result.wire), context, view).accepted, true);
  }
  for (const key of ['wire', 'parents', 'vertices', 'arcs', 'receipt']) assert.equal(JSON.stringify(r).includes('"' + key + '":'), false, key);
  function scalarPaths(v) { if (v && typeof v === 'object') for (const [key, child] of Object.entries(v)) { if (key === 'paths') assert.equal(typeof child, 'number', 'M2 path count, never proof path arrays'); scalarPaths(child); } }
  scalarPaths(r); frozen(r); return r;
}

test('fresh owner manual rows/digests/counters preserve index clearing, actual versus skipped clocks and explicit cache recovery', () => {
  const f = fixture(), old = frame('old', f.view()); f.graph.addNode('unrelated'); const current = frame('new', f.view()); f.options.snapshots = []; const absent = frame('absent', f.view());
  const r = checked(tape([old, current, absent], [q('before'), maintenance('refresh'), inv(), maintenance(), q('first'), q('warm', 1, 'new'), maintenance('refresh', 'new'), maintenance('repair', 'new'), maintenance('repair', 'absent'), q('skipped', 2, 'old'), inv([], ['unknown'], 'absent'), maintenance('refresh', 'new'), maintenance('build', 'old', { maxTreeNodes: 0 }), q('recovered', 3)]));
  assert.equal(r.rows[5].result.source, 'cache'); assert.equal(r.rows[5].activeAfter.viewRoot, old.view.view().id); assert.equal(r.rows[6].activeAfter.viewRoot, current.view.view().id);
  assert.equal(r.rows[8].activeAfter, null); assert.equal(r.rows[8].cacheAfter.entries, 1); assert.equal(r.rows[9].called, false); assert.equal(r.rows[9].cacheAfter.lastTick, 1); assert.equal(r.rows[11].called, false);
  assert.equal(r.rows[13].result.source, 'cache'); assert.equal(r.rows[13].work.pipeline.cacheAdmissions, 1); assert.equal(r.rows[13].work.union, null);
  const end = checked(tape([old, absent], [maintenance(), q('first'), maintenance('refresh', 'absent'), q('last-declared', 999)])); assert.equal(end.finalCache.lastTick, 0); assert.equal(end.finalCache.entries, 1); assert.equal(end.finalForest, null);
});

test('all64 physical graphs ×3 projections ×2 retention profiles replay maintenance/notice/query orders and raw families', t => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b])); let tapes = 0, positives = 0;
  for (let mask = 0; mask < 64; mask++) for (const mode of ['directed', 'any', 'reciprocal']) for (const retention of [0, 4]) {
    const edges = arcs.filter((_, i) => mask & (1 << i)), f = fixture(nodes, edges, { maxHops: 2, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' });
    const old = frame('old', f.view()); f.graph.removeEdge('a', 'u'); if (!f.graph.edge('b', 'u')) f.graph.addEdge('b', 'u'); const current = frame('new', f.view());
    const r = checked(tape([old, current], [maintenance(), q('first'), q('second', 1), inv([['a', 'u'], ['a', 'u']], ['a']), q('changed', 2, 'new'), maintenance('repair', 'new'), q('repaired', 3, 'new'), maintenance('refresh', 'old'), q('expired', 5)], { maxEntries: retention }));
    const edge = (a, b) => edges.some(([x, y]) => x === a && y === b);
    const direct = n => mode === 'directed' ? edge(n, 'u') : mode === 'reciprocal' ? edge(n, 'u') && edge('u', n) : edge(n, 'u') || edge('u', n);
    // With only u,a,b and D2, disjoint two-anchor support needs both direct physical adjacencies.
    assert.equal(r.rows[1].result.feasible, direct('a') && direct('b')); positives += Number(r.rows[1].result.status === 'found'); tapes++;
  }
  assert.equal(tapes, 384); t.diagnostic('lifecycle-manual-controls ' + JSON.stringify({ tapes, requestedQueryRows: tapes * 5, positivesAtFirstQuery: positives, observedMismatch: 0 }));
});

test('all operation permutations preserve named calls with no hidden maintenance/query/invalidation; notices are not graph changes', () => {
  const f = fixture(), frames = [frame('old', f.view())]; let cases = 0;
  function permutations(xs) { return xs.length ? xs.flatMap((x, i) => permutations(xs.filter((_, j) => i !== j)).map(rest => [x, ...rest])) : [[]]; }
  for (const order of permutations([maintenance(), maintenance('refresh'), maintenance('repair'), q('once'), inv([['a', 'u']], ['a'])])) { checked(tape(frames, order)); cases++; }
  assert.equal(cases, 120);
  const r = checked(tape(frames, [maintenance(), q('first'), inv([['a', 'u'], ['a', 'u']], ['a']), q('after', 1), inv([['x'.repeat(256), 'u']], ['x'.repeat(256)]), q('still-valid', 2)]));
  assert.deepEqual(r.rows[2].result, { evicted: 1, edgeNotices: 2, anchorNotices: 1 }); assert.equal(r.rows[2].cacheAfter.lastTick, 0); assert.equal(r.rows[3].result.source, 'union'); assert.equal(r.rows[5].result.source, 'cache'); assert.equal(f.view().edge('a', 'u'), true);
  f.graph.removeEdge('a', 'u'); const missingNotice = checked(tape([...frames, frame('cut', f.view())], [maintenance(), q('first'), q('silent-cut', 1, 'cut')]));
  assert.equal(missingNotice.rows[2].cacheAfter.cacheRejects, 1); assert.equal(missingNotice.rows[2].result.feasible, false);
});

test('policy/epoch/grace resets retain cache, known negatives/unavailable/censored/zero budgets keep distinct receipts', () => {
  const f = fixture(), old = frame('old', f.view()); f.options.policy = { ...f.options.policy, maxHops: 2 }; const changed = frame('policy', f.view());
  const r = checked(tape([old, changed], [maintenance(), q('old'), maintenance('refresh', 'policy'), q('new', 1, 'policy'), maintenance('refresh', 'old'), q('old-hit', 2)]));
  assert.equal(r.rows[2].result.reset, 'policy-changed'); assert.equal(r.rows[2].cacheAfter.entries, 1); assert.equal(r.rows[3].cacheAfter.entries, 2); assert.equal(r.rows[5].result.source, 'cache');
  f.options.policy = { ...old.view.toJSON().options.policy }; f.options.currentEpoch = 6; const late = frame('late', f.view());
  const lateRows = checked(tape([old, late], [maintenance(), q('before'), maintenance('refresh', 'late'), maintenance('build', 'late'), q('late-query', 1, 'late')]));
  assert.equal(lateRows.rows[2].result.reason, 'epoch-outside-grace'); assert.equal(lateRows.rows[3].result.status, 'built'); assert.equal(lateRows.rows[4].result.status, 'unavailable'); assert.equal(lateRows.rows[4].called, true);
  const e = fixture(); e.options.snapshots.unshift({ epoch: 2, difficulty: 1, anchors: ['a'] }); const epochs = frame('old', e.view());
  const er = checked(tape([epochs], [maintenance(), q('e2', 0, 'old', { epoch: 2 }, { epoch: 2 }), q('e3', 1), q('e2-hit', 2, 'old', { epoch: 2 }, { epoch: 2 }), q('e3-hit', 3)]));
  assert.deepEqual(er.rows.filter(x => x.request.op === 'query').map(x => x.result.required), [1, 2, 1, 2]); assert.equal(er.finalCache.entries, 2);
  const no = fixture(['u', 'a', 'b', 'x', 'y'], [['x', 'u'], ['y', 'u'], ['a', 'x'], ['b', 'x']]), v = frame('old', no.view()), z = Object.fromEntries(Object.keys(union).map(k => [k, k === 'epoch' ? 3 : 0]));
  const zr = checked(tape([v], [maintenance('build', 'old', { maxTreeNodes: 0 }), q('censored', 0, 'old', z, { maxExpansions: 0, maxPaths: 0, maxPackingSteps: 0 }), q('negative', 1)]));
  assert.equal(zr.rows[1].result.status, 'censored'); assert.equal(zr.rows[1].work.pipeline.fullOracleCalls, 1); assert.equal(zr.rows[2].result.status, 'infeasible'); assert.equal(zr.finalCache.entries, 0);
});

test('complete future-data preflight is inert; exact data/dense plain copies/clocks and per-policy subjects reject before cache admissions', () => {
  const f = fixture(), frames = [frame('old', f.view())], valid = () => tape([...frames], [maintenance(), q('first'), q('future', 1)]), bad = []; let getterReads = 0;
  for (const key of Object.keys(cacheConfig)) for (const n of [-0, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER]) { const x = valid(); x.cache[key] = n; bad.push(x); }
  for (const op of ['build', 'refresh', 'repair']) for (const [key, cap] of Object.entries(op === 'repair' ? { epoch: Number.MAX_SAFE_INTEGER, maxTreeNodes: PATH_TREE_LIMITS.maxTreeNodes, ...PATH_TREE_REPAIR_LIMITS } : { epoch: Number.MAX_SAFE_INTEGER, maxExpansions: PATH_TREE_LIMITS.maxExpansions, maxTreeNodes: PATH_TREE_LIMITS.maxTreeNodes })) {
    for (const value of [-0, -1, cap + 1]) { const x = valid(); x.steps.push(maintenance(op, 'old', { [key]: value })); bad.push(x); }
  }
  for (const [port, limits] of [['union', { epoch: Number.MAX_SAFE_INTEGER, ...PATH_UNION_LIMITS, ...PATH_ORACLE_LIMITS }], ['fallback', { epoch: Number.MAX_SAFE_INTEGER, ...PATH_ORACLE_LIMITS }]]) for (const [key, cap] of Object.entries(limits)) for (const value of [-0, -1, cap + 1]) { const x = valid(); x.steps[2].input[port][key] = value; bad.push(x); }
  for (const change of [x => { x.cache.ttlTicks = 0; }, x => { x.steps[2].input.tick = -0; }, x => { x.steps[2].input.tick = Number.MAX_SAFE_INTEGER; }, x => { x.steps[2].input.union.epoch = 2; }, x => { x.steps[2].input.union.maxSubjectHops = 4; }, x => { x.steps[2].subject = 'x'.repeat(65); }, x => { x.steps[2].id = 'first'; }, x => { x.steps[2].frame = 'unknown'; }, x => { x.steps[2].input.extra = true; }, x => { x.steps[2].subject = '\ud800'; }, x => { x.steps[2][Symbol('extra')] = 1; }, x => { Object.defineProperty(x.steps[2], 'subject', { get() { getterReads++; throw Error('accessed getter'); }, enumerable: true }); }, x => { x.frames.push({ ...frames[0] }); }, x => { x.frames.push(frame('foreign', {})); }, x => { x.steps.push(inv([], ['x'.repeat(257)])); }, x => { x.steps.push(inv([['a']])); }, x => { x.steps.push(inv([], Array(4097).fill('a'))); }, x => { x.steps.push(inv([['a', '\ud800']])); }, x => { x.steps[2] = { op: 'unknown' }; }, x => { x.steps.length++; }, x => { x.frames = new (class extends Array {})(...frames); }, x => { x.steps[2].input.union = { ...x.steps[2].input.union, maxExpansions: undefined }; }]) { const x = valid(); change(x); bad.push(x); }
  const different = fixture(undefined, undefined, { maxHops: 2 }); bad.push(tape([...frames, frame('policy', different.view())], [maintenance(), q('bad-policy', 0, 'policy')]));
  const ns = fixture(undefined, undefined, {}, undefined, 2, 'different-namespace'); bad.push(tape([...frames, frame('unused-namespace', ns.view())], [maintenance(), q('first')]));
  bad.push(tape(frames, [q('skipped-later', 20), maintenance(), q('rollback', 19)]));
  let calls = 0; const probe = PathWitnessCache.prototype.probe, invalidate = PathWitnessCache.prototype.invalidate;
  try {
    PathWitnessCache.prototype.probe = function (...args) { calls++; return probe.apply(this, args); }; PathWitnessCache.prototype.invalidate = function (...args) { calls++; return invalidate.apply(this, args); };
    for (const [i, x] of bad.entries()) assert.throws(() => runPathWitnessLifecycle(x), undefined, 'invalid partition ' + i);
    assert.equal(calls, 0); assert.equal(getterReads, 0);
  } finally { PathWitnessCache.prototype.probe = probe; PathWitnessCache.prototype.invalidate = invalidate; }
  const nullInput = Object.assign(Object.create(null), valid()); nullInput.steps = Object.assign(Object.create(null), nullInput.steps); // Not an Array, deliberately refused.
  assert.throws(() => runPathWitnessLifecycle(nullInput), /plain arrays/);
  const accepted = valid(); Object.setPrototypeOf(accepted.steps, null); Object.setPrototypeOf(accepted.frames, null); assert.equal(runPathWitnessLifecycle(accepted).rows.length, 3);
});

test('outer inventory caps/exact boundary/zero/empty, full notice caps and declared safe expiry are explicit software limits', () => {
  assert.deepEqual(PATH_LIFECYCLE_LIMITS, { maxFrames: 16, maxSteps: 128 }); assert.ok(Object.isFrozen(PATH_LIFECYCLE_LIMITS));
  const f = fixture(), frames = [frame('old', f.view())]; const empty = checked(tape([], [])); assert.equal(empty.namespace, null); assert.equal(empty.finalCache.lastTick, null);
  const allFrames = Array.from({ length: 16 }, (_, i) => frame('f' + i, f.view())), steps = Array.from({ length: 128 }, () => inv([], [], 'f0'));
  const r = checked(tape(allFrames, steps)); assert.equal(r.finalCache.invalidations, 128); assert.equal(r.finalCache.queries, 0);
  assert.throws(() => runPathWitnessLifecycle(tape([...allFrames, frame('extra', f.view())], steps)), /array bound/); assert.throws(() => runPathWitnessLifecycle(tape(allFrames, [...steps, inv([], [], 'f0')])), /array bound/);
  const notices = checked(tape(frames, [inv(Array.from({ length: PATH_CACHE_LIMITS.maxNotices }, () => ['a', 'u']), Array(PATH_CACHE_LIMITS.maxNotices).fill('a'))])); assert.equal(notices.preflight.edgeNotices, 4096); assert.equal(notices.preflight.anchorNotices, 4096);
  checked(tape(frames, [maintenance(), q('max-config')], { maxEntries: PATH_CACHE_LIMITS.maxEntries, maxBytes: PATH_CACHE_LIMITS.maxBytes, ttlTicks: PATH_CACHE_LIMITS.ttlTicks }));
  const safe = checked(tape(frames, [maintenance(), q('safe', Number.MAX_SAFE_INTEGER - cacheConfig.ttlTicks)])); assert.equal(safe.finalCache.lastTick, Number.MAX_SAFE_INTEGER - 5);
  for (const patch of [{ maxEntries: 0 }, { maxBytes: 0 }, { maxBytes: 1 }]) { const r = checked(tape(frames, [maintenance(), q('a'), q('b', 1)], patch)); assert.equal(r.finalCache.entries, 0); assert.equal(r.totals.sources.union, 2); }
});

test('every explicit zero/exact cap and equal-tick/UTF8 envelope remains executable; query IDs are not search salts or engine authority', () => {
  const f = fixture(), frames = [frame('old', f.view())];
  for (const [port, caps] of [['union', { ...PATH_UNION_LIMITS, ...PATH_ORACLE_LIMITS }], ['fallback', PATH_ORACLE_LIMITS]]) for (const [key, cap] of Object.entries(caps)) for (const value of [0, cap]) {
    const x = q('boundary'); x.input[port][key] = key === 'maxSubjectHops' || key === 'maxAnchorHops' ? Math.min(value, 3) : value;
    checked(tape(frames, [maintenance(), x]));
  }
  for (const op of ['build', 'refresh', 'repair']) for (const [key, cap] of Object.entries(op === 'repair' ? { maxTreeNodes: PATH_TREE_LIMITS.maxTreeNodes, ...PATH_TREE_REPAIR_LIMITS } : { maxExpansions: PATH_TREE_LIMITS.maxExpansions, maxTreeNodes: PATH_TREE_LIMITS.maxTreeNodes })) for (const value of [0, cap]) checked(tape(frames, [maintenance(), maintenance(op, 'old', { [key]: value }), q('after')]));
  const a = checked(tape(frames, [maintenance(), q('id-a'), q('same-tick'), inv([], ['é'.repeat(128)]), q('UTF8-boundary', 0, 'old', {}, {}, 'é'.repeat(32))]));
  const b = checked(tape(frames, [maintenance(), q('id-b')])); assert.equal(a.rows[1].result.pipelineDigest, b.rows[1].result.pipelineDigest); assert.equal(a.rows[2].result.source, 'cache'); assert.equal(a.rows[4].result.stages.advice.status, 'unavailable'); assert.equal(a.rows[4].result.status, 'infeasible');
  assert.throws(() => experimentConfig({ engine: 'supplied-frame-cache-forest/v1' }), /unsupported experiment engine/);
});

test('future/inert observations preserve earlier rows/full-provenance hashes; reports remain immutable without raw proof/state handles', () => {
  const f = fixture(), frames = [frame('old', f.view())], steps = [maintenance(), q('first'), inv(), q('warm', 1)], a = checked(tape(frames, steps));
  const b = checked(tape([...frames, frame('unused', f.view())], [...steps, inv(), maintenance('repair'), q('future', 2)])); assert.deepEqual(a.rows, b.rows.slice(0, a.rows.length));
  f.graph.toJSON(); f.view().toJSON(); const c = checked(tape(frames, steps)); assert.deepEqual(a, c);
  assert.throws(() => { a.rows[1].result.pipelineDigest = 'fake'; }); assert.throws(() => a.rows.push({})); assert.throws(() => { a.finalCache.lastTick = 99; });
  const direct = manual(tape(frames, steps)).originals[0].raw, payload = clone(direct); delete payload.provenance; assert.notEqual(a.rows[1].result.pipelineDigest, hash(payload)); assert.equal(a.rows[1].result.pipelineDigest, hash(direct));
});

test('public owner receipt corruption throws rather than dropping requested work or inventing rollback', () => {
  const f = fixture(), input = tape([frame('old', f.view())], [maintenance(), q('first'), inv([['a', 'u']])]), original = PathWitnessCache.prototype.invalidate;
  let actual;
  try { PathWitnessCache.prototype.invalidate = function (notices) { actual = original.call(this, notices); return { ...actual, evicted: 0 }; }; assert.throws(() => runPathWitnessLifecycle(input), /invalidation counter disagreement/); assert.equal(actual.evicted, 1); }
  finally { PathWitnessCache.prototype.invalidate = original; }
  assert.equal(checked(input).rows.length, 3);
});

test('r64/D64/Unicode-NUL and read-only Native captures retain bounded current proof semantics', () => {
  const anchors = Array.from({ length: 64 }, (_, i) => 'a' + i), f = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), { maxHops: 1, maxDifficulty: 64 }, anchors, 64);
  const large = checked(tape([frame('old', f.view())], [maintenance(), q('D64', 0, 'old', { maxSubjectHops: 1, maxAnchorHops: 1 })])); assert.equal(large.rows[1].result.required, 64);
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'é\0' + i), 'a'], long = fixture(path, path.slice(1).map((v, i) => [v, path[i]]), { maxHops: 64 }, ['a'], 1);
  const r = checked(tape([frame('old', long.view())], [maintenance(), q('r64', 0, 'old', { maxSubjectHops: 64, maxAnchorHops: 0 }), q('max-anchor-radius', 1, 'old', { maxSubjectHops: 64, maxAnchorHops: 64 })])); assert.equal(r.rows[1].result.status, 'found');
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const id of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(id, 'u'));
  const options = fixture().options, before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), nv = capturePathWitnessModelView(m, options);
  assert.equal(checked(tape([frame('old', nv)], [maintenance(), q('native')])).rows[1].result.status, 'found'); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
});

test('frozen pre-code G192-case/576-observation semantic payload stream is unchanged; full provenance separately current', () => {
  const b = precode.existingPipelineBaseline, nodes = b.nodes, arcs = nodes.flatMap(a => nodes.filter(c => c !== a).map(c => [a, c])), h = createHash('sha256'); let cases = 0;
  for (let mask = 0; mask < 64; mask++) for (const mode of ['directed', 'any', 'reciprocal']) {
    const f = fixture(nodes, arcs.filter((_, i) => mask & (1 << i)), { maxHops: 2, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' }, ['a', 'b'], 2, b.graphName), view = f.view(), forest = buildPathWitnessTrees(view, b.build), c = new PathWitnessCache(b.cacheConfig), rows = [];
    for (const tick of b.ticks) { const raw = queryPathWitness(c, forest, view, { ...base, policy: f.options.policy }, { tick, union: b.union, fallback: b.fallback }); assert.deepEqual(raw.provenance, provenance()); const payload = clone(raw); delete payload.provenance; rows.push(payload); }
    h.update(JSON.stringify(rows)).update('\0'); cases++;
  }
  assert.equal(cases, 192); assert.equal(h.digest('hex'), b.digest);
});
