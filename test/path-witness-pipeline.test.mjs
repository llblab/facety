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
import { buildPathWitnessTrees, isPathWitnessForest, proposePathWitnessFromUnion } from '../src/path-witness-trees.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { queryPathWitness } from '../src/path-witness-pipeline.mjs';
import { provenance } from '../src/provenance.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const contract = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/m3-pipeline-contract-validation.json', import.meta.url)));
const full = { epoch: 3, maxExpansions: 1000, maxPaths: 128, maxPackingSteps: 1000 }, zero = { epoch: 3, maxExpansions: 0, maxPaths: 0, maxPackingSteps: 0 };
const union = { epoch: 3, maxSubjectHops: 2, maxAnchorHops: 2, maxVertices: 4096, maxArcs: 65536, maxTreeRows: 65536, maxBallTrials: 10000, maxExpansions: 10000, maxPaths: 4096, maxPackingSteps: 10000 };
const build = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 }, config = { maxEntries: 4, maxBytes: 10000, ttlTicks: 5 };
const cache = (patch = {}) => new PathWitnessCache({ ...config, ...patch });
function fixture(nodes = ['u', 'a', 'b'], edges = [['a', 'u'], ['b', 'u']], patch = {}, anchors = ['a', 'b'], difficulty = 2, name = 'pipeline-control') {
  const context = structuredClone(base); Object.assign(context.policy, { maxHops: 3 }, patch);
  const graph = new DirectedGraph(name); nodes.forEach(v => graph.addNode(v)); edges.forEach(([a, b]) => graph.addEdge(a, b));
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty, anchors }], removed: [], standing: [] };
  return { graph, context, options, view: () => pathWitnessGraphView(graph, options) };
}
function checked(c, forest, view, context, input) {
  const before = JSON.stringify([forest.toJSON(), view.toJSON(), context, input]), r = queryPathWitness(c, forest, view, context, input);
  assert.equal(JSON.stringify([forest.toJSON(), view.toJSON(), context, input]), before);
  assert.equal(r.schema, 'facety-path-pipeline/v1'); assert.equal(r.reference, 'verified-cache-union-fallback/v1'); assert.ok(Object.isFrozen(r) && Object.isFrozen(r.stages) && Object.isFrozen(r.input.union));
  assert.equal(r.result.query.epoch, input.fallback.epoch); assert.equal(r.viewRoot, view.view().id); assert.equal(r.forestRoot, forest.meta.originRoot);
  assert.equal(r.work.cacheAdmissions, r.stages.probe.called + r.stages.finish.called); assert.equal(r.work.fullOracleCalls, r.result.source === 'oracle' ? 1 : 0);
  assert.equal(r.work.cacheSweepEntryUpperBound, r.stages.probe.inventoryBefore + (r.stages.finish.inventoryBefore ?? 0));
  assert.equal(r.cacheStats.after.queries - r.cacheStats.before.queries, r.work.cacheAdmissions);
  assert.equal(r.cacheStats.after.oracleCalls - r.cacheStats.before.oracleCalls, r.work.fullOracleCalls);
  for (const step of Object.values(r.stages)) if (!step.called) { assert.equal(step.receipt, null); assert.equal(step.inventoryBefore, null); }
  if (r.result.status === 'found') {
    assert.equal(r.result.feasible, true); assert.equal(r.result.witness.epoch, input.fallback.epoch);
    for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(r.result.wire), context, view).accepted, true);
  } else { assert.equal(r.result.wire, null); assert.equal(r.result.feasible, r.result.status === 'infeasible' ? false : null); }
  return r;
}
// Separate public caller records each actual owner call and constructs receipts without pipeline helpers/counter guards.
function shadow(c, forest, view, suppliedContext, request) {
  const context = pathWitnessContext(suppliedContext), input = structuredClone(request), before = c.stats(), steps = {};
  const probe = c.probe(view, context, input.fallback, { tick: input.tick }); steps.probe = { called: true, inventoryBefore: before.entries, receipt: probe };
  let chosen = probe, source = 'cache'; steps.advice = { called: false, inventoryBefore: null, receipt: null }; steps.finish = { called: false, inventoryBefore: null, receipt: null };
  if (probe.status !== 'found') {
    const advice = proposePathWitnessFromUnion(forest, view, context, input.union); steps.advice = { called: true, inventoryBefore: null, receipt: advice };
    const count = c.stats().entries, finish = c.lookup(view, context, input.fallback, { tick: input.tick, hint: advice.wire });
    steps.finish = { called: true, inventoryBefore: count, receipt: finish }; chosen = finish; source = advice.status === 'found' ? 'union' : 'oracle';
  }
  const after = c.stats(), result = { source, ...Object.fromEntries(['status', 'reason', 'feasible', 'required', 'wire', 'witness', 'verification', 'viewRoot', 'reference', 'context', 'query', 'stats'].map(k => [k, chosen[k]])) };
  return { schema: 'facety-path-pipeline/v1', reference: 'verified-cache-union-fallback/v1', provenance: provenance(), viewRoot: view.view().id, forestRoot: forest.meta.originRoot,
    context, input, result, stages: steps, cacheStats: { before, after }, work: { cacheAdmissions: after.queries - before.queries, cacheSweepEntryUpperBound: before.entries + (steps.finish.inventoryBefore ?? 0), unionCalled: steps.advice.called, fullOracleCalls: after.oracleCalls - before.oracleCalls } };
}
// Physical raw-path enumeration and combinations, no production projected graph, queue or packing implementation.
function rawExists(nodes, edges, context, options) {
  const p = context.policy, snap = options.snapshots[0], paths = [], has = (a, b) => edges.some(([x, y]) => a === x && b === y);
  function dfs(path) {
    const node = path.at(-1); if (path.length > 1 && snap.anchors.includes(node)) paths.push(path);
    if (path.length - 1 === p.maxHops) return;
    for (const n of nodes) if (!path.includes(n) && (p.direction === 'directed-from-anchor' ? has(n, node) : p.undirectedProjection === 'reciprocal-only' ? has(n, node) && has(node, n) : has(n, node) || has(node, n))) dfs([...path, n]);
  }
  dfs([context.subject]);
  return paths.some((a, i) => paths.slice(i + 1).some(b => new Set([...a.slice(1), ...b.slice(1)]).size === a.length + b.length - 2));
}

