import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, proposePathWitnessFromTrees, proposePathWitnessFromSegments } from '../src/path-witness-trees.mjs';
import { createPathWitnessPool } from '../src/path-witness-pool.mjs';
import { PathWitnessSegmentCache } from '../src/path-witness-segments.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const budget = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 }, proposal = { epoch: 3, maxCandidates: 256, maxPackingSteps: 10000 }, oracle = { epoch: 3, maxExpansions: 10000, maxPaths: 256, maxPackingSteps: 10000 };
const cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function fixture(nodes, edges, patch = {}, anchors = ['a', 'b'], difficulty = 2, name = 'tree-refresh-control') {
  const graph = new DirectedGraph(name); nodes.forEach(n => graph.addNode(n)); edges.forEach(([a, b]) => graph.addEdge(a, b));
  const context = structuredClone(base); Object.assign(context.policy, { maxHops: 3 }, patch);
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty, anchors }], removed: [], standing: [] };
  return { graph, context, options, view: () => pathWitnessGraphView(graph, options) };
}
function refreshed(forest, origin, current, patch = {}) {
  const q = { ...budget, ...patch }, r = refreshPathWitnessTrees(forest, origin, current, q), w = r.report.work;
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.report) && Object.isFrozen(w));
  if (r.forest) {
    const data = r.forest.toJSON(), rows = data.parents.reduce((n, t) => n + t.nodes.length, 0);
    assert.equal(rows, w.retainedTreeNodes); assert.equal(rows, w.reusedTreeNodes + w.freshTreeNodes); assert.ok(rows <= q.maxTreeNodes && w.freshExpansions <= q.maxExpansions);
    assert.equal(data.meta.originRoot, current.view().id); assert.equal(data.meta.stats.treeNodes, rows); assert.equal(data.meta.stats.expansions, w.freshExpansions);
    assert.deepEqual(r.report.roots.map(row => row.anchor), r.forest.anchors()); assert.equal(data.meta.complete, !r.report.roots.some(row => ['partial', 'omitted'].includes(row.action)));
    assert.equal(w.rebuiltRoots, r.report.roots.filter(row => ['partial', 'rebuilt'].includes(row.action)).length);
    for (const tree of data.parents) for (const row of tree.nodes) {
      assert.ok(row.parent === null ? row.subject === tree.anchor && row.distance === 0 : tree.nodes.some(p => p.subject === row.parent && p.distance === row.distance - 1));
      const path = r.forest.path(row.subject, tree.anchor); assert.equal(path.length, row.distance + 1); assert.equal(new Set(path).size, path.length);
    }
  } else { assert.equal(r.report.status, 'unavailable'); assert.ok(Object.values(w).every(n => n === 0)); assert.equal(r.report.deltaComplete, null); assert.equal(r.report.reset, null); }
  return r;
}
function checkProposal(forest, view, context, epoch = 3) {
  const r = proposePathWitnessFromTrees(forest, view, context, { ...proposal, epoch });
  if (r.status === 'found') for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(r.wire), context, view).accepted, true);
  else assert.equal(r.feasible, null);
  return r;
}
// Separate raw Boolean projection and FIFO BFS, not production neighbors/delta/grow helpers.
function rawGraph(nodes, edges, p) {
  const has = (a, b) => edges.some(([x, y]) => a === x && b === y), next = new Map();
  for (const a of [...nodes].sort(cmp)) next.set(a, [...nodes].sort(cmp).filter(b => a !== b && (p.direction === 'directed-from-anchor' ? has(a, b)
    : p.undirectedProjection === 'reciprocal-only' ? has(a, b) && has(b, a) : has(a, b) || has(b, a))));
  return next;
}
function rawTrees(nodes, edges, p, scores, anchors) {
  const next = rawGraph(nodes, edges, p);
  return anchors.map(anchor => {
    const queue = [{ subject: anchor, distance: 0, parent: null }];
    for (let head = 0; head < queue.length; head++) {
      const row = queue[head]; if (row.distance === p.maxHops || (row.subject !== anchor && p.minStanding !== null && (scores.get(row.subject) ?? -1) < p.minStanding)) continue;
      for (const child of next.get(row.subject)) if (!queue.some(row => row.subject === child)) queue.push({ subject: child, distance: row.distance + 1, parent: row.subject });
    }
    return { anchor, nodes: queue.sort((a, b) => cmp(a.subject, b.subject)) };
  });
}
function rawActions(nodes, oldEdges, edges, p, oldScores, scores, oldTrees) {
  const old = rawGraph(nodes, oldEdges, p), current = rawGraph(nodes, edges, p), changed = new Set();
  for (const source of nodes) if (JSON.stringify(old.get(source)) !== JSON.stringify(current.get(source))) changed.add(source);
  return oldTrees.map(tree => ({ anchor: tree.anchor, action: tree.nodes.some(row => row.distance < p.maxHops && (changed.has(row.subject)
    || (row.subject !== tree.anchor && p.minStanding !== null && ((oldScores.get(row.subject) ?? -1) >= p.minStanding) !== ((scores.get(row.subject) ?? -1) >= p.minStanding)))) ? 'rebuilt' : 'reused' }));
}

