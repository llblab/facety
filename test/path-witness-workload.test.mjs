import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { Random } from '../src/random.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { createPathWitnessPool } from '../src/path-witness-pool.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, repairPathWitnessTrees, proposePathWitnessFromPrefixes } from '../src/path-witness-trees.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { runPathWitnessWorkload, PATH_WORKLOAD_LIMITS } from '../src/path-witness-workload.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const build = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 }, repair = { epoch: 3, maxTreeNodes: 1000, maxQueuePops: 10000, maxPredecessorTrials: 10000, maxScheduleTrials: 10000, maxLabelUpdates: 10000 };
const query = { epoch: 3, maxPrefixHops: 1, maxPrefixes: 1, maxExpansions: 1000, maxBranches: 2, maxTreeLookups: 0, maxCandidates: 256, maxPackingSteps: 10000 }, oracle = { epoch: 3, maxExpansions: 10000, maxPaths: 256, maxPackingSteps: 10000 };
const cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)), hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture(nodes = ['u', 'x', 'y', 'a', 'b'], edges = [['a', 'x'], ['x', 'u'], ['b', 'y'], ['y', 'u']], anchors = ['a', 'b'], patch = {}, name = 'workload-test') {
  const graph = new DirectedGraph(name); nodes.forEach(n => graph.addNode(n)); edges.forEach(([a, b]) => graph.addEdge(a, b)); const policy = { ...base.policy, maxHops: 3, ...patch };
  const options = { policy, currentEpoch: 3, snapshots: [{ epoch: 3, anchors, difficulty: 1 }], removed: [], standing: [] };
  return { graph, options, view: () => pathWitnessGraphView(graph, options) };
}
const pool = ids => createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 64, candidates: ids.map(id => ({ id, score: 0 })) });
const frame = (id, view, pools = [{ subject: 'u', pool: pool(['x', 'y']) }]) => ({ id, view, pools });
const q = (id, target = 'old', patch = {}, mode = 'uniform', subject = 'u') => ({ op: 'query', id, frame: target, subject, query: { ...query, ...patch }, routing: { seed: 'workload-software-control', step: 0, mode } });
const operation = (op, target = 'old', patch = {}) => ({ op, frame: target, query: { ...(op === 'repair' ? repair : build), ...patch } });
function describe(forest) {
  if (!forest) return null; const m = forest.meta;
  return { viewRoot: m.originRoot, policyId: m.policyId, epoch: m.epoch, reference: m.reference, status: m.status, reason: m.reason, complete: m.complete, eligibleRoots: forest.anchors().length, retainedRoots: forest.toJSON().parents.length, treeNodes: m.stats.treeNodes };
}
// Independent ordered caller tape: direct old APIs, own origin and occurrence ledger, no workload normalizer/state/projection helpers.
function reference(input) {
  const frames = new Map(input.frames.map(f => [f.id, f])), loads = Object.create(null), expected = [], originals = []; let forest = null, origin = null;
  for (const [index, request] of input.steps.entries()) {
    const f = frames.get(request.frame), before = describe(forest), called = request.op === 'build' || forest !== null; let result, work = null, delta = [];
    if (request.op === 'query') {
      if (!forest) result = { status: 'unavailable', reason: 'forest-missing', feasible: null, required: null, coverage: null, proposalDigest: null, wireDigest: null, wireBytes: null, verification: null };
      else {
        const ps = [...f.pools].sort((a, b) => cmp(a.subject, b.subject)); let n = 0;
        const source = proposePathWitnessFromPrefixes(forest, f.view, { domain: input.domain, subject: request.subject, policy: f.view.toJSON().options.policy }, request.query,
          { pools: ps.map(r => ({ ...r, loads: request.routing.mode === 'uniform' ? null : r.pool.ranked.map(({ id }) => { n++; return { id, load: loads[id] || 0 }; }) })), routing: { ...request.routing, queryId: request.id } });
        originals.push({ request, source, view: f.view }); const occurrences = source.prefix.routes.flatMap(row => row.selected), ids = [...new Set(occurrences)].sort(cmp);
        delta = ids.map(id => { const selected = occurrences.filter(v => v === id).length, before = loads[id] || 0; loads[id] = before + selected; return { id, before, selected, after: loads[id] }; });
        result = { status: source.status, reason: source.reason, feasible: source.feasible, required: source.required, coverage: source.prefix.coverage, proposalDigest: hash(source), wireDigest: source.wire === null ? null : createHash('sha256').update(source.wire).digest('hex'), wireBytes: source.wire === null ? null : Buffer.byteLength(source.wire), verification: source.status === 'found' ? { primaryAccepted: true, ref2Accepted: true } : null };
        work = { proposal: source.stats, prefix: source.prefix.stats, accounting: { loadRowsBuilt: n, routeRowsFolded: source.prefix.routes.length, selectedPeersFolded: occurrences.length, proposalBytesHashed: Buffer.byteLength(JSON.stringify(source)) } };
      }
    } else if (!called) result = { status: 'unavailable', reason: 'forest-missing', reset: null, deltaComplete: null, retiredRoots: null, rootActions: null };
    else if (request.op === 'build') {
      const raw = buildPathWitnessTrees(f.view, request.query); work = { build: raw.meta.stats }; result = { status: raw.meta.status, reason: raw.meta.reason, reset: null, deltaComplete: null, retiredRoots: null, rootActions: null }; forest = raw.meta.status === 'unavailable' ? null : raw; origin = forest ? f.view : null;
    } else {
      const raw = (request.op === 'refresh' ? refreshPathWitnessTrees : repairPathWitnessTrees)(forest, origin, f.view, request.query), r = raw.report;
      const actions = r.status === 'unavailable' ? null : Object.fromEntries([...new Set(r.roots.map(x => x.action))].map(action => [action, r.roots.filter(x => x.action === action).length]));
      result = { status: r.status, reason: r.reason, reset: r.reset, deltaComplete: r.deltaComplete, retiredRoots: r.status === 'unavailable' ? null : r.retired.length, rootActions: actions }; work = { forest: raw.forest?.meta.stats ?? null, maintenance: r.work }; forest = raw.forest; origin = forest ? f.view : null;
    }
    expected.push({ index, request, called, activeBefore: before, activeAfter: describe(forest), result, work, loadDelta: delta });
  }
  return { expected, loads, originals, finalForest: describe(forest) };
}
function checked(input) {
  const before = hash(input), actual = runPathWitnessWorkload(input), ref = reference(input); assert.deepEqual(actual.rows, ref.expected); assert.deepEqual(actual.finalForest, ref.finalForest); assert.equal(hash(input), before);
  const loadRows = Object.keys(ref.loads).sort(cmp).map(id => ({ id, load: ref.loads[id] })); assert.deepEqual(actual.totals.loads.rows, loadRows); assert.equal(actual.totals.loads.total, loadRows.reduce((n, r) => n + r.load, 0));
  for (const op of ['build', 'refresh', 'repair', 'query']) { const rows = actual.rows.filter(r => r.request.op === op); assert.deepEqual(actual.totals.operations[op], { requested: rows.length, called: rows.filter(r => r.called).length, skipped: rows.filter(r => !r.called).length }); }
  for (const status of ['found', 'miss', 'censored', 'unavailable']) assert.equal(actual.totals.queries[status], actual.rows.filter(r => r.request.op === 'query' && r.result.status === status).length);
  for (const { request, source, view } of ref.originals) if (source.status === 'found') {
    const context = { domain: input.domain, subject: request.subject, policy: view.toJSON().options.policy };
    assert.equal(findPathWitness(view, context, { ...oracle, epoch: request.query.epoch }).status, 'found'); for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(source.wire), context, view).accepted, true);
  }
  assert.ok(Object.isFrozen(actual.rows) && Object.isFrozen(actual.totals.loads.rows)); assert.equal(JSON.stringify(actual).includes('"wire":'), false); assert.equal(JSON.stringify(actual).includes('"parents":'), false);
  return actual;
}

