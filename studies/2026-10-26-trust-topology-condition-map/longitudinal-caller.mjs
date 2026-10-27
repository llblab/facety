// Owns: One fixed deterministic living-population API preflight; excludes empirical strategy, truth inference and default migration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { FacetyModel, DAY } from '../../src/model.mjs';
import { EvidenceRelay } from '../../src/accountability.mjs';
import { experimentConfig } from '../../src/experiment.mjs';
import { digestOf, provenance } from '../../src/provenance.mjs';

const person = i => `n${String(i).padStart(2, '0')}`;
const evaluatorValidity = { 'defect-old': false, 'pressure-a': true, 'pressure-b': true, 'repeat-defect': false, 'mistaken-defect': true };
function frozen(value) { if (value && typeof value === 'object') { for (const item of Object.values(value)) frozen(item); Object.freeze(value); } return value; }
const plans = [
  { id: 'defect-old', day: 75, sponsor: person(0), target: person(41), actDay: 60, entries: [[76, person(40), 'valid'], [77, person(1), 'defect']] },
  { id: 'pressure-a', day: 210, sponsor: person(40), target: person(20), actDay: 190, entries: [[211, person(1), 'valid']] },
  { id: 'pressure-b', day: 211, sponsor: person(40), target: person(22), actDay: 191, entries: [[212, person(1), 'valid']] },
  { id: 'repeat-defect', day: 270, sponsor: person(0), target: person(41), actDay: 250, entries: [[271, person(40), 'valid'], [272, person(1), 'defect']] },
  { id: 'mistaken-defect', day: 271, sponsor: person(0), target: person(21), actDay: 251, entries: [[272, person(1), 'valid'], [273, person(40), 'defect']] },
];
export const CALLER_DESIGN = frozen({ schema: 'facety-longitudinal-caller-design/v1', days: 365, genesis: 60,
  guaranteeFee: 1, issueCadenceHours: 24, checkpointOffsetHours: 4, invitationDays: Array.from({ length: 26 }, (_, i) => 7 + i * 14),
  participationReference: 'd77-timed-act-converted/v1', actCaseReference: { formalCouncil: 'absent' },
  rootWorkUnits: 100, rootReviewCapacity: 20, plans,
  randomness: { generator: null, decisionDraws: 0, observationDraws: 0, observations: 'supplied-public-signal-tape', seed: null },
  assumptions: ['60 supplied admitted genuine genesis, acquisition/setup unpriced; no injected XP/FACY',
    'native guaranteeFee1/raw qualification/maturity reference, not general verified topology/Council migration',
    'scripted public roles, strategic/fallible evidence and voluntary actions, no calibrated learning or private utility',
    'named local-act evaluator labels only, not full chain correctness; defenses never read them',
    'initial roots have relay work accounts; newborns issue normally but have no scripted relay entry account',
    '26 declared funded invitation opportunities, not a protective admission cap or endogenous demand'] });

