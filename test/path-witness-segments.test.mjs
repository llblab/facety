import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { PathWitnessSegmentCache, PATH_SEGMENT_LIMITS } from '../src/path-witness-segments.mjs';
import { pathWitnessPolicyId, encodePathWitness, verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const config = { ledgerId: 'software-ledger', maxEntries: 8, maxBytes: 100000, ttlTicks: 10 };
function fixture(nodes = ['u', 'a', 'b'], edges = [['a', 'u']], patch = {}, anchors = ['a', 'b'], difficulty = 1) {
  const graph = new DirectedGraph('segment-control'); nodes.forEach(id => graph.addNode(id)); edges.forEach(([a, b]) => graph.addEdge(a, b));
  const context = structuredClone(base); Object.assign(context.policy, { maxHops: 3 }, patch);
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty, anchors }], removed: [], standing: [] };
  return { graph, context, options, view: () => pathWitnessGraphView(graph, options) };
}
function put(cache, view, context, path = ['u', 'a'], tick = 0, epoch = 3) { return cache.put(view, context, { epoch, path, tick }); }
function get(cache, view, context, patch = {}) { return cache.lookup(view, context, { epoch: 3, to: 'a', tick: 0, maxChecks: 8, maxResults: 8, ...patch }); }
function clean(cache) { const s = cache.stats(); assert.equal(s.entries, 0); assert.equal(s.bytes, 0); for (const key of ['endpointKeys', 'edgeKeys', 'vertexKeys']) assert.equal(s[key], 0); }
function noAuthority(result) { for (const key of ['accepted', 'feasible', 'witness', 'wire']) assert.equal(Object.hasOwn(result, key), false); }
function verdict(f, view, paths, expected) {
  const wire = encodePathWitness({ subject: 'u', epoch: 3, paths }, f.context);
  for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(wire, f.context, view).accepted, expected);
}
// Raw rows/score map reference: does not call production view edges/neighbors or segment predicates.
function rawSegment(nodes, rows, path, policy, scores) {
  if (path.length < 2 || new Set(path).size !== path.length || path.some(id => !nodes.includes(id))) return null;
  if (policy.minStanding !== null && path.slice(1, -1).some(id => (scores.get(id) ?? -1) < policy.minStanding)) return null;
  const result = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], selected = rows.filter(row => policy.direction === 'directed-from-anchor' ? row.from === b && row.to === a
      : (row.from === a && row.to === b) || (row.from === b && row.to === a));
    if (!selected.length || (policy.direction === 'undirected' && policy.undirectedProjection === 'reciprocal-only' && selected.length !== 2)) return null;
    result.push(selected.map(({ from, to, id }) => ({ from, to, id })).sort((x, y) => Buffer.compare(Buffer.from(JSON.stringify([x.from, x.to, x.id])), Buffer.from(JSON.stringify([y.from, y.to, y.id])))));
  }
  return result;
}

test('1536 raw graph/projection/score/path reference cases agree on local storage/reuse and literal identity payloads', t => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b])), paths = [['u', 'a'], ['u', 'b'], ['u', 'a', 'b'], ['u', 'b', 'a']];
  let cases = 0, stored = 0;
  for (let bits = 0; bits < 64; bits++) for (const mode of ['directed', 'any', 'reciprocal']) for (const scored of [false, true]) {
    const f = fixture(nodes, arcs.filter((_, i) => bits & (1 << i)), { direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected',
      undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation', minStanding: scored ? 1 : null });
    f.options.standing = [['a', 0], ['b', 1]]; const view = f.view(), rows = f.graph.toJSON().edges;
    for (const path of paths) {
      const cache = new PathWitnessSegmentCache(config), expected = rawSegment(nodes, rows, path, f.context.policy, new Map(f.options.standing));
      const r = put(cache, view, f.context, path); noAuthority(r); assert.equal(r.status, expected ? 'stored' : 'rejected'); cases++;
      if (!expected) { clean(cache); continue; }
      stored++; assert.deepEqual(r.segment.hopReferences, expected);
      const scope = ['software-ledger', f.context.domain, 'supplied-live-directed-graph/v1', 'segment-control', pathWitnessPolicyId(f.context.policy), 3];
      const payload = JSON.stringify(['facety-path-segment/v1', ...scope, path, expected]);
      assert.equal(r.id, createHash('sha256').update(payload).digest('hex')); assert.equal(r.bytes, Buffer.byteLength(payload));
      const hit = get(cache, view, f.context, { to: path.at(-1) }); assert.equal(hit.status, 'hit'); noAuthority(hit); noAuthority(hit.segments[0]);
      assert.deepEqual(hit.segments[0].path, path); assert.equal(hit.segments[0].uses, 1); assert.ok(hit.work.edgeChecks >= path.length - 1 && hit.work.edgeChecks <= 2 * (path.length - 1)); assert.equal(hit.work.preparedStorageEdges, 0);
      assert.ok(hit.work.idChecks <= 2 * (path.length - 1)); if (!scored) assert.equal(hit.work.scoreChecks, 0);
    }
  }
  assert.equal(cases, 1536); t.diagnostic('segment-raw-controls ' + JSON.stringify({ cases, stored, observedMismatch: 0 }));
});

