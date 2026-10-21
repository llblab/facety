// Owns: Cohort scheduling, noisy observations and scenario evaluation; excludes a truth court.
import { FacetyModel, DAY, policyFrom, ProtocolRejection } from './model.mjs';
import { Random, RANDOM_GENERATOR } from './random.mjs';
import { generateGraph, TOPOLOGIES } from './generators.mjs';
import { EffortLedger, DEFAULT_WEIGHTS, effortWeights, COHORTS, SimulationLimit } from './effort.mjs';
import { modelMetrics } from './metrics.mjs';
import { measureNetwork, measureWork } from './observables.mjs';
import { reachableNodes } from './proofs.mjs';

export const SCENARIOS = Object.freeze(['honest-growth', 'sybil-cone', 'real-cartel']);
export const RANDOMNESS_POLICY = Object.freeze({ generator: RANDOM_GENERATOR, decisions: 'decision-keyed-v1' });
export const DEFAULT_ACTIVITY = Object.freeze({
  honest: Object.freeze({ selfId: 0.8, invite: 0.05, guarantee: 0.3, inspect: 1, respond: 0.9, convert: 1 }),
  attackers: Object.freeze({ selfId: 1, invite: 0.4, guarantee: 2, inspect: 0, respond: 0, convert: 1 }),
});
const DEFAULTS = Object.freeze({
  scenario: 'sybil-cone', seed: 'facety', initialSize: 30, attackerShare: 0.1,
  days: 30, initialTopology: 'random', initialDegree: 3,
  localInspectionShare: 0.8, sensitivity: 0.8, falsePositiveRate: 0.01,
  maxSubjects: 2000, maxActions: 500_000, targetFalseConversions: 1,
  successCriterion: 'false-liquidity', includeState: false,
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
      if (['selfId', 'respond', 'convert'].includes(action)) probability(rate, action);
    }
    return [cohort, Object.freeze({ ...partial })];
  })));
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
  const nested = { activity: {}, budgets: {}, weights: {}, policy: {}, perturbations: [] };
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
  config.budgets = Object.freeze(mergeRecord({ honest: 100_000, attackers: 100_000 }, config.budgets, 'budgets'));
  config.weights = effortWeights(mergeRecord(DEFAULT_WEIGHTS, config.weights, 'weights'));
  config.policy = policyFrom(config.policy);
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
  const model = new FacetyModel({ genesis: ids, policy: config.policy });
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

  function decision(channel, actor = '', slot = 0) {
    return random.fork(JSON.stringify([RANDOMNESS_POLICY.decisions, model.now, channel, actor, slot]));
  }

  function attempt(actor, action, operation, phase = 'maintenance') {
    const ticket = effort.begin(truth.get(actor).cohort, action, phase);
    if (!ticket) return { ok: false, reason: 'budget-denied' };
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
    const council = model.council();
    const success = config.successCriterion === 'false-liquidity'
      ? falseConversionCount >= config.targetFalseConversions
      : council.filter(member => truth.get(member.id).cohort === 'attackers').length > council.length / 2;
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
    });
    previousSampleCosts = costs;
    previousCouncilIds = network.council.memberIds;
  }
  function guaranteeWork(actors) {
    for (const actor of actors) {
      const cohort = truth.get(actor).cohort;
      for (let i = 0, count = workCount(activity[cohort].guarantee, decision('guarantee-count', actor)); i < count; i++) {
        let candidates = [...model.guarantees.nodeIds()].filter(id => id !== actor && !model.guarantees.edge(actor, id));
        if (cohort === 'attackers') candidates = candidates.filter(id => truth.get(id).cohort === 'attackers');
        else {
          const children = candidates.filter(id => Boolean(model.lineage.edge(actor, id)));
          if (children.length) candidates = children;
        }
        if (candidates.length) establish(actor, decision('guarantee-target', actor, i).pick(candidates), 'maintenance', false, i);
      }
    }
  }
  function responseChoice(actor, act) {
    return decision('inspection-response', actor, [act.subject, act.recordedAt]);
  }
  function inspectionWork(actors) {
    const available = new Map(model.selfIds().filter(act => act.status === 'unspent').map(act => [act.id, act]));
    for (const actor of actors) {
      const cohort = truth.get(actor).cohort;
      const inspected = seen.get(actor) ?? new Set();
      seen.set(actor, inspected);
      for (let i = 0, count = workCount(activity[cohort].inspect, decision('inspection-count', actor)); i < count; i++) {
        let candidates = [...available.values()].filter(act => act.subject !== actor && !inspected.has(act.id));
        if (cohort === 'attackers') candidates = candidates.filter(act => truth.get(act.subject).cohort !== 'attackers');
        if (!candidates.length) break;
        const local = candidates.filter(act => model.policy.cancellationAuthority === 'snapshot'
          ? act.guarantors.includes(actor) : Boolean(model.guarantees.edge(actor, act.subject)));
        const choice = decision('inspection-target', actor, i);
        if (local.length && choice.chance(config.localInspectionShare)) candidates = local;
        const act = choice.pick(candidates);
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
          if (model.subject(actor).xp > model.subject(act.subject).xp) observations.eligibleForUnmodeledXpChallenge++;
        }
        if (!veto.attempted || !responseChoice(actor, act).chance(activity[cohort].respond)) continue;
        const response = attempt(actor, 'respond', () => model.cancelSelfId(actor, act.id));
        if (response.ok) available.delete(act.id);
      }
    }
  }
  function admissionWork(actors) {
    for (const actor of actors) {
      const identity = truth.get(actor);
      for (let i = 0, count = workCount(activity[identity.cohort].invite, decision('invitation-count', actor)); i < count; i++) {
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
      const accepted = attempt(pending.sponsor, 'acceptInvitation', () => {
        if (model.size >= config.maxSubjects) throw new SimulationLimit('maxSubjects');
        model.acceptInvitation(pending.invitation, pending.candidate.id);
        truth.set(pending.candidate.id, pending.candidate);
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
      const actors = decision('actor-order').shuffle([...model.guarantees.nodeIds()]);
      for (const actor of actors) {
        if (!decision('self-id', actor).chance(activity[truth.get(actor).cohort].selfId)) continue;
        attempt(actor, 'selfId', () => model.createSelfId(actor, model.registerArtifact(actor)));
      }
      guaranteeWork(actors);
      inspectionWork(actors);
      admissionWork(actors);
      for (const actor of actors) {
        for (const act of model.eligibleEmissions(actor, 7 * DAY)) {
          if (decision('collector-conversion', actor, model.selfId(act).recordedAt).chance(activity[truth.get(actor).cohort].convert)) attempt(actor, 'convert', () => model.convertToCollector(actor, act));
        }
      }
      completedDays++;
      model.audit();
      sample('day-end');
    }
    model.advanceTo(config.days * DAY);
    ({ activity, activePerturbations } = dayActivity(config, config.days));
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
      guaranteeFeesPaid: model.guaranteeRelations().filter(relation => relation.status === 'active' && truth.get(relation.guarantor).cohort === cohort).length * config.policy.guaranteeFee,
      convertedRewards: ownActs.filter(act => act.status === 'converted').length,
      liquidFacy: ownSubjects.reduce((sum, subject) => sum + subject.liquidFacy, 0),
      debt: ownSubjects.reduce((sum, subject) => sum + subject.debt, 0),
    }];
  }));
  return {
    schema: 'facety-experiment/v1',
    config, randomness: RANDOMNESS_POLICY, assumptions: [...EXPERIMENT_ASSUMPTIONS],
    outcome: {
      success: firstSuccess !== null ? true : censoredReason ? null : false,
      firstSuccess, censored: censoredReason !== null, censoredReason, completedDays, elapsedHours: model.now,
      criterion: config.successCriterion, horizonDays: config.days,
    },
    population,
    effort: effort.audit(),
    observations, rejections, money,
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
