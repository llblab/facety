import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, repairPathWitnessTrees, proposePathWitnessFromTrees, proposePathWitnessFromSegments, PATH_TREE_REPAIR_LIMITS } from '../src/path-witness-trees.mjs';
import { createPathWitnessPool } from '../src/path-witness-pool.mjs';
import { PathWitnessSegmentCache } from '../src/path-witness-segments.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const contract = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/m3-tree-repair-contract-validation.json', import.meta.url)));
const build = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 }, budget = { epoch: 3, maxTreeNodes: 1000, maxQueuePops: 10000, maxPredecessorTrials: 10000, maxScheduleTrials: 10000, maxLabelUpdates: 10000 };
const proposal = { epoch: 3, maxCandidates: 256, maxPackingSteps: 10000 }, oracle = { epoch: 3, maxExpansions: 10000, maxPaths: 256, maxPackingSteps: 10000 }, cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function fixture(nodes, edges, patch = {}, anchors = ['a'], difficulty = 1, name = 'tree-repair-control') {
  const graph = new DirectedGraph(name); nodes.forEach(n => graph.addNode(n)); edges.forEach(([a, b]) => graph.addEdge(a, b));
  const context = structuredClone(base); Object.assign(context.policy, { maxHops: 3 }, patch);
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, anchors, difficulty }], removed: [], standing: [] };
  return { graph, context, options, view: () => pathWitnessGraphView(graph, options) };
}
function run(forest, origin, current, patch = {}) {
  const q = { ...budget, ...patch }, r = repairPathWitnessTrees(forest, origin, current, q), w = r.report.work;
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.report) && Object.isFrozen(w));
  for (const [field, limit] of [['queuePops', 'maxQueuePops'], ['predecessorTrials', 'maxPredecessorTrials'], ['scheduleTrials', 'maxScheduleTrials'], ['labelUpdates', 'maxLabelUpdates']]) assert.ok(w[field] <= q[limit]);
  assert.ok(w.retainedTreeNodes <= q.maxTreeNodes && w.peakWorkingLabels <= q.maxTreeNodes && w.peakPending <= current.nodeIds().length);
  if (!r.forest) { assert.equal(r.report.status, 'unavailable'); assert.equal(r.report.deltaComplete, null); assert.equal(r.report.reset, null); assert.ok(Object.values(w).every(n => n === 0)); return r; }
  const data = r.forest.toJSON(), rows = data.parents.reduce((n, t) => n + t.nodes.length, 0); assert.equal(rows, w.retainedTreeNodes); assert.equal(data.meta.stats.treeNodes, rows);
  assert.deepEqual(r.report.roots.map(r => r.anchor), r.forest.anchors()); assert.equal(r.forest.meta.complete, !r.report.roots.some(r => ['aborted', 'omitted'].includes(r.action)));
  for (const action of r.report.roots) assert.equal(data.parents.some(t => t.anchor === action.anchor), !['aborted', 'omitted'].includes(action.action));
  for (const tree of data.parents) for (const row of tree.nodes) {
    const path = r.forest.path(row.subject, tree.anchor); assert.equal(path.length, row.distance + 1); assert.equal(new Set(path).size, path.length);
    assert.ok(row.parent === null ? row.subject === tree.anchor && row.distance === 0 : tree.nodes.some(p => p.subject === row.parent && p.distance === row.distance - 1));
  }
  assert.equal(data.meta.originRoot, current.view().id); return r;
}
function checked(forest, v, context, epoch = 3) {
  const r = proposePathWitnessFromTrees(forest, v, context, { ...proposal, epoch });
  if (r.status === 'found') for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(r.wire), context, v).accepted, true);
  else assert.equal(r.feasible, null); return r;
}
// Independent simple-path enumeration selects root-first shortlex minima; no production queue, delta or BFS predicate.
function rawParents(nodes, edges, p, scores, anchors) {
  const has = (a, b) => edges.some(([x, y]) => a === x && b === y), compare = (a, b) => {
    if (a.length !== b.length) return a.length - b.length; for (let i = 0; i < a.length; i++) { const n = cmp(a[i], b[i]); if (n) return n; } return 0;
  };
  return anchors.map(anchor => {
    const paths = [];
    function visit(path) {
      paths.push(path); const node = path.at(-1);
      if (path.length === p.maxHops + 1 || (node !== anchor && p.minStanding !== null && (scores.get(node) ?? -1) < p.minStanding)) return;
      for (const next of nodes) if (!path.includes(next) && (p.direction === 'directed-from-anchor' ? has(node, next) : p.undirectedProjection === 'reciprocal-only' ? has(node, next) && has(next, node) : has(node, next) || has(next, node))) visit([...path, next]);
    }
    visit([anchor]); const rows = [];
    for (const subject of [...nodes].sort(cmp)) { const path = paths.filter(p => p.at(-1) === subject).sort(compare)[0]; if (path) rows.push({ subject, distance: path.length - 1, parent: path.length === 1 ? null : path.at(-2) }); }
    return { anchor, nodes: rows };
  });
}