test('probe is genuinely cache-only on empty/negative/unavailable views, validates before admission and never renews a hit', () => {
  const f = fixture(), view = f.view();
  for (const v of [view, fixture(['u', 'a', 'b'], []).view(), pathWitnessGraphView(f.graph, { ...f.options, snapshots: [] }), pathWitnessGraphView(f.graph, { ...f.options, currentEpoch: 8 })]) {
    const c = cache(), r = c.probe(v, f.context, full, { tick: 0 }); assert.equal(r.schema, 'facety-path-cache-probe/v1'); assert.equal(r.status, 'miss'); assert.equal(r.reason, 'cache-miss');
    assert.equal(r.required, null); assert.equal(r.feasible, null); assert.equal(r.work.oracleCalls, 0); assert.equal(r.work.hintChecks, 0); assert.equal(c.stats().oracleCalls, 0); assert.equal(c.stats().queries, 1); assert.equal(c.stats().entries, 0);
  }
  const c = cache(), inserted = c.lookup(view, f.context, full, { tick: 0, hint: null }), hit = c.probe(view, f.context, zero, { tick: 1 });
  assert.equal(hit.source, 'cache'); assert.equal(hit.status, 'found'); assert.equal(hit.cache.expiresAt, inserted.cache.expiresAt); assert.equal(hit.cache.insertedAt, 0); assert.equal(hit.work.primaryChecks, 1); assert.equal(hit.work.ref2Checks, 1);
  const before = c.stats(); for (const args of [[view, f.context, full, { tick: -0 }], [view, f.context, full, { tick: 0 }], [view, f.context, { ...full, extra: 1 }, { tick: 2 }], [view, f.context, full, { tick: 2, hint: null }], [{ ...view }, f.context, full, { tick: 2 }]]) assert.throws(() => c.probe(...args));
  assert.deepEqual(c.stats(), before); const expired = c.probe(view, f.context, full, { tick: 5 }); assert.equal(expired.status, 'miss'); assert.equal(expired.work.expired, 1);
  for (const k of ['entries', 'bytes', 'edgeKeys', 'anchorKeys']) assert.equal(c.stats()[k], 0);
});

