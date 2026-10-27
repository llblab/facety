import test from 'node:test';
import assert from 'node:assert/strict';
import { OBSERVABLES, DEFAULT_OBSERVABLES, metricSeries, observableForExperiment } from '../src/discovery.mjs';
import { experimentConfig, DEFAULT_ACTIVITY } from '../src/experiment-config.mjs';
import { runExperiment } from '../src/experiment.mjs';
import { runStatistic, runStatisticTask, runStatisticsTask, registerHypothesis, verifyRegistration, ANALYSIS_POLICY } from '../src/evidence.mjs';
import { mapTasks } from '../src/parallel.mjs';
import { config as vouchConfig } from './support/vouch-experiment-fixture.mjs';
import { config as pbConfig } from './support/pb-experiment-fixture.mjs';
const paths = ['falseSubjects', 'invitationReview.inspections', 'invitationReview.inspectionDenied', 'invitationReview.positiveSignals', 'invitationReview.cancelled', 'cohorts.honest.byAction.selfId.effort', 'cohorts.honest.byAction.convert.effort'], counters = paths.slice(1, 5), summaries = ['endpoint', 'mean', 'min', 'max', 'change', 'trend'];
const values = [[1, 2, 4], [3, 5, 8], [1, 4, 4], [1, 2, 3], [0, 1, 1], [2, 4, 1], [1, 3, 2]], literal = [[4, 7/3, 1, 4, 3, 1.5], [8, 16/3, 3, 8, 5, 2.5], [4, 3, 1, 4, 3, 1.5], [3, 2, 1, 3, 2, 1], [1, 2/3, 0, 1, 1, 0.5], [1, 7/3, 1, 4, -1, -0.5], [2, 2, 1, 3, 1, 0.5]];
const scalar = (metric, summary = 'endpoint', subtract = null, window = null) => ({ metric, summary, subtract, window }), get = (row, path) => path.split('.').reduce((v, k) => v[k], row);
function set(row, path, value, remove = false) { const keys = path.split('.'), last = keys.pop(); let at = row; for (const k of keys) at = at[k] ??= {}; if (remove) delete at[last]; else at[last] = value; }
function fixture(stepHours = 4) {
  const history = [0, 1, 2].map(i => { const row = { atHour: (stepHours === 24 ? i : i + 1) * 24, stage: 'day-end', subjects: 10 + i, defenderEffort: [8, 14, 18][i] }; paths.forEach((path, j) => set(row, path, values[j][i])); return row; });
  return { config: { days: 3, stepHours }, outcome: { horizonDays: 3, censored: false, dailySampleOffsetHours: stepHours === 24 ? 0 : 24 }, history };
}
const unavailable = /invitation review statistic requires stepHours 4 or 6/;

test('seven existing columns have literal cumulative/daily scalar meanings across all existing summaries, without default metric expansion', () => {
  const run = fixture(); paths.forEach((metric, j) => { assert.equal(OBSERVABLES[metric], 1); summaries.forEach((summary, k) => assert.equal(runStatistic(run, scalar(metric, summary)), literal[j][k], metric+'/'+summary)); });
  assert.equal(runStatistic(run, scalar('invitationReview.inspections', 'endpoint', 'invitationReview.cancelled')), 7); assert.equal(runStatistic(run, scalar(paths[5], 'mean', paths[6])), 7/3 - 2);
  assert.deepEqual(DEFAULT_OBSERVABLES, ['subjects','xp.gini','xp.attackerShare','council.attackerShare','graph.density','graph.mixing.excessWithinCohortFraction','connectivity.honestNonRootFraction','admission.inviteReadyFraction','falseConversions','defenderEffort']);
});

test('missing rows/paths, explicit nulls/zero/nonfinite and censorship preserve existing horizon and summary rules', () => {
  for (const metric of paths) {
    const run = fixture(), missingEnd = { ...run, history: run.history.slice(0, 2) }, missingInterior = { ...run, history: [run.history[0], run.history[2]] }; assert.equal(runStatistic(missingEnd, scalar(metric)), null); assert.equal(runStatistic(missingInterior, scalar(metric, 'mean')), null); assert.equal(runStatistic(missingInterior, scalar(metric)), get(run.history[2], metric)); assert.equal(runStatistic(missingInterior, scalar(metric, 'change')), get(run.history[2], metric)-get(run.history[0], metric));
    const explicit = structuredClone(run); set(explicit.history[1], metric, null); assert.equal(runStatistic(explicit, scalar(metric, 'mean')), null); assert.equal(runStatistic(explicit, scalar(metric)), get(run.history[2], metric)); set(explicit.history[2], metric, null); assert.equal(runStatistic(explicit, scalar(metric)), null);
    const absent = structuredClone(run); set(absent.history[1], metric, undefined, true); assert.throws(() => runStatistic(absent, scalar(metric)), /missing observable/); assert.equal(runStatistic({ ...absent, outcome: { ...absent.outcome, censored: true } }, scalar(metric)), null);
    for (const value of [NaN, Infinity, undefined]) { const bad = structuredClone(run); set(bad.history[2], metric, value); assert.throws(() => runStatistic(bad, scalar(metric)), /finite number or null/); }
    const zeros = structuredClone(run); for (const row of zeros.history) set(row, metric, 0); assert.equal(runStatistic(zeros, scalar(metric)), 0); assert.equal(runStatistic({ ...run, history: [] }, scalar(metric)), null); assert.equal(runStatistic(run, scalar(metric, 'mean', null, { startDay: 1, endDay: 3 })), (get(run.history[1], metric)+get(run.history[2], metric))/2);
    assert.throws(() => runStatistic(run, scalar(metric, 'endpoint', null, { startDay: 0, endDay: 4 })), /exceeds/);
  }
});

