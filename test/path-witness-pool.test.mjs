import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Random } from '../src/random.mjs';
import { createPathWitnessPool, routePathWitnessPool, PATH_POOL_LIMITS, PATH_POOL_RANDOMNESS } from '../src/path-witness-pool.mjs';
import { DirectedGraph } from '../src/graph.mjs';
import { pathWitnessGraphView } from '../src/path-witness-view.mjs';
import { encodePathWitness, verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const compare = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function make(rows = ['a', 'b', 'c'].map(id => ({ id, score: 1 })), maxPoolSize = 12, metric = 'supplied-synthetic/v1') {
  return createPathWitnessPool({ metric, maxPoolSize, candidates: rows });
}
function query(patch = {}) { return { seed: 'pool-software-control', domain: 'pool-tests', viewId: 'supplied-view', epoch: 3, subject: 'u', queryId: 'request-1', step: 0,
  start: 0, count: 3, mode: 'uniform', excluded: [], loads: null, ...patch }; }
function loaded(pool, load = 0) { return pool.ranked.map(({ id }) => ({ id, load })); }
// Separate ordered-list sampling/key reconstruction; shares only the documented PRNG, not the pool sampler.
function reference(pool, q) {
  let remaining = pool.ranked.map(row => row.id).filter(id => id !== q.subject && !q.excluded.includes(id)); const selected = [], trials = [];
  const loads = new Map(q.loads?.map(row => [row.id, row.load]));
  for (let ordinal = q.start; ordinal < q.start + q.count && remaining.length; ordinal++) {
    const random = new Random(JSON.stringify(['path-pool-keyed/v1', q.seed, q.domain, q.viewId, q.epoch, q.subject, q.queryId, q.step, ordinal, q.mode, pool.id]));
    const a = remaining[random.int(remaining.length)], sampled = [a]; let chosen = a;
    if (q.mode === 'best-of-two' && remaining.length > 1) {
      const others = remaining.filter(id => id !== a), b = others[random.int(others.length)]; sampled.push(b);
      chosen = [a, b].sort((x, y) => loads.get(x) - loads.get(y) || compare(x, y))[0];
    }
    remaining = remaining.filter(id => id !== chosen); selected.push(chosen); trials.push({ ordinal, sampled, chosen });
  }
  return { selected, trials };
}

test('pool rank/digest use known supplied scores, UTF-8 ties and retained advice, not source permutation or unknown-as-zero', () => {
  const rows = [{ id: 'unknown', score: null }, { id: 'zero', score: 0 }, { id: '\u{10000}', score: 1 }, { id: '\ue000', score: 1 }, { id: 'top', score: 8 }];
  const p = make(rows, 4);
  assert.deepEqual(p.ranked, [{ id: 'top', score: 8 }, { id: '\ue000', score: 1 }, { id: '\u{10000}', score: 1 }, { id: 'zero', score: 0 }]);
  assert.equal(p.id, createHash('sha256').update(JSON.stringify(['facety-path-pool/v1', 'supplied-synthetic/v1', 4, p.ranked])).digest('hex'));
  assert.equal(p.unknown, 1); assert.equal(p.inputCandidates, 5); assert.equal(make([...rows].reverse(), 4).id, p.id);
  assert.equal(make([...rows, { id: 'other-unknown', score: null }], 4).id, p.id);
  assert.equal(make([...rows, { id: 'low', score: 0 }], 3).id, make(rows, 3).id);
  for (const metric of ['supplied-xp/v1', 'supplied-standing/v1']) assert.notEqual(make(rows, 4, metric).id, p.id);
  assert.deepEqual(make(rows, 0).ranked, []);
});

test('2016 bounded pool/mode/count cases match separate literal key and filtered-list sampling reconstruction', () => {
  let checks = 0;
  for (let size = 0; size <= 6; size++) for (const mode of ['uniform', 'best-of-two']) for (let seed = 0; seed < 16; seed++) for (let count = 0; count <= 8; count++) {
    const p = make(Array.from({ length: size }, (_, i) => ({ id: `peer-${i}`, score: i % 3 })), size);
    const q = query({ mode, seed: `pool-reference-${seed}`, count, start: 5, excluded: ['peer-1', 'outside'], loads: mode === 'uniform' ? null : p.ranked.map(({ id }, i) => ({ id, load: i % 2 })) });
    const actual = routePathWitnessPool(p, q), expected = reference(p, q);
    assert.deepEqual(actual.selected, expected.selected); assert.deepEqual(actual.trials, expected.trials);
    assert.equal(actual.complete, actual.selected.length === count); assert.equal(new Set(actual.selected).size, actual.selected.length);
    assert.equal(actual.stats.generators, actual.selected.length); assert.ok(actual.stats.draws <= 2 * actual.selected.length);
    for (const name of ['accepted', 'feasible', 'wire', 'witness']) assert.equal(Object.hasOwn(actual, name), false);
    checks++;
  }
  assert.equal(checks, 2016);
  assert.deepEqual(PATH_POOL_RANDOMNESS, { policy: 'path-pool-keyed/v1', generator: 'sha256-xoshiro128starstar-v2' });
});

test('best-of-two lower load and UTF-8 tie decisions retain the loser, with no implicit load updates', () => {
  const p = make([{ id: 'a', score: 1 }, { id: 'b', score: 1 }]);
  for (let seed = 0; seed < 16; seed++) {
    const q = query({ mode: 'best-of-two', seed: String(seed), count: 2, loads: [{ id: 'a', load: 5 }, { id: 'b', load: 0 }] });
    const result = routePathWitnessPool(p, q); assert.deepEqual(result.selected, ['b', 'a']); assert.equal(result.stats.draws, 3);
    assert.equal(result.stats.loadComparisons, 1); assert.equal(result.query.loads[0].load, 5);
    assert.deepEqual(routePathWitnessPool(p, { ...q, loads: loaded(p) }).selected, ['a', 'b']);
  }
  assert.deepEqual(routePathWitnessPool(p, query({ count: 2, subject: 'a' })).selected, ['b']);
});

test('count prefixes, split ordinals, replay, inspection and unrelated/future queries preserve keyed route history', () => {
  const p = make(Array.from({ length: 7 }, (_, i) => ({ id: `v${i}`, score: i })));
  for (const mode of ['uniform', 'best-of-two']) {
    const q = query({ mode, count: 5, start: 12, loads: mode === 'uniform' ? null : loaded(p, 1) }), full = routePathWitnessPool(p, q);
    const first = routePathWitnessPool(p, { ...q, count: 2 }); assert.deepEqual(first.selected, full.selected.slice(0, 2));
    const rest = routePathWitnessPool(p, { ...q, start: 14, count: 3, excluded: first.selected });
    assert.deepEqual([...first.selected, ...rest.selected], full.selected);
    for (let i = 0; i < 20; i++) { JSON.stringify(p); JSON.stringify(full); routePathWitnessPool(p, { ...q, queryId: `unrelated-${i}`, step: i }); }
    assert.deepEqual(routePathWitnessPool(p, q), full);
    assert.deepEqual(routePathWitnessPool(p, { ...q, count: 7 }).selected.slice(0, 5), full.selected);
    assert.deepEqual(routePathWitnessPool(p, { ...q, excluded: ['unknown', 'unknown'] }).selected, full.selected);
  }
});

test('load snapshots are explicit/complete; exact large totals and zero-total concentration preserve missingness', () => {
  const p = make(), q = query({ mode: 'best-of-two', loads: loaded(p) });
  assert.deepEqual(routePathWitnessPool(p, q).loadTelemetry, { total: '0', max: 0, herfindahl: null });
  assert.equal(routePathWitnessPool(p, query()).loadTelemetry, null);
  assert.equal(routePathWitnessPool(p, { ...q, loads: p.ranked.map(({ id }, i) => ({ id, load: i === 0 ? 9 : 0 })) }).loadTelemetry.herfindahl, 1);
  const large = make(Array.from({ length: 64 }, (_, i) => ({ id: String(i), score: 0 })), 64), n = Number.MAX_SAFE_INTEGER;
  const result = routePathWitnessPool(large, query({ mode: 'best-of-two', count: 64, loads: loaded(large, n) }));
  assert.deepEqual(result.loadTelemetry, { total: String(BigInt(n) * 64n), max: n, herfindahl: 1 / 64 }); assert.equal(result.selected.length, 64);
  for (const loads of [null, [], [...loaded(p), { id: 'extra', load: 0 }], [loaded(p)[0], loaded(p)[0], loaded(p)[2]]]) assert.throws(() => routePathWitnessPool(p, { ...q, loads }));
  assert.throws(() => routePathWitnessPool(p, query({ loads: loaded(p) })));
  const empty = make([], 0); assert.deepEqual(routePathWitnessPool(empty, query({ mode: 'best-of-two', loads: [] })).loadTelemetry, { total: '0', max: 0, herfindahl: null });
});

test('exhaustion is partial advice, count zero is inert, and raw bounds apply before filtering/deduplication', () => {
  const p = make(); const partial = routePathWitnessPool(p, query({ count: 4 }));
  assert.equal(partial.status, 'partial'); assert.equal(partial.reason, 'pool-exhausted'); assert.equal(partial.selected.length, 3);
  assert.equal(routePathWitnessPool(make([], 0), query()).status, 'partial');
  const zero = routePathWitnessPool(p, query({ count: 0 })); assert.equal(zero.status, 'routed'); assert.equal(zero.stats.draws, 0); assert.equal(zero.stats.generators, 0);
  const rows = Array.from({ length: PATH_POOL_LIMITS.maxCandidates }, (_, i) => ({ id: String(i), score: null }));
  assert.equal(make(rows).unknown, 4096); assert.throws(() => make([...rows, { id: 'overflow', score: null }]));
  assert.equal(routePathWitnessPool(p, query({ excluded: Array(4096).fill('a') })).selected.length, 2);
  assert.throws(() => routePathWitnessPool(p, query({ excluded: Array(4097).fill('a') })));
  assert.throws(() => make([], 65)); assert.throws(() => routePathWitnessPool(p, query({ count: 65 })));
});

test('strict data/Unicode/numeric boundaries refuse coercions/accessors without execution and admit exact software limits', () => {
  const p = make(); let called = 0;
  const accessor = { id: 'a', get score() { called++; return 0; } }, rows = [];
  Object.defineProperty(rows, '0', { enumerable: true, get() { called++; return { id: 'a', score: 0 }; } });
  for (const candidates of [[accessor], rows, new Array(1), [{ id: 'a', score: null }, { id: 'a', score: 1 }], [{ id: 'x', score: 0, extra: true }]]) assert.throws(() => make(candidates));
  for (const n of [-0, -1, 0.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => make([{ id: 'a', score: n }])); assert.throws(() => routePathWitnessPool(p, query({ epoch: n })));
    assert.throws(() => routePathWitnessPool(p, query({ mode: 'best-of-two', loads: loaded(p, n) })));
  }
  for (const id of ['', '\ud800', '\udc00', {}, 'é'.repeat(129)]) assert.throws(() => make([{ id, score: 1 }]));
  for (const patch of [{ extra: true }, { mode: 'implicit' }, { domain: '' }, { seed: 'x'.repeat(1025) }, { viewId: 'é'.repeat(129) }, { start: Number.MAX_SAFE_INTEGER, count: 2 }]) assert.throws(() => routePathWitnessPool(p, query(patch)));
  const withSymbol = query(); withSymbol[Symbol('hidden')] = 1; assert.throws(() => routePathWitnessPool(p, withSymbol));
  const withAccessor = query(); Object.defineProperty(withAccessor, 'count', { enumerable: true, get() { called++; return 1; } }); assert.throws(() => routePathWitnessPool(p, withAccessor));
  assert.throws(() => routePathWitnessPool({ ...p }, query())); assert.equal(called, 0);
  const wide = 'é'.repeat(128); assert.equal(make([{ id: wide, score: Number.MAX_SAFE_INTEGER }]).ranked[0].id, wide);
  assert.equal(routePathWitnessPool(p, query({ start: Number.MAX_SAFE_INTEGER, count: 1, seed: 'é'.repeat(512) })).trials[0].ordinal, Number.MAX_SAFE_INTEGER);
  const plain = Object.assign(Object.create(null), { metric: 'supplied-synthetic/v1', maxPoolSize: 1, candidates: [{ id: 'a', score: 0 }] }); assert.equal(createPathWitnessPool(plain).ranked.length, 1);
});

test('pool/route inputs are isolated and all returned data are deeply immutable', () => {
  const rows = [{ id: 'a', score: 2 }, { id: 'b', score: 1 }], p = make(rows); rows[0].id = 'changed'; rows.length = 0;
  const q = query({ mode: 'best-of-two', loads: loaded(p, 1), count: 2 }), result = routePathWitnessPool(p, q), before = JSON.stringify(result);
  q.loads[0].load = 100; q.excluded.push('a'); assert.equal(JSON.stringify(result), before);
  assert.throws(() => p.ranked.reverse()); assert.throws(() => { p.ranked[0].score = 0; }); assert.throws(() => result.query.loads.push({ id: 'c', load: 0 }));
  assert.throws(() => result.trials[0].sampled.pop()); assert.throws(() => { result.loadTelemetry.total = 'changed'; });
  assert.equal(Object.isFrozen(result.randomness), true); assert.equal(Object.isFrozen(PATH_POOL_LIMITS), true);
});

test('192 tiny graph/projection controls keep route advice outside certificate authority and compare any positives to M2', () => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => b !== a).map(b => [a, b])); let checked = 0;
  for (let bits = 0; bits < 64; bits++) for (const projection of ['directed', 'any', 'reciprocal']) {
    const graph = new DirectedGraph('pool-control'); nodes.forEach(id => graph.addNode(id)); arcs.forEach(([a, b], i) => { if (bits & (1 << i)) graph.addEdge(a, b); });
    const context = structuredClone(base); context.policy.maxHops = 2; context.policy.direction = projection === 'directed' ? 'directed-from-anchor' : 'undirected';
    context.policy.undirectedProjection = projection === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation';
    const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty: 2, anchors: ['a', 'b'] }], removed: [], standing: [] };
    const view = pathWitnessGraphView(graph, options), p = make([{ id: 'a', score: 2 }, { id: 'b', score: 1 }]), before = graph.toJSON();
    const route = routePathWitnessPool(p, query({ count: 2, viewId: view.view().id }));
    const bytes = encodePathWitness({ subject: 'u', epoch: 3, paths: route.selected.map(id => ['u', id]) }, context);
    const primary = verifyPathWitness(bytes, context, view), second = verifyPathWitnessRef2(bytes, context, view);
    assert.equal(primary.accepted, second.accepted);
    const exact = findPathWitness(view, context, { epoch: 3, maxExpansions: 100, maxPaths: 100, maxPackingSteps: 100 });
    if (primary.accepted) assert.equal(exact.status, 'found');
    assert.deepEqual(graph.toJSON(), before); assert.equal(Object.hasOwn(route, 'feasible'), false); checked++;
  }
  assert.equal(checked, 192);
});

