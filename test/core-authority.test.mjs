import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FacetyModel, DAY } from '../src/model.mjs';
import { challengeAccess } from '../src/disputes.mjs';
import { DisputeStakes } from '../src/dispute-stakes.mjs';

const packet = JSON.parse(readFileSync(new URL('../studies/2026-10-26-trust-topology-condition-map/core-authority-fixtures.json', import.meta.url)));
const ids = Array.from({ length: 100 }, (_, i) => `p${String(i).padStart(3, '0')}`);
const following = new Set(ids.slice(0, 94));
function counts(members) {
  const n = members.filter(row => following.has(row.id)).length;
  return [n, members.length - n];
}
function share(subjects) {
  const total = subjects.reduce((n, row) => n + row.xp, 0);
  return total === 0 ? null : subjects.filter(row => following.has(row.id)).reduce((n, row) => n + row.xp, 0) / total;
}
function state(model) {
  return { subjects: model.subjects(), acts: model.selfIds(), ledger: model.audit(), events: model.events(), relations: model.guaranteeRelations() };
}
function funded(plan, reverse) {
  const model = new FacetyModel({ genesis: ids, policy: { councilSize: 11, councilEligibility: 'active' } });
  assert.equal(share(model.subjects()), null);
  assert.equal(model.audit().minted, 0);
  assert.ok(model.subjects().every(row => row.xp === 0 && row.liquidFacy === 0));
  const order = reverse ? [...ids].reverse() : ids;
  for (let day = 0; day < 4; day++) {
    const acts = [];
    for (const id of order) if (plan.receipts[ids.indexOf(id)] > day) acts.push([id, model.createSelfId(id, model.registerArtifact(id))]);
    model.advanceTo((day + 1) * DAY);
    for (const [id, act] of acts) model.convertToCollector(id, act);
  }
  assert.equal(model.now, 96);
  assert.equal(model.selfIds().length, 118);
  for (let i = 0; i < ids.length; i++) {
    const subject = model.subject(ids[i]);
    assert.equal(subject.xp, plan.receipts[i]);
    assert.equal(subject.liquidFacy, plan.receipts[i]);
    assert.equal(subject.identityStatus, 'accepted');
    assert.equal(model.isActive(ids[i]), true);
    const acts = model.selfIds().filter(act => act.subject === ids[i]);
    assert.equal(acts.length, plan.receipts[i]);
    assert.equal(model.xpProvenance(ids[i]).credits.length, plan.receipts[i]);
    for (const act of acts) {
      assert.equal(act.xpCredit.at, act.recordedAt + DAY);
      assert.equal(act.xpCredit.revokedAt, null);
      assert.deepEqual(act.xpCredit.recipients.map(({ subject, role, halvingsBefore, revokedAt }) => ({ subject, role, halvingsBefore, revokedAt })), [{ subject: ids[i], role: 'subject', halvingsBefore: 0, revokedAt: null }]);
      assert.deepEqual(act.guarantors, []);
    }
    assert.ok(!['cohort', 'genuine', 'following', 'controller', 'intent'].some(key => Object.hasOwn(subject, key)));
  }
  const ledger = model.audit();
  for (const key of ['minted', 'supply', 'collector']) assert.equal(ledger[key], 118);
  for (const key of ['burned', 'debt', 'emitterVault']) assert.equal(ledger[key], 0);
  assert.deepEqual(model.guaranteeRelations(), []);
  assert.deepEqual(model.invitations(), []);
  assert.deepEqual(model.selfIdResolutions(), []);
  assert.equal(model.subjects().filter(row => following.has(row.id)).reduce((n, row) => n + row.xp, 0), 106);
  assert.equal(share(model.subjects()), 53 / 59);
  assert.equal(model.council().length, 11);
  assert.deepEqual(counts(model.council()), [plan.council.ruleFollowing, plan.council.comparison]);
  const expected = ids.map((id, i) => ({ id, xp: plan.receipts[i] })).sort((a, b) => b.xp - a.xp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 11);
  assert.deepEqual(model.council(), expected);
  return model;
}

