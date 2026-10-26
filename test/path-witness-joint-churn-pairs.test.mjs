import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DirectedGraph } from '../src/graph.mjs';
import { pathWitnessGraphView } from '../src/path-witness-view.mjs';
import { createPathWitnessPool } from '../src/path-witness-pool.mjs';
import { PathWitnessCache } from '../src/path-witness-cache.mjs';
import { PathWitnessSegmentCache } from '../src/path-witness-segments.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, repairPathWitnessTrees } from '../src/path-witness-trees.mjs';
import { pathWitnessContext, verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { queryPathWitnessComposite } from '../src/path-witness-composite.mjs';
import { invalidatePathWitnessCaches } from '../src/path-witness-invalidation.mjs';
import { runPathWitnessCompositeWorkload } from '../src/path-witness-composite-workload.mjs';
import { provenance, digestOf } from '../src/provenance.mjs';
const plan = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/m3-joint-churn-plan.json', import.meta.url))), cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)), hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expectedPlanDigest = 'ca3d88b6bc6a4043167c6bb0183e930ff38dbb4ea2d2b1f88605d28905731518';
function make(fixture, projection, arm, profile, mode) {
  const context = { ...plan.context, policy: { ...plan.context.policy, ...projection.policy } }, graph = new DirectedGraph(plan.graphNamePrefix + fixture.id); for (const id of fixture.nodes) graph.addNode(id);
  for (const [a, b] of fixture.basePairs) { if (!graph.edge(a, b)) graph.addEdge(a, b); if (!graph.edge(b, a)) graph.addEdge(b, a); }
  const options = removed => ({ policy: context.policy, currentEpoch: plan.currentEpoch, snapshots: [plan.snapshot], removed, standing: plan.standing }), base = graph.clone(), pool = createPathWitnessPool({ metric: plan.routing.poolMetric, maxPoolSize: plan.routing.poolSize, candidates: fixture.nodes.map(id => ({ id, score: plan.routing.poolScores })) }), pools = fixture.nodes.map(subject => ({ subject, pool })).sort((a, b) => cmp(a.subject, b.subject));
  const frames = [];
  for (const phase of plan.phases) {
    if (phase.id === 'cut') for (const [a, b] of [fixture.cutPair, [...fixture.cutPair].reverse()]) assert.equal(graph.removeEdge(a, b), true);
    if (phase.id === 'readd') for (const [a, b] of [fixture.cutPair, [...fixture.cutPair].reverse()]) graph.addEdge(a, b);
    if (phase.id === 'fork' || phase.id === 'restored') { const edits = phase.id === 'fork' ? fixture.fork : fixture.restore; for (const [a, b] of edits.remove) assert.equal(graph.removeEdge(a, b), true); for (const [a, b] of edits.add) graph.addEdge(a, b); }
    frames.push({ id: phase.id, view: pathWitnessGraphView(graph.clone(), options(phase.removed)), pools });
  }
  frames.push({ id: 'seed', view: pathWitnessGraphView(base, options([])), pools: [] }); assert.equal(frames[0].view.view().id, frames.at(-1).view.view().id); assert.notEqual(frames[0].view, frames.at(-1).view);
  const put = (frame, tick) => ({ op: 'put', frame, subject: plan.context.subject, input: { epoch: plan.snapshot.epoch, path: fixture.seedPath, tick } });
  const steps = [put('seed', 0)];
  for (const phase of plan.phases) {
    const op = phase.id === 'base' || arm === 'rebuild' ? 'build' : arm; steps.push({ op, frame: phase.id, query: op === 'repair' ? plan.repair : plan.build });
    if (phase.wholeOnlyNoticeBeforeFirst) steps.push({ op: 'invalidate', frame: phase.id, notices: { whole: { edges: [], anchors: plan.snapshot.anchors }, segments: { edges: [], vertices: [] } } });
    for (const kind of ['first', 'warm']) {
      const tick = phase[kind + 'Tick'], query = { tick, prefix: { ...plan.query.prefix, ...profile.prefix, ...phase.prefixOverrides, tick }, union: { ...plan.query.union, ...profile.union }, fallback: { ...plan.query.fallback } };
      steps.push({ op: 'query', id: `joint-pairs:${fixture.id}:${phase.id}:${kind}`, frame: phase.id, subject: context.subject, query, routing: { seed: plan.routing.seed, step: plan.routing.step, mode } });
      if (kind === 'first' && phase.explicitCurrentPutAfterFirst) steps.push(put(phase.id, tick));
    }
  }
  assert.equal(steps.length, plan.scope.stepsPerCell); return { input: { domain: context.domain, whole: plan.whole, segments: plan.segments, frames, steps }, context };
}
// Expected topology uses literal current physical rows, never production neighbors/projection/tree/search/packing helpers.
function raw(view, subject) {
  const d = view.toJSON(), nodes = [...d.live.nodes].sort(cmp), p = d.options.policy, snap = d.options.snapshots.find(s => s.epoch === plan.snapshot.epoch), removed = new Set(d.options.removed), anchors = new Set(snap.anchors.filter(a => !removed.has(a) && nodes.includes(a))), edges = d.live.edges, has = (a, b) => edges.some(([x, y]) => a === x && b === y), adjacent = (a, b) => p.direction === 'directed-from-anchor' ? has(b, a) : p.undirectedProjection === 'reciprocal-only' ? has(a, b) && has(b, a) : has(a, b) || has(b, a), paths = [];
  let neighborTrials = 0, packingTrials = 0;
  function dfs(path) {
    if (path.length > 1 && anchors.has(path.at(-1))) { assert.ok(paths.length < plan.independentReference.bounds.maxPaths, 'raw path censor'); paths.push(path); }
    if (path.length - 1 === p.maxHops) return;
    for (const n of nodes) { assert.ok(neighborTrials++ < plan.independentReference.bounds.maxNeighborTrials, 'raw traversal censor'); if (!path.includes(n) && adjacent(path.at(-1), n)) dfs([...path, n]); }
  }
  dfs([subject]);
  function pack(start, family, used) { if (family.length === snap.difficulty) return family; for (let i = start; i < paths.length; i++) { assert.ok(packingTrials++ < plan.independentReference.bounds.maxPackingTrials, 'raw packing censor'); const tail = paths[i].slice(1); if (tail.some(n => used.has(n))) continue; const found = pack(i + 1, [...family, paths[i]], new Set([...used, ...tail])); if (found) return found; } return null; }
  const family = pack(0, [], new Set());
  const parents = [...anchors].sort(cmp).map(anchor => {
    const rows = new Map([[anchor, { subject: anchor, distance: 0, parent: null }]]), queue = [anchor];
    for (let i = 0; i < queue.length; i++) { const at = queue[i], old = rows.get(at); if (old.distance === p.maxHops) continue; for (const n of nodes) if (!rows.has(n) && adjacent(n, at)) { rows.set(n, { subject: n, distance: old.distance + 1, parent: at }); queue.push(n); } }
    return { anchor, nodes: [...rows.values()].sort((a, b) => cmp(a.subject, b.subject)) };
  });
  return { feasible: family !== null, family, paths, parents, degree: nodes.filter(n => n !== subject && adjacent(subject, n)).length, eligibleAnchors: anchors.size, neighborTrials, packingTrials };
}
function packet(r, view, context, ref) {
  if (r.status !== 'found') { assert.equal(r.feasible, false); return; }
  for (const v of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(v(Buffer.from(r.wire), context, view).accepted, true);
  const used = new Set(); assert.equal(r.witness.paths.length, plan.snapshot.difficulty);
  for (const p of r.witness.paths) { assert.ok(ref.paths.some(path => JSON.stringify(path) === JSON.stringify(p)), 'packet path not physically valid'); for (const n of p.slice(1)) { assert.ok(!used.has(n), 'physical vertex duplicated'); used.add(n); } }
}
function descriptor(active) { if (!active) return null; const f = active.forest, m = f.meta; return { viewRoot: m.originRoot, policyId: m.policyId, epoch: m.epoch, reference: m.reference, status: m.status, reason: m.reason, complete: m.complete, eligibleRoots: f.anchors().length, retainedRoots: f.toJSON().parents.length, treeNodes: m.stats.treeNodes }; }
function summary(status, reason, report = null) { const known = report && status !== 'unavailable', actions = known ? {} : null; if (known) for (const r of report.roots) actions[r.action] = (actions[r.action] ?? 0) + 1; return { status, reason, reset: report?.reset ?? null, deltaComplete: report?.deltaComplete ?? null, retiredRoots: known ? report.retired.length : null, rootActions: actions }; }
const inventories = (whole, segments) => ({ whole: whole.stats(), segments: segments.stats() }), cacheStats = (before, after) => ({ whole: { before: before.whole, after: after.whole }, segments: { before: before.segments, after: after.segments } });
function compactStages(k) { return Object.fromEntries(['probe', 'prefix', 'union', 'finish'].map(name => { const s = k.stages[name], r = s.receipt; return [name, { called: s.called, status: r?.status ?? null, reason: r?.reason ?? null, coverage: name === 'prefix' && r ? { prefix: r.prefix.coverage, segments: r.segments.coverage } : name === 'union' ? r?.coverage ?? null : null }]; })); }
// Independent public caller retains full current receipts and constructs compact rows without workload helpers.
function replay(input, references) {
  const whole = new PathWitnessCache(input.whole), segments = new PathWitnessSegmentCache(input.segments), frames = new Map(input.frames.map(f => [f.id, f])), ledger = new Map(), rows = [], fullQueries = []; let active = null;
  for (const [index, request] of input.steps.entries()) {
    const frame = frames.get(request.frame), view = frame.view, before = inventories(whole, segments), activeBefore = descriptor(active), context = pathWitnessContext({ domain: input.domain, subject: plan.context.subject, policy: view.toJSON().options.policy }); let result, work, loadDelta = [];
    if (request.op === 'query') {
      const pools = frame.pools.map(({ subject, pool }) => ({ subject, pool, loads: request.routing.mode === 'uniform' ? null : pool.ranked.map(({ id }) => ({ id, load: ledger.get(id) ?? 0 })) })), k = queryPathWitnessComposite({ whole, segments, forest: active.forest }, view, context, request.query, { pools, routing: { seed: request.routing.seed, queryId: request.id, step: request.routing.step, mode: request.routing.mode } }); assert.deepEqual(k.provenance, provenance());
      const r = k.result, ref = references.get(request.frame); assert.equal(r.feasible, ref.feasible); packet(r, view, context, ref); const p = k.stages.prefix.receipt, selected = new Map(); for (const route of p?.prefix.routes ?? []) for (const id of route.selected) selected.set(id, (selected.get(id) ?? 0) + 1);
      loadDelta = [...selected].sort(([a], [b]) => cmp(a, b)).map(([id, selected]) => ({ id, before: ledger.get(id) ?? 0, selected, after: (ledger.get(id) ?? 0) + selected })); for (const r of loadDelta) ledger.set(r.id, r.after);
      const json = JSON.stringify(k), wire = r.wire === null ? null : Buffer.from(r.wire); result = { status: r.status, reason: r.reason, feasible: r.feasible, required: r.required, source: r.source, queryDigest: hash(k), wireDigest: wire ? createHash('sha256').update(wire).digest('hex') : null, wireBytes: wire?.length ?? null, verification: wire ? { primaryAccepted: true, ref2Accepted: true } : null, stages: compactStages(k) };
      work = { composite: k.work, preflight: k.preflight, probe: k.stages.probe.receipt.work, prefix: p ? { proposal: p.stats, prefix: p.prefix.stats, segments: { stats: p.segments.stats, work: p.segments.work } } : null, union: k.stages.union.receipt?.work ?? null, finish: k.stages.finish.called ? { cache: k.stages.finish.receipt.work, search: k.stages.finish.receipt.stats } : null, accounting: { loadRowsBuilt: pools.reduce((n, p) => n + (p.loads?.length ?? 0), 0), routeRowsFolded: p?.prefix.routes.length ?? 0, selectedPeersFolded: [...selected.values()].reduce((a, b) => a + b, 0), queryBytesHashed: Buffer.byteLength(json) } }; fullQueries.push(k);
    } else if (request.op === 'put') { const r = segments.put(view, { ...context, subject: request.subject }, request.input); assert.equal(r.status, 'stored'); result = { status: r.status, reason: r.reason, id: r.id, bytes: r.bytes }; work = { put: r.work }; }
    else if (request.op === 'invalidate') { const r = invalidatePathWitnessCaches(whole, segments, request.notices); assert.deepEqual(r.provenance, provenance()); result = { status: 'invalidated', whole: r.stages.whole.receipt, segments: r.stages.segments.receipt, receiptDigest: hash(r) }; work = { invalidation: r.work, accounting: { receiptBytesHashed: Buffer.byteLength(JSON.stringify(r)) } }; }
    else {
      if (request.op === 'build') { const forest = buildPathWitnessTrees(view, request.query); result = summary(forest.meta.status, forest.meta.reason); work = { build: forest.meta.stats }; active = { forest, view }; }
      else { const r = (request.op === 'refresh' ? refreshPathWitnessTrees : repairPathWitnessTrees)(active.forest, active.view, view, request.query); result = summary(r.report.status, r.report.reason, r.report); work = { forest: r.forest.meta.stats, maintenance: r.report.work }; active = { forest: r.forest, view }; }
      assert.equal(active.forest.meta.complete, true, 'planned complete construction censored'); const ref = references.get(request.frame); assert.deepEqual(active.forest.toJSON().parents, ref.parents); assert.deepEqual(active.forest.anchors(), ref.parents.map(r => r.anchor));
    }
    rows.push({ index, request, called: true, activeBefore, activeAfter: descriptor(active), cacheStats: cacheStats(before, inventories(whole, segments)), result, work, loadDelta });
  }
  const loadRows = [...ledger].sort(([a], [b]) => cmp(a, b)).map(([id, load]) => ({ id, load })), total = loadRows.reduce((n, r) => n + BigInt(r.load), 0n), squares = loadRows.reduce((n, r) => n + BigInt(r.load) ** 2n, 0n);
  return { rows, fullQueries, finalWhole: whole.stats(), finalSegments: segments.stats(), finalForest: descriptor(active), loads: { unit: 'run-cumulative-route-selections/v1', total: Number(total), distinct: loadRows.length, max: Math.max(0, ...loadRows.map(r => r.load)), herfindahl: total === 0n ? null : Number(squares) / Number(total * total), rows: loadRows } };
}
function common(r) { return r.rows.filter(r => r.request.op === 'query').map(row => ({ id: row.request.id, phase: row.request.frame, ...Object.fromEntries(['status', 'reason', 'feasible', 'required', 'source', 'wireDigest', 'wireBytes', 'verification', 'stages'].map(k => [k, row.result[k]])), cacheStats: row.cacheStats, work: { composite: row.work.composite, preflight: row.work.preflight, probe: row.work.probe, prefix: row.work.prefix, union: row.work.union, finish: row.work.finish, accounting: Object.fromEntries(['loadRowsBuilt', 'routeRowsFolded', 'selectedPeersFolded'].map(k => [k, row.work.accounting[k]])) }, loadDelta: row.loadDelta })); }
test('committed72-cell/864-query larger-churn plan matches raw/M2/native/parent/identity/paired maintenance contracts', t => {
  assert.equal(digestOf(plan), expectedPlanDigest); const refCache = new Map(), pairCache = new Map(), sources = { cache: 0, prefix: 0, union: 0, oracle: 0 }, digests = createHash('sha256'); let cells = 0, queryRows = 0, positives = 0, identityEvictions = 0, disabledIdentityRetentions = 0, warmHits = 0;
  for (const f of plan.fixtures) for (const projection of plan.projections) for (const arm of plan.maintenanceArms) for (const profile of plan.queryProfiles) for (const mode of plan.routing.modes) {
    const cell = `${f.id}/${projection.id}/${arm}/${profile.id}/${mode}`, actual = make(f, projection, arm, profile, mode), shadow = make(f, projection, arm, profile, mode), references = new Map();
    for (const phase of plan.phases) {
      const key = `${f.id}/${projection.id}/${phase.id}`; if (!refCache.has(key)) {
        const view = make(f, projection, arm, profile, mode).input.frames.find(r => r.id === phase.id).view, ref = raw(view, plan.context.subject), full = findPathWitness(view, actual.context, plan.query.fallback); assert.ok(['found', 'infeasible'].includes(full.status), 'planned M2 reference censored'); if (['degree-infeasible', 'anchor-infeasible'].includes(full.reason)) { assert.equal(full.status, 'infeasible'); assert.ok(full.reason === 'degree-infeasible' ? ref.degree < plan.snapshot.difficulty : ref.eligibleAnchors < plan.snapshot.difficulty); } else { assert.equal(full.stats.enumerationComplete, true, 'partial positive is not a complete reference enumeration'); if (!full.feasible) assert.equal(full.stats.packingComplete, true, 'negative packing incomplete'); } ref.oracle = { status: full.status, reason: full.reason, stats: full.stats }; assert.equal(full.feasible, ref.feasible); assert.equal(ref.feasible, f.expected[phase.id][projection.id]); packet(full, view, actual.context, ref); if (f.id === 'shared-bottleneck' && phase.id === 'base') assert.ok(!ref.feasible && ref.degree >= plan.snapshot.difficulty && ref.eligibleAnchors >= plan.snapshot.difficulty); refCache.set(key, ref);
      }
      references.set(phase.id, refCache.get(key));
    }
    const expected = replay(shadow.input, references), before = JSON.stringify(actual.input), report = runPathWitnessCompositeWorkload(actual.input); assert.equal(JSON.stringify(actual.input), before); assert.equal(report.rows.length, plan.scope.stepsPerCell); assert.deepEqual(report.rows, expected.rows, cell); assert.deepEqual(report.totals.loads, expected.loads); assert.deepEqual(report.finalWhole, expected.finalWhole); assert.deepEqual(report.finalSegments, expected.finalSegments); assert.deepEqual(report.finalForest, expected.finalForest); assert.deepEqual(report.provenance, provenance()); assert.ok(Object.isFrozen(report)); assert.equal(report.preflight.viewObjects, 7);
    const seedId = report.rows[0].result.id, cut = report.rows.filter(r => r.request.op === 'query' && r.request.frame === 'cut'), readd = report.rows.find(r => r.request.op === 'query' && r.request.frame === 'readd'), refreshPut = report.rows.find(r => r.request.op === 'put' && r.request.frame === 'readd'); assert.ok(cut.every(r => r.work.composite.segmentLookups === 0)); assert.ok(readd.cacheStats.segments.before.records.some(r => r.id === seedId)); assert.notEqual(refreshPut.result.id, seedId); assert.ok(refreshPut.cacheStats.segments.after.records.some(r => r.id === refreshPut.result.id));
    if (profile.id === 'composed') { assert.ok(readd.work.composite.segmentLookups > 0); assert.ok(!readd.cacheStats.segments.after.records.some(r => r.id === seedId)); assert.ok(readd.work.prefix.segments.work.evicted > 0); identityEvictions++; }
    else { assert.equal(readd.work.composite.segmentLookups, 0); assert.ok(readd.cacheStats.segments.after.records.some(r => r.id === seedId)); assert.ok(refreshPut.cacheStats.segments.after.records.some(r => r.id === seedId)); disabledIdentityRetentions++; }
    for (const row of report.rows) {
      if (row.request.op === 'invalidate') assert.deepEqual(row.cacheStats.segments.before, row.cacheStats.segments.after);
      if (row.request.op !== 'query') continue; queryRows++; sources[row.result.source]++; positives += Number(row.result.status === 'found'); assert.equal(row.result.feasible, references.get(row.request.frame).feasible); assert.equal(row.result.required, plan.snapshot.difficulty);
      if (row.request.id.endsWith(':warm') && row.result.status === 'found') { assert.equal(row.result.source, 'cache'); assert.deepEqual(row.loadDelta, []); assert.deepEqual(row.cacheStats.segments.before, row.cacheStats.segments.after); warmHits++; }
    }
    const paired = { queries: common(report), loads: report.totals.loads, whole: report.finalWhole, segments: report.finalSegments }, key = `${f.id}/${projection.id}/${profile.id}/${mode}`; if (pairCache.has(key)) assert.deepEqual(paired, pairCache.get(key), 'maintenance common scope '+cell); else pairCache.set(key, paired);
    digests.update(JSON.stringify({ cell, rows: report.rows, totals: report.totals, finalWhole: report.finalWhole, finalSegments: report.finalSegments })).update('\0'); cells++;
  }
  assert.equal(digestOf(plan), expectedPlanDigest); assert.equal(cells, plan.scope.cells); assert.equal(queryRows, plan.scope.totalQueryRows); assert.equal(refCache.size, 36); assert.equal(identityEvictions, 36); assert.equal(disabledIdentityRetentions, 36); assert.equal(positives, 360); assert.equal(warmHits, 180);
  t.diagnostic('joint-churn-pairs '+JSON.stringify({ cells, queryRows, referenceContexts: refCache.size, completeEnumerations: [...refCache.values()].filter(r => r.oracle.stats.enumerationComplete).length, necessaryCountNegatives: [...refCache.values()].filter(r => ['degree-infeasible', 'anchor-infeasible'].includes(r.oracle.reason)).length, positives, warmHits, identityEvictions, disabledIdentityRetentions, sources, observedMismatch: 0, fullCurrentDigest: digests.digest('hex'), planDigest: expectedPlanDigest, provenance: provenance() }));
});
