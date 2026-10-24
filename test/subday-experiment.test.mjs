import test from 'node:test';
import assert from 'node:assert/strict';
import { runExperiment, experimentConfig, RANDOMNESS_POLICY } from '../src/experiment.mjs';
import { createActivitySchedule, SUBDAY_RANDOMNESS } from '../src/activity-schedule.mjs';
import { registerHypothesis, verifyRegistration, confirmHypothesis, runStatistic } from '../src/evidence.mjs';
import { digestOf } from '../src/provenance.mjs';
import { metricSeries, runLandscape } from '../src/discovery.mjs';
import { compareExperiments, analyzePairs } from '../src/controls.mjs';

const quiet = { selfId: 1, invite: 0, guarantee: 0, inspect: 0, convert: 0 };
const base = { seed: 'd43-integrate', stepHours: 4, initialSize: 4, initialTopology: 'clique', attackerShare: 0, days: 3, includeState: true, falsePositiveRate: 0, activity: { honest: quiet } };

test('daily quotas are allocated once across 4/6-hour ticks, including multiple actions per tick', () => {
  for (const rate of [0, 0.2, 1, 2.5, 10, 100]) {
    const totals = [];
    for (const stepHours of [4, 6]) {
      const plan = createActivitySchedule({ seed: 'quota', stepHours, actorProfiles: [] });
      const days = [];
      for (let day = 0; day < 3; day++) {
        const marks = Array.from({ length: 24 / stepHours }, (_, tick) => plan.slots('n0', day * 24 + tick * stepHours, 'test-count', rate));
        const slots = marks.flat();
        assert.equal(new Set(slots).size, slots.length);
        assert.ok(slots.length === Math.floor(rate) || slots.length === Math.ceil(rate));
        if (Number.isInteger(rate)) assert.equal(slots.length, rate);
        if (rate === 100) assert.ok(marks.some(values => values.length > 1));
        days.push(slots.length);
      }
      totals.push(days);
    }
    assert.deepEqual(totals[0], totals[1]);
  }
});

test('sub-day runs have real daily endpoints and never issue actor actions at the horizon', () => {
  for (const stepHours of [4, 6]) {
    const run = runExperiment({ ...base, stepHours });
    assert.equal(run.outcome.completedDays, 3);
    assert.deepEqual(run.history.filter(row => row.stage === 'day-end').map(row => row.atHour), [24, 48, 72]);
    assert.equal(run.history.filter(row => row.stage === 'tick-end').length, 72 / stepHours);
    assert.ok(run.history.filter(row => row.stage === 'tick-end').every(row => row.atHour < 72));
    assert.equal(run.state.selfIds.length, 12);
    for (const subject of run.state.subjects) {
      const hours = run.state.selfIds.filter(act => act.subject === subject.id).map(act => act.recordedAt);
      for (let i = 1; i < hours.length; i++) assert.ok(hours[i] - hours[i - 1] >= 24);
    }
    assert.ok(!run.state.events.some(event => event.type === 'self-id-created' && event.at === 72));
    assert.deepEqual(run.randomness, SUBDAY_RANDOMNESS);
    assert.deepEqual(run, runExperiment({ ...base, stepHours }));
  }
  const zero = runExperiment({ ...base, days: 0 });
  assert.deepEqual(zero.history.map(row => row.stage), ['initial', 'horizon']);
  assert.equal(zero.state.selfIds.length, 0);
});

test('explicit subject profiles separate transaction inactivity from paid attention', () => {
  const run = runExperiment({ ...base, actorProfiles: [{ subject: 'n0', transactionHours: [], activity: { inspect: 10 } }] });
  assert.equal(run.state.selfIds.filter(act => act.subject === 'n0').length, 0);
  assert.equal(run.state.selfIds.filter(act => act.subject === 'n1').length, 3);
  assert.ok(run.observations.inspections > 0);
  assert.ok(run.effort.cohorts.honest.byAction.inspect.attempts > 0);
  const plan = createActivitySchedule(experimentConfig({ ...base, actorProfiles: [{ subject: 'n0', transactionHours: [], attentionHours: [4], activity: { inspect: 10 } }] }));
  assert.equal(plan.available('n0', 4, 'attention'), true);
  assert.equal(plan.available('n0', 4, 'transaction'), false);
  assert.equal(plan.available('n0', 8, 'attention'), false);
  assert.deepEqual(plan.slots('n0', 8, 'inspection-count', 10, 0, 'attention'), []);
});

