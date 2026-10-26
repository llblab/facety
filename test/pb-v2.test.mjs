import test from 'node:test';
import assert from 'node:assert/strict';
import { experimentConfig, withExperimentParameters, experimentRandomness, combineExperimentRandomness, activityAtDay } from '../src/experiment-config.mjs';
import { runExperiment } from '../src/experiment.mjs';
import { runPbExperiment } from '../src/pb-experiment.mjs';
import { PB_ENGINE, PB_RANDOMNESS, PB_OBSERVABLES } from '../src/pb-experiment-config.mjs';
import { VOUCH_RANDOMNESS } from '../src/vouch-experiment-config.mjs';
import { metricSeries, OBSERVABLES, observableForExperiment, runLandscape } from '../src/discovery.mjs';
import { registerHypothesis, verifyRegistration, runStatistic, runStatisticTask, runStatisticsTask, HYPOTHESIS_SCHEMA, LEGACY_HYPOTHESIS_SCHEMA, ANALYSIS_POLICY } from '../src/evidence.mjs';
import { mapTasks } from '../src/parallel.mjs';
import { digestOf } from '../src/provenance.mjs';
import { runTrials, sweepParameter } from '../src/trials.mjs';
import { compareExperiments } from '../src/controls.mjs';
import { normalizeGame } from '../src/games.mjs';
import { config as pbConfig } from './support/pb-experiment-fixture.mjs';
import { config as vouchConfig } from './support/vouch-experiment-fixture.mjs';

const scalar = (metric, summary = 'endpoint', subtract = null) => ({ metric, summary, window: null, subtract });
const config = () => ({ ...pbConfig(), includeState: false });
function softwareSpec(overrides = {}) {
  return { id: 'pb-v2-in-memory-api-only', statement: 'Software API contract, not programme preregistration or empirical repetitions', kind: 'association',
    base: config(), statistic: scalar('pb.created'), arms: { funded: {}, zeroBurn: { 'model.invitationLimit.b': 0 } },
    claims: [{ id: 'present', role: 'presence', contrast: { funded: 1, zeroBurn: -1 }, direction: 'greater' }],
    replicas: 5, exploration: { seeds: [] }, ...overrides };
}

test('common config/dispatcher accepts only explicit P/b contract, validates immutable parameter overrides and preserves direct execution', () => {
  const cfg = config(), frozen = experimentConfig(cfg);
  assert.deepEqual(frozen, cfg); assert.ok(Object.isFrozen(frozen.model.invitationLimit));
  assert.deepEqual(runExperiment(cfg), runPbExperiment(cfg));
  assert.equal(withExperimentParameters(cfg, { 'model.invitationLimit.b': 0 }).model.invitationLimit.b, 0);
  assert.equal(withExperimentParameters(cfg, { emissionEveryDays: 2 }).emissionEveryDays, 2);
  assert.equal(cfg.model.invitationLimit.b, 2);
  for (const engine of ['CORE', 'legacy', null, undefined]) assert.throws(() => experimentConfig({ ...cfg, engine }), /unsupported experiment engine/);
  assert.throws(() => withExperimentParameters(cfg, { initialSize: 3 }), /unknown experiment parameter/);
  assert.throws(() => withExperimentParameters(cfg, { 'model.policy.guaranteeFee': 1 }), /unsupported closed P\/b/);
});

test('no-draw and mixed-generator manifests retain actual policies without relabeling deterministic seeds as stochastic draws', () => {
  const cfg = config(), daily = experimentRandomness(experimentConfig({ initialSize: 2, days: 1 }));
  const subday = experimentRandomness(experimentConfig({ initialSize: 2, days: 1, stepHours: 4 }));
  assert.deepEqual(experimentRandomness(cfg), PB_RANDOMNESS); assert.equal(PB_RANDOMNESS.generator, 'none');
  assert.deepEqual(combineExperimentRandomness([PB_RANDOMNESS, PB_RANDOMNESS]), PB_RANDOMNESS);
  assert.equal(combineExperimentRandomness([daily, subday]).decisions, 'decision-keyed-mixed-subday-v1');
  assert.equal(combineExperimentRandomness([daily, VOUCH_RANDOMNESS]).decisions, 'decision-keyed-mixed-engine-v1');
  const mixed = combineExperimentRandomness([PB_RANDOMNESS, VOUCH_RANDOMNESS, daily, PB_RANDOMNESS]);
  assert.equal(mixed.generator, 'per-policy/v1'); assert.equal(mixed.decisions, 'mixed-explicit-generator-engine-v1');
  assert.equal(mixed.policies.length, 3); assert.ok(mixed.policies.some(p => p.generator === 'none'));
  assert.deepEqual(combineExperimentRandomness([daily, PB_RANDOMNESS, VOUCH_RANDOMNESS]), mixed);
  assert.equal(combineExperimentRandomness([mixed, daily]).generator, 'per-policy/v1');
  assert.throws(() => experimentRandomness({ ...cfg, engine: 'unknown' }), /unsupported/);
});

