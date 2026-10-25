import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';
import { invitationLimitArms, invitationCapacityPrior } from '../studies/2026-10-25-invitation-limits/contract.mjs';
import { capacityControl } from '../studies/2026-10-25-invitation-limits/capacity-controls.mjs';

function bank(days) {
  const model = new FacetyModel({ genesis: ['creator', 'support'], policy: { xpFinality: 'maturity', guarantorEligibility: 'accepted' } });
  const relation = model.proposeGuarantee('support', 'creator');
  model.confirmGuarantee('creator', relation);
  const rights = [];
  for (let day = 0; day < days; day++) {
    model.advanceTo(day * DAY);
    rights.push(model.createSelfId('creator', model.registerArtifact('creator')));
  }
  model.advanceTo(days * DAY);
  return { model, rights };
}

test('ten immutable requested primary arms keep the unrestricted control distinct from zero burn', () => {
  const arms = invitationLimitArms();
  assert.equal(arms.length, 10);
  assert.equal(new Set(arms.map(arm => arm.id)).size, 10);
  assert.deepEqual(arms.find(arm => arm.id === 'A'), { id: 'A', P: 1, b: 1 });
  for (const P of [3, 7]) {
    assert.deepEqual(arms.find(arm => arm.id === 'B-' + P), { id: 'B-' + P, P, b: 0 });
    assert.deepEqual(arms.filter(arm => arm.id.startsWith('H-' + P + '-')).map(arm => arm.b), [1, P, 2 * P]);
  }
  assert.deepEqual(arms.at(-1), { id: '0', P: null, b: 0 });
  assert.throws(() => { arms[0].P = 7; }, TypeError);
  assert.throws(() => arms.push({}), TypeError);
  assert.equal(invitationLimitArms()[0].P, 1);
});

test('analytic prior separates cooldown-bound, co-binding and strictly emission-bound regimes', () => {
  for (const P of [1, 3, 7]) for (const E of [0.5, 1, 2]) for (const b of [0, 1, P, 2 * P, 4 * P]) {
    const value = invitationCapacityPrior({ P, b, E });
    assert.equal(value.invitationsPerDay, Math.min(1 / P, b === 0 ? Infinity : E / b));
    assert.equal(value.unbounded, false);
    assert.equal(value.limiter, b === P * E ? 'co-binding' : b < P * E ? 'cooldown' : 'own-emission');
  }
  assert.deepEqual(invitationCapacityPrior({ P: null, b: 0, E: 0 }), { invitationsPerDay: null, unbounded: true, limiter: 'none' });
  assert.equal(invitationCapacityPrior({ P: null, b: 2, E: 1 }).invitationsPerDay, 0.5);
  assert.equal(invitationCapacityPrior({ P: 7, b: 1, E: 0 }).invitationsPerDay, 0);
});

test('prior refuses implicit defaults, malformed periods and unmodeled fields', () => {
  for (const value of [null, [], {}, { P: 0, b: 1, E: 1 }, { P: -1, b: 1, E: 1 }, { P: 1, b: -1, E: 1 },
    { P: 1, b: 0.5, E: 1 }, { P: 1, b: 1, E: Infinity }, { P: 1, b: 1, E: -1 }, { P: 1, b: 1, E: 1, price: 0.5 }]) {
    assert.throws(() => invitationCapacityPrior(value));
  }
});

test('native bounded arms reproduce independent finite-prefix counts and asymptotic prior at three realized emission rates', t => {
  const days = 504;
  for (const q of [1, 2, 3]) for (const arm of invitationLimitArms().filter(value => value.id !== '0')) {
    const row = capacityControl(arm, { days, emissionEveryDays: q });
    const first = arm.b === 0 ? 0 : (arm.b - 1) * q + 1;
    const interval = Math.max(arm.P, arm.b * q);
    const expected = days < first ? 0 : 1 + Math.floor((days - first) / interval);
    assert.equal(row.invitations, expected, arm.id + ' at E=' + 1 / q);
    assert.equal(row.firstUseDay, first);
    assert.equal(row.burnedFacy, arm.b * expected);
    assert.equal(row.mintedFacy, days / q);
    assert.equal(row.retainedOwnFacy, row.mintedFacy - row.burnedFacy);
    assert.ok(Math.abs(row.invitations - days * row.prior.invitationsPerDay) <= 1 + 1e-10);
    assert.equal(row.rejections.cooldown + row.rejections.funding + expected, days + 1);
    for (let i = 1; i < row.usedAtDays.length; i++) assert.ok(row.usedAtDays[i] - row.usedAtDays[i - 1] >= arm.P);
    if (q === 1) t.diagnostic(JSON.stringify({ arm: row.arm, invitations: row.invitations, firstUseDay: row.firstUseDay,
      burnedFacy: row.burnedFacy, prior: row.prior.invitationsPerDay, finiteRate: row.invitationsPerDay }));
  }
  assert.throws(() => capacityControl({ P: null, b: 0 }, { days, emissionEveryDays: 1 }), /no finite capacity/);
});

test('native retained rights permit a same-hour invitation burst, not an independent P=1 cooldown', () => {
  const { model, rights } = bank(3);
  const hour = model.now;
  for (const [i, right] of rights.entries()) model.createInvitation('creator', right, 'new-' + i);
  assert.deepEqual(model.invitations().map(invitation => invitation.createdAt), [hour, hour, hour]);
  assert.equal(model.ledger().burned, 3);
  assert.equal(model.ledger().emitterVault, 0);
  assert.equal(model.ledger().minted, 3);
  model.audit();
});

test('native own-emission budget remains one invitation per funded unit across twenty deterministic prefixes', () => {
  for (let days = 1; days <= 20; days++) {
    const { model, rights } = bank(days);
    for (const [i, right] of rights.entries()) model.createInvitation('creator', right, 'new-' + i);
    assert.equal(model.invitations().length, days);
    assert.equal(model.ledger().minted, days);
    assert.equal(model.ledger().burned, days);
    assert.throws(() => model.createInvitation('creator', rights[0], 'another'), /spent/);
    assert.equal(invitationCapacityPrior({ P: 1, b: 1, E: 1 }).invitationsPerDay, model.invitations().length / (model.now / DAY));
    model.audit();
  }
});

test('key rotation changes neither own-right ownership nor the diagnosed absence of an invitation cooldown', () => {
  const { model, rights } = bank(2);
  model.createInvitation('creator', rights[0], 'first');
  model.rotateKey('creator', 'creator:new-key');
  model.createInvitation('creator', rights[1], 'second');
  assert.deepEqual(model.invitations().map(invitation => invitation.creator), ['creator', 'creator']);
  assert.equal(model.invitations()[0].createdAt, model.invitations()[1].createdAt);
  assert.equal(model.selfId(rights[0]).subject, 'creator');
  model.audit();
});