test('review counters require declared4/6h for primary/subtract even with censorship; namespace/raw-table predicates do not imply mode availability', () => {
  for (const stepHours of [4, 6]) for (const metric of paths) assert.equal(runStatistic(fixture(stepHours), scalar(metric)), get(fixture(stepHours).history[2], metric));
  for (const stepHours of [undefined, 24, null, 8]) for (const metric of counters) { const run = fixture(24); if (stepHours === undefined) delete run.config.stepHours; else run.config.stepHours = stepHours; for (const censored of [false, true]) { run.outcome.censored = censored; assert.throws(() => runStatistic(run, scalar(metric)), unavailable); assert.throws(() => runStatistic(run, scalar('subjects', 'endpoint', metric)), unavailable); } }
  for (const metric of paths) { assert.equal(observableForExperiment(metric, { stepHours: 24 }), true); assert.deepEqual(metricSeries(fixture().history, metric, { days: 3, offsetHours: 24 }).map(r => r.value), values[paths.indexOf(metric)]); for (const other of [vouchConfig(), pbConfig(), { engine: 'unknown' }]) assert.equal(observableForExperiment(metric, other), false); }
  for (const metric of [paths[0], paths[5], paths[6]]) assert.notEqual(runStatistic(fixture(24), scalar(metric)), null);
  const actualDailyShape = fixture(24); for (const row of actualDailyShape.history) delete row.invitationReview; assert.throws(() => metricSeries(actualDailyShape.history, counters[0], { days: 3 }), /missing observable/);
});

test('invalid single/multi-statistic tasks reject mode or namespace before any model/config work', () => {
  for (const metric of counters) for (const subtract of [false, true]) {
    let reads = 0; const config = { days: 3, stepHours: 24 }; Object.defineProperty(config, 'initialSize', { enumerable: true, get() { reads++; throw new Error('model/config work reached'); } }); const statistic = subtract ? scalar('subjects', 'endpoint', metric) : scalar(metric);
    assert.throws(() => runStatisticTask({ config, statistic }), unavailable); assert.throws(() => runStatisticsTask({ config, statistics: { known: scalar('subjects'), illegal: statistic } }), unavailable); assert.equal(reads, 0);
  }
  for (const metric of paths) for (const config of [vouchConfig(), pbConfig()]) { assert.throws(() => runStatisticTask({ config, statistic: scalar(metric) }), /does not belong/); assert.throws(() => runStatistic({ config, outcome: { censored: true } }, scalar(config.engine === 'native-vouch-tape/v1' ? 'vouch.admissions' : 'pb.created', 'endpoint', metric)), /does not belong/); }
  assert.throws(() => runStatisticTask({ config: { stepHours: 4 }, statistic: scalar('invitationReview.nonexistent') }), /does not belong/);
});

