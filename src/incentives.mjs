// Owns: Replayable marginal protocol decision forks; excludes utility assumptions, agent optimization and network-effect claims.
import { isDeepStrictEqual } from 'node:util';
import { FacetyModel, DAY, policyFrom } from './model.mjs';
import { DirectedGraph } from './graph.mjs';
import { EffortLedger, effortWeights, DEFAULT_WEIGHTS } from './effort.mjs';
import { provenance } from './provenance.mjs';

export const INCENTIVE_STRATEGIES = Object.freeze(['wait-collector', 'invite-only', 'invite-and-guarantee']);
const SCHEDULE = Object.freeze({ decisionDay: 3, newcomerSelfIdDay: 4, collectorDay: 7, horizonDay: 11 });
// The fixture was measured under the superseded 3/7-day timing, which it pins explicitly.
export const LEGACY_FIXTURE_TIMING = Object.freeze({ spendMaturityHours: 72, conversionMaturityHours: 168, invitationFreezeHours: 0, linkBreakXp: 'keep' });

const ONE_DAY_SCHEDULE = Object.freeze({ decisionHour: 24, admissionHour: 48, newcomerSelfIdHour: 48, horizonHour: 72 });
// Pin this reference rather than silently following future default-policy migrations.
const ONE_DAY_POLICY = Object.freeze({
  xpFinality: 'terminal', cancellationAuthority: 'snapshot', guarantorEligibility: 'active',
  guaranteeFee: 0, councilSize: 101, debtRecovery: 'reserve-until-mature', councilEligibility: 'active',
  invitationFreezeHours: 24, linkBreakXp: 'revoke', spendMaturityHours: 24, conversionMaturityHours: 24,
  artifactReuse: 'registration-only',
});
const NO_RANDOMNESS = 'none: deterministic action scripts replay the same prefix';

