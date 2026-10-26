import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView } from '../src/path-witness-view.mjs';
import { buildPathWitnessTrees, proposePathWitnessFromUnion, PATH_UNION_LIMITS } from '../src/path-witness-trees.mjs';
import { findPathWitness, PATH_ORACLE_LIMITS } from '../src/path-witness-oracle.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const deep = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/branch-tree-miss.json', import.meta.url)));
const build = { epoch: 3, maxExpansions: 10000, maxTreeNodes: 1000 };
const budget = { epoch: 3, maxSubjectHops: 2, maxAnchorHops: 2, maxVertices: 4096, maxArcs: 65536, maxTreeRows: 65536, maxBallTrials: 10000, maxExpansions: 10000, maxPaths: 4096, maxPackingSteps: 10000 };
const cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)), pairCmp = (a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]);
function fixture(nodes, edges, patch = {}, anchors = ['a', 'b'], difficulty = 2, name = 'union-control') {
  const context = structuredClone(base); Object.assign(context.policy, { maxHops: 3 }, patch);
  const graph = new DirectedGraph(name); nodes.forEach(v => graph.addNode(v)); edges.forEach(([a, b]) => graph.addEdge(a, b));
  const options = { policy: context.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty, anchors }], removed: [], standing: [] };
  return { graph, context, options, view: () => pathWitnessGraphView(graph, options) };
}
// Independent raw-row projection and layer waves: no production neighbor/preparation/queue/union helpers.
function rawUnion(data, old, context, q) {
  const p = context.policy, nodes = [...data.live.nodes].sort(cmp), scores = new Map(data.options.standing), snapshot = data.options.snapshots.find(s => s.epoch === q.epoch);
  const has = (a, b) => data.live.edges.some(([x, y]) => a === x && b === y), projected = nodes.flatMap(a => nodes.filter(b => a !== b && (p.direction === 'directed-from-anchor' ? has(a, b)
    : p.undirectedProjection === 'reciprocal-only' ? has(a, b) && has(b, a) : has(a, b) || has(b, a))).map(b => [a, b]));
  const flags = { vertexLimit: false, arcLimit: false, ballTrialLimit: false, treeRowLimit: false, subjectDepthCut: false, anchorDepthCut: false, forestIncomplete: !old.meta.complete };
  const counts = { preparedNodes: nodes.length, preparedStorageEdges: data.live.edges.length, projectedArcs: projected.length, anchorSeedsExamined: 0, anchorSeedsRetained: 0,
    subjectQueuePops: 0, anchorQueuePops: 0, ballTrials: 0, treeRowsInspected: 0, treeEdgesExamined: 0, staleTreeEdges: 0, arcAdmissionAttempts: 0,
    retainedVertices: 0, retainedArcs: 0, virtualNodes: 0, virtualStorageEdges: 0 };
  if (q.maxVertices === 0) { flags.vertexLimit = true; return { vertices: [], arcs: [], counts, flags }; }
  const vertices = new Set([context.subject]), arcs = new Set(), roots = [];
  for (const a of [...snapshot.anchors].sort(cmp).filter(a => a !== context.subject && nodes.includes(a) && !data.options.removed.includes(a))) {
    counts.anchorSeedsExamined++; if (vertices.size >= q.maxVertices && !vertices.has(a)) flags.vertexLimit = true;
    else { vertices.add(a); roots.push(a); counts.anchorSeedsRetained++; }
  }
  function offer(a, b) {
    counts.arcAdmissionAttempts++; const proposedVertices = new Set([...vertices, a, b]);
    if (proposedVertices.size > q.maxVertices) { flags.vertexLimit = true; return false; }
    const proposedArcs = new Set([...arcs, JSON.stringify([a, b]), ...(p.direction === 'directed-from-anchor' ? [] : [JSON.stringify([b, a])])]);
    if (proposedArcs.size > q.maxArcs) { flags.arcLimit = true; return false; }
    for (const v of proposedVertices) vertices.add(v); for (const e of proposedArcs) arcs.add(e); return true;
  }
  function waves(anchor) {
    let wave = anchor ? [...roots] : [context.subject]; const visited = new Set(wave), radius = anchor ? q.maxAnchorHops : q.maxSubjectHops;
    for (let depth = 0; wave.length; depth++) {
      const later = [];
      for (const node of wave) {
        counts[anchor ? 'anchorQueuePops' : 'subjectQueuePops']++;
        if (anchor && node === context.subject) continue;
        if (!(anchor ? roots.includes(node) : node === context.subject) && p.minStanding !== null && (scores.get(node) === undefined || scores.get(node) === null || scores.get(node) < p.minStanding)) continue;
        const neighbors = projected.filter(e => e[anchor ? 0 : 1] === node).map(e => e[anchor ? 1 : 0]).sort(cmp);
        if (depth === radius) { if (neighbors.length) flags[anchor ? 'anchorDepthCut' : 'subjectDepthCut'] = true; continue; }
        for (const next of neighbors) {
          if (counts.ballTrials >= q.maxBallTrials) { flags.ballTrialLimit = true; return false; }
          counts.ballTrials++;
          if (offer(anchor ? node : next, anchor ? next : node) && !visited.has(next)) { visited.add(next); later.push(next); }
        }
      }
      wave = later;
    }
    return true;
  }
  if (waves(false)) waves(true);
  const rows = old.parents.flatMap(t => t.nodes);
  for (const row of rows.slice(0, q.maxTreeRows)) {
    counts.treeRowsInspected++; if (row.parent === null) continue; counts.treeEdgesExamined++;
    if (projected.some(([a, b]) => a === row.parent && b === row.subject)) offer(row.parent, row.subject); else counts.staleTreeEdges++;
  }
  flags.treeRowLimit = rows.length > q.maxTreeRows;
  const result = { vertices: [...vertices].sort(cmp), arcs: [...arcs].map(e => JSON.parse(e)).sort(pairCmp), counts, flags };
  counts.retainedVertices = counts.virtualNodes = result.vertices.length; counts.retainedArcs = counts.virtualStorageEdges = result.arcs.length; return result;
}
// Enumerate all simple subject-first paths and all D-combinations using raw physical IDs, not M2 packing.
function rawFeasible(nodes, arcs, context, options, epoch) {
  const p = context.policy, snapshot = options.snapshots.find(s => s.epoch === epoch), scores = new Map(options.standing), paths = [];
  function dfs(path) {
    const v = path.at(-1);
    if (path.length > 1 && snapshot.anchors.includes(v) && !options.removed.includes(v)) paths.push(path);
    if (path.length - 1 === p.maxHops || (v !== context.subject && p.minStanding !== null && (scores.get(v) ?? -1) < p.minStanding)) return;
    for (const next of nodes) if (!path.includes(next) && arcs.some(([a, b]) => a === next && b === v)) dfs([...path, next]);
  }
  dfs([context.subject]);
  function combinations(start, chosen) {
    if (chosen.length === snapshot.difficulty) return chosen.flatMap(path => path.slice(1)).length === new Set(chosen.flatMap(path => path.slice(1))).size;
    for (let i = start; i < paths.length; i++) if (combinations(i + 1, [...chosen, paths[i]])) return true;
    return false;
  }
  return combinations(0, []);
}
function checked(forest, view, context, patch = {}, compareRaw = true) {
  const q = { ...budget, ...patch }, before = JSON.stringify([forest.toJSON(), view.toJSON(), context, q]), r = proposePathWitnessFromUnion(forest, view, context, q);
  assert.equal(JSON.stringify([forest.toJSON(), view.toJSON(), context, q]), before); assert.ok(Object.isFrozen(r) && Object.isFrozen(r.retained.arcs) && Object.isFrozen(r.work.extraction));
  const w = r.work.extraction;
  for (const [key, cap] of [['retainedVertices', 'maxVertices'], ['retainedArcs', 'maxArcs'], ['treeRowsInspected', 'maxTreeRows'], ['ballTrials', 'maxBallTrials']]) assert.ok(w[key] <= q[cap], key);
  assert.equal(r.viewRoot, view.view().id); assert.equal(r.forestRoot, forest.meta.originRoot); assert.equal(r.canonicalReference, view.capture.reference);
  if (r.status === 'unavailable') { assert.equal(r.coverage, null); assert.equal(r.required, null); assert.equal(r.work.search, null); assert.equal(r.retained.viewRoot, null); assert.ok(Object.values(w).every(n => n === 0)); }
  else if (compareRaw) { const raw = rawUnion(view.toJSON(), forest.toJSON(), context, q); assert.deepEqual(r.retained.vertices, raw.vertices); assert.deepEqual(r.retained.arcs, raw.arcs); assert.deepEqual(r.coverage, raw.flags); assert.deepEqual(w, raw.counts); }
  if (r.status === 'found') {
    assert.equal(r.feasible, true); assert.equal(r.reason, 'ok'); assert.equal(r.witness.paths.length, r.required);
    for (const v of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(v(Buffer.from(r.wire), context, view).accepted, true);
    for (const scope of ['retained', 'current']) { assert.equal(r.verification[scope].primary.accepted, true); assert.equal(r.verification[scope].ref2.accepted, true); }
  } else { assert.equal(r.feasible, null); assert.equal(r.wire, null); assert.equal(r.witness, null); assert.equal(r.verification, null); }
  return r;
}
function localReference(r, view, context, q) {
  const graph = new DirectedGraph('retained-union'); r.retained.vertices.forEach(v => graph.addNode(v)); r.retained.arcs.forEach(([a, b]) => graph.addEdge(a, b));
  const o = view.toJSON().options, local = pathWitnessGraphView(graph, { ...o, snapshots: o.snapshots.filter(s => s.epoch === q.epoch) });
  assert.equal(r.retained.viewRoot, local.view().id);
  const ref = findPathWitness(local, context, Object.fromEntries(['epoch', ...Object.keys(PATH_ORACLE_LIMITS)].map(k => [k, q[k]])));
  assert.deepEqual(r.work.search, { status: ref.status, reason: ref.reason, feasible: ref.feasible, stats: ref.stats }); assert.equal(r.wire, ref.wire); return ref;
}

test('6912 raw projected/retained unions and physical simple-path families agree across both radii, scores, projections and full/empty forests', t => {
  const nodes = ['u', 'a', 'b'], arcs = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b])); let cases = 0, found = 0, retainedMiss = 0;
  for (let bits = 0; bits < 64; bits++) for (const mode of ['directed', 'any', 'reciprocal']) for (const scored of [false, true]) {
    const f = fixture(nodes, arcs.filter((_, i) => bits & (1 << i)), { maxHops: 2, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected',
      undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation', minStanding: scored ? 1 : null });
    f.options.standing = [['a', 0], ['b', 1]]; const view = f.view(), exact = findPathWitness(view, f.context, { epoch: 3, maxExpansions: 10000, maxPaths: 4096, maxPackingSteps: 10000 });
    for (const maxTreeNodes of [0, 1000]) { const forest = buildPathWitnessTrees(view, { ...build, maxTreeNodes });
      for (let s = 0; s <= 2; s++) for (let a = 0; a <= 2; a++) {
        const r = checked(forest, view, f.context, { maxSubjectHops: s, maxAnchorHops: a });
        const feasible = rawFeasible(r.retained.vertices, r.retained.arcs, f.context, f.options, 3); assert.equal(r.status === 'found', feasible);
        assert.equal(r.work.search.status === 'found', feasible); if (s === 2 && exact.status === 'found') assert.equal(r.status, 'found');
        if (r.status === 'found') { assert.equal(exact.status, 'found'); found++; } else if (exact.status === 'found') retainedMiss++;
        cases++;
      }
    }
  }
  assert.equal(cases, 6912); t.diagnostic('union-raw-controls ' + JSON.stringify({ cases, found, retainedMiss, observedMismatch: 0 }));
});

