import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Random } from '../src/random.mjs';
import { reconstructCase, readRetainedBlocks, auditReviews } from '../studies/2026-10-24-shared-evidence-comparison/review-audit.mjs';

const directory = new URL('../studies/2026-10-24-shared-evidence-comparison/', import.meta.url);
const base = JSON.parse(readFileSync(new URL('design.json', directory))).base;
function fixture({ seed = 'f53-software', supportAt = 0, hours = null, rate = 1, shared = false, genuine = false, createdAt = 8, disabled = true, cancelled = null, two = false, sensitivity = 0.57 } = {}) {
  const config = { ...base, seed, days: 2, scenario: genuine ? 'real-cartel' : 'sybil-cone', sensitivity, falsePositiveRate: sensitivity === 1 ? 1 : 0.31,
    invitationEvidence: shared ? 'shared-target' : 'independent', activity: { ...base.activity, honest: { ...base.activity.honest, review: rate } },
    actorProfiles: [{ subject: 'n0', activity: {}, transactionHours: null, attentionHours: hours }], ablations: { ...base.ablations, disableInvitationVeto: disabled } };
  const horizon = config.days * 24, deadline = createdAt + 24;
  const status = cancelled ? 'cancelled' : deadline <= horizon ? 'accepted' : 'open';
  const subjects = ['n0', 'n1', 'n2'].map(id => ({ id, genesis: true, identityStatus: 'accepted' }));
  const truth = subjects.map(subject => ({ id: subject.id, cohort: subject.id === 'n1' ? 'attackers' : 'honest', genuine: true }));
  const events = subjects.map(subject => ({ type: 'subject-added', at: 0, subject: subject.id, genesis: true }));
  const edges = [];
  for (const [i, from] of (two ? ['n2', 'n0'] : ['n0']).entries()) {
    events.push({ type: 'guarantee-proposed', at: supportAt, relation: 'g' + i, guarantor: from, guaranteed: 'n1' }, { type: 'guarantee-activated', at: supportAt, relation: 'g' + i });
    edges.push({ id: 'edge:' + i, from, to: 'n1' });
  }
  events.push({ type: 'invitation-created', at: createdAt, invitation: 'i1', creator: 'n1', target: 't1' });
  if (status === 'accepted') {
    subjects.push({ id: 't1', genesis: false, identityStatus: 'accepted' });
    truth.push({ id: 't1', cohort: 'attackers', genuine });
    events.push({ type: 'subject-added', at: deadline, subject: 't1', genesis: false }, { type: 'invitation-accepted', at: deadline, invitation: 'i1', subject: 't1' });
  }
  if (cancelled) events.push({ type: 'invitation-cancelled', at: cancelled.at, invitation: 'i1', guarantor: cancelled.guarantor });
  events.sort((a, b) => a.at - b.at);
  const row = { seed, population: genuine ? 'genuine-coalition-descendants' : 'fabricated-descendants', calendar: 'synthetic', evidence: config.invitationEvidence, arm: disabled ? 'observe-only' : 'veto',
    outcome: { censored: false, elapsedHours: horizon }, process: { counters: { inspectionDenied: 0, cancelBudgetDenied: 0, cancelUnavailable: 0, verificationCalls: 0 } },
    state: { subjects, truth, guarantees: { edges }, events, invitations: [{ id: 'i1', creator: 'n1', target: 't1', createdAt, acceptedAt: status === 'accepted' ? deadline : null, status }] },
  };
  return { row, config };
}
// Independent dense-hour oracle groups attended hours by day, then selects the first once.
// It imports neither the native schedule nor the reconstruction's journal/trial logic.
function oracle(config, supportAt, createdAt = 8) {
  const hours = config.actorProfiles[0].attentionHours;
  const groups = new Map();
  let pairs = 0;
  for (let at = 0; at < config.days * 24; at++) {
    if (at % 4 || at <= createdAt || at >= createdAt + 24 || at < supportAt) continue;
    pairs++;
    if (hours !== null && !hours.includes(at)) continue;
    const day = Math.floor(at / 24);
    if (!groups.has(day)) groups.set(day, at);
  }
  const inspections = [];
  for (const [day, at] of groups) {
    const quota = new Random(config.seed).fork('daily-quota-keyed-slots-v1').fork(JSON.stringify(['count', day, 'n0', 'invitation-review', ['i1']])).chance(config.activity.honest.review);
    if (!quota) continue;
    const key = config.invitationEvidence === 'shared-target' ? ['invitation-shared-target-v1', 't1'] : ['t1', ['invitation-review', at, 'n0']];
    const positive = new Random(config.seed).fork('observations').fork(JSON.stringify(key)).chance(config.scenario === 'real-cartel' ? config.falsePositiveRate : config.sensitivity);
    inspections.push({ at, positive });
  }
  return { pairs, trials: groups.size, inspections };
}

