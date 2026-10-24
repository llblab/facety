import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Random } from '../src/random.mjs';
import { reconstructCase, auditSlots, readRetainedBlocks } from '../studies/2026-10-24-guardian-availability/slot-audit.mjs';

const directory = new URL('../studies/2026-10-24-guardian-availability/', import.meta.url);
const base = JSON.parse(readFileSync(new URL('design.json', directory), 'utf8')).base;
function fixture(seed, supportAt, attentionHours, sensitivity = 1, disabled = true) {
  const config = { ...base, seed, days: 2, sensitivity, actorProfiles: [{ subject: 'n0', activity: {}, transactionHours: null, attentionHours }], ablations: { ...base.ablations, disableInvitationVeto: disabled } };
  const row = { seed, context: 'synthetic', arm: disabled ? 'observe-only' : 'veto', state: {
    truth: [{ id: 'n0', cohort: 'honest', genuine: true }, { id: 'n1', cohort: 'attackers', genuine: true }],
    subjects: [{ id: 'n0', identityStatus: 'accepted' }, { id: 'n1', identityStatus: 'accepted' }],
    guarantees: { edges: [{ id: 'edge:0', from: 'n0', to: 'n1' }] },
    invitations: [{ id: 'invitation:1', creator: 'n1', target: 'member:0', createdAt: 8, acceptedAt: 32, status: 'accepted' }],
    events: [{ at: supportAt, type: 'guarantee-proposed', relation: 'g1', guarantor: 'n0', guaranteed: 'n1' }, { at: supportAt, type: 'guarantee-activated', relation: 'g1' }, { at: 8, type: 'invitation-created', invitation: 'invitation:1', creator: 'n1', target: 'member:0' }].sort((a, b) => a.at - b.at),
  } };
  return { row, config };
}
// Independent dense-hour/key oracle: no journal parser or native schedule helper.
function oracle(config, supportAt, createdAt = 8) {
  const inspected = [];
  let pairs = 0;
  const profile = config.actorProfiles[0].attentionHours;
  const placement = new Random(config.seed).fork('daily-quota-keyed-slots-v1');
  for (let hour = 0; hour < config.days * 24; hour++) {
    if (hour % 4 || hour <= createdAt || hour >= createdAt + 24 || hour < supportAt) continue;
    pairs++;
    const day = Math.floor(hour / 24);
    const assigned = placement.fork(JSON.stringify(['slot', day, 'n0', 'invitation-review', ['invitation:1'], 0])).int(6);
    if (assigned !== hour % 24 / 4 || (profile !== null && !profile.includes(hour))) continue;
    inspected.push(hour);
    if (!config.ablations.disableInvitationVeto && config.sensitivity === 1) break;
  }
  return { pairs, inspected };
}

test('slot audit agrees with an independent hourly/key oracle across support, calendar and error partitions', () => {
  const classifications = new Set();
  for (let seed = 0; seed < 12; seed++) for (const supportAt of [0, 16, 36]) for (const hours of [null, [], [0, 24], [4, 28]]) for (const sensitivity of [0, 1]) {
    const { row, config } = fixture('slot-oracle-' + seed, supportAt, hours, sensitivity);
    const before = structuredClone({ row, config });
    const expected = oracle(config, supportAt);
    const result = reconstructCase(row, config);
    assert.equal(result.counters.pairTickOpportunities, expected.pairs);
    assert.deepEqual(result.invitations[0].inspections.map(inspection => inspection.atHour), expected.inspected);
    assert.equal(result.counters.positiveSignals, sensitivity * expected.inspected.length);
    assert.equal(result.counters.cancelRejected, sensitivity * expected.inspected.length);
    assert.equal(result.invitations[0].allocations.filter(allocation => allocation.reason === 'inspected').length, expected.inspected.length);
    assert.deepEqual({ row, config }, before);
    classifications.add(result.invitations[0].classification);
  }
  assert.deepEqual([...classifications].sort(), ['effect-disabled', 'no-calendar-overlap', 'no-linked-quota-in-window', 'no-scripted-reviewer-support', 'observation-misses', 'quota-calendar-disjoint']);
});

