// Owns: Synchronous bounded cache/retained-union/full-fallback query composition; excludes maintenance, pool/load/segment policies, proof internals, canonical authority and economic mutation.
import { PathWitnessCache } from './path-witness-cache.mjs';
import { isPathWitnessForest, proposePathWitnessFromUnion, PATH_UNION_LIMITS } from './path-witness-trees.mjs';
import { PATH_ORACLE_LIMITS } from './path-witness-oracle.mjs';
import { isPathWitnessView } from './path-witness-view.mjs';
import { pathWitnessContext, pathWitnessPolicyId, decodePathWitness } from './path-witness.mjs';
import { provenance } from './provenance.mjs';
const natural = n => Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0;
const inventoryKeys = new Set(['entries', 'bytes', 'edgeKeys', 'anchorKeys', 'lastTick']);
function fields(v, keys) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Reflect.ownKeys(v).length !== keys.length || Object.keys(v).length !== keys.length
    || keys.some(k => !Object.hasOwn(v, k)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('pipeline requires exact data fields');
}
function config(v, limits) {
  fields(v, ['epoch', ...Object.keys(limits)]);
  for (const key of Object.keys(v)) if (!natural(v[key]) || (key !== 'epoch' && v[key] > limits[key])) throw new RangeError('unsupported pipeline budget/epoch ' + key);
  return Object.fromEntries(['epoch', ...Object.keys(limits)].map(k => [k, v[k]]));
}
function freeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }
function stats(cache) {
  const s = PathWitnessCache.prototype.stats.call(cache);
  if (Object.entries(s).some(([k, v]) => !(k === 'lastTick' && v === null) && !natural(v)) || s.entries > cache.config.maxEntries || s.bytes > cache.config.maxBytes) throw new Error('pipeline unsafe cache stats');
  return s;
}
function check(receipt, schema, allowed, view, context, query, union = false) {
  const found = receipt.status === 'found', expected = found ? true : receipt.status === 'infeasible' ? false : null;
  if (receipt.schema !== schema || !allowed.includes(receipt.status) || receipt.feasible !== expected || receipt.viewRoot !== view.view().id
    || receipt[union ? 'canonicalReference' : 'reference'] !== view.capture.reference || JSON.stringify(receipt.context) !== JSON.stringify(context)
    || JSON.stringify(receipt.query) !== JSON.stringify(query)) throw new Error('pipeline stage scope disagreement');
  if (found) {
    const verification = union ? receipt.verification?.current : receipt.verification;
    if (typeof receipt.wire !== 'string' || !verification?.primary.accepted || !verification?.ref2.accepted || verification.primary.required !== receipt.required
      || verification.ref2.required !== receipt.required || receipt.required !== view.snapshot(query.epoch)?.difficulty) throw new Error('pipeline stage verification disagreement');
    const witness = decodePathWitness(Buffer.from(receipt.wire), context);
    if (witness.epoch !== query.epoch || JSON.stringify(witness) !== JSON.stringify(receipt.witness)) throw new Error('pipeline stage packet disagreement');
  } else if (receipt.wire !== null || receipt.witness !== null || receipt.verification !== null) throw new Error('pipeline unexpected nonpositive proof');
  if (!union) {
    fields(receipt.work, ['cacheChecks', 'hintChecks', 'primaryChecks', 'ref2Checks', 'oracleCalls', 'expired']);
    if (Object.values(receipt.work).some(n => !natural(n)) || receipt.work.cacheChecks > 1 || receipt.work.hintChecks > 1 || receipt.work.oracleCalls > 1
      || receipt.work.primaryChecks !== receipt.work.ref2Checks) throw new Error('pipeline stage counter disagreement');
  }
}
export function queryPathWitness(cache, forest, view, suppliedContext, input) {
  if (!cache || Object.getPrototypeOf(cache) !== PathWitnessCache.prototype) throw new TypeError('pipeline requires exact local whole-witness cache');
  const before = stats(cache);
  if (!isPathWitnessForest(forest) || !isPathWitnessView(view)) throw new TypeError('pipeline requires local forest and immutable capture');
  const context = pathWitnessContext(suppliedContext), policyId = pathWitnessPolicyId(context.policy);
  if (view.toJSON().policyId !== policyId || forest.meta.policyId !== policyId) throw new TypeError('pipeline policy differs from capture');
  fields(input, ['tick', 'union', 'fallback']);
  const request = { tick: input.tick, union: config(input.union, { ...PATH_UNION_LIMITS, ...PATH_ORACLE_LIMITS }), fallback: config(input.fallback, PATH_ORACLE_LIMITS) };
  if (request.union.epoch !== request.fallback.epoch) throw new RangeError('pipeline query epochs differ');
  if (request.union.maxSubjectHops > context.policy.maxHops || request.union.maxAnchorHops > context.policy.maxHops) throw new RangeError('pipeline radius exceeds policy hop bound');
  if (!natural(request.tick) || (before.lastTick !== null && request.tick < before.lastTick) || request.tick > Number.MAX_SAFE_INTEGER - cache.config.ttlTicks) throw new RangeError('invalid pipeline clock/expiry');
  freeze(request);
  const probe = PathWitnessCache.prototype.probe.call(cache, view, context, request.fallback, { tick: request.tick });
  check(probe, 'facety-path-cache-probe/v1', ['found', 'miss'], view, context, request.fallback);
  if (probe.source !== 'cache' || probe.work.oracleCalls || probe.work.hintChecks || (probe.status === 'miss' && (probe.required !== null || probe.reason !== 'cache-miss'))) throw new Error('pipeline probe disagreement');
  const stages = { probe: { called: true, inventoryBefore: before.entries, receipt: probe }, advice: { called: false, inventoryBefore: null, receipt: null }, finish: { called: false, inventoryBefore: null, receipt: null } };
  let chosen = probe, source = 'cache', sweep = before.entries;
  if (probe.status === 'miss') {
    const advice = proposePathWitnessFromUnion(forest, view, context, request.union);
    check(advice, 'facety-path-union-proposal/v1', ['found', 'miss', 'censored', 'unavailable'], view, context, request.union, true);
    stages.advice = { called: true, inventoryBefore: null, receipt: advice };
    const inventory = stats(cache);
    if (inventory.queries - before.queries !== 1) throw new Error('pipeline unexpected cache admission');
    sweep += inventory.entries;
    const finish = PathWitnessCache.prototype.lookup.call(cache, view, context, request.fallback, { tick: request.tick, hint: advice.status === 'found' ? advice.wire : null });
    check(finish, 'facety-path-advice/v1', ['found', 'infeasible', 'censored', 'unavailable'], view, context, request.fallback);
    if (finish.work.cacheChecks !== 0 || (advice.status === 'found'
      ? finish.source !== 'hint' || finish.work.oracleCalls !== 0 || finish.work.hintChecks !== 1 || finish.wire !== advice.wire || finish.required !== advice.required
      : finish.source !== 'oracle' || finish.work.oracleCalls !== 1 || finish.work.hintChecks !== 0)) throw new Error('pipeline finish source disagreement');
    stages.finish = { called: true, inventoryBefore: inventory.entries, receipt: finish }; chosen = finish; source = advice.status === 'found' ? 'union' : 'oracle';
  }
  const work = { cacheAdmissions: stages.finish.called ? 2 : 1, cacheSweepEntryUpperBound: sweep, unionCalled: stages.advice.called, fullOracleCalls: stages.finish.receipt?.work.oracleCalls ?? 0 };
  const after = stats(cache), receipts = stages.finish.called ? [probe, chosen] : [probe];
  for (const [k, v] of Object.entries(before)) if (!inventoryKeys.has(k) && after[k] < v) throw new Error('pipeline cache count rollback');
  const deltas = { queries: work.cacheAdmissions, cacheHits: Number(source === 'cache'), hintHits: Number(source === 'union'), hintRejects: 0,
    cacheRejects: probe.status === 'miss' ? probe.work.cacheChecks : 0, oracleCalls: work.fullOracleCalls };
  for (const key of ['primaryChecks', 'ref2Checks', 'expired']) deltas[key] = receipts.reduce((n, r) => n + r.work[key], 0);
  for (const [key, expected] of Object.entries(deltas)) if (after[key] - before[key] !== expected) throw new Error('pipeline cache counter disagreement');
  if (after.lastTick !== request.tick || !natural(sweep)) throw new Error('pipeline clock/inventory disagreement');
  const result = { source, ...Object.fromEntries(['status', 'reason', 'feasible', 'required', 'wire', 'witness', 'verification', 'viewRoot', 'reference', 'context', 'query', 'stats'].map(k => [k, chosen[k]])) };
  return freeze({ schema: 'facety-path-pipeline/v1', reference: 'verified-cache-union-fallback/v1', provenance: provenance(), viewRoot: view.view().id,
    forestRoot: forest.meta.originRoot, context, input: request, result, stages, cacheStats: { before, after }, work });
}
