import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';
import { DirectedGraph } from '../src/graph.mjs';

// Deterministic engineering fixtures, not parameter samples or attack/confirmation seeds.
const reference = 'native-guarantees-commitment-reference';
function fixture(c = 2, options = {}) {
  const { B = 1, policy = {}, ...extra } = options;
  const model = new FacetyModel({ genesis: ['a', 'b', 'c'],
    policy: { guarantorEligibility: 'accepted', xpFinality: 'maturity', ...policy },
    vouching: { K: 3, T: 1, V: 3, B, reference: { eligibility: 'accepted-reference', clockOrigin: 'commitment',
      funding: 'collector-liquid', exitSlot: 'retain-until-V', bondRelease: 'supplied-clearance' } },
    vouchAdmission: { c, reference }, ...extra });
  const sources = [];
  for (let day = 0; day < 2; day++) {
    model.advanceTo(day * DAY);
    for (const owner of ['a', 'b', 'c']) sources.push([owner, model.createSelfId(owner, model.registerArtifact(owner))]);
  }
  model.advanceTo(2 * DAY);
  for (const [owner, source] of sources) model.convertToCollector(owner, source);
  return model;
}
function state(model) {
  return { now: model.now, subjects: model.subjects(), acts: model.selfIds(), vouches: model.vouchCommitments(), admissions: model.vouchAdmissions(),
    relations: model.guaranteeRelations(), invitations: model.invitations(), events: model.events(), ledger: model.audit(),
    lineage: model.lineage.toJSON(), guarantees: model.guarantees.toJSON() };
}
function offers(model, target = 'x') { return ['a', 'b'].map(owner => model.commitVouch(owner, target)); }

test('admission is an immutable opt-in c/reference contract, separate from default and reservation-only models', () => {
  const raw = { c: 2, reference }, model = fixture(2, { vouchAdmission: raw });
  raw.c = 1;
  assert.equal(model.vouchAdmission.c, 2);
  assert.throws(() => { model.vouchAdmission.c = 1; }, TypeError);
  assert.throws(() => { model.vouchAdmission = null; }, TypeError);
  const legacy = new FacetyModel();
  assert.equal(legacy.vouchAdmission, null);
  assert.equal(Object.keys(legacy).includes('vouchAdmission'), false);
  assert.deepEqual(legacy.vouchAdmissions(), []);
  assert.throws(() => legacy.admitVouched('x', []), /disabled/);
  for (const vouchAdmission of [{}, [], false, { c: 0, reference }, { c: 1.5, reference }, { c: Number.MAX_SAFE_INTEGER, reference },
    { c: 1, reference: 'standing-verified' }, { c: 1, reference, truth: true }]) assert.throws(() => fixture(2, { vouchAdmission }));
  assert.throws(() => new FacetyModel({ vouchAdmission: { c: 1, reference } }), /requires funded/);
  assert.throws(() => fixture(2, { invitationLimit: { P: 1, b: 0 } }), /no invitation-limit/);
  const before = state(model);
  assert.throws(() => model.createInvitation('a', null, 'bypass'), /disables invitation/);
  assert.throws(() => model.acceptInvitation('anything', 'bypass'), /disables invitation/);
  assert.deepEqual(state(model), before);
});

