import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { studyDesign, runBlock } from '../studies/2026-10-24-attended-comparison/run.mjs';
import { caseConfig, projectRun, methodDigests, COUNTERS, EVALUATOR } from '../studies/2026-10-24-attended-comparison/contract.mjs';
import { analyzeBlocks, validateRow } from '../studies/2026-10-24-attended-comparison/analyze.mjs';
import { experimentConfig, runExperiment } from '../src/experiment.mjs';
import { digestOf, implementationDigest } from '../src/provenance.mjs';

const directory = new URL('../studies/2026-10-24-attended-comparison/', import.meta.url);
const design = JSON.parse(readFileSync(new URL('design.json', directory)));
function blocks() {
  return design.seeds.map((seed, block) => ({
    schema: 'facety-attended-comparison-block/v1', block, captureCommit: 'a'.repeat(40), designDigest: digestOf(design), methodDigests: methodDigests(), source: structuredClone(design.source),
    assumptions: Object.fromEntries(design.timings.map(timing => [timing, ['synthetic contract fixture: ' + timing]])),
    rows: design.populations.flatMap(population => design.calendars.flatMap(calendar => design.timings.flatMap(timing => design.arms.map(arm => ({
      seed, population: population.id, calendar: calendar.id, timing, arm: arm.id,
      configDigest: digestOf(caseConfig(design, seed, population, calendar, timing, arm)), randomness: structuredClone(design.randomness[timing]), assumptionsDigest: digestOf(['synthetic contract fixture: ' + timing]),
      outcome: { horizonDays: 7, completedDays: 7, elapsedHours: 168, criterion: population.criterion, censored: false, success: false },
      process: { counters: Object.fromEntries(COUNTERS.map(key => [key, 0])), evaluator: Object.fromEntries(EVALUATOR.map(key => [key, 0])) },
      effort: { cohorts: { honest: { effort: 0 }, attackers: { effort: 0 } } },
      ledger: { minted: 0, burned: 0, supply: 0, emitterVault: 0, collector: 0, feeVault: 0, stakeVault: 0, debt: 0 },
      system: { falseAcceptedSubjects: 0, trust: { invitationsCancelled: 0 } }, impact: { falseConversions: 0 }, nativePopulation: { humanOperators: 12, initialSubjects: 12, initialAttackers: 3 },
      state: { subjects: Array.from({ length: 12 }, (_, index) => ({ id: 'n' + index, genesis: true, xp: 0, identityStatus: 'accepted' })), truth: Array.from({ length: 12 }, (_, index) => ({ id: 'n' + index, operator: 'n' + index, cohort: [0, 10, 11].includes(index) ? 'attackers' : 'honest', genuine: true })), invitations: [], selfIds: [], events: [] },
      daily: Array.from({ length: 7 }, (_, day) => ({ atHour: (day + 1) * 24 })),
    }))))),
  }));
}
function genuineCancellation(raw, calendar = 'all-ticks') {
  const row = raw[0].rows.find(row => row.population === 'genuine-coalition-descendants' && row.calendar === calendar && row.timing === 'daily-slot' && row.arm === 'veto');
  const control = raw[0].rows.find(other => other.population === row.population && other.calendar === row.calendar && other.timing === row.timing && other.arm === 'observe-only');
  const creation = { type: 'invitation-created', at: 0, invitation: 'i1', creator: 'n0', target: 'member:0' };
  row.state.events = [creation, { type: 'invitation-cancelled', at: 4, invitation: 'i1', guarantor: 'n1' }];
  row.state.invitations = [{ id: 'i1', creator: 'n0', target: 'member:0', createdAt: 0, acceptedAt: null, status: 'cancelled' }];
  control.state.events = [structuredClone(creation)];
  control.state.invitations = [{ id: 'i1', creator: 'n0', target: 'member:0', createdAt: 0, acceptedAt: null, status: 'open' }];
  Object.assign(row.process.counters, { pairTickOpportunities: 1, reviewSlots: 1, inspections: 1, positiveSignals: 1, cancelCalls: 1, cancelled: 1 });
  Object.assign(row.process.evaluator, { genuineTargetsInspected: 1, genuineTargetPositive: 1 });
  row.system.trust.invitationsCancelled = 1;
  return row;
}

