import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';
import { VouchActReview } from '../src/vouch-review.mjs';
import { actObservationEnvironment } from '../src/act-observations.mjs';

function fixture() {
  const model = new FacetyModel({ genesis: ['a', 'b', 'viewer'], policy: { xpFinality: 'maturity', guarantorEligibility: 'accepted' },
    vouching: { K: 2, T: 1, V: 2, B: 1, reference: { eligibility: 'accepted-reference', clockOrigin: 'commitment',
      funding: 'collector-liquid', exitSlot: 'retain-until-V', bondRelease: 'supplied-clearance' } },
    vouchAdmission: { c: 2, reference: 'native-guarantees-commitment-reference' } });
  const sources = ['a', 'b'].map(owner => [owner, model.createSelfId(owner, model.registerArtifact(owner))]);
  model.advanceTo(DAY);
  for (const [owner, id] of sources) model.convertToCollector(owner, id);
  const vouches = ['a', 'b'].map(owner => model.commitVouch(owner, 'x'));
  model.admitVouched('x', vouches);
  const act = model.createSelfId('x', model.registerArtifact('x'));
  return { model, act, vouches };
}
const options = (budget = 4, subject = 'a', inspect = 1, respond = 1) => ({ reference: 'paid-single-suspicion-veto-reference',
  actors: [{ id: 'work-account', subject, budget }], costs: { inspect, respond } });
const request = { opportunity: 'fixed-software-opportunity' };
function environment(model, act, { valid = false, validRate = 0, invalidRate = 1, genuine = true, seed = 'wp1-review-software-fixture' } = {}) {
  const native = model.selfId(act);
  return actObservationEnvironment({ subjects: model.subjects().map(subject => ({ id: subject.id, genuine, behaviorProfile: 'fixture-only' })),
    acts: [{ id: act, subject: native.subject, kind: 'self-id', recordedAt: native.recordedAt, valid }] },
  { seed, rates: Object.fromEntries(['self-id', 'invitation', 'guarantee'].map(kind => [kind,
    Object.fromEntries(['ordinary', 'guarantor'].map(role => [role, { valid: validRate, invalid: invalidRate }]))])) });
}
function state(model) {
  return { subjects: model.subjects(), acts: model.selfIds(), bonds: model.vouchCommitments(), cases: model.vouchBondCases(),
    relations: model.guaranteeRelations(), ledger: model.audit(), events: model.events() };
}

test('review is a closed explicit funded-maturity reference with immutable costs/accounts and no evaluator/cohort inputs', () => {
  const { model } = fixture();
  assert.throws(() => new VouchActReview(new FacetyModel(), options()), /funded admission/);
  for (const mutate of [
    o => { delete o.reference; }, o => { o.reference = 'selected-CORE'; }, o => { o.truth = true; },
    o => { o.costs.inspect = 0; }, o => { o.costs.respond = 0.5; }, o => { o.actors[0].budget = -1; },
    o => { o.actors[0].genuine = true; }, o => { o.actors[0].subject = 'missing'; },
    o => { o.actors.push({ ...o.actors[0] }); }, o => { o.actors.push({ ...o.actors[0], id: 'duplicate-subject' }); },
    o => { o.actors = Array(1); }, o => { o.actors[0] = { id: 'a', subject: null, budget: 2 }; },
  ]) { const o = options(); mutate(o); assert.throws(() => new VouchActReview(model, o)); }
  const input = options(), review = new VouchActReview(model, input);
  input.costs.inspect = 100; input.actors[0].budget = 100; input.actors[0].subject = null;
  assert.equal(review.audit().actors[0].budget, 4);
  assert.equal(review.snapshot().costs.inspect, 1);
  assert.equal(review.snapshot().actors[0].subject, 'a');
  assert.throws(() => { review.snapshot().actors[0].spent = 100; }, TypeError);
  assert.throws(() => { review.snapshot().costs.respond = 0; }, TypeError);
});

test('inspection is funded before acquisition, response separately funded and missingness is never a negative signal or redraw', () => {
  const { model, act } = fixture(), env = environment(model, act);
  for (const [budget, expected, callsExpected] of [[0, 'inspection-denied', 0], [1, 'response-denied', 1], [2, 'vetoed', 1]]) {
    let calls = 0;
    const review = new VouchActReview(model, options(budget));
    const port = { ...env, observe(point) { assert.equal(review.snapshot().actors[0].spent, 1); calls++; return env.observe(point); } };
    const receipt = review.review('work-account', act, port, request);
    assert.equal(receipt.outcome, expected);
    assert.equal(receipt.suspicious, callsExpected ? true : null);
    assert.equal(calls, callsExpected);
    assert.equal(review.audit().actors[0].spent, budget);
    assert.deepEqual(review.review('work-account', act, { ...env, observe() { throw Error('must not redraw'); } }, request), receipt);
    assert.equal(calls, callsExpected);
    assert.throws(() => { receipt.work.inspect = 0; }, TypeError);
  }
  assert.equal(model.selfId(act).status, 'cancelled');
  assert.equal(model.vouchBondCases().length, 0);
});