test('exactly c live prepaid vouches admit atomically, with canonical graph order and no second charge/mint/XP/lineage grant', () => {
  const model = fixture(2, { policy: { guaranteeFee: 10 } }), ids = offers(model), before = model.audit();
  const input = [...ids].reverse(), saved = [...input], result = model.admitVouched('x', input);
  assert.deepEqual(input, saved);
  assert.equal(model.size, 4);
  assert.deepEqual(model.audit(), before);
  assert.deepEqual(model.subject('x'), { id: 'x', genesis: false, key: 'x:key:0', identityStatus: 'accepted',
    xp: 0, xpHalvings: 0, liquidFacy: 0, debt: 0, lastRewardAt: null });
  assert.equal([...model.lineage.inEdges('x')].length, 0);
  assert.deepEqual([...model.guarantees.inEdges('x')].map(e => e.from), ['a', 'b']);
  const receipt = model.vouchAdmissions()[0];
  assert.equal(receipt.id, result);
  assert.deepEqual(receipt.vouches, ids);
  assert.deepEqual(receipt.guarantors, ['a', 'b']);
  assert.equal(receipt.reference, reference);
  assert.throws(() => receipt.vouches.push('fake'), TypeError);
  assert.throws(() => { receipt.guarantors[0] = 'c'; }, TypeError);
  assert.throws(() => { receipt.subject = 'other'; }, TypeError);
  const twin = fixture(2, { policy: { guaranteeFee: 10 } }), otherIds = offers(twin);
  assert.equal(twin.admitVouched('x', otherIds), result);
  assert.deepEqual(state(model), state(twin));
  assert.throws(() => model.admitVouched('x', ids), /new canonical/);
});

test('invalid/partial/cross-target/expired/exited/judged commitments leave all money, graphs, IDs and receipts unchanged', () => {
  const cases = [
    { attempt: (m, ids) => m.admitVouched('x', [ids[0]]) },
    { attempt: (m, ids) => m.admitVouched('x', [ids[0], ids[0]]) },
    { attempt: m => m.admitVouched('x', Array(2)) },
    { attempt: (m, ids) => m.admitVouched('x', [ids[0], 'missing']) },
    { attempt: (m, ids) => m.admitVouched('other', ids) },
    { attempt: (m, ids) => m.admitVouched('a', ids) },
    { attempt: (m, ids) => m.admitVouched('', ids) },
    { setup: (m, ids) => m.exitVouch('a', ids[0]), attempt: (m, ids) => m.admitVouched('x', ids) },
    { setup: m => m.invalidateIdentity('b'), attempt: (m, ids) => m.admitVouched('x', ids) },
    { setup: m => m.advanceTo(m.now + 3 * DAY), attempt: (m, ids) => m.admitVouched('x', ids) },
    { setup: (m, ids) => { m.advanceTo(m.now + 3 * DAY); m.releaseVouchBond(ids[0], { clearanceId: 'unused-refund', clear: true }); },
      attempt: (m, ids) => m.admitVouched('x', ids) },
    { setup: m => m.lineage.addNode('x'), attempt: (m, ids) => m.admitVouched('x', ids) },
    { setup: m => m.guarantees.addNode('x'), attempt: (m, ids) => m.admitVouched('x', ids) },
  ];
  for (const row of cases) {
    const model = fixture(), twin = fixture(), ids = offers(model), twinIds = offers(twin);
    row.setup?.(model, ids); row.setup?.(twin, twinIds);
    const before = state(model);
    assert.throws(() => row.attempt(model, ids));
    model.vouchAdmissions(); model.vouchCommitments(); model.audit();
    assert.deepEqual(state(model), before);
    assert.equal(model.registerArtifact('a'), twin.registerArtifact('a'));
    assert.deepEqual(state(model), state(twin));
  }
});

test('aggregate graph-capacity failure is preflighted before subject insertion, fees or ID consumption', () => {
  for (const field of ['lineage', 'guarantees']) for (const counter of ['revision', ...(field === 'guarantees' ? ['nextEdge'] : [])]) {
    const model = fixture(), twin = fixture(), ids = offers(model), otherIds = offers(twin);
    const original = model[field];
    model[field] = DirectedGraph.fromJSON({ ...original.toJSON(), [counter]: Number.MAX_SAFE_INTEGER - (field === 'lineage' ? 0 : 1) });
    const before = state(model);
    assert.throws(() => model.admitVouched('x', ids), /exhausted/);
    assert.deepEqual(state(model), before);
    assert.throws(() => model.subject('x'), /unknown subject/);
    model[field] = original;
    assert.equal(model.admitVouched('x', ids), twin.admitVouched('x', otherIds));
    assert.deepEqual(state(model), state(twin));
  }
});