test('core authority contract fixes equal-funded/equal-global-XP histories without an outcome or truth oracle', () => {
  assert.equal(packet.schema, 'facety-core-authority-software-fixtures/v1');
  assert.equal(packet.captureEnabled, false);
  assert.equal(packet.reference.suppliedGenesis, 100);
  assert.equal(packet.reference.cohortDays, 4);
  assert.equal(packet.reference.initialMoneyXp, 0);
  assert.equal(packet.reference.councilSize, 11);
  assert.equal(packet.reference.councilEligibility, 'active');
  assert.equal(packet.reference.guarantees, 0);
  assert.deepEqual(packet.plans.map(row => row.id), ['concentrated', 'spread']);
  assert.deepEqual(packet.plans[0].receipts, [...Array(2).fill(4), ...Array(3).fill(3), ...Array(89).fill(1), ...Array(6).fill(2)]);
  assert.deepEqual(packet.plans[1].receipts, [...Array(6).fill(3), ...Array(88).fill(1), ...Array(6).fill(2)]);
  assert.deepEqual(packet.plans.map(row => row.peer), [{ bothRuleFollowing: [3, 6], mixed: [4, 5], bothComparison: [5, 4] }, { bothRuleFollowing: [4, 5], mixed: [5, 4], bothComparison: [6, 3] }]);
  for (const omitted of ids.slice(94)) assert.deepEqual(counts([...ids.slice(0, 6), ...ids.slice(94).filter(id => id !== omitted)].map(id => ({ id }))), [6, 5], 'all six within-comparison boundary-tie choices preserve the spread count');
  for (const plan of packet.plans) {
    assert.equal(plan.receipts.length, 100);
    assert.equal(plan.receipts.slice(0, 94).reduce((a, b) => a + b, 0), 106);
    assert.equal(plan.receipts.slice(94).reduce((a, b) => a + b, 0), 12);
    assert.ok(plan.receipts.every(n => Number.isSafeInteger(n) && n >= 1 && n <= 4));
    assert.equal(plan.receipts.reduce((a, b) => a + b, 0), 118);
  }
  assert.ok(3 * 106 > 2 * 118);
  assert.ok(3 * 94 > 2 * 100);
  assert.deepEqual(packet.expected, { ruleFollowingPeople: 94, comparisonPeople: 6, ruleFollowingXp: 106, comparisonXp: 12, totalXp: 118, minted: 118, councilSeats: 11 });
});

test('actual Native receipts produce the two different legacy Council compositions at identical global shares and total FACY', () => {
  const runs = packet.plans.map(plan => [funded(plan, false), funded(plan, true)]);
  for (const pair of runs) {
    assert.deepEqual(pair[0].subjects(), pair[1].subjects());
    assert.deepEqual(pair[0].council(), pair[1].council());
    assert.deepEqual(pair[0].audit(), pair[1].audit());
  }
  assert.equal(share(runs[0][0].subjects()), share(runs[1][0].subjects()));
  assert.equal(runs[0][0].audit().supply, runs[1][0].audit().supply);
  assert.deepEqual(counts(runs[0][0].council()), [5, 6]);
  assert.deepEqual(counts(runs[1][0].council()), [6, 5]);
});

test('D71 analytic exclusion changes the relevant electorate without executing a case, vote, penalty or removal', () => {
  const parties = { bothRuleFollowing: ['p000', 'p001'], mixed: ['p000', 'p094'], bothComparison: ['p094', 'p095'] };
  for (const plan of packet.plans) {
    const model = funded(plan, false), before = state(model), council = model.council();
    for (const [kind, excluded] of Object.entries(parties)) {
      assert.ok(excluded.every(id => council.some(row => row.id === id)));
      const remaining = council.filter(row => !excluded.includes(row.id));
      assert.equal(remaining.length, 9);
      assert.deepEqual(counts(remaining), plan.peer[kind]);
      assert.equal(remaining.some(row => excluded.includes(row.id)), false);
      assert.deepEqual(state(model), before, 'the electorate projection is not implemented adjudication or a Model mutation');
      assert.deepEqual(model.council(), council, 'case exclusion is not removal from Council membership');
    }
  }
  const spread = packet.plans[1];
  assert.ok(spread.council.ruleFollowing > spread.council.comparison);
  assert.ok(spread.peer.bothRuleFollowing[0] < spread.peer.bothRuleFollowing[1]);
});

