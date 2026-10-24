// Owns: Post-data F49 key/timeline reconstruction, not a new simulation or human scheduling policy.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Random } from '../../src/random.mjs';
import { createActivitySchedule } from '../../src/activity-schedule.mjs';
import { digestOf } from '../../src/provenance.mjs';
import { analyzeBlocks } from './analyze.mjs';

const ROOT = new URL('../../', import.meta.url);
const DIRECTORY = new URL('./', import.meta.url);
const MANIFEST_SHA = '15f279b78a525582d1664095e949b9c8f4bfb78031c61dc3dfaaa2d74d9fd4e8';
const KERNELS = {
  'src/random.mjs': 'bb73976902a0e4954b61e7f09c1ac01d8187ec9d092f0ebd2e181f0257c0f7d1',
  'src/activity-schedule.mjs': '59a5a128f14a96cea22d59b45efc309526e72bdbdf1c241728dc8c920af101ec',
};
const COUNTERS = ['pairTickOpportunities', 'reviewSlots', 'inspections', 'inspectionDenied', 'positiveSignals', 'verificationCalls', 'verificationDenied', 'verificationPassed', 'cancelCalls', 'cancelBudgetDenied', 'cancelUnavailable', 'cancelRejected', 'cancelled'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pair = (from, to) => JSON.stringify([from, to]);
function checkKernels() {
  for (const [file, expected] of Object.entries(KERNELS)) if (sha(readFileSync(new URL(file, ROOT))) !== expected) throw new Error('F49 audit random/placement source changed; no implicit drift override');
}
export function readRetainedBlocks() {
  const bytes = readFileSync(new URL('manifest.json', DIRECTORY));
  if (sha(bytes) !== MANIFEST_SHA) throw new Error('F49 closed manifest changed');
  const manifest = JSON.parse(bytes);
  for (const [file, expected] of Object.entries(manifest.artifacts)) {
    const artifact = readFileSync(new URL(file, DIRECTORY));
    if (artifact.length !== expected.bytes || sha(artifact) !== expected.sha256) throw new Error('F49 closed artifact changed: ' + file);
  }
  return [0, 1, 2, 3].map(index => JSON.parse(readFileSync(new URL('block-' + index + '.json', DIRECTORY))));
}
function topology(state, horizon) {
  const proposals = new Map();
  const activations = [];
  const pairs = new Set();
  let previous = 0;
  for (const event of state.events) {
    if (!Number.isSafeInteger(event.at) || event.at < previous || event.at > horizon || event.at % 4 !== 0) throw new Error('invalid F49 journal clock');
    previous = event.at;
    if (event.type === 'guarantee-ended') throw new Error('F49 audit does not infer ended/re-linked support');
    if (event.type === 'guarantee-proposed') {
      if (proposals.has(event.relation)) throw new Error('duplicate guarantee proposal');
      proposals.set(event.relation, { from: event.guarantor, to: event.guaranteed });
    }
    if (event.type !== 'guarantee-activated') continue;
    const proposal = proposals.get(event.relation);
    if (!proposal || pairs.has(pair(proposal.from, proposal.to))) throw new Error('unknown/duplicate guarantee activation');
    pairs.add(pair(proposal.from, proposal.to));
    activations.push({ ...proposal, at: event.at });
  }
  if (state.subjects.some(subject => subject.identityStatus !== 'accepted')) throw new Error('F49 audit does not infer invalidation chronology');
  const snapshot = state.guarantees.edges.map(edge => pair(edge.from, edge.to));
  if (new Set(snapshot).size !== snapshot.length || digestOf([...pairs].sort()) !== digestOf(snapshot.sort())) throw new Error('F49 temporal/snapshot guarantee mismatch');
  return activations;
}

// This fixed-script helper has no model calls. Activation order is canonical incoming-edge order;
// setup/guarantee work precedes guardian work, while invitation creation follows it in this source.
export function reconstructCase(row, config) {
  checkKernels();
  if (config.stepHours !== 4 || !Number.isSafeInteger(config.days) || config.days < 1 || config.policy.invitationFreezeHours !== 24 || config.activity.honest.review !== 1 || config.social.verification || config.social.exitOnFraud || config.disputes.enabled || config.actorProfiles.some(profile => profile.transactionHours !== null)) throw new Error('unsupported F49 reconstruction contract');
  const horizon = config.days * 24;
  const freeze = config.policy.invitationFreezeHours;
  const activations = topology(row.state, horizon);
  const truth = new Map(row.state.truth.map(identity => [identity.id, identity]));
  if (truth.size !== row.state.truth.length || row.state.subjects.some(subject => !truth.has(subject.id)) || activations.some(edge => !truth.has(edge.from) || !truth.has(edge.to)) || [...truth.values()].some(identity => !['honest', 'attackers'].includes(identity.cohort))) throw new Error('missing/invalid F49 evaluator roles; no inferred zero support');
  const schedule = createActivitySchedule(config);
  const unrestricted = createActivitySchedule({ ...config, actorProfiles: [] });
  const sensing = new Random(config.seed).fork('observations');
  const counters = Object.fromEntries(COUNTERS.map(key => [key, 0]));
  const invitations = [];
  for (const invitation of row.state.invitations) {
    const { id, creator, target, createdAt, status } = invitation;
    if (!['open', 'accepted', 'cancelled'].includes(status) || !Number.isSafeInteger(createdAt) || createdAt < 0 || createdAt >= horizon || createdAt % 4 !== 0 || truth.get(creator)?.cohort !== 'attackers') throw new Error('unsupported F49 invitation/script');
    const creation = row.state.events.filter(event => event.type === 'invitation-created' && event.invitation === id);
    const cancellation = row.state.events.filter(event => event.type === 'invitation-cancelled' && event.invitation === id);
    if (creation.length !== 1 || creation[0].at !== createdAt || creation[0].creator !== creator || creation[0].target !== target || cancellation.length !== Number(status === 'cancelled')) throw new Error('F49 invitation journal mismatch');
    const cancelled = cancellation[0] ?? null;
    const deadline = createdAt + freeze;
    if (cancelled && (!(cancelled.at > createdAt && cancelled.at < deadline && cancelled.at < horizon) || config.ablations.disableInvitationVeto)) throw new Error('F49 cancellation boundary mismatch');
    const end = Math.min(deadline, horizon, cancelled ? cancelled.at + 4 : Infinity);
    const support = at => activations.filter(edge => edge.to === creator && edge.at <= at && truth.get(edge.from)?.cohort === 'honest').map(edge => edge.from);
    const potential = [];
    const inspections = [];
    let done = false;
    for (let hour = createdAt + 4; hour < end; hour += 4) {
      for (const guarantor of support(hour)) {
        const available = schedule.available(guarantor, hour, 'attention');
        const quota = unrestricted.slots(guarantor, hour, 'invitation-review', 1, [id], 'attention').length === 1;
        if ((schedule.slots(guarantor, hour, 'invitation-review', 1, [id], 'attention').length === 1) !== (available && quota)) throw new Error('F49 slot intersection mismatch');
        potential.push({ hour, guarantor, available, quota });
        if (done) continue;
        counters.pairTickOpportunities++;
        if (!available || !quota) continue;
        counters.reviewSlots++;
        counters.inspections++;
        // All pending targets are false in this fixed sybil-cone script; truth is evaluator-only.
        const positive = sensing.fork(JSON.stringify([target, ['invitation-review', hour, guarantor]])).chance(config.sensitivity);
        inspections.push({ atHour: hour, guarantor, positive });
        if (!positive) continue;
        counters.positiveSignals++;
        counters.cancelCalls++;
        if (config.ablations.disableInvitationVeto) { counters.cancelRejected++; continue; }
        if (!cancelled || cancelled.at !== hour || cancelled.guarantor !== guarantor) throw new Error('F49 signal/cancellation witness mismatch');
        counters.cancelled++;
        done = true;
      }
    }
    if (Boolean(cancelled) !== done) throw new Error('F49 cancellation not reconstructed');
    const actors = [...new Set(potential.map(point => point.guarantor))];
    const allocations = [];
    for (const guarantor of actors) {
      for (let day = Math.floor(createdAt / 24); day * 24 < end; day++) {
        const hours = Array.from({ length: 6 }, (_, index) => day * 24 + index * 4);
        const selected = hours.filter(hour => unrestricted.slots(guarantor, hour, 'invitation-review', 1, [id], 'attention').length === 1);
        if (selected.length !== 1) throw new Error('F49 daily unit quota not reconstructed');
        const atHour = selected[0];
        const match = potential.find(point => point.hour === atHour && point.guarantor === guarantor);
        let reason;
        if (atHour <= createdAt) reason = 'before-or-at-creation';
        else if (atHour >= deadline) reason = 'at-or-after-expiry';
        else if (atHour >= horizon) reason = 'outside-horizon';
        else if (cancelled && atHour > cancelled.at) reason = 'after-success';
        else if (!match) reason = 'before-support';
        else if (!match.available) reason = 'calendar-unavailable';
        else if (inspections.some(inspection => inspection.atHour === atHour && inspection.guarantor === guarantor)) reason = 'inspected';
        else if (cancelled && atHour === cancelled.at) reason = 'after-success-same-tick';
        else throw new Error('unexplained F49 allocated slot');
        allocations.push({ guarantor, day, atHour, reason });
      }
    }
    const calendarPairs = potential.filter(point => point.available).length;
    const legalQuotaPairs = potential.filter(point => point.quota).length;
    let classification;
    if (status === 'open') classification = 'pending-at-horizon';
    else if (status === 'cancelled') classification = 'prevented';
    else if (!potential.length) classification = 'no-scripted-reviewer-support';
    else if (!calendarPairs) classification = 'no-calendar-overlap';
    else if (!inspections.length) classification = legalQuotaPairs ? 'quota-calendar-disjoint' : 'no-linked-quota-in-window';
    else if (!inspections.some(inspection => inspection.positive)) classification = 'observation-misses';
    else if (config.ablations.disableInvitationVeto) classification = 'effect-disabled';
    else throw new Error('unexplained F49 accepted invitation');
    invitations.push({ id, creator, target, createdAt, deadline, status, classification,
      supportAtCreation: support(createdAt).length, everScriptedReviewers: actors.length,
      potentialPairs: potential.length, calendarPairs, legalQuotaPairs,
      openUnobservedHours: status === 'open' ? Math.max(0, deadline - horizon) : 0,
      inspections, allocations,
    });
  }
  return { seed: row.seed, context: row.context, arm: row.arm, counters, invitations };
}

export function auditSlots(blocks) {
  const retained = readRetainedBlocks();
  checkKernels();
  analyzeBlocks(blocks);
  const sorted = [...blocks].sort((a, b) => a.block - b.block);
  if (digestOf(sorted) !== digestOf(retained)) throw new Error('slot audit accepts only retained F49 blocks');
  const design = JSON.parse(readFileSync(new URL('design.json', DIRECTORY)));
  const cases = [];
  for (const block of sorted) for (const row of block.rows) {
    const context = design.contexts.find(item => item.id === row.context);
    const arm = design.arms.find(item => item.id === row.arm);
    const actorProfiles = context.offset === null ? [] : Array.from({ length: 12 }, (_, index) => ({ subject: 'n' + index, activity: {}, transactionHours: null, attentionHours: Array.from({ length: 7 }, (_, day) => 24 * day + 4 * ((index + context.offset) % 6)) }));
    const config = { ...design.base, seed: row.seed, actorProfiles, ablations: { ...design.base.ablations, disableInvitationVeto: arm.disabled } };
    if (digestOf(config) !== row.configDigest) throw new Error('F49 reconstruction config mismatch');
    const result = reconstructCase(row, config);
    if (digestOf(result.counters) !== digestOf(row.process.counters)) throw new Error('F49 reconstructed stage counters mismatch');
    const evaluator = { falseTargetsInspected: result.counters.inspections, genuineTargetsInspected: 0, falseTargetPositive: result.counters.positiveSignals, genuineTargetPositive: 0 };
    if (digestOf(evaluator) !== digestOf(row.process.evaluator)) throw new Error('F49 reconstructed observation counters mismatch');
    cases.push(result);
  }
  const summary = design.contexts.flatMap(context => design.arms.map(arm => {
    const rows = cases.filter(row => row.context === context.id && row.arm === arm.id);
    const invitations = rows.flatMap(row => row.invitations);
    return { context: context.id, arm: arm.id, invitations: invitations.length,
      outcomes: Object.fromEntries(['accepted', 'cancelled', 'open'].map(status => [status, invitations.filter(invitation => invitation.status === status).length])),
      classifications: Object.fromEntries([...new Set(invitations.map(invitation => invitation.classification))].sort().map(key => [key, invitations.filter(invitation => invitation.classification === key).length])),
      allocatedSlots: invitations.flatMap(invitation => invitation.allocations).reduce((counts, allocation) => ({ ...counts, [allocation.reason]: (counts[allocation.reason] ?? 0) + 1 }), {}),
    };
  }));
  return { schema: 'facety-f49-slot-audit/v1', level: 'postdata-author-diagnostic-not-confirmation',
    keyBinding: { implementation: design.source.implementation, randomness: design.randomness, sourceExperimentSha256: '3a3d319c0259cff2c94683bc321e92ea4d5246ba374f333bf05756fa2aef4649', kernels: { ...KERNELS }, closedManifestSha256: MANIFEST_SHA },
    inputDigests: sorted.map(block => digestOf(block)), cases, summary,
    interpretation: [
      'Reconstructs all 24 retained stage-counter vectors and signal/cancellation witnesses without FacetyModel or a new world.',
      'Scripted honest-cohort current incoming links are evaluator-defined review-capable support, not verified independent people or all protocol-authorized guarantors.',
      'Key-implied daily slots can precede invitation/link creation; these are latent placements, not actual inspections or appointments.',
      'Potential pairs stop at observed cancellation/horizon; allocations after success are not missed duties. Open invitations are not classified as completed escapes.',
      'Expiry of unavailable/past slots is an encoded timing assumption, not measured human neglect or evidence against a different rescheduling policy.',
      'Independent signal-key reconstruction tests source fidelity, not authentic evidence, optimal response, endogenous incentives, population probability or independent review.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('F49 slot audit accepts no input/output/policy overrides');
  const report = auditSlots(readRetainedBlocks());
  writeFileSync(new URL('slot-audit.json', DIRECTORY), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ cases: report.cases.length, summary: report.summary }));
}
