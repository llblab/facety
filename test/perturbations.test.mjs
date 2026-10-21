import test from 'node:test';
import assert from 'node:assert/strict';
import { activityAtDay, experimentConfig, runExperiment, DEFAULT_ACTIVITY } from '../src/experiment.mjs';
import { RANDOM_GENERATOR } from '../src/random.mjs';
import { runTrials, replicaSeed } from '../src/trials.mjs';
import { runLandscape } from '../src/discovery.mjs';

const quiet = Object.fromEntries(Object.keys(DEFAULT_ACTIVITY.honest).map(key => [key, 0]));

test('activity events are start-inclusive, end-exclusive, immutable and restore the configured profile', () => {
  const config = experimentConfig({
    days: 10, activity: { honest: { inspect: 4, selfId: 0.6 } },
    perturbations: [
      { id: 'pause-checks', startDay: 3, endDay: 5, activity: { honest: { inspect: 0 } } },
      { id: 'pause-growth', startDay: 4, endDay: 6, activity: { honest: { invite: 0 } } },
    ],
  });
  assert.equal(activityAtDay(config, 2).activity.honest.inspect, 4);
  assert.deepEqual(activityAtDay(config, 3).activePerturbations, ['pause-checks']);
  assert.equal(activityAtDay(config, 3).activity.honest.inspect, 0);
  assert.equal(activityAtDay(config, 4).activePerturbations.length, 2);
  assert.deepEqual(activityAtDay(config, 5).activePerturbations, ['pause-growth']);
  assert.equal(activityAtDay(config, 5).activity.honest.inspect, 4);
  assert.equal(activityAtDay(config, 10).activity.honest.selfId, 0.6);
  assert.equal(config.activity.honest.inspect, 4);
  assert.throws(() => { config.perturbations[0].activity.honest.inspect = 1; }, TypeError);
  assert.throws(() => activityAtDay(config, -1));
  assert.throws(() => activityAtDay(config, 11));
});

test('same-field overlaps are rejected; adjacent events and disjoint-field overlaps are explicit', () => {
  const event = { id: 'a', startDay: 1, endDay: 4, activity: { honest: { inspect: 0 } } };
  assert.throws(() => experimentConfig({ days: 8, perturbations: [event, { ...event, id: 'b', startDay: 3 }] }));
  assert.doesNotThrow(() => experimentConfig({ days: 8, perturbations: [event, { ...event, id: 'b', startDay: 4, endDay: 6 }] }));
  for (const perturbations of [
    [event, event],
    [{ ...event, endDay: 1 }],
    [{ ...event, startDay: -1 }],
    [{ ...event, endDay: 9 }],
    [{ ...event, policy: {} }],
    [{ ...event, activity: { honest: { selfId: 2 } } }],
    [{ ...event, activity: { unknown: {} } }],
    [{ ...event, activity: { honest: { typo: 0 } } }],
    [{ id: 'missing-start', endDay: 3 }],
  ]) assert.throws(() => experimentConfig({ days: 8, perturbations }));
});

test('a temporary submission pause loses only its scheduled reward slots and restores later activity', () => {
  const config = {
    scenario: 'honest-growth', initialSize: 2, initialTopology: 'none', days: 8,
    activity: { honest: { ...quiet, selfId: 1 } },
    perturbations: [{ id: 'pause', startDay: 2, endDay: 5, activity: { honest: { selfId: 0 } } }],
  };
  const result = runExperiment(config);
  assert.deepEqual(result, runExperiment(config));
  assert.equal(result.metrics.ledger.minted, 10);
  for (const point of result.history.filter(point => point.stage === 'day-end')) {
    const during = point.atHour >= 48 && point.atHour < 120;
    assert.deepEqual(point.activePerturbations, during ? ['pause'] : []);
    assert.equal(point.cohorts.honest.byAction.selfId.accepted, during ? 0 : 2);
    assert.equal(point.effectiveActivity.honest.selfId, during ? 0 : 1);
  }
  assert.deepEqual(result.history.at(-1).activePerturbations, []);
});

test('a no-op schedule changes only declared schedule metadata, not decisions or economic state', () => {
  const config = { seed: 'no-op-event', initialSize: 8, days: 10, includeState: true };
  const baseline = runExperiment(config);
  const event = runExperiment({ ...config, perturbations: [{ id: 'no-op', startDay: 2, endDay: 5, activity: {} }] });
  assert.deepEqual(event.state, baseline.state);
  assert.deepEqual(event.outcome, baseline.outcome);
  assert.deepEqual(event.effort, baseline.effort);
  assert.deepEqual(event.money, baseline.money);
});

test('future perturbations cannot alter the stochastic pre-intervention history', () => {
  const config = { seed: 'future-treatment', initialSize: 10, days: 12 };
  const baseline = runExperiment(config);
  const treatment = runExperiment({ ...config, perturbations: [{ id: 'later', startDay: 5, endDay: 8, activity: { honest: { inspect: 0 } } }] });
  const prefix = run => run.history.filter(point => point.atHour < 5 * 24);
  assert.deepEqual(prefix(treatment), prefix(baseline));
});

test('inert inspection changes cannot consume unrelated decision or guarantee-vetting randomness', () => {
  for (const [sensitivity, falsePositiveRate] of [[0, 0], [0.8, 0.2]]) {
    for (const seed of ['rng-null-control', 'confirmation-null']) {
      const config = {
        seed, initialSize: 10, days: 14, includeState: true, sensitivity, falsePositiveRate,
        budgets: { honest: 1000000, attackers: 1000000 },
        activity: { honest: { inspect: 0, respond: 0 }, attackers: { inspect: 0, invite: 0.1 } },
      };
      const baseline = runExperiment(config);
      const treatment = runExperiment({ ...config, activity: { ...config.activity, honest: { ...config.activity.honest, inspect: 3 } } });
      assert.deepEqual(treatment.state, baseline.state);
      assert.deepEqual(treatment.money, baseline.money);
      assert.equal(treatment.metrics.xp.total, baseline.metrics.xp.total);
      assert.ok(treatment.effort.cohorts.honest.effort > baseline.effort.cohorts.honest.effort);
      assert.equal(treatment.outcome.censored, false);
    }
  }
});

test('replica labels and random-policy manifests survive trial and landscape retention', () => {
  assert.equal(replicaSeed('batch', 'scenario', 0), '["batch","scenario",0]');
  assert.throws(() => replicaSeed({}, 'scenario', 0));
  assert.throws(() => replicaSeed('batch', 'scenario', -1));
  const config = { initialSize: 3, days: 1 };
  const batch = runTrials(config, { trials: 2 });
  assert.equal(batch.randomness.generator, RANDOM_GENERATOR);
  assert.equal(batch.randomness.decisions, 'decision-keyed-v1');
  assert.deepEqual(batch.trialOutcomes[0].randomness, batch.randomness);
  const landscape = runLandscape(config, { axes: { initialDegree: [1] }, trials: 1 });
  assert.deepEqual(landscape.cells[0].samples[0].randomness, batch.randomness);
  assert.deepEqual(landscape.randomness, batch.randomness);
});