const review = { seed: 'd43-review', days: 5, initialSize: 4, initialTopology: 'clique', attackerShare: 0.5, sensitivity: 1, falsePositiveRate: 0, includeState: true, activity: { honest: { ...quiet, review: 1 }, attackers: { ...quiet, invite: 1 } } };
test('scheduled guarantors actually cancel invitations strictly inside the one-day freeze', () => {
  const current = runExperiment({ ...review, stepHours: 4 });
  const legacy = runExperiment({ ...review, stepHours: 24 });
  assert.equal(legacy.system.trust.invitationsCancelled, 0);
  const cancelled = current.state.events.filter(event => event.type === 'invitation-cancelled');
  assert.ok(cancelled.length > 0);
  for (const event of cancelled) {
    const invitation = current.state.invitations.find(row => row.id === event.invitation);
    assert.ok(event.at > invitation.createdAt && event.at < invitation.createdAt + 24);
  }
});

test('known off-grid invitation deadlines settle at their exact hour without an actor round', () => {
  const run = runExperiment({ ...review, stepHours: 4, policy: { invitationFreezeHours: 5 }, activity: { honest: quiet, attackers: { ...quiet, invite: 1 } } });
  const accepted = run.state.events.filter(event => event.type === 'invitation-accepted');
  assert.ok(accepted.length > 0);
  for (const event of accepted) {
    const invitation = run.state.invitations.find(row => row.id === event.invitation);
    assert.equal(event.at, invitation.createdAt + 5);
    assert.notEqual(event.at % 4, 0);
    assert.ok(!run.state.events.some(other => other.at === event.at && other.type === 'self-id-created'));
  }
});

test('sub-day work never refills whole-run budgets and safety caps preserve incomplete exposure', () => {
  const run = runExperiment({ ...base, budgets: { honest: 30 } });
  assert.ok(run.effort.cohorts.honest.effort <= 30);
  const zero = runExperiment({ ...base, budgets: { honest: 0, attackers: 0 } });
  assert.equal(zero.state.selfIds.length, 0);
  assert.equal(zero.effort.cohorts.honest.effort, 0);
  const truncated = runExperiment({ ...base, initialTopology: 'none', maxActions: 2 });
  assert.equal(truncated.outcome.censored, true);
  assert.ok(truncated.outcome.completedDays < truncated.config.days);
  assert.ok(truncated.history.filter(row => row.stage === 'day-end').length < truncated.config.days);
});

test('inert inspections and future activity changes do not consume unrelated sub-day decisions', () => {
  const original = runExperiment(base);
  const inspected = runExperiment({ ...base, activity: { honest: { ...quiet, inspect: 5 } } });
  assert.deepEqual(inspected.state.events, original.state.events);
  const paused = runExperiment({ ...base, perturbations: [{ startDay: 2, endDay: 3, activity: { honest: { selfId: 0 } } }] });
  assert.deepEqual(paused.state.events.filter(row => row.at < 48), original.state.events.filter(row => row.at < 48));
});

