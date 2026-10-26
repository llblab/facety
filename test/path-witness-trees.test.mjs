import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView, isPathWitnessView } from '../src/path-witness-view.mjs';
import { buildPathWitnessTrees, proposePathWitnessFromTrees, PATH_TREE_LIMITS } from '../src/path-witness-trees.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { PathWitnessCache } from '../src/path-witness-cache.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const counterexample = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/single-tree-miss.json', import.meta.url)));
const buildBudget = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 }, proposalBudget = { epoch: 3, maxCandidates: 16, maxPackingSteps: 1000 };
const oracleBudget = { epoch: 3, maxExpansions: 10000, maxPaths: 128, maxPackingSteps: 10000 };
function fixture(nodes, edges, patch = {}, anchors = ['a', 'b'], D = 2) {
  const graph = new DirectedGraph('tree-fixture'); for (const v of nodes) graph.addNode(v); for (const [a, b] of edges) graph.addEdge(a, b);
  const context = structuredClone(base); Object.assign(context.policy, patch);
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty: D, anchors }], removed: [], standing: [] };
  return { graph, context, options, view: () => pathWitnessGraphView(graph, options) };
}
function checked(result, view, context) {
  assert.equal(result.viewRoot, view.view().id); assert.ok(Object.isFrozen(result) && Object.isFrozen(result.stats));
  assert.ok(result.stats.candidatesExamined <= result.query.maxCandidates && result.stats.packingSteps <= result.query.maxPackingSteps);
  assert.ok(result.stats.edgeChecks <= 2 * result.stats.candidatesExamined * context.policy.maxHops);
  if (result.status === 'found') {
    assert.equal(result.feasible, true); assert.equal(result.witness.paths.length, result.required);
    for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(result.wire), context, view).accepted, true);
  } else { assert.equal(result.feasible, null); assert.equal(result.wire, null); }
  return result;
}
// Independent raw simple subject-first path enumeration, not BFS or production neighbors.
function shortest(nodes, edges, subject, anchor, p) {
  const has = (a, b) => edges.some(([x, y]) => a === x && b === y); let distance = null;
  function visit(path) {
    const node = path.at(-1);
    if (node === anchor) { distance = Math.min(distance ?? Infinity, path.length - 1); return; }
    if (path.length - 1 === p.maxHops) return;
    for (const next of nodes) if (!path.includes(next)) {
      const f = has(node, next), b = has(next, node);
      if (p.direction === 'directed-from-anchor' ? b : p.undirectedProjection === 'reciprocal-only' ? f && b : f || b) visit([...path, next]);
    }
  }
  visit([subject]); return distance;
}

test('single-tree portable counterexample misses a globally feasible family; exact fallback repairs and no-budget fallback stays unknown', () => {
  const c = counterexample, f = fixture(c.nodes, c.edges, c.context.policy), view = f.view(), forest = buildPathWitnessTrees(view, buildBudget);
  assert.equal(forest.meta.complete, true); assert.deepEqual(forest.anchors().map(a => forest.path('u', a)), c.expected.treePaths);
  const proposal = checked(proposePathWitnessFromTrees(forest, view, f.context, proposalBudget), view, f.context);
  assert.equal(proposal.status, 'miss'); assert.equal(proposal.feasible, null);
  const exact = findPathWitness(view, f.context, oracleBudget); assert.equal(exact.status, 'found');
  const cache = new PathWitnessCache({ maxEntries: 4, maxBytes: 10000, ttlTicks: 3 });
  const repaired = cache.lookup(view, f.context, oracleBudget, { tick: 0, hint: proposal.wire });
  assert.equal(repaired.status, 'found'); assert.equal(repaired.source, 'oracle');
  const disabled = new PathWitnessCache({ maxEntries: 0, maxBytes: 0, ttlTicks: 3 });
  const limited = disabled.lookup(view, f.context, { epoch: 3, maxExpansions: 0, maxPaths: 0, maxPackingSteps: 0 }, { tick: 0, hint: proposal.wire });
  assert.equal(limited.status, 'censored'); assert.equal(limited.feasible, null);
});

