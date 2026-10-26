import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { PathWitnessSegmentCache, PATH_SEGMENT_LIMITS } from '../src/path-witness-segments.mjs';
import { createPathWitnessPool } from '../src/path-witness-pool.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, repairPathWitnessTrees, proposePathWitnessFromSegments, PATH_TREE_LIMITS, PATH_TREE_REPAIR_LIMITS, PATH_SEGMENT_PROPOSAL_LIMITS } from '../src/path-witness-trees.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { runPathWitnessWorkload } from '../src/path-witness-workload.mjs';
import { runPathWitnessSegmentWorkload as run, PATH_SEGMENT_WORKLOAD_LIMITS } from '../src/path-witness-segment-workload.mjs';
import { provenance } from '../src/provenance.mjs';
import { experimentConfig } from '../src/experiment-config.mjs';
const pre = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/m3-segment-workload-contract-validation.json', import.meta.url))), baseline = pre.existingF1PayloadBaseline;
const deep = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/branch-tree-miss.json', import.meta.url))), base = baseline.baseContext;
const build = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 }, repair = { epoch: 3, maxTreeNodes: 1000, maxQueuePops: 10000, maxPredecessorTrials: 10000, maxScheduleTrials: 10000, maxLabelUpdates: 10000 };
const query = { ...baseline.query, tick: 0, maxSegmentLookups: 65536, maxSegmentChecks: 1024, maxSegmentResults: 256 }, segmentConfig = { ledgerId: 'segment-workload-unit', maxEntries: 8, maxBytes: 100000, ttlTicks: 10 };
const cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)), hash = v => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
function fixture(nodes = deep.nodes, edges = deep.edges, patch = {}, anchors = ['a', 'b'], difficulty = 2, name = 'segment-workload-unit') {
  const graph = new DirectedGraph(name); for (const id of nodes) graph.addNode(id); for (const [a, b] of edges) graph.addEdge(a, b);
  const policy = { ...base.policy, maxHops: 3, ...patch }, options = { policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty, anchors }], removed: [], standing: [] };
  const pool = createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 64, candidates: nodes.map(id => ({ id, score: 0 })) });
  return { graph, options, pool, view: () => pathWitnessGraphView(graph, options), frame(id = 'old', view = pathWitnessGraphView(graph, options)) { return { id, view, pools: nodes.map(subject => ({ subject, pool })) }; } };
}
const op = (name = 'build', frame = 'old', patch = {}) => ({ op: name, frame, query: { ...(name === 'repair' ? repair : build), ...patch } });
const q = (id, tick = 0, frame = 'old', patch = {}, mode = 'uniform', subject = 'u') => ({ op: 'query', id, frame, subject, query: { ...query, tick, ...patch }, routing: { seed: 'prefix-software-control', step: 0, mode } });
const put = (path = ['x', 'y', 'b'], tick = 0, frame = 'old', epoch = 3) => ({ op: 'put', frame, subject: path[0], input: { epoch, path, tick } });
const inv = (vertices = [], edges = [], frame = 'old') => ({ op: 'invalidate', frame, notices: { edges, vertices } });
const tape = (frames, steps, patch = {}) => ({ domain: base.domain, segments: { ...segmentConfig, ...patch }, frames, steps });
function descriptor(f) { if (!f) return null; const m = f.meta; return { viewRoot: m.originRoot, policyId: m.policyId, epoch: m.epoch, reference: m.reference, status: m.status, reason: m.reason, complete: m.complete, eligibleRoots: f.anchors().length, retainedRoots: f.toJSON().parents.length, treeNodes: m.stats.treeNodes }; }
function manual(input) {
  const cache = new PathWitnessSegmentCache(input.segments), frames = new Map(input.frames.map(f => [f.id, f])), loads = new Map(), rows = [], originals = []; let forest = null, origin = null;
  for (const [index, request] of input.steps.entries()) {
    const f = frames.get(request.frame), before = descriptor(forest), sb = cache.stats(), called = ['build', 'put', 'invalidate'].includes(request.op) || forest !== null;
    let result, work = null, loadDelta = [];
    if (request.op === 'put') {
      const r = cache.put(f.view, { domain: input.domain, subject: request.subject, policy: f.view.toJSON().options.policy }, request.input); result = { status: r.status, reason: r.reason, id: r.id, bytes: r.bytes }; work = { put: r.work };
    } else if (request.op === 'invalidate') { result = cache.invalidate(request.notices); work = { invalidation: result }; }
    else if (request.op === 'query') {
      if (!called) result = { status: 'unavailable', reason: 'forest-missing', feasible: null, required: null, coverage: null, proposalDigest: null, wireDigest: null, wireBytes: null, verification: null };
      else {
        let built = 0; const pools = [...f.pools].sort((a, b) => cmp(a.subject, b.subject)).map(r => ({ ...r, loads: request.routing.mode === 'uniform' ? null : r.pool.ranked.map(p => { built++; return { id: p.id, load: loads.get(p.id) ?? 0 }; }) }));
        const context = { domain: input.domain, subject: request.subject, policy: f.view.toJSON().options.policy }, raw = proposePathWitnessFromSegments(forest, f.view, context, request.query, { pools, routing: { ...request.routing, queryId: request.id } }, cache); originals.push({ raw, context, view: f.view });
        const offers = raw.prefix.routes.flatMap(r => r.selected); loadDelta = [...new Set(offers)].sort(cmp).map(id => { const selected = offers.filter(v => v === id).length, old = loads.get(id) ?? 0; loads.set(id, old + selected); return { id, before: old, selected, after: old + selected }; });
        result = { status: raw.status, reason: raw.reason, feasible: raw.feasible, required: raw.required, coverage: { prefix: raw.prefix.coverage, segments: raw.segments.coverage }, proposalDigest: hash(raw), wireDigest: raw.wire === null ? null : hash(raw.wire), wireBytes: raw.wire === null ? null : Buffer.byteLength(raw.wire), verification: raw.status === 'found' ? { primaryAccepted: true, ref2Accepted: true } : null };
        work = { proposal: raw.stats, prefix: raw.prefix.stats, segments: { stats: raw.segments.stats, work: raw.segments.work }, accounting: { loadRowsBuilt: built, routeRowsFolded: raw.prefix.routes.length, selectedPeersFolded: offers.length, proposalBytesHashed: Buffer.byteLength(JSON.stringify(raw)) } };
      }
    } else if (!called) result = { status: 'unavailable', reason: 'forest-missing', reset: null, deltaComplete: null, retiredRoots: null, rootActions: null };
    else if (request.op === 'build') {
      const r = buildPathWitnessTrees(f.view, request.query); result = { status: r.meta.status, reason: r.meta.reason, reset: null, deltaComplete: null, retiredRoots: null, rootActions: null }; work = { build: r.meta.stats }; forest = r.meta.status === 'unavailable' ? null : r; origin = forest ? f.view : null;
    } else {
      const r = (request.op === 'refresh' ? refreshPathWitnessTrees : repairPathWitnessTrees)(forest, origin, f.view, request.query), m = r.report;
      const actions = m.status === 'unavailable' ? null : Object.fromEntries([...new Set(m.roots.map(x => x.action))].map(k => [k, m.roots.filter(x => x.action === k).length]));
      result = { status: m.status, reason: m.reason, reset: m.reset, deltaComplete: m.deltaComplete, retiredRoots: m.status === 'unavailable' ? null : m.retired.length, rootActions: actions }; work = { forest: r.forest?.meta.stats ?? null, maintenance: m.work }; forest = r.forest; origin = forest ? f.view : null;
    }
    rows.push({ index, request, called, activeBefore: before, activeAfter: descriptor(forest), segmentsBefore: sb, segmentsAfter: cache.stats(), result, work, loadDelta });
  }
  return { rows, originals, loads, finalForest: descriptor(forest), finalSegments: cache.stats() };
}
function frozen(v) { if (v && typeof v === 'object') { assert.ok(Object.isFrozen(v)); for (const x of Object.values(v)) frozen(x); } }
// Factories create equivalent but independent captures, preserving aliases; never silently warm a shadow's view through the SUT.
function checked(make) {
  const input = make(), shadowInput = make(), bytes = JSON.stringify(input), r = run(input), shadow = manual(shadowInput);
  assert.equal(JSON.stringify(input), bytes); assert.deepEqual(r.rows, shadow.rows); assert.deepEqual(r.finalSegments, shadow.finalSegments); assert.deepEqual(r.finalForest, shadow.finalForest); assert.deepEqual(r.provenance, provenance());
  assert.equal(r.schema, 'facety-path-segment-workload/v1'); assert.equal(r.reference, 'bounded-prefix-segment-route-load/v1'); assert.equal(r.assumptions.length, 2); assert.ok(r.assumptions[1].includes('prior preparation history'));
  assert.deepEqual(r.totals.loads.rows, [...shadow.loads].sort(([a], [b]) => cmp(a, b)).map(([id, load]) => ({ id, load })));
  const values = [...shadow.loads.values()], total = values.reduce((n, v) => n + BigInt(v), 0n), squares = values.reduce((n, v) => n + BigInt(v) ** 2n, 0n);
  assert.equal(r.totals.loads.total, Number(total)); assert.equal(r.totals.loads.herfindahl, total ? Number(squares) / Number(total * total) : null);
  for (const name of Object.keys(r.totals.operations)) { const rows = r.rows.filter(x => x.request.op === name); assert.deepEqual(r.totals.operations[name], { requested: rows.length, called: rows.filter(x => x.called).length, skipped: rows.filter(x => !x.called).length }); }
  for (const status of Object.keys(r.totals.queries)) assert.equal(r.totals.queries[status], r.rows.filter(x => x.request.op === 'query' && x.result.status === status).length);
  for (const status of Object.keys(r.totals.puts)) assert.equal(r.totals.puts[status], r.rows.filter(x => x.request.op === 'put' && x.result.status === status).length);
  assert.deepEqual(r.totals.segmentCalls, { puts: r.rows.filter(x => x.request.op === 'put').length, invalidations: r.rows.filter(x => x.request.op === 'invalidate').length,
    lookups: shadow.originals.reduce((n, x) => n + x.raw.segments.stats.lookupCalls, 0), putSweepEntryUpperBound: r.rows.filter(x => x.request.op === 'put').reduce((n, x) => n + x.segmentsBefore.entries, 0), lookupSweepEntryUpperBound: shadow.originals.reduce((n, x) => n + x.raw.segments.stats.inventorySweepEntryUpperBound, 0) });
  for (const { raw, view, context } of shadow.originals) if (raw.status === 'found') { assert.equal(findPathWitness(view, context, { epoch: raw.query.epoch, maxExpansions: 10000, maxPaths: 128, maxPackingSteps: 10000 }).status, 'found'); for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(raw.wire), context, view).accepted, true); }
  for (const key of ['wire', 'hopReferences', 'prefixes', 'routes', 'joins', 'parents']) assert.equal(JSON.stringify(r).includes('"' + key + '":'), false, key);
  frozen(r); return { r, shadow, input };
}

