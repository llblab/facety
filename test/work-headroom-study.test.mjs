import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { auditBlocks } from '../studies/2026-10-24-work-headroom/audit.mjs';
import { execFileSync } from 'node:child_process';
import { studyDesign, runBlock } from '../studies/2026-10-24-work-headroom/run.mjs';
import { caseConfig, projectRun, validateWork, methodDigests, METHOD_FILES } from '../studies/2026-10-24-work-headroom/contract.mjs';
import { analyzeBlocks } from '../studies/2026-10-24-work-headroom/analyze.mjs';
import { COUNTERS, EVALUATOR } from '../studies/2026-10-24-attended-comparison/contract.mjs';
import { experimentConfig, runExperiment } from '../src/experiment.mjs';
import { digestOf, implementationDigest } from '../src/provenance.mjs';

const directory = new URL('../studies/2026-10-24-work-headroom/', import.meta.url);
const design = JSON.parse(readFileSync(new URL('design.json', directory)));
const counts = (effort = 0) => ({ attempts: effort, accepted: effort, rejected: 0, denied: 0, effort });
function effort(config) {
  const cohorts = Object.fromEntries(['honest', 'attackers'].map(cohort => {
    const setup = cohort === 'honest' ? 198 : 66;
    const byAction = Object.fromEntries(Object.keys(config.weights).map(action => [action, counts()]));
    byAction.proposeGuarantee = counts(setup / 2);
    byAction.confirmGuarantee = counts(setup / 2);
    return [cohort, { ...counts(setup), byAction, byPhase: { setup: counts(setup), maintenance: counts() }, budget: config.budgets[cohort], remaining: config.budgets[cohort] - setup }];
  }));
  return { unit: 'uncalibrated weighted action-effort units', weights: structuredClone(config.weights), calls: 264, maxActions: 100000, cohorts };
}
function trace(config) {
  const points = [{ atHour: 0, stage: 'initial' }];
  for (let at = 0; at < config.days * 24; at += 4) {
    if (at > 0 && at % 24 === 0) points.push({ atHour: at, stage: 'day-end' });
    points.push({ atHour: at, stage: 'tick-end' });
  }
  points.push({ atHour: config.days * 24, stage: 'day-end' }, { atHour: config.days * 24, stage: 'horizon' });
  return points.map(point => ({ ...point, cohorts: Object.fromEntries(['honest', 'attackers'].map(cohort => [cohort, { cumulativeEffort: cohort === 'honest' ? 198 : 66, deniedDelta: 0, byActionDeniedDeltas: Object.fromEntries(Object.keys(config.weights).map(action => [action, 0])) }])) }));
}
function blocks() {
  return design.seeds.map((seed, block) => ({
    schema: 'facety-work-headroom-block/v1', block, captureCommit: 'a'.repeat(40), designDigest: digestOf(design), methodDigests: methodDigests(), source: structuredClone(design.source),
    assumptions: Object.fromEntries(design.evidence.map(evidence => [evidence, ['synthetic accounting fixture: ' + evidence]])),
    rows: design.populations.flatMap(population => design.resources.flatMap(resource => design.evidence.flatMap(evidence => design.arms.map(arm => {
      const config = caseConfig(design, seed, population, resource, evidence, arm);
      return { seed, population: population.id, resource: resource.id, evidence, arm: arm.id, timing: design.timing, calendar: 'all-ticks',
        configDigest: digestOf(config), randomness: structuredClone(design.randomness[evidence]), assumptionsDigest: digestOf(['synthetic accounting fixture: ' + evidence]),
        bootstrap: structuredClone(design.bootstrap), denialTrace: trace(config),
        outcome: { horizonDays: 7, completedDays: 7, elapsedHours: 168, criterion: population.criterion, censored: false, success: false },
        process: { counters: Object.fromEntries(COUNTERS.map(key => [key, 0])), evaluator: Object.fromEntries(EVALUATOR.map(key => [key, 0])) },
        effort: effort(config), ledger: { minted: 0, burned: 0, supply: 0, emitterVault: 0, collector: 0, feeVault: 0, stakeVault: 0, debt: 0 },
        system: { falseAcceptedSubjects: 0, trust: { invitationsCancelled: 0 } }, impact: { falseConversions: 0 }, nativePopulation: { humanOperators: 12, initialSubjects: 12, initialAttackers: 3 },
        state: { subjects: Array.from({ length: 12 }, (_, i) => ({ id: 'n' + i, genesis: true, xp: 0, identityStatus: 'accepted' })), truth: Array.from({ length: 12 }, (_, i) => ({ id: 'n' + i, genuine: true, cohort: [0, 10, 11].includes(i) ? 'attackers' : 'honest', operator: 'n' + i })), selfIds: [], invitations: [], events: [] },
        daily: Array.from({ length: 7 }, (_, day) => ({ atHour: 24 * (day + 1) })),
      };
    })))),
  }));
}
// Accounting-only fixture: no claim that these synthetic counters describe a funded protocol trajectory.
function denial(row, response = false) {
  const cohort = row.effort.cohorts.honest;
  const headroom = cohort.remaining;
  const paid = cohort.byAction.proposeGuarantee;
  const rejected = headroom - Number(response);
  paid.attempts += rejected; paid.rejected += rejected; paid.effort += rejected;
  if (response) cohort.byAction.inspect = counts(1);
  const action = response ? 'respond' : 'inspect';
  cohort.byAction[action].denied = 1;
  cohort.attempts += headroom; cohort.accepted += Number(response); cohort.rejected += rejected; cohort.effort += headroom; cohort.denied = 1; cohort.remaining = 0;
  cohort.byPhase.maintenance = { attempts: headroom, accepted: Number(response), rejected, denied: 1, effort: headroom };
  row.effort.calls += headroom + 1;
  if (response) {
    Object.assign(row.process.counters, { pairTickOpportunities: 1, reviewSlots: 1, inspections: 1, positiveSignals: 1, cancelCalls: 1, cancelBudgetDenied: 1 });
    Object.assign(row.process.evaluator, { falseTargetsInspected: 1, falseTargetPositive: 1 });
  } else Object.assign(row.process.counters, { pairTickOpportunities: 1, reviewSlots: 1, inspectionDenied: 1 });
  for (const point of row.denialTrace) {
    if (point.atHour >= 12) point.cohorts.honest.cumulativeEffort = cohort.budget;
    // Tick 12 and day-end 24 describe the same first denial in overlapping streams.
    if ((point.atHour === 12 && point.stage === 'tick-end') || (point.atHour === 24 && point.stage === 'day-end')) {
      point.cohorts.honest.deniedDelta = 1;
      point.cohorts.honest.byActionDeniedDeltas[action] = 1;
    }
  }
}