test('24576 complete synthetic old→new pairs match separate raw BFS/affected sets, full rebuild and dual-verified M2 positives', t => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b])); let pairs = 0, found = 0, reused = 0, rebuilt = 0;
  for (const mode of ['directed', 'any', 'reciprocal']) for (const scored of [false, true]) {
    const patch = { maxHops: 2, minStanding: scored ? 1 : null, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' };
    const snapshots = Array.from({ length: 64 }, (_, bits) => {
      const edges = arcs.filter((_, i) => bits & (1 << i)), f = fixture(nodes, edges, patch), oldScores = new Map([['a', 0], ['b', 1]]), scores = new Map([['a', 1], ['b', 0]]);
      f.options.standing = [...oldScores]; const origin = f.view(), forest = buildPathWitnessTrees(origin, budget), oldRaw = rawTrees(nodes, edges, f.context.policy, oldScores, ['a', 'b']); assert.deepEqual(forest.toJSON().parents, oldRaw);
      f.options.standing = [...scores]; const current = f.view(), full = buildPathWitnessTrees(current, budget), raw = rawTrees(nodes, edges, f.context.policy, scores, ['a', 'b']); assert.deepEqual(full.toJSON().parents, raw);
      return { f, edges, origin, forest, oldRaw, current, full, raw, oldScores, scores, exact: findPathWitness(current, f.context, oracle).status };
    });
    // Pairs declare two states of the same synthetic namespace, not authenticated real ledger/event history.
    for (const before of snapshots) for (const after of snapshots) {
      const r = refreshed(before.forest, before.origin, after.current); assert.equal(r.report.reset, null); assert.equal(r.report.deltaComplete, true);
      assert.deepEqual(r.forest.toJSON().parents, after.raw); assert.deepEqual(r.forest.toJSON().parents, after.full.toJSON().parents);
      assert.deepEqual(r.report.roots, rawActions(nodes, before.edges, after.edges, after.f.context.policy, before.oldScores, after.scores, before.oldRaw));
      assert.ok(r.report.work.classificationNodeChecks <= before.forest.meta.stats.treeNodes);
      const q = checkProposal(r.forest, after.current, after.f.context); assert.equal(q.status === 'found', after.exact === 'found');
      pairs++; if (q.status === 'found') found++; reused += r.report.work.reusedRoots; rebuilt += r.report.work.rebuiltRoots;
    }
  }
  assert.equal(pairs, 24576); assert.equal(found, 7168); t.diagnostic('tree-refresh-raw-controls ' + JSON.stringify({ pairs, found, reused, rebuilt, observedMismatch: 0 }));
});

