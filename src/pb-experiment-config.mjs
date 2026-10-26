// Owns: Closed P/b capacity config/measurement vocabulary; excludes execution, empirical inference and CORE policy.
import { FacetyModel, DEFAULT_POLICY, DEFAULT_ABLATIONS } from './model.mjs';

export const PB_ENGINE = 'native-pb-capacity/v1';
export const PB_REFERENCE = 'native-own-source-daily-capacity-reference/v1';
export const PB_RANDOMNESS = Object.freeze({ generator: 'none', decisions: 'pb-deterministic-daily-v1', schedule: 'pb-capacity-boundary-v1' });
export const PB_OBSERVABLES = Object.freeze(Object.fromEntries([
  'created', 'offered', 'cooldownDenied', 'fundingDenied', 'minted', 'burned', 'emitterVault', 'matureUnspent', 'immatureUnspent', 'xpTotal',
].map(key => ['pb.' + key, 1])));
function fields(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new TypeError(label + ' requires exactly: ' + keys.join(', '));
}
function integer(value, name, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(name + ' must be a bounded safe integer');
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function pbExperimentConfig(input) {
  fields(input, ['engine', 'reference', 'days', 'seed', 'includeState', 'maxActions', 'successCriterion', 'emissionEveryDays', 'model'], 'P/b experiment');
  if (input.engine !== PB_ENGINE || input.reference !== PB_REFERENCE) throw new TypeError('unsupported P/b capacity engine/reference');
  integer(input.days, 'days', 0, 3650); integer(input.emissionEveryDays, 'emissionEveryDays', 1, 3650); integer(input.maxActions, 'maxActions', 1);
  if (typeof input.seed !== 'string' || !input.seed.length) throw new TypeError('P/b seed must be explicit nonempty text');
  if (typeof input.includeState !== 'boolean' || input.successCriterion !== 'unbound') throw new TypeError('P/b requires includeState Boolean and unbound success criterion');
  fields(input.model, ['genesis', 'policy', 'ablations', 'invitationLimit', 'vouching', 'vouchAdmission'], 'P/b model');
  fields(input.model.policy, Object.keys(DEFAULT_POLICY), 'complete P/b policy');
  fields(input.model.ablations, Object.keys(DEFAULT_ABLATIONS), 'complete P/b ablations');
  const model = new FacetyModel(input.model), expected = { ...DEFAULT_POLICY, xpFinality: 'maturity', guarantorEligibility: 'accepted' };
  if (JSON.stringify(input.model.genesis) !== JSON.stringify(['creator', 'support']) || model.invitationLimit === null
    || model.vouching !== null || model.vouchAdmission !== null
    || Object.entries(expected).some(([key, value]) => model.policy[key] !== value)
    || Object.entries(DEFAULT_ABLATIONS).some(([key, value]) => model.ablations[key] !== value)) throw new TypeError('unsupported closed P/b capacity model');
  // Constructor-only validation creates no funded sources, relations, observations or tape actions.
  return freeze(structuredClone(input));
}
