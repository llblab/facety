import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphArtifact, readGraphArtifact, extractGraphArtifact, mutateGraphArtifact, searchGraphArtifact, verifyGraphArtifact, benchmarkGraphArtifact } from '../src/graph-workbench.mjs';
import { runExperiment } from '../src/experiment.mjs';

test('synthetic artifacts round-trip through JSON with roots, counters and edge identities', () => {
  const artifact = createGraphArtifact({ topology: 'preferential', size: 40, rootCount: 2, degree: 2, seed: 'wb' });
  const copy = JSON.parse(JSON.stringify(artifact));
  const context = readGraphArtifact(copy);
  assert.deepEqual(context.graph.toJSON(), artifact.graph);
  assert.deepEqual(context.roots, ['n0', 'n1']);
  assert.equal(context.rootSource, 'artifact');
  assert.throws(() => createGraphArtifact({ topology: 'tree', unknown: 1 }), /unknown/);
  assert.throws(() => readGraphArtifact(artifact.graph), /independently supplied roots/);
  assert.deepEqual(readGraphArtifact(artifact.graph, { roots: ['n3'] }).roots, ['n3']);
});

test('searches return independently verified certificates and caller-owned roots override artifact roots', () => {
  const artifact = createGraphArtifact({ topology: 'tree', size: 30, rootCount: 1, seed: 'search' });
  for (const algorithm of ['bfs', 'bidirectional']) {
    const found = searchGraphArtifact(artifact, { algorithm, target: 'n29' });
    assert.equal(found.status, 'found');
    assert.equal(found.verified, true);
    assert.equal(verifyGraphArtifact(artifact, found, { target: 'n29' }).valid, true);
    assert.equal(verifyGraphArtifact(artifact, found, { target: 'n29', roots: ['n29'] }).valid, false, 'a caller root set without the certificate start rejects it');
  }
  assert.throws(() => searchGraphArtifact(artifact, { target: '' }), /target/);
  assert.equal(searchGraphArtifact(artifact, { target: 'n29', maxVisited: 1 }).status, 'budget-exceeded');
});

test('standalone mutations change only a clone and invalidate certificates that used removed edges', () => {
  const artifact = createGraphArtifact({ topology: 'tree', size: 20, rootCount: 1, seed: 'mutate' });
  const before = JSON.stringify(artifact);
  const found = searchGraphArtifact(artifact, { target: 'n19' });
  const interior = found.proof.nodes.slice(1, -1);
  const mutated = mutateGraphArtifact(artifact, { kind: 'remove-random-nodes', count: 19, seed: 'm', protectRoots: true, protectedNodes: ['n19'] });
  assert.equal(JSON.stringify(artifact), before);
  assert.equal(mutated.provenance.kind, 'structural-mutation');
  if (interior.length) assert.equal(verifyGraphArtifact(mutated, found, { target: 'n19' }).valid, false);
  assert.ok(mutated.graph.nodes.includes('n0') && mutated.graph.nodes.includes('n19'));
});

test('benchmarks replay identical snapshots and queries with verified shortest paths and deterministic work', () => {
  for (const topology of ['tree', 'random', 'preferential', 'communities', 'clique']) {
    const artifact = createGraphArtifact({ topology, size: 20, rootCount: 2, degree: 2, communitySize: 5, seed: 'benchmark' });
    const before = structuredClone(artifact);
    const options = { queries: [{ target: 'n19' }, { target: 'n0' }, { target: 'n19', blockedNodes: ['n19'] }], iterations: 2, warmup: 1 };
    const first = benchmarkGraphArtifact(artifact, options);
    assert.deepEqual(benchmarkGraphArtifact(createGraphArtifact({ topology, size: 20, rootCount: 2, degree: 2, communitySize: 5, seed: 'benchmark' }), options), first);
    assert.deepEqual(artifact, before);
    assert.deepEqual(first.input.graph, artifact.graph);
    assert.equal(first.settings.searchExecutions, 27);
    for (const row of first.cases) {
      assert.equal(row.performanceComparable, true);
      for (const algorithm of Object.values(row.algorithms)) {
        assert.equal(algorithm.status, row.reference.status);
        assert.equal(algorithm.pathLength, row.reference.pathLength);
        assert.equal(algorithm.samples.length, 2);
        assert.notEqual(algorithm.samples[0].position, algorithm.samples[1].position);
        assert.equal(algorithm.totals.elapsedMs, null);
        assert.equal(algorithm.totals.visited, algorithm.samples.reduce((sum, sample) => sum + sample.visited, 0));
        if (algorithm.proof) assert.equal(verifyGraphArtifact(artifact, algorithm.proof, { target: row.query.target, roots: row.query.roots, blockedNodes: row.query.blockedNodes, requireRevision: true }).valid, true);
      }
    }
    assert.equal(first.cases[1].reference.pathLength, 0);
    assert.equal(first.cases[2].reference.status, 'unreachable');
  }
});

