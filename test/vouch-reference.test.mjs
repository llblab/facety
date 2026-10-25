import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ProtocolRejection } from '../src/model.mjs';
import { CompositionReference, ReferenceRejection } from '../studies/2026-10-26-trust-topology-condition-map/reference.mjs';
import { NativeReferenceBridge } from '../studies/2026-10-26-trust-topology-condition-map/native-reference-bridge.mjs';

const folder = new URL('../studies/2026-10-26-trust-topology-condition-map/', import.meta.url);
const profile = JSON.parse(readFileSync(new URL('wp1-composition-fixture.json', folder)));
function harness(p = profile) {
  const reference = new CompositionReference(p), native = new NativeReferenceBridge(p);
  let actions = 0, rejections = 0;
  return { reference, native, counts: () => ({ actions, rejections }), step(q) {
    const before = reference.snapshot();
    let expected = true, actual = true;
    try { reference.apply(q); } catch (e) { if (!(e instanceof ReferenceRejection)) throw e; expected = false; }
    try { native.apply(q); } catch (e) {
      if (!(e instanceof ProtocolRejection || e instanceof TypeError || e instanceof RangeError)) throw e;
      actual = false;
    }
    assert.equal(actual, expected, 'action acceptance: ' + JSON.stringify(q));
    if (!expected) { rejections++; assert.deepEqual(reference.snapshot(), before, 'oracle rejected-call atomicity'); }
    assert.deepEqual(native.snapshot(), reference.snapshot(), 'intermediate normalized state: ' + JSON.stringify(q));
    actions++;
  } };
}
const time = hour => ({ op: 'time', hour });
const artifact = (owner, id) => ({ op: 'artifact', owner, id: 'media:' + id });
const issue = (owner, id) => ({ op: 'issue', owner, id, artifact: 'media:' + id });
const fund = (owner, id) => ({ op: 'withdraw', owner, id });
const commit = (owner, target, id) => ({ op: 'commit', owner, target, id });
const refund = id => ({ op: 'refund', id, clear: true, clearanceId: 'provided:' + id });
const settle = (id, caseId, upheld, burn = 0, transfers = []) => ({ op: 'settle', id, caseId, upheld, burn, transfers });
const review = (actor, id, signal, opportunity = 'fixed-opportunity') => ({ op: 'review', actor, id, signal, opportunity });
function addIssue(tape, owner, id) { tape.push(artifact(owner, id), issue(owner, id)); }
function compositionTape(plan) {
  const t = [];
  for (const hour of [0, 24]) { t.push(time(hour)); for (const who of ['a', 'b']) addIssue(t, who, who + ':' + hour); }
  t.push(time(48));
  for (const who of ['a', 'b']) for (const hour of [0, 24]) t.push(fund(who, who + ':' + hour));
  t.push(commit('a', 'x', 'ax'), commit('b', 'x', 'bx'), { op: 'admit', target: 'x', bonds: ['ax', 'bx'] },
    { op: 'pool', options: profile.reviewAllocation.options });
  addIssue(t, 'x', 'x:48'); addIssue(t, 'b', 'b:48');
  t.push(time(49), { op: 'exit', owner: 'a', id: 'ax' }, review('review-a', 'x:48', false, 'composed-x-fixed'), time(72));
  addIssue(t, 'x', 'x:72'); addIssue(t, 'b', 'b:72');
  t.push(time(96));
  for (const who of ['x', 'b']) for (const hour of [48, 72]) t.push(fund(who, who + ':' + hour));
  t.push(commit('x', 'y', 'xy'), commit('b', 'y', 'by'), { op: 'admit', target: 'y', bonds: ['xy', 'by'] });
  addIssue(t, 'y', 'y:96');
  t.push(time(97), review('review-x', 'y:96', true, 'composed-y-fixed'), { op: 'hold', id: 'ax', caseId: 'case' },
    time(120), refund('ax'), refund('bx'), time(121), settle('ax', 'case', plan.upheld, plan.burn, plan.transfers), refund('ax'),
    time(168), refund('xy'), refund('by'));
  return t;
}
function boundaryTape(p) {
  const t = [time(0)];
  for (const who of ['a', 'b']) addIssue(t, who, who + ':0');
  t.push(artifact('missing', 'invalid-owner'), issue('a', 'no-artifact'), artifact('a', 'a:0'), time(23), fund('a', 'a:0'), time(24));
  for (const who of ['a', 'b']) addIssue(t, who, who + ':24');
  t.push(time(47), fund('a', 'a:24'), time(48));
  for (const who of ['a', 'b']) for (const at of [0, 24]) t.push(fund(who, who + ':' + at));
  t.push(fund('b', 'a:0'), fund('a', 'a:0'), commit('a', 'a', 'self'), commit('a', 'x', 'ax'), commit('b', 'x', 'bx'),
    { op: 'hold', id: 'ax', caseId: 'guard' }, { op: 'admit', target: 'x', bonds: ['ax'] },
    settle('ax', 'guard', false), { op: 'admit', target: 'x', bonds: ['ax', 'ax'] });
  const bonds = p.vouchAdmission.c === 1 ? ['ax'] : ['bx', 'ax'];
  t.push({ op: 'admit', target: 'x', bonds }, { op: 'admit', target: 'x', bonds });
  addIssue(t, 'x', 'x:48');
  t.push({ op: 'pool', options: { reference: 'paid-single-suspicion-veto-reference', costs: { inspect: 1, respond: 1 },
    actors: [{ id: 'reviewer', subject: 'a', budget: p.vouching.B }, { id: 'external', subject: null, budget: 3 }] } },
    review('external', 'x:48', true), review('reviewer', 'x:48', p.vouching.B !== 1),
    review('reviewer', 'x:48', p.vouching.B === 1), { op: 'exit', owner: 'a', id: 'ax' }, time(49), commit('a', 'other', 'early'),
    time(48 + p.vouching.T * 24), commit('a', 'other', 'later'), { op: 'hold', id: 'ax', caseId: 'later-case' },
    { op: 'hold', id: 'ax', caseId: 'overlap' }, time(49 + Math.max(p.vouching.T, p.vouching.V) * 24), refund('ax'),
    settle('ax', 'later-case', true, 1, [{ recipient: 'b', amount: 1 }]), settle('ax', 'later-case', false),
    { ...refund('ax'), clear: false }, refund('ax'), refund('ax'), refund('bx'),
    { op: 'exit', owner: 'b', id: 'bx' }, { op: 'hold', id: 'bx', caseId: 'after-refund' },
    review('external', 'x:48', false, 'late'), time(0));
  return t;
}