test('slot audit truncates successful review at its witness and keeps horizon-pending invitations unclassified as escapes', () => {
  let successes = 0;
  for (let seed = 0; seed < 12; seed++) {
    const { row, config } = fixture('slot-oracle-' + seed, 0, null, 1, false);
    const expected = oracle(config, 0);
    const first = expected.inspected[0];
    if (first !== undefined) {
      successes++;
      Object.assign(row.state.invitations[0], { status: 'cancelled', acceptedAt: null });
      row.state.events.push({ at: first, type: 'invitation-cancelled', invitation: 'invitation:1', guarantor: 'n0' });
      row.state.events.sort((a, b) => a.at - b.at);
    }
    const result = reconstructCase(row, config);
    assert.equal(result.counters.pairTickOpportunities, expected.pairs);
    assert.equal(result.counters.cancelled, Number(first !== undefined));
    assert.equal(result.invitations[0].classification, first === undefined ? 'no-linked-quota-in-window' : 'prevented');
  }
  assert.ok(successes > 0);
  const { row, config } = fixture('slot-pending', 0, []);
  Object.assign(row.state.invitations[0], { createdAt: 44, acceptedAt: null, status: 'open' });
  row.state.events.find(event => event.type === 'invitation-created').at = 44;
  const result = reconstructCase(row, config);
  assert.equal(result.invitations[0].classification, 'pending-at-horizon');
  assert.equal(result.invitations[0].openUnobservedHours, 20);
  assert.equal(result.counters.pairTickOpportunities, 0);
});

test('retained slot audit reconstructs every native counter and preserves its separate artifact bindings', () => {
  const blocks = readRetainedBlocks();
  const before = structuredClone(blocks);
  const report = JSON.parse(readFileSync(new URL('slot-audit.json', directory), 'utf8'));
  assert.deepEqual(auditSlots([...blocks].reverse()), report);
  assert.deepEqual(blocks, before);
  assert.equal(report.cases.length, 24);
  const sparse = report.summary.filter(row => row.arm === 'veto' && row.context !== 'all-ticks');
  assert.deepEqual(sparse.map(row => row.outcomes.accepted), [10, 7]);
  assert.deepEqual(sparse.map(row => row.classifications['quota-calendar-disjoint']), [9, 4]);
  assert.deepEqual(sparse.map(row => row.classifications['observation-misses']), [1, 3]);
  const manifest = JSON.parse(readFileSync(new URL('slot-audit-manifest.json', directory), 'utf8'));
  for (const [file, expected] of Object.entries(manifest.artifacts)) {
    const bytes = readFileSync(new URL(file, directory));
    assert.equal(bytes.length, expected.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
  }
});

test('slot audit rejects unsupported chronology, stale snapshots, wrong cancellation witnesses and altered closed inputs', () => {
  for (const mutate of [
    ({ row }) => { row.state.events[0].at = -1; },
    ({ row }) => { row.state.events.push({ at: 12, type: 'guarantee-ended', relation: 'g1' }); },
    ({ row }) => { row.state.guarantees.edges = []; },
    ({ row }) => { row.state.events[1].relation = 'missing'; },
    ({ row }) => { row.state.subjects[0].identityStatus = 'false'; },
    ({ row }) => { row.state.truth.shift(); },
    ({ config }) => { config.policy = { ...config.policy, invitationFreezeHours: 0 }; },
    ({ config }) => { config.social = { ...config.social, verification: true }; },
    ({ config }) => { config.actorProfiles[0].transactionHours = []; },
    ({ row }) => { row.state.events.push({ at: 12, type: 'invitation-cancelled', invitation: 'invitation:1', guarantor: 'n0' }); },
  ]) {
    const value = fixture('slot-negative', 0, null);
    mutate(value);
    assert.throws(() => reconstructCase(value.row, value.config));
  }
  const blocks = readRetainedBlocks();
  blocks[0].rows[0].metrics.falseXp++;
  assert.throws(() => auditSlots(blocks));
});
