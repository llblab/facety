import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fundSlots, readRetainedBlocks, reconstructCase, auditWindows } from '../studies/2026-10-24-work-headroom/window-audit.mjs';
import { caseConfig } from '../studies/2026-10-24-work-headroom/contract.mjs';

const directory = new URL('../studies/2026-10-24-work-headroom/', import.meta.url);
const design = JSON.parse(readFileSync(new URL('design.json', directory)));
const retained = readRetainedBlocks();
const configOf = row => caseConfig(design, row.seed, design.populations.find(value => value.id === row.population), design.resources.find(value => value.id === row.resource), row.evidence, design.arms.find(value => value.id === row.arm));
let reconstructed;
const report = () => reconstructed ??= auditWindows(retained);

test('inverse unit-pool funding matches independent forward ticket spending for every small bit pattern and balance', () => {
  let partitions = 0;
  for (let size = 0; size <= 7; size++) for (let bits = 0; bits < 2 ** size; bits++) for (let start = 0; start <= 2 * size + 3; start++) {
    let balance = start, deniedLooks = 0, deniedResponses = 0;
    const observed = [], expected = [];
    for (let i = 0; i < size; i++) {
      const before = balance;
      const paid = balance > 0;
      if (paid) balance--; else deniedLooks++;
      const positive = paid ? Boolean(bits & (1 << i)) : null;
      let response = null;
      if (positive) { response = balance > 0; if (response) balance--; else deniedResponses++; }
      observed.push({ positive });
      expected.push({ positive, paidInspection: paid, paidResponse: response, remainingBefore: before, remainingAfter: balance });
    }
    const actual = fundSlots(observed, deniedLooks, deniedResponses, balance);
    assert.equal(actual.startRemaining, start);
    assert.deepEqual(actual.slots, expected);
    partitions++;
  }
  assert.equal(partitions, 4096);
  assert.throws(() => fundSlots([{ positive: null }], 1, 0, 1), /not a prefix/);
  assert.throws(() => fundSlots([{ positive: false }], 0, 1, 0), /impossible/);
  assert.throws(() => fundSlots([{ positive: true }], 1, 0, 0), /impossible/); // No inferred signal for an unfunded look.
});

test('all 96 source-bound cases reconcile native stages/evaluator and every paid/denied honest work channel', () => {
  const audit = report();
  assert.equal(audit.cases.length, 96);
  for (const row of retained.flatMap(block => block.rows)) {
    const actual = audit.cases.find(value => value.seed === row.seed && value.population === row.population && value.resource === row.resource && value.evidence === row.evidence && value.arm === row.arm);
    assert.deepEqual(actual.counters, row.process.counters);
    assert.deepEqual(actual.evaluator, row.process.evaluator);
    assert.equal(actual.timeline.length, 42);
    assert.equal(actual.timeline.at(-1).spentAtTickEnd, row.effort.cohorts.honest.effort);
    assert.equal(actual.totals.proposeRejected, row.effort.cohorts.honest.byAction.proposeGuarantee.rejected);
    assert.ok(actual.invitations.every(invitation => invitation.looks.every(look => look.atHour > invitation.createdAt && look.atHour < invitation.deadline && look.atHour < 168)));
  }
});

