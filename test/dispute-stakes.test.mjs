import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel } from '../src/model.mjs';
import { DisputeStakes } from '../src/dispute-stakes.mjs';

function fund(model, owner, amount) {
  for (let i = 0; i < amount; i++) {
    const act = model.createSelfId(owner, model.registerArtifact(owner));
    model.advanceTo(model.now + 24);
    model.convertToCollector(owner, act);
  }
}
function state(model) {
  return { subjects: model.subjects(), stakes: model.disputeStakes(), ledger: model.audit(), events: model.events(), relations: model.guaranteeRelations() };
}
function unchanged(model, operation, message) {
  const before = state(model);
  assert.throws(operation, message);
  assert.deepEqual(state(model), before);
}

test('reserved stakes have exclusive model custody across concurrent cases and every liquid spending path', () => {
  const model = new FacetyModel({ genesis: ['a', 'b', 'c'], policy: { guaranteeFee: 1 } });
  fund(model, 'a', 7);
  const relation = model.proposeGuarantee('a', 'b');
  model.confirmGuarantee('b', relation);
  const pending = model.proposeGuarantee('a', 'c');
  model.reserveDisputeStake('case:1', 'a', 3);
  model.reserveDisputeStake('case:2', 'a', 3);
  assert.equal(model.subject('a').liquidFacy, 0);
  assert.equal(model.audit().stakeVault, 6);
  unchanged(model, () => model.reserveDisputeStake('case:3', 'a', 1), /insufficient/);
  unchanged(model, () => model.transferFacy('a', 'b', 1), /insufficient/);
  unchanged(model, () => model.confirmGuarantee('c', pending), /insufficient/);
  unchanged(model, () => model.endGuarantee('a', relation), /insufficient/);
  const burnBefore = model.audit().burned;
  assert.deepEqual(model.penalize('a', { fine: 4, halveXp: false }), { collected: 0, debtAdded: 4 });
  assert.equal(model.audit().burned, burnBefore, 'reserved collateral is not a second collectible balance');
  assert.equal(model.settleDisputeStake('case:1', 'a', { disposition: 'transfer', recipient: 'b' }), 3);
  assert.equal(model.settleDisputeStake('case:2', 'a'), 3);
  assert.equal(model.subject('b').liquidFacy, 3);
  assert.equal(model.subject('a').liquidFacy, 3);
  assert.equal(model.subject('a').debt, 4, 'refund is not invented debt repayment');
  assert.equal(model.audit().stakeVault, 0);
  unchanged(model, () => model.settleDisputeStake('case:1', 'a'), /not reserved/);
  unchanged(model, () => model.reserveDisputeStake('case:1', 'a', 1), /duplicate/);
});

test('stake disposition preflights invalid requests, preserves refunds after invalidation and burns only actual custody', () => {
  for (const disposition of ['release', 'transfer', 'burn']) {
    const model = new FacetyModel({ genesis: ['a', 'b'] });
    fund(model, 'a', 2);
    model.reserveDisputeStake('case', 'a', 2);
    unchanged(model, () => model.settleDisputeStake('case', 'a', { disposition: 'invented' }), /invalid/);
    unchanged(model, () => model.settleDisputeStake('case', 'a', { disposition: 'transfer', recipient: 'unknown' }), /unknown subject/);
    unchanged(model, () => model.settleDisputeStake('case', 'a', { recipient: 'b' }), /invalid/);
    model.invalidateIdentity('a');
    model.invalidateIdentity('b');
    model.settleDisputeStake('case', 'a', { disposition, recipient: disposition === 'transfer' ? 'b' : null });
    const ledger = model.audit();
    assert.equal(ledger.stakeVault, 0);
    assert.equal(ledger.collector, disposition === 'burn' ? 0 : 2);
    assert.equal(ledger.burned, disposition === 'burn' ? 2 : 0);
    assert.equal(ledger.debt, 0);
    unchanged(model, () => model.transferFacy('a', 'b', 1), /not accepted/);
    unchanged(model, () => model.settleDisputeStake('case', 'a', { disposition }), /not reserved/);
  }
});

