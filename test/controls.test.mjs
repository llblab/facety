import test from 'node:test';
import assert from 'node:assert/strict';
import { compareExperiments, analyzePairs, pairedOutcomeSummary, describeReturn } from '../src/controls.mjs';
import { DEFAULT_ACTIVITY, runExperiment } from '../src/experiment.mjs';

const quiet = Object.fromEntries(Object.keys(DEFAULT_ACTIVITY.honest).map(key => [key, 0]));
const fixturePolicy = { generator: 'fixture', decisions: 'controlled-v1' };
function branch(seed, values, { days = 8, success = false, censored = false } = {}) {
  return {
    seed, randomness: fixturePolicy, outcome: { horizonDays: days, success, censored },
    history: values.map((value, day) => ({ stage: 'day-end', atHour: day * 24, subjects: value })),
  };
}
function fixtures(treatment, { baseline = Array(8).fill(10), censored = false } = {}) {
  return Array.from({ length: 3 }, (_, i) => {
    const seed = 'fixture:' + i;
    return { seed, baseline: branch(seed, baseline), treatment: branch(seed, treatment, { censored, success: censored ? null : false }) };
  });
}
const phases = [{ id: 'pre', startDay: 0, endDay: 2 }, { id: 'during', startDay: 2, endDay: 4 }, { id: 'post', startDay: 4, endDay: 8 }];

test('paired Boolean effects preserve discordance and one-sided information in unknown outcomes', () => {
  const result = pairedOutcomeSummary([
    { baseline: false, treatment: true }, { baseline: true, treatment: false },
    { baseline: true, treatment: true }, { baseline: false, treatment: false },
  ]);
  assert.equal(result.pairedDifference.estimate, 0);
  assert.ok(result.pairedDifference.interval95.lower < 0);
  assert.ok(result.pairedDifference.interval95.upper > 0);
  assert.equal(result.pairedDifference.counts.baselineOnly, 1);
  assert.equal(result.pairedDifference.counts.treatmentOnly, 1);
  const unknown = pairedOutcomeSummary([{ baseline: true, treatment: null }]);
  assert.equal(unknown.pairedDifference.estimate, null);
  assert.deepEqual(unknown.pairedDifference.identificationBounds, { lower: -1, upper: 0 });
  assert.deepEqual(pairedOutcomeSummary([{ baseline: false, treatment: null }]).pairedDifference.identificationBounds, { lower: 0, upper: 1 });
  assert.throws(() => pairedOutcomeSummary([]));
  assert.throws(() => pairedOutcomeSummary([{ baseline: 0, treatment: false }]));
});

test('paired windows and finite return criteria identify a controlled response, not a universal recovery claim', () => {
  const pairs = fixtures([10, 10, 15, 15, 10, 10, 10, 10]);
  const result = analyzePairs(pairs, { days: 8, metrics: ['subjects'], windows: phases, recoveryAfterDay: 4, holdDays: 2, practicalChanges: { subjects: 0 } });
  assert.equal(result.summaries.subjects.windows.pre.fullEnsembleMean, 0);
  assert.equal(result.summaries.subjects.windows.during.fullEnsembleMean, 5);
  assert.equal(result.summaries.subjects.windows.post.fullEnsembleMean, 0);
  const returned = result.trajectories[0].metrics.subjects.recovery;
  assert.equal(returned.firstWindowStartDay, 4);
  assert.equal(returned.confirmedAtDay, 5);
  assert.equal(returned.stayedWithinTolerance, true);
  assert.equal(result.summaries.subjects.recovery.returnCriterionProbability.estimate, 1);
  assert.ok(result.interpretation.includes('not proof'));
});

test('an observed return can be temporary or later unknown; a short recovery horizon is not a failure', () => {
  const rows = values => values.map((difference, day) => ({ day, difference }));
  const temporary = describeReturn(rows([0, 3, 2, 0, 0, 3, null, null]), { days: 8, afterDay: 1, holdDays: 2 });
  assert.equal(temporary.returned, true);
  assert.equal(temporary.stayedWithinTolerance, false);
  const partial = describeReturn(rows([0, 3, 2, 0, 0, null, null, null]), { days: 8, afterDay: 1, holdDays: 2 });
  assert.equal(partial.returned, true);
  assert.equal(partial.stayedWithinTolerance, null);
  const short = describeReturn(rows([0, 0, 0, 0]), { days: 4, afterDay: 3, holdDays: 2 });
  assert.equal(short.returned, null);
  assert.equal(short.status, 'insufficient-window');
  assert.equal(describeReturn(rows([1, 1, 1, 1]), { days: 4, afterDay: 0, holdDays: 2 }).returned, false);
});

test('complete early windows survive later censoring, while unavailable post effects stay unknown', () => {
  const result = analyzePairs(fixtures([10, 10, 15, 15], { censored: true }), {
    days: 8, metrics: ['subjects'], windows: phases, recoveryAfterDay: 4, holdDays: 2,
  });
  assert.equal(result.summaries.subjects.windows.pre.fullEnsembleMean, 0);
  assert.equal(result.summaries.subjects.windows.post.fullEnsembleMean, null);
  assert.equal(result.summaries.subjects.windows.post.missingPairs, 3);
  assert.equal(result.summaries.subjects.recovery.returnCriterionProbability.unresolved, 3);
  assert.equal(result.outcomes.pairedDifference.estimate, null);
  assert.deepEqual(result.outcomes.pairedDifference.identificationBounds, { lower: 0, upper: 1 });
  assert.equal(result.trajectories[0].metrics.subjects.series[6].difference, null);
});

