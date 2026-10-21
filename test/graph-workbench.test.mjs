import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphArtifact, readGraphArtifact, extractGraphArtifact, mutateGraphArtifact, searchGraphArtifact, verifyGraphArtifact } from '../src/graph-workbench.mjs';
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
