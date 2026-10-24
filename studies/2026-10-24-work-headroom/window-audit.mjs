// Owns: Retained F54 unit-pool/phase and invitation-window reconstruction; excludes model calls, new worlds and human-duty claims.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Random } from '../../src/random.mjs';
import { digestOf } from '../../src/provenance.mjs';
import { caseConfig } from './contract.mjs';
import { analyzeBlocks } from './analyze.mjs';
import { COUNTERS, EVALUATOR } from '../2026-10-24-attended-comparison/contract.mjs';

const DIRECTORY = new URL('./', import.meta.url), ROOT = new URL('../../', import.meta.url);
const DESIGN = JSON.parse(readFileSync(new URL('design.json', DIRECTORY)));
const MANIFEST_SHA = 'b051f5dea1299026b2a1a4f6db7a6f3e9b28c325841f48ceda1c62eae868e847';
const KERNELS = {
  'src/experiment.mjs': '37d41881cb85b64b2270599b09bba1a07d2a9edf7167777b142df26b5a4f1dfe',
  'src/experiment-config.mjs': '3d46fac681bfef159e10c38342dd013c69778d97fc427e271e242e45beb0fec3',
  'src/random.mjs': 'bb73976902a0e4954b61e7f09c1ac01d8187ec9d092f0ebd2e181f0257c0f7d1',
  'src/activity-schedule.mjs': '59a5a128f14a96cea22d59b45efc309526e72bdbdf1c241728dc8c920af101ec',
  'src/identity-observations.mjs': 'fa900922d2490e01bc8b4618ee9df57e5850be8b893ebd11d2c3d6da2b8dcef0',
  'src/model.mjs': '4f2487a09048165de9c59b4c96ce47f302149f1981d0e25fd9a6cdd49a7717dc',
  'src/graph.mjs': '98f85af17b154428108fb8063df9b1a31a6639e446f41afdb7a305d3aac56296',
  'src/effort.mjs': '852c8e6a797d16f4acd1ebf1cea4c83860e00814a3958f2fc44ab07233379e3c',
  'src/observables.mjs': '61f90f61ab00b196bc8f1c739c959509765fb7b1dc6047643145c1e566a2113e',
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pair = (from, to) => JSON.stringify([from, to]);
function checkKernels() {
  for (const [file, expected] of Object.entries(KERNELS)) if (sha(readFileSync(new URL(file, ROOT))) !== expected) throw new Error('F54 window kernels changed; no drift override');
}
export function readRetainedBlocks() {
  const bytes = readFileSync(new URL('manifest.json', DIRECTORY));
  if (sha(bytes) !== MANIFEST_SHA) throw new Error('F54 closed manifest changed');
  for (const [file, expected] of Object.entries(JSON.parse(bytes).artifacts)) {
    const raw = readFileSync(new URL(file, ROOT));
    if (raw.length !== expected.bytes || sha(raw) !== expected.sha256) throw new Error('F54 closed artifact changed: ' + file);
  }
  return [0, 1, 2, 3].map(index => JSON.parse(readFileSync(new URL('block-' + index + '.json', DIRECTORY))));
}
function topology(state, horizon) {
  const known = new Map(state.truth.map(identity => [identity.id, identity]));
  const subjects = new Map(state.subjects.map(subject => [subject.id, subject]));
  if (known.size !== state.truth.length || known.size !== subjects.size || subjects.size !== state.subjects.length || [...subjects.values()].some(subject => subject.identityStatus !== 'accepted' || !known.has(subject.id)) || [...known.values()].some(identity => !['honest', 'attackers'].includes(identity.cohort) || typeof identity.genuine !== 'boolean')) throw new Error('F54 unsupported roles/status chronology');
  const allowed = new Set(['subject-added', 'guarantee-proposed', 'guarantee-activated', 'artifact-registered', 'self-id-created', 'collector-converted', 'invitation-created', 'invitation-accepted', 'invitation-cancelled']);
  const births = new Map(), proposals = new Map(), edges = new Map(), activations = [];
  let previous = 0, phaseBoundary = -1;
  for (const event of state.events) {
    if (!Number.isSafeInteger(event.at) || event.at < previous || event.at > horizon || event.at % 4 || !allowed.has(event.type)) throw new Error('F54 unsupported journal/clock');
    previous = event.at;
    if (event.type === 'subject-added') {
      if (births.has(event.subject) || !subjects.has(event.subject) || typeof event.genesis !== 'boolean' || subjects.get(event.subject).genesis !== event.genesis || (event.genesis && event.at !== 0)) throw new Error('F54 invalid births');
      births.set(event.subject, event.at);
      if (!event.genesis) phaseBoundary = event.at;
    }
    if (['invitation-created', 'invitation-accepted', 'invitation-cancelled', 'collector-converted'].includes(event.type)) phaseBoundary = event.at;
    if (event.type === 'guarantee-proposed') {
      if (proposals.has(event.relation) || event.guarantor === event.guaranteed || !births.has(event.guarantor) || !births.has(event.guaranteed)) throw new Error('F54 invalid proposals');
      proposals.set(event.relation, { from: event.guarantor, to: event.guaranteed });
    }
    if (event.type !== 'guarantee-activated') continue;
    const proposal = proposals.get(event.relation);
    if (!proposal || edges.has(pair(proposal.from, proposal.to)) || event.at >= horizon || phaseBoundary === event.at || [proposal.from, proposal.to].some(id => !subjects.get(id).genesis && births.get(id) >= event.at)) throw new Error('F54 unsupported activation order');
    const edge = { ...proposal, at: event.at, order: activations.length };
    edges.set(pair(edge.from, edge.to), 'edge:' + edge.order); activations.push(edge);
  }
  if (births.size !== subjects.size || state.guarantees.edges.length !== edges.size || new Set(state.guarantees.edges.map(edge => pair(edge.from, edge.to))).size !== edges.size || state.guarantees.edges.some(edge => edges.get(pair(edge.from, edge.to)) !== edge.id)) throw new Error('F54 temporal/snapshot mismatch');
  return { known, subjects, births, activations, proposals };
}

// In one non-refilling unit pool, paid inspections form a prefix. A denied response can only follow its final paid positive look.
// End-of-guardian remaining is measured backward from tick-end minus successful post-guardian conversions, not guessed from first denial.
export function fundSlots(slots, deniedInspections, deniedResponses, endRemaining) {
  const paidCount = slots.length - deniedInspections;
  if (![deniedInspections, deniedResponses, endRemaining].every(n => Number.isSafeInteger(n) && n >= 0) || paidCount < 0 || deniedResponses > 1 || slots.some((slot, i) => i < paidCount ? typeof slot.positive !== 'boolean' : slot.positive !== null) || (deniedResponses && (!paidCount || !slots[paidCount - 1].positive))) throw new Error('F54 impossible unit funding counts');
  const positives = slots.slice(0, paidCount).filter(slot => slot.positive).length;
  const paidResponses = positives - deniedResponses;
  const startRemaining = endRemaining + paidCount + paidResponses;
  let remaining = startRemaining;
  const result = slots.map((slot, index) => {
    const paidInspection = index < paidCount;
    if (paidInspection !== (remaining > 0)) throw new Error('F54 inspection funding is not a prefix');
    const before = remaining;
    if (paidInspection) remaining--;
    const paidResponse = paidInspection && slot.positive ? !(deniedResponses && index === paidCount - 1) : null;
    if (paidResponse !== null) {
      if (paidResponse !== (remaining > 0)) throw new Error('F54 response funding mismatch');
      if (paidResponse) remaining--;
    }
    return { ...slot, paidInspection, paidResponse, remainingBefore: before, remainingAfter: remaining };
  });
  if (remaining !== endRemaining) throw new Error('F54 terminal pool mismatch');
  return { slots: result, startRemaining, paidInspections: paidCount, paidResponses, positives };
}

export function reconstructCase(row, config) {
  checkKernels();
  const h = row.effort?.cohorts?.honest;
  if (config.days !== 7 || !['sybil-cone', 'real-cartel'].includes(config.scenario) || !['independent', 'shared-target'].includes(config.invitationEvidence) || ![261, 324, 100000].includes(config.budgets.honest) || config.budgets.attackers !== 100000 || config.stepHours !== 4 || config.invitationReviewTiming !== 'first-attended' || config.activity.honest.review !== 1 || config.activity.attackers.review || config.actorProfiles.length || config.social.verification || config.social.exitOnFraud || config.disputes.enabled || config.deviants.share || config.perturbations.length || config.activity.honest.invite || config.activity.honest.inspect || config.activity.attackers.inspect || config.activity.honest.bribe || config.activity.attackers.bribe || config.social.honestTransferRate || config.policy.invitationFreezeHours !== 24 || Object.values(config.weights).some(value => value !== 1) || row.outcome.censored || row.outcome.elapsedHours !== config.days * 24 || ['selfId', 'confirmGuarantee', 'inspect', 'convert'].some(action => h.byAction[action].rejected) || ['fakeSelfId', 'fabricateIdentity', 'recruitHuman', 'invite', 'acceptInvitation', 'challenge', 'verify', 'bribe', 'cashout'].some(action => h.byAction[action].attempts || h.byAction[action].denied) || h.byAction.confirmGuarantee.denied) throw new Error('F54 unsupported scarcity reconstruction contract');
  const horizon = config.days * 24, genuine = config.scenario === 'real-cartel';
  const { known, subjects, births, activations, proposals } = topology(row.state, horizon);
  if ([...known].some(([id, identity]) => identity.cohort === 'honest' && !subjects.get(id).genesis)) throw new Error('F54 unsupported honest recruitment');
  const support = (creator, hour) => activations.filter(edge => edge.to === creator && edge.at <= hour && known.get(edge.from).cohort === 'honest').map(edge => edge.from);
  const events = row.state.events;
  const invitationOrder = events.filter(event => event.type === 'invitation-created').map(event => event.invitation);
  if (digestOf(invitationOrder) !== digestOf(row.state.invitations.map(invitation => invitation.id))) throw new Error('F54 invitation insertion order mismatch');
  const invitations = row.state.invitations.map(invitation => {
    const creation = events.filter(event => event.type === 'invitation-created' && event.invitation === invitation.id);
    const cancellations = events.filter(event => event.type === 'invitation-cancelled' && event.invitation === invitation.id);
    const acceptances = events.filter(event => event.type === 'invitation-accepted' && event.invitation === invitation.id);
    const deadline = invitation.createdAt + 24;
    if (known.get(invitation.creator)?.cohort !== 'attackers' || (known.has(invitation.target) && known.get(invitation.target).genuine !== genuine) || creation.length !== 1 || creation[0].creator !== invitation.creator || creation[0].target !== invitation.target || creation[0].at !== invitation.createdAt || cancellations.length !== Number(invitation.status === 'cancelled') || acceptances.length !== Number(invitation.status === 'accepted') || (invitation.status === 'accepted' && (invitation.acceptedAt !== deadline || acceptances[0].at !== deadline || births.get(invitation.target) !== deadline)) || (invitation.status === 'open' && deadline <= horizon) || (invitation.status !== 'accepted' && known.has(invitation.target))) throw new Error('F54 invitation journal/lifetime mismatch');
    const cancellation = cancellations[0] ?? null;
    if (cancellation && (cancellation.at <= invitation.createdAt || cancellation.at >= deadline || cancellation.at >= horizon || config.ablations.disableInvitationVeto)) throw new Error('F54 invalid cancellation window');
    return { ...invitation, deadline, cancellation, genuineTarget: genuine, supportAtCreation: support(invitation.creator, invitation.createdAt).length, opportunities: [], looks: [], trials: [] };
  });
  const counters = Object.fromEntries(COUNTERS.map(key => [key, 0])), evaluator = Object.fromEntries(EVALUATOR.map(key => [key, 0]));
  const consumed = new Set(), cancelled = new Set(), sensing = new Random(config.seed).fork('observations');
  const timeline = [];
  let previousSpent = row.bootstrap.cohorts.honest.effort;
  const totals = { selfId: 0, proposeAccepted: 0, proposeRejected: 0, confirm: 0, convert: 0 };
  const tickPoints = row.denialTrace.filter(point => point.stage === 'tick-end');
  if (tickPoints.length !== horizon / 4 || tickPoints.some((point, i) => point.atHour !== i * 4)) throw new Error('F54 missing tick observations');
  for (const point of tickPoints) {
    const hour = point.atHour, day = Math.floor(hour / 24), native = point.cohorts.honest;
    const slots = [];
    for (const invitation of invitations) {
      if (hour <= invitation.createdAt || hour >= invitation.deadline || cancelled.has(invitation.id)) continue;
      for (const guarantor of support(invitation.creator, hour)) {
        counters.pairTickOpportunities++;
        const key = JSON.stringify([invitation.id, guarantor, day]);
        const opportunity = { atHour: hour, guarantor, day, reason: 'daily-trial-already-consumed' };
        invitation.opportunities.push(opportunity);
        if (!consumed.has(key)) {
          consumed.add(key); opportunity.reason = 'review-slot'; counters.reviewSlots++;
          invitation.trials.push({ atHour: hour, guarantor, day });
          slots.push({ invitation: invitation.id, target: invitation.target, guarantor, atHour: hour, opportunity });
        }
        if (invitation.cancellation?.at === hour && invitation.cancellation.guarantor === guarantor) { cancelled.add(invitation.id); break; }
      }
    }
    const denied = native.byActionDeniedDeltas;
    const paidCount = slots.length - denied.inspect;
    if (paidCount < 0) throw new Error('F54 denied slots exceed eligible trials');
    for (const [index, slot] of slots.entries()) {
      const key = config.invitationEvidence === 'shared-target' ? ['invitation-shared-target-v1', slot.target] : [slot.target, ['invitation-review', hour, slot.guarantor]];
      slot.positive = index < paidCount ? sensing.fork(JSON.stringify(key)).chance(genuine ? config.falsePositiveRate : config.sensitivity) : null;
    }
    const at = events.filter(event => event.at === hour);
    const honestEvent = (event, id) => known.get(id)?.cohort === 'honest';
    const conversionCount = at.filter(event => event.type === 'collector-converted' && honestEvent(event, event.subject)).length;
    const afterGuardianSpent = native.cumulativeEffort - conversionCount;
    const funding = fundSlots(slots, denied.inspect, denied.respond, config.budgets.honest - afterGuardianSpent);
    const beforeGuardianSpent = config.budgets.honest - funding.startRemaining;
    const before = {
      selfId: at.filter(event => event.type === 'self-id-created' && honestEvent(event, event.subject)).length,
      proposeAccepted: at.filter(event => event.type === 'guarantee-proposed' && honestEvent(event, event.guarantor)).length,
      confirm: at.filter(event => event.type === 'guarantee-activated' && honestEvent(event, proposals.get(event.relation).to)).length,
    };
    // Initial guarantees also occur at hour zero, before the measured initial sample; remove their costs here.
    if (hour === 0) { before.proposeAccepted -= row.bootstrap.cohorts.honest.effort / 2; before.confirm -= row.bootstrap.cohorts.honest.effort / 2; }
    before.proposeRejected = beforeGuardianSpent - previousSpent - before.selfId - before.proposeAccepted - before.confirm;
    if (Object.values(before).some(value => !Number.isSafeInteger(value) || value < 0) || beforeGuardianSpent < previousSpent || native.cumulativeEffort > config.budgets.honest) throw new Error('F54 phase/work residual mismatch');
    for (const key of Object.keys(before)) totals[key] += before[key];
    totals.convert += conversionCount;
    for (const slot of funding.slots) {
      const invitation = invitations.find(invitation => invitation.id === slot.invitation);
      slot.opportunity.reason = slot.paidInspection ? 'paid-inspection' : 'inspection-budget-denied';
      counters[slot.paidInspection ? 'inspections' : 'inspectionDenied']++;
      if (!slot.paidInspection) continue;
      evaluator[genuine ? 'genuineTargetsInspected' : 'falseTargetsInspected']++;
      invitation.looks.push({ atHour: hour, guarantor: slot.guarantor, positive: slot.positive, response: slot.paidResponse === null ? 'not-requested' : slot.paidResponse ? 'paid' : 'budget-denied' });
      if (!slot.positive) continue;
      counters.positiveSignals++; counters.cancelCalls++; evaluator[genuine ? 'genuineTargetPositive' : 'falseTargetPositive']++;
      if (!slot.paidResponse) { counters.cancelBudgetDenied++; continue; }
      if (config.ablations.disableInvitationVeto) { counters.cancelRejected++; continue; }
      if (invitation.cancellation?.at !== hour || invitation.cancellation.guarantor !== slot.guarantor) throw new Error('F54 paid signal/cancellation mismatch');
      counters.cancelled++;
    }
    timeline.push({ atHour: hour, spentBeforeTick: previousSpent, paidBeforeGuardian: before, spentBeforeGuardian: beforeGuardianSpent,
      paidInspections: funding.paidInspections, paidResponses: funding.paidResponses, deniedInspections: denied.inspect, deniedResponses: denied.respond,
      spentAfterGuardian: afterGuardianSpent, paidConversions: conversionCount, spentAtTickEnd: native.cumulativeEffort, deniedByAction: denied });
    previousSpent = native.cumulativeEffort;
  }
  if (invitations.some(invitation => Boolean(invitation.cancellation) !== cancelled.has(invitation.id)) || digestOf(counters) !== digestOf(row.process.counters) || digestOf(evaluator) !== digestOf(row.process.evaluator)) throw new Error('F54 reconstructed native stages/evaluator mismatch');
  const expected = { selfId: totals.selfId, proposeGuarantee: totals.proposeAccepted + totals.proposeRejected + row.bootstrap.cohorts.honest.effort / 2, confirmGuarantee: totals.confirm + row.bootstrap.cohorts.honest.effort / 2, inspect: counters.inspections, respond: counters.cancelCalls - counters.cancelBudgetDenied, convert: totals.convert };
  if (Object.entries(expected).some(([action, count]) => h.byAction[action].attempts !== count || h.byAction[action].effort !== count) || totals.proposeRejected !== h.byAction.proposeGuarantee.rejected || h.byAction.respond.accepted !== counters.cancelled || h.byAction.respond.rejected !== counters.cancelRejected || previousSpent !== h.effort || Object.keys(h.byAction).some(action => timeline.reduce((sum, point) => sum + point.deniedByAction[action], 0) !== h.byAction[action].denied)) throw new Error('F54 reconstructed action/phase work mismatch');
  for (const invitation of invitations) {
    const denied = invitation.opportunities.filter(point => point.reason === 'inspection-budget-denied').length;
    invitation.inspectionDenied = denied;
    invitation.classification = invitation.status === 'open' ? 'pending-at-horizon' : invitation.cancellation ? (genuine ? 'genuine-invitation-veto' : 'prevented-false-invitation') : !invitation.opportunities.length ? 'no-scripted-reviewer-support' : !invitation.looks.length ? 'inspection-budget-denied-only' : invitation.looks.every(look => !look.positive) ? 'actual-checks-negative' : config.ablations.disableInvitationVeto ? 'effect-disabled-or-unfunded-response' : 'response-budget-denied';
  }
  const exhausted = timeline.find(point => point.spentAtTickEnd === config.budgets.honest);
  const firstDenied = timeline.find(point => Object.values(point.deniedByAction).some(value => value));
  return { seed: row.seed, population: row.population, resource: row.resource, evidence: row.evidence, arm: row.arm, counters, evaluator, totals,
    firstExhaustedTickEnd: exhausted ? { atHour: exhausted.atHour, phase: exhausted.spentBeforeTick === config.budgets.honest ? 'already-exhausted' : exhausted.spentBeforeGuardian === config.budgets.honest ? 'pre-guardian' : exhausted.spentAfterGuardian === config.budgets.honest ? 'guardian' : 'conversion' } : null,
    firstDeniedSample: firstDenied?.atHour ?? null, timeline, invitations };
}
export function auditWindows(blocks) {
  checkKernels();
  const retained = readRetainedBlocks();
  if (digestOf(blocks) !== digestOf(retained)) throw new Error('F54 window audit requires sealed retained blocks');
  analyzeBlocks(blocks);
  const cases = blocks.flatMap(block => block.rows.map(row => reconstructCase(row, caseConfig(DESIGN, row.seed, DESIGN.populations.find(value => value.id === row.population), DESIGN.resources.find(value => value.id === row.resource), row.evidence, DESIGN.arms.find(value => value.id === row.arm)))));
  return { schema: 'facety-f54-window-audit/v1', level: 'postdata-author-diagnostic-not-confirmation', binding: { manifestSha256: MANIFEST_SHA, kernels: KERNELS }, cases,
    qualifications: [
      'No model calls, new worlds, labels or primary changes. Inverts the retained unit-pool constraints in pinned phase order, conditional on journal stop witnesses; not independent per-action receipts or authentic inputs.',
      'Paid inspections are a prefix within each guardian phase. Native denied counts and end-of-phase budget determine funding; unfunded looks have no inferred signal. Daily pair trials are consumed even on budget denial, without same-day retry.',
      'After-guardian honest paid work is successful conversion only; the decoder rejects unsupported channels, failed conversions, exits/invalidation, profiles, verification, censoring or nonunit weights. Before-guardian rejected proposals are an aggregate phase residual, not identified actors/reasons.',
      'First exhausted tick-end and first denied sample are distinct. Phase timing/recorded authority are not human neglect, historical duty, uniquely verified people, a pure inspection-capacity intervention or a sole causal explanation.',
      'Pending lifetime beyond the horizon remains unknown. Genuine target class is scenario-supplied; lawful veto is not adjudicated misconduct. No new protocol/RNG/default, D33/D34/D42 migration, calibrated risk/utility or registered mechanism claim.',
    ] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('F54 window audit accepts no input/output/policy overrides');
  const report = auditWindows(readRetainedBlocks());
  writeFileSync(new URL('window-audit.json', DIRECTORY), JSON.stringify(report) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ cases: report.cases.length }));
}
