import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runExperiment, experimentConfig, withExperimentParameters, activityAtDay } from '../src/experiment.mjs';
import { experimentRandomness, combineExperimentRandomness } from '../src/experiment-config.mjs';
import { LIVING_ENGINE, LIVING_REFERENCE, LIVING_RANDOMNESS, LIVING_OBSERVABLES } from '../src/living-experiment-config.mjs';
import { selectLivingResponder } from '../src/living-experiment.mjs';
import { observableForExperiment, metricSeries } from '../src/discovery.mjs';
import { registerHypothesis, verifyRegistration, runStatistic, runStatisticsTask } from '../src/evidence.mjs';
import { mapTasks } from '../src/parallel.mjs';
import { provenance } from '../src/provenance.mjs';

const config = (supportAllocation = 'concentrated', maxActions = 3000, includeState = true) => ({ engine: LIVING_ENGINE,
  reference: LIVING_REFERENCE, days: 365, seed: 'living-adapter-software-only', includeState, maxActions, successCriterion: 'unbound', supportAllocation });
const statistic = { metric: 'living.acceptedBirths', summary: 'endpoint', window: null, subtract: null };
const oracle = JSON.parse(readFileSync(new URL('../studies/2026-10-26-trust-topology-condition-map/support-allocation-results.json', import.meta.url))).raw.matching;
const design = JSON.parse(readFileSync(new URL('../studies/2026-10-26-trust-topology-condition-map/support-allocation-design.json', import.meta.url)));

test('living reference is explicit strict config/manifest/parameter ownership, not legacy or cross-engine coercion', () => {
  const base = config(); assert.deepEqual(experimentConfig(base), base); assert.ok(Object.isFrozen(experimentConfig(base)));
  assert.equal(withExperimentParameters(base, { supportAllocation: 'dispersed' }).supportAllocation, 'dispersed');
  for (const patch of [{ engine: 'unknown' }, { reference: 'invented' }, { days: 14 }, { supportAllocation: 'omniscient' },
    { seed: '' }, { maxActions: 0 }, { maxActions: 100001 }, { maxActions: 1.5 }, { successCriterion: 'safe' }, { includeState: 1 }, { model: {} }])
    assert.throws(() => experimentConfig({ ...base, ...patch }));
  for (const key of Object.keys(base)) { const incomplete = { ...base }; delete incomplete[key]; assert.throws(() => experimentConfig(incomplete)); }
  assert.deepEqual(experimentRandomness(base), LIVING_RANDOMNESS);
  assert.deepEqual(combineExperimentRandomness([LIVING_RANDOMNESS, LIVING_RANDOMNESS]), LIVING_RANDOMNESS);
  for (const metric of Object.keys(LIVING_OBSERVABLES)) {
    assert.equal(observableForExperiment(metric, base), true); assert.equal(observableForExperiment(metric), false);
    assert.equal(observableForExperiment(metric, { engine: 'native-pb-capacity/v1' }), false);
  }
  assert.equal(observableForExperiment('subjects', base), false);
  assert.throws(() => activityAtDay(base, 1), /no legacy coercion/);
});

