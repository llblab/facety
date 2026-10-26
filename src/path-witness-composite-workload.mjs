// Owns: Supplied-frame joint cache/segment/forest/offer lifetimes and compact native observations; excludes canonical authority, old API policy, priming, production persistence, cost claims and Model mutation.
import { createHash } from 'node:crypto';
import { PathWitnessCache, PATH_CACHE_LIMITS } from './path-witness-cache.mjs';
import { PathWitnessSegmentCache, PATH_SEGMENT_LIMITS } from './path-witness-segments.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, repairPathWitnessTrees, PATH_TREE_LIMITS, PATH_TREE_REPAIR_LIMITS, PATH_SEGMENT_PROPOSAL_LIMITS, PATH_UNION_LIMITS } from './path-witness-trees.mjs';
import { routePathWitnessPool, PATH_POOL_LIMITS } from './path-witness-pool.mjs';
import { isPathWitnessView } from './path-witness-view.mjs';
import { pathWitnessContext } from './path-witness.mjs';
import { queryPathWitnessComposite } from './path-witness-composite.mjs';
import { invalidatePathWitnessCaches } from './path-witness-invalidation.mjs';
import { PATH_ORACLE_LIMITS } from './path-witness-oracle.mjs';
import { provenance } from './provenance.mjs';
export const PATH_COMPOSITE_WORKLOAD_LIMITS = Object.freeze({ maxFrames: 16, maxSteps: 128, maxPoolsPerFrame: 64, maxLoadIds: 4096 });
const assumptions = ['Supplied capture/ledger/standing labels assume coherent lineage and facts, not authenticated personhood or funded authorization.', 'D1 preparation is inherited per supplied view object; exact work/proposal digests require equivalent aliasing/prior preparation history or fresh equivalent captures, not viewRoot alone.'];
const operations = ['build', 'refresh', 'repair', 'query', 'put', 'invalidate'];
const prefixKeys = ['epoch', 'maxPrefixHops', 'maxPrefixes', 'maxExpansions', 'maxBranches', 'maxTreeLookups', 'maxCandidates', 'maxPackingSteps', 'tick', ...Object.keys(PATH_SEGMENT_PROPOSAL_LIMITS)];
const natural = n => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0), same = (a, b) => JSON.stringify(a) === JSON.stringify(b), cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function add(a, b) { if (!natural(a) || !natural(b) || !Number.isSafeInteger(a + b)) throw new RangeError('composite workload counter overflow'); return a + b; }
function record(v) { if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('composite workload requires data records'); }
function fields(v, keys) { record(v); if (Reflect.ownKeys(v).length !== keys.length || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) throw new TypeError('composite workload requires exact fields'); }
function array(v, cap) {
  if (!Array.isArray(v) || ![Array.prototype, null].includes(Object.getPrototypeOf(v))) throw new TypeError('composite workload requires plain arrays');
  if (v.length > cap) throw new RangeError('composite workload array bound');
  if (Reflect.ownKeys(v).length !== v.length + 1 || Object.keys(v).length !== v.length) throw new TypeError('composite workload requires dense arrays');
  const out = []; for (let i = 0; i < v.length; i++) { if (!Object.hasOwn(v, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v, i), 'value')) throw new TypeError('composite workload array holes/accessors'); out.push(v[i]); } return out;
}
function text(v, cap = 256) { if (typeof v !== 'string' || !v.length || !v.isWellFormed()) throw new TypeError('composite workload requires Unicode text'); if (v.length > cap || Buffer.byteLength(v) > cap) throw new RangeError('composite workload text byte bound'); return v; }
function config(v, keys, limits) { fields(v, keys); for (const k of keys) if (!natural(v[k]) || (!['epoch', 'tick'].includes(k) && v[k] > limits[k])) throw new RangeError('unsupported composite workload budget/epoch ' + k); return Object.fromEntries(keys.map(k => [k, v[k]])); }
function cacheConfig(v, limits, segment = false) {
  fields(v, segment ? ['ledgerId', 'maxEntries', 'maxBytes', 'ttlTicks'] : ['maxEntries', 'maxBytes', 'ttlTicks']);
  return { ...(segment ? { ledgerId: text(v.ledgerId) } : {}), ...Object.fromEntries(['maxEntries', 'maxBytes', 'ttlTicks'].map(k => { if (!natural(v[k]) || v[k] > limits[k] || (k === 'ttlTicks' && !v[k])) throw new RangeError('composite workload cache bound'); return [k, v[k]]; })) };
}
function notice(v, name) { fields(v, ['edges', name]); return { edges: array(v.edges, 4096).map(raw => { const p = array(raw, 2); if (p.length !== 2) throw new TypeError('composite workload notice needs two IDs'); return p.map(id => text(id)); }), [name]: array(v[name], 4096).map(id => text(id)) }; }
function normalize(input) {
  fields(input, ['domain', 'whole', 'segments', 'frames', 'steps']); const domain = text(input.domain), wholeConfig = cacheConfig(input.whole, PATH_CACHE_LIMITS), segmentConfig = cacheConfig(input.segments, PATH_SEGMENT_LIMITS, true);
  const frames = new Map(), objects = new Map(), loadIds = new Set(), ids = new Set(), steps = []; let namespace = null, symbolic = null, lastTick = null;
  const preflight = { frames: 0, viewObjects: 0, steps: 0, poolRows: 0, retainedPoolEntries: 0, distinctLoadIds: 0, poolChecks: 0, querySteps: 0, putSteps: 0, invalidationSteps: 0, wholeEdgeNotices: 0, wholeAnchorNotices: 0, segmentEdgeNotices: 0, segmentVertexNotices: 0 };
  for (const r of array(input.frames, PATH_COMPOSITE_WORKLOAD_LIMITS.maxFrames)) {
    fields(r, ['id', 'view', 'pools']); const id = text(r.id); if (frames.has(id)) throw new TypeError('duplicate composite workload frame'); if (!isPathWitnessView(r.view)) throw new TypeError('composite workload requires local immutable views');
    const data = r.view.toJSON(), policy = pathWitnessContext({ domain, subject: domain, policy: data.options.policy }).policy, scope = { reference: r.view.capture.reference, storageName: data.source.storage.name };
    if (namespace && !same(namespace, scope)) throw new TypeError('composite workload frame namespace differs'); namespace = scope; if (!objects.has(r.view)) objects.set(r.view, preflight.frames);
    const subjects = new Set(), pools = [];
    for (const row of array(r.pools, PATH_COMPOSITE_WORKLOAD_LIMITS.maxPoolsPerFrame)) {
      fields(row, ['subject', 'pool']); const subject = pathWitnessContext({ domain, subject: row.subject, policy }).subject; if (subjects.has(subject)) throw new TypeError('duplicate composite workload pool subject'); subjects.add(subject);
      const checked = routePathWitnessPool(row.pool, { seed: 'workload-preflight', domain, viewId: r.view.view().id, epoch: data.options.currentEpoch, subject, queryId: 'workload-preflight', step: 0, start: 0, count: 0, mode: 'uniform', excluded: [], loads: null });
      preflight.poolChecks++; preflight.poolRows++; preflight.retainedPoolEntries += checked.pool.ranked.length;
      for (const peer of checked.pool.ranked) { loadIds.add(peer.id); if (loadIds.size > PATH_COMPOSITE_WORKLOAD_LIMITS.maxLoadIds) throw new RangeError('composite workload load-ID bound'); }
      pools.push({ subject, pool: checked.pool });
    }
    pools.sort((a, b) => cmp(a.subject, b.subject)); frames.set(id, { id, view: r.view, data, policy, pools, preparationGroup: objects.get(r.view) }); preflight.frames++;
  }
  for (const raw of array(input.steps, PATH_COMPOSITE_WORKLOAD_LIMITS.maxSteps)) {
    record(raw); if (!operations.includes(raw.op)) throw new TypeError('unsupported composite workload operation');
    fields(raw, raw.op === 'query' ? ['op', 'id', 'frame', 'subject', 'query', 'routing'] : raw.op === 'put' ? ['op', 'frame', 'subject', 'input'] : raw.op === 'invalidate' ? ['op', 'frame', 'notices'] : ['op', 'frame', 'query']);
    const frame = frames.get(text(raw.frame)); if (!frame) throw new TypeError('unknown composite workload frame'); let request, context = null;
    if (raw.op === 'query' || raw.op === 'put') {
      context = pathWitnessContext({ domain, subject: raw.subject, policy: frame.policy }); let tick;
      if (raw.op === 'query') {
        const id = text(raw.id); if (ids.has(id)) throw new TypeError('duplicate composite workload query ID'); ids.add(id); fields(raw.query, ['tick', 'prefix', 'union', 'fallback']);
        const query = { tick: raw.query.tick, prefix: config(raw.query.prefix, prefixKeys, { ...PATH_TREE_LIMITS, ...PATH_SEGMENT_PROPOSAL_LIMITS }), union: config(raw.query.union, ['epoch', ...Object.keys(PATH_UNION_LIMITS), ...Object.keys(PATH_ORACLE_LIMITS)], { ...PATH_UNION_LIMITS, ...PATH_ORACLE_LIMITS }), fallback: config(raw.query.fallback, ['epoch', ...Object.keys(PATH_ORACLE_LIMITS)], PATH_ORACLE_LIMITS) };
        if (query.prefix.tick !== query.tick || query.prefix.epoch !== query.union.epoch || query.prefix.epoch !== query.fallback.epoch || query.prefix.maxPrefixHops > frame.policy.maxHops || query.union.maxSubjectHops > frame.policy.maxHops || query.union.maxAnchorHops > frame.policy.maxHops) throw new RangeError('composite workload query scope');
        fields(raw.routing, ['seed', 'step', 'mode']); const seed = text(raw.routing.seed, PATH_POOL_LIMITS.maxSeedBytes); if (!natural(raw.routing.step) || !['uniform', 'best-of-two'].includes(raw.routing.mode)) throw new TypeError('composite workload routing');
        if (symbolic && symbolic.frame.data.policyId !== frame.data.policyId) throw new TypeError('composite workload active query policy differs');
        tick = query.tick; if (tick > Number.MAX_SAFE_INTEGER - wholeConfig.ttlTicks) throw new RangeError('composite workload query expiry');
        request = { op: 'query', id, frame: frame.id, subject: context.subject, query, routing: { seed, step: raw.routing.step, mode: raw.routing.mode } }; preflight.querySteps++;
      } else {
        fields(raw.input, ['epoch', 'path', 'tick']); if (!natural(raw.input.epoch)) throw new RangeError('composite workload put epoch');
        const path = array(raw.input.path, frame.policy.maxHops + 1).map(id => text(id, frame.policy.maxIdBytes)); if (!path.length || path[0] !== context.subject) throw new TypeError('composite workload put subject');
        tick = raw.input.tick; if (tick > Number.MAX_SAFE_INTEGER - segmentConfig.ttlTicks) throw new RangeError('composite workload put expiry');
        request = { op: 'put', frame: frame.id, subject: context.subject, input: { epoch: raw.input.epoch, path, tick } }; preflight.putSteps++;
      }
      if (!natural(tick) || (lastTick !== null && tick < lastTick)) throw new RangeError('composite workload declared chronology'); lastTick = tick;
    } else if (raw.op === 'invalidate') {
      fields(raw.notices, ['whole', 'segments']); const notices = { whole: notice(raw.notices.whole, 'anchors'), segments: notice(raw.notices.segments, 'vertices') }; request = { op: 'invalidate', frame: frame.id, notices };
      preflight.invalidationSteps++; preflight.wholeEdgeNotices += notices.whole.edges.length; preflight.wholeAnchorNotices += notices.whole.anchors.length; preflight.segmentEdgeNotices += notices.segments.edges.length; preflight.segmentVertexNotices += notices.segments.vertices.length;
    } else {
      const query = raw.op === 'repair' ? config(raw.query, ['epoch', 'maxTreeNodes', ...Object.keys(PATH_TREE_REPAIR_LIMITS)], { ...PATH_TREE_LIMITS, ...PATH_TREE_REPAIR_LIMITS }) : config(raw.query, ['epoch', 'maxExpansions', 'maxTreeNodes'], PATH_TREE_LIMITS);
      request = { op: raw.op, frame: frame.id, query }; const available = frame.data.options.snapshots.some(s => s.epoch === query.epoch) && (raw.op === 'build' || (query.epoch <= frame.data.options.currentEpoch && frame.data.options.currentEpoch - query.epoch <= frame.policy.graceEpochs)); symbolic = (raw.op === 'build' || symbolic) && available ? { frame, epoch: query.epoch } : null;
    }
    steps.push({ request, frame, context, expected: symbolic }); preflight.steps++;
  }
  preflight.viewObjects = objects.size; preflight.distinctLoadIds = loadIds.size; return { domain, wholeConfig, segmentConfig, frames, steps, namespace, preflight, loadIds };
}
function freeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }
function describe(active) { if (!active) return null; const f = active.forest, m = f.meta; return { viewRoot: m.originRoot, policyId: m.policyId, epoch: m.epoch, reference: m.reference, status: m.status, reason: m.reason, complete: m.complete, eligibleRoots: f.anchors().length, retainedRoots: f.toJSON().parents.length, treeNodes: m.stats.treeNodes }; }
function maintenanceResult(status, reason, report = null) { const known = report && status !== 'unavailable', actions = known ? {} : null; if (known) for (const r of report.roots) actions[r.action] = add(actions[r.action] ?? 0, 1); return { status, reason, reset: report?.reset ?? null, deltaComplete: report?.deltaComplete ?? null, retiredRoots: known ? report.retired.length : null, rootActions: actions }; }
function snapshots(whole, segments) {
  const w = PathWitnessCache.prototype.stats.call(whole), s = PathWitnessSegmentCache.prototype.stats.call(segments);
  if (Object.entries(w).some(([k, v]) => !(k === 'lastTick' && v === null) && !natural(v)) || w.entries > whole.config.maxEntries || w.bytes > whole.config.maxBytes || s.schema !== 'facety-segment-inventory/v1' || !same(s.config, segments.config) || ['entries', 'bytes', 'endpointKeys', 'edgeKeys', 'vertexKeys'].some(k => !natural(s[k])) || (s.lastTick !== null && !natural(s.lastTick)) || s.entries > segments.config.maxEntries || s.bytes > segments.config.maxBytes || !Array.isArray(s.records) || s.records.length !== s.entries || s.records.reduce((n, r) => add(n, r.bytes), 0) !== s.bytes) throw new Error('composite workload inventory disagreement');
  for (const [v, indexes] of [[w, ['edgeKeys', 'anchorKeys']], [s, ['endpointKeys', 'edgeKeys', 'vertexKeys']]]) if (v.entries === 0 ? v.bytes !== 0 || indexes.some(k => v[k] !== 0) : v.bytes === 0 || v.lastTick === null) throw new Error('composite workload empty inventory disagreement');
  const seen = new Set(); for (const r of array(s.records, segments.config.maxEntries)) {
    fields(r, ['id', 'bytes', 'originRoot', 'storedAt', 'expiresAt', 'lastVerifiedRoot', 'verifiedAt', 'uses', 'usesSaturated']); for (const k of ['id', 'originRoot', 'lastVerifiedRoot']) text(r[k]);
    if (seen.has(r.id) || ['bytes', 'storedAt', 'expiresAt', 'verifiedAt', 'uses'].some(k => !natural(r[k])) || !r.bytes || r.expiresAt - r.storedAt !== segments.config.ttlTicks || r.verifiedAt < r.storedAt || r.verifiedAt > s.lastTick || typeof r.usesSaturated !== 'boolean' || (r.usesSaturated && r.uses !== Number.MAX_SAFE_INTEGER)) throw new Error('composite workload segment metadata disagreement'); seen.add(r.id);
  }
  return { whole: w, segments: s };
}
const cacheStats = (before, after) => ({ whole: { before: before.whole, after: after.whole }, segments: { before: before.segments, after: after.segments } });
const hash = json => createHash('sha256').update(json).digest('hex');
function stages(raw = null) { return Object.fromEntries(['probe', 'prefix', 'union', 'finish'].map(k => { const s = raw?.stages[k], r = s?.receipt; return [k, { called: s?.called ?? false, status: r?.status ?? null, reason: r?.reason ?? null, coverage: k === 'prefix' && r ? { prefix: r.prefix.coverage, segments: r.segments.coverage } : k === 'union' ? r?.coverage ?? null : null }]; })); }
function missingQuery() { return { status: 'unavailable', reason: 'forest-missing', feasible: null, required: null, source: 'uncalled', queryDigest: null, wireDigest: null, wireBytes: null, verification: null, stages: stages() }; }
function observe(raw, step, active, before, after, state, advice, loadRowsBuilt) {
  const { frame, context, request } = step, r = raw.result, found = r?.status === 'found';
  if (raw.schema !== 'facety-path-composite/v1' || raw.reference !== 'verified-cache-prefix-union-fallback/v1' || !same(raw.provenance, provenance()) || !same(raw.assumptions, assumptions) || raw.viewRoot !== frame.view.view().id || raw.forestRoot !== active.forest.meta.originRoot || !same(raw.context, context) || !same(raw.input, request.query) || !same(raw.advice, advice) || !same(raw.cacheStats, cacheStats(before, after)) || !['found', 'infeasible', 'censored', 'unavailable'].includes(r?.status) || !['cache', 'prefix', 'union', 'oracle'].includes(r.source) || r.feasible !== (found ? true : r.status === 'infeasible' ? false : null)) throw new Error('composite workload query scope disagreement');
  if (found && (typeof r.wire !== 'string' || r.witness?.epoch !== request.query.fallback.epoch || r.witness.subject !== context.subject || !r.verification?.primary.accepted || !r.verification.ref2?.accepted || r.verification.primary.required !== r.required || r.verification.ref2.required !== r.required || r.required !== frame.view.snapshot(request.query.fallback.epoch)?.difficulty)) throw new Error('composite workload positive disagreement');
  if (!found && (r.wire !== null || r.witness !== null || r.verification !== null)) throw new Error('composite workload nonpositive proof disagreement');
  const p = raw.stages.prefix.receipt, counts = new Map(); let offered = 0;
  for (const route of p?.prefix.routes ?? []) for (const id of route.selected) { if (!state.loadIds.has(id)) throw new Error('composite workload unknown selected peer'); counts.set(id, add(counts.get(id) ?? 0, 1)); offered = add(offered, 1); }
  if (offered !== raw.work.routedPeers || (p && (offered !== p.prefix.stats.routedPeers || p.prefix.routes.length !== p.prefix.stats.routeCalls)) || (!raw.stages.prefix.called && p !== null) || (r.source === 'cache' && (offered || raw.work.segmentLookups || !same(before.segments, after.segments)))) throw new Error('composite workload offer/skip disagreement');
  const loadDelta = [...counts].sort(([a], [b]) => cmp(a, b)).map(([id, selected]) => { const old = state.loads.get(id) ?? 0; return { id, before: old, selected, after: add(old, selected) }; });
  const json = JSON.stringify(raw), wire = found ? Buffer.from(r.wire) : null;
  const result = { status: r.status, reason: r.reason, feasible: r.feasible, required: r.required, source: r.source, queryDigest: hash(json), wireDigest: wire ? hash(wire) : null, wireBytes: wire?.length ?? null, verification: found ? { primaryAccepted: true, ref2Accepted: true } : null, stages: stages(raw) };
  const work = { composite: raw.work, preflight: raw.preflight, probe: raw.stages.probe.receipt.work, prefix: p ? { proposal: p.stats, prefix: p.prefix.stats, segments: { stats: p.segments.stats, work: p.segments.work } } : null, union: raw.stages.union.receipt?.work ?? null, finish: raw.stages.finish.called ? { cache: raw.stages.finish.receipt.work, search: raw.stages.finish.receipt.stats } : null, accounting: { loadRowsBuilt, routeRowsFolded: p?.prefix.routes.length ?? 0, selectedPeersFolded: offered, queryBytesHashed: Buffer.byteLength(json) } };
  state.total = add(state.total, offered); for (const r of loadDelta) state.loads.set(r.id, r.after); return { result, work, loadDelta };
}
function loads(state) { const rows = [...state.loads].sort(([a], [b]) => cmp(a, b)).map(([id, load]) => ({ id, load })); let total = 0n, squares = 0n, max = 0; for (const { load } of rows) { const n = BigInt(load); total += n; squares += n * n; max = Math.max(max, load); } if (total !== BigInt(state.total)) throw new Error('composite workload load total disagreement'); return { unit: 'run-cumulative-route-selections/v1', total: state.total, distinct: rows.length, max, herfindahl: total === 0n ? null : Number(squares) / Number(total * total), rows }; }
export function runPathWitnessCompositeWorkload(input) {
  const n = normalize(input), whole = new PathWitnessCache(n.wholeConfig), segments = new PathWitnessSegmentCache(n.segmentConfig), state = { loads: new Map(), loadIds: n.loadIds, total: 0 }, rows = [];
  const totals = { operations: Object.fromEntries(operations.map(k => [k, { requested: 0, called: 0, skipped: 0 }])), queries: { found: 0, infeasible: 0, censored: 0, unavailable: 0 }, sources: { cache: 0, prefix: 0, union: 0, oracle: 0, uncalled: 0 }, puts: { stored: 0, 'not-stored': 0, rejected: 0, unavailable: 0 }, composite: { cacheAdmissions: 0, cacheSweepEntryUpperBound: 0, prefixCalls: 0, unionCalls: 0, fullOracleCalls: 0 }, segmentCalls: { puts: 0, invalidations: 0, lookups: 0, putSweepEntryUpperBound: 0, lookupSweepEntryUpperBound: 0 }, notices: { wholeEvicted: 0, segmentEvicted: 0 }, loads: null }; let active = null;
  for (const [index, step] of n.steps.entries()) {
    const { request, frame, context } = step, activeBefore = describe(active), before = snapshots(whole, segments), called = ['build', 'put', 'invalidate'].includes(request.op) || active !== null;
    const c = totals.operations[request.op]; c.requested = add(c.requested, 1); c[called ? 'called' : 'skipped'] = add(c[called ? 'called' : 'skipped'], 1); let result, work = null, loadDelta = [];
    if (request.op === 'query') {
      if (!called) result = missingQuery();
      else {
        let loadRowsBuilt = 0; const advice = { pools: frame.pools.map(({ subject, pool }) => ({ subject, pool, loads: request.routing.mode === 'uniform' ? null : pool.ranked.map(({ id }) => { loadRowsBuilt++; return { id, load: state.loads.get(id) ?? 0 }; }) })), routing: { seed: request.routing.seed, queryId: request.id, step: request.routing.step, mode: request.routing.mode } };
        const raw = queryPathWitnessComposite({ whole, segments, forest: active.forest }, frame.view, context, request.query, advice);
        ({ result, work, loadDelta } = observe(raw, step, active, before, snapshots(whole, segments), state, advice, loadRowsBuilt));
        for (const [k, v] of Object.entries({ cacheAdmissions: raw.work.cacheAdmissions, cacheSweepEntryUpperBound: raw.work.cacheSweepEntryUpperBound, prefixCalls: Number(raw.work.prefixCalled), unionCalls: Number(raw.work.unionCalled), fullOracleCalls: raw.work.fullOracleCalls })) totals.composite[k] = add(totals.composite[k], v);
        totals.segmentCalls.lookups = add(totals.segmentCalls.lookups, raw.work.segmentLookups); totals.segmentCalls.lookupSweepEntryUpperBound = add(totals.segmentCalls.lookupSweepEntryUpperBound, raw.work.segmentSweepEntryUpperBound);
      }
      totals.queries[result.status] = add(totals.queries[result.status], 1); totals.sources[result.source] = add(totals.sources[result.source], 1);
    } else if (request.op === 'put') {
      const raw = PathWitnessSegmentCache.prototype.put.call(segments, frame.view, context, request.input), after = snapshots(whole, segments);
      if (raw.schema !== 'facety-segment-put/v1' || !['stored', 'not-stored', 'rejected', 'unavailable'].includes(raw.status) || !same(raw.context, context) || !same(raw.config, segments.config) || raw.currentRoot !== frame.view.view().id || raw.epoch !== request.input.epoch || Object.values(raw.work).some(v => !natural(v)) || after.segments.lastTick !== request.input.tick || after.segments.entries !== before.segments.entries - raw.work.expired - raw.work.evicted - raw.work.refreshed + Number(raw.status === 'stored') || !same(before.whole, after.whole)
        || (raw.status === 'stored' ? !raw.segment || raw.segment.id !== raw.id || !same(raw.segment.path, request.input.path) || !after.segments.records.some(r => r.id === raw.id && r.bytes === raw.bytes) : raw.segment !== null)) throw new Error('composite workload put disagreement');
      if (raw.status === 'stored') {
        const meta = after.segments.records.find(r => r.id === raw.id);
        if (Object.keys(meta).some(k => raw.segment[k] !== meta[k]) || meta.originRoot !== frame.view.view().id || meta.lastVerifiedRoot !== meta.originRoot || meta.storedAt !== request.input.tick || meta.verifiedAt !== meta.storedAt || meta.uses !== 0 || meta.usesSaturated) throw new Error('composite workload put header disagreement');
      } else if (raw.work.evicted || raw.work.refreshed || (raw.status === 'not-stored' ? typeof raw.id !== 'string' || !natural(raw.bytes) || !raw.bytes : raw.id !== null || raw.bytes !== null)) throw new Error('composite workload nonstored put disagreement');
      result = { status: raw.status, reason: raw.reason, id: raw.id, bytes: raw.bytes }; work = { put: raw.work }; totals.puts[result.status] = add(totals.puts[result.status], 1); totals.segmentCalls.puts = add(totals.segmentCalls.puts, 1); totals.segmentCalls.putSweepEntryUpperBound = add(totals.segmentCalls.putSweepEntryUpperBound, before.segments.entries);
    } else if (request.op === 'invalidate') {
      const raw = invalidatePathWitnessCaches(whole, segments, request.notices), after = snapshots(whole, segments);
      if (raw.schema !== 'facety-path-invalidation/v1' || raw.reference !== 'explicit-dual-cache-notices/v1' || !same(raw.provenance, provenance()) || !same(raw.input, request.notices) || !same(raw.configs, { whole: whole.config, segments: segments.config }) || !same(raw.stages.whole.before, before.whole) || !same(raw.stages.segments.before, before.segments) || !same(raw.stages.whole.after, after.whole) || !same(raw.stages.segments.after, after.segments)) throw new Error('composite workload invalidation disagreement');
      const json = JSON.stringify(raw); result = { status: 'invalidated', whole: raw.stages.whole.receipt, segments: raw.stages.segments.receipt, receiptDigest: hash(json) }; work = { invalidation: raw.work, accounting: { receiptBytesHashed: Buffer.byteLength(json) } };
      totals.notices.wholeEvicted = add(totals.notices.wholeEvicted, result.whole.evicted); totals.notices.segmentEvicted = add(totals.notices.segmentEvicted, result.segments.evicted); totals.segmentCalls.invalidations = add(totals.segmentCalls.invalidations, 1);
    } else if (!called) result = maintenanceResult('unavailable', 'forest-missing');
    else if (request.op === 'build') { const forest = buildPathWitnessTrees(frame.view, request.query); result = maintenanceResult(forest.meta.status, forest.meta.reason); work = { build: forest.meta.stats }; active = forest.meta.status === 'unavailable' ? null : { forest, frame }; }
    else { const raw = (request.op === 'refresh' ? refreshPathWitnessTrees : repairPathWitnessTrees)(active.forest, active.frame.view, frame.view, request.query); result = maintenanceResult(raw.report.status, raw.report.reason, raw.report); work = { forest: raw.forest?.meta.stats ?? null, maintenance: raw.report.work }; active = raw.forest ? { forest: raw.forest, frame } : null; }
    const after = snapshots(whole, segments);
    if (Boolean(active) !== Boolean(step.expected) || (active && (active.forest.meta.originRoot !== step.expected.frame.view.view().id || active.forest.meta.policyId !== step.expected.frame.data.policyId || active.forest.meta.epoch !== step.expected.epoch))) throw new Error('composite workload active state disagreement');
    if ((!called || !['query', 'put', 'invalidate'].includes(request.op)) && !same(before, after)) throw new Error('composite workload inert operation changed caches');
    rows.push({ index, request, called, activeBefore, activeAfter: describe(active), cacheStats: cacheStats(before, after), result, work, loadDelta });
  }
  const final = snapshots(whole, segments); totals.loads = loads(state);
  if (rows.length !== n.preflight.steps || Object.values(totals.queries).reduce(add, 0) !== totals.operations.query.requested || Object.values(totals.sources).reduce(add, 0) !== totals.operations.query.requested || Object.values(totals.puts).reduce(add, 0) !== totals.operations.put.called || final.whole.queries !== totals.composite.cacheAdmissions || final.whole.oracleCalls !== totals.composite.fullOracleCalls || final.whole.invalidations !== totals.operations.invalidate.called || final.whole.invalidated !== totals.notices.wholeEvicted || totals.segmentCalls.puts !== totals.operations.put.called || totals.segmentCalls.invalidations !== totals.operations.invalidate.called) throw new Error('composite workload operation total disagreement');
  return freeze({ schema: 'facety-path-composite-workload/v1', reference: 'bounded-composite-cache-segment-route-load/v1', provenance: provenance(), assumptions: [...assumptions], domain: n.domain, namespace: n.namespace, wholeConfig: n.wholeConfig, segmentConfig: n.segmentConfig, frames: [...n.frames.values()].map(f => ({ id: f.id, viewRoot: f.view.view().id, policyId: f.data.policyId, currentEpoch: f.data.options.currentEpoch, preparationGroup: f.preparationGroup, pools: f.pools.map(r => ({ subject: r.subject, poolId: r.pool.id })) })), preflight: n.preflight, rows, totals, finalForest: describe(active), finalWhole: final.whole, finalSegments: final.segments });
}
