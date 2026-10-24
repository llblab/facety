import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { auditBlocks } from '../studies/2026-10-24-shared-evidence-comparison/audit.mjs';
import { execFileSync } from 'node:child_process';
import { studyDesign, runBlock } from '../studies/2026-10-24-shared-evidence-comparison/run.mjs';
import { caseConfig, projectRun, measure, methodDigests, METHOD_FILES } from '../studies/2026-10-24-shared-evidence-comparison/contract.mjs';
import { analyzeBlocks } from '../studies/2026-10-24-shared-evidence-comparison/analyze.mjs';
import { COUNTERS, EVALUATOR } from '../studies/2026-10-24-attended-comparison/contract.mjs';
import { experimentConfig, runExperiment } from '../src/experiment.mjs';
import { digestOf, implementationDigest } from '../src/provenance.mjs';

const directory = new URL('../studies/2026-10-24-shared-evidence-comparison/', import.meta.url);
const design = JSON.parse(readFileSync(new URL('design.json', directory)));
function blocks() {
  return design.seeds.map((seed, block) => ({
    schema: 'facety-shared-evidence-block/v1', block, captureCommit: 'a'.repeat(40), designDigest: digestOf(design), methodDigests: methodDigests(), source: structuredClone(design.source),
    assumptions: Object.fromEntries(design.evidence.map(evidence => [evidence, ['synthetic software contract: ' + evidence]])),
    rows: design.populations.flatMap(population => design.calendars.flatMap(calendar => design.evidence.flatMap(evidence => design.arms.map(arm => ({
      seed, population: population.id, calendar: calendar.id, timing: design.timing, evidence, arm: arm.id,
      configDigest: digestOf(caseConfig(design, seed, population, calendar, evidence, arm)), randomness: structuredClone(design.randomness[evidence]), assumptionsDigest: digestOf(['synthetic software contract: ' + evidence]),
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
  const row = raw[0].rows.find(item => item.population === 'genuine-coalition-descendants' && item.calendar === calendar && item.evidence === 'shared-target' && item.arm === 'veto');
  const control = raw[0].rows.find(item => item.population === row.population && item.calendar === calendar && item.evidence === row.evidence && item.arm === 'observe-only');
  const creation = { type: 'invitation-created', at: 0, invitation: 'i1', creator: 'n0', target: 'future' };
  row.state.events = [creation, { type: 'invitation-cancelled', at: 4, invitation: 'i1', guarantor: 'n1' }];
  row.state.invitations = [{ id: 'i1', creator: 'n0', target: 'future', createdAt: 0, acceptedAt: null, status: 'cancelled' }];
  control.state.events = [structuredClone(creation)];
  control.state.invitations = [{ id: 'i1', creator: 'n0', target: 'future', createdAt: 0, acceptedAt: null, status: 'open' }];
  Object.assign(row.process.counters, { pairTickOpportunities: 1, reviewSlots: 1, inspections: 1, positiveSignals: 1, cancelCalls: 1, cancelled: 1 });
  Object.assign(row.process.evaluator, { genuineTargetsInspected: 1, genuineTargetPositive: 1 });
  row.system.trust.invitationsCancelled = 1;
  return row;
}

test('shared-evidence design fixes 64 fresh-label cases and byte-binds its historical method dependencies', () => {
  if (implementationDigest().digest === design.source.implementation) assert.deepEqual(studyDesign(), design);
  assert.equal(design.seeds.length * design.populations.length * design.calendars.length * design.evidence.length * design.arms.length, 64);
  assert.equal(METHOD_FILES.length, 7);
  assert.equal(Object.keys(methodDigests()).length, 7);
  assert.ok(METHOD_FILES.includes('studies/2026-10-24-attended-comparison/analyze.mjs'));
  const previous = ['attended-comparison', 'guardian-availability'].flatMap(name => JSON.parse(readFileSync(new URL('../studies/2026-10-24-' + name + '/design.json', import.meta.url))).seeds);
  assert.ok(design.seeds.every(seed => !previous.includes(seed)));
  for (const population of design.populations) for (const calendar of design.calendars) for (const evidence of design.evidence) for (const arm of design.arms) {
    const config = caseConfig(design, design.seeds[0], population, calendar, evidence, arm);
    if (implementationDigest().digest === design.source.implementation) assert.deepEqual(experimentConfig(config), config);
    assert.equal(config.invitationReviewTiming, 'first-attended');
    assert.equal(config.invitationEvidence, evidence);
    assert.equal(config.social.verification, false);
    assert.equal(config.activity.honest.invite + config.activity.honest.inspect + config.activity.attackers.review, 0);
    assert.deepEqual(config.budgets, { honest: 100000, attackers: 100000 });
  }
});

test('four zero-day software-only interface smokes project both classes/laws without research invitations', () => {
  if (implementationDigest().digest !== design.source.implementation) return;
  for (const population of design.populations) for (const evidence of design.evidence) {
    const config = { ...caseConfig(design, 'shared-study-schema-software', population, design.calendars[0], evidence, design.arms[0]), days: 0 };
    const run = runExperiment(config);
    const row = projectRun(run, population, design.calendars[0], evidence, design.arms[0]);
    assert.equal(row.state.invitations.length, 0);
    assert.deepEqual(row.randomness, design.randomness[evidence]);
    assert.equal(measure(row, population).falseAccepted, 0);
    assert.equal(row.evidence, evidence);
    assert.ok(!design.seeds.includes(row.seed));
  }
  for (const index of [-1, 4, 0.5, null]) assert.throws(() => runBlock(index), /index 0\.\.3/);
  assert.throws(() => execFileSync(process.execPath, [new URL('run.mjs', directory).pathname, '0', '--override'], { stdio: 'pipe' }), /no scenario\/output\/drift overrides/);
});

test('retained shared-evidence packet binds attempts, methods and projections without model recapture', () => {
  const raw = [0, 1, 2, 3].map(index => JSON.parse(readFileSync(new URL('block-' + index + '.json', directory))));
  const report = JSON.parse(readFileSync(new URL('report.json', directory)));
  const audit = JSON.parse(readFileSync(new URL('audit.json', directory)));
  assert.deepEqual(analyzeBlocks(raw), report);
  assert.deepEqual(auditBlocks(raw), audit);
  assert.equal(report.cases, 64);
  assert.ok(report.cells.every(cell => cell.completeRuns === 4));
  assert.equal(audit.completeEventPrefixChecks, 32);
  assert.equal(audit.censoredPrefixChecksSkipped, 0);
  assert.ok(audit.observeOnlyInvariants.every(item => item.sameNativeState));
  assert.equal(audit.sharedFalseAdmissions.length, 6);
  assert.ok(audit.sharedFalseAdmissions.every(item => item.keyImpliedSuspicious === false));
  assert.equal(audit.genuineWitnesses.length, 4);
  assert.ok(audit.genuineWitnesses.every(item => item.sameCreation && item.evidence === 'independent'));
  for (const block of raw) {
    const attempt = JSON.parse(readFileSync(new URL('attempt-' + block.block + '.json', directory)));
    for (const field of ['block', 'captureCommit', 'designDigest', 'methodDigests', 'source']) assert.deepEqual(attempt[field], block[field]);
  }
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory)));
  assert.equal(manifest.captureCommit, report.captureCommit);
  assert.equal(manifest.designDigest, report.designDigest);
  assert.deepEqual(manifest.methodDigests, report.methodDigests);
  assert.deepEqual(manifest.source, design.source);
  assert.deepEqual(manifest.capture, { blocks: 4, casesPerBlock: 16, executions: 64, complete: 64, failedRecords: 0 });
  for (const [file, expected] of Object.entries(manifest.artifacts)) {
    const bytes = readFileSync(new URL('../' + file, import.meta.url));
    assert.equal(bytes.length, expected.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
  }
});

test('offline shared-evidence matrix rejects changed identity, source, dependencies, policy, counts and prefixes', () => {
  const report = analyzeBlocks(blocks());
  assert.equal(report.cases, 64);
  assert.equal(report.cells.length, 16);
  assert.equal(report.evidenceEffects.length, 8);
  assert.equal(report.vetoEffects.reduce((sum, row) => sum + row.completeEventPrefixChecks, 0), 32);
  for (const mutate of [
    raw => raw.pop(), raw => raw[0].rows.pop(), raw => { raw[1].block = 0; }, raw => { raw[0].rows[0] = raw[0].rows[1]; },
    raw => { raw[0].source.implementation = 'other'; }, raw => { raw[0].methodDigests[METHOD_FILES[5]] = 'other'; },
    raw => { raw[0].rows[0].evidence = 'other'; }, raw => { raw[0].rows[0].timing = 'daily-slot'; },
    raw => { raw[0].rows[0].seed = 'other'; }, raw => { raw[0].rows[0].configDigest = 'other'; },
    raw => { raw[0].rows[0].randomness.invitationEvidence = 'other'; }, raw => { raw[0].rows[0].assumptionsDigest = 'other'; },
    raw => { raw[0].rows[0].daily.pop(); }, raw => { raw[0].rows[0].outcome.completedDays = -1; },
    raw => { raw[0].rows[0].outcome.success = null; }, raw => { delete raw[0].rows[0].process.counters.inspections; },
    raw => { raw[0].rows[0].state.truth.pop(); }, raw => { raw[0].rows[0].nativePopulation.humanOperators = 0; },
    raw => { raw[0].rows[0].ledger.supply = 1; }, raw => { raw[0].rows[0].effort.cohorts.honest.effort = -1; },
    raw => { raw[0].rows[0].state.events.push({ at: 0, type: 'unmatched' }); },
  ]) { const raw = blocks(); mutate(raw); assert.throws(() => analyzeBlocks(raw)); }
});

test('genuine control harm and common-mode contrasts remain distinct from false-identity structural zeros', () => {
  const raw = blocks(); genuineCancellation(raw);
  const report = analyzeBlocks(raw);
  const cell = report.cells.find(row => row.population === 'genuine-coalition-descendants' && row.calendar === 'all-ticks' && row.evidence === 'shared-target' && row.arm === 'veto');
  assert.deepEqual(cell.metrics.genuineInvitationsCancelled.values, [1, 0, 0, 0]);
  assert.equal(cell.metrics.falseInvitationsCancelled.mean, 0);
  assert.match(cell.metricApplicability, /structural/);
  const effect = report.evidenceEffects.find(row => row.population === cell.population && row.calendar === cell.calendar && row.arm === 'veto');
  assert.deepEqual(effect.metrics.genuineInvitationsCancelled.values, [1, 0, 0, 0]);
  for (const mutate of [
    row => { row.state.events[1].at = 24; }, row => { row.state.events[1].at = 8; },
    row => { row.state.events[1].guarantor = 'n0'; }, row => { row.state.events.pop(); },
    row => { row.process.evaluator.falseTargetsInspected = 1; },
  ]) { const invalid = blocks(); mutate(genuineCancellation(invalid, 'one-tick-phase-0')); assert.throws(() => analyzeBlocks(invalid)); }
});

test('partial raw measurements and horizon-pending invitations do not become complete means or prevention', () => {
  const raw = blocks();
  const partial = raw[0].rows[0];
  Object.assign(partial.outcome, { censored: true, success: null, elapsedHours: 40, completedDays: 1 });
  partial.daily = [{ atHour: 24 }];
  partial.process.counters.reviewSlots = 1;
  const report = analyzeBlocks(raw);
  assert.equal(report.cells[0].metrics.falseAccepted.mean, null);
  assert.equal(report.evidenceEffects[0].metrics.falseAccepted.mean, null);
  assert.equal(report.vetoEffects[0].censoredPrefixChecksSkipped, 1);
  const futureEndpoint = structuredClone(raw);
  futureEndpoint[0].rows[0].daily = [{ atHour: 48 }];
  assert.throws(() => analyzeBlocks(futureEndpoint), /outcome\/endpoint mismatch/);
  const pending = blocks();
  for (const row of pending[0].rows.filter(row => row.population === 'genuine-coalition-descendants' && row.calendar === 'all-ticks' && row.evidence === 'shared-target')) {
    row.state.invitations = [{ id: 'late', creator: 'n0', target: 'future', createdAt: 164, acceptedAt: null, status: 'open' }];
    row.state.events = [{ type: 'invitation-created', at: 164, invitation: 'late', creator: 'n0', target: 'future' }];
  }
  const cell = analyzeBlocks(pending).cells.find(row => row.population === 'genuine-coalition-descendants' && row.calendar === 'all-ticks' && row.evidence === 'shared-target' && row.arm === 'veto');
  assert.deepEqual(cell.metrics.openInvitations.values, [1, 0, 0, 0]);
  assert.equal(cell.metrics.genuineInvitationsCancelled.mean, 0);
});