test('24576 complete old→new pairs match raw simple-path canonical minima, full BFS/E1 and dual-verified M2 positives', t => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => b !== a).map(b => [a, b])); let pairs = 0, found = 0, reused = 0, repaired = 0;
  for (const mode of ['directed', 'any', 'reciprocal']) for (const scored of [false, true]) {
    const patch = { maxHops: 2, minStanding: scored ? 1 : null, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' };
    const states = Array.from({ length: 64 }, (_, bits) => {
      const edges = arcs.filter((_, i) => bits & (1 << i)), f = fixture(nodes, edges, patch, ['a', 'b'], 2); f.options.standing = [['a', 0], ['b', 1]];
      const origin = f.view(), forest = buildPathWitnessTrees(origin, build); f.options.standing = [['a', 1], ['b', 0]];
      const current = f.view(), full = buildPathWitnessTrees(current, build), raw = rawParents(nodes, edges, f.context.policy, new Map(f.options.standing), ['a', 'b']); assert.deepEqual(full.toJSON().parents, raw);
      return { f, origin, forest, current, raw, exact: findPathWitness(current, f.context, oracle).status };
    });
    // Synthetic state pairs declare a namespace, not a funded/authenticated real event history.
    for (const before of states) for (const after of states) {
      const r = run(before.forest, before.origin, after.current), e1 = refreshPathWitnessTrees(before.forest, before.origin, after.current, build);
      assert.equal(r.forest.meta.complete, true); assert.deepEqual(r.forest.toJSON().parents, after.raw); assert.deepEqual(r.forest.toJSON().parents, e1.forest.toJSON().parents);
      assert.deepEqual(r.report.roots.map(row => ({ anchor: row.anchor, reused: row.action === 'reused' })), e1.report.roots.map(row => ({ anchor: row.anchor, reused: row.action === 'reused' })));
      assert.ok(r.report.work.classificationNodeChecks <= before.forest.meta.stats.treeNodes); const p = checked(r.forest, after.current, after.f.context); assert.equal(p.status === 'found', after.exact === 'found');
      pairs++; if (p.status === 'found') found++; reused += r.report.work.reusedRoots; repaired += r.report.work.repairedRoots;
    }
  }
  assert.equal(pairs, 24576); assert.equal(found, 7168); assert.equal(reused, 9408); assert.equal(repaired, 39744); t.diagnostic('tree-repair-raw-controls ' + JSON.stringify({ pairs, found, reused, repaired, observedMismatch: 0 }));
});