test('native pre-case prefixes execute paid source/birth/guarantee/transport matching against frozen pre-code arithmetic, not new ACT outcomes', () => {
  const runs = ['concentrated', 'dispersed'].map(arm => runExperiment(config(arm)));
  for (const [i, run] of runs.entries()) {
    assert.deepEqual(run.provenance, provenance()); assert.deepEqual(run.randomness, LIVING_RANDOMNESS);
    assert.equal(run.outcome.censored, true); assert.equal(run.outcome.censorReason, 'maxActions');
    assert.equal(run.outcome.commandAttempts, 3000); assert.equal(run.outcome.endedAtHour, 360);
    assert.equal(run.outcome.expectedDailyEndpoints, 365); assert.equal(run.history.length, 14);
    assert.equal(run.state.relay.cases.length, 0); assert.equal(run.state.sourceResolutions.length, 0);
    assert.equal(run.state.fundingRounds.length, 14);
    assert.deepEqual(run.state.fundingRounds, oracle[i].days.map(({ day, cash }) => ({ day, cash })));
    assert.equal(run.state.commands.filter(row => row.op === 'transferFacy').length, 42);
    const transfers = run.state.events.filter(row => row.type === 'facy-transferred').map(row => ({ day: row.at / 24, from: row.from, to: row.to, amount: row.amount }));
    assert.deepEqual(transfers, design.arms[run.config.supportAllocation].transfers);
    const duties = run.state.relations.filter(row => /^n(0[1-9]|1[0-7])$/.test(row.guarantor)).map(row => ({ day: row.activatedAt / 24, giver: row.guarantor, receiver: row.guaranteed, fee: 1 }));
    assert.deepEqual(duties, design.arms[run.config.supportAllocation].duties);
    assert.equal(run.state.commands.filter(row => row.op === 'confirmGuarantee').length, 47);
    assert.equal(run.state.subjects.length, 61); assert.equal(run.history.at(-1).living.acceptedBirths, 1);
    assert.equal(run.state.selfIds.length, 962); assert.equal(run.state.ledger.minted, 962);
    assert.deepEqual(run.state.ledger, { minted: 962, burned: 1, supply: 961, emitterVault: 55, collector: 859, feeVault: 47, stakeVault: 0, debt: 0 });
    assert.ok(run.history.every(row => row.atHour > 0 && row.atHour < 75 * 24));
    assert.ok(run.history.every(row => row.living.sourcePrincipalCollected === 0 && row.living.relayWork === 0));
    assert.ok(run.state.subjects.every(row => row.identityStatus === 'accepted'));
    const series = metricSeries(run.history, statistic.metric, { days: 365, offsetHours: 24, engine: LIVING_ENGINE });
    assert.equal(series.length, 365); assert.equal(series.at(-1).value, null);
    assert.equal(runStatistic(run, statistic), null);
    assert.equal(runStatistic({ ...run, outcome: { ...run.outcome, censored: false } }, statistic), null, 'missing365th endpoint cannot become last retained row');
  }
  assert.deepEqual(runs[0].state.fundingRounds, runs[1].state.fundingRounds);
  assert.deepEqual(runs[0].state.ledger, runs[1].state.ledger);
  assert.equal(runs[0].state.subjects.reduce((n, row) => n + row.xp, 0), runs[1].state.subjects.reduce((n, row) => n + row.xp, 0));
  assert.equal(runs[0].state.subjects.find(row => row.id === 'n01').xp, 344);
  assert.equal(runs[1].state.subjects.find(row => row.id === 'n01').xp, 29, 'ordinary actual responsibility receipts, NOT transferred/free XP');
});

test('action cap stops before another mutation/clock and preserves partial proposals, missing history and no-state scalar output', () => {
  for (const [limit, minted] of [[1, 0], [2, 0], [3, 1]]) {
    const run = runExperiment(config('concentrated', limit));
    assert.equal(run.outcome.commandAttempts, limit); assert.equal(run.outcome.endedAtHour, 0);
    assert.equal(run.state.ledger.minted, minted); assert.equal(run.state.ledger.collector, 0);
    assert.equal(run.state.subjects.reduce((n, row) => n + row.xp, 0), 0); assert.equal(run.history.length, 0);
  }
  const partial = runExperiment(config('concentrated', 200));
  assert.equal(partial.state.commands.at(-1).op, 'proposeGuarantee');
  assert.equal(partial.state.commands.some(row => row.op === 'confirmGuarantee'), false);
  assert.equal(partial.state.relations.length, 1); assert.equal(partial.state.relations[0].status, 'proposed');
  assert.equal(partial.state.fundingRounds.length, 0); assert.equal(partial.history.length, 0);
  const scalar = runExperiment(config('concentrated', 1, false)); assert.equal(Object.hasOwn(scalar, 'state'), false);
  const renamed = runExperiment({ ...config('concentrated', 3), seed: 'another-software-label-not-a-world' });
  const original = runExperiment(config('concentrated', 3)); assert.deepEqual(renamed.state, original.state);
});