test('first-attended decoder matches 576 independent dense-hour class/key/calendar/trial partitions', () => {
  const classes = new Set();
  for (let seed = 0; seed < 4; seed++) for (const supportAt of [0, 16, 36]) for (const hours of [null, [], [12, 28], [8, 32]]) for (const rate of [0, 0.37, 1]) for (const shared of [false, true]) for (const genuine of [false, true]) {
    const { row, config } = fixture({ seed: 'f53-oracle-' + seed, supportAt, hours, rate, shared, genuine });
    const before = structuredClone({ row, config });
    const expected = oracle(config, supportAt);
    const actual = reconstructCase(row, config);
    const invitation = actual.invitations[0];
    assert.equal(actual.counters.pairTickOpportunities, expected.pairs);
    assert.equal(invitation.dailyTrials.length, expected.trials);
    assert.deepEqual(invitation.inspections.map(look => ({ at: look.atHour, positive: look.positive })), expected.inspections);
    assert.equal(actual.counters.positiveSignals, expected.inspections.filter(look => look.positive).length);
    assert.equal(actual.counters.cancelRejected, actual.counters.positiveSignals);
    assert.equal(actual.evaluator[genuine ? 'genuineTargetsInspected' : 'falseTargetsInspected'], expected.inspections.length);
    assert.deepEqual({ row, config }, before);
    classes.add(invitation.classification);
  }
  assert.deepEqual([...classes].sort(), ['all-actual-checks-negative', 'effect-disabled', 'no-calendar-overlap', 'no-positive-daily-trial', 'no-scripted-reviewer-support', 'persistent-negative-checks']);
});

test('activation order determines the stopping witness and successful veto leaves no later-observer duties', () => {
  const { row, config } = fixture({ two: true, sensitivity: 1, disabled: false, cancelled: { at: 12, guarantor: 'n2' } });
  const actual = reconstructCase(row, config);
  assert.equal(actual.counters.cancelled, 1);
  assert.equal(actual.counters.pairTickOpportunities, 1);
  assert.deepEqual(actual.invitations[0].inspections.map(look => look.guarantor), ['n2']);
  assert.equal(actual.invitations[0].opportunities.length, 1);
  const blocked = fixture({ two: true, sensitivity: 1 });
  const result = reconstructCase(blocked.row, blocked.config);
  assert.equal(result.counters.cancelRejected, 4);
  assert.deepEqual(result.invitations[0].inspections.map(look => look.guarantor), ['n2', 'n0', 'n2', 'n0']);
  const wrong = fixture({ two: true, sensitivity: 1, disabled: false, cancelled: { at: 12, guarantor: 'n0' } });
  assert.throws(() => reconstructCase(wrong.row, wrong.config), /witness/);
});

test('daily failures consume one trial, late support is not backdated and pending windows do not get horizon rounds', () => {
  const zero = fixture({ rate: 0 });
  const result = reconstructCase(zero.row, zero.config);
  assert.equal(result.invitations[0].dailyTrials.length, 2);
  assert.equal(result.counters.reviewSlots, 0);
  assert.equal(result.invitations[0].opportunities.filter(point => point.reason === 'daily-trial-zero').length, 2);
  const late = fixture({ supportAt: 16, hours: [12, 28] });
  assert.deepEqual(reconstructCase(late.row, late.config).invitations[0].inspections.map(look => look.atHour), [28]);
  const future = fixture({ supportAt: 36 });
  assert.equal(reconstructCase(future.row, future.config).invitations[0].classification, 'no-scripted-reviewer-support');
  const pending = fixture({ createdAt: 44 });
  const invitation = reconstructCase(pending.row, pending.config).invitations[0];
  assert.equal(invitation.classification, 'pending-at-horizon');
  assert.equal(invitation.opportunities.length, 0);
  assert.equal(invitation.openUnobservedHours, 20);
  const first = fixture(), second = fixture();
  second.row.state.events = second.row.state.events.filter(event => event.type.startsWith('invitation-') || (event.type === 'subject-added' && event.subject === 't1'));
  for (const event of second.row.state.events) { if (event.invitation) event.invitation = 'i2'; if (event.target) event.target = 't2'; if (event.subject === 't1') event.subject = 't2'; }
  first.row.state.events.push(...second.row.state.events);
  first.row.state.events.sort((a, b) => a.at - b.at);
  first.row.state.subjects.push({ id: 't2', genesis: false, identityStatus: 'accepted' });
  first.row.state.truth.push({ id: 't2', cohort: 'attackers', genuine: false });
  first.row.state.invitations.push({ ...first.row.state.invitations[0], id: 'i2', target: 't2' });
  const pair = reconstructCase(first.row, first.config);
  assert.equal(pair.counters.inspections, 4);
  assert.deepEqual(pair.invitations.map(item => item.dailyTrials.length), [2, 2]);
});

