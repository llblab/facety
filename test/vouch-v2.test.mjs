import test from 'node:test';
import assert from 'node:assert/strict';
import { experimentConfig, experimentRandomness, withExperimentParameters, combineExperimentRandomness, activityAtDay } from '../src/experiment-config.mjs';
import { runExperiment } from '../src/experiment.mjs';
import { runVouchExperiment } from '../src/vouch-experiment.mjs';
import { VOUCH_ENGINE, VOUCH_RANDOMNESS, VOUCH_OBSERVABLES } from '../src/vouch-experiment-config.mjs';
import { metricSeries, OBSERVABLES, observableForExperiment, runLandscape } from '../src/discovery.mjs';
import { registerHypothesis, verifyRegistration, runStatistic, runStatisticTask, runStatisticsTask, HYPOTHESIS_SCHEMA, ANALYSIS_POLICY, LEGACY_HYPOTHESIS_SCHEMA } from '../src/evidence.mjs';
import { digestOf } from '../src/provenance.mjs';
import { mapTasks } from '../src/parallel.mjs';
import { runTrials, sweepParameter } from '../src/trials.mjs';
import { compareExperiments } from '../src/controls.mjs';
import { normalizeGame } from '../src/games.mjs';
import { config } from './support/vouch-experiment-fixture.mjs';

const scalar = (metric, summary = 'endpoint', subtract = null) => ({ metric, summary, window: null, subtract });
function nativeConfig() { return { ...config(), includeState: false }; }
function softwareSpec(overrides = {}) {
  return { id: 'native-v2-binding-software-only', statement: 'API contract test, not a Facety programme registration', kind: 'association',
    base: nativeConfig(), statistic: scalar('vouch.admissions'),
    arms: { funded: {}, noSlots: { 'model.vouching.K': 0 } },
    claims: [{ id: 'presence', role: 'presence', contrast: { funded: 1, noSlots: -1 }, direction: 'greater' }],
    replicas: 5, exploration: { seeds: [] }, ...overrides };
}

test('common dispatcher/config/parameter/randomness paths admit only the explicit Native engine and preserve legacy defaults', () => {
  const cfg = nativeConfig(), normalized = experimentConfig(cfg);
  assert.deepEqual(normalized, cfg); assert.ok(Object.isFrozen(normalized.events));
  assert.deepEqual(runExperiment(cfg), runVouchExperiment(cfg));
  assert.equal(withExperimentParameters(cfg, { 'model.vouching.K': 0 }).model.vouching.K, 0);
  assert.equal(cfg.model.vouching.K, 2);
  assert.deepEqual(experimentRandomness(normalized), VOUCH_RANDOMNESS);
  const legacy = experimentConfig({ days: 1, initialSize: 2 });
  assert.equal(Object.hasOwn(legacy, 'engine'), false);
  assert.equal(experimentRandomness(legacy).decisions, 'decision-keyed-v1');
  assert.deepEqual(combineExperimentRandomness([VOUCH_RANDOMNESS, VOUCH_RANDOMNESS]), VOUCH_RANDOMNESS);
  assert.equal(combineExperimentRandomness([VOUCH_RANDOMNESS, experimentRandomness(legacy)]).decisions, 'decision-keyed-mixed-engine-v1');
  for (const engine of ['CORE', 'legacy', null]) assert.throws(() => experimentConfig({ ...cfg, engine }), /unsupported/);
  assert.throws(() => withExperimentParameters(cfg, { unknown: 1 }), /unknown experiment parameter/);
  assert.throws(() => experimentRandomness({ ...normalized, engine: 'unknown' }), /unsupported experiment randomness engine/);
});

test('namespaced metrics require their engine, retain24h endpoint offset and preserve empty/truncated declared horizons', () => {
  const cfg = nativeConfig(), run = runExperiment(cfg);
  for (const metric of Object.keys(VOUCH_OBSERVABLES)) {
    assert.ok(Object.hasOwn(OBSERVABLES, metric));
    assert.equal(observableForExperiment(metric, cfg), true);
    assert.equal(observableForExperiment(metric), false);
  }
  const series = metricSeries(run.history, 'vouch.admissions', { days: cfg.days, offsetHours: 24, engine: VOUCH_ENGINE });
  assert.deepEqual(series.map(p => p.value), [0, 0, 1, 1, 2, 2, 2, 2]);
  assert.equal(runStatistic(run, scalar('vouch.admissions')), 2);
  assert.equal(runStatistic(run, scalar('vouch.admissions', 'mean')), 1.25);
  assert.equal(runStatistic(run, scalar('vouch.minted', 'endpoint', 'vouch.burned')), 7);
  const truncated = { ...run, history: run.history.slice(0, 2) };
  assert.equal(runStatistic(truncated, scalar('vouch.admissions')), null);
  const capped = runExperiment({ ...cfg, maxActions: 1 });
  const missing = metricSeries(capped.history, 'vouch.admissions', { days: cfg.days, offsetHours: 24, engine: VOUCH_ENGINE });
  assert.equal(missing.length, cfg.days); assert.ok(missing.every(p => p.value === null));
  assert.equal(runStatistic(capped, scalar('vouch.admissions')), null);
});