test('full-root ancestor labels propagate through unchanged distance/parent rows, not minimum parent ID or JSON ordering', () => {
  const f = fixture(['u', 'a', 'c', 'y', 'z', 't', 'm', 'n', 'b'], [['a', 'c'], ['a', 'y'], ['y', 'z'], ['z', 't'], ['t', 'u'], ['a', 'm'], ['m', 'n'], ['n', 'b'], ['b', 'u']], { maxHops: 4 });
  const origin = f.view(), old = buildPathWitnessTrees(origin, build); f.graph.addEdge('c', 'z'); const current = f.view(), r = run(old, origin, current);
  assert.deepEqual(old.toJSON().parents[0].nodes.find(row => row.subject === 't'), r.forest.toJSON().parents[0].nodes.find(row => row.subject === 't'));
  assert.deepEqual(old.path('u', 'a'), ['u', 'b', 'n', 'm', 'a']); assert.deepEqual(r.forest.path('u', 'a'), ['u', 't', 'z', 'c', 'a']); assert.equal(r.report.work.labelUpdates, 3); assert.equal(checked(r.forest, current, f.context).status, 'found');
  const mixed = fixture(['u', 'a', 'c', 'y', 'z', 't', 'm', 'n', 'b'], [['a', 'c'], ['a', 'y'], ['y', 'z'], ['z', 't'], ['t', 'u'], ['a', 'm'], ['m', 'n'], ['n', 'b'], ['b', 'u']], { maxHops: 4, minStanding: 1 });
  mixed.options.standing = [...mixed.graph.nodeIds()].filter(v => v !== 'c').map(v => [v, 1]); const mo = mixed.view(), mf = buildPathWitnessTrees(mo, build);
  mixed.graph.removeEdge('m', 'n'); mixed.graph.addEdge('c', 'z'); mixed.options.standing = [...mixed.graph.nodeIds()].map(v => [v, v === 'y' ? 0 : 1]); const mc = mixed.view(), repaired = run(mf, mo, mc);
  const raw = rawParents([...mixed.graph.nodeIds()], mc.toJSON().live.edges, mixed.context.policy, new Map(mixed.options.standing), ['a']);
  assert.deepEqual(repaired.forest.toJSON().parents, raw); assert.deepEqual(repaired.forest.toJSON().parents, buildPathWitnessTrees(mc, build).toJSON().parents); assert.deepEqual(repaired.forest.toJSON().parents, refreshPathWitnessTrees(mf, mo, mc, build).forest.toJSON().parents);
  assert.deepEqual(repaired.forest.path('u', 'a'), ['u', 't', 'z', 'c', 'a']); assert.equal(repaired.report.work.invalidatedNodes, 5); assert.equal(checked(repaired.forest, mc, mixed.context).status, 'found');
  for (const [nodes, edges, expected] of [[['u', 'a', 'x', 'y', 'z', 'b'], [['a', 'x'], ['x', 'z'], ['z', 'u'], ['a', 'y'], ['y', 'b'], ['b', 'u']], ['u', 'z', 'x', 'a']],
    [['u', 'a', '\0', '0'], [['a', '\0'], ['\0', 'u'], ['a', '0'], ['0', 'u']], ['u', '\0', 'a']]]) {
    const x = fixture(nodes, edges), v = x.view(), empty = buildPathWitnessTrees(v, { ...build, maxTreeNodes: 0 }), repaired = run(empty, v, v);
    assert.deepEqual(repaired.forest.path('u', 'a'), expected); assert.equal(checked(repaired.forest, v, x.context).status, 'found');
  }
});

test('broken subtrees clear disconnected cycles, unchanged boundary ingress requeues after an earlier unsuccessful pop', () => {
  const f = fixture(['u', 'v', 'x', 'y', 'a'], [['a', 'x'], ['x', 'v'], ['v', 'u'], ['a', 'y'], ['y', 'v']]), origin = f.view(), old = buildPathWitnessTrees(origin, build);
  f.graph.removeEdge('x', 'v'); const current = f.view(), r = run(old, origin, current); assert.deepEqual(r.forest.path('u', 'a'), ['u', 'v', 'y', 'a']);
  assert.equal(r.report.work.invalidatedNodes, 2); assert.equal(r.report.work.queuePops, 3); assert.equal(r.report.work.scheduleTrials, 3); assert.equal(r.report.work.labelsAdmitted, 2);
  const cyclic = fixture(['u', 'a', 'x', 'y'], [['a', 'x'], ['x', 'y'], ['y', 'x'], ['y', 'u']]), cv = cyclic.view(), cf = buildPathWitnessTrees(cv, build); cyclic.graph.removeEdge('a', 'x'); const lost = run(cf, cv, cyclic.view());
  assert.equal(lost.forest.path('u', 'a'), null); assert.equal(lost.report.work.invalidatedNodes, 3); assert.equal(lost.forest.meta.complete, true); assert.deepEqual(lost.forest.toJSON().parents[0].nodes, [{ subject: 'a', distance: 0, parent: null }]);
});