test('undefined metric values are not imputed as zero paired effects', () => {
  const result = analyzePairs(fixtures([null, null, null, null, 10, 10, 10, 10]), { days: 8, metrics: ['subjects'], windows: phases });
  assert.equal(result.summaries.subjects.windows.pre.fullEnsembleMean, null);
  assert.equal(result.summaries.subjects.windows.pre.observedPairMeanDifferences, null);
  assert.equal(result.summaries.subjects.windows.post.fullEnsembleMean, 0);
});

test('scheduled control batches reproduce, retain both histories and replay each treatment witness', () => {
  const config = {
    seed: 'paired-schedule', scenario: 'honest-growth', initialSize: 4, initialTopology: 'none', days: 10,
    activity: { honest: { ...quiet, selfId: 1 } },
  };
  const options = {
    parameters: { perturbations: [{ id: 'pause', startDay: 2, endDay: 4, activity: { honest: { selfId: 0 } } }] },
    trials: 3, seed: 'confirmation-pairs',
    metrics: ['subjects', 'cohorts.honest.sincePrevious.effort'], practicalChanges: { subjects: 0, 'cohorts.honest.sincePrevious.effort': 0 },
  };
  const a = compareExperiments(config, options);
  assert.deepEqual(a, compareExperiments(config, options));
  assert.deepEqual(a.analysis.settings.windows.map(window => window.id), ['pre', 'perturbation', 'post']);
  assert.equal(a.analysis.summaries['cohorts.honest.sincePrevious.effort'].windows.perturbation.fullEnsembleMean, -4);
  assert.equal(a.analysis.summaries['cohorts.honest.sincePrevious.effort'].windows.post.fullEnsembleMean, 0);
  assert.equal(a.analysis.summaries['cohorts.honest.sincePrevious.effort'].recovery.returnCriterionProbability.estimate, 1);
  const replay = runExperiment({ ...a.treatment, seed: a.pairs[0].seed });
  assert.deepEqual(replay.history, a.pairs[0].treatment.history);
  assert.deepEqual(analyzePairs(a.pairs, a.analysis.settings), a.analysis);
  assert.deepEqual(JSON.parse(JSON.stringify(a)).analysis, a.analysis);
});

test('exact null controls have zero observed effects without imputing undefined XP; known success survives censoring', () => {
  const control = compareExperiments({ initialSize: 6, days: 4 }, { parameters: {}, trials: 3, metrics: ['subjects', 'xp.gini'] });
  assert.equal(control.analysis.summaries.subjects.windows.full.fullEnsembleMean, 0);
  assert.equal(control.analysis.summaries['xp.gini'].windows.full.fullEnsembleMean, null);
  for (const pair of control.analysis.trajectories) {
    for (const row of pair.metrics['xp.gini'].series) assert.equal(row.difference, row.baseline === null ? null : 0);
  }
  const censored = compareExperiments(
    { initialSize: 3, attackerShare: 1, initialTopology: 'clique', successCriterion: 'council-majority', days: 5, maxActions: 1 },
    { trials: 2, metrics: ['subjects'] },
  );
  assert.equal(censored.analysis.outcomes.baseline.estimate, 1);
  assert.equal(censored.analysis.outcomes.pairedDifference.estimate, 0);
  assert.equal(censored.analysis.summaries.subjects.windows.full.fullEnsembleMean, null);
});

test('counterfactual plans reject mismatched horizons/goals, invalid metadata, windows and sample budgets', () => {
  const config = { initialSize: 3, days: 8 };
  for (const bad of [
    { parameters: { days: 9 } }, { parameters: { successCriterion: 'council-majority' } },
    { parameters: { targetFalseConversions: 2 } }, { parameters: { seed: 'different' } },
    { parameters: { includeState: true } }, { parameters: { typo: 1 } },
    { maxRecordedSamples: 1 }, { metrics: null }, { metrics: ['typo'] },
    { practicalChanges: null }, { windows: null }, { holdDays: null },
    { windows: [{ id: 'bad', startDay: 1, endDay: 1 }] },
  ]) assert.throws(() => compareExperiments(config, bad));
  const data = fixtures(Array(8).fill(10));
  const wrongSeed = structuredClone(data);
  wrongSeed[0].treatment.seed = 'wrong';
  assert.throws(() => analyzePairs(wrongSeed, { days: 8, metrics: ['subjects'] }));
  const wrongPolicy = structuredClone(data);
  wrongPolicy[0].treatment.randomness = { generator: 'fixture', decisions: 'other' };
  assert.throws(() => analyzePairs(wrongPolicy, { days: 8, metrics: ['subjects'] }));
  const invalidCensor = structuredClone(data);
  invalidCensor[0].treatment.outcome.censored = true;
  assert.throws(() => analyzePairs(invalidCensor, { days: 8, metrics: ['subjects'] }));
  const duplicate = [data[0], data[0]];
  assert.throws(() => analyzePairs(duplicate, { days: 8, metrics: ['subjects'] }));
});
