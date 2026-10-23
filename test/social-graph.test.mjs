import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectedGraph } from '../src/graph.mjs';
import { graphNeighborhood, propagatedTrust } from '../src/social-graph.mjs';

function graph(name, edges, nodes = ['a', 'b', 'c', 'd', 'e', 'z']) {
  const value = new DirectedGraph(name);
  for (const node of nodes) value.addNode(node);
  for (const [from, to] of edges) value.addEdge(from, to);
  return value;
}

test('public neighborhoods retain graph, direction and breadth-first discovery order without mutation', () => {
  const guarantees = graph('guarantees', [['a', 'b'], ['c', 'a'], ['b', 'd']]);
  const lineage = graph('lineage', [['a', 'e'], ['a', 'b'], ['e', 'z']]);
  const before = [guarantees.toJSON(), lineage.toJSON()];
  assert.deepEqual([...graphNeighborhood([guarantees, lineage], 'a', 0)], []);
  assert.deepEqual([...graphNeighborhood([guarantees, lineage], 'a', 1)], ['b', 'c', 'e']);
  assert.deepEqual([...graphNeighborhood([guarantees, lineage], 'a', 2)], ['b', 'c', 'e', 'd', 'z']);
  assert.deepEqual([...graphNeighborhood([lineage, guarantees], 'a', 1)], ['e', 'b', 'c']);
  assert.deepEqual([...graphNeighborhood([guarantees, lineage], 'missing', 2)], []);
  assert.deepEqual([...graphNeighborhood([], 'a', 2)], []);
  assert.deepEqual([guarantees.toJSON(), lineage.toJSON()], before);
});

test('public seed propagation preserves node order, isolated mass and zero support without mutation', () => {
  const supplied = graph('chain', [['a', 'b'], ['b', 'c']], ['a', 'b', 'c', 'isolated']);
  const before = supplied.toJSON();
  const seeds = ['missing', 'a'];
  assert.deepEqual([...propagatedTrust(supplied, seeds)], [['a', 0.5], ['b', 0], ['c', 0.5], ['isolated', 0]]);
  assert.deepEqual([...propagatedTrust(supplied, ['isolated'])], [['a', 0], ['b', 0], ['c', 0], ['isolated', 1]]);
  assert.deepEqual([...propagatedTrust(supplied, ['missing'])], [['a', 0], ['b', 0], ['c', 0], ['isolated', 0]]);
  assert.deepEqual([...propagatedTrust(graph('empty', [], []), [])], []);
  assert.deepEqual(seeds, ['missing', 'a']);
  assert.deepEqual(supplied.toJSON(), before);
});