test('all queue/predecessor/schedule/update exact/one-less/zero boundaries discard whole unsettled roots without refunds', () => {
  const f = fixture(['u', 'x', 'a', 'b'], [['a', 'x'], ['x', 'u']], {}, ['a', 'b']), origin = f.view(), old = buildPathWitnessTrees(origin, build); f.graph.addEdge('a', 'u'); const current = f.view(), full = run(old, origin, current);
  for (const [limit, counter, reason] of [['maxQueuePops', 'queuePops', 'queue-limit'], ['maxPredecessorTrials', 'predecessorTrials', 'predecessor-limit'], ['maxScheduleTrials', 'scheduleTrials', 'schedule-limit'], ['maxLabelUpdates', 'labelUpdates', 'label-update-limit']]) {
    const count = full.report.work[counter]; assert.ok(count > 0); assert.equal(run(old, origin, current, { [limit]: count }).forest.meta.complete, true);
    for (const n of new Set([0, count - 1])) { const r = run(old, origin, current, { [limit]: n }); assert.equal(r.report.reason, reason); assert.deepEqual(r.report.roots.map(row => row.action), ['aborted', 'omitted']); assert.equal(r.forest.toJSON().parents.length, 0); assert.equal(r.report.work.abortedRoots, 1); }
  }
  const nodes = run(old, origin, current, { maxTreeNodes: 2 }); assert.equal(nodes.report.reason, 'tree-node-limit'); assert.equal(nodes.report.roots[0].action, 'aborted');
  const exactA = run(old, origin, current, { maxTreeNodes: 3 }); assert.deepEqual(exactA.report.roots.map(row => row.action), ['repaired', 'omitted']); assert.deepEqual(exactA.forest.path('u', 'a'), ['u', 'a']);
  const zero = run(old, origin, current, { maxTreeNodes: 0 }); assert.deepEqual(zero.report.roots.map(row => row.action), ['omitted', 'omitted']); assert.equal(zero.report.work.labelRowsInitialized, 0);
  const tiny = fixture(['u', 'a'], [['a', 'u']]), tv = tiny.view(), cold = buildPathWitnessTrees(tv, { ...build, maxTreeNodes: 0 }), precedence = run(cold, tv, tv, { maxTreeNodes: 1, maxLabelUpdates: 0 });
  assert.equal(precedence.report.reason, 'tree-node-limit'); assert.equal(precedence.report.work.labelUpdates, 0); assert.equal(precedence.report.work.predecessorTrials, 1);
});

test('every warm/cold global budget abort position retains only canonical settled roots and never refunds work', () => {
  const f = fixture(['0', 'w', 'u', 'a', 'c', 'y', 'z', 't', 'm', 'n', 'b'], [['0', 'w'], ['a', 'c'], ['a', 'y'], ['y', 'z'], ['z', 't'], ['t', 'u'], ['a', 'm'], ['m', 'n'], ['n', 'b'], ['b', 'u']], { maxHops: 4 }, ['0', 'a', 'y']), origin = f.view(), old = buildPathWitnessTrees(origin, build);
  f.graph.addEdge('c', 'z'); const current = f.view(), cold = buildPathWitnessTrees(origin, { ...build, maxTreeNodes: 0 }), full = buildPathWitnessTrees(current, build).toJSON().parents;
  const canonical = r => { for (const tree of r.forest.toJSON().parents) assert.deepEqual(tree, full.find(t => t.anchor === tree.anchor)); };
  for (const input of [old, cold]) {
    const complete = run(input, origin, current); canonical(complete);
    for (const [limit, counter, reason] of [['maxQueuePops', 'queuePops', 'queue-limit'], ['maxPredecessorTrials', 'predecessorTrials', 'predecessor-limit'], ['maxScheduleTrials', 'scheduleTrials', 'schedule-limit'], ['maxLabelUpdates', 'labelUpdates', 'label-update-limit']]) {
      const count = complete.report.work[counter]; assert.equal(run(input, origin, current, { [limit]: count }).forest.meta.complete, true);
      for (let n = 0; n < count; n++) { const r = run(input, origin, current, { [limit]: n }); assert.equal(r.report.reason, reason); assert.equal(r.report.work[counter], n); assert.equal(r.forest.meta.complete, false); canonical(r); }
    }
    for (let n = 0; n <= complete.report.work.retainedTreeNodes; n++) { const r = run(input, origin, current, { maxTreeNodes: n }); assert.equal(r.forest.meta.complete, n === complete.report.work.retainedTreeNodes); canonical(r); if (!r.forest.meta.complete) assert.equal(r.report.reason, 'tree-node-limit'); }
  }
});

