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

const distanceCache = new WeakMap();
function distancesToTarget(graph, target, limit, blocked) {
  const key = [...blocked].sort().join('\0');
  let entry = distanceCache.get(graph);
  if (!entry || entry.revision !== graph.revision || entry.key !== key) distanceCache.set(graph, entry = { revision: graph.revision, key, byTarget: new Map() });
  const cacheKey = target + '\0' + limit;
  let dist = entry.byTarget.get(cacheKey);
  if (dist) return dist;
  dist = new Map([[target, 0]]);
  for (let frontier = [target], d = 1; frontier.length && d <= limit; d++) {
    const next = [];
    for (const id of frontier) for (const edge of graph.inEdges(id)) {
      const from = edge.from;
      if (blocked.has(from) || dist.has(from) || from === target) continue;
      dist.set(from, d);
      next.push(from);
    }
    frontier = next;
  }
  entry.byTarget.set(cacheKey, dist);
  return dist;
}

// Exact length-bounded search: internally vertex-disjoint paths of at most maxNodes nodes each (both endpoints counted).
// The unbounded flow is a polynomial necessary check. Paths are then built lazily, shortest-first, by backtracking: every
// chosen path blocks its internal nodes, distances to the target are recomputed on what remains, and cheap counting bounds
// prune hopeless branches. Complete families are tried in ascending first-hop order, so no family is searched twice. A work
// budget turns pathological inputs into an explicit 'budget-exhausted' status, never a silent answer.
export function findLengthBoundedDisjointPaths(graph, { source, target, minimumPaths, maxNodes, blockedNodes = [], budget = 2_000_000 }) {
  if (!Number.isSafeInteger(minimumPaths) || minimumPaths < 1) throw new RangeError('minimumPaths must be a positive safe integer');
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 2) throw new RangeError('maxNodes must be a safe integer of at least 2');
  if (!Array.isArray(blockedNodes)) throw new TypeError('blockedNodes must be an array');
  const { blocked } = prepare(graph, { roots: [source], target, blockedNodes });
  if (source === target) throw new Error('distinct source and target required; apex policy is not supplied');
  const stats = { steps: 0, flowChecked: false };
  const finish = (status, paths = []) => ({ status, count: paths.length, required: minimumPaths, stats,
    proof: { version: 1, kind: 'internally-vertex-disjoint-paths', graph: graph.name, revision: graph.revision, source, target, paths: paths.map(route => certificate(graph, route)) } });
  if (blocked.has(source) || blocked.has(target)) return finish('insufficient');
  const flow = findInternallyDisjointPaths(graph, { source, target, minimumPaths, blockedNodes });
  stats.flowChecked = true;
  if (flow.status !== 'found') return finish('insufficient');
  const limit = maxNodes - 1;
  let exhausted = false;
  // Distances to the target ignore the paths chosen so far, so they are lower bounds (sound for pruning) and are shared
  // between calls on the same graph revision, blocked set and target.
  const dist = distancesToTarget(graph, target, limit, blocked);
  // Choose `need` more paths whose first hops all sort after `after`; `used` holds the internal nodes of the paths chosen so far.
  const solve = (need, used, after, chosen) => {
    if (need === 0) return chosen;
    if (exhausted) return null;
    const hops = [];
    for (const edge of graph.outEdges(source)) {
      const to = edge.to;
      if (to === source || (to !== target && (used.has(to) || !dist.has(to))) || (to !== target && 1 + dist.get(to) > limit) || (after !== null && !(to > after))) continue;
      hops.push(to);
    }
    hops.sort((x, y) => (x === target ? 0 : dist.get(x)) - (y === target ? 0 : dist.get(y)) || (x < y ? -1 : 1));
    if (hops.length < need) return null;
    // Candidates are tried in ascending distance, but the family must use ascending first hops: pick the first hop of THIS path
    // among all hops, then require later paths to start strictly after the smallest first hop of the whole family.
    const ascending = [...hops].sort((x, y) => (x < y ? -1 : 1));
    for (let i = 0; i + need <= ascending.length && !exhausted; i++) {
      const first = ascending[i];
      const walk = [source, first], onWalk = new Set(walk);
      const extend = at => {
        if (exhausted) return null;
        if (++stats.steps > budget) { exhausted = true; return null; }
        if (at === target) {
          const internals = walk.slice(1, -1);
          return solve(need - 1, new Set([...used, ...internals]), first, [...chosen, [...walk]]);
        }
        const options = [];
        for (const edge of graph.outEdges(at)) {
          const to = edge.to;
          if (onWalk.has(to) || (to !== target && used.has(to)) || !dist.has(to) || walk.length + dist.get(to) > limit) continue;
          options.push(to);
        }
        options.sort((x, y) => dist.get(x) - dist.get(y) || (x < y ? -1 : 1));
        for (const to of options) {
          walk.push(to); onWalk.add(to);
          const found = extend(to);
          walk.pop(); onWalk.delete(to);
          if (found) return found;
        }
        return null;
      };
      const found = first === target ? solve(need - 1, used, first, [...chosen, [source, target]]) : (dist.has(first) ? extend(first) : null);
      if (found) return found;
    }
    return null;
  };
  if (!dist.has(source)) return finish("insufficient");
  const packed = solve(minimumPaths, new Set(), null, []);
  if (packed) return finish('found', packed);
  return finish(exhausted ? 'budget-exhausted' : 'insufficient');
}

