import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { pathWitnessContext, verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { PathWitnessCache, PATH_CACHE_LIMITS } from '../src/path-witness-cache.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const full = { epoch: 3, maxExpansions: 1000, maxPaths: 128, maxPackingSteps: 1000 };
const zero = { epoch: 3, maxExpansions: 0, maxPaths: 0, maxPackingSteps: 0 };
const makeCache = (patch = {}) => new PathWitnessCache({ maxEntries: 4, maxBytes: 10000, ttlTicks: 5, ...patch });
function fixture(nodes = ['u', 'a', 'b'], edges = [['a', 'u'], ['b', 'u']], patch = {}, anchors = ['a', 'b']) {
  const graph = new DirectedGraph('cache-fixture'); for (const node of nodes) graph.addNode(node); for (const [a, b] of edges) graph.addEdge(a, b);
  const context = structuredClone(base); Object.assign(context.policy, patch);
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty: 2, anchors }], removed: [], standing: [] };
  return { graph, context, options, view: () => pathWitnessGraphView(graph, options) };
}
function checked(outcome, view, context) {
  assert.equal(outcome.viewRoot, view.view().id); assert.ok(Object.isFrozen(outcome) && Object.isFrozen(outcome.work) && Object.isFrozen(outcome.cache));
  if (outcome.status === 'found') for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(outcome.wire), context, view).accepted, true);
  else { assert.equal(outcome.wire, null); assert.equal(outcome.feasible, outcome.status === 'infeasible' ? false : null); }
  return outcome;
}

test('canonical expected context is immutable; cache hits always reverify, inspect is inert and TTL never renews on reads', () => {
  const f = fixture(), view = f.view(), cache = makeCache({ ttlTicks: 3 }), context = pathWitnessContext(f.context);
  assert.ok(Object.isFrozen(context) && Object.isFrozen(context.policy));
  const first = checked(cache.lookup(view, context, full, { tick: 0, hint: null }), view, context);
  assert.equal(first.source, 'oracle'); assert.equal(first.cache.expiresAt, 3); assert.equal(first.work.oracleCalls, 1);
  const before = cache.stats(); cache.stats(); cache.stats(); assert.deepEqual(cache.stats(), before);
  const hit = checked(cache.lookup(view, context, zero, { tick: 2, hint: null }), view, context);
  assert.equal(hit.source, 'cache'); assert.equal(hit.work.primaryChecks, 1); assert.equal(hit.work.ref2Checks, 1); assert.equal(hit.work.oracleCalls, 0);
  assert.equal(hit.cache.expiresAt, 3); assert.equal(hit.cache.insertedAt, 0);
  const expired = checked(cache.lookup(view, context, zero, { tick: 3, hint: null }), view, context);
  assert.equal(expired.status, 'censored'); assert.equal(expired.source, 'oracle'); assert.equal(expired.work.expired, 1); assert.equal(cache.stats().entries, 0);
});

test('malicious/wrong-context/noncanonical/oversized hints never bypass both verifiers or turn a limited fallback into a false positive/negative', () => {
  const f = fixture(), view = f.view(), wire = findPathWitness(view, f.context, full).wire;
  const hints = [' ' + wire, wire.replace('"subject":"u"', '"subject":"wrong"'), wire.replace('"epoch":3', '"epoch":4'),
    wire.replace('"epoch":3', '"epoch":3,"epoch":3'), wire.replace('facety:software-fixture', 'wrong-deployment'),
    wire.replace('"u"', '"\ud800"'), 'x'.repeat(base.policy.maxWitnessBytes + 1), 42,
    { toString() { throw Error('must not coerce untrusted hint'); } }];
  for (const hint of hints) {
    const cache = makeCache(), outcome = checked(cache.lookup(view, f.context, zero, { tick: 0, hint }), view, f.context);
    assert.equal(outcome.status, 'censored'); assert.equal(outcome.work.oracleCalls, 1); assert.equal(cache.stats().hintRejects, 1); assert.equal(cache.stats().entries, 0);
  }
  const cache = makeCache(), offered = checked(cache.lookup(view, f.context, zero, { tick: 0, hint: wire }), view, f.context);
  assert.equal(offered.source, 'hint'); assert.equal(offered.status, 'found'); assert.equal(offered.work.oracleCalls, 0); assert.equal(offered.work.primaryChecks, 1); assert.equal(offered.work.ref2Checks, 1);
  const other = { ...f.context, domain: 'other-domain' };
  assert.equal(cache.lookup(view, other, zero, { tick: 1, hint: wire }).status, 'censored');
});