test('all-tried nonparent arcs and independent side discovery repair the known five-node detour, not induced closure', () => {
  const f = fixture(deep.nodes, deep.edges), view = f.view(), forest = buildPathWitnessTrees(view, build);
  const shallow = checked(forest, view, f.context, { maxSubjectHops: 1, maxAnchorHops: 1 }); assert.notEqual(shallow.status, 'found');
  assert.ok(shallow.retained.vertices.includes('y') && shallow.retained.vertices.includes('x')); assert.ok(!shallow.retained.arcs.some(([a, b]) => a === 'y' && b === 'x'));
  const r = checked(forest, view, f.context, { maxSubjectHops: 1, maxAnchorHops: 2 }); assert.deepEqual(r.witness.paths, deep.expected.oneValidGlobalFamily);
  assert.ok(r.retained.arcs.some(([a, b]) => a === 'y' && b === 'x')); assert.ok(r.coverage.subjectDepthCut);
  assert.equal(r.work.extraction.anchorQueuePops, 5); assert.equal(r.work.extraction.subjectQueuePops, 3);
  assert.throws(() => r.retained.arcs[0].push('bad')); assert.throws(() => { r.work.search.stats.paths = 99; });
  JSON.stringify(r); forest.toJSON(); checked(forest, view, f.context, { maxArcs: 0 }); assert.deepEqual(checked(forest, view, f.context, { maxSubjectHops: 1, maxAnchorHops: 2 }), r);
});