test('3456 tiny pipeline observations match separate public sequencing/raw physical families/full M2, including warm hits and exact expiry', t => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b])); let observations = 0, found = 0; const sources = { cache: 0, union: 0, oracle: 0 };
  for (let bits = 0; bits < 64; bits++) for (const mode of ['directed', 'any', 'reciprocal']) {
    const edges = arcs.filter((_, i) => bits & (1 << i)), f = fixture(nodes, edges, { maxHops: 2, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' }), view = f.view(), forest = buildPathWitnessTrees(view, build);
    const feasible = rawExists(nodes, edges, f.context, f.options); assert.equal(findPathWitness(view, f.context, full).status === 'found', feasible);
    for (const u of [union, { ...union, maxSubjectHops: 0, maxAnchorHops: 0, maxTreeRows: 0 }, { ...union, maxVertices: 0 }]) for (const retention of [true, false]) {
      const a = cache(retention ? {} : { maxEntries: 0 }), b = cache(retention ? {} : { maxEntries: 0 });
      for (const tick of [0, 1, 5]) {
        const input = { tick, union: u, fallback: full }, r = checked(a, forest, view, f.context, input), manual = shadow(b, forest, view, f.context, input); assert.deepEqual(r, manual);
        assert.equal(r.result.status === 'found', feasible); assert.equal(r.work.unionCalled, r.result.source !== 'cache'); sources[r.result.source]++; observations++; if (feasible) found++;
      }
    }
  }
  assert.equal(observations, 3456); t.diagnostic('pipeline-shadow-controls ' + JSON.stringify({ observations, found, sources, observedMismatch: 0 }));
});

