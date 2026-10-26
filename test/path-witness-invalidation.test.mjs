import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { PathWitnessCache, PATH_CACHE_LIMITS } from '../src/path-witness-cache.mjs';
import { PathWitnessSegmentCache, PATH_SEGMENT_LIMITS } from '../src/path-witness-segments.mjs';
import { encodePathWitness, verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import * as api from '../src/path-witness-invalidation.mjs';
import { provenance } from '../src/provenance.mjs';
import { experimentConfig } from '../src/experiment-config.mjs';
const { invalidatePathWitnessCaches: fanout } = api;
const contract = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/m3-invalidation-contract-validation.json', import.meta.url))), baseline = contract.existingNativeStreamBaseline;
const clone = x => structuredClone(x), hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const empty = () => ({ whole: { edges: [], anchors: [] }, segments: { edges: [], vertices: [] } });
const notices = (whole = {}, segments = {}) => ({ whole: { edges: [], anchors: [], ...whole }, segments: { edges: [], vertices: [], ...segments } });
function setup(projection = 'directed', name = baseline.graphName, wholePatch = {}, segmentPatch = {}) {
  const context = clone(baseline.baseContext); Object.assign(context.policy, baseline.policyPatch, { direction: projection === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: projection === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' });
  const graph = new DirectedGraph(name); for (const id of baseline.nodes) graph.addNode(id); for (const [a, b] of baseline.forwardEdges) graph.addEdge(a, b);
  if (projection !== 'directed') for (const [a, b] of baseline.forwardEdges) graph.addEdge(b, a);
  const options = { ...clone(baseline.options), policy: context.policy }, view = pathWitnessGraphView(graph, options), whole = new PathWitnessCache({ ...baseline.wholeConfig, ...wholePatch }), segments = new PathWitnessSegmentCache({ ...baseline.segmentConfig, ...segmentPatch }), wires = [], records = [];
  for (const epoch of baseline.wholeSeed.epochs) {
    const wire = encodePathWitness({ subject: 'u', epoch, paths: baseline.wholeSeed.paths }, context).toString('utf8');
    const r = whole.lookup(view, context, { epoch, ...baseline.wholeSeed.fallback }, { tick: baseline.wholeSeed.tick, hint: wire }); assert.equal(r.status, 'found'); wires.push(wire);
  }
  for (const path of baseline.segmentSeed.paths) { const r = segments.put(view, { ...context, subject: path[0] }, { epoch: baseline.segmentSeed.epoch, tick: baseline.segmentSeed.tick, path }); records.push({ id: r.id, path }); }
  return { context, graph, options, view, whole, segments, wires, records, current: () => pathWitnessGraphView(graph, options) };
}
// Separate public caller: original owners and input, no wrapper validation/guard/report helper imports.
function manual(s, input) {
  const wb = s.whole.stats(), sb = s.segments.stats(), wr = s.whole.invalidate(input.whole), wa = s.whole.stats(), sr = s.segments.invalidate(input.segments), sa = s.segments.stats();
  return { schema: 'facety-path-invalidation/v1', reference: 'explicit-dual-cache-notices/v1', provenance: provenance(), input, configs: { whole: s.whole.config, segments: s.segments.config },
    stages: { whole: { called: true, before: wb, receipt: wr, after: wa }, segments: { called: true, before: sb, receipt: sr, after: sa } },
    work: { whole: { calls: 1, edgeNotices: wr.edgeNotices, anchorNotices: wr.anchorNotices, evicted: wr.evicted }, segments: { calls: 1, edgeNotices: sr.edgeNotices, vertexNotices: sr.vertexNotices, evicted: sr.evicted } } };
}
function frozen(v) { if (v && typeof v === 'object') { assert.ok(Object.isFrozen(v)); for (const x of Object.values(v)) frozen(x); } }
function checked(s, input, shadow) {
  const before = hash(input), graph = hash(s.graph.toJSON()), r = fanout(s.whole, s.segments, input); assert.equal(hash(input), before); assert.equal(hash(s.graph.toJSON()), graph);
  if (shadow) assert.deepEqual(r, manual(shadow, clone(input))); assert.deepEqual(r.provenance, provenance());
  assert.deepEqual(Object.keys(r).sort(), ['schema', 'reference', 'provenance', 'input', 'configs', 'stages', 'work'].sort());
  for (const k of ['wire', 'paths', 'path', 'hopReferences', 'feasible', 'success', 'currentRoot', 'evictedTotal']) assert.equal(JSON.stringify(r).includes('"' + k + '":'), false, k);
  assert.equal(r.stages.whole.before.lastTick, r.stages.whole.after.lastTick); assert.equal(r.stages.segments.before.lastTick, r.stages.segments.after.lastTick); frozen(r); return r;
}
const matches = (a, b, c, d) => a === c && b === d || a === d && b === c;
function touches(path, edges, ids, terminal) { return ids.some(v => terminal ? path.at(-1) === v : path.includes(v)) || edges.some(([a, b]) => path.slice(1).some((v, i) => matches(a, b, path[i], v))); }

test('243 frozen native cases match complete manual report/raw eviction sets and exact native-only stream without stripping fields', t => {
  assert.deepEqual(Object.keys(api), ['invalidatePathWitnessCaches']); const stream = createHash('sha256'); let cases = 0, wholeEvictions = 0, segmentEvictions = 0;
  for (const projection of ['directed', 'any', 'reciprocal']) for (const w of baseline.wholeMenus) for (const g of baseline.segmentMenus) {
    const s = setup(projection), input = { whole: clone(w), segments: clone(g) }, r = checked(s, input, setup(projection));
    const expectedWhole = baseline.wholeSeed.paths.some(p => touches(p, w.edges, w.anchors, true)) ? 2 : 0, removed = s.records.filter(p => touches(p.path, g.edges, g.vertices, false));
    assert.equal(r.work.whole.evicted, expectedWhole); assert.equal(r.work.segments.evicted, removed.length);
    assert.deepEqual(r.stages.segments.after.records, r.stages.segments.before.records.filter(p => !removed.some(x => x.id === p.id)));
    const pick = stage => ({ before: stage.before, receipt: stage.receipt, after: stage.after });
    const row = { projection, wholeNotices: r.input.whole, segmentNotices: r.input.segments, whole: pick(r.stages.whole), segments: pick(r.stages.segments) };
    stream.update(JSON.stringify(row)).update('\0'); cases++; wholeEvictions += r.work.whole.evicted; segmentEvictions += r.work.segments.evicted;
  }
  assert.equal(cases, 243); assert.equal(stream.digest('hex'), baseline.digest); assert.equal(wholeEvictions, 270); assert.equal(segmentEvictions, 297);
  t.diagnostic('invalidation-native-controls ' + JSON.stringify({ cases, wholeEvictions, segmentEvictions, observedMismatch: 0 }));
});

test('terminal-only anchors, all-role vertices and explicit independent conservative edge notices never assert canonical facts', () => {
  const s = setup(), r = checked(s, notices({ anchors: ['x'] }, { vertices: ['x'] }), setup()); assert.equal(r.work.whole.evicted, 0); assert.equal(r.work.segments.evicted, 2);
  for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(s.wires[1]), s.context, s.view).accepted, true);
  const x = setup(), sb = x.segments.stats(), once = checked(x, notices({ edges: [['u', 'x']] })); assert.equal(once.work.whole.evicted, 2); assert.deepEqual(x.segments.stats(), sb);
  const second = checked(x, notices({}, { edges: [['u', 'x']] })); assert.equal(second.work.segments.evicted, 1); assert.equal(second.work.whole.evicted, 0); assert.equal(x.view.edge('x', 'u'), true); assert.equal(x.view.edge('u', 'x'), false);
  const unrelated = setup('directed', 'different-supplied-lineage', {}, { ledgerId: 'another-ledger' }), a = setup();
  assert.equal(fanout(a.whole, unrelated.segments, notices({ anchors: ['a'] }, { vertices: ['a'] })).stages.segments.receipt.evicted, 2);
});

test('empty/disabled stores and zero/duplicate/repeated notices keep actual call counts, independent clocks and no common expiry/use/FIFO update', () => {
  for (const patch of [{ maxEntries: 0 }, { maxBytes: 0 }, { maxBytes: 1 }]) {
    const s = setup('directed', baseline.graphName, patch, patch), r = checked(s, empty()); assert.equal(r.stages.whole.before.entries, 0); assert.equal(r.stages.segments.before.entries, 0); assert.equal(r.work.whole.calls, 1); assert.equal(r.work.segments.calls, 1);
  }
  const whole = new PathWitnessCache({ maxEntries: PATH_CACHE_LIMITS.maxEntries, maxBytes: PATH_CACHE_LIMITS.maxBytes, ttlTicks: PATH_CACHE_LIMITS.ttlTicks });
  const segments = new PathWitnessSegmentCache({ ledgerId: 'empty', maxEntries: PATH_SEGMENT_LIMITS.maxEntries, maxBytes: PATH_SEGMENT_LIMITS.maxBytes, ttlTicks: PATH_SEGMENT_LIMITS.ttlTicks });
  const e = fanout(whole, segments, empty()); assert.equal(e.stages.whole.after.lastTick, null); assert.equal(e.stages.segments.after.lastTick, null); assert.equal(e.stages.whole.after.invalidations, 1); assert.deepEqual(e.stages.segments.before, e.stages.segments.after);
  const s = setup(); s.segments.lookup(s.view, s.context, { epoch: 3, to: 'a', tick: 8, maxChecks: 8, maxResults: 8 }); const metadata = s.segments.stats();
  const r = checked(s, empty()); assert.equal(r.stages.whole.after.lastTick, 3); assert.equal(r.stages.segments.after.lastTick, 8); assert.deepEqual(s.segments.stats(), metadata);
  const dup = checked(s, notices({ edges: [['x', 'u'], ['x', 'u']], anchors: ['a', 'a'] })), again = checked(s, notices({ anchors: ['a'] }));
  assert.deepEqual(dup.work.whole, { calls: 1, edgeNotices: 2, anchorNotices: 2, evicted: 2 }); assert.equal(again.work.whole.evicted, 0); assert.equal(again.stages.whole.after.invalidations, r.stages.whole.before.invalidations + 3);
  const late = setup(); late.segments.lookup(late.view, late.context, { epoch: 3, to: 'a', tick: 100, maxChecks: 0, maxResults: 0 });
  const lr = checked(late, empty()); assert.equal(lr.stages.segments.after.entries, 0); assert.equal(lr.stages.segments.after.lastTick, 100); assert.equal(lr.stages.whole.after.entries, 2); assert.equal(lr.stages.whole.after.lastTick, 3);
  const fifo = setup('directed', baseline.graphName, {}, { maxEntries: 2 }); const fr = checked(fifo, empty()); assert.deepEqual(fr.stages.segments.before.records, fr.stages.segments.after.records);
});

test('1024-entry native inventories preserve full metadata then explicit notices evict all matching retained scopes without unique-person aggregation', () => {
  const s = setup(), whole = new PathWitnessCache({ ...baseline.wholeConfig, maxEntries: 1024, maxBytes: PATH_CACHE_LIMITS.maxBytes }), segments = new PathWitnessSegmentCache({ ...baseline.segmentConfig, maxEntries: 1024, maxBytes: PATH_SEGMENT_LIMITS.maxBytes });
  for (let i = 0; i < 1024; i++) {
    const context = { ...s.context, domain: 'fanout-max-domain-' + i }, wire = encodePathWitness({ subject: 'u', epoch: 3, paths: baseline.wholeSeed.paths }, context).toString('utf8');
    assert.equal(whole.lookup(s.view, context, { epoch: 3, ...baseline.wholeSeed.fallback }, { tick: 3, hint: wire }).status, 'found');
    assert.equal(segments.put(s.view, context, { epoch: 3, tick: 7, path: ['u', 'x', 'a'] }).status, 'stored');
  }
  assert.equal(whole.stats().entries, 1024); assert.equal(segments.stats().entries, 1024);
  const before = fanout(whole, segments, empty()); assert.deepEqual(before.stages.segments.before, before.stages.segments.after);
  const r = fanout(whole, segments, notices({ anchors: ['a'] }, { vertices: ['x'] })); frozen(r);
  assert.equal(r.work.whole.evicted, 1024); assert.equal(r.work.segments.evicted, 1024);
  for (const stage of Object.values(r.stages)) { assert.equal(stage.after.entries, 0); assert.equal(stage.after.bytes, 0); }
  assert.equal(r.stages.whole.after.edgeKeys, 0); assert.equal(r.stages.whole.after.anchorKeys, 0); assert.equal(r.stages.segments.after.vertexKeys, 0); assert.equal(r.stages.segments.after.endpointKeys, 0);
});

test('strict complete second-envelope preflight rejects raw data/cap/prototype/getter faults before either owner, with original state and callbacks inert', () => {
  const s = setup(), before = [s.whole.stats(), s.segments.stats()], bad = []; let getters = 0, callbacks = 0;
  const valid = () => notices({ anchors: ['a'] }, { vertices: ['x'] });
  for (const change of [x => { delete x.segments; }, x => { x.extra = 1; }, x => { x.segments.anchors = []; }, x => { delete x.whole.anchors; }, x => { x.segments.vertices = null; }, x => { x.segments.vertices = Array(1); }, x => { x.segments.edges = [['a']]; }, x => { x.segments.edges = [['a', 'u', 'b']]; }, x => { x.segments.edges = [['a', 0]]; }, x => { x.segments.vertices = ['']; }, x => { x.segments.vertices = ['\ud800']; }, x => { x.segments.vertices = ['é'.repeat(129)]; }, x => { x.segments.vertices = ['x'.repeat(257)]; }, x => { x.segments[Symbol('x')] = 1; }, x => { x.segments.vertices.extra = 1; }, x => { Object.defineProperty(x.segments, 'vertices', { get() { getters++; return []; }, enumerable: true }); }, x => { Object.defineProperty(x.segments.vertices, 0, { get() { getters++; return 'a'; }, enumerable: true }); }, x => { x.segments.edges = [new (class extends Array { map() { callbacks++; throw Error('map'); } })('a', 'u')]; }, x => { x.segments.vertices = new (class extends Array { [Symbol.iterator]() { callbacks++; throw Error('iterator'); } })('a'); }, x => { x.segments.vertices.map = () => { callbacks++; }; }, x => { x.segments.vertices = Array(4097).fill('a'); }, x => { x.segments.edges = Array.from({ length: 4097 }, () => ['a', 'u']); }, x => { x.whole.anchors = Array(4097).fill('a'); }, x => { x.whole.edges = Array.from({ length: 4097 }, () => ['a', 'u']); }]) { const x = valid(); change(x); bad.push(x); }
  let calls = 0; const w = PathWitnessCache.prototype.invalidate, g = PathWitnessSegmentCache.prototype.invalidate;
  try {
    PathWitnessCache.prototype.invalidate = function (n) { calls++; return w.call(this, n); }; PathWitnessSegmentCache.prototype.invalidate = function (n) { calls++; return g.call(this, n); };
    for (const x of bad) assert.throws(() => fanout(s.whole, s.segments, x)); assert.equal(calls, 0); assert.equal(getters, 0); assert.equal(callbacks, 0);
  } finally { PathWitnessCache.prototype.invalidate = w; PathWitnessSegmentCache.prototype.invalidate = g; }
  assert.deepEqual([s.whole.stats(), s.segments.stats()], before);
  const n = valid(); Object.setPrototypeOf(n, null); Object.setPrototypeOf(n.whole, null); Object.setPrototypeOf(n.segments, null);
  for (const a of [n.whole.edges, n.whole.anchors, n.segments.edges, n.segments.vertices]) Object.setPrototypeOf(a, null);
  const r = fanout(s.whole, s.segments, n); assert.equal(r.work.whole.evicted, 2); assert.equal(r.work.segments.evicted, 2); assert.equal(Object.getPrototypeOf(r.input.whole.anchors), Array.prototype);
});

test('exact immediate classes and native private brands reject fake/copied/subclass/proxy/callback owners before either mutation', () => {
  const s = setup(), before = [s.whole.stats(), s.segments.stats()];
  class WholeChild extends PathWitnessCache {} class SegmentChild extends PathWitnessSegmentCache {}
  const wc = new WholeChild(baseline.wholeConfig), sc = new SegmentChild(baseline.segmentConfig); assert.equal(PathWitnessCache.prototype.stats.call(wc).entries, 0); assert.equal(PathWitnessSegmentCache.prototype.stats.call(sc).entries, 0);
  for (const owner of [null, {}, Object.create(PathWitnessCache.prototype), { ...s.whole }, wc, new Proxy(s.whole, {}), () => s.whole]) assert.throws(() => fanout(owner, s.segments, empty()));
  for (const owner of [null, {}, Object.create(PathWitnessSegmentCache.prototype), { ...s.segments }, sc, new Proxy(s.segments, {}), () => s.segments]) assert.throws(() => fanout(s.whole, owner, empty()));
  assert.deepEqual([s.whole.stats(), s.segments.stats()], before);
});

test('global UTF8/NUL/256-byte ID and4096 notice bounds preserve raw order/duplicates/self pairs without current-policy mapping', () => {
  const s = setup(), ids = ['é'.repeat(128), 'x'.repeat(256), '\0'], input = notices({ edges: [['u', 'u'], ['u', 'x']], anchors: ids }, { edges: [['u', 'u']], vertices: ids });
  const r = checked(s, input, setup()); assert.deepEqual(r.input, input); assert.equal(r.work.whole.edgeNotices, 2); assert.equal(r.work.whole.anchorNotices, 3);
  const full = notices({ edges: Array.from({ length: 4096 }, () => ['u', 'u']), anchors: Array(4096).fill('unknown') }, { edges: Array.from({ length: 4096 }, () => ['x', 'x']), vertices: Array(4096).fill('unknown') });
  const big = checked(setup(), full, setup()); assert.equal(big.work.whole.edgeNotices, 4096); assert.equal(big.work.segments.vertexNotices, 4096); assert.equal(big.work.whole.evicted, 0); assert.equal(big.work.segments.evicted, 0);
});

test('first receipt/counter/clock disagreements throw before segment call; actual first eviction is not rolled back', () => {
  const nativeW = PathWitnessCache.prototype.invalidate, nativeS = PathWitnessSegmentCache.prototype.invalidate, stats = PathWitnessCache.prototype.stats;
  for (const fault of ['receipt', 'counter', 'clock']) {
    const s = setup(); let second = 0, after = false;
    try {
      PathWitnessCache.prototype.invalidate = function (n) { const r = nativeW.call(this, n); after = true; return fault === 'receipt' ? { ...r, evicted: 0 } : r; };
      PathWitnessSegmentCache.prototype.invalidate = function (n) { second++; return nativeS.call(this, n); };
      PathWitnessCache.prototype.stats = function () { const r = stats.call(this); return after && fault !== 'receipt' ? { ...r, [fault === 'counter' ? 'invalidated' : 'lastTick']: r[fault === 'counter' ? 'invalidated' : 'lastTick'] + 1 } : r; };
      assert.throws(() => fanout(s.whole, s.segments, notices({ anchors: ['a'] })), /disagreement/); assert.equal(second, 0); assert.equal(stats.call(s.whole).entries, 0); assert.equal(s.segments.stats().entries, 3);
    } finally { PathWitnessCache.prototype.invalidate = nativeW; PathWitnessSegmentCache.prototype.invalidate = nativeS; PathWitnessCache.prototype.stats = stats; }
  }
});

test('second-stage error and retained record reorder/metadata/byte faults propagate after real whole effects, no favorable partial report/retry', () => {
  const invalidate = PathWitnessSegmentCache.prototype.invalidate, stats = PathWitnessSegmentCache.prototype.stats;
  const s = setup(), error = new Error('deliberate second-stage host failure'); let calls = 0;
  try {
    PathWitnessSegmentCache.prototype.invalidate = function (n) { calls++; invalidate.call(this, n); throw error; };
    assert.throws(() => fanout(s.whole, s.segments, notices({ anchors: ['a'] }, { vertices: ['x'] })), e => e === error); assert.equal(calls, 1); assert.equal(s.whole.stats().entries, 0); assert.equal(stats.call(s.segments).entries, 1);
  } finally { PathWitnessSegmentCache.prototype.invalidate = invalidate; }
  for (const fault of ['reorder', 'metadata', 'bytes']) {
    const x = setup(); let reads = 0;
    try {
      PathWitnessSegmentCache.prototype.stats = function () {
        const r = stats.call(this); if (++reads === 1) return r;
        if (fault === 'reorder') return { ...r, records: [...r.records].reverse() };
        const rows = r.records.map((v, i) => i ? v : { ...v, ...(fault === 'metadata' ? { lastVerifiedRoot: 'forged' } : { bytes: v.bytes + 1 }) });
        return { ...r, records: rows, bytes: r.bytes + Number(fault === 'bytes') };
      };
      assert.throws(() => fanout(x.whole, x.segments, notices({ anchors: ['a'] })), /disagreement/); assert.equal(x.whole.stats().entries, 0); assert.equal(stats.call(x.segments).entries, 3);
    } finally { PathWitnessSegmentCache.prototype.stats = stats; }
  }
});

test('native before schema/config/record/counter corruption rejects before eviction; no private counters/indexes are injected', () => {
  const w = PathWitnessCache.prototype.stats, g = PathWitnessSegmentCache.prototype.stats, s = setup(), original = [w.call(s.whole), g.call(s.segments)];
  for (const which of ['whole', 'segment-schema', 'segment-records', 'segment-config']) {
    try {
      if (which === 'whole') PathWitnessCache.prototype.stats = function () { return { ...w.call(this), queries: -0 }; };
      else PathWitnessSegmentCache.prototype.stats = function () { const r = g.call(this); return which === 'segment-schema' ? { ...r, schema: 'fake' } : which === 'segment-config' ? { ...r, config: { ...r.config, ledgerId: 'fake' } } : { ...r, records: [] }; };
      assert.throws(() => fanout(s.whole, s.segments, notices({ anchors: ['a'] }, { vertices: ['x'] })));
    } finally { PathWitnessCache.prototype.stats = w; PathWitnessSegmentCache.prototype.stats = g; }
    assert.deepEqual([s.whole.stats(), s.segments.stats()], original);
  }
});

test('no hidden lookup/probe/put, report input isolation/deep freezing and Native read-only facts preserve independent validity/identity rules', () => {
  const s = setup(), input = empty(), methods = [[PathWitnessCache.prototype, 'lookup'], [PathWitnessCache.prototype, 'probe'], [PathWitnessSegmentCache.prototype, 'lookup'], [PathWitnessSegmentCache.prototype, 'put']].map(([p, k]) => [p, k, p[k]]); let r;
  try { for (const [p, k] of methods) p[k] = () => { throw Error('unexpected hidden ' + k); }; r = checked(s, input); } finally { for (const [p, k, fn] of methods) p[k] = fn; }
  input.whole.anchors.push('later'); assert.deepEqual(r.input, empty()); assert.notEqual(r.input.whole, input.whole); assert.notEqual(r.input.whole.anchors, input.whole.anchors); assert.throws(() => r.input.segments.vertices.push('fake')); assert.throws(() => { r.stages.whole.after.lastTick = 0; });
  s.graph.removeEdge('a', 'x'); s.graph.addEdge('a', 'x'); const current = s.current(); checked(s, empty());
  assert.equal(s.whole.lookup(current, s.context, { epoch: 3, maxExpansions: 1000, maxPaths: 128, maxPackingSteps: 1000 }, { tick: 4, hint: null }).source, 'cache');
  assert.equal(s.segments.lookup(current, s.context, { epoch: 3, to: 'a', tick: 8, maxChecks: 8, maxResults: 8 }).status, 'miss');
  const cut = setup(); cut.graph.removeEdge('x', 'u'); const invalid = cut.current(); assert.equal(checked(cut, empty()).stages.whole.after.entries, 2);
  for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(cut.wires[1]), cut.context, invalid).accepted, false);
  assert.equal(cut.whole.lookup(invalid, cut.context, { epoch: 3, maxExpansions: 1000, maxPaths: 128, maxPackingSteps: 1000 }, { tick: 4, hint: null }).status, 'infeasible');
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const id of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(id, 'u'));
  const context = clone(baseline.baseContext), view = capturePathWitnessModelView(m, { ...clone(baseline.options), policy: context.policy }), whole = new PathWitnessCache(baseline.wholeConfig), segments = new PathWitnessSegmentCache(baseline.segmentConfig);
  const wire = encodePathWitness({ subject: 'u', epoch: 3, paths: [['u', 'a'], ['u', 'b']] }, context).toString('utf8'); whole.lookup(view, context, { epoch: 3, ...baseline.wholeSeed.fallback }, { tick: 3, hint: wire }); segments.put(view, context, { epoch: 3, tick: 7, path: ['u', 'a'] });
  const before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]); assert.equal(fanout(whole, segments, notices({ anchors: ['a'] }, { vertices: ['a'] })).work.whole.evicted, 1); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
  assert.throws(() => experimentConfig({ engine: 'explicit-dual-cache-notices/v1' }), /unsupported experiment engine/);
});
