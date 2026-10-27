// Owns: Fixed paid living-accountability reference orchestration/public selection/scalars; excludes new court rules, truth-based defense and research inference.
import { FacetyModel, DAY, ProtocolRejection } from './model.mjs';
import { EvidenceRelay } from './accountability.mjs';
import { experimentConfig } from './experiment-config.mjs';
import { livingExperimentConfig, LIVING_RANDOMNESS, LIVING_OBSERVABLES } from './living-experiment-config.mjs';
import { provenance } from './provenance.mjs';

const person = i => `n${String(i).padStart(2, '0')}`;
const community = new Set(Array.from({ length: 40 }, (_, i) => person(i)));
const plans = [
  { id: 'defect-old', day: 75, sponsor: person(0), target: person(41), actDay: 60, entries: [[76, person(40), 'valid'], [77, null, 'defect']] },
  { id: 'pressure-a', day: 210, sponsor: person(40), target: person(20), actDay: 190, entries: [[211, null, 'valid']] },
  { id: 'pressure-b', day: 211, sponsor: person(40), target: person(22), actDay: 191, entries: [[212, null, 'valid']] },
  { id: 'repeat-defect', day: 270, sponsor: person(0), target: person(41), actDay: 250, entries: [[271, person(40), 'valid'], [272, null, 'defect']] },
  { id: 'mistaken-defect', day: 271, sponsor: person(0), target: person(21), actDay: 251, entries: [[272, null, 'valid'], [273, person(40), 'defect']] },
];
// Evaluator-only local target tags. No actor helper receives this object.
const localValidity = { 'defect-old': false, 'pressure-a': true, 'pressure-b': true, 'repeat-defect': false, 'mistaken-defect': true };
export function selectLivingResponder(subjects, record) {
  const previous = record.positions.at(-1), floor = subjects.find(row => row.id === previous.subject).xp;
  const stake = Math.ceil(previous.stake * 1.1), participants = new Set(record.positions.map(row => row.subject));
  return subjects.filter(row => community.has(row.id) && row.id !== record.subject && !participants.has(row.id)
    && row.identityStatus === 'accepted' && row.xp > floor && row.liquidFacy >= stake)
    .sort((a, b) => b.xp - a.xp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]?.id ?? null;
}

