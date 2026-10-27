// Owns: Closed living-accountability scalar reference config/vocabulary; excludes execution, court authority and scientific inference.
export const LIVING_ENGINE = 'native-living-accountability/v1';
export const LIVING_REFERENCE = 'support-allocation-control/v1';
export const LIVING_RANDOMNESS = Object.freeze({ generator: 'none', decisions: 'living-fixed-public-policy/v1',
  observations: 'supplied-stance-tape/v1', schedule: 'living-day-plus-four-post-command/v1' });
export const LIVING_OBSERVABLES = Object.freeze(Object.fromEntries([
  'acceptedBirths', 'taggedDefectCasesUpheld', 'taggedValidPrincipalCollected', 'sourcePrincipalCollected',
  'unpaidPrincipalDebt', 'pausedIssueSlots', 'relayWork', 'openCases', 'refusedCaseRequests', 'unavailableReports',
].map(key => ['living.' + key, 1])));
export function livingExperimentConfig(input) {
  const keys = ['engine', 'reference', 'days', 'seed', 'includeState', 'maxActions', 'successCriterion', 'supportAllocation'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join() !== keys.sort().join()) throw new TypeError('living experiment requires exactly: ' + keys.join(', '));
  if (input.engine !== LIVING_ENGINE || input.reference !== LIVING_REFERENCE || input.days !== 365
    || !['concentrated', 'dispersed'].includes(input.supportAllocation)) throw new TypeError('unsupported closed living-accountability reference');
  if (typeof input.seed !== 'string' || !input.seed.length || typeof input.includeState !== 'boolean' || input.successCriterion !== 'unbound') throw new TypeError('living reference requires identity seed/Boolean state/unbound success');
  if (!Number.isSafeInteger(input.maxActions) || input.maxActions < 1 || input.maxActions > 100000) throw new RangeError('living maxActions must be in [1,100000]');
  return Object.freeze(structuredClone(input));
}