// Layered support (D124): seeds sit at level 0; a node gets level k when, after round k - 1, at least `threshold` of its mutual,
// unblocked neighbors already have a level (all strictly lower). Rounds stop at maxLevel. Unleveled nodes are absent from the map.
export function findLayeredSupport(graph, { seeds, threshold, maxLevel, blockedNodes = [] }) {
  if (!Array.isArray(seeds) || !Array.isArray(blockedNodes)) throw new TypeError('seeds and blockedNodes must be arrays');
  if (!Number.isSafeInteger(threshold) || threshold < 1) throw new RangeError('threshold must be a positive safe integer');
  if (!Number.isSafeInteger(maxLevel) || maxLevel < 0) throw new RangeError('maxLevel must be a non-negative safe integer');
  const blocked = new Set(blockedNodes);
  const level = new Map();
  let frontier = [];
  for (const id of seeds) if (graph.hasNode(id) && !blocked.has(id) && !level.has(id)) { level.set(id, 0); frontier.push(id); }
  const support = new Map();
  for (let round = 1; round <= maxLevel && frontier.length; round++) {
    const reached = [];
    for (const id of frontier) for (const edge of graph.inEdges(id)) {
      const other = edge.from;
      if (level.has(other) || blocked.has(other) || !graph.edge(id, other)) continue;
      const count = (support.get(other) ?? 0) + 1;
      support.set(other, count);
      if (count === threshold) reached.push(other);
    }
    for (const id of reached) level.set(id, round);
    frontier = reached;
  }
  return level;
}

// Independent soundness check: every claimed level is justified by `threshold` mutual neighbors with a strictly lower level.
export function verifyLayeredSupport(graph, level, { seeds, threshold, maxLevel, blockedNodes = [] }) {
  const blocked = new Set(blockedNodes), seedSet = new Set(seeds);
  for (const [id, value] of level) {
    if (!graph.hasNode(id) || blocked.has(id) || !Number.isSafeInteger(value) || value < 0 || value > maxLevel) return false;
    if (value === 0) { if (!seedSet.has(id)) return false; continue; }
    let lower = 0;
    for (const edge of graph.inEdges(id)) if (graph.edge(id, edge.from) && level.has(edge.from) && level.get(edge.from) < value) lower++;
    if (lower < threshold) return false;
  }
  return true;
}

// A family certifies a lower bound only; this verifier does not trust solver counts or prove a maximum.
export function verifyInternallyDisjointPaths(graph, proof, { source, target, minimumPaths, blockedNodes = [], requireRevision = true, maxNodes = Infinity }) {
  if (maxNodes !== Infinity && (!Number.isSafeInteger(maxNodes) || maxNodes < 2)) return false;
  if (!Number.isSafeInteger(minimumPaths) || minimumPaths < 1 || !Array.isArray(blockedNodes) || typeof requireRevision !== 'boolean') return false;
  if (!graph.hasNode(source) || !graph.hasNode(target) || source === target) return false;
  if (!proof || proof.version !== 1 || proof.kind !== 'internally-vertex-disjoint-paths' || proof.graph !== graph.name) return false;
  if (proof.source !== source || proof.target !== target || (requireRevision && proof.revision !== graph.revision)) return false;
  if (!Array.isArray(proof.paths) || proof.paths.length < minimumPaths) return false;
  const routes = new Set();
  const internal = new Set();
  for (const path of proof.paths) {
    if (!verifyPath(graph, path, { roots: [source], target, blockedNodes, requireRevision }) || path.nodes.length < 2 || path.nodes.length > maxNodes) return false;
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