test('manual tape matches every compact row/current binding/load snapshot/status and explicit availability clearing/recovery', () => {
  const f = fixture(), old = frame('old', f.view()); f.graph.removeEdge('a', 'x'); f.graph.addEdge('a', 'u'); const current = frame('new', f.view(), [{ subject: 'u', pool: pool(['a', 'x', 'y']) }]); f.options.snapshots = []; const absent = frame('missing', f.view(), current.pools);
  const input = { domain: base.domain, frames: [old, current, absent], steps: [q('before'), operation('refresh'), operation('build'), q('cut'), q('lag1', 'old', { maxBranches: 1 }, 'best-of-two'), q('lag2', 'old', { maxBranches: 1 }, 'best-of-two'), operation('refresh', 'new'), q('positive', 'new', { maxPrefixes: 8, maxTreeLookups: 16 }), operation('repair', 'new'), q('unavailable', 'missing'), operation('repair', 'missing'), q('cleared', 'new'), operation('refresh', 'new'), operation('build', 'new'), q('recovered', 'new', { maxTreeLookups: 16 })] };
  const r = checked(input); assert.deepEqual(r.rows[3].loadDelta.map(x => [x.id, x.selected]), [['x', 1], ['y', 1]]); assert.equal(r.rows[3].work.prefix.queued, 1); assert.deepEqual(r.rows[4].loadDelta, [{ id: 'x', before: 1, selected: 1, after: 2 }]); assert.deepEqual(r.rows[5].loadDelta, [{ id: 'y', before: 1, selected: 1, after: 2 }]);
  assert.equal(r.rows[9].called, true); assert.equal(r.rows[9].work.accounting.selectedPeersFolded, 0); assert.notEqual(r.rows[9].activeAfter, null); assert.equal(r.rows[10].activeAfter, null); assert.equal(r.rows[11].called, false); assert.equal(r.rows[11].work, null); assert.equal(r.rows[14].result.status, 'found');
  assert.deepEqual(r.frames.map(x => x.viewRoot), input.frames.map(x => x.view.view().id));
});

