// Owns: Algebraic reduction of explicitly normalized inputs; excludes simulation, calibration and SAFE classification.
const FIELDS = Object.freeze({ bond: ['c', 'B', 'Pcatch', 'E', 'V', 'X'], timing: ['Td', 'Tdbl'],
  race: ['gaPerDay', 'lambdaPerDay'], burn: ['P', 'b', 'E'], income: ['p', 'E', 'wDaily'], jury: ['f'] });
function group(input, name) {
  const value = input[name];
  if (value === null || value === undefined) return null;
  const fields = FIELDS[name];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length
    || fields.some(key => !Object.hasOwn(value, key))) throw new TypeError(name + ' requires exactly ' + fields.join(','));
  const copy = Object.fromEntries(fields.map(key => [key, value[key]]));
  for (const [key, number] of Object.entries(copy)) {
    if (number === null) continue;
    if (!Number.isFinite(number) || (number < 0 && key !== 'gaPerDay')) throw new RangeError(name + '.' + key + ' requires a finite normalized value or null');
  }
  if (name === 'bond' && ((copy.c !== null && !Number.isSafeInteger(copy.c)) || copy.Pcatch > 1)) throw new RangeError('invalid exposure count/probability');
  if (name === 'jury' && copy.f > 1) throw new RangeError('f must be a share');
  if (name === 'burn' && copy.P === 0) throw new RangeError('P must be positive or null for no period');
  return copy;
}
function result(value, status) { return Object.freeze({ value, status }); }
function product(...values) {
  if (values.some(value => value === null)) return null;
  if (values.includes(0)) return 0;
  let value = 1;
  for (const factor of values) {
    value *= factor;
    if (!Number.isFinite(value) || value === 0) return NaN;
  }
  return value;
}
function ratio(numerator, denominator) {
  if (numerator === null || denominator === null) return result(null, 'unbound');
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return result(null, 'unrepresentable');
  if (denominator === 0) return result(null, numerator > 0 ? 'unbounded' : 'undefined');
  if (denominator < 0) return result(null, 'undefined');
  const value = numerator / denominator;
  return Number.isFinite(value) && (value !== 0 || numerator === 0) ? result(value, 'defined') : result(null, 'unrepresentable');
}
export function dimensionlessGroups(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !Object.hasOwn(FIELDS, key))) throw new TypeError('normalized group inputs required');
  const bond = group(input, 'bond'), timing = group(input, 'timing'), race = group(input, 'race');
  const burn = group(input, 'burn'), income = group(input, 'income'), jury = group(input, 'jury');
  const earned = bond ? product(bond.E, bond.V) : null;
  const incomeAndOutside = earned === null || bond.X === null ? null : earned + bond.X;
  return Object.freeze({
    R1: bond ? ratio(product(bond.c, bond.B, bond.Pcatch), incomeAndOutside) : result(null, 'unbound'),
    R2: timing ? ratio(timing.Td, timing.Tdbl) : result(null, 'unbound'),
    R3: race ? ratio(race.gaPerDay, race.lambdaPerDay) : result(null, 'unbound'),
    phi: !burn ? result(null, 'unbound') : burn.P === null ? result(null, 'no-period') : ratio(burn.b, product(burn.P, burn.E)),
    priceWindow: income ? ratio(product(income.p, income.E), income.wDaily) : result(null, 'unbound'),
    juryVsThird: jury ? ratio(jury.f, 1 / 3) : result(null, 'unbound'),
    gaLog2PriorPerDay: !burn ? result(null, 'unbound') : burn.P === null ? result(null, 'no-period') : ratio(Math.LN2, burn.P),
  });
}