const envelope = metric => ({ id: 'review-measurement-software-api-only', statement: 'Ephemeral metric/mode software envelope only; no programme registration or confirmation', kind: 'association', base: { days: 3, stepHours: 4, seed: 'software-measurement-envelope', includeState: false }, statistic: scalar(metric), arms: { a: {}, b: {} }, claims: [{ id: 'present', role: 'presence', contrast: { a: 1, b: -1 }, direction: 'greater' }], replicas: 5, exploration: { seeds: [] } });
test('actual v2 base/arm/context/subtract admission enforces mode and preserves scalar-only/family/source verification guards', () => {
  for (const metric of paths) { const spec = envelope(metric), r = registerHypothesis(spec); assert.equal(r.analysisPolicy, ANALYSIS_POLICY); assert.equal(verifyRegistration(r).implementationMatched, true); assert.throws(() => registerHypothesis({ ...spec, base: { ...spec.base, includeState: true } }), /scalar statistics, not protocol snapshots/);
    if (!counters.includes(metric)) { assert.equal(verifyRegistration(registerHypothesis({ ...spec, base: { ...spec.base, stepHours: 24 } })).implementationMatched, true); continue; }
    for (const base of [{ ...spec.base, stepHours: 24 }, Object.fromEntries(Object.entries(spec.base).filter(([key]) => key !== 'stepHours'))]) assert.throws(() => registerHypothesis({ ...spec, base }), unavailable);
    assert.throws(() => registerHypothesis({ ...spec, arms: { a: {}, b: { stepHours: 24 } } }), unavailable); assert.throws(() => registerHypothesis({ ...spec, contexts: [{ id: 'daily', parameters: { stepHours: 24 } }] }), unavailable); assert.throws(() => registerHypothesis({ ...spec, base: { ...spec.base, stepHours: 24 }, statistic: scalar('subjects', 'endpoint', metric) }), unavailable);
    const mixed = registerHypothesis({ ...spec, contexts: [{ id: 'four', parameters: { stepHours: 4 } }, { id: 'six', parameters: { stepHours: 6 } }] }); assert.equal(verifyRegistration(mixed).implementationMatched, true);
  }
});

const quiet = Object.fromEntries(Object.keys(DEFAULT_ACTIVITY.honest).map(k => [k, 0]));
const software = (stepHours, reviewReserve) => ({ scenario: 'honest-growth', seed: 'software-measurement-native-only', initialSize: 3, days: 2, stepHours, initialTopology: 'clique', includeState: false, budgets: { honest: 1000, attackers: 0 }, activity: { honest: { ...quiet, selfId: 1, convert: 1 }, attackers: quiet }, ...(reviewReserve ? { reviewReserve: { honest: reviewReserve } } : {}) });
test('actual4/6h R0/nonzero Native history columns need no telemetry changes; setup and cumulative costs remain distinct from day work', () => {
  for (const stepHours of [4, 6]) for (const reserve of [0, 1]) { const run = runExperiment(software(stepHours, reserve)), days = run.history.filter(r => r.stage === 'day-end'); assert.equal(days.length, 2); assert.equal(run.effort.cohorts.honest.byPhase.setup.effort > 0, true);
    for (const metric of paths) { const wanted = days.map(r => get(r, metric)); assert.deepEqual(metricSeries(run.history, metric, { days: 2, offsetHours: 24 }).map(r => r.value), wanted); assert.equal(runStatistic(run, scalar(metric)), wanted.at(-1)); assert.equal(runStatistic(run, scalar(metric, 'mean')), (wanted[0]+wanted[1])/2); }
    for (const metric of counters) assert.equal(runStatistic(run, scalar(metric)), 0); const selfCost = days.reduce((s, r) => s+get(r, paths[5]), 0); assert.equal(selfCost, run.effort.cohorts.honest.byAction.selfId.effort); assert.ok(run.effort.cohorts.honest.effort > selfCost); assert.equal(Object.hasOwn(run.effort, 'allocation'), reserve > 0); assert.deepEqual(experimentConfig(software(stepHours, 0)).activity.honest, { ...quiet, selfId: 1, convert: 1 });
  }
  const daily = runExperiment(software(24, 0)); assert.ok(daily.history.filter(r => r.stage === 'day-end').every(r => !Object.hasOwn(r, 'invitationReview')));
});

test('single and named multi-statistic scalar tasks match one-run projections under sequential/two-worker APIs with software labels only', async t => {
  const statistics = Object.fromEntries(paths.map(metric => [metric, scalar(metric, metric.startsWith('cohorts.') ? 'mean' : 'endpoint')])), tasks = [4, 6].map(stepHours => ({ config: { ...software(stepHours, 1), seed: 'software-review-measurement-worker-'+stepHours }, statistics })), expected = tasks.map(task => { const run = runExperiment(task.config); return { values: Object.fromEntries(Object.entries(statistics).map(([name, s]) => [name, runStatistic(run, s)])), censored: run.outcome.censored, seed: run.config.seed }; }), module = new URL('../src/evidence.mjs', import.meta.url).href;
  assert.deepEqual(tasks.map(runStatisticsTask), expected); assert.deepEqual(await mapTasks(tasks, { workers: 0, module, exportName: 'runStatisticsTask' }), expected); assert.deepEqual(await mapTasks(tasks, { workers: 2, module, exportName: 'runStatisticsTask' }), expected); assert.equal(runStatisticTask({ config: tasks[0].config, statistic: scalar(paths[0]) }).value, expected[0].values.falseSubjects);
  t.diagnostic('review-measurement-admission '+JSON.stringify({ paths: 7, literalScalarChecks: 42, nativeContexts: 4, workerTasks: 2, researchLabels: 0, confirmations: 0, newTelemetryFields: 0 }));
});