test('complete future query/put tick accessors are rejected without invocation before any SUT cache work', () => {
  for (const name of ['query', 'put']) {
    const f = fixture(), future = name === 'query' ? q('future', 1) : put(undefined, 1), raw = name === 'query' ? future.query : future.input; let reads = 0;
    Object.defineProperty(raw, 'tick', { enumerable: true, get() { reads++; return 1; } });
    assert.throws(() => run(tape([f.frame()], [put(), op(), q('first'), future]))); assert.equal(reads, 0);
  }
});

test('manual fresh-capture tape matches every compact row/state/hash/load with explicit repair, no-active put, clearing and recovery', () => {
  const { r } = checked(() => {
    const f = fixture(), old = f.frame(); f.graph.addNode('unrelated'); const current = f.frame('new'); f.options.snapshots = []; const absent = f.frame('absent');
    return tape([old, current, absent], [put(), q('before', 0), op(), q('repair-detour', 1), q('lag1', 2, 'old', { maxBranches: 1 }, 'best-of-two'), q('lag2', 3, 'old', { maxBranches: 1 }, 'best-of-two'), q('new-root', 4, 'new'), op('refresh', 'new'), op('repair', 'absent'), q('skip', 5, 'old'), put(['u'], 6, 'new'), inv(['y'], [], 'new'), op('refresh', 'new'), op('build', 'new'), put(['x', 'y', 'b'], 7, 'new'), q('recovered', 8, 'new')]);
  });
  assert.equal(r.rows[0].result.status, 'stored'); assert.equal(r.rows[1].called, false); assert.equal(r.rows[3].result.status, 'found'); assert.equal(r.rows[6].activeAfter.viewRoot, r.frames[0].viewRoot); assert.equal(r.rows[7].activeAfter.viewRoot, r.frames[1].viewRoot);
  assert.equal(r.rows[8].activeAfter, null); assert.equal(r.rows[9].called, false); assert.equal(r.rows[9].segmentsAfter.lastTick, 4); assert.equal(r.rows[10].result.status, 'rejected'); assert.equal(r.rows[12].called, false); assert.equal(r.rows[15].result.status, 'found');
});

