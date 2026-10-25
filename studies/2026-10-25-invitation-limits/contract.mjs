// Owns: Draft invitation-limit arm inventory and analytic prior; excludes native policy, growth simulation and inference.
function integer(value, name, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(name + ' must be an integer >= ' + minimum);
}
export function invitationLimitArms() {
  return Object.freeze([
    { id: 'A', P: 1, b: 1 },
    ...[3, 7].flatMap(P => [{ id: 'B-' + P, P, b: 0 }, ...[1, P, 2 * P].map(b => ({ id: 'H-' + P + '-' + b, P, b }))]),
    { id: '0', P: null, b: 0 },
  ].map(arm => Object.freeze(arm)));
}
// A service-capacity bound under stationary earning and unlimited eligible demand, not a population growth law.
export function invitationCapacityPrior(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['P', 'b', 'E'].includes(key))) throw new TypeError('prior requires only P, b and E');
  const { P, b, E } = input;
  if (P !== null) integer(P, 'P', 1);
  integer(b, 'b', 0);
  if (!Number.isFinite(E) || E < 0) throw new RangeError('E must be finite nonnegative own FACY/day');
  const temporal = P === null ? Infinity : 1 / P;
  const monetary = b === 0 ? Infinity : E / b;
  const rate = Math.min(temporal, monetary);
  return Object.freeze({ invitationsPerDay: Number.isFinite(rate) ? rate : null, unbounded: rate === Infinity,
    limiter: rate === Infinity ? 'none' : temporal === monetary ? 'co-binding' : temporal < monetary ? 'cooldown' : 'own-emission' });
}
