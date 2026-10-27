import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVouchAttribution as evaluate } from '../studies/2026-10-26-trust-topology-condition-map/prior7-attribution.mjs';
import { runVouchExperiment } from '../src/vouch-experiment.mjs';
import { FacetyModel } from '../src/model.mjs';
import { config } from './support/vouch-experiment-fixture.mjs';
import { prior7Sets } from './support/prior7-set-verifier.mjs';

// ONE unchanged existing Native input configuration, constructed once per test process.
// Passive false/control overlays below are NOT an observed attack or alternative Native worlds.
const raw = runVouchExperiment(config());
const kinds = ['activated-records-cumulative', 'active-guarantees-terminal', 'probation-records-terminal', 'issuer-contacts-cumulative'];
function labels(run = raw, denominatorKind = kinds[0]) {
  const ids = [...new Set([...run.state.subjects.map(s => s.id), ...run.state.vouches.map(v => v.target)])];
  return { operatorBySubject: Object.fromEntries(ids.map(id => [id, ['a', 'b'].includes(id) ? 'outside:' + id : 'group'])),
    genuineBySubject: Object.fromEntries(ids.map(id => [id, ['a', 'b'].includes(id)])), coalitionOperators: ['group'], denominatorKind };
}
function check(run, overlay) {
  const actual = evaluate(run, overlay), ref = prior7Sets(run, overlay);
  assert.deepEqual(actual.numerator.falseNewSubjects, ref.falseNew);
  assert.deepEqual(actual.initialAccess.falseSubjects, ref.falseInitial);
  assert.deepEqual(actual.boundary.unusedReservationIds, ref.unused);
  assert.deepEqual(actual.denominator.items, ref.sets[overlay.denominatorKind]);
  assert.equal(actual.denominator.count, ref.sets[overlay.denominatorKind].length);
  return actual;
}
function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }

// Constructed UNIT RECORDS, not executed/generated Native data, not a new world/empirical fixture.
// A feasible B0 first-use a→x plus unused b→spare; test only typed joins, clocks and zero accounting.
function zeroRecords() {
  const cfg = config(); cfg.days = 1; cfg.model.vouchAdmission.c = 1; Object.assign(cfg.model.vouching, { B: 0, V: 1 });
  cfg.events = [
    { atHour: 0, authority: 'subject-call', op: 'commit', owner: 'a', target: 'x', id: 'ax' },
    { atHour: 0, authority: 'subject-call', op: 'admit', target: 'x', bonds: ['ax'] },
    { atHour: 0, authority: 'subject-call', op: 'commit', owner: 'b', target: 'spare', id: 'unused' },
  ];
  const actions = cfg.events.map((q, i) => ({ ...q, ok: true, reason: null, value: ['v:ax', 'admit:x', 'v:unused'][i] }));
  const bond = (id, voucher, target) => ({ id, voucher, target, committedAt: 0, expiresAt: 24, exitedAt: null,
    bond: 0, bondRemaining: 0, slashed: 0, refunded: 0, bondStatus: 'reserved', releasedAt: null });
  return { schema: raw.schema, classification: 'diagnostic', testBasis: 'constructed unit records, NOT executed Native data', config: cfg,
    provenance: structuredClone(raw.provenance), actions, history: [{ stage: 'day-end', atHour: 24 }],
    outcome: { horizonDays: 1, horizonHours: 24, endedAtHour: 24, censored: false, censorReason: null, success: null, successCriterion: 'unbound' },
    state: { now: 24, subjects: ['a', 'b', 'x'].map(id => ({ id, genesis: id !== 'x', identityStatus: 'accepted', xp: 0, liquidFacy: 0, debt: 0 })),
      selfIds: [], vouches: [bond('v:ax', 'a', 'x'), bond('v:unused', 'b', 'spare')],
      admissions: [{ id: 'admit:x', subject: 'x', acceptedAt: 0, vouches: ['v:ax'], guarantors: ['a'], relations: ['r:ax'] }],
      relations: [{ id: 'r:ax', vouch: 'v:ax', guarantor: 'a', guaranteed: 'x', proposedAt: 0, activatedAt: 0, endedAt: null, status: 'active' }], cases: [],
      ledger: Object.fromEntries(['minted', 'burned', 'supply', 'emitterVault', 'collector', 'feeVault', 'stakeVault', 'debt', 'vouchVault'].map(k => [k, 0])) } };
}