test('384 tiny graph/projection/mode tapes match independent state/load replay and raw physical first-query families', t => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => b !== a).map(b => [a, b])); let cases = 0, positives = 0;
  for (let mask = 0; mask < 64; mask++) for (const projection of ['directed', 'any', 'reciprocal']) for (const mode of ['uniform', 'best-of-two']) {
    const edges = arcs.filter((_, i) => mask & (1 << i));
    const { r } = checked(() => { const f = fixture(nodes, edges, { maxHops: 2, direction: projection === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: projection === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' }); return tape([f.frame()], [put(['u', 'a']), op(), q('first', 1, 'old', {}, mode), inv(['a']), op('repair'), q('second', 2, 'old', {}, mode), op('refresh'), q('third', 12, 'old', {}, mode)]); });
    const edge = (a, b) => edges.some(([x, y]) => x === a && y === b), adjacent = a => projection === 'directed' ? edge(a, 'u') : projection === 'reciprocal' ? edge(a, 'u') && edge('u', a) : edge(a, 'u') || edge('u', a);
    assert.equal(r.rows[2].result.feasible === true, adjacent('a') && adjacent('b')); positives += Number(r.rows[2].result.status === 'found'); cases++;
  }
  assert.equal(cases, 384); t.diagnostic('segment-workload-manual-controls ' + JSON.stringify({ cases, requestedQueryRows: 1152, firstQueryPositives: positives, observedMismatch: 0 }));
});

test('720 operation permutations preserve explicit calls/skips, cache and lagged-load effects without hidden lifecycle recovery', () => {
  function permutations(xs) { return xs.length ? xs.flatMap((x, i) => permutations(xs.filter((_, j) => i !== j)).map(rest => [x, ...rest])) : [[]]; }
  let cases = 0;
  for (const steps of permutations([put(), op(), op('refresh'), op('repair'), q('once'), inv(['y'])])) { checked(() => { const f = fixture(); return tape([f.frame()], steps); }); cases++; }
  assert.equal(cases, 720);
});

test('policy/epoch/grace maintenance resets preserve cache scopes and loads, while legacy build and unavailable queries keep original rules', () => {
  const { r } = checked(() => {
    const f = fixture(); f.options.snapshots.unshift({ epoch: 2, difficulty: 2, anchors: ['a', 'b'] }); const old = f.frame(); f.options.policy = { ...f.options.policy, maxHops: 4 }; const policy = f.frame('policy'); f.options.policy = old.view.toJSON().options.policy; f.options.currentEpoch = 6; const late = f.frame('late');
    return tape([old, policy, late], [put(), op(), q('old', 1), op('refresh', 'policy'), put(['x', 'y', 'b'], 2, 'policy'), q('policy', 3, 'policy'), op('refresh', 'old'), q('old-again', 4), put(['x', 'y', 'b'], 5, 'old', 2), op('refresh', 'old', { epoch: 2 }), q('e2', 6, 'old', { epoch: 2 }), op('refresh', 'late'), op('build', 'late'), q('late', 7, 'late')]);
  });
  assert.equal(r.rows[3].result.reset, 'policy-changed'); assert.equal(r.rows[3].segmentsAfter.entries, 1); assert.equal(r.rows[4].segmentsAfter.entries, 2); assert.equal(r.rows[8].segmentsAfter.entries, 3); assert.equal(r.rows[10].result.status, 'found'); assert.equal(r.rows[11].activeAfter, null); assert.equal(r.rows[12].result.status, 'built'); assert.equal(r.rows[13].result.status, 'unavailable'); assert.equal(r.finalSegments.entries, 3); assert.equal(r.finalSegments.lastTick, 6);
});

test('actual zero-lookup/unavailable query clocks versus unavailable/rejected puts and terminal safe sweep stay distinct', () => {
  const { r } = checked(() => { const f = fixture(), old = f.frame(); return tape([old], [put(), op(), q('zero', 50, 'old', { maxSegmentLookups: 0 }), q('epoch-mismatch', 50, 'old', { epoch: 2 }), put(['x', 'y', 'b'], 51, 'old', 2), put(['u'], 52), inv()]); });
  assert.equal(r.rows[2].called, true); assert.equal(r.rows[2].work.segments.stats.lookupCalls, 0); assert.equal(r.rows[2].segmentsAfter.lastTick, 0); assert.equal(r.rows[3].result.status, 'unavailable'); assert.equal(r.rows[3].segmentsAfter.lastTick, 0);
  assert.equal(r.rows[4].result.status, 'unavailable'); assert.equal(r.rows[4].segmentsAfter.lastTick, 51); assert.equal(r.rows[4].work.put.expired, 1); assert.equal(r.rows[5].segmentsAfter.lastTick, 52); assert.equal(r.rows[6].segmentsAfter.lastTick, 52);
  const { r: end } = checked(() => { const f = fixture(); return tape([f.frame()], [put(), op(), q('terminal', Number.MAX_SAFE_INTEGER)]); }); assert.equal(end.finalSegments.lastTick, Number.MAX_SAFE_INTEGER); assert.equal(end.rows[2].work.segments.work.expired, 1);
  for (const steps of [[q('skip', 50), put(undefined, 1)], [op(), q('no-lookup', 50, 'old', { maxSegmentLookups: 0 }), put(undefined, 1)], [put(undefined, Number.MAX_SAFE_INTEGER)]]) { const f = fixture(); assert.throws(() => run(tape([f.frame()], steps)), /clock\/expiry/); }
});

test('view identity groups and inherited preparation change actual work/full digests, not wire/frontier; explicit fresh views restore exact cold replay', () => {
  const make = () => { const f = fixture(), old = f.frame(), current = f.frame('current'); return tape([old, current, { ...current, id: 'alias' }], [put(), op('build', 'current'), q('same', 0, 'current')]); };
  const input = make(), cold = run(input), warm = run(input), restored = run(make()); assert.deepEqual(cold, restored); assert.deepEqual(cold.frames.map(f => f.preparationGroup), [0, 1, 1]); assert.equal(cold.preflight.viewObjects, 2);
  assert.ok(cold.rows[0].work.put.preparedNodes > 0); assert.ok(cold.rows[2].work.segments.work.preparedNodes > 0); assert.equal(warm.rows[0].work.put.preparedNodes, 0); assert.equal(warm.rows[2].work.segments.work.preparedNodes, 0);
  assert.notEqual(cold.rows[2].result.proposalDigest, warm.rows[2].result.proposalDigest); assert.equal(cold.rows[2].result.wireDigest, warm.rows[2].result.wireDigest); assert.deepEqual(cold.totals.loads, warm.totals.loads);
  input.frames[0].view.toJSON(); const again = run(input); assert.deepEqual(warm, again);
});

test('lagged best-of-two, nonpositive offers, shared batch returns/partial consumption and future-prefix route controls remain explicit', () => {
  const make = extra => { const f = fixture(); return tape([f.frame()], [op(), q('choice-1', 0, 'old', { maxBranches: 1 }, 'best-of-two'), q('choice-2', 0, 'old', { maxBranches: 1 }, 'best-of-two'), ...extra]); };
  const { r } = checked(() => make([])); assert.deepEqual(r.rows[1].loadDelta.map(x => x.id), ['a']); assert.deepEqual(r.rows[2].loadDelta.map(x => x.id), ['x']); assert.notEqual(r.rows[1].result.status, 'found');
  const future = run(make([put(), q('future', 1)])); assert.deepEqual(r.rows, future.rows.slice(0, 3));
  const { r: batch } = checked(() => { const f = fixture(); return tape([f.frame()], [put(['u', 'a']), put(['u', 'x', 'y', 'b']), op('build', 'old', { maxTreeNodes: 0 }), q('partial', 0, 'old', { maxPrefixHops: 0, maxCandidates: 1, maxTreeLookups: 0 })]); });
  assert.ok(batch.rows[3].work.segments.work.returned > batch.rows[3].work.segments.stats.consumedJoins); assert.equal(batch.rows[3].segmentsAfter.records.reduce((n, x) => n + x.uses, 0), batch.rows[3].work.segments.work.returned);
  const { shadow: solo } = checked(() => { const f = fixture(); return tape([f.frame()], [op(), q('stable')]); });
  const { shadow: preceded } = checked(() => { const f = fixture(); return tape([f.frame()], [op(), q('unrelated'), q('stable')]); }); assert.deepEqual(solo.originals[0].raw.prefix, preceded.originals[1].raw.prefix);
});

test('strict future-data/cap/policy/namespace/path/notices reject before cache calls and do not hide getter/map callbacks', () => {
  const valid = () => { const f = fixture(); return tape([f.frame()], [put(), op(), q('first'), q('future', 1)]); }, bad = []; let calls = 0;
  for (const [key, cap] of Object.entries({ epoch: Number.MAX_SAFE_INTEGER, maxPrefixHops: 3, maxPrefixes: PATH_TREE_LIMITS.maxPrefixes, maxExpansions: PATH_TREE_LIMITS.maxExpansions, maxBranches: PATH_TREE_LIMITS.maxBranches, maxTreeLookups: PATH_TREE_LIMITS.maxTreeLookups, maxCandidates: PATH_TREE_LIMITS.maxCandidates, maxPackingSteps: PATH_TREE_LIMITS.maxPackingSteps, ...PATH_SEGMENT_PROPOSAL_LIMITS })) for (const n of [-0, -1, cap + 1]) { const x = valid(); x.steps[3].query[key] = n; bad.push(x); }
  for (const change of [x => { x.segments.ttlTicks = 0; }, x => { x.steps[3].subject = 'x'.repeat(65); }, x => { x.frames[0].pools.push({ subject: 'x'.repeat(65), pool: x.frames[0].pools[0].pool }); }, x => { x.frames[0].pools[0].pool = {}; }, x => { x.steps[3].routing.extra = 1; }, x => { x.steps[3].id = 'first'; }, x => { x.steps[3].query.tick = -0; }, x => { x.steps.push(put([], 2)); }, x => { x.steps.push(put(['x', 'y', 'b', 'x', 'y'], 2)); }, x => { x.steps.push({ ...put(), subject: 'different' }); }, x => { x.steps.push(inv(['x'.repeat(257)])); }, x => { x.steps.push(inv([], [['a']])); }, x => { x.steps.push(inv(Array(4097).fill('a'))); }, x => { x.steps.push(inv([], Array.from({ length: 4097 }, () => ['a', 'u']))); }, x => { x.steps[3].frame = 'unknown'; }, x => { x.steps[3][Symbol('extra')] = 1; }, x => { x.steps.length++; }, x => { x.steps = new (class extends Array {})(...x.steps); }, x => { x.steps[3].query.maxCandidates = Infinity; }]) { const x = valid(); change(x); bad.push(x); }
  for (const name of ['build', 'refresh', 'repair']) for (const [key, cap] of Object.entries(name === 'repair' ? { maxTreeNodes: PATH_TREE_LIMITS.maxTreeNodes, ...PATH_TREE_REPAIR_LIMITS } : { maxExpansions: PATH_TREE_LIMITS.maxExpansions, maxTreeNodes: PATH_TREE_LIMITS.maxTreeNodes })) for (const value of [-0, cap + 1]) { const x = valid(); x.steps.push(op(name, 'old', { [key]: value })); bad.push(x); }
  const f = fixture(), old = f.frame(); f.options.policy = { ...f.options.policy, maxHops: 2 }; bad.push(tape([old, f.frame('policy')], [put(), op(), q('bad-policy', 0, 'policy')]));
  const namespace = valid(), other = fixture(undefined, undefined, {}, undefined, 2, 'foreign'); namespace.frames.push(other.frame('unused')); bad.push(namespace);
  const p = PathWitnessSegmentCache.prototype.put, l = PathWitnessSegmentCache.prototype.lookup, i = PathWitnessSegmentCache.prototype.invalidate;
  try {
    for (const [name, fn] of [['put', p], ['lookup', l], ['invalidate', i]]) PathWitnessSegmentCache.prototype[name] = function (...args) { calls++; return fn.apply(this, args); };
    for (const x of bad) assert.throws(() => run(x)); assert.equal(calls, 0);
  } finally { PathWitnessSegmentCache.prototype.put = p; PathWitnessSegmentCache.prototype.lookup = l; PathWitnessSegmentCache.prototype.invalidate = i; }
});

test('empty/disabled, zero/exact outer/pool/load/notice limits and nullable load concentration are software bounds only', () => {
  assert.deepEqual(PATH_SEGMENT_WORKLOAD_LIMITS, { maxFrames: 16, maxSteps: 128, maxPoolsPerFrame: 64, maxLoadIds: 4096 }); assert.ok(Object.isFrozen(PATH_SEGMENT_WORKLOAD_LIMITS)); const e = run(tape([], [])); assert.equal(e.namespace, null); assert.equal(e.totals.loads.herfindahl, null);
  const f = fixture(), frames = Array.from({ length: 16 }, (_, i) => f.frame('f' + i)), steps = Array.from({ length: 128 }, () => inv([], [], 'f0')); assert.equal(run(tape(frames, steps)).totals.segmentCalls.invalidations, 128);
  assert.throws(() => run(tape([...frames, f.frame('extra')], steps))); assert.throws(() => run(tape(frames, [...steps, inv([], [], 'f0')])));
  const wide = () => { const f = fixture(), v = f.view(), peers = Array.from({ length: 64 }, (_, i) => createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 64, candidates: Array.from({ length: 64 }, (_, j) => ({ id: 'p' + (i * 64 + j), score: 0 })) })); return tape([{ id: 'old', view: v, pools: peers.map((pool, i) => ({ subject: 's' + i, pool })) }], []); };
  assert.equal(run(wide()).preflight.distinctLoadIds, 4096); const overflow = wide(); overflow.frames.push({ id: 'more', view: overflow.frames[0].view, pools: [{ subject: 'more', pool: createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 1, candidates: [{ id: 'one-more', score: 0 }] }) }] }); assert.throws(() => run(overflow), /load-ID bound/);
  for (const [key, cap] of Object.entries({ maxPrefixHops: 3, maxPrefixes: PATH_TREE_LIMITS.maxPrefixes, maxExpansions: PATH_TREE_LIMITS.maxExpansions, maxBranches: PATH_TREE_LIMITS.maxBranches, maxTreeLookups: PATH_TREE_LIMITS.maxTreeLookups, maxCandidates: PATH_TREE_LIMITS.maxCandidates, maxPackingSteps: PATH_TREE_LIMITS.maxPackingSteps, ...PATH_SEGMENT_PROPOSAL_LIMITS })) for (const value of [0, cap]) checked(() => { const fresh = fixture(); return tape([fresh.frame()], [put(), op(), q('boundary', 0, 'old', { [key]: value })]); });
  for (const name of ['build', 'refresh', 'repair']) for (const [key, cap] of Object.entries(name === 'repair' ? { maxTreeNodes: PATH_TREE_LIMITS.maxTreeNodes, ...PATH_TREE_REPAIR_LIMITS } : { maxExpansions: PATH_TREE_LIMITS.maxExpansions, maxTreeNodes: PATH_TREE_LIMITS.maxTreeNodes })) for (const value of [0, cap]) checked(() => { const fresh = fixture(); return tape([fresh.frame()], [put(), op(), op(name, 'old', { [key]: value }), q('after')]); });
  const maxConfig = tape([], [], { maxEntries: PATH_SEGMENT_LIMITS.maxEntries, maxBytes: PATH_SEGMENT_LIMITS.maxBytes, ttlTicks: PATH_SEGMENT_LIMITS.ttlTicks }); assert.equal(run(maxConfig).finalSegments.entries, 0);
  const nullArray = tape([f.frame()], [put(), op(), q('null-prototype')]); Object.setPrototypeOf(nullArray.steps[0].input.path, null); Object.setPrototypeOf(nullArray.frames, null); Object.setPrototypeOf(nullArray.steps, null); assert.equal(run(nullArray).rows.length, 3);
  const exact = tape([f.frame()], [inv(Array(4096).fill('é'.repeat(128)), Array.from({ length: 4096 }, () => ['u', 'u']))]); assert.equal(run(exact).preflight.vertexNotices, 4096);
  for (const patch of [{ maxEntries: 0 }, { maxBytes: 0 }, { maxBytes: 1 }]) { const { r } = checked(() => { const f = fixture(); return tape([f.frame()], [put(), op(), q('none')], patch); }); assert.equal(r.totals.puts['not-stored'], 1); assert.equal(r.finalSegments.entries, 0); }
});

