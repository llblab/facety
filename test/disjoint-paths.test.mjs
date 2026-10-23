import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectedGraph } from '../src/graph.mjs';
import { findPathBfs, findInternallyDisjointPaths, verifyInternallyDisjointPaths } from '../src/proofs.mjs';

function graphOf(nodes, edges) {
  const graph = new DirectedGraph('explicit-path-query');
  for (const id of nodes) graph.addNode(id);
  for (const [from, to] of edges) graph.addEdge(from, to);
  return graph;
}
function path(graph, nodes) {
  return { version: 1, graph: graph.name, revision: graph.revision, nodes, edgeIds: nodes.slice(1).map((to, i) => graph.edge(nodes[i], to)?.id) };
}
function family(graph, routes, source = 's', target = 't') {
  return {
    version: 1, kind: 'internally-vertex-disjoint-paths', graph: graph.name, revision: graph.revision,
    source, target, paths: routes.map(nodes => path(graph, nodes)),
  };
}
// Independent tiny-graph oracle: enumerate simple paths, then pack disjoint internal-vertex sets.
function referenceMaximum(graph, source, target, blockedNodes = []) {
  const blocked = new Set(blockedNodes);
  if (blocked.has(source) || blocked.has(target)) return 0;
  const masks = [];
  const positions = new Map([...graph.nodeIds()].map((id, i) => [id, 1 << i]));
  function visit(at, seen, internal) {
    if (at === target) { masks.push(internal); return; }
    for (const edge of graph.outEdges(at)) {
      if (blocked.has(edge.to) || seen.has(edge.to)) continue;
      visit(edge.to, new Set([...seen, edge.to]), internal | (edge.to === target ? 0 : positions.get(edge.to)));
    }
  }
  visit(source, new Set([source]), 0);
  const packed = new Map([[0, 0]]);
  for (const mask of masks) {
    for (const [used, count] of [...packed]) {
      if (used & mask) continue;
      packed.set(used | mask, Math.max(packed.get(used | mask) ?? 0, count + 1));
    }
  }
  return Math.max(...packed.values());
}

test('fixed-endpoint search certifies a requested number, including a direct path only once, without graph mutation', () => {
  const graph = graphOf(['s', 'a', 'b', 't'], [['s', 't'], ['s', 'a'], ['a', 't'], ['s', 'b'], ['b', 't'], ['a', 'b'], ['b', 'a']]);
  const before = graph.toJSON();
  for (const minimumPaths of [1, 2, 3, 4, Number.MAX_SAFE_INTEGER]) {
    const options = { source: 's', target: 't', minimumPaths };
    const found = findInternallyDisjointPaths(graph, options);
    assert.equal(found.count, Math.min(3, minimumPaths));
    assert.equal(found.stats.augmentations, found.count);
    assert.equal(found.status, minimumPaths <= 3 ? 'found' : 'insufficient');
    assert.equal(verifyInternallyDisjointPaths(graph, found.proof, options), minimumPaths <= 3);
    assert.equal(verifyInternallyDisjointPaths(graph, found.proof, { ...options, minimumPaths: found.count }), true);
    assert.deepEqual(findInternallyDisjointPaths(DirectedGraph.fromJSON(before), options), found);
    assert.deepEqual(findInternallyDisjointPaths(graph, options), found);
    assert.deepEqual(graph.toJSON(), before);
  }
  for (const blockedNodes of [['a'], ['a', 'b'], ['s'], ['t']]) {
    const options = { source: 's', target: 't', minimumPaths: 3, blockedNodes };
    assert.equal(findInternallyDisjointPaths(graph, options).count, referenceMaximum(graph, 's', 't', blockedNodes));
  }
  for (const minimumPaths of [undefined, 0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => findInternallyDisjointPaths(graph, { source: 's', target: 't', minimumPaths }), /minimumPaths/);
  }
  assert.throws(() => findInternallyDisjointPaths(graph, { source: 's', target: 's', minimumPaths: 1 }), /distinct.*apex/);
  assert.throws(() => findInternallyDisjointPaths(graph, { source: 'missing', target: 't', minimumPaths: 1 }), /canonical/);
  assert.throws(() => findInternallyDisjointPaths(graph, { source: 's', target: 'missing', minimumPaths: 1 }), /target/);
  assert.throws(() => findInternallyDisjointPaths(graph, { source: 's', target: 't', minimumPaths: 1, blockedNodes: 'a' }), /blockedNodes/);
});

