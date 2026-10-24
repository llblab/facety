import test from 'node:test';
import assert from 'node:assert/strict';
import { observationEnvironment } from '../src/identity-observations.mjs';
import { Random } from '../src/random.mjs';
import { runExperiment, experimentConfig } from '../src/experiment.mjs';
import { experimentRandomness, RANDOMNESS_POLICY } from '../src/experiment-config.mjs';
import { SUBDAY_RANDOMNESS } from '../src/activity-schedule.mjs';
import { registerHypothesis } from '../src/evidence.mjs';

const quiet = { selfId: 1, invite: 0, guarantee: 0, inspect: 0, respond: 0, convert: 0 };
const fixture = { seed: 'shared-observation-software', stepHours: 4, days: 4, initialSize: 4, initialTopology: 'clique', attackerShare: 0.5, includeState: true, invitationReviewTiming: 'first-attended', invitationEvidence: 'shared-target', sensitivity: 0.57, falsePositiveRate: 0.31, ablations: { disableInvitationVeto: true }, activity: { honest: { ...quiet, review: 1 }, attackers: { ...quiet, invite: 1 } } };

// Oracle over a constant funded clique: first-attended unit trial, no maintenance/ordinary inspection.
function expectedSignals(run) {
  const random = new Random(run.config.seed).fork('observations');
  const watchers = run.state.truth.filter(identity => identity.cohort === 'honest').map(identity => identity.id);
  let inspections = 0, positives = 0;
  for (const invitation of run.state.invitations) for (const watcher of watchers) {
    const days = new Set();
    for (let at = invitation.createdAt + run.config.stepHours; at < Math.min(run.config.days * 24, invitation.createdAt + 24); at += run.config.stepHours) {
      const day = Math.floor(at / 24);
      if (days.has(day)) continue;
      days.add(day);
      const key = run.config.invitationEvidence === 'shared-target' ? ['invitation-shared-target-v1', invitation.target] : [invitation.target, ['invitation-review', at, watcher]];
      inspections++;
      if (random.fork(JSON.stringify(key)).chance(run.config.scenario === 'real-cartel' ? run.config.falsePositiveRate : run.config.sensitivity)) positives++;
    }
  }
  return { inspections, positives };
}

test('environment shares only invitation first-stage target keys and retains class-specific marginal quality', () => {
  const truth = new Map([['genuine', { genuine: true }], ['false', { genuine: false }]]);
  for (const invitationEvidence of ['independent', 'shared-target']) for (const id of truth.keys()) {
    const calls = [];
    const random = { fork(key) { return { chance(probability) { calls.push({ key: JSON.parse(key), probability }); return true; } }; } };
    const observe = observationEnvironment(truth, random, { invitationEvidence, sensitivity: 0.8, falsePositiveRate: 0.01 });
    for (const context of [['invitation-review', 4, 'g1'], ['invitation-review', 28, 'g2'], ['act-inspection', 4, 'g1', 0], ['guarantee-proposal', 8, 'g2', 0], ['guarantee-confirmation', 12, 'g3', 0]]) {
      assert.deepEqual(observe(id, context), { suspicious: true });
      assert.ok(Object.isFrozen(observe(id, context)));
      const expected = invitationEvidence === 'shared-target' && context[0] === 'invitation-review' ? ['invitation-shared-target-v1', id] : [id, context];
      assert.deepEqual(calls.at(-1), { key: expected, probability: id === 'genuine' ? 0.01 : 0.8 });
    }
    observe('unadmitted-public-target', ['invitation-review', 4, 'g1'], { genuine: false });
    assert.equal(calls.at(-1).probability, 0.8);
  }
  for (const quality of [0, 0.01, 0.8, 1]) for (const genuine of [false, true]) for (let seed = 0; seed < 128; seed++) {
    const config = { invitationEvidence: 'shared-target', sensitivity: quality, falsePositiveRate: quality };
    const observe = observationEnvironment(new Map([['a', { genuine }], ['b', { genuine }]]), new Random('identity-signal-software-' + seed), config);
    const expected = new Random('identity-signal-software-' + seed).fork(JSON.stringify(['invitation-shared-target-v1', 'a'])).chance(quality);
    for (const at of [4, 28, 100]) for (const watcher of ['g1', 'g2']) assert.equal(observe('a', ['invitation-review', at, watcher]).suspicious, expected);
    assert.equal(observe('b', ['invitation-review', 4, 'g1']).suspicious, new Random('identity-signal-software-' + seed).fork(JSON.stringify(['invitation-shared-target-v1', 'b'])).chance(quality));
  }
});