export function runLongitudinalCaller() {
  const emit = row => console.log(JSON.stringify(row));
  const implementation = provenance(), scriptDigest = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
  const subjects = Array.from({ length: 60 }, (_, i) => person(i));
  const model = new FacetyModel({ genesis: subjects, policy: { xpFinality: 'maturity', guaranteeFee: 1 } });
  assert.ok(model.subjects().every(row => row.xp === 0 && row.liquidFacy === 0));
  const relay = new EvidenceRelay(model, { claim: 'act-defect', participationReference: CALLER_DESIGN.participationReference,
    actCaseReference: CALLER_DESIGN.actCaseReference, traceLimit: 1000,
    rules: experimentConfig({ disputes: { enabled: true, procedure: 'chekharda-timed', stakeBacking: 'reserved', councilDepth: 0, stakeGrowth: 0.1 } }).disputes,
    actors: [{ id: 'reporter', subject: null, budget: 100, reviewCapacity: 0 }, ...subjects.map(id => ({ id, subject: id, budget: 100, reviewCapacity: 20 }))] });
  const own = new Map(), records = new Map(), pendingInvitations = [], caseIds = new Map(), evaluator = [];
  const operations = {}, actions = [], daily = [], pauses = new Map(), receivers = Array.from({ length: 59 }, (_, i) => person(i + 1)).filter(id => id !== person(40)).slice(0, 50);
  const offers = new Set(CALLER_DESIGN.invitationDays), H = CALLER_DESIGN.days * DAY;
  let births = 0, offered = 0, audits = 0, nextLeaderGuarantee = 10, peakOpen = 0, peakSharedCases = 0;
  const call = (name, operation) => { operations[name] = (operations[name] ?? 0) + 1; return operation(); };
  const audit = () => { audits++; return model.audit(); };
  const active = () => model.disputeParticipations().filter(row => row.closedAt === null);
  const guarantee = (giver, receiver) => call('confirmGuarantee', () => model.confirmGuarantee(receiver, call('proposeGuarantee', () => model.proposeGuarantee(giver, receiver))));
  const result = (plan, stage, actor, value) => {
    actions.push({ atHour: model.now, plan: plan.id, stage, actor, ok: value.ok, reason: value.reason ?? null,
      value: typeof value.value === 'string' ? value.value : null,
      work: value.work ?? relay.trace().records.find(row => row.id === value.traceRef)?.work ?? null, traceRef: value.traceRef ?? null });
    audit(); return value;
  };
  function open(plan) {
    // Actor policy receives a public reported act and supplied signals, not evaluator validity.
    const selfId = records.get(JSON.stringify([plan.target, plan.actDay]));
    if (!selfId) { actions.push({ atHour: model.now, plan: plan.id, stage: 'report', ok: false, reason: 'reported-native-act-unavailable' }); return; }
    const observation = result(plan, 'observe', 'reporter', relay.observe('reporter', selfId, { suspicious: true, sourceGroup: 'report:' + plan.id }));
    if (!observation.ok) return;
    const item = result(plan, 'package', 'reporter', relay.package('reporter', [observation.value]));
    if (!item.ok) return;
    if (!result(plan, 'route', 'reporter', relay.route('reporter', item.value, plan.sponsor)).ok) return;
    if (!result(plan, 'review', plan.sponsor, relay.review(plan.sponsor, item.value, { suspicious: true, sourceGroup: 'declared-review:' + plan.id })).ok) return;
    const admitted = result(plan, 'admit', plan.sponsor, relay.sponsor(plan.sponsor, item.value));
    if (admitted.ok) caseIds.set(plan.id, admitted.value);
  }
  function enter(plan, actor, desiredSide) {
    const id = caseIds.get(plan.id), record = relay.snapshot().cases.find(row => row.id === id);
    if (!record || record.resolvedAt !== null) return;
    // Public stance is supplied to this actor; neither side nor permission comes from evaluator labels.
    const observation = result(plan, 'observe-position', actor, relay.observe(actor, record.selfId,
      { suspicious: desiredSide === 'defect', sourceGroup: 'judgment:' + plan.id + ':' + actor }));
    if (!observation.ok) return;
    const seen = relay.snapshot().observations.find(row => row.id === observation.value && row.actor === actor);
    const wanted = seen.suspicious ? 'defect' : 'valid';
    if (record.positions.at(-1).side === wanted) {
      actions.push({ atHour: model.now, plan: plan.id, stage: 'entry-abstain', actor, reason: 'desired-side-already-current', ok: false }); return;
    }
    result(plan, 'entry', actor, relay.enterActCase(actor, id));
  }
  const started = { kind: 'started', implementation, scriptDigest, designDigest: digestOf(CALLER_DESIGN), design: CALLER_DESIGN };
  emit(started);
  for (let hour = 0; hour <= H; hour += hour % DAY === 0 && hour < H ? 4 : 20) {
    call('advanceTo', () => model.advanceTo(hour));
    const day = hour / DAY, isDay = hour % DAY === 0;
    if (hour < H) {
      for (const [id, sourceId] of own) {
        const source = model.selfId(sourceId);
        if (source.status !== 'unspent' || model.now - source.recordedAt < DAY) continue;
        if (id === person(55) && isDay && offers.has(day)) {
          const target = `new_${String(++offered).padStart(3, '0')}`;
          const invitation = call('createInvitation', () => model.createInvitation(id, sourceId, target));
          pendingInvitations.push({ invitation, subject: target, at: hour + DAY });
        } else call('convertToCollector', () => model.convertToCollector(id, sourceId));
        own.delete(id);
      }
      for (const birth of pendingInvitations) if (birth.at === hour) {
        call('acceptInvitation', () => model.acceptInvitation(birth.invitation, birth.subject)); subjects.push(birth.subject); births++;
      }
      if (isDay) {
        if (day === 1) {
          for (let i = 2; i <= 17; i++) call('transferFacy', () => model.transferFacy(person(i), person(1), 1, 'declared-early-cooperation'));
          for (let i = 0; i < 17; i++) guarantee(person(1), person(nextLeaderGuarantee++));
          guarantee(person(58), person(55)); guarantee(person(59), person(55));
        }
        if (day >= 2 && day <= 14) guarantee(person(1), person(nextLeaderGuarantee++));
        if (day >= 1 && day <= 18) guarantee(person(0), person(day + 9));
        if (day === 30) for (const receiver of receivers.slice(0, 30)) guarantee(person(40), receiver);
        if (day === 60) for (const receiver of receivers.slice(30)) guarantee(person(40), receiver);
        for (const plan of plans) if (plan.day === day) {
          evaluator.push({ plan: plan.id, selfId: records.get(JSON.stringify([plan.target, plan.actDay])) ?? null,
            subject: plan.target, localValid: evaluatorValidity[plan.id], scope: 'specified local claim only; never actor input' });
          open(plan);
        }
        for (const plan of plans) for (const [at, actor, side] of plan.entries) if (at === day) enter(plan, actor, side);
        const restricted = new Set(active().flatMap(row => row.subjects));
        for (const id of subjects) {
          if (restricted.has(id)) { pauses.set(id, (pauses.get(id) ?? 0) + 1); continue; }
          const artifact = call('registerArtifact', () => model.registerArtifact(id));
          const source = call('createSelfId', () => model.createSelfId(id, artifact));
          own.set(id, source); records.set(JSON.stringify([id, day]), source);
        }
      } else {
        for (const record of relay.snapshot().cases) if (record.resolvedAt === null && hour > record.deadline) {
          const plan = plans.find(row => caseIds.get(row.id) === record.id);
          result(plan, 'finalize', 'reference-clock', relay.finalizeActCase(record.id));
        }
      }
    }
    const openCases = active(), memberships = new Map();
    for (const record of openCases) for (const id of record.subjects) memberships.set(id, (memberships.get(id) ?? 0) + 1);
    peakOpen = Math.max(peakOpen, openCases.length); peakSharedCases = Math.max(peakSharedCases, ...memberships.values(), 0);
    const money = audit();
    if (isDay) {
      const publicPeople = model.subjects(), xp = id => publicPeople.find(row => row.id === id).xp;
      daily.push({ day, atHour: hour, subjects: model.size, active: model.activeCount(), sourceCount: operations.createSelfId ?? 0,
        totalXp: publicPeople.reduce((sum, row) => sum + row.xp, 0), leaderXp: xp(person(0)), backupXp: xp(person(1)), coalitionXp: xp(person(40)),
        money, openCases: openCases.length, heldPeople: memberships.size, births, offered,
        forgoneDailyIssueOpportunities: [...pauses.values()].reduce((a, b) => a + b, 0), readinessSkipped: 0 });
      if (day % 30 === 0 || hour === H) emit({ kind: 'progress', ...daily.at(-1), callerAudits: audits });
    }
  }
  assert.equal(model.now, H); assert.equal(daily.length, 366); assert.equal(daily.at(-1).day, 365);
  assert.equal(births, offered); assert.equal(offered, 26); assert.equal(model.size, 86);
  const sourceRecords = model.selfIds(), cases = relay.snapshot().cases, resolutions = model.selfIdResolutions();
  assert.equal(sourceRecords.length, operations.createSelfId);
  assert.equal(model.audit().minted, sourceRecords.length);
  assert.equal(pendingInvitations.length, births);
  assert.ok(cases.every(row => row.resolvedAt === null || row.resolvedAt > row.deadline));
  assert.ok(model.subjects().every(row => row.identityStatus === 'accepted'));
  assert.equal(actions.reduce((sum, row) => sum + (row.work ?? 0), 0), relay.snapshot().actors.reduce((sum, actor) => sum + actor.spent, 0));
  const resultValue = { kind: 'result', classification: 'functional caller/coverage diagnosis only; no scientific world or security/human inference',
    implementation, scriptDigest, designDigest: started.designDigest, randomness: CALLER_DESIGN.randomness,
    finalHour: model.now, expectedDailyEndpoints: 365, observedDailyEndpoints: daily.filter(row => row.day > 0).length,
    population: { initial: 60, final: model.size, offered, accepted: births, missingAdmissionOutcomes: offered - births },
    finalMoney: model.audit(), operations, callerAudits: audits, auditAccounting: 'caller checks only; controller preflight/final checks are additional and unprofiled', peakOpenCases: peakOpen, peakCasesForOnePerson: peakSharedCases,
    forgoneDailyIssueOpportunities: Object.fromEntries(pauses), readinessSkipped: 0,
    cases, sourceResolutions: resolutions, stakeSummary: relay.snapshot().stakes, stakeReceipts: model.disputeStakes(), actions, scopedEvaluatorFacts: evaluator,
    unsupportedAttempts: actions.filter(row => row.stage === 'admit' && !row.ok),
    unresolvedAdmittedCases: cases.filter(row => row.resolvedAt === null).map(row => row.id),
    proceduralWork: relay.snapshot().actors.map(({ id, spent, denied }) => ({ id, spent, denied })),
    daily, sourceDigest: digestOf(sourceRecords), publicStateDigest: digestOf({ subjects: model.subjects(), acts: sourceRecords,
      invitations: model.invitations(), relations: model.guaranteeRelations(), events: model.events(), participation: model.disputeParticipations(), cases, resolutions }),
    noScientificWorlds: true, noVerifiedUsefulnessTruthEquilibriumOrSafetyClaim: true };
  emit(resultValue); return resultValue;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runLongitudinalCaller(); }
  catch (error) { console.error(JSON.stringify({ kind: 'caller-error', name: error.name, reason: error.message, finalResultAvailable: false })); process.exitCode = 1; }
}