test('unrelated root changes reuse original IDs; remove/re-add and new opposite orientation miss despite valid current vertex witnesses', () => {
  for (const direction of ['directed-from-anchor', 'undirected']) {
    const f = fixture(undefined, undefined, { direction }), old = f.view(), cache = new PathWitnessSegmentCache(config), first = put(cache, old, f.context);
    f.graph.addNode('unrelated'); let current = f.view(); const hit = get(cache, current, f.context, { tick: 1 });
    assert.equal(hit.status, 'hit'); assert.equal(hit.segments[0].originRoot, old.view().id); assert.equal(hit.segments[0].lastVerifiedRoot, current.view().id); assert.notEqual(current.view().id, old.view().id);
    f.graph.removeEdge('a', 'u'); f.graph.addEdge(direction === 'undirected' ? 'u' : 'a', direction === 'undirected' ? 'a' : 'u'); current = f.view();
    const miss = get(cache, current, f.context, { tick: 2 }); assert.equal(miss.status, 'miss'); assert.equal(miss.work.evicted, 1); clean(cache); verdict(f, current, [['u', 'a']], true);
    const fresh = put(cache, current, f.context, ['u', 'a'], 2); assert.notEqual(fresh.id, first.id); assert.equal(get(cache, current, f.context, { tick: 2 }).status, 'hit');
  }
  for (const projection of ['any-live-orientation', 'reciprocal-only']) {
    const f = fixture(undefined, [['a', 'u'], ['u', 'a']], { direction: 'undirected', undirectedProjection: projection }), cache = new PathWitnessSegmentCache(config);
    assert.equal(put(cache, f.view(), f.context).segment.hopReferences[0].length, 2); f.graph.removeEdge('a', 'u'); const view = f.view();
    assert.equal(get(cache, view, f.context).status, projection === 'any-live-orientation' ? 'hit' : 'miss'); verdict(f, view, [['u', 'a']], projection === 'any-live-orientation');
  }
});

test('local endpoint roles are not full witness authority; removed anchors may transit and full stitching still needs both verifiers/M2', () => {
  const f = fixture(undefined, [['a', 'u'], ['b', 'a']], { minStanding: 1 }); f.options.standing = [['a', 0], ['b', 0]];
  const cache = new PathWitnessSegmentCache(config), view = f.view(); assert.equal(put(cache, view, f.context).status, 'stored'); assert.equal(get(cache, view, f.context).status, 'hit');
  verdict(f, view, [['u', 'a']], true); verdict(f, view, [['u', 'a', 'b']], false);
  assert.equal(put(cache, view, f.context, ['u', 'a', 'b']).reason, 'intermediate-score');
  f.options.standing = [['a', 1], ['b', 0]]; f.options.removed = ['a']; const current = f.view();
  assert.equal(get(cache, current, f.context).status, 'hit'); verdict(f, current, [['u', 'a']], false); verdict(f, current, [['u', 'a', 'b']], true);
  assert.equal(put(cache, current, f.context, ['u', 'a', 'b']).status, 'stored');
  assert.equal(findPathWitness(current, f.context, { epoch: 3, maxExpansions: 100, maxPaths: 100, maxPackingSteps: 100 }).status, 'found');
  f.options.standing = [['a', 0], ['b', 0]]; const lost = get(cache, f.view(), f.context, { to: 'b' }); assert.equal(lost.status, 'miss'); assert.equal(lost.work.evicted, 1);
  const noAnchor = fixture(undefined, [['a', 'u']], {}, ['b']); const nc = new PathWitnessSegmentCache(config); assert.equal(put(nc, noAnchor.view(), noAnchor.context).status, 'stored'); verdict(noAnchor, noAnchor.view(), [['u', 'a']], false);
});

