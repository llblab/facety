// Owns: the opt-in topology-takeover/v1 runner (D115): an honest valence-mode network with a head start versus an attacker cone,
// with or without the D84/D104/D36 Council-path gate. Excludes disputes, detection, fabrication cost and legacy cohort scheduling.
import { FacetyModel, DAY, ProtocolRejection } from './model.mjs';
import { Random } from './random.mjs';
import { provenance } from './provenance.mjs';

export const TOPOLOGY_ENGINE = 'topology-takeover/v1';
export const TOPOLOGY_RANDOMNESS = Object.freeze({ generator: 'sha256-xoshiro128starstar-v2', decisions: 'actor-day-stream-v1' });
export const TOPOLOGY_DEFAULTS = Object.freeze({
  seed: 'topology', gate: true, honestGenesis: 100, genesisChords: 1, attackStartDay: 100, days: 200, attackers: 10, maxSubjects: 20000, K: 100, includeState: false, inviteRights: 'off', stopAtHonest: 0, detectionStartDay: 0,
  honest: Object.freeze({ selfId: 0.9, invite: 0.01, befriend: 0.05, acceptNear: 0.5, acceptFar: 0.05, keepRights: 2 }),
  // D116 v2: opt-in noisy detection, freeze veto and one-step identity cases with D77 holds.
  detection: Object.freeze({ enabled: false, review: 0.5, inspect: 0.1, sensitivity: 0.8, falsePositiveRate: 0.01, windowDays: 7, accuracy: 0.9,
    // D117 v3 (off by default): §18.5 leaving, public pattern evidence by anyone, escalation to higher-XP sponsors and same-inviter follow-up.
    leave: false, publicLook: 0, patternMinInvitees: 5, patternClosure: 0.8, sponsorWillingness: 0.5, followUp: false }),
});
export const TOPOLOGY_ASSUMPTIONS = Object.freeze([
  'Behavior rates are scenario assumptions, not calibrated human behavior.',
  'Attacker operators enter by ordinary invitation from honest members who cannot tell them from real recruits; no detection, disputes or penalties exist in v1.',
  'Fake accounts cost nothing beyond protocol FACY (no fabrication cost): an upper bound on attacker ease.',
  'activeCount stands in for N_verified in the D33 Council lookup; verified independence is OPEN.',
  'Randomness is one stream per actor and day (actor-day-stream-v1), not per decision.',
  'Detection (opt-in, D116): independent noisy looks at declared sensitivity/false-positive rate; one-step identity verdicts at declared accuracy; no stakes, fines or chain liability. Attacker operators are genuine people and only cone-created accounts are false identities.',
]);
const PATHS = { terminal: 'single-member', self: 'other-member', bootstrap: 'latch-first-100-active', intermediaries: 'accepted-subjects', search: 'exact-unbounded', council: 'd33-active-lookup' };

function probability(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(label + ' must be a probability');
}
function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(label + ' must be an integer >= ' + minimum);
}

