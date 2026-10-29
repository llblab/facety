// Owns: Explicit experiment dispatch, cohort scheduling/observations and scenario evaluation; excludes config ownership and a truth court.
import { FacetyModel, DAY, DEFAULT_ABLATIONS, ProtocolRejection } from './model.mjs';
import { Random, pickIndexExcluding } from './random.mjs';
import { generateGraph } from './generators.mjs';
import { EffortLedger, COHORTS, SimulationLimit } from './effort.mjs';
import { modelMetrics } from './metrics.mjs';
import { measureNetwork, measureWork } from './observables.mjs';
import { reachableNodes } from './proofs.mjs';
import { propagatedTrust, graphNeighborhood } from './social-graph.mjs';
import { provenance } from './provenance.mjs';
import { DisputeStakes } from './dispute-stakes.mjs';
import { challengeAccess, settleOneStepPosition, enforceIdentityVerdict } from './disputes.mjs';
import { experimentConfig, dayActivity, experimentRandomness, EXPERIMENT_ASSUMPTIONS } from './experiment-config.mjs';
import { clockAgenda } from './clock-agenda.mjs';
import { createActivitySchedule, SUBDAY_RANDOMNESS } from './activity-schedule.mjs';
import { observationEnvironment } from './identity-observations.mjs';
import { runVouchExperiment } from './vouch-experiment.mjs';
import { runPbExperiment } from './pb-experiment.mjs';
import { PB_ENGINE } from './pb-experiment-config.mjs';
import { runLivingExperiment } from './living-experiment.mjs';
import { LIVING_ENGINE } from './living-experiment-config.mjs';

