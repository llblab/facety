// V2 invitation-side units: studies/2026-10-29-owned-valences/invitations-contract.md (pre-code contract a7188b8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';
import { replayPathWitnessEvents } from '../src/path-witness-replay.mjs';

const REFERENCE = { source: 'own-mature-right', withdrawal: 'free', pairEndXp: 'withdrawer-only', withdrawDuringHold: 'allow', invitations: 'v2-special-link', eligibility: 'off', councilPaths: null };
function model({ K = 100, reference = {}, policy = {}, genesis = ['a', 'b', 'c'] } = {}) {
  return new FacetyModel({ genesis, policy, valences: { K, genesisPairs: [], reference: { ...REFERENCE, ...reference } } });
}
function rights(facety, ids, count = 1) {
  const out = Object.fromEntries(ids.map(id => [id, []]));
  for (let day = 0; day < count; day++) {
    for (const id of ids) out[id].push(facety.createSelfId(id, facety.registerArtifact(id)));
    facety.advanceTo(facety.now + DAY);
  }
  return out;
}
// a and b hold an established mutual pair, so a has one eligible guarantor (D = 1 for three active subjects).
function network(options) {
  const facety = model(options);
  const own = rights(facety, ['a', 'b', 'c'], 3);
  const pair = [facety.openValence('a', 'b', own.a.shift()), facety.openValence('b', 'a', own.b.shift())];
  return { facety, own, pair };
}
function snapshot(facety) {
  return JSON.stringify({ subjects: facety.subjects(), acts: facety.selfIds(), invitations: facety.invitations(), registrations: facety.preregistrations(),
    relations: facety.guaranteeRelations(), ledger: facety.ledger(), guarantees: facety.guarantees.toJSON(), lineage: facety.lineage.toJSON(), events: facety.events().length });
}
function rejectsUnchanged(facety, fn, pattern) {
  const before = snapshot(facety);
  assert.throws(fn, pattern);
  assert.equal(snapshot(facety), before);
}

test('the refuse binding keeps V1 behavior and pre-registration needs the V2 binding', () => {
  const refuse = model({ reference: { invitations: 'refuse' } });
  assert.throws(() => refuse.preregisterAccount('n'), /does not count invitation-side units/);
  assert.throws(() => new FacetyModel({ valences: { K: 1, genesisPairs: [], reference: { ...REFERENCE, invitations: undefined } } }), TypeError);
});

test('pre-registration mints and burns nothing, is not a subject and holds no slot', () => {
  const { facety } = network();
  const ledger = facety.ledger();
  facety.preregisterAccount('n');
  assert.deepEqual(facety.ledger(), ledger);
  assert.equal(facety.subjects().some(subject => subject.id === 'n'), false);
  assert.equal(facety.ownedSlots('n').used, 0);
  assert.throws(() => facety.preregisterAccount('n'), /duplicate/);
  assert.throws(() => facety.preregisterAccount('a'), /admitted/);
  facety.audit();
});

test('issuance burns one own right, charges the recipient nothing and counts one unit at each endpoint', () => {
  const { facety, own } = network();
  facety.preregisterAccount('n');
  const before = { ledger: facety.ledger(), a: facety.ownedSlots('a').used };
  const id = facety.createInvitation('a', own.a[0], 'n');
  assert.equal(facety.ledger().burned, before.ledger.burned + 1);
  assert.equal(facety.ledger().minted, before.ledger.minted);
  assert.equal(facety.ownedSlots('a').used, before.a + 1);
  assert.deepEqual(facety.ownedSlots('n'), { K: 100, used: 1, open: [], invitations: [id] });
  assert.equal(facety.invitations().find(value => value.id === id).status, 'pending');
  facety.audit();
});

test('a full creator refuses issuance atomically', () => {
  const { facety, own } = network({ K: 2 });
  facety.preregisterAccount('n');
  facety.preregisterAccount('m');
  facety.createInvitation('a', own.a[0], 'n');
  assert.equal(facety.ownedSlots('a').used, 2);
  rejectsUnchanged(facety, () => facety.createInvitation('a', own.a[1], 'm'), /owned-slot ceiling reached/);
  facety.setOwnedSlotCeiling(3);
  facety.createInvitation('a', own.a[1], 'm');
  facety.audit();
});