test('fixed timing study declares 96 fresh-label cases, genuine control and unchanged daily inputs before data', () => {
  if (implementationDigest().digest === design.source.implementation) assert.deepEqual(studyDesign(), design);
  assert.equal(design.seeds.length * design.populations.length * design.calendars.length * design.timings.length * design.arms.length, 96);
  const prior = JSON.parse(readFileSync(new URL('../studies/2026-10-24-guardian-availability/design.json', import.meta.url)));
  assert.ok(design.seeds.every(seed => !prior.seeds.includes(seed)));
  for (const population of design.populations) for (const calendar of design.calendars) for (const timing of design.timings) for (const arm of design.arms) {
    const config = caseConfig(design, design.seeds[0], population, calendar, timing, arm);
    if (implementationDigest().digest === design.source.implementation) assert.deepEqual(config, experimentConfig(config));
    assert.deepEqual(config.activity, design.base.activity);
    assert.deepEqual(config.budgets, design.base.budgets);
    assert.equal(config.actorProfiles.length, calendar.offset === null ? 0 : 12);
  }
  if (implementationDigest().digest === design.source.implementation) {
    for (const population of design.populations) for (const timing of design.timings) {
      // Zero-day interface smoke uses a software label, never the declared research labels.
      const config = { ...caseConfig(design, 'attended-schema-software', population, design.calendars[0], timing, design.arms[0]), days: 0 };
      const native = runExperiment(config);
      const row = projectRun(native, population, design.calendars[0], timing, design.arms[0]);
      assert.equal(validateRow(row, population, design.arms[0], config).operators, 12);
      assert.equal(row.state.invitations.length, 0);
    }
  }
  assert.throws(() => runBlock(-1), /fixed block/);
  assert.throws(() => runBlock(4), /fixed block/);
  const raw = blocks();
  const before = structuredClone(raw);
  const report = analyzeBlocks(raw);
  assert.equal(report.cases, 96);
  assert.equal(report.cells.length, 24);
  assert.equal(report.timingEffects.length, 12);
  assert.equal(report.vetoEffects.length, 12);
  assert.deepEqual(analyzeBlocks(JSON.parse(JSON.stringify(raw)).reverse()), report);
  assert.deepEqual(raw, before);
  assert.ok(report.cells.every(cell => !Object.hasOwn(cell, 'successRate')));
});

test('fixed study rejects changed matrices, methods, source, policies, missingness and native/state disagreements', () => {
  for (const mutate of [
    raw => raw.pop(), raw => { raw[1].block = 0; }, raw => raw[0].rows.pop(), raw => { raw[0].rows[0] = raw[0].rows[1]; },
    raw => { raw[0].source.implementation = 'other'; }, raw => { raw[0].methodDigests['contract.mjs'] = 'other'; },
    raw => { raw[0].rows[0].configDigest = 'other'; }, raw => { raw[0].rows[0].randomness.invitationReviewSchedule = 'other'; },
    raw => { raw[0].rows[0].daily.pop(); }, raw => { delete raw[0].rows[0].process.counters.inspections; },
    raw => { raw[0].rows[0].process.counters.reviewSlots = 1; }, raw => { raw[0].rows[0].state.truth.pop(); },
    raw => { raw[0].rows[0].state.subjects[0].xp = -1; }, raw => { raw[0].rows[0].nativePopulation.humanOperators = 0; },
    raw => { raw[0].rows[0].ledger.supply = 1; }, raw => { raw[0].rows[0].effort.cohorts.honest.effort = -1; },
  ]) {
    const raw = blocks(); mutate(raw); assert.throws(() => analyzeBlocks(raw));
  }
  const raw = blocks();
  Object.assign(raw[0].rows[0].outcome, { censored: true, success: null, elapsedHours: 40, completedDays: 1 });
  raw[0].rows[0].daily = [{ atHour: 24 }];
  raw[0].rows[0].process.counters.reviewSlots = 1;
  raw[0].rows[0].state.invitations = [{ id: 'partial', creator: 'n0', target: 'future', createdAt: 40, acceptedAt: null, status: 'open' }];
  raw[0].rows[0].state.events = [{ type: 'invitation-created', at: 40, invitation: 'partial', creator: 'n0', target: 'future' }];
  const report = analyzeBlocks(raw);
  assert.equal(report.cells[0].completeRuns, 3);
  assert.equal(report.cells[0].metrics.falseAccepted.mean, null);
  assert.equal(report.timingEffects[0].metrics.falseAccepted.mean, null);
  assert.equal(report.vetoEffects[0].censoredPrefixChecksSkipped, 1);
});