test('the reference has no Native/code/environment dependency and immutable snapshots/configuration are isolated', () => {
  const source = readFileSync(new URL('reference.mjs', folder), 'utf8');
  assert.doesNotMatch(source, /\bimport\s|\bimport\(|\brequire\(|\beval\(|\bprocess\.|\bglobalThis\./);
  const copy = structuredClone(profile), oracle = new CompositionReference(copy);
  copy.vouching.B = 1000; copy.vouching.K = 1000; copy.genesis.length = 0;
  assert.equal(oracle.snapshot().capacities[0].limit, profile.vouching.K);
  const before = oracle.snapshot(), damaged = oracle.snapshot();
  damaged.members[0].liquidFacy = 1000; damaged.graph.nodes.length = 0;
  assert.deepEqual(oracle.snapshot(), before);
  assert.throws(() => oracle.apply({ op: 'undefined-op' }), /Unsupported/);
  assert.deepEqual(oracle.snapshot(), before);
});

test('all four original composition witnesses match independent transitions, source XP and acquisition requests after every action', () => {
  for (const plan of profile.settlementWitnesses) {
    const h = harness();
    assert.deepEqual(h.native.snapshot(), h.reference.snapshot());
    for (const q of compositionTape(plan)) h.step(q);
    assert.equal(h.counts().actions, 53);
    assert.equal(h.counts().rejections, 1);
    assert.equal(h.reference.snapshot().ledger.supply, 8 - plan.burn);
    assert.equal(h.reference.snapshot().requests.length, 2);
  }
});

test('full intermediate accepted/rejected-state differentials generalize over72 fixed c/K/T/V/B boundary partitions', () => {
  let partitions = 0, actions = 0, rejections = 0;
  for (const c of [1, 2]) for (const K of [0, 1, 2]) for (const T of [1, 2]) for (const V of [1, 2]) for (const B of [0, 1, 2]) {
    const p = structuredClone(profile);
    Object.assign(p.vouching, { K, T, V, B }); p.vouchAdmission.c = c;
    const h = harness(p);
    for (const q of boundaryTape(p)) h.step(q);
    actions += h.counts().actions; rejections += h.counts().rejections; partitions++;
  }
  assert.equal(partitions, 72);
  assert.equal(actions, 4176);
  assert.ok(rejections > 1000);
});

test('boundary calls exercise post-credit exit, pending hold replay, payee/remaining coverage and reject atomicity', () => {
  const h = harness();
  const t = compositionTape(profile.settlementWitnesses[0]);
  const prefix = t.slice(0, t.findIndex(q => q.op === 'time' && q.hour === 168));
  for (const q of prefix) h.step(q);
  h.step({ op: 'exit', owner: 'x', id: 'bx' });
  h.step({ op: 'exit', owner: 'y', id: 'xy' });
  h.step({ op: 'exit', owner: 'x', id: 'xy' });
  h.step({ op: 'hold', id: 'by', caseId: 'limits' });
  h.step({ op: 'hold', id: 'by', caseId: 'limits' });
  h.step(settle('by', 'limits', true, 0, [{ recipient: 'b', amount: 1 }, { recipient: 'missing', amount: 1 }]));
  h.step(settle('by', 'limits', true, 0, [{ recipient: 'b', amount: 1 }, { recipient: 'b', amount: 1 }]));
  h.step(settle('by', 'limits', false, 1));
  h.step(settle('by', 'limits', true, 1, [{ recipient: 'b', amount: 1 }]));
  h.step(settle('by', 'limits', true, 0));
  h.step({ op: 'hold', id: 'by', caseId: 'remaining-zero' });
  h.step(settle('by', 'remaining-zero', true, 1));
  h.step(settle('by', 'remaining-zero', false));
  h.step(time(168)); h.step(refund('by')); h.step(refund('xy'));
  assert.ok(h.counts().rejections >= 8);
});

test('large safe clock/cooldown arithmetic agrees without overflowing an intermediate deadline sum', () => {
  const p = structuredClone(profile);
  Object.assign(p.vouching, { K: 2, B: 0, T: Math.floor(Number.MAX_SAFE_INTEGER / 24), V: 1 });
  p.vouchAdmission.c = 1;
  const h = harness(p), start = Number.MAX_SAFE_INTEGER - 48;
  h.step(time(start)); h.step(commit('a', 'x', 'late'));
  h.step(time(start + 1));
  assert.equal(h.reference.snapshot().capacities[0].cooldownRemainingHours, p.vouching.T * 24 - 1);
});

test('inert reads and future tape extensions preserve independent prefixes and acquisition/work memoization', () => {
  const h = harness();
  for (const q of compositionTape(profile.settlementWitnesses[1])) {
    const before = h.reference.snapshot();
    h.native.snapshot(); h.reference.snapshot();
    assert.deepEqual(h.reference.snapshot(), before);
    h.step(q);
  }
  const prefix = h.reference.snapshot(), requests = prefix.requests;
  h.step(time(169));
  h.step(review('review-a', 'x:48', true, 'future-extra'));
  assert.deepEqual(h.reference.snapshot().requests, requests);
  assert.equal(prefix.now, 168);
});

test('the comparator detects a skipped Native money transition rather than reconstructing expected state from Native events', () => {
  const h = harness();
  for (const q of [artifact('a', 'first'), issue('a', 'first'), time(24)]) h.step(q);
  const invoke = h.native.apply.bind(h.native);
  h.native.apply = q => { if (q.op !== 'withdraw') invoke(q); };
  assert.throws(() => h.step(fund('a', 'first')), assert.AssertionError);
  assert.equal(h.reference.snapshot().members.find(m => m.id === 'a').liquidFacy, 1);
  assert.equal(h.native.snapshot().members.find(m => m.id === 'a').liquidFacy, 0);
});
