// Owns: Directed reachability and disjoint-path certificates/search, not identity truth or admission policy.
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
    const edge = graph.edge(proof.nodes[i], proof.nodes[i + 1]);
    if (!edge || edge.id !== proof.edgeIds[i]) return false;
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

// This primitive requires explicit, distinct endpoints; it selects no XP anchor or apex exception.
export function findInternallyDisjointPaths(graph, { source, target, minimumPaths, blockedNodes = [] }) {
  if (!Number.isSafeInteger(minimumPaths) || minimumPaths < 1) throw new RangeError('minimumPaths must be a positive safe integer');
  if (!Array.isArray(blockedNodes)) throw new TypeError('blockedNodes must be an array');
  const { roots, blocked } = prepare(graph, { roots: [source], target, blockedNodes });
  if (source === target) throw new Error('distinct source and target required; apex policy is not supplied');
  const stats = { augmentations: 0, searches: 0, residualEdgeChecks: 0 };
  const paths = [];
  const finish = () => ({
    status: paths.length >= minimumPaths ? 'found' : 'insufficient', count: paths.length, required: minimumPaths,
    proof: { version: 1, kind: 'internally-vertex-disjoint-paths', graph: graph.name, revision: graph.revision, source, target, paths }, stats,
  });
  if (!roots.length || blocked.has(target)) return finish();
  const nodes = [...graph.nodeIds()].filter(id => !blocked.has(id));
  const indexes = new Map(nodes.map((id, i) => [id, i]));
  const residual = Array.from({ length: 2 * nodes.length }, () => []);
  const originals = [];
  function arc(from, to) {
    const forward = { to, reverse: residual[to].length, capacity: 1 };
    const backward = { to: from, reverse: residual[from].length, capacity: 0 };
    residual[from].push(forward);
    residual[to].push(backward);
    return forward;
  }
  // Splitting each internal vertex caps its total flow at one, not merely each original edge.
  for (const [id, index] of indexes) if (id !== source && id !== target) arc(2 * index, 2 * index + 1);
  for (const edge of graph.edges()) {
    if (blocked.has(edge.from) || blocked.has(edge.to) || edge.to === source || edge.from === target) continue;
    originals.push({ edge, forward: arc(2 * indexes.get(edge.from) + 1, 2 * indexes.get(edge.to)) });
  }
  const start = 2 * indexes.get(source) + 1;
  const end = 2 * indexes.get(target);
  while (stats.augmentations < minimumPaths) {
    stats.searches++;
    const parents = Array(residual.length).fill(null);
    parents[start] = { from: start, index: -1 };
    const queue = [start];
    for (let head = 0; head < queue.length && parents[end] === null; head++) {
      const from = queue[head];
      for (let index = 0; index < residual[from].length; index++) {
        stats.residualEdgeChecks++;
        const edge = residual[from][index];
        if (!edge.capacity || parents[edge.to] !== null) continue;
        parents[edge.to] = { from, index };
        queue.push(edge.to);
        if (edge.to === end) break;
      }
    }
    if (parents[end] === null) break;
    for (let at = end; at !== start;) {
      const { from, index } = parents[at];
      const edge = residual[from][index];
      edge.capacity--;
      residual[at][edge.reverse].capacity++;
      at = from;
    }
    stats.augmentations++;
  }
  // Decompose the final flow, not the augmenting walks: later residual walks can reroute earlier ones.
  const used = new Set(originals.filter(({ forward }) => !forward.capacity).map(({ edge }) => edge.id));
  for (let count = 0; count < stats.augmentations; count++) {
    const parents = new Map([[source, null]]);
    const queue = [source];
    for (let head = 0; head < queue.length && !parents.has(target); head++) {
      for (const edge of graph.outEdges(queue[head])) {
        if (!used.has(edge.id) || parents.has(edge.to)) continue;
        parents.set(edge.to, edge.from);
        queue.push(edge.to);
      }
    }
    if (!parents.has(target)) throw new Error('disjoint path flow decomposition failed');
    const route = [];
    for (let at = target; at !== null; at = parents.get(at)) route.push(at);
    route.reverse();
    for (let i = 1; i < route.length; i++) used.delete(graph.edge(route[i - 1], route[i]).id);
    paths.push(certificate(graph, route));
  }
  return finish();
}

// A family certifies a lower bound only; this verifier does not trust solver counts or prove a maximum.
export function verifyInternallyDisjointPaths(graph, proof, { source, target, minimumPaths, blockedNodes = [], requireRevision = true }) {
  if (!Number.isSafeInteger(minimumPaths) || minimumPaths < 1 || !Array.isArray(blockedNodes) || typeof requireRevision !== 'boolean') return false;
  if (!graph.hasNode(source) || !graph.hasNode(target) || source === target) return false;
  if (!proof || proof.version !== 1 || proof.kind !== 'internally-vertex-disjoint-paths' || proof.graph !== graph.name) return false;
  if (proof.source !== source || proof.target !== target || (requireRevision && proof.revision !== graph.revision)) return false;
  if (!Array.isArray(proof.paths) || proof.paths.length < minimumPaths) return false;
  const routes = new Set();
  const internal = new Set();
  for (const path of proof.paths) {
    if (!verifyPath(graph, path, { roots: [source], target, blockedNodes, requireRevision }) || path.nodes.length < 2) return false;
    const key = JSON.stringify(path.nodes);
    if (routes.has(key)) return false;
    routes.add(key);
    for (const id of path.nodes.slice(1, -1)) {
      if (internal.has(id)) return false;
      internal.add(id);
    }
  }
  return true;
}