test('remote roots reuse while insertions shorten or change equal-distance parents even with all old parent edges live', () => {
  for (const tie of [false, true]) {
    const nodes = ['u', 'x', 'y', 'a', 'b', 'v'], edges = tie ? [['a', 'x'], ['a', 'y'], ['y', 'u'], ['b', 'v']] : [['a', 'x'], ['x', 'u'], ['b', 'v']];
    const f = fixture(nodes, edges), origin = f.view(), forest = buildPathWitnessTrees(origin, budget), before = JSON.stringify(forest.toJSON()); f.graph.addEdge(tie ? 'x' : 'a', 'u'); const current = f.view();
    const r = refreshed(forest, origin, current); assert.deepEqual(r.report.roots, [{ anchor: 'a', action: 'rebuilt' }, { anchor: 'b', action: 'reused' }]);
    assert.deepEqual(r.forest.toJSON().parents, buildPathWitnessTrees(current, budget).toJSON().parents); assert.notDeepEqual(r.forest.path('u', 'a'), forest.path('u', 'a')); assert.equal(JSON.stringify(forest.toJSON()), before);
    const next = refreshed(r.forest, current, current, { maxExpansions: 0 }); assert.equal(next.report.work.reusedRoots, 2); assert.equal(next.report.work.freshExpansions, 0); assert.equal(next.forest.meta.complete, true);
  }
});

test('retained capacity includes reuse, exact limits are honest and partial rebuilt trees stay parent-closed before omitting later roots', () => {
  const f = fixture(['u', 'x', 'a', 'b', 'v'], [['a', 'x'], ['x', 'u'], ['b', 'v']]), origin = f.view(), old = buildPathWitnessTrees(origin, budget), n = old.meta.stats.treeNodes;
  const exact = refreshed(old, origin, origin, { maxExpansions: 0, maxTreeNodes: n }); assert.equal(exact.forest.meta.complete, true); assert.equal(exact.report.work.freshTreeNodes, 0);
  const less = refreshed(old, origin, origin, { maxExpansions: 0, maxTreeNodes: n - 1 }); assert.deepEqual(less.report.roots.map(r => r.action), ['reused', 'omitted']); assert.equal(less.report.reason, 'tree-node-limit'); assert.equal(less.forest.path('v', 'b'), null);
  const zero = refreshed(old, origin, origin, { maxTreeNodes: 0 }); assert.deepEqual(zero.report.roots.map(r => r.action), ['omitted', 'omitted']); assert.equal(zero.report.work.retainedTreeNodes, 0);
  f.graph.addEdge('a', 'u'); const current = f.view(), full = refreshed(old, origin, current), expansions = full.report.work.freshExpansions;
  assert.equal(refreshed(old, origin, current, { maxExpansions: expansions }).forest.meta.complete, true);
  const partial = refreshed(old, origin, current, { maxExpansions: expansions - 1 }); assert.deepEqual(partial.report.roots.map(r => r.action), ['partial', 'omitted']); assert.equal(partial.report.reason, 'build-expansion-limit');
  const noExpansion = refreshed(old, origin, current, { maxExpansions: 0 }); assert.deepEqual(noExpansion.report.roots.map(r => r.action), ['partial', 'omitted']); assert.equal(noExpansion.report.work.freshTreeNodes, 1);
  const heal = refreshed(partial.forest, current, current); assert.equal(heal.report.reset, 'input-incomplete'); assert.equal(heal.report.deltaComplete, false); assert.deepEqual(heal.forest.toJSON().parents, buildPathWitnessTrees(current, budget).toJSON().parents);
});

test('reset-all bounded outputs exactly match direct fresh BFS across budgets and priority remains explicit', () => {
  const f = fixture(['u', 'x', 'a', 'b'], [['a', 'x'], ['x', 'u'], ['b', 'u']]), origin = f.view(), incomplete = buildPathWitnessTrees(origin, { ...budget, maxTreeNodes: 0 });
  for (const maxTreeNodes of [0, 1, 2, 3, 6, 20]) for (const maxExpansions of [0, 1, 2, 3, 4, 20]) {
    const r = refreshed(incomplete, origin, origin, { maxTreeNodes, maxExpansions }), full = buildPathWitnessTrees(origin, { ...budget, maxTreeNodes, maxExpansions });
    assert.equal(r.report.reset, 'input-incomplete'); assert.equal(r.report.deltaComplete, false); assert.equal(r.report.work.preparedOldNodes, 0); assert.equal(r.report.work.classificationNodeChecks, 0);
    assert.deepEqual(r.forest.toJSON().parents, full.toJSON().parents); assert.deepEqual(r.forest.meta.stats, full.meta.stats); assert.equal(r.forest.meta.status, full.meta.status); assert.equal(r.forest.meta.reason, full.meta.reason);
  }
  const complete = buildPathWitnessTrees(origin, budget); f.options.policy = { ...f.options.policy, maxHops: 1 }; f.context.policy = f.options.policy;
  const current = f.view(), changed = refreshed(complete, origin, current); assert.equal(changed.report.reset, 'policy-changed'); assert.deepEqual(changed.forest.toJSON().parents, buildPathWitnessTrees(current, budget).toJSON().parents);
});