test('successor-scheduling abort after a committed label is counted but never published; earlier roots survive later aborts', () => {
  const f = fixture(['u', 'a', 'c', 'y', 'z', 't', 'm', 'n', 'b'], [['a', 'c'], ['a', 'y'], ['y', 'z'], ['z', 't'], ['t', 'u'], ['a', 'm'], ['m', 'n'], ['n', 'b'], ['b', 'u']], { maxHops: 4 }), origin = f.view(), old = buildPathWitnessTrees(origin, build);
  f.graph.addEdge('c', 'z'); const r = run(old, origin, f.view(), { maxScheduleTrials: 1 }); assert.equal(r.report.reason, 'schedule-limit'); assert.equal(r.report.work.labelUpdates, 1); assert.equal(r.report.work.retainedTreeNodes, 0); assert.equal(r.forest.path('u', 'a'), null);
  const later = fixture(['u', 'x', 'v', 'a', 'b'], [['a', 'u'], ['b', 'x'], ['x', 'v']], {}, ['a', 'b']), lv = later.view(), lf = buildPathWitnessTrees(lv, build); later.graph.addEdge('b', 'v'); const out = run(lf, lv, later.view(), { maxQueuePops: 0 });
  assert.deepEqual(out.report.roots.map(row => row.action), ['reused', 'aborted']); assert.deepEqual(out.forest.path('u', 'a'), ['u', 'a']); assert.equal(out.forest.path('v', 'b'), null);
});

test('warm unaffected reuse and affected deletion with no invalidation need no queue, while cold resets use the explicit engine', () => {
  const f = fixture(['u', 'x', 'a'], [['a', 'u'], ['a', 'x'], ['x', 'u']]), origin = f.view(), old = buildPathWitnessTrees(origin, build), zeros = { maxQueuePops: 0, maxPredecessorTrials: 0, maxScheduleTrials: 0, maxLabelUpdates: 0 };
  const warm = run(old, origin, origin, zeros); assert.equal(warm.report.work.reusedRoots, 1); assert.equal(warm.report.work.labelRowsInitialized, 0);
  f.graph.removeEdge('x', 'u'); const current = f.view(), unused = run(old, origin, current, zeros); assert.equal(unused.report.work.repairedRoots, 1); assert.equal(unused.report.work.invalidatedNodes, 0); assert.equal(unused.report.work.queuePops, 0);
  const cold = buildPathWitnessTrees(current, { ...build, maxTreeNodes: 0 }), full = run(cold, current, current); assert.equal(full.report.reset, 'input-incomplete'); assert.equal(full.report.deltaComplete, false); assert.equal(full.report.work.rebuiltRoots, 1); assert.equal(full.report.work.preparedOldNodes, 0); assert.equal(full.report.work.oldParentChecks, 0);
  assert.deepEqual(full.forest.toJSON().parents, buildPathWitnessTrees(current, build).toJSON().parents); assert.equal(run(cold, current, current, zeros).report.roots[0].action, 'aborted');
});