test('custody identity does not supply veto authority; original snapshot survives exit, cancellation affects one act only', () => {
  const { model, act, vouches } = fixture(), before = state(model);
  model.exitVouch('a', vouches[0]);
  const review = new VouchActReview(model, options());
  const receipt = review.review('work-account', act, environment(model, act), request);
  assert.equal(receipt.role, 'guarantor'); assert.equal(receipt.outcome, 'vetoed');
  assert.equal(model.selfId(act).disposition, 'guarantor-veto');
  assert.equal(model.subject('x').identityStatus, 'accepted');
  assert.equal(model.subject('x').xp, 0);
  assert.equal(model.ledger().burned - before.ledger.burned, 1);
  assert.equal(model.ledger().vouchVault, before.ledger.vouchVault);
  assert.equal(model.vouchCommitments()[0].bondRemaining, 1);
  assert.equal(model.vouchCommitments()[0].slashed, 0);
  assert.deepEqual(model.vouchBondCases(), []);
  assert.equal(model.guaranteeRelations().filter(r => r.status === 'ended').length, 1);
  const other = fixture();
  const ordinary = new VouchActReview(other.model, options(4, null));
  const seen = ordinary.review('work-account', other.act, environment(other.model, other.act), request);
  assert.equal(seen.outcome, 'no-veto-authority');
  assert.equal(seen.work.respond, 0);
  assert.equal(other.model.selfId(other.act).status, 'unspent');
});

test('received valid-act false suspicion and invalid-act misses remain fallible; hidden person labels do not drive response', () => {
  for (const [valid, validRate, invalidRate, expected] of [[true, 1, 0, 'vetoed'], [false, 1, 0, 'observed-no-suspicion']]) {
    const results = [];
    for (const genuine of [true, false]) {
      const { model, act } = fixture(), review = new VouchActReview(model, options());
      results.push({ receipt: review.review('work-account', act, environment(model, act, { valid, validRate, invalidRate, genuine }), request), state: state(model) });
      assert.equal(results.at(-1).receipt.outcome, expected);
    }
    assert.deepEqual(results[0], results[1]);
  }
  const { model, act } = fixture(), review = new VouchActReview(model, options()), before = state(model);
  const receipt = review.review('work-account', act, environment(model, act, { valid: true }), request);
  assert.equal(receipt.outcome, 'observed-no-suspicion');
  assert.deepEqual(state(model), before);
});

test('closed/locked/spent acts are unobserved; malformed/unbound requests are inert and the exact24h boundary is retained', () => {
  for (const unavailable of ['locked', 'spent', 'expired']) {
    const { model, act } = fixture(), env = environment(model, act), review = new VouchActReview(model, options());
    if (unavailable === 'locked') model.freezeSelfId(act, 'external-case-reference');
    if (unavailable === 'spent') model.cancelSelfId('b', act);
    if (unavailable === 'expired') model.advanceTo(model.selfId(act).recordedAt + DAY);
    const before = state(model);
    const receipt = review.review('work-account', act, { ...env, observe() { throw Error('unavailable must not be observed'); } }, request);
    assert.equal(receipt.outcome, unavailable === 'expired' ? 'window-closed' : 'act-unavailable');
    assert.equal(receipt.suspicious, null); assert.equal(review.audit().actors[0].spent, 0);
    assert.deepEqual(state(model), before);
  }
  const { model, act } = fixture(), env = environment(model, act), review = new VouchActReview(model, options());
  for (const [who, target, port, point] of [
    ['missing', act, env, request], ['work-account', 'missing', env, request],
    ['work-account', act, env, {}], ['work-account', act, env, { ...request, truth: true }],
    ['work-account', act, { ...env, acts: [] }, request],
    ['work-account', act, { ...env, acts: [{ ...env.acts[0], subject: 'a' }] }, request],
    ['work-account', act, { ...env, randomness: {} }, request],
  ]) {
    const before = state(model), book = review.snapshot();
    assert.throws(() => review.review(who, target, port, point));
    assert.deepEqual(state(model), before); assert.deepEqual(review.audit(), book);
  }
  model.advanceTo(model.selfId(act).recordedAt + DAY - 1);
  assert.equal(review.review('work-account', act, env, request).outcome, 'vetoed');
});

