import test from 'node:test';
import assert from 'node:assert/strict';
import { runMaturityIncentiveForks, readMaturityReceiptComparisons, readIncentiveComparisons } from '../src/incentives.mjs';
import { compareIncentiveOwnership } from '../src/incentive-ownership.mjs';
import { evaluateIncentivePayoffs } from '../src/incentive-payoffs.mjs';
import { FacetyModel } from '../src/model.mjs';
import { DEFAULT_WEIGHTS, effortWeights } from '../src/effort.mjs';
import { provenance } from '../src/provenance.mjs';

const point = (branch, stage) => branch.timeline.find(row => row.stage === stage);
const subject = (point, id) => point.subjects.find(row => row.id === id);
const modelState = m => ({ now: m.now, subjects: m.subjects(), acts: m.selfIds(), events: m.events(), ledger: m.audit() });

test('ordinary receipt fixture is closed, deterministic, complete and separate from historical consumers/weights', () => {
  const a = runMaturityIncentiveForks();
  assert.deepEqual(a, runMaturityIncentiveForks()); assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.equal(a.schema, 'facety-incentive-forks/v3'); assert.equal(a.fixture, 'marginal-admission-maturity-receipts-v1');
  assert.equal(a.policy.xpFinality, 'maturity'); assert.deepEqual(a.provenance, provenance());
  assert.deepEqual(a.branches.map(row => row.id), ['wait-collector', 'invite-only/retain', 'invite-only/remit1', 'invite-and-guarantee/retain', 'invite-and-guarantee/remit1']);
  for (const b of a.branches) {
    assert.deepEqual(b.timeline.map(row => row.atHour), [0, 24, 24, 48, 48, 72, 72]);
    assert.equal(b.timeline.at(-1).eventCursor, b.events.length);
    assert.deepEqual(b.timeline[0], a.branches[0].timeline[0]);
    assert.equal(b.work.humanEffort, null); assert.equal(b.work.coverage, 'priced-actions-only'); assert.deepEqual(b.work.weights, DEFAULT_WEIGHTS);
  }
  assert.deepEqual(readMaturityReceiptComparisons(a), a.comparisons);
  for (const options of [undefined, null, {}, { xpFinality: 'maturity' }, { remittance: 1 }]) assert.throws(() => runMaturityIncentiveForks(options), /no options/);
  for (const reader of [readIncentiveComparisons, compareIncentiveOwnership, evaluateIncentivePayoffs]) assert.throws(() => reader(a), /unsupported incentive artifact/);
  assert.throws(() => effortWeights({ transferFacy: 1 }), /unknown effort action/); assert.equal(Object.hasOwn(DEFAULT_WEIGHTS, 'transferFacy'), false);
});

test('ordinary24h credits unused source snapshots before any disposition and never duplicates credits or transfers XP', () => {
  for (const b of runMaturityIncentiveForks().branches) {
    const before = point(b, 'common-prefix'), matured = point(b, 'maturity'), decision = point(b, 'decision');
    assert.ok(before.selfIds.every(act => !act.xpCredited && act.xpCredit === null));
    assert.ok(matured.selfIds.every(act => act.status === 'unspent' && act.disposition === null && act.xpCredited && act.xpCredit.at === 24));
    assert.equal(matured.ledger.emitterVault, 2); assert.equal(matured.ledger.collector, 0); assert.equal(matured.ledger.burned, 0);
    assert.equal(matured.eventCursor, before.eventCursor); assert.equal(subject(matured, 'sponsor').xp, 1); assert.equal(subject(matured, 'peer').xp, 2);
    for (const act of matured.selfIds) assert.deepEqual(act.xpCredit, decision.selfIds.find(row => row.id === act.id).xpCredit);
    assert.equal(point(b, 'admission').selfIds.length, 2);
    const last = point(b, 'horizon'), newborn = last.selfIds.find(act => act.subject === 'newcomer');
    if (newborn) {
      assert.equal(newborn.recordedAt, 48); assert.equal(newborn.chainIndex, 1); assert.equal(newborn.previousSelfId, null);
      assert.equal(newborn.xpCredit.at, 72); assert.equal(subject(last, 'newcomer').xp, 1);
      assert.equal(subject(last, 'sponsor').xp, b.strategy === 'invite-and-guarantee' ? 2 : 1);
      assert.deepEqual(newborn.guarantors, b.strategy === 'invite-and-guarantee' ? ['sponsor'] : []);
    }
    for (const actor of last.subjects) assert.equal(actor.xp, subject(point(b, 'pre-remittance'), actor.id).xp);
  }
});