test('root/endpoint gate exemptions, null/zero/same-class/off and gain/loss propagate only current-valid paths', () => {
  const f = fixture(['u', 'x', 'a'], [['a', 'x'], ['x', 'u']], { minStanding: 1 }); f.options.standing = [['a', 1], ['x', 1]]; const origin = f.view(), old = buildPathWitnessTrees(origin, build);
  f.options.standing = [['a', 0], ['x', 0]]; const low = f.view(), r = run(old, origin, low); assert.deepEqual(r.forest.path('x', 'a'), ['x', 'a']); assert.equal(r.forest.path('u', 'a'), null); assert.equal(r.report.work.invalidatedNodes, 1);
  f.options.standing = [['a', 0], ['x', 2]]; const high = f.view(), gain = run(r.forest, low, high); assert.deepEqual(gain.forest.path('u', 'a'), ['u', 'x', 'a']); assert.equal(gain.report.work.labelsAdmitted, 1); assert.ok(gain.report.work.activationArcReads > 0);
  f.options.standing = [['a', 1], ['x', 3]]; assert.equal(run(gain.forest, high, f.view()).report.work.reusedRoots, 1);
  const zero = fixture(['u', 'x', 'a'], [['a', 'x'], ['x', 'u']], { minStanding: 0 }), zv = zero.view(), zf = buildPathWitnessTrees(zv, build); zero.options.standing = [['x', 0]]; assert.deepEqual(run(zf, zv, zero.view()).forest.path('u', 'a'), ['u', 'x', 'a']);
  const off = fixture(['u', 'x', 'a'], [['a', 'x'], ['x', 'u']]), ov = off.view(), of = buildPathWitnessTrees(ov, build); off.options.standing = [['x', 0]]; const ignored = run(of, ov, off.view()); assert.equal(ignored.report.work.reusedRoots, 1); assert.equal(ignored.report.work.scoreEligibilityComparisons, 0);
});

test('retired/new/live roots, removed transit, projection changes, IDs and current difficulty remain separate from authority', () => {
  const f = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'a']], {}, ['a', 'b']), origin = f.view(), old = buildPathWitnessTrees(origin, build); f.options.removed = ['a']; const current = f.view(), r = run(old, origin, current);
  assert.deepEqual(r.report.retired, ['a']); assert.deepEqual(r.forest.path('u', 'b'), ['u', 'a', 'b']); assert.equal(r.report.work.reusedRoots, 1);
  f.options.removed = []; const added = f.view(), both = run(r.forest, current, added); assert.deepEqual(both.report.roots.map(row => row.action), ['rebuilt', 'reused']);
  f.options.snapshots = [{ epoch: 3, anchors: ['a', 'b'], difficulty: 2 }]; const harder = f.view(), d = run(both.forest, added, harder); assert.equal(d.report.work.reusedRoots, 2); assert.notEqual(checked(d.forest, harder, f.context).status, 'found');
  f.graph.removeNode('a'); const gone = run(d.forest, harder, f.view()); assert.equal(gone.forest.path('u', 'b'), null);
  for (const mode of ['any-live-orientation', 'reciprocal-only']) {
    const p = fixture(['u', 'a'], [['a', 'u'], ['u', 'a']], { direction: 'undirected', undirectedProjection: mode }), pv = p.view(), pf = buildPathWitnessTrees(pv, build); p.graph.removeEdge('a', 'u');
    const changed = run(pf, pv, p.view()); assert.equal(changed.forest.path('u', 'a') !== null, mode === 'any-live-orientation');
  }
  const id = fixture(['u', 'a'], [['a', 'u']]), iv = id.view(), it = buildPathWitnessTrees(iv, build), c = new PathWitnessSegmentCache({ ledgerId: 'repair-software', maxEntries: 4, maxBytes: 10000, ttlTicks: 10 }); c.put(iv, id.context, { epoch: 3, path: ['u', 'a'], tick: 0 });
  id.graph.removeEdge('a', 'u'); id.graph.addEdge('a', 'u'); const fresh = id.view(), before = c.stats(), reused = run(it, iv, fresh); assert.equal(reused.report.work.reusedRoots, 1); assert.deepEqual(c.stats(), before); assert.equal(c.lookup(fresh, id.context, { epoch: 3, to: 'a', tick: 1, maxChecks: 4, maxResults: 4 }).status, 'miss');
});