test('every extraction budget boundary matches raw waves; exact-last is not artificial exhaustion and local search caps are separate', () => {
  const f = fixture(deep.nodes, deep.edges), view = f.view(), forest = buildPathWitnessTrees(view, build), full = checked(forest, view, f.context);
  for (const [key, total] of [['maxVertices', 5], ['maxArcs', 6], ['maxTreeRows', full.work.extraction.treeRowsInspected], ['maxBallTrials', full.work.extraction.ballTrials]]) {
    for (let limit = 0; limit <= total + 1; limit++) { const r = checked(forest, view, f.context, { [key]: limit });
      if (r.work.search) localReference(r, view, f.context, { ...budget, [key]: limit });
      else { assert.equal(key, 'maxVertices'); assert.equal(limit, 0); assert.equal(r.reason, 'retained-vertex-limit'); assert.equal(r.work.extraction.preparedStorageEdges, 6); }
    }
  }
  const total = full.work.extraction.ballTrials; assert.equal(checked(forest, view, f.context, { maxBallTrials: total }).coverage.ballTrialLimit, false);
  const rescued = checked(forest, view, f.context, { maxBallTrials: 0, maxTreeRows: 65536 }); assert.ok(rescued.coverage.ballTrialLimit); assert.ok(rescued.work.extraction.treeRowsInspected > 0); assert.equal(rescued.work.extraction.anchorQueuePops, 0);
  for (const [key, stat] of [['maxExpansions', 'expansions'], ['maxPaths', 'paths'], ['maxPackingSteps', 'packingSteps']]) for (let cap = 0; cap <= full.work.search.stats[stat] + 1; cap++) {
    const r = checked(forest, view, f.context, { [key]: cap }); localReference(r, view, f.context, { ...budget, [key]: cap });
  }
  const direct = fixture(['u', 'a', 'b', 'c'], [['a', 'u'], ['b', 'u'], ['c', 'u']], { maxHops: 1 }, ['a', 'b', 'c']), dv = direct.view(), empty = buildPathWitnessTrees(dv, { ...build, maxTreeNodes: 0 });
  for (const cap of [{ maxPaths: 2 }, { maxExpansions: 2 }]) {
    const partial = checked(empty, dv, direct.context, { maxSubjectHops: 1, maxAnchorHops: 0, ...cap });
    assert.equal(partial.status, 'found'); assert.equal(partial.work.search.stats.enumerationComplete, false); assert.ok(partial.coverage.forestIncomplete && partial.coverage.anchorDepthCut);
  }
  const tiny = fixture(['u', 'a'], [['a', 'u']], { maxHops: 1, maxWitnessBytes: 1 }, ['a'], 1), tv = tiny.view();
  assert.equal(checked(buildPathWitnessTrees(tv, build), tv, tiny.context, { maxSubjectHops: 1, maxAnchorHops: 1 }).reason, 'witness-byte-bound');
});

