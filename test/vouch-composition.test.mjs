import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FacetyModel } from '../src/model.mjs';
import { VouchActReview } from '../src/vouch-review.mjs';
import { actObservationEnvironment } from '../src/act-observations.mjs';

const profile = JSON.parse(readFileSync(new URL('../studies/2026-10-26-trust-topology-condition-map/wp1-composition-fixture.json', import.meta.url)));
function fixture() {
  const model = new FacetyModel({ genesis: profile.genesis, policy: profile.policy, ablations: profile.ablations,
    invitationLimit: profile.invitationLimit, vouching: profile.vouching, vouchAdmission: profile.vouchAdmission });
  const calls = [], acts = new Map();
  // Test-local closure guard, not an authenticated agent port or an alternative economic implementation.
  const call = (role, method, ...args) => {
    if (!profile.nativeCalls[role]?.includes(method)) throw new Error('outside declared composition role/action profile');
    const value = model[method](...args);
    calls.push({ role, method });
    model.audit();
    return value;
  };
  const advance = hour => call('administration', 'advanceTo', hour);
  const issue = (subject, at) => {
    assert.equal(model.now, at);
    const label = subject + ':' + at;
    const artifact = call('subject', 'registerArtifact', subject,
      { id: 'synthetic:' + label, faceCount: profile.artifactBinding.faceCount, contentHash: profile.artifactBinding.contentHash });
    const id = call('subject', 'createSelfId', subject, artifact);
    acts.set(label, id);
    return id;
  };
  const withdraw = (subject, label) => call('subject', 'convertToCollector', subject, acts.get(label));
  return { model, calls, acts, call, advance, issue, withdraw };
}
function view(model) {
  return { subjects: model.subjects(), acts: model.selfIds(), bonds: model.vouchCommitments(), cases: model.vouchBondCases(),
    admissions: model.vouchAdmissions(), relations: model.guaranteeRelations(), ledger: model.audit(), events: model.events() };
}
function observe(f, review, point) {
  assert.equal(f.model.now, point.atHour);
  const id = f.acts.get(point.actLabel), native = f.model.selfId(id);
  const environment = actObservationEnvironment({
    subjects: f.model.subjects().map(subject => ({ id: subject.id, genuine: true, behaviorProfile: 'software-fact-only' })),
    acts: [{ id, subject: native.subject, kind: 'self-id', recordedAt: native.recordedAt,
      valid: profile.observationEnvironment.validityFacts[point.actLabel] }],
  }, { seed: profile.observationEnvironment.seed, rates: profile.observationEnvironment.rates });
  return review.review(point.actor, id, environment, { opportunity: point.opportunity });
}

// This recurrence is a composed endpoint check, not a full independent transition engine or a sampled study.
function expectedSettlement(plan) {
  const payout = plan.transfers.reduce((sum, p) => sum + p.amount, 0), debit = plan.burn + payout;
  return { debit, payout, refund: 2 - debit, burned: 1 + plan.burn, supply: 8 - plan.burn,
    liquid: { a: 2 - debit, b: 4, x: 2 + payout, y: 0 }, xp: { a: 3, b: 6, x: 2, y: 0 } };
}

test('composition fixture is an explicit native-policy/action/resource binding, not CORE/registration or a production permission port', () => {
  const f = fixture();
  assert.equal(profile.schema, 'facety-wp1-composition-fixture/v1');
  assert.deepEqual(f.model.policy, profile.policy);
  assert.deepEqual(f.model.ablations, profile.ablations);
  assert.equal(f.model.invitationLimit, profile.invitationLimit);
  assert.deepEqual(f.model.vouching, profile.vouching);
  assert.deepEqual(f.model.vouchAdmission, profile.vouchAdmission);
  assert.equal(f.model.ledger().minted, 0);
  assert.equal(f.model.subjects().every(s => s.xp === 0 && s.liquidFacy === 0), true);
  for (const methods of Object.values(profile.nativeCalls)) for (const method of methods) assert.equal(typeof f.model[method], 'function');
  for (const method of profile.blockedExamples) for (const role of Object.keys(profile.nativeCalls)) {
    const before = view(f.model);
    assert.throws(() => f.call(role, method), /outside declared/);
    assert.deepEqual(view(f.model), before);
  }
  assert.equal(profile.reviewAllocation.automaticNewMemberWork, false);
  assert.equal(profile.reviewAllocation.laterGrants, false);
  assert.equal(profile.reviewAllocation.options.actors.reduce((sum, a) => sum + a.budget, 0), 3);
  assert.equal(profile.opportunities.length, 2);
  assert.equal(profile.research.registered, false);
  assert.equal(profile.research.G1Verdict, null);
});

