import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';

function fixture(policy = {}, ablations = {}) {
  return new FacetyModel({ genesis: ['a', 'b', 'c'], policy: { guarantorEligibility: 'accepted', ...policy }, ablations });
}
function link(model, from = 'b', to = 'a') {
  const id = model.proposeGuarantee(from, to);
  model.confirmGuarantee(to, id);
  return id;
}
function identify(model, id = 'a') { return model.createSelfId(id, model.registerArtifact(id)); }
function cash(model, id = 'b') {
  const act = identify(model, id);
  model.advanceTo(model.now + DAY);
  model.convertToCollector(id, act);
  return act;
}
function state(model) {
  return { subjects: model.subjects(), acts: model.selfIds(), relations: model.guaranteeRelations(), invitations: model.invitations(), events: model.events(), ledger: model.audit() };
}
// Independent exact arithmetic over public Self-ID state, not the recipient index or XP cache.
function check(model) {
  for (const subject of model.subjects()) {
    let numerator = 0n;
    const sources = [];
    for (const act of model.selfIds()) {
      if (act.xpCredit === null) continue;
      for (const receipt of act.xpCredit.recipients) {
        if (receipt.subject !== subject.id) continue;
        sources.push(act.id);
        if (act.xpCredit.revokedAt === null && receipt.revokedAt === null) numerator += 1n << BigInt(receipt.halvingsBefore);
      }
    }
    const expected = Number(numerator >> BigInt(subject.xpHalvings));
    assert.equal(subject.xp, expected, subject.id);
    const index = model.xpProvenance(subject.id);
    assert.equal(index.xp, expected);
    assert.equal(index.halvings, subject.xpHalvings);
    assert.deepEqual(index.credits.map(credit => credit.selfId).sort(), sources.sort());
  }
  model.audit();
}

test('Self-ID stores actual credited recipients separately from creation-time guarantors and potential recipients', () => {
  for (const mode of ['keep', 'revoke']) {
    const model = fixture({ linkBreakXp: mode });
    cash(model);
    const relation = link(model);
    const act = identify(model);
    assert.equal(model.selfId(act).xpCredit, null);
    assert.deepEqual(model.selfId(act).guarantors, ['b']);
    assert.deepEqual(model.selfId(act).xpRecipients, ['a', 'b']);
    model.endGuarantee('b', relation);
    model.advanceTo(2 * DAY);
    model.convertToCollector('a', act);
    const credit = model.selfId(act).xpCredit;
    assert.equal(credit.at, 2 * DAY);
    assert.deepEqual(credit.recipients.map(row => [row.subject, row.role]), mode === 'keep' ? [['a', 'subject'], ['b', 'guarantor']] : [['a', 'subject']]);
    assert.equal(model.selfId(act).xpCredited, true);
    assert.throws(() => model.convertToCollector('a', act), /spent/);
    check(model);
  }
});

test('relation revocation retains the original receipt and cannot resurrect it on re-link', () => {
  const model = fixture();
  cash(model);
  const relation = link(model);
  const act = identify(model);
  model.advanceTo(2 * DAY);
  model.convertToCollector('a', act);
  const retained = model.selfId(act);
  model.endGuarantee('b', relation);
  const old = model.selfId(act).xpCredit.recipients.find(row => row.subject === 'b');
  assert.equal(old.revokedAt, 2 * DAY);
  assert.equal(old.revocation, 'guarantee-ended');
  assert.equal(retained.xpCredit.recipients[1].revokedAt, null);
  link(model);
  assert.equal(model.subject('b').xp, 1);
  const next = identify(model);
  model.advanceTo(3 * DAY);
  model.convertToCollector('a', next);
  assert.equal(model.subject('b').xp, 2);
  assert.equal(model.selfId(act).xpCredit.recipients[1].revokedAt, 2 * DAY);
  check(model);
});