test('epoch/policy/incomplete resets, availability and strict preflight preserve null missingness and immutable inputs', () => {
  const f = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']]), origin = f.view(), old = buildPathWitnessTrees(origin, build), saved = JSON.stringify([origin.toJSON(), old.toJSON()]); f.options.currentEpoch = 4; f.options.snapshots.push({ epoch: 4, anchors: ['b'], difficulty: 1 });
  const current = f.view(), epoch = run(old, origin, current, { epoch: 4 }); assert.equal(epoch.report.reset, 'epoch-changed'); assert.equal(checked(epoch.forest, current, f.context, 4).status, 'found');
  const incomplete = buildPathWitnessTrees(origin, { ...build, maxTreeNodes: 0 }); assert.equal(run(incomplete, origin, current, { epoch: 4 }).report.reset, 'input-incomplete');
  f.options.policy = { ...f.options.policy, maxHops: 1 }; f.context.policy = f.options.policy; const policy = run(old, origin, f.view()); assert.equal(policy.report.reset, 'policy-changed');
  f.options.currentEpoch = 5; assert.equal(run(old, origin, f.view()).report.reason, 'epoch-outside-grace'); f.options.currentEpoch = 4; f.options.snapshots = f.options.snapshots.filter(s => s.epoch === 3); assert.equal(run(old, origin, f.view(), { epoch: 4 }).report.reason, 'snapshot-unavailable');
  for (const port of [null, { ...old }]) assert.throws(() => repairPathWitnessTrees(port, origin, current, budget)); assert.throws(() => repairPathWitnessTrees(old, { ...origin }, current, budget));
  for (const patch of [{ epoch: -0 }, { maxQueuePops: 1000001 }, { maxPredecessorTrials: 1000001 }, { maxScheduleTrials: 1000001 }, { maxLabelUpdates: 1000001 }, { maxTreeNodes: 65537 }, { extra: 1 }]) assert.throws(() => repairPathWitnessTrees(old, origin, current, { ...budget, epoch: 99, ...patch }));
  for (const key of Object.keys(budget)) {
    const missing = { ...budget }; delete missing[key]; assert.throws(() => repairPathWitnessTrees(old, origin, current, missing));
    for (const value of [-0, -1, 0.5, NaN, Infinity, null, '0', true]) assert.throws(() => repairPathWitnessTrees(old, origin, current, { ...budget, [key]: value }));
  }
  let reads = 0; const bad = { ...budget }; Object.defineProperty(bad, 'epoch', { enumerable: true, get() { reads++; return 99; } }); assert.throws(() => repairPathWitnessTrees(old, origin, current, bad)); assert.equal(reads, 0);
  assert.throws(() => repairPathWitnessTrees(old, current, current, { ...budget, epoch: 99 }), /origin differs/);
  const other = fixture(['u', 'a'], [['a', 'u']], {}, ['a'], 1, 'other').view(); assert.throws(() => repairPathWitnessTrees(old, origin, other, { ...budget, epoch: 99 }), /namespace differs/);
  const result = repairPathWitnessTrees(old, origin, current, Object.assign(Object.create(null), budget)); assert.throws(() => result.report.roots.pop()); assert.throws(() => result.forest.toJSON().parents.pop()); assert.equal(JSON.stringify([origin.toJSON(), old.toJSON()]), saved);
  assert.deepEqual(PATH_TREE_REPAIR_LIMITS, { maxQueuePops: 1000000, maxPredecessorTrials: 1000000, maxScheduleTrials: 1000000, maxLabelUpdates: 1000000 });
});

