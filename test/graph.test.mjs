import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectedGraph } from '../src/graph.mjs';
import { Random } from '../src/random.mjs';
import { findPathBfs, verifyPath } from '../src/proofs.mjs';

test('graph directions, immutable edges, removal, and snapshot round trips', () => {
  const graph = new DirectedGraph('guarantees');
  for (const id of ['a', 'b', 'c']) graph.addNode(id);
  const edge = graph.addEdge('a', 'b');
  assert.equal(graph.edge('b', 'a'), undefined);
  assert.deepEqual([...graph.inEdges('b')], [edge]);
  assert.throws(() => { edge.to = 'c'; }, TypeError);
  assert.throws(() => graph.addEdge('a', 'a'));
  assert.throws(() => graph.addEdge('a', 'missing'));
  assert.throws(() => graph.addEdge('a', 'b'));
  graph.addEdge('b', 'c');
  const snapshot = JSON.parse(JSON.stringify(graph));
  assert.deepEqual(graph.clone().toJSON(), snapshot);
  assert.equal(graph.removeNode('b'), true);
  assert.equal(graph.edgeCount, 0);
  assert.equal([...graph.outEdges('a')].length, 0);
  assert.equal([...graph.inEdges('c')].length, 0);
  assert.equal(graph.removeNode('b'), false);
  assert.deepEqual(DirectedGraph.fromJSON(JSON.parse(JSON.stringify(graph))).toJSON(), graph.toJSON());
  const restored = DirectedGraph.fromJSON(snapshot);
  restored.removeEdge('a', 'b');
  assert.notEqual(restored.addEdge('a', 'b').id, edge.id);
  assert.equal(graph.edgeCount, 0);
});

test('edge-counter exhaustion rejects insertion atomically and cannot revive a removed certificate', () => {
  const snapshot = { version: 1, name: 'boundary', revision: 2, nextEdge: Number.MAX_SAFE_INTEGER - 1, nodes: ['a', 'b'], edges: [] };
  const graph = DirectedGraph.fromJSON(snapshot);
  const edge = graph.addEdge('a', 'b');
  assert.equal(edge.id, 'edge:' + (Number.MAX_SAFE_INTEGER - 1));
  const options = { roots: ['a'], target: 'b' };
  const { proof } = findPathBfs(graph, options);
  assert.equal(verifyPath(graph, proof, options), true);
  assert.deepEqual(graph.clone().toJSON(), graph.toJSON());
  graph.removeEdge('a', 'b');
  const before = graph.toJSON();
  assert.throws(() => graph.addEdge('a', 'b'), RangeError);
  assert.deepEqual(graph.toJSON(), before);
  assert.equal(verifyPath(graph, proof, options), false);
  const exhausted = DirectedGraph.fromJSON({ ...snapshot, nextEdge: Number.MAX_SAFE_INTEGER });
  const empty = exhausted.toJSON();
  assert.throws(() => exhausted.addEdge('a', 'b'), RangeError);
  assert.deepEqual(exhausted.toJSON(), empty);
});

test('revision capacity is preflighted for every mutation, including all incident edges on node removal', () => {
  const initial = new DirectedGraph();
  for (const id of ['a', 'b', 'c']) initial.addNode(id);
  for (const [from, to] of [['a', 'b'], ['b', 'a'], ['a', 'c']]) initial.addEdge(from, to);
  for (const [increments, mutate] of [
    [1, graph => graph.addNode('d')], [1, graph => graph.addEdge('b', 'c')],
    [1, graph => graph.removeEdge('a', 'b')], [4, graph => graph.removeNode('a')],
  ]) {
    for (const room of [increments - 1, increments]) {
      const graph = DirectedGraph.fromJSON({ ...initial.toJSON(), revision: Number.MAX_SAFE_INTEGER - room });
      const before = graph.toJSON();
      if (room < increments) {
        assert.throws(() => mutate(graph), RangeError);
        assert.deepEqual(graph.toJSON(), before);
      } else {
        assert.ok(mutate(graph));
        assert.equal(graph.revision, Number.MAX_SAFE_INTEGER);
        assert.deepEqual(graph.clone().toJSON(), graph.toJSON());
      }
    }
  }
  const exhausted = DirectedGraph.fromJSON({ ...initial.toJSON(), revision: Number.MAX_SAFE_INTEGER });
  assert.equal(exhausted.addNode('a'), false);
  assert.equal(exhausted.removeNode('missing'), false);
  assert.equal(exhausted.removeEdge('c', 'b'), false);
});

test('counter capacity assertions are pure, independent and do not reserve slots', () => {
  const graph = DirectedGraph.fromJSON({ version: 1, name: 'capacity', revision: Number.MAX_SAFE_INTEGER - 3, nextEdge: Number.MAX_SAFE_INTEGER - 2, nodes: ['a', 'b'], edges: [] });
  const before = graph.toJSON();
  for (let revisions = 0; revisions <= 4; revisions++) {
    for (let edgeIds = 0; edgeIds <= 3; edgeIds++) {
      const check = () => graph.assertCapacity({ revisions, edgeIds });
      if (revisions <= 3 && edgeIds <= 2) assert.doesNotThrow(check);
      else assert.throws(check, RangeError);
      assert.deepEqual(graph.toJSON(), before);
    }
  }
  for (const options of [null, [], { unknown: 1 }, { revisions: -1 }, { revisions: 0.5 }, { edgeIds: null }, { edgeIds: Infinity }, { revisions: undefined }]) {
    assert.throws(() => graph.assertCapacity(options));
    assert.deepEqual(graph.toJSON(), before);
  }
  graph.addEdge('a', 'b');
  assert.equal(graph.toJSON().nextEdge, Number.MAX_SAFE_INTEGER - 1);
  assert.equal(graph.revision, Number.MAX_SAFE_INTEGER - 2);
  assert.doesNotThrow(() => graph.assertCapacity({ revisions: 2, edgeIds: 1 }));
  assert.throws(() => graph.assertCapacity({ revisions: 3 }), RangeError);
});

test('malformed snapshots cannot alias nodes or edge identities', () => {
  const graph = new DirectedGraph();
  graph.addNode('a');
  graph.addNode('b');
  graph.addEdge('a', 'b');
  const snapshot = graph.toJSON();
  assert.throws(() => DirectedGraph.fromJSON({ ...snapshot, nodes: ['a', 'a'] }));
  assert.throws(() => DirectedGraph.fromJSON({ ...snapshot, nextEdge: 0 }));
  assert.throws(() => DirectedGraph.fromJSON({ ...snapshot, edges: [...snapshot.edges, ...snapshot.edges] }));
});

test('seeded randomness is reproducible and fork streams do not consume the parent', () => {
  const a = new Random('experiment');
  const b = new Random('experiment');
  assert.deepEqual(Array.from({ length: 100 }, () => a.next()), Array.from({ length: 100 }, () => b.next()));
  a.fork('trial').next();
  assert.equal(a.next(), b.next());
  assert.equal(a.chance(0), false);
  assert.equal(a.chance(1), true);
  assert.throws(() => a.int(0));
  assert.throws(() => a.chance(NaN));
});