function runBranch(strategy, policy, schedule = SCHEDULE) {
  const oneDay = schedule === ONE_DAY_SCHEDULE;
  const model = new FacetyModel({ genesis: ['sponsor', 'peer'], policy });
  const ledgers = new Map();
  const actions = [];
  const timeline = [];
  function perform(actor, action, operation, phase = 'maintenance') {
    if (!ledgers.has(actor)) ledgers.set(actor, new EffortLedger());
    const ledger = ledgers.get(actor);
    const ticket = ledger.begin('honest', action, phase);
    if (!ticket) throw new Error('fixed decision fixture exceeded its per-subject effort budget');
    let value;
    try { value = operation(); }
    catch (error) {
      ledger.finish(ticket, false);
      throw error;
    }
    ledger.finish(ticket, true);
    actions.push({ atHour: model.now, actor, action, phase, effort: ticket.cost });
    return value;
  }
  function identify(actor, phase = 'maintenance') {
    return perform(actor, 'selfId', () => model.createSelfId(actor, model.registerArtifact(actor)), phase);
  }
  function guarantee(from, to, phase = 'maintenance') {
    const relation = perform(from, 'proposeGuarantee', () => model.proposeGuarantee(from, to), phase);
    perform(to, 'confirmGuarantee', () => model.confirmGuarantee(to, relation), phase);
  }
  function sample(stage) {
    timeline.push({
      stage, atHour: model.now, subjects: model.subjects(), selfIds: model.selfIds(),
      ledger: model.audit(), council: model.council(),
      guarantees: model.guarantees.toJSON(), lineage: model.lineage.toJSON(), roots: [...model.roots],
      ...(oneDay ? { invitations: model.invitations(), eventCursor: model.events().length } : {}),
    });
  }
  guarantee('peer', 'sponsor', 'setup');
  const peerAct = identify('peer', 'setup');
  const sponsorAct = identify('sponsor', 'setup');
  sample('common-prefix');

  let newcomerAct;
  if (oneDay) {
    model.advanceTo(schedule.decisionHour);
    perform('peer', 'convert', () => model.convertToCollector('peer', peerAct));
    let invitation;
    if (strategy === 'wait-collector') perform('sponsor', 'convert', () => model.convertToCollector('sponsor', sponsorAct));
    else {
      const newcomer = perform('sponsor', 'recruitHuman', () => 'newcomer');
      invitation = perform('sponsor', 'invite', () => model.createInvitation('sponsor', sponsorAct, newcomer));
    }
    sample('decision');
    model.advanceTo(schedule.admissionHour);
    if (invitation !== undefined) {
      perform('newcomer', 'acceptInvitation', () => model.acceptInvitation(invitation, 'newcomer'));
      if (strategy === 'invite-and-guarantee') guarantee('sponsor', 'newcomer');
    }
    sample('admission');
    model.advanceTo(schedule.newcomerSelfIdHour);
    newcomerAct = strategy === 'wait-collector' ? null : identify('newcomer');
    sample('newcomer-work');
    model.advanceTo(schedule.horizonHour);
  } else {
    model.advanceTo(SCHEDULE.decisionDay * DAY);
    if (strategy !== 'wait-collector') {
      const newcomer = perform('sponsor', 'recruitHuman', () => 'newcomer');
      const invitation = perform('sponsor', 'invite', () => model.createInvitation('sponsor', sponsorAct, newcomer));
      perform(newcomer, 'acceptInvitation', () => model.acceptInvitation(invitation, newcomer));
      if (strategy === 'invite-and-guarantee') guarantee('sponsor', newcomer);
    }
    sample('decision');
    model.advanceTo(SCHEDULE.newcomerSelfIdDay * DAY);
    newcomerAct = strategy === 'wait-collector' ? null : identify('newcomer');
    sample('newcomer-work');
    model.advanceTo(SCHEDULE.collectorDay * DAY);
    perform('peer', 'convert', () => model.convertToCollector('peer', peerAct));
    if (strategy === 'wait-collector') perform('sponsor', 'convert', () => model.convertToCollector('sponsor', sponsorAct));
    sample('collector');
    model.advanceTo(SCHEDULE.horizonDay * DAY);
  }
  if (newcomerAct !== null) perform('newcomer', 'convert', () => model.convertToCollector('newcomer', newcomerAct));
  sample('horizon');
  const summaries = [...ledgers].map(([actor, ledger]) => [actor, ledger.audit()]);
  return {
    strategy, timeline, actions, events: model.events(),
    work: {
      unit: summaries[0][1].unit, weights: summaries[0][1].weights,
      bySubject: Object.fromEntries(summaries.map(([actor, summary]) => [actor, summary.cohorts.honest])),
    },
  };
}

function compareBranch(baseline, treatment) {
  const before = baseline.timeline.at(-1);
  const after = treatment.timeline.at(-1);
  const a = before.subjects.find(subject => subject.id === 'sponsor');
  const b = after.subjects.find(subject => subject.id === 'sponsor');
  const oldWork = baseline.work.bySubject.sponsor;
  const newWork = treatment.work.bySubject.sponsor;
  return {
    baseline: baseline.strategy, treatment: treatment.strategy,
    sponsor: {
      liquidFacy: b.liquidFacy - a.liquidFacy, xp: b.xp - a.xp, debt: b.debt - a.debt,
      effort: (Math.round(newWork.effort * 1e6) - Math.round(oldWork.effort * 1e6)) / 1e6,
      acceptedActions: newWork.accepted - oldWork.accepted,
    },
    subjects: after.subjects.length - before.subjects.length,
    guaranteeEdges: after.guarantees.edges.length - before.guarantees.edges.length,
    lineageEdges: after.lineage.edges.length - before.lineage.edges.length,
    privateUtility: null, expectedLiability: null, networkExternality: null,
  };
}

