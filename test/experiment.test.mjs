import test from 'node:test';
import assert from 'node:assert/strict';
import { runExperiment, experimentConfig, DEFAULT_ACTIVITY } from '../src/experiment.mjs';
import { DAY } from '../src/model.mjs';

const quiet = Object.fromEntries(Object.keys(DEFAULT_ACTIVITY.honest).map(key => [key, 0]));
const liquid = { seed: 'test', initialSize: 3, attackerShare: 1, initialTopology: 'clique', days: 20, activity: { attackers: { invite: 0.1 } } };

test('identical seeds reproduce complete runs and evaluator truth never enters subject records', () => {
  const options = { seed: 'reproducible', initialSize: 8, days: 10, includeState: true };
  const a = runExperiment(options);
  assert.deepEqual(a, runExperiment(options));
  assert.ok(a.state.subjects.every(subject => !('cohort' in subject) && !('genuine' in subject) && !('operator' in subject)));
  assert.equal(a.state.truth.length, a.state.subjects.length);
  assert.equal(JSON.parse(JSON.stringify(a)).schema, 'facety-experiment/v1');
});

test('zero activity means no maintenance work, and zero budgets cannot perform free work', () => {
  const inactive = runExperiment({ initialSize: 6, initialTopology: 'none', days: 8, activity: { honest: quiet, attackers: quiet } });
  assert.equal(inactive.metrics.ledger.minted, 0);
  assert.equal(inactive.effort.calls, 0);
  const unfunded = runExperiment({ initialSize: 6, days: 8, budgets: { honest: 0, attackers: 0 } });
  assert.equal(unfunded.metrics.ledger.minted, 0);
  assert.equal(unfunded.metrics.guarantees.edges, 0);
  assert.equal(unfunded.population.finalSubjects, 6);
  for (const cohort of Object.values(unfunded.effort.cohorts)) {
    assert.equal(cohort.effort, 0);
    assert.equal(cohort.attempts, 0);
    assert.ok(cohort.denied > 0);
  }
  assert.equal(unfunded.outcome.censored, false);
});

test('honest growth creates no false subjects; Sybil subjects do not create free human operators', () => {
  const honest = runExperiment({ scenario: 'honest-growth', seed: 'test', initialSize: 6, days: 15, activity: { honest: { invite: 0.2 } } });
  assert.equal(honest.population.initialAttackers, 0);
  assert.equal(honest.population.falseSubjects, 0);
  assert.equal(honest.impact.falseConversions, 0);
  assert.equal(honest.population.humanOperators, honest.population.finalSubjects);
  const sybil = runExperiment(liquid);
  assert.ok(sybil.population.falseSubjects > 0);
  assert.equal(sybil.population.attackerOperators, 3);
  assert.equal(sybil.population.humanOperators, 3);
  assert.equal(sybil.population.falseSubjects, sybil.population.finalSubjects - 3);
  assert.equal(sybil.outcome.success, true);
  assert.ok(sybil.outcome.firstSuccess.atHour >= 11 * DAY);
  assert.ok(sybil.outcome.firstSuccess.attackerEffort < sybil.effort.cohorts.attackers.effort);
});

test('real-person cartel growth recruits operators instead of disguising them as Sybil identities', () => {
  const cartel = runExperiment({ ...liquid, scenario: 'real-cartel', successCriterion: 'council-majority' });
  assert.equal(cartel.population.falseSubjects, 0);
  assert.equal(cartel.population.humanOperators, cartel.population.finalSubjects);
  assert.equal(cartel.population.attackerOperators, cartel.population.finalAttackerSubjects);
  assert.equal(cartel.outcome.success, true);
  assert.equal(cartel.outcome.firstSuccess.atHour, 0);
  assert.equal(cartel.outcome.firstSuccess.attackerEffort, 0);
  assert.equal(cartel.effort.cohorts.attackers.byAction.fabricateIdentity.attempts, 0);
});