test('all64 tiny directed graphs/3 projections have correct per-anchor shortest reachability (1152 paths), independent of chosen parent', () => {
  const nodes = ['u', 'a', 'b'], possible = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b])); let pairs = 0;
  for (let bits = 0; bits < 64; bits++) for (const mode of ['directed', 'any', 'reciprocal']) {
    const edges = possible.filter((_, i) => bits & (1 << i)), f = fixture(nodes, edges, { maxHops: 2,
      direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' });
    const view = f.view(), forest = buildPathWitnessTrees(view, buildBudget); assert.equal(forest.meta.complete, true);
    for (const subject of nodes) for (const anchor of ['a', 'b']) {
      const path = forest.path(subject, anchor), wanted = shortest(nodes, edges, subject, anchor, f.context.policy);
      assert.equal(path === null ? null : path.length - 1, wanted); pairs++;
    }
  }
  assert.equal(pairs, 1152);
});

test('all4096 four-node directed graphs/3 projections compare advisory completeness/misses with M2 before cost claims (12288 queries)', t => {
  const nodes = ['u', 'x', 'a', 'b'], possible = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b]));
  const counts = Object.fromEntries(['directed', 'any', 'reciprocal'].map(mode => [mode, { queries: 0, oracleFound: 0, treeFound: 0, treeMisses: 0 }]));
  for (let bits = 0; bits < 4096; bits++) for (const mode of Object.keys(counts)) {
    const f = fixture(nodes, possible.filter((_, i) => bits & (1 << i)), { maxHops: 3,
      direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' });
    const view = f.view(), forest = buildPathWitnessTrees(view, buildBudget), proposed = checked(proposePathWitnessFromTrees(forest, view, f.context, proposalBudget), view, f.context);
    const exact = findPathWitness(view, f.context, oracleBudget), c = counts[mode]; c.queries++;
    assert.ok(['found', 'miss'].includes(proposed.status)); assert.ok(['found', 'infeasible'].includes(exact.status));
    if (exact.status === 'found') c.oracleFound++;
    if (proposed.status === 'found') { c.treeFound++; assert.equal(exact.status, 'found'); }
    else if (exact.status === 'found') c.treeMisses++;
  }
  assert.ok(counts.directed.treeMisses > 0); assert.equal(Object.values(counts).reduce((n, c) => n + c.queries, 0), 12288);
  t.diagnostic('single-tree-grid ' + JSON.stringify(counts));
});

test('exact build/candidate/packing boundaries and positive partial builds do not conflate budget with infeasibility', () => {
  const f = fixture(['u', 'w', 'a', 'b'], [['a', 'u'], ['b', 'u'], ['b', 'w']], { maxHops: 1 }), view = f.view();
  const all = buildPathWitnessTrees(view, buildBudget), exactBudget = { epoch: 3, maxExpansions: all.meta.stats.expansions, maxTreeNodes: all.meta.stats.treeNodes };
  assert.equal(buildPathWitnessTrees(view, exactBudget).meta.complete, true);
  assert.equal(buildPathWitnessTrees(view, { ...exactBudget, maxExpansions: exactBudget.maxExpansions - 1 }).meta.status, 'censored');
  const partial = buildPathWitnessTrees(view, { ...buildBudget, maxTreeNodes: 4 }); assert.equal(partial.meta.complete, false);
  assert.equal(checked(proposePathWitnessFromTrees(partial, view, f.context, proposalBudget), view, f.context).status, 'found');
  const fullProposal = checked(proposePathWitnessFromTrees(all, view, f.context, { epoch: 3, maxCandidates: 2, maxPackingSteps: 2 }), view, f.context);
  assert.equal(fullProposal.status, 'found');
  for (const patch of [{ maxCandidates: 1 }, { maxPackingSteps: 1 }]) {
    const result = checked(proposePathWitnessFromTrees(all, view, f.context, { epoch: 3, maxCandidates: 2, maxPackingSteps: 2, ...patch }), view, f.context);
    assert.equal(result.status, 'censored');
  }
  const empty = buildPathWitnessTrees(view, { epoch: 3, maxExpansions: 0, maxTreeNodes: 0 });
  assert.equal(proposePathWitnessFromTrees(empty, view, f.context, proposalBudget).status, 'censored');
});

