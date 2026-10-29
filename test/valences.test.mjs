// V1 owned-valence reference: studies/2026-10-29-owned-valences/README.md (pre-code contract b6e01ae).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY, ProtocolRejection } from '../src/model.mjs';

const REFERENCE = { source: 'own-mature-right', withdrawal: 'free', pairEndXp: 'withdrawer-only', withdrawDuringHold: 'allow', invitations: 'refuse' };
function model({ K = 100, reference = {}, policy = {}, genesis = ['a', 'b', 'c', 'd'] } = {}) {
  return new FacetyModel({ genesis, policy, valences: { K, reference: { ...REFERENCE, ...reference } } });
}
// Give every listed subject `count` mature own rights: one Self-ID per day, then wait for maturity.
function rights(facety, ids, count = 1) {
  const out = Object.fromEntries(ids.map(id => [id, []]));
  for (let day = 0; day < count; day++) {
    for (const id of ids) out[id].push(facety.createSelfId(id, facety.registerArtifact(id)));
    facety.advanceTo(facety.now + DAY);
  }
  return out;
}
function snapshot(facety) {
  return JSON.stringify({ subjects: facety.subjects(), acts: facety.selfIds(), valences: facety.valenceRecords(), relations: facety.guaranteeRelations(),
    ledger: facety.ledger(), guarantees: facety.guarantees.toJSON(), events: facety.events().length });
}
function rejectsUnchanged(facety, fn, pattern) {
  const before = snapshot(facety);
  assert.throws(fn, pattern);
  assert.equal(snapshot(facety), before);
}

test('default model has no valence reference and validation rejects incomplete or combined bindings', () => {
  const legacy = new FacetyModel({ genesis: ['a'] });
  assert.equal(legacy.valences, null);
  assert.equal(Object.keys(legacy).includes('valences'), false);
  assert.throws(() => legacy.openValence('a', 'a', 'x'), /valence reference is disabled/);
  assert.throws(() => new FacetyModel({ valences: { K: 100 } }), TypeError);
  assert.throws(() => new FacetyModel({ valences: { K: 0, reference: REFERENCE } }), RangeError);
  for (const [key, value] of [['source', 'liquid'], ['withdrawal', 'burn'], ['pairEndXp', 'none'], ['withdrawDuringHold', undefined], ['invitations', undefined], ['invitations', 'legacy']])
    assert.throws(() => new FacetyModel({ valences: { K: 1, reference: { ...REFERENCE, [key]: value } } }), TypeError);
  assert.throws(() => new FacetyModel({ valences: { K: 1, reference: { ...REFERENCE, extra: 1 } } }), TypeError);
  assert.throws(() => new FacetyModel({ valences: { K: 1, reference: REFERENCE }, vouching: { K: 1, T: 1, V: 1, B: 0, reference: {
    eligibility: 'accepted-reference', clockOrigin: 'commitment', funding: 'collector-liquid', exitSlot: 'retain-until-V', bondRelease: 'supplied-clearance' } } }), TypeError);
});

test('an unmatched valence burns exactly one own mature right and creates no guarantee or XP', () => {
  const facety = model();
  const own = rights(facety, ['a', 'b']);
  const before = facety.ledger();
  const id = facety.openValence('a', 'b', own.a[0]);
  const after = facety.ledger();
  assert.equal(after.burned, before.burned + 1);
  assert.equal(after.emitterVault, before.emitterVault - 1);
  assert.equal(facety.selfId(own.a[0]).disposition, 'valence-burn');
  assert.equal(facety.guarantees.edge('a', 'b'), undefined);
  assert.deepEqual(facety.ownedSlots('a'), { K: 100, used: 1, open: [id], invitations: [] });
  assert.equal(facety.ownedSlots('b').used, 0);
  assert.equal(facety.guaranteeRelations().length, 0);
  facety.audit();
});

test('invalid openings reject atomically', () => {
  const facety = model({ genesis: ['a', 'b', 'c'] });
  const own = rights(facety, ['a', 'b']);
  const fresh = facety.createSelfId('a', facety.registerArtifact('a'));
  rejectsUnchanged(facety, () => facety.openValence('a', 'a', own.a[0]), /distinct counterpart/);
  rejectsUnchanged(facety, () => facety.openValence('a', 'zz', own.a[0]), /unknown subject/);
  rejectsUnchanged(facety, () => facety.openValence('a', 'b', own.b[0]), /own mature Emitter right/);
  rejectsUnchanged(facety, () => facety.openValence('a', 'b', fresh), /own mature Emitter right/);
  facety.freezeSelfId(own.a[0], 'case:x');
  rejectsUnchanged(facety, () => facety.openValence('a', 'b', own.a[0]), /spent or disputed/);
  facety.unfreezeSelfId(own.a[0], 'case:x');
  facety.openValence('a', 'b', own.a[0]);
  rejectsUnchanged(facety, () => facety.openValence('a', 'b', own.a[0]), /already holds an open valence/);
  facety.beginDisputeParticipation('case:1', ['b', 'c']);
  rejectsUnchanged(facety, () => facety.openValence('b', 'a', own.b[0]), /open-dispute activity restriction/);
  facety.audit();
});