test('decoder rejects unsupported history, snapshot drift, missing roles, scarcity and wrong policy/calendar contracts', () => {
  for (const mutate of [
    ({ row }) => { row.state.events[0].at = -1; },
    ({ row }) => { row.state.events.push({ type: 'guarantee-ended', at: 48, relation: 'g0' }); },
    ({ row }) => { row.state.guarantees.edges = []; },
    ({ row }) => { row.state.guarantees.edges[0].id = 'stale'; },
    ({ row }) => { row.state.truth.shift(); },
    ({ row }) => { row.state.subjects[0].identityStatus = 'invalidated'; },
    ({ row }) => { row.state.events.find(event => event.type === 'guarantee-activated').relation = 'missing'; },
    ({ row }) => { row.state.events = row.state.events.filter(event => event.type !== 'subject-added' || event.subject !== 't1'); },
    ({ row }) => { row.state.events.push({ type: 'invitation-cancelled', at: 48, invitation: 'orphan', guarantor: 'n0' }); },
    ({ row }) => { row.process.counters.inspectionDenied = 1; },
    ({ row }) => { row.outcome.censored = true; },
    ({ config }) => { config.invitationReviewTiming = 'daily-slot'; },
    ({ config }) => { config.social = { ...config.social, verification: true }; },
    ({ config }) => { config.actorProfiles[0].transactionHours = []; },
    ({ config }) => { config.actorProfiles[0].activity.review = 0; },
    ({ config }) => { config.actorProfiles[0].attentionHours = [48]; },
  ]) {
    const value = fixture(); mutate(value);
    assert.throws(() => reconstructCase(value.row, value.config));
  }
  const phase = fixture({ supportAt: 8 });
  const activation = phase.row.state.events.find(event => event.type === 'guarantee-activated');
  phase.row.state.events = phase.row.state.events.filter(event => event !== activation);
  phase.row.state.events.splice(phase.row.state.events.findIndex(event => event.type === 'invitation-created') + 1, 0, activation);
  assert.throws(() => reconstructCase(phase.row, phase.config), /order chronology/);
});

test('sealed F52 counters/evaluators/work and separate review artifacts reproduce without model calls', () => {
  const blocks = readRetainedBlocks();
  const before = structuredClone(blocks);
  const expected = JSON.parse(readFileSync(new URL('review-audit.json', directory)));
  assert.deepEqual(auditReviews([...blocks].reverse()), expected);
  assert.deepEqual(blocks, before);
  assert.equal(expected.cases.length, 64);
  const shared = expected.summary.filter(row => row.population === 'fabricated-descendants' && row.evidence === 'shared-target' && row.arm === 'veto');
  assert.deepEqual(shared.map(row => row.classifications['persistent-negative-checks']), [3, 3]);
  assert.deepEqual(shared.map(row => row.negatives), [54, 22]);
  assert.deepEqual(shared.map(row => row.repeatedSharedNegativeLooks), [51, 19]);
  const manifest = JSON.parse(readFileSync(new URL('review-audit-manifest.json', directory)));
  for (const [file, binding] of Object.entries(manifest.artifacts)) {
    const bytes = readFileSync(new URL('../' + file, import.meta.url));
    assert.equal(bytes.length, binding.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), binding.sha256);
  }
  const altered = structuredClone(blocks); altered[0].rows[0].process.attention = 'changed';
  assert.throws(() => auditReviews(altered), /sealed retained blocks/);
});