test('all64 graph states ×3 projections ×2 score profiles agree with direct tapes and M2/dual positives', t => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => b !== a).map(b => [a, b])); let tapes = 0;
  for (const projection of ['directed', 'any', 'reciprocal']) for (const scored of [false, true]) for (let bits = 0; bits < 64; bits++) {
    const f = fixture(nodes, arcs.filter((_, i) => bits & (1 << i)), ['a', 'b'], { maxHops: 2, minStanding: scored ? 1 : null, direction: projection === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: projection === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' }); f.options.standing = [['a', 0], ['b', 1]];
    const rows = nodes.map(subject => ({ subject, pool: pool(nodes) })), before = frame('old', f.view(), rows); f.options.standing = [['a', 1], ['b', 0]]; const after = frame('new', f.view(), rows);
    checked({ domain: base.domain, frames: [before, after], steps: [operation('build'), q('first', 'old', { maxPrefixes: 16, maxTreeLookups: 64 }), operation('repair', 'new'), q('next', 'new', { maxPrefixes: 16, maxTreeLookups: 64 }, 'best-of-two'), operation('refresh', 'new'), q('final', 'new', { maxBranches: 0, maxTreeLookups: 64 })] }); tapes++;
  }
  assert.equal(tapes, 384); t.diagnostic('workload-manual-controls ' + JSON.stringify({ tapes, queryRows: tapes * 3, observedMismatch: 0 }));
});

test('alternate-prefix offers repeat; lagged best-of-two counts all nonpositive queries; zero offers can have nonzero work', () => {
  const f = fixture(['u', 'x', 'y', 'z', 'a'], [['x', 'u'], ['y', 'u'], ['z', 'x'], ['z', 'y'], ['a', 'z']], ['a']), rows = [{ subject: 'y', pool: pool(['z']) }, { subject: 'u', pool: pool(['x', 'y']) }, { subject: 'x', pool: pool(['z']) }];
  const r = checked({ domain: base.domain, frames: [frame('old', f.view(), rows)], steps: [operation('build'), q('alternates', 'old', { maxPrefixes: 16, maxPrefixHops: 2 }, 'best-of-two'), q('zero', 'old', { maxBranches: 0 }, 'best-of-two')] });
  assert.deepEqual(r.rows[1].loadDelta.map(x => [x.id, x.selected]), [['x', 1], ['y', 1], ['z', 2]]); assert.equal(r.rows[1].result.feasible, null); assert.equal(r.rows[2].work.prefix.routeCalls, 1); assert.ok(r.rows[2].work.prefix.neighborTrials > 0); assert.deepEqual(r.rows[2].loadDelta, []); assert.equal(r.totals.loads.herfindahl, 6 / 16);
  assert.deepEqual(r.frames[0].pools.map(r => r.subject), ['u', 'x', 'y']);
});

