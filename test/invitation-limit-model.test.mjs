import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';

function fixture(limit, xpFinality = 'maturity', extraPolicy = {}) {
  const model = new FacetyModel({ genesis: ['creator', 'other', 'support'], invitationLimit: limit,
    policy: { guarantorEligibility: 'accepted', xpFinality, ...extraPolicy } });
  for (const id of ['creator', 'other']) {
    const relation = model.proposeGuarantee('support', id);
    model.confirmGuarantee(id, relation);
  }
  return model;
}
function fund(model, count) {
  const sources = [];
  for (let day = 0; day < count; day++) {
    model.advanceTo(day * DAY);
    sources.push(model.createSelfId('creator', model.registerArtifact('creator')));
  }
  model.advanceTo(count * DAY);
  return sources;
}
function state(model) {
  return { subjects: model.subjects(), acts: model.selfIds(), invitations: model.invitations(), events: model.events(), ledger: model.audit() };
}

test('experimental arm is closed, immutable and fixed for the entire model, with no default migration', () => {
  const raw = { P: 3, b: 2 }, model = fixture(raw);
  raw.b = 0;
  assert.deepEqual(model.invitationLimit, { P: 3, b: 2 });
  assert.throws(() => { model.invitationLimit.b = 0; }, TypeError);
  assert.throws(() => { model.invitationLimit = null; }, TypeError);
  const legacy = fixture(null);
  assert.equal(legacy.invitationLimit, null);
  assert.equal(Object.keys(legacy).includes('invitationLimit'), false);
  for (const limit of [{}, [], false, { P: 0, b: 1 }, { P: -1, b: 1 }, { P: 0.5, b: 1 },
    { P: Number.MAX_SAFE_INTEGER, b: 1 }, { P: 1, b: -1 }, { P: 1, b: 0.5 }, { P: 1, b: 1, claim_requires: false }]) {
    assert.throws(() => fixture(limit));
  }
});

test('cooldown is after actual use per SubjectId, survives key rotation/veto, and never banks unused slots', () => {
  for (const P of [1, 3, 7]) {
    const model = fixture({ P, b: 0 });
    const first = model.createInvitation('creator', null, 'first');
    model.createInvitation('other', [], 'independent');
    model.cancelInvitation('support', first);
    model.rotateKey('creator', 'rotated');
    model.advanceTo(P * DAY - 1);
    assert.throws(() => model.createInvitation('creator', [], 'too-soon'), /cooldown/);
    model.advanceTo(P * DAY);
    model.createInvitation('creator', [], 'boundary');
    model.advanceTo(10 * P * DAY);
    model.createInvitation('creator', [], 'after-pause');
    assert.throws(() => model.createInvitation('creator', [], 'no-bank'), /cooldown/);
    assert.equal(model.ledger().minted, 0);
    model.audit();
  }
});

test('exact multi-source own emission burn and deeply immutable funding receipts in all XP modes', () => {
  for (const xp of ['terminal', 'immediate', 'maturity']) for (const b of [0, 1, 3, 7, 14]) {
    const model = fixture({ P: 7, b }, xp);
    const sources = fund(model, b);
    const expected = [...sources];
    model.createInvitation('creator', sources, 'target');
    sources.length = 0;
    const receipt = model.invitations()[0];
    assert.deepEqual(receipt.sourceSelfIds, expected);
    assert.equal(receipt.sourceSelfId, expected[0] ?? null);
    assert.equal(model.ledger().burned, b);
    assert.equal(model.ledger().emitterVault, 0);
    assert.equal(model.subject('creator').xp, b);
    assert.equal(model.subject('support').xp, b);
    assert.throws(() => receipt.sourceSelfIds.push('forged'), TypeError);
    assert.throws(() => { receipt.invitationLimit.b = 0; }, TypeError);
    model.audit();
  }
});

test('multi-source/zero-source invitation veto preserves burned principal and mode-specific source XP', () => {
  for (const xp of ['terminal', 'immediate', 'maturity']) for (const b of [0, 3]) {
    const model = fixture({ P: 3, b }, xp);
    const sources = fund(model, b);
    const invitation = model.createInvitation('creator', sources, 'target');
    model.cancelInvitation('support', invitation);
    assert.equal(model.invitations()[0].status, 'cancelled');
    assert.equal(model.ledger().burned, b);
    assert.equal(model.subject('creator').xp, xp === 'maturity' ? b : 0);
    for (const id of sources) assert.equal(model.selfId(id).disposition, 'invitation-cancelled');
    assert.throws(() => model.createInvitation('creator', [], 'retry'), /cooldown/);
    model.audit();
  }
});

