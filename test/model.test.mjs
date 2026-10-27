import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY, policyFrom } from '../src/model.mjs';
import { DirectedGraph } from '../src/graph.mjs';

// Most transition tests pin the original 3/7-day timing; the selected one-day timing has its own tests.
const LEGACY_TIMING = { spendMaturityHours: 3 * DAY, conversionMaturityHours: 7 * DAY, invitationFreezeHours: 0, linkBreakXp: 'keep' };
function fixture(policy = {}, genesis = ['a', 'b', 'c']) {
  return new FacetyModel({ genesis, policy: { guarantorEligibility: 'accepted', ...LEGACY_TIMING, ...policy } });
}
function guarantee(model, a, b) {
  const relation = model.proposeGuarantee(a, b);
  model.confirmGuarantee(b, relation);
  return relation;
}
function identify(model, id) {
  return model.createSelfId(id, model.registerArtifact(id));
}
function protocolState(model) {
  return {
    subjects: model.subjects(), acts: model.selfIds(), invitations: model.invitations(), relations: model.guaranteeRelations(),
    events: model.events(), ledger: model.audit(), lineage: model.lineage.toJSON(), guarantees: model.guarantees.toJSON(),
  };
}

test('3/7-day transitions consume exactly one own right and never mint on conversion', () => {
  const model = fixture();
  guarantee(model, 'b', 'a');
  const own = identify(model, 'a');
  assert.equal(model.subject('a').xp, 0);
  model.advanceTo(3 * DAY - 1);
  assert.throws(() => model.createInvitation('a', own, 'new'));
  model.advanceTo(3 * DAY);
  const invitation = model.createInvitation('a', own, 'new');
  model.acceptInvitation(invitation, 'new');
  assert.equal(model.subject('a').xp, 1);
  assert.equal(model.subject('b').xp, 1);
  assert.equal(model.guarantees.edge('a', 'new'), undefined);
  assert.equal(model.lineage.edge('a', 'new').to, 'new');
  assert.throws(() => model.acceptInvitation(invitation, 'new'));
  assert.throws(() => model.cancelSelfId('b', own));
  assert.throws(() => model.convertToCollector('a', own));
  const next = identify(model, 'a');
  model.advanceTo(10 * DAY - 1);
  assert.throws(() => model.convertToCollector('a', next));
  model.advanceTo(10 * DAY);
  model.convertToCollector('a', next);
  assert.throws(() => model.convertToCollector('a', next));
  assert.deepEqual(model.audit(), { minted: 2, burned: 1, supply: 1, emitterVault: 0, collector: 1, feeVault: 0, stakeVault: 0, debt: 0 });
});

test('shared artifacts flag different subjects, not submission order, and preserve independent rewards', () => {
  const model = fixture();
  const artifact = model.registerArtifact('a', { faceCount: 2 });
  const a = model.createSelfId('a', artifact, 0);
  const b = model.createSelfId('b', artifact, 0);
  const c = model.createSelfId('c', artifact, 1);
  assert.equal(model.selfId(a).collision, true);
  assert.equal(model.selfId(b).collision, true);
  assert.equal(model.selfId(c).collision, false);
  assert.equal(model.audit().minted, 3);
  assert.throws(() => model.createSelfId('a', artifact, 1));
  model.rotateKey('a', 'rotated');
  assert.throws(() => model.createSelfId('a', artifact, 1));
  model.advanceTo(DAY);
  model.createSelfId('a', artifact, 1);
  model.advanceTo(DAY + 1);
  assert.throws(() => model.createSelfId('b', artifact));
  assert.throws(() => identify(model, 'missing'));
});

test('rejected artifact registration preserves later funded IDs, events and transitions', () => {
  const funded = () => {
    const model = new FacetyModel({ genesis: ['a', 'b', 'c'] });
    guarantee(model, 'b', 'a');
    const b = identify(model, 'b');
    const a = model.createSelfId('a', model.registerArtifact('a', { contentHash: 'existing' }));
    model.advanceTo(DAY);
    model.convertToCollector('a', a);
    model.convertToCollector('b', b);
    model.invalidateIdentity('c');
    return model;
  };
  const suffix = model => {
    const artifact = model.registerArtifact('a', { contentHash: 'suffix' });
    const act = model.createSelfId('a', artifact);
    model.advanceTo(2 * DAY);
    const invitation = model.createInvitation('a', act, 'new');
    model.advanceTo(3 * DAY);
    model.acceptInvitation(invitation, 'new');
    return { ids: { artifact, act, invitation }, state: protocolState(model) };
  };
  const expected = suffix(funded());
  for (const [label, publisher, options, reason] of [
    ['unknown publisher', 'missing', { contentHash: 'suffix' }, /unknown subject/],
    ['invalidated publisher', 'c', { contentHash: 'suffix' }, /not accepted/],
    ['invalid detector count', 'a', { faceCount: 0, contentHash: 'suffix' }, /faceCount/],
    ['invalid hash', 'a', { contentHash: '' }, /invalid content hash/],
    ['duplicate media', 'a', { contentHash: 'existing' }, /duplicate media/],
    ['invalid explicit ID', 'a', { id: null }, /invalid or duplicate artifact/],
  ]) {
    const model = funded();
    const before = protocolState(model);
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.throws(() => model.registerArtifact(publisher, options), reason, label);
      assert.deepEqual(protocolState(model), before, label + ': immediate state');
    }
    assert.deepEqual(suffix(model), expected, label + ': later funded prefix');
  }
});