test('common response selection uses current public standing/cash/identity/participation and ignores evaluator getters', () => {
  const actor = (id, xp, liquidFacy = 3, identityStatus = 'accepted') => Object.defineProperties({ id, xp, liquidFacy, identityStatus },
    Object.fromEntries(['genuine', 'operator', 'localValid', 'cohort'].map(key => [key, { get() { throw new Error('private evaluator accessed'); } }])));
  const record = { subject: 'n20', positions: [{ subject: 'n00', stake: 1, side: 'defect' }] };
  const people = [actor('n00', 8), actor('n01', 9), actor('n02', 9), actor('n03', 50, 1), actor('n20', 100), actor('n40', 100), actor('n04', 50, 3, 'false')];
  assert.equal(selectLivingResponder(people, record), 'n01');
  assert.equal(selectLivingResponder([actor('n00', 9), actor('n01', 9), actor('n02', 10)], record), 'n02');
  assert.equal(selectLivingResponder([actor('n00', 10), actor('n01', 9)], record), null);
  assert.equal(selectLivingResponder([actor('n00', 8), actor('n01', 9), actor('n02', 10)], { ...record,
    positions: [{ subject: 'n02', stake: 1 }, { subject: 'n00', stake: 2 }] }), 'n01', 'already-entered higher XP is not reusable');
});

test('living scalar worker/parallel and ephemeral v2 verification admit only named scalars, with no reserved outcome capture', async () => {
  const base = config('concentrated', 1, false), task = { config: base, statistics: { births: statistic, work: { ...statistic, metric: 'living.relayWork' } } };
  const value = runStatisticsTask(task); assert.deepEqual(value.values, { births: null, work: null }); assert.equal(value.censored, true);
  assert.equal(Object.hasOwn(value, 'state'), false); assert.equal(Object.hasOwn(value, 'history'), false);
  const tasks = [task, { ...task, config: { ...base, supportAllocation: 'dispersed' } }], module = new URL('../src/evidence.mjs', import.meta.url).href;
  assert.deepEqual(await mapTasks(tasks, { workers: 2, module, exportName: 'runStatisticsTask' }), await mapTasks(tasks, { workers: 0, module, exportName: 'runStatisticsTask' }));
  const spec = { id: 'living-adapter-schema-software-only', statement: 'Ephemeral schema validation only, no scientific outcomes or independent worlds.',
    kind: 'association', base, statistic, arms: { concentrated: {}, dispersed: { supportAllocation: 'dispersed' } }, replicas: 8,
    claims: [{ id: 'schema-presence-only', role: 'presence', contrast: { concentrated: 1, dispersed: -1 }, direction: 'within', margin: 1 }], exploration: { seeds: [] } };
  const registration = registerHypothesis(spec); assert.equal(verifyRegistration(registration).implementationMatched, true);
  assert.deepEqual(registration.randomness, LIVING_RANDOMNESS); assert.equal(registration.plannedRuns, 16);
  assert.throws(() => registerHypothesis({ ...spec, base: { ...base, includeState: true } }), /scalar statistics, not protocol snapshots/);
  assert.throws(() => registerHypothesis({ ...spec, statistic: { metric: 'outcome.success' } }), /unbound criterion/);
  assert.throws(() => registerHypothesis({ ...spec, statistic: { ...statistic, metric: 'subjects' } }), /does not belong/);
  assert.throws(() => registerHypothesis({ ...spec, statistic: { ...statistic, subtract: 'pb.created' } }), /does not belong/);
  const { analysisPolicy, ...legacyShape } = registration;
  assert.throws(() => verifyRegistration({ ...legacyShape, schema: 'facety-hypothesis/v1' }), /explicit Native engine requires v2/);
  assert.throws(() => verifyRegistration({ ...registration, implementation: { ...registration.implementation, digest: 'changed' } }), /digest does not match/);
});