export function runLivingExperiment(input) {
  const config = livingExperimentConfig(input), H = config.days * DAY;
  const subjects = Array.from({ length: 60 }, (_, i) => person(i));
  const model = new FacetyModel({ genesis: subjects, policy: { xpFinality: 'maturity', guaranteeFee: 1 } });
  const relay = new EvidenceRelay(model, { claim: 'act-defect', participationReference: 'd77-timed-act-settled-history/v1',
    actCaseReference: { formalCouncil: 'absent' }, traceLimit: 1000,
    rules: experimentConfig({ disputes: { enabled: true, procedure: 'chekharda-timed', stakeBacking: 'reserved', councilDepth: 0, stakeGrowth: 0.1 } }).disputes,
    actors: [{ id: 'reporter', subject: null, budget: 100, reviewCapacity: 0 }, ...subjects.map(id => ({ id, subject: id, budget: 100, reviewCapacity: 20 }))] });
  const own = new Map(), records = new Map(), caseIds = new Map(), pending = [];
  const commands = [], history = [], fundingRounds = [], choices = [], cap = Symbol('action-cap');
  const receivers = Array.from({ length: 59 }, (_, i) => person(i + 1)).filter(id => id !== person(40)).slice(0, 50);
  const offers = new Set(Array.from({ length: 26 }, (_, i) => 7 + 14 * i));
  let births = 0, offered = 0, paused = 0, refused = 0, unavailable = 0, audits = 0, censored = false, censorReason = null;
  const audit = () => { audits++; return model.audit(); };
  const active = () => model.disputeParticipations().filter(row => row.closedAt === null);
  function command(op, execute) {
    if (commands.length >= config.maxActions) throw cap;
    const row = { atHour: model.now, op, ok: true, reason: null }; commands.push(row);
    try {
      const value = execute(); row.atHour = model.now;
      if (value && typeof value === 'object' && typeof value.ok === 'boolean') { row.ok = value.ok; row.reason = value.reason ?? null; }
      if (typeof value === 'string') row.value = value;
      return value;
    } catch (error) { row.ok = false; row.reason = error.message; throw error; }
  }
  const guarantee = (giver, receiver) => {
    const proposal = command('proposeGuarantee', () => model.proposeGuarantee(giver, receiver));
    command('confirmGuarantee', () => model.confirmGuarantee(receiver, proposal));
  };
  const transfer = (from, to) => command('transferFacy', () => model.transferFacy(from, to, 1, 'declared-allocation-transport'));
  function setup(day) {
    if (day === 1) {
      for (let i = 2; i <= 17; i++) transfer(person(i), config.supportAllocation === 'concentrated' ? person(1) : person(i === 17 ? 2 : i + 1));
      for (let i = 0; i < 17; i++) guarantee(config.supportAllocation === 'concentrated' ? person(1) : person(i + 1), person(10 + i));
      guarantee(person(58), person(55)); guarantee(person(59), person(55));
    }
    if (day >= 2 && day <= 14) {
      const giver = config.supportAllocation === 'concentrated' ? person(1) : person(day);
      transfer(person(1), person(18)); transfer(person(18), giver); guarantee(giver, person(25 + day));
    }
    if (day >= 1 && day <= 18) guarantee(person(0), person(day + 9));
    if (day === 30) for (const receiver of receivers.slice(0, 30)) guarantee(person(40), receiver);
    if (day === 60) for (const receiver of receivers.slice(30)) guarantee(person(40), receiver);
    if (day >= 1 && day <= 14) {
      fundingRounds.push({ day, cash: Object.fromEntries(Array.from({ length: 18 }, (_, i) => person(i + 1)).map(id => [id, model.subject(id).liquidFacy])) });
      audit();
    }
  }
  function step(op, execute) {
    const result = command(op, execute);
    if (!result.ok && ['sponsor', 'enterActCase'].includes(op)) refused++;
    if (result.reason?.includes('reference requires') || result.reason?.includes('unsupported')) {
      censored = true; censorReason ??= 'reference-unsupported:' + result.reason;
    }
    audit(); return result;
  }
  function open(plan) {
    const source = records.get(JSON.stringify([plan.target, plan.actDay]));
    if (!source) { unavailable++; censored = true; censorReason ??= 'reported-native-act-unavailable'; return; }
    const observation = step('observe', () => relay.observe('reporter', source, { suspicious: true, sourceGroup: 'report:' + plan.id }));
    if (!observation.ok) return;
    const packet = step('package', () => relay.package('reporter', [observation.value]));
    if (!packet.ok || !step('route', () => relay.route('reporter', packet.value, plan.sponsor)).ok) return;
    if (!step('review', () => relay.review(plan.sponsor, packet.value, { suspicious: true, sourceGroup: 'declared-review:' + plan.id })).ok) return;
    const opened = step('sponsor', () => relay.sponsor(plan.sponsor, packet.value));
    if (opened.ok) caseIds.set(plan.id, opened.value);
  }
  function enter(plan, namedActor, desiredSide) {
    const record = relay.snapshot().cases.find(row => row.id === caseIds.get(plan.id));
    if (!record || record.resolvedAt !== null) return;
    if (record.positions.at(-1).side === desiredSide) { choices.push({ atHour: model.now, plan: plan.id, reason: 'desired-side-already-current' }); return; }
    const actor = namedActor ?? selectLivingResponder(model.subjects(), record);
    choices.push({ atHour: model.now, plan: plan.id, actor, reason: actor === null ? 'no-public-eligible-candidate' : 'supplied-public-stance' });
    if (actor === null) return;
    const observation = step('observe-position', () => relay.observe(actor, record.selfId, { suspicious: desiredSide === 'defect', sourceGroup: 'judgment:' + plan.id + ':' + actor }));
    if (observation.ok) step('enterActCase', () => relay.enterActCase(actor, record.id));
  }
  function measured() {
    const snapshot = relay.snapshot(), cases = snapshot.cases, resolutions = model.selfIdResolutions();
    const caseTags = new Map([...caseIds].map(([planId, caseId]) => [caseId, localValidity[planId]]));
    const living = { acceptedBirths: births,
      taggedDefectCasesUpheld: cases.filter(row => row.resolvedAt !== null && row.upheld && caseTags.get(row.id) === false).length,
      taggedValidPrincipalCollected: resolutions.filter(row => caseTags.get(row.caseId) === true).reduce((n, row) => n + row.recovery.collected, 0),
      sourcePrincipalCollected: resolutions.reduce((n, row) => n + row.recovery.collected, 0), unpaidPrincipalDebt: model.ledger().debt,
      pausedIssueSlots: paused, relayWork: snapshot.actors.reduce((n, row) => n + row.spent, 0), openCases: active().length,
      refusedCaseRequests: refused, unavailableReports: unavailable };
    if (Object.keys(living).some(key => !Object.hasOwn(LIVING_OBSERVABLES, 'living.' + key))) throw new Error('unregistered living measurement');
    return living;
  }
  try {
    for (let hour = 0; hour <= H; hour += hour % DAY === 0 && hour < H ? 4 : 20) {
      command('advanceTo', () => model.advanceTo(hour));
      const isDay = hour % DAY === 0, day = hour / DAY;
      if (hour < H) {
        for (const [id, sourceId] of own) {
          const source = model.selfId(sourceId);
          if (source.status !== 'unspent' || model.now - source.recordedAt < DAY) continue;
          if (id === person(55) && isDay && offers.has(day)) {
            const target = `new_${String(++offered).padStart(3, '0')}`;
            const invitation = command('createInvitation', () => model.createInvitation(id, sourceId, target));
            pending.push({ invitation, subject: target, at: hour + DAY });
          } else command('convertToCollector', () => model.convertToCollector(id, sourceId));
          own.delete(id);
        }
        for (const birth of pending) if (birth.at === hour) {
          command('acceptInvitation', () => model.acceptInvitation(birth.invitation, birth.subject)); subjects.push(birth.subject); births++;
        }
        if (isDay) {
          setup(day);
          for (const plan of plans) if (plan.day === day) open(plan);
          for (const plan of plans) for (const [at, actor, side] of plan.entries) if (at === day) enter(plan, actor, side);
          const restricted = new Set(active().flatMap(row => row.subjects));
          for (const id of subjects) {
            if (restricted.has(id)) { paused++; continue; }
            const artifact = command('registerArtifact', () => model.registerArtifact(id));
            const source = command('createSelfId', () => model.createSelfId(id, artifact));
            own.set(id, source); records.set(JSON.stringify([id, day]), source);
          }
        } else for (const record of relay.snapshot().cases) if (record.resolvedAt === null && hour > record.deadline) {
          step('finalizeActCase', () => relay.finalizeActCase(record.id));
        }
      }
      audit();
      if (isDay && hour > 0) history.push({ stage: 'day-end', atHour: hour, living: measured() });
    }
  } catch (error) {
    if (error !== cap && !(error instanceof ProtocolRejection)) throw error;
    censored = true; censorReason ??= error === cap ? 'maxActions' : 'reference-refusal:' + error.message;
  }
  audit();
  return { schema: 'facety-native-living-accountability-run/v1', classification: 'conditional fixed-reference accounting, not scientific/human/viability evidence',
    config, provenance: provenance(), randomness: { ...LIVING_RANDOMNESS },
    assumptions: ['60supplied genuine zero-wealth roots; no verified personhood/topology; explicit absentCouncil world<100.',
      'Fixed duty/signal/stance/demand tape and common public willing roster; no calibrated human work/learning/market/utility or aliases.',
      'Actual native fee1/maturity/paid admissions, source recovery and D77; no new court/identity/termination/debt rule.',
      'Responsibility/receipt/exposure concentration differs, not XP transfer or usefulness. Placebo transports match money/primitive setup counts, not personal labor.',
      'Daily endpoints24..H after same-hour commands, terminalH advance/audit only. Censored future endpoints missing/null; seed identity unused, not independent sampling.',
      'Target-local evaluator tags classify recorded consequences only, not whole-chain merit/truth; actors consume public observations/positions/standing only.'],
    history, outcome: { success: null, successCriterion: 'unbound', censored, censorReason, horizonDays: config.days,
      horizonHours: H, endedAtHour: model.now, dailySampleOffsetHours: DAY, callerAudits: audits, commandAttempts: commands.length,
      observedDailyEndpoints: history.length, expectedDailyEndpoints: config.days },
    ...(config.includeState ? { state: { now: model.now, subjects: model.subjects(), selfIds: model.selfIds(), invitations: model.invitations(),
      relations: model.guaranteeRelations(), ledger: model.audit(), participation: model.disputeParticipations(), sourceResolutions: model.selfIdResolutions(),
      relay: relay.snapshot(), trace: relay.trace(), events: model.events(), stakes: model.disputeStakes(), commands, fundingRounds, choices, evaluatorLocalTags: { ...localValidity } } } : {}) };
}