test('automatic artifact IDs skip explicit namespace occupancy only on successful registration', () => {
  const model = new FacetyModel();
  model.registerArtifact('root', { id: 'artifact:0' });
  model.registerArtifact('root', { id: 'artifact:1' });
  const before = protocolState(model);
  assert.throws(() => model.registerArtifact('root', { id: 'artifact:0' }), /duplicate artifact/);
  assert.throws(() => model.registerArtifact('root', { faceCount: 0 }), /faceCount/);
  assert.deepEqual(protocolState(model), before);
  assert.equal(model.registerArtifact('root'), 'artifact:2');
  assert.equal(model.registerArtifact('root', { id: 'external' }), 'external');
  assert.equal(model.registerArtifact('root', { id: undefined }), 'artifact:3');
});

test('same subject repeating a face at exactly 24 hours is not a cross-subject collision', () => {
  const model = fixture();
  const artifact = model.registerArtifact('a');
  model.createSelfId('a', artifact);
  model.advanceTo(DAY);
  const repeated = model.createSelfId('a', artifact);
  assert.equal(model.selfId(repeated).collision, false);
});

test('once-per-subject artifact reference rejects boundary replay atomically across faces and terminal states', () => {
  for (const disposition of ['unspent', 'converted', 'cancelled', 'voided', 'debt-repayment']) {
    for (const face of [0, 1]) {
      const model = new FacetyModel({ genesis: ['a', 'b', 'c'], policy: { artifactReuse: 'once-per-subject', guarantorEligibility: 'accepted' } });
      guarantee(model, 'b', 'a');
      if (disposition === 'debt-repayment') model.penalize('a', { fine: 1, halveXp: false });
      const artifact = model.registerArtifact('a', { faceCount: 2, contentHash: 'group' });
      const first = model.createSelfId('a', artifact);
      model.advanceTo(DAY - 1);
      model.rotateKey('a', 'new-key');
      assert.throws(() => model.createSelfId('a', artifact, face), /rolling 24-hour/);
      if (disposition === 'cancelled') model.cancelSelfId('b', first);
      if (disposition === 'voided') model.voidSelfIdChain('a');
      model.advanceTo(DAY);
      if (disposition === 'converted') model.convertToCollector('a', first);
      const before = protocolState(model);
      assert.throws(() => model.createSelfId('a', artifact, face), /already used this artifact/);
      assert.deepEqual(protocolState(model), before, disposition + ', face ' + face);
      const shared = model.createSelfId('b', artifact, 1);
      const conflict = model.createSelfId('c', artifact, 0);
      assert.equal(model.selfId(shared).collision, false);
      assert.equal(model.selfId(first).collision, true);
      assert.equal(model.selfId(conflict).collision, true);
      const fresh = identify(model, 'a');
      assert.equal(model.selfId(fresh).recordedAt, DAY, 'fresh media remains eligible at the exact reward boundary');
      model.advanceTo(DAY + 1);
      assert.throws(() => model.createSelfId('a', artifact), /outside reference window/);
      model.audit();
    }
  }
  assert.throws(() => policyFrom({ artifactReuse: 'ban-group-media' }), /invalid policy/);
});

test('dispute locks block every disposition without resetting age', () => {
  const model = fixture();
  guarantee(model, 'b', 'a');
  const act = identify(model, 'a');
  model.freezeSelfId(act, 'case');
  model.advanceTo(10 * DAY);
  assert.throws(() => model.cancelSelfId('b', act));
  assert.throws(() => model.createInvitation('a', act, 'new'));
  assert.throws(() => model.convertToCollector('a', act));
  assert.throws(() => model.unfreezeSelfId(act, 'other-case'));
  model.unfreezeSelfId(act, 'case');
  model.convertToCollector('a', act);
  assert.equal(model.audit().collector, 1);
});

test('unspent emissions remain cancellable after day seven, but converted rights do not', () => {
  const model = fixture();
  guarantee(model, 'b', 'a');
  const first = identify(model, 'a');
  model.advanceTo(20 * DAY);
  model.cancelSelfId('b', first);
  assert.equal(model.subject('a').xp, 0);
  assert.equal(model.subject('b').xp, 0);
  assert.equal(model.audit().burned, 1);
  assert.throws(() => model.cancelSelfId('b', first));
});