function checkedSnapshot(snapshot) {
  const subjects = snapshot?.subjects;
  if (!Array.isArray(subjects) || subjects.length < 2 || subjects.length > 3) throw new Error('invalid incentive snapshot subjects');
  const ids = subjects.map(subject => subject.id);
  if (new Set(ids).size !== ids.length || !ids.includes('sponsor') || !ids.includes('peer')
    || ids.some(id => !['sponsor', 'peer', 'newcomer'].includes(id))) throw new Error('invalid incentive subject IDs');
  for (const subject of subjects) {
    for (const key of ['xp', 'liquidFacy', 'debt']) {
      if (!Number.isSafeInteger(subject[key]) || subject[key] < 0) throw new Error('invalid incentive subject balance');
    }
    if (subject.debt !== 0) throw new Error('this decision fixture does not support observed debt');
  }
  for (const name of ['guarantees', 'lineage']) {
    const source = snapshot[name];
    if (!Array.isArray(source?.nodes) || source.nodes.length !== ids.length || source.nodes.some(id => !ids.includes(id))
      || !Array.isArray(source.edges) || source.edges.length > 6) throw new Error('incentive graph population mismatch');
    DirectedGraph.fromJSON(source);
  }
  if (!isDeepStrictEqual(snapshot.roots, ['sponsor', 'peer'])) throw new Error('unsupported incentive roots');
  const ledger = snapshot.ledger;
  if (!ledger || ['minted', 'burned', 'supply', 'emitterVault', 'collector', 'feeVault', 'debt'].some(key => !Number.isSafeInteger(ledger[key]) || ledger[key] < 0)) throw new Error('invalid incentive monetary ledger');
  const acts = snapshot.selfIds;
  if (!Array.isArray(acts) || acts.length > 3 || new Set(acts.map(act => act.id)).size !== acts.length
    || acts.some(act => typeof act.id !== 'string' || !ids.includes(act.subject) || !['unspent', 'consumed', 'converted', 'cancelled'].includes(act.status))) throw new Error('invalid incentive Self-ID records');
  if (ledger.minted !== acts.length || ledger.emitterVault !== acts.filter(act => act.status === 'unspent').length
    || ledger.collector !== subjects.reduce((sum, subject) => sum + subject.liquidFacy, 0) || ledger.debt !== 0 || (ledger.stakeVault !== undefined && ledger.stakeVault !== 0)
    || ledger.supply !== ledger.minted - ledger.burned || ledger.supply !== ledger.emitterVault + ledger.collector + ledger.feeVault) throw new Error('incentive monetary accounting mismatch');
}

function checkedWork(branch, hours) {
  const source = branch.work;
  if (!source || !Array.isArray(branch.actions) || branch.actions.length > 64
    || !source.weights || Object.keys(source.weights).length !== Object.keys(DEFAULT_WEIGHTS).length) throw new Error('invalid incentive work');
  const weights = effortWeights(source.weights);
  const ids = branch.timeline.at(-1).subjects.map(subject => subject.id);
  if (!source.bySubject || !isDeepStrictEqual(Object.keys(source.bySubject).sort(), [...ids].sort())) throw new Error('incentive work attribution mismatch');
  const ledgers = new Map(ids.map(id => [id, new EffortLedger({ weights, budgets: { honest: source.bySubject[id].budget, attackers: 0 }, maxActions: 64 })]));
  let previous = -1;
  for (const action of branch.actions) {
    if (!hours.includes(action.atHour) || action.atHour < previous
      || !ledgers.has(action.actor) || action.phase !== (action.atHour === 0 ? 'setup' : 'maintenance')) throw new Error('invalid incentive work action');
    const ledger = ledgers.get(action.actor);
    const ticket = ledger.begin('honest', action.action, action.phase);
    if (!ticket || ticket.cost !== action.effort) throw new Error('incentive action cost mismatch');
    ledger.finish(ticket, true);
    previous = action.atHour;
  }
  for (const [id, ledger] of ledgers) {
    const replay = ledger.audit();
    if (source.unit !== replay.unit || !isDeepStrictEqual(source.bySubject[id], replay.cohorts.honest)) throw new Error('incentive work ledger mismatch');
  }
}

