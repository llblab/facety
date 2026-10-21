import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGraph, mutateGraph, TOPOLOGIES } from '../src/generators.mjs';
import { reachableNodes, findPathBfs, findPathBidirectional, verifyPath } from '../src/proofs.mjs';
import { graphMetrics, gini } from '../src/metrics.mjs';

for (const topology of TOPOLOGIES) {
  test(topology + ': reproducible topology, simple edges and search equivalence', () => {
    const options = { topology, size: 35, rootCount: 2, seed: 'topologies', degree: 3, communitySize: 7 };
    const { graph, roots } = generateGraph(options);
    assert.deepEqual(graph.toJSON(), generateGraph(options).graph.toJSON());
    assert.equal(graph.size, 35);
    for (const edge of graph.edges()) {
      assert.notEqual(edge.from, edge.to);
      assert.ok(graph.hasNode(edge.from) && graph.hasNode(edge.to));
      assert.ok([...graph.inEdges(edge.to)].includes(edge));
    }
    for (const target of graph.nodeIds()) {
      const request = { roots, target };
      const bfs = findPathBfs(graph, request);
      const bi = findPathBidirectional(graph, request);
      assert.equal(bi.status, bfs.status);
      if (bi.proof) {
        assert.equal(verifyPath(graph, bi.proof, request), true);
        assert.equal(bi.proof.edgeIds.length, bfs.proof.edgeIds.length);
      }
    }
    if (topology === 'tree' || topology === 'preferential' || topology === 'clique') assert.equal(reachableNodes(graph, roots).size, graph.size);
    if (topology === 'tree') assert.equal(graph.edgeCount, graph.size - roots.length);
    if (topology === 'clique') assert.equal(graph.edgeCount, graph.size * (graph.size - 1));
  });
}

for (const kind of ['remove-random-nodes', 'remove-hubs', 'remove-random-edges', 'rewire']) {
  test(kind + ': deterministic mutation journals and protected roots', () => {
    const { graph, roots } = generateGraph({ size: 40, seed: 7 });
    const clone = graph.clone();
    const options = { kind, count: 5, seed: 2, protectedNodes: roots };
    const journal = mutateGraph(graph, options);
    assert.deepEqual(journal, mutateGraph(clone, options));
    assert.deepEqual(graph.toJSON(), clone.toJSON());
    assert.ok(roots.every(root => graph.hasNode(root)));
    assert.ok(journal.afterRevision > journal.beforeRevision);
    for (const edge of graph.edges()) {
      assert.ok(graph.hasNode(edge.from) && graph.hasNode(edge.to));
      assert.ok([...graph.inEdges(edge.to)].includes(edge));
    }
    for (const node of journal.removedNodes) assert.equal(graph.hasNode(node), false);
  });
}

test('metrics do not conflate reachability with genuine identity', () => {
  const { graph, roots } = generateGraph({ topology: 'tree', size: 10, rootCount: 1 });
  assert.equal(graphMetrics(graph, roots).reachableFraction, 1);
  assert.equal(graphMetrics(graph, roots, { blockedNodes: roots }).reachable, 0);
  assert.equal(gini([0, 0]), 0);
  assert.equal(gini([1, 1, 1]), 0);
  assert.ok(Math.abs(gini([0, 1]) - 0.5) < 1e-12);
  assert.throws(() => gini([-1, 2]));
  assert.throws(() => generateGraph({ topology: 'clique', size: 100, maxEdges: 10 }));
});