test('guarantees require matching authorization; a unilateral break transfers a fee, not a burn', () => {
  const model = fixture();
  const relation = model.proposeGuarantee('a', 'b');
  assert.equal(model.guarantees.edgeCount, 0);
  assert.throws(() => model.confirmGuarantee('c', relation));
  model.confirmGuarantee('b', relation);
  assert.equal(model.guarantees.edgeCount, 1);
  assert.equal(model.guarantees.edge('b', 'a'), undefined);
  assert.throws(() => model.proposeGuarantee('a', 'b'));
  assert.throws(() => model.endGuarantee('b', relation));
  const reward = identify(model, 'b');
  model.advanceTo(7 * DAY);
  model.convertToCollector('b', reward);
  model.endGuarantee('b', relation);
  assert.equal(model.guarantees.edgeCount, 0);
  assert.equal(model.guaranteeRelations()[0].status, 'ended');
  assert.equal(model.audit().feeVault, 1);
  assert.equal(model.audit().burned, 0);
});

test('graph capacity rejection preserves funded confirmation and termination before collecting fees', () => {
  for (const [operation, counter] of [['confirm', 'nextEdge'], ['confirm', 'revision'], ['end', 'revision']]) {
    for (const room of [0, 1]) {
      const model = fixture({ guaranteeFee: operation === 'confirm' ? 1 : 0 }, ['a', 'b']);
      const act = identify(model, 'a');
      model.advanceTo(7 * DAY);
      model.convertToCollector('a', act);
      const relation = operation === 'confirm' ? model.proposeGuarantee('a', 'b') : guarantee(model, 'a', 'b');
      model.guarantees = DirectedGraph.fromJSON({ ...model.guarantees.toJSON(), [counter]: Number.MAX_SAFE_INTEGER - room });
      const before = protocolState(model);
      const transition = () => operation === 'confirm' ? model.confirmGuarantee('b', relation) : model.endGuarantee('a', relation);
      if (!room) {
        assert.throws(transition, RangeError);
        assert.deepEqual(protocolState(model), before);
        assert.throws(transition, RangeError);
        assert.deepEqual(protocolState(model), before);
      } else {
        transition();
        assert.equal(model.subject('a').liquidFacy, 0);
        assert.equal(model.audit().feeVault, 1);
        assert.equal(model.guaranteeRelations()[0].status, operation === 'confirm' ? 'active' : 'ended');
        assert.equal(Boolean(model.guarantees.edge('a', 'b')), operation === 'confirm');
      }
    }
  }
});

test('admission preflights complete lineage and guarantee capacity before inserting any subject state', () => {
  for (const [field, counter, required] of [['lineage', 'revision', 2], ['lineage', 'nextEdge', 1], ['guarantees', 'revision', 1], ['guarantees', 'nextEdge', 0]]) {
    for (const room of required ? [required - 1, required] : [0]) {
      const model = new FacetyModel({ genesis: ['a', 'b'], policy: { invitationFreezeHours: 0 } });
      guarantee(model, 'b', 'a');
      identify(model, 'b');
      const own = identify(model, 'a');
      model.advanceTo(3 * DAY);
      const invitation = model.createInvitation('a', own, 'new');
      model[field] = DirectedGraph.fromJSON({ ...model[field].toJSON(), [counter]: Number.MAX_SAFE_INTEGER - room });
      const before = protocolState(model);
      if (room < required) {
        assert.throws(() => model.acceptInvitation(invitation, 'new'), RangeError);
        assert.deepEqual(protocolState(model), before);
        assert.throws(() => model.acceptInvitation(invitation, 'new'), RangeError);
        assert.deepEqual(protocolState(model), before);
      } else {
        model.acceptInvitation(invitation, 'new');
        assert.equal(model.size, 3);
        assert.equal(model.invitations()[0].status, 'accepted');
        assert.equal(model.guarantees.hasNode('new'), true);
        assert.equal(model.lineage.edge('a', 'new').to, 'new');
        assert.deepEqual(model.audit(), before.ledger);
      }
    }
  }
});

for (const cancellationAuthority of ['snapshot', 'current']) {
  test('cancellation authority is explicit: ' + cancellationAuthority, () => {
    const model = fixture({ cancellationAuthority });
    const relation = guarantee(model, 'a', 'b');
    const act = identify(model, 'b');
    const feeSource = identify(model, 'a');
    model.advanceTo(7 * DAY);
    model.convertToCollector('a', feeSource);
    model.endGuarantee('a', relation);
    if (cancellationAuthority === 'snapshot') model.cancelSelfId('a', act);
    else assert.throws(() => model.cancelSelfId('a', act));
    model.audit();
  });
}