export function topologyConfig(overrides = {}) {
  const allowed = new Set(['engine', ...Object.keys(TOPOLOGY_DEFAULTS)]);
  for (const key of Object.keys(overrides)) if (!allowed.has(key)) throw new Error('unknown topology key: ' + key);
  if (overrides.engine !== undefined && overrides.engine !== TOPOLOGY_ENGINE) throw new Error('topology runner requires engine ' + TOPOLOGY_ENGINE);
  for (const key of Object.keys(overrides.honest ?? {})) if (!Object.hasOwn(TOPOLOGY_DEFAULTS.honest, key)) throw new Error('unknown honest behavior: ' + key);
  for (const key of Object.keys(overrides.detection ?? {})) if (!Object.hasOwn(TOPOLOGY_DEFAULTS.detection, key)) throw new Error('unknown detection setting: ' + key);
  const config = { ...TOPOLOGY_DEFAULTS, ...overrides, engine: TOPOLOGY_ENGINE, honest: { ...TOPOLOGY_DEFAULTS.honest, ...(overrides.honest ?? {}) },
    detection: { ...TOPOLOGY_DEFAULTS.detection, ...(overrides.detection ?? {}) } };
  if (typeof config.seed !== 'string' || !config.seed.length) throw new TypeError('seed must be a non-empty string');
  if (typeof config.gate !== 'boolean') throw new TypeError('gate must be boolean');
  if (typeof config.includeState !== 'boolean') throw new TypeError('includeState must be boolean');
  if (!['off', 'per-pair', 'higher-xp-pair'].includes(config.inviteRights)) throw new TypeError('inviteRights must be off, per-pair or higher-xp-pair');
  integer(config.honestGenesis, 'honestGenesis', 6);
  integer(config.genesisChords, 'genesisChords');
  integer(config.days, 'days', 1);
  integer(config.attackStartDay, 'attackStartDay');
  integer(config.attackers, 'attackers');
  integer(config.maxSubjects, 'maxSubjects', config.honestGenesis);
  integer(config.K, 'K', 5);
  integer(config.stopAtHonest, 'stopAtHonest');
  integer(config.detectionStartDay, 'detectionStartDay');
  for (const key of ['selfId', 'invite', 'befriend', 'acceptNear', 'acceptFar']) probability(config.honest[key], 'honest.' + key);
  integer(config.honest.keepRights, 'honest.keepRights');
  for (const key of ['enabled', 'leave', 'followUp']) if (typeof config.detection[key] !== 'boolean') throw new TypeError('detection.' + key + ' must be boolean');
  for (const key of ['review', 'inspect', 'sensitivity', 'falsePositiveRate', 'accuracy', 'publicLook', 'patternClosure', 'sponsorWillingness']) probability(config.detection[key], 'detection.' + key);
  integer(config.detection.patternMinInvitees, 'detection.patternMinInvitees', 1);
  integer(config.detection.windowDays, 'detection.windowDays', 1);
  return Object.freeze({ ...config, honest: Object.freeze(config.honest), detection: Object.freeze(config.detection) });
}

// D35 pre-guaranteed genesis: ring lattice with offsets 1 and 2 plus seeded random chords.
function genesisPairs(ids, chords, random) {
  const pairs = new Set();
  const add = (a, b) => { if (a !== b) pairs.add(a < b ? a + '|' + b : b + '|' + a); };
  for (let i = 0; i < ids.length; i++) for (const offset of [1, 2]) add(ids[i], ids[(i + offset) % ids.length]);
  for (let i = 0; i < ids.length; i++) for (let c = 0; c < chords; c++) add(ids[i], ids[random.int(ids.length)]);
  return [...pairs].sort().map(key => key.split('|'));
}

