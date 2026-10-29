// Owns: the opt-in topology-takeover/v1 runner (D115): an honest valence-mode network with a head start versus an attacker cone,
// with or without the D84/D104/D36 Council-path gate. Excludes disputes, detection, fabrication cost and legacy cohort scheduling.
import { FacetyModel, DAY, ProtocolRejection } from './model.mjs';
import { Random } from './random.mjs';
import { provenance } from './provenance.mjs';

export const TOPOLOGY_ENGINE = 'topology-takeover/v1';
export const TOPOLOGY_RANDOMNESS = Object.freeze({ generator: 'sha256-xoshiro128starstar-v2', decisions: 'actor-day-stream-v1' });
export const TOPOLOGY_DEFAULTS = Object.freeze({
  seed: 'topology', gate: true, honestGenesis: 100, genesisChords: 1, attackStartDay: 100, days: 200, attackers: 10, maxSubjects: 20000, K: 100,
  honest: Object.freeze({ selfId: 0.9, invite: 0.01, befriend: 0.05, acceptNear: 0.5, acceptFar: 0.05, keepRights: 2 }),
});
export const TOPOLOGY_ASSUMPTIONS = Object.freeze([
  'Behavior rates are scenario assumptions, not calibrated human behavior.',
  'Attacker operators enter by ordinary invitation from honest members who cannot tell them from real recruits; no detection, disputes or penalties exist in v1.',
  'Fake accounts cost nothing beyond protocol FACY (no fabrication cost): an upper bound on attacker ease.',
  'activeCount stands in for N_verified in the D33 Council lookup; verified independence is OPEN.',
  'Randomness is one stream per actor and day (actor-day-stream-v1), not per decision.',
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
  const config = { ...TOPOLOGY_DEFAULTS, ...overrides, engine: TOPOLOGY_ENGINE, honest: { ...TOPOLOGY_DEFAULTS.honest, ...(overrides.honest ?? {}) } };
  if (typeof config.seed !== 'string' || !config.seed.length) throw new TypeError('seed must be a non-empty string');
  if (typeof config.gate !== 'boolean') throw new TypeError('gate must be boolean');
  integer(config.honestGenesis, 'honestGenesis', 6);
  integer(config.genesisChords, 'genesisChords');
  integer(config.days, 'days', 1);
  integer(config.attackStartDay, 'attackStartDay');
  integer(config.attackers, 'attackers');
  integer(config.maxSubjects, 'maxSubjects', config.honestGenesis);
  integer(config.K, 'K', 5);
  for (const key of ['selfId', 'invite', 'befriend', 'acceptNear', 'acceptFar']) probability(config.honest[key], 'honest.' + key);
  integer(config.honest.keepRights, 'honest.keepRights');
  return Object.freeze({ ...config, honest: Object.freeze(config.honest) });
}

// D35 pre-guaranteed genesis: ring lattice with offsets 1 and 2 plus seeded random chords.
function genesisPairs(ids, chords, random) {
  const pairs = new Set();
  const add = (a, b) => { if (a !== b) pairs.add(a < b ? a + '|' + b : b + '|' + a); };
  for (let i = 0; i < ids.length; i++) for (const offset of [1, 2]) add(ids[i], ids[(i + offset) % ids.length]);
  for (let i = 0; i < ids.length; i++) for (let c = 0; c < chords; c++) add(ids[i], ids[random.int(ids.length)]);
  return [...pairs].sort().map(key => key.split('|'));
}

export function runTopologyExperiment(overrides = {}) {
  const config = topologyConfig(overrides);
  const root = new Random(config.seed);
  const honestIds = Array.from({ length: config.honestGenesis }, (_, i) => 'h' + String(i).padStart(3, '0'));
  const model = new FacetyModel({
    genesis: honestIds, policy: {},
    valences: { K: config.K, genesisPairs: genesisPairs(honestIds, config.genesisChords, root.fork('genesis')), reference: {
      source: 'own-mature-right', withdrawal: 'free', pairEndXp: 'withdrawer-only', withdrawDuringHold: 'allow', invitations: 'v2-special-link',
      eligibility: config.gate ? 'v3-council-paths' : 'off', councilPaths: { ...PATHS } } },
  });
  // Evaluator-only labels: never read by any protocol call or honest decision.
  const cohort = new Map(honestIds.map(id => [id, 'honest']));
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
      attackEdges,
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
          const cone = rosters.attackers.filter(other => other !== id && accepted(other) && !linked(id, other) && mutualCount(other) < D);
          if (cone.length && openValence(id, random.pick(cone), right)) continue;
          const honest = rosters.honest.filter(other => accepted(other) && !linked(id, other));
          if (honest.length) openValence(id, random.pick(honest), right);
        }
      }
      model.audit();
      sample();
    }
  } catch (error) {
    if (!(error instanceof ProtocolRejection) || error.message !== 'maxSubjects') throw error;
    censoredReason = 'maxSubjects';
    sample();
  }
  return {
    schema: 'facety-topology-takeover/v1', config, randomness: TOPOLOGY_RANDOMNESS, assumptions: TOPOLOGY_ASSUMPTIONS, provenance: provenance(),
    outcome: { censored: censoredReason !== null, censoredReason, completedDays: censoredReason ? day : config.days },
    counts, history,
  };
}
