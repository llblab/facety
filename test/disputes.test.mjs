import test from 'node:test';
import assert from 'node:assert/strict';
import { runExperiment, experimentConfig } from '../src/experiment.mjs';

const base = { scenario: 'sybil-cone', seed: 'disputes', initialSize: 30, attackerShare: 0.2, days: 24, maxSubjects: 1500, activity: { honest: { inspect: 3, challenge: 1 } } };

test('dispute and deviant settings fail closed and default to the previous behavior', () => {
  assert.throws(() => experimentConfig({ disputes: { liability: 'everyone' } }), /liability/);
  assert.throws(() => experimentConfig({ disputes: { accuracy: 2 } }), RangeError);
  assert.throws(() => experimentConfig({ deviants: { honest: { activity: { inspect: 0 } } } }), /positive deviants.share/);
  assert.throws(() => experimentConfig({ activity: { honest: { challenge: 1.5 } } }), RangeError);
  const disabled = runExperiment({ ...base, disputes: { enabled: false } });
  assert.equal(disabled.system.sanctions.challenges, 0);
  assert.equal(disabled.effort.cohorts.honest.byAction.challenge.attempts, 0);
});

test('perfectly accurate challenges remove only false subjects, sanction liable parties and conserve money', () => {
  const run = runExperiment({ ...base, disputes: { enabled: true, accuracy: 1, fine: 3 }, includeState: true });
  const { sanctions } = run.system;
  assert.ok(sanctions.upheld > 0);
  assert.equal(sanctions.wrongfulInvalidated, 0);
  assert.equal(sanctions.falseInvalidated, sanctions.upheld);
  assert.equal(sanctions.missedFalse, 0);
  const truth = new Map(run.state.truth.map(identity => [identity.id, identity]));
  assert.ok(run.state.subjects.filter(subject => subject.identityStatus === 'false').every(subject => !truth.get(subject.id).genuine));
  const ledger = run.metrics.ledger;
  assert.equal(ledger.supply, ledger.emitterVault + ledger.collector + ledger.feeVault);
  assert.equal(run.agents.attackers.conformist.halvings + run.agents.attackers.deviant.halvings + run.agents.attackers.recruit.halvings > 0, true);
  assert.ok(run.agents.honest.conformist.rewardsReceived > 0, 'challengers receive their declared share of collected fines');
  assert.equal(run.history.at(-1).sanctions.upheld, sanctions.upheld);
});

test('inaccurate verdicts can invalidate genuine people, and exclusion extends to liable guarantors', () => {
  const noisy = runExperiment({ ...base, falsePositiveRate: 0.3, disputes: { enabled: true, accuracy: 0.5, excludeLiable: true } });
  assert.ok(noisy.system.sanctions.wrongfulInvalidated + noisy.system.sanctions.excluded > 0);
  assert.ok(noisy.system.sanctions.rejected > 0);
});

test('deviants are a seeded subset of initial operators whose controlled subjects follow the deviant profile', () => {
  const marked = runExperiment({ ...base, disputes: { enabled: true }, deviants: { share: 0.25 } });
  const unmarked = runExperiment({ ...base, disputes: { enabled: true } });
  assert.deepEqual(marked.history.map(point => point.subjects), unmarked.history.map(point => point.subjects), 'marking alone changes no behavior');
  assert.equal(marked.agents.honest.deviant.operators, 6);
  assert.equal(marked.agents.attackers.deviant.operators, 2);
  const lazy = runExperiment({ ...base, disputes: { enabled: true }, deviants: { share: 0.25, honest: { activity: { inspect: 0, challenge: 0 } } } });
  assert.equal(lazy.agents.honest.deviant.operators, 6);
  assert.ok(lazy.agents.honest.deviant.effort < marked.agents.honest.deviant.effort);
  const idle = runExperiment({ ...base, deviants: { share: 0.5, attackers: { activity: { invite: 0 }, schedule: [{ startDay: 0, endDay: 24, activity: { selfId: 0 } }] } } });
  assert.equal(idle.agents.attackers.deviant.convertedRewards, 0);
  assert.equal(idle.agents.attackers.deviant.subjects, idle.agents.attackers.deviant.operators, 'idle deviant operators fabricated nobody');
});

test('chain fines scale with the voided chain and reach the inviter and the inviter\'s guarantors', () => {
  const settings = { ...base, disputes: { enabled: true, accuracy: 1, fineMode: 'chain', liability: 'inviter-chain', rewardShare: 0 }, includeState: true };
  const run = runExperiment(settings);
  assert.ok(run.system.sanctions.voidedActs > 0);
  const voided = run.state.selfIds.filter(act => act.disposition === 'adjudicated-void').length;
  assert.ok(voided > 0 && voided <= run.system.sanctions.voidedActs);
  const fixedRun = runExperiment({ ...settings, disputes: { ...settings.disputes, fineMode: 'fixed' } });
  assert.equal(fixedRun.system.sanctions.voidedActs, 0);
  assert.throws(() => experimentConfig({ disputes: { fineMode: 'square' } }), /fineMode/);
  const ledger = run.metrics.ledger;
  assert.equal(ledger.supply, ledger.emitterVault + ledger.collector + ledger.feeVault);
});