test('valid future append and uniform unrelated requests preserve source keys/digests; best-of-two legitimately depends on prior load', () => {
  const f = fixture(), frames = [frame('old', f.view())], first = { domain: base.domain, frames, steps: [operation('build'), q('stable')] }, a = checked(first);
  const future = checked({ ...first, frames: [...frames, frame('future', f.view(), [{ subject: 'unused', pool: pool(['future-peer']) }])], steps: [...first.steps, q('future')] }); assert.deepEqual(future.rows.slice(0, 2), a.rows);
  const unrelated = checked({ ...first, steps: [operation('build'), q('unrelated'), q('stable')] }); assert.equal(unrelated.rows[2].result.proposalDigest, a.rows[1].result.proposalDigest); assert.notDeepEqual(unrelated.rows[2].loadDelta, a.rows[1].loadDelta);
  const alone = checked({ ...first, steps: [operation('build'), q('choice', 'old', { maxBranches: 1 }, 'best-of-two')] }), loaded = checked({ ...first, steps: [operation('build'), q('prior', 'old', { maxBranches: 1 }, 'best-of-two'), q('choice', 'old', { maxBranches: 1 }, 'best-of-two')] }); assert.equal(alone.rows[1].loadDelta[0].id, 'x'); assert.equal(loaded.rows[2].loadDelta[0].id, 'y');
});

test('censored forests remain usable; explicit rebuild/epoch/policy resets retain load window rather than issuing authority', () => {
  const f = fixture(), old = frame('old', f.view()); f.options.currentEpoch = 4; f.options.snapshots.push({ epoch: 4, anchors: ['a', 'b'], difficulty: 1 }); const newer = frame('epoch', f.view()); f.options.policy = { ...f.options.policy, maxHops: 2 }; const policy = frame('policy', f.view());
  const r = checked({ domain: base.domain, frames: [old, newer, policy], steps: [operation('build', 'old', { maxTreeNodes: 0 }), q('bounded'), operation('repair', 'old'), q('offers'), operation('repair', 'epoch', { epoch: 4 }), operation('refresh', 'policy', { epoch: 4 }), q('changed', 'policy', { epoch: 4 })] }); assert.equal(r.rows[0].activeAfter.complete, false); assert.equal(r.rows[2].result.reset, 'input-incomplete'); assert.equal(r.rows[4].result.reset, 'epoch-changed'); assert.equal(r.rows[5].result.reset, 'policy-changed'); assert.ok(r.rows[6].loadDelta.every(x => x.before > 0));
  // Legacy builder does not impose grace; query and refresh do.
  f.options.currentEpoch = 8; const stale = frame('stale', f.view()); const out = checked({ domain: base.domain, frames: [stale], steps: [operation('build', 'stale'), q('old-epoch', 'stale'), operation('refresh', 'stale')] }); assert.equal(out.rows[0].activeAfter.status, 'built'); assert.equal(out.rows[1].result.reason, 'epoch-outside-grace'); assert.equal(out.rows[2].activeAfter, null);
});

