import test from 'node:test';
import assert from 'node:assert/strict';
import { runExperiment, experimentConfig } from '../src/experiment.mjs';
import { Random } from '../src/random.mjs';
import { SUBDAY_RANDOMNESS } from '../src/activity-schedule.mjs';
import { registerHypothesis, verifyRegistration } from '../src/evidence.mjs';

const quiet = { selfId: 1, invite: 0, guarantee: 0, inspect: 0, respond: 0, convert: 0 };
const fixture = { seed: 'd43-review', stepHours: 4, days: 4, initialSize: 4, initialTopology: 'clique', attackerShare: 0.5, sensitivity: 0, falsePositiveRate: 0, includeState: true, invitationReviewTiming: 'first-attended', activity: { honest: { ...quiet, review: 1 }, attackers: { ...quiet, invite: 1 } } };
function attentionProfiles(stepHours, kind) {
  return Array.from({ length: 4 }, (_, index) => ({ subject: 'n' + index, attentionHours: kind === 'all' ? null : kind === 'none' ? [] : Array.from({ length: 4 }, (_, day) => 24 * day + stepHours * (index % (24 / stepHours))) }));
}
// Independent oracle: constant funded clique, no maintenance/ordinary inspections/adjudication.
// Inspect the returned public journal/evaluator labels only to verify the software fixture.
function expectedTrials(run) {
  const { config, state } = run;
  const watchers = state.truth.filter(identity => identity.cohort === 'honest').map(identity => identity.id);
  const random = new Random(config.seed).fork('daily-quota-keyed-slots-v1');
  let count = 0;
  for (const invitation of state.invitations) {
    assert.match(invitation.creator, /^n\d+$/);
    for (const guarantor of watchers) {
      const days = new Set();
      const profile = config.actorProfiles.find(profile => profile.subject === guarantor);
      for (let hour = invitation.createdAt + config.stepHours; hour < Math.min(config.days * 24, invitation.createdAt + config.policy.invitationFreezeHours); hour += config.stepHours) {
        if (profile?.attentionHours !== null && profile?.attentionHours !== undefined && !profile.attentionHours.includes(hour)) continue;
        const day = Math.floor(hour / 24);
        if (days.has(day)) continue;
        days.add(day);
        if (random.fork(JSON.stringify(['count', day, guarantor, 'invitation-review', [invitation.id]])).chance(config.activity.honest.review)) count++;
      }
    }
  }
  return count;
}

test('first-attended keeps one keyed daily Bernoulli across 4/6-hour calendars, not repeated per tick', () => {
  for (const stepHours of [4, 6]) for (const kind of ['all', 'none', 'staggered']) for (const review of [0, 0.37, 1]) {
    const run = runExperiment({ ...fixture, stepHours, actorProfiles: attentionProfiles(stepHours, kind), activity: { ...fixture.activity, honest: { ...fixture.activity.honest, review } } });
    assert.equal(run.invitationReview.counters.reviewSlots, expectedTrials(run));
    assert.equal(run.invitationReview.counters.inspections, expectedTrials(run));
    assert.equal(run.effort.cohorts.honest.byAction.inspect.attempts, expectedTrials(run));
    assert.equal(run.invitationReview.counters.positiveSignals, 0);
    assert.equal(run.outcome.censored, false);
    assert.deepEqual(run.config.budgets, experimentConfig(fixture).budgets);
    assert.equal(run.randomness.invitationReviewSchedule, 'first-attended-pair-day-v1');
  }
});

test('first-attended starts after creation, respects exact expiry, and does not guarantee a legal window', () => {
  for (const stepHours of [4, 6]) {
    const active = runExperiment({ ...fixture, stepHours, sensitivity: 1 });
    const cancellations = active.state.events.filter(event => event.type === 'invitation-cancelled');
    assert.ok(cancellations.length > 0);
    for (const event of cancellations) {
      const invitation = active.state.invitations.find(invitation => invitation.id === event.invitation);
      assert.equal(event.at, invitation.createdAt + stepHours);
      assert.ok(event.at < invitation.createdAt + 24);
    }
    const reference = runExperiment({ ...fixture, stepHours });
    const first = reference.state.invitations[0];
    assert.ok(first.createdAt + 24 <= fixture.days * 24);
    const boundary = runExperiment({ ...fixture, stepHours, sensitivity: 1, actorProfiles: Array.from({ length: 4 }, (_, index) => ({ subject: 'n' + index, attentionHours: [first.createdAt, first.createdAt + 24] })) });
    assert.equal(boundary.state.invitations.find(invitation => invitation.id === first.id).status, 'accepted');
    assert.ok(!boundary.state.events.some(event => event.type === 'invitation-cancelled' && event.invitation === first.id));
  }
});

