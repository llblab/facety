import test from 'node:test';
import assert from 'node:assert/strict';
import { clockAgenda } from '../src/clock-agenda.mjs';

function hourlyOracle(horizonHour, stepHours, deadlines) {
  const rows = [];
  for (let atHour = 0; atHour <= horizonHour; atHour++) {
    const decisionTick = atHour < horizonHour && atHour % stepHours === 0;
    const deadline = deadlines.includes(atHour);
    const horizon = atHour === horizonHour;
    if (decisionTick || deadline || horizon) rows.push({ atHour, decisionTick, deadline, horizon });
  }
  return rows;
}

test('clock agenda preserves four-hour, six-hour and historical daily decision grids', () => {
  for (const [stepHours, expected] of [
    [4, [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44]],
    [6, [0, 6, 12, 18, 24, 30, 36, 42]],
    [24, [0, 24]],
  ]) {
    const rows = [...clockAgenda({ horizonHour: 48, stepHours })];
    assert.deepEqual(rows.filter(row => row.decisionTick).map(row => row.atHour), expected);
    assert.deepEqual(rows.at(-1), { atHour: 48, decisionTick: false, deadline: false, horizon: true });
    assert.ok(rows.every(row => !row.deadline));
  }
});

test('clock agenda retains exact off-grid deadlines and merges coincident clock marks', () => {
  const deadlineHours = [25, 4, 23, 24, 0, 28, 23, 4];
  const rows = [...clockAgenda({ horizonHour: 28, stepHours: 4, deadlineHours })];
  assert.deepEqual(rows, hourlyOracle(28, 4, deadlineHours));
  assert.deepEqual(rows.filter(row => row.deadline).map(row => row.atHour), [0, 4, 23, 24, 25, 28]);
  assert.deepEqual(rows.find(row => row.atHour === 24), { atHour: 24, decisionTick: true, deadline: true, horizon: false });
  assert.deepEqual(rows.at(-1), { atHour: 28, decisionTick: false, deadline: true, horizon: true });
});

test('clock agenda closes zero, short and non-aligned horizons without an extra actor tick', () => {
  for (const stepHours of [4, 6, 24]) {
    for (const horizonHour of [0, 1, 3, 4, 5, 23, 24, 25]) {
      const deadlineHours = [0, horizonHour];
      const rows = [...clockAgenda({ horizonHour, stepHours, deadlineHours })];
      assert.deepEqual(rows, hourlyOracle(horizonHour, stepHours, deadlineHours));
      assert.equal(rows.filter(row => row.horizon).length, 1);
      assert.equal(rows.at(-1).decisionTick, false);
    }
  }
  assert.deepEqual([...clockAgenda({ horizonHour: -0, stepHours: 4, deadlineHours: [-0] })], [
    { atHour: 0, decisionTick: false, deadline: true, horizon: true },
  ]);
});

test('clock agenda rejects invalid contracts immediately rather than on first iteration', () => {
  for (const options of [undefined, null, false, [], 'calendar']) assert.throws(() => clockAgenda(options), /options object/);
  for (const horizonHour of [undefined, null, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '24', 24n]) {
    assert.throws(() => clockAgenda({ horizonHour, stepHours: 4 }), /horizonHour/);
  }
  for (const stepHours of [undefined, null, 0, 1, 2, 3, 5, 12, 48, 4.5, NaN, Infinity, '4', 4n]) {
    assert.throws(() => clockAgenda({ horizonHour: 24, stepHours }), /stepHours/);
  }
  for (const deadlineHours of [null, {}, new Set([1]), '1']) {
    assert.throws(() => clockAgenda({ horizonHour: 24, stepHours: 4, deadlineHours }), /deadlineHours/);
  }
  for (const hour of [undefined, null, -1, 0.5, 25, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', 1n]) {
    assert.throws(() => clockAgenda({ horizonHour: 24, stepHours: 4, deadlineHours: [hour] }), /deadline hours/);
  }
  assert.throws(() => clockAgenda({ horizonHour: 24, stepHours: 4, deadlineHours: Array(1) }), /deadline hours/);
  assert.throws(() => clockAgenda({ horizonHour: 24, stepHours: 4, rng: () => {} }), /unknown clock agenda field/);
});

test('clock agenda snapshots inputs, isolates yielded rows and lazily supports safe horizons', () => {
  const frozen = Object.freeze({ horizonHour: 25, stepHours: 4, deadlineHours: Object.freeze([25, 23, 0, 23]) });
  const expected = hourlyOracle(25, 4, frozen.deadlineHours);
  assert.deepEqual([...clockAgenda(frozen)], expected);
  assert.deepEqual([...clockAgenda(frozen)], expected);
  const options = structuredClone(frozen);
  const iterator = clockAgenda(options);
  options.horizonHour = 0;
  options.stepHours = 24;
  options.deadlineHours.splice(0, options.deadlineHours.length, 1);
  assert.deepEqual([...iterator], expected);
  const isolated = clockAgenda(frozen);
  const first = isolated.next().value;
  first.atHour = 999;
  first.deadline = false;
  assert.deepEqual([...isolated], expected.slice(1));
  let reads = 0;
  const changing = [0];
  Object.defineProperty(changing, 0, { get: () => reads++ === 0 ? 23 : -1 });
  assert.deepEqual([...clockAgenda({ horizonHour: 25, stepHours: 4, deadlineHours: changing })], hourlyOracle(25, 4, [23]));
  assert.equal(reads, 1);
  const prefix = deadlines => [...clockAgenda({ horizonHour: 48, stepHours: 4, deadlineHours: deadlines })].filter(row => row.atHour < 25);
  assert.deepEqual(prefix([5]), prefix([47, 5, 25]));
  const large = clockAgenda({ horizonHour: Number.MAX_SAFE_INTEGER, stepHours: 24, deadlineHours: [Number.MAX_SAFE_INTEGER] });
  assert.deepEqual([large.next().value.atHour, large.next().value.atHour, large.next().value.atHour], [0, 24, 48]);
  large.return();
});

test('clock agenda matches an independent hourly oracle for every small deadline subset', () => {
  let comparisons = 0;
  for (let horizonHour = 0; horizonHour <= 8; horizonHour++) {
    for (const stepHours of [4, 6, 24]) {
      for (let mask = 0; mask < 2 ** (horizonHour + 1); mask++) {
        const deadlineHours = Array.from({ length: horizonHour + 1 }, (_, hour) => hour).filter(hour => mask & (1 << hour));
        assert.deepEqual([...clockAgenda({ horizonHour, stepHours, deadlineHours })], hourlyOracle(horizonHour, stepHours, deadlineHours));
        comparisons++;
      }
    }
  }
  assert.equal(comparisons, 3066);
});
