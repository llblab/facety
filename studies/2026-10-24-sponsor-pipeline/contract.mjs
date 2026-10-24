// Owns: Fixed diagnostic episode execution/validation and method identity; excludes case remedies, calibration and mechanism confirmation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { causalWorld } from '../../examples/causal-walkthroughs.mjs';
import { EvidenceRelay, accountabilitySnapshot } from '../../src/accountability.mjs';
import { actObservationEnvironment } from '../../src/act-observations.mjs';
import { assessSponsorship } from '../../src/sponsor-assessment.mjs';
import { experimentConfig } from '../../src/experiment.mjs';
import { digestOf } from '../../src/provenance.mjs';

export const SOURCE = 'c5ba0d17415344a0fb5b9b71409798560998b8db79970b81b7e18b2222831d62';
export const METHOD_FILES = Object.freeze(['studies/2026-10-24-sponsor-pipeline/contract.mjs', 'studies/2026-10-24-sponsor-pipeline/run.mjs',
  'studies/2026-10-24-sponsor-pipeline/analyze.mjs', 'studies/2026-10-24-sponsor-pipeline/design.json', 'examples/causal-walkthroughs.mjs']);
export function methodDigests() {
  return Object.fromEntries(METHOD_FILES.map(file => [file, createHash('sha256').update(readFileSync(new URL('../../' + file, import.meta.url))).digest('hex')]));
}
export function studyDesign() { return JSON.parse(readFileSync(new URL('design.json', import.meta.url))); }
export function casePlan(seed) {
  const d = studyDesign();
  return d.validity.flatMap(valid => d.roles.flatMap(role => d.profiles.flatMap(profile => d.paths.map(path => ({ seed, valid, role, profile: profile.id, path: path.id })))));
}
function configuration(config, d) {
  if (!config || Object.keys(config).sort().join() !== 'path,profile,role,seed,valid' || typeof config.seed !== 'string' || !config.seed.length
    || !d.validity.includes(config.valid) || !d.roles.includes(config.role)) throw new Error('sponsor-pipeline invalid episode configuration');
  const profile = d.profiles.find(row => row.id === config.profile), path = d.paths.find(row => row.id === config.path);
  if (!profile || !path) throw new Error('sponsor-pipeline unknown profile/contact path');
  return { profile, path };
}
function equal(actual, expected, message) { if (digestOf(actual) !== digestOf(expected)) throw new Error('sponsor-pipeline ' + message); }
export function executeCase(config, { traceLimit = 200, inertInspection = false } = {}) {
  const d = studyDesign(), { profile, path } = configuration(config, d);
  let world = null, relay = null;
  const outputs = { observation: null, package: null, route: null, review: null, sponsorship: null };
  try {
    world = causalWorld();
    const { model } = world;
    equal(accountabilitySnapshot(model), d.bootstrap.snapshot, 'native funded prefix changed');
    const act = model.selfId(d.episode.selfId);
    const facts = { subjects: [{ id: act.subject, genuine: true, behaviorProfile: 'good-faith' }],
      acts: [{ id: act.id, subject: act.subject, kind: 'self-id', recordedAt: act.recordedAt, valid: config.valid }] };
    const environment = actObservationEnvironment(facts, { seed: config.seed, rates: d.rates });
    const rules = experimentConfig({ disputes: { ...d.episode.rules, stakeBacking: d.episode.stakeBacking } }).disputes;
    equal(rules, d.episode.normalizedRules, 'normalized legacy reference rules changed');
    relay = new EvidenceRelay(model, { claim: 'act-defect', rules, traceLimit, actors: ['Aster', 'Bela'].map(id =>
      ({ id, subject: id, budget: d.episode.budgetPerActor, reviewCapacity: d.episode.reviewCapacity })) });
    if (inertInspection) {
      relay.snapshot(); relay.trace(); accountabilitySnapshot(model);
      environment.observe({ act: act.id, observer: 'unused-software-inspector', role: 'ordinary', atHour: model.now + 1, opportunity: 'future-inert-software-only' });
    }
    outputs.observation = relay.observeAct('Aster', act.id, environment, { role: config.role, opportunity: d.episode.sourceOpportunity, sourceGroup: d.episode.sourceGroup });
    let outcome = 'no-source-suspicion';
    if (relay.snapshot().observations[0].suspicious) {
      outputs.package = relay.package('Aster', [outputs.observation.value]);
      outputs.route = relay.route('Aster', outputs.package.value, path.sponsor);
      outcome = outputs.route.reason ?? null;
      if (outputs.route.ok) {
        outputs.review = relay.reviewAct(path.sponsor, outputs.package.value, environment,
          { role: 'guarantor', opportunity: d.episode.reviewOpportunity, sourceGroup: path.sameTag ? d.episode.sourceGroup : d.episode.distinctReviewGroup }, { available: path.available });
        outputs.sponsorship = profile.value === null ? relay.sponsor(path.sponsor, outputs.package.value) : relay.sponsor(path.sponsor, outputs.package.value, profile.value);
        outcome = outputs.sponsorship.reason;
      }
    }
    const state = relay.snapshot(), route = state.packages[0]?.routes[0], decision = outputs.sponsorship?.decision;
    const row = { config: structuredClone(config), endAtHour: model.now, bootstrapDigest: d.bootstrap.digest, outputs, relay: state, trace: relay.trace(),
      protocol: accountabilitySnapshot(model), metrics: { sourcePositive: state.observations[0].suspicious, packaged: !!outputs.package,
        routed: outputs.route?.ok ?? false, reviewPaid: route?.review !== null && route?.review !== undefined,
        reviewSignal: route?.review?.suspicious ?? null, assessmentPaid: !!decision, willing: decision?.assessment.willing ?? null,
        preCaseRequested: outcome === 'act-defect-adjudication-unimplemented', casesOpened: state.cases.length,
        work: state.actors.reduce((sum, actor) => sum + actor.spent, 0), outcome } };
    if (traceLimit === d.episode.traceLimit) validateRow(row);
    return row;
  } catch (error) {
    error.caseEvidence = { config, outputs, relay: relay?.snapshot() ?? null, trace: relay?.trace() ?? null,
      protocol: world ? accountabilitySnapshot(world.model) : null };
    throw error;
  }
}