test('qualification classes/root exemption/unknown scores and score-off changes are distinct from source-root changes', () => {
  const f = fixture(['u', 'x', 'a', 'b'], [['a', 'x'], ['x', 'u']], { minStanding: 1 }); f.options.standing = [['a', 1], ['x', 1]];
  const origin = f.view(), forest = buildPathWitnessTrees(origin, budget); f.options.standing = [['a', 0], ['x', 2]]; const current = f.view(), r = refreshed(forest, origin, current);
  assert.notEqual(current.view().id, origin.view().id); assert.equal(r.report.work.reusedRoots, 2); assert.deepEqual(r.forest.path('u', 'a'), ['u', 'x', 'a']);
  f.options.standing = [['a', 0], ['x', null]]; const low = f.view(), stopped = refreshed(r.forest, current, low); assert.equal(stopped.forest.path('u', 'a'), null); assert.deepEqual(stopped.report.roots.map(r => r.action), ['rebuilt', 'reused']);
  const off = fixture(['u', 'x', 'a'], [['a', 'x'], ['x', 'u']], {}, ['a'], 1), ov = off.view(), of = buildPathWitnessTrees(ov, budget); off.options.standing = [['x', 0]];
  const same = refreshed(of, ov, off.view()); assert.equal(same.report.work.reusedRoots, 1); assert.equal(same.report.work.scoreEligibilityComparisons, 0);
  const zeroThreshold = fixture(['u', 'x', 'a'], [['a', 'x'], ['x', 'u']], { minStanding: 0 }, ['a'], 1), zv = zeroThreshold.view(), zf = buildPathWitnessTrees(zv, budget); zeroThreshold.options.standing = [['x', 0]];
  const known = refreshed(zf, zv, zeroThreshold.view()); assert.equal(known.report.work.rebuiltRoots, 1); assert.deepEqual(known.forest.path('u', 'a'), ['u', 'x', 'a']);
});

test('live-node, new/retired roots and difficulty changes preserve root/transit distinctions and current verifier requirements', () => {
  const f = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'a']], {}, ['a', 'b'], 1), origin = f.view(), forest = buildPathWitnessTrees(origin, budget); f.options.removed = ['a']; const current = f.view(), r = refreshed(forest, origin, current);
  assert.deepEqual(r.report.retired, ['a']); assert.deepEqual(r.report.roots, [{ anchor: 'b', action: 'reused' }]); assert.deepEqual(r.forest.path('u', 'b'), ['u', 'a', 'b']); assert.equal(checkProposal(r.forest, current, f.context).status, 'found');
  f.graph.addNode('isolated'); const isolated = f.view(), noChange = refreshed(r.forest, current, isolated); assert.equal(noChange.report.work.reusedRoots, 1);
  f.options.removed = []; const added = f.view(), newRoot = refreshed(noChange.forest, isolated, added); assert.deepEqual(newRoot.report.roots, [{ anchor: 'a', action: 'rebuilt' }, { anchor: 'b', action: 'reused' }]);
  f.options.snapshots = [{ epoch: 3, anchors: ['a', 'b'], difficulty: 2 }]; const harder = f.view(), difficulty = refreshed(newRoot.forest, added, harder); assert.equal(difficulty.report.work.reusedRoots, 2); assert.notEqual(checkProposal(difficulty.forest, harder, f.context).status, 'found');
  f.graph.removeNode('a'); const gone = f.view(), removal = refreshed(difficulty.forest, harder, gone); assert.deepEqual(removal.report.retired, ['a']); assert.equal(removal.forest.path('u', 'b'), null);
});

