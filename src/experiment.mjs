// Owns: Cohort scheduling, noisy observations and scenario evaluation; excludes a truth court.
import { FacetyModel, DAY, policyFrom, ablationsFrom, DEFAULT_ABLATIONS, ProtocolRejection } from './model.mjs';
import { Random, RANDOM_GENERATOR, pickIndexExcluding } from './random.mjs';
import { generateGraph, TOPOLOGIES } from './generators.mjs';
import { EffortLedger, DEFAULT_WEIGHTS, effortWeights, COHORTS, SimulationLimit } from './effort.mjs';
import { modelMetrics } from './metrics.mjs';
import { measureNetwork, measureWork } from './observables.mjs';
import { reachableNodes } from './proofs.mjs';
import { provenance } from './provenance.mjs';

export const SCENARIOS = Object.freeze(['honest-growth', 'sybil-cone', 'real-cartel']);
// Model ablations remove protocol mechanisms; behavior ablations remove scripted agent choices.
// Both are labeled counterfactual controls, never protocol options.
export const EXPERIMENT_ABLATIONS = Object.freeze({ ...DEFAULT_ABLATIONS, randomGuaranteeTargets: false });
export const RANDOMNESS_POLICY = Object.freeze({ generator: RANDOM_GENERATOR, decisions: 'decision-keyed-v1' });
export const DEFAULT_ACTIVITY = Object.freeze({
  honest: Object.freeze({ selfId: 0.8, invite: 0.05, guarantee: 0.3, inspect: 1, respond: 0.9, challenge: 0, review: 0, defend: 0, bribe: 0, cashout: 0, convert: 1 }),
  attackers: Object.freeze({ selfId: 1, invite: 0.4, guarantee: 2, inspect: 0, respond: 0, challenge: 0, review: 0, defend: 1, bribe: 0, cashout: 0, convert: 1 }),
});
const DEFAULTS = Object.freeze({
  scenario: 'sybil-cone', seed: 'facety', initialSize: 30, attackerShare: 0.1,
  days: 30, initialTopology: 'random', initialDegree: 3,
  localInspectionShare: 0.8, sensitivity: 0.8, falsePositiveRate: 0.01,
  maxSubjects: 2000, maxActions: 500_000, targetFalseConversions: 1,
  successCriterion: 'false-liquidity', includeState: false,
});
// Minimal public-challenge layer. It abstracts Chekharda to one challenge with an immediate verdict
// of declared accuracy; escalation, Council review and appeals are not modeled.
export const DEFAULT_DISPUTES = Object.freeze({
  enabled: false, accuracy: 0.9, stake: 1, fine: 5, liability: 'inviter-chain', rewardShare: 0.5, loserHalvesXp: true, excludeLiable: false,
  fineMode: 'chain',
  // Chekharda ladder: each entrant needs more XP than the previous one and stakes (1 + stakeGrowth) times more;
  // the last unopposed side wins and every winner takes the stake of the entrant directly below.
  procedure: 'one-step', stakeGrowth: 0.2, signalAccuracy: 0.7, closeSignalAccuracy: 0.9, xpValue: 0.05, maxRounds: 60, maxScan: 60,
  councilDepth: 0, reputationWeight: 0,
  // Timed Chekharda: the last move wins after disputeWindowHours without a counter-entry; attention grows
  // with the dispute's height (largest entrant XP over mean network XP), and so does available evidence.
  disputeWindowHours: 168, noticeBase: 0.02, evidenceGain: 0.1, civicValue: 0,
  // Who takes the next position among willing candidates, and how many entries a timed dispute can
  // take per day (owner: many entrants a day, XP jumping by multiples toward the most senior people).
  entrantChoice: 'lowest', roundsPerDay: 1,
  // Dispute-resolution reputation: public win/loss records. Regulars notice disputes more often, and a
  // candidate weighs the record of the entrant it would oppose.
  trackRecordWeight: 0, regularsNotice: 0,
  // Evidence: each noticer's private noisy signal, or public proof that every noticer and Council member
  // sees (correct with proofStrength). Cluster follow-up challenges everyone who defended a proven fake.
  evidence: 'private-signal', proofStrength: 0.98, clusterFollowUp: false,
});
// 'inviter-chain' adds the inviter's own guarantors, who could have cancelled the invitation right.
export const LIABILITY_POLICIES = Object.freeze(['subject', 'guarantors', 'guarantors-and-inviter', 'inviter-chain']);
export const DEFAULT_DEVIANTS = Object.freeze({ share: 0, honest: null, attackers: null });
// Social trust behavior of honest people. Defaults reproduce the earlier public-matching scheduler.
export const DEFAULT_SOCIAL = Object.freeze({
  scope: 'public', hops: 2, strangerRate: 0,
  screening: false, screeningQuantile: 0.2, screeningShare: 0.5,
  verification: false, verificationSensitivity: 0.9, verificationFalsePositiveRate: 0.01,
  investigation: false, maxFollowUps: 20,
  bribeAcceptance: 0, bribePrice: 5,
  exitOnFraud: false,
  flowTracing: false, flowHubThreshold: 3, honestTransferRate: 0,
  attentionFeedback: false,
  // Network effect as a mechanism, not a formula: information travels gossipHops through acquaintance.
  // People near a dispute's participants hear of it; a confirmed suspicion reaches the reporter's
  // acquaintances, who then inspect that subject with probability gossipShare.
  gossipHops: 0, gossipShare: 0.5,
});
export const EXPERIMENT_ASSUMPTIONS = Object.freeze([
  'Initial subjects are genuine accepted human operators and trusted roots; their prior acquisition cost is not estimated.',
  'Initial guarantees and subsequent work consume declared cohort effort budgets. All default action weights are illustrative unit weights.',
  'Sybil descendants share an attacker operator; cartel descendants are recruited genuine operators. Initial and evolving subject shares differ.',
  'Activity is per accepted subject per day, not a free per-operator throughput. Every performed action consumes effort.',
  'Non-probability activity rates use floor(rate) plus one Bernoulli fractional action, not Poisson arrivals.',
  'Defense receives noisy observations. Only authorized guarantor vetoes are modeled; outsiders have no simulated court.',
  'Council majority means ever holding more than half of current seats, not a successful corrupt Council verdict.',
  'Self-ID, guarantee work, inspections/responses, invitations/acceptance and conversion run in that daily order; actor order is seeded.',
  'Resource safety caps censor unresolved trials. Finite economic budgets are scenario constraints, not censoring.',
  'These are fixed reference strategies, not optimized worst-case attackers. Repeated observations are conditionally independent noisy draws.',
  'Random draws are keyed by logical decision/observation context, not a shared consumed stream; seed replay requires the recorded randomness policy.',
  'Scheduled perturbations alter daily activity only, not protocol rules, genesis trust or automatic counterparty matching.',
  'XP Gini and normalized XP shares are undefined (null) when total effective XP is zero; equal positive XP has Gini zero.',
  'Configured ablations are counterfactual mechanism removals for evidence experiments; any enabled ablation is not Facety protocol behavior.',
  'With procedure "chekharda", the verdict is endogenous: entrants with strictly increasing XP and stakes growing by stakeGrowth join the side their private signal favors (acquaintances of the subject within two hops receive the more accurate signal) only when their expected stake gain exceeds the stake and XP-halving risk; coalition members back the coalition side when eligible; the last unopposed side wins; winners take the stake directly below them; losers lose their stakes and half their XP. Council intervention is not modeled.',
  'When enabled, disputes are one-step public challenges: an observer with more effective XP than the act owner and a suspicious observation may challenge; an environment verdict of declared accuracy invalidates the subject and sanctions declared liable parties, or sanctions the challenger. Chekharda escalation, Council review and appeals are not modeled.',
  'Deviants are a seeded subset of a cohort\'s initial operators, with the fake subjects they control, following a declared alternative activity profile; labels are evaluator-only. Recruited genuine people follow their cohort profile.',
  'Payoff facts are protocol quantities per operator group (initial conformists, initial deviants, later recruits); their utility weights are supplied separately by an analysis, never inferred.',
  'Social settings, when enabled, are behavioral assumptions: honest people guarantee only acquaintances within the declared hop radius (rarely strangers); screening ranks subjects by public root-seeded trust propagation over the guarantee graph; a second-stage verification (call or meeting) of declared quality precedes vetoes and challenges; investigations follow lineage after an upheld verdict; corruptible honest people accept bribes to guarantee fakes with the declared probability.',
]);

function mergeRecord(defaults, overrides, label) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError(label + ' must be an object');
  for (const key of Object.keys(overrides)) if (!Object.hasOwn(defaults, key)) throw new Error('unknown ' + label + ' key: ' + key);
  return { ...defaults, ...overrides };
}
function probability(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(label + ' must be in [0, 1]');
}
function integer(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(label + ' is outside its integer bounds');
}

function activityOverrides(overrides) {
  const cohorts = mergeRecord({ honest: {}, attackers: {} }, overrides, 'activity');
  return Object.freeze(Object.fromEntries(COHORTS.map(cohort => {
    const partial = cohorts[cohort];
    mergeRecord(DEFAULT_ACTIVITY[cohort], partial, cohort + ' activity');
    for (const [action, rate] of Object.entries(partial)) {
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new RangeError('activity must be in [0, 100]');
      if (['selfId', 'respond', 'challenge', 'review', 'defend', 'cashout', 'convert'].includes(action)) probability(rate, action);
    }
    return [cohort, Object.freeze({ ...partial })];
  })));
}