test('public put/invalidation/lookup faults propagate without favorable partial reports; inputs and outputs stay isolated/frozen', () => {
  const f = fixture(), make = () => tape([f.frame()], [put(), op(), q('go'), inv(['y'])]); const p = PathWitnessSegmentCache.prototype.put, i = PathWitnessSegmentCache.prototype.invalidate, l = PathWitnessSegmentCache.prototype.lookup;
  try { PathWitnessSegmentCache.prototype.put = function (...args) { return { ...p.apply(this, args), epoch: 99 }; }; assert.throws(() => run(make()), /put disagreement/); } finally { PathWitnessSegmentCache.prototype.put = p; }
  try { PathWitnessSegmentCache.prototype.invalidate = function (...args) { return { ...i.apply(this, args), evicted: 99 }; }; assert.throws(() => run(make()), /invalidation disagreement/); } finally { PathWitnessSegmentCache.prototype.invalidate = i; }
  const err = new Error('native provider fail'); try { PathWitnessSegmentCache.prototype.lookup = () => { throw err; }; assert.throws(() => run(make()), e => e === err); } finally { PathWitnessSegmentCache.prototype.lookup = l; }
  const { r, input } = checked(() => { const f = fixture(); return tape([f.frame()], [put(), op(), q('go')]); }); input.steps[0].input.path.push('later'); assert.equal(r.rows[0].request.input.path.length, 3); assert.throws(() => r.rows.push({})); assert.throws(() => { r.finalSegments.lastTick = 9; });
});