function checkedAlternative(branch) {
  const invited = branch.strategy !== 'wait-collector';
  const guaranteed = branch.strategy === 'invite-and-guarantee';
  const last = branch.timeline.at(-1);
  const ids = invited ? ['sponsor', 'peer', 'newcomer'] : ['sponsor', 'peer'];
  if (!isDeepStrictEqual(last.subjects.map(subject => subject.id).sort(), ids.sort())) throw new Error('incentive strategy population mismatch');
  const endpoints = edges => edges.map(edge => JSON.stringify([edge.from, edge.to])).sort();
  const expectedLineage = invited ? [{ from: 'sponsor', to: 'newcomer' }] : [];
  const expectedGuarantees = [{ from: 'peer', to: 'sponsor' }, ...(guaranteed ? [{ from: 'sponsor', to: 'newcomer' }] : [])];
  if (!isDeepStrictEqual(endpoints(last.lineage.edges), endpoints(expectedLineage))
    || !isDeepStrictEqual(endpoints(last.guarantees.edges), endpoints(expectedGuarantees))) throw new Error('incentive strategy graph mismatch');
  const source = branch.timeline[0].selfIds.find(act => act.subject === 'sponsor');
  const retained = source && last.selfIds.find(act => act.id === source.id && act.subject === 'sponsor');
  if (!retained || retained.status !== (invited ? 'consumed' : 'converted')
    || retained.disposition !== (invited ? 'invitation' : 'collector')) throw new Error('incentive strategy emission mismatch');
}

function checkedOneDayIdentity(artifact) {
  const identity = artifact.provenance?.implementation;
  if (identity?.method !== 'sha256-src-mjs-v1' || typeof identity.digest !== 'string' || !/^[a-f0-9]{64}$/.test(identity.digest)
    || !Number.isSafeInteger(identity.files) || identity.files < 1
    || typeof artifact.provenance?.runtime?.node !== 'string' || !/^v\d+\.\d+\.\d+(?:[-+].*)?$/.test(artifact.provenance.runtime.node)
    || artifact.randomness !== NO_RANDOMNESS) throw new Error('invalid one-day incentive provenance or randomness');
}