test('whole-input preflight rejects invalid unused/future data and known policy flow before any query draws', () => {
  const f = fixture(), old = frame('old', f.view()), good = { domain: base.domain, frames: [old], steps: [operation('build'), q('valid')] }, prior = Random.prototype.int; let draws = 0;
  Random.prototype.int = function() { draws++; throw new Error('query executed before preflight completed'); };
  try {
    assert.throws(() => runPathWitnessWorkload({ ...good, steps: [...good.steps, q('bad', 'old', { maxPrefixes: 4097 })] }), /budget/);
    assert.throws(() => runPathWitnessWorkload({ ...good, frames: [...good.frames, { ...old, id: 'future', view: { ...old.view } }] }), /immutable/);
    f.options.policy = { ...f.options.policy, maxHops: 2 }; const other = frame('policy', f.view()); assert.throws(() => runPathWitnessWorkload({ ...good, frames: [old, other], steps: [...good.steps, q('policy', 'policy')] }), /policy differs/);
    assert.equal(draws, 0);
  } finally { Random.prototype.int = prior; }
  assert.throws(() => runPathWitnessWorkload({ ...good, steps: [...good.steps, q('valid')] }), /duplicate.*query/);
  for (const value of [-0, -1, 0.5, NaN, Infinity, null, '0', true]) assert.throws(() => runPathWitnessWorkload({ ...good, steps: [q('bad', 'old', { epoch: value })] }));
  for (const raw of [{ ...q('bad'), loads: [] }, { ...operation('build'), op: 'oracle' }, { ...q('bad'), frame: 'unknown' }, { ...q('bad'), routing: { seed: 's', step: -0, mode: 'uniform' } }]) assert.throws(() => runPathWitnessWorkload({ ...good, steps: [raw] }));
  let reads = 0; const getter = { ...q('getter') }; Object.defineProperty(getter, 'op', { enumerable: true, get() { reads++; return 'query'; } }); assert.throws(() => runPathWitnessWorkload({ ...good, steps: [getter] })); assert.equal(reads, 0);
  const sparse = Array(1); assert.throws(() => runPathWitnessWorkload({ ...good, steps: sparse })); const symbol = { ...good, [Symbol()]: 1 }; assert.throws(() => runPathWitnessWorkload(symbol));
  const copied = { ...old, pools: [{ subject: 'u', pool: { ...old.pools[0].pool } }] }; assert.throws(() => runPathWitnessWorkload({ ...good, frames: [copied] }), /locally constructed/);
  const foreign = fixture(undefined, undefined, undefined, {}, 'foreign'); assert.throws(() => runPathWitnessWorkload({ ...good, frames: [...good.frames, frame('foreign', foreign.view())] }), /namespace/);
  assert.throws(() => runPathWitnessWorkload({ ...good, frames: [old, old] }), /duplicate.*frame/); assert.throws(() => runPathWitnessWorkload({ ...good, frames: [{ ...old, pools: [...old.pools, ...old.pools] }] }), /duplicate.*subject/);
  for (const domain of ['', '\ud800', 'é'.repeat(33)]) assert.throws(() => runPathWitnessWorkload({ ...good, domain }));
  for (const step of [{ ...q('bad'), id: 'é'.repeat(129) }, { ...q('bad'), subject: 'é'.repeat(33) }, { ...q('bad'), routing: { ...q('bad').routing, seed: 's'.repeat(1025) } }, { ...q('bad'), routing: { ...q('bad').routing, step: Number.MAX_SAFE_INTEGER + 1 } }]) assert.throws(() => runPathWitnessWorkload({ ...good, steps: [step] }));
  for (const key of Object.keys(query)) { const bad = q('missing'); delete bad.query[key]; assert.throws(() => runPathWitnessWorkload({ ...good, steps: [bad] })); }
  const edge = q('é'.repeat(128)); edge.routing.seed = 's'.repeat(1024); edge.routing.step = Number.MAX_SAFE_INTEGER; assert.equal(runPathWitnessWorkload({ ...good, steps: [edge] }).rows.length, 1);
});