test('fixed work study declares 96 fresh-label cases and structurally anchored whole-run caps', () => {
  if (implementationDigest().digest === design.source.implementation) assert.deepEqual(studyDesign(), design);
  assert.equal(design.seeds.length * design.populations.length * design.resources.length * design.evidence.length * design.arms.length, 96);
  assert.deepEqual(design.resources.map(resource => resource.cap), [261, 324, 100000]);
  assert.deepEqual(design.resources.map(resource => resource.cap - 198), [63, 126, 99802]);
  assert.equal(METHOD_FILES.length, 7);
  const prior = ['shared-evidence-comparison', 'attended-comparison', 'guardian-availability'].flatMap(name => JSON.parse(readFileSync(new URL('../studies/2026-10-24-' + name + '/design.json', import.meta.url))).seeds);
  assert.ok(design.seeds.every(seed => !prior.includes(seed)));
  for (const population of design.populations) for (const resource of design.resources) for (const evidence of design.evidence) for (const arm of design.arms) {
    const config = caseConfig(design, design.seeds[0], population, resource, evidence, arm);
    if (implementationDigest().digest === design.source.implementation) assert.deepEqual(experimentConfig(config), config);
    assert.equal(config.budgets.honest, resource.cap);
    assert.equal(config.budgets.attackers, 100000);
    assert.deepEqual(config.actorProfiles, []);
  }
  for (const index of [-1, 4, 0.5, null]) assert.throws(() => runBlock(index), /index 0\.\.3/);
  assert.throws(() => execFileSync(process.execPath, [new URL('run.mjs', directory).pathname, '0', '--override'], { stdio: 'pipe' }), /no scenario\/output\/drift overrides/);
});

