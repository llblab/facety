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