function checkedOneDayTimeline(branch, policy) {
  branch.timeline.forEach(checkedSnapshot);
  const invited = branch.strategy !== 'wait-collector';
  const guaranteed = branch.strategy === 'invite-and-guarantee';
  const sourceXp = Object.hasOwn(branch.timeline[0].subjects[0], 'xpHalvings');
  const acts = branch.timeline.at(-1).selfIds;
  const bySubject = new Map(acts.map(act => [act.subject, act]));
  if (bySubject.size !== 2 + Number(invited) || !bySubject.has('sponsor') || !bySubject.has('peer')
    || (invited && !bySubject.has('newcomer')) || acts.some(act => typeof act.artifact !== 'string' || !act.artifact.length)
    || new Set(acts.map(act => act.artifact)).size !== acts.length) throw new Error('invalid one-day incentive identity work');
  const fields = {
    'subject-added': ['subject', 'genesis'], 'guarantee-proposed': ['relation', 'guarantor', 'guaranteed'],
    'guarantee-activated': ['relation'], 'artifact-registered': ['artifact', 'publisher'],
    'self-id-created': ['selfId', 'subject', 'collision'], 'collector-converted': ['selfId', 'subject'],
    'invitation-created': ['invitation', 'creator', 'target'], 'invitation-accepted': ['invitation', 'subject'],
  };
  if (!Array.isArray(branch.events) || branch.events.length > 64) throw new Error('one-day incentive native events are required');
  const events = branch.events.map(event => {
    if (!event || !Object.hasOwn(fields, event.type)) throw new Error('unsupported one-day incentive event');
    return Object.fromEntries(['at', 'type', ...fields[event.type]].map(key => [key, event[key]]));
  });
  const relation = (guarantor, guaranteed) => {
    const proposals = events.filter(event => event.type === 'guarantee-proposed' && event.guarantor === guarantor && event.guaranteed === guaranteed);
    if (proposals.length !== 1 || typeof proposals[0].relation !== 'string' || !proposals[0].relation.length) throw new Error('invalid one-day incentive guarantee journal');
    return proposals[0].relation;
  };
  const prefixRelation = relation('peer', 'sponsor');
  const newRelation = guaranteed ? relation('sponsor', 'newcomer') : null;
  if (newRelation === prefixRelation) throw new Error('one-day incentive guarantee IDs must be distinct');
  const invitation = invited ? branch.timeline[1].invitations?.[0]?.id : null;
  if (invited && (typeof invitation !== 'string' || !invitation.length)) throw new Error('missing one-day incentive invitation');
  const expectedEvents = [];
  const expectedActions = [];
  const work = (atHour, actor, action) => expectedActions.push({ atHour, actor, action, phase: atHour === 0 ? 'setup' : 'maintenance' });
  const event = (at, type, data) => expectedEvents.push({ at, type, ...data });
  const guarantee = (at, id, guarantor, guaranteed) => {
    work(at, guarantor, 'proposeGuarantee');
    work(at, guaranteed, 'confirmGuarantee');
    event(at, 'guarantee-proposed', { relation: id, guarantor, guaranteed });
    event(at, 'guarantee-activated', { relation: id });
  };
  const identify = (at, subject) => {
    work(at, subject, 'selfId');
    const act = bySubject.get(subject);
    event(at, 'artifact-registered', { artifact: act.artifact, publisher: subject });
    event(at, 'self-id-created', { selfId: act.id, subject, collision: false });
  };
  const convert = (at, subject) => {
    work(at, subject, 'convert');
    event(at, 'collector-converted', { selfId: bySubject.get(subject).id, subject });
  };
  event(0, 'subject-added', { subject: 'sponsor', genesis: true });
  event(0, 'subject-added', { subject: 'peer', genesis: true });
  guarantee(0, prefixRelation, 'peer', 'sponsor');
  identify(0, 'peer');
  identify(0, 'sponsor');
  for (const [i, point] of branch.timeline.entries()) {
    const admitted = invited && i >= 2;
    const working = invited && i >= 3;
    const ids = ['sponsor', 'peer', ...(admitted ? ['newcomer'] : [])];
    if (!isDeepStrictEqual(point.subjects.map(subject => subject.id).sort(), [...ids].sort())
      || point.selfIds.length !== 2 + Number(working)) throw new Error('one-day incentive admission/work mismatch');
    const expectedInvitation = !invited || i === 0 ? [] : [{
      id: invitation, creator: 'sponsor', sourceSelfId: bySubject.get('sponsor').id, target: 'newcomer',
      createdAt: 24, acceptedAt: admitted ? 48 : null, status: admitted ? 'accepted' : 'open',
      ...(sourceXp ? { guarantors: ['peer'] } : {}),
    }];
    if (!isDeepStrictEqual(point.invitations, expectedInvitation)) throw new Error('one-day incentive invitation timeline mismatch');
    for (const name of ['guarantees', 'lineage']) {
      const expected = name === 'lineage' ? (admitted ? [['sponsor', 'newcomer']] : [])
        : [['peer', 'sponsor'], ...(admitted && guaranteed ? [['sponsor', 'newcomer']] : [])];
      if (!isDeepStrictEqual([...point[name].nodes].sort(), [...ids].sort())
        || !isDeepStrictEqual(point[name].edges.map(edge => JSON.stringify([edge.from, edge.to])).sort(), expected.map(edge => JSON.stringify(edge)).sort())) throw new Error('one-day incentive graph timeline mismatch');
    }
    for (const act of point.selfIds) {
      const newborn = act.subject === 'newcomer';
      const disposed = newborn ? i === 4 : i >= 1;
      const consumed = act.subject === 'sponsor' && invited && disposed;
      const guarantors = act.subject === 'sponsor' ? ['peer'] : newborn && guaranteed ? ['sponsor'] : [];
      if ((!working && newborn) || act.id !== bySubject.get(act.subject)?.id || act.artifact !== bySubject.get(act.subject)?.artifact
        || act.recordedAt !== (newborn ? 48 : 0) || act.status !== (consumed ? 'consumed' : disposed ? 'converted' : 'unspent')
        || act.disposition !== (consumed ? 'invitation' : disposed ? 'collector' : null)
        || act.xpCredited !== (policy.xpFinality === 'immediate' || disposed) || act.collision !== false || act.debtReserved !== false || act.disputeLock !== null
        || !isDeepStrictEqual(act.guarantors, guarantors) || !isDeepStrictEqual(act.xpRecipients, [act.subject, ...guarantors])) throw new Error('one-day incentive Self-ID timeline mismatch');
      if (Object.hasOwn(act, 'xpCredit') !== sourceXp) throw new Error('one-day incentive mixed XP provenance');
      if (sourceXp) {
        const expected = !act.xpCredited ? null : { at: policy.xpFinality === 'immediate' ? act.recordedAt : newborn ? 72 : 24,
          revokedAt: null, revocation: null, recipients: [act.subject, ...guarantors].map(subject => ({ subject,
            role: subject === act.subject ? 'subject' : 'guarantor', halvingsBefore: 0, revokedAt: null, revocation: null })) };
        if (!isDeepStrictEqual(act.xpCredit, expected)) throw new Error('one-day incentive XP source receipt mismatch');
      }
    }
    for (const subject of point.subjects) {
      if (Object.hasOwn(subject, 'xpHalvings') !== sourceXp || (sourceXp && subject.xpHalvings !== 0)) throw new Error('one-day incentive XP penalty state mismatch');
      const own = point.selfIds.filter(act => act.subject === subject.id);
      if (subject.identityStatus !== 'accepted' || subject.genesis !== (subject.id !== 'newcomer')
        || subject.lastRewardAt !== (own[0]?.recordedAt ?? null)
        || subject.liquidFacy !== own.filter(act => act.status === 'converted').length
        || subject.xp !== point.selfIds.filter(act => act.xpCredited && act.xpRecipients.includes(subject.id)).length) throw new Error('one-day incentive subject accounting mismatch');
    }
    if (point.ledger.burned !== Number(invited && i >= 1) || point.ledger.feeVault !== 0) throw new Error('one-day incentive burn/fee mismatch');
    if (i === 1) {
      convert(24, 'peer');
      if (invited) {
        work(24, 'sponsor', 'recruitHuman');
        work(24, 'sponsor', 'invite');
        event(24, 'invitation-created', { invitation, creator: 'sponsor', target: 'newcomer' });
      } else convert(24, 'sponsor');
    }
    if (i === 2 && invited) {
      work(48, 'newcomer', 'acceptInvitation');
      event(48, 'subject-added', { subject: 'newcomer', genesis: false });
      event(48, 'invitation-accepted', { invitation, subject: 'newcomer' });
      if (guaranteed) guarantee(48, newRelation, 'sponsor', 'newcomer');
    }
    if (i === 3 && invited) identify(48, 'newcomer');
    if (i === 4 && invited) convert(72, 'newcomer');
    if (point.eventCursor !== expectedEvents.length || point.eventCursor > events.length
      || !isDeepStrictEqual(events.slice(0, point.eventCursor), expectedEvents)) throw new Error('one-day incentive event cursor/order mismatch');
  }
  if (branch.timeline.at(-1).eventCursor !== events.length) throw new Error('one-day incentive event horizon is incomplete');
  if (!isDeepStrictEqual(branch.actions.map(({ atHour, actor, action, phase }) => ({ atHour, actor, action, phase })), expectedActions)) throw new Error('one-day incentive work script mismatch');
}

