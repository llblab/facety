// Owns: Budgeted exhaustive bounded-hop witness existence on immutable captures; excludes authentication, live authorization, indexer heuristics and economic mutation.
import { pathWitnessPolicy, pathWitnessPolicyId, encodePathWitness, decodePathWitness, verifyPathWitness } from './path-witness.mjs';
import { verifyPathWitnessRef2 } from './path-witness-ref2.mjs';
import { isPathWitnessView } from './path-witness-view.mjs';

export const PATH_ORACLE_LIMITS = Object.freeze({ maxExpansions: 1000000, maxPaths: 4096, maxPackingSteps: 1000000 });
function fields(v, keys) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Reflect.ownKeys(v).length !== keys.length || Object.keys(v).length !== keys.length
    || keys.some(k => !Object.hasOwn(v, k)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('oracle requires exact data fields');
}
function natural(v) { return Number.isSafeInteger(v) && !Object.is(v, -0) && v >= 0; }
function text(value, max) {
  if (typeof value !== 'string' || !value.length || value.length > max || Buffer.byteLength(value) > max) throw new TypeError('invalid oracle context ID/domain');
  for (const c of value) if (c.codePointAt(0) >= 0xd800 && c.codePointAt(0) <= 0xdfff) throw new TypeError('invalid oracle Unicode');
  return value;
}
export function findPathWitness(view, suppliedContext, input) {
  if (!isPathWitnessView(view)) throw new TypeError('oracle requires a locally constructed immutable path view');
  fields(suppliedContext, ['domain', 'subject', 'policy']);
  const p = pathWitnessPolicy(suppliedContext.policy);
  const context = Object.freeze({ domain: text(suppliedContext.domain, p.maxIdBytes), subject: text(suppliedContext.subject, p.maxIdBytes), policy: p });
  if (pathWitnessPolicyId(p) !== view.toJSON().policyId) throw new TypeError('oracle context policy differs from capture');
  fields(input, ['epoch', ...Object.keys(PATH_ORACLE_LIMITS)]);
  if (!natural(input.epoch)) throw new RangeError('invalid oracle epoch');
  for (const [key, cap] of Object.entries(PATH_ORACLE_LIMITS)) if (!natural(input[key]) || input[key] > cap) throw new RangeError('unsupported oracle budget ' + key);
  const query = Object.freeze({ epoch: input.epoch, maxExpansions: input.maxExpansions, maxPaths: input.maxPaths, maxPackingSteps: input.maxPackingSteps });
  const stats = { expansions: 0, paths: 0, packingSteps: 0, enumerationComplete: false, packingComplete: false };
  let required = null, witness = null, wire = null, verification = null;
  const result = (status, reason) => Object.freeze({ schema: 'facety-path-search/v1', status,
    feasible: status === 'found' ? true : status === 'infeasible' ? false : null, reason,
    viewRoot: view.view().id, reference: view.capture.reference, context, query, required, witness, wire,
    stats: Object.freeze({ ...stats }), verification });
  const current = view.view().epoch;
  if (query.epoch > current || current - query.epoch > p.graceEpochs) return result('unavailable', 'epoch-outside-grace');
  const snapshot = view.snapshot(query.epoch);
  if (snapshot === null) return result('unavailable', 'snapshot-unavailable');
  required = snapshot.difficulty;
  if (view.degree(context.subject, p.direction, p.undirectedProjection) < required) return result('infeasible', 'degree-infeasible');
  if (view.anchorCount(query.epoch, context.subject) < required) return result('infeasible', 'anchor-infeasible');
  const paths = []; let enumerationStop = null;
  function enumerate(path, seen) {
    const node = path.at(-1);
    if (path.length > 1 && view.anchor(query.epoch, node) && !view.removed(node)) {
      if (paths.length === query.maxPaths) { enumerationStop = 'path-limit'; return; }
      paths.push([...path]); stats.paths++;
    }
    if (path.length - 1 === p.maxHops) return;
    if (path.length > 1 && p.minStanding !== null) {
      const score = view.standing(node);
      if (score === null || score < p.minStanding) return;
    }
    for (const next of view.neighbors(node, p.direction, p.undirectedProjection)) {
      if (stats.expansions === query.maxExpansions) { enumerationStop = 'expansion-limit'; return; }
      stats.expansions++;
      if (seen.has(next)) continue;
      seen.add(next); path.push(next); enumerate(path, seen); path.pop(); seen.delete(next);
      if (enumerationStop) return;
    }
  }
  enumerate([context.subject], new Set([context.subject]));
  stats.enumerationComplete = enumerationStop === null;
  let packingStop = false;
  function pack(start, chosen, occupied) {
    if (chosen.length === required) return [...chosen];
    if (paths.length - start < required - chosen.length) return null;
    for (let i = start; i < paths.length; i++) {
      if (stats.packingSteps === query.maxPackingSteps) { packingStop = true; return null; }
      stats.packingSteps++;
      const vertices = paths[i].slice(1);
      if (vertices.some(v => occupied.has(v))) continue;
      for (const v of vertices) occupied.add(v);
      chosen.push(paths[i]); const found = pack(i + 1, chosen, occupied); chosen.pop();
      for (const v of vertices) occupied.delete(v);
      if (found) return found;
      if (packingStop) return null;
    }
    return null;
  }
  const family = pack(0, [], new Set());
  stats.packingComplete = family === null && !packingStop;
  if (family === null) {
    if (packingStop) return result('censored', 'packing-limit');
    if (enumerationStop) return result('censored', enumerationStop);
    return result('infeasible', paths.length < required ? 'path-shortage' : 'family-conflict');
  }
  let bytes;
  try { bytes = encodePathWitness({ subject: context.subject, epoch: query.epoch, paths: family }, context); }
  catch (error) {
    if (error instanceof RangeError && error.message === 'witness wire byte bound') return result('censored', 'witness-byte-bound');
    throw error;
  }
  const primary = verifyPathWitness(bytes, context, view), ref2 = verifyPathWitnessRef2(bytes, context, view);
  if (!primary.accepted || !ref2.accepted || primary.required !== required || ref2.required !== required) throw new Error('oracle produced a verifier disagreement');
  verification = Object.freeze({ primary, ref2 });
  witness = decodePathWitness(bytes, context); wire = bytes.toString('utf8');
  return result('found', 'ok');
}