test('sub-day analysis uses declared day-close timestamps and keeps missing endpoints missing', () => {
  const run = runExperiment(base);
  const options = { days: 3, offsetHours: run.outcome.dailySampleOffsetHours };
  assert.deepEqual(metricSeries(run.history, 'subjects', options).map(row => row.atHour), [24, 48, 72]);
  const missing = run.history.filter(row => row.stage !== 'day-end' || row.atHour !== 72);
  assert.equal(metricSeries(missing, 'subjects', options).at(-1).value, null);
  assert.deepEqual(metricSeries([], 'subjects', options).map(row => row.atHour), [24, 48, 72]);
  const input = { ...base, includeState: false };
  const paired = compareExperiments(input, { trials: 1, parameters: {}, metrics: ['subjects'] });
  assert.equal(paired.limits.plannedSamples, 46);
  assert.deepEqual(paired.analysis.trajectories[0].metrics.subjects.series.map(row => row.atHour), [24, 48, 72]);
  assert.throws(() => compareExperiments(input, { trials: 1, maxRecordedSamples: 45 }), /maxRecordedSamples/);
  const landscape = runLandscape(input, { axes: { stepHours: [4, 6] }, trials: 1, diagnostics: { metrics: ['subjects'] } });
  assert.ok(landscape.cells.every(cell => cell.samples[0].outcome.completedDays === 3));
  const mixed = runLandscape(input, { axes: { stepHours: [4, 24] }, trials: 1, diagnostics: { metrics: ['subjects'] } });
  assert.equal(mixed.randomness.policies.length, 2);
  assert.equal(runStatistic(run, { metric: 'subjects', summary: 'endpoint', window: null, subtract: null }), run.state.subjects.length);
  const altered = structuredClone(paired.pairs);
  altered[0].treatment.randomness = { ...altered[0].treatment.randomness, placement: 'wrong' };
  assert.throws(() => analyzePairs(altered, paired.analysis.settings), /randomness policies/);
});

test('sub-day controls reject malformed or ambiguous profiles and leave the legacy facade intact', () => {
  assert.equal(experimentConfig().stepHours, 24);
  for (const stepHours of [1, 12, '4', null]) assert.throws(() => experimentConfig({ stepHours }), /stepHours/);
  for (const actorProfiles of [null, {}, [{ subject: '' }], [{ subject: 'n0' }, { subject: 'n0' }], [{ subject: 'n0', activity: { selfId: 2 } }], [{ subject: 'n0', attentionHours: [1] }], [{ subject: 'n0', transactionHours: [72] }], [{ subject: 'n0', unknown: true }]]) {
    assert.throws(() => experimentConfig({ ...base, actorProfiles }));
  }
  assert.throws(() => experimentConfig({ actorProfiles: [{ subject: 'n0' }] }), /sub-day/);
});

test('registrations bind single and mixed cadence randomness without changing legacy manifests', async () => {
  const spec = { id: 'd43-software-contract', statement: 'Synthetic registration transport test, not research evidence', kind: 'association', base: { ...base, days: 0, includeState: false }, statistic: { metric: 'outcome.success' }, arms: { a: {}, b: { 'ablations.withholdGuarantorXp': true } }, claims: [{ id: 'p', role: 'presence', contrast: { a: 1, b: -1 }, direction: 'greater' }], replicas: 5, exploration: { seeds: [] } };
  const registered = registerHypothesis(spec);
  assert.deepEqual(registered.randomness, SUBDAY_RANDOMNESS);
  assert.equal(verifyRegistration(registered).implementationMatched, true);
  const result = await confirmHypothesis(registered);
  assert.deepEqual(result.randomness, registered.randomness);
  const legacy = registerHypothesis({ ...spec, base: { days: 0 } });
  assert.deepEqual(legacy.randomness, RANDOMNESS_POLICY);
  const mixed = registerHypothesis({ ...spec, contexts: [{ id: 'daily', parameters: { stepHours: 24 } }, { id: 'subday', parameters: { stepHours: 4 } }] });
  assert.equal(mixed.randomness.policies.length, 2);
  assert.equal(verifyRegistration(mixed).implementationMatched, true);
  const forged = structuredClone(mixed);
  forged.randomness = RANDOMNESS_POLICY;
  forged.hash = digestOf({ schema: forged.schema, spec: forged.spec, implementation: forged.implementation.digest, randomness: forged.randomness, analysisPolicy: forged.analysisPolicy });
  forged.confirmationSeed = 'confirm:' + forged.hash;
  assert.throws(() => verifyRegistration(forged), /randomness policy/);
});