test('missing guarantors, a D77 hold, duplicate or admitted targets and bad sources refuse atomically', () => {
  const { facety, own } = network();
  facety.preregisterAccount('n');
  rejectsUnchanged(facety, () => facety.createInvitation('c', own.c[0], 'n'), /insufficient eligible guarantors/);
  rejectsUnchanged(facety, () => facety.createInvitation('a', own.b[0], 'n'), /own mature Emitter right/);
  rejectsUnchanged(facety, () => facety.createInvitation('a', own.a[0], 'b'), /pre-registered account/);
  rejectsUnchanged(facety, () => facety.createInvitation('a', own.a[0], 'unknown'), /pre-registered account/);
  facety.createInvitation('a', own.a[0], 'n');
  rejectsUnchanged(facety, () => facety.createInvitation('b', own.b[0], 'n'), /pending invitation/);
  facety.preregisterAccount('m');
  facety.beginDisputeParticipation('case:1', ['a', 'c']);
  rejectsUnchanged(facety, () => facety.createInvitation('a', own.a[1], 'm'), /open-dispute activity restriction/);
  facety.audit();
});

test('acceptance after the freeze admits with one inviter and a special link, keeps both units and does not recheck eligibility', () => {
  const { facety, own, pair } = network();
  facety.preregisterAccount('n');
  const id = facety.createInvitation('a', own.a[0], 'n');
  assert.throws(() => facety.acceptInvitation(id, 'n'), /frozen/);
  facety.withdrawValence('a', pair[0]);
  assert.equal(facety.eligibleGuarantors('a').length, 0, 'creator lost its guarantor after issuance');
  facety.advanceTo(facety.now + DAY);
  facety.acceptInvitation(id, 'n');
  assert.ok(facety.subjects().some(subject => subject.id === 'n'));
  assert.equal(facety.lineage.edge('a', 'n').to, 'n');
  assert.ok(facety.guarantees.edge('a', 'n') && facety.guarantees.edge('n', 'a'));
  assert.equal(facety.ownedSlots('n').used, 1);
  assert.deepEqual(facety.ownedSlots('a').invitations, [id]);
  assert.equal(facety.preregistrations().find(value => value.id === 'n').status, 'admitted');
  assert.throws(() => facety.acceptInvitation(id, 'n'), /invalid invitation acceptance/);
  facety.audit();
});

test('guarantor cancellation during the freeze releases both units without refund and the invitation never reopens', () => {
  const { facety, own } = network();
  facety.preregisterAccount('n');
  const id = facety.createInvitation('a', own.a[0], 'n');
  const burned = facety.ledger().burned;
  facety.cancelInvitation('b', id);
  assert.equal(facety.ledger().burned, burned);
  assert.equal(facety.ownedSlots('n').used, 0);
  assert.deepEqual(facety.ownedSlots('a').invitations, []);
  facety.advanceTo(facety.now + DAY);
  assert.throws(() => facety.acceptInvitation(id, 'n'), /invalid invitation acceptance/);
  assert.throws(() => facety.cancelInvitation('b', id), /not cancellable/);
  const again = facety.createInvitation('a', own.a[1], 'n');
  assert.notEqual(again, id);
  facety.audit();
});

test('ending the special link releases both units and ends guarantor XP flow; the newcomer stays a subject', () => {
  const { facety, own } = network({ policy: { xpFinality: 'maturity' } });
  facety.preregisterAccount('n');
  const id = facety.createInvitation('a', own.a[0], 'n');
  facety.advanceTo(facety.now + DAY);
  facety.acceptInvitation(id, 'n');
  facety.createSelfId('a', facety.registerArtifact('a'));
  const linked = facety.createSelfId('n', facety.registerArtifact('n'));
  assert.deepEqual(facety.selfId(linked).guarantors, ['a']);
  facety.advanceTo(facety.now + DAY);
  const xp = facety.subject('a').xp;
  assert.throws(() => facety.endInvitationLink('c', id), /no active invitation link/);
  facety.endInvitationLink('n', id);
  assert.equal(facety.guarantees.edge('a', 'n'), undefined);
  assert.equal(facety.guarantees.edge('n', 'a'), undefined);
  assert.equal(facety.ownedSlots('n').used, 0);
  assert.deepEqual(facety.ownedSlots('a').invitations, []);
  assert.equal(facety.subject('a').xp, xp, 'withdrawer-only: the inviter keeps its guarantor XP when the newcomer ends the link');
  const unlinked = facety.createSelfId('n', facety.registerArtifact('n'));
  assert.deepEqual(facety.selfId(unlinked).guarantors, []);
  assert.throws(() => facety.endInvitationLink('n', id), /no active invitation link/);
  facety.audit();
});

test('structural replay refuses journals containing pre-registration', () => {
  const { facety } = network();
  facety.preregisterAccount('n');
  assert.throws(() => replayPathWitnessEvents(facety.events(), { atHour: facety.now, maxEvents: 1000, maxIdBytes: 64 }), /valence reference journals/);
});