test('cancellation and invitation veto invalidate the source without deleting issued receipts or crediting twice', () => {
  const immediate = fixture({ xpFinality: 'immediate' });
  link(immediate);
  const cancelled = identify(immediate);
  immediate.cancelSelfId('b', cancelled);
  assert.equal(immediate.selfId(cancelled).xpCredit.revokedAt, 0);
  assert.equal(immediate.selfId(cancelled).xpCredit.revocation, 'self-id-cancelled');
  assert.equal(immediate.selfId(cancelled).xpCredit.recipients.length, 2);
  assert.throws(() => immediate.cancelSelfId('b', cancelled), /spent/);
  check(immediate);
  const model = fixture();
  link(model);
  const act = identify(model);
  model.advanceTo(DAY);
  const invitation = model.createInvitation('a', act, 'new');
  model.cancelInvitation('b', invitation);
  assert.equal(model.selfId(act).xpCredit.revocation, 'invitation-cancelled');
  assert.equal(model.selfId(act).xpCredit.at, DAY);
  assert.equal(model.selfId(act).xpCredited, true);
  assert.equal(model.subject('a').xp, 0);
  assert.equal(model.subject('b').xp, 0);
  check(model);
});

test('all 256 credit/halving histories and subsequent source revocations match exact public-state reconstruction', () => {
  let partitions = 0;
  for (let bits = 0; bits < 256; bits++) {
    const model = fixture({ xpFinality: 'immediate' });
    link(model);
    const acts = [];
    for (let step = 0; step < 8; step++) {
      model.advanceTo(step * DAY);
      if (bits & (1 << step)) acts.push(identify(model));
      else model.penalize('a', { fine: 0, halveXp: true });
      check(model);
    }
    for (let i = 0; i < acts.length; i += 2) {
      model.cancelSelfId('b', acts[i]);
      check(model);
    }
    partitions++;
  }
  assert.equal(partitions, 256);
});

test('same-hour ordering, pooled fractional credits and very old credits survive neither rounding nor source-history ambiguity', () => {
  const model = fixture({ xpFinality: 'immediate' });
  link(model);
  const first = identify(model);
  model.advanceTo(DAY);
  const second = identify(model);
  model.penalize('a', { fine: 0 });
  assert.equal(model.subject('a').xp, 1); // Two pre-penalty credits, not two separately rounded halves.
  model.cancelSelfId('b', first);
  assert.equal(model.subject('a').xp, 0);
  for (let i = 0; i < 1100; i++) model.penalize('a', { fine: 0 });
  model.advanceTo(2 * DAY);
  const newest = identify(model);
  model.penalize('a', { fine: 0 });
  assert.equal(model.selfId(second).xpCredit.recipients[0].halvingsBefore, 0);
  assert.equal(model.selfId(newest).xpCredit.recipients[0].halvingsBefore, 1101);
  assert.equal(model.subject('a').xp, 0);
  check(model);
});

test('withheld guarantor XP remains a counterfactual with author credit and historical guarantors distinct', () => {
  const model = fixture({ xpFinality: 'immediate' }, { withholdGuarantorXp: true });
  link(model);
  const act = identify(model);
  assert.deepEqual(model.selfId(act).guarantors, ['b']);
  assert.deepEqual(model.selfId(act).xpCredit.recipients.map(row => row.subject), ['a']);
  assert.equal(model.xpProvenance('b').credits.length, 0);
  model.voidSelfIdChain('a');
  assert.equal(model.selfId(act).xpCredit.revocation, 'adjudicated-void');
  check(model);
});

test('public provenance is deeply immutable, pure and does not allocate future IDs or mutate financial state', () => {
  const models = [fixture({ xpFinality: 'immediate' }), fixture({ xpFinality: 'immediate' })];
  const acts = models.map(model => { link(model); return identify(model); });
  const before = state(models[0]);
  const source = models[0].selfId(acts[0]);
  const index = models[0].xpProvenance('a');
  assert.throws(() => { source.xpCredit.recipients[0].halvingsBefore = 99; }, TypeError);
  assert.throws(() => { source.xpCredit.revokedAt = 0; }, TypeError);
  assert.throws(() => { index.credits[0].revocation = 'forged'; }, TypeError);
  assert.throws(() => index.credits.push({}), TypeError);
  assert.throws(() => models[0].xpProvenance('absent'), /unknown/);
  assert.deepEqual(state(models[0]), before);
  for (const model of models) { model.advanceTo(DAY); identify(model); }
  assert.deepEqual(state(models[0]), state(models[1]));
});