test('genuine-only invitation harm is measured separately from structural false-identity zeros', () => {
  const raw = blocks(); genuineCancellation(raw);
  const report = analyzeBlocks(raw);
  const cell = report.cells.find(row => row.population === 'genuine-coalition-descendants' && row.calendar === 'all-ticks' && row.timing === 'daily-slot' && row.arm === 'veto');
  assert.deepEqual(cell.metrics.genuineInvitationsCancelled.values, [1, 0, 0, 0]);
  assert.equal(cell.metrics.falseInvitationsCancelled.mean, 0);
  assert.match(cell.metricApplicability, /structural/);
  assert.match(report.harmCoverage, /not evaluated/);
  for (const change of [
    row => { row.state.events[1].at = 24; },
    row => { row.state.events[1].at = 8; },
    row => { row.state.events[1].guarantor = 'n0'; },
    row => { row.state.events.pop(); },
    row => { row.process.evaluator.falseTargetsInspected = 1; },
  ]) {
    const invalid = blocks(); const row = genuineCancellation(invalid, 'one-tick-phase-0'); change(row);
    assert.throws(() => analyzeBlocks(invalid));
  }
});

test('pending lifetimes and genuine recruited operators stay explicit rather than counted as prevention', () => {
  const raw = blocks();
  const row = raw[0].rows.find(row => row.population === 'genuine-coalition-descendants' && row.arm === 'observe-only');
  const twin = raw[0].rows.find(other => other.population === row.population && other.calendar === row.calendar && other.timing === row.timing && other.arm === 'veto');
  for (const item of [row, twin]) {
    item.state.invitations = [{ id: 'late', creator: 'n0', target: 'future', createdAt: 164, acceptedAt: null, status: 'open' }];
    item.state.events = [{ type: 'invitation-created', at: 164, invitation: 'late', creator: 'n0', target: 'future' }];
  }
  const report = analyzeBlocks(raw);
  const cell = report.cells.find(cell => cell.population === row.population && cell.calendar === row.calendar && cell.timing === row.timing && cell.arm === row.arm);
  assert.deepEqual(cell.metrics.openInvitations.values, [1, 0, 0, 0]);
  assert.equal(cell.metrics.genuineAcceptedDescendants.mean, 0);
  const recruited = blocks();
  for (const item of recruited[0].rows.filter(item => item.population === row.population && item.calendar === row.calendar && item.timing === row.timing)) {
    item.state.truth.push({ id: 'member:0', genuine: true, cohort: 'attackers', operator: 'member:0' });
    item.state.subjects.push({ id: 'member:0', genesis: false, xp: 3, identityStatus: 'accepted' });
    item.nativePopulation.humanOperators = 13;
  }
  const recruitedCell = analyzeBlocks(recruited).cells.find(cell => cell.population === row.population && cell.calendar === row.calendar && cell.timing === row.timing && cell.arm === row.arm);
  assert.deepEqual(recruitedCell.metrics.genuineAcceptedDescendants.values, [1, 0, 0, 0]);
  assert.deepEqual(recruitedCell.metrics.operators.values, [13, 12, 12, 12]);
  assert.equal(recruitedCell.metrics.falseAccepted.mean, 0);
});