function disputesFrom(overrides) {
  const disputes = mergeRecord(DEFAULT_DISPUTES, overrides, 'disputes');
  if (typeof disputes.enabled !== 'boolean' || typeof disputes.loserHalvesXp !== 'boolean' || typeof disputes.excludeLiable !== 'boolean') throw new TypeError('dispute switches must be boolean');
  probability(disputes.accuracy, 'disputes.accuracy');
  probability(disputes.rewardShare, 'disputes.rewardShare');
  integer(disputes.stake, 'disputes.stake', 0);
  integer(disputes.fine, 'disputes.fine', 0);
  if (!LIABILITY_POLICIES.includes(disputes.liability)) throw new Error('unknown dispute liability policy');
  if (!['fixed', 'chain'].includes(disputes.fineMode)) throw new Error('disputes.fineMode must be fixed or chain');
  if (!['one-step', 'chekharda', 'chekharda-timed'].includes(disputes.procedure)) throw new Error('disputes.procedure must be one-step, chekharda or chekharda-timed');
  integer(disputes.disputeWindowHours, 'disputes.disputeWindowHours', 1, 10000);
  integer(disputes.roundsPerDay, 'disputes.roundsPerDay', 1, 1000);
  if (!['lowest', 'highest', 'random'].includes(disputes.entrantChoice)) throw new Error('disputes.entrantChoice must be lowest, highest or random');
  probability(disputes.trackRecordWeight, 'disputes.trackRecordWeight');
  if (!['private-signal', 'public-proof'].includes(disputes.evidence)) throw new Error('disputes.evidence must be private-signal or public-proof');
  probability(disputes.proofStrength, 'disputes.proofStrength');
  if (typeof disputes.clusterFollowUp !== 'boolean') throw new TypeError('disputes.clusterFollowUp must be boolean');
  probability(disputes.regularsNotice, 'disputes.regularsNotice');
  probability(disputes.noticeBase, 'disputes.noticeBase');
  for (const key of ['evidenceGain', 'civicValue']) if (!Number.isFinite(disputes[key]) || disputes[key] < 0) throw new RangeError('disputes.' + key + ' must be non-negative');
  for (const key of ['signalAccuracy', 'closeSignalAccuracy']) probability(disputes[key], 'disputes.' + key);
  if (!Number.isFinite(disputes.stakeGrowth) || disputes.stakeGrowth < 0 || disputes.stakeGrowth > 10) throw new RangeError('disputes.stakeGrowth must be in [0, 10]');
  if (!Number.isFinite(disputes.xpValue) || disputes.xpValue < 0) throw new RangeError('disputes.xpValue must be non-negative');
  integer(disputes.maxRounds, 'disputes.maxRounds', 1, 100);
  integer(disputes.maxScan, 'disputes.maxScan', 1, 100000);
  integer(disputes.councilDepth, 'disputes.councilDepth', 0, 100);
  probability(disputes.reputationWeight, 'disputes.reputationWeight');
  return Object.freeze(disputes);
}

function scheduleFrom(events, days, label) {
  if (!Array.isArray(events) || events.length > 32) throw new Error(label + ' schedule must contain at most 32 events');
  return Object.freeze(events.map(event => {
    const checked = mergeRecord({ startDay: undefined, endDay: undefined, activity: {} }, event, label + ' schedule event');
    integer(checked.startDay, 'startDay', 0, days);
    integer(checked.endDay, 'endDay', checked.startDay + 1, days);
    return Object.freeze({ ...checked, activity: Object.freeze({ ...checked.activity }) });
  }));
}

function deviantsFrom(overrides, days) {
  const deviants = mergeRecord(DEFAULT_DEVIANTS, overrides, 'deviants');
  probability(deviants.share, 'deviants.share');
  for (const cohort of COHORTS) {
    if (deviants[cohort] === null) continue;
    const strategy = mergeRecord({ activity: {}, schedule: [] }, deviants[cohort], cohort + ' deviant strategy');
    const activity = activityOverrides({ [cohort]: strategy.activity })[cohort];
    const schedule = scheduleFrom(strategy.schedule, days, cohort + ' deviant');
    for (const event of schedule) activityOverrides({ [cohort]: event.activity });
    // Deviant activity is relative to DEFAULT_ACTIVITY, not to the cohort's configured profile.
    deviants[cohort] = Object.freeze({ activity: Object.freeze({ ...DEFAULT_ACTIVITY[cohort], ...activity }), schedule });
  }
  if (deviants.share === 0 && COHORTS.some(cohort => deviants[cohort] !== null)) throw new Error('deviant strategies require a positive deviants.share');
  return Object.freeze(deviants);
}

function socialFrom(overrides) {
  const social = mergeRecord(DEFAULT_SOCIAL, overrides, 'social');
  if (!['public', 'acquaintances'].includes(social.scope)) throw new Error('social.scope must be public or acquaintances');
  for (const key of ['screening', 'verification', 'investigation', 'exitOnFraud', 'flowTracing', 'attentionFeedback']) if (typeof social[key] !== 'boolean') throw new TypeError('social.' + key + ' must be boolean');
  integer(social.hops, 'social.hops', 1, 6);
  integer(social.maxFollowUps, 'social.maxFollowUps', 0, 1000);
  integer(social.bribePrice, 'social.bribePrice', 0);
  integer(social.flowHubThreshold, 'social.flowHubThreshold', 2, 1000);
  integer(social.gossipHops, 'social.gossipHops', 0, 6);
  probability(social.gossipShare, 'social.gossipShare');
  for (const key of ['strangerRate', 'screeningQuantile', 'screeningShare', 'verificationSensitivity', 'verificationFalsePositiveRate', 'bribeAcceptance', 'honestTransferRate']) probability(social[key], 'social.' + key);
  return Object.freeze(social);
}