test('r64 Unicode/D64/>64 roots/empty targets and Native/cached-tail consumption keep full verifier/Model boundaries', () => {
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'é\0' + i), 'a'], f = fixture(path, path.slice(1).map((v, i) => [v, path[i]]), { maxHops: 64 }), v = f.view(), cold = buildPathWitnessTrees(v, { ...build, maxTreeNodes: 0 }), r = run(cold, v, v, { maxTreeNodes: 65 }); assert.equal(r.forest.path('u', 'a').length, 65); assert.equal(checked(r.forest, v, f.context).status, 'found');
  const anchors = Array.from({ length: 65 }, (_, i) => 'a' + i), many = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), { maxHops: 1, maxDifficulty: 64 }, anchors, 64), mv = many.view(), mf = buildPathWitnessTrees(mv, { ...build, maxTreeNodes: 0 }), d64 = run(mf, mv, mv); assert.equal(d64.report.work.rebuiltRoots, 65); assert.equal(checked(d64.forest, mv, many.context).status, 'found');
  const empty = fixture(['u'], [], {}, [], 1), ev = empty.view(); assert.equal(run(buildPathWitnessTrees(ev, build), ev, ev, { maxTreeNodes: 0, maxQueuePops: 0 }).forest.meta.complete, true);
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); m.confirmGuarantee('u', m.proposeGuarantee('a', 'u')); const nf = fixture(['u', 'a', 'b'], [], {}, ['a', 'b'], 2), ov = capturePathWitnessModelView(m, nf.options), of = buildPathWitnessTrees(ov, build); m.confirmGuarantee('u', m.proposeGuarantee('b', 'u'));
  const nv = capturePathWitnessModelView(m, nf.options), before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), native = run(of, ov, nv); assert.equal(checked(native.forest, nv, nf.context).status, 'found'); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
  const pool = createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 0, candidates: [] }), c = new PathWitnessSegmentCache({ ledgerId: 'native-repair', maxEntries: 4, maxBytes: 10000, ttlTicks: 10 }); for (const a of ['a', 'b']) c.put(nv, nf.context, { epoch: 3, path: ['u', a], tick: 0 });
  const joined = proposePathWitnessFromSegments(native.forest, nv, nf.context, { epoch: 3, maxPrefixHops: 1, maxPrefixes: 1, maxExpansions: 1000, maxBranches: 0, maxTreeLookups: 0, maxCandidates: 256, maxPackingSteps: 10000, tick: 0, maxSegmentLookups: 64, maxSegmentChecks: 64, maxSegmentResults: 64 },
    { pools: [{ subject: 'u', pool, loads: null }], routing: { seed: 'repair-software', queryId: 'query-1', step: 0, mode: 'uniform' } }, c); assert.equal(joined.status, 'found'); for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(joined.wire), nf.context, nv).accepted, true);
});

test('pre-code24576 E1 forest/report stream is unchanged after adding local repair', () => {
  const b = contract.existingAPIProbe.e1Baseline, hash = createHash('sha256'); let pairs = 0, reused = 0, rebuilt = 0;
  for (const mode of ['directed', 'any', 'reciprocal']) for (const scored of [false, true]) {
    const states = Array.from({ length: 64 }, (_, bits) => {
      const f = fixture(b.nodes, b.arcs.filter((_, i) => bits & (1 << i)), { maxHops: 2, minStanding: scored ? 1 : null, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected', undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' }, b.snapshot.anchors, b.snapshot.difficulty, b.graphName);
      f.options.standing = b.oldStanding; const origin = f.view(), forest = buildPathWitnessTrees(origin, b.build); f.options.standing = b.currentStanding; return { origin, forest, current: f.view() };
    });
    for (const before of states) for (const after of states) { const r = refreshPathWitnessTrees(before.forest, before.origin, after.current, b.build); hash.update(JSON.stringify([r.forest.toJSON(), r.report])).update('\0'); pairs++; reused += r.report.work.reusedRoots; rebuilt += r.report.work.rebuiltRoots; }
  }
  assert.equal(pairs, b.pairs); assert.equal(reused, b.reused); assert.equal(rebuilt, b.rebuilt); assert.equal(hash.digest('hex'), b.digest);
});