test('actual remittance reallocates one earned newborn unit, principal once and missing transfer work never free', () => {
  const a = runMaturityIncentiveForks();
  for (const b of a.branches) for (const p of b.timeline) {
    assert.equal(p.ledger.supply, p.ledger.minted - p.ledger.burned);
    assert.equal(p.ledger.supply, p.ledger.emitterVault + p.ledger.collector);
    assert.equal(p.ledger.collector, p.subjects.reduce((n, s) => n + s.liquidFacy, 0));
    assert.equal(p.ledger.feeVault, 0); assert.equal(p.ledger.stakeVault, 0); assert.equal(p.ledger.debt, 0);
  }
  for (const c of a.comparisons) {
    const b = a.branches.find(row => row.id === c.treatment), remit = b.remittance;
    assert.equal(c.sponsor.liquidFacy, remit - 1); assert.equal(c.newcomer.liquidFacy, 1 - remit); assert.equal(c.joint.liquidFacy, 0);
    assert.equal(c.newcomer.baselinePresent, false); assert.equal(c.newcomer.baselineLiquidFacy, null);
    assert.equal(c.privateUtility, null); assert.equal(c.expectedLiability, null); assert.equal(c.networkExternality, null);
    const transfers = b.events.filter(event => event.type === 'facy-transferred'); assert.equal(transfers.length, remit);
    assert.equal(b.work.complete, remit === 0); assert.equal(c.workComplete, remit === 0);
    assert.equal(b.work.unpricedActions.length, remit);
    if (remit) {
      assert.deepEqual(transfers[0], { at: 72, type: 'facy-transferred', from: 'newcomer', to: 'sponsor', amount: 1, memo: 'voluntary-first-receipt' });
      assert.equal(b.actions.at(-1).effort, null); assert.equal(b.work.totalEffort, null); assert.equal(c.joint.totalWeightedEffort, null); assert.equal(c.newcomer.totalWeightedEffort, null);
    } else assert.equal(c.joint.totalWeightedEffort, c.joint.knownWeightedEffort);
    assert.equal(point(b, 'horizon').ledger.minted, 3); assert.equal(point(b, 'horizon').ledger.burned, 1); assert.equal(point(b, 'horizon').ledger.collector, 2);
  }
});

test('native remittance cannot use immature/XP-only or already-spent cash and every refusal is inert', () => {
  const m = new FacetyModel({ genesis: ['sponsor', 'peer'], policy: { xpFinality: 'maturity' } });
  m.confirmGuarantee('sponsor', m.proposeGuarantee('peer', 'sponsor'));
  const peer = m.createSelfId('peer', m.registerArtifact('peer')), sponsor = m.createSelfId('sponsor', m.registerArtifact('sponsor'));
  m.advanceTo(24); m.convertToCollector('peer', peer); const invite = m.createInvitation('sponsor', sponsor, 'newcomer');
  m.advanceTo(48); m.acceptInvitation(invite, 'newcomer'); const own = m.createSelfId('newcomer', m.registerArtifact('newcomer'));
  for (const hour of [71, 72]) {
    m.advanceTo(hour); const before = modelState(m);
    assert.throws(() => m.transferFacy('newcomer', 'sponsor', 1), /insufficient liquid/); assert.deepEqual(modelState(m), before);
  }
  assert.equal(m.subject('newcomer').xp, 1); assert.equal(m.subject('newcomer').liquidFacy, 0);
  m.convertToCollector('newcomer', own); const before = modelState(m);
  assert.throws(() => m.transferFacy('newcomer', 'sponsor', 2), /insufficient liquid/); assert.deepEqual(modelState(m), before);
  const xp = m.subjects().map(s => s.xp); m.transferFacy('newcomer', 'sponsor', 1, 'voluntary-first-receipt');
  assert.equal(m.subject('sponsor').liquidFacy, 1); assert.equal(m.subject('newcomer').liquidFacy, 0); assert.deepEqual(m.subjects().map(s => s.xp), xp);
  const after = modelState(m); assert.throws(() => m.transferFacy('newcomer', 'sponsor', 1), /insufficient liquid/); assert.deepEqual(modelState(m), after);
  assert.equal(m.audit().supply, 2); assert.equal(m.audit().burned, 1);
});

