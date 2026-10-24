import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { digestOf, implementationDigest } from '../src/provenance.mjs';
import { studyDesign, caseConfig, runBlock } from '../studies/2026-10-24-guardian-availability/run.mjs';
import { analyzeBlocks } from '../studies/2026-10-24-guardian-availability/analyze.mjs';

const directory = new URL('../studies/2026-10-24-guardian-availability/', import.meta.url);
const design = JSON.parse(readFileSync(new URL('design.json', directory), 'utf8'));
const runnerDigest = digestOf(readFileSync(new URL('run.mjs', directory), 'utf8'));
function blocks() {
  return design.seeds.map((seed, block) => ({
    schema: 'facety-guardian-availability-block/v1', block, designDigest: digestOf(design), runnerDigest, captureCommit: 'a'.repeat(40), source: structuredClone(design.source),
    rows: design.contexts.flatMap(context => design.arms.map(arm => ({
      seed, context: context.id, arm: arm.id, configDigest: digestOf(caseConfig(design, seed, context, arm)), randomness: structuredClone(design.randomness),
      outcome: { horizonDays: 7, elapsedHours: 168, censored: false, success: false },
      state: { truth: [], subjects: [], selfIds: [], events: [], invitations: [] },
      metrics: { falseAccepted: 0, falseConverted: 0, falseActs: 0, falseXp: 0, defenderEffort: 2, attackerEffort: 1, cancelled: 0 },
      process: { counters: { reviewSlots: 0, inspections: 0, inspectionDenied: 0, positiveSignals: 0, cancelCalls: 0, cancelled: 0, cancelRejected: 0, cancelBudgetDenied: 0, cancelUnavailable: 0 }, evaluator: { falseTargetsInspected: 0, genuineTargetsInspected: 0, falseTargetPositive: 0, genuineTargetPositive: 0 } },
      cancellations: [], daily: Array.from({ length: 7 }, (_, day) => ({ atHour: 24 * (day + 1) })),
    }))),
  }));
}

test('availability design preserves daily units and makes calendars explicit without model execution', () => {
  if (implementationDigest().digest === design.source.implementation) assert.deepEqual(studyDesign(), design);
  const original = structuredClone(design);
  for (const context of design.contexts) for (const arm of design.arms) {
    const config = caseConfig(design, design.seeds[0], context, arm);
    assert.deepEqual(config.activity, design.base.activity);
    assert.deepEqual(config.budgets, design.base.budgets);
    assert.equal(config.stepHours, 4);
    assert.equal(config.actorProfiles.length, context.offset === null ? 0 : 12);
    for (const [index, profile] of config.actorProfiles.entries()) {
      assert.equal(profile.subject, 'n' + index);
      assert.equal(profile.transactionHours, null);
      assert.deepEqual(profile.activity, {});
      assert.equal(profile.attentionHours.length, 7);
      assert.deepEqual(profile.attentionHours, Array.from({ length: 7 }, (_, day) => 24 * day + 4 * ((index + context.offset) % 6)));
    }
  }
  assert.deepEqual(design, original);
  assert.throws(() => runBlock(-1), /fixed block/);
  assert.throws(() => runBlock(4), /fixed block/);
  const raw = blocks();
  const before = structuredClone(raw);
  const report = analyzeBlocks(raw);
  assert.equal(report.cases, 24);
  assert.equal(report.cells.length, 6);
  assert.equal(report.genuineHarmEvaluable, false);
  assert.deepEqual(analyzeBlocks(JSON.parse(JSON.stringify(raw)).reverse()), report);
  assert.deepEqual(raw, before);
});

test('availability analysis rejects matrix, source, config, endpoint and process drift', () => {
  for (const mutate of [
    raw => raw.pop(),
    raw => { raw[1].block = 0; },
    raw => { raw[0].source.implementation = 'different'; },
    raw => { raw[0].runnerDigest = 'different'; },
    raw => { raw[0].rows[0] = raw[0].rows[1]; },
    raw => { raw[0].rows[0].configDigest = 'different'; },
    raw => { raw[0].rows[0].randomness.decisions = 'different'; },
    raw => { raw[0].rows[0].daily.pop(); },
    raw => { raw[0].rows[0].metrics.falseAccepted = -1; },
    raw => { raw[0].rows[0].metrics.falseXp = 1; },
    raw => { raw[0].rows[0].outcome.elapsedHours = 144; },
    raw => { raw[0].rows[0].process.counters.inspections = 1; },
    raw => { raw[0].rows[0].process.evaluator.falseTargetsInspected = 1; },
    raw => { raw[0].rows[0].metrics.cancelled = 1; },
  ]) {
    const raw = blocks();
    mutate(raw);
    assert.throws(() => analyzeBlocks(raw));
  }
  const censored = blocks();
  censored[0].rows[0].outcome.censored = true;
  censored[0].rows[0].outcome.success = null;
  censored[0].rows[0].daily = [];
  const report = analyzeBlocks(censored);
  assert.equal(report.cells[0].complete, 3);
  assert.equal(report.cells[0].metrics.falseAccepted.mean, null);
  assert.equal(report.effects[0].metrics.falseAccepted.mean, null);
});

test('availability journal checks both deadline and actor calendar, not just cancellation totals', () => {
  const raw = blocks();
  const row = raw[0].rows[3];
  row.metrics.cancelled = 1;
  Object.assign(row.process.counters, { reviewSlots: 1, inspections: 1, positiveSignals: 1, cancelCalls: 1, cancelled: 1 });
  Object.assign(row.process.evaluator, { falseTargetsInspected: 1, falseTargetPositive: 1 });
  row.cancellations = [{ invitation: 'i1', actor: 'n1', createdAt: 0, atHour: 4 }];
  row.state.invitations = [{ id: 'i1', createdAt: 0 }];
  row.state.events = [{ type: 'invitation-cancelled', invitation: 'i1', guarantor: 'n1', at: 4 }];
  assert.equal(analyzeBlocks(raw).cases, 24);
  for (const change of [{ atHour: 8 }, { atHour: 24 }, { createdAt: -1 }, { actor: 'n12' }]) {
    const changed = structuredClone(raw);
    const modified = changed[0].rows[3];
    Object.assign(modified.cancellations[0], change);
    Object.assign(modified.state.events[0], { at: modified.cancellations[0].atHour, guarantor: modified.cancellations[0].actor });
    modified.state.invitations[0].createdAt = modified.cancellations[0].createdAt;
    assert.throws(() => analyzeBlocks(changed));
  }
});