test('aggregate funding preflight rejects duplicates, bad ownership/age/lock/disposition/target without partial burn or IDs', () => {
  const setup = () => {
    const model = fixture({ P: 3, b: 2 }, 'terminal');
    const foreign = model.createSelfId('other', model.registerArtifact('other'));
    const sources = fund(model, 3);
    const immature = model.createSelfId('creator', model.registerArtifact('creator'));
    return { model, sources, foreign, immature };
  };
  const badInputs = [
    ({ sources }) => [sources.slice(0, 1), 'target'],
    ({ sources }) => [[sources[0], sources[0]], 'target'],
    ({ sources }) => [[sources[0], 'missing'], 'target'],
    ({ sources, foreign }) => [[sources[0], foreign], 'target'],
    ({ sources, immature }) => [[sources[0], immature], 'target'],
    ({ sources }) => [sources.slice(0, 2), 'creator'],
    ({ sources }) => [sources.slice(0, 2), ''],
    ({ model, sources }) => { model.freezeSelfId(sources[2], 'lock'); return [[sources[0], sources[2]], 'target']; },
    ({ model, sources }) => { model.convertToCollector('creator', sources[2]); return [[sources[0], sources[2]], 'target']; },
    ({ sources }) => { const sparse = new Array(2); sparse[0] = sources[0]; return [sparse, 'target']; },
  ];
  for (const makeInput of badInputs) {
    const setupValue = setup(), { model, sources } = setupValue;
    const args = makeInput(setupValue), before = state(model);
    assert.throws(() => model.createInvitation('creator', ...args));
    assert.deepEqual(state(model), before);
    const control = setup();
    makeInput(control);
    assert.equal(model.createInvitation('creator', sources.slice(0, 2), 'good'),
      control.model.createInvitation('creator', control.sources.slice(0, 2), 'good'));
    model.audit();
  }
});

test('experimental funding requires at least24h maturity even with a legacy shorter spend policy', () => {
  const model = fixture({ P: 1, b: 1 }, 'terminal', { spendMaturityHours: 0 });
  const source = model.createSelfId('creator', model.registerArtifact('creator'));
  assert.throws(() => model.createInvitation('creator', source, 'early'), /mature/);
  model.advanceTo(DAY);
  model.createInvitation('creator', source, 'mature');
  model.audit();
});

test('zero cost/no limit permits arbitrary same-hour creation, but does not remove support, identity or invitation freeze', () => {
  const model = fixture({ P: null, b: 0 });
  const invitations = [];
  for (let i = 0; i < 64; i++) invitations.push(model.createInvitation('creator', null, 'target-' + i));
  assert.equal(model.ledger().minted, 0);
  assert.equal(model.ledger().burned, 0);
  assert.throws(() => model.acceptInvitation(invitations[0], 'target-0'), /frozen/);
  model.advanceTo(DAY);
  model.acceptInvitation(invitations[0], 'target-0');
  assert.throws(() => model.createInvitation('support', null, 'no-guarantor'), /guarantors/);
  model.invalidateIdentity('other');
  assert.throws(() => model.createInvitation('other', null, 'invalidated'), /not accepted/);
  model.audit();
});

test('D59 single-source correction of a multi-source invitation never reburns its principal', () => {
  const model = fixture({ P: 3, b: 3 });
  const sources = fund(model, 3);
  const invitation = model.createInvitation('creator', sources, 'target');
  const result = model.resolveSelfId(sources[0], { caseId: 'correct', initiator: 'creator', upheld: true });
  assert.equal(result.recovery.alreadyBurned, 1);
  assert.equal(result.recovery.emitterBurn, 0);
  assert.equal(model.ledger().burned, 3);
  assert.equal(model.subject('creator').xp, 2);
  assert.equal(model.invitations()[0].status, 'open');
  model.cancelInvitation('support', invitation);
  assert.equal(model.subject('creator').xp, 2);
  assert.equal(model.ledger().burned, 3);
  model.audit();
});