test('paid acquisition failures retain null and spent work; native rejection retains response cost and error rather than implying prevention', () => {
  for (const acquire of [() => { throw Error('environment unavailable'); }, () => ({ suspicious: true, truth: true }), () => ({ suspicious: null })]) {
    const { model, act } = fixture(), review = new VouchActReview(model, options()), env = environment(model, act), before = state(model);
    const port = { ...env, observe: acquire };
    assert.throws(() => review.review('work-account', act, port, request));
    const book = review.audit();
    assert.equal(book.actors[0].spent, 1);
    assert.equal(book.receipts[0].suspicious, null);
    assert.equal(book.receipts[0].outcome, 'observation-error');
    assert.equal(review.review('work-account', act, port, request).outcome, 'observation-error');
    assert.deepEqual(state(model), before);
  }
  const { model, act } = fixture(), review = new VouchActReview(model, options());
  model.invalidateIdentity('a'); // Protocol judgment, not an evaluator label supplied to defense.
  const before = state(model);
  const rejected = review.review('work-account', act, environment(model, act), request);
  assert.equal(rejected.outcome, 'veto-rejected');
  assert.match(rejected.reason, /not accepted/);
  assert.equal(review.audit().actors[0].spent, 2);
  assert.deepEqual(state(model), before);
});

test('inert reads and unrelated future environment inspections preserve keyed review prefixes without extra draws or work', () => {
  const left = fixture(), right = fixture(), a = new VouchActReview(left.model, options(20, 'viewer')), b = new VouchActReview(right.model, options(20, 'viewer'));
  const first = environment(left.model, left.act, { validRate: 0.3, invalidRate: 0.7 });
  const second = environment(right.model, right.act, { validRate: 0.3, invalidRate: 0.7 });
  for (const opportunity of ['prefix:0', 'prefix:1', 'prefix:2', 'prefix:3']) {
    a.snapshot(); a.audit();
    first.observe({ act: left.act, observer: 'inert-unrelated-observer', role: 'ordinary', atHour: 100, opportunity: 'future-only' });
    assert.deepEqual(a.review('work-account', left.act, first, { opportunity }), b.review('work-account', right.act, second, { opportunity }));
  }
  assert.deepEqual(a.audit(), b.audit());
  assert.deepEqual(state(left.model), state(right.model));
  const prefix = b.snapshot().receipts;
  right.model.advanceTo(right.model.now + 1);
  b.review('work-account', right.act, second, { opportunity: 'future-only' });
  assert.deepEqual(b.audit().receipts.slice(0, prefix.length), prefix);
  assert.deepEqual(a.audit().receipts, prefix);
});

test('paid signal/authority/window/budget decisions match an independent recurrence in256 fixed software partitions', () => {
  let partitions = 0;
  for (const budget of [0, 1, 2, 3]) for (const inspect of [1, 2]) for (const respond of [1, 2])
    for (const suspicious of [false, true]) for (const authorized of [false, true]) for (const accepted of [false, true]) for (const expired of [false, true]) {
      const { model, act } = fixture(), subject = authorized ? 'a' : 'viewer';
      if (expired) model.advanceTo(model.selfId(act).recordedAt + DAY);
      if (!accepted) model.invalidateIdentity(subject);
      const review = new VouchActReview(model, options(budget, subject, inspect, respond));
      let calls = 0, spent = 0, expected, received = null;
      if (expired) expected = 'window-closed';
      else if (budget < inspect) expected = 'inspection-denied';
      else {
        spent = inspect; received = suspicious;
        if (!suspicious) expected = 'observed-no-suspicion';
        else if (!authorized) expected = 'no-veto-authority';
        else if (budget - spent < respond) expected = 'response-denied';
        else { spent += respond; expected = accepted ? 'vetoed' : 'veto-rejected'; }
      }
      const env = environment(model, act, { validRate: Number(suspicious), invalidRate: Number(suspicious) });
      const result = review.review('work-account', act, { ...env, observe(point) { calls++; return env.observe(point); } }, request);
      assert.equal(result.outcome, expected);
      assert.equal(result.suspicious, received);
      assert.equal(review.audit().actors[0].spent, spent);
      assert.equal(calls, received === null ? 0 : 1);
      assert.equal(model.selfId(act).status, expected === 'vetoed' ? 'cancelled' : 'unspent');
      assert.equal(model.vouchCommitments()[0].slashed, 0);
      model.audit(); partitions++;
    }
  assert.equal(partitions, 256);
});