test('unbound success, cross-engine primary/subtract metrics and unknown engines fail closed even for censored runs', () => {
  const cfg = nativeConfig(), run = runExperiment(cfg), capped = runExperiment({ ...cfg, maxActions: 1 });
  for (const sample of [run, capped]) {
    assert.throws(() => runStatistic(sample, scalar('outcome.success')), /unbound criterion/);
    assert.throws(() => runStatistic(sample, scalar('xp.total')), /experiment engine/);
    assert.throws(() => runStatistic(sample, scalar('vouch.admissions', 'endpoint', 'xp.total')), /experiment engine/);
  }
  assert.throws(() => metricSeries(run.history, 'vouch.admissions', { days: cfg.days, offsetHours: 24 }), /experiment engine/);
  assert.throws(() => metricSeries(run.history, 'xp.total', { days: cfg.days, engine: VOUCH_ENGINE }), /experiment engine/);
  assert.throws(() => metricSeries([], 'subjects', { days: 1, engine: 'unknown' }), /unsupported/);
  assert.throws(() => registerHypothesis(softwareSpec({ statistic: scalar('outcome.success') })), /unbound criterion/);
  assert.throws(() => registerHypothesis(softwareSpec({ statistic: scalar('xp.total') })), /experiment engine/);
  assert.throws(() => registerHypothesis(softwareSpec({ statistic: scalar('vouch.admissions', 'endpoint', 'xp.total') })), /experiment engine/);
  assert.throws(() => registerHypothesis(softwareSpec({ base: { days: 1, initialSize: 2 } })), /experiment engine/);
});

test('real v2 registration/verification binds Native scalar config/rates/resources/randomness without inventing a programme method', () => {
  const specification = softwareSpec(), registration = registerHypothesis(specification);
  assert.equal(registration.schema, HYPOTHESIS_SCHEMA); assert.equal(registration.analysisPolicy, ANALYSIS_POLICY);
  assert.equal(verifyRegistration(registration).implementationMatched, true);
  assert.equal(registration.plannedRuns, 10);
  assert.deepEqual(registration.randomness, VOUCH_RANDOMNESS);
  assert.equal(registration.spec.base.engine, VOUCH_ENGINE);
  assert.deepEqual(registration.spec.statistic, scalar('vouch.admissions'));
  for (const mutate of [
    r => { r.spec.base.environment.validity['x:48'] = false; },
    r => { r.spec.base.work.costs.inspect = 2; },
    r => { r.spec.claims[0].margin = 1; },
    r => { r.randomness.schedule = 'other'; },
    r => { r.analysisPolicy = 'unadjusted-contradiction/v1'; },
  ]) { const changed = structuredClone(registration); mutate(changed); assert.throws(() => verifyRegistration(changed), /hypothesis:/); }
  const fabricatedLegacy = structuredClone(registration);
  fabricatedLegacy.schema = LEGACY_HYPOTHESIS_SCHEMA; delete fabricatedLegacy.analysisPolicy;
  fabricatedLegacy.hash = digestOf({ schema: fabricatedLegacy.schema, spec: fabricatedLegacy.spec,
    implementation: fabricatedLegacy.implementation.digest, randomness: fabricatedLegacy.randomness });
  fabricatedLegacy.confirmationSeed = 'confirm:' + fabricatedLegacy.hash;
  for (const allowImplementationChange of [false, true]) assert.throws(() => verifyRegistration(fabricatedLegacy, { allowImplementationChange }), /requires v2 registration/);
  assert.throws(() => registerHypothesis(softwareSpec({ base: config() })), /scalar statistics, not protocol snapshots/);
  assert.throws(() => registerHypothesis(softwareSpec({ arms: { one: { seed: 'forbidden' } } })), /seed/);
  // No confirmation function is invoked and no registration/result is retained as programme evidence.
  assert.ok(registration.confirmationSeed.startsWith('confirm:'));
});

test('the real scalar task and worker export execute Native observations/metrics identically on software-only seeds', async () => {
  const cfg = nativeConfig(), tasks = [2, 0].map((K, index) => ({ config: { ...withExperimentParameters(cfg, { 'model.vouching.K': K }), seed: 'native-v2-software-task-' + index },
    statistic: scalar('vouch.admissions') }));
  const direct = tasks.map(runStatisticTask);
  assert.deepEqual(direct.map(r => r.value), [2, 0]);
  assert.equal(direct.some(r => r.seed.includes('confirm:')), false);
  const parallel = await mapTasks(tasks, { workers: 2, module: new URL('../src/evidence.mjs', import.meta.url).href, exportName: 'runStatisticTask' });
  assert.deepEqual(parallel, direct);
  const multi = runStatisticsTask({ config: cfg, statistics: { admissions: scalar('vouch.admissions'), supply: scalar('vouch.minted', 'endpoint', 'vouch.burned') } });
  assert.deepEqual(multi.values, { admissions: 2, supply: 7 });
  assert.throws(() => runStatisticTask({ config: cfg, statistic: scalar('xp.total') }), /experiment engine/);
  assert.throws(() => runStatisticsTask({ config: cfg, statistics: { bad: scalar('outcome.success') } }), /unbound criterion/);
});

test('legacy cohort/payoff/sampling wrappers explicitly refuse Native configs rather than fabricating legacy resources or probabilities', () => {
  const cfg = nativeConfig();
  for (const invoke of [
    () => activityAtDay(cfg, 0), () => runTrials(cfg, { trials: 1 }),
    () => sweepParameter(cfg, { parameter: 'model.vouching.K', values: [0, 2], trials: 1 }),
    () => runLandscape(cfg, { axes: { 'model.vouching.K': [0, 2] } }),
    () => compareExperiments(cfg, { parameters: { 'model.vouching.K': 0 } }),
    () => normalizeGame({ id: 'native-not-a-legacy-game', base: cfg }),
  ]) assert.throws(invoke, /does not support the Native vouch engine/);
});