test('P/b daily scalar metrics use their own namespace/24h offset and declared horizon, never a last retained endpoint', () => {
  const cfg = config(), run = runExperiment(cfg);
  for (const metric of Object.keys(PB_OBSERVABLES)) {
    assert.ok(Object.hasOwn(OBSERVABLES, metric)); assert.equal(observableForExperiment(metric, cfg), true);
    assert.equal(observableForExperiment(metric, vouchConfig()), false); assert.equal(observableForExperiment(metric), false);
  }
  assert.deepEqual(metricSeries(run.history, 'pb.created', { days: 8, offsetHours: 24, engine: PB_ENGINE }).map(p => p.value), [0, 0, 1, 1, 1, 2, 2, 2]);
  assert.equal(runStatistic(run, scalar('pb.created')), 2); assert.equal(runStatistic(run, scalar('pb.created', 'mean')), 1.125);
  assert.equal(runStatistic(run, scalar('pb.minted', 'endpoint', 'pb.burned')), 4);
  assert.equal(runStatistic({ ...run, history: run.history.slice(0, 2) }, scalar('pb.created')), null);
  const capped = runExperiment({ ...cfg, maxActions: 1 });
  assert.ok(metricSeries(capped.history, 'pb.created', { days: 8, offsetHours: 24, engine: PB_ENGINE }).every(p => p.value === null));
  assert.equal(runStatistic(capped, scalar('pb.created')), null);
  assert.equal(runStatistic(runExperiment({ ...cfg, days: 0 }), scalar('pb.created')), null);
});

test('primary/subtract/unbound-success guards separate P/b, vouch and legacy including censored/empty histories', () => {
  const cfg = config(), capped = runExperiment({ ...cfg, maxActions: 1 }), full = runExperiment(cfg);
  for (const sample of [full, capped]) {
    for (const metric of ['outcome.success', 'vouch.admissions', 'subjects']) assert.throws(() => runStatistic(sample, scalar(metric)), /unbound criterion|experiment engine/);
    for (const metric of ['vouch.admissions', 'subjects']) assert.throws(() => runStatistic(sample, scalar('pb.created', 'endpoint', metric)), /experiment engine/);
  }
  assert.throws(() => metricSeries([], 'pb.created', { days: 8 }), /experiment engine/);
  assert.throws(() => metricSeries([], 'vouch.admissions', { days: 8, engine: PB_ENGINE }), /experiment engine/);
  for (const metric of ['outcome.success', 'vouch.admissions', 'subjects']) assert.throws(() => registerHypothesis(softwareSpec({ statistic: scalar(metric) })), /unbound criterion|experiment engine/);
  assert.throws(() => registerHypothesis(softwareSpec({ statistic: scalar('pb.created', 'endpoint', 'vouch.admissions') })), /experiment engine/);
  assert.throws(() => registerHypothesis(softwareSpec({ base: { ...vouchConfig(), includeState: false } })), /experiment engine/);
  assert.throws(() => registerHypothesis(softwareSpec({ base: { initialSize: 2, days: 8 } })), /experiment engine/);
});