test('TTL exact boundary, explicit refresh/FIFO and usage remain separate from verification/root/time inspection', () => {
  const f = fixture(), view = f.view(), cache = new PathWitnessSegmentCache(config), stored = put(cache, view, f.context);
  const before = cache.stats(); assert.deepEqual(cache.stats(), before); assert.equal(before.records[0].uses, 0);
  const one = get(cache, view, f.context, { tick: 9 }), two = get(cache, view, f.context, { tick: 9 });
  assert.equal(one.segments[0].expiresAt, 10); assert.equal(two.segments[0].uses, 2); assert.equal(two.segments[0].verifiedAt, 9); assert.equal(two.segments[0].storedAt, 0);
  const refreshed = put(cache, view, f.context, ['u', 'a'], 9); assert.equal(refreshed.id, stored.id); assert.equal(refreshed.work.refreshed, 1); assert.equal(refreshed.segment.uses, 0); assert.equal(refreshed.segment.expiresAt, 19);
  const multi = fixture(['u', 'a', 'b', 'c'], [['a', 'u'], ['b', 'u'], ['c', 'u']]), mv = multi.view(), fifo = new PathWitnessSegmentCache({ ...config, maxEntries: 2 });
  const first = put(fifo, mv, multi.context), second = put(fifo, mv, multi.context, ['u', 'b']); put(fifo, mv, multi.context, ['u', 'a'], 1);
  const third = put(fifo, mv, multi.context, ['u', 'c'], 1); assert.deepEqual(fifo.stats().records.map(r => r.id), [first.id, third.id]); assert.ok(!fifo.stats().records.some(r => r.id === second.id));
  assert.equal(get(cache, view, f.context, { tick: 18 }).status, 'hit'); const expired = get(cache, view, f.context, { tick: 19 }); assert.equal(expired.status, 'miss'); assert.equal(expired.work.expired, 1); clean(cache);
});

test('bounded alternatives/check-result limits and all expiry/FIFO/byte/disabled-retention cleanup paths stay advisory', () => {
  const nodes = ['u', 'a', 'b', 'c'], edges = [['a', 'u'], ['b', 'a'], ['c', 'u'], ['b', 'c'], ['b', 'u'], ['c', 'a']];
  const f = fixture(nodes, edges), view = f.view(), paths = [['u', 'b'], ['u', 'a', 'b'], ['u', 'c', 'b'], ['u', 'a', 'c', 'b']], cache = new PathWitnessSegmentCache({ ...config, maxEntries: 3 });
  const ids = paths.slice(0, 3).map(path => put(cache, view, f.context, path).id);
  const partial = get(cache, view, f.context, { to: 'b', maxResults: 1 }); assert.equal(partial.status, 'partial'); assert.equal(partial.reason, 'result-limit'); assert.equal(partial.completeCacheScan, false);
  for (const patch of [{ maxChecks: 0 }, { maxResults: 0 }]) { const r = get(cache, view, f.context, { to: 'b', ...patch }); assert.equal(r.status, 'censored'); assert.equal(r.work.checked, 0); }
  assert.equal(get(cache, view, f.context, { to: 'b', maxChecks: 3, maxResults: 3 }).status, 'hit');
  const fourth = put(cache, view, f.context, paths[3], 1); assert.equal(fourth.work.evicted, 1); assert.deepEqual(cache.stats().records.map(r => r.id), [...ids.slice(1), fourth.id]);
  const at10 = get(cache, view, f.context, { to: 'b', tick: 10 }); assert.equal(at10.work.expired, 2); assert.equal(at10.segments.length, 1); get(cache, view, f.context, { to: 'b', tick: 11 }); clean(cache);
  const reincarnation = fixture(), rc = new PathWitnessSegmentCache(config); put(rc, reincarnation.view(), reincarnation.context);
  reincarnation.graph.removeEdge('a', 'u'); reincarnation.graph.addEdge('a', 'u'); const freshView = reincarnation.view(); put(rc, freshView, reincarnation.context, ['u', 'a'], 1);
  const limited = get(rc, freshView, reincarnation.context, { tick: 1, maxChecks: 1 }); assert.equal(limited.status, 'censored'); assert.equal(limited.work.evicted, 1);
  assert.equal(get(rc, freshView, reincarnation.context, { tick: 1, maxChecks: 1 }).status, 'hit');
  const sample = put(new PathWitnessSegmentCache(config), view, f.context), bytes = sample.bytes;
  const exact = new PathWitnessSegmentCache({ ...config, maxBytes: bytes }); assert.equal(put(exact, view, f.context).status, 'stored');
  assert.equal(put(exact, view, f.context, ['u', 'b']).work.evicted, 1); assert.equal(exact.stats().entries, 1);
  const tooSmall = new PathWitnessSegmentCache({ ...config, maxBytes: bytes - 1 }); assert.equal(put(tooSmall, view, f.context).reason, 'byte-limit'); clean(tooSmall);
  for (const patch of [{ maxEntries: 0 }, { maxBytes: 0 }]) { const off = new PathWitnessSegmentCache({ ...config, ...patch }); assert.equal(put(off, view, f.context).reason, 'capacity-disabled'); assert.equal(get(off, view, f.context).status, 'miss'); clean(off); }
});

