import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';

const fixture = policy => new FacetyModel({ genesis: ['a', 'b', 'c'], policy: { guarantorEligibility: 'accepted', ...policy } });
const identify = (model, id) => model.createSelfId(id, model.registerArtifact(id));
function link(model, from, to = 'a') {
  const relation = model.proposeGuarantee(from, to);
  model.confirmGuarantee(to, relation);
  return relation;
}
function walk(model, subject, expected) {
  let id = expected.at(-1) ?? null;
  const reversed = [];
  while (id !== null) {
    assert.ok(!reversed.includes(id), 'no cycles');
    const act = model.selfId(id);
    assert.equal(act.subject, subject);
    assert.equal(act.chainIndex, expected.length - reversed.length);
    reversed.push(id);
    id = act.previousSelfId;
  }
  assert.deepEqual(reversed.reverse(), expected);
  model.audit();
}
function state(model) {
  return { subjects: model.subjects(), acts: model.selfIds(), invitations: model.invitations(), events: model.events(), ledger: model.audit() };
}

test('personal indices and predecessor traversal match81 independent interleavings in each of three XP modes', () => {
  for (const xpFinality of ['terminal', 'immediate', 'maturity']) for (let pattern = 0; pattern < 81; pattern++) {
    const model = fixture({ xpFinality });
    const expected = new Map(['a', 'b', 'c'].map(id => [id, []]));
    let digits = pattern;
    for (let step = 0; step < 4; step++) {
      model.advanceTo(step * DAY);
      const subject = ['a', 'b', 'c'][digits % 3];
      digits = Math.floor(digits / 3);
      expected.get(subject).push(identify(model, subject));
      for (const [owner, chain] of expected) walk(model, owner, chain);
    }
  }
});

test('conversion, cancellation, voiding, invitation use and key rotation retain historical links, guarantors and XP receipts', () => {
  const model = fixture();
  const relation = link(model, 'b');
  const first = identify(model, 'a');
  const funding = identify(model, 'b');
  model.advanceTo(DAY);
  model.convertToCollector('a', first);
  model.convertToCollector('b', funding);
  model.endGuarantee('b', relation);
  link(model, 'c');
  const historical = model.selfId(first);
  assert.deepEqual(historical.guarantors, ['b']);
  assert.deepEqual(historical.xpCredit.recipients.map(row => row.subject), ['a', 'b']);
  assert.equal(historical.xpCredit.recipients[1].revocation, 'guarantee-ended');
  const second = identify(model, 'a');
  model.cancelSelfId('c', second);
  const cancelled = model.selfId(second);
  model.advanceTo(2 * DAY);
  model.rotateKey('a', 'a:rotated');
  const third = identify(model, 'a');
  model.voidSelfIdChain('a', { fromAct: third });
  const voided = model.selfId(third);
  model.advanceTo(3 * DAY);
  const fourth = identify(model, 'a');
  model.advanceTo(4 * DAY);
  model.createInvitation('a', fourth, 'new');
  const consumed = model.selfId(fourth);
  const fifth = identify(model, 'a');
  walk(model, 'a', [first, second, third, fourth, fifth]);
  assert.deepEqual(model.selfId(first), historical);
  assert.deepEqual(model.selfId(second), cancelled);
  assert.deepEqual(model.selfId(third), voided);
  assert.deepEqual(model.selfId(fourth), consumed);
  assert.deepEqual(model.selfId(fifth).guarantors, ['c']);
  assert.equal(model.selfId(first).chainIndex, 1);
  assert.equal(model.selfId(first).previousSelfId, null);
  assert.equal(model.selfId(fifth).previousSelfId, fourth);
});

test('debt-repayment acts remain in the personal history without changing repayment or XP provenance', () => {
  const model = fixture();
  link(model, 'b');
  model.penalize('a', { fine: 1, halveXp: false });
  const repayment = identify(model, 'a');
  model.advanceTo(DAY);
  const historical = model.selfId(repayment);
  assert.equal(historical.disposition, 'debt-repayment');
  assert.equal(model.subject('a').debt, 0);
  assert.equal(historical.xpCredit.recipients.length, 2);
  const next = identify(model, 'a');
  walk(model, 'a', [repayment, next]);
  assert.deepEqual(model.selfId(repayment), historical);
});

test('rejected creation consumes no chain position or NFT ID', () => {
  const models = [fixture(), fixture()];
  const initial = models.map(model => identify(model, 'a'));
  const artifacts = models.map(model => model.registerArtifact('a'));
  const before = state(models[0]);
  assert.throws(() => models[0].createSelfId('a', artifacts[0]), /rolling/);
  assert.throws(() => models[0].createSelfId('a', artifacts[0], -1), /faceIndex/);
  assert.deepEqual(state(models[0]), before);
  for (const model of models) model.advanceTo(DAY);
  const next = models.map((model, i) => model.createSelfId('a', artifacts[i]));
  assert.deepEqual(next[0], next[1]);
  walk(models[0], 'a', [initial[0], next[0]]);
  assert.deepEqual(state(models[0]), state(models[1]));
});

test('public chain metadata is immutable and repeated traversal leaves finances, history and provenance unchanged', () => {
  const model = fixture({ xpFinality: 'immediate' });
  link(model, 'b');
  const first = identify(model, 'a');
  model.advanceTo(DAY);
  const second = identify(model, 'a');
  const before = state(model);
  const act = model.selfId(second);
  assert.throws(() => { act.chainIndex = 99; }, TypeError);
  assert.throws(() => { act.previousSelfId = second; }, TypeError);
  assert.throws(() => { act.xpCredit.recipients[0].subject = 'c'; }, TypeError);
  for (let i = 0; i < 3; i++) walk(model, 'a', [first, second]);
  assert.deepEqual(state(model), before);
  assert.deepEqual(model.selfId(second), act);
});