test('both parties exit backed links free, including after V/refund, with native snapshot/XP behavior retained', () => {
  for (const actor of ['a', 'x']) {
    const model = fixture(), ids = offers(model);
    model.admitVouched('x', ids);
    const act = model.createSelfId('x', model.registerArtifact('x'));
    const relation = model.vouchAdmissions()[0].relations[0], before = model.audit();
    model.endGuarantee(actor, relation);
    assert.equal(model.guarantees.edge('a', 'x'), undefined);
    assert.equal(model.guaranteeRelations().find(r => r.id === relation).status, 'ended');
    assert.deepEqual(model.audit(), before);
    assert.equal(model.vouchCommitments()[0].exitedAt, model.now);
    assert.ok(model.selfId(act).guarantors.includes('a'));
    model.cancelSelfId('a', act); // creation-time veto authority survives link exit.
    assert.equal(model.selfId(act).status, 'cancelled');
    assert.throws(() => model.exitVouch(actor, ids[0]), /live/);
  }
  const model = fixture(), ids = offers(model);
  model.admitVouched('x', ids);
  model.advanceTo(model.now + 3 * DAY);
  model.releaseVouchBond(ids[0], { clearanceId: 'cleared-reference', clear: true });
  const before = model.audit();
  model.exitVouch('x', ids[0]);
  assert.deepEqual(model.audit(), before);
  assert.equal(model.guarantees.edge('a', 'x'), undefined);
  assert.equal(model.subject('x').identityStatus, 'accepted');
});

test('new members have no free capital; a funded claim can supply collateral before becoming voucher parents', () => {
  const model = fixture(), ids = offers(model);
  model.admitVouched('x', ids);
  assert.throws(() => model.commitVouch('x', 'y'), /insufficient liquid/);
  const source = model.createSelfId('x', model.registerArtifact('x'));
  model.advanceTo(model.now + DAY);
  model.convertToCollector('x', source);
  model.rotateKey('x', 'new-key');
  const childVouches = [model.commitVouch('x', 'y'), model.commitVouch('b', 'y')], before = model.audit();
  model.admitVouched('y', childVouches);
  assert.deepEqual(model.audit(), before);
  assert.equal(model.subject('y').liquidFacy, 0);
  assert.deepEqual([...model.guarantees.inEdges('y')].map(e => e.from), ['b', 'x']);
  assert.equal(model.vouchCapacity('x').cooldownRemainingHours, DAY);
});

test('admission feasibility matches independent subset/status predicates in 3072 software partitions', () => {
  let partitions = 0;
  for (const c of [1, 2, 3]) for (const expired of [false, true]) for (let statuses = 0; statuses < 64; statuses++) for (let mask = 0; mask < 8; mask++) {
    const model = fixture(c), owners = ['a', 'b', 'c'], rows = [];
    for (let index = 0; index < owners.length; index++) {
      const status = Math.floor(statuses / 4 ** index) % 4, owner = owners[index];
      const id = status === 0 ? 'missing:' + owner : model.commitVouch(owner, 'x');
      if (status === 2) model.exitVouch(owner, id);
      if (status === 3) model.invalidateIdentity(owner);
      rows.push({ owner, id, valid: status === 1 });
    }
    if (expired) model.advanceTo(model.now + 3 * DAY);
    const selected = rows.filter((_, index) => (mask & 2 ** index) !== 0);
    // Oracle uses declared independent state categories, not Model's admission/capacity implementation.
    const expected = selected.length === c && !expired && selected.every(row => row.valid);
    const before = state(model);
    if (expected) {
      model.admitVouched('x', selected.map(row => row.id));
      assert.equal(model.size, 4);
      assert.deepEqual(model.audit(), before.ledger);
      assert.deepEqual([...model.guarantees.inEdges('x')].map(e => e.from), selected.map(row => row.owner));
    } else {
      assert.throws(() => model.admitVouched('x', selected.map(row => row.id)));
      assert.deepEqual(state(model), before);
    }
    partitions++;
  }
  assert.equal(partitions, 3072);
});