test('market-transferred FACY cannot replace an own Emitter right for invitations', () => {
  const model = fixture();
  guarantee(model, 'a', 'b');
  const a = identify(model, 'a');
  const c = identify(model, 'c');
  model.advanceTo(7 * DAY);
  model.convertToCollector('a', a);
  model.transferFacy('a', 'b', 1);
  assert.throws(() => model.createInvitation('b', a, 'new'));
  assert.throws(() => model.createInvitation('b', c, 'new'));
  assert.equal(model.subject('b').liquidFacy, 1);
  assert.equal(model.audit().supply, 2);
});

test('XP events preserve halving chronology and cancellation replays rather than subtracts one', () => {
  const model = fixture({ xpFinality: 'immediate' });
  guarantee(model, 'a', 'b');
  const first = identify(model, 'b');
  model.advanceTo(DAY);
  identify(model, 'b');
  model.advanceTo(2 * DAY);
  identify(model, 'b');
  assert.equal(model.subject('a').xp, 3);
  model.penalize('a');
  assert.equal(model.subject('a').xp, 1);
  model.advanceTo(3 * DAY);
  identify(model, 'b');
  assert.equal(model.subject('a').xp, 2);
  model.cancelSelfId('a', first);
  assert.equal(model.subject('a').xp, 2);
  model.penalize('a');
  assert.equal(model.subject('a').xp, 1);
  assert.equal(model.subject('b').xp, 3);
  model.audit();
});

test('fines burn only collectible money and persist as debt across key changes (immediate-burn comparison policy)', () => {
  const model = fixture({ debtRecovery: 'immediate-burn' });
  const first = identify(model, 'a');
  model.advanceTo(7 * DAY);
  model.convertToCollector('a', first);
  assert.deepEqual(model.penalize('a', { fine: 3, halveXp: false }), { collected: 1, debtAdded: 2 });
  assert.equal(model.audit().burned, 1);
  model.rotateKey('a', 'new-key');
  identify(model, 'a');
  assert.equal(model.subject('a').debt, 1);
  model.advanceTo(8 * DAY);
  identify(model, 'a');
  assert.equal(model.subject('a').debt, 0);
  model.advanceTo(9 * DAY);
  identify(model, 'a');
  assert.deepEqual(model.audit(), { minted: 4, burned: 3, supply: 1, emitterVault: 1, collector: 0, feeVault: 0, stakeVault: 0, debt: 0 });
});

test('fines preserve safe aggregate debt and reject overflow before balances, XP or events change', () => {
  for (const target of ['a', 'b']) {
    const model = fixture({ xpFinality: 'immediate', debtRecovery: 'immediate-burn' });
    guarantee(model, 'a', 'b');
    const first = identify(model, 'b');
    model.advanceTo(DAY);
    const second = identify(model, 'b');
    model.advanceTo(7 * DAY);
    model.convertToCollector('b', first);
    model.penalize('a', { fine: Number.MAX_SAFE_INTEGER, halveXp: false });
    assert.equal(model.audit().debt, Number.MAX_SAFE_INTEGER);
    const state = () => ({ subjects: model.subjects(), selfIds: model.selfIds(), events: model.events(), ledger: model.audit() });
    const before = state();
    const fine = target === 'a' ? 1 : 2;
    assert.throws(() => model.penalize(target, { fine, halveXp: true }), RangeError);
    assert.deepEqual(state(), before);
    model.cancelSelfId('a', second);
    assert.equal(model.subject('a').xp, 1);
    assert.equal(model.subject('b').xp, 1);
    model.advanceTo(8 * DAY);
    identify(model, 'a');
    assert.equal(model.audit().debt, Number.MAX_SAFE_INTEGER - 1);
    assert.deepEqual(model.penalize(target, { fine, halveXp: false }), { collected: target === 'a' ? 0 : 1, debtAdded: 1 });
    assert.equal(model.audit().debt, Number.MAX_SAFE_INTEGER);
    assert.ok(Object.values(model.audit()).every(Number.isSafeInteger));
  }
});

test('N28 counts distinct accepted subjects and expires at the rolling boundary', () => {
  const ids = Array.from({ length: 10 }, (_, i) => 's' + i);
  const model = fixture({}, ids);
  guarantee(model, 's1', 's0');
  const acts = ids.map(id => identify(model, id));
  assert.equal(model.requiredGuarantors(), 2);
  model.advanceTo(3 * DAY);
  assert.throws(() => model.createInvitation('s0', acts[0], 'new'));
  guarantee(model, 's2', 's0');
  model.createInvitation('s0', acts[0], 'new');
  identify(model, 's0');
  assert.equal(model.activeCount(), 10);
  model.invalidateIdentity('s9');
  assert.equal(model.activeCount(), 9);
  assert.equal(model.requiredGuarantors(), 1);
  model.advanceTo(28 * DAY);
  assert.equal(model.activeCount(), 1);
  model.advanceTo(31 * DAY);
  assert.equal(model.activeCount(), 0);
  assert.equal(model.requiredGuarantors(), 1);
});