test('matching valences establish a mutual guarantee; guarantor XP flows only after establishment', () => {
  const facety = model({ policy: { xpFinality: 'maturity' } });
  const own = rights(facety, ['a', 'b'], 2);
  facety.openValence('a', 'b', own.a[0]);
  const unmatchedAct = facety.createSelfId('b', facety.registerArtifact('b'));
  facety.advanceTo(facety.now + DAY);
  assert.equal(facety.selfId(unmatchedAct).guarantors.length, 0, 'no guarantor role before mutual establishment (D82)');
  const matched = facety.openValence('b', 'a', own.b[0]);
  assert.ok(facety.guarantees.edge('a', 'b') && facety.guarantees.edge('b', 'a'));
  assert.equal(facety.valenceRecords().find(record => record.id === matched).pairRelations.length, 2);
  const xpBefore = facety.subject('a').xp;
  const act = facety.createSelfId('b', facety.registerArtifact('b'));
  assert.deepEqual(facety.selfId(act).guarantors, ['a']);
  facety.advanceTo(facety.now + DAY);
  assert.equal(facety.subject('a').xp, xpBefore + 1);
  assert.equal(facety.ledger().burned, 2, 'each side paid exactly one burn');
  facety.audit();
});

test('the ceiling refuses new owned units only and changes without forced cuts', () => {
  const facety = model({ K: 1 });
  const own = rights(facety, ['a', 'b', 'c'], 2);
  facety.openValence('a', 'b', own.a[0]);
  rejectsUnchanged(facety, () => facety.openValence('a', 'c', own.a[1]), /ceiling reached/);
  facety.openValence('c', 'b', own.c[0]);
  // b is at K=1 after opening toward c; matching a's retained valence would be a new owned unit for b.
  facety.openValence('b', 'c', own.b[0]);
  rejectsUnchanged(facety, () => facety.openValence('b', 'a', own.b[1]), /ceiling reached/);
  // a is at K=1 but its retained valence can still be matched by a subject with capacity.
  facety.setOwnedSlotCeiling(2);
  facety.openValence('b', 'a', own.b[1]);
  assert.ok(facety.guarantees.edge('a', 'b'));
  assert.equal(facety.ownedSlots('a').used, 1);
  facety.setOwnedSlotCeiling(1);
  assert.equal(facety.ownedSlots('b').used, 2, 'lowering K keeps existing valences');
  assert.ok(facety.guarantees.edge('b', 'c') && facety.guarantees.edge('b', 'a'));
  assert.throws(() => facety.setOwnedSlotCeiling(0), RangeError);
  facety.audit();
});

test('K boundaries at 100/101 count every open valence regardless of matching', () => {
  const genesis = ['hub', ...Array.from({ length: 101 }, (_, index) => 'p' + index)];
  const facety = model({ K: 100, genesis });
  const own = rights(facety, ['hub'], 101);
  for (let index = 0; index < 100; index++) facety.openValence('hub', 'p' + index, own.hub[index]);
  assert.equal(facety.ownedSlots('hub').used, 100);
  assert.throws(() => facety.openValence('hub', 'p100', own.hub[100]), /ceiling reached/);
  facety.setOwnedSlotCeiling(101);
  facety.openValence('hub', 'p100', own.hub[100]);
  assert.equal(facety.ownedSlots('hub').used, 101);
  facety.audit();
});