export {
  SCENARIOS, EXPERIMENT_ABLATIONS, RANDOMNESS_POLICY, DEFAULT_ACTIVITY, DEFAULT_DISPUTES,
  LIABILITY_POLICIES, DEFAULT_DEVIANTS, DEFAULT_SOCIAL, EXPERIMENT_ASSUMPTIONS,
  activityAtDay, experimentConfig, withExperimentParameters,
} from './experiment-config.mjs';

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
  if (config.engine === PB_ENGINE) return runPbExperiment(config);
  if (config.engine === LIVING_ENGINE) return runLivingExperiment(config);
  if (config.engine !== undefined) return runVouchExperiment(config);
  let assumptions = config.invitationEvidence === 'shared-target' ? EXPERIMENT_ASSUMPTIONS.map(text => text.startsWith('These are fixed reference strategies')
    ? 'These are fixed reference strategies, not optimized worst-case attackers. Counterfactual shared-target invitation evidence is one persistent first-stage signal per public target across reviewers/times at the supplied marginal sensitivity/FPR. Other observations and verification retain their keyed references. Repeated paid looks do not independently validate this signal. This is an extremal common-mode stress assumption, not calibrated evidence, notification or a protocol/default choice.' : text) : EXPERIMENT_ASSUMPTIONS;
  if (config.reviewReserve) assumptions = [...assumptions, 'Counterfactual maintenance-review-reserve/v1 partitions the same declared cohort work budget before setup: maintenance inspect/respond spend protected first then general; setup/other work use general only. No refill/release/borrowing or extra resource; unused reserve may strand work and displace genuine activity. This is uncalibrated scenario work, not a protocol obligation, token reserve, human willingness or a safety/welfare result.'];
  const randomness = experimentRandomness(config);
  const schedule = config.stepHours === 24 ? null : createActivitySchedule(config);
  const attendedReviewRandom = config.invitationReviewTiming === 'first-attended' ? new Random(config.seed).fork(SUBDAY_RANDOMNESS.placement) : null;
  const attendedReviewTrials = new Set();
  let attendedReviewDay = -1;
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
  const caseContexts = new Map();
  const pendingClusters = [];
  let disputeSequence = 0;
  // Public dispute history per subject: positions won and lost.
  const disputeRecords = new Map();
  const reliability = id => {
    const record = disputeRecords.get(id) ?? { won: 0, lost: 0 };
    return (record.won + 1) / (record.won + record.lost + 2);
  };
  // Keep the caller's guarantee-before-lineage graph order explicit.
  function neighborhood(id, hops) {
    return graphNeighborhood([model.guarantees, model.lineage], id, hops);
  }
  const modelAblations = Object.fromEntries(Object.keys(DEFAULT_ABLATIONS).map(key => [key, config.ablations[key]]));
  const model = new FacetyModel({ genesis: ids, policy: config.policy, ablations: modelAblations });
  const stakeBook = new DisputeStakes(model, config.disputes.stakeBacking);
  const effort = new EffortLedger({ weights: config.weights, budgets: config.budgets, maxActions: config.maxActions, reviewReserve: config.reviewReserve });
  const observe = observationEnvironment(truth, sensing, config);
  const pendingInvitations = [];
  const prepared = new Map();
  const seen = new Map();
  const history = [];
  const rejections = {};
  const observations = { inspections: 0, suspicious: 0, noVetoAuthority: 0, eligibleForUnmodeledXpChallenge: 0 };
  const invitationReview = schedule ? Object.fromEntries(['pairTickOpportunities', 'reviewSlots', 'inspections', 'inspectionDenied', 'positiveSignals', 'verificationCalls', 'verificationDenied', 'verificationPassed', 'cancelCalls', 'cancelBudgetDenied', 'cancelUnavailable', 'cancelRejected', 'cancelled'].map(key => [key, 0])) : null;
  const countReview = key => { if (invitationReview) invitationReview[key]++; };
  const reviewEvidence = schedule ? { falseTargetsInspected: 0, genuineTargetsInspected: 0, falseTargetPositive: 0, genuineTargetPositive: 0 } : null;
  function measureReviewEvidence(candidate, observation) {
    if (!reviewEvidence) return;
    // Evaluator-only measurement; this record is never read by the defense or model.
    reviewEvidence[candidate.genuine ? 'genuineTargetsInspected' : 'falseTargetsInspected']++;
    if (observation.suspicious) reviewEvidence[candidate.genuine ? 'genuineTargetPositive' : 'falseTargetPositive']++;
  }
  let nextSubject = 0;
  let firstSuccess = null;
  let falseConversionCount = 0;
  let censoredReason = null;
  let completedDays = 0;
  let previousSampleCosts = null;
  let previousCouncilIds = null;
  let previousDailyCosts = null;
  let previousDailyCouncilIds = null;
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
    const base = deviantOperators.has(identity.operator) && deviantActivity[identity.cohort] ? deviantActivity[identity.cohort] : activity[identity.cohort];
    return schedule ? schedule.activity(actor, base) : base;
  }

  function decision(channel, actor = '', slot = 0) {
    return random.fork(JSON.stringify([randomness.decisions, model.now, channel, actor, slot]));
  }

  function dailyChoice(channel, actor, probability, key = 0, kind = 'transaction') {
    return schedule ? schedule.slots(actor, model.now, channel, probability, key, kind).length > 0 : decision(channel, actor, key).chance(probability);
  }
  function actionSlots(channel, actor, rate, kind = 'transaction') {
    return schedule ? schedule.slots(actor, model.now, channel, rate, 0, kind) : Array.from({ length: workCount(rate, decision(channel, actor)) }, (_, i) => i);
  }
  function attempt(actor, action, operation, phase = 'maintenance') {
    if (schedule && phase !== 'setup' && action !== 'acceptInvitation' && !schedule.available(actor, model.now, ['inspect', 'verify'].includes(action) ? 'attention' : 'transaction')) return { ok: false, reason: 'unavailable' };
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
    const daily = schedule && stage === 'day-end';
    // D50/D109: cohort FACY-equivalent holdings (liquid + unspent Emitter + reserved stake - debt) per unit of cumulative declared effort.
    const holdings = { honest: 0, attackers: 0 };
    for (const subject of model.subjects()) holdings[truth.get(subject.id).cohort] += subject.liquidFacy - subject.debt;
    for (const act of acts) if (act.status === 'unspent') holdings[truth.get(act.subject).cohort]++;
    for (const stake of model.disputeStakes()) if (stake.status === 'reserved') holdings[truth.get(stake.owner).cohort] += stake.amount;
    const perEffort = cohort => costs[cohort].effort > 0 ? holdings[cohort] / costs[cohort].effort : null;
    const honestPerEffort = perEffort('honest');
    const attackersPerEffort = perEffort('attackers');
    const network = measureNetwork(model, truth, { previousCouncilIds: daily ? previousDailyCouncilIds : previousCouncilIds });
    history.push({
      atHour: model.now, stage, ...network,
      attackerSeats: seats, councilSeats: council.length, falseConversions,
      attackerEffort: costs.attackers.effort, defenderEffort: costs.honest.effort,
      cohorts: measureWork(costs, daily ? previousDailyCosts : previousSampleCosts),
      yield: {
        honestHoldings: holdings.honest, attackersHoldings: holdings.attackers, honestPerEffort, attackersPerEffort,
        strongTargetGap: honestPerEffort === null || attackersPerEffort === null ? null : honestPerEffort - 10 * attackersPerEffort,
      },
      effectiveActivity: activity, activePerturbations: [...activePerturbations],
      ...(deviantOperators.size ? { deviantActivity } : {}),
      sanctions: { ...sanctions },
      stakes: stakeBook.summary(),
      trust: { ...trustWork },
      ...(invitationReview ? { invitationReview: { ...invitationReview } } : {}),
    });
    previousSampleCosts = costs;
    previousCouncilIds = network.council.memberIds;
    if (schedule && (stage === 'initial' || daily)) {
      previousDailyCosts = costs;
      previousDailyCouncilIds = network.council.memberIds;
    }
  }
  function guaranteeWork(actors) {
    for (const actor of actors) {
      const cohort = truth.get(actor).cohort;
      for (const i of actionSlots('guarantee-count', actor, activityOf(actor).guarantee)) {
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
        && dailyChoice('cashout', actor, activityOf(actor).cashout)) {
        if (attempt(actor, 'cashout', () => model.transferFacy(actor, identity.operator, subject.liquidFacy)).ok) trustWork.cashouts++;
      } else if (identity.genuine && identity.cohort === 'honest' && subject.liquidFacy > 0 && config.social.honestTransferRate > 0
        && dailyChoice('honest-transfer', actor, config.social.honestTransferRate)) {
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
      for (const i of actionSlots('bribe-count', actor, activityOf(actor).bribe)) {
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
  // Counterfactual trial placement uses only present eligibility/attention, never future calendars.
  // Consume the daily trial before evidence/work/transaction gates; failure gives no retry today.
  function invitationReviewChoice(guarantor, pending) {
    const probability = activityOf(guarantor).review;
    if (!attendedReviewRandom) return dailyChoice('invitation-review', guarantor, probability, [pending.invitation], 'attention');
    if (!schedule.available(guarantor, model.now, 'attention')) return false;
    const day = Math.floor(model.now / DAY);
    if (day !== attendedReviewDay) { attendedReviewTrials.clear(); attendedReviewDay = day; }
    const pair = JSON.stringify([guarantor, pending.invitation]);
    if (attendedReviewTrials.has(pair)) return false;
    attendedReviewTrials.add(pair);
    return attendedReviewRandom.fork(JSON.stringify(['count', day, guarantor, 'invitation-review', [pending.invitation]])).chance(probability);
  }
  // Honest guarantors review whom their guaranteed subject invites while the invitation is frozen,
  // cancel a confirmed fake invitation and optionally leave the relation to escape the liability wave.
  function guardianWork() {
    if (!model.policy.invitationFreezeHours) return;
    for (const pending of pendingInvitations) {
      if (pending.cancelled || model.now - pending.createdAt >= model.policy.invitationFreezeHours) continue;
      for (const guarantor of [...model.guarantees.inEdges(pending.sponsor)].map(edge => edge.from)) {
        if (pending.cancelled || truth.get(guarantor).cohort !== 'honest' || model.subject(guarantor).identityStatus !== 'accepted') continue;
        countReview('pairTickOpportunities');
        if (!invitationReviewChoice(guarantor, pending)) continue;
        countReview('reviewSlots');
        const look = attempt(guarantor, 'inspect', () => observe(pending.candidate.id, ['invitation-review', model.now, guarantor], pending.candidate));
        if (!look.ok) { countReview('inspectionDenied'); continue; }
        countReview('inspections');
        measureReviewEvidence(pending.candidate, look.value);
        if (!look.value.suspicious) continue;
        countReview('positiveSignals');
        if (config.social.verification) {
          countReview('verificationCalls');
          const check = attempt(guarantor, 'verify', () => verified(guarantor, pending.candidate.id, 'invitation-review', pending.candidate));
          if (!check.ok || !check.value) {
            if (check.ok) trustWork.verificationsCleared++;
            else countReview('verificationDenied');
            continue;
          }
          countReview('verificationPassed');
        }
        countReview('cancelCalls');
        const cancel = attempt(guarantor, 'respond', () => model.cancelInvitation(guarantor, pending.invitation));
        if (!cancel.ok) {
          countReview(cancel.reason === 'budget-denied' ? 'cancelBudgetDenied' : cancel.reason === 'unavailable' ? 'cancelUnavailable' : 'cancelRejected');
          continue;
        }
        pending.cancelled = true;
        trustWork.invitationsCancelled++;
        countReview('cancelled');
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
      const access = challengeAccess(model, challenger, subject, rules.stake);
      if (!access.allowed) throw new ProtocolRejection(access.reason);
      if (openDisputes.some(dispute => dispute.subject === subject)) throw new ProtocolRejection('subject is already under dispute');
      const genuine = truth.get(subject).genuine;
      if (rules.procedure !== 'one-step') return { genuine, upheld: null };
      const caseId = 'one-step:' + disputeSequence++;
      stakeBook.open(caseId, challenger, rules.stake);
      caseContexts.set(caseId, { subject, challenger, procedure: rules.procedure, reason: null, upheld: null });
      const correct = sensing.fork(JSON.stringify(['verdict', model.now, challenger, subject])).chance(rules.accuracy);
      return { genuine, upheld: genuine ? !correct : correct, caseId };
    });
    if (!result.ok) return null;
    sanctions.challenges++;
    if (config.social.attentionFeedback) attention.add(challenger);
    const { genuine } = result.value;
    const dispute = rules.procedure === 'one-step' ? null : openDispute(challenger, subject, genuine);
    if (rules.procedure === 'chekharda-timed') {
      openTimedDispute(dispute);
      return { caseId: dispute.id, status: 'open', upheld: null };
    }
    const upheld = dispute === null ? result.value.upheld : ladder(dispute);
    if (dispute === null) {
      settleOneStepPosition(model, stakeBook, result.value.caseId, challenger, upheld, rules);
      Object.assign(caseContexts.get(result.value.caseId), { reason: 'one-step-environment-verdict', upheld });
    }
    applyVerdict(challenger, subject, genuine, upheld, onInvalidated, budget);
    while (pendingClusters.length) clusterFollowUp(pendingClusters.shift(), onInvalidated);
    return { caseId: dispute?.id ?? result.value.caseId, status: 'settled', upheld };
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
    const consequences = enforceIdentityVerdict(model, challenger, subject, rules, onInvalidated);
    sanctions.voidedActs += consequences.voidedActs;
    sanctions.excluded += consequences.invalidated.filter(party => party !== subject).length;
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
    const id = 'dispute:' + disputeSequence++;
    stakeBook.open(id, challenger, rules.stake);
    caseContexts.set(id, { subject, challenger, procedure: rules.procedure, reason: null, upheld: null });
    return {
      id, challenger, subject, genuine, genuinePrior,
      coalitionSubject: truth.get(subject).cohort === 'attackers', close: neighborhood(subject, 2),
      entrants: [{ id: challenger, side: 'fraud', stake: rules.stake }], lastMoveAt: model.now, frozen: [],
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
    return candidate.identityStatus === 'accepted' && candidate.xp > next.floor && id !== dispute.subject && !stakeBook.hasParticipant(dispute.id, id) && candidate.liquidFacy >= next.stake;
  }
  // Whether an eligible candidate takes the next position. Coalition members back the coalition side;
  // honest candidates follow their private signal (sharpened by evidence) and join when expected stake
  // gain plus civic value outweighs the stake and XP-halving risk.
  function willing(dispute, id, next, evidenceBoost) {
    if (schedule && (!schedule.available(id, model.now, 'attention') || !schedule.available(id, model.now, 'transaction'))) return false;
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
    if (!attempt(id, 'challenge', () => stakeBook.enter(dispute.id, id, next.stake)).ok) return false;
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
  function settleDispute(dispute, stopReason) {
    if (stakeBook.get(dispute.id).status !== 'open') throw new ProtocolRejection('dispute is already closed');
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
    stakeBook.settle(dispute.id, winner);
    Object.assign(caseContexts.get(dispute.id), { reason: councilReached(dispute) ? 'depth-triggered-council-reference' : stopReason, upheld: winner === 'fraud' });
    for (const entrant of entrants) if (entrant.side !== winner) model.penalize(entrant.id, { fine: 0, halveXp: rules.loserHalvesXp });
    for (const entrant of entrants) {
      const record = disputeRecords.get(entrant.id) ?? { won: 0, lost: 0 };
      record[entrant.side === winner ? 'won' : 'lost']++;
      disputeRecords.set(entrant.id, record);
    }
    sanctions.ladderDepth = Math.max(sanctions.ladderDepth, entrants.length);
    dispute.defenders = winner === 'fraud' ? entrants.filter(entrant => entrant.side === 'genuine').map(entrant => entrant.id) : [];
    const winners = entrants.filter(entrant => entrant.side === winner);
    // A Council verdict need not have a winning ordinary entrant.
    dispute.lead = winners.length ? winners.reduce((top, entrant) => (model.subject(entrant.id).xp > model.subject(top.id).xp ? entrant : top)).id : null;
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
  function ladder(dispute) {
    const rules = config.disputes;
    const pool = acceptedByXp();
    let stopReason = 'round-limit';
    for (let round = 1; round < rules.maxRounds && !councilReached(dispute); round++) {
      const next = nextPosition(dispute);
      let scanned = 0;
      let joined = null;
      for (const id of candidateOrder(pool, dispute, round)) {
        if (!eligible(dispute, id, next)) continue;
        if (++scanned > rules.maxScan) break;
        if (willing(dispute, id, next, 0)) { joined = id; break; }
      }
      if (joined === null) {
        stopReason = scanned > rules.maxScan ? 'scan-limit' : 'no-willing-entrant-in-scan';
        break;
      }
      if (!enter(dispute, joined, next)) {
        stopReason = 'entry-not-completed';
        break;
      }
    }
    const upheld = settleDispute(dispute, stopReason);
    pendingClusters.push(dispute);
    return upheld;
  }
  // Timed procedure (owner rule): the dispute freezes the accused's unspent rights; the last move wins
  // after disputeWindowHours without a counter-entry; every entry restarts the clock.
  function openTimedDispute(dispute) {
    for (const act of model.selfIds()) {
      if (act.subject !== dispute.subject || act.status !== 'unspent' || act.disputeLock !== null) continue;
      model.freezeSelfId(act.id, dispute.id);
      dispute.frozen.push(act.id);
    }
    openDisputes.push(dispute);
  }
  function resolveTimedDispute(dispute, stopReason) {
    const position = openDisputes.indexOf(dispute);
    if (position < 0) throw new ProtocolRejection('timed dispute is already closed');
    openDisputes.splice(position, 1);
    for (const id of dispute.frozen) {
      const act = model.selfId(id);
      if (act.disputeLock === dispute.id) model.unfreezeSelfId(id, dispute.id);
    }
    if (model.subject(dispute.subject).identityStatus !== 'accepted') {
      stakeBook.moot(dispute.id);
      Object.assign(caseContexts.get(dispute.id), { reason: 'target-no-longer-accepted', upheld: null });
      sanctions.disputesMooted++;
      return;
    }
    const upheld = settleDispute(dispute, stopReason);
    sanctions.disputesResolved++;
    applyVerdict(dispute.challenger, dispute.subject, dispute.genuine, upheld, () => {}, { followUps: config.social.maxFollowUps });
    clusterFollowUp(dispute, () => {});
  }
  // Daily attention: the higher the dispute relative to the network, the more people notice it and the
  // more evidence surfaces. The lowest-XP willing noticer takes the next position.
  function timedDisputeWork(attention = true) {
    const rules = config.disputes;
    if (!openDisputes.length) return;
    const accepted = acceptedByXp();
    const meanXp = accepted.reduce((sum, id) => sum + model.subject(id).xp, 0) / Math.max(1, accepted.length);
    for (const dispute of [...openDisputes]) {
      if (model.subject(dispute.subject).identityStatus !== 'accepted' || model.now - dispute.lastMoveAt >= rules.disputeWindowHours
        || councilReached(dispute) || dispute.entrants.length >= rules.maxRounds) {
        resolveTimedDispute(dispute, model.now - dispute.lastMoveAt >= rules.disputeWindowHours ? 'response-window-expired' : 'round-limit');
        continue;
      }
      if (model.now === dispute.lastMoveAt || !attention || (rules.entryTiming === 'each-tick' && model.now - dispute.lastMoveAt < config.stepHours)) continue;
      const rounds = rules.entryTiming === 'each-tick' ? [Math.floor((model.now % DAY) / config.stepHours)] : schedule ? actionSlots('dispute-round', dispute.id, rules.roundsPerDay, 'attention') : Array.from({ length: rules.roundsPerDay }, (_, i) => i);
      for (const round of rounds) {
        if (councilReached(dispute) || dispute.entrants.length >= rules.maxRounds) break;
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
      if (councilReached(dispute)) resolveTimedDispute(dispute, 'depth-triggered-council-reference');
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
    if (!config.social.screening && !config.social.flowTracing && !config.social.attentionFeedback && actors.every(actor => activityOf(actor).inspect === 0)) {
      // Preserve zero-count draws and slot bookkeeping without copying unused act history.
      for (const actor of actors) if (model.subject(actor).identityStatus === 'accepted') actionSlots('inspection-count', actor, 0, 'attention');
      return;
    }
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
      for (const i of actionSlots('inspection-count', actor, activityOf(actor).inspect, 'attention')) {
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
      for (const i of actionSlots('invitation-count', actor, activityOf(actor).invite)) {
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
    settleInvitations();
  }
  function settleInvitations() {
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

  function advanceSubdayTo(target) {
    while (true) {
      const hours = [
        ...pendingInvitations.filter(row => !row.cancelled).map(row => row.createdAt + model.policy.invitationFreezeHours),
        ...openDisputes.map(row => row.lastMoveAt + config.disputes.disputeWindowHours),
        ...model.selfIds().filter(row => row.debtReserved && row.disputeLock === null).map(row => row.recordedAt + model.policy.spendMaturityHours),
      ].filter(hour => hour > model.now && hour < target);
      if (!hours.length) break;
      model.advanceTo(hours.reduce((minimum, hour) => Math.min(minimum, hour), target));
      timedDisputeWork(false);
      settleInvitations();
    }
    model.advanceTo(target);
  }

  noteSuccess();
  try {
    if (config.initialTopology !== 'none') {
      const initial = generateGraph({ topology: config.initialTopology, size: ids.length, rootCount: 1, degree: config.initialDegree, seed: config.seed + ':initial' });
      for (const edge of initial.graph.edges()) establish(edge.from, edge.to, 'setup', true);
    }
    sample('initial');
    for (const marker of clockAgenda({ horizonHour: config.days * DAY, stepHours: config.stepHours })) {
      if (!schedule && marker.horizon) break;
      if (schedule) advanceSubdayTo(marker.atHour);
      else model.advanceTo(marker.atHour);
      if (schedule && marker.horizon) { timedDisputeWork(false); settleInvitations(); }
      if (schedule && marker.atHour > 0 && marker.atHour % DAY === 0) {
        completedDays++;
        model.audit();
        sample('day-end');
      }
      if (marker.horizon) break;
      const day = Math.floor(marker.atHour / DAY);
      ({ activity, activePerturbations } = dayActivity(config, day));
      deviantActivity = deviantActivityAt(day);
      // Invalidated subjects cannot act; filtering after the shuffle keeps other actors' order.
      const actors = decision('actor-order').shuffle([...model.guarantees.nodeIds()]).filter(id => model.subject(id).identityStatus === 'accepted');
      for (const actor of actors) {
        if (!dailyChoice('self-id', actor, activityOf(actor).selfId)) continue;
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
          if (dailyChoice('collector-conversion', actor, activityOf(actor).convert, model.selfId(act).recordedAt)) attempt(actor, 'convert', () => model.convertToCollector(actor, act));
        }
      }
      if (!schedule) completedDays++;
      model.audit();
      sample(schedule ? 'tick-end' : 'day-end');
    }
    if (!schedule) model.advanceTo(config.days * DAY);
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
  const stakeReservations = model.disputeStakes();
  const reservedBySubject = new Map();
  for (const stake of stakeReservations) if (stake.status === 'reserved') reservedBySubject.set(stake.owner, (reservedBySubject.get(stake.owner) ?? 0) + stake.amount);
  const unspent = new Map();
  for (const act of acts) if (act.status === 'unspent') unspent.set(act.subject, (unspent.get(act.subject) ?? 0) + 1);
  const emptyFacts = () => ({
    operators: 0, subjects: 0, acceptedSubjects: 0, invalidatedSubjects: 0, falseSubjects: 0,
    liquidFacy: 0, emitterFacy: 0, stakeFacy: 0, debt: 0, falseLiquidFacy: 0, falseStakeFacy: 0, falseDebt: 0, xp: 0, councilSeats: 0, effort: 0,
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
      facts.falseStakeFacy += reservedBySubject.get(subject.id) ?? 0;
      facts.falseDebt += subject.debt;
    }
    facts.liquidFacy += subject.liquidFacy;
    facts.emitterFacy += unspent.get(subject.id) ?? 0;
    facts.stakeFacy += reservedBySubject.get(subject.id) ?? 0;
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
    stakeFacy: metrics.ledger.stakeVault,
    falseStakeFacy: model.subjects().filter(subject => !truth.get(subject.id).genuine).reduce((sum, subject) => sum + (reservedBySubject.get(subject.id) ?? 0), 0),
    falseConvertedRewards: acts.filter(act => act.status === 'converted' && !truth.get(act.subject).genuine).length,
    falseAcceptedSubjects: model.subjects().filter(subject => subject.identityStatus === 'accepted' && !truth.get(subject.id).genuine).length,
    councilSeats: council.size,
    councilAttackerSeats: [...council].filter(id => truth.get(id).cohort === 'attackers').length,
    // Fraud budget: share of all minted rights created by false identities, and share of circulating
    // supply (liquid plus unspent Emitter rights) that false identities still hold.
    falseMintedShare: acts.length ? acts.filter(act => !truth.get(act.subject).genuine).length / acts.length : 0,
    falseCirculatingShare: metrics.ledger.supply ? (model.subjects().filter(subject => !truth.get(subject.id).genuine).reduce((sum, subject) => sum + subject.liquidFacy, 0)
      + model.subjects().filter(subject => !truth.get(subject.id).genuine).reduce((sum, subject) => sum + (reservedBySubject.get(subject.id) ?? 0), 0)
      + acts.filter(act => act.status === 'unspent' && !truth.get(act.subject).genuine).length) / metrics.ledger.supply : 0,
    sanctions: { ...sanctions },
    trust: { ...trustWork },
  };
  return {
    schema: 'facety-experiment/v1',
    config, randomness, provenance: provenance(), assumptions: schedule ? [...assumptions.filter(text => !text.startsWith('Self-ID, guarantee work')), 'D43: 4/6-hour decision opportunities retain daily floor-plus-Bernoulli quotas. Keyed uniform slot placement is a timing assumption, not measured human activity; Self-ID phase is fixed per subject. Unavailable, preadmission or ineligible slots expire without catch-up. Profiles override declared subject activity and separate transaction/attention hours; null means all decision ticks, not measured availability. Conditional responses remain per observation. Whole-run effort caps never reset. Invitation review stage counters are process diagnostics; their separate evaluator class counts never feed the defense or protocol state. Invitation reviews have one Bernoulli/slot per guarantor-invitation-calendar-day, not per tick. Timed attention rounds retain a per-case daily quota; entryTiming each-tick instead offers one opposing entry per decision tick after at least one step, never a forced participant. Council settlement keeps the automatic all-seats reference; availability supplies no quorum or recusal rule. Known off-grid invitation, dispute and reserved-debt deadlines are processed without extra actor rounds; horizon settlement does not issue daily quotas. Native terminal XP and unlimited unspent veto remain legacy, not D42 compliance.', ...(attendedReviewRandom ? ['Counterfactual first-attended invitation review: one daily Bernoulli trial per currently eligible guarantor/invitation, consumed at its first attended tick. It reuses the daily count key, not uniform slot placement; evidence/work/transaction/authority failures do not retry that day. Public pending-list awareness is inherited from the script, not measured notification or human vigilance. No future-calendar lookup, catch-up quota, budget refill or protocol/default change.'] : [])] : [...assumptions],
    outcome: {
      success: firstSuccess !== null ? true : censoredReason ? null : false,
      firstSuccess, censored: censoredReason !== null, censoredReason, completedDays, elapsedHours: model.now,
      criterion: config.successCriterion, horizonDays: config.days,
      ...(schedule ? { dailySampleOffsetHours: DAY } : {}),
    },
    population,
    effort: effort.audit(),
    observations, rejections, money, agents, system,
    ...(invitationReview ? { invitationReview: {
      counters: { ...invitationReview },
      evaluator: { ...reviewEvidence },
      attention: attendedReviewRandom ? 'counterfactual first-attended: one daily Bernoulli per eligible guarantor/invitation at first attended tick, consumed even when later gates fail; not measured notification or vigilance' : 'activity.review: one daily Bernoulli/slot per guarantor/invitation; not recognition or guaranteed observation',
      evidence: config.invitationEvidence === 'shared-target' ? 'counterfactual shared-target: persistent first-stage signal across reviewers/times at supplied sensitivity/falsePositiveRate; repeated looks remain paid, not independent evidence; optional verification keeps its separate keyed reference; never supplied truth' : 'sensitivity/falsePositiveRate, optionally verificationSensitivity/verificationFalsePositiveRate; noisy observations, never supplied truth',
      response: 'always attempt after positive evidence, subject to availability, budget and model authority; scripted motive, not endogenous utility',
      responsibility: 'prevents this invitation, not immunity for past or other duties; D34 historical liability remains unimplemented',
    } } : {}),
    disputes: { stakes: stakeBook.summary(), cases: stakeBook.cases().map(record => ({ ...record, ...caseContexts.get(record.id) })) },
    impact: {
      falseConversions: acts.filter(act => act.status === 'converted' && !truth.get(act.subject).genuine).length,
      falseEmissionsCancelled: acts.filter(act => act.status === 'cancelled' && !truth.get(act.subject).genuine).length,
      honestEmissionsCancelled: acts.filter(act => act.status === 'cancelled' && truth.get(act.subject).cohort === 'honest').length,
      honestDisconnected: honestIds.filter(id => !connected.has(id)).length,
      honestConnectedFraction: honestIds.length ? honestIds.filter(id => connected.has(id)).length / honestIds.length : null,
      attackerLiquidFacy: model.subjects().filter(subject => attackerIds.includes(subject.id)).reduce((sum, subject) => sum + subject.liquidFacy, 0),
    },
    metrics, history,
    ...(config.includeState ? { state: { subjects: model.subjects(), selfIds: acts, disputeStakes: stakeReservations, truth: identities, guarantees: model.guarantees.toJSON(), lineage: model.lineage.toJSON(), roots: [...model.roots], ...(schedule ? { events: model.events(), invitations: model.invitations() } : {}) } } : {}),
  };
}
