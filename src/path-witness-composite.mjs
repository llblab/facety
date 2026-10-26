// Owns: Fixed whole-cache/prefix-segment/union/full query coordination and native receipt guards; excludes owner lifecycles, load learning, canonical authority, priming, Model mutation and cost claims.
import { PathWitnessCache, PATH_CACHE_LIMITS } from './path-witness-cache.mjs';
import { PathWitnessSegmentCache, PATH_SEGMENT_LIMITS } from './path-witness-segments.mjs';
import { isPathWitnessForest, proposePathWitnessFromSegments, proposePathWitnessFromUnion, PATH_TREE_LIMITS, PATH_SEGMENT_PROPOSAL_LIMITS, PATH_UNION_LIMITS } from './path-witness-trees.mjs';
import { PATH_ORACLE_LIMITS } from './path-witness-oracle.mjs';
import { createPathWitnessPool, routePathWitnessPool } from './path-witness-pool.mjs';
import { isPathWitnessView } from './path-witness-view.mjs';
import { pathWitnessContext, pathWitnessPolicyId, decodePathWitness } from './path-witness.mjs';
import { provenance } from './provenance.mjs';
const natural = n => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const prefixKeys = ['epoch', 'maxPrefixHops', 'maxPrefixes', 'maxExpansions', 'maxBranches', 'maxTreeLookups', 'maxCandidates', 'maxPackingSteps', 'tick', ...Object.keys(PATH_SEGMENT_PROPOSAL_LIMITS)];
const counters = ['queries', 'cacheHits', 'hintHits', 'cacheRejects', 'hintRejects', 'primaryChecks', 'ref2Checks', 'oracleCalls', 'expired', 'invalidations', 'invalidated', 'fifoEvicted', 'retentionSkipped'];
function fields(v, keys) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Reflect.ownKeys(v).length !== keys.length || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))
    || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('composite requires exact data fields');
}
function array(v, cap) {
  if (!Array.isArray(v) || ![Array.prototype, null].includes(Object.getPrototypeOf(v))) throw new TypeError('composite requires plain arrays');
  if (v.length > cap) throw new RangeError('composite array bound');
  if (Reflect.ownKeys(v).length !== v.length + 1 || Object.keys(v).length !== v.length) throw new TypeError('composite requires dense arrays');
  const copy = []; for (let i = 0; i < v.length; i++) { if (!Object.hasOwn(v, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v, i), 'value')) throw new TypeError('composite array holes/accessors'); copy.push(v[i]); } return copy;
}
function config(v, keys, limits) {
  fields(v, keys); for (const k of keys) if (!natural(v[k]) || (!['epoch', 'tick'].includes(k) && v[k] > limits[k])) throw new RangeError('unsupported composite budget/epoch ' + k);
  return Object.fromEntries(keys.map(k => [k, v[k]]));
}
function cacheConfig(cfg, limits, segment) {
  fields(cfg, segment ? ['ledgerId', 'maxEntries', 'maxBytes', 'ttlTicks'] : ['maxEntries', 'maxBytes', 'ttlTicks']);
  if (segment && (typeof cfg.ledgerId !== 'string' || !cfg.ledgerId.length || !cfg.ledgerId.isWellFormed() || Buffer.byteLength(cfg.ledgerId) > limits.maxIdBytes)) throw new TypeError('composite segment ledger bound');
  for (const k of ['maxEntries', 'maxBytes', 'ttlTicks']) if (!natural(cfg[k]) || cfg[k] > limits[k] || (k === 'ttlTicks' && !cfg[k])) throw new RangeError('composite cache configuration');
}
function inventory(s, cfg, indexes) {
  if (['entries', 'bytes', ...indexes].some(k => !natural(s[k])) || (s.lastTick !== null && !natural(s.lastTick)) || s.entries > cfg.maxEntries || s.bytes > cfg.maxBytes
    || (s.entries === 0 ? s.bytes !== 0 || indexes.some(k => s[k] !== 0) : s.bytes === 0 || s.lastTick === null)) throw new Error('composite unsafe inventory');
}
function wholeStats(cache) {
  const s = PathWitnessCache.prototype.stats.call(cache); cacheConfig(cache.config, PATH_CACHE_LIMITS, false); fields(s, [...counters, 'entries', 'bytes', 'edgeKeys', 'anchorKeys', 'lastTick']);
  inventory(s, cache.config, ['edgeKeys', 'anchorKeys']); if (counters.some(k => !natural(s[k]))) throw new Error('composite unsafe whole counters'); return s;
}
function segmentStats(cache) {
  const s = PathWitnessSegmentCache.prototype.stats.call(cache); cacheConfig(cache.config, PATH_SEGMENT_LIMITS, true); fields(s, ['schema', 'config', 'entries', 'bytes', 'endpointKeys', 'edgeKeys', 'vertexKeys', 'lastTick', 'records']); inventory(s, cache.config, ['endpointKeys', 'edgeKeys', 'vertexKeys']);
  if (s.schema !== 'facety-segment-inventory/v1' || !same(s.config, cache.config)) throw new Error('composite segment scope disagreement');
  const records = array(s.records, cache.config.maxEntries), ids = new Set(); let bytes = 0;
  for (const r of records) {
    fields(r, ['id', 'bytes', 'originRoot', 'storedAt', 'expiresAt', 'lastVerifiedRoot', 'verifiedAt', 'uses', 'usesSaturated']);
    if (['id', 'originRoot', 'lastVerifiedRoot'].some(k => typeof r[k] !== 'string' || !r[k].length || !r[k].isWellFormed() || Buffer.byteLength(r[k]) > PATH_SEGMENT_LIMITS.maxIdBytes) || ids.has(r.id) || ['bytes', 'storedAt', 'expiresAt', 'verifiedAt', 'uses'].some(k => !natural(r[k])) || !r.bytes
      || r.expiresAt - r.storedAt !== cache.config.ttlTicks || r.verifiedAt < r.storedAt || r.verifiedAt > s.lastTick || typeof r.usesSaturated !== 'boolean' || (r.usesSaturated && r.uses !== Number.MAX_SAFE_INTEGER)) throw new Error('composite unsafe segment record');
    ids.add(r.id); bytes += r.bytes; if (!natural(bytes)) throw new Error('composite segment byte overflow');
  }
  if (records.length !== s.entries || bytes !== s.bytes) throw new Error('composite segment inventory disagreement'); return s;
}
function adviceData(value, context, view, epoch) {
  fields(value, ['pools', 'routing']); fields(value.routing, ['seed', 'queryId', 'step', 'mode']);
  const empty = createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 0, candidates: [] });
  const normalized = routePathWitnessPool(empty, { ...value.routing, domain: context.domain, viewId: view.view().id, epoch, subject: context.subject, start: 0, count: 0, excluded: [], loads: value.routing.mode === 'best-of-two' ? [] : null }).query;
  const preflight = { poolChecks: 1, poolRows: 0, retainedPoolEntries: 0, loadRows: 0 }, seen = new Set(), pools = [];
  for (const r of array(value.pools, 64)) {
    fields(r, ['subject', 'pool', 'loads']); const subject = pathWitnessContext({ domain: context.domain, subject: r.subject, policy: context.policy }).subject;
    if (seen.has(subject)) throw new TypeError('duplicate composite pool subject'); seen.add(subject);
    const loads = r.loads === null ? null : array(r.loads, 64).map(row => { fields(row, ['id', 'load']); return { id: row.id, load: row.load }; });
    const checked = routePathWitnessPool(r.pool, { ...normalized, subject, loads }); pools.push({ subject, pool: checked.pool, loads: checked.query.loads });
    preflight.poolChecks++; preflight.poolRows++; preflight.retainedPoolEntries += checked.pool.ranked.length; preflight.loadRows += checked.query.loads?.length ?? 0;
  }
  return { advice: { pools, routing: { seed: normalized.seed, queryId: normalized.queryId, step: normalized.step, mode: normalized.mode } }, preflight };
}
function check(r, kind, view, context, query, forest) {
  const producer = kind === 'prefix' || kind === 'union';
  fields(r, ['schema', 'status', 'feasible', 'reason', 'viewRoot', producer ? 'canonicalReference' : 'reference', 'context', 'query', 'required', 'witness', 'wire', 'verification', ...(kind === 'prefix' ? ['forestRoot', 'forest', 'prefix', 'segments', 'stats'] : kind === 'union' ? ['reference', 'forestRoot', 'forest', 'retained', 'coverage', 'work'] : ['stats', 'source', 'work', 'cache'])]);
  const allowed = kind === 'probe' ? ['found', 'miss'] : kind === 'finish' ? ['found', 'infeasible', 'censored', 'unavailable'] : ['found', 'miss', 'censored', 'unavailable'];
  const schema = { probe: 'facety-path-cache-probe/v1', prefix: 'facety-path-proposal/v1', union: 'facety-path-union-proposal/v1', finish: 'facety-path-advice/v1' }[kind], found = r.status === 'found';
  if (r.schema !== schema || !allowed.includes(r.status) || r.feasible !== (found ? true : r.status === 'infeasible' ? false : null) || r.viewRoot !== view.view().id || r[producer ? 'canonicalReference' : 'reference'] !== view.capture.reference
    || !same(r.context, context) || !same(r.query, query) || (producer && (r.forestRoot !== forest.meta.originRoot || !same(r.forest, forest.meta))) || (kind === 'union' && r.reference !== 'bounded-two-sided-union-m2/v1')) throw new Error('composite stage scope disagreement');
  if (found) {
    const v = kind === 'union' ? r.verification?.current : r.verification;
    if (typeof r.wire !== 'string' || !v?.primary.accepted || !v?.ref2.accepted || v.primary.required !== r.required || v.ref2.required !== r.required || r.required !== view.snapshot(query.epoch)?.difficulty) throw new Error('composite stage verification disagreement');
    const witness = decodePathWitness(Buffer.from(r.wire), context);
    if (witness.epoch !== query.epoch || !same(witness, r.witness)) throw new Error('composite stage packet disagreement');
    if (kind === 'union' && (!r.verification.retained?.primary.accepted || !r.verification.retained?.ref2.accepted || r.verification.retained.primary.required !== r.required || r.verification.retained.ref2.required !== r.required)) throw new Error('composite retained verification disagreement');
  } else if (r.wire !== null || r.witness !== null || r.verification !== null) throw new Error('composite unexpected nonpositive proof');
  if (!producer) {
    fields(r.work, ['cacheChecks', 'hintChecks', 'primaryChecks', 'ref2Checks', 'oracleCalls', 'expired']);
    if (Object.values(r.work).some(n => !natural(n)) || r.work.cacheChecks > 1 || r.work.hintChecks > 1 || r.work.oracleCalls > 1 || r.work.primaryChecks !== r.work.ref2Checks) throw new Error('composite cache work disagreement');
  }
}
function cacheReceipt(r, cfg, tick) {
  fields(r.cache, ['reference', 'config', 'retained', 'originRoot', 'insertedAt', 'expiresAt']); const c = r.cache;
  if (c.reference !== 'verified-whole-witness-fifo/v1' || !same(c.config, cfg) || typeof c.retained !== 'boolean' || (c.retained ? r.status !== 'found' || typeof c.originRoot !== 'string' || !natural(c.insertedAt) || !natural(c.expiresAt) || c.insertedAt > tick || c.expiresAt <= tick || c.expiresAt - c.insertedAt !== cfg.ttlTicks : c.originRoot !== null || c.insertedAt !== null || c.expiresAt !== null)
    || (r.source !== 'oracle' && r.stats !== null) || (r.source === 'cache' && r.status === 'found' && !c.retained)) throw new Error('composite cache retention disagreement');
}
function segmentChange(before, after, raw, query, normalizedAdvice) {
  const s = raw.segments;
  if (s?.reference !== 'bounded-prefix-tree-segments/v1' || !same(s.cache.config, before.config) || s.cache.initialTick !== before.lastTick || !same(raw.prefix?.advice, normalizedAdvice)
    || Object.values(s.stats).some(n => !natural(n)) || Object.values(s.work).some(n => !natural(n))) throw new Error('composite prefix scope/work disagreement');
  if (s.work.refreshed !== 0 || s.stats.lookupCalls > s.stats.pairsExamined || s.stats.pairsExamined > query.maxSegmentLookups || s.work.checked > query.maxSegmentChecks || s.work.returned > query.maxSegmentResults || s.stats.consumedJoins !== s.joins.length || s.stats.consumedJoins > s.work.returned
    || s.stats.inventorySweepEntryUpperBound !== before.entries * s.stats.lookupCalls || after.entries !== before.entries - s.work.expired - s.work.evicted || after.bytes > before.bytes || ['endpointKeys', 'edgeKeys', 'vertexKeys'].some(k => after[k] > before[k])
    || (s.stats.lookupCalls ? after.lastTick !== query.tick : !same(before, after))) throw new Error('composite segment clock/work disagreement');
  const old = new Map(before.records.map(r => [r.id, r])), kept = new Set(after.records.map(r => r.id)); let uses = 0, saturated = false;
  if (!same(before.records.filter(r => kept.has(r.id)).map(r => r.id), after.records.map(r => r.id))) throw new Error('composite segment FIFO disagreement');
  for (const r of after.records) {
    const prev = old.get(r.id); if (!prev || ['bytes', 'originRoot', 'storedAt', 'expiresAt'].some(k => r[k] !== prev[k]) || r.uses < prev.uses || (prev.usesSaturated && !r.usesSaturated)) throw new Error('composite segment retained state disagreement');
    const touched = !same(r, prev);
    if (touched ? r.verifiedAt !== query.tick || r.lastVerifiedRoot !== raw.viewRoot : !same(r, prev)) throw new Error('composite segment verification metadata disagreement');
    uses += r.uses - prev.uses; saturated ||= r.usesSaturated;
  }
  if (!natural(uses) || uses > s.work.returned || (!saturated && uses !== s.work.returned)) throw new Error('composite segment returned/use disagreement');
  let offers = 0; for (const r of raw.prefix.routes) offers += r.selected.length;
  if (!natural(offers) || offers !== raw.prefix.stats.routedPeers || raw.prefix.routes.length !== raw.prefix.stats.routeCalls || (raw.status === 'unavailable' && (offers || s.stats.lookupCalls))) throw new Error('composite prefix route disagreement');
}
function freeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const c of Object.values(v)) freeze(c); Object.freeze(v); } return v; }
export function queryPathWitnessComposite(owners, view, suppliedContext, input, suppliedAdvice) {
  fields(owners, ['whole', 'segments', 'forest']); const { whole, segments, forest } = owners;
  if (!whole || Object.getPrototypeOf(whole) !== PathWitnessCache.prototype || !segments || Object.getPrototypeOf(segments) !== PathWitnessSegmentCache.prototype) throw new TypeError('composite requires exact local cache owners');
  if (!isPathWitnessView(view) || !isPathWitnessForest(forest)) throw new TypeError('composite requires local forest and immutable capture');
  const context = pathWitnessContext(suppliedContext), policyId = pathWitnessPolicyId(context.policy);
  if (view.toJSON().policyId !== policyId || forest.meta.policyId !== policyId) throw new TypeError('composite policy differs from capture');
  fields(input, ['tick', 'prefix', 'union', 'fallback']);
  const request = { tick: input.tick, prefix: config(input.prefix, prefixKeys, { ...PATH_TREE_LIMITS, ...PATH_SEGMENT_PROPOSAL_LIMITS }), union: config(input.union, ['epoch', ...Object.keys(PATH_UNION_LIMITS), ...Object.keys(PATH_ORACLE_LIMITS)], { ...PATH_UNION_LIMITS, ...PATH_ORACLE_LIMITS }), fallback: config(input.fallback, ['epoch', ...Object.keys(PATH_ORACLE_LIMITS)], PATH_ORACLE_LIMITS) };
  if (request.prefix.epoch !== request.union.epoch || request.prefix.epoch !== request.fallback.epoch || request.prefix.tick !== request.tick) throw new RangeError('composite ticks/epochs differ');
  if (request.prefix.maxPrefixHops > context.policy.maxHops || request.union.maxSubjectHops > context.policy.maxHops || request.union.maxAnchorHops > context.policy.maxHops) throw new RangeError('composite radius exceeds policy');
  const { advice, preflight } = adviceData(suppliedAdvice, context, view, request.prefix.epoch), before = { whole: wholeStats(whole), segments: segmentStats(segments) };
  if (!natural(request.tick) || (before.whole.lastTick !== null && request.tick < before.whole.lastTick) || (before.segments.lastTick !== null && request.tick < before.segments.lastTick) || request.tick > Number.MAX_SAFE_INTEGER - whole.config.ttlTicks) throw new RangeError('composite clock/expiry');
  freeze(request); freeze(advice);
  const probe = PathWitnessCache.prototype.probe.call(whole, view, context, request.fallback, { tick: request.tick }); check(probe, 'probe', view, context, request.fallback, forest);
  cacheReceipt(probe, whole.config, request.tick);
  if (probe.source !== 'cache' || (probe.status === 'found' && probe.work.cacheChecks !== 1) || probe.work.hintChecks || probe.work.oracleCalls || (probe.status === 'miss' && (probe.required !== null || probe.reason !== 'cache-miss'))) throw new Error('composite probe disagreement');
  const skipped = () => ({ called: false, inventoryBefore: null, receipt: null });
  const stages = { probe: { called: true, inventoryBefore: before.whole.entries, receipt: probe }, prefix: skipped(), union: skipped(), finish: skipped() };
  const afterProbe = wholeStats(whole); let chosen = probe, source = 'cache', sweep = before.whole.entries, expectedSegments = before.segments;
  if (probe.status === 'miss') {
    const p = proposePathWitnessFromSegments(forest, view, context, request.prefix, advice, segments); check(p, 'prefix', view, context, request.prefix, forest);
    expectedSegments = segmentStats(segments); segmentChange(before.segments, expectedSegments, p, request.prefix, advice); stages.prefix = { called: true, inventoryBefore: before.segments.entries, receipt: p };
    let hint = p.status === 'found' ? p.wire : null; source = 'prefix';
    if (p.status !== 'found') {
      const u = proposePathWitnessFromUnion(forest, view, context, request.union); check(u, 'union', view, context, request.union, forest); stages.union = { called: true, inventoryBefore: null, receipt: u }; hint = u.status === 'found' ? u.wire : null; source = hint === null ? 'oracle' : 'union';
    }
    const middle = wholeStats(whole); if (!same(middle, afterProbe)) throw new Error('composite producer changed whole cache'); sweep += middle.entries;
    const finish = PathWitnessCache.prototype.lookup.call(whole, view, context, request.fallback, { tick: request.tick, hint }); check(finish, 'finish', view, context, request.fallback, forest);
    cacheReceipt(finish, whole.config, request.tick);
    if (finish.work.cacheChecks !== 0 || (hint !== null ? finish.source !== 'hint' || finish.work.hintChecks !== 1 || finish.work.oracleCalls !== 0 || finish.wire !== hint : finish.source !== 'oracle' || finish.work.hintChecks !== 0 || finish.work.oracleCalls !== 1)) throw new Error('composite finish source disagreement');
    stages.finish = { called: true, inventoryBefore: middle.entries, receipt: finish }; chosen = finish;
  }
  const after = { whole: wholeStats(whole), segments: segmentStats(segments) };
  if (!same(expectedSegments, after.segments)) throw new Error('composite nonprefix stage changed segment cache');
  const work = { cacheAdmissions: stages.finish.called ? 2 : 1, cacheSweepEntryUpperBound: sweep, prefixCalled: stages.prefix.called, unionCalled: stages.union.called, fullOracleCalls: stages.finish.receipt?.work.oracleCalls ?? 0, segmentLookups: stages.prefix.receipt?.segments.stats.lookupCalls ?? 0, segmentSweepEntryUpperBound: stages.prefix.receipt?.segments.stats.inventorySweepEntryUpperBound ?? 0, routedPeers: stages.prefix.receipt?.prefix.stats.routedPeers ?? 0 };
  const receipts = stages.finish.called ? [probe, chosen] : [probe], deltas = { queries: work.cacheAdmissions, cacheHits: Number(source === 'cache'), hintHits: Number(source === 'prefix' || source === 'union'), cacheRejects: probe.status === 'miss' ? probe.work.cacheChecks : 0, hintRejects: 0, oracleCalls: work.fullOracleCalls, invalidations: 0, invalidated: 0 };
  for (const k of ['primaryChecks', 'ref2Checks', 'expired']) deltas[k] = receipts.reduce((n, r) => n + r.work[k], 0);
  for (const k of counters) if (after.whole[k] < before.whole[k]) throw new Error('composite whole count rollback');
  for (const [k, n] of Object.entries(deltas)) if (after.whole[k] - before.whole[k] !== n) throw new Error('composite whole counter disagreement');
  if (after.whole.lastTick !== request.tick || !natural(sweep)) throw new Error('composite whole clock/sweep disagreement');
  const result = { source, ...Object.fromEntries(['status', 'reason', 'feasible', 'required', 'wire', 'witness', 'verification', 'viewRoot', 'reference', 'context', 'query', 'stats'].map(k => [k, chosen[k]])) };
  return freeze({ schema: 'facety-path-composite/v1', reference: 'verified-cache-prefix-union-fallback/v1', provenance: provenance(), assumptions: ['Supplied capture/ledger/standing labels assume coherent lineage and facts, not authenticated personhood or funded authorization.', 'D1 preparation is inherited per supplied view object; exact work/proposal digests require equivalent aliasing/prior preparation history or fresh equivalent captures, not viewRoot alone.'], viewRoot: view.view().id, forestRoot: forest.meta.originRoot, context, input: request, advice, preflight, result, stages, cacheStats: { whole: { before: before.whole, after: after.whole }, segments: { before: before.segments, after: after.segments } }, work });
}
