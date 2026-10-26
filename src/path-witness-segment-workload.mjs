// Owns: Supplied-frame segment/prefix/load lifecycle tapes and compact observations; excludes canonical authority, proof internals, whole-cache/fallback, preparation priming, timing and Model mutation.
import { createHash } from 'node:crypto';
import { PathWitnessSegmentCache, PATH_SEGMENT_LIMITS } from './path-witness-segments.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, repairPathWitnessTrees, proposePathWitnessFromSegments, PATH_TREE_LIMITS, PATH_TREE_REPAIR_LIMITS, PATH_SEGMENT_PROPOSAL_LIMITS } from './path-witness-trees.mjs';
import { routePathWitnessPool, PATH_POOL_LIMITS } from './path-witness-pool.mjs';
import { isPathWitnessView } from './path-witness-view.mjs';
import { pathWitnessContext } from './path-witness.mjs';
import { provenance } from './provenance.mjs';
export const PATH_SEGMENT_WORKLOAD_LIMITS = Object.freeze({ maxFrames: 16, maxSteps: 128, maxPoolsPerFrame: 64, maxLoadIds: 4096 });
const assumptions = ['Supplied capture/ledger/standing labels assume coherent lineage and facts, not authenticated personhood or funded authorization.', 'D1 preparation is inherited per supplied view object; exact work/proposal digests require equivalent aliasing/prior preparation history or fresh equivalent captures, not viewRoot alone.'];
const cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const natural = n => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);
const queryKeys = ['epoch', 'maxPrefixHops', 'maxPrefixes', 'maxExpansions', 'maxBranches', 'maxTreeLookups', 'maxCandidates', 'maxPackingSteps', 'tick', ...Object.keys(PATH_SEGMENT_PROPOSAL_LIMITS)];
function record(v) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('segment workload requires data records');
}
function fields(v, keys) {
  record(v); if (Reflect.ownKeys(v).length !== keys.length || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) throw new TypeError('segment workload requires exact fields');
}
function array(v, cap) {
  if (!Array.isArray(v) || ![Array.prototype, null].includes(Object.getPrototypeOf(v))) throw new TypeError('segment workload requires plain arrays');
  if (v.length > cap) throw new RangeError('segment workload array bound');
  if (Reflect.ownKeys(v).length !== v.length + 1 || Object.keys(v).length !== v.length) throw new TypeError('segment workload requires dense arrays');
  const copy = [];
  for (let i = 0; i < v.length; i++) { if (!Object.hasOwn(v, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v, i), 'value')) throw new TypeError('segment workload array holes/accessors'); copy.push(v[i]); }
  return copy;
}
function text(v, cap = 256) {
  if (typeof v !== 'string' || !v.length || !v.isWellFormed()) throw new TypeError('segment workload requires Unicode text');
  if (v.length > cap || Buffer.byteLength(v) > cap) throw new RangeError('segment workload text byte bound'); return v;
}
function config(v, keys, limits) {
  fields(v, keys); for (const k of keys) if (!natural(v[k]) || (!['epoch', 'tick'].includes(k) && v[k] > limits[k])) throw new RangeError('unsupported segment workload budget/epoch ' + k);
  return Object.fromEntries(keys.map(k => [k, v[k]]));
}
function add(a, b) { if (!natural(a) || !natural(b) || !Number.isSafeInteger(a + b)) throw new RangeError('segment workload counter overflow'); return a + b; }
function freeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; }
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function normalize(input) {
  fields(input, ['domain', 'segments', 'frames', 'steps']); const domain = text(input.domain);
  fields(input.segments, ['ledgerId', 'maxEntries', 'maxBytes', 'ttlTicks']);
  const segmentConfig = { ledgerId: text(input.segments.ledgerId), ...Object.fromEntries(['maxEntries', 'maxBytes', 'ttlTicks'].map(k => {
    const n = input.segments[k]; if (!natural(n) || n > PATH_SEGMENT_LIMITS[k] || (k === 'ttlTicks' && n === 0)) throw new RangeError('segment workload cache bound'); return [k, n];
  })) };
  const frames = new Map(), objects = new Map(), loadIds = new Set(), steps = [], ids = new Set(); let namespace = null, symbolic = null, lastTick = null;
  const preflight = { frames: 0, viewObjects: 0, steps: 0, poolRows: 0, retainedPoolEntries: 0, distinctLoadIds: 0, poolChecks: 0, querySteps: 0, putSteps: 0, invalidationSteps: 0, edgeNotices: 0, vertexNotices: 0 };
  for (const row of array(input.frames, PATH_SEGMENT_WORKLOAD_LIMITS.maxFrames)) {
    fields(row, ['id', 'view', 'pools']); const id = text(row.id); if (frames.has(id)) throw new TypeError('duplicate segment workload frame');
    if (!isPathWitnessView(row.view)) throw new TypeError('segment workload requires local immutable views');
    const data = row.view.toJSON(), policy = pathWitnessContext({ domain, subject: domain, policy: data.options.policy }).policy;
    const scope = { reference: row.view.capture.reference, storageName: data.source.storage.name };
    if (namespace && !equal(namespace, scope)) throw new TypeError('segment workload frame namespace differs'); namespace = scope;
    if (!objects.has(row.view)) objects.set(row.view, preflight.frames);
    const subjects = new Set(), pools = [];
    for (const r of array(row.pools, PATH_SEGMENT_WORKLOAD_LIMITS.maxPoolsPerFrame)) {
      fields(r, ['subject', 'pool']); const subject = pathWitnessContext({ domain, subject: r.subject, policy }).subject;
      if (subjects.has(subject)) throw new TypeError('duplicate segment workload pool subject'); subjects.add(subject);
      routePathWitnessPool(r.pool, { seed: 'workload-preflight', domain, viewId: row.view.view().id, epoch: data.options.currentEpoch, subject, queryId: 'workload-preflight', step: 0, start: 0, count: 0, mode: 'uniform', excluded: [], loads: null });
      preflight.poolChecks++; preflight.poolRows++; preflight.retainedPoolEntries += r.pool.ranked.length;
      for (const peer of r.pool.ranked) { loadIds.add(peer.id); if (loadIds.size > PATH_SEGMENT_WORKLOAD_LIMITS.maxLoadIds) throw new RangeError('segment workload load-ID bound'); }
      pools.push({ subject, pool: r.pool });
    }
    pools.sort((a, b) => cmp(a.subject, b.subject)); frames.set(id, { id, view: row.view, data, policy, pools, preparationGroup: objects.get(row.view) }); preflight.frames++;
  }
  for (const raw of array(input.steps, PATH_SEGMENT_WORKLOAD_LIMITS.maxSteps)) {
    record(raw); if (!['build', 'refresh', 'repair', 'query', 'put', 'invalidate'].includes(raw.op)) throw new TypeError('unsupported segment workload operation');
    fields(raw, raw.op === 'query' ? ['op', 'id', 'frame', 'subject', 'query', 'routing'] : raw.op === 'put' ? ['op', 'frame', 'subject', 'input'] : raw.op === 'invalidate' ? ['op', 'frame', 'notices'] : ['op', 'frame', 'query']);
    const frame = frames.get(text(raw.frame)); if (!frame) throw new TypeError('unknown segment workload frame'); let request, context = null;
    if (['query', 'put'].includes(raw.op)) {
      context = pathWitnessContext({ domain, subject: raw.subject, policy: frame.policy });
      fields(raw.op === 'put' ? raw.input : raw.query, raw.op === 'put' ? ['epoch', 'path', 'tick'] : queryKeys);
      const tick = raw.op === 'put' ? raw.input.tick : raw.query.tick;
      if (!natural(tick) || (lastTick !== null && tick < lastTick) || (raw.op === 'put' && tick > Number.MAX_SAFE_INTEGER - segmentConfig.ttlTicks)) throw new RangeError('segment workload declared clock/expiry'); lastTick = tick;
      if (raw.op === 'query') {
        const id = text(raw.id); if (ids.has(id)) throw new TypeError('duplicate segment workload query ID'); ids.add(id);
        const query = config(raw.query, queryKeys, { ...PATH_TREE_LIMITS, ...PATH_SEGMENT_PROPOSAL_LIMITS });
        if (query.maxPrefixHops > frame.policy.maxHops) throw new RangeError('segment workload prefix exceeds policy');
        fields(raw.routing, ['seed', 'step', 'mode']); const seed = text(raw.routing.seed, PATH_POOL_LIMITS.maxSeedBytes);
        if (!natural(raw.routing.step) || !['uniform', 'best-of-two'].includes(raw.routing.mode)) throw new TypeError('segment workload routing');
        if (symbolic && symbolic.frame.data.policyId !== frame.data.policyId) throw new TypeError('segment workload active query policy differs');
        request = { op: 'query', id, frame: frame.id, subject: context.subject, query, routing: { seed, step: raw.routing.step, mode: raw.routing.mode } }; preflight.querySteps++;
      } else {
        fields(raw.input, ['epoch', 'path', 'tick']); if (!natural(raw.input.epoch)) throw new RangeError('segment workload put epoch');
        const path = array(raw.input.path, frame.policy.maxHops + 1).map(id => text(id, frame.policy.maxIdBytes));
        if (!path.length || path[0] !== context.subject) throw new TypeError('segment workload put path differs from subject');
        request = { op: 'put', frame: frame.id, subject: context.subject, input: { epoch: raw.input.epoch, path, tick } }; preflight.putSteps++;
      }
    } else if (raw.op === 'invalidate') {
      fields(raw.notices, ['edges', 'vertices']);
      const edges = array(raw.notices.edges, PATH_SEGMENT_LIMITS.maxNotices).map(rawPair => { const pair = array(rawPair, 2); if (pair.length !== 2) throw new TypeError('segment workload edge needs two IDs'); return pair.map(id => text(id)); });
      const vertices = array(raw.notices.vertices, PATH_SEGMENT_LIMITS.maxNotices).map(id => text(id)); request = { op: 'invalidate', frame: frame.id, notices: { edges, vertices } };
      preflight.invalidationSteps++; preflight.edgeNotices += edges.length; preflight.vertexNotices += vertices.length;
    } else {
      const query = raw.op === 'repair' ? config(raw.query, ['epoch', 'maxTreeNodes', ...Object.keys(PATH_TREE_REPAIR_LIMITS)], { ...PATH_TREE_LIMITS, ...PATH_TREE_REPAIR_LIMITS }) : config(raw.query, ['epoch', 'maxExpansions', 'maxTreeNodes'], PATH_TREE_LIMITS);
      request = { op: raw.op, frame: frame.id, query };
      const available = frame.data.options.snapshots.some(s => s.epoch === query.epoch) && (raw.op === 'build' || (query.epoch <= frame.data.options.currentEpoch && frame.data.options.currentEpoch - query.epoch <= frame.policy.graceEpochs));
      symbolic = (raw.op === 'build' || symbolic) && available ? { frame, epoch: query.epoch } : null;
    }
    steps.push({ request, frame, context, expected: symbolic }); preflight.steps++;
  }
  preflight.viewObjects = objects.size; preflight.distinctLoadIds = loadIds.size; return { domain, segmentConfig, frames, steps, namespace, preflight, loadIds };
}
function describe(active) {
  if (!active) return null; const f = active.forest, m = f.meta;
  return { viewRoot: m.originRoot, policyId: m.policyId, epoch: m.epoch, reference: m.reference, status: m.status, reason: m.reason, complete: m.complete, eligibleRoots: f.anchors().length, retainedRoots: f.toJSON().parents.length, treeNodes: m.stats.treeNodes };
}
function maintenanceResult(status, reason, report = null) {
  const known = report && status !== 'unavailable', actions = known ? {} : null;
  if (known) for (const r of report.roots) actions[r.action] = add(actions[r.action] ?? 0, 1);
  return { status, reason, reset: report?.reset ?? null, deltaComplete: report?.deltaComplete ?? null, retiredRoots: known ? report.retired.length : null, rootActions: actions };
}
function stats(cache) {
  const s = PathWitnessSegmentCache.prototype.stats.call(cache);
  if (s.schema !== 'facety-segment-inventory/v1' || !equal(s.config, cache.config) || ['entries', 'bytes', 'endpointKeys', 'edgeKeys', 'vertexKeys'].some(k => !natural(s[k])) || (s.lastTick !== null && !natural(s.lastTick))
    || s.entries > cache.config.maxEntries || s.bytes > cache.config.maxBytes || !Array.isArray(s.records) || s.records.length !== s.entries || s.records.reduce((n, r) => add(n, r.bytes), 0) !== s.bytes) throw new Error('segment workload inventory disagreement');
  return s;
}
function nativeWork(w) { if (!w || Object.values(w).some(n => !natural(n))) throw new Error('segment workload native work disagreement'); }
function observe(raw, step, before, after, state, loadRowsBuilt) {
  const { frame, context, request } = step, found = raw.status === 'found', s = raw.segments;
  if (raw.schema !== 'facety-path-proposal/v1' || raw.canonicalReference !== frame.view.capture.reference || raw.viewRoot !== frame.view.view().id || !equal(raw.context, context) || !equal(raw.query, request.query)
    || !['found', 'miss', 'censored', 'unavailable'].includes(raw.status) || raw.feasible !== (found ? true : null) || !raw.prefix || s?.reference !== 'bounded-prefix-tree-segments/v1' || !equal(s.cache.config, before.config) || s.cache.initialTick !== before.lastTick) throw new Error('segment workload proposal scope disagreement');
  if (found && (typeof raw.wire !== 'string' || !raw.verification?.primary.accepted || !raw.verification?.ref2.accepted || raw.verification.primary.required !== raw.required || raw.verification.ref2.required !== raw.required
    || raw.witness?.epoch !== request.query.epoch || raw.witness.subject !== context.subject || raw.required !== frame.view.snapshot(request.query.epoch)?.difficulty)) throw new Error('segment workload positive disagreement');
  if (!found && (raw.wire !== null || raw.witness !== null || raw.verification !== null)) throw new Error('segment workload nonpositive proof disagreement');
  nativeWork(s.stats); nativeWork(s.work);
  if (s.stats.lookupCalls > s.stats.pairsExamined || s.stats.pairsExamined > request.query.maxSegmentLookups || s.work.checked > request.query.maxSegmentChecks || s.work.returned > request.query.maxSegmentResults || s.stats.consumedJoins !== s.joins.length || s.stats.consumedJoins > s.work.returned
    || s.stats.inventorySweepEntryUpperBound !== before.entries * s.stats.lookupCalls || after.entries !== before.entries - s.work.expired - s.work.evicted || after.bytes > before.bytes || (s.stats.lookupCalls ? after.lastTick !== request.query.tick : !equal(before, after))) throw new Error('segment workload query cache disagreement');
  const originals = new Map(before.records.map(r => [r.id, r])); let uses = 0;
  for (const r of after.records) {
    const old = originals.get(r.id); if (!old || ['bytes', 'originRoot', 'storedAt', 'expiresAt'].some(k => r[k] !== old[k]) || r.uses < old.uses) throw new Error('segment workload query retained metadata disagreement'); uses = add(uses, r.uses - old.uses);
  }
  if (uses !== s.work.returned) throw new Error('segment workload returned/use disagreement');
  const counts = new Map(); let offered = 0;
  for (const route of raw.prefix.routes) for (const id of route.selected) { if (!state.loadIds.has(id)) throw new Error('segment workload unknown selected peer'); counts.set(id, add(counts.get(id) ?? 0, 1)); offered = add(offered, 1); }
  if (offered !== raw.prefix.stats.routedPeers || raw.prefix.routes.length !== raw.prefix.stats.routeCalls || (raw.status === 'unavailable' && offered)) throw new Error('segment workload route counter disagreement');
  const loadDelta = [...counts].sort(([a], [b]) => cmp(a, b)).map(([id, selected]) => { const old = state.loads.get(id) ?? 0; return { id, before: old, selected, after: add(old, selected) }; });
  const json = JSON.stringify(raw), wire = found ? Buffer.from(raw.wire) : null;
  const result = { status: raw.status, reason: raw.reason, feasible: raw.feasible, required: raw.required, coverage: { prefix: raw.prefix.coverage, segments: s.coverage }, proposalDigest: createHash('sha256').update(json).digest('hex'), wireDigest: wire ? createHash('sha256').update(wire).digest('hex') : null, wireBytes: wire?.length ?? null, verification: found ? { primaryAccepted: true, ref2Accepted: true } : null };
  const work = { proposal: raw.stats, prefix: raw.prefix.stats, segments: { stats: s.stats, work: s.work }, accounting: { loadRowsBuilt, routeRowsFolded: raw.prefix.routes.length, selectedPeersFolded: offered, proposalBytesHashed: Buffer.byteLength(json) } };
  state.total = add(state.total, offered); for (const r of loadDelta) state.loads.set(r.id, r.after); return { result, work, loadDelta };
}
function summarizeLoads(state) {
  const rows = [...state.loads].sort(([a], [b]) => cmp(a, b)).map(([id, load]) => ({ id, load })); let total = 0n, squares = 0n, max = 0;
  for (const { load } of rows) { const n = BigInt(load); total += n; squares += n * n; max = Math.max(max, load); }
  if (total !== BigInt(state.total)) throw new Error('segment workload load total disagreement');
  return { unit: 'run-cumulative-route-selections/v1', total: state.total, distinct: rows.length, max, herfindahl: total === 0n ? null : Number(squares) / Number(total * total), rows };
}
export function runPathWitnessSegmentWorkload(input) {
  const n = normalize(input), cache = new PathWitnessSegmentCache(n.segmentConfig), state = { loads: new Map(), loadIds: n.loadIds, total: 0 }, rows = [];
  const totals = { operations: Object.fromEntries(['build', 'refresh', 'repair', 'query', 'put', 'invalidate'].map(k => [k, { requested: 0, called: 0, skipped: 0 }])), queries: { found: 0, miss: 0, censored: 0, unavailable: 0 }, puts: { stored: 0, 'not-stored': 0, rejected: 0, unavailable: 0 }, loads: null, segmentCalls: { puts: 0, invalidations: 0, lookups: 0, putSweepEntryUpperBound: 0, lookupSweepEntryUpperBound: 0 } }; let active = null;
  for (const [index, step] of n.steps.entries()) {
    const { request, frame } = step, activeBefore = describe(active), segmentsBefore = stats(cache), called = ['build', 'put', 'invalidate'].includes(request.op) || active !== null;
    const c = totals.operations[request.op]; c.requested = add(c.requested, 1); c[called ? 'called' : 'skipped'] = add(c[called ? 'called' : 'skipped'], 1);
    let result, work = null, loadDelta = [];
    if (request.op === 'query') {
      if (!called) result = { status: 'unavailable', reason: 'forest-missing', feasible: null, required: null, coverage: null, proposalDigest: null, wireDigest: null, wireBytes: null, verification: null };
      else {
        let loadRowsBuilt = 0; const pools = frame.pools.map(({ subject, pool }) => ({ subject, pool, loads: request.routing.mode === 'uniform' ? null : pool.ranked.map(({ id }) => { loadRowsBuilt++; return { id, load: state.loads.get(id) ?? 0 }; }) }));
        const raw = proposePathWitnessFromSegments(active.forest, frame.view, step.context, request.query, { pools, routing: { ...request.routing, queryId: request.id } }, cache);
        if (raw.forestRoot !== active.forest.meta.originRoot) throw new Error('segment workload query origin disagreement');
        ({ result, work, loadDelta } = observe(raw, step, segmentsBefore, stats(cache), state, loadRowsBuilt));
        totals.segmentCalls.lookups = add(totals.segmentCalls.lookups, raw.segments.stats.lookupCalls); totals.segmentCalls.lookupSweepEntryUpperBound = add(totals.segmentCalls.lookupSweepEntryUpperBound, raw.segments.stats.inventorySweepEntryUpperBound);
      }
      totals.queries[result.status] = add(totals.queries[result.status], 1);
    } else if (request.op === 'put') {
      const raw = PathWitnessSegmentCache.prototype.put.call(cache, frame.view, step.context, request.input), after = stats(cache); nativeWork(raw.work);
      if (raw.schema !== 'facety-segment-put/v1' || !['stored', 'not-stored', 'rejected', 'unavailable'].includes(raw.status) || !equal(raw.context, step.context) || !equal(raw.config, cache.config) || raw.currentRoot !== frame.view.view().id || raw.epoch !== request.input.epoch
        || after.lastTick !== request.input.tick || after.entries !== segmentsBefore.entries - raw.work.expired - raw.work.evicted - raw.work.refreshed + Number(raw.status === 'stored')
        || (raw.status === 'stored' ? !raw.segment || raw.segment.id !== raw.id || !equal(raw.segment.path, request.input.path) || !after.records.some(r => r.id === raw.id && r.bytes === raw.bytes) : raw.segment !== null)) throw new Error('segment workload put disagreement');
      result = { status: raw.status, reason: raw.reason, id: raw.id, bytes: raw.bytes }; work = { put: raw.work }; totals.puts[result.status] = add(totals.puts[result.status], 1); totals.segmentCalls.puts = add(totals.segmentCalls.puts, 1); totals.segmentCalls.putSweepEntryUpperBound = add(totals.segmentCalls.putSweepEntryUpperBound, segmentsBefore.entries);
    } else if (request.op === 'invalidate') {
      result = PathWitnessSegmentCache.prototype.invalidate.call(cache, request.notices); const after = stats(cache);
      fields(result, ['evicted', 'edgeNotices', 'vertexNotices']); nativeWork(result);
      const kept = new Set(after.records.map(r => r.id));
      if (result.edgeNotices !== request.notices.edges.length || result.vertexNotices !== request.notices.vertices.length || after.entries !== segmentsBefore.entries - result.evicted || after.lastTick !== segmentsBefore.lastTick
        || !equal(after.records, segmentsBefore.records.filter(r => kept.has(r.id)))) throw new Error('segment workload invalidation disagreement');
      work = { invalidation: result }; totals.segmentCalls.invalidations = add(totals.segmentCalls.invalidations, 1);
    } else if (!called) result = maintenanceResult('unavailable', 'forest-missing');
    else if (request.op === 'build') {
      const forest = buildPathWitnessTrees(frame.view, request.query); result = maintenanceResult(forest.meta.status, forest.meta.reason); work = { build: forest.meta.stats }; active = forest.meta.status === 'unavailable' ? null : { forest, frame };
    } else {
      const raw = (request.op === 'refresh' ? refreshPathWitnessTrees : repairPathWitnessTrees)(active.forest, active.frame.view, frame.view, request.query);
      result = maintenanceResult(raw.report.status, raw.report.reason, raw.report); work = { forest: raw.forest?.meta.stats ?? null, maintenance: raw.report.work }; active = raw.forest ? { forest: raw.forest, frame } : null;
    }
    const segmentsAfter = stats(cache);
    if (Boolean(active) !== Boolean(step.expected) || (active && (active.forest.meta.originRoot !== step.expected.frame.view.view().id || active.forest.meta.policyId !== step.expected.frame.data.policyId || active.forest.meta.epoch !== step.expected.epoch))) throw new Error('segment workload active state disagreement');
    if ((!called || !['query', 'put', 'invalidate'].includes(request.op)) && !equal(segmentsBefore, segmentsAfter)) throw new Error('segment workload inert operation changed cache');
    rows.push({ index, request, called, activeBefore, activeAfter: describe(active), segmentsBefore, segmentsAfter, result, work, loadDelta });
  }
  totals.loads = summarizeLoads(state);
  if (Object.values(totals.queries).reduce(add, 0) !== totals.operations.query.requested || Object.values(totals.puts).reduce(add, 0) !== totals.operations.put.called || totals.segmentCalls.puts !== totals.operations.put.called || totals.segmentCalls.invalidations !== totals.operations.invalidate.called || rows.length !== n.preflight.steps) throw new Error('segment workload operation total disagreement');
  return freeze({ schema: 'facety-path-segment-workload/v1', reference: 'bounded-prefix-segment-route-load/v1', provenance: provenance(), assumptions: [...assumptions], domain: n.domain, namespace: n.namespace, segmentConfig: n.segmentConfig,
    frames: [...n.frames.values()].map(f => ({ id: f.id, viewRoot: f.view.view().id, policyId: f.data.policyId, currentEpoch: f.data.options.currentEpoch, preparationGroup: f.preparationGroup, pools: f.pools.map(r => ({ subject: r.subject, poolId: r.pool.id })) })), preflight: n.preflight, rows, totals, finalForest: describe(active), finalSegments: stats(cache) });
}
