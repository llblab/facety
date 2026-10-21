import test from 'node:test';
import assert from 'node:assert/strict';
import { binomialUpperTail, binomialLowerTail, clopperPearson, holm, bootstrapMeanInterval } from '../src/statistics.mjs';

const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

test('binomial tails agree with direct enumeration', () => {
  const choose = (n, k) => { let value = 1; for (let i = 1; i <= k; i++) value = value * (n - k + i) / i; return value; };
  for (const p of [0.1, 0.5, 0.83]) {
    for (let k = 0; k <= 12; k++) {
      let upper = 0;
      for (let j = k; j <= 12; j++) upper += choose(12, j) * p ** j * (1 - p) ** (12 - j);
      close(binomialUpperTail(k, 12, p), upper);
      close(binomialLowerTail(k, 12, p) + (k < 12 ? binomialUpperTail(k + 1, 12, p) : 0), 1);
    }
  }
  close(binomialUpperTail(8, 8, 0.5), 1 / 256);
  assert.equal(binomialUpperTail(0, 0, 0.5), 1);
});

test('Clopper-Pearson one-sided bounds match closed forms at the boundaries', () => {
  close(clopperPearson(10, 10, 0.05).lower, 0.05 ** (1 / 10), 1e-12);
  close(clopperPearson(0, 10, 0.05).upper, 1 - 0.05 ** (1 / 10), 1e-12);
  const middle = clopperPearson(6, 10, 0.05);
  close(binomialUpperTail(6, 10, middle.lower), 0.05, 1e-9);
  close(binomialLowerTail(6, 10, middle.upper), 0.05, 1e-9);
});

test('Holm adjustment is step-down monotone and capped at one', () => {
  const adjusted = holm([0.01, 0.04, 0.03, 0.005]);
  [0.03, 0.06, 0.06, 0.02].forEach((value, i) => close(adjusted[i], value));
  assert.deepEqual(holm([0.9, 0.8]), [1, 1]);
  assert.deepEqual(holm([0.01, 0.2]), [0.02, 0.2]);
});

test('bootstrap intervals are deterministic for a seed and bracket the sample mean', () => {
  const values = [1, 2, 3, 4, 10];
  const a = bootstrapMeanInterval(values, { seed: 's' });
  assert.deepEqual(a, bootstrapMeanInterval(values, { seed: 's' }));
  assert.ok(a.lower <= 4 && 4 <= a.upper);
  assert.equal(bootstrapMeanInterval([], { seed: 's' }), null);
});
