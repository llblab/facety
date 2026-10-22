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
  honest: Object.freeze({ selfId: 0.8, invite: 0.05, guarantee: 0.3, inspect: 1, respond: 0.9, challenge: 0, convert: 1 }),
  attackers: Object.freeze({ selfId: 1, invite: 0.4, guarantee: 2, inspect: 0, respond: 0, challenge: 0, convert: 1 }),
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
  enabled: false, accuracy: 0.9, stake: 0, fine: 5, liability: 'guarantors', rewardShare: 0.5, loserHalvesXp: true, excludeLiable: false,
});
export const LIABILITY_POLICIES = Object.freeze(['subject', 'guarantors', 'guarantors-and-inviter']);
export const DEFAULT_DEVIANTS = Object.freeze({ share: 0, honest: null, attackers: null });
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
  'When enabled, disputes are one-step public challenges: an observer with more effective XP than the act owner and a suspicious observation may challenge; an environment verdict of declared accuracy invalidates the subject and sanctions declared liable parties, or sanctions the challenger. Chekharda escalation, Council review and appeals are not modeled.',
  'Deviants are a seeded subset of a cohort\'s initial operators, with the fake subjects they control, following a declared alternative activity profile; labels are evaluator-only. Recruited genuine people follow their cohort profile.',
  'Payoff facts are protocol quantities per operator group (initial conformists, initial deviants, later recruits); their utility weights are supplied separately by an analysis, never inferred.',
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
      if (['selfId', 'respond', 'challenge', 'convert'].includes(action)) probability(rate, action);
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
  const nested = { activity: {}, budgets: {}, weights: {}, policy: {}, ablations: {}, perturbations: [], disputes: {}, deviants: {} };
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
  return (id, context) => Object.freeze({ suspicious: random.fork(JSON.stringify([id, context])).chance(truth.get(id).genuine ? config.falsePositiveRate : config.sensitivity) });
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
  const rosters = { all: [], attackers: [] };
  const rosterPositions = { all: new Map(), attackers: new Map() };
  const enroll = id => {
    for (const roster of truth.get(id).cohort === 'attackers' ? ['all', 'attackers'] : ['all']) {
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
  const sanctions = { challenges: 0, upheld: 0, rejected: 0, falseInvalidated: 0, wrongfulInvalidated: 0, excluded: 0, missedFalse: 0 };
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
          target = children.length ? choice.pick(children) : pickExcluding(rosters.all, rosterPositions.all, excluded, choice);
        }
        if (target !== null) establish(actor, target, 'maintenance', false, i);
      }
    }
  }
  function responseChoice(actor, act) {
    return decision('inspection-response', actor, [act.subject, act.recordedAt]);
  }
  // One-step challenge; the verdict is an environment draw of declared accuracy using evaluator truth.
  function challenge(challenger, subject, onInvalidated) {
    const rules = config.disputes;
    const result = attempt(challenger, 'challenge', () => {
      if (model.subject(subject).identityStatus !== 'accepted') throw new ProtocolRejection('challenge target is not accepted');
      if (model.subject(challenger).liquidFacy < rules.stake) throw new ProtocolRejection('insufficient challenge stake');
      const genuine = truth.get(subject).genuine;
      const correct = sensing.fork(JSON.stringify(['verdict', model.now, challenger, subject])).chance(rules.accuracy);
      return { genuine, upheld: genuine ? !correct : correct };
    });
    if (!result.ok) return;
    sanctions.challenges++;
    const { genuine, upheld } = result.value;
    if (!upheld) {
      sanctions.rejected++;
      if (!genuine) sanctions.missedFalse++;
      model.penalize(challenger, { fine: rules.stake, halveXp: rules.loserHalvesXp });
      return;
    }
    sanctions.upheld++;
    sanctions[genuine ? 'wrongfulInvalidated' : 'falseInvalidated']++;
    const liable = [subject];
    if (rules.liability !== 'subject') liable.push(...[...model.guarantees.inEdges(subject)].map(edge => edge.from));
    if (rules.liability === 'guarantors-and-inviter') liable.push(...[...model.lineage.inEdges(subject)].map(edge => edge.from));
    for (const party of new Set(liable)) {
      if (model.subject(party).identityStatus !== 'accepted') continue;
      const reward = Math.floor(Math.min(model.subject(party).liquidFacy, rules.fine) * rules.rewardShare);
      if (reward > 0 && party !== challenger && model.subject(challenger).identityStatus === 'accepted') model.transferFacy(party, challenger, reward);
      model.penalize(party, { fine: rules.fine - reward, halveXp: true });
    }
    const invalidated = [subject, ...(rules.excludeLiable ? [...new Set(liable)].filter(party => party !== subject && party !== challenger) : [])];
    for (const party of invalidated) {
      if (model.subject(party).identityStatus !== 'accepted') continue;
      model.invalidateIdentity(party);
      if (party !== subject) sanctions.excluded++;
      onInvalidated(party);
    }
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
        return { size: candidates.length, local, pick: random => random.pick(candidates) };
      }
      const excluded = new Set([...(bySubject.get(actor) ?? []), ...vetoed]);
      for (const id of inspected) if (positions.has(id)) excluded.add(id);
      const authorized = model.policy.cancellationAuthority === 'snapshot' ? byGuarantor.get(actor) ?? []
        : [...model.guarantees.outEdges(actor)].flatMap(edge => bySubject.get(edge.to) ?? []).sort((a, b) => positions.get(a) - positions.get(b));
      return {
        size: list.length - excluded.size,
        local: authorized.filter(id => !excluded.has(id)).map(id => available.get(id)),
        pick: random => list[pickIndexExcluding(list.length, [...excluded].map(id => positions.get(id)), random)],
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
        const act = candidates.local.length && choice.chance(config.localInspectionShare) ? choice.pick(candidates.local) : candidates.pick(choice);
        const inspection = attempt(actor, 'inspect', () => {
          inspected.add(act.id);
          return cohort === 'attackers' ? { suspicious: true } : observe(act.subject, ['act-inspection', model.now, actor, act.recordedAt]);
        });
        if (!inspection.ok) break;
        observations.inspections++;
        const observation = inspection.value;
        if (!observation.suspicious) continue;
        observations.suspicious++;
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
        pendingInvitations.push({ invitation: invitation.value, candidate, sponsor: actor });
        prepared.delete(actor);
      }
    }
    for (let i = pendingInvitations.length - 1; i >= 0; i--) {
      const pending = pendingInvitations[i];
      if (model.subject(pending.sponsor).identityStatus !== 'accepted') {
        pendingInvitations.splice(i, 1);
        continue;
      }
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
        attempt(actor, 'selfId', () => model.createSelfId(actor, model.registerArtifact(actor)));
      }
      const stillAccepted = () => actors.filter(id => model.subject(id).identityStatus === 'accepted');
      guaranteeWork(actors);
      inspectionWork(actors);
      admissionWork(stillAccepted());
      for (const actor of stillAccepted()) {
        for (const act of model.eligibleEmissions(actor, 7 * DAY)) {
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
    convertedRewards: 0, finesCollected: 0, finesAsDebt: 0, halvings: 0, rewardsReceived: 0,
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
    sanctions: { ...sanctions },
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
