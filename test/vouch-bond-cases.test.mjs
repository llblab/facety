import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';

// Fixed software property fixtures only: no research theta, attacker search or seed samples.
function fixture(B = 3, admit = true) {
  const model = new FacetyModel({ genesis: ['a', 'b', 'finder', 'other'], policy: { guarantorEligibility: 'accepted', xpFinality: 'maturity' },
    vouching: { K: 2, T: 1, V: 2, B, reference: { eligibility: 'accepted-reference', clockOrigin: 'commitment',
      funding: 'collector-liquid', exitSlot: 'retain-until-V', bondRelease: 'supplied-clearance' } },
    vouchAdmission: { c: 2, reference: 'native-guarantees-commitment-reference' } });
  const sources = [];
  for (let day = 0; day < 3; day++) {
    model.advanceTo(day * DAY);
    for (const owner of ['a', 'b']) sources.push([owner, model.createSelfId(owner, model.registerArtifact(owner))]);
  }
  model.advanceTo(3 * DAY);
  for (const [owner, source] of sources) model.convertToCollector(owner, source);
  const ids = ['a', 'b'].map(owner => model.commitVouch(owner, 'x'));
  if (admit) model.admitVouched('x', ids);
  return { model, ids };
}
const decision = (caseId, upheld, burn = 0, transfers = []) => ({ caseId, upheld, burn, transfers });
const clear = { clearanceId: 'trusted-clearance', clear: true };
function state(model) {
  return { now: model.now, subjects: model.subjects(), acts: model.selfIds(), vouches: model.vouchCommitments(), cases: model.vouchBondCases(),
    admissions: model.vouchAdmissions(), relations: model.guaranteeRelations(), events: model.events(), ledger: model.audit(),
    lineage: model.lineage.toJSON(), guarantees: model.guarantees.toJSON() };
}

test('pending case holds principal beyond V, survives exit, blocks refund and does not extend slot/cooldown or infer a verdict', () => {
  const { model, ids } = fixture(), start = model.now, before = model.audit();
  const record = model.openVouchBondCase(ids[0], { caseId: 'pending' });
  assert.equal(record.status, 'pending');
  assert.equal(record.availableAtOpen, 3);
  assert.equal(record.upheld, null);
  assert.throws(() => { record.status = 'resolved'; }, TypeError);
  assert.throws(() => record.transfers.push({ recipient: 'a', amount: 3 }), TypeError);
  assert.deepEqual(model.audit(), before);
  model.exitVouch('x', ids[0]);
  model.advanceTo(start + 2 * DAY);
  assert.equal(model.vouchCapacity('a').used, 0);
  assert.equal(model.vouchCapacity('a').cooldownRemainingHours, 0);
  const held = state(model);
  assert.throws(() => model.releaseVouchBond(ids[0], clear), /pending/);
  assert.deepEqual(state(model), held);
  model.resolveVouchBondCase(ids[0], decision('pending', false));
  assert.equal(model.subject('x').identityStatus, 'accepted');
  assert.equal(model.vouchCommitments()[0].slashed, 0);
  assert.equal(model.releaseVouchBond(ids[0], clear), 3);
  assert.equal(model.vouchCommitments()[0].refunded, 3);
  assert.throws(() => model.openVouchBondCase(ids[0], { caseId: 'after-refund' }), /not reserved/);
  const late = fixture();
  late.model.advanceTo(late.model.now + 2 * DAY);
  late.model.openVouchBondCase(late.ids[0], { caseId: 'caller-late-admissibility' });
  assert.throws(() => late.model.releaseVouchBond(late.ids[0], clear), /pending/);
});

test('explicit partial burn/payout debits only the bond and cumulative settlement never exceeds B or creates debt/XP/identity effects', () => {
  const { model, ids } = fixture(), id = ids[0], before = state(model);
  model.openVouchBondCase(id, { caseId: 'first' });
  const first = model.resolveVouchBondCase(id, decision('first', true, 1, [{ recipient: 'finder', amount: 1 }]));
  assert.equal(first.amount, 2); assert.equal(first.burned, 1);
  assert.equal(model.vouchCommitments()[0].bondRemaining, 1);
  assert.equal(model.vouchCommitments()[0].slashed, 2);
  assert.equal(model.vouchCommitments()[1].bondRemaining, 3);
  assert.equal(model.subject('finder').liquidFacy, 1);
  assert.equal(model.audit().vouchVault, 4);
  assert.equal(model.ledger().burned, before.ledger.burned + 1);
  assert.equal(model.ledger().debt, 0);
  assert.deepEqual(model.subjects().map(s => [s.id, s.identityStatus, s.xp]), before.subjects.map(s => [s.id, s.identityStatus, s.xp]));
  assert.deepEqual(model.guarantees.toJSON(), before.guarantees);
  assert.deepEqual(model.selfIds(), before.acts);
  assert.throws(() => model.resolveVouchBondCase(id, decision('first', true, 1)), /not pending/);
  assert.throws(() => model.openVouchBondCase(id, { caseId: 'first' }), /already recorded/);
  model.openVouchBondCase(id, { caseId: 'second' });
  assert.equal(model.vouchBondCases()[1].availableAtOpen, 1);
  model.resolveVouchBondCase(id, decision('second', true, 1));
  model.openVouchBondCase(id, { caseId: 'third' });
  const exhausted = state(model);
  assert.throws(() => model.resolveVouchBondCase(id, decision('third', true, 1)), /exceeds remaining/);
  assert.deepEqual(state(model), exhausted);
  model.resolveVouchBondCase(id, decision('third', false));
  model.advanceTo(model.vouchCommitments()[0].expiresAt);
  assert.equal(model.releaseVouchBond(id, clear), 0);
  assert.equal(model.releaseVouchBond(ids[1], clear), 3);
  assert.equal(model.audit().vouchVault, 0);
  assert.equal(model.ledger().burned, 2);
  assert.equal(model.ledger().collector, 4);
  assert.equal(model.vouchCommitments()[0].slashed, 3);
});

