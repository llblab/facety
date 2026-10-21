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

// Fraction of directed edges whose reverse edge also exists; null without edges.
export function reciprocity(graph) {
  if (!graph.edgeCount) return null;
  let mutual = 0;
  for (const edge of graph.edges()) if (graph.edge(edge.to, edge.from)) mutual++;
  return mutual / graph.edgeCount;
}

// Weak components ignore direction. Fraction of nodes in the largest one; null for an empty graph.
export function largestWeakComponentFraction(graph) {
  if (!graph.size) return null;
  const seen = new Set();
  let largest = 0;
  for (const start of graph.nodeIds()) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [start];
    let size = 0;
    while (stack.length) {
      const id = stack.pop();
      size++;
      for (const edge of graph.outEdges(id)) if (!seen.has(edge.to)) { seen.add(edge.to); stack.push(edge.to); }
      for (const edge of graph.inEdges(id)) if (!seen.has(edge.from)) { seen.add(edge.from); stack.push(edge.from); }
    }
    largest = Math.max(largest, size);
  }
  return largest / graph.size;
}

function ranks(values) {
  const order = values.map((value, index) => [value, index]).sort((a, b) => a[0] - b[0]);
  const result = new Array(values.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) result[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return result;
}

// Tie-averaged Spearman correlation; null when either variable is constant or n < 2.
export function spearman(xs, ys) {
  if (xs.length !== ys.length || [...xs, ...ys].some(value => !Number.isFinite(value))) throw new RangeError('Spearman requires paired finite values');
  if (xs.length < 2) return null;
  const a = ranks(xs);
  const b = ranks(ys);
  const mean = (a.length + 1) / 2;
  let covariance = 0;
  let left = 0;
  let right = 0;
  for (let i = 0; i < a.length; i++) {
    covariance += (a[i] - mean) * (b[i] - mean);
    left += (a[i] - mean) ** 2;
    right += (b[i] - mean) ** 2;
  }
  return left && right ? covariance / Math.sqrt(left * right) : null;
}

// Directed BFS depth from a root set; unreachable nodes are excluded from both statistics.
export function rootDepths(graph, roots) {
  const depth = new Map(roots.filter(id => graph.hasNode(id)).map(id => [id, 0]));
  const queue = [...depth.keys()];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    for (const edge of graph.outEdges(id)) {
      if (depth.has(edge.to)) continue;
      depth.set(edge.to, depth.get(id) + 1);
      queue.push(edge.to);
    }
  }
  const values = [...depth.values()];
  return { maxDepth: values.length ? Math.max(...values) : null, meanDepth: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
}
