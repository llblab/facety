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

test('the Chekharda ladder escalates stakes, settles money conservatively and depends on Council intervention', () => {
  const ladderBase = {
    ...base, scenario: 'sybil-cone', sensitivity: 0.5, falsePositiveRate: 0.05,
    activity: { honest: { inspect: 3, challenge: 1, review: 1 }, attackers: { inspect: 2, challenge: 1 } },
    social: { scope: 'acquaintances', verification: true },
  };
  const outcome = disputes => [0, 1, 2].map(i => runExperiment({ ...ladderBase, seed: 'ladder:' + i, disputes: { enabled: true, procedure: 'chekharda', ...disputes } }));
  const accuracy = runs => {
    const s = runs.reduce((sum, run) => Object.fromEntries(Object.entries(run.system.sanctions).map(([k, v]) => [k, (sum[k] ?? 0) + v])), {});
    return (s.falseInvalidated + s.rejected - s.missedFalse) / s.challenges;
  };
  const alone = outcome({});
  const council = outcome({ councilDepth: 3 });
  assert.ok(alone.every(run => run.system.sanctions.ladderEntries > 0));
  assert.ok(alone.every(run => run.system.sanctions.councilInterventions === 0));
  assert.ok(council.some(run => run.system.sanctions.councilInterventions > 0));
  assert.ok(council.every(run => run.system.sanctions.ladderDepth <= 3));
  assert.ok(accuracy(council) > accuracy(alone), 'disposable high-XP fakes win unopposed ladders; the Council restores accuracy');
  for (const run of [...alone, ...council]) {
    const ledger = run.metrics.ledger;
    assert.equal(ledger.supply, ledger.emitterVault + ledger.collector + ledger.feeVault);
  }
  assert.throws(() => experimentConfig({ disputes: { procedure: 'vote' } }), /procedure/);
});

test('challengers draw attention and a public reputation prior shapes ladder beliefs', () => {
  const attentive = runExperiment({ ...base, seed: 'attention', disputes: { enabled: true }, social: { attentionFeedback: true } });
  assert.ok(attentive.system.sanctions.challenges > 0);
  assert.ok(attentive.system.trust.flowFlagged > 0, 'every challenger becomes a screening target');
  const quiet = runExperiment({ ...base, seed: 'attention', disputes: { enabled: true } });
  assert.equal(quiet.system.trust.flowFlagged, 0);
  assert.throws(() => experimentConfig({ disputes: { reputationWeight: 2 } }), RangeError);
  const reputed = runExperiment({ ...base, seed: 'reputation', disputes: { enabled: true, procedure: 'chekharda', reputationWeight: 0.8, councilDepth: 3 } });
  assert.ok(reputed.system.sanctions.challenges > 0);
});

test('timed Chekharda freezes the accused, waits for the window after the last move and supports fast escalation', () => {
  const timed = { ...base, days: 30, activity: { honest: { inspect: 3, challenge: 1, review: 1 } }, disputes: { enabled: true, procedure: 'chekharda-timed', disputeWindowHours: 48 } };
  const slow = runExperiment({ ...timed, seed: 'timed' });
  const fast = runExperiment({ ...timed, seed: 'timed', disputes: { ...timed.disputes, roundsPerDay: 10, entrantChoice: 'highest' } });
  for (const run of [slow, fast]) {
    const s = run.system.sanctions;
    assert.ok(s.challenges > 0);
    assert.ok(s.disputesResolved + s.disputesMooted + s.disputesOpen <= s.challenges);
    assert.ok(s.disputesResolved > 0);
    const ledger = run.metrics.ledger;
    assert.equal(ledger.supply, ledger.emitterVault + ledger.collector + ledger.feeVault);
  }
  assert.throws(() => experimentConfig({ disputes: { entrantChoice: 'loudest' } }), /entrantChoice/);
  assert.throws(() => experimentConfig({ disputes: { roundsPerDay: 0 } }), RangeError);
  assert.throws(() => experimentConfig({ activity: { attackers: { defend: 2 } } }), RangeError);
});
