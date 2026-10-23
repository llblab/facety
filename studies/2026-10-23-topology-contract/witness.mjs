// Owns: Tiny standalone graph witnesses for OPEN topology contracts, not admission policy.
import assert from 'node:assert/strict';
import { DirectedGraph } from '../../src/graph.mjs';
import { findPathBfs, verifyPath } from '../../src/proofs.mjs';
import { provenance } from '../../src/provenance.mjs';

function graphOf(name, nodes, edges) {
  const graph = new DirectedGraph(name);
  for (const node of nodes) graph.addNode(node);
  for (const [from, to] of edges) graph.addEdge(from, to);
  return graph;
}

function project(graph, mode) {
  const edges = new Map();
  const add = (from, to) => edges.set(JSON.stringify([from, to]), [from, to]);
  for (const { from, to } of graph.edges()) {
    if (mode === 'forward' || mode === 'undirected') add(from, to);
    if (mode === 'reverse' || mode === 'undirected') add(to, from);
    if (mode === 'reciprocal' && graph.edge(to, from)) add(from, to);
  }
  return graphOf(`${graph.name}:${mode}`, [...graph.nodeIds()], [...edges.values()]);
}

function simplePaths(graph, start, anchors) {
  const paths = [];
  function visit(path) {
    const tail = path.at(-1);
    if (anchors.includes(tail)) {
      if (path.length > 1) paths.push(path);
      return;
    }
    for (const { to } of graph.outEdges(tail)) {
      if (!path.includes(to)) visit([...path, to]);
    }
  }
  visit([start]);
  return paths;
}

// Study-only multi-anchor alternative: terminals stop traversal and cannot be intermediaries.
function verifyFamily(graph, paths, start, anchors) {
  const used = new Set();
  const signatures = new Set();
  for (const nodes of paths) {
    const signature = JSON.stringify(nodes);
    const proof = {
      version: 1, graph: graph.name, revision: graph.revision, nodes,
      edgeIds: nodes.slice(1).map((to, i) => graph.edge(nodes[i], to)?.id),
    };
    if (nodes.length < 2 || !anchors.includes(nodes.at(-1)) || signatures.has(signature)) return false;
    if (!verifyPath(graph, proof, { roots: [start], target: nodes.at(-1), requireRevision: true })) return false;
    for (const node of nodes.slice(1, -1)) {
      if (used.has(node) || anchors.includes(node)) return false;
      used.add(node);
    }
    signatures.add(signature);
  }
  return true;
}

// Exhaustive reference on named tiny fixtures only; no production algorithm or performance claim.
function maximumFamily(graph, start, anchors) {
  const paths = simplePaths(graph, start, anchors);
  let best = [];
  function choose(index, family) {
    if (family.length + paths.length - index <= best.length) return;
    if (index === paths.length) {
      best = family;
      return;
    }
    const candidate = [...family, paths[index]];
    if (verifyFamily(graph, candidate, start, anchors)) choose(index + 1, candidate);
    choose(index + 1, family);
  }
  choose(0, []);
  assert(verifyFamily(graph, best, start, anchors));
  return { maximum: best.length, paths: best };
}

const split = graphOf('split-anchors', ['u', 'x', 'y', 'a', 'b'], [
  ['u', 'x'], ['x', 'a'], ['u', 'y'], ['y', 'b'],
]);
const anchorChoice = {
  graph: split.toJSON(), difficulty: 2,
  firstPlaceOnly: maximumFamily(split, 'u', ['a']),
  terminalCoreAlternative: maximumFamily(split, 'u', ['a', 'b']),
};
assert.equal(anchorChoice.firstPlaceOnly.maximum, 1);
assert.equal(anchorChoice.terminalCoreAlternative.maximum, 2);

const outward = graphOf('center-outward', ['u', 'x', 'y', 'a'], [
  ['a', 'x'], ['x', 'u'], ['a', 'y'], ['y', 'u'],
]);
const traversal = { graph: outward.toJSON(), difficulty: 2, projections: {} };
for (const mode of ['forward', 'reverse', 'undirected', 'reciprocal']) {
  traversal.projections[mode] = maximumFamily(project(outward, mode), 'u', ['a']);
}
assert.deepEqual(Object.values(traversal.projections).map(row => row.maximum), [0, 2, 2, 0]);

const bridge = graphOf('shared-internal-vertex', ['u', 'x', 'y', 'z', 'c', 'e', 'a'], [
  ['u', 'x'], ['x', 'z'], ['z', 'c'], ['c', 'a'],
  ['u', 'y'], ['y', 'z'], ['z', 'e'], ['e', 'a'], ['z', 'x'],
]);
const bridgePaths = [['u', 'x', 'z', 'c', 'a'], ['u', 'y', 'z', 'e', 'a']];
assert.equal(verifyFamily(bridge, bridgePaths, 'u', ['a']), false);
assert.equal(maximumFamily(bridge, 'u', ['a']).maximum, 1);
assert.equal(verifyFamily(split, [['u', 'x', 'a'], ['u', 'x', 'a']], 'u', ['a']), false);
assert.equal(verifyFamily(bridge, [['u', 'x', 'z', 'x', 'z', 'c', 'a']], 'u', ['a']), false);
assert.equal(verifyFamily(split, [['u', 'a']], 'u', ['a']), false);

const apex = {
  graph: outward.toJSON(),
  existingReachabilitySelfProof: findPathBfs(outward, { roots: ['a'], target: 'a' }).proof,
  positiveLengthSimpleReturnFamily: maximumFamily(outward, 'a', ['a']),
};
assert(verifyPath(outward, apex.existingReachabilitySelfProof, { roots: ['a'], target: 'a' }));
assert.equal(apex.positiveLengthSimpleReturnFamily.maximum, 0);

const genesis = [7, 9, 10, 12].map(size => {
  const nodes = Array.from({ length: size }, (_, i) => `g${i}`);
  const edges = nodes.flatMap(from => nodes.filter(to => from !== to).map(to => [from, to]));
  const graph = graphOf(`illustrative-complete-genesis-${size}`, nodes, edges);
  const [start, anchor] = nodes;
  const paths = [[start, anchor], ...nodes.slice(2).map(node => [start, node, anchor])];
  assert(verifyFamily(graph, paths, start, [anchor]));
  const degreeBound = [...graph.outEdges(start)].length;
  assert.equal(paths.length, degreeBound);
  const difficulty = String(size).length;
  assert(paths.length >= difficulty);
  return {
    size, difficulty, declaredXp: 0, tiedForHighestXp: size,
    provisionalStart: start, provisionalAnchor: anchor,
    edges: edges.length, certifiedPaths: paths, maximumByDegreeBound: degreeBound,
  };
});

console.log(JSON.stringify({
  status: 'diagnostic-contract-preparation-not-protocol-enforcement',
  baseline: '8b0001c', provenance: provenance(), randomness: 'none-supplied-graphs-v1',
  assumptions: {
    graph: 'standalone declared edges; not funded model admission or verified identity',
    family: 'D36 simple internally vertex-disjoint; no zero-length paths',
    multiAnchor: 'unselected terminal-core alternative; anchors not transit vertices',
    genesis: 'illustrative complete directed graph, all XP zero, manually chosen anchor; no selected genesis fields',
  },
  anchorChoice, traversal, apex, genesis,
  controls: { sharedBridgeRejected: true, duplicateRejected: true, cycleRejected: true, missingEdgeRejected: true },
}, null, 2));