export function readIncentiveComparisons(artifact) {
  const oneDay = artifact?.schema === 'facety-incentive-forks/v2' && artifact.fixture === 'marginal-admission-24h-v1';
  if (!oneDay && (artifact?.schema !== 'facety-incentive-forks/v1' || artifact.fixture !== 'marginal-admission-v1')) throw new Error('unsupported incentive artifact');
  if (!['terminal', 'immediate'].includes(artifact.policy?.xpFinality)
    || !isDeepStrictEqual(artifact.policy, policyFrom({ ...(oneDay ? ONE_DAY_POLICY : LEGACY_FIXTURE_TIMING), xpFinality: artifact.policy?.xpFinality }))
    || !isDeepStrictEqual(artifact.schedule, oneDay ? ONE_DAY_SCHEDULE : SCHEDULE)) throw new Error('unsupported incentive policy or schedule');
  if (oneDay) checkedOneDayIdentity(artifact);
  if (!Array.isArray(artifact.branches) || artifact.branches.length !== INCENTIVE_STRATEGIES.length
    || new Set(artifact.branches.map(branch => branch.strategy)).size !== artifact.branches.length
    || artifact.branches.some(branch => !INCENTIVE_STRATEGIES.includes(branch.strategy))) throw new Error('incentive alternatives must be complete and distinct');
  const ordered = INCENTIVE_STRATEGIES.map(strategy => artifact.branches.find(branch => branch.strategy === strategy));
  const stages = oneDay ? ['common-prefix', 'decision', 'admission', 'newcomer-work', 'horizon'] : ['common-prefix', 'decision', 'newcomer-work', 'collector', 'horizon'];
  const hours = [0, ...(oneDay ? Object.values(ONE_DAY_SCHEDULE) : Object.values(SCHEDULE).map(day => day * DAY))];
  for (const branch of ordered) {
    if (!Array.isArray(branch.timeline) || branch.timeline.length !== stages.length
      || branch.timeline.some((point, i) => point?.stage !== stages[i] || point.atHour !== hours[i])) throw new Error('incentive checkpoints must reach the declared horizon');
    if (oneDay) checkedOneDayTimeline(branch, artifact.policy);
    else {
      checkedSnapshot(branch.timeline[0]);
      checkedSnapshot(branch.timeline.at(-1));
    }
    checkedWork(branch, hours);
    if (!oneDay) checkedAlternative(branch);
    if (!isDeepStrictEqual(branch.timeline[0], ordered[0].timeline[0]) || !isDeepStrictEqual(branch.work.weights, ordered[0].work.weights)
      || !isDeepStrictEqual(branch.actions.filter(action => action.phase === 'setup'), ordered[0].actions.filter(action => action.phase === 'setup'))) throw new Error('incentive alternatives require a common funded prefix and effort units');
  }
  return ordered.slice(1).map(branch => compareBranch(ordered[0], branch));
}