function publicBoundary(value) {
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (['genuine', 'valid', 'behaviorProfile', 'targetTruth'].includes(key)) throw new Error('sponsor-pipeline evaluator truth leaked into public relay');
    publicBoundary(child);
  }
}
export function validateRow(row) {
  publicBoundary(row.relay); publicBoundary(row.trace);
  const d = studyDesign(), { profile, path } = configuration(row.config, d), m = row.metrics;
  if (row.endAtHour !== d.episode.atHour || row.bootstrapDigest !== d.bootstrap.digest) throw new Error('sponsor-pipeline episode/bootstrap mismatch');
  equal(row.protocol, d.bootstrap.snapshot, 'protocol state changed; no act remedy authorized');
  if (digestOf(d.bootstrap.snapshot) !== d.bootstrap.digest || row.relay.cases.length || row.trace.omitted || row.trace.limit !== d.episode.traceLimit) throw new Error('sponsor-pipeline unsupported/censored protocol trace');
  const observations = row.relay.observations;
  if (observations.length !== 1 || observations[0].actor !== 'Aster' || observations[0].selfId !== d.episode.selfId || observations[0].atHour !== d.episode.atHour
    || observations[0].role !== row.config.role || observations[0].opportunity !== d.episode.sourceOpportunity || observations[0].subject !== 'Mira'
    || observations[0].sourceGroup !== d.episode.sourceGroup || observations[0].observationPolicy !== d.randomness.observations.observations || typeof observations[0].suspicious !== 'boolean') throw new Error('sponsor-pipeline source receipt mismatch');
  const positive = observations[0].suspicious, routed = positive && path.id !== 'absent', paid = routed && path.available;
  if (row.relay.packages.length !== Number(positive)) throw new Error('sponsor-pipeline package stage mismatch');
  const item = row.relay.packages[0], route = item?.routes[0];
  if (positive && (item.claim !== 'act-defect' || item.selfId !== d.episode.selfId || item.subject !== 'Mira' || item.status !== 'open' || item.routes.length !== Number(routed))) throw new Error('sponsor-pipeline claim/route mismatch');
  if (routed && (route.sponsor !== path.sponsor || !!route.review !== paid)) throw new Error('sponsor-pipeline paid/missing review mismatch');
  if (paid && (typeof route.review.suspicious !== 'boolean' || route.review.opportunity !== d.episode.reviewOpportunity
    || route.review.sourceGroup !== (path.sameTag ? d.episode.sourceGroup : d.episode.distinctReviewGroup))) throw new Error('sponsor-pipeline review receipt mismatch');
  const signal = paid ? route.review.suspicious : null, qualified = paid && signal && !path.sameTag;
  if (routed && route.status !== (qualified ? 'reviewed' : paid ? 'refused' : 'pending')) throw new Error('sponsor-pipeline review status mismatch');
  const decision = row.outputs.sponsorship?.decision;
  if (routed && profile.value !== null) {
    if (!decision || route.decisions?.length !== 1) throw new Error('sponsor-pipeline missing paid assessment');
    const expected = assessSponsorship(paid ? { suspicious: signal, distinctSource: !path.sameTag } : { suspicious: null, distinctSource: null }, profile.value);
    equal(decision.assessment, expected, 'private-profile/evidence assessment mismatch');
    equal(route.decisions[0], decision, 'stored assessment differs');
    if (decision.access.allowed !== (path.sponsor === 'Bela') || decision.reviewedRoute !== !!qualified || decision.entrySupported !== false || decision.caseOpened !== false
      || decision.attempted !== (!!qualified && path.sponsor === 'Bela' && expected.willing === true)) throw new Error('sponsor-pipeline eligibility/request/case mismatch');
  } else if (decision || route?.decisions) throw new Error('sponsor-pipeline fabricated assessment');
  const request = !!qualified && path.sponsor === 'Bela' && (profile.value === null || decision.assessment.willing === true);
  const expectedWork = positive ? path.id === 'absent' ? 3 : path.available ? 5 : 4 : 1;
  const expectedOutcome = !positive ? 'no-source-suspicion' : !routed ? 'no-sponsor' : profile.value !== null && decision.assessment.willing !== true
    ? decision.assessment.willing === false ? 'sponsor-declined' : 'sponsor-willingness-undetermined'
    : !qualified ? 'no-reviewed-open-route' : path.sponsor === 'Aster' ? 'challenge XP gate' : 'act-defect-adjudication-unimplemented';
  const expectedMetrics = { sourcePositive: positive, packaged: positive, routed, reviewPaid: paid, reviewSignal: signal,
    assessmentPaid: routed && profile.value !== null, willing: decision?.assessment.willing ?? null, preCaseRequested: request, casesOpened: 0,
    work: expectedWork, outcome: expectedOutcome };
  equal(m, expectedMetrics, 'stage/measurement mismatch');
  if (!row.outputs.observation?.ok || (positive && !row.outputs.package?.ok) || (routed && row.outputs.route?.ok !== true)
    || (!!row.outputs.review !== routed) || (!!row.outputs.sponsorship !== routed) || m.preCaseRequested !== (m.outcome === 'act-defect-adjudication-unimplemented')) throw new Error('sponsor-pipeline operation stage mismatch');
  if (positive && !routed && row.outputs.route.reason !== 'no-sponsor') throw new Error('sponsor-pipeline missing contact mismatch');
  const expectedActorWork = { Aster: positive ? 3 : 1, Bela: 0 };
  if (routed) expectedActorWork[path.sponsor] += path.available ? 2 : 1;
  for (const actor of row.relay.actors) {
    if (actor.id !== actor.subject || actor.budget !== d.episode.budgetPerActor || actor.spent !== expectedActorWork[actor.id] || actor.denied !== 0
      || actor.reviewCapacity !== d.episode.reviewCapacity) throw new Error('sponsor-pipeline nonbinding actor work contract mismatch');
    equal(actor.reviews, paid && actor.id === path.sponsor ? [[3, 1]] : [], 'review calendar count mismatch');
  }
  if (row.relay.actors.length !== 2 || new Set(row.relay.actors.map(actor => actor.id)).size !== 2) throw new Error('sponsor-pipeline actor set mismatch');
  equal(row.trace.records.map(record => record.action), positive ? routed ? ['observe', 'package', 'route', 'review', profile.value === null ? 'formal-challenge' : 'sponsor-decision'] : ['observe', 'package', 'route'] : ['observe'], 'action ordering mismatch');
  equal(row.trace.records.map(record => record.work), positive ? routed ? [1, 1, 1, Number(paid), 1] : [1, 1, 1] : [1], 'action work mismatch');
  if (row.trace.records[0].visible.suspicious !== positive || (routed && digestOf(row.trace.records[3].visible.observation) !== digestOf(paid ? { suspicious: signal, sourceGroup: route.review.sourceGroup } : null))) throw new Error('sponsor-pipeline trace received/missing signal mismatch');
  if (row.trace.records.length !== (positive ? routed ? 5 : 3 : 1) || row.trace.records.reduce((total, record) => total + record.work, 0) !== expectedWork
    || row.trace.records.some(record => record.error || record.protocolEvents.length || Object.keys(record.changes.subjects).length || Object.keys(record.changes.ledger).length)) throw new Error('sponsor-pipeline decision/work trace mismatch');
  return row;
}
export function validateBlock(block) {
  const d = studyDesign(), index = block.block;
  if (!Number.isInteger(index) || index < 0 || index > 3 || block.schema !== 'facety-sponsor-pipeline-block/v1'
    || typeof block.captureCommit !== 'string' || !/^[a-f0-9]{40}$/.test(block.captureCommit) || block.designDigest !== digestOf(d)) throw new Error('sponsor-pipeline invalid block identity');
  equal(block.source, d.source, 'block source mismatch');
  equal(block.methodDigests, methodDigests(), 'block method mismatch');
  const seeds = d.seeds.slice(index * 4, index * 4 + 4);
  equal(block.seeds, seeds, 'block seed assignment mismatch');
  equal(block.rows.map(row => row.config), seeds.flatMap(seed => casePlan(seed)), 'block case matrix/order mismatch');
  for (const row of block.rows) validateRow(row);
  return block;
}