test('twelve zero-day software configurations preserve identical fully funded bootstrap and no money or XP', () => {
  if (implementationDigest().digest !== design.source.implementation) return;
  let signature = null;
  for (const population of design.populations) for (const resource of design.resources) for (const evidence of design.evidence) {
    const config = { ...caseConfig(design, 'work-headroom-bootstrap-software', population, resource, evidence, design.arms[0]), days: 0 };
    const run = runExperiment(config);
    const row = projectRun(run, population, resource, evidence, design.arms[0]);
    validateWork(row, config, design);
    assert.deepEqual(row.bootstrap, design.bootstrap);
    assert.equal(run.state.guarantees.edges.length, 132);
    assert.equal(run.state.invitations.length, 0);
    assert.equal(run.metrics.ledger.minted + run.metrics.ledger.burned + run.metrics.ledger.supply, 0);
    assert.ok(run.state.subjects.every(subject => subject.xp === 0 && subject.liquidFacy === 0 && subject.genesis));
    const actual = digestOf({ state: run.state, ledger: run.metrics.ledger });
    signature ??= actual;
    assert.equal(actual, signature);
    assert.equal(actual, '39bfe70252626b0b6d0f16d859ff480586f8ea21dd7124e8b37ecd491af1776f');
  }
});

test('resource analyzer rejects matrix, bootstrap, method, policy, work/call and trace tampering', () => {
  const baseline = analyzeBlocks(blocks());
  assert.equal(baseline.cases, 96);
  assert.equal(baseline.cells.length, 24);
  assert.equal(baseline.resourceEffects.length, 16);
  assert.equal(baseline.evidenceEffects.length, 12);
  assert.equal(baseline.vetoEffects.reduce((sum, row) => sum + row.completeEventPrefixChecks, 0), 48);
  for (const mutate of [
    raw => raw.pop(), raw => raw[0].rows.pop(), raw => { raw[0].rows[0] = raw[0].rows[1]; },
    raw => { raw[0].source.implementation = 'other'; }, raw => { raw[0].methodDigests[METHOD_FILES[4]] = 'other'; },
    raw => { raw[0].rows[0].resource = 'other'; }, raw => { raw[0].rows[0].randomness.invitationReviewSchedule = 'other'; },
    raw => { raw[0].rows[0].configDigest = 'other'; }, raw => { raw[0].rows[0].bootstrap.guaranteeEdges = 131; },
    raw => { raw[0].rows[0].effort.calls++; }, raw => { raw[0].rows[0].effort.cohorts.honest.remaining++; },
    raw => { raw[0].rows[0].effort.cohorts.honest.byAction.inspect.attempts = 1; },
    raw => { raw[0].rows[0].effort.cohorts.honest.byPhase.setup.denied = 1; },
    raw => { raw[0].rows[0].denialTrace.splice(2, 1); }, raw => { raw[0].rows[0].denialTrace[1].cohorts.honest.cumulativeEffort = 0; },
    raw => { raw[0].rows[0].denialTrace[0].cohorts.honest.cumulativeEffort = 0; },
    raw => { raw[0].rows[0].daily.pop(); }, raw => { raw[0].rows[0].state.truth.pop(); },
  ]) { const raw = blocks(); mutate(raw); assert.throws(() => analyzeBlocks(raw)); }
});

