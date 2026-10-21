// Owns: Exact and resampling statistics for confirmatory tests; excludes model semantics.
import { Random } from './random.mjs';

const logFactorials = [0];
function logFactorial(n) {
  for (let i = logFactorials.length; i <= n; i++) logFactorials[i] = logFactorials[i - 1] + Math.log(i);
  return logFactorials[n];
}
function checkBinomial(k, n, p) {
  if (!Number.isSafeInteger(n) || n < 0 || n > 1_000_000 || !Number.isSafeInteger(k) || k < 0 || k > n) throw new RangeError('invalid binomial counts');
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('binomial probability must be in [0, 1]');
}
function pmf(j, n, p) {
  if (p === 0) return j === 0 ? 1 : 0;
  if (p === 1) return j === n ? 1 : 0;
  return Math.exp(logFactorial(n) - logFactorial(j) - logFactorial(n - j) + j * Math.log(p) + (n - j) * Math.log1p(-p));
}

// P(X >= k) for X ~ Binomial(n, p).
export function binomialUpperTail(k, n, p) {
  checkBinomial(k, n, p);
  let sum = 0;
  for (let j = k; j <= n; j++) sum += pmf(j, n, p);
  return Math.min(1, sum);
}

// P(X <= k) for X ~ Binomial(n, p).
export function binomialLowerTail(k, n, p) {
  checkBinomial(k, n, p);
  let sum = 0;
  for (let j = 0; j <= k; j++) sum += pmf(j, n, p);
  return Math.min(1, sum);
}

function bisect(predicate) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 80; i++) {
    const middle = (low + high) / 2;
    if (predicate(middle)) low = middle;
    else high = middle;
  }
  return low;
}

// Exact one-sided Clopper-Pearson bounds, each at confidence 1 - alpha.
export function clopperPearson(k, n, alpha = 0.05) {
  checkBinomial(k, n, 0.5);
  if (!(alpha > 0 && alpha < 1)) throw new RangeError('alpha must be in (0, 1)');
  if (n === 0) return { lower: 0, upper: 1, confidence: 1 - alpha, method: 'one-sided Clopper-Pearson' };
  return {
    lower: k === 0 ? 0 : bisect(p => binomialUpperTail(k, n, p) <= alpha),
    upper: k === n ? 1 : 1 - bisect(q => binomialLowerTail(k, n, 1 - q) <= alpha),
    confidence: 1 - alpha,
    method: 'one-sided Clopper-Pearson',
  };
}

// Holm step-down family-wise adjustment; returns adjusted p-values in input order.
export function holm(pValues) {
  if (!Array.isArray(pValues) || pValues.some(p => !Number.isFinite(p) || p < 0 || p > 1)) throw new RangeError('Holm requires p-values in [0, 1]');
  const order = pValues.map((p, index) => [p, index]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const adjusted = new Array(pValues.length);
  let running = 0;
  order.forEach(([p, index], rank) => {
    running = Math.max(running, Math.min(1, (pValues.length - rank) * p));
    adjusted[index] = running;
  });
  return adjusted;
}

// Deterministic percentile bootstrap interval for a mean. Descriptive, not the confirmatory test.
export function bootstrapMeanInterval(values, { seed = 'bootstrap', resamples = 2000, confidence = 0.95 } = {}) {
  if (!Array.isArray(values) || values.some(value => !Number.isFinite(value))) throw new RangeError('bootstrap values must be finite');
  if (!Number.isSafeInteger(resamples) || resamples < 100 || resamples > 100_000) throw new RangeError('resamples must be in [100, 100000]');
  if (!(confidence > 0 && confidence < 1)) throw new RangeError('confidence must be in (0, 1)');
  if (!values.length) return null;
  const random = new Random(seed);
  const means = [];
  for (let b = 0; b < resamples; b++) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[random.int(values.length)];
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  const at = q => means[Math.min(resamples - 1, Math.max(0, Math.floor(q * resamples)))];
  return { lower: at((1 - confidence) / 2), upper: at(1 - (1 - confidence) / 2), confidence, resamples, method: 'percentile bootstrap of the mean' };
}
