import test from 'node:test';
import assert from 'node:assert/strict';
import { dimensionlessGroups } from '../studies/2026-10-25-condition-map/dimensionless.mjs';

// Arbitrary algebra fixtures, not theta samples or calibrated study assumptions.
const fixture = () => ({ bond: { c: 3, B: 100, Pcatch: 0.5, E: 1, V: 90, X: 10 },
  timing: { Td: 6, Tdbl: 3 }, race: { gaPerDay: 0.2, lambdaPerDay: 0.1 },
  burn: { P: 3, b: 6, E: 1 }, income: { p: 2, E: 1, wDaily: 4 }, jury: { f: 0.2 } });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, a + ' versus ' + b);

test('reduced parameters match the supplied equations without conflating growth with invitation capacity', () => {
  const values = dimensionlessGroups(fixture());
  assert.equal(values.R1.value, 1.5);
  assert.equal(values.R2.value, 2);
  assert.equal(values.R3.value, 2);
  assert.equal(values.phi.value, 2);
  assert.equal(values.priceWindow.value, 0.5);
  close(values.juryVsThird.value, 0.6);
  assert.equal(values.gaLog2PriorPerDay.value, Math.LN2 / 3);
  assert.notEqual(values.gaLog2PriorPerDay.value, 1 / 3);
  assert.throws(() => { values.R1.value = 100; }, TypeError);
  assert.throws(() => { values.SAFE = true; }, TypeError);
  const input = fixture(), before = structuredClone(input);
  dimensionlessGroups(input);
  assert.deepEqual(input, before);
});

test('coherent currency and time/rate rescaling preserves dimensionless groups', () => {
  const expected = dimensionlessGroups(fixture());
  for (const factor of [0.5, 2, 10]) {
    const currency = fixture();
    for (const key of ['B', 'E', 'X']) currency.bond[key] *= factor;
    currency.burn.b *= factor;
    currency.burn.E *= factor;
    currency.income.p *= factor;
    currency.income.wDaily *= factor;
    const money = dimensionlessGroups(currency);
    for (const key of Object.keys(expected)) close(money[key].value, expected[key].value);
    const time = fixture();
    time.bond.E /= factor; time.bond.V *= factor;
    time.timing.Td *= factor; time.timing.Tdbl *= factor;
    time.race.gaPerDay /= factor; time.race.lambdaPerDay /= factor;
    time.burn.P *= factor; time.burn.E /= factor;
    time.income.E /= factor; time.income.wDaily /= factor;
    const slower = dimensionlessGroups(time);
    for (const key of Object.keys(expected).filter(key => key !== 'gaLog2PriorPerDay')) close(slower[key].value, expected[key].value);
    close(slower.gaLog2PriorPerDay.value, expected.gaLog2PriorPerDay.value / factor);
  }
});

test('missing, zero-denominator, no-period and overflow cases remain explicit rather than fabricated safe values', () => {
  assert.ok(Object.values(dimensionlessGroups({})).every(value => value.value === null && value.status === 'unbound'));
  const input = fixture();
  input.bond.Pcatch = null; input.timing.Td = null; input.race.lambdaPerDay = 0;
  input.burn.P = null; input.income.wDaily = 0; input.jury.f = null;
  const values = dimensionlessGroups(input);
  assert.equal(values.R1.status, 'unbound');
  assert.equal(values.R2.status, 'unbound');
  assert.equal(values.R3.status, 'unbounded');
  assert.equal(values.phi.status, 'no-period');
  assert.equal(values.gaLog2PriorPerDay.status, 'no-period');
  assert.equal(values.priceWindow.status, 'unbounded');
  assert.equal(values.juryVsThird.status, 'unbound');
  assert.equal(JSON.stringify(values).includes('Infinity'), false);
  assert.equal(dimensionlessGroups({ race: { gaPerDay: 0, lambdaPerDay: 0 } }).R3.status, 'undefined');
  assert.equal(dimensionlessGroups({ burn: { P: 1, b: 0, E: 0 } }).phi.status, 'undefined');
  const overflow = fixture(); overflow.bond.B = Number.MAX_VALUE;
  assert.equal(dimensionlessGroups(overflow).R1.status, 'unrepresentable');
  assert.equal(dimensionlessGroups({ income: { p: 1e-200, E: 1e-200, wDaily: 1 } }).priceWindow.status, 'unrepresentable');
  assert.equal(dimensionlessGroups({ race: { gaPerDay: 1e-300, lambdaPerDay: 1e300 } }).R3.status, 'unrepresentable');
  const zero = fixture(); zero.bond.Pcatch = 0; zero.burn.b = 0; zero.jury.f = 0;
  const knownZero = dimensionlessGroups(zero);
  assert.equal(knownZero.R1.value, 0); assert.equal(knownZero.phi.value, 0); assert.equal(knownZero.juryVsThird.value, 0);
});

test('reduction rejects silent defaults, malformed units fields and impossible count/probability inputs', () => {
  for (const input of [null, [], { labels: {} }, { bond: {} }, { timing: { Td: 1 } },
    { income: { p: 1, E: 1, hourlyWage: 1 } }, { jury: { f: 1.1 } },
    { race: { gaPerDay: 1, lambdaPerDay: -1 } }, { burn: { P: 0, b: 1, E: 1 } }]) {
    assert.throws(() => dimensionlessGroups(input));
  }
  for (const [key, value] of [['c', 1.5], ['Pcatch', 2], ['B', -1], ['E', Infinity], ['X', undefined]]) {
    const input = fixture(); input.bond[key] = value;
    assert.throws(() => dimensionlessGroups(input));
  }
});
