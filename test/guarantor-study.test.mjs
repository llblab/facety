import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { studyDesign, runBlock } from '../studies/2026-10-24-d43-cadence/run.mjs';
import { analyzeBlocks } from '../studies/2026-10-24-d43-cadence/analyze.mjs';
import { digestOf } from '../src/provenance.mjs';

const retained = JSON.parse(readFileSync(new URL('../studies/2026-10-24-d43-cadence/design.json', import.meta.url), 'utf8'));
function syntheticBlocks() {
  return retained.seeds.map((seed, block) => ({
    schema: 'facety-d43-cadence-block/v1', block, codeCommit: 'b'.repeat(40), design: structuredClone(retained), designDigest: digestOf(retained), runnerDigest: 'a'.repeat(64),
    runs: retained.steps.flatMap(stepHours => retained.arms.map(arm => {
      const config = { ...retained.base, seed, stepHours, ablations: { ...retained.base.ablations, disableInvitationVeto: arm.vetoDisabled }, activity: { ...retained.base.activity, honest: { ...retained.base.activity.honest, review: arm.review } } };
      return { seed, arm: arm.id, stepHours, review: arm.review, vetoDisabled: arm.vetoDisabled, configDigest: digestOf(config), randomness: structuredClone(retained.randomness[stepHours]),
        outcome: { horizonDays: retained.base.days, censored: false, success: false },
        metrics: { subjects: 12, operators: 12, falseAccepted: 0, falseActs: 0, falseConverted: 0, falseLiquid: 0, falseXp: 0, coalitionXpShare: null, falseActsVetoed: 0, genuineActsVetoed: 0, invitationsCancelled: 0, cancelledFalse: 0, cancelledGenuine: 0, attackerEffort: 1, defenderEffort: 2, selfIdInspections: 0 },
        reviewProcess: null, cancellations: [], daily: Array.from({ length: retained.base.days }, (_, day) => ({ atHour: (day + Number(stepHours !== 24)) * 24 })),
      };
    })),
  }));
}

test('D44 diagnostic fixes its cohort before data without calling the simulator in design/analysis', () => {
  assert.deepEqual(studyDesign(), retained);
  const changed = studyDesign();
  changed.seeds.pop();
  changed.arms[0].id = 'changed';
  assert.deepEqual(studyDesign(), retained);
  assert.throws(() => runBlock(-1), /fixed block/);
  const raw = syntheticBlocks();
  const before = structuredClone(raw);
  const report = analyzeBlocks(raw);
  assert.equal(report.cases, 36);
  assert.equal(report.cells.length, 9);
  assert.equal(report.effects.length, 3);
  assert.deepEqual(analyzeBlocks(JSON.parse(JSON.stringify(raw)).reverse()), report);
  assert.deepEqual(raw, before);
  assert.equal(report.cells[0].metrics.coalitionXpShare.mean, null);
});

test('D44 analyzer rejects changed cohorts, source bindings, policies, endpoints and impossible counters', () => {
  for (const mutate of [
    raw => raw.pop(),
    raw => raw[1].runs.pop(),
    raw => { raw[0].runs[0] = raw[0].runs[1]; },
    raw => { raw[0].runnerDigest = 'different'; },
    raw => { raw[0].design.base.days++; raw[0].designDigest = digestOf(raw[0].design); },
    raw => { raw[0].runs[0].randomness.decisions = 'different'; },
    raw => { raw[0].runs[0].metrics.falseAccepted = -1; },
    raw => { raw[0].runs[0].daily.pop(); },
    raw => { raw[0].runs[1].metrics.invitationsCancelled = 1; },
    raw => { raw[0].runs[2].cancellations = [{ createdAt: 0, cancelledAt: 24, falseTarget: true }]; raw[0].runs[2].metrics.invitationsCancelled = 1; },
  ]) {
    const raw = syntheticBlocks();
    mutate(raw);
    assert.throws(() => analyzeBlocks(raw));
  }
});

test('D44 report does not turn censoring, missing XP shares or unknown cancellations into complete means', () => {
  const raw = syntheticBlocks();
  raw[0].runs[0].outcome.censored = true;
  raw[0].runs[0].outcome.success = null;
  raw[0].runs[0].daily = [];
  const report = analyzeBlocks(raw);
  assert.equal(report.cells[0].completeRuns, 3);
  assert.equal(report.cells[0].unknownOutcomes, 1);
  assert.equal(report.cells[0].metrics.subjects.mean, null);
  assert.equal(report.cells[0].metrics.coalitionXpShare.mean, null);
});
