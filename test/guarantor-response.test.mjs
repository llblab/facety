import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel } from '../src/model.mjs';
import { runExperiment, experimentConfig } from '../src/experiment.mjs';
import { registerHypothesis, verifyRegistration } from '../src/evidence.mjs';

const quiet = { selfId: 1, guarantee: 0, invite: 0, inspect: 0, convert: 0 };
const scenario = { seed: 'd43-review', stepHours: 4, days: 5, initialSize: 4, initialTopology: 'clique', attackerShare: 0.5, sensitivity: 1, falsePositiveRate: 0, includeState: true, activity: { honest: { ...quiet, review: 1 }, attackers: { ...quiet, invite: 1 } } };

test('invitation-veto ablation blocks only an otherwise valid operation without partial mutation', () => {
  for (const disabled of [false, true]) {
    const model = new FacetyModel({ genesis: ['g', 's'], ablations: { disableInvitationVeto: disabled } });
    model.createSelfId('g', model.registerArtifact('g'));
    const source = model.createSelfId('s', model.registerArtifact('s'));
    model.confirmGuarantee('s', model.proposeGuarantee('g', 's'));
    model.advanceTo(24);
    const invitation = model.createInvitation('s', source, 'new');
    const snapshot = () => ({ accounts: model.subjects(), acts: model.selfIds(), invitations: model.invitations(), events: model.events(), ledger: model.audit() });
    const before = snapshot();
    if (disabled) {
      assert.throws(() => model.cancelInvitation('g', invitation), /counterfactual ablation/);
      assert.deepEqual(snapshot(), before);
    } else {
      model.cancelInvitation('g', invitation);
      assert.equal(model.invitations()[0].status, 'cancelled');
      assert.deepEqual(model.audit(), before.ledger);
    }
  }
  assert.throws(() => new FacetyModel({ ablations: { disableInvitationVeto: 'yes' } }), /boolean/);
});

test('guardian trace distinguishes opportunity, paid observation, signal and funded authorized cancellation', () => {
  const enabled = runExperiment(scenario);
  const counts = enabled.invitationReview.counters;
  assert.ok(counts.pairTickOpportunities >= counts.reviewSlots);
  assert.ok(counts.inspections > 0);
  const evaluated = enabled.invitationReview.evaluator;
  assert.equal(evaluated.falseTargetsInspected + evaluated.genuineTargetsInspected, counts.inspections);
  assert.equal(evaluated.falseTargetPositive + evaluated.genuineTargetPositive, counts.positiveSignals);
  assert.equal(counts.reviewSlots, counts.inspections + counts.inspectionDenied);
  assert.equal(counts.cancelCalls, counts.cancelled + counts.cancelRejected + counts.cancelBudgetDenied + counts.cancelUnavailable);
  assert.equal(counts.cancelCalls, counts.positiveSignals);
  assert.equal(counts.cancelled, enabled.system.trust.invitationsCancelled);
  assert.ok(counts.cancelled > 0);
  const blocked = runExperiment({ ...scenario, ablations: { disableInvitationVeto: true } });
  assert.equal(blocked.invitationReview.counters.cancelled, 0);
  assert.ok(blocked.invitationReview.counters.cancelRejected > 0);
  const first = enabled.state.events.find(event => event.type === 'invitation-cancelled').at;
  assert.deepEqual(blocked.state.events.filter(event => event.at < first), enabled.state.events.filter(event => event.at < first));
  assert.deepEqual(blocked.history.filter(row => row.atHour < first), enabled.history.filter(row => row.atHour < first));
});

test('no recognition, failed verification and transaction unavailability remain distinct barriers', () => {
  const blind = runExperiment({ ...scenario, sensitivity: 0 });
  assert.ok(blind.invitationReview.counters.inspections > 0);
  assert.equal(blind.invitationReview.counters.positiveSignals, 0);
  assert.equal(blind.invitationReview.counters.cancelCalls, 0);
  const verified = runExperiment({ ...scenario, social: { verification: true, verificationSensitivity: 0, verificationFalsePositiveRate: 0 } });
  assert.ok(verified.invitationReview.counters.verificationCalls > 0);
  assert.equal(verified.invitationReview.counters.verificationPassed, 0);
  assert.equal(verified.invitationReview.counters.cancelCalls, 0);
  const unavailable = runExperiment({ ...scenario, actorProfiles: ['n1', 'n3'].map(subject => ({ subject, transactionHours: [0, 4, 8, 12, 16, 20] })) });
  assert.ok(unavailable.invitationReview.counters.positiveSignals > 0);
  assert.ok(unavailable.invitationReview.counters.cancelUnavailable > 0);
});

const timed = { seed: 'timed', stepHours: 4, days: 12, initialSize: 30, attackerShare: 0.2, includeState: true, activity: { honest: { inspect: 3, challenge: 1, review: 1 } }, disputes: { enabled: true, procedure: 'chekharda-timed', entryTiming: 'each-tick', roundsPerDay: 6, noticeBase: 1, entrantChoice: 'highest' } };
test('each-tick timed cases offer at most one opposing entry per four-hour tick and retain last-move finality', () => {
  const run = runExperiment(timed);
  assert.ok(run.disputes.cases.length > 0);
  let entries = 0;
  let consecutive = 0;
  for (const record of run.disputes.cases) {
    for (let i = 1; i < record.positions.length; i++) {
      const previous = record.positions[i - 1];
      const current = record.positions[i];
      assert.notEqual(current.side, previous.side);
      assert.ok(current.atHour - previous.atHour >= 4);
      assert.equal(current.atHour % 4, 0);
      if (current.atHour - previous.atHour === 4) consecutive++;
      entries++;
    }
    if (record.reason === 'response-window-expired') assert.ok(record.closedAt - record.positions.at(-1).atHour >= 168);
  }
  assert.ok(entries > 0);
  assert.ok(consecutive > 0);
  assert.equal(run.randomness.disputeSchedule, 'one-opportunity-per-tick-v1');
  const noWilling = runExperiment({ ...timed, days: 8, activity: { honest: { inspect: 3, challenge: 1 }, attackers: { defend: 0 } }, disputes: { ...timed.disputes, noticeBase: 0 } });
  assert.ok(noWilling.disputes.cases.length > 0);
  assert.ok(noWilling.disputes.cases.every(record => record.positions.length === 1));
});

test('each-tick is an explicit timed scenario, not a new universal daily entry rate', () => {
  for (const options of [
    { ...timed, stepHours: 24 },
    { ...timed, disputes: { ...timed.disputes, roundsPerDay: 1 } },
    { ...timed, disputes: { ...timed.disputes, procedure: 'one-step' } },
    { ...timed, disputes: { ...timed.disputes, enabled: false } },
  ]) assert.throws(() => experimentConfig(options), /each-tick/);
  assert.equal(experimentConfig().disputes.entryTiming, 'daily-quota');
  const spec = { id: 'timing-manifest-software', statement: 'Synthetic transport only', kind: 'association', base: { ...timed, days: 0, includeState: false }, statistic: { metric: 'outcome.success' }, arms: { ordinary: { 'disputes.entryTiming': 'daily-quota' }, regular: {} }, claims: [{ id: 'p', role: 'presence', contrast: { ordinary: 1, regular: -1 }, direction: 'greater' }], replicas: 5, exploration: { seeds: [] } };
  const registration = registerHypothesis(spec);
  assert.equal(registration.randomness.policies.length, 2);
  assert.equal(verifyRegistration(registration).implementationMatched, true);
});