test('prior7 actual single Native input: independent sets distinguish records, active guarantees, probation and contacts', () => {
  const snapshot = JSON.stringify(raw);
  assert.equal(raw.outcome.censored, false);
  assert.equal(raw.state.now, 192);
  for (const [i, kind] of kinds.entries()) {
    const output = check(raw, labels(raw, kind));
    assert.equal(output.numerator.count, 2); // EVALUATOR assumption about x,y, not config environment truth.
    assert.equal(output.denominator.count, [3, 2, 0, 2][i]);
    assert.equal(output.ratio, [2 / 3, 1, null, 1][i]);
    assert.deepEqual(output.producerProvenance, raw.provenance);
    assert.equal(output.initialAccess.acquisitionCost, null);
    assert.deepEqual(output.collateralByPayer, { a: { original: 2, remaining: 0, refunded: 1, slashed: 1 }, b: { original: 4, remaining: 0, refunded: 4, slashed: 0 } });
    assert.match(output.collateralMeaning, /not attacker cost/);
  }
  assert.equal(JSON.stringify(raw), snapshot);
});

test('prior7 passive labels, genuine coalition, operator aggregation and input ordering cannot mutate or execute protocol', () => {
  const run = frozen(structuredClone(raw)), overlay = frozen(labels()), before = JSON.stringify(run);
  const saved = new Map();
  try {
    for (const name of Object.getOwnPropertyNames(FacetyModel.prototype)) if (name !== 'constructor' && typeof Object.getOwnPropertyDescriptor(FacetyModel.prototype, name).value === 'function') {
      saved.set(name, FacetyModel.prototype[name]); FacetyModel.prototype[name] = () => { throw Error('unexpected Model call'); };
    }
    const first = evaluate(run, overlay), honest = structuredClone(overlay);
    honest.genuineBySubject.x = honest.genuineBySubject.y = true;
    const genuine = evaluate(run, honest);
    assert.equal(genuine.numerator.count, 0); assert.equal(genuine.ratio, 0);
    assert.deepEqual(genuine.numerator.genuineNewSubjects, ['x', 'y']);
    assert.deepEqual(genuine.boundary, first.boundary); assert.deepEqual(genuine.collateralByPayer, first.collateralByPayer);
    honest.operatorBySubject.a = honest.operatorBySubject.b = 'same-external-operator';
    const pooled = evaluate(run, honest);
    assert.deepEqual(pooled.boundary.issuerOperatorIds, ['same-external-operator']);
    assert.deepEqual(pooled.boundary.issuerSubjectIds, ['a', 'b']);
    const reorder = structuredClone(raw);
    for (const key of ['subjects', 'admissions', 'relations', 'vouches', 'selfIds', 'cases']) reorder.state[key].reverse();
    assert.deepEqual(evaluate(reorder, overlay), first);
  } finally { for (const [name, method] of saved) FacetyModel.prototype[name] = method; }
  assert.equal(JSON.stringify(run), before);
});

test('prior7 constructed B0/unused, initially supplied false access/internal reproduction and H0 never become infinity or safety', () => {
  const run = zeroRecords(), overlay = labels(run);
  const first = check(run, overlay);
  assert.equal(first.denominator.count, 1); assert.equal(first.numerator.count, 1);
  assert.deepEqual(first.boundary.zeroPrincipalActivatedRecordIds, ['v:ax']);
  assert.deepEqual(first.boundary.unusedReservationIds, ['v:unused']);
  assert.equal(check(run, { ...overlay, denominatorKind: kinds[2] }).denominator.count, 0); // exact expiresAt HOURS.
  overlay.operatorBySubject.a = 'group'; overlay.genuineBySubject.a = false;
  const internal = check(run, overlay);
  assert.equal(internal.numerator.count, 1); assert.equal(internal.denominator.count, 0); assert.equal(internal.ratio, null);
  assert.deepEqual(internal.initialAccess.falseSubjects, ['a']); assert.match(internal.ratioReason, /not safe or unbounded/);
  run.config.days = 0; run.config.events = []; run.actions = []; run.history = [];
  Object.assign(run.outcome, { horizonDays: 0, horizonHours: 0, endedAtHour: 0 }); run.state.now = 0;
  run.state.subjects.pop(); for (const key of ['vouches', 'admissions', 'relations']) run.state[key] = [];
  const empty = check(run, labels(run)); assert.equal(empty.numerator.count, 0); assert.equal(empty.ratio, null);
});