test('default guarantor eligibility depends on activity and cannot mint XP through inactive edges', () => {
  const model = new FacetyModel({ genesis: ['a', 'b'] });
  guarantee(model, 'a', 'b');
  const before = identify(model, 'b');
  assert.deepEqual(model.selfId(before).guarantors, []);
  identify(model, 'a');
  model.advanceTo(DAY);
  const after = identify(model, 'b');
  assert.deepEqual(model.selfId(after).guarantors, ['a']);
});

test('research policies reject unknown knobs and cannot be silently changed mid-run', () => {
  assert.throws(() => policyFrom({ invented: true }));
  assert.throws(() => policyFrom({ toString: 'bad' }));
  assert.throws(() => policyFrom({ xpFinality: 'never' }));
  assert.throws(() => policyFrom({ guaranteeFee: -1 }));
  const model = fixture();
  assert.throws(() => { model.policy = policyFrom(); }, TypeError);
  assert.throws(() => { model.policy.xpFinality = 'immediate'; }, TypeError);
  assert.throws(() => model.advanceTo(-1));
  model.advanceTo(1);
  assert.throws(() => model.advanceTo(0));
});

test('default debt recovery keeps the guarantor veto window before burning a reserved right', () => {
  const model = fixture();
  guarantee(model, 'a', 'b');
  model.penalize('b', { fine: 2, halveXp: false });
  const vetoed = identify(model, 'b');
  assert.equal(model.selfId(vetoed).debtReserved, true);
  assert.equal(model.subject('b').xp, 0);
  assert.deepEqual(model.eligibleEmissions('b', 0), []);
  model.cancelSelfId('a', vetoed);
  assert.equal(model.subject('b').debt, 2);
  model.advanceTo(DAY);
  const first = identify(model, 'b');
  model.advanceTo(2 * DAY);
  const second = identify(model, 'b');
  model.advanceTo(3 * DAY);
  const third = identify(model, 'b');
  assert.equal(model.selfId(third).debtReserved, false, 'only outstanding debt is reserved');
  model.advanceTo(4 * DAY - 1);
  assert.equal(model.subject('b').debt, 2);
  assert.throws(() => model.createInvitation('b', first, 'new'));
  model.advanceTo(4 * DAY);
  assert.equal(model.selfId(first).disposition, 'debt-repayment');
  assert.equal(model.subject('b').debt, 1);
  assert.equal(model.subject('b').xp, 1);
  assert.equal(model.subject('a').xp, 1);
  model.freezeSelfId(second, 'case');
  model.advanceTo(9 * DAY);
  assert.equal(model.selfId(second).status, 'unspent', 'a locked reservation does not settle');
  model.unfreezeSelfId(second, 'case');
  assert.equal(model.selfId(second).disposition, 'debt-repayment');
  assert.equal(model.subject('b').debt, 0);
  assert.equal(model.selfId(third).status, 'unspent');
  model.advanceTo(10 * DAY);
  model.convertToCollector('b', third);
  assert.deepEqual(model.audit(), { minted: 4, burned: 3, supply: 1, emitterVault: 0, collector: 1, feeVault: 0, stakeVault: 0, debt: 0 });
});

test('selected one-day debt reservations preserve maturity, lock, veto and once-only settlement', () => {
  for (const mode of ['mature', 'locked', 'vetoed']) {
    const model = new FacetyModel({ genesis: ['guardian', 'debtor'] });
    identify(model, 'guardian');
    guarantee(model, 'guardian', 'debtor');
    model.penalize('debtor', { fine: 1, halveXp: false });
    const act = identify(model, 'debtor');
    assert.deepEqual(model.selfId(act).guarantors, ['guardian']);
    assert.equal(model.selfId(act).debtReserved, true);
    assert.deepEqual(model.eligibleEmissions('debtor', 0), []);
    model.advanceTo(DAY - 1);
    assert.equal(model.subject('debtor').debt, 1);
    assert.equal(model.subject('debtor').xp, 0);
    assert.equal(model.subject('guardian').xp, 0);
    assert.deepEqual(model.audit(), { minted: 2, burned: 0, supply: 2, emitterVault: 2, collector: 0, feeVault: 0, stakeVault: 0, debt: 1 });
    if (mode === 'locked') model.freezeSelfId(act, 'case');
    if (mode === 'vetoed') model.cancelSelfId('guardian', act);
    model.advanceTo(DAY);
    let settled = act;
    if (mode !== 'mature') {
      assert.equal(model.subject('debtor').debt, 1);
      assert.equal(model.subject('debtor').xp, 0);
      assert.equal(model.subject('guardian').xp, 0);
    }
    if (mode === 'locked') {
      assert.equal(model.selfId(act).status, 'unspent');
      assert.equal(model.selfId(act).debtReserved, true);
      model.advanceTo(2 * DAY);
      assert.equal(model.subject('debtor').debt, 1);
      model.unfreezeSelfId(act, 'case');
      assert.equal(model.selfId(act).recordedAt, 0, 'unlock settles by original age');
    }
    if (mode === 'vetoed') {
      assert.equal(model.selfId(act).status, 'cancelled');
      assert.equal(model.selfId(act).debtReserved, false);
      assert.deepEqual(model.audit(), { minted: 2, burned: 1, supply: 1, emitterVault: 1, collector: 0, feeVault: 0, stakeVault: 0, debt: 1 });
      settled = identify(model, 'debtor');
      assert.equal(model.selfId(settled).debtReserved, true, 'veto frees the reservation without forgiving debt');
      model.advanceTo(2 * DAY - 1);
      assert.equal(model.subject('debtor').debt, 1);
      assert.equal(model.subject('debtor').xp, 0);
      model.advanceTo(2 * DAY);
    }
    assert.equal(model.selfId(settled).status, 'consumed');
    assert.equal(model.selfId(settled).disposition, 'debt-repayment');
    assert.equal(model.subject('debtor').debt, 0);
    assert.equal(model.subject('debtor').xp, 1);
    assert.equal(model.subject('guardian').xp, 1);
    assert.deepEqual(model.audit(), { minted: mode === 'vetoed' ? 3 : 2, burned: mode === 'vetoed' ? 2 : 1,
      supply: 1, emitterVault: 1, collector: 0, feeVault: 0, stakeVault: 0, debt: 0 });
    const snapshot = { now: model.now, ...protocolState(model) };
    model.advanceTo(model.now);
    assert.deepEqual({ now: model.now, ...protocolState(model) }, snapshot);
  }
});