test('r64/D64/Unicode and read-only Native Model captures preserve current verification without funded/default integration', () => {
  const { r } = checked(() => { const anchors = Array.from({ length: 64 }, (_, i) => 'a' + i), f = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), { maxHops: 1, maxDifficulty: 64 }, anchors, 64); return tape([{ ...f.frame(), pools: [] }], [op(), q('D64', 0, 'old', { maxPrefixHops: 0 })]); }); assert.equal(r.rows[1].result.required, 64);
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'é\0' + i), 'a']; const { r: long } = checked(() => { const f = fixture(path, path.slice(1).map((v, i) => [v, path[i]]), { maxHops: 64 }, ['a'], 1); return tape([{ ...f.frame(), pools: [] }], [put(path), op(), q('r64', 0, 'old', { maxPrefixHops: 0 })]); }); assert.equal(long.rows[2].result.status, 'found');
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const id of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(id, 'u'));
  const options = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']]).options, before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]);
  const make = () => tape([{ id: 'old', view: capturePathWitnessModelView(m, options), pools: [] }], [put(['u', 'a']), op(), q('native', 0, 'old', { maxPrefixHops: 0 })]); assert.equal(checked(make).r.rows[2].result.status, 'found'); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
  assert.throws(() => experimentConfig({ engine: 'bounded-prefix-segment-route-load/v1' }), /unsupported experiment engine/);
});

test('384 frozen F1-only semantic payload cases preserve full declared projection and independently checked current provenance', () => {
  const b = baseline, h = createHash('sha256'); let cases = 0;
  for (let mask = 0; mask < 64; mask++) for (const projection of ['directed', 'any', 'reciprocal']) for (const mode of ['uniform', 'best-of-two']) {
    const f = fixture(b.nodes, b.arcs.filter((_, i) => mask & (1 << i)), { maxHops: 2, direction: projection === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: projection === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' }, ['a', 'b'], 2, b.graphName);
    const raw = runPathWitnessWorkload({ domain: base.domain, frames: [{ ...f.frame(), id: b.frameId }], steps: [{ op: 'build', frame: b.frameId, query: b.build }, ...b.queryIds.map(id => ({ op: 'query', id, frame: b.frameId, subject: 'u', query: b.query, routing: { ...b.routing, mode } }))] });
    assert.deepEqual(raw.provenance, provenance()); const payload = structuredClone(raw); delete payload.provenance; h.update(JSON.stringify(payload)).update('\0'); cases++;
  }
  assert.equal(cases, 384); assert.equal(h.digest('hex'), b.digest);
});