// hooks.onDay(row) observes each sampled day (progress/checkpoints); it never alters the run.
export function runTopologyExperiment(overrides = {}, hooks = {}) {
  const config = topologyConfig(overrides);
  const root = new Random(config.seed);
  const honestIds = Array.from({ length: config.honestGenesis }, (_, i) => 'h' + String(i).padStart(3, '0'));
  const model = new FacetyModel({
    genesis: honestIds, policy: {},
    valences: { K: config.K, genesisPairs: genesisPairs(honestIds, config.genesisChords, root.fork('genesis')), reference: {
      source: 'own-mature-right', withdrawal: 'free', pairEndXp: 'withdrawer-only', withdrawDuringHold: 'allow', invitations: 'v2-special-link',
      eligibility: config.gate ? 'v3-council-paths' : 'off', councilPaths: { ...PATHS } } },
    inviteRights: config.inviteRights === 'off' ? null : config.inviteRights,
  });
  // Evaluator-only labels: never read by any protocol call or honest decision.
  const cohort = new Map(honestIds.map(id => [id, 'honest']));
  const falseIdentity = id => id.startsWith('f');
  const detection = { casesOpened: 0, falseInvalidated: 0, genuineInvalidated: 0, vetoedFalse: 0, vetoedGenuine: 0, casesDismissed: 0,
    ...(config.detection.leave || config.detection.publicLook > 0 || config.detection.followUp ? { linksLeft: 0, patternsFound: 0, escalations: 0, sponsorRefusals: 0, followUpCases: 0 } : {}) };
  const openCases = new Map();
  const rosters = { honest: [...honestIds], attackers: [] };
  const decided = new Map();
  const refusals = { honest: {}, attackers: {} };
  const counts = { invitationsCreated: { honest: 0, attackers: 0 }, admitted: { honest: 0, attackers: 0 }, valencesOpened: { honest: 0, attackers: 0 }, pairsEstablished: 0 };
  const history = [];
  let sequence = 0, censoredReason = null, day = 0;
  const pendingTargets = new Map();
  const stream = (actor, channel = '') => root.fork(JSON.stringify([TOPOLOGY_RANDOMNESS.decisions, day, actor, channel]));
  function tryAction(actor, operation) {
    try { return { ok: true, value: operation() }; } catch (error) {
      if (!(error instanceof ProtocolRejection)) throw error;
      const bucket = refusals[cohort.get(actor)];
      bucket[error.message] = (bucket[error.message] ?? 0) + 1;
      return { ok: false, reason: error.message };
    }
  }
  const accepted = id => model.subject(id).identityStatus === 'accepted';
  const linked = (a, b) => Boolean(model.guarantees.edge(a, b) || model.guarantees.edge(b, a));
  const mutualCount = id => [...model.guarantees.inEdges(id)].filter(edge => model.guarantees.edge(id, edge.from)).length;
  const rights = id => model.eligibleEmissions(id);
  function invite(creator, right, target, targetCohort) {
    if (model.size + pendingTargets.size >= config.maxSubjects) throw new ProtocolRejection('maxSubjects');
    tryAction(creator, () => model.preregisterAccount(target));
    const result = tryAction(creator, () => model.createInvitation(creator, right, target));
    if (result.ok) { pendingTargets.set(result.value, { target, cohort: targetCohort }); counts.invitationsCreated[cohort.get(creator)]++; }
    return result.ok;
  }
  function openValence(owner, counterpart, right) {
    const before = model.guarantees.edge(owner, counterpart);
    const result = tryAction(owner, () => model.openValence(owner, counterpart, right));
    if (result.ok) {
      counts.valencesOpened[cohort.get(owner)]++;
      if (!before && model.guarantees.edge(owner, counterpart)) counts.pairsEstablished++;
    }
    return result.ok;
  }
  // Evaluator labels feed only this observation function; actors see its noisy output.
  const look = (random, subject) => random.chance(falseIdentity(subject) ? config.detection.sensitivity : config.detection.falsePositiveRate);
  const mutualPartners = id => [...model.guarantees.outEdges(id)].map(edge => edge.to).filter(other => model.guarantees.edge(other, id) && accepted(other)).sort();
  // §18.5: an honest subject ends its own side of the link with a partner (valence withdrawal or invitation-link end).
  function leave(actor, partner) {
    const valence = model.valenceRecords().find(record => record.owner === actor && record.counterpart === partner && record.status === 'open' && record.pairRelations.length);
    const link = valence ? null : model.invitations().find(record => record.status === 'active' && ((record.creator === actor && record.target === partner) || (record.creator === partner && record.target === actor)));
    if (!valence && !link) return false;
    const result = tryAction(actor, () => valence ? model.withdrawValence(actor, valence.id) : model.endInvitationLink(actor, link.id));
    if (result.ok) detection.linksLeft++;
    return result.ok;
  }
  const invitees = id => [...model.lineage.outEdges(id)].map(edge => edge.to).filter(accepted).sort();
  function subtree(id) {
    const seen = new Set([id]), queue = [id];
    while (queue.length) for (const edge of model.lineage.outEdges(queue.shift())) if (!seen.has(edge.to)) { seen.add(edge.to); queue.push(edge.to); }
    return seen;
  }
  // Public record only: invitees whose mutual partners lie inside the examined subject's own invitation subtree.
  function pattern(id) {
    const children = invitees(id);
    if (children.length < config.detection.patternMinInvitees) return false;
    const inside = subtree(id);
    let total = 0, closed = 0;
    for (const child of children) for (const partner of mutualPartners(child)) { total++; if (inside.has(partner)) closed++; }
    return total > 0 && closed / total >= config.detection.patternClosure;
  }
  const openCase = (sponsor, target, followUp = false) => {
    const caseId = 'case:' + day + ':' + sponsor + ':' + target;
    if (!tryAction(sponsor, () => model.beginDisputeParticipation(caseId, [sponsor, target])).ok) return false;
    openCases.set(caseId, { target, challenger: sponsor, openedAt: model.now });
    detection.casesOpened++;
    if (followUp) detection.followUpCases++;
    return true;
  };
  // D46 relay: the highest-XP accepted subject within two mutual hops whose XP exceeds the target's; honest sponsors are willing with the declared probability.
  function escalate(observer, target, random) {
    const near = new Set([observer]);
    for (const partner of mutualPartners(observer)) { near.add(partner); for (const second of mutualPartners(partner)) near.add(second); }
    near.delete(target);
    const floor = model.subject(target).xp;
    const sponsor = [...near].map(id => model.subject(id)).filter(subject => subject.identityStatus === 'accepted' && subject.xp > floor)
      .sort((a, b) => b.xp - a.xp || (a.id < b.id ? -1 : 1))[0]?.id;
    if (sponsor === undefined) return false;
    detection.escalations++;
    if (cohort.get(sponsor) !== 'honest' || !random.chance(config.detection.sponsorWillingness)) { detection.sponsorRefusals++; return false; }
    return openCase(sponsor, target);
  }
  function detect() {
    const settings = config.detection;
    const targeted = new Set([...openCases.values()].map(record => record.target));
    // Freeze veto: honest current guarantors of the creator review invitations created today.
    for (const [invitation, { target }] of [...pendingTargets]) {
      const record = model.invitations().find(value => value.id === invitation);
      if (record.status !== 'pending' || record.createdAt !== model.now) continue;
      const reviewers = [...model.guarantees.inEdges(record.creator)].map(edge => edge.from).filter(id => cohort.get(id) === 'honest' && accepted(id)).sort();
      for (const reviewer of reviewers) {
        const random = root.fork(JSON.stringify(['review', invitation, reviewer]));
        if (!random.chance(settings.review) || !look(random, target)) continue;
        if (tryAction(reviewer, () => model.cancelInvitation(reviewer, invitation)).ok) {
          detection[falseIdentity(target) ? 'vetoedFalse' : 'vetoedGenuine']++;
          pendingTargets.delete(invitation);
          if (settings.leave) leave(reviewer, record.creator);
          break;
        }
      }
    }
    // Resolve due identity cases: verdict correct with declared accuracy; a false verdict invalidates and voids the chain.
    for (const [caseId, record] of [...openCases]) {
      if (model.now - record.openedAt < settings.windowDays * DAY) continue;
      const correct = root.fork(JSON.stringify(['verdict', caseId])).chance(settings.accuracy);
      const verdictFalse = falseIdentity(record.target) ? correct : !correct;
      model.endDisputeParticipation(caseId);
      openCases.delete(caseId);
      targeted.delete(record.target);
      if (!verdictFalse || !accepted(record.target)) { detection.casesDismissed++; continue; }
      model.invalidateIdentity(record.target);
      model.voidSelfIdChain(record.target);
      detection[falseIdentity(record.target) ? 'falseInvalidated' : 'genuineInvalidated']++;
      const inviter = [...model.lineage.inEdges(record.target)][0]?.from;
      if (inviter === undefined || !accepted(inviter)) continue;
      if (settings.leave) for (const partner of mutualPartners(inviter)) if (cohort.get(partner) === 'honest') leave(partner, inviter);
      if (settings.followUp && accepted(record.challenger)) {
        const random = root.fork(JSON.stringify(['follow-up', caseId]));
        for (const sibling of invitees(inviter)) if (!targeted.has(sibling) && look(random, sibling) && openCase(record.challenger, sibling, true)) targeted.add(sibling);
      }
    }
    // Partner inspection: a suspicious look opens one identity case per target (D77 hold on both parties).
    for (const id of rosters.honest.filter(accepted)) {
      const random = stream(id, 'inspect');
      for (const partner of mutualPartners(id)) {
        if (!random.chance(settings.inspect) || !look(random, partner) || targeted.has(partner)) continue;
        if (openCase(id, partner)) targeted.add(partner);
      }
    }
    // D68 public evidence: anyone may examine a random subject's public pattern, then escalate suspicious invitees.
    if (settings.publicLook > 0) {
      const everyone = [...rosters.honest, ...rosters.attackers].filter(accepted).sort();
      for (const id of rosters.honest.filter(accepted)) {
        const random = stream(id, 'public');
        if (!random.chance(settings.publicLook)) continue;
        const examined = random.pick(everyone);
        if (examined === id) continue;
        // v3.1: the examined subject's own public identity evidence, then its invitees when the public pattern holds.
        if (!targeted.has(examined) && look(random, examined) && escalate(id, examined, random)) targeted.add(examined);
        if (!pattern(examined)) continue;
        detection.patternsFound++;
        for (const child of random.shuffle(invitees(examined)).slice(0, 3)) {
          if (targeted.has(child) || !look(random, child)) continue;
          if (escalate(id, child, random)) targeted.add(child);
        }
      }
    }
  }
  function sample() {
    const subjects = model.subjects();
    const acceptedSubjects = subjects.filter(subject => subject.identityStatus === 'accepted');
    const attackersAccepted = acceptedSubjects.filter(subject => cohort.get(subject.id) === 'attackers').length;
    const supply = model.ledger().supply;
    let dirty = 0;
    for (const id of rosters.attackers) dirty += model.subject(id).liquidFacy + model.eligibleEmissions(id, 0).length;
    const council = model.council();
    let attackEdges = 0;
    for (const id of rosters.attackers) for (const edge of model.guarantees.outEdges(id)) if (cohort.get(edge.to) === 'honest' && model.guarantees.edge(edge.to, id)) attackEdges++;
    history.push({
      day, subjects: acceptedSubjects.length, honest: acceptedSubjects.length - attackersAccepted, attackers: attackersAccepted,
      attackerShare: acceptedSubjects.length ? attackersAccepted / acceptedSubjects.length : null,
      supply, dirtyShare: supply > 0 ? dirty / supply : null,
      active: model.activeCount(), D: model.requiredGuarantors(), bootstrap: model.initialBootstrap,
      councilSize: council.length, councilAttackers: council.filter(member => cohort.get(member.id) === 'attackers').length,
      attackEdges, detection: { ...detection },
      refusals: { honest: { ...refusals.honest }, attackers: { ...refusals.attackers } },
    });
  }
  try {
    for (day = 0; day < config.days; day++) {
      model.advanceTo(day * DAY);
      // Attacker operators enter by ordinary invitation from distinct honest members (no detection).
      if (day === config.attackStartDay) {
        const inviters = stream('attack-entry').shuffle(rosters.honest.filter(accepted));
        let entered = 0;
        for (const inviter of inviters) {
          if (entered >= config.attackers) break;
          const right = rights(inviter)[0];
          if (right !== undefined && invite(inviter, right, 'a' + String(entered).padStart(3, '0'), 'attackers')) entered++;
        }
      }
      for (const [invitation, { target, cohort: targetCohort }] of [...pendingTargets]) {
        const record = model.invitations().find(value => value.id === invitation);
        if (record.status !== 'pending' || model.now - record.createdAt < model.policy.invitationFreezeHours) continue;
        cohort.set(target, targetCohort);
        if (tryAction(record.creator, () => model.acceptInvitation(invitation, target)).ok) {
          rosters[targetCohort].push(target);
          counts.admitted[targetCohort]++;
        } else cohort.delete(target);
        pendingTargets.delete(invitation);
      }
      const everyone = [...rosters.honest, ...rosters.attackers].filter(accepted);
      for (const id of everyone) {
        const p = cohort.get(id) === 'honest' ? config.honest.selfId : 1;
        if (stream(id, 'self-id').chance(p)) tryAction(id, () => model.createSelfId(id, model.registerArtifact(id)));
      }
      // Answer incoming open valences once per valence: honest by graph distance only, attackers within their cone.
      const open = model.valenceRecords().filter(record => record.status === 'open' && !record.pairRelations.length);
      const openKeys = new Set(open.map(record => record.owner + '>' + record.counterpart));
      for (const record of open) {
        const answerer = record.counterpart;
        if (!accepted(answerer) || !accepted(record.owner) || openKeys.has(answerer + '>' + record.owner)) continue;
        if (!decided.has(record.id)) {
          let yes;
          if (cohort.get(answerer) === 'attackers') yes = true;
          else {
            const near = [...model.guarantees.outEdges(answerer)].some(edge => edge.to === record.owner || model.guarantees.edge(edge.to, record.owner));
            yes = root.fork(JSON.stringify(['answer', record.id])).chance(near ? config.honest.acceptNear : config.honest.acceptFar);
          }
          decided.set(record.id, yes);
        }
        if (!decided.get(record.id)) continue;
        const right = rights(answerer)[0];
        if (right !== undefined && openValence(answerer, record.owner, right)) openKeys.add(answerer + '>' + record.owner);
      }
      for (const id of rosters.honest.filter(accepted)) {
        const random = stream(id, 'spend');
        const available = rights(id);
        for (const right of available) {
          if (random.chance(config.honest.invite)) { invite(id, right, 'r' + String(sequence++).padStart(5, '0'), 'honest'); continue; }
          if (random.chance(config.honest.befriend)) {
            const friends = [...model.guarantees.outEdges(id)].map(edge => edge.to);
            const candidates = [...new Set(friends.flatMap(friend => [...model.guarantees.outEdges(friend)].map(edge => edge.to)))]
              .filter(other => other !== id && accepted(other) && !linked(id, other)).sort();
            if (candidates.length) openValence(id, random.pick(candidates), right);
          }
        }
        const unspent = model.eligibleEmissions(id, model.policy.conversionMaturityHours);
        for (const right of unspent.slice(0, Math.max(0, unspent.length - config.honest.keepRights))) tryAction(id, () => model.convertToCollector(id, right));
      }
      const D = model.requiredGuarantors();
      for (const id of rosters.attackers.filter(accepted)) {
        const random = stream(id, 'attack');
        for (const right of rights(id)) {
          if (invite(id, right, 'f' + String(sequence++).padStart(5, '0'), 'attackers')) continue;
          // D120/D121 adaptation: without an invitation right, pair with a cone member that qualifies to earn one.
          if (config.inviteRights !== 'off' && model.inviteRights(id) === 0) {
            const own = model.subject(id).xp;
            const seniors = rosters.attackers.filter(other => other !== id && accepted(other) && !linked(id, other) && (config.inviteRights === 'per-pair' || model.subject(other).xp > own));
            if (seniors.length && openValence(id, random.pick(seniors), right)) continue;
          }
          const cone = rosters.attackers.filter(other => other !== id && accepted(other) && !linked(id, other) && mutualCount(other) < D);
          if (cone.length && openValence(id, random.pick(cone), right)) continue;
          const honest = rosters.honest.filter(other => accepted(other) && !linked(id, other));
          if (honest.length) openValence(id, random.pick(honest), right);
        }
      }
      if (config.detection.enabled && day >= config.detectionStartDay) detect();
      model.audit();
      sample();
      hooks.onDay?.(history.at(-1));
      // Snapshot search: stop once the honest accepted population first reaches the target.
      if (config.stopAtHonest > 0 && history.at(-1).honest >= config.stopAtHonest) { censoredReason = 'stopAtHonest'; break; }
    }
  } catch (error) {
    if (!(error instanceof ProtocolRejection) || error.message !== 'maxSubjects') throw error;
    censoredReason = 'maxSubjects';
    sample();
  }
  return {
    schema: 'facety-topology-takeover/v1', config, randomness: TOPOLOGY_RANDOMNESS, assumptions: TOPOLOGY_ASSUMPTIONS, provenance: provenance(),
    outcome: { censored: censoredReason !== null && censoredReason !== 'stopAtHonest', censoredReason, completedDays: censoredReason === 'stopAtHonest' ? day + 1 : censoredReason ? day : config.days },
    counts, detection, history,
    ...(config.includeState ? { state: {
      cohort: Object.fromEntries(cohort), status: Object.fromEntries(model.subjects().map(subject => [subject.id, subject.identityStatus])),
      guarantees: [...model.guarantees.edges()].map(edge => [edge.from, edge.to]), lineage: [...model.lineage.edges()].map(edge => [edge.from, edge.to]),
      invitations: model.invitations().map(({ id, creator, target, status, createdAt }) => ({ id, creator, target, status, createdAt })),
    } } : {}),
  };
}