test('residual rerouting recovers two paths when greedily removing the first shortest path fails', () => {
  const graph = graphOf(['s', 'a', 'b', 'x', 'y', 't'], [
    ['s', 'a'], ['a', 'x'], ['x', 't'], ['s', 'b'], ['b', 'x'], ['a', 'y'], ['y', 't'],
  ]);
  const greedy = findPathBfs(graph, { roots: ['s'], target: 't' });
  assert.deepEqual(greedy.proof.nodes, ['s', 'a', 'x', 't']);
  assert.equal(findPathBfs(graph, { roots: ['s'], target: 't', blockedNodes: greedy.proof.nodes.slice(1, -1) }).status, 'unreachable');
  const options = { source: 's', target: 't', minimumPaths: 2 };
  const found = findInternallyDisjointPaths(graph, options);
  assert.equal(found.status, 'found');
  assert.deepEqual(new Set(found.proof.paths.map(value => value.nodes.join(','))), new Set(['s,a,y,t', 's,b,x,t']));
  assert.equal(verifyInternallyDisjointPaths(graph, found.proof, options), true);
  assert.equal(referenceMaximum(graph, 's', 't'), 2);
});

test('shared intermediaries, merely edge-disjoint routes, cycles and repeated direct paths cannot supply extra support', () => {
  const graph = graphOf(['s', 'a', 'b', 'x', 'c', 'd', 't'], [
    ['s', 'a'], ['a', 'x'], ['x', 'c'], ['c', 't'], ['s', 'b'], ['b', 'x'], ['x', 'd'], ['d', 't'], ['x', 'a'], ['s', 't'],
  ]);
  const options = { source: 's', target: 't', minimumPaths: 2 };
  const edgeDisjoint = family(graph, [['s', 'a', 'x', 'c', 't'], ['s', 'b', 'x', 'd', 't']]);
  assert.equal(verifyInternallyDisjointPaths(graph, edgeDisjoint, options), false);
  assert.equal(verifyInternallyDisjointPaths(graph, family(graph, [['s', 't'], ['s', 't']]), options), false);
  assert.equal(verifyInternallyDisjointPaths(graph, family(graph, [['s', 'a', 'x', 'a', 'x', 'c', 't']]), { ...options, minimumPaths: 1 }), false);
  assert.equal(findInternallyDisjointPaths(graph, { ...options, minimumPaths: 3 }).count, 2);
  assert.equal(verifyInternallyDisjointPaths(graph, findInternallyDisjointPaths(graph, options).proof, options), true);
  graph.removeEdge('s', 't');
  const bridge = findInternallyDisjointPaths(graph, options);
  assert.equal(bridge.status, 'insufficient');
  assert.equal(bridge.count, 1);
  assert.equal(verifyInternallyDisjointPaths(graph, bridge.proof, options), false);
});