test('undirected pairs are atomic and missing vertex slots precede arc limits without orphan endpoint admission', () => {
  for (const projection of ['any-live-orientation', 'reciprocal-only']) {
    const edges = projection === 'reciprocal-only' ? [['a', 'u'], ['u', 'a']] : [['a', 'u']], f = fixture(['u', 'a'], edges, { maxHops: 1, direction: 'undirected', undirectedProjection: projection }, ['a'], 1);
    const view = f.view(), forest = buildPathWitnessTrees(view, build);
    const one = checked(forest, view, f.context, { maxSubjectHops: 1, maxAnchorHops: 1, maxArcs: 1 }); assert.equal(one.retained.arcs.length, 0); assert.ok(one.coverage.arcLimit);
    assert.equal(checked(forest, view, f.context, { maxSubjectHops: 1, maxAnchorHops: 1, maxArcs: 2 }).status, 'found');
  }
  const f = fixture(['u', 'a', 'x'], [['x', 'u']], {}, ['a'], 1), view = f.view(), forest = buildPathWitnessTrees(view, build);
  const both = checked(forest, view, f.context, { maxVertices: 2, maxArcs: 0, maxTreeRows: 0 }); assert.ok(both.coverage.vertexLimit); assert.equal(both.coverage.arcLimit, false); assert.deepEqual(both.retained.vertices, ['a', 'u']);
  const arc = checked(forest, view, f.context, { maxVertices: 3, maxArcs: 0, maxTreeRows: 0 }); assert.ok(arc.coverage.arcLimit); assert.ok(!arc.retained.vertices.includes('x'));
});