test('all192 pre-code lookup/invalidation/stats outputs remain byte-exact after adding probe', () => {
  const b = contract.existingLookupBaseline, nodes = b.nodes, arcs = nodes.flatMap(a => nodes.filter(v => v !== a).map(v => [a, v])), hash = createHash('sha256'); let cases = 0;
  for (let bits = 0; bits < 64; bits++) for (const mode of ['directed', 'any', 'reciprocal']) {
    const f = fixture(nodes, arcs.filter((_, i) => bits & (1 << i)), { maxHops: 2, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' }, ['a', 'b'], 2, b.graphName), v = f.view(), c = new PathWitnessCache(b.config);
    const rows = [c.lookup(v, f.context, b.full, { tick: 0, hint: null }), c.lookup(v, f.context, b.zero, { tick: 1, hint: null }), c.invalidate({ edges: [['a', 'u']], anchors: [] }),
      c.lookup(v, f.context, b.full, { tick: 2, hint: null }), c.lookup(v, f.context, b.zero, { tick: 7, hint: null }), c.stats()]; hash.update(JSON.stringify(rows)).update('\0'); cases++;
  }
  assert.equal(cases, b.cases); assert.equal(hash.digest('hex'), b.digest);
});

test('hit skips producer/preparation despite exhausted union/fallback; misses preserve local/full/unknown/unavailable namespaces', () => {
  const f = fixture(), view = f.view(), forest = buildPathWitnessTrees(view, build), c = cache();
  let r = checked(c, forest, view, f.context, { tick: 0, union, fallback: zero }); assert.equal(r.result.source, 'union'); assert.equal(r.work.fullOracleCalls, 0); assert.equal(r.work.cacheAdmissions, 2); assert.equal(r.stages.finish.receipt.work.primaryChecks, 1);
  r = checked(c, forest, view, f.context, { tick: 1, union: { ...union, maxVertices: 0 }, fallback: zero }); assert.equal(r.result.source, 'cache'); assert.equal(r.work.cacheAdmissions, 1); assert.equal(r.stages.advice.receipt, null);
  for (const fallback of [zero, full]) { r = checked(cache(), forest, view, f.context, { tick: 0, union: { ...union, maxVertices: 0 }, fallback }); assert.equal(r.result.source, 'oracle'); assert.equal(r.result.status, fallback === zero ? 'censored' : 'found'); assert.equal(r.work.fullOracleCalls, 1); }
  const no = fixture(['u', 'a', 'b'], []), nv = no.view(); r = checked(cache(), buildPathWitnessTrees(nv, build), nv, no.context, { tick: 0, union, fallback: zero }); assert.equal(r.result.status, 'infeasible'); assert.equal(r.result.feasible, false); assert.equal(r.stages.probe.receipt.feasible, null); assert.equal(r.stages.advice.receipt.feasible, null);
  const missing = pathWitnessGraphView(f.graph, { ...f.options, snapshots: [] }), unavailableForest = buildPathWitnessTrees(missing, build);
  r = checked(cache(), unavailableForest, missing, f.context, { tick: 0, union, fallback: full }); assert.equal(r.result.status, 'unavailable'); assert.equal(r.result.required, null);
  r = checked(cache(), unavailableForest, view, f.context, { tick: 0, union, fallback: full }); assert.equal(r.stages.advice.receipt.status, 'unavailable'); assert.equal(r.result.status, 'found'); assert.equal(r.result.source, 'oracle');
  r = checked(c, unavailableForest, view, f.context, { tick: 2, union, fallback: full }); assert.equal(r.result.source, 'cache'); assert.equal(r.stages.advice.called, false);
});

test('silent stale paths/anchors repair without notices; current valid old-origin packets still hit and actual sweep inventories count', () => {
  const f = fixture(['u', 'a', 'b', 'c'], [['a', 'u'], ['b', 'u'], ['c', 'u']], {}, ['a', 'b', 'c']), old = f.view(), forest = buildPathWitnessTrees(old, build), c = cache();
  checked(c, forest, old, f.context, { tick: 0, union, fallback: full }); f.graph.removeEdge('a', 'u'); let view = f.view();
  let r = checked(c, forest, view, f.context, { tick: 1, union, fallback: full }); assert.equal(r.stages.probe.receipt.work.cacheChecks, 1); assert.equal(r.cacheStats.after.cacheRejects, 1);
  assert.equal(r.result.source, 'union'); assert.deepEqual(r.result.witness.paths.map(p => p.at(-1)), ['b', 'c']); assert.equal(r.work.cacheSweepEntryUpperBound, 1); assert.equal(r.stages.finish.inventoryBefore, 0);
  f.graph.addNode('unrelated'); view = f.view(); r = checked(c, forest, view, f.context, { tick: 2, union, fallback: full }); assert.equal(r.result.source, 'cache'); assert.notEqual(r.stages.probe.receipt.cache.originRoot, r.viewRoot);
  f.options.removed = ['b']; view = f.view(); r = checked(c, forest, view, f.context, { tick: 3, union, fallback: full }); assert.equal(r.result.status, 'infeasible'); assert.equal(r.cacheStats.after.entries, 0);
  const multiple = cache(), g = fixture(['u', 'v', 'a', 'b'], [['a', 'u'], ['b', 'u'], ['a', 'v'], ['b', 'v']]), gv = g.view(), gf = buildPathWitnessTrees(gv, build);
  multiple.lookup(gv, { ...g.context, subject: 'v' }, full, { tick: 0, hint: null }); r = checked(multiple, gf, gv, g.context, { tick: 1, union, fallback: full }); assert.equal(r.work.cacheSweepEntryUpperBound, 2); assert.equal(r.cacheStats.after.entries, 2);
  r = checked(multiple, gf, gv, g.context, { tick: 6, union, fallback: full }); assert.equal(r.stages.probe.receipt.work.expired, 2); assert.equal(r.work.cacheSweepEntryUpperBound, 2);
});

test('all invalid unused-on-hit config/brands/policy/clock fail before any admission and fake/subclass methods are not callbacks', () => {
  const f = fixture(), view = f.view(), forest = buildPathWitnessTrees(view, build), c = cache(); c.lookup(view, f.context, full, { tick: 0, hint: null }); const before = c.stats(), input = { tick: 1, union, fallback: full }; let calls = 0;
  const bad = [null, { ...input, extra: 1 }, { ...input, tick: -0 }, { ...input, tick: -1 }, { ...input, tick: Number.MAX_SAFE_INTEGER }, { ...input, union: { ...union, epoch: 2 } },
    { ...input, union: { ...union, maxVertices: 4097 } }, { ...input, union: { ...union, maxSubjectHops: 4 } }, { ...input, union: { ...union, maxArcs: -0 } }, { ...input, fallback: { ...full, maxPaths: 4097 } }, { ...input, fallback: { ...full, extra: 0 } }];
  for (const k of Object.keys(union)) { const q = { ...union }; delete q[k]; bad.push({ ...input, union: q }); }
  const accessed = { ...union }; Object.defineProperty(accessed, 'maxVertices', { enumerable: true, get() { calls++; return 1; } }); bad.push({ ...input, union: accessed });
  for (const b of bad) { assert.throws(() => queryPathWitness(c, forest, view, f.context, b)); assert.deepEqual(c.stats(), before); }
  const fake = Object.create(PathWitnessCache.prototype), subclass = new (class extends PathWitnessCache { stats() { calls++; throw Error('not a port'); } })(config);
  for (const cc of [fake, subclass, { stats() { calls++; } }]) assert.throws(() => queryPathWitness(cc, forest, view, f.context, input));
  for (const ff of [null, { ...forest }, view]) assert.throws(() => queryPathWitness(c, ff, view, f.context, input)); assert.equal(isPathWitnessForest(forest), true); assert.equal(isPathWitnessForest({ ...forest }), false);
  assert.throws(() => queryPathWitness(c, forest, { ...view }, f.context, input)); assert.throws(() => queryPathWitness(c, forest, view, { ...f.context, policy: { ...f.context.policy, maxHops: 2 } }, input));
  const other = fixture(undefined, undefined, { maxHops: 2 }), otherForest = buildPathWitnessTrees(other.view(), build); assert.throws(() => queryPathWitness(c, otherForest, view, f.context, input));
  assert.equal(calls, 0); assert.deepEqual(c.stats(), before); const valid = Object.assign(Object.create(null), input); assert.equal(checked(c, forest, view, f.context, valid).result.source, 'cache');
});

test('requested epochs stay bound across both cache keys and stale forest advice, and disabled retention never learns a negative', () => {
  const f = fixture(); f.options.snapshots.unshift({ epoch: 2, difficulty: 1, anchors: ['a'] }); const view = f.view(), forest = buildPathWitnessTrees(view, build), c = cache();
  for (const [epoch, tick] of [[2, 0], [3, 1], [2, 2], [3, 3]]) {
    const r = checked(c, forest, view, f.context, { tick, union: { ...union, epoch }, fallback: { ...full, epoch } });
    assert.equal(r.result.witness.epoch, epoch); assert.equal(r.result.required, epoch === 2 ? 1 : 2); if (tick > 1) assert.equal(r.result.source, 'cache');
  }
  for (const patch of [{ maxEntries: 0 }, { maxBytes: 0 }, { maxBytes: 1 }]) { const disabled = cache(patch);
    for (const tick of [0, 1]) { const r = checked(disabled, forest, view, f.context, { tick, union, fallback: full }); assert.equal(r.result.source, 'union'); assert.equal(r.work.cacheAdmissions, 2); assert.equal(r.cacheStats.after.entries, 0); }
  }
  for (const epoch of [1, 4]) { const r = checked(cache(), forest, view, f.context, { tick: 0, union: { ...union, epoch }, fallback: { ...full, epoch } }); assert.equal(r.result.status, 'unavailable'); assert.equal(r.cacheStats.after.entries, 0); }
});

test('r64/D64/UTF8-NUL/Native query and valid future/inert inspection keep bounded current proof/state semantics', () => {
  const anchors = Array.from({ length: 64 }, (_, i) => 'a' + i), f = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), { maxHops: 1, maxDifficulty: 64 }, anchors, 64), view = f.view(), forest = buildPathWitnessTrees(view, build);
  assert.equal(checked(cache(), forest, view, f.context, { tick: 0, union: { ...union, maxSubjectHops: 1, maxAnchorHops: 1 }, fallback: full }).result.witness.paths.length, 64);
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'é\0' + i), 'a'], long = fixture(path, path.slice(1).map((v, i) => [v, path[i]]), { maxHops: 64 }, ['a'], 1), lv = long.view(), lf = buildPathWitnessTrees(lv, build), q = { tick: 0, union: { ...union, maxSubjectHops: 64, maxAnchorHops: 0 }, fallback: full };
  const a = cache(), b = cache(), first = checked(a, lf, lv, long.context, q); assert.equal(first.result.witness.paths[0].length, 65); assert.deepEqual(first, checked(b, lf, lv, long.context, q));
  const oldBytes = JSON.stringify(first); a.stats(); a.stats(); lf.toJSON(); assert.deepEqual(checked(a, lf, lv, long.context, { ...q, tick: 1 }), checked(b, lf, lv, long.context, { ...q, tick: 1 }));
  assert.equal(JSON.stringify(first), oldBytes); assert.throws(() => first.stages.advice.receipt.retained.vertices.push('fake')); assert.throws(() => { first.cacheStats.before.queries = 9; });
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const id of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(id, 'u'));
  const native = fixture(), nv = capturePathWitnessModelView(m, native.options), before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]);
  assert.equal(checked(cache(), buildPathWitnessTrees(nv, build), nv, native.context, { tick: 0, union, fallback: full }).result.status, 'found'); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
});