test('valid in-grace packets bind to the requested epoch, not merely their own snapshot; mismatches fallback without cross-key retention', () => {
  let scopeCases = 0;
  for (const mode of ['directed', 'any', 'reciprocal']) {
    const patch = { direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' };
    const edges = [['a', 'u'], ['b', 'u'], ...(mode === 'reciprocal' ? [['u', 'a'], ['u', 'b']] : [])], f = fixture(['u', 'a', 'b'], edges, patch);
    f.options.snapshots = [{ epoch: 2, difficulty: 1, anchors: ['a'] }, { epoch: 3, difficulty: 2, anchors: ['a', 'b'] }];
    const view = f.view(), wires = new Map([2, 3].map(epoch => [epoch, findPathWitness(view, f.context, { ...full, epoch }).wire]));
    for (const wire of wires.values()) for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(wire), f.context, view).accepted, true);
    for (const epoch of [2, 3]) for (const enabled of [false, true]) for (const budget of [zero, full]) {
      const cache = makeCache(enabled ? {} : { maxEntries: 0 }), query = { ...budget, epoch }, hint = wires.get(epoch === 2 ? 3 : 2);
      const r = checked(cache.lookup(view, f.context, query, { tick: 0, hint }), view, f.context), expected = findPathWitness(view, f.context, query);
      assert.equal(r.source, 'oracle'); assert.equal(r.status, expected.status); assert.equal(r.feasible, expected.feasible); assert.equal(r.required, expected.required);
      assert.equal(r.wire, expected.wire); assert.equal(r.work.hintChecks, 1); assert.equal(r.work.oracleCalls, 1); assert.equal(cache.stats().hintRejects, 1);
      if (r.status === 'found') { assert.equal(r.witness.epoch, epoch); assert.equal(r.work.primaryChecks, 2); assert.equal(r.work.ref2Checks, 2); }
      assert.equal(cache.stats().entries, Number(enabled && r.status === 'found')); scopeCases++;
    }
    const cache = makeCache(), old = checked(cache.lookup(view, f.context, { ...full, epoch: 2 }, { tick: 0, hint: wires.get(2) }), view, f.context);
    assert.equal(old.source, 'hint'); assert.equal(old.required, 1);
    const current = checked(cache.lookup(view, f.context, full, { tick: 1, hint: wires.get(2) }), view, f.context);
    assert.equal(current.source, 'oracle'); assert.equal(current.required, 2); assert.equal(cache.stats().entries, 2);
    for (const [epoch, tick] of [[2, 2], [3, 3]]) {
      const hit = checked(cache.lookup(view, f.context, { ...zero, epoch }, { tick, hint: null }), view, f.context);
      assert.equal(hit.source, 'cache'); assert.equal(hit.witness.epoch, epoch); assert.equal(hit.required, epoch === 2 ? 1 : 2); assert.equal(hit.work.oracleCalls, 0);
      assert.equal(hit.cache.insertedAt, epoch === 2 ? 0 : 1);
    }
    const fewer = pathWitnessGraphView(f.graph, { ...f.options, snapshots: [f.options.snapshots[0], { epoch: 3, difficulty: 2, anchors: ['b'] }] }), negativeCache = makeCache();
    for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(wires.get(2)), f.context, fewer).accepted, true);
    const negative = checked(negativeCache.lookup(fewer, f.context, full, { tick: 0, hint: wires.get(2) }), fewer, f.context);
    assert.equal(negative.status, 'infeasible'); assert.equal(negative.reason, 'anchor-infeasible'); assert.equal(negative.feasible, false); assert.equal(negative.required, 2);
    assert.equal(negative.source, 'oracle'); assert.equal(negativeCache.stats().entries, 0); assert.equal(negativeCache.stats().hintRejects, 1);
    for (const [epoch, snapshots, hintEpoch, reason] of [
      [2, [f.options.snapshots[1]], 3, 'snapshot-unavailable'],
      [3, [f.options.snapshots[0]], 2, 'snapshot-unavailable'],
      [1, f.options.snapshots, 2, 'epoch-outside-grace'],
      [4, f.options.snapshots, 3, 'epoch-outside-grace'],
    ]) {
      const altered = pathWitnessGraphView(f.graph, { ...f.options, snapshots }), c = makeCache();
      const r = checked(c.lookup(altered, f.context, { ...full, epoch }, { tick: 0, hint: wires.get(hintEpoch) }), altered, f.context);
      assert.equal(r.status, 'unavailable'); assert.equal(r.reason, reason); assert.equal(r.required, null); assert.equal(r.source, 'oracle'); assert.equal(c.stats().entries, 0);
    }
    const sameD = pathWitnessGraphView(f.graph, { ...f.options, snapshots: f.options.snapshots.map(s => ({ ...s, difficulty: 2, anchors: ['a', 'b'] })) });
    const sameWire = findPathWitness(sameD, f.context, { ...full, epoch: 2 }).wire;
    assert.equal(makeCache().lookup(sameD, f.context, zero, { tick: 0, hint: sameWire }).status, 'censored');
  }
  assert.equal(scopeCases, 24);
});