test('immediate-burn debt recovery removes the veto window and is only a comparison policy', () => {
  const model = fixture({ debtRecovery: 'immediate-burn' });
  guarantee(model, 'a', 'b');
  model.penalize('b', { fine: 1, halveXp: false });
  const act = identify(model, 'b');
  assert.equal(model.selfId(act).disposition, 'debt-repayment');
  assert.equal(model.subject('a').xp, 1);
  assert.throws(() => model.cancelSelfId('a', act), /spent/);
});

test('mechanism ablations are explicit and leave cancellation authority intact', () => {
  assert.throws(() => new FacetyModel({ ablations: { unknown: true } }), /unknown ablation/);
  assert.throws(() => new FacetyModel({ ablations: { fixedInvitationThreshold: 0 } }), RangeError);
  const model = new FacetyModel({ genesis: ['a', 'b'], policy: { guarantorEligibility: 'accepted' }, ablations: { withholdGuarantorXp: true, fixedInvitationThreshold: 3 } });
  assert.equal(model.requiredGuarantors(), 3);
  guarantee(model, 'a', 'b');
  const act = identify(model, 'b');
  assert.deepEqual(model.selfId(act).xpRecipients, ['b']);
  assert.deepEqual(model.selfId(act).guarantors, ['a']);
  model.advanceTo(7 * DAY);
  model.convertToCollector('b', act);
  assert.equal(model.subject('a').xp, 0);
  assert.equal(model.subject('b').xp, 1);
  const vetoed = identify(model, 'b');
  model.cancelSelfId('a', vetoed);
});

test('the Council is an XP leaderboard among currently active subjects by default', () => {
  const model = fixture({ councilSize: 2 });
  assert.deepEqual(model.council(), [], 'nobody has an uncancelled Self-ID in the last 28 days');
  const a = identify(model, 'a');
  identify(model, 'b');
  model.advanceTo(7 * DAY);
  model.convertToCollector('a', a);
  assert.deepEqual(model.council(), [{ id: 'a', xp: 1 }, { id: 'b', xp: 0 }]);
  model.advanceTo(28 * DAY);
  assert.deepEqual(model.council(), [], 'members leave when their activity window expires');
  identify(model, 'c');
  assert.deepEqual(model.council(), [{ id: 'c', xp: 0 }]);
  assert.deepEqual(fixture({ councilSize: 2, councilEligibility: 'accepted' }).council().map(member => member.id), ['a', 'b']);
});

test('voiding a Self-ID chain burns unspent rights and revokes XP from the subject and its guarantors', () => {
  const model = fixture();
  guarantee(model, 'a', 'b');
  const first = identify(model, 'b');
  model.advanceTo(7 * DAY);
  model.convertToCollector('b', first);
  const second = identify(model, 'b');
  model.advanceTo(8 * DAY);
  const third = identify(model, 'b');
  assert.equal(model.subject('a').xp, 1);
  assert.equal(model.subject('b').xp, 1);
  const before = model.audit();
  const result = model.voidSelfIdChain('b');
  assert.deepEqual(result, { acts: 3, burnedRights: 2, xpRecipients: ['b', 'a'] });
  assert.equal(model.subject('a').xp, 0);
  assert.equal(model.subject('b').xp, 0);
  assert.equal(model.selfId(second).status, 'cancelled');
  assert.equal(model.selfId(third).disposition, 'adjudicated-void');
  assert.equal(model.selfId(first).status, 'converted', 'converted coins are not un-minted; a fine recovers them');
  const after = model.audit();
  assert.equal(after.burned, before.burned + 2);
  assert.equal(after.emitterVault, before.emitterVault - 2);
  const partial = fixture();
  const kept = identify(partial, 'c');
  partial.advanceTo(DAY);
  const bad = identify(partial, 'c');
  assert.equal(partial.voidSelfIdChain('c', { fromAct: bad }).acts, 1);
  assert.equal(partial.selfId(kept).status, 'unspent');
  assert.throws(() => partial.voidSelfIdChain('c', { fromAct: 'self-id:999' }), /not in the subject chain/);
});