test('conservative edge/vertex notices clean every reverse index without graph mutation or a canonical removal', () => {
  const f = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'a']]), view = f.view(), before = f.graph.toJSON();
  for (const notice of [{ edges: [['u', 'a']], vertices: [] }, { edges: [['a', 'u']], vertices: [] }, { edges: [], vertices: ['a'] }]) {
    const cache = new PathWitnessSegmentCache(config); put(cache, view, f.context); put(cache, view, f.context, ['u', 'a', 'b']);
    const tick = cache.stats().lastTick; assert.equal(cache.invalidate(notice).evicted, 2); clean(cache); assert.equal(cache.stats().lastTick, tick); assert.deepEqual(f.graph.toJSON(), before);
  }
  const cache = new PathWitnessSegmentCache(config); put(cache, view, f.context); const snap = cache.stats();
  assert.throws(() => cache.invalidate({ edges: [['u', 'a']], vertices: [null] })); assert.deepEqual(cache.stats(), snap);
  assert.equal(cache.invalidate({ edges: [], vertices: Array(4096).fill('a') }).evicted, 1); clean(cache);
});

test('domain/reference/graph/policy/epoch scopes and unavailable operations do not imply no path or stop valid expiry sweeps', () => {
  const f = fixture(), view = f.view(), cache = new PathWitnessSegmentCache(config); put(cache, view, f.context);
  assert.equal(get(cache, view, { ...f.context, domain: 'other-domain' }).status, 'miss');
  const g = new DirectedGraph('other-graph'); for (const id of ['u', 'a', 'b']) g.addNode(id); g.addEdge('a', 'u');
  const ov = pathWitnessGraphView(g, f.options); assert.equal(get(cache, ov, f.context).status, 'miss');
  const changed = structuredClone(f.context); changed.policy.maxSlack = 0;
  const policyView = pathWitnessGraphView(f.graph, { ...f.options, policy: changed.policy }); assert.equal(get(cache, policyView, changed).status, 'miss');
  const nextEpoch = pathWitnessGraphView(f.graph, { ...f.options, currentEpoch: 4, snapshots: [...f.options.snapshots, { epoch: 4, difficulty: 1, anchors: ['a', 'b'] }] });
  assert.equal(get(cache, nextEpoch, f.context).status, 'hit'); assert.equal(get(cache, nextEpoch, f.context, { epoch: 4 }).status, 'miss');
  const a = put(new PathWitnessSegmentCache({ ...config, ledgerId: 'other-ledger' }), view, f.context); assert.notEqual(a.id, cache.stats().records[0].id);
  const unavailable = cache.put(view, f.context, { epoch: 2, path: ['u', 'a'], tick: 10 }); assert.equal(unavailable.status, 'unavailable'); assert.equal(unavailable.work.expired, 1); clean(cache);
  const future = get(cache, view, f.context, { epoch: 4, tick: 10 }); assert.equal(future.status, 'unavailable'); assert.equal(future.completeCacheScan, null);
  assert.equal(cache.stats().lastTick, 10); assert.equal(future.work.preparedStorageEdges, 0);
});

