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

test('dispute records accumulate and settings validate', () => {
  assert.throws(() => experimentConfig({ disputes: { trackRecordWeight: 1.5 } }), RangeError);
  const run = runExperiment({ ...base, seed: 'records', days: 24, activity: { honest: { inspect: 3, challenge: 1, review: 1 } },
    disputes: { enabled: true, procedure: 'chekharda-timed', disputeWindowHours: 48, trackRecordWeight: 0.5, regularsNotice: 0.5, roundsPerDay: 5, entrantChoice: 'highest' } });
  assert.ok(run.system.sanctions.disputesResolved > 0);
});

test('round-limited resolutions name the scheduler cap rather than claiming unopposed timeout finality', () => {
  for (const procedure of ['chekharda', 'chekharda-timed']) {
    const run = runExperiment({ seed: 'termination-reason', initialSize: 12, attackerShare: 0.25, days: 12,
      activity: { honest: { inspect: 3, challenge: 1 } },
      disputes: { enabled: true, procedure, stakeBacking: 'reserved', maxRounds: 1 } });
    assert.ok(run.disputes.cases.length > 0);
    assert.ok(run.disputes.cases.every(record => record.reason === 'round-limit' && record.positions.length === 1));
    assert.ok(run.disputes.cases.every(record => record.openedAt === record.closedAt), 'this cap bypasses waiting as an explicit reference bound, not the selected finality window');
  }
});

test('all dispute references expose exclusive reserved custody, pending cases and actual stake outcomes', () => {
  assert.throws(() => experimentConfig({ disputes: { stakeBacking: 'free' } }), /stakeBacking/);
  for (const procedure of ['one-step', 'chekharda', 'chekharda-timed']) {
    const settings = { ...base, seed: 'reserved:' + procedure, includeState: true,
      disputes: { enabled: true, procedure, stakeBacking: 'reserved', disputeWindowHours: 48 } };
    const run = runExperiment(settings);
    assert.deepEqual(run, runExperiment(settings));
    const ledger = run.metrics.ledger;
    const stakes = run.disputes.stakes;
    assert.ok(stakes.cases > 0);
    assert.equal(stakes.cases, run.system.sanctions.challenges);
    assert.equal(stakes.openCases, run.system.sanctions.disputesOpen);
    assert.equal(stakes.pendingNominal, ledger.stakeVault);
    assert.equal(stakes.nominalLosing, stakes.transferred + stakes.burned + stakes.unpaid);
    assert.equal(stakes.unpaid, 0);
    assert.equal(ledger.supply, ledger.emitterVault + ledger.collector + ledger.feeVault + ledger.stakeVault);
    assert.equal(run.state.disputeStakes.filter(stake => stake.status === 'reserved').reduce((sum, stake) => sum + stake.amount, 0), ledger.stakeVault);
    assert.equal(Object.values(run.agents).flatMap(groups => Object.values(groups)).reduce((sum, facts) => sum + facts.stakeFacy, 0), ledger.stakeVault);
    assert.ok(run.disputes.cases.every(record => record.status === 'open' ? record.reason === null : typeof record.reason === 'string'));
    const truth = new Map(run.state.truth.map(identity => [identity.id, identity]));
    const falseUnspent = run.state.selfIds.filter(act => act.status === 'unspent' && !truth.get(act.subject).genuine).length;
    const heldByFalse = run.system.falseLiquidFacy + run.system.falseStakeFacy + falseUnspent;
    assert.equal(run.system.falseCirculatingShare, ledger.supply ? heldByFalse / ledger.supply : 0);
    assert.ok(run.state.disputeStakes.every(stake => !Object.hasOwn(stake, 'genuine') && !Object.hasOwn(stake, 'cohort')));
  }
});

test('Council rejection can settle without an ordinary winning entrant or invented payee', () => {
  const reference = { seed: 'core-council-entry-contract-software', stepHours: 4, days: 8, initialSize: 30, attackerShare: 0.2, includeState: true,
    policy: { councilSize: 11 }, activity: { honest: { inspect: 3, challenge: 1 }, attackers: { defend: 0 } },
    disputes: { enabled: true, procedure: 'chekharda-timed', entryTiming: 'each-tick', roundsPerDay: 6, noticeBase: 0, councilDepth: 1 } };
  for (const procedure of ['chekharda', 'chekharda-timed']) for (const stakeBacking of ['unsecured', 'reserved']) for (const clusterFollowUp of [false, true]) {
    const run = runExperiment({ ...reference, disputes: { ...reference.disputes, procedure, entryTiming: procedure === 'chekharda-timed' ? 'each-tick' : 'daily-quota', stakeBacking, clusterFollowUp } });
    assert.equal(run.outcome.censored, false);
    const rejected = run.disputes.cases.filter(record => record.status === 'settled' && record.winner === 'genuine');
    assert.ok(rejected.length > 0);
    for (const record of rejected) {
      assert.equal(record.reason, 'depth-triggered-council-reference');
      assert.equal(record.upheld, false);
      assert.equal(record.positions.length, 1);
      assert.equal(record.positions[0].side, 'fraud');
      assert.equal(record.positions.some(position => position.side === record.winner), false);
      assert.equal(record.accounting.transferred, 0, 'no ordinary winner or new Council payee is invented');
      assert.equal(record.accounting.released, 0);
      assert.equal(record.accounting.nominalLosing, record.positions[0].amount);
      assert.equal(record.accounting.nominalLosing, record.accounting.burned + record.accounting.unpaid);
      if (stakeBacking === 'reserved') assert.equal(record.accounting.unpaid, 0);
    }
    assert.equal(run.system.sanctions.clusterChallenges, 0, 'no losing ordinary defender supplies a secondary-case target');
    const ledger = run.metrics.ledger, stakes = run.disputes.stakes;
    assert.equal(ledger.supply, ledger.collector + ledger.emitterVault + ledger.feeVault + ledger.stakeVault);
    assert.equal(stakes.nominalLosing, stakes.transferred + stakes.burned + stakes.unpaid);
    assert.equal(stakes.pendingNominal, stakeBacking === 'reserved' ? ledger.stakeVault : run.disputes.cases.filter(record => record.status === 'open').reduce((n, record) => n + record.positions.reduce((m, position) => m + position.amount, 0), 0));
    assert.ok(run.state.disputeStakes.every(record => !Object.hasOwn(record, 'genuine') && !Object.hasOwn(record, 'cohort')));
  }
});

test('public proof is shared by every noticer and cluster follow-ups challenge defenders of proven fakes', () => {
  assert.throws(() => experimentConfig({ disputes: { evidence: 'rumor' } }), /evidence/);
  const settings = {
    ...base, seed: 'proof', days: 24, activity: { honest: { inspect: 3, challenge: 1, review: 1 }, attackers: { defend: 1 } },
    social: { gossipHops: 2 }, disputes: { enabled: true, procedure: 'chekharda', evidence: 'public-proof', clusterFollowUp: true, entrantChoice: 'highest' },
  };
  const run = runExperiment(settings);
  assert.ok(run.system.sanctions.challenges > 0);
  assert.ok(run.system.sanctions.clusterChallenges >= 0);
  const ledger = run.metrics.ledger;
  assert.equal(ledger.supply, ledger.emitterVault + ledger.collector + ledger.feeVault);
});
