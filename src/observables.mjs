// Owns: Passive macro-state and activity measurements; excludes agent decisions and emergence claims.
import { xpMetrics, graphMetrics, reciprocity, largestWeakComponentFraction, spearman, rootDepths } from './metrics.mjs';
import { reachableNodes } from './proofs.mjs';
import { COHORTS } from './effort.mjs';

export function cohortMixing(graph, labels) {
  const counts = { honest: { honest: 0, attackers: 0 }, attackers: { honest: 0, attackers: 0 } };
  const population = { honest: 0, attackers: 0 };
  for (const id of graph.nodeIds()) {
    const cohort = labels.get(id)?.cohort;
    if (!COHORTS.includes(cohort)) throw new Error('missing evaluator cohort: ' + id);
    population[cohort]++;
  }
  for (const edge of graph.edges()) counts[labels.get(edge.from).cohort][labels.get(edge.to).cohort]++;
  const edges = graph.edgeCount;
  const same = counts.honest.honest + counts.attackers.attackers;
  let expected = 0;
  if (edges) {
    for (const cohort of COHORTS) {
      const outgoing = COHORTS.reduce((sum, target) => sum + counts[cohort][target], 0) / edges;
      const incoming = COHORTS.reduce((sum, source) => sum + counts[source][cohort], 0) / edges;
      expected += outgoing * incoming;
    }
  }
  const baseline = graph.size > 1
    ? COHORTS.reduce((sum, cohort) => sum + population[cohort] * (population[cohort] - 1), 0) / (graph.size * (graph.size - 1))
    : null;
  const within = edges ? same / edges : null;
  return {
    counts,
    withinCohortFraction: within,
    populationMixingBaseline: baseline,
    excessWithinCohortFraction: within !== null && baseline !== null ? within - baseline : null,
    directedAssortativity: edges && 1 - expected > 4 * Number.EPSILON ? (within - expected) / (1 - expected) : null,
  };
}

