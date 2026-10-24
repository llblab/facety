// Owns: Experiment defaults, normalization and scheduled activity views; excludes scheduling, observations and random draws.
import { policyFrom, ablationsFrom, DEFAULT_ABLATIONS } from './model.mjs';
import { RANDOM_GENERATOR } from './random.mjs';
import { TOPOLOGIES } from './generators.mjs';
import { EffortLedger, DEFAULT_WEIGHTS, effortWeights, COHORTS } from './effort.mjs';
import { STAKE_BACKINGS } from './dispute-stakes.mjs';
import { SUBDAY_RANDOMNESS } from './activity-schedule.mjs';
import { canonicalJson } from './provenance.mjs';

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
  days: 30, stepHours: 24, actorProfiles: [], invitationReviewTiming: 'daily-slot', invitationEvidence: 'independent', initialTopology: 'random', initialDegree: 3,
  localInspectionShare: 0.8, sensitivity: 0.8, falsePositiveRate: 0.01,
  maxSubjects: 2000, maxActions: 500_000, targetFalseConversions: 1,
  successCriterion: 'false-liquidity', includeState: false,
});
// Optional dispute references: one-step environment verdicts or instant/timed ladders with a depth-triggered
// equal-vote Council. None supplies a selected merits, referral, conflict or appeal procedure.
export const DEFAULT_DISPUTES = Object.freeze({
  enabled: false, accuracy: 0.9, stake: 1, fine: 5, liability: 'inviter-chain', rewardShare: 0.5, loserHalvesXp: true, excludeLiable: false,
  fineMode: 'chain', stakeBacking: 'unsecured',
  // Chekharda ladder: each entrant needs more XP than the previous one and stakes (1 + stakeGrowth) times more;
  // the last unopposed side wins and every winner takes the stake of the entrant directly below.
  procedure: 'one-step', stakeGrowth: 0.2, signalAccuracy: 0.7, closeSignalAccuracy: 0.9, xpValue: 0.05, maxRounds: 60, maxScan: 60,
  councilDepth: 0, reputationWeight: 0,
  // Timed Chekharda: the last move wins after disputeWindowHours without a counter-entry; attention grows
  // with the dispute's height (largest entrant XP over mean network XP), and so does available evidence.
  disputeWindowHours: 168, noticeBase: 0.02, evidenceGain: 0.1, civicValue: 0,
  // Who takes the next position among willing candidates, and how many entries a timed dispute can
  // take per day (owner: many entrants a day, XP jumping by multiples toward the most senior people).
  entrantChoice: 'lowest', roundsPerDay: 1, entryTiming: 'daily-quota',
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
  'Defense receives noisy observations, authorized guarantor vetoes and optional explicitly configured dispute references; external evidence-package sponsorship is not modeled.',
  'Artifact reuse is an explicit policy: registration-only retains the legacy same-subject hour-24 replay; once-per-subject is an unselected stronger reference. Hashless artifacts and media authenticity remain abstract.',
  'Council majority means ever holding more than half of current seats, not a successful corrupt Council verdict.',
  'Self-ID, guarantee work, inspections/responses, invitations/acceptance and conversion run in that daily order; actor order is seeded.',
  'Resource safety caps censor unresolved trials. Finite economic budgets are scenario constraints, not censoring.',
  'These are fixed reference strategies, not optimized worst-case attackers. Repeated observations are conditionally independent noisy draws.',
  'Random draws are keyed by logical decision/observation context, not a shared consumed stream; seed replay requires the recorded randomness policy.',
  'Scheduled perturbations alter daily activity only, not protocol rules, genesis trust or automatic counterparty matching.',
  'XP Gini and normalized XP shares are undefined (null) when total effective XP is zero; equal positive XP has Gini zero.',
  'Configured ablations are counterfactual mechanism removals for evidence experiments; any enabled ablation is not Facety protocol behavior.',
  'With ladder procedures, belief-sensitive candidates compare expected stake gain against stake and XP risk; coalition backing is a fixed role-specific stress script, not a demonstrated individual best response. A depth-triggered Council uses current active membership, equal votes, no recusals/abstentions and ties against the accusation; referral and merits procedures remain OPEN. Legacy stakes are unsecured promises collected up to remaining liquid funds, not escrowed winnings.',
  'Ladder maxRounds/maxScan are experimental termination references, not computational censors or selected finality: a cap can close a case before the response window. Recorded resolution reasons distinguish caps, scans, failed entry, timeout and Council intervention.',
  'Timed-dispute locks freeze the opening snapshot of the accused\'s unspent rights only; subsequently created rights are not automatically locked in this reference.',
  'Stake backing is an OPEN reference: unsecured (default) promises collect only remaining liquid funds; reserved moves each stake into model custody until loss, win, moot refund or the retained pending horizon. Reserved collateral is protected from unrelated fines; known invalidated accounts can passively receive refunds/winnings, without new spending rights. Unpaid unsecured stakes are not debt.',
  'The default dispute procedure is one-step: an eligible suspicious observer may challenge and an environment verdict of declared accuracy determines sanctions. Instant/timed Chekharda are optional references; no procedure here implements reasoned evidence admission, appeals or voluntary self-reporting.',
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
  if (!STAKE_BACKINGS.includes(disputes.stakeBacking)) throw new Error('unknown disputes.stakeBacking');
  if (!['one-step', 'chekharda', 'chekharda-timed'].includes(disputes.procedure)) throw new Error('disputes.procedure must be one-step, chekharda or chekharda-timed');
  integer(disputes.disputeWindowHours, 'disputes.disputeWindowHours', 1, 10000);
  integer(disputes.roundsPerDay, 'disputes.roundsPerDay', 1, 1000);
  if (!['daily-quota', 'each-tick'].includes(disputes.entryTiming)) throw new Error('unknown dispute entryTiming');
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

export function dayActivity(config, day) {
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

export function experimentRandomness(config) {
  const base = config.stepHours === 24 ? RANDOMNESS_POLICY : SUBDAY_RANDOMNESS;
  const variants = {};
  if (config.disputes.entryTiming === 'each-tick') variants.disputeSchedule = 'one-opportunity-per-tick-v1';
  if (config.invitationReviewTiming === 'first-attended') variants.invitationReviewSchedule = 'first-attended-pair-day-v1';
  if (config.invitationEvidence === 'shared-target') variants.invitationEvidence = 'shared-target-first-stage-v1';
  return Object.keys(variants).length ? { ...base, ...variants } : base;
}

export function combineExperimentRandomness(policies) {
  const distinct = [...new Map([...policies].map(policy => [canonicalJson(policy), policy])).values()].sort((a, b) => canonicalJson(a) < canonicalJson(b) ? -1 : 1);
  if (distinct.length === 1) return distinct[0];
  return { generator: RANDOM_GENERATOR, decisions: 'decision-keyed-mixed-subday-v1', policies: distinct };
}

function actorProfilesFrom(profiles, config) {
  if (!Array.isArray(profiles)) throw new TypeError('actorProfiles must be an array');
  if (profiles.length && config.stepHours === 24) throw new Error('actorProfiles require a sub-day stepHours');
  const ids = new Set();
  return Object.freeze(profiles.map(profile => {
    const value = mergeRecord({ subject: undefined, activity: {}, transactionHours: null, attentionHours: null }, profile, 'actor profile');
    if (typeof value.subject !== 'string' || !value.subject.length || ids.has(value.subject)) throw new Error('actor profile subjects must be nonempty and distinct');
    ids.add(value.subject);
    const activity = activityOverrides({ honest: value.activity }).honest;
    const hours = key => {
      if (value[key] === null) return null;
      if (!Array.isArray(value[key])) throw new TypeError(key + ' must be an array or null');
      const copy = [...value[key]];
      for (const hour of copy) if (!Number.isSafeInteger(hour) || hour < 0 || hour >= config.days * 24 || hour % config.stepHours) throw new RangeError(key + ' must contain decision hours inside the horizon');
      return Object.freeze([...new Set(copy)].sort((a, b) => a - b));
    };
    return Object.freeze({ subject: value.subject, activity, transactionHours: hours('transactionHours'), attentionHours: hours('attentionHours') });
  }));
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
  if (![4, 6, 24].includes(config.stepHours)) throw new RangeError('stepHours must be 4, 6 or 24');
  if (!['daily-slot', 'first-attended'].includes(config.invitationReviewTiming)) throw new Error('invitationReviewTiming must be daily-slot or first-attended');
  if (config.invitationReviewTiming === 'first-attended' && config.stepHours === 24) throw new Error('first-attended invitation review requires sub-day stepHours');
  if (!['independent', 'shared-target'].includes(config.invitationEvidence)) throw new Error('invitationEvidence must be independent or shared-target');
  config.actorProfiles = actorProfilesFrom(config.actorProfiles, config);
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
  if (config.disputes.entryTiming === 'each-tick' && (config.stepHours === 24 || !config.disputes.enabled || config.disputes.procedure !== 'chekharda-timed' || config.disputes.roundsPerDay !== 24 / config.stepHours)) throw new Error('each-tick requires sub-day timed disputes and roundsPerDay = 24 / stepHours');
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
