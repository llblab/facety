// Owns: Post-data F52 first-attended support/trial/signal reconstruction; excludes model calls and human calibration.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Random } from '../../src/random.mjs';
import { digestOf } from '../../src/provenance.mjs';
import { caseConfig } from './contract.mjs';
import { analyzeBlocks } from './analyze.mjs';
import { COUNTERS, EVALUATOR } from '../2026-10-24-attended-comparison/contract.mjs';

const ROOT = new URL('../../', import.meta.url);
const DIRECTORY = new URL('./', import.meta.url);
const DESIGN = JSON.parse(readFileSync(new URL('design.json', DIRECTORY)));
const MANIFEST_SHA = '09743c579f8196d9828223e9ac466c22c8b412d603a843d6bc4c3262d338a0d1';
const KERNELS = {
  'src/experiment.mjs': '37d41881cb85b64b2270599b09bba1a07d2a9edf7167777b142df26b5a4f1dfe',
  'src/experiment-config.mjs': '3d46fac681bfef159e10c38342dd013c69778d97fc427e271e242e45beb0fec3',
  'src/random.mjs': 'bb73976902a0e4954b61e7f09c1ac01d8187ec9d092f0ebd2e181f0257c0f7d1',
  'src/activity-schedule.mjs': '59a5a128f14a96cea22d59b45efc309526e72bdbdf1c241728dc8c920af101ec',
  'src/identity-observations.mjs': 'fa900922d2490e01bc8b4618ee9df57e5850be8b893ebd11d2c3d6da2b8dcef0',
  'src/model.mjs': '4f2487a09048165de9c59b4c96ce47f302149f1981d0e25fd9a6cdd49a7717dc',
  'src/graph.mjs': '98f85af17b154428108fb8063df9b1a31a6639e446f41afdb7a305d3aac56296',
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pair = (from, to) => JSON.stringify([from, to]);
function checkKernels() {
  for (const [file, expected] of Object.entries(KERNELS)) if (sha(readFileSync(new URL(file, ROOT))) !== expected) throw new Error('F52 review reference changed; no implicit drift override');
}
export function readRetainedBlocks() {
  const bytes = readFileSync(new URL('manifest.json', DIRECTORY));
  if (sha(bytes) !== MANIFEST_SHA) throw new Error('F52 closed manifest changed');
  for (const [file, expected] of Object.entries(JSON.parse(bytes).artifacts)) {
    const artifact = readFileSync(new URL(file, ROOT));
    if (artifact.length !== expected.bytes || sha(artifact) !== expected.sha256) throw new Error('F52 closed artifact changed: ' + file);
  }
  return [0, 1, 2, 3].map(index => JSON.parse(readFileSync(new URL('block-' + index + '.json', DIRECTORY))));
}
function topology(state, horizon) {
  const known = new Map(state.truth.map(identity => [identity.id, identity]));
  const subjects = new Map(state.subjects.map(subject => [subject.id, subject]));
  if (known.size !== state.truth.length || subjects.size !== state.subjects.length || known.size !== subjects.size || [...subjects.values()].some(subject => subject.identityStatus !== 'accepted' || !known.has(subject.id)) || [...known.values()].some(identity => !['honest', 'attackers'].includes(identity.cohort) || typeof identity.genuine !== 'boolean')) throw new Error('F52 missing roles/invalidation chronology; no inferred support');
  const allowed = new Set(['subject-added', 'guarantee-proposed', 'guarantee-activated', 'artifact-registered', 'self-id-created', 'collector-converted', 'invitation-created', 'invitation-accepted', 'invitation-cancelled']);
  const births = new Map(), proposals = new Map(), edges = new Map();
  const activations = [];
  let previous = 0, phaseBoundary = -1;
  for (const event of state.events) {
    if (!Number.isSafeInteger(event.at) || event.at < previous || event.at > horizon || event.at % 4) throw new Error('F52 invalid journal clock');
    if (!allowed.has(event.type)) throw new Error('F52 unsupported history: ' + event.type);
    previous = event.at;
    if (event.type === 'subject-added') {
      if (births.has(event.subject) || !subjects.has(event.subject) || typeof event.genesis !== 'boolean' || event.genesis !== subjects.get(event.subject).genesis || (event.genesis && event.at !== 0)) throw new Error('F52 invalid subject chronology');
      births.set(event.subject, event.at);
      if (!event.genesis) phaseBoundary = event.at;
    }
    if (['invitation-created', 'invitation-accepted', 'invitation-cancelled', 'collector-converted'].includes(event.type)) phaseBoundary = event.at;
    if (event.type === 'guarantee-proposed') {
      if (proposals.has(event.relation) || event.guarantor === event.guaranteed || !births.has(event.guarantor) || !births.has(event.guaranteed)) throw new Error('F52 invalid guarantee proposal');
      proposals.set(event.relation, { from: event.guarantor, to: event.guaranteed, proposedAt: event.at });
    }
    if (event.type !== 'guarantee-activated') continue;
    const proposal = proposals.get(event.relation);
    if (!proposal || edges.has(pair(proposal.from, proposal.to)) || event.at >= horizon || phaseBoundary === event.at || [proposal.from, proposal.to].some(id => !subjects.get(id).genesis && births.get(id) >= event.at)) throw new Error('F52 unsupported activation/order chronology');
    const edge = { from: proposal.from, to: proposal.to, at: event.at, order: activations.length };
    edges.set(pair(edge.from, edge.to), 'edge:' + edge.order);
    activations.push(edge);
  }
  const snapshot = state.guarantees.edges;
  if (births.size !== subjects.size || snapshot.length !== edges.size || new Set(snapshot.map(edge => pair(edge.from, edge.to))).size !== snapshot.length || snapshot.some(edge => edges.get(pair(edge.from, edge.to)) !== edge.id)) throw new Error('F52 temporal/snapshot support mismatch');
  return { known, activations, births };
}

// Counts factor by invitation: no exits/invalidation, scarcity, verification or response-induced graph changes.
// All activations in the pinned fixed script precede guardian work in their tick; invitation creation follows it.
export function reconstructCase(row, config) {
  checkKernels();
  const gates = row.process?.counters;
  if (config.stepHours !== 4 || !Number.isSafeInteger(config.days) || config.days < 1 || config.invitationReviewTiming !== 'first-attended' || !['independent', 'shared-target'].includes(config.invitationEvidence) || !['sybil-cone', 'real-cartel'].includes(config.scenario) || config.policy.invitationFreezeHours !== 24 || config.social.verification || config.social.exitOnFraud || config.disputes.enabled || config.deviants.share || config.perturbations.length || config.activity.honest.invite || config.activity.honest.inspect || config.activity.attackers.inspect || config.activity.honest.challenge || config.activity.attackers.challenge || row.outcome.censored || row.outcome.elapsedHours !== config.days * 24 || ['inspectionDenied', 'cancelBudgetDenied', 'cancelUnavailable', 'verificationCalls'].some(key => gates?.[key] !== 0)) throw new Error('unsupported F52 first-attended reconstruction contract');
  const horizon = config.days * 24;
  const profiles = new Map();
  for (const profile of config.actorProfiles) {
    if (profiles.has(profile.subject) || profile.transactionHours !== null || Object.keys(profile.activity).length || (profile.attentionHours !== null && (!Array.isArray(profile.attentionHours) || profile.attentionHours.some((hour, i) => !Number.isSafeInteger(hour) || hour < 0 || hour >= horizon || hour % 4 || (i && hour <= profile.attentionHours[i - 1]))))) throw new Error('unsupported F52 attention profile');
    profiles.set(profile.subject, profile);
  }
  const rate = config.activity.honest.review;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error('F52 review probability outside supported bounds');
  const { known, activations, births } = topology(row.state, horizon);
  const genuine = config.scenario === 'real-cartel';
  const shared = config.invitationEvidence === 'shared-target';
  const sensing = new Random(config.seed).fork('observations');
  const trials = new Random(config.seed).fork('daily-quota-keyed-slots-v1');
  const counters = Object.fromEntries(COUNTERS.map(key => [key, 0]));
  const evaluator = Object.fromEntries(EVALUATOR.map(key => [key, 0]));
  const invitations = [];
  const ids = new Set(), targets = new Set();
  for (const invitation of row.state.invitations) {
    const { id, creator, target, createdAt, status } = invitation;
    if (ids.has(id) || targets.has(target) || !['accepted', 'cancelled', 'open'].includes(status) || !Number.isSafeInteger(createdAt) || createdAt < 0 || createdAt >= horizon || createdAt % 4 || known.get(creator)?.cohort !== 'attackers' || (known.has(target) && known.get(target).genuine !== genuine)) throw new Error('F52 unsupported invitation/target script');
    ids.add(id); targets.add(target);
    const creation = row.state.events.filter(event => event.type === 'invitation-created' && event.invitation === id);
    const cancellation = row.state.events.filter(event => event.type === 'invitation-cancelled' && event.invitation === id);
    const acceptance = row.state.events.filter(event => event.type === 'invitation-accepted' && event.invitation === id);
    const deadline = createdAt + 24;
    if (creation.length !== 1 || creation[0].at !== createdAt || creation[0].creator !== creator || creation[0].target !== target || cancellation.length !== Number(status === 'cancelled') || acceptance.length !== Number(status === 'accepted') || (status === 'accepted' && (invitation.acceptedAt !== deadline || acceptance[0].at !== deadline || acceptance[0].subject !== target || births.get(target) !== deadline)) || (status !== 'accepted' && known.has(target))) throw new Error('F52 invitation journal mismatch');
    const cancelled = cancellation[0] ?? null;
    if ((status === 'open' && deadline <= horizon) || (cancelled && (config.ablations.disableInvitationVeto || cancelled.at <= createdAt || cancelled.at >= deadline || cancelled.at >= horizon))) throw new Error('F52 invitation lifetime mismatch');
    const support = hour => activations.filter(edge => edge.to === creator && edge.at <= hour && known.get(edge.from).cohort === 'honest').map(edge => edge.from);
    const consumed = new Set();
    const opportunities = [], dailyTrials = [], inspections = [];
    let done = false;
    for (let hour = createdAt + 4; hour < Math.min(deadline, horizon) && !done; hour += 4) for (const guarantor of support(hour)) {
      counters.pairTickOpportunities++;
      const hours = profiles.get(guarantor)?.attentionHours;
      const day = Math.floor(hour / 24);
      const key = JSON.stringify([guarantor, day]);
      const point = { atHour: hour, guarantor, day };
      if (hours != null && !hours.includes(hour)) { opportunities.push({ ...point, reason: 'calendar-unavailable' }); continue; }
      if (consumed.has(key)) { opportunities.push({ ...point, reason: 'daily-trial-already-consumed' }); continue; }
      consumed.add(key);
      const positiveTrial = trials.fork(JSON.stringify(['count', day, guarantor, 'invitation-review', [id]])).chance(rate);
      dailyTrials.push({ ...point, positiveTrial });
      if (!positiveTrial) { opportunities.push({ ...point, reason: 'daily-trial-zero' }); continue; }
      opportunities.push({ ...point, reason: 'paid-inspection' });
      counters.reviewSlots++; counters.inspections++;
      evaluator[genuine ? 'genuineTargetsInspected' : 'falseTargetsInspected']++;
      const observationKey = shared ? ['invitation-shared-target-v1', target] : [target, ['invitation-review', hour, guarantor]];
      const positive = sensing.fork(JSON.stringify(observationKey)).chance(genuine ? config.falsePositiveRate : config.sensitivity);
      inspections.push({ ...point, positive });
      if (!positive) continue;
      counters.positiveSignals++; counters.cancelCalls++;
      evaluator[genuine ? 'genuineTargetPositive' : 'falseTargetPositive']++;
      if (config.ablations.disableInvitationVeto) { counters.cancelRejected++; continue; }
      if (!cancelled || cancelled.at !== hour || cancelled.guarantor !== guarantor) throw new Error('F52 signal/cancellation witness mismatch');
      counters.cancelled++;
      done = true;
      break;
    }
    if (Boolean(cancelled) !== done) throw new Error('F52 cancellation not reconstructed');
    let classification;
    if (status === 'open') classification = 'pending-at-horizon';
    else if (done) classification = genuine ? 'genuine-invitation-veto' : 'prevented-false-invitation';
    else if (!opportunities.length) classification = 'no-scripted-reviewer-support';
    else if (opportunities.every(point => point.reason === 'calendar-unavailable')) classification = 'no-calendar-overlap';
    else if (!inspections.length) classification = 'no-positive-daily-trial';
    else if (!inspections.some(inspection => inspection.positive)) classification = shared ? 'persistent-negative-checks' : 'all-actual-checks-negative';
    else if (config.ablations.disableInvitationVeto) classification = 'effect-disabled';
    else throw new Error('F52 unexplained accepted invitation');
    invitations.push({ id, creator, target, createdAt, deadline, status, genuineTarget: genuine, classification,
      supportAtCreation: support(createdAt).length, everScriptedReviewers: new Set(opportunities.map(point => point.guarantor)).size,
      openUnobservedHours: status === 'open' ? deadline - horizon : 0,
      repeatedSharedNegativeLooks: shared && inspections.length && inspections.every(inspection => !inspection.positive) ? inspections.length - 1 : 0,
      opportunities, dailyTrials, inspections,
    });
  }
  if (row.state.events.some(event => ['invitation-created', 'invitation-accepted', 'invitation-cancelled'].includes(event.type) && !ids.has(event.invitation))) throw new Error('F52 orphan invitation event');
  return { seed: row.seed, population: row.population, calendar: row.calendar, evidence: row.evidence, arm: row.arm, counters, evaluator, invitations };
}

export function auditReviews(blocks) {
  const retained = readRetainedBlocks();
  checkKernels();
  analyzeBlocks(blocks);
  const sorted = [...blocks].sort((a, b) => a.block - b.block);
  if (digestOf(sorted) !== digestOf(retained)) throw new Error('F52 review audit accepts only sealed retained blocks');
  const cases = [];
  for (const block of sorted) for (const row of block.rows) {
    const config = caseConfig(DESIGN, row.seed, DESIGN.populations.find(value => value.id === row.population), DESIGN.calendars.find(value => value.id === row.calendar), row.evidence, DESIGN.arms.find(value => value.id === row.arm));
    if (digestOf(config) !== row.configDigest) throw new Error('F52 review config mismatch');
    const result = reconstructCase(row, config);
    if (digestOf(result.counters) !== digestOf(row.process.counters) || digestOf(result.evaluator) !== digestOf(row.process.evaluator)) throw new Error('F52 reconstructed native counters/evaluator mismatch');
    for (const [action, count] of [['inspect', result.counters.inspections], ['respond', result.counters.cancelCalls], ['verify', 0]]) {
      const actual = row.effort.cohorts.honest.byAction[action];
      if (actual.attempts !== count || actual.effort !== count * config.weights[action]) throw new Error('F52 reconstructed paid work mismatch');
    }
    cases.push(result);
  }
  const summary = DESIGN.populations.flatMap(population => DESIGN.calendars.flatMap(calendar => DESIGN.evidence.flatMap(evidence => DESIGN.arms.map(arm => {
    const selected = cases.filter(row => row.population === population.id && row.calendar === calendar.id && row.evidence === evidence && row.arm === arm.id);
    const invitations = selected.flatMap(row => row.invitations);
    return { population: population.id, calendar: calendar.id, evidence, arm: arm.id, invitations: invitations.length,
      outcomes: Object.fromEntries(['accepted', 'cancelled', 'open'].map(status => [status, invitations.filter(invitation => invitation.status === status).length])),
      classifications: Object.fromEntries([...new Set(invitations.map(invitation => invitation.classification))].sort().map(key => [key, invitations.filter(invitation => invitation.classification === key).length])),
      inspections: selected.reduce((sum, row) => sum + row.counters.inspections, 0),
      negatives: invitations.reduce((sum, invitation) => sum + invitation.inspections.filter(inspection => !inspection.positive).length, 0),
      repeatedSharedNegativeLooks: invitations.reduce((sum, invitation) => sum + invitation.repeatedSharedNegativeLooks, 0),
    };
  }))));
  return { schema: 'facety-f52-review-audit/v1', level: 'postdata-author-diagnostic-not-confirmation',
    binding: { closedManifestSha256: MANIFEST_SHA, implementation: DESIGN.source.implementation, policies: DESIGN.randomness, kernels: KERNELS },
    inputDigests: sorted.map(block => digestOf(block)), cases, summary,
    interpretation: [
      'Reconstructs retained first-attended current-link opportunities/trials/looks/signals, not a new world, future intervention, human memory or model economic replay.',
      'Scripted honest-cohort reviewers are not all legally authorized guarantors or verified independent people. Historical activation order, not final raw degree, determines each tick.',
      'No post-creation same-tick review, age-24 review or horizon actor round. A missing calendar opportunity beyond the retained horizon is unknown, not a neglected duty.',
      'A daily Bernoulli is consumed at first attended support, including zero trials, with no same-day retry; after success no later observer is counted as missing a duty.',
      'Repeated negative looks at one shared signal add no independent correction draw in this encoded law; this neither prescribes caching nor demonstrates lack of useful real-world work.',
      'Recorded-stage attribution is post-data/source-bound, not independent population trials, authenticity, independent review, optimal behavior or a registered mechanism claim.',
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('F52 review audit accepts no input/output/policy overrides');
  const report = auditReviews(readRetainedBlocks());
  writeFileSync(new URL('review-audit.json', DIRECTORY), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ cases: report.cases.length, summary: report.summary }));
}
