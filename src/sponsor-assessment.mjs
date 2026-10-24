// Owns: Opt-in conditional sponsor private-utility assessment; excludes truth, eligibility, protocol consequences, calibration and learning.
export const SPONSOR_ASSESSMENT_POLICY = 'two-outcome-private-utility-v1';
const BELIEFS = ['positiveDistinct', 'positiveShared', 'negative', 'missing'];
const PAYOFFS = ['upheld', 'rejected', 'participation', 'workCost', 'abstain'];
function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new TypeError(label + ' requires exactly its declared fields');
}
function finite(value) {
  if (!Number.isFinite(value)) throw new RangeError('sponsor private-utility arithmetic overflow');
  return value === 0 ? 0 : value;
}
function product(weight, value) {
  return weight === 0 ? 0 : weight === null || value === null ? null : finite(weight * value);
}
function sum(values) {
  return values.includes(null) ? null : values.reduce((total, value) => finite(total + value), 0);
}

// Beliefs are supplied subjective prospects conditional on received evidence, not court accuracy or target validity.
export function assessSponsorship(evidence, suppliedProfile) {
  record(evidence, ['suspicious', 'distinctSource'], 'sponsor evidence');
  const missing = evidence.suspicious === null && evidence.distinctSource === null;
  if (!missing && (typeof evidence.suspicious !== 'boolean' || typeof evidence.distinctSource !== 'boolean')) throw new TypeError('sponsor evidence is a received boolean pair or explicit missing pair');
  record(suppliedProfile, ['goal', 'utilityUnit', 'beliefs', 'payoffs'], 'sponsor profile');
  for (const key of ['goal', 'utilityUnit']) if (typeof suppliedProfile[key] !== 'string' || !suppliedProfile[key].length) throw new TypeError(key + ' must be a nonempty caller-owned label');
  record(suppliedProfile.beliefs, BELIEFS, 'sponsor beliefs');
  record(suppliedProfile.payoffs, PAYOFFS, 'sponsor payoffs');
  const profile = structuredClone(suppliedProfile);
  for (const probability of Object.values(profile.beliefs)) if (probability !== null && (!Number.isFinite(probability) || probability < 0 || probability > 1)) throw new RangeError('subjective sponsor prospects must be in [0,1] or null');
  for (const [key, value] of Object.entries(profile.payoffs)) if (value !== null && (!Number.isFinite(value) || (key === 'workCost' && value < 0))) throw new RangeError('sponsor payoffs must be finite or null; workCost non-negative');
  const basis = missing ? 'missing' : !evidence.suspicious ? 'negative' : evidence.distinctSource ? 'positiveDistinct' : 'positiveShared';
  const probability = profile.beliefs[basis];
  const components = {
    upheld: product(probability, profile.payoffs.upheld),
    rejected: product(probability === null ? null : 1 - probability, profile.payoffs.rejected),
    participation: profile.payoffs.participation,
    workCost: product(-1, profile.payoffs.workCost),
  };
  const expectedUtility = sum(Object.values(components));
  const difference = sum([expectedUtility, product(-1, profile.payoffs.abstain)]);
  const status = difference === null ? 'unknown' : difference === 0 ? 'indifferent' : difference > 0 ? 'preferred' : 'disfavored';
  return {
    policy: SPONSOR_ASSESSMENT_POLICY, evidence: { ...evidence }, profile, basis, perceivedUpheldProbability: probability,
    components, expectedUtility, differenceFromAbstention: difference, status,
    willing: status === 'preferred' ? true : status === 'disfavored' ? false : null,
    missingComponents: [...Object.entries(components).filter(([, value]) => value === null).map(([key]) => key), ...(profile.payoffs.abstain === null ? ['abstain'] : [])],
    interpretation: 'Caller-owned prospective private utility for a supplied hypothetical outcome menu, not payoff from the currently blocked executable act-case path, verified truth, court accuracy, executed money/XP, welfare, calibrated human choice or eligibility. Exact ties/unknowns choose no automatic action.',
  };
}