test('encumbered or partially depleted collateral cannot qualify an admission; rejected case clears only its own hold', () => {
  const { model, ids } = fixture(3, false);
  model.openVouchBondCase(ids[0], { caseId: 'first' });
  const held = state(model);
  assert.throws(() => model.admitVouched('x', ids), /live funded/);
  assert.deepEqual(state(model), held);
  model.resolveVouchBondCase(ids[0], decision('first', false));
  model.admitVouched('x', ids);
  assert.equal(model.size, 5);
  const partial = fixture(3, false);
  partial.model.openVouchBondCase(partial.ids[0], { caseId: 'partial' });
  partial.model.resolveVouchBondCase(partial.ids[0], decision('partial', true, 1));
  assert.throws(() => partial.model.admitVouched('x', partial.ids), /live funded/);
  const rejected = fixture();
  rejected.model.openVouchBondCase(rejected.ids[0], { caseId: 'same-case' });
  rejected.model.openVouchBondCase(rejected.ids[1], { caseId: 'same-case' });
  assert.throws(() => rejected.model.openVouchBondCase(rejected.ids[0], { caseId: 'overlap' }), /ordering contract/);
  rejected.model.resolveVouchBondCase(rejected.ids[0], decision('same-case', false));
  assert.equal(rejected.model.vouchBondCases().filter(c => c.status === 'pending').length, 1);
  rejected.model.advanceTo(rejected.model.vouchCommitments()[0].expiresAt);
  assert.equal(rejected.model.releaseVouchBond(rejected.ids[0], clear), 3);
  assert.throws(() => rejected.model.releaseVouchBond(rejected.ids[1], clear), /pending/);
});

test('supplied allocations to known invalidated/self recipients are custody, not verified recovery or net attacker loss', () => {
  const { model, ids } = fixture();
  model.invalidateIdentity('finder');
  model.openVouchBondCase(ids[0], { caseId: 'explicit-recipients' });
  model.resolveVouchBondCase(ids[0], decision('explicit-recipients', true, 0,
    [{ recipient: 'finder', amount: 1 }, { recipient: 'a', amount: 1 }]));
  assert.equal(model.subject('a').liquidFacy, 1);
  assert.equal(model.subject('finder').liquidFacy, 1);
  assert.equal(model.vouchCommitments()[0].slashed, 2); // gross escrow debit; one unit returned to its owner.
  assert.equal(model.ledger().burned, 0);
  assert.throws(() => model.transferFacy('finder', 'other', 1), /not accepted/);
  model.advanceTo(model.vouchCommitments()[0].expiresAt);
  assert.equal(model.releaseVouchBond(ids[0], clear), 1);
  assert.equal(model.subject('a').liquidFacy, 2);
  assert.equal(model.audit().debt, 0);
});