test('ordinary maturity fixes initial recipients through instant exit, excludes late joiners and credits at24h without withdrawal', () => {
  const model = fixture({ xpFinality: 'maturity' });
  cash(model);
  const relation = link(model);
  const act = identify(model);
  model.advanceTo(DAY + 1);
  model.endGuarantee('b', relation);
  link(model, 'c');
  model.advanceTo(2 * DAY - 1);
  assert.equal(model.selfId(act).xpCredit, null);
  assert.throws(() => model.cancelSelfId('c', act), /authority/);
  model.advanceTo(2 * DAY);
  assert.deepEqual(model.selfId(act).xpCredit.recipients.map(row => row.subject), ['a', 'b']);
  assert.equal(model.selfId(act).xpCredit.at, 2 * DAY);
  assert.equal(model.selfId(act).status, 'unspent');
  assert.equal(model.subject('a').liquidFacy, 0);
  assert.equal(model.subject('a').xp, 1);
  assert.equal(model.subject('b').xp, 2);
  assert.equal(model.subject('c').xp, 0);
  assert.throws(() => model.cancelSelfId('b', act), /expired/);
  model.convertToCollector('a', act);
  assert.equal(model.subject('a').xp, 1);
  assert.equal(model.subject('b').xp, 2);
  check(model);
});

test('an initial guarantor retains pre-maturity veto after exit and prevents everyone’s credit', () => {
  const model = fixture({ xpFinality: 'maturity' });
  cash(model);
  const relation = link(model);
  const act = identify(model);
  model.advanceTo(DAY + 1);
  model.endGuarantee('b', relation);
  model.cancelSelfId('b', act);
  model.advanceTo(3 * DAY);
  assert.equal(model.selfId(act).xpCredit, null);
  assert.equal(model.subject('a').xp, 0);
  assert.equal(model.subject('b').xp, 1);
  check(model);
});

test('jumped clocks retain exact ordinary credit times and invitation veto does not revoke matured source XP', () => {
  const model = fixture({ xpFinality: 'maturity' });
  link(model);
  const act = identify(model);
  model.advanceTo(100);
  assert.equal(model.selfId(act).xpCredit.at, DAY);
  assert.equal(model.subject('a').liquidFacy, 0);
  const invitation = model.createInvitation('a', act, 'new');
  model.cancelInvitation('b', invitation);
  assert.equal(model.selfId(act).xpCredit.revokedAt, null);
  assert.equal(model.subject('a').xp, 1);
  assert.equal(model.subject('b').xp, 1);
  check(model);
});

test('unsupported frozen/debt/identity maturity fails before clock or partial XP mutation rather than selecting OPEN rules', () => {
  for (const kind of ['frozen', 'debt', 'identity']) {
    const model = fixture({ xpFinality: 'maturity' });
    identify(model, 'c');
    const act = identify(model);
    if (kind === 'frozen') model.freezeSelfId(act, 'lock');
    if (kind === 'debt') model.penalize('a', { fine: 1, halveXp: false });
    if (kind === 'identity') model.invalidateIdentity('a');
    const before = state(model);
    assert.throws(() => model.advanceTo(DAY), /contract/);
    assert.equal(model.now, 0);
    assert.deepEqual(state(model), before);
    if (kind === 'frozen') {
      model.unfreezeSelfId(act, 'lock');
      model.advanceTo(DAY);
      const matured = state(model);
      assert.throws(() => model.freezeSelfId(act, 'late'), /contract/);
      assert.deepEqual(state(model), matured);
    }
    check(model);
  }
  for (const policy of [{ cancellationAuthority: 'current' }, { debtRecovery: 'immediate-burn' }, { spendMaturityHours: 0 }, { conversionMaturityHours: 0 }]) {
    assert.throws(() => fixture({ xpFinality: 'maturity', ...policy }), /maturity XP requires/);
  }
});