test('stake books retain unsecured shortfalls but enforce funded concurrent commitments in the reserved reference', () => {
  for (const backing of ['unsecured', 'reserved']) {
    const model = new FacetyModel({ genesis: ['a', 'b'] });
    fund(model, 'a', 6);
    fund(model, 'b', 8);
    const book = new DisputeStakes(model, backing);
    for (const id of ['case:1', 'case:2']) {
      book.open(id, 'a', 3);
      book.enter(id, 'b', 4);
    }
    if (backing === 'reserved') {
      assert.equal(model.audit().stakeVault, 14);
      unchanged(model, () => book.open('case:3', 'a', 1), /insufficient/);
      unchanged(model, () => model.transferFacy('a', 'b', 5), /insufficient/);
      assert.equal(book.summary().cases, 2);
    } else model.transferFacy('a', 'b', 5, 'spend-before-settlement');
    for (const id of ['case:1', 'case:2']) book.settle(id, 'genuine');
    const summary = book.summary();
    assert.equal(summary.nominalLosing, 6);
    assert.equal(summary.transferred, backing === 'reserved' ? 6 : 1);
    assert.equal(summary.unpaid, backing === 'reserved' ? 0 : 5);
    assert.equal(summary.released, backing === 'reserved' ? 8 : 0);
    assert.equal(summary.burned, 0);
    assert.equal(summary.openCases, 0);
    assert.equal(model.audit().stakeVault, 0);
    assert.equal(model.audit().debt, 0, 'unpaid unsecured stake is not invented debt');
    const before = book.cases();
    unchanged(model, () => book.settle('case:1', 'genuine'), /not open/);
    unchanged(model, () => book.moot('case:1'), /not open/);
    assert.deepEqual(book.cases(), before);
    const forged = book.get('case:1');
    forged.status = 'open';
    forged.positions[0].amount = 0;
    assert.deepEqual(book.cases(), before, 'returned evidence cannot change case commitments');
  }
});

test('reserved ladder outcomes conserve all positions including losing tops and mooted cases', () => {
  for (const winner of ['fraud', 'genuine', null]) {
    const model = new FacetyModel({ genesis: ['a', 'b', 'c'] });
    fund(model, 'a', 3);
    fund(model, 'b', 4);
    fund(model, 'c', 5);
    const book = new DisputeStakes(model, 'reserved');
    book.open('case', 'a', 3);
    book.enter('case', 'b', 4);
    book.enter('case', 'c', 5);
    unchanged(model, () => book.settle('case', 'allegiance'), /invalid/);
    const result = winner === null ? book.moot('case') : book.settle('case', winner);
    const facts = result.accounting;
    assert.equal(facts.nominalLosing, facts.transferred + facts.burned + facts.unpaid);
    assert.equal(facts.released + facts.transferred + facts.burned, 12);
    assert.equal(facts.unpaid, 0);
    assert.equal(facts.burned, winner === 'genuine' ? 5 : 0);
    assert.equal(model.audit().stakeVault, 0);
    assert.equal(model.audit().supply, 12 - facts.burned);
  }
  assert.throws(() => new DisputeStakes(new FacetyModel(), 'assumed-free'), /backing/);
});

test('zero and invalid stake commitments preserve representation and replay boundaries', () => {
  const model = new FacetyModel();
  for (const amount of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) unchanged(model, () => model.reserveDisputeStake('case', 'root', amount), RangeError);
  unchanged(model, () => model.reserveDisputeStake('', 'root', 0), /invalid/);
  model.reserveDisputeStake('zero', 'root', 0);
  assert.equal(model.audit().stakeVault, 0);
  model.settleDisputeStake('zero', 'root', { disposition: 'burn' });
  assert.equal(model.audit().burned, 0);
  unchanged(model, () => model.settleDisputeStake('zero', 'root'), /not reserved/);
});