export function runIncentiveForks(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('incentive options must be an object');
  for (const key of Object.keys(options)) if (key !== 'xpFinality') throw new Error('unknown incentive option: ' + key);
  if (Object.hasOwn(options, 'xpFinality') && !['terminal', 'immediate'].includes(options.xpFinality)) throw new Error('fixed incentive fixtures support only terminal/immediate reference timing');
  const policy = policyFrom({ xpFinality: 'terminal', ...options, ...LEGACY_FIXTURE_TIMING });
  const branches = INCENTIVE_STRATEGIES.map(strategy => runBranch(strategy, policy));
  return {
    schema: 'facety-incentive-forks/v1', fixture: 'marginal-admission-v1', policy, schedule: { ...SCHEDULE },
    randomness: NO_RANDOMNESS,
    assumptions: [
      'Two accepted genesis subjects and one recruited newcomer are assumed to represent distinct genuine people; this is not established by the protocol trace.',
      'Only xpFinality varies. Other model defaults, including zero guarantee fee, are explicit fixed fixture assumptions.',
      'All branches replay the same funded guarantee and Self-ID prefix on independent model instances. No model or graph is cloned into a live protocol instance.',
      'Recruitment is one charged illustrative action, not a measurement of real human acquisition cost.',
      'A separate effort ledger attributes work to each acting subject. Newcomer acceptance, confirmation, Self-ID and conversion are newcomer work, not sponsor income or labor.',
      'The newcomer acts once on day 4 and converts on day 11. The sponsor and peer perform no additional Self-ID work after the common prefix.',
      'Snapshots are sparse named checkpoints, not complete daily experiment histories.',
      'No judicial penalties or market trades occur. Observed debt zero does not imply expected liability zero.',
      'FACY price, the value and timing of XP authority, private connection benefits and application-level network externalities remain unpriced.',
      'These are fixed local alternatives, not optimized strategies, endogenous adoption, equilibrium evidence or proof of a network effect.',
    ],
    branches, comparisons: branches.slice(1).map(branch => compareBranch(branches[0], branch)),
  };
}