test('zero/exact/one-more outer bounds include unused frame pools and full raw load-ID union', () => {
  const f = fixture(), view = f.view(), simple = frame('old', view), empty = runPathWitnessWorkload({ domain: base.domain, frames: [], steps: [] }); assert.equal(empty.namespace, null); assert.equal(empty.totals.loads.herfindahl, null); assert.equal(empty.totals.loads.max, 0); assert.equal(empty.finalForest, null);
  const frames = Array.from({ length: 16 }, (_, i) => frame('f' + i, view, [])); assert.equal(runPathWitnessWorkload({ domain: base.domain, frames, steps: [] }).preflight.frames, 16); assert.throws(() => runPathWitnessWorkload({ domain: base.domain, frames: [...frames, frame('overflow', view, [])], steps: [] }));
  const steps = Array.from({ length: 128 }, (_, i) => q('q' + i)); assert.equal(runPathWitnessWorkload({ domain: base.domain, frames: [simple], steps }).rows.length, 128); assert.throws(() => runPathWitnessWorkload({ domain: base.domain, frames: [simple], steps: [...steps, q('extra')] }));
  const pools = Array.from({ length: 64 }, (_, i) => ({ subject: 's' + i, pool: pool(Array.from({ length: 64 }, (_, j) => 'p' + (i * 64 + j))) })); const exact = { domain: base.domain, frames: [frame('old', view, pools)], steps: [] }; assert.equal(runPathWitnessWorkload(exact).preflight.distinctLoadIds, 4096);
  assert.throws(() => runPathWitnessWorkload({ ...exact, frames: [frame('old', view, [...pools, { subject: 'extra', pool: pool([]) }])] })); assert.throws(() => runPathWitnessWorkload({ ...exact, frames: [...exact.frames, frame('extra', view, [{ subject: 'u', pool: pool(['p4096']) }])] }), /load-ID/);
  assert.deepEqual(PATH_WORKLOAD_LIMITS, { maxFrames: 16, maxSteps: 128, maxPoolsPerFrame: 64, maxLoadIds: 4096 });
});

test('source execution errors propagate, fresh repeat does not retain partial state, report/inputs are immutable and compact', () => {
  const f = fixture(), input = { domain: base.domain, frames: [frame('old', f.view())], steps: [operation('build'), q('actual')] }, before = hash(input), prior = Random.prototype.int; let calls = 0;
  Random.prototype.int = function() { calls++; throw new Error('deliberate source failure'); };
  try { assert.throws(() => runPathWitnessWorkload(input), /deliberate source failure/); assert.ok(calls > 0); } finally { Random.prototype.int = prior; }
  const weird = fixture(['u', 'a', '__proto__', 'constructor'], [['a', '__proto__'], ['__proto__', 'u'], ['constructor', 'u']], ['a']);
  const special = checked({ domain: base.domain, frames: [frame('__proto__', weird.view(), [{ subject: 'u', pool: pool(['__proto__', 'constructor']) }])], steps: [operation('build', '__proto__'), q('constructor', '__proto__')] }); assert.equal(special.totals.loads.total, 2);
  const a = checked(input), b = checked(input); assert.deepEqual(a, b); assert.equal(hash(input), before); assert.throws(() => a.rows.pop()); assert.throws(() => a.rows[1].loadDelta[0].after++); assert.throws(() => a.frames[0].pools.pop()); assert.ok(structuredClone(a));
});

test('r64 Unicode/D64 and Native read-only captures use original certificate checks without Model economic integration', () => {
  const ids = ['u', ...Array.from({ length: 63 }, (_, i) => 'é\0' + i), 'a'], f = fixture(ids, ids.slice(1).map((a, i) => [a, ids[i]]), ['a'], { maxHops: 64 });
  const long = checked({ domain: base.domain, frames: [frame('old', f.view(), [])], steps: [operation('build'), q('long', 'old', { maxPrefixHops: 64, maxBranches: 0, maxTreeLookups: 64 })] }); assert.equal(long.rows[1].result.status, 'found');
  const anchors = Array.from({ length: 65 }, (_, i) => 'a' + i), star = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), anchors, { maxHops: 1, maxDifficulty: 64 }); star.options.snapshots[0].difficulty = 64;
  const many = checked({ domain: base.domain, frames: [frame('old', star.view(), [])], steps: [operation('build'), q('D64', 'old', { maxBranches: 0, maxTreeLookups: 128 })] }); assert.equal(many.rows[1].activeAfter.eligibleRoots, 65); assert.equal(many.rows[1].result.status, 'found');
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); m.confirmGuarantee('u', m.proposeGuarantee('a', 'u')); const options = fixture(['u', 'a', 'b'], [], ['a', 'b']).options, old = capturePathWitnessModelView(m, options); m.confirmGuarantee('u', m.proposeGuarantee('b', 'u')); const current = capturePathWitnessModelView(m, options), before = hash([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]);
  const native = checked({ domain: base.domain, frames: [frame('old', old, []), frame('new', current, [])], steps: [operation('build'), operation('repair', 'new'), q('native', 'new', { maxBranches: 0, maxTreeLookups: 64 })] }); assert.equal(native.rows[2].result.status, 'found'); assert.equal(hash([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
});