test('frozen invitations can be cancelled by the creator\'s guarantors, and revoking XP on link break is a policy', () => {
  const model = fixture({ invitationFreezeHours: 3 * DAY, linkBreakXp: 'revoke' });
  guarantee(model, 'a', 'b');
  const own = identify(model, 'b');
  model.advanceTo(3 * DAY);
  const invitation = model.createInvitation('b', own, 'fake');
  assert.equal(model.subject('a').xp, 1);
  assert.throws(() => model.acceptInvitation(invitation, 'fake'), /frozen/);
  assert.throws(() => model.cancelInvitation('c', invitation), /authority/);
  model.cancelInvitation('a', invitation);
  assert.equal(model.invitations()[0].status, 'cancelled');
  assert.equal(model.subject('a').xp, 0);
  assert.equal(model.subject('b').xp, 0);
  model.advanceTo(6 * DAY);
  assert.throws(() => model.acceptInvitation(invitation, 'fake'));
  const second = identify(model, 'b');
  model.advanceTo(9 * DAY);
  const late = model.createInvitation('b', second, 'friend');
  model.advanceTo(12 * DAY);
  assert.throws(() => model.cancelInvitation('a', late), /not cancellable/);
  model.acceptInvitation(late, 'friend');
  assert.equal(model.subject('a').xp, 1);
  assert.throws(() => model.endGuarantee('a', model.guaranteeRelations()[0].id), /fee/);
  const funded = fixture({ linkBreakXp: 'revoke' });
  const link = guarantee(funded, 'a', 'b');
  const paid = identify(funded, 'a');
  const earned = identify(funded, 'b');
  funded.advanceTo(7 * DAY);
  funded.convertToCollector('a', paid);
  funded.convertToCollector('b', earned);
  assert.equal(funded.subject('a').xp, 2);
  const pending = identify(funded, 'b');
  funded.endGuarantee('a', link);
  assert.equal(funded.subject('a').xp, 1, 'XP earned through the ended relation is revoked');
  funded.advanceTo(14 * DAY);
  funded.convertToCollector('b', pending);
  assert.equal(funded.subject('a').xp, 1, 'snapshot rights no longer credit a departed guarantor');
  assert.equal(funded.subject('b').xp, 2);
});

test('spend and conversion maturity are policies; the owner proposal uses one day for each', () => {
  const model = fixture({ spendMaturityHours: DAY, conversionMaturityHours: DAY, invitationFreezeHours: DAY });
  guarantee(model, 'b', 'a');
  const act = identify(model, 'a');
  model.advanceTo(DAY - 1);
  assert.throws(() => model.createInvitation('a', act, 'n'), /mature/);
  assert.deepEqual(model.eligibleEmissions('a'), []);
  model.advanceTo(DAY);
  assert.deepEqual(model.eligibleEmissions('a'), [act]);
  const invitation = model.createInvitation('a', act, 'n');
  assert.throws(() => model.acceptInvitation(invitation, 'n'), /frozen/);
  model.advanceTo(2 * DAY);
  model.acceptInvitation(invitation, 'n');
  const other = identify(model, 'b');
  model.advanceTo(3 * DAY);
  model.convertToCollector('b', other);
  assert.throws(() => policyFrom({ spendMaturityHours: -1 }), RangeError);
});

test('selected defaults: one-day spend, conversion and invitation windows, XP revoked on link break, active Council', () => {
  const policy = policyFrom();
  assert.equal(policy.spendMaturityHours, DAY);
  assert.equal(policy.conversionMaturityHours, DAY);
  assert.equal(policy.invitationFreezeHours, DAY);
  assert.equal(policy.linkBreakXp, 'revoke');
  assert.equal(policy.councilEligibility, 'active');
  assert.equal(policy.debtRecovery, 'reserve-until-mature');
});