function smallCorrectiveCohort(receipts, reverse) {
  const people = Array.from({ length: 10 }, (_, i) => `p${String(i).padStart(3, '0')}`);
  const model = new FacetyModel({ genesis: people, policy: { xpFinality: 'maturity' } });
  assert.equal(model.audit().minted, 0);
  assert.ok(model.subjects().every(person => person.xp === 0 && person.liquidFacy === 0));
  const order = reverse ? [...people].reverse() : people;
  for (let day = 0; day < 10; day++) {
    const acts = [];
    for (const id of order) if (receipts[people.indexOf(id)] > day) acts.push([id, model.createSelfId(id, model.registerArtifact(id))]);
    model.advanceTo((day + 1) * DAY);
    for (const [id, act] of acts) model.convertToCollector(id, act);
  }
  for (const [i, id] of people.entries()) {
    assert.equal(model.subject(id).xp, receipts[i]);
    assert.equal(model.subject(id).liquidFacy, receipts[i]);
    assert.equal(model.isActive(id), true);
    const acts = model.selfIds().filter(act => act.subject === id);
    assert.equal(acts.length, receipts[i]);
    assert.ok(acts.every(act => act.xpCredit.at === act.recordedAt + DAY && act.xpCredit.recipients.length === 1 && act.xpCredit.recipients[0].subject === id));
    assert.ok(!['cohort', 'genuine', 'following', 'controller', 'coalition'].some(key => Object.hasOwn(model.subject(id), key)));
  }
  assert.equal(model.now, 240); assert.equal(model.activeCount(), 10);
  assert.equal(model.audit().minted, 23); assert.equal(model.audit().collector, 23);
  assert.deepEqual(model.guaranteeRelations(), []); assert.deepEqual(model.invitations(), []);
  return { model, people };
}

test('coordinated corrective majority cannot pool XP through the ordinary entry gate; same totals with one eligible senior can reserve entry', t => {
  const profiles = [
    { id: 'distributed', receipts: [...Array(9).fill(2), 5], eligible: [] },
    { id: 'senior-available', receipts: [10, ...Array(8).fill(1), 5], eligible: ['p000'] },
  ], rows = [];
  assert.ok(3 * 18 > 2 * 23); assert.ok(3 * 9 > 2 * 10);
  for (const profile of profiles) {
    const normalized = [];
    for (const reverse of [false, true]) {
      const { model, people } = smallCorrectiveCohort(profile.receipts, reverse), before = state(model);
      const access = people.slice(0, 9).map(id => ({ id, ...challengeAccess(model, id, 'p009', 1) }));
      assert.deepEqual(state(model), before, 'all informed/willing group members can inspect the actual gate without mutations');
      assert.ok(access.every(row => row.preconditions.liquidFacy >= row.preconditions.stake));
      assert.deepEqual(access.filter(row => row.allowed).map(row => row.id), profile.eligible);
      assert.ok(access.filter(row => !row.allowed).every(row => row.reason === 'challenge XP gate'));
      assert.equal(people.slice(0, 9).reduce((sum, id) => sum + model.subject(id).xp, 0), 18);
      assert.equal(people.slice(0, 9).reduce((sum, id) => sum + model.subject(id).liquidFacy, 0), 18);
      assert.equal(model.subject('p009').xp, 5); assert.equal(model.subject('p009').liquidFacy, 5);
      normalized.push({ subjects: model.subjects(), money: model.audit(), access });
      const book = new DisputeStakes(model, 'reserved');
      for (const row of access) if (row.allowed) book.open('ordinary-entry-reference', row.id, 1);
      assert.equal(book.cases().length, profile.eligible.length);
      assert.equal(model.audit().collector, 23 - profile.eligible.length);
      assert.equal(model.audit().stakeVault, profile.eligible.length);
      assert.equal(model.audit().burned, 0); assert.equal(model.audit().debt, 0);
      assert.ok(model.subjects().every(subject => subject.identityStatus === 'accepted'));
      rows.push({ profile: profile.id, reverse, receipts: profile.receipts, suppliedPeople: 10, correctivePeople: 9,
        correctiveXp: 18, totalXp: 23, correctiveLiquid: 18, totalLiquid: 23, accused: 'p009', accusedXp: 5,
        hour: model.now, access, financialCases: book.cases(), finalMoney: model.audit(),
        formalCouncilUnderSuppliedN10: false, verdictExecuted: false, identityExcluded: false });
    }
    assert.deepEqual(normalized[0], normalized[1], 'operation order changes no normalized funding or access fact');
  }
  t.diagnostic('core-coalition-entry ' + JSON.stringify({ rows, profiles: profiles.length,
    newPeopleAdmitted: 0, scientificWorlds: 0, scope: 'ordinary reference entry only, no coalition XP aggregation or selected act/Council route' }));
});
