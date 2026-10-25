import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';

const identify = (model, subject = 'a') => model.createSelfId(subject, model.registerArtifact(subject));
function link(model) {
  const relation = model.proposeGuarantee('b', 'a');
  model.confirmGuarantee('a', relation);
  return relation;
}
function fixture(xpFinality = 'maturity') {
  const model = new FacetyModel({ genesis: ['a', 'b', 'w'], policy: { xpFinality, guarantorEligibility: 'accepted' } });
  const relation = link(model);
  const acts = [];
  for (let step = 0; step < 3; step++) { model.advanceTo(step * DAY); acts.push(identify(model)); }
  model.advanceTo(3 * DAY);
  return { model, relation, acts };
}
const options = (initiator = 'a', caseId = 'case', upheld = true) => ({ initiator, caseId, upheld });
function state(model) {
  return { now: model.now, subjects: model.subjects(), acts: model.selfIds(), invitations: model.invitations(),
    relations: model.guaranteeRelations(), resolutions: model.selfIdResolutions(), events: model.events(), ledger: model.audit() };
}
function check(model) {
  for (const subject of model.subjects()) {
    let weighted = 0n;
    for (const act of model.selfIds()) {
      if (!act.xpCredit || act.xpCredit.revokedAt !== null) continue;
      for (const receipt of act.xpCredit.recipients) if (receipt.subject === subject.id && receipt.revokedAt === null) weighted += 1n << BigInt(receipt.halvingsBefore);
    }
    const expected = Number(weighted >> BigInt(subject.xpHalvings));
    assert.equal(subject.xp, expected);
    assert.equal(model.xpProvenance(subject.id).xp, expected);
  }
  model.audit();
}

test('author resolution after cooling corrects only its act and allows a later funded Self-ID without rewriting history', () => {
  const { model, acts } = fixture();
  const first = model.selfId(acts[0]), later = model.selfId(acts[2]);
  const result = model.resolveSelfId(acts[1], options());
  assert.equal(result.kind, 'self-correction');
  assert.deepEqual(result.acts.map(row => row.selfId), [acts[1]]);
  assert.deepEqual(result.recovery, { emitterBurn: 1, alreadyBurned: 0, requestedFromAuthor: 0, collected: 0, debtAdded: 0 });
  assert.equal(result.punitivePenaltiesApplied, false);
  assert.equal(model.subject('a').xp, 2);
  assert.equal(model.subject('b').xp, 2);
  assert.deepEqual(model.selfId(acts[0]), first);
  assert.deepEqual(model.selfId(acts[2]), later);
  assert.equal(model.selfId(acts[1]).disposition, 'self-corrected');
  assert.equal(model.selfId(acts[1]).previousSelfId, acts[0]);
  const next = identify(model);
  assert.equal(model.selfId(next).chainIndex, 4);
  assert.equal(model.selfId(next).previousSelfId, acts[2]);
  model.advanceTo(4 * DAY);
  model.convertToCollector('a', next);
  assert.equal(model.subject('a').liquidFacy, 1);
  assert.ok(model.subjects().every(subject => subject.identityStatus === 'accepted'));
  check(model);
});

test('a recorded guarantor and an unrelated initiator both cut the suffix, preserving the valid earlier prefix', () => {
  for (const initiator of ['b', 'w']) {
    const { model, acts } = fixture();
    const prefix = model.selfId(acts[0]);
    const result = model.resolveSelfId(acts[1], options(initiator));
    assert.equal(result.kind, 'external-chain-cut');
    assert.deepEqual(result.acts.map(row => row.selfId), acts.slice(1));
    assert.equal(result.recovery.emitterBurn, 2);
    assert.deepEqual(model.selfId(acts[0]), prefix);
    assert.equal(model.subject('a').xp, 1);
    assert.equal(model.subject('b').xp, 1);
    assert.equal(model.subject('a').xpHalvings, 0); // Source reversal is separate from caller-owned punitive sanctions.
    assert.ok(model.subjects().every(subject => subject.identityStatus === 'accepted'));
    check(model);
  }
});

test('converted-source recovery records actual author collection and missing debt, never fictional burns', () => {
  for (const initiator of ['a', 'w']) for (const balance of [0, 1, 3]) {
    const { model, acts } = fixture();
    for (const act of acts) model.convertToCollector('a', act);
    if (balance < 3) model.transferFacy('a', 'b', 3 - balance);
    const before = model.ledger();
    const count = initiator === 'a' ? 1 : 2;
    const result = model.resolveSelfId(acts[1], options(initiator));
    assert.equal(result.recovery.requestedFromAuthor, count);
    assert.equal(result.recovery.collected, Math.min(balance, count));
    assert.equal(result.recovery.debtAdded, Math.max(0, count - balance));
    assert.equal(model.ledger().burned - before.burned, Math.min(balance, count));
    assert.equal(model.ledger().debt - before.debt, Math.max(0, count - balance));
    assert.equal(model.subject('b').liquidFacy, 3 - balance);
    assert.equal(model.events().filter(event => event.type === 'penalty-applied').length, 0);
    assert.equal(model.events().filter(event => event.type === 'self-id-source-recovered').length, 1);
    check(model);
  }
});