test('silent edge/emergency changes without invalidation notices reject cached bytes and bounded repair uses the full exact current view', () => {
  const f = fixture(['u', 'a', 'b', 'c'], [['a', 'u'], ['b', 'u'], ['c', 'u']], {}, ['a', 'b', 'c']), cache = makeCache();
  cache.lookup(f.view(), f.context, full, { tick: 0, hint: null });
  f.graph.removeEdge('a', 'u'); let view = f.view();
  const repaired = checked(cache.lookup(view, f.context, full, { tick: 1, hint: null }), view, f.context);
  assert.equal(repaired.source, 'oracle'); assert.equal(repaired.work.cacheChecks, 1); assert.equal(repaired.work.primaryChecks, 2); assert.equal(cache.stats().cacheRejects, 1);
  assert.deepEqual(repaired.witness.paths.map(p => p.at(-1)).sort(), ['b', 'c']);
  f.options.removed = ['b']; view = f.view();
  const unavailableFamily = checked(cache.lookup(view, f.context, full, { tick: 2, hint: null }), view, f.context);
  assert.equal(unavailableFamily.status, 'infeasible'); assert.equal(cache.stats().entries, 0); assert.equal(cache.stats().cacheRejects, 2);
});

test('version root is only cache provenance: valid vertex witness can survive a root change, but checks and current-root output are fresh', () => {
  const f = fixture(), cache = makeCache(), old = f.view();
  cache.lookup(old, f.context, full, { tick: 0, hint: null }); f.graph.addNode('unrelated'); const fresh = f.view();
  const result = checked(cache.lookup(fresh, f.context, zero, { tick: 1, hint: null }), fresh, f.context);
  assert.equal(result.source, 'cache'); assert.equal(result.cache.originRoot, old.view().id); assert.notEqual(result.cache.originRoot, result.viewRoot);
  assert.equal(result.work.primaryChecks, 1); assert.equal(result.work.ref2Checks, 1); assert.equal(result.cache.insertedAt, 0);
});

test('FIFO/byte/disabled bounds and reverse edge+terminal invalidation clean all indexes; notices evict without altering canonical state', () => {
  const f = fixture(['u', 'v', 'w', 'a', 'b'], ['u', 'v', 'w'].flatMap(u => [['a', u], ['b', u]])), view = f.view();
  const cache = makeCache({ maxEntries: 2, ttlTicks: 100 });
  const contexts = Object.fromEntries(['u', 'v', 'w'].map(subject => [subject, { ...f.context, subject }]));
  cache.lookup(view, contexts.u, full, { tick: 0, hint: null }); cache.lookup(view, contexts.v, full, { tick: 1, hint: null });
  cache.lookup(view, contexts.u, zero, { tick: 2, hint: null }); cache.lookup(view, contexts.w, full, { tick: 3, hint: null });
  assert.equal(cache.stats().fifoEvicted, 1); assert.equal(cache.stats().entries, 2);
  assert.equal(cache.invalidate({ edges: [['a', 'u']], anchors: [] }).evicted, 0);
  assert.equal(cache.invalidate({ edges: [['v', 'a']], anchors: [] }).evicted, 1); // Deliberate reverse-orientation overinvalidation.
  assert.equal(cache.invalidate({ edges: [], anchors: ['a'] }).evicted, 1);
  for (const field of ['entries', 'bytes', 'edgeKeys', 'anchorKeys']) assert.equal(cache.stats()[field], 0);
  assert.equal(view.edge('a', 'w'), true); const back = checked(cache.lookup(view, contexts.w, full, { tick: 4, hint: null }), view, contexts.w); assert.equal(back.source, 'oracle');
  const size = Buffer.byteLength(findPathWitness(view, contexts.u, full).wire), byteCache = makeCache({ maxEntries: 10, maxBytes: 2 * size - 1 });
  byteCache.lookup(view, contexts.u, full, { tick: 0, hint: null }); byteCache.lookup(view, contexts.v, full, { tick: 1, hint: null });
  assert.equal(byteCache.stats().entries, 1); assert.ok(byteCache.stats().bytes <= byteCache.config.maxBytes); assert.equal(byteCache.stats().fifoEvicted, 1);
  for (const patch of [{ maxEntries: 0 }, { maxBytes: 0 }, { maxBytes: 1 }]) {
    const disabled = makeCache(patch), result = checked(disabled.lookup(view, contexts.u, full, { tick: 0, hint: null }), view, contexts.u);
    assert.equal(result.status, 'found'); assert.equal(result.cache.retained, false); assert.equal(disabled.stats().entries, 0); assert.equal(disabled.stats().retentionSkipped, 1);
  }
});

