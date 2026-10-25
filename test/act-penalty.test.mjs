import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';

function link(model, from) {
  const relation = model.proposeGuarantee(from, 'a');
  model.confirmGuarantee('a', relation);
  return relation;
}
function setup(convert = true) {
  const model = new FacetyModel({ genesis: ['a', 'b', 'c'], policy: { xpFinality: 'maturity', guarantorEligibility: 'accepted' } });
  const initial = ['a', 'b', 'c'].map(id => [id, model.createSelfId(id, model.registerArtifact(id))]);
  model.advanceTo(DAY);
  for (const [id, act] of initial) model.convertToCollector(id, act);
  const relation = link(model, 'b');
  const act = model.createSelfId('a', model.registerArtifact('a'));
  model.advanceTo(2 * DAY);
  if (convert) model.convertToCollector('a', act);
  return { model, relation, act };
}
function state(model) {
  return { subjects: model.subjects(), selfIds: model.selfIds(), invitations: model.invitations(), penalties: model.actPenalties(), events: model.events(), ledger: model.audit() };
}

test('Self-ID penalty uses its creation snapshot after exit and halves only the author, with explicit top1/deeperN amounts', () => {
  for (const fine of [1, 3]) {
    const { model, relation, act } = setup();
    model.endGuarantee('b', relation);
    link(model, 'c');
    const before = model.subjects();
    const result = model.applySelfIdPenalty(act, { caseId: 'self-id-case', fine });
    assert.deepEqual(result.parties, ['a', 'b']);
    assert.deepEqual(result.penalties.map(row => row.halveXp), [true, false]);
    assert.equal(result.fine, fine); // Supplied sanction basis, not inferred chain depth.
    assert.equal(model.subject('a').xp, Math.floor(before[0].xp / 2));
    assert.equal(model.subject('b').xp, before[1].xp);
    assert.equal(model.subject('c').xp, before[2].xp);
    assert.equal(result.penalties[0].collected, Math.min(2, fine));
    assert.equal(result.penalties[1].collected, 0);
    assert.equal(result.penalties[1].debtAdded, fine);
    assert.ok(model.subjects().every(subject => subject.identityStatus === 'accepted'));
    assert.equal(model.selfId(act).xpCredit.revokedAt, null); // This primitive does not choose the separate invalidation/remedy contract.
    model.audit();
  }
});

test('invitation penalty uses its own creation snapshot, not the source Self-ID or later live graph, and halves all recorded parties', () => {
  const { model, relation, act } = setup(false);
  model.endGuarantee('b', relation);
  const replacement = link(model, 'c');
  const invitation = model.createInvitation('a', act, 'new');
  assert.deepEqual(model.selfId(act).guarantors, ['b']);
  assert.deepEqual(model.invitations()[0].guarantors, ['c']);
  model.endGuarantee('c', replacement);
  link(model, 'b');
  const before = model.subjects();
  // Zero is an explicit software input to isolate the selected XP roles; no invitation monetary rule is chosen.
  const result = model.applyInvitationPenalty(invitation, { caseId: 'invite-case', fine: 0 });
  assert.deepEqual(result.parties, ['a', 'c']);
  assert.deepEqual(result.penalties.map(row => row.halveXp), [true, true]);
  assert.equal(model.subject('a').xp, Math.floor(before[0].xp / 2));
  assert.equal(model.subject('b').xp, before[1].xp);
  assert.equal(model.subject('c').xp, Math.floor(before[2].xp / 2));
  assert.throws(() => model.invitations()[0].guarantors.push('b'), TypeError);
  assert.throws(() => result.parties.push('b'), TypeError);
  assert.throws(() => { result.penalties[0].collected = 99; }, TypeError);
  model.audit();
});

test('same supplied case cannot repeat a penalty and invalid inputs leave all state unchanged', () => {
  const { model, act } = setup();
  for (const options of [{ fine: 1 }, { caseId: '', fine: 1 }, { caseId: 'x', fine: -1 }, { caseId: 'x', fine: 0 }, { caseId: 'x', fine: 1.5 }]) {
    const before = state(model);
    assert.throws(() => model.applySelfIdPenalty(act, options));
    assert.deepEqual(state(model), before);
  }
  model.applySelfIdPenalty(act, { caseId: 'case', fine: 1 });
  const applied = state(model);
  assert.throws(() => model.applySelfIdPenalty(act, { caseId: 'case', fine: 1 }), /already applied/);
  assert.deepEqual(state(model), applied);
  assert.throws(() => model.applyInvitationPenalty('absent', { caseId: 'other', fine: 1 }), /unknown invitation/);
  assert.deepEqual(state(model), applied);
});

test('whole-snapshot sanction preflight rejects aggregate debt overflow before any party pays or loses XP', () => {
  const { model, relation, act } = setup();
  model.endGuarantee('b', relation);
  model.penalize('c', { fine: Number.MAX_SAFE_INTEGER, halveXp: false });
  const before = state(model);
  assert.throws(() => model.applySelfIdPenalty(act, { caseId: 'overflow', fine: 5 }), /aggregate debt/);
  assert.deepEqual(state(model), before);
});