test('funded two-generation composition preserves clocks, pending source XP, explicit work and actual per-bond settlement in four fixed witnesses', () => {
  for (const plan of profile.settlementWitnesses) {
    const f = fixture(), { model, call, advance, issue, withdraw } = f;
    for (const at of [0, 24]) {
      advance(at);
      for (const subject of ['a', 'b']) issue(subject, at);
    }
    advance(48);
    for (const subject of ['a', 'b']) for (const at of [0, 24]) withdraw(subject, subject + ':' + at);
    assert.equal(model.ledger().collector, 4);
    const parent = ['a', 'b'].map(subject => call('subject', 'commitVouch', subject, 'x'));
    call('subject', 'admitVouched', 'x', parent);
    assert.equal(model.subject('x').liquidFacy, 0);
    assert.equal(model.subject('x').xp, 0);
    assert.equal(model.ledger().vouchVault, 4);
    assert.equal(model.now, profile.reviewAllocation.atHour);
    const review = new VouchActReview(model, profile.reviewAllocation.options);
    issue('x', 48); issue('b', 48);
    advance(49);
    call('subject', 'exitVouch', 'a', parent[0]);
    const look = observe(f, review, profile.opportunities[0]);
    assert.equal(look.role, 'guarantor');
    assert.equal(look.outcome, 'observed-no-suspicion');
    assert.equal(model.vouchCapacity('a').used, 1); // Slot persists until120 despite exit at49.
    advance(72);
    assert.equal(model.subject('a').xp, 3); // Two own sources plus the pending pre-exit snapshot source.
    issue('x', 72); issue('b', 72);
    advance(96);
    for (const subject of ['x', 'b']) for (const at of [48, 72]) withdraw(subject, subject + ':' + at);
    assert.equal(model.subject('x').liquidFacy, 2);
    const child = ['x', 'b'].map(subject => call('subject', 'commitVouch', subject, 'y'));
    call('subject', 'admitVouched', 'y', child);
    assert.equal(model.subject('y').xp, 0);
    assert.equal(model.subject('y').liquidFacy, 0);
    assert.equal(model.ledger().minted, 8);
    assert.equal(model.ledger().vouchVault, 8);
    assert.equal(model.ledger().collector, 0);
    issue('y', 96);
    advance(97);
    const veto = observe(f, review, profile.opportunities[1]);
    assert.equal(veto.outcome, 'vetoed');
    assert.equal(model.selfId(f.acts.get('y:96')).status, 'cancelled');
    assert.equal(model.subject('y').identityStatus, 'accepted');
    assert.equal(model.ledger().burned, 1);
    assert.equal(model.vouchBondCases().length, 0); // Suspicion/veto is not a verdict or automatic bond case.
    call('administration', 'openVouchBondCase', parent[0], { caseId: 'separately-supplied-bond-case' });
    advance(120);
    assert.equal(model.vouchCapacity('a').used, 0); // Custody and slot clocks remain separate.
    const held = view(model);
    assert.throws(() => call('administration', 'releaseVouchBond', parent[0], { clearanceId: 'a', clear: true }), /pending/);
    assert.deepEqual(view(model), held);
    assert.equal(call('administration', 'releaseVouchBond', parent[1], { clearanceId: 'b', clear: true }), 2);
    advance(121);
    const result = call('administration', 'resolveVouchBondCase', parent[0],
      { caseId: 'separately-supplied-bond-case', upheld: plan.upheld, burn: plan.burn, transfers: plan.transfers });
    const expected = expectedSettlement(plan);
    assert.equal(result.amount, expected.debit);
    assert.equal(call('administration', 'releaseVouchBond', parent[0], { clearanceId: 'a', clear: true }), expected.refund);
    assert.equal(model.ledger().vouchVault, 4);
    assert.equal(model.ledger().collector, 4 - plan.burn);
    advance(168);
    for (const id of child) assert.equal(call('administration', 'releaseVouchBond', id, { clearanceId: 'child:' + id, clear: true }), 2);
    const ledger = model.audit();
    assert.equal(ledger.minted, 9); assert.equal(ledger.burned, expected.burned);
    assert.equal(ledger.supply, expected.supply); assert.equal(ledger.collector, expected.supply);
    assert.equal(ledger.emitterVault, 0); assert.equal(ledger.vouchVault, 0); assert.equal(ledger.debt, 0);
    for (const subject of model.subjects()) {
      assert.equal(subject.liquidFacy, expected.liquid[subject.id]);
      assert.equal(subject.xp, expected.xp[subject.id]);
      assert.equal(subject.identityStatus, 'accepted');
    }
    assert.equal(model.guaranteeRelations().filter(r => r.status === 'active').length, 3);
    assert.equal(model.vouchAdmissions().length, 2);
    assert.equal(model.vouchCommitments()[0].slashed, expected.debit);
    assert.equal(model.vouchCommitments()[0].refunded, expected.refund);
    assert.equal(model.vouchCommitments().every(r => r.bondRemaining === 0 && r.bondStatus === 'released'), true);
    assert.equal(review.audit().actors.reduce((sum, a) => sum + a.spent, 0), 3);
    assert.equal(review.snapshot().receipts.length, 2);
    assert.equal(f.calls.every(row => profile.nativeCalls[row.role].includes(row.method)), true);
  }
});

test('test-local role/action closure rejects undeclared custody/time calls without asserting caller authentication', () => {
  const f = fixture();
  for (const method of profile.nativeCalls.administration) {
    const before = view(f.model);
    assert.throws(() => f.call('subject', method, 'invented-input'), /outside declared/);
    assert.deepEqual(view(f.model), before);
  }
  assert.throws(() => f.call('unknown-role', 'createSelfId', 'a'), /outside declared/);
  assert.deepEqual(f.calls, []);
});
