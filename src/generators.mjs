// Owns: Synthetic topologies and explicit structural mutations, not protocol admission.
import { DirectedGraph } from './graph.mjs';
import { Random } from './random.mjs';

export const TOPOLOGIES = Object.freeze(['tree', 'random', 'preferential', 'communities', 'clique']);

export function generateGraph({ topology = 'random', size = 100, rootCount = 3, degree = 3, communitySize = 20, seed = 1, maxEdges = 2_000_000 } = {}) {
  if (!TOPOLOGIES.includes(topology)) throw new Error('unknown topology: ' + topology);
  for (const [name, value] of Object.entries({ size, rootCount, degree, communitySize, maxEdges })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(name + ' must be a positive integer');
  }
  if (rootCount > size) throw new RangeError('rootCount exceeds size');
  if (topology === 'clique' && size * (size - 1) > maxEdges) throw new RangeError('clique exceeds maxEdges');
  const random = new Random(seed);
  const graph = new DirectedGraph(topology);
  const nodes = Array.from({ length: size }, (_, i) => 'n' + i);
  for (const node of nodes) graph.addNode(node);
  const connect = (from, to) => {
    if (from === to || graph.edge(from, to)) return;
    if (graph.edgeCount >= maxEdges) throw new RangeError('topology exceeds maxEdges');
    graph.addEdge(from, to);
  };
  if (topology === 'clique') {
    for (const from of nodes) for (const to of nodes) connect(from, to);
  } else if (topology === 'tree' || topology === 'preferential') {
    const weights = nodes.map(() => 1);
    for (let i = rootCount; i < size; i++) {
      const candidates = Array.from({ length: i }, (_, j) => j);
      const count = topology === 'tree' ? 1 : Math.min(degree, i);
      for (let j = 0; j < count; j++) {
        let cursor = random.next() * candidates.reduce((sum, index) => sum + weights[index], 0);
        let position = 0;
        while (position < candidates.length - 1 && cursor >= weights[candidates[position]]) cursor -= weights[candidates[position++]];
        const [parent] = candidates.splice(position, 1);
        connect(nodes[parent], nodes[i]);
        weights[parent]++;
        weights[i]++;
      }
    }
  } else {
    for (let i = 0; i < size; i++) {
      const candidates = nodes.filter((_, j) => j !== i && (topology !== 'communities' || Math.floor(j / communitySize) === Math.floor(i / communitySize)));
      for (const to of random.shuffle(candidates).slice(0, degree)) connect(nodes[i], to);
    }
    if (topology === 'communities') {
      for (let i = communitySize; i < size; i += communitySize) connect(nodes[i - communitySize], nodes[i]);
    }
  }
  return { graph, roots: nodes.slice(0, rootCount), seed: String(seed), topology, parameters: { size, rootCount, degree, communitySize, maxEdges } };
}

export function mutateGraph(graph, { kind = 'remove-random-nodes', count = 1, seed = 1, protectedNodes = [] } = {}) {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('count must be a non-negative integer');
  const random = new Random(seed);
  const protectedSet = new Set(protectedNodes);
  const removedNodes = [];
  const removedEdges = new Map();
  const addedEdges = [];
  const beforeRevision = graph.revision;
  if (kind === 'remove-random-nodes' || kind === 'remove-hubs') {
    let candidates = [...graph.nodeIds()].filter(id => !protectedSet.has(id));
    if (kind === 'remove-hubs') {
      const degree = id => [...graph.outEdges(id)].length + [...graph.inEdges(id)].length;
      const degrees = new Map(candidates.map(id => [id, degree(id)]));
      candidates.sort((a, b) => degrees.get(b) - degrees.get(a) || (a < b ? -1 : a > b ? 1 : 0));
    } else candidates = random.shuffle(candidates);
    for (const id of candidates.slice(0, count)) {
      for (const edge of [...graph.outEdges(id), ...graph.inEdges(id)]) removedEdges.set(edge.id, edge);
      graph.removeNode(id);
      removedNodes.push(id);
    }
  } else if (kind === 'remove-random-edges' || kind === 'rewire') {
    const candidates = random.shuffle([...graph.edges()].filter(edge => !protectedSet.has(edge.from) && !protectedSet.has(edge.to)));
    for (const edge of candidates.slice(0, count)) {
      const alternatives = kind === 'rewire' ? [...graph.nodeIds()].filter(id => id !== edge.from && !graph.edge(edge.from, id)) : [];
      if (kind === 'rewire' && !alternatives.length) continue;
      graph.removeEdge(edge.from, edge.to);
      removedEdges.set(edge.id, edge);
      if (kind === 'rewire') addedEdges.push(graph.addEdge(edge.from, random.pick(alternatives)));
    }
  } else throw new Error('unknown mutation: ' + kind);
  return { kind, seed: String(seed), beforeRevision, afterRevision: graph.revision, removedNodes, removedEdges: [...removedEdges.values()], addedEdges };
}