test('family verification binds canonical endpoints, edges, blocked nodes and snapshot rather than solver assertions', () => {
  const graph = graphOf(['s', 'a', 'b', 't'], [['s', 'a'], ['a', 't'], ['s', 'b'], ['b', 't']]);
  const options = { source: 's', target: 't', minimumPaths: 2 };
  const { proof } = findInternallyDisjointPaths(graph, options);
  assert.equal(verifyInternallyDisjointPaths(graph, JSON.parse(JSON.stringify(proof)), options), true);
  for (const corrupt of [
    null, {}, { ...proof, kind: 'reachability' }, { ...proof, version: 2 }, { ...proof, graph: 'other' },
    { ...proof, source: 'a' }, { ...proof, target: 'b' }, { ...proof, revision: -1 },
    { ...proof, paths: [] }, { ...proof, paths: Array(2) }, { ...proof, paths: null },
    { ...proof, paths: [proof.paths[0]], count: 999, required: 2 },
    { ...proof, paths: [proof.paths[0], { ...proof.paths[1], edgeIds: [undefined, undefined] }] },
  ]) assert.equal(verifyInternallyDisjointPaths(graph, corrupt, options), false);
  for (const override of [
    { source: 'a' }, { target: 'b' }, { source: 't', target: 't' }, { source: 'missing' },
    { blockedNodes: ['a'] }, { blockedNodes: 'a' }, { minimumPaths: 0 }, { minimumPaths: 1.5 }, { requireRevision: 'false' },
  ]) assert.equal(verifyInternallyDisjointPaths(graph, proof, { ...options, ...override }), false);
  for (const edgeIds of [[undefined], Array(1), [null], ['edge:missing']]) {
    const fabricated = { ...family(graph, [['s', 't']]), paths: [{ ...path(graph, ['s', 't']), edgeIds }] };
    assert.equal(verifyInternallyDisjointPaths(graph, fabricated, { ...options, minimumPaths: 1 }), false);
  }
  graph.addNode('unrelated');
  assert.equal(verifyInternallyDisjointPaths(graph, proof, options), false);
  assert.equal(verifyInternallyDisjointPaths(graph, proof, { ...options, requireRevision: false }), true);
  graph.removeEdge('s', 'a');
  assert.equal(verifyInternallyDisjointPaths(graph, proof, { ...options, requireRevision: false }), false);
  graph.addEdge('s', 'a');
  assert.equal(verifyInternallyDisjointPaths(graph, proof, { ...options, requireRevision: false }), false);
});

test('vertex-capacity flow agrees with exhaustive simple-path packing on all four-node directed simple graphs', () => {
  const nodes = ['0', '1', '2', '3'];
  const possible = nodes.flatMap(from => nodes.filter(to => to !== from).map(to => [from, to]));
  let fullComparisons = 0;
  let earlyComparisons = 0;
  let blockedComparisons = 0;
  for (let mask = 0; mask < 2 ** possible.length; mask++) {
    const graph = graphOf(nodes, possible.filter((_, bit) => mask & (1 << bit)));
    const before = graph.toJSON();
    for (const source of nodes) for (const target of nodes) {
      if (source === target) continue;
      const maximum = referenceMaximum(graph, source, target);
      const options = { source, target, minimumPaths: 4 };
      const found = findInternallyDisjointPaths(graph, options);
      assert.equal(found.count, maximum, 'maximum at mask ' + mask + ', ' + source + ' -> ' + target);
      assert.equal(found.status, 'insufficient');
      assert.equal(verifyInternallyDisjointPaths(graph, found.proof, { ...options, minimumPaths: maximum || 1 }), maximum > 0);
      fullComparisons++;
      if (source !== '0' || target !== '3') continue;
      for (const minimumPaths of [1, 2]) {
        const early = findInternallyDisjointPaths(graph, { ...options, minimumPaths });
        assert.equal(early.count, Math.min(maximum, minimumPaths));
        assert.equal(early.status, maximum >= minimumPaths ? 'found' : 'insufficient');
        assert.equal(verifyInternallyDisjointPaths(graph, early.proof, { ...options, minimumPaths }), maximum >= minimumPaths);
        earlyComparisons++;
      }
      const blockedNodes = ['1'];
      const blocked = findInternallyDisjointPaths(graph, { ...options, blockedNodes });
      assert.equal(blocked.count, referenceMaximum(graph, source, target, blockedNodes));
      assert.equal(verifyInternallyDisjointPaths(graph, blocked.proof, { ...options, blockedNodes, minimumPaths: blocked.count || 1 }), blocked.count > 0);
      blockedComparisons++;
    }
    assert.deepEqual(graph.toJSON(), before);
  }
  assert.deepEqual({ fullComparisons, earlyComparisons, blockedComparisons }, { fullComparisons: 49_152, earlyComparisons: 8_192, blockedComparisons: 4_096 });
});