test('any-live versus reciprocal changes and relation-ID reincarnation stay separate from vertex-tree semantics/cache custody', () => {
  for (const mode of ['any-live-orientation', 'reciprocal-only']) {
    const f = fixture(['u', 'a'], [['a', 'u'], ['u', 'a']], { direction: 'undirected', undirectedProjection: mode }, ['a'], 1), origin = f.view(), forest = buildPathWitnessTrees(origin, budget);
    f.graph.removeEdge('a', 'u'); const current = f.view(), r = refreshed(forest, origin, current); assert.equal(r.report.work.reusedRoots, mode === 'any-live-orientation' ? 1 : 0);
    assert.equal(r.forest.path('u', 'a') !== null, mode === 'any-live-orientation'); assert.equal(r.report.work.changedArcs, mode === 'any-live-orientation' ? 0 : 2);
  }
  const f = fixture(['u', 'a'], [['a', 'u']], {}, ['a'], 1), origin = f.view(), forest = buildPathWitnessTrees(origin, budget), c = new PathWitnessSegmentCache({ ledgerId: 'software', maxEntries: 4, maxBytes: 10000, ttlTicks: 10 });
  c.put(origin, f.context, { epoch: 3, path: ['u', 'a'], tick: 0 }); f.graph.removeEdge('a', 'u'); f.graph.addEdge('a', 'u'); const current = f.view(), beforeCache = c.stats(), r = refreshed(forest, origin, current);
  assert.equal(r.report.work.reusedRoots, 1); assert.equal(r.report.work.changedArcs, 0); assert.deepEqual(c.stats(), beforeCache); assert.equal(checkProposal(r.forest, current, f.context).status, 'found');
  assert.equal(c.lookup(current, f.context, { epoch: 3, to: 'a', tick: 1, maxChecks: 4, maxResults: 4 }).status, 'miss');
});

test('explicit epoch/policy/incomplete priority, current grace and missing snapshot are not activation authority', () => {
  const f = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']], {}, ['a'], 1), origin = f.view(), forest = buildPathWitnessTrees(origin, budget);
  f.options.currentEpoch = 4; f.options.snapshots.push({ epoch: 4, anchors: ['b'], difficulty: 1 }); const current = f.view(), r = refreshed(forest, origin, current, { epoch: 4 });
  assert.equal(r.report.reset, 'epoch-changed'); assert.deepEqual(r.forest.anchors(), ['b']); assert.equal(checkProposal(r.forest, current, f.context, 4).status, 'found');
  const grace = refreshed(forest, origin, current); assert.equal(grace.report.reset, null); assert.equal(grace.report.work.reusedRoots, 1);
  const incomplete = buildPathWitnessTrees(origin, { ...budget, maxTreeNodes: 0 }); assert.equal(refreshed(incomplete, origin, current, { epoch: 4 }).report.reset, 'input-incomplete');
  f.options.currentEpoch = 5; const late = f.view(); assert.equal(refreshed(forest, origin, late).report.reason, 'epoch-outside-grace');
  f.options.currentEpoch = 4; f.options.snapshots = f.options.snapshots.filter(s => s.epoch === 3); assert.equal(refreshed(forest, origin, f.view(), { epoch: 4 }).report.reason, 'snapshot-unavailable');
});

