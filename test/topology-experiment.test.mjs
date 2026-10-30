// topology-takeover/v1 runner (D115): studies/2026-10-29-topology-takeover/README.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runTopologyExperiment, topologyConfig, TOPOLOGY_ENGINE } from '../src/topology-experiment.mjs';

const SMALL = { seed: 'topology-test', days: 24, attackStartDay: 12, attackers: 4, maxSubjects: 2000 };

test('topology config validates keys, engine and probabilities', () => {
  assert.equal(topologyConfig().engine, TOPOLOGY_ENGINE);
  assert.throws(() => topologyConfig({ extra: 1 }), /unknown topology key/);
  assert.throws(() => topologyConfig({ engine: 'other' }), /requires engine/);
  assert.throws(() => topologyConfig({ honest: { invite: 2 } }), /probability/);
  assert.throws(() => topologyConfig({ honest: { unknown: 1 } }), /unknown honest behavior/);
});

test('topology runs replay exactly and keep the honest head start', () => {
  const first = runTopologyExperiment(SMALL);
  const second = runTopologyExperiment(SMALL);
  assert.deepEqual(first.history, second.history);
  assert.equal(first.history.length, SMALL.days);
  for (const row of first.history) {
    if (row.day < SMALL.attackStartDay + 1) assert.equal(row.attackers, 0, 'no attacker before entry is accepted');
    assert.equal(row.honest + row.attackers, row.subjects);
    assert.ok(row.dirtyShare === null || (row.dirtyShare >= 0 && row.dirtyShare <= 1));
  }
  // After the first 100 active participants the D33 Council has 11 seats and the bootstrap latch is off.
  const late = first.history.at(-1);
  assert.equal(late.bootstrap, false);
  assert.equal(late.councilSize, 11);
  assert.ok(late.attackers > 0, 'invited attacker operators are admitted');
});

test('only the gate arm can refuse for Council paths; the no-gate arm has no bootstrap latch', () => {
  const off = runTopologyExperiment({ ...SMALL, gate: false });
  const refusals = off.history.at(-1).refusals;
  assert.equal(refusals.attackers['insufficient Council paths'] ?? 0, 0);
  assert.equal(refusals.honest['insufficient Council paths'] ?? 0, 0);
  assert.ok(off.history.every(row => row.bootstrap === null));
  assert.equal(off.history.at(-1).councilSize, 11);
});

test('opt-in detection vetoes and adjudicates through the model while audits keep holding (D116)', () => {
  const off = runTopologyExperiment(SMALL);
  assert.deepEqual(off.detection, { casesOpened: 0, falseInvalidated: 0, genuineInvalidated: 0, vetoedFalse: 0, vetoedGenuine: 0, casesDismissed: 0 });
  const settings = { ...SMALL, detection: { enabled: true, review: 1, inspect: 1, sensitivity: 1, falsePositiveRate: 0, windowDays: 1, accuracy: 1 } };
  const on = runTopologyExperiment(settings);
  assert.deepEqual(on.history, runTopologyExperiment(settings).history);
  // Perfect reviewers never veto or invalidate a genuine person, and they do catch fake invitations.
  assert.equal(on.detection.vetoedGenuine, 0);
  assert.equal(on.detection.genuineInvalidated, 0);
  assert.ok(on.detection.vetoedFalse + on.detection.falseInvalidated > 0);
  assert.throws(() => runTopologyExperiment({ ...SMALL, detection: { unknown: 1 } }), /unknown detection setting/);
});

test('v3 leaving, public patterns and follow-up stay opt-in, replay exactly and act through the model (D117)', () => {
  assert.equal(runTopologyExperiment({ ...SMALL, detection: { enabled: true } }).detection.linksLeft, undefined);
  const settings = { ...SMALL, days: 30, detection: { enabled: true, review: 1, inspect: 0, sensitivity: 1, falsePositiveRate: 0, windowDays: 1, accuracy: 1,
    leave: true, publicLook: 1, patternMinInvitees: 2, followUp: true, sponsorWillingness: 1 } };
  const run = runTopologyExperiment(settings);
  assert.deepEqual(run.history, runTopologyExperiment(settings).history);
  assert.ok(run.detection.linksLeft > 0, 'an honest reviewer who vetoes a fake invitation leaves the creator');
  assert.equal(run.detection.genuineInvalidated, 0);
  assert.equal(run.detection.vetoedGenuine, 0);
  for (const key of ['patternsFound', 'escalations', 'sponsorRefusals', 'followUpCases']) assert.ok(Number.isSafeInteger(run.detection[key]));
  assert.throws(() => runTopologyExperiment({ ...SMALL, detection: { leave: 1 } }), /must be boolean/);
});

test('D120 invite rights: a pair grants one right to the lower-XP side and each invitation consumes one', async () => {
  const { FacetyModel, DAY } = await import('../src/model.mjs');
  const reference = { source: 'own-mature-right', withdrawal: 'free', pairEndXp: 'withdrawer-only', withdrawDuringHold: 'allow', invitations: 'v2-special-link', eligibility: 'off', councilPaths: null };
  assert.throws(() => new FacetyModel({ genesis: ['a', 'b'], inviteRights: 'higher-xp-pair' }), /inviteRights requires/);
  const model = new FacetyModel({ genesis: ['a', 'b', 'c', 'd'], policy: { xpFinality: 'immediate', guarantorEligibility: 'accepted' }, ablations: { fixedInvitationThreshold: 1 },
    valences: { K: 100, genesisPairs: [], reference }, inviteRights: 'higher-xp-pair' });
  for (const id of ['a', 'a', 'b', 'c', 'd']) { model.advanceTo(model.now + DAY); if (id === 'a' || model.now >= 2 * DAY) model.createSelfId(id, model.registerArtifact(id)); }
  model.advanceTo(model.now + DAY);
  for (const id of ['a', 'b', 'c', 'd']) model.createSelfId(id, model.registerArtifact(id));
  model.advanceTo(model.now + DAY);
  assert.ok(model.subject('a').xp > model.subject('b').xp);
  model.openValence('a', 'b', model.eligibleEmissions('a')[0]);
  model.openValence('b', 'a', model.eligibleEmissions('b')[0]);
  assert.equal(model.inviteRights('b'), 1);
  assert.equal(model.inviteRights('a'), 0);
  model.preregisterAccount('x');
  assert.throws(() => model.createInvitation('a', model.eligibleEmissions('a')[0], 'x'), /no invitation right/);
  model.createInvitation('b', model.eligibleEmissions('b')[0], 'x');
  assert.equal(model.inviteRights('b'), 0);
  model.preregisterAccount('y');
  assert.throws(() => model.createInvitation('b', model.eligibleEmissions('b')[0] ?? 'none', 'y'), /no invitation right|unknown Self-ID/);
  model.audit();
});
