import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FacetyModel, DAY } from '../src/model.mjs';

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