test('economic denials stay complete outcomes with paid/rejected/denied work separate and overlap not double-counted', () => {
  for (const response of [false, true]) {
    const raw = blocks(); denial(raw[0].rows[0], response);
    const report = analyzeBlocks(raw);
    const cell = report.cells[0];
    assert.equal(cell.completeRuns, 4);
    assert.deepEqual(cell.metrics.defenderDenied.values, [1, 0, 0, 0]);
    assert.equal(cell.metrics.defenderDenied.mean, 0.25);
    assert.equal(cell.firstDeniedSamples[0].cohorts.honest.atHour, 12);
    assert.equal(cell.metrics[response ? 'reviewResponseDenied' : 'reviewInspectionDenied'].values[0], 1);
    const double = structuredClone(raw);
    const terminal = double[0].rows[0].denialTrace.at(-1).cohorts.honest;
    terminal.deniedDelta = 1; terminal.byActionDeniedDeltas[response ? 'respond' : 'inspect'] = 1;
    assert.throws(() => analyzeBlocks(double), /terminal denials/);
  }
});

test('capped prefixes retain unknown means and skip prefix assurance, while pending/genuine harm stay separate', () => {
  const raw = blocks(), row = raw[0].rows[0];
  Object.assign(row.outcome, { censored: true, success: null, elapsedHours: 40, completedDays: 1 });
  row.daily = [{ atHour: 24 }];
  row.process.counters.reviewSlots = 1;
  row.denialTrace = row.denialTrace.filter(point => point.atHour < 40);
  row.denialTrace.push({ ...structuredClone(row.denialTrace.at(-1)), atHour: 40, stage: 'censored' });
  const report = analyzeBlocks(raw);
  assert.equal(report.cells[0].metrics.falseAccepted.mean, null);
  assert.equal(report.resourceEffects[0].metrics.falseAccepted.mean, null);
  assert.equal(report.vetoEffects[0].censoredPrefixChecksSkipped, 1);
  const pending = blocks();
  for (const item of pending[0].rows.filter(item => item.population === 'genuine-coalition-descendants' && item.resource === design.resources[0].id && item.evidence === 'independent')) {
    item.state.invitations = [{ id: 'late', creator: 'n0', target: 'future', createdAt: 164, acceptedAt: null, status: 'open' }];
    item.state.events = [{ type: 'invitation-created', at: 164, invitation: 'late', creator: 'n0', target: 'future' }];
  }
  const cell = analyzeBlocks(pending).cells.find(item => item.population === 'genuine-coalition-descendants' && item.resource === design.resources[0].id && item.evidence === 'independent');
  assert.deepEqual(cell.metrics.openInvitations.values, [1, 0, 0, 0]);
  assert.equal(cell.metrics.falseAccepted.mean, 0);
  assert.match(cell.metricApplicability, /structural/);
  const genuine = blocks();
  const treated = genuine[0].rows.find(item => item.population === 'genuine-coalition-descendants' && item.resource === design.resources[0].id && item.evidence === 'independent' && item.arm === 'veto');
  const control = genuine[0].rows.find(item => item.population === treated.population && item.resource === treated.resource && item.evidence === treated.evidence && item.arm === 'observe-only');
  const creation = { type: 'invitation-created', at: 0, invitation: 'good', creator: 'n0', target: 'new-genuine' };
  treated.state.invitations = [{ id: 'good', creator: 'n0', target: 'new-genuine', createdAt: 0, acceptedAt: null, status: 'cancelled' }];
  treated.state.events = [creation, { type: 'invitation-cancelled', at: 4, invitation: 'good', guarantor: 'n1' }];
  control.state.invitations = [{ ...treated.state.invitations[0], status: 'accepted', acceptedAt: 24 }];
  control.state.events = [structuredClone(creation)];
  control.state.subjects.push({ id: 'new-genuine', genesis: false, xp: 0, identityStatus: 'accepted' });
  control.state.truth.push({ id: 'new-genuine', cohort: 'attackers', genuine: true, operator: 'new-genuine' });
  control.nativePopulation.humanOperators++;
  const paid = treated.effort.cohorts.honest;
  paid.byAction.inspect = counts(1); paid.byAction.respond = counts(1);
  paid.byPhase.maintenance = counts(2); paid.attempts += 2; paid.accepted += 2; paid.effort += 2; paid.remaining -= 2;
  treated.effort.calls += 2;
  for (const point of treated.denialTrace) if (point.atHour >= 4) point.cohorts.honest.cumulativeEffort += 2;
  Object.assign(treated.process.counters, { pairTickOpportunities: 1, reviewSlots: 1, inspections: 1, positiveSignals: 1, cancelCalls: 1, cancelled: 1 });
  Object.assign(treated.process.evaluator, { genuineTargetsInspected: 1, genuineTargetPositive: 1 });
  treated.system.trust.invitationsCancelled = 1;
  const harmed = analyzeBlocks(genuine).cells.find(item => item.population === treated.population && item.resource === treated.resource && item.evidence === treated.evidence && item.arm === treated.arm);
  assert.deepEqual(harmed.metrics.genuineInvitationsCancelled.values, [1, 0, 0, 0]);
  assert.equal(harmed.metrics.falseInvitationsCancelled.mean, 0);
});