test('first-attended consumes the trial on work or evidence failure without same-day retries', () => {
  for (const stepHours of [4, 6]) {
    const denied = runExperiment({ ...fixture, stepHours, weights: { inspect: 1000000 } });
    assert.ok(expectedTrials(denied) > 0);
    assert.equal(denied.invitationReview.counters.reviewSlots, expectedTrials(denied));
    assert.equal(denied.invitationReview.counters.inspectionDenied, expectedTrials(denied));
    assert.equal(denied.invitationReview.counters.inspections, 0);
    const verification = runExperiment({ ...fixture, stepHours, sensitivity: 1, social: { verification: true, verificationSensitivity: 0, verificationFalsePositiveRate: 0 } });
    assert.equal(verification.invitationReview.counters.inspections, expectedTrials(verification));
    assert.equal(verification.invitationReview.counters.verificationCalls, expectedTrials(verification));
    assert.equal(verification.invitationReview.counters.verificationPassed, 0);
    assert.equal(verification.invitationReview.counters.cancelCalls, 0);
  }
});

test('first-attended pays for observation but retains transaction availability and veto-effect gates', () => {
  const blind = runExperiment(fixture);
  const watchers = blind.state.truth.filter(identity => identity.cohort === 'honest').map(identity => identity.id);
  const unavailable = runExperiment({ ...fixture, sensitivity: 1, actorProfiles: watchers.map(subject => ({ subject, transactionHours: [] })) });
  const counters = unavailable.invitationReview.counters;
  assert.equal(counters.inspections, expectedTrials(unavailable));
  assert.ok(counters.positiveSignals > 0);
  assert.equal(counters.cancelUnavailable, counters.cancelCalls);
  assert.equal(counters.cancelled, 0);
  const active = runExperiment({ ...fixture, sensitivity: 1 });
  const blocked = runExperiment({ ...fixture, sensitivity: 1, ablations: { disableInvitationVeto: true } });
  assert.equal(blocked.invitationReview.counters.inspections, expectedTrials(blocked));
  assert.equal(blocked.invitationReview.counters.cancelRejected, blocked.invitationReview.counters.positiveSignals);
  const first = active.state.events.find(event => event.type === 'invitation-cancelled').at;
  assert.deepEqual(active.state.events.filter(event => event.at < first), blocked.state.events.filter(event => event.at < first));
});

test('first-attended does not use future calendars or consume unrelated inspection randomness', () => {
  for (const stepHours of [4, 6]) {
    const unrestricted = runExperiment({ ...fixture, stepHours });
    const future = runExperiment({ ...fixture, stepHours, actorProfiles: Array.from({ length: 4 }, (_, index) => ({ subject: 'n' + index, attentionHours: Array.from({ length: 48 / stepHours }, (_, tick) => tick * stepHours) })) });
    assert.deepEqual(unrestricted.state.events.filter(event => event.at < 48), future.state.events.filter(event => event.at < 48));
    assert.deepEqual(unrestricted.history.filter(row => row.atHour < 48), future.history.filter(row => row.atHour < 48));
    const inert = runExperiment({ ...fixture, stepHours, activity: { ...fixture.activity, attackers: { ...fixture.activity.attackers, inspect: 1 } } });
    assert.deepEqual(unrestricted.state, inert.state);
    assert.deepEqual(unrestricted.invitationReview, inert.invitationReview);
  }
});

test('review timing is validated, default-preserving and bound independently of regular dispute timing', () => {
  assert.equal(experimentConfig().invitationReviewTiming, 'daily-slot');
  for (const value of [null, true, 'other']) assert.throws(() => experimentConfig({ invitationReviewTiming: value }), /invitationReviewTiming/);
  assert.throws(() => experimentConfig({ invitationReviewTiming: 'first-attended' }), /requires sub-day/);
  assert.deepEqual(runExperiment({ ...fixture, invitationReviewTiming: 'daily-slot' }).randomness, SUBDAY_RANDOMNESS);
  const both = { ...fixture, days: 0, disputes: { enabled: true, procedure: 'chekharda-timed', entryTiming: 'each-tick', roundsPerDay: 6 } };
  const run = runExperiment(both);
  assert.equal(run.randomness.disputeSchedule, 'one-opportunity-per-tick-v1');
  assert.equal(run.randomness.invitationReviewSchedule, 'first-attended-pair-day-v1');
  const registration = registerHypothesis({ id: 'first-attended-manifest-software', statement: 'Synthetic transport only', kind: 'association', base: { ...both, includeState: false }, statistic: { metric: 'outcome.success' }, arms: { uniform: { invitationReviewTiming: 'daily-slot' }, attended: {} }, claims: [{ id: 'p', role: 'presence', contrast: { uniform: 1, attended: -1 }, direction: 'greater' }], replicas: 5, exploration: { seeds: [] } });
  assert.equal(registration.randomness.policies.length, 2);
  assert.equal(verifyRegistration(registration).implementationMatched, true);
  assert.ok(run.assumptions.some(text => text.startsWith('Counterfactual first-attended')));
  assert.match(run.invitationReview.attention, /counterfactual first-attended/);
});