test('stale/nonlive old parents reject individually; retired broken-tree edges may legally transit to new current roots with current role gates', () => {
  const f = fixture(['u', 'a', 'b', 'x'], [['a', 'x'], ['x', 'u']], { minStanding: 1 }, ['a'], 1); f.options.standing = [['a', 0], ['b', 0], ['x', 1]];
  const old = f.view(), forest = buildPathWitnessTrees(old, build); f.graph.removeNode('a'); f.graph.addEdge('b', 'x'); f.options.snapshots[0].anchors = ['b']; f.options.removed = ['a'];
  let view = f.view(), r = checked(forest, view, f.context, { maxSubjectHops: 0, maxAnchorHops: 1 }); assert.deepEqual(r.witness.paths, [['u', 'x', 'b']]); assert.equal(r.work.extraction.staleTreeEdges, 1);
  f.options.standing = [['b', 0], ['x', 0]]; view = f.view(); r = checked(forest, view, f.context, { maxSubjectHops: 0, maxAnchorHops: 1 }); assert.notEqual(r.status, 'found'); assert.equal(r.coverage.anchorDepthCut, false);
  f.options.snapshots[0].anchors = ['x']; view = f.view(); assert.deepEqual(checked(forest, view, f.context).witness.paths, [['u', 'x']]);
  f.options.snapshots[0].anchors = ['x', 'b']; f.options.removed = ['x']; f.options.standing = [['x', 1], ['b', 0]]; view = f.view(); r = checked(forest, view, f.context); assert.deepEqual(r.witness.paths, [['u', 'x', 'b']]); assert.equal(r.work.extraction.anchorSeedsRetained, 1);
});

test('retained/global negatives, hop and physical-family conflicts never become canonical false or zero-hop self support', () => {
  const chain = fixture(['u', 'a', 'x', 'y'], [['a', 'x'], ['x', 'y'], ['y', 'u']], { maxHops: 2 }, ['a'], 1), cv = chain.view();
  const r = checked(buildPathWitnessTrees(cv, build), cv, chain.context); assert.equal(r.work.search.status, 'infeasible'); assert.equal(r.work.search.reason, 'path-shortage'); assert.equal(r.feasible, null);
  const f = fixture(['u', 'p', 'q', 'x', 'y', 'a', 'b'], [['a', 'x'], ['x', 'p'], ['p', 'u'], ['b', 'y'], ['y', 'x'], ['x', 'q'], ['q', 'u']], { maxHops: 4 }), view = f.view();
  const shared = checked(buildPathWitnessTrees(view, build), view, f.context, { maxSubjectHops: 4, maxAnchorHops: 4 }); assert.equal(shared.work.search.reason, 'family-conflict'); assert.equal(shared.feasible, null);
  const self = fixture(['u', 'a', 'b'], [['a', 'u'], ['b', 'a']], {}, ['u', 'a', 'b']), sv = self.view(); assert.notEqual(checked(buildPathWitnessTrees(sv, build), sv, self.context).status, 'found');
  const empty = fixture(['u'], [], {}, ['u'], 1), ev = empty.view(), no = checked(buildPathWitnessTrees(ev, build), ev, empty.context); assert.equal(no.status, 'miss'); assert.equal(no.feasible, null); assert.equal(no.work.extraction.anchorSeedsRetained, 0);
});

