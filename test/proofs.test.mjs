import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectedGraph } from '../src/graph.mjs';
import { findPathBfs, findPathBidirectional, verifyPath, reachableNodes } from '../src/proofs.mjs';

const algorithms = [findPathBfs, findPathBidirectional];
function fixture() {
  const graph = new DirectedGraph('identifications');
  for (const id of ['r', 'a', 'b', 't', 'isolated']) graph.addNode(id);
  for (const [from, to] of [['r', 'a'], ['a', 't'], ['r', 'b'], ['b', 't'], ['t', 'a']]) graph.addEdge(from, to);
  return graph;
}

for (const search of algorithms) {
  test(search.name + ': directed paths, alternate routes, blocked nodes and unreachable targets', () => {
    const graph = fixture();
    const options = { roots: ['r'], target: 't' };
    const found = search(graph, options);
    assert.equal(found.status, 'found');
    assert.equal(found.proof.edgeIds.length, 2);
    assert.equal(verifyPath(graph, found.proof, options), true);
    assert.equal(search(graph, { roots: ['t'], target: 'r' }).status, 'unreachable');
    assert.equal(search(graph, { roots: ['r'], target: 'isolated' }).status, 'unreachable');
    assert.equal(search(graph, { ...options, blockedNodes: ['a'] }).proof.nodes.includes('a'), false);
    assert.equal(search(graph, { ...options, blockedNodes: ['a', 'b'] }).status, 'unreachable');
    assert.deepEqual(search(graph, { roots: ['t'], target: 't' }).proof.nodes, ['t']);
    assert.equal(search(graph, { ...options, maxVisited: 1 }).status, 'budget-exceeded');
    assert.throws(() => search(graph, { roots: ['absent'], target: 't' }));
  });
}

test('verifier uses canonical roots, edges, direction and target, not certificate assertions', () => {
  const graph = fixture();
  const options = { roots: ['r'], target: 't' };
  const { proof } = findPathBfs(graph, options);
  assert.equal(verifyPath(graph, { ...proof, nodes: ['r', 't'], edgeIds: [proof.edgeIds[0]] }, options), false);
  assert.equal(verifyPath(graph, proof, { ...options, roots: ['a'] }), false);
  assert.equal(verifyPath(graph, proof, { ...options, target: 'a' }), false);
  assert.equal(verifyPath(graph, proof, { ...options, blockedNodes: [proof.nodes[1]] }), false);
  graph.addNode('unrelated');
  assert.equal(verifyPath(graph, proof, options), true);
  assert.equal(verifyPath(graph, proof, { ...options, requireRevision: true }), false);
  const [from, to] = proof.nodes;
  graph.removeEdge(from, to);
  assert.equal(verifyPath(graph, proof, options), false);
  graph.addEdge(from, to);
  assert.equal(verifyPath(graph, proof, options), false);
});

test('bidirectional search agrees with BFS on all directed simple graphs of four nodes', () => {
  const nodes = ['0', '1', '2', '3'];
  const possible = nodes.flatMap(from => nodes.filter(to => to !== from).map(to => [from, to]));
  for (let mask = 0; mask < 2 ** possible.length; mask++) {
    const graph = new DirectedGraph();
    for (const node of nodes) graph.addNode(node);
    possible.forEach(([from, to], bit) => { if (mask & (1 << bit)) graph.addEdge(from, to); });
    for (const roots of [['0'], ['0', '1']]) {
      const options = { roots, target: '3' };
      const bfs = findPathBfs(graph, options);
      const bidirectional = findPathBidirectional(graph, options);
      assert.equal(bidirectional.status, bfs.status, 'reachability at mask ' + mask);
      if (!bfs.proof) continue;
      assert.equal(bidirectional.proof.edgeIds.length, bfs.proof.edgeIds.length, 'distance at mask ' + mask);
      assert.equal(verifyPath(graph, bidirectional.proof, options), true);
    }
  }
});

test('reachability handles removed roots and blocked nodes without treating disconnection as fraud', () => {
  const graph = fixture();
  assert.deepEqual([...reachableNodes(graph, ['missing', 'r'], { blockedNodes: ['a', 'b'] })], ['r']);
});