test('stale-root paths are current-checked; silent edge/removal changes miss safely while a still-valid path may cross roots', () => {
  const f = fixture(['u', 'a', 'b', 'c'], [['a', 'u'], ['b', 'u']], { maxHops: 2 }, ['a', 'b', 'c']);
  const old = f.view(), forest = buildPathWitnessTrees(old, buildBudget);
  f.graph.addNode('extra'); let current = f.view();
  let result = checked(proposePathWitnessFromTrees(forest, current, f.context, proposalBudget), current, f.context);
  assert.equal(result.status, 'found'); assert.equal(result.forestRoot, old.view().id); assert.notEqual(result.viewRoot, result.forestRoot);
  f.graph.removeEdge('a', 'u'); f.graph.addEdge('c', 'u'); current = f.view();
  result = checked(proposePathWitnessFromTrees(forest, current, f.context, proposalBudget), current, f.context);
  assert.equal(result.status, 'miss'); assert.equal(findPathWitness(current, f.context, oracleBudget).status, 'found');
  const fresh = buildPathWitnessTrees(current, buildBudget); f.options.removed = ['b']; current = f.view();
  assert.notEqual(proposePathWitnessFromTrees(fresh, current, f.context, proposalBudget).status, 'found');
});

test('optional score is intermediary-only in forward BFS/current validation; removed anchors can be transit and self root counts nothing', () => {
  const f = fixture(['u', 'v', 'a'], [['a', 'u'], ['u', 'v']], { minStanding: 1, maxHops: 2 }, ['a'], 1);
  f.options.standing = [['a', 0], ['u', 0]]; let view = f.view(), forest = buildPathWitnessTrees(view, buildBudget);
  assert.deepEqual(forest.path('u', 'a'), ['u', 'a']); assert.equal(forest.path('v', 'a'), null);
  assert.equal(checked(proposePathWitnessFromTrees(forest, view, f.context, proposalBudget), view, f.context).status, 'found');
  f.options.standing = [['a', 0], ['u', 1]]; view = f.view(); forest = buildPathWitnessTrees(view, buildBudget);
  const cv = { ...f.context, subject: 'v' }; assert.equal(checked(proposePathWitnessFromTrees(forest, view, cv, proposalBudget), view, cv).status, 'found');
  f.options.standing = [['u', 0]]; view = f.view(); assert.equal(proposePathWitnessFromTrees(forest, view, cv, proposalBudget).status, 'miss');
  const g = fixture(['u', 'c', 'a', 'y', 'b'], [['a', 'c'], ['c', 'u'], ['b', 'y'], ['y', 'u']], {}, ['a', 'b', 'c']);
  g.options.removed = ['c']; view = g.view(); forest = buildPathWitnessTrees(view, buildBudget);
  assert.ok(!forest.anchors().includes('c')); assert.equal(checked(proposePathWitnessFromTrees(forest, view, g.context, proposalBudget), view, g.context).status, 'found');
  const self = { ...g.context, subject: 'a' }; assert.notEqual(proposePathWitnessFromTrees(forest, view, self, proposalBudget).status, 'found');
});

