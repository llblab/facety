// Owns: Observations and evaluator metrics, not protocol authority.
import { reachableNodes } from './proofs.mjs';

export function gini(values) {
  if (!values.length) return 0;
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new RangeError('Gini requires non-negative finite values');
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (!total) return 0;
  return sorted.reduce((sum, value, i) => sum + (2 * (i + 1) - sorted.length - 1) * value, 0) / (sorted.length * total);
}

export function xpMetrics(values) {
  const coefficient = gini(values);
  const total = values.reduce((sum, value) => sum + value, 0);
  return { total, gini: total ? coefficient : null };
}

export function graphMetrics(graph, roots, { blockedNodes = [] } = {}) {
  const reachable = reachableNodes(graph, roots, { blockedNodes });
  const degree = [...graph.nodeIds()].map(id => [...graph.inEdges(id)].length + [...graph.outEdges(id)].length);
  return {
    nodes: graph.size,
    edges: graph.edgeCount,
    reachable: reachable.size,
    unreachable: graph.size - reachable.size,
    reachableFraction: graph.size ? reachable.size / graph.size : 0,
    meanDegree: graph.size ? 2 * graph.edgeCount / graph.size : 0,
    maxDegree: degree.reduce((max, value) => Math.max(max, value), 0),
    degreeGini: gini(degree),
  };
}

export function modelMetrics(model, { attackerIds = [] } = {}) {
  const attackers = new Set(attackerIds);
  const subjects = model.subjects();
  const council = model.council();
  const falseIds = subjects.filter(subject => subject.identityStatus === 'false').map(subject => subject.id);
  return {
    subjects: model.size,
    activeSubjects: model.activeCount(),
    requiredGuarantors: model.requiredGuarantors(),
    ledger: model.audit(),
    xp: xpMetrics(subjects.map(subject => subject.xp)),
    council: { members: council, attackerSeats: council.filter(subject => attackers.has(subject.id)).length, seats: council.length },
    guarantees: graphMetrics(model.guarantees, model.roots, { blockedNodes: falseIds }),
    lineage: graphMetrics(model.lineage, model.roots, { blockedNodes: falseIds }),
  };
}