test('invitation-consumed source stays burned without another debit, invitation rewrite or invented dependent-right settlement', () => {
  for (const xpFinality of ['terminal', 'immediate', 'maturity']) {
    const { model, acts } = fixture(xpFinality);
    model.createInvitation('a', acts[1], 'new');
    const invitations = model.invitations(), ledger = model.ledger();
    const result = model.resolveSelfId(acts[1], options());
    assert.equal(result.recovery.alreadyBurned, 1);
    assert.equal(result.recovery.collected + result.recovery.debtAdded + result.recovery.emitterBurn, 0);
    assert.deepEqual(model.invitations(), invitations);
    assert.deepEqual(model.ledger(), ledger);
    assert.equal(model.selfId(acts[1]).status, 'cancelled');
    check(model);
  }
});

test('rejected supplied verdict preserves act, XP and money; authorship is not automatic proof or withdrawal', () => {
  for (const initiator of ['a', 'b', 'w']) {
    const { model, acts } = fixture();
    const before = state(model);
    const result = model.resolveSelfId(acts[1], options(initiator, 'rejected', false));
    assert.equal(result.upheld, false);
    assert.deepEqual(result.acts, []);
    assert.deepEqual(model.selfIds(), before.acts);
    assert.deepEqual(model.subjects(), before.subjects);
    assert.deepEqual(model.ledger(), before.ledger);
    assert.equal(model.selfIdResolutions().length, 1);
    check(model);
  }
});

test('source reversal follows public chronological credits rather than blindly decrementing current XP', () => {
  for (let halvings = 0; halvings <= 5; halvings++) for (const initiator of ['a', 'w']) for (let start = 0; start < 3; start++) {
    const { model, acts } = fixture();
    for (let i = 0; i < halvings; i++) for (const subject of ['a', 'b']) model.penalize(subject, { fine: 0, halveXp: true });
    model.resolveSelfId(acts[start], options(initiator));
    check(model);
    if (halvings === 1 && initiator === 'a') assert.equal(model.subject('b').xp, 1);
  }
});

test('previous relation-credit revocation survives correction with no negative XP or resurrection', () => {
  const { model, relation, acts } = fixture();
  model.convertToCollector('a', acts[0]);
  model.transferFacy('a', 'b', 1);
  model.endGuarantee('b', relation);
  assert.equal(model.subject('b').xp, 0);
  model.resolveSelfId(acts[1], options());
  assert.equal(model.subject('b').xp, 0);
  assert.equal(model.selfId(acts[1]).xpCredit.recipients[1].revocation, 'guarantee-ended');
  link(model);
  assert.equal(model.subject('b').xp, 0);
  check(model);
});

test('same-case replay, same corrected source and overlapping suffixes cannot repeat source recovery', () => {
  const { model, acts } = fixture();
  model.resolveSelfId(acts[2], options('w', 'last'));
  const before = state(model);
  assert.throws(() => model.resolveSelfId(acts[0], options('w', 'last')), /already applied/);
  assert.throws(() => model.resolveSelfId(acts[2], options('a', 'renamed')), /already corrected or voided/);
  assert.deepEqual(state(model), before);
  const result = model.resolveSelfId(acts[1], options('w', 'earlier'));
  assert.deepEqual(result.acts.map(row => row.selfId), [acts[1]]);
  assert.equal(model.ledger().burned, 2);
  check(model);
});

test('locked, debt-used and aggregate-overflow cases reject before partial suffix, XP or money mutation', () => {
  const locked = fixture('terminal');
  locked.model.convertToCollector('a', locked.acts[1]);
  locked.model.freezeSelfId(locked.acts[2], 'another-case');
  const beforeLock = state(locked.model);
  assert.throws(() => locked.model.resolveSelfId(locked.acts[1], options('w')), /locked/);
  assert.deepEqual(state(locked.model), beforeLock);
  const debt = new FacetyModel({ genesis: ['a'] });
  debt.penalize('a', { fine: 1, halveXp: false });
  const repayment = identify(debt);
  for (const at of [0, DAY]) {
    debt.advanceTo(at);
    const before = state(debt);
    assert.throws(() => debt.resolveSelfId(repayment, options()), /debt-used/);
    assert.deepEqual(state(debt), before);
  }
  const overflow = fixture();
  for (const act of overflow.acts) overflow.model.convertToCollector('a', act);
  overflow.model.transferFacy('a', 'b', 3);
  overflow.model.penalize('w', { fine: Number.MAX_SAFE_INTEGER, halveXp: false });
  const beforeOverflow = state(overflow.model);
  assert.throws(() => overflow.model.resolveSelfId(overflow.acts[1], options('w')), /aggregate debt/);
  assert.deepEqual(state(overflow.model), beforeOverflow);
});

test('malformed or hidden-truth inputs reject and preview/receipts are deeply immutable, pure and ID-inert', () => {
  const fixtures = [fixture(), fixture()];
  const { model, acts } = fixtures[0];
  const before = state(model);
  for (const bad of [null, [], {}, { ...options(), upheld: 'true' }, { ...options(), truth: true }, { ...options(), caseId: '' }, { ...options(), initiator: 'unknown' }]) {
    assert.throws(() => model.resolveSelfId(acts[1], bad));
    assert.deepEqual(state(model), before);
  }
  const preview = model.previewSelfIdResolution(acts[1], options());
  assert.throws(() => { preview.recovery.emitterBurn = 99; }, TypeError);
  assert.throws(() => preview.acts[0].recipients.push('w'), TypeError);
  assert.deepEqual(state(model), before);
  for (const item of fixtures) item.model.resolveSelfId(item.acts[1], options());
  assert.deepEqual(state(model), state(fixtures[1].model));
  const record = model.selfIdResolutions()[0];
  assert.throws(() => { record.xpChanges[0].after = 999; }, TypeError);
  assert.deepEqual(identify(model), identify(fixtures[1].model));
  assert.deepEqual(state(model), state(fixtures[1].model));
});