test('evidence mode validates and binds full manifests independently across all supported clocks', () => {
  assert.equal(experimentConfig().invitationEvidence, 'independent');
  for (const value of [null, false, 1, 'other']) assert.throws(() => experimentConfig({ invitationEvidence: value }), /invitationEvidence/);
  for (const stepHours of [24, 6, 4]) {
    const reference = stepHours === 24 ? RANDOMNESS_POLICY : SUBDAY_RANDOMNESS;
    assert.deepEqual(experimentRandomness(experimentConfig({ stepHours })), reference);
    const config = experimentConfig({ stepHours, invitationEvidence: 'shared-target' });
    assert.deepEqual(experimentRandomness(config), { ...reference, invitationEvidence: 'shared-target-first-stage-v1' });
    const run = runExperiment({ ...config, days: 0 });
    assert.ok(run.assumptions.some(text => text.includes('extremal common-mode stress')));
    assert.ok(!run.assumptions.some(text => text.includes('Repeated observations are conditionally independent')));
  }
  const base = { stepHours: 4, days: 0, invitationReviewTiming: 'first-attended', invitationEvidence: 'shared-target', disputes: { enabled: true, procedure: 'chekharda-timed', entryTiming: 'each-tick', roundsPerDay: 6 } };
  const policy = experimentRandomness(experimentConfig(base));
  assert.equal(policy.invitationEvidence, 'shared-target-first-stage-v1');
  assert.equal(policy.invitationReviewSchedule, 'first-attended-pair-day-v1');
  assert.equal(policy.disputeSchedule, 'one-opportunity-per-tick-v1');
  const registration = registerHypothesis({ id: 'shared-signal-manifest-software', statement: 'Synthetic transport only', kind: 'association', base, statistic: { metric: 'outcome.success' }, arms: { independent: { invitationEvidence: 'independent' }, shared: {} }, claims: [{ id: 'p', role: 'presence', contrast: { independent: 1, shared: -1 }, direction: 'greater' }], replicas: 5, exploration: { seeds: [] } });
  assert.equal(registration.randomness.policies.length, 2);
});

test('paid native review counters match the key oracle for both identity classes and 4/6-hour clocks', () => {
  for (const stepHours of [4, 6]) for (const scenario of ['sybil-cone', 'real-cartel']) {
    const states = [];
    for (const invitationEvidence of ['independent', 'shared-target']) {
      const run = runExperiment({ ...fixture, stepHours, scenario, invitationEvidence });
      const expected = expectedSignals(run);
      assert.ok(expected.inspections > 0);
      assert.equal(run.invitationReview.counters.inspections, expected.inspections);
      assert.equal(run.invitationReview.counters.positiveSignals, expected.positives);
      assert.equal(run.invitationReview.counters.cancelRejected, expected.positives);
      assert.equal(run.invitationReview.counters.cancelled, 0);
      assert.equal(run.effort.cohorts.honest.byAction.inspect.effort, expected.inspections);
      assert.equal(run.invitationReview.evaluator[scenario === 'real-cartel' ? 'genuineTargetPositive' : 'falseTargetPositive'], expected.positives);
      states.push(run.state);
    }
    assert.deepEqual(states[0], states[1]);
  }
});

test('common-mode observations retain paid work, verification, availability and model effect gates', () => {
  const positive = { ...fixture, sensitivity: 1, falsePositiveRate: 1 };
  const denied = runExperiment({ ...positive, weights: { inspect: 1000000 } });
  assert.ok(denied.invitationReview.counters.inspectionDenied > 0);
  assert.equal(denied.invitationReview.counters.inspections, 0);
  const verified = runExperiment({ ...positive, social: { verification: true, verificationSensitivity: 0, verificationFalsePositiveRate: 0 } });
  assert.ok(verified.invitationReview.counters.positiveSignals > 0);
  assert.equal(verified.invitationReview.counters.verificationPassed, 0);
  assert.equal(verified.invitationReview.counters.cancelCalls, 0);
  const active = runExperiment({ ...positive, ablations: { disableInvitationVeto: false } });
  const cancelled = active.state.events.filter(event => event.type === 'invitation-cancelled');
  assert.ok(cancelled.length > 0);
  for (const event of cancelled) {
    const invitation = active.state.invitations.find(row => row.id === event.invitation);
    assert.ok(event.at > invitation.createdAt && event.at < invitation.createdAt + 24);
  }
  const blocked = runExperiment(positive);
  const first = cancelled[0].at;
  assert.deepEqual(active.state.events.filter(event => event.at < first), blocked.state.events.filter(event => event.at < first));
  const watchers = active.state.truth.filter(identity => identity.cohort === 'honest').map(identity => identity.id);
  const unavailable = runExperiment({ ...positive, ablations: { disableInvitationVeto: false }, actorProfiles: watchers.map(subject => ({ subject, transactionHours: [] })) });
  assert.ok(unavailable.invitationReview.counters.cancelUnavailable > 0);
  assert.equal(unavailable.invitationReview.counters.cancelled, 0);
});

test('shared signals do not couple inert inspections or future attention into earlier actions', () => {
  for (const stepHours of [4, 6]) {
    const reference = runExperiment({ ...fixture, stepHours });
    const inert = runExperiment({ ...fixture, stepHours, activity: { ...fixture.activity, attackers: { ...quiet, invite: 1, inspect: 1 } } });
    assert.deepEqual(reference.state, inert.state);
    assert.deepEqual(reference.invitationReview, inert.invitationReview);
    const future = runExperiment({ ...fixture, stepHours, actorProfiles: Array.from({ length: 4 }, (_, index) => ({ subject: 'n' + index, attentionHours: Array.from({ length: 48 / stepHours }, (_, tick) => tick * stepHours) })) });
    assert.deepEqual(reference.state.events.filter(event => event.at < 48), future.state.events.filter(event => event.at < 48));
    assert.deepEqual(reference.history.filter(row => row.atHour < 48), future.history.filter(row => row.atHour < 48));
  }
});
