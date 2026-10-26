// Owns: Bounded supplied-frame forest/cache lifecycle tapes and compact query telemetry; excludes canonical authority, query/proof internals, prefix/load/segment policies, timing and economic mutation.
import { createHash } from 'node:crypto';
import { PathWitnessCache, PATH_CACHE_LIMITS } from './path-witness-cache.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, repairPathWitnessTrees, PATH_TREE_LIMITS, PATH_TREE_REPAIR_LIMITS, PATH_UNION_LIMITS } from './path-witness-trees.mjs';
import { queryPathWitness } from './path-witness-pipeline.mjs';
import { PATH_ORACLE_LIMITS } from './path-witness-oracle.mjs';
import { isPathWitnessView } from './path-witness-view.mjs';
import { pathWitnessContext, PATH_WITNESS_LIMITS } from './path-witness.mjs';
import { provenance } from './provenance.mjs';
export const PATH_LIFECYCLE_LIMITS = Object.freeze({ maxFrames: 16, maxSteps: 128 });
const natural = n => Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0;
function record(v) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('lifecycle requires data records');
}
function fields(v, keys) {
  record(v); if (Reflect.ownKeys(v).length !== keys.length || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) throw new TypeError('lifecycle requires exact fields');
}
function array(v, cap) {
  if (!Array.isArray(v) || ![Array.prototype, null].includes(Object.getPrototypeOf(v))) throw new TypeError('lifecycle requires plain arrays');
  if (v.length > cap) throw new RangeError('lifecycle array bound');
  if (Reflect.ownKeys(v).length !== v.length + 1 || Object.keys(v).length !== v.length) throw new TypeError('lifecycle requires dense arrays');
  const copy = [];
  for (let i = 0; i < v.length; i++) {
    if (!Object.hasOwn(v, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v, i), 'value')) throw new TypeError('lifecycle array holes/accessors');
    copy.push(v[i]);
  }
  return copy;
}
function text(v, cap = 256) {
  if (typeof v !== 'string' || !v.length || !v.isWellFormed()) throw new TypeError('lifecycle requires Unicode text');
  if (v.length > cap || Buffer.byteLength(v) > cap) throw new RangeError('lifecycle text byte bound');
  return v;
}
function config(v, keys, limits) {
  fields(v, keys);
  for (const k of keys) if (!natural(v[k]) || (k !== 'epoch' && v[k] > limits[k])) throw new RangeError('unsupported lifecycle budget/epoch ' + k);
  return Object.fromEntries(keys.map(k => [k, v[k]]));
}
function add(a, b) { if (!natural(a) || !natural(b) || !Number.isSafeInteger(a + b)) throw new RangeError('lifecycle counter overflow'); return a + b; }
function freeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }
function normalize(input) {
  fields(input, ['domain', 'cache', 'frames', 'steps']); const domain = text(input.domain), cache = config(input.cache, ['maxEntries', 'maxBytes', 'ttlTicks'], PATH_CACHE_LIMITS);
  if (cache.ttlTicks === 0) throw new RangeError('lifecycle TTL must be positive');
  const frames = new Map(), steps = [], ids = new Set(), preflight = { frames: 0, steps: 0, querySteps: 0, invalidationSteps: 0, edgeNotices: 0, anchorNotices: 0 }; let namespace = null, symbolic = null, lastTick = null;
  for (const row of array(input.frames, PATH_LIFECYCLE_LIMITS.maxFrames)) {
    fields(row, ['id', 'view']); const id = text(row.id);
    if (frames.has(id)) throw new TypeError('duplicate lifecycle frame');
    if (!isPathWitnessView(row.view)) throw new TypeError('lifecycle requires local immutable views');
    const data = row.view.toJSON(), policy = pathWitnessContext({ domain, subject: domain, policy: data.options.policy }).policy;
    const scope = { reference: row.view.capture.reference, storageName: data.source.storage.name };
    if (namespace && (namespace.reference !== scope.reference || namespace.storageName !== scope.storageName)) throw new TypeError('lifecycle frame namespace differs');
    namespace = scope; frames.set(id, { id, view: row.view, data, policy }); preflight.frames++;
  }
  for (const raw of array(input.steps, PATH_LIFECYCLE_LIMITS.maxSteps)) {
    record(raw); if (!['build', 'refresh', 'repair', 'query', 'invalidate'].includes(raw.op)) throw new TypeError('unsupported lifecycle operation');
    fields(raw, raw.op === 'query' ? ['op', 'id', 'frame', 'subject', 'input'] : raw.op === 'invalidate' ? ['op', 'frame', 'notices'] : ['op', 'frame', 'query']);
    const frame = frames.get(text(raw.frame)); if (!frame) throw new TypeError('unknown lifecycle frame');
    let request, context = null;
    if (raw.op === 'query') {
      const id = text(raw.id); if (ids.has(id)) throw new TypeError('duplicate lifecycle query ID'); ids.add(id);
      context = pathWitnessContext({ domain, subject: raw.subject, policy: frame.policy }); fields(raw.input, ['tick', 'union', 'fallback']);
      const union = config(raw.input.union, ['epoch', ...Object.keys(PATH_UNION_LIMITS), ...Object.keys(PATH_ORACLE_LIMITS)], { ...PATH_UNION_LIMITS, ...PATH_ORACLE_LIMITS });
      const fallback = config(raw.input.fallback, ['epoch', ...Object.keys(PATH_ORACLE_LIMITS)], PATH_ORACLE_LIMITS), tick = raw.input.tick;
      if (union.epoch !== fallback.epoch) throw new RangeError('lifecycle query epochs differ');
      if (union.maxSubjectHops > frame.policy.maxHops || union.maxAnchorHops > frame.policy.maxHops) throw new RangeError('lifecycle radius exceeds policy');
      if (!natural(tick) || (lastTick !== null && tick < lastTick) || tick > Number.MAX_SAFE_INTEGER - cache.ttlTicks) throw new RangeError('lifecycle query clock/expiry');
      if (symbolic && symbolic.frame.data.policyId !== frame.data.policyId) throw new TypeError('lifecycle active query policy differs');
      lastTick = tick; request = { op: 'query', id, frame: frame.id, subject: context.subject, input: { tick, union, fallback } }; preflight.querySteps++;
    } else if (raw.op === 'invalidate') {
      fields(raw.notices, ['edges', 'anchors']);
      const edges = array(raw.notices.edges, PATH_CACHE_LIMITS.maxNotices).map(edge => {
        const pair = array(edge, 2); if (pair.length !== 2) throw new TypeError('lifecycle edge notice needs two IDs');
        return pair.map(id => text(id, PATH_WITNESS_LIMITS.maxIdBytes));
      }), anchors = array(raw.notices.anchors, PATH_CACHE_LIMITS.maxNotices).map(id => text(id, PATH_WITNESS_LIMITS.maxIdBytes));
      request = { op: 'invalidate', frame: frame.id, notices: { edges, anchors } }; preflight.invalidationSteps++; preflight.edgeNotices += edges.length; preflight.anchorNotices += anchors.length;
    } else {
      const query = raw.op === 'repair' ? config(raw.query, ['epoch', 'maxTreeNodes', ...Object.keys(PATH_TREE_REPAIR_LIMITS)], { ...PATH_TREE_LIMITS, ...PATH_TREE_REPAIR_LIMITS })
        : config(raw.query, ['epoch', 'maxExpansions', 'maxTreeNodes'], PATH_TREE_LIMITS);
      request = { op: raw.op, frame: frame.id, query };
      const available = frame.data.options.snapshots.some(s => s.epoch === query.epoch) && (raw.op === 'build'
        || (query.epoch <= frame.data.options.currentEpoch && frame.data.options.currentEpoch - query.epoch <= frame.policy.graceEpochs));
      symbolic = (raw.op === 'build' || symbolic) && available ? { frame, epoch: query.epoch } : null;
    }
    steps.push({ request, frame, context, expected: symbolic }); preflight.steps++;
  }
  return { domain, cache, frames, steps, namespace, preflight };
}
function describe(active) {
  if (!active) return null; const f = active.forest, m = f.meta;
  return { viewRoot: m.originRoot, policyId: m.policyId, epoch: m.epoch, reference: m.reference, status: m.status, reason: m.reason, complete: m.complete,
    eligibleRoots: f.anchors().length, retainedRoots: f.toJSON().parents.length, treeNodes: m.stats.treeNodes };
}
function maintenanceResult(status, reason, report = null) {
  const known = report && status !== 'unavailable', actions = known ? {} : null;
  if (known) for (const row of report.roots) actions[row.action] = add(actions[row.action] ?? 0, 1);
  return { status, reason, reset: report?.reset ?? null, deltaComplete: report?.deltaComplete ?? null, retiredRoots: known ? report.retired.length : null, rootActions: actions };
}
function observe(source, frame, context, request, forest, cacheBefore) {
  const r = source.result, found = r?.status === 'found', expected = found ? true : r?.status === 'infeasible' ? false : null;
  if (source.schema !== 'facety-path-pipeline/v1' || source.reference !== 'verified-cache-union-fallback/v1' || source.viewRoot !== frame.view.view().id || source.forestRoot !== forest.meta.originRoot
    || JSON.stringify(source.context) !== JSON.stringify(context) || JSON.stringify(source.input) !== JSON.stringify(request.input) || JSON.stringify(source.provenance) !== JSON.stringify(provenance())
    || JSON.stringify(source.cacheStats.before) !== JSON.stringify(cacheBefore) || !['found', 'infeasible', 'censored', 'unavailable'].includes(r?.status)
    || !['cache', 'union', 'oracle'].includes(r.source) || r.feasible !== expected) throw new Error('lifecycle pipeline scope disagreement');
  if (found && (typeof r.wire !== 'string' || !r.verification?.primary.accepted || !r.verification?.ref2.accepted || r.verification.primary.required !== r.required || r.verification.ref2.required !== r.required
    || r.witness?.epoch !== request.input.fallback.epoch || r.witness.subject !== context.subject || r.required !== frame.view.snapshot(request.input.fallback.epoch)?.difficulty)) throw new Error('lifecycle positive verification disagreement');
  if (!found && (r.wire !== null || r.witness !== null || r.verification !== null)) throw new Error('lifecycle unexpected nonpositive proof');
  const json = JSON.stringify(source), wire = found ? Buffer.from(r.wire, 'utf8') : null;
  const stages = Object.fromEntries(['probe', 'advice', 'finish'].map(name => {
    const stage = source.stages[name]; return [name, { called: stage.called, status: stage.receipt?.status ?? null, reason: stage.receipt?.reason ?? null, coverage: name === 'advice' ? stage.receipt?.coverage ?? null : null }];
  }));
  return { result: { status: r.status, reason: r.reason, feasible: r.feasible, required: r.required, source: r.source, pipelineDigest: createHash('sha256').update(json).digest('hex'),
    wireDigest: wire ? createHash('sha256').update(wire).digest('hex') : null, wireBytes: wire?.length ?? null, verification: found ? { primaryAccepted: true, ref2Accepted: true } : null, stages },
  work: { pipeline: source.work, probe: source.stages.probe.receipt.work, union: source.stages.advice.receipt?.work ?? null,
    finish: source.stages.finish.called ? { cache: source.stages.finish.receipt.work, search: source.stages.finish.receipt.stats } : null, accounting: { pipelineBytesHashed: Buffer.byteLength(json) } } };
}
function missingQuery() {
  return { status: 'unavailable', reason: 'forest-missing', feasible: null, required: null, source: 'uncalled', pipelineDigest: null, wireDigest: null, wireBytes: null, verification: null,
    stages: Object.fromEntries(['probe', 'advice', 'finish'].map(k => [k, { called: false, status: null, reason: null, coverage: null }])) };
}
export function runPathWitnessLifecycle(input) {
  const n = normalize(input), cache = new PathWitnessCache(n.cache), rows = [], totals = {
    operations: Object.fromEntries(['build', 'refresh', 'repair', 'query', 'invalidate'].map(k => [k, { requested: 0, called: 0, skipped: 0 }])),
    queries: { found: 0, infeasible: 0, censored: 0, unavailable: 0 }, sources: { cache: 0, union: 0, oracle: 0, uncalled: 0 },
    pipeline: { cacheAdmissions: 0, cacheSweepEntryUpperBound: 0, unionCalls: 0, fullOracleCalls: 0 } }; let active = null, invalidated = 0;
  for (const [index, step] of n.steps.entries()) {
    const { request, frame } = step, activeBefore = describe(active), cacheBefore = cache.stats(), called = ['build', 'invalidate'].includes(request.op) || active !== null;
    const counter = totals.operations[request.op]; counter.requested = add(counter.requested, 1); counter[called ? 'called' : 'skipped'] = add(counter[called ? 'called' : 'skipped'], 1);
    let result, work = null, source = null;
    if (request.op === 'query') {
      if (!called) result = missingQuery();
      else {
        source = queryPathWitness(cache, active.forest, frame.view, step.context, request.input);
        ({ result, work } = observe(source, frame, step.context, request, active.forest, cacheBefore));
        for (const [key, value] of Object.entries({ cacheAdmissions: source.work.cacheAdmissions, cacheSweepEntryUpperBound: source.work.cacheSweepEntryUpperBound, unionCalls: Number(source.work.unionCalled), fullOracleCalls: source.work.fullOracleCalls })) totals.pipeline[key] = add(totals.pipeline[key], value);
      }
      totals.queries[result.status] = add(totals.queries[result.status], 1); totals.sources[result.source] = add(totals.sources[result.source], 1);
    } else if (request.op === 'invalidate') {
      result = PathWitnessCache.prototype.invalidate.call(cache, request.notices); work = { invalidation: result }; invalidated = add(invalidated, result.evicted);
    } else if (!called) result = maintenanceResult('unavailable', 'forest-missing');
    else if (request.op === 'build') {
      const forest = buildPathWitnessTrees(frame.view, request.query); result = maintenanceResult(forest.meta.status, forest.meta.reason); work = { build: forest.meta.stats };
      active = forest.meta.status === 'unavailable' ? null : { forest, frame };
    } else {
      const updated = (request.op === 'refresh' ? refreshPathWitnessTrees : repairPathWitnessTrees)(active.forest, active.frame.view, frame.view, request.query);
      result = maintenanceResult(updated.report.status, updated.report.reason, updated.report); work = { forest: updated.forest?.meta.stats ?? null, maintenance: updated.report.work };
      active = updated.forest ? { forest: updated.forest, frame } : null;
    }
    const cacheAfter = cache.stats();
    if (Boolean(active) !== Boolean(step.expected) || (active && (active.forest.meta.originRoot !== step.expected.frame.view.view().id || active.forest.meta.epoch !== step.expected.epoch || active.forest.meta.policyId !== step.expected.frame.data.policyId))) throw new Error('lifecycle active state disagreement');
    if (request.op === 'query' && called && JSON.stringify(source.cacheStats.after) !== JSON.stringify(cacheAfter)) throw new Error('lifecycle pipeline cache disagreement');
    if (request.op !== 'query' && request.op !== 'invalidate' && JSON.stringify(cacheBefore) !== JSON.stringify(cacheAfter)) throw new Error('lifecycle maintenance changed cache');
    if (!called && JSON.stringify(cacheBefore) !== JSON.stringify(cacheAfter)) throw new Error('lifecycle skipped operation changed cache');
    if (request.op === 'invalidate' && (cacheAfter.invalidations - cacheBefore.invalidations !== 1 || cacheAfter.invalidated - cacheBefore.invalidated !== result.evicted || cacheAfter.queries !== cacheBefore.queries || cacheAfter.lastTick !== cacheBefore.lastTick)) throw new Error('lifecycle invalidation counter disagreement');
    rows.push({ index, request, called, activeBefore, activeAfter: describe(active), cacheBefore, cacheAfter, result, work });
  }
  const finalCache = cache.stats(), queryCount = totals.operations.query.requested;
  if (rows.length !== n.preflight.steps || Object.values(totals.queries).reduce(add, 0) !== queryCount || Object.values(totals.sources).reduce(add, 0) !== queryCount
    || finalCache.queries !== totals.pipeline.cacheAdmissions || finalCache.oracleCalls !== totals.pipeline.fullOracleCalls || finalCache.invalidations !== totals.operations.invalidate.called || finalCache.invalidated !== invalidated) throw new Error('lifecycle total disagreement');
  return freeze({ schema: 'facety-path-lifecycle/v1', reference: 'supplied-frame-cache-forest/v1', provenance: provenance(), domain: n.domain, namespace: n.namespace, cacheConfig: n.cache,
    frames: [...n.frames.values()].map(f => ({ id: f.id, viewRoot: f.view.view().id, policyId: f.data.policyId, currentEpoch: f.data.options.currentEpoch })),
    preflight: n.preflight, rows, totals, finalForest: describe(active), finalCache });
}