test('prior7 constructed positive unused custody is not a successful edge or a new admitted person', () => {
  const run = structuredClone(raw), b = run.state.subjects.find(s => s.id === 'b');
  assert.ok(b.liquidFacy >= 2);
  const q = { atHour: 191, authority: 'subject-call', op: 'commit', owner: 'b', target: 'spare', id: 'unused' };
  run.config.events.push(q); run.actions.push({ ...q, ok: true, reason: null, value: 'v:unused' });
  run.state.vouches.push({ id: 'v:unused', voucher: 'b', target: 'spare', committedAt: 191, expiresAt: 263,
    exitedAt: null, bond: 2, bondRemaining: 2, slashed: 0, refunded: 0, bondStatus: 'reserved', releasedAt: null });
  b.liquidFacy -= 2; run.state.ledger.collector -= 2; run.state.ledger.vouchVault += 2;
  const output = check(run, labels(run));
  assert.equal(output.numerator.count, 2); assert.equal(output.denominator.count, 3);
  assert.deepEqual(output.boundary.unusedReservationIds, ['v:unused']);
  assert.deepEqual(output.collateralByPayer.b, { original: 6, remaining: 2, refunded: 4, slashed: 0 });
});

test('prior7 rejects missing/extra/non-Boolean labels and implicit/unknown denominators without choosing semantics', () => {
  for (const mutate of [e => delete e.operatorBySubject.x, e => delete e.genuineBySubject.a,
    e => e.genuineBySubject.x = 0, e => e.operatorBySubject.x = '', e => e.operatorBySubject.extra = 'group',
    e => e.coalitionOperators = [], e => e.coalitionOperators = ['group', 'group'], e => delete e.denominatorKind,
    e => e.denominatorKind = 'degree', e => e.transferPrice = 1]) {
    const e = labels(); mutate(e); assert.throws(() => evaluate(raw, e), /prior7 attribution:/);
  }
  assert.throws(() => evaluate(raw), /closed evaluation/);
});

test('prior7 rejects malformed provenance, censor/missing endpoints, custody, altered IDs/times/order or reused/backfilled joins', () => {
  const mutations = [r => r.provenance.implementation.digest = 'bad', r => r.outcome.censored = true, r => delete r.state,
    r => r.state.now--, r => r.history.pop(), r => r.outcome.horizonHours--,
    r => r.state.admissions[0].vouches[1] = r.state.admissions[0].vouches[0],
    r => r.state.vouches.push(structuredClone(r.state.vouches[0])), r => r.state.vouches[0].target = 'y',
    r => r.state.relations[0].guarantor = 'x', r => r.state.relations[0].activatedAt++, r => r.state.relations[0].status = 'active',
    r => r.state.vouches[0].expiresAt -= 24, r => r.state.vouches[0].bondRemaining++, r => r.state.ledger.vouchVault++,
    r => r.state.subjects[0].liquidFacy++, r => r.state.selfIds[0].recordedAt++,
    r => r.config.events[0].atHour = 192, r => r.actions.reverse(),
    r => r.actions.find(a => a.op === 'commit').ok = false,
    r => { const a = r.actions.findIndex(q => q.op === 'admit'), b = r.actions.findIndex(q => q.op === 'commit');
      [r.actions[a], r.actions[b]] = [r.actions[b], r.actions[a]]; [r.config.events[a], r.config.events[b]] = [r.config.events[b], r.config.events[a]]; },
    r => r.config.model.vouching.T = 1.5, r => r.config.model.vouching.V = 1.5,
    r => r.state.cases.push(structuredClone(r.state.cases[0])), r => r.state.cases[0].transfers.push({ recipient: 'b', amount: 1 })];
  for (const mutate of mutations) {
    const copy = structuredClone(raw); mutate(copy);
    assert.throws(() => evaluate(copy, labels()), /prior7 attribution:/);
  }
  const repeat = JSON.parse(JSON.stringify(raw));
  assert.deepEqual(evaluate(repeat, labels()), evaluate(raw, labels()));
});