test('actual v2 registration/verification binds P/b config and no-draw manifest, with no v1/tamper/drift bypass or programme confirmation', () => {
  const registration = registerHypothesis(softwareSpec());
  assert.equal(registration.schema, HYPOTHESIS_SCHEMA); assert.equal(registration.analysisPolicy, ANALYSIS_POLICY);
  assert.deepEqual(registration.randomness, PB_RANDOMNESS); assert.equal(registration.plannedRuns, 10);
  assert.equal(verifyRegistration(registration).implementationMatched, true);
  for (const mutate of [
    r => { r.spec.base.model.invitationLimit.b = 1; }, r => { r.spec.base.emissionEveryDays = 2; },
    r => { r.spec.claims[0].margin = 1; }, r => { r.randomness.generator = 'sha256-xoshiro128starstar-v2'; },
    r => { r.analysisPolicy = 'unadjusted-contradiction/v1'; },
  ]) { const changed = structuredClone(registration); mutate(changed); assert.throws(() => verifyRegistration(changed, { allowImplementationChange: true }), /hypothesis:/); }
  const legacy = structuredClone(registration); legacy.schema = LEGACY_HYPOTHESIS_SCHEMA; delete legacy.analysisPolicy;
  legacy.hash = digestOf({ schema: legacy.schema, spec: legacy.spec, implementation: legacy.implementation.digest, randomness: legacy.randomness });
  legacy.confirmationSeed = 'confirm:' + legacy.hash;
  for (const allowImplementationChange of [false, true]) assert.throws(() => verifyRegistration(legacy, { allowImplementationChange }), /requires v2 registration/);
  assert.throws(() => registerHypothesis(softwareSpec({ base: pbConfig() })), /scalar statistics, not protocol snapshots/);
  assert.throws(() => registerHypothesis(softwareSpec({ arms: { one: { seed: 'not-allowed' } } })), /seed/);
  // Ephemeral API envelope only: no confirmHypothesis call, retained programme registration or reserved-seed run.
});

test('real scalar/multi-statistic exports and two-worker tasks dispatch P/b/vouch correctly on ordinary software labels', async () => {
  const cfg = config(), tasks = [
    { config: { ...cfg, seed: 'pb-v2-software-task-0' }, statistic: scalar('pb.created') },
    { config: { ...withExperimentParameters(cfg, { 'model.invitationLimit.b': 0 }), seed: 'pb-v2-software-task-1' }, statistic: scalar('pb.created') },
    { config: { ...cfg, maxActions: 1, seed: 'pb-v2-software-task-cap' }, statistic: scalar('pb.created') },
    { config: { ...vouchConfig(), includeState: false, seed: 'pb-v2-software-vouch-control' }, statistic: scalar('vouch.admissions') },
  ];
  const direct = tasks.map(runStatisticTask);
  assert.deepEqual(direct.map(r => r.value), [2, 3, null, 2]); assert.ok(direct.every(r => !r.seed.includes('confirm:')));
  assert.deepEqual(await mapTasks(tasks, { workers: 2, module: new URL('../src/evidence.mjs', import.meta.url).href, exportName: 'runStatisticTask' }), direct);
  const statistics = { created: scalar('pb.created'), supply: scalar('pb.minted', 'endpoint', 'pb.burned') };
  const multiple = [cfg, { ...cfg, maxActions: 1 }].map(config => ({ config, statistics }));
  const expected = multiple.map(runStatisticsTask);
  assert.deepEqual(expected.map(r => r.values), [{ created: 2, supply: 4 }, { created: null, supply: null }]);
  assert.deepEqual(await mapTasks(multiple, { workers: 2, module: new URL('../src/evidence.mjs', import.meta.url).href, exportName: 'runStatisticsTask' }), expected);
  assert.throws(() => runStatisticsTask({ config: cfg, statistics: { bad: scalar('outcome.success') } }), /unbound criterion/);
});

test('legacy cohort/payoff/sampling wrappers reject P/b instead of inventing probabilities/work or unrestricted capacity', () => {
  const cfg = config();
  for (const invoke of [
    () => activityAtDay(cfg, 0), () => runTrials(cfg, { trials: 1 }),
    () => sweepParameter(cfg, { parameter: 'model.invitationLimit.b', values: [0, 2], trials: 1 }),
    () => runLandscape(cfg, { axes: { 'model.invitationLimit.b': [0, 2] } }),
    () => compareExperiments(cfg, { parameters: { 'model.invitationLimit.b': 0 } }),
    () => normalizeGame({ id: 'pb-not-a-cohort-game', base: cfg }),
  ]) assert.throws(invoke, /does not support the Native P\/b capacity engine; no legacy coercion/);
});