test('every funded action is charged, funded admission burns own rights, and money remains conserved', () => {
  const run = runExperiment({ ...liquid, includeState: true, weights: { selfId: 2.5, invite: 0.25 } });
  const ledger = run.metrics.ledger;
  assert.equal(ledger.supply, ledger.emitterVault + ledger.collector + ledger.feeVault);
  assert.equal(run.money.honest.inviteBurns + run.money.attackers.inviteBurns + run.money.honest.vetoBurns + run.money.attackers.vetoBurns, ledger.burned);
  assert.equal(run.money.honest.guaranteeFeesPaid + run.money.attackers.guaranteeFeesPaid, ledger.feeVault);
  assert.ok(run.state.selfIds.filter(act => act.disposition === 'invitation').length >= run.state.lineage.edges.length);
  for (const cohort of Object.values(run.effort.cohorts)) {
    const expected = Object.entries(cohort.byAction).reduce((sum, [action, row]) => sum + row.attempts * run.config.weights[action], 0);
    assert.equal(cohort.effort, expected);
    assert.equal(cohort.attempts, cohort.accepted + cohort.rejected);
    assert.ok(cohort.effort <= cohort.budget);
  }
  const bounded = runExperiment({ ...liquid, budgets: { attackers: 3 } });
  assert.ok(bounded.effort.cohorts.attackers.effort <= 3);
  assert.ok(bounded.effort.cohorts.attackers.denied > 0);
  assert.equal(bounded.outcome.censored, false);
});

test('conversion activity controls liquidity without bypassing the Emitter or finalizing pending XP', () => {
  const run = runExperiment({ ...liquid, days: 12, activity: { attackers: { invite: 0, convert: 0 } } });
  assert.equal(run.metrics.ledger.collector, 0);
  assert.equal(run.metrics.ledger.emitterVault, 36);
  assert.equal(run.metrics.xp.total, 0);
  assert.equal(run.effort.cohorts.attackers.byAction.convert.attempts, 0);
});

test('malicious veto effort can damage honest emissions without declaring their identities false', () => {
  const run = runExperiment({
    seed: 'test', initialSize: 6, attackerShare: 0.5, initialTopology: 'clique', days: 3, includeState: true,
    policy: { guarantorEligibility: 'accepted' }, falsePositiveRate: 0,
    activity: { attackers: { inspect: 20, respond: 1, invite: 0 }, honest: { selfId: 1, invite: 0, inspect: 0 } },
  });
  assert.ok(run.impact.honestEmissionsCancelled > 0);
  assert.ok(run.effort.cohorts.attackers.byAction.respond.effort > 0);
  assert.ok(run.state.subjects.every(subject => subject.identityStatus === 'accepted'));
});

test('even perfect observations do not grant outsiders nonexistent cancellation or court authority', () => {
  const run = runExperiment({
    seed: 'test', initialSize: 6, attackerShare: 0.5, initialTopology: 'clique', days: 20,
    sensitivity: 1, falsePositiveRate: 0,
    activity: { honest: { selfId: 1, guarantee: 0, invite: 0, inspect: 30, respond: 1 }, attackers: { invite: 0.1 } },
  });
  assert.ok(run.population.falseSubjects > 0);
  assert.ok(run.observations.noVetoAuthority > 0);
  assert.equal(run.impact.falseEmissionsCancelled, 0);
  assert.equal(run.impact.honestEmissionsCancelled, 0);
});

test('resource truncation is unknown, never counted as a successful defense', () => {
  const cap = runExperiment({ ...liquid, maxSubjects: 3, activity: { attackers: { invite: 1 } } });
  assert.equal(cap.outcome.success, null);
  assert.equal(cap.outcome.censoredReason, 'maxSubjects');
  assert.equal(cap.population.finalSubjects, 3);
  const actionCap = runExperiment({ ...liquid, maxActions: 1 });
  assert.equal(actionCap.outcome.success, null);
  assert.equal(actionCap.outcome.censoredReason, 'maxActions');
  assert.equal(actionCap.effort.calls, 1);
  const alreadySuccessful = runExperiment({ ...liquid, successCriterion: 'council-majority', maxActions: 1 });
  assert.equal(alreadySuccessful.outcome.success, true);
  assert.equal(alreadySuccessful.outcome.censored, true);
});

test('cohort shares expose integer rounding and policies reject unknown or invalid experiment controls', () => {
  const run = runExperiment({ initialSize: 6, attackerShare: 0.1, days: 0, initialTopology: 'none' });
  assert.equal(run.population.realizedInitialAttackerShare, 1 / 6);
  assert.equal(run.population.requestedAttackerShare, 0.1);
  for (const bad of [
    { typo: 1 }, { attackerShare: 2 }, { days: -1 }, { maxSubjects: 2 },
    { activity: { honest: { selfId: 2 } } }, { activity: { honest: { invented: 1 } } },
    { activity: { outsiders: {} } }, { budgets: { attackers: -1 } },
    { weights: { inspect: 0.0000001 } }, { scenario: 'honest-growth', attackerShare: 0.5 },
  ]) assert.throws(() => experimentConfig(bad));
  const config = experimentConfig();
  assert.throws(() => { config.activity.honest.inspect = 0; }, TypeError);
  assert.throws(() => { config.policy.xpFinality = 'immediate'; }, TypeError);
});