test('strict plain data, Unicode/raw/config budgets and invalid clocks throw before cache mutation or accessor execution', () => {
  const f = fixture(), view = f.view(), cache = new PathWitnessSegmentCache(config); put(cache, view, f.context); const snap = cache.stats(); let calls = 0;
  for (const patch of [{ ttlTicks: 0 }, { maxEntries: 1025 }, { maxBytes: 1048577 }, { ledgerId: '' }, { extra: true }]) assert.throws(() => new PathWitnessSegmentCache({ ...config, ...patch }));
  const badPaths = [[], new Array(1), ['u', '\ud800'], ['a', 'u'], ['u', 'é'.repeat(33)], ['u', 'a', 'b', 'c', 'd']];
  for (const path of badPaths) { assert.throws(() => put(cache, view, f.context, path, 5)); assert.deepEqual(cache.stats(), snap); }
  const path = ['u']; Object.defineProperty(path, '1', { enumerable: true, get() { calls++; return 'a'; } }); assert.throws(() => put(cache, view, f.context, path));
  for (const n of [-0, -1, 0.5, NaN, Infinity, '1']) assert.throws(() => get(cache, view, f.context, { tick: n }));
  for (const patch of [{ maxChecks: 1025 }, { maxResults: 65 }, { to: '' }, { extra: true }]) assert.throws(() => get(cache, view, f.context, patch));
  assert.throws(() => cache.invalidate({ edges: Array(4097).fill(['a', 'u']), vertices: [] })); assert.throws(() => get(cache, { ...view }, f.context));
  const request = { epoch: 3, path: ['u', 'a'], tick: 1 }; Object.defineProperty(request, 'tick', { enumerable: true, get() { calls++; return 1; } }); assert.throws(() => cache.put(view, f.context, request));
  assert.equal(calls, 0); assert.deepEqual(cache.stats(), snap); assert.throws(() => { cache.config.ttlTicks = 1; });
  assert.throws(() => put(cache, view, f.context, ['u', 'a'], Number.MAX_SAFE_INTEGER)); assert.deepEqual(cache.stats(), snap);
  assert.equal(get(cache, view, f.context, { tick: Number.MAX_SAFE_INTEGER }).status, 'miss'); clean(cache); const final = cache.stats();
  assert.throws(() => get(cache, view, f.context, { tick: 1 })); assert.deepEqual(cache.stats(), final);
  const plain = new PathWitnessSegmentCache(config), np = Object.setPrototypeOf(['u', 'a'], null); assert.equal(put(plain, view, f.context, np).status, 'stored');
  assert.throws(() => put(plain, view, f.context, new (class extends Array {} )('u', 'a'))); assert.equal(put(plain, view, f.context, ['u']).reason, 'zero-hop');
  assert.equal(put(plain, view, f.context, ['u', 'a', 'u']).reason, 'non-simple'); assert.equal(put(plain, view, f.context, ['u', 'ghost']).reason, 'vertex-unavailable');
});

test('bounded identity metadata is not graph invalidity and segment payload bytes are not full-witness wire bytes', () => {
  const f = fixture(), original = f.graph.toJSON.bind(f.graph);
  f.graph.toJSON = () => { const data = structuredClone(original()); data.edges[0].id = 'edge:' + '1'.repeat(65); return data; };
  const view = f.view(), cache = new PathWitnessSegmentCache(config); assert.equal(put(cache, view, f.context).reason, 'identity-bound'); clean(cache); verdict(f, view, [['u', 'a']], true);
  const tiny = fixture(undefined, undefined, { maxWitnessBytes: 1 }), tv = tiny.view(), tc = new PathWitnessSegmentCache(config);
  assert.equal(put(tc, tv, tiny.context).status, 'stored'); assert.throws(() => encodePathWitness({ subject: 'u', epoch: 3, paths: [['u', 'a']] }, tiny.context), /byte bound/);
});

test('r64/Unicode data and Native captures remain immutable/read-only; returned snapshots and stats never renew TTL or self-authorize', () => {
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'é\0' + i), 'a'], f = fixture(path, path.slice(1).map((v, i) => [v, path[i]]), { maxHops: 64 }, ['a']), view = f.view(), cache = new PathWitnessSegmentCache(config);
  const stored = put(cache, view, f.context, path); assert.equal(stored.status, 'stored'); path[1] = 'changed';
  const hit = get(cache, view, f.context); assert.equal(hit.segments[0].path.length, 65); assert.notEqual(hit.segments[0].path[1], path[1]); noAuthority(hit);
  const stats = cache.stats(); JSON.stringify(stats); assert.deepEqual(cache.stats(), stats); assert.throws(() => hit.segments[0].path.pop());
  assert.throws(() => { hit.segments[0].hopReferences[0][0].id = 'forged'; }); assert.throws(() => { cache.stats().records[0].uses = 99; }); assert.ok(Object.isFrozen(PATH_SEGMENT_LIMITS));
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); m.confirmGuarantee('u', m.proposeGuarantee('a', 'u'));
  const nf = fixture(), nv = capturePathWitnessModelView(m, nf.options), before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), nc = new PathWitnessSegmentCache(config);
  assert.equal(put(nc, nv, nf.context).status, 'stored'); assert.equal(get(nc, nv, nf.context).status, 'hit');
  assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
});
