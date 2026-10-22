// Owns: Replayable marginal protocol decision forks; excludes utility assumptions, agent optimization and network-effect claims.
import { isDeepStrictEqual } from 'node:util';
import { FacetyModel, DAY, policyFrom } from './model.mjs';
import { DirectedGraph } from './graph.mjs';
import { EffortLedger, effortWeights, DEFAULT_WEIGHTS } from './effort.mjs';

export const INCENTIVE_STRATEGIES = Object.freeze(['wait-collector', 'invite-only', 'invite-and-guarantee']);
const SCHEDULE = Object.freeze({ decisionDay: 3, newcomerSelfIdDay: 4, collectorDay: 7, horizonDay: 11 });
// The fixture was measured under the superseded 3/7-day timing, which it pins explicitly.
export const LEGACY_FIXTURE_TIMING = Object.freeze({ spendMaturityHours: 72, conversionMaturityHours: 168, invitationFreezeHours: 0, linkBreakXp: 'keep' });

function runBranch(strategy, policy) {
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
    });
  }
  guarantee('peer', 'sponsor', 'setup');
  const peerAct = identify('peer', 'setup');
  const sponsorAct = identify('sponsor', 'setup');
  sample('common-prefix');

  model.advanceTo(SCHEDULE.decisionDay * DAY);
  if (strategy !== 'wait-collector') {
    const newcomer = perform('sponsor', 'recruitHuman', () => 'newcomer');
    const invitation = perform('sponsor', 'invite', () => model.createInvitation('sponsor', sponsorAct, newcomer));
    perform(newcomer, 'acceptInvitation', () => model.acceptInvitation(invitation, newcomer));
    if (strategy === 'invite-and-guarantee') guarantee('sponsor', newcomer);
  }
  sample('decision');

  model.advanceTo(SCHEDULE.newcomerSelfIdDay * DAY);
  const newcomerAct = strategy === 'wait-collector' ? null : identify('newcomer');
  sample('newcomer-work');

  model.advanceTo(SCHEDULE.collectorDay * DAY);
  perform('peer', 'convert', () => model.convertToCollector('peer', peerAct));
  if (strategy === 'wait-collector') perform('sponsor', 'convert', () => model.convertToCollector('sponsor', sponsorAct));
  sample('collector');

  model.advanceTo(SCHEDULE.horizonDay * DAY);
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
    || ledger.collector !== subjects.reduce((sum, subject) => sum + subject.liquidFacy, 0) || ledger.debt !== 0
    || ledger.supply !== ledger.minted - ledger.burned || ledger.supply !== ledger.emitterVault + ledger.collector + ledger.feeVault) throw new Error('incentive monetary accounting mismatch');
}

function checkedWork(branch) {
  const source = branch.work;
  if (!source || !Array.isArray(branch.actions) || branch.actions.length > 64
    || !source.weights || Object.keys(source.weights).length !== Object.keys(DEFAULT_WEIGHTS).length) throw new Error('invalid incentive work');
  const weights = effortWeights(source.weights);
  const ids = branch.timeline.at(-1).subjects.map(subject => subject.id);
  if (!source.bySubject || !isDeepStrictEqual(Object.keys(source.bySubject).sort(), [...ids].sort())) throw new Error('incentive work attribution mismatch');
  const ledgers = new Map(ids.map(id => [id, new EffortLedger({ weights, budgets: { honest: source.bySubject[id].budget, attackers: 0 }, maxActions: 64 })]));
  let previous = -1;
  for (const action of branch.actions) {
    if (![0, ...Object.values(SCHEDULE).map(day => day * DAY)].includes(action.atHour) || action.atHour < previous
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

export function readIncentiveComparisons(artifact) {
  if (artifact?.schema !== 'facety-incentive-forks/v1' || artifact.fixture !== 'marginal-admission-v1') throw new Error('unsupported incentive artifact');
  if (!isDeepStrictEqual(artifact.policy, policyFrom({ ...LEGACY_FIXTURE_TIMING, xpFinality: artifact.policy?.xpFinality }))
    || !isDeepStrictEqual(artifact.schedule, SCHEDULE)) throw new Error('unsupported incentive policy or schedule');
  if (!Array.isArray(artifact.branches) || artifact.branches.length !== INCENTIVE_STRATEGIES.length
    || new Set(artifact.branches.map(branch => branch.strategy)).size !== artifact.branches.length
    || artifact.branches.some(branch => !INCENTIVE_STRATEGIES.includes(branch.strategy))) throw new Error('incentive alternatives must be complete and distinct');
  const ordered = INCENTIVE_STRATEGIES.map(strategy => artifact.branches.find(branch => branch.strategy === strategy));
  const stages = ['common-prefix', 'decision', 'newcomer-work', 'collector', 'horizon'];
  const hours = [0, ...Object.values(SCHEDULE).map(day => day * DAY)];
  for (const branch of ordered) {
    if (!Array.isArray(branch.timeline) || branch.timeline.length !== stages.length
      || branch.timeline.some((point, i) => point?.stage !== stages[i] || point.atHour !== hours[i])) throw new Error('incentive checkpoints must reach the declared horizon');
    checkedSnapshot(branch.timeline[0]);
    checkedSnapshot(branch.timeline.at(-1));
    checkedWork(branch);
    checkedAlternative(branch);
    if (!isDeepStrictEqual(branch.timeline[0], ordered[0].timeline[0]) || !isDeepStrictEqual(branch.work.weights, ordered[0].work.weights)
      || !isDeepStrictEqual(branch.actions.filter(action => action.phase === 'setup'), ordered[0].actions.filter(action => action.phase === 'setup'))) throw new Error('incentive alternatives require a common funded prefix and effort units');
  }
  return ordered.slice(1).map(branch => compareBranch(ordered[0], branch));
}

export function runIncentiveForks(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('incentive options must be an object');
  for (const key of Object.keys(options)) if (key !== 'xpFinality') throw new Error('unknown incentive option: ' + key);
  const policy = policyFrom({ xpFinality: 'terminal', ...options, ...LEGACY_FIXTURE_TIMING });
  const branches = INCENTIVE_STRATEGIES.map(strategy => runBranch(strategy, policy));
  return {
    schema: 'facety-incentive-forks/v1', fixture: 'marginal-admission-v1', policy, schedule: { ...SCHEDULE },
    randomness: 'none: deterministic action scripts replay the same prefix',
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