test('strict origin/namespace/query brands and getters fail before unavailable work; results and old values remain immutable', () => {
  const f = fixture(['u', 'a'], [['a', 'u']], {}, ['a'], 1), origin = f.view(), forest = buildPathWitnessTrees(origin, budget), before = JSON.stringify([origin.toJSON(), forest.toJSON()]);
  for (const port of [{ ...forest }, null]) assert.throws(() => refreshPathWitnessTrees(port, origin, origin, budget));
  assert.throws(() => refreshPathWitnessTrees(forest, { ...origin }, origin, budget)); assert.throws(() => refreshPathWitnessTrees(forest, origin, { ...origin }, budget));
  for (const patch of [{ epoch: -0 }, { maxTreeNodes: 65537 }, { maxExpansions: 1000001 }, { extra: 0 }]) assert.throws(() => refreshPathWitnessTrees(forest, origin, origin, { ...budget, epoch: 99, ...patch }));
  let reads = 0; const bad = { ...budget }; Object.defineProperty(bad, 'epoch', { enumerable: true, get() { reads++; return 99; } }); assert.throws(() => refreshPathWitnessTrees(forest, origin, origin, bad)); assert.equal(reads, 0);
  f.graph.addNode('extra'); const current = f.view(); assert.throws(() => refreshPathWitnessTrees(forest, current, current, { ...budget, epoch: 99 }), /origin differs/);
  const other = fixture(['u', 'a'], [['a', 'u']], {}, ['a'], 1, 'other-namespace').view(); assert.throws(() => refreshPathWitnessTrees(forest, origin, other, { ...budget, epoch: 99 }), /namespace differs/);
  const q = Object.assign(Object.create(null), budget), r = refreshPathWitnessTrees(forest, origin, current, q); assert.throws(() => r.report.roots.pop()); assert.throws(() => r.forest.toJSON().parents.pop());
  JSON.stringify(r.report); assert.equal(JSON.stringify([origin.toJSON(), forest.toJSON()]), before); assert.equal(Object.hasOwn(r.report, 'forest'), false);
});

test('r64 Unicode, more than64 roots, empty roots and Native accepted-state/cached-tail consumers keep independent verification boundaries', () => {
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'é\0' + i), 'a'], f = fixture(path, path.slice(1).map((v, i) => [v, path[i]]), { maxHops: 64 }, ['a'], 1), origin = f.view(), forest = buildPathWitnessTrees(origin, budget);
  const r = refreshed(forest, origin, f.view(), { maxExpansions: 0, maxTreeNodes: 65 }); assert.equal(r.report.work.reusedRoots, 1); assert.equal(r.forest.path('u', 'a').length, 65); assert.equal(checkProposal(r.forest, f.view(), f.context).status, 'found');
  const anchors = Array.from({ length: 65 }, (_, i) => 'a' + i), many = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), { maxDifficulty: 64, maxHops: 1 }, anchors, 64), mv = many.view(), mf = buildPathWitnessTrees(mv, budget);
  assert.equal(refreshed(mf, mv, mv, { maxExpansions: 0 }).report.work.reusedRoots, 65); assert.equal(checkProposal(refreshed(mf, mv, mv).forest, mv, many.context).status, 'found');
  const empty = fixture(['u'], [], {}, [], 1), ev = empty.view(), ef = buildPathWitnessTrees(ev, budget); assert.equal(refreshed(ef, ev, ev, { maxTreeNodes: 0, maxExpansions: 0 }).forest.meta.complete, true);
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); m.confirmGuarantee('u', m.proposeGuarantee('a', 'u'));
  const nf = fixture(['u', 'a', 'b'], []), nv = capturePathWitnessModelView(m, nf.options), old = buildPathWitnessTrees(nv, budget); m.confirmGuarantee('u', m.proposeGuarantee('b', 'u'));
  const cv = capturePathWitnessModelView(m, nf.options), before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), n = refreshed(old, nv, cv);
  assert.equal(checkProposal(n.forest, cv, nf.context).status, 'found'); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
  const c = new PathWitnessSegmentCache({ ledgerId: 'native-software', maxEntries: 4, maxBytes: 10000, ttlTicks: 10 }), pool = createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 0, candidates: [] });
  for (const a of ['a', 'b']) c.put(cv, nf.context, { epoch: 3, path: ['u', a], tick: 0 });
  const joined = proposePathWitnessFromSegments(n.forest, cv, nf.context, { epoch: 3, maxPrefixHops: 1, maxPrefixes: 1, maxExpansions: 1000, maxBranches: 0, maxTreeLookups: 0, maxCandidates: 256, maxPackingSteps: 10000, tick: 0, maxSegmentLookups: 64, maxSegmentChecks: 64, maxSegmentResults: 64 },
    { pools: [{ subject: 'u', pool, loads: null }], routing: { seed: 'refresh-software', queryId: 'query-1', step: 0, mode: 'uniform' } }, c);
  assert.equal(joined.status, 'found'); for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(joined.wire), nf.context, cv).accepted, true);
});