test('sealed work-headroom packet reproduces exact primary/post-data analyses and binds all attempts/artifacts without recapture', () => {
  const raw = [0, 1, 2, 3].map(index => JSON.parse(readFileSync(new URL('block-' + index + '.json', directory))));
  const report = JSON.parse(readFileSync(new URL('report.json', directory)));
  const audit = JSON.parse(readFileSync(new URL('audit.json', directory)));
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory)));
  assert.deepEqual(analyzeBlocks(raw), report);
  assert.deepEqual(auditBlocks(raw), audit);
  assert.equal(report.cases, 96);
  assert.ok(report.cells.every(cell => cell.completeRuns === 4));
  assert.equal(audit.bootstrapChecks, 96);
  assert.equal(audit.completeEventPrefixChecks, 48);
  assert.equal(audit.censoredPrefixChecksSkipped, 0);
  assert.equal(Object.keys(manifest.artifacts).length, 19);
  for (const [file, expected] of Object.entries(manifest.artifacts)) {
    const bytes = readFileSync(new URL('../' + file, import.meta.url));
    assert.equal(bytes.length, expected.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
  }
  for (const [index, block] of raw.entries()) {
    const attempt = JSON.parse(readFileSync(new URL('attempt-' + index + '.json', directory)));
    for (const field of ['block', 'captureCommit', 'source', 'methodDigests', 'designDigest']) assert.deepEqual(block[field], attempt[field]);
    assert.equal(block.captureCommit, manifest.captureCommit);
    for (const field of ['source', 'methodDigests', 'designDigest']) assert.deepEqual(block[field], manifest[field]);
  }
  const matched = audit.budgetPairs.filter(row => row.population === 'fabricated-descendants' && row.resource === 'headroom-126' && row.evidence === 'independent' && row.arm === 'veto');
  assert.equal(matched.length, 4);
  assert.ok(matched.every(row => row.equalNativeState && row.equalProcess && row.equalActionWork));
  const tight = report.cells.find(row => row.population === 'fabricated-descendants' && row.resource === 'headroom-63' && row.evidence === 'independent' && row.arm === 'veto');
  assert.deepEqual(tight.metrics.falseAccepted.values, [0, 1, 2, 1]);
  assert.deepEqual(tight.metrics.falseSelfIdActs.values, [0, 1, 0, 0]);
  assert.equal(audit.cases.reduce((sum, row) => sum + row.genuineCancellations.length, 0), 6); // Overlapping budget histories, not six independent errors.
  if (implementationDigest().digest === design.source.implementation && process.version === design.source.node) assert.throws(() => runBlock(0), /existing\/failed capture/);
});