export function runOneDayIncentiveForks(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('incentive options must be an object');
  for (const key of Object.keys(options)) if (key !== 'xpFinality') throw new Error('unknown incentive option: ' + key);
  if (Object.hasOwn(options, 'xpFinality') && !['terminal', 'immediate'].includes(options.xpFinality)) throw new Error('fixed incentive fixtures support only terminal/immediate reference timing');
  const policy = policyFrom({ ...ONE_DAY_POLICY, ...options });
  const branches = INCENTIVE_STRATEGIES.map(strategy => runBranch(strategy, policy, ONE_DAY_SCHEDULE));
  return {
    schema: 'facety-incentive-forks/v2', fixture: 'marginal-admission-24h-v1', policy, schedule: { ...ONE_DAY_SCHEDULE },
    provenance: provenance(), randomness: NO_RANDOMNESS,
    assumptions: [
      'This is the fixed-101/current-link reference, not implementation of D33 topology or D34 historical liability.',
      'Two accepted genesis subjects and one recruited newcomer are supplied as distinct genuine people; the protocol trace does not establish this or verify D35 bootstrap.',
      'Only xpFinality varies: terminal is retained legacy timing; immediate is an explicitly counterfactual comparison, never a protocol option. The fixed fixture does not migrate to ordinary maturity timing.',
      'The full one-day reference policy is pinned, including zero guarantee fee as a fixture assumption rather than a resolved production rule.',
      'Each branch replays funded Model operations on an independent instance. No balance injection or live model/graph cloning occurs.',
      'Work is charged by acting subject with illustrative effort weights; abstract recruitment and unpriced genesis acquisition do not measure human costs.',
      'Sponsor and peer act once at hour 0. Invitation creation is at 24, admission and fresh newcomer work are ordered at 48, and newcomer conversion is at 72. No additional daily Self-IDs are scripted.',
      'Snapshots are sparse ordered checkpoints, not daily participation observations. Event cursors distinguish the two hour-48 snapshots without choosing a D34 legal-event convention.',
      'No vetoes, exits, verdicts or market trades occur. Observed zero debt does not imply zero expected future liability.',
      'Private values, earlier authority, usefulness and network effects remain unpriced. Fixed local alternatives are not endogenous adoption, equilibrium or retention evidence.',
    ],
    branches, comparisons: branches.slice(1).map(branch => compareBranch(branches[0], branch)),
  };
}