test('strict brands/exact config/context precede availability, unavailable work stays uncomputed and no graph-only recovery is hidden', () => {
  const f = fixture(['u', 'a'], [['a', 'u']], {}, ['a'], 1), view = f.view(), forest = buildPathWitnessTrees(view, build); let calls = 0;
  for (const [key, cap] of Object.entries({ ...PATH_UNION_LIMITS, ...PATH_ORACLE_LIMITS })) for (const v of [-0, -1, cap + 1, 0.5, Infinity]) assert.throws(() => proposePathWitnessFromUnion(forest, view, f.context, { ...budget, [key]: v }));
  for (const key of Object.keys(budget)) { const q = { ...budget }; delete q[key]; assert.throws(() => proposePathWitnessFromUnion(forest, view, f.context, q)); }
  for (const q of [{ ...budget, extra: 1 }, { ...budget, [Symbol('bad')]: 0 }, { ...budget, epoch: -0 }, { ...budget, maxSubjectHops: 4 }, Object.assign(Object.create({}), budget)]) assert.throws(() => proposePathWitnessFromUnion(forest, view, f.context, q));
  const access = { ...budget, epoch: 2 }; Object.defineProperty(access, 'maxVertices', { enumerable: true, get() { calls++; return 0; } }); assert.throws(() => proposePathWitnessFromUnion(forest, view, f.context, access)); assert.equal(calls, 0);
  for (const [ff, vv] of [[{ ...forest }, view], [forest, { ...view }], [null, view]]) assert.throws(() => proposePathWitnessFromUnion(ff, vv, f.context, budget));
  assert.throws(() => proposePathWitnessFromUnion(forest, view, { ...f.context, policy: { ...f.context.policy, maxHops: 2 } }, budget));
  assert.equal(checked(forest, view, f.context, { epoch: 2 }).reason, 'forest-epoch-mismatch');
  f.options.currentEpoch = 6; let current = f.view(); assert.equal(checked(forest, current, f.context).reason, 'epoch-outside-grace');
  f.options.currentEpoch = 3; f.options.snapshots = []; current = f.view(); assert.equal(checked(forest, current, f.context).reason, 'snapshot-unavailable');
  const missing = buildPathWitnessTrees(current, build); f.options.snapshots = [{ epoch: 3, difficulty: 1, anchors: ['a'] }]; current = f.view(); assert.equal(checked(missing, current, f.context).reason, 'snapshot-unavailable');
  assert.equal(checked(forest, current, { ...f.context, subject: 'ghost' }).reason, 'subject-unavailable');
  assert.equal(proposePathWitnessFromUnion(forest, current, f.context, Object.assign(Object.create(null), budget)).status, 'found');
  const graphOnly = buildPathWitnessTrees(current, { ...build, maxTreeNodes: 0 }); assert.equal(checked(graphOnly, current, f.context).status, 'found');
  assert.ok(Object.isFrozen(PATH_UNION_LIMITS));
});

test('r64/D64, more than64 supplied roots, UTF8/NUL IDs, relation reincarnation, namespace advice and Native current facts are read-only', () => {
  const anchors = Array.from({ length: 70 }, (_, i) => 'a' + i), f = fixture(['u', ...anchors], anchors.map(a => [a, 'u']), { maxHops: 1, maxDifficulty: 64 }, anchors, 64), view = f.view();
  const r = checked(buildPathWitnessTrees(view, build), view, f.context, { maxSubjectHops: 1, maxAnchorHops: 1 }, false); assert.equal(r.status, 'found'); assert.equal(r.work.extraction.anchorSeedsRetained, 70);
  const path = ['u', ...Array.from({ length: 63 }, (_, i) => 'é\0' + i), 'a'], long = fixture(path, path.slice(1).map((n, i) => [n, path[i]]), { maxHops: 64 }, ['a'], 1), lv = long.view(), lf = buildPathWitnessTrees(lv, build);
  assert.equal(checked(lf, lv, long.context, { maxSubjectHops: 64, maxAnchorHops: 0 }, false).witness.paths[0].length, 65);
  const small = fixture(['u', 'a'], [['a', 'u']], { maxHops: 1 }, ['a'], 1), old = small.view(), forest = buildPathWitnessTrees(old, build); small.graph.removeEdge('a', 'u'); small.graph.addEdge('a', 'u');
  assert.notEqual(small.view().view().id, old.view().id); assert.equal(checked(forest, small.view(), small.context, { maxSubjectHops: 0, maxAnchorHops: 0 }).status, 'found');
  const elsewhere = fixture(['u', 'a'], [['a', 'u']], { maxHops: 1 }, ['a'], 1, 'different-advisory-namespace'); assert.equal(checked(forest, elsewhere.view(), small.context, { maxSubjectHops: 1, maxAnchorHops: 1 }).status, 'found');
  const ambiguous = fixture(['u', 'a\u0000b', 'a', 'c', 'b\u0000c'], [['a\u0000b', 'c'], ['a', 'b\u0000c'], ['c', 'u'], ['b\u0000c', 'u']], { maxHops: 2 }, ['a\u0000b', 'a']);
  const av = ambiguous.view(), ar = checked(buildPathWitnessTrees(av, build), av, ambiguous.context); assert.equal(ar.status, 'found'); assert.equal(ar.retained.arcs.length, 4);
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); for (const id of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(id, 'u'));
  const native = fixture(['u', 'a', 'b'], []), nv = capturePathWitnessModelView(m, native.options), before = JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]);
  assert.equal(checked(buildPathWitnessTrees(nv, build), nv, native.context).status, 'found'); assert.equal(JSON.stringify([m.events(), m.subjects(), m.guarantees.toJSON(), m.audit()]), before);
});