test('pure retained reader rejects temporal, custody, source, work and paired-prefix forgeries rather than cached returns', () => {
  const source = runMaturityIncentiveForks();
  for (const mutate of [
    a => { a.policy.xpFinality = 'terminal'; }, a => { a.schedule.horizonHour = 71; },
    a => { a.provenance.implementation.digest = 'bad'; }, a => { a.randomness = 'random'; },
    a => { a.branches.pop(); }, a => { a.branches[2].id = a.branches[1].id; }, a => { a.branches[2].remittance = 2; },
    a => { a.branches[1].timeline.splice(1, 1); }, a => { a.branches[2].timeline.at(-1).stage = 'pre-remittance'; },
    a => { a.branches[1].timeline[1].selfIds[0].xpCredited = false; },
    a => { for (const p of a.branches[1].timeline) for (const act of p.selfIds) delete act.xpCredit; },
    a => { a.branches[1].timeline[1].selfIds[0].disposition = 'collector'; },
    a => { a.branches[2].timeline[5].eventCursor++; }, a => { a.branches[2].events.at(-1).amount = 2; },
    a => { a.branches[2].events.at(-1).at = 71; }, a => { a.branches[2].timeline[6].subjects.find(s => s.id === 'sponsor').liquidFacy++; },
    a => { a.branches[2].actions.at(-1).effort = 0; }, a => { a.branches[2].actions.at(-1).actor = 'sponsor'; },
    a => { a.branches[2].work.complete = true; }, a => { a.branches[2].work.totalEffort = 0; }, a => { a.branches[2].work.coverage = 'all-actions'; },
    a => { a.branches[2].work.unpricedActions = []; }, a => { a.branches[2].timeline[1].council = []; },
    a => {
      const b = a.branches[2], act = b.timeline[6].selfIds.find(s => s.subject === 'newcomer'), old = act.artifact;
      for (const p of b.timeline) for (const s of p.selfIds) if (s.subject === 'newcomer') s.artifact = 'different-later-media';
      for (const e of b.events) if (e.type === 'artifact-registered' && e.artifact === old) e.artifact = 'different-later-media';
    },
  ]) {
    const damaged = structuredClone(source); mutate(damaged); assert.throws(() => readMaturityReceiptComparisons(damaged), undefined, mutate.toString());
  }
  const data = structuredClone(source); data.provenance.implementation.digest = 'f'.repeat(64); data.branches.reverse(); data.comparisons = [{ sponsor: { liquidFacy: 999 } }];
  const before = JSON.stringify(data), descriptors = Object.getOwnPropertyDescriptors(FacetyModel.prototype);
  try {
    for (const [key, descriptor] of Object.entries(descriptors)) if (key !== 'constructor' && typeof descriptor.value === 'function')
      Object.defineProperty(FacetyModel.prototype, key, { ...descriptor, value() { throw new Error('reader must not invoke Model'); } });
    const facts = readMaturityReceiptComparisons(data);
    assert.deepEqual(facts.map(c => c.sponsor.liquidFacy), [-1, 0, -1, 0]);
    assert.ok(facts.every(c => c.sourceProvenance.implementation.digest === 'f'.repeat(64)));
    assert.equal(JSON.stringify(data), before);
  } finally { Object.defineProperties(FacetyModel.prototype, descriptors); }
});

test('future remittance preserves complete same-strategy protocol/action prefixes and exact custody through72h conversion', () => {
  const a = runMaturityIncentiveForks();
  for (const strategy of ['invite-only', 'invite-and-guarantee']) {
    const retained = a.branches.find(b => b.id === strategy + '/retain'), remitted = a.branches.find(b => b.id === strategy + '/remit1');
    assert.deepEqual(retained.timeline.slice(0, 6), remitted.timeline.slice(0, 6)); assert.deepEqual(retained.actions, remitted.actions.slice(0, -1));
    assert.deepEqual(retained.events, remitted.events.slice(0, -1));
    assert.equal(subject(point(remitted, 'pre-remittance'), 'newcomer').liquidFacy, 1);
    assert.equal(subject(point(remitted, 'pre-remittance'), 'sponsor').liquidFacy, 0);
    assert.deepEqual(retained.timeline[6].selfIds, remitted.timeline[6].selfIds);
    assert.deepEqual(retained.timeline[6].council, remitted.timeline[6].council);
    assert.deepEqual(retained.timeline[6].ledger, remitted.timeline[6].ledger);
  }
});