export function measureNetwork(model, truth, { previousCouncilIds = null } = {}) {
  const subjects = model.subjects();
  for (const subject of subjects) {
    const label = truth.get(subject.id);
    if (!label || !COHORTS.includes(label.cohort) || typeof label.genuine !== 'boolean' || typeof label.operator !== 'string') throw new Error('missing evaluator identity: ' + subject.id);
  }
  const rankedXp = subjects.map(subject => subject.xp).sort((a, b) => b - a);
  const xp = xpMetrics(rankedXp);
  const totalXp = xp.total;
  const council = model.council();
  const councilIds = council.map(subject => subject.id);
  let membershipChurn = null;
  if (previousCouncilIds !== null) {
    const previous = new Set(previousCouncilIds);
    const union = new Set([...previous, ...councilIds]);
    const intersection = councilIds.filter(id => previous.has(id)).length;
    membershipChurn = union.size ? 1 - intersection / union.size : 0;
  }
  const attackerSubjects = subjects.filter(subject => truth.get(subject.id).cohort === 'attackers');
  const falseSubjects = subjects.filter(subject => !truth.get(subject.id).genuine);
  const active = new Set(subjects.filter(subject => model.isActive(subject.id)).map(subject => subject.id));
  const required = model.requiredGuarantors();
  const eligible = new Set(subjects.filter(subject => subject.identityStatus === 'accepted'
    && (model.policy.guarantorEligibility === 'accepted' || active.has(subject.id))).map(subject => subject.id));
  let guaranteeQualified = 0;
  let inviteReady = 0;
  for (const subject of subjects) {
    if (subject.identityStatus !== 'accepted') continue;
    const guarantors = [...model.guarantees.inEdges(subject.id)].filter(edge => eligible.has(edge.from)).length;
    if (guarantors < required) continue;
    guaranteeQualified++;
    if (model.eligibleEmissions(subject.id).length) inviteReady++;
  }
  const blocked = subjects.filter(subject => subject.identityStatus === 'false').map(subject => subject.id);
  const connected = reachableNodes(model.guarantees, model.roots, { blockedNodes: blocked });
  const honest = subjects.filter(subject => truth.get(subject.id).cohort === 'honest');
  const roots = new Set(model.roots);
  const nonRootHonest = honest.filter(subject => !roots.has(subject.id));
  const graph = graphMetrics(model.guarantees, model.roots, { blockedNodes: blocked });
  const mixing = cohortMixing(model.guarantees, truth);
  const attackEdges = mixing.counts.honest.attackers + mixing.counts.attackers.honest;
  const attackerXpShare = totalXp ? attackerSubjects.reduce((sum, subject) => sum + subject.xp, 0) / totalXp : null;
  const lineage = rootDepths(model.lineage, model.roots);
  return {
    subjects: subjects.length,
    activeSubjects: active.size,
    requiredGuarantors: required,
    attackerSubjects: attackerSubjects.length,
    attackerShare: attackerSubjects.length / subjects.length,
    falseSubjects: falseSubjects.length,
    falseShare: falseSubjects.length / subjects.length,
    humanOperators: new Set(subjects.map(subject => truth.get(subject.id).operator)).size,
    xp: {
      ...xp,
      topDecileShare: totalXp ? rankedXp.slice(0, Math.ceil(subjects.length / 10)).reduce((sum, xp) => sum + xp, 0) / totalXp : null,
      attackerShare: attackerXpShare,
      attackerExcessShare: attackerXpShare === null ? null : attackerXpShare - attackerSubjects.length / subjects.length,
      outDegreeSpearman: spearman(subjects.map(subject => subject.xp), subjects.map(subject => [...model.guarantees.outEdges(subject.id)].length)),
    },
    council: {
      memberIds: councilIds,
      attackerShare: council.length ? council.filter(subject => truth.get(subject.id).cohort === 'attackers').length / council.length : null,
      membershipChurn,
    },
    graph: {
      edges: graph.edges,
      density: subjects.length > 1 ? graph.edges / (subjects.length * (subjects.length - 1)) : 0,
      meanDegree: graph.meanDegree, maxDegree: graph.maxDegree, degreeGini: graph.degreeGini,
      reciprocity: reciprocity(model.guarantees),
      largestWeakComponentFraction: largestWeakComponentFraction(model.guarantees),
      attackEdges,
      attackEdgesPerAttacker: attackerSubjects.length ? attackEdges / attackerSubjects.length : null,
      mixing,
    },
    lineage,
    admission: {
      guaranteeQualified, guaranteeQualifiedFraction: guaranteeQualified / subjects.length,
      inviteReady, inviteReadyFraction: inviteReady / subjects.length,
    },
    connectivity: {
      rootedFraction: graph.reachableFraction,
      honestFraction: honest.length ? honest.filter(subject => connected.has(subject.id)).length / honest.length : null,
      honestNonRootFraction: nonRootHonest.length ? nonRootHonest.filter(subject => connected.has(subject.id)).length / nonRootHonest.length : null,
    },
  };
}

export function measureWork(current, previous = null) {
  const delta = (row, old = {}) => ({
    attempts: row.attempts - (old.attempts ?? 0),
    accepted: row.accepted - (old.accepted ?? 0),
    rejected: row.rejected - (old.rejected ?? 0),
    denied: row.denied - (old.denied ?? 0),
    effort: (Math.round(row.effort * 1e6) - Math.round((old.effort ?? 0) * 1e6)) / 1e6,
  });
  return Object.fromEntries(COHORTS.map(cohort => {
    const row = current[cohort];
    const old = previous?.[cohort];
    const work = delta(row, old);
    if (Object.values(work).some(value => value < 0)) throw new Error('work counters cannot decrease');
    return [cohort, {
      cumulativeEffort: row.effort,
      sincePrevious: work,
      byAction: Object.fromEntries(Object.entries(row.byAction).map(([action, value]) => [action, delta(value, old?.byAction[action])])),
    }];
  }));
}
