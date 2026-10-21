import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectedGraph } from '../src/graph.mjs';
import { reciprocity, largestWeakComponentFraction, spearman, rootDepths } from '../src/metrics.mjs';
import { runExperiment, experimentConfig } from '../src/experiment.mjs';

function graph(nodes, edges) {
  const result = new DirectedGraph('g');
  for (const node of nodes) result.addNode(node);
  for (const [from, to] of edges) result.addEdge(from, to);
  return result;
}

test('structural order parameters have explicit undefined cases', () => {
  assert.equal(reciprocity(graph(['a'], [])), null);
  assert.equal(reciprocity(graph(['a', 'b', 'c'], [['a', 'b'], ['b', 'a'], ['b', 'c']])), 2 / 3);
  assert.equal(largestWeakComponentFraction(new DirectedGraph('empty')), null);
  assert.equal(largestWeakComponentFraction(graph(['a', 'b', 'c', 'd'], [['a', 'b'], ['c', 'b']])), 3 / 4);
  assert.deepEqual(rootDepths(graph(['r', 'a', 'b', 'x'], [['r', 'a'], ['a', 'b']]), ['r']), { maxDepth: 2, meanDepth: 1 });
});

test('Spearman correlation averages ties and is undefined for constant inputs', () => {
  assert.equal(spearman([1, 2, 3], [10, 20, 30]), 1);
  assert.equal(spearman([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), null);
  assert.ok(Math.abs(spearman([1, 2, 2, 3], [1, 2, 3, 4]) - 0.9486832980505138) < 1e-12);
});

test('behavior ablation removes coalition targeting while leaving protocol accounting intact', () => {
  const options = { seed: 'targets', scenario: 'sybil-cone', initialSize: 20, attackerShare: 0.3, initialTopology: 'none', days: 6, activity: { attackers: { guarantee: 3 } } };
  const scripted = runExperiment(options).history.at(-1).graph;
  const uniform = runExperiment({ ...options, ablations: { randomGuaranteeTargets: true } }).history.at(-1).graph;
  assert.equal(scripted.mixing.counts.attackers.honest, 0);
  assert.ok(uniform.mixing.counts.attackers.honest > 0);
  assert.throws(() => experimentConfig({ ablations: { unknown: true } }), /unknown ablations key/);
  assert.equal(experimentConfig({}).ablations.randomGuaranteeTargets, false);
});

test('fixed invitation threshold ablation replaces only the N28 digit rule', () => {
  const run = runExperiment({ seed: 'threshold', initialSize: 12, days: 5, ablations: { fixedInvitationThreshold: 4 } });
  assert.ok(run.history.every(point => point.requiredGuarantors === 4));
  assert.ok(run.assumptions.some(text => text.includes('ablations')));
});