test('benchmark budgets retain unknowns, caller roots and snapshot exclusions', () => {
  const artifact = createGraphArtifact({ topology: 'tree', size: 20, rootCount: 1, seed: 'benchmark-budget' });
  artifact.blockedNodes = ['n19'];
  const result = benchmarkGraphArtifact(artifact, { warmup: 0, iterations: 1, queries: [
    { target: 'n18', maxVisited: 1 }, { target: 'n18', roots: ['n18'] }, { target: 'n19', roots: ['n19'] },
  ] });
  const [budget, overridden, blocked] = result.cases;
  assert.equal(budget.reference.status, 'found');
  assert.equal(budget.performanceComparable, false);
  assert.equal(budget.algorithms.bfs.status, 'budget-exceeded');
  assert.equal(budget.algorithms.bfs.verified, null);
  assert.equal(overridden.reference.pathLength, 0);
  assert.equal(overridden.query.rootSource, 'caller-override');
  assert.deepEqual(blocked.query.blockedNodes, ['n19']);
  assert.equal(blocked.reference.status, 'unreachable');
  const bare = benchmarkGraphArtifact(artifact.graph, { roots: ['n19'], queries: [{ target: 'n19' }], iterations: 1, warmup: 0 });
  assert.equal(bare.cases[0].reference.pathLength, 0);
  assert.throws(() => benchmarkGraphArtifact(artifact.graph, { queries: [{ target: 'n19' }] }), /independently supplied roots/);
});

test('benchmark timing is opt-in and retains raw local samples outside reference verification', () => {
  const artifact = createGraphArtifact({ topology: 'tree', size: 15, rootCount: 1, seed: 'timing' });
  const result = benchmarkGraphArtifact(artifact, { queries: [{ target: 'n14' }], iterations: 2, warmup: 0, measureTime: true });
  for (const algorithm of Object.values(result.cases[0].algorithms)) {
    assert.equal(algorithm.verified, true);
    assert(algorithm.samples.every(sample => Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= 0));
    assert.equal(algorithm.totals.elapsedMs, algorithm.samples.reduce((sum, sample) => sum + sample.elapsedMs, 0));
  }
});

test('benchmark settings and every query fail closed before measurement', () => {
  const artifact = createGraphArtifact({ topology: 'tree', size: 5, rootCount: 1 });
  const valid = { queries: [{ target: 'n4' }], iterations: 1, warmup: 0 };
  for (const invalid of [{ queries: [] }, { queries: Array(1) }, { queries: [null] }, { iterations: 0 }, { iterations: null },
    { iterations: 1.5 }, { warmup: -1 }, { warmup: Infinity }, { measureTime: 1 }, { iterations: 1_000_000 }, { extra: 1 }]) {
    assert.throws(() => benchmarkGraphArtifact(artifact, { ...valid, ...invalid }));
  }
  for (const query of [{ target: 'missing' }, { target: 'n4', algorithm: 'bfs' }, { target: 'n4', roots: null },
    { target: 'n4', maxVisited: 0 }, { target: 'n4', maxVisited: null }, { target: 'n4', blockedNodes: ['n1', 'n1'] }]) {
    assert.throws(() => benchmarkGraphArtifact(artifact, { ...valid, queries: [...valid.queries, query] }));
  }
});

test('protocol snapshots extract either layer and block invalidated identities', () => {
  const run = runExperiment({ seed: 'extract', initialSize: 8, days: 4, includeState: true });
  const guarantees = extractGraphArtifact(run, 'guarantees');
  const lineage = extractGraphArtifact(run, 'lineage');
  assert.equal(guarantees.provenance.layer, 'guarantees');
  assert.deepEqual(guarantees.roots, run.state.roots);
  assert.equal(lineage.graph.name, 'invitation-lineage');
  const invalidated = structuredClone(run);
  invalidated.state.subjects[1] = { ...invalidated.state.subjects[1], identityStatus: 'false' };
  assert.deepEqual(extractGraphArtifact(invalidated, 'guarantees').blockedNodes, [invalidated.state.subjects[1].id]);
  assert.throws(() => extractGraphArtifact({ ...run, state: undefined }, 'guarantees'), /includeState/);
  assert.throws(() => extractGraphArtifact(run, 'other'), /layer/);
});