for (const pairEndXp of ['withdrawer-only', 'both-relations']) test('withdrawal releases one unit, keeps the opposite open and ends the pair (' + pairEndXp + ')', () => {
  const facety = model({ reference: { pairEndXp }, policy: { xpFinality: 'maturity', linkBreakXp: 'revoke' } });
  const own = rights(facety, ['a', 'b'], 3);
  const va = facety.openValence('a', 'b', own.a[0]);
  const vb = facety.openValence('b', 'a', own.b[0]);
  facety.createSelfId('a', facety.registerArtifact('a'));
  facety.createSelfId('b', facety.registerArtifact('b'));
  facety.advanceTo(facety.now + DAY);
  const xp = { a: facety.subject('a').xp, b: facety.subject('b').xp };
  const burned = facety.ledger().burned;
  facety.withdrawValence('a', va);
  assert.equal(facety.ledger().burned, burned, 'free withdrawal burns nothing and refunds nothing');
  assert.equal(facety.guarantees.edge('a', 'b'), undefined);
  assert.equal(facety.guarantees.edge('b', 'a'), undefined);
  assert.equal(facety.ownedSlots('a').used, 0);
  assert.deepEqual(facety.ownedSlots('b').open, [vb]);
  assert.equal(facety.subject('a').xp, xp.a - 1, 'withdrawer loses guarantor XP under linkBreakXp revoke');
  assert.equal(facety.subject('b').xp, pairEndXp === 'both-relations' ? xp.b - 1 : xp.b);
  assert.throws(() => facety.withdrawValence('a', va), /no open own valence/);
  assert.throws(() => facety.withdrawValence('a', vb), /no open own valence/);
  const reopen = facety.openValence('a', 'b', own.a[1]);
  assert.notEqual(reopen, va);
  assert.ok(facety.guarantees.edge('a', 'b') && facety.guarantees.edge('b', 'a'));
  assert.equal(facety.ledger().burned, burned + 1, 're-establishment charges only the reopening side');
  facety.audit();
});

test('withdrawal price and dispute-hold bindings apply exactly as configured', () => {
  const priced = model({ reference: { withdrawal: 'burn-one-liquid', withdrawDuringHold: 'refuse' } });
  const own = rights(priced, ['a', 'b'], 2);
  const va = priced.openValence('a', 'b', own.a[0]);
  rejectsUnchanged(priced, () => priced.withdrawValence('a', va), /insufficient valence withdrawal burn/);
  priced.convertToCollector('a', own.a[1]);
  priced.beginDisputeParticipation('case:1', ['a', 'b']);
  rejectsUnchanged(priced, () => priced.withdrawValence('a', va), /open-dispute activity restriction/);
  priced.endDisputeParticipation('case:1');
  const burned = priced.ledger().burned;
  priced.withdrawValence('a', va);
  assert.equal(priced.ledger().burned, burned + 1);
  assert.equal(priced.subject('a').liquidFacy, 0);
  priced.audit();
  const allowed = model();
  const ownAllowed = rights(allowed, ['a', 'b']);
  const vb = allowed.openValence('a', 'b', ownAllowed.a[0]);
  allowed.beginDisputeParticipation('case:2', ['a', 'b']);
  allowed.withdrawValence('a', vb);
  allowed.audit();
});

test('a D77-held retained side blocks establishment conservatively', () => {
  const facety = model({ genesis: ['a', 'b', 'c'] });
  const own = rights(facety, ['a', 'b']);
  facety.openValence('a', 'b', own.a[0]);
  facety.beginDisputeParticipation('case:1', ['a', 'c']);
  rejectsUnchanged(facety, () => facety.openValence('b', 'a', own.b[0]), /open-dispute activity restriction/);
  facety.endDisputeParticipation('case:1');
  facety.openValence('b', 'a', own.b[0]);
  assert.ok(facety.guarantees.edge('a', 'b'));
  facety.audit();
});

test('legacy guarantee operations and invitations are refused in valence mode', () => {
  const facety = model();
  const own = rights(facety, ['a', 'b']);
  assert.throws(() => facety.proposeGuarantee('a', 'b'), ProtocolRejection);
  facety.openValence('a', 'b', own.a[0]);
  facety.openValence('b', 'a', own.b[0]);
  const relation = facety.guaranteeRelations()[0];
  assert.throws(() => facety.endGuarantee('a', relation.id), /withdrawValence/);
  assert.throws(() => facety.confirmGuarantee('b', relation.id), ProtocolRejection);
  const right = facety.createSelfId('a', facety.registerArtifact('a'));
  facety.advanceTo(facety.now + DAY);
  assert.throws(() => facety.createInvitation('a', right, 'new'), /invitation-side units/);
  facety.audit();
});

test('structural path-witness replay refuses valence journals explicitly instead of reconstructing a partial graph', async () => {
  const { replayPathWitnessEvents } = await import('../src/path-witness-replay.mjs');
  const facety = model();
  const own = rights(facety, ['a', 'b']);
  facety.openValence('a', 'b', own.a[0]);
  facety.openValence('b', 'a', own.b[0]);
  assert.throws(() => replayPathWitnessEvents(facety.events(), { atHour: facety.now, maxEvents: 1000, maxIdBytes: 64 }), /valence reference journals are not supported/);
});
