// Owns: Directed reachability certificates and search, not human-identity proofs.
function prepare(graph, { roots, target, blockedNodes = [], maxVisited = Infinity }) {
  if (!Array.isArray(roots) || roots.some(id => !graph.hasNode(id))) throw new Error('roots must be canonical graph nodes');
  if (!graph.hasNode(target)) throw new Error('target must be a graph node');
  if (maxVisited !== Infinity && (!Number.isSafeInteger(maxVisited) || maxVisited < 1)) throw new RangeError('maxVisited must be positive');
  const blocked = new Set(blockedNodes);
  return { roots: [...new Set(roots)].filter(id => !blocked.has(id)), target, blocked, maxVisited };
}

function certificate(graph, nodes) {
  return {
    version: 1,
    graph: graph.name,
    revision: graph.revision,
    nodes,
    edgeIds: nodes.slice(1).map((to, i) => graph.edge(nodes[i], to).id),
  };
}

function result(graph, nodes, stats, status = 'unreachable') {
  return { status: nodes ? 'found' : status, proof: nodes ? certificate(graph, nodes) : null, stats };
}

export function findPathBfs(graph, options) {
  const { roots, target, blocked, maxVisited } = prepare(graph, options);
  const parents = new Map();
  const queue = [];
  const stats = { visited: 0, edgeChecks: 0 };
  if (blocked.has(target)) return result(graph, null, stats);
  if (roots.includes(target)) return result(graph, [target], { visited: 1, edgeChecks: 0 });
  for (const root of roots) {
    if (stats.visited === maxVisited) return result(graph, null, stats, 'budget-exceeded');
    parents.set(root, null);
    queue.push(root);
    stats.visited++;
  }
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current === target) {
      const nodes = [];
      for (let node = target; node !== null; node = parents.get(node)) nodes.push(node);
      return result(graph, nodes.reverse(), stats);
    }
    for (const edge of graph.outEdges(current)) {
      stats.edgeChecks++;
      if (blocked.has(edge.to) || parents.has(edge.to)) continue;
      if (stats.visited === maxVisited) return result(graph, null, stats, 'budget-exceeded');
      parents.set(edge.to, current);
      queue.push(edge.to);
      stats.visited++;
    }
  }
  return result(graph, null, stats);
}

export function findPathBidirectional(graph, options) {
  const { roots, target, blocked, maxVisited } = prepare(graph, options);
  const stats = { visited: 0, edgeChecks: 0 };
  if (!roots.length || blocked.has(target)) return result(graph, null, stats);
  if (roots.includes(target)) return result(graph, [target], { visited: 1, edgeChecks: 0 });
  const left = new Map();
  const right = new Map();
  for (const root of roots) {
    if (stats.visited === maxVisited) return result(graph, null, stats, 'budget-exceeded');
    left.set(root, { parent: null, depth: 0 });
    stats.visited++;
  }
  if (stats.visited === maxVisited) return result(graph, null, stats, 'budget-exceeded');
  right.set(target, { parent: null, depth: 0 });
  stats.visited++;
  let frontLeft = roots;
  let frontRight = [target];
  while (frontLeft.length && frontRight.length) {
    const forward = frontLeft.length <= frontRight.length;
    const own = forward ? left : right;
    const other = forward ? right : left;
    const frontier = forward ? frontLeft : frontRight;
    const next = [];
    let meeting = null;
    let distance = Infinity;
    for (const current of frontier) {
      for (const edge of forward ? graph.outEdges(current) : graph.inEdges(current)) {
        stats.edgeChecks++;
        const neighbor = forward ? edge.to : edge.from;
        if (blocked.has(neighbor) || own.has(neighbor)) continue;
        if (stats.visited === maxVisited) return result(graph, null, stats, 'budget-exceeded');
        own.set(neighbor, { parent: current, depth: own.get(current).depth + 1 });
        stats.visited++;
        next.push(neighbor);
        if (other.has(neighbor)) {
          const length = own.get(neighbor).depth + other.get(neighbor).depth;
          if (length < distance) {
            meeting = neighbor;
            distance = length;
          }
        }
      }
    }
    if (meeting !== null) {
      const nodes = [];
      for (let node = meeting; node !== null; node = left.get(node).parent) nodes.push(node);
      nodes.reverse();
      for (let node = right.get(meeting).parent; node !== null; node = right.get(node).parent) nodes.push(node);
      return result(graph, nodes, stats);
    }
    if (forward) frontLeft = next;
    else frontRight = next;
  }
  return result(graph, null, stats);
}

export function verifyPath(graph, proof, { roots, target, blockedNodes = [], requireRevision = false }) {
  if (!proof || proof.version !== 1 || proof.graph !== graph.name) return false;
  if (requireRevision && proof.revision !== graph.revision) return false;
  if (!Array.isArray(proof.nodes) || !Array.isArray(proof.edgeIds) || !proof.nodes.length) return false;
  if (proof.edgeIds.length !== proof.nodes.length - 1 || proof.nodes.at(-1) !== target || !roots.includes(proof.nodes[0])) return false;
  const blocked = new Set(blockedNodes);
  if (new Set(proof.nodes).size !== proof.nodes.length || proof.nodes.some(id => !graph.hasNode(id) || blocked.has(id))) return false;
  for (let i = 0; i < proof.edgeIds.length; i++) {
    if (graph.edge(proof.nodes[i], proof.nodes[i + 1])?.id !== proof.edgeIds[i]) return false;
  }
  return true;
}

export function reachableNodes(graph, roots, { blockedNodes = [] } = {}) {
  const blocked = new Set(blockedNodes);
  const visited = new Set(roots.filter(id => graph.hasNode(id) && !blocked.has(id)));
  const queue = [...visited];
  for (let head = 0; head < queue.length; head++) {
    for (const edge of graph.outEdges(queue[head])) {
      if (visited.has(edge.to) || blocked.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push(edge.to);
    }
  }
  return visited;
}