test('all64 tiny directed graphs/3 projections preserve M2 exact outcomes before any cost claim; negatives/unavailable are never cached', () => {
  const nodes = ['u', 'a', 'b'], possible = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b])); let cases = 0;
  for (let bits = 0; bits < 64; bits++) for (const mode of ['directed', 'any', 'reciprocal']) {
    const f = fixture(nodes, possible.filter((_, i) => bits & (1 << i)), { maxHops: 2, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' });
    const view = f.view(), cache = makeCache(), expected = findPathWitness(view, f.context, full), result = checked(cache.lookup(view, f.context, full, { tick: 0, hint: null }), view, f.context);
    assert.equal(result.status, expected.status); assert.equal(result.feasible, expected.feasible);
    if (result.status === 'found') assert.equal(cache.lookup(view, f.context, zero, { tick: 1, hint: null }).source, 'cache');
    else { assert.equal(cache.stats().entries, 0); cache.lookup(view, f.context, full, { tick: 1, hint: null }); assert.equal(cache.stats().oracleCalls, 2); }
    cases++;
  }
  assert.equal(cases, 192);
  const f = fixture(), cache = makeCache();
  assert.equal(cache.lookup(f.view(), f.context, { ...full, epoch: 2 }, { tick: 0, hint: null }).status, 'unavailable'); assert.equal(cache.stats().entries, 0);
});

test('malformed config/time/query/view/invalidation inputs fail before admitting work, not as cache misses or canonical state edits', () => {
  for (const patch of [{ ttlTicks: 0 }, { ttlTicks: -0 }, { maxEntries: -1 }, { maxEntries: 1025 }, { maxBytes: PATH_CACHE_LIMITS.maxBytes + 1 }, { ttlTicks: 0.5 }]) assert.throws(() => makeCache(patch));
  const f = fixture(), view = f.view(), cache = makeCache(); cache.lookup(view, f.context, full, { tick: 2, hint: null }); const before = cache.stats();
  for (const tick of [1, -1, -0, 0.5, Number.MAX_SAFE_INTEGER]) assert.throws(() => cache.lookup(view, f.context, full, { tick, hint: null }));
  assert.throws(() => cache.lookup(view, f.context, { ...full, maxPaths: 4097 }, { tick: 3, hint: null }));
  assert.throws(() => cache.lookup({ ...view }, f.context, full, { tick: 3, hint: null }));
  assert.throws(() => cache.lookup(view, { ...f.context, extra: 1 }, full, { tick: 3, hint: null }));
  assert.throws(() => cache.invalidate({ edges: [['a']], anchors: [] })); assert.throws(() => cache.invalidate({ edges: [], anchors: ['\ud800'] }));
  assert.throws(() => cache.invalidate({ edges: [], anchors: Array(4097).fill('a') })); assert.deepEqual(cache.stats(), before);
  assert.ok(Object.isFrozen(PATH_CACHE_LIMITS) && Object.isFrozen(cache.config) && Object.isFrozen(cache.stats()));
});

test('Native capture lookup does not mutate Model accounting/history or imply fee/XP/admission authority', () => {
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const a of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(a, 'u'));
  const f = fixture(), view = capturePathWitnessModelView(m, f.options), cache = makeCache();
  const before = JSON.stringify([m.events(), m.subjects(), m.selfIds(), m.guaranteeRelations(), m.guarantees.toJSON(), m.audit()]);
  const result = checked(cache.lookup(view, f.context, full, { tick: 0, hint: null }), view, f.context);
  assert.equal(result.status, 'found'); assert.equal(Object.hasOwn(result, 'authorized'), false);
  assert.equal(JSON.stringify([m.events(), m.subjects(), m.selfIds(), m.guaranteeRelations(), m.guarantees.toJSON(), m.audit()]), before);
});

test('inspection does not consume time/load/random draws or change deterministic query output; no ambient RNG/network is used', () => {
  const f = fixture(), view = f.view(), a = makeCache(), b = makeCache();
  a.lookup(view, f.context, full, { tick: 0, hint: null }); b.lookup(view, f.context, full, { tick: 0, hint: null });
  a.stats(); a.stats();
  assert.deepEqual(a.lookup(view, f.context, zero, { tick: 1, hint: null }), b.lookup(view, f.context, zero, { tick: 1, hint: null }));
  const source = readFileSync(new URL('../src/path-witness-cache.mjs', import.meta.url), 'utf8'); assert.doesNotMatch(source, /Math\.random|randomBytes|Date\.now|fetch\(/);
});