test('tight independent admissions have real scripted support but no paid looks, with phase exhaustion and horizon separate', () => {
  const selected = report().cases.filter(row => row.population === 'fabricated-descendants' && row.resource === 'headroom-63' && row.evidence === 'independent' && row.arm === 'veto');
  assert.deepEqual(selected.map(row => row.firstExhaustedTickEnd), [
    { atHour: 116, phase: 'conversion' }, { atHour: 124, phase: 'pre-guardian' }, { atHour: 116, phase: 'conversion' }, { atHour: 100, phase: 'pre-guardian' },
  ]);
  const admitted = selected.flatMap(row => row.invitations.filter(invitation => invitation.status === 'accepted'));
  assert.equal(admitted.length, 4);
  for (const invitation of admitted) {
    assert.equal(invitation.supportAtCreation, 9);
    assert.equal(invitation.looks.length, 0);
    assert.equal(invitation.inspectionDenied, 9);
    assert.equal(invitation.trials.length, 9);
    assert.equal(invitation.opportunities.length, 45);
    assert.equal(invitation.classification, 'inspection-budget-denied-only');
  }
  const point = selected[1].timeline.find(point => point.atHour === 124);
  assert.equal(point.spentBeforeTick, 259);
  assert.equal(point.paidBeforeGuardian.selfId, 2);
  assert.equal(point.spentBeforeGuardian, 261);
  assert.equal(point.paidInspections, 0);
  const pending = selected[0].invitations.find(invitation => invitation.status === 'open');
  assert.equal(pending.deadline, 172);
  assert.equal(pending.classification, 'pending-at-horizon');
  assert.ok(pending.opportunities.every(point => point.atHour < 168));
  const genuine = report().cases.filter(row => row.population === 'genuine-coalition-descendants' && row.resource === 'generous-reference' && row.evidence === 'independent');
  const late = genuine.find(row => row.seed.endsWith('01') && row.arm === 'veto').invitations.find(invitation => invitation.cancellation?.at === 152);
  assert.ok(late.looks.some(look => look.atHour === 152 && look.positive && look.response === 'paid'));
  const control = genuine.find(row => row.seed.endsWith('01') && row.arm === 'observe-only').invitations.find(invitation => invitation.id === late.id);
  assert.equal(control.status, 'open');
  assert.equal(control.deadline, 172);
  const gaps = report().cases.filter(row => row.firstExhaustedTickEnd && row.firstDeniedSample !== row.firstExhaustedTickEnd.atHour);
  assert.equal(gaps.length, 6);
  assert.ok(gaps.some(row => row.firstExhaustedTickEnd.atHour === 116 && row.firstDeniedSample === 124));
});

test('scarcity decoder rejects unsupported histories, phase/snapshot/role drift, price/channels, stop and work contradictions', () => {
  const original = retained[0].rows[1];
  for (const change of [
    row => { row.state.subjects[0].identityStatus = 'false'; },
    row => { row.state.events.push({ at: 168, type: 'guarantee-ended' }); },
    row => { row.state.guarantees.edges[0].id = 'forged'; },
    row => { row.denialTrace = row.denialTrace.filter(point => !(point.stage === 'tick-end' && point.atHour === 4)); },
    row => { row.effort.cohorts.honest.byAction.convert.rejected = 1; },
    row => { row.effort.cohorts.honest.byAction.respond.accepted++; },
    row => { row.process.counters.inspections++; },
    row => { row.state.events.find(event => event.type === 'invitation-cancelled').guarantor = 'absent'; },
  ]) { const row = structuredClone(original); change(row); assert.throws(() => reconstructCase(row, configOf(original))); }
  for (const change of [
    config => { config.weights.inspect = 0; }, config => { config.social.exitOnFraud = true; },
    config => { config.social.honestTransferRate = 0.5; }, config => { config.actorProfiles = [{}]; },
    config => { config.activity.honest.review = 0.5; }, config => { config.social.verification = true; },
  ]) { const config = structuredClone(configOf(original)); change(config); assert.throws(() => reconstructCase(original, config), /unsupported/); }
  const changed = structuredClone(retained); changed[0].rows[0].seed = 'other';
  assert.throws(() => auditWindows(changed), /sealed retained/);
});

test('separate retained window artifact and code/test byte bindings reproduce without model calls or primary changes', () => {
  const manifest = JSON.parse(readFileSync(new URL('window-audit-manifest.json', directory)));
  const stored = JSON.parse(readFileSync(new URL('window-audit.json', directory)));
  assert.deepEqual(report(), stored);
  const primary = readFileSync(new URL('manifest.json', directory));
  assert.equal(createHash('sha256').update(primary).digest('hex'), stored.binding.manifestSha256);
  assert.equal(manifest.primaryManifestSha256, stored.binding.manifestSha256);
  assert.equal(Object.keys(manifest.artifacts).length, 3);
  for (const [file, expected] of Object.entries(manifest.artifacts)) {
    const bytes = readFileSync(new URL('../' + file, import.meta.url));
    assert.equal(bytes.length, expected.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
  }
  const source = readFileSync(new URL('window-audit.mjs', directory), 'utf8');
  assert.doesNotMatch(source, /import .*\b(?:FacetyModel|runExperiment)\b/);
});
