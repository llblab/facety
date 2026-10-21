import test from 'node:test';
import assert from 'node:assert/strict';
import { runTrials, wilsonInterval, summarizeOutcomes, sweepParameter } from '../src/trials.mjs';

test('Wilson uncertainty is nonzero even for zero observed successes and respects boundaries', () => {
  const zero = wilsonInterval(0, 10);
  assert.ok(zero.lower < 1e-15);
  assert.ok(zero.upper > 0.2 && zero.upper < 0.4);
  const all = wilsonInterval(10, 10);
  assert.ok(all.lower > 0.6 && all.lower < 0.8);
  assert.ok(Math.abs(all.upper - 1) < 1e-15);
  assert.throws(() => wilsonInterval(1, 0));
  assert.throws(() => wilsonInterval(11, 10));
});

test('unknown truncated outcomes are not silently treated as failures or dropped from the denominator', () => {
  const summary = summarizeOutcomes([true, false, null, null]);
  assert.equal(summary.estimate, null);
  assert.equal(summary.unresolved, 2);
  assert.deepEqual(summary.identificationBounds, { lower: 0.25, upper: 0.75 });
  assert.equal(summary.interval95, null);
  assert.ok(summary.conservativeEnvelope95.lower < 0.25);
  assert.ok(summary.conservativeEnvelope95.upper > 0.75);
  assert.equal(summarizeOutcomes([false, false]).estimate, 0);
  assert.throws(() => summarizeOutcomes([]));
  assert.throws(() => summarizeOutcomes([0]));
});

test('seeded trial batches reproduce outcomes and report the actual conditional experiment', () => {
  const config = { scenario: 'honest-growth', initialSize: 6, days: 3 };
  const options = { trials: 5, seed: 'replicas', includeRuns: true };
  const a = runTrials(config, options);
  assert.deepEqual(a, runTrials(config, options));
  assert.equal(a.probability.estimate, 0);
  assert.ok(a.probability.interval95.upper > 0);
  assert.equal(a.probability.unresolved, 0);
  assert.equal(a.runs.length, 5);
  assert.equal(new Set(a.trialOutcomes.map(run => run.seed)).size, 5);
  assert.equal(a.resources.attackerEffort.mean, 0);
  assert.throws(() => runTrials(config, { trials: 0 }));
});

test('censoring and already observed success remain distinct in aggregation', () => {
  const config = { initialSize: 3, attackerShare: 1, initialTopology: 'clique', days: 10, maxActions: 1 };
  const unresolved = runTrials(config, { trials: 3 });
  assert.equal(unresolved.probability.unresolved, 3);
  assert.deepEqual(unresolved.probability.identificationBounds, { lower: 0, upper: 1 });
  const known = runTrials({ ...config, successCriterion: 'council-majority' }, { trials: 3 });
  assert.equal(known.censoredTrials, 3);
  assert.equal(known.probability.estimate, 1);
  assert.equal(known.probability.unresolved, 0);
});

test('parameter sweeps validate all settings, share trial seed labels, and enforce each budget', () => {
  const config = { initialSize: 6, days: 5, includeState: false };
  const sweep = sweepParameter(config, { parameter: 'budgets.attackers', values: [0, 10], trials: 3, seed: 'budgets' });
  assert.equal(sweep.results.length, 2);
  assert.equal(sweep.results[0].experiment.resources.attackerEffort.max, 0);
  assert.ok(sweep.results[1].experiment.resources.attackerEffort.max <= 10);
  assert.deepEqual(sweep.results[0].experiment.trialOutcomes.map(run => run.seed), sweep.results[1].experiment.trialOutcomes.map(run => run.seed));
  assert.equal(config.days, 5);
  assert.throws(() => sweepParameter(config, { parameter: '__proto__.polluted', values: [true], trials: 1 }));
  assert.throws(() => sweepParameter(config, { parameter: 'activity.honest.typo', values: [1], trials: 1 }));
  assert.throws(() => sweepParameter(config, { parameter: 'attackerShare', values: [0.1, 2], trials: 1 }));
});