test('stale/poisoned supplied pools remain advice, while current verification rejects dead routes and full M2 can find alternatives', () => {
  const graph = new DirectedGraph('pool-stale'); for (const id of ['u', 'a', 'b', 'c']) graph.addNode(id);
  for (const id of ['a', 'b', 'c']) graph.addEdge(id, 'u');
  const context = structuredClone(base), options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty: 2, anchors: ['a', 'b', 'c'] }], removed: [], standing: [] };
  const old = pathWitnessGraphView(graph, options), p = make([{ id: 'a', score: 900 }, { id: 'b', score: 800 }, { id: 'c', score: 0 }], 2);
  const q = query({ count: 2, viewId: old.view().id }), route = routePathWitnessPool(p, q), bytes = encodePathWitness({ subject: 'u', epoch: 3, paths: route.selected.map(id => ['u', id]) }, context);
  assert.equal(verifyPathWitness(bytes, context, old).accepted, true); graph.removeEdge(route.selected[0], 'u');
  const current = pathWitnessGraphView(graph, options); assert.deepEqual(routePathWitnessPool(p, q), route);
  for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(bytes, context, current).accepted, false);
  assert.equal(findPathWitness(current, context, { epoch: 3, maxExpansions: 100, maxPaths: 100, maxPackingSteps: 100 }).status, 'found');
});