test('the same media content cannot be registered twice, and transfers carry a public memo', () => {
  const model = fixture();
  model.registerArtifact('a', { contentHash: 'sha256:photo' });
  assert.throws(() => model.registerArtifact('b', { contentHash: 'sha256:photo' }), /duplicate media/);
  model.registerArtifact('b', { contentHash: 'sha256:other' });
  const act = identify(model, 'a');
  model.advanceTo(7 * DAY);
  model.convertToCollector('a', act);
  model.transferFacy('a', 'b', 1, 'challenge-reward');
  assert.equal(model.events().at(-1).memo, 'challenge-reward');
  assert.throws(() => model.transferFacy('b', 'a', 1, ''), TypeError);
});

function participationState(model) { return { ...protocolState(model), participations: model.disputeParticipations() }; }

test('D77 trusted activity port blocks otherwise-valid new operations for both parties, not uninvolved funded life', () => {
  const model = new FacetyModel({ genesis: ['a', 'b', 'c', 'd'], policy: { xpFinality: 'maturity', guarantorEligibility: 'accepted' } });
  guarantee(model, 'b', 'a'); guarantee(model, 'c', 'b');
  const acts = Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, identify(model, id)]));
  const outgoing = model.proposeGuarantee('a', 'c'), incoming = model.proposeGuarantee('d', 'b');
  model.advanceTo(DAY); model.convertToCollector('d', acts.d);
  const artifacts = Object.fromEntries(['a', 'b'].map(id => [id, model.registerArtifact(id)]));
  model.beginDisputeParticipation('case:A', ['a', 'b']);
  for (const action of [() => model.createSelfId('a', artifacts.a), () => model.createSelfId('b', artifacts.b),
    () => model.createInvitation('a', acts.a, 'newA'), () => model.createInvitation('b', acts.b, 'newB'),
    () => model.proposeGuarantee('a', 'd'), () => model.proposeGuarantee('b', 'd'),
    () => model.confirmGuarantee('c', outgoing), () => model.confirmGuarantee('b', incoming)]) {
    const before = participationState(model);
    assert.throws(action, /open-dispute activity restriction/);
    assert.deepEqual(participationState(model), before);
  }
  guarantee(model, 'd', 'c'); identify(model, 'c');
  const invitation = model.createInvitation('c', acts.c, 'newC');
  model.advanceTo(2 * DAY); model.acceptInvitation(invitation, 'newC');
  assert.equal(model.subject('newC').identityStatus, 'accepted');
  assert.equal(model.disputeParticipations()[0].closedAt, null);
  model.endDisputeParticipation('case:A');
  for (const id of ['a', 'b']) identify(model, id);
  model.confirmGuarantee('c', outgoing); model.confirmGuarantee('b', incoming);
  assert.equal(model.selfIds().filter(act => act.subject === 'a').length, 2, 'no catch-up issuance for paused days');
  model.audit();
});

test('D77 overlapping activity cases release only their own membership and time/key changes cannot bypass remaining restrictions', () => {
  const model = new FacetyModel({ genesis: ['a', 'b', 'c'], policy: { xpFinality: 'maturity' } });
  model.beginDisputeParticipation('case:A', ['a', 'b']); model.beginDisputeParticipation('case:B', ['a', 'c']);
  model.endDisputeParticipation('case:A'); identify(model, 'b');
  const artifact = model.registerArtifact('a');
  assert.throws(() => model.createSelfId('a', artifact), /activity restriction/);
  model.advanceTo(DAY); model.rotateKey('a', 'a:new-key');
  assert.throws(() => model.createSelfId('a', artifact), /activity restriction/);
  model.endDisputeParticipation('case:B'); identify(model, 'a'); identify(model, 'c');
  assert.ok(model.disputeParticipations().every(row => row.closedAt !== null));
  const before = participationState(model);
  assert.throws(() => model.endDisputeParticipation('case:B'), /not open/);
  assert.throws(() => model.beginDisputeParticipation('case:A', ['a', 'b']), /repeated/);
  assert.deepEqual(participationState(model), before); model.audit();
});

test('D77 roster preflight and immutable views are inert, and invalid batches never partially restrict a subject', () => {
  const model = new FacetyModel({ genesis: ['a', 'b', 'c'] }), before = participationState(model);
  for (const [id, subjects] of [['', ['a', 'b']], ['case', []], ['case', ['a']], ['case', ['a', 'a']], ['case', ['a', 'missing']]]) {
    assert.throws(() => model.beginDisputeParticipation(id, subjects));
    assert.deepEqual(participationState(model), before);
  }
  const subjects = ['a', 'b'], plan = model.previewDisputeParticipation('case', subjects);
  assert.throws(() => plan.subjects.push('c'), TypeError); assert.deepEqual(participationState(model), before);
  model.beginDisputeParticipation('case', subjects); subjects.push('c');
  assert.deepEqual(model.disputeParticipations()[0].subjects, ['a', 'b']);
  assert.throws(() => model.disputeParticipations()[0].subjects.push('c'), TypeError);
  assert.throws(() => model.events().at(-1).subjects.push('c'), TypeError);
  identify(model, 'c'); model.audit();
});