function perturbationsFrom(overrides, days) {
  if (!Array.isArray(overrides) || overrides.length > 128) throw new Error('perturbations must contain at most 128 events');
  const events = overrides.map((item, index) => {
    const event = mergeRecord({ id: 'perturbation:' + index, startDay: undefined, endDay: undefined, activity: {} }, item, 'perturbation');
    if (typeof event.id !== 'string' || !event.id.length) throw new Error('perturbation ID must be non-empty');
    integer(event.startDay, 'startDay', 0, days);
    integer(event.endDay, 'endDay', event.startDay + 1, days);
    return Object.freeze({ ...event, activity: activityOverrides(event.activity) });
  });
  if (new Set(events.map(event => event.id)).size !== events.length) throw new Error('duplicate perturbation ID');
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      if (a.startDay >= b.endDay || b.startDay >= a.endDay) continue;
      if (COHORTS.some(cohort => Object.keys(a.activity[cohort]).some(key => Object.hasOwn(b.activity[cohort], key)))) throw new Error('overlapping perturbations assign the same activity field');
    }
  }
  return Object.freeze(events.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

function dayActivity(config, day) {
  const active = config.perturbations.filter(event => event.startDay <= day && day < event.endDay);
  const activity = Object.fromEntries(COHORTS.map(cohort => [cohort, { ...config.activity[cohort] }]));
  for (const event of active) for (const cohort of COHORTS) Object.assign(activity[cohort], event.activity[cohort]);
  return {
    activity: Object.freeze(Object.fromEntries(COHORTS.map(cohort => [cohort, Object.freeze(activity[cohort])]))),
    activePerturbations: Object.freeze(active.map(event => event.id)),
  };
}

export function activityAtDay(overrides, day) {
  const config = experimentConfig(overrides);
  integer(day, 'day', 0, config.days);
  return dayActivity(config, day);
}

export function experimentConfig(overrides = {}) {
  const nested = { activity: {}, budgets: {}, weights: {}, policy: {}, ablations: {}, perturbations: [], disputes: {}, deviants: {}, social: {} };
  const config = mergeRecord({ ...DEFAULTS, ...nested }, overrides, 'experiment');
  if (!SCENARIOS.includes(config.scenario)) throw new Error('unknown scenario');
  if (!Object.hasOwn(overrides, 'attackerShare') && config.scenario === 'honest-growth') config.attackerShare = 0;
  if (!Object.hasOwn(overrides, 'successCriterion') && config.scenario === 'real-cartel') config.successCriterion = 'council-majority';
  probability(config.attackerShare, 'attackerShare');
  if (config.scenario === 'honest-growth' && config.attackerShare !== 0) throw new Error('honest-growth requires attackerShare = 0');
  for (const key of ['localInspectionShare', 'sensitivity', 'falsePositiveRate']) probability(config[key], key);
  integer(config.initialSize, 'initialSize', 1, 10000);
  integer(config.days, 'days', 0, 3650);
  integer(config.initialDegree, 'initialDegree', 1, 10000);
  integer(config.maxSubjects, 'maxSubjects', config.initialSize);
  integer(config.maxActions, 'maxActions', 1);
  integer(config.targetFalseConversions, 'targetFalseConversions', 1);
  if (!['false-liquidity', 'council-majority'].includes(config.successCriterion)) throw new Error('unknown successCriterion');
  if (!['none', ...TOPOLOGIES].includes(config.initialTopology)) throw new Error('unknown initialTopology');
  if (typeof config.includeState !== 'boolean') throw new TypeError('includeState must be boolean');
  if (!['string', 'number'].includes(typeof config.seed) || (typeof config.seed === 'number' && !Number.isFinite(config.seed))) throw new TypeError('seed must be a string or finite number');
  config.seed = String(config.seed);
  const partialActivity = activityOverrides(config.activity);
  config.activity = Object.freeze(Object.fromEntries(COHORTS.map(cohort => [cohort, Object.freeze({ ...DEFAULT_ACTIVITY[cohort], ...partialActivity[cohort] })])));
  config.perturbations = perturbationsFrom(config.perturbations, config.days);
  config.disputes = disputesFrom(config.disputes);
  config.social = socialFrom(config.social);
  config.deviants = deviantsFrom(config.deviants, config.days);
  config.budgets = Object.freeze(mergeRecord({ honest: 100_000, attackers: 100_000 }, config.budgets, 'budgets'));
  config.weights = effortWeights(mergeRecord(DEFAULT_WEIGHTS, config.weights, 'weights'));
  config.policy = policyFrom(config.policy);
  const ablations = mergeRecord(EXPERIMENT_ABLATIONS, config.ablations, 'ablations');
  if (typeof ablations.randomGuaranteeTargets !== 'boolean') throw new TypeError('randomGuaranteeTargets must be boolean');
  config.ablations = Object.freeze({ ...ablationsFrom(Object.fromEntries(Object.keys(DEFAULT_ABLATIONS).map(key => [key, ablations[key]]))), randomGuaranteeTargets: ablations.randomGuaranteeTargets });
  new EffortLedger({ weights: config.weights, budgets: config.budgets, maxActions: config.maxActions });
  return Object.freeze(config);
}

export function withExperimentParameters(overrides, parameters) {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new TypeError('parameters must be an object');
  const candidate = structuredClone(experimentConfig(overrides));
  for (const [parameter, value] of Object.entries(parameters)) {
    const path = parameter.split('.');
    let parent = candidate;
    for (const key of path.slice(0, -1)) {
      if (!Object.hasOwn(parent, key) || parent[key] === null || typeof parent[key] !== 'object' || Array.isArray(parent[key])) throw new Error('unknown experiment parameter: ' + parameter);
      parent = parent[key];
    }
    const key = path.at(-1);
    if (!Object.hasOwn(parent, key)) throw new Error('unknown experiment parameter: ' + parameter);
    parent[key] = value;
  }
  return experimentConfig(candidate);
}

// Truth is confined to this environment/evaluator, not supplied to the defense handler.
function observationEnvironment(truth, random, config) {
  return (id, context, identity = truth.get(id)) => Object.freeze({ suspicious: random.fork(JSON.stringify([id, context])).chance(identity.genuine ? config.falsePositiveRate : config.sensitivity) });
}

// Uniform choice from `list` without `excluded` members; identical to picking from the filtered
// list with the same draw, without rebuilding that list for every opportunity.
function pickExcluding(list, positions, excluded, random) {
  const skipped = new Set();
  for (const id of excluded) {
    const position = positions.get(id);
    if (position !== undefined) skipped.add(position);
  }
  return list.length === skipped.size ? null : list[pickIndexExcluding(list.length, skipped, random)];
}

// SybilRank-style trust: early-terminated random walk from public seeds over the undirected
// guarantee graph, normalized by degree. Uses public graph data only.
function propagatedTrust(graph, seeds) {
  const nodes = [...graph.nodeIds()];
  const neighbors = new Map(nodes.map(id => [id, new Set([...graph.outEdges(id)].map(edge => edge.to).concat([...graph.inEdges(id)].map(edge => edge.from)))]));
  const live = seeds.filter(id => graph.hasNode(id));
  let trust = new Map(nodes.map(id => [id, 0]));
  for (const id of live) trust.set(id, 1 / live.length);
  for (let step = 0, steps = Math.ceil(Math.log2(Math.max(2, nodes.length))); step < steps; step++) {
    const next = new Map(nodes.map(id => [id, 0]));
    for (const [id, value] of trust) {
      if (!value) continue;
      const around = neighbors.get(id);
      if (!around.size) next.set(id, next.get(id) + value);
      else for (const other of around) next.set(other, next.get(other) + value / around.size);
    }
    trust = next;
  }
  return new Map(nodes.map(id => [id, trust.get(id) / Math.max(1, neighbors.get(id).size)]));
}

function respondToObservation(model, observer, act, observation) {
  if (!observation.suspicious) return { attempted: false, noAuthority: false };
  const authorized = model.policy.cancellationAuthority === 'snapshot'
    ? act.guarantors.includes(observer)
    : Boolean(model.guarantees.edge(observer, act.subject));
  return { attempted: authorized, noAuthority: !authorized };
}

export function runExperiment(overrides = {}) {
  const config = experimentConfig(overrides);
  const random = new Random(config.seed);
  const roles = random.fork('initial-roles');
  const sensing = random.fork('observations');
  const ids = Array.from({ length: config.initialSize }, (_, i) => 'n' + i);
  const attackerCount = Math.round(config.initialSize * config.attackerShare);
  const initialAttackers = new Set(roles.shuffle(ids).slice(0, attackerCount));
  const truth = new Map(ids.map(id => [id, { id, cohort: initialAttackers.has(id) ? 'attackers' : 'honest', genuine: true, operator: id }]));
  // Admission-ordered rosters mirror guarantee-graph node order for fast uniform target choice.
  const rosters = { all: [], attackers: [], honest: [] };
  const rosterPositions = { all: new Map(), attackers: new Map(), honest: new Map() };
  const enroll = id => {
    for (const roster of ['all', truth.get(id).cohort]) {
      rosterPositions[roster].set(id, rosters[roster].length);
      rosters[roster].push(id);
    }
  };
  ids.forEach(enroll);
  // Evaluator-only deviant operators: a seeded subset of each cohort's initial operators.
  const deviantOperators = new Set();
  if (config.deviants.share > 0) {
    for (const cohort of COHORTS) {
      const pool = ids.filter(id => truth.get(id).cohort === cohort);
      if (!pool.length) continue;
      const count = Math.max(1, Math.round(config.deviants.share * pool.length));
      for (const id of random.fork('deviants:' + cohort).shuffle(pool).slice(0, count)) deviantOperators.add(id);
    }
  }
  const genesisOperators = new Set(ids);
  const operatorEffort = new Map();
  const sanctions = { challenges: 0, upheld: 0, rejected: 0, falseInvalidated: 0, wrongfulInvalidated: 0, excluded: 0, missedFalse: 0, voidedActs: 0, ladderEntries: 0, ladderDepth: 0, councilInterventions: 0, disputesResolved: 0, disputesMooted: 0, disputesOpen: 0, disputeNotices: 0, clusterChallenges: 0 };
  const trustWork = { strangerRefusals: 0, verificationsCleared: 0, followUps: 0, bribesOffered: 0, bribesAccepted: 0, invitationsCancelled: 0, guardianExits: 0, cashouts: 0, flowFlagged: 0, flowFlaggedCoalition: 0, gossipShares: 0, gossipInspections: 0 };
  const bribes = new Map();
  // Per-observer watch lists filled by gossip from acquaintances.
  const watchLists = new Map();
  function spreadSuspicion(reporter, subjects) {
    if (!config.social.gossipHops || truth.get(reporter).cohort !== 'honest') return;
    for (const id of [reporter, ...neighborhood(reporter, config.social.gossipHops)]) {
      if (truth.get(id).cohort !== 'honest') continue;
      if (!watchLists.has(id)) watchLists.set(id, new Set());
      for (const subject of subjects) if (subject !== id && !watchLists.get(id).has(subject)) {
        watchLists.get(id).add(subject);
        trustWork.gossipShares++;
      }
    }
  }
  // Subjects who opened a challenge draw public attention to themselves (attentionFeedback).
  const attention = new Set();
  const openDisputes = [];
  const pendingClusters = [];
  let disputeSequence = 0;
  // Public dispute history per subject: positions won and lost.
  const disputeRecords = new Map();
  const reliability = id => {
    const record = disputeRecords.get(id) ?? { won: 0, lost: 0 };
    return (record.won + 1) / (record.won + record.lost + 2);
  };
  // Undirected social neighborhood over guarantees and invitation lineage.
  function neighborhood(id, hops) {
    const seenIds = new Set([id]);
    let frontier = [id];
    for (let depth = 0; depth < hops; depth++) {
      const next = [];
      for (const node of frontier) {
        for (const graph of [model.guarantees, model.lineage]) {
          for (const edge of graph.outEdges(node)) if (!seenIds.has(edge.to)) { seenIds.add(edge.to); next.push(edge.to); }
          for (const edge of graph.inEdges(node)) if (!seenIds.has(edge.from)) { seenIds.add(edge.from); next.push(edge.from); }
        }
      }
      frontier = next;
    }
    seenIds.delete(id);
    return seenIds;
  }
  const modelAblations = Object.fromEntries(Object.keys(DEFAULT_ABLATIONS).map(key => [key, config.ablations[key]]));
  const model = new FacetyModel({ genesis: ids, policy: config.policy, ablations: modelAblations });
  const effort = new EffortLedger({ weights: config.weights, budgets: config.budgets, maxActions: config.maxActions });
  const observe = observationEnvironment(truth, sensing, config);
  const pendingInvitations = [];
  const prepared = new Map();
  const seen = new Map();
  const history = [];
  const rejections = {};
  const observations = { inspections: 0, suspicious: 0, noVetoAuthority: 0, eligibleForUnmodeledXpChallenge: 0 };
  let nextSubject = 0;
  let firstSuccess = null;
  let falseConversionCount = 0;
  let censoredReason = null;
  let completedDays = 0;
  let previousSampleCosts = null;
  let previousCouncilIds = null;
  let activity = config.activity;
  let activePerturbations = [];
  let deviantActivity = {};
  const deviantActivityAt = day => Object.fromEntries(COHORTS.filter(cohort => config.deviants[cohort] !== null).map(cohort => {
    const strategy = config.deviants[cohort];
    const profile = { ...strategy.activity };
    for (const event of strategy.schedule) if (event.startDay <= day && day < event.endDay) Object.assign(profile, event.activity);
    return [cohort, Object.freeze(profile)];
  }));
  const groupOf = identity => deviantOperators.has(identity.operator) ? 'deviant' : genesisOperators.has(identity.operator) ? 'conformist' : 'recruit';
  // Activity for one actor: deviant operators (and fakes they control) follow their declared strategy.
  function activityOf(actor) {
    const identity = truth.get(actor);
    return deviantOperators.has(identity.operator) && deviantActivity[identity.cohort] ? deviantActivity[identity.cohort] : activity[identity.cohort];
  }

  function decision(channel, actor = '', slot = 0) {
    return random.fork(JSON.stringify([RANDOMNESS_POLICY.decisions, model.now, channel, actor, slot]));
  }

  function attempt(actor, action, operation, phase = 'maintenance') {
    const ticket = effort.begin(truth.get(actor).cohort, action, phase);
    if (!ticket) return { ok: false, reason: 'budget-denied' };
    const operator = truth.get(actor).operator;
    operatorEffort.set(operator, (operatorEffort.get(operator) ?? 0) + Math.round(ticket.cost * 1e6));
    try {
      const value = operation();
      effort.finish(ticket, true);
      if (action === 'convert' && !truth.get(actor).genuine) falseConversionCount++;
      if (['selfId', 'invite', 'acceptInvitation', 'respond', 'convert'].includes(action)) noteSuccess();
      return { ok: true, value };
    } catch (error) {
      if (!(error instanceof ProtocolRejection) && !(error instanceof SimulationLimit)) throw error;
      effort.finish(ticket, false);
      rejections[error.message] = (rejections[error.message] ?? 0) + 1;
      if (error instanceof SimulationLimit) throw error;
      return { ok: false, reason: error.message };
    }
  }
  function workCount(rate, stream) {
    return Math.floor(rate) + Number(stream.chance(rate % 1));
  }
  function establish(guarantor, guaranteed, phase = 'maintenance', bootstrap = false, slot = 0) {
    const proposal = attempt(guarantor, 'proposeGuarantee', () => {
      if (!bootstrap && truth.get(guarantor).cohort === 'honest' && observe(guaranteed, ['guarantee-proposal', model.now, guarantor, slot]).suspicious) throw new ProtocolRejection('guarantee-vetting-refused');
      return model.proposeGuarantee(guarantor, guaranteed);
    }, phase);
    if (!proposal.ok) return;
    attempt(guaranteed, 'confirmGuarantee', () => {
      if (!bootstrap && truth.get(guaranteed).cohort === 'honest' && config.social.scope === 'acquaintances' && !neighborhood(guaranteed, config.social.hops).has(guarantor)
        && !decision('confirm-stranger', guaranteed, [guarantor, slot]).chance(config.social.strangerRate)) {
        trustWork.strangerRefusals++;
        throw new ProtocolRejection('stranger-guarantee-refused');
      }
      if (!bootstrap && truth.get(guaranteed).cohort === 'honest' && observe(guarantor, ['guarantee-confirmation', model.now, guaranteed, slot]).suspicious) throw new ProtocolRejection('guarantee-confirmation-refused');
      model.confirmGuarantee(guaranteed, proposal.value);
    }, phase);
  }
  function noteSuccess() {
    if (firstSuccess !== null) return;
    let success = falseConversionCount >= config.targetFalseConversions;
    if (config.successCriterion === 'council-majority') {
      const council = model.council();
      success = council.filter(member => truth.get(member.id).cohort === 'attackers').length > council.length / 2;
    }
    if (!success) return;
    const costs = effort.summary().cohorts;
    firstSuccess = { atHour: model.now, attackerEffort: costs.attackers.effort, defenderEffort: costs.honest.effort };
  }
  function sample(stage) {
    const council = model.council();
    const seats = council.filter(member => truth.get(member.id).cohort === 'attackers').length;
    const acts = model.selfIds();
    const falseConversions = acts.filter(act => act.status === 'converted' && !truth.get(act.subject).genuine).length;
    if (falseConversions !== falseConversionCount) throw new Error('conversion evaluator invariant failed');
    const costs = effort.summary().cohorts;
    const network = measureNetwork(model, truth, { previousCouncilIds });
    history.push({
      atHour: model.now, stage, ...network,
      attackerSeats: seats, councilSeats: council.length, falseConversions,
      attackerEffort: costs.attackers.effort, defenderEffort: costs.honest.effort,
      cohorts: measureWork(costs, previousSampleCosts),
      effectiveActivity: activity, activePerturbations: [...activePerturbations],
      ...(deviantOperators.size ? { deviantActivity } : {}),
      sanctions: { ...sanctions },
      trust: { ...trustWork },
    });
    previousSampleCosts = costs;
    previousCouncilIds = network.council.memberIds;
  }
  function guaranteeWork(actors) {
    for (const actor of actors) {
      const cohort = truth.get(actor).cohort;
      for (let i = 0, count = workCount(activityOf(actor).guarantee, decision('guarantee-count', actor)); i < count; i++) {
        const choice = decision('guarantee-target', actor, i);
        const excluded = [actor, ...[...model.guarantees.outEdges(actor)].map(edge => edge.to)];
        let target;
        // The randomGuaranteeTargets ablation is uniform public matching without coalition or lineage preference.
        if (!config.ablations.randomGuaranteeTargets && cohort === 'attackers') target = pickExcluding(rosters.attackers, rosterPositions.attackers, excluded, choice);
        else {
          const children = config.ablations.randomGuaranteeTargets ? [] : [...model.lineage.outEdges(actor)].map(edge => edge.to).filter(id => !model.guarantees.edge(actor, id));
          if (children.length) target = choice.pick(children);
          else if (cohort === 'honest' && config.social.scope === 'acquaintances' && !config.ablations.randomGuaranteeTargets
            && !decision('guarantee-stranger', actor, i).chance(config.social.strangerRate)) {
            // Acquaintances only: friends of friends in admission order; no stranger this time.
            const known = [...neighborhood(actor, config.social.hops)].filter(id => !model.guarantees.edge(actor, id) && model.subject(id).identityStatus === 'accepted')
              .sort((a, b) => rosterPositions.all.get(a) - rosterPositions.all.get(b));
            target = known.length ? choice.pick(known) : null;
          } else target = pickExcluding(rosters.all, rosterPositions.all, excluded, choice);
        }
        if (target !== null) establish(actor, target, 'maintenance', false, i);
      }
    }
  }
  // Public money movements: fakes consolidate liquid FACY to their operator; honest people make ordinary
  // small payments to acquaintances, which are the background noise for flow analysis.
  function cashFlowWork(actors) {
    for (const actor of actors) {
      const identity = truth.get(actor);
      const subject = model.subject(actor);
      if (!identity.genuine && subject.liquidFacy > 0 && identity.operator !== actor && model.subject(identity.operator).identityStatus === 'accepted'
        && decision('cashout', actor).chance(activityOf(actor).cashout)) {
        if (attempt(actor, 'cashout', () => model.transferFacy(actor, identity.operator, subject.liquidFacy)).ok) trustWork.cashouts++;
      } else if (identity.genuine && identity.cohort === 'honest' && subject.liquidFacy > 0 && config.social.honestTransferRate > 0
        && decision('honest-transfer', actor).chance(config.social.honestTransferRate)) {
        const known = [...neighborhood(actor, config.social.hops)].filter(id => model.subject(id).identityStatus === 'accepted').sort((a, b) => rosterPositions.all.get(a) - rosterPositions.all.get(b));
        if (known.length) model.transferFacy(actor, decision('honest-transfer-target', actor).pick(known), 1);
      }
    }
  }
  // Flow analysis: recipients of ordinary transfers from at least flowHubThreshold distinct senders are hubs;
  // hubs and their senders are flagged for screening.
  function flaggedByFlows() {
    const senders = new Map();
    for (const event of model.events()) {
      if (event.type !== 'facy-transferred' || event.memo !== 'transfer') continue;
      if (!senders.has(event.to)) senders.set(event.to, new Set());
      senders.get(event.to).add(event.from);
    }
    const flagged = new Set();
    for (const [hub, from] of senders) {
      if (from.size < config.social.flowHubThreshold) continue;
      flagged.add(hub);
      for (const id of from) flagged.add(id);
    }
    return flagged;
  }
  // Coalition actors offer payment to honest strangers for guaranteeing a controlled subject.
  function briberyWork(actors) {
    for (const actor of actors) {
      if (truth.get(actor).cohort !== 'attackers' || model.subject(actor).identityStatus !== 'accepted') continue;
      for (let i = 0, count = workCount(activityOf(actor).bribe, decision('bribe-count', actor)); i < count; i++) {
        const target = pickExcluding(rosters.honest, rosterPositions.honest, [...model.guarantees.inEdges(actor)].map(edge => edge.from), decision('bribe-target', actor, i));
        if (target === null || model.subject(target).identityStatus !== 'accepted') continue;
        const offer = attempt(actor, 'bribe', () => {
          trustWork.bribesOffered++;
          return decision('bribe-accept', target, [actor, i]).chance(config.social.bribeAcceptance);
        });
        if (!offer.ok || !offer.value) continue;
        const proposal = attempt(target, 'proposeGuarantee', () => model.proposeGuarantee(target, actor));
        if (!proposal.ok) continue;
        const confirmed = attempt(actor, 'confirmGuarantee', () => model.confirmGuarantee(actor, proposal.value));
        if (!confirmed.ok) continue;
        // Bribes are paid off-protocol; they are recorded as payoff facts, not FACY transfers.
        bribes.set(truth.get(actor).operator, (bribes.get(truth.get(actor).operator) ?? 0) - config.social.bribePrice);
        bribes.set(truth.get(target).operator, (bribes.get(truth.get(target).operator) ?? 0) + config.social.bribePrice);
        trustWork.bribesAccepted++;
      }
    }
  }
  // Honest guarantors review whom their guaranteed subject invites while the invitation is frozen,
  // cancel a confirmed fake invitation and optionally leave the relation to escape the liability wave.
  function guardianWork() {
    if (!model.policy.invitationFreezeHours) return;
    for (const pending of pendingInvitations) {
      if (pending.cancelled || model.now - pending.createdAt >= model.policy.invitationFreezeHours) continue;
      for (const guarantor of [...model.guarantees.inEdges(pending.sponsor)].map(edge => edge.from)) {
        if (pending.cancelled || truth.get(guarantor).cohort !== 'honest' || model.subject(guarantor).identityStatus !== 'accepted') continue;
        if (!decision('invitation-review', guarantor, [pending.invitation]).chance(activityOf(guarantor).review)) continue;
        const look = attempt(guarantor, 'inspect', () => observe(pending.candidate.id, ['invitation-review', model.now, guarantor], pending.candidate));
        if (!look.ok || !look.value.suspicious) continue;
        if (config.social.verification) {
          const check = attempt(guarantor, 'verify', () => verified(guarantor, pending.candidate.id, 'invitation-review', pending.candidate));
          if (!check.ok || !check.value) {
            if (check.ok) trustWork.verificationsCleared++;
            continue;
          }
        }
        const cancel = attempt(guarantor, 'respond', () => model.cancelInvitation(guarantor, pending.invitation));
        if (!cancel.ok) continue;
        pending.cancelled = true;
        trustWork.invitationsCancelled++;
        if (!config.social.exitOnFraud) continue;
        const relation = model.guaranteeRelations().find(row => row.status === 'active' && row.guarantor === guarantor && row.guaranteed === pending.sponsor);
        if (relation && attempt(guarantor, 'respond', () => model.endGuarantee(guarantor, relation.id)).ok) trustWork.guardianExits++;
      }
    }
  }
  function responseChoice(actor, act) {
    return decision('inspection-response', actor, [act.subject, act.recordedAt]);
  }
  // One-step challenge; the verdict is an environment draw of declared accuracy using evaluator truth.
  function challenge(challenger, subject, onInvalidated, budget = { followUps: config.social.maxFollowUps }) {
    const rules = config.disputes;
    const result = attempt(challenger, 'challenge', () => {
      if (model.subject(subject).identityStatus !== 'accepted') throw new ProtocolRejection('challenge target is not accepted');
      if (model.subject(challenger).liquidFacy < rules.stake) throw new ProtocolRejection('insufficient challenge stake');
      if (openDisputes.some(dispute => dispute.subject === subject)) throw new ProtocolRejection('subject is already under dispute');
      const genuine = truth.get(subject).genuine;
      if (rules.procedure !== 'one-step') return { genuine, upheld: null };
      const correct = sensing.fork(JSON.stringify(['verdict', model.now, challenger, subject])).chance(rules.accuracy);
      return { genuine, upheld: genuine ? !correct : correct };
    });
    if (!result.ok) return;
    sanctions.challenges++;
    if (config.social.attentionFeedback) attention.add(challenger);
    const { genuine } = result.value;
    if (rules.procedure === 'chekharda-timed') {
      openTimedDispute(challenger, subject, genuine);
      return;
    }
    const upheld = rules.procedure === 'chekharda' ? ladder(challenger, subject, genuine) : result.value.upheld;
    if (!upheld && rules.procedure === 'one-step') model.penalize(challenger, { fine: rules.stake, halveXp: rules.loserHalvesXp });
    applyVerdict(challenger, subject, genuine, upheld, onInvalidated, budget);
    while (pendingClusters.length) clusterFollowUp(pendingClusters.shift(), onInvalidated);
  }
  // Sanctions after a verdict; the ladder procedures have already settled stakes and loser XP.
  function applyVerdict(challenger, subject, genuine, upheld, onInvalidated, budget) {
    const rules = config.disputes;
    if (!upheld) {
      sanctions.rejected++;
      if (!genuine) sanctions.missedFalse++;
      return;
    }
    sanctions.upheld++;
    sanctions[genuine ? 'wrongfulInvalidated' : 'falseInvalidated']++;
    spreadSuspicion(challenger, [...model.lineage.inEdges(subject)].map(edge => edge.from).flatMap(inviter => [inviter, ...[...model.lineage.outEdges(inviter)].map(edge => edge.to)]));
    const liable = [subject];
    const inviters = [...model.lineage.inEdges(subject)].map(edge => edge.from);
    if (rules.liability !== 'subject') liable.push(...[...model.guarantees.inEdges(subject)].map(edge => edge.from));
    if (['guarantors-and-inviter', 'inviter-chain'].includes(rules.liability)) liable.push(...inviters);
    if (rules.liability === 'inviter-chain') liable.push(...inviters.flatMap(inviter => [...model.guarantees.inEdges(inviter)].map(edge => edge.from)));
    // Chain mode: the whole false chain is cut; every liable party owes one coin per cut act.
    let fine = rules.fine;
    if (rules.fineMode === 'chain') {
      const voided = model.voidSelfIdChain(subject);
      sanctions.voidedActs += voided.acts;
      fine = Math.max(1, voided.acts);
    }
    for (const party of new Set(liable)) {
      if (model.subject(party).identityStatus !== 'accepted') continue;
      const reward = party === challenger ? 0 : Math.floor(Math.min(model.subject(party).liquidFacy, fine) * rules.rewardShare);
      if (reward > 0 && model.subject(challenger).identityStatus === 'accepted') model.transferFacy(party, challenger, reward, 'challenge-reward');
      model.penalize(party, { fine: fine - reward, halveXp: true });
    }
    const invalidated = [subject, ...(rules.excludeLiable ? [...new Set(liable)].filter(party => party !== subject && party !== challenger) : [])];
    for (const party of invalidated) {
      if (model.subject(party).identityStatus !== 'accepted') continue;
      model.invalidateIdentity(party);
      if (party !== subject) sanctions.excluded++;
      onInvalidated(party);
    }
    if (config.social.investigation && truth.get(challenger).cohort === 'honest') investigate(challenger, subject, onInvalidated, budget);
  }
  // Chekharda disputes. Entrants alternate sides; each needs more XP than the previous one and stakes
  // (1 + stakeGrowth) times more. Both the instant and the timed procedure use this record.
  function acceptedByXp() {
    return rosters.all.filter(id => model.subject(id).identityStatus === 'accepted')
      .sort((a, b) => model.subject(a).xp - model.subject(b).xp || rosterPositions.all.get(a) - rosterPositions.all.get(b));
  }
  function openDispute(challenger, subject, genuine) {
    const rules = config.disputes;
    // Public reputation prior: the trust-propagation percentile of the accused versus the challenger.
    let genuinePrior = 0.5;
    if (rules.reputationWeight > 0) {
      const pool = acceptedByXp();
      const trust = propagatedTrust(model.guarantees, model.roots);
      const rank = new Map(pool.sort((a, b) => trust.get(a) - trust.get(b) || rosterPositions.all.get(a) - rosterPositions.all.get(b)).map((id, index) => [id, pool.length > 1 ? index / (pool.length - 1) : 0.5]));
      genuinePrior = Math.min(0.95, Math.max(0.05, 0.5 + rules.reputationWeight * ((rank.get(subject) ?? 0.5) - (rank.get(challenger) ?? 0.5)) / 2));
    }
    return {
      id: 'dispute:' + disputeSequence++, challenger, subject, genuine, genuinePrior,
      coalitionSubject: truth.get(subject).cohort === 'attackers', close: neighborhood(subject, 2),
      entrants: [{ id: challenger, side: 'fraud', stake: rules.stake }], taken: new Set([challenger, subject]), lastMoveAt: model.now, frozen: [],
      proofSaysFraud: rules.evidence === 'public-proof' ? (truth.get(subject).genuine
        ? !sensing.fork(JSON.stringify(['public-proof', challenger, subject, model.now])).chance(rules.proofStrength)
        : sensing.fork(JSON.stringify(['public-proof', challenger, subject, model.now])).chance(rules.proofStrength)) : null,
    };
  }
  // Posterior that the accusation is true after a private signal of the given accuracy.
  function fraudBelief(dispute, accuracy, saysFraud, priorFraud = 1 - dispute.genuinePrior) {
    const fraud = (saysFraud ? accuracy : 1 - accuracy) * priorFraud;
    const real = (saysFraud ? 1 - accuracy : accuracy) * (1 - priorFraud);
    return fraud / (fraud + real);
  }
  // Prior that the accusation is true, blending public reputation with the opposed entrant's record.
  function candidatePrior(dispute) {
    const weight = config.disputes.trackRecordWeight;
    const base = 1 - dispute.genuinePrior;
    if (!weight) return base;
    const last = dispute.entrants.at(-1);
    const lastRight = reliability(last.id);
    return (1 - weight) * base + weight * (last.side === 'fraud' ? lastRight : 1 - lastRight);
  }
  function nextPosition(dispute) {
    const last = dispute.entrants.at(-1);
    return { side: last.side === 'fraud' ? 'genuine' : 'fraud', stake: Math.ceil(last.stake * (1 + config.disputes.stakeGrowth)), floor: model.subject(last.id).xp, below: last.stake };
  }
  function eligible(dispute, id, next) {
    const candidate = model.subject(id);
    return candidate.identityStatus === 'accepted' && candidate.xp > next.floor && !dispute.taken.has(id) && candidate.liquidFacy >= next.stake;
  }
  // Whether an eligible candidate takes the next position. Coalition members back the coalition side;
  // honest candidates follow their private signal (sharpened by evidence) and join when expected stake
  // gain plus civic value outweighs the stake and XP-halving risk.
  function willing(dispute, id, next, evidenceBoost) {
    const rules = config.disputes;
    if (truth.get(id).cohort === 'attackers') {
      return (next.side === 'genuine') === dispute.coalitionSubject
        && decision('ladder-defend', id, [dispute.id, dispute.entrants.length]).chance(activityOf(id).defend);
    }
    let pFraud;
    if (dispute.proofSaysFraud !== null) pFraud = fraudBelief(dispute, rules.proofStrength, dispute.proofSaysFraud, candidatePrior(dispute));
    else {
      const accuracy = Math.min(0.99, (dispute.close.has(id) ? rules.closeSignalAccuracy : rules.signalAccuracy) + evidenceBoost);
      const correct = sensing.fork(JSON.stringify(['ladder-signal', dispute.id, id, model.now])).chance(accuracy);
      pFraud = fraudBelief(dispute, accuracy, dispute.genuine ? !correct : correct, candidatePrior(dispute));
    }
    if ((next.side === 'fraud') !== (pFraud > 0.5)) return false;
    const confidence = Math.max(pFraud, 1 - pFraud);
    return confidence * next.below - (1 - confidence) * (next.stake + rules.xpValue * model.subject(id).xp / 2) + rules.civicValue > 0;
  }
  // Visiting order of candidates (ascending XP input) under the declared entrant choice.
  function candidateOrder(ids, dispute, round) {
    const choice = config.disputes.entrantChoice;
    if (choice === 'highest') return [...ids].reverse();
    if (choice === 'random') return decision('ladder-order', dispute.id, round).shuffle(ids);
    return ids;
  }
  function enter(dispute, id, next) {
    if (!attempt(id, 'challenge', () => true).ok) return false;
    dispute.taken.add(id);
    dispute.entrants.push({ id, side: next.side, stake: next.stake });
    dispute.lastMoveAt = model.now;
    sanctions.ladderEntries++;
    // Every entrant draws public attention to itself.
    if (config.social.attentionFeedback) attention.add(id);
    return true;
  }
  function councilReached(dispute) {
    return config.disputes.councilDepth > 0 && dispute.entrants.length >= config.disputes.councilDepth;
  }
  // Settles stakes and loser XP; returns true when the accusation is upheld.
  function settleDispute(dispute) {
    const rules = config.disputes;
    const { entrants } = dispute;
    let winner = entrants.at(-1).side;
    // Council intervention at the declared depth: one vote per active member; honest members vote their
    // belief, coalition members vote for the coalition side.
    if (councilReached(dispute)) {
      sanctions.councilInterventions++;
      let fraudVotes = 0;
      const members = model.council();
      for (const member of members) {
        let votesFraud;
        if (truth.get(member.id).cohort === 'attackers') votesFraud = !dispute.coalitionSubject;
        else if (dispute.proofSaysFraud !== null) votesFraud = fraudBelief(dispute, rules.proofStrength, dispute.proofSaysFraud) > 0.5;
        else {
          const accuracy = dispute.close.has(member.id) ? rules.closeSignalAccuracy : rules.signalAccuracy;
          const correct = sensing.fork(JSON.stringify(['council-signal', dispute.id, member.id])).chance(accuracy);
          votesFraud = fraudBelief(dispute, accuracy, dispute.genuine ? !correct : correct) > 0.5;
        }
        if (votesFraud) fraudVotes++;
      }
      winner = fraudVotes * 2 > members.length ? 'fraud' : 'genuine';
    }
    // Every winner takes the stake of the entrant directly below. A losing top entrant has no winner
    // above it; its stake is burned (an experiment assumption for an OPEN case). Losers lose half their XP.
    for (let k = entrants.length - 1; k >= 0; k--) {
      const upper = entrants[k + 1];
      const lower = entrants[k];
      if (lower.side === winner || model.subject(lower.id).identityStatus !== 'accepted') continue;
      const amount = Math.min(lower.stake, model.subject(lower.id).liquidFacy);
      if (upper && upper.side === winner) {
        if (amount > 0 && model.subject(upper.id).identityStatus === 'accepted') model.transferFacy(lower.id, upper.id, amount, 'ladder-settlement');
      } else if (!upper) model.penalize(lower.id, { fine: amount, halveXp: false });
    }
    for (const entrant of entrants) if (entrant.side !== winner) model.penalize(entrant.id, { fine: 0, halveXp: rules.loserHalvesXp });
    for (const entrant of entrants) {
      const record = disputeRecords.get(entrant.id) ?? { won: 0, lost: 0 };
      record[entrant.side === winner ? 'won' : 'lost']++;
      disputeRecords.set(entrant.id, record);
    }
    sanctions.ladderDepth = Math.max(sanctions.ladderDepth, entrants.length);
    dispute.defenders = winner === 'fraud' ? entrants.filter(entrant => entrant.side === 'genuine').map(entrant => entrant.id) : [];
    dispute.lead = entrants.filter(entrant => entrant.side === winner).reduce((top, entrant) => (model.subject(entrant.id).xp > model.subject(top.id).xp ? entrant : top)).id;
    return winner === 'fraud';
  }
  // Everyone who defended a proven fake becomes a suspect: the winning side's most senior member
  // challenges each of them (XP gate and stake permitting).
  function clusterFollowUp(dispute, onInvalidated) {
    if (!config.disputes.clusterFollowUp || !dispute.defenders?.length) return;
    for (const defender of dispute.defenders) {
      if (model.subject(defender).identityStatus !== 'accepted' || model.subject(dispute.lead).identityStatus !== 'accepted') continue;
      if (model.subject(dispute.lead).xp <= model.subject(defender).xp || truth.get(dispute.lead).cohort !== 'honest') continue;
      sanctions.clusterChallenges++;
      challenge(dispute.lead, defender, onInvalidated);
    }
  }
  // Instant procedure: everyone notices at once; candidates are scanned from the lowest eligible XP.
  function ladder(challenger, subject, genuine) {
    const rules = config.disputes;
    const dispute = openDispute(challenger, subject, genuine);
    const pool = acceptedByXp();
    for (let round = 1; round < rules.maxRounds && !councilReached(dispute); round++) {
      const next = nextPosition(dispute);
      let scanned = 0;
      let joined = null;
      for (const id of candidateOrder(pool, dispute, round)) {
        if (!eligible(dispute, id, next)) continue;
        if (++scanned > rules.maxScan) break;
        if (willing(dispute, id, next, 0)) { joined = id; break; }
      }
      if (joined === null || !enter(dispute, joined, next)) break;
    }
    const upheld = settleDispute(dispute);
    pendingClusters.push(dispute);
    return upheld;
  }
  // Timed procedure (owner rule): the dispute freezes the accused's unspent rights; the last move wins
  // after disputeWindowHours without a counter-entry; every entry restarts the clock.
  function openTimedDispute(challenger, subject, genuine) {
    const dispute = openDispute(challenger, subject, genuine);
    for (const act of model.selfIds()) {
      if (act.subject !== subject || act.status !== 'unspent' || act.disputeLock !== null) continue;
      model.freezeSelfId(act.id, dispute.id);
      dispute.frozen.push(act.id);
    }
    openDisputes.push(dispute);
  }
  function resolveTimedDispute(dispute) {
    openDisputes.splice(openDisputes.indexOf(dispute), 1);
    for (const id of dispute.frozen) {
      const act = model.selfId(id);
      if (act.disputeLock === dispute.id) model.unfreezeSelfId(id, dispute.id);
    }
    if (model.subject(dispute.subject).identityStatus !== 'accepted') {
      sanctions.disputesMooted++;
      return;
    }
    const upheld = settleDispute(dispute);
    sanctions.disputesResolved++;
    applyVerdict(dispute.challenger, dispute.subject, dispute.genuine, upheld, () => {}, { followUps: config.social.maxFollowUps });
    clusterFollowUp(dispute, () => {});
  }
  // Daily attention: the higher the dispute relative to the network, the more people notice it and the
  // more evidence surfaces. The lowest-XP willing noticer takes the next position.
  function timedDisputeWork() {
    const rules = config.disputes;
    if (!openDisputes.length) return;
    const accepted = acceptedByXp();
    const meanXp = accepted.reduce((sum, id) => sum + model.subject(id).xp, 0) / Math.max(1, accepted.length);
    for (const dispute of [...openDisputes]) {
      if (model.subject(dispute.subject).identityStatus !== 'accepted' || model.now - dispute.lastMoveAt >= rules.disputeWindowHours
        || councilReached(dispute) || dispute.entrants.length >= rules.maxRounds) {
        resolveTimedDispute(dispute);
        continue;
      }
      if (model.now === dispute.lastMoveAt) continue;
      for (let round = 0; round < rules.roundsPerDay && !councilReached(dispute) && dispute.entrants.length < rules.maxRounds; round++) {
        const height = Math.max(...dispute.entrants.map(entrant => model.subject(entrant.id).xp)) / Math.max(1, meanXp);
        const count = Math.min(accepted.length, Math.ceil(rules.noticeBase * accepted.length * (1 + height)));
        // Distinct uniform sample of noticers, visited in the declared order.
        const chooser = decision('dispute-notice', dispute.id, round);
        const picks = new Set();
        while (picks.size < count) picks.add(chooser.int(accepted.length));
        // Gossip: acquaintances of the accused and of every entrant hear of the dispute.
        if (config.social.gossipHops > 0) {
          const indexOf = new Map(accepted.map((id, index) => [id, index]));
          for (const party of [dispute.subject, ...dispute.entrants.map(entrant => entrant.id)]) {
            for (const id of neighborhood(party, config.social.gossipHops)) if (indexOf.has(id)) picks.add(indexOf.get(id));
          }
        }
        // Dispute regulars know each other and notice more often.
        if (rules.regularsNotice > 0) {
          accepted.forEach((id, index) => {
            if (disputeRecords.has(id) && decision('regular-notice', id, [dispute.id, round]).chance(rules.regularsNotice)) picks.add(index);
          });
        }
        const next = nextPosition(dispute);
        sanctions.disputeNotices += count;
        let joined = false;
        for (const index of candidateOrder([...picks].sort((a, b) => a - b), dispute, round)) {
          const id = accepted[index];
          if (!eligible(dispute, id, next) || !willing(dispute, id, next, rules.evidenceGain * height)) continue;
          joined = enter(dispute, id, next);
          break;
        }
        if (!joined) break;
      }
      if (councilReached(dispute)) resolveTimedDispute(dispute);
    }
  }
  // After a proven false identity, check who invited it, whom that inviter also invited, and whom it invited.
  function investigate(challenger, subject, onInvalidated, budget) {
    const inviters = [...model.lineage.inEdges(subject)].map(edge => edge.from);
    const suspects = [...inviters, ...inviters.flatMap(inviter => [...model.lineage.outEdges(inviter)].map(edge => edge.to)), ...[...model.lineage.outEdges(subject)].map(edge => edge.to)];
    for (const suspect of new Set(suspects)) {
      if (budget.followUps < 1 || suspect === challenger || suspect === subject || model.subject(suspect).identityStatus !== 'accepted' || model.subject(challenger).identityStatus !== 'accepted') continue;
      budget.followUps--;
      trustWork.followUps++;
      const check = attempt(challenger, 'verify', () => verified(challenger, suspect, 'investigation'));
      if (check.ok && check.value && model.subject(challenger).xp > model.subject(suspect).xp) challenge(challenger, suspect, onInvalidated, budget);
    }
  }
  // Second-stage check (call or meeting) with its own declared quality.
  function verified(actor, subject, context, identity = truth.get(subject)) {
    const rate = identity.genuine ? config.social.verificationFalsePositiveRate : config.social.verificationSensitivity;
    return sensing.fork(JSON.stringify(['verification', context, model.now, actor, subject])).chance(rate);
  }
  // Candidate acts are the phase-start unspent acts, minus own, already inspected and vetoed acts.
  // Honest choices use index arithmetic over that ordered list; draws match filtering the list.
  function inspectionWork(actors) {
    const list = model.selfIds().filter(act => act.status === 'unspent' && model.subject(act.subject).identityStatus === 'accepted');
    const available = new Map(list.map(act => [act.id, act]));
    const positions = new Map(list.map((act, index) => [act.id, index]));
    const bySubject = new Map();
    const byGuarantor = new Map();
    for (const act of list) {
      if (!bySubject.has(act.subject)) bySubject.set(act.subject, []);
      bySubject.get(act.subject).push(act.id);
      for (const guarantor of act.guarantors) {
        if (!byGuarantor.has(guarantor)) byGuarantor.set(guarantor, []);
        byGuarantor.get(guarantor).push(act.id);
      }
    }
    // Screening targets subjects in the lowest trust quantile by root-seeded propagation.
    let screenList = [];
    let screenPositions = new Map();
    if (config.social.screening || config.social.flowTracing || config.social.attentionFeedback) {
      const low = config.social.flowTracing ? flaggedByFlows() : new Set();
      for (const id of attention) if (model.subject(id).identityStatus === 'accepted') low.add(id);
      trustWork.flowFlagged = low.size;
      // Evaluator-only precision measurement; the defense never reads it.
      trustWork.flowFlaggedCoalition = [...low].filter(id => truth.get(id).cohort === 'attackers').length;
      if (config.social.screening) {
        const trust = propagatedTrust(model.guarantees, model.roots);
        const ranked = rosters.all.filter(id => model.subject(id).identityStatus === 'accepted').sort((a, b) => trust.get(a) - trust.get(b) || rosterPositions.all.get(a) - rosterPositions.all.get(b));
        for (const id of ranked.slice(0, Math.ceil(ranked.length * config.social.screeningQuantile))) low.add(id);
      }
      screenList = list.filter(act => low.has(act.subject));
      screenPositions = new Map(screenList.map((act, index) => [act.id, index]));
    }
    const vetoed = new Set();
    const invalidate = subject => {
      for (const id of bySubject.get(subject) ?? []) {
        available.delete(id);
        vetoed.add(id);
      }
    };
    const candidatesFor = (actor, cohort, inspected) => {
      if (cohort === 'attackers') {
        const candidates = [...available.values()].filter(act => act.subject !== actor && !inspected.has(act.id) && truth.get(act.subject).cohort !== 'attackers');
        const local = candidates.filter(act => model.policy.cancellationAuthority === 'snapshot'
          ? act.guarantors.includes(actor) : Boolean(model.guarantees.edge(actor, act.subject)));
        return { size: candidates.length, local, watched: [], pick: random => random.pick(candidates) };
      }
      const excluded = new Set([...(bySubject.get(actor) ?? []), ...vetoed]);
      for (const id of inspected) if (positions.has(id)) excluded.add(id);
      const authorized = model.policy.cancellationAuthority === 'snapshot' ? byGuarantor.get(actor) ?? []
        : [...model.guarantees.outEdges(actor)].flatMap(edge => bySubject.get(edge.to) ?? []).sort((a, b) => positions.get(a) - positions.get(b));
      const screenExcluded = [...excluded].filter(id => screenPositions.has(id)).map(id => screenPositions.get(id));
      const watched = [...(watchLists.get(actor) ?? [])].flatMap(subject => bySubject.get(subject) ?? []).filter(id => !excluded.has(id))
        .sort((a, b) => positions.get(a) - positions.get(b)).map(id => available.get(id));
      return {
        watched,
        size: list.length - excluded.size,
        local: authorized.filter(id => !excluded.has(id)).map(id => available.get(id)),
        pick: random => list[pickIndexExcluding(list.length, [...excluded].map(id => positions.get(id)), random)],
        screened: screenList.length - screenExcluded.length,
        pickScreened: random => screenList[pickIndexExcluding(screenList.length, screenExcluded, random)],
      };
    };
    for (const actor of actors) {
      if (model.subject(actor).identityStatus !== 'accepted') continue;
      const cohort = truth.get(actor).cohort;
      const inspected = seen.get(actor) ?? new Set();
      seen.set(actor, inspected);
      for (let i = 0, count = workCount(activityOf(actor).inspect, decision('inspection-count', actor)); i < count; i++) {
        const candidates = candidatesFor(actor, cohort, inspected);
        if (!candidates.size) break;
        const choice = decision('inspection-target', actor, i);
        const heard = candidates.watched.length > 0 && decision('gossip', actor, i).chance(config.social.gossipShare);
        if (heard) trustWork.gossipInspections++;
        const act = candidates.local.length && choice.chance(config.localInspectionShare) ? choice.pick(candidates.local)
          : heard ? choice.pick(candidates.watched)
          : candidates.screened > 0 && decision('screening', actor, i).chance(config.social.screeningShare) ? candidates.pickScreened(choice) : candidates.pick(choice);
        const inspection = attempt(actor, 'inspect', () => {
          inspected.add(act.id);
          return cohort === 'attackers' ? { suspicious: true } : observe(act.subject, ['act-inspection', model.now, actor, act.recordedAt]);
        });
        if (!inspection.ok) break;
        observations.inspections++;
        const observation = inspection.value;
        if (!observation.suspicious) continue;
        observations.suspicious++;
        if (config.social.verification && cohort === 'honest') {
          const check = attempt(actor, 'verify', () => verified(actor, act.subject, 'inspection'));
          if (!check.ok) break;
          if (!check.value) {
            trustWork.verificationsCleared++;
            continue;
          }
        }
        if (cohort === 'honest') spreadSuspicion(actor, [act.subject]);
        const veto = respondToObservation(model, actor, act, observation);
        if (veto.noAuthority) {
          observations.noVetoAuthority++;
          const eligible = model.subject(actor).xp > model.subject(act.subject).xp;
          if (eligible) observations.eligibleForUnmodeledXpChallenge++;
          if (eligible && config.disputes.enabled && decision('challenge', actor, [act.subject, act.recordedAt]).chance(activityOf(actor).challenge)) {
            challenge(actor, act.subject, invalidate);
          }
        }
        if (!veto.attempted || !responseChoice(actor, act).chance(activityOf(actor).respond)) continue;
        const response = attempt(actor, 'respond', () => model.cancelSelfId(actor, act.id));
        if (response.ok) {
          available.delete(act.id);
          vetoed.add(act.id);
        }
      }
    }
  }
  function admissionWork(actors) {
    for (const actor of actors) {
      const identity = truth.get(actor);
      for (let i = 0, count = workCount(activityOf(actor).invite, decision('invitation-count', actor)); i < count; i++) {
        const [source] = model.eligibleEmissions(actor);
        if (!source) break;
        let candidate = prepared.get(actor);
        if (!candidate) {
          const genuine = identity.cohort === 'honest' || config.scenario !== 'sybil-cone';
          const setup = attempt(actor, genuine ? 'recruitHuman' : 'fabricateIdentity', () => {
            const id = 'member:' + nextSubject++;
            return { id, cohort: identity.cohort, genuine, operator: genuine ? id : identity.operator };
          });
          if (!setup.ok) break;
          candidate = setup.value;
          prepared.set(actor, candidate);
        }
        const invitation = attempt(actor, 'invite', () => {
          if (model.size >= config.maxSubjects) throw new SimulationLimit('maxSubjects');
          return model.createInvitation(actor, source, candidate.id);
        });
        if (!invitation.ok) break;
        pendingInvitations.push({ invitation: invitation.value, candidate, sponsor: actor, createdAt: model.now });
        prepared.delete(actor);
      }
    }
    for (let i = pendingInvitations.length - 1; i >= 0; i--) {
      const pending = pendingInvitations[i];
      if (model.subject(pending.sponsor).identityStatus !== 'accepted' || pending.cancelled) {
        pendingInvitations.splice(i, 1);
        continue;
      }
      if (model.now - pending.createdAt < model.policy.invitationFreezeHours) continue;
      const accepted = attempt(pending.sponsor, 'acceptInvitation', () => {
        if (model.size >= config.maxSubjects) throw new SimulationLimit('maxSubjects');
        model.acceptInvitation(pending.invitation, pending.candidate.id);
        truth.set(pending.candidate.id, pending.candidate);
        enroll(pending.candidate.id);
      });
      if (accepted.ok) {
        pendingInvitations.splice(i, 1);
      }
    }
  }

  noteSuccess();
  try {
    if (config.initialTopology !== 'none') {
      const initial = generateGraph({ topology: config.initialTopology, size: ids.length, rootCount: 1, degree: config.initialDegree, seed: config.seed + ':initial' });
      for (const edge of initial.graph.edges()) establish(edge.from, edge.to, 'setup', true);
    }
    sample('initial');
    for (let day = 0; day < config.days; day++) {
      model.advanceTo(day * DAY);
      ({ activity, activePerturbations } = dayActivity(config, day));
      deviantActivity = deviantActivityAt(day);
      // Invalidated subjects cannot act; filtering after the shuffle keeps other actors' order.
      const actors = decision('actor-order').shuffle([...model.guarantees.nodeIds()]).filter(id => model.subject(id).identityStatus === 'accepted');
      for (const actor of actors) {
        if (!decision('self-id', actor).chance(activityOf(actor).selfId)) continue;
        // A false subject must fabricate fresh, never-reused media every day; its work is priced separately.
        attempt(actor, truth.get(actor).genuine ? 'selfId' : 'fakeSelfId', () => model.createSelfId(actor, model.registerArtifact(actor)));
      }
      const stillAccepted = () => actors.filter(id => model.subject(id).identityStatus === 'accepted');
      guaranteeWork(actors);
      briberyWork(actors);
      inspectionWork(actors);
      timedDisputeWork();
      guardianWork();
      admissionWork(stillAccepted());
      cashFlowWork(stillAccepted());
      for (const actor of stillAccepted()) {
        for (const act of model.eligibleEmissions(actor, model.policy.conversionMaturityHours)) {
          if (decision('collector-conversion', actor, model.selfId(act).recordedAt).chance(activityOf(actor).convert)) attempt(actor, 'convert', () => model.convertToCollector(actor, act));
        }
      }
      completedDays++;
      model.audit();
      sample('day-end');
    }
    model.advanceTo(config.days * DAY);
    ({ activity, activePerturbations } = dayActivity(config, config.days));
    deviantActivity = deviantActivityAt(config.days);
  } catch (error) {
    if (!(error instanceof SimulationLimit)) throw error;
    censoredReason = error.reason;
  }
  sanctions.disputesOpen = openDisputes.length;
  sample(censoredReason ? 'censored' : 'horizon');
  const identities = [...truth.values()];
  const attackerIds = identities.filter(identity => identity.cohort === 'attackers').map(identity => identity.id);
  const metrics = modelMetrics(model, { attackerIds });
  const acts = model.selfIds();
  const honestIds = identities.filter(identity => identity.cohort === 'honest').map(identity => identity.id);
  const connected = reachableNodes(model.guarantees, model.roots);
  const population = {
    initialSubjects: config.initialSize, initialAttackers: attackerCount, requestedAttackerShare: config.attackerShare,
    realizedInitialAttackerShare: attackerCount / config.initialSize,
    finalSubjects: model.size, finalAttackerSubjects: attackerIds.length, finalAttackerShare: attackerIds.length / model.size,
    humanOperators: new Set(identities.map(identity => identity.operator)).size,
    attackerOperators: new Set(identities.filter(identity => identity.cohort === 'attackers').map(identity => identity.operator)).size,
    falseSubjects: identities.filter(identity => !identity.genuine).length,
  };
  const money = Object.fromEntries(COHORTS.map(cohort => {
    const ownActs = acts.filter(act => truth.get(act.subject).cohort === cohort);
    const ownSubjects = model.subjects().filter(subject => truth.get(subject.id).cohort === cohort);
    return [cohort, {
      inviteBurns: ownActs.filter(act => act.disposition === 'invitation').length,
      vetoBurns: ownActs.filter(act => act.status === 'cancelled').length,
      guaranteeFeesPaid: model.guaranteeRelations().filter(relation => relation.activatedAt !== null && truth.get(relation.guarantor).cohort === cohort).length * config.policy.guaranteeFee,
      linkBreakFeesPaid: model.events().filter(event => event.type === 'guarantee-ended' && truth.get(event.actor).cohort === cohort).length,
      convertedRewards: ownActs.filter(act => act.status === 'converted').length,
      liquidFacy: ownSubjects.reduce((sum, subject) => sum + subject.liquidFacy, 0),
      debt: ownSubjects.reduce((sum, subject) => sum + subject.debt, 0),
    }];
  }));
  const council = new Set(model.council().map(member => member.id));
  const unspent = new Map();
  for (const act of acts) if (act.status === 'unspent') unspent.set(act.subject, (unspent.get(act.subject) ?? 0) + 1);
  const emptyFacts = () => ({
    operators: 0, subjects: 0, acceptedSubjects: 0, invalidatedSubjects: 0, falseSubjects: 0,
    liquidFacy: 0, emitterFacy: 0, debt: 0, falseLiquidFacy: 0, falseDebt: 0, xp: 0, councilSeats: 0, effort: 0,
    convertedRewards: 0, finesCollected: 0, finesAsDebt: 0, halvings: 0, rewardsReceived: 0, bribesPaid: 0, bribesReceived: 0,
  });
  const agents = Object.fromEntries(COHORTS.map(cohort => [cohort, { conformist: emptyFacts(), deviant: emptyFacts(), recruit: emptyFacts() }]));
  const operatorsSeen = new Set();
  for (const subject of model.subjects()) {
    const identity = truth.get(subject.id);
    const facts = agents[identity.cohort][groupOf(identity)];
    if (!operatorsSeen.has(identity.operator)) {
      operatorsSeen.add(identity.operator);
      facts.operators++;
      facts.effort += (operatorEffort.get(identity.operator) ?? 0) / 1e6;
      const balance = bribes.get(identity.operator) ?? 0;
      facts[balance < 0 ? 'bribesPaid' : 'bribesReceived'] += Math.abs(balance);
    }
    facts.subjects++;
    facts[subject.identityStatus === 'accepted' ? 'acceptedSubjects' : 'invalidatedSubjects']++;
    if (!identity.genuine) {
      facts.falseSubjects++;
      facts.falseLiquidFacy += subject.liquidFacy;
      facts.falseDebt += subject.debt;
    }
    facts.liquidFacy += subject.liquidFacy;
    facts.emitterFacy += unspent.get(subject.id) ?? 0;
    facts.debt += subject.debt;
    facts.xp += subject.xp;
    if (council.has(subject.id)) facts.councilSeats++;
  }
  for (const act of acts) if (act.status === 'converted') agents[truth.get(act.subject).cohort][groupOf(truth.get(act.subject))].convertedRewards++;
  for (const event of model.events()) {
    if (event.type === 'penalty-applied') {
      const facts = agents[truth.get(event.subject).cohort][groupOf(truth.get(event.subject))];
      facts.finesCollected += event.collected;
      facts.finesAsDebt += event.debtAdded;
      if (event.halveXp) facts.halvings++;
    } else if (event.type === 'facy-transferred') {
      agents[truth.get(event.to).cohort][groupOf(truth.get(event.to))].rewardsReceived += event.amount;
    }
  }
  for (const groups of Object.values(agents)) for (const facts of Object.values(groups)) facts.effort = Math.round(facts.effort * 1e6) / 1e6;
  const system = {
    supply: metrics.ledger.supply, burned: metrics.ledger.burned,
    falseLiquidFacy: model.subjects().filter(subject => !truth.get(subject.id).genuine).reduce((sum, subject) => sum + subject.liquidFacy, 0),
    falseConvertedRewards: acts.filter(act => act.status === 'converted' && !truth.get(act.subject).genuine).length,
    falseAcceptedSubjects: model.subjects().filter(subject => subject.identityStatus === 'accepted' && !truth.get(subject.id).genuine).length,
    councilSeats: council.size,
    councilAttackerSeats: [...council].filter(id => truth.get(id).cohort === 'attackers').length,
    // Fraud budget: share of all minted rights created by false identities, and share of circulating
    // supply (liquid plus unspent Emitter rights) that false identities still hold.
    falseMintedShare: acts.length ? acts.filter(act => !truth.get(act.subject).genuine).length / acts.length : 0,
    falseCirculatingShare: metrics.ledger.supply ? (model.subjects().filter(subject => !truth.get(subject.id).genuine).reduce((sum, subject) => sum + subject.liquidFacy, 0)
      + acts.filter(act => act.status === 'unspent' && !truth.get(act.subject).genuine).length) / metrics.ledger.supply : 0,
    sanctions: { ...sanctions },
    trust: { ...trustWork },
  };
  return {
    schema: 'facety-experiment/v1',
    config, randomness: RANDOMNESS_POLICY, provenance: provenance(), assumptions: [...EXPERIMENT_ASSUMPTIONS],
    outcome: {
      success: firstSuccess !== null ? true : censoredReason ? null : false,
      firstSuccess, censored: censoredReason !== null, censoredReason, completedDays, elapsedHours: model.now,
      criterion: config.successCriterion, horizonDays: config.days,
    },
    population,
    effort: effort.audit(),
    observations, rejections, money, agents, system,
    impact: {
      falseConversions: acts.filter(act => act.status === 'converted' && !truth.get(act.subject).genuine).length,
      falseEmissionsCancelled: acts.filter(act => act.status === 'cancelled' && !truth.get(act.subject).genuine).length,
      honestEmissionsCancelled: acts.filter(act => act.status === 'cancelled' && truth.get(act.subject).cohort === 'honest').length,
      honestDisconnected: honestIds.filter(id => !connected.has(id)).length,
      honestConnectedFraction: honestIds.length ? honestIds.filter(id => connected.has(id)).length / honestIds.length : null,
      attackerLiquidFacy: model.subjects().filter(subject => attackerIds.includes(subject.id)).reduce((sum, subject) => sum + subject.liquidFacy, 0),
    },
    metrics, history,
    ...(config.includeState ? { state: { subjects: model.subjects(), selfIds: acts, truth: identities, guarantees: model.guarantees.toJSON(), lineage: model.lineage.toJSON(), roots: [...model.roots] } } : {}),
  };
}