test('unavailable/malformed/policy-mismatched/copy/resource and wire-bound cases are explicit and never advisory feasible:false', () => {
  const f = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']]), view = f.view(), forest = buildPathWitnessTrees(view, buildBudget);
  assert.equal(proposePathWitnessFromTrees(forest, view, f.context, { ...proposalBudget, epoch: 4 }).status, 'unavailable');
  const absent = buildPathWitnessTrees(view, { ...buildBudget, epoch: 2 }); assert.equal(absent.meta.status, 'unavailable');
  assert.equal(proposePathWitnessFromTrees(absent, view, f.context, { ...proposalBudget, epoch: 2 }).status, 'unavailable');
  assert.throws(() => buildPathWitnessTrees({ ...view }, buildBudget)); assert.throws(() => proposePathWitnessFromTrees({ ...forest }, view, f.context, proposalBudget));
  for (const patch of [{ maxTreeNodes: 65537 }, { maxExpansions: 1000001 }, { epoch: -0 }, { maxTreeNodes: -1 }]) assert.throws(() => buildPathWitnessTrees(view, { ...buildBudget, ...patch }));
  for (const patch of [{ maxCandidates: 257 }, { maxPackingSteps: 1000001 }, { extra: 1 }]) assert.throws(() => proposePathWitnessFromTrees(forest, view, f.context, { ...proposalBudget, ...patch }));
  const mismatch = structuredClone(f.context); mismatch.policy.maxSlack = 0; assert.throws(() => proposePathWitnessFromTrees(forest, view, mismatch, proposalBudget), /policy differs/);
  const small = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']], { maxWitnessBytes: 1 }), limitedView = small.view();
  assert.equal(proposePathWitnessFromTrees(buildPathWitnessTrees(limitedView, buildBudget), limitedView, small.context, proposalBudget).reason, 'witness-byte-bound');
  assert.ok(Object.isFrozen(PATH_TREE_LIMITS));
});

test('forest inspection is immutable/inert and proposals compose as reverified cache hints without Model mutation or RNG', () => {
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const a of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(a, 'u'));
  const f = fixture(['u', 'a', 'b'], []), view = capturePathWitnessModelView(m, f.options), before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]);
  const forest = buildPathWitnessTrees(view, buildBudget), first = checked(proposePathWitnessFromTrees(forest, view, f.context, proposalBudget), view, f.context);
  forest.path('u', 'a'); forest.toJSON(); forest.anchors();
  assert.deepEqual(proposePathWitnessFromTrees(forest, view, f.context, proposalBudget), first);
  assert.equal(isPathWitnessView(forest.toJSON()), false); assert.throws(() => forest.anchors().push('fake'), TypeError);
  assert.throws(() => { forest.toJSON().parents[0].nodes[0].distance = 99; }, TypeError);
  const cache = new PathWitnessCache({ maxEntries: 4, maxBytes: 10000, ttlTicks: 5 });
  const advised = cache.lookup(view, f.context, oracleBudget, { tick: 0, hint: first.wire }); assert.equal(advised.source, 'hint'); assert.equal(advised.work.oracleCalls, 0);
  assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
  const source = readFileSync(new URL('../src/path-witness-trees.mjs', import.meta.url), 'utf8'); assert.doesNotMatch(source, /Math\.random|randomBytes|Date\.now|fetch\(/);
});

test('D64/r64 and exact Unicode/delimiter paths remain bounded, with no personhood or zero-hop shortcut', () => {
  const anchors = Array.from({ length: 64 }, (_, i) => 'a' + i), f = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), { maxDifficulty: 64, maxHops: 1 }, anchors, 64);
  let view = f.view(), forest = buildPathWitnessTrees(view, buildBudget);
  assert.equal(checked(proposePathWitnessFromTrees(forest, view, f.context, { ...proposalBudget, maxCandidates: 64, maxPackingSteps: 64 }), view, f.context).status, 'found');
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'm' + i), 'a'];
  const long = fixture(path, path.slice(1).map((v, i) => [v, path[i]]), { maxHops: 64 }, ['a'], 1); view = long.view(); forest = buildPathWitnessTrees(view, buildBudget);
  assert.equal(checked(proposePathWitnessFromTrees(forest, view, long.context, proposalBudget), view, long.context).witness.paths[0].length, 65);
  const unicode = fixture(['u', 'x\0y', 'é', 'x', 'y\0é'], [['é', 'x\0y'], ['x\0y', 'u'], ['y\0é', 'x'], ['x', 'u']], {}, ['é', 'y\0é']);
  view = unicode.view(); forest = buildPathWitnessTrees(view, buildBudget); assert.equal(checked(proposePathWitnessFromTrees(forest, view, unicode.context, proposalBudget), view, unicode.context).status, 'found');
});