test('malformed/wrong/replayed/overfunded decisions and partial recipient failures preserve state and future IDs', () => {
  const bad = [
    null, {}, { caseId: 'case', upheld: true }, { ...decision('case', true), truth: true },
    decision('wrong', true), decision('case', 'truth'), decision('case', true, -1), decision('case', true, 0.5),
    decision('case', true, 4), decision('case', false, 1), decision('case', true, 1, [{ recipient: 'finder', amount: 3 }]),
    decision('case', true, Number.MAX_SAFE_INTEGER, [{ recipient: 'finder', amount: 1 }]),
    decision('case', true, 0, [{ recipient: 'finder', amount: 1 }, { recipient: 'missing', amount: 1 }]),
    decision('case', true, 0, [{ recipient: 'finder', amount: 1 }, { recipient: 'finder', amount: 1 }]),
    decision('case', true, 0, [{ recipient: 'finder', amount: 0 }]), decision('case', true, 0, Array(1)),
    decision('case', true, 0, [{ recipient: 'finder', amount: 1, extra: true }]),
  ];
  for (const value of bad) {
    const { model, ids } = fixture(), twin = fixture();
    model.openVouchBondCase(ids[0], { caseId: 'case' });
    twin.model.openVouchBondCase(twin.ids[0], { caseId: 'case' });
    const before = state(model);
    assert.throws(() => model.resolveVouchBondCase(ids[0], value));
    model.vouchBondCases(); model.audit();
    assert.deepEqual(state(model), before);
    const good = decision('case', true, 1, [{ recipient: 'finder', amount: 1 }]);
    model.resolveVouchBondCase(ids[0], good); twin.model.resolveVouchBondCase(twin.ids[0], good);
    assert.equal(model.registerArtifact('b'), twin.model.registerArtifact('b'));
    assert.deepEqual(state(model), state(twin.model));
  }
  const { model, ids } = fixture();
  for (const options of [undefined, null, {}, [], { caseId: '' }, { caseId: 'c', truth: true }]) {
    const before = state(model);
    assert.throws(() => model.openVouchBondCase(ids[0], options));
    assert.deepEqual(state(model), before);
  }
  assert.throws(() => model.openVouchBondCase('missing', { caseId: 'c' }), /not reserved/);
  const legacy = new FacetyModel();
  assert.deepEqual(legacy.vouchBondCases(), []);
  assert.throws(() => legacy.openVouchBondCase('x', { caseId: 'c' }), /disabled/);
  assert.throws(() => legacy.resolveVouchBondCase('x', decision('c', true)), /disabled/);
});

test('allocation order is canonical, caller objects/receipts stay isolated and neither refund nor resolved-case history is mutable', () => {
  const left = fixture(), right = fixture();
  left.model.openVouchBondCase(left.ids[0], { caseId: 'canonical' });
  right.model.openVouchBondCase(right.ids[0], { caseId: 'canonical' });
  const payouts = [{ recipient: 'other', amount: 1 }, { recipient: 'finder', amount: 1 }], input = decision('canonical', true, 0, payouts);
  const before = structuredClone(input), result = left.model.resolveVouchBondCase(left.ids[0], input);
  right.model.resolveVouchBondCase(right.ids[0], decision('canonical', true, 0, [...payouts].reverse()));
  assert.deepEqual(input, before);
  assert.deepEqual(state(left.model), state(right.model));
  payouts[0].amount = 100;
  assert.equal(left.model.vouchBondCases()[0].amount, 2);
  assert.throws(() => { result.transfers[0].amount = 100; }, TypeError);
  assert.throws(() => result.transfers.push({ recipient: 'a', amount: 100 }), TypeError);
  left.model.vouchBondCases().length = 0;
  assert.equal(left.model.vouchBondCases().length, 1);
});

test('two-case principal/burn/transfer/refund accounting matches an independent integer recurrence in 256 software partitions', () => {
  const plans = [
    { upheld: false, burn: 0, pay: 0 }, { upheld: false, burn: 1, pay: 0 },
    { upheld: true, burn: 0, pay: 0 }, { upheld: true, burn: 1, pay: 0 },
    { upheld: true, burn: 2, pay: 0 }, { upheld: true, burn: 0, pay: 1 },
    { upheld: true, burn: 1, pay: 1 }, { upheld: true, burn: 0, pay: 2 },
  ];
  let partitions = 0;
  for (const B of [0, 1, 2, 3]) for (const first of plans) for (const second of plans) {
    const { model, ids } = fixture(B), id = ids[0];
    let remaining = B, burned = 0, paid = 0;
    for (const [index, plan] of [first, second].entries()) {
      const caseId = 'software:' + index, debit = plan.burn + plan.pay;
      model.openVouchBondCase(id, { caseId });
      const command = decision(caseId, plan.upheld, plan.burn, plan.pay ? [{ recipient: 'finder', amount: plan.pay }] : []);
      const expected = debit <= remaining && (plan.upheld || debit === 0);
      if (expected) {
        model.resolveVouchBondCase(id, command);
        remaining -= debit; burned += plan.burn; paid += plan.pay;
      } else {
        const before = state(model);
        assert.throws(() => model.resolveVouchBondCase(id, command));
        assert.deepEqual(state(model), before);
        model.resolveVouchBondCase(id, decision(caseId, false));
      }
      const receipt = model.vouchCommitments()[0];
      assert.equal(receipt.bondRemaining, remaining);
      assert.equal(receipt.slashed, B - remaining);
      assert.equal(model.audit().vouchVault, B + remaining);
      assert.equal(model.ledger().burned, burned);
      assert.equal(model.subject('a').liquidFacy, 3 - B);
      assert.equal(model.subject('finder').liquidFacy, paid);
    }
    model.advanceTo(model.vouchCommitments()[0].expiresAt);
    assert.equal(model.releaseVouchBond(id, clear), remaining);
    assert.equal(model.subject('a').liquidFacy, 3 - B + remaining);
    assert.equal(model.vouchCommitments()[0].refunded, remaining);
    assert.equal(model.audit().vouchVault, B);
    partitions++;
  }
  assert.equal(partitions, 256);
});
