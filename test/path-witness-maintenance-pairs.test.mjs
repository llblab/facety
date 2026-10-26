import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DirectedGraph } from '../src/graph.mjs';
import { pathWitnessGraphView } from '../src/path-witness-view.mjs';
import { createPathWitnessPool } from '../src/path-witness-pool.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, repairPathWitnessTrees, proposePathWitnessFromPrefixes } from '../src/path-witness-trees.mjs';
import { runPathWitnessWorkload } from '../src/path-witness-workload.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { experimentConfig } from '../src/experiment-config.mjs';
const planBytes = readFileSync(new URL('../studies/2026-10-26-witness-indexer/m3-maintenance-pairs-plan.json', import.meta.url));
const plan = JSON.parse(planBytes), cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex'), wireHash = wire => createHash('sha256').update(wire).digest('hex');
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; } freeze(plan);
function fixture(cell) {
  const graph = new DirectedGraph('maintenance-pair:' + cell.id); cell.nodes.forEach(v => graph.addNode(v)); cell.edges.forEach(([a, b]) => graph.addEdge(a, b));
  const before = pathWitnessGraphView(graph, cell.before);
  for (const edit of cell.edits) { assert.ok(['removeEdge', 'addEdge'].includes(edit.op)); graph[edit.op](edit.from, edit.to); }
  const after = pathWitnessGraphView(graph, cell.afterOptions);
  const frames = [before, after].map((view, i) => {
    const nodes = view.nodeIds(), pool = createPathWitnessPool({ metric: plan.pools.metric, maxPoolSize: plan.pools.maxPoolSize, candidates: nodes.map(id => ({ id, score: 0 })) });
    return { id: plan.frames[i], view, pools: nodes.map(subject => ({ subject, pool })) };
  });
  const queries = plan.routing.modes.map(mode => ({ op: 'query', id: cell.id + ':' + mode, frame: 'after', subject: plan.querySubject,
    query: { epoch: cell.round.epoch, ...plan.query, ...cell.round.queryOverrides }, routing: { seed: plan.routing.seed, step: plan.routing.step, mode } }));
  assert.ok(queries.length <= plan.limits.queriesPerRound); assert.ok(1 <= plan.limits.rounds);
  return { frames, queries, traces: plan.arms.map(arm => ({ domain: plan.domain, frames, steps: [{ op: 'build', frame: 'before', query: cell.initial },
    { op: arm === 'rebuild' ? 'build' : arm, frame: 'after', query: { epoch: cell.round.epoch, ...cell.round.budgets[arm] } }, ...queries] })) };
}
// Separate raw-row projection/FIFO, not production neighbors, graph preparation, tree or repair helpers.
function rawParents(view, epoch) {
  const d = view.toJSON(), p = d.options.policy, snapshot = d.options.snapshots.find(s => s.epoch === epoch); if (!snapshot) return null;
  const nodes = [...d.live.nodes].sort(cmp), scores = new Map(d.options.standing), removed = new Set(d.options.removed), has = (a, b) => d.live.edges.some(([x, y]) => a === x && b === y);
  return snapshot.anchors.filter(a => nodes.includes(a) && !removed.has(a)).sort(cmp).map(anchor => {
    const rows = new Map([[anchor, { subject: anchor, distance: 0, parent: null }]]), queue = [anchor];
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head], row = rows.get(node), score = scores.get(node);
      if (row.distance === p.maxHops || (node !== anchor && p.minStanding !== null && (score == null || score < p.minStanding))) continue;
      for (const child of nodes) if (!rows.has(child) && (p.direction === 'directed-from-anchor' ? has(node, child) : p.undirectedProjection === 'reciprocal-only' ? has(node, child) && has(child, node) : has(node, child) || has(child, node))) {
        rows.set(child, { subject: child, distance: row.distance + 1, parent: node }); queue.push(child);
      }
    }
    return { anchor, nodes: [...rows.values()].sort((a, b) => cmp(a.subject, b.subject)) };
  });
}
function published(data, reference, completeRequired, atomic) {
  if (data.meta.status === 'unavailable') { assert.equal(completeRequired, false); return; }
  assert.ok(reference); if (completeRequired) assert.equal(data.meta.complete, true);
  assert.deepEqual(data.anchors, reference.map(t => t.anchor), 'current eligible roots'); assert.equal(new Set(data.parents.map(t => t.anchor)).size, data.parents.length);
  assert.equal(data.meta.stats.treeNodes, data.parents.reduce((n, t) => n + t.nodes.length, 0));
  for (const tree of data.parents) {
    const full = reference.find(t => t.anchor === tree.anchor); assert.ok(full, 'published unknown root');
    assert.equal(new Set(tree.nodes.map(r => r.subject)).size, tree.nodes.length); assert.ok(tree.nodes.some(r => r.subject === tree.anchor && r.distance === 0 && r.parent === null), 'missing root record');
    for (const row of tree.nodes) {
      assert.deepEqual(row, full.nodes.find(r => r.subject === row.subject), 'noncanonical/current parent row');
      if (row.parent === null) assert.equal(row.subject, tree.anchor);
      else assert.ok(tree.nodes.some(r => r.subject === row.parent && r.distance + 1 === row.distance), 'parent closure');
    }
    if (atomic) assert.deepEqual(tree, full, 'E2 retained root must be whole');
  }
  if (data.meta.complete) assert.deepEqual(data.parents, reference, 'incomplete forest labeled complete');
}
function describe(forest) {
  if (!forest) return null; const m = forest.meta;
  return { viewRoot: m.originRoot, policyId: m.policyId, epoch: m.epoch, reference: m.reference, status: m.status, reason: m.reason, complete: m.complete, eligibleRoots: forest.anchors().length, retainedRoots: forest.toJSON().parents.length, treeNodes: m.stats.treeNodes };
}
function constructionResult(status, reason, report = null) {
  const known = report && status !== 'unavailable';
  return { status, reason, reset: report?.reset ?? null, deltaComplete: report?.deltaComplete ?? null, retiredRoots: known ? report.retired.length : null,
    rootActions: known ? Object.fromEntries([...new Set(report.roots.map(r => r.action))].map(action => [action, report.roots.filter(r => r.action === action).length])) : null };
}
// Own origin and occurrence ledger replay public APIs; shadow work never modifies an arm or its counters.
function shadow(input, onConstruction) {
  const frames = new Map(input.frames.map(f => [f.id, f])), loads = new Map(), rows = [], queries = [], constructions = []; let forest = null, origin = null;
  for (const [index, request] of input.steps.entries()) {
    const f = frames.get(request.frame), activeBefore = describe(forest), called = request.op === 'build' || forest !== null; let result, work = null, loadDelta = [];
    if (request.op === 'query') {
      const loadBefore = [...loads].sort(([a], [b]) => cmp(a, b)); let raw = null;
      if (!called) result = { status: 'unavailable', reason: 'forest-missing', feasible: null, required: null, coverage: null, proposalDigest: null, wireDigest: null, wireBytes: null, verification: null };
      else {
        let loadRowsBuilt = 0;
        raw = proposePathWitnessFromPrefixes(forest, f.view, { domain: input.domain, subject: request.subject, policy: f.view.toJSON().options.policy }, request.query,
          { pools: [...f.pools].sort((a, b) => cmp(a.subject, b.subject)).map(r => ({ ...r, loads: request.routing.mode === 'uniform' ? null : r.pool.ranked.map(({ id }) => { loadRowsBuilt++; return { id, load: loads.get(id) ?? 0 }; }) })), routing: { ...request.routing, queryId: request.id } });
        const offers = raw.prefix.routes.flatMap(r => r.selected), unique = [...new Set(offers)].sort(cmp);
        loadDelta = unique.map(id => { const before = loads.get(id) ?? 0, selected = offers.filter(x => x === id).length; return { id, before, selected, after: before + selected }; });
        result = { status: raw.status, reason: raw.reason, feasible: raw.feasible, required: raw.required, coverage: raw.prefix.coverage, proposalDigest: hash(raw), wireDigest: raw.wire === null ? null : wireHash(raw.wire), wireBytes: raw.wire === null ? null : Buffer.byteLength(raw.wire), verification: raw.status === 'found' ? { primaryAccepted: true, ref2Accepted: true } : null };
        work = { proposal: raw.stats, prefix: raw.prefix.stats, accounting: { loadRowsBuilt, routeRowsFolded: raw.prefix.routes.length, selectedPeersFolded: offers.length, proposalBytesHashed: Buffer.byteLength(JSON.stringify(raw)) } };
        loadDelta.forEach(r => loads.set(r.id, r.after));
      }
      queries.push({ request, raw, loadBefore, result });
    } else if (!called) result = constructionResult('unavailable', 'forest-missing');
    else {
      let report = null;
      if (request.op === 'build') { forest = buildPathWitnessTrees(f.view, request.query); result = constructionResult(forest.meta.status, forest.meta.reason); work = { build: forest.meta.stats }; }
      else { const response = (request.op === 'refresh' ? refreshPathWitnessTrees : repairPathWitnessTrees)(forest, origin, f.view, request.query); forest = response.forest; report = response.report; result = constructionResult(report.status, report.reason, report); work = { forest: forest?.meta.stats ?? null, maintenance: report.work }; }
      const data = forest?.toJSON() ?? null; onConstruction(data, f.view, request, report); constructions.push({ request, data, report });
      if (forest?.meta.status === 'unavailable') forest = null; origin = forest ? f.view : null;
    }
    rows.push({ index, request, called, activeBefore, activeAfter: describe(forest), result, work, loadDelta });
  }
  return { rows, queries, constructions, loads: [...loads].sort(([a], [b]) => cmp(a, b)).map(([id, load]) => ({ id, load })), finalForest: describe(forest) };
}
function verifyPositive(source, view, request) {
  if (source.status !== 'found') return;
  const context = { domain: plan.domain, subject: request.subject, policy: view.toJSON().options.policy };
  for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(source.wire), context, view).accepted, true);
}
function classify(source, oracle) {
  assert.ok(['found', 'miss', 'censored', 'unavailable'].includes(source.status)); assert.equal(source.feasible, source.status === 'found' ? true : null);
  assert.ok(['found', 'infeasible', 'censored', 'unavailable'].includes(oracle.status)); assert.equal(oracle.feasible, oracle.status === 'found' ? true : oracle.status === 'infeasible' ? false : null);
  if (source.status === 'found') { assert.notEqual(oracle.status, 'infeasible', 'positive versus known negative'); return 'certified-positive'; }
  return ({ found: 'confirmed-advisory-miss', infeasible: 'reference-negative/advisory-unknown', censored: 'reference-unknown', unavailable: 'reference-unavailable' })[oracle.status];
}
const missFraction = rows => { const known = rows.filter(r => r.reference.status === 'found'); return known.length ? known.filter(r => r.source.status !== 'found').length / known.length : null; };
const take = (v, keys) => Object.fromEntries(keys.map(k => [k, v[k]]));
function semantics(row) {
  return { called: row.called, active: row.activeAfter && take(row.activeAfter, ['viewRoot', 'policyId', 'epoch', 'complete', 'eligibleRoots', 'retainedRoots', 'treeNodes']),
    result: take(row.result, ['status', 'reason', 'feasible', 'required', 'coverage', 'wireDigest', 'wireBytes', 'verification']), work: row.work && { proposal: row.work.proposal, prefix: row.work.prefix, accounting: take(row.work.accounting, ['loadRowsBuilt', 'routeRowsFolded', 'selectedPeersFolded']) }, loadDelta: row.loadDelta };
}
function frontier(raw) {
  if (!raw || raw.prefix.coverage === null) return null;
  return { prefixes: raw.prefix.prefixes, routes: raw.prefix.routes, stats: take(raw.prefix.stats, ['queued', 'expanded', 'maxPending', 'neighborTrials', 'scoreReads', 'routeCalls', 'generators', 'draws', 'routedPeers', 'missingPools', 'omittedNeighbors']), coverage: take(raw.prefix.coverage, ['prefixLimit', 'expansionLimit', 'branchLimit', 'prefixDepthLimit', 'poolUnavailable']) };
}
let cached = null;
function matrix() {
  if (cached) return cached;
  const result = { cells: [], counts: { cells: 0, arms: 0, requestedF1Rows: 0, requestedQueryRows: 0, constructionChecks: 0, unavailableParentClaims: 0, parentComputed: 0, parentReused: 0, oracleLogicalRequests: 0, oracleComputed: 0, oracleReused: 0, frontierCompared: 0, frontierNotComparable: {}, classifications: {} } }, parents = new Map(), oracles = new Map();
  for (const cell of plan.cases) {
    const f = fixture(cell), before = hash(f.frames), references = f.queries.map(request => {
      result.counts.oracleLogicalRequests++; const view = f.frames[1].view, context = { domain: plan.domain, subject: request.subject, policy: view.toJSON().options.policy }, query = { epoch: request.query.epoch, ...plan.oracle }, key = hash([view.view().id, context, query]);
      if (oracles.has(key)) result.counts.oracleReused++;
      else { const r = findPathWitness(view, context, query); verifyPositive(r, view, request); oracles.set(key, r); result.counts.oracleComputed++; }
      return oracles.get(key);
    }), arms = [];
    for (const [armIndex, input] of f.traces.entries()) {
      const arm = plan.arms[armIndex], receipt = runPathWitnessWorkload(input), reference = shadow(input, (data, view, request, report) => {
        result.counts.constructionChecks++;
        if (!data || data.meta.status === 'unavailable') { result.counts.unavailableParentClaims++; assert.equal(cell.expectation, 'bounded-diagnostic'); return; }
        const key = hash([view.view().id, request.query.epoch]);
        if (parents.has(key)) result.counts.parentReused++;
        else { const raw = rawParents(view, request.query.epoch), full = buildPathWitnessTrees(view, { epoch: request.query.epoch, ...plan.fullControl }); assert.equal(full.meta.complete, true); assert.deepEqual(full.toJSON().parents, raw); parents.set(key, raw); result.counts.parentComputed++; }
        published(data, parents.get(key), cell.expectation === 'complete-equivalent', request.op === 'repair');
        if (report) for (const root of report.roots.filter(r => r.action === 'aborted' || r.action === 'omitted')) assert.ok(!data.parents.some(t => t.anchor === root.anchor));
      });
      assert.deepEqual(receipt.rows, reference.rows, cell.id + '/' + arm + ' shadow receipt'); assert.deepEqual(receipt.totals.loads.rows, reference.loads); assert.deepEqual(receipt.finalForest, reference.finalForest);
      const total = reference.loads.reduce((n, r) => n + BigInt(r.load), 0n), squares = reference.loads.reduce((n, r) => n + BigInt(r.load) ** 2n, 0n);
      assert.deepEqual(receipt.totals.loads, { unit: 'run-cumulative-route-selections/v1', total: Number(total), distinct: reference.loads.length, max: Math.max(0, ...reference.loads.map(r => r.load)), herfindahl: total === 0n ? null : Number(squares) / Number(total ** 2n), rows: reference.loads });
      for (const op of ['build', 'refresh', 'repair', 'query']) { const rows = reference.rows.filter(r => r.request.op === op); assert.deepEqual(receipt.totals.operations[op], { requested: rows.length, called: rows.filter(r => r.called).length, skipped: rows.filter(r => !r.called).length }); }
      for (const status of ['found', 'miss', 'censored', 'unavailable']) assert.equal(receipt.totals.queries[status], reference.queries.filter(q => q.result.status === status).length);
      const classes = reference.queries.map((q, i) => { if (q.raw) verifyPositive(q.raw, f.frames[1].view, q.request); const c = classify(q.result, references[i]); result.counts.classifications[c] = (result.counts.classifications[c] ?? 0) + 1; return { source: q.result, reference: references[i], classification: c }; });
      result.counts.arms++; result.counts.requestedF1Rows += receipt.rows.length; result.counts.requestedQueryRows += classes.length; arms.push({ arm, receipt, reference, classes });
    }
    for (let a = 0; a < arms.length; a++) for (let b = a + 1; b < arms.length; b++) {
      if (cell.expectation === 'complete-equivalent') { assert.deepEqual(arms[a].receipt.rows.filter(r => r.request.op === 'query').map(semantics), arms[b].receipt.rows.filter(r => r.request.op === 'query').map(semantics), cell.id + ' complete semantics'); assert.deepEqual(arms[a].receipt.totals.loads, arms[b].receipt.totals.loads); }
      for (let i = 0; i < f.queries.length; i++) {
        const x = arms[a].reference.queries[i], y = arms[b].reference.queries[i], reason = !frontier(x.raw) || !frontier(y.raw) ? 'frontier-not-executed' : hash(x.loadBefore) !== hash(y.loadBefore) ? 'different-prior-load' : null;
        if (reason) result.counts.frontierNotComparable[reason] = (result.counts.frontierNotComparable[reason] ?? 0) + 1;
        else { assert.deepEqual(x.request, y.request); assert.deepEqual(frontier(x.raw), frontier(y.raw), cell.id + ' frontier'); result.counts.frontierCompared++; }
      }
    }
    assert.equal(hash(f.frames), before); result.cells.push({ cell, fixture: f, references, arms }); result.counts.cells++;
  }
  assert.equal(result.counts.cells, plan.expectedCensus.cells); assert.equal(result.counts.arms, 48); assert.equal(result.counts.requestedF1Rows, plan.expectedCensus.requestedF1Rows); assert.equal(result.counts.requestedQueryRows, plan.expectedCensus.requestedQueryRows); assert.equal(result.counts.constructionChecks, 96); assert.equal(result.counts.parentComputed + result.counts.parentReused + result.counts.unavailableParentClaims, 96);
  cached = result; return result;
}

test('sealed unit plan is immutable input design with16 cells/three arms, no benchmark engine or output sampler', () => {
  const blob = createHash('sha1').update('blob ' + planBytes.length + '\0').update(planBytes).digest('hex'); assert.equal(blob, '19909f265334b0c4f40e3986ad88151c97f357d1');
  assert.equal(plan.cases.length, 16); assert.equal(plan.cases.filter(c => c.expectation === 'complete-equivalent').length, 12); assert.equal(plan.cases.filter(c => c.expectation === 'bounded-diagnostic').length, 4); assert.equal(plan.timersHeapAndBenchmarkCapture, false); assert.equal(plan.scientificV2OrMasterGatePass, false);
  assert.throws(() => experimentConfig({ engine: 'bounded-prefix-route-load/v1' }), /unsupported experiment engine/); assert.throws(() => plan.cases.pop());
});

test('16 sealed cells/48 fresh arms reconcile192 F1 rows/96 queries with raw/full parents, shadow, M2 and both verifiers', t => {
  const r = matrix(); t.diagnostic('maintenance-paired-controls ' + JSON.stringify({ ...r.counts, observedMismatch: 0 }));
});

test('known family misses, bounded positives and unavailable arms stay in their declared denominators', () => {
  const r = matrix(), known = r.cells.find(c => c.cell.id === 'known-tree-family-miss'); assert.ok(known.arms.every(a => a.classes.every(c => c.classification === 'confirmed-advisory-miss'))); assert.equal(missFraction(known.arms[0].classes), 1);
  const zero = r.cells.find(c => c.cell.id === 'zero-node-partial-positive'); assert.ok(zero.arms.every(a => a.receipt.rows[1].activeAfter.complete === false && a.classes.every(c => c.classification === 'certified-positive')));
  const grace = r.cells.find(c => c.cell.id === 'builder-grace-asymmetry'); assert.ok(grace.arms[0].reference.queries.every(q => q.raw?.status === 'unavailable')); assert.ok(grace.arms.slice(1).every(a => a.reference.queries.every(q => q.raw === null))); assert.equal(missFraction(grace.arms[0].classes), null);
  for (const status of ['censored', 'unavailable']) { assert.equal(classify({ status: 'miss', feasible: null }, { status, feasible: null }), status === 'censored' ? 'reference-unknown' : 'reference-unavailable'); assert.throws(() => classify({ status: 'miss', feasible: false }, { status, feasible: null })); assert.throws(() => classify({ status: 'miss', feasible: null }, { status, feasible: false })); }
  assert.equal(classify({ status: 'found', feasible: true }, { status: 'censored', feasible: null }), 'certified-positive'); assert.throws(() => classify({ status: 'found', feasible: true }, { status: 'infeasible', feasible: false }), /known negative/);
});

test('projection guards exclude only construction/hash and phase2 frontier fields, not semantic/counter/key drift', () => {
  const cell = matrix().cells[0], a = cell.arms[0].receipt.rows[2], b = structuredClone(a); b.result.proposalDigest = 'different construction'; b.work.accounting.proposalBytesHashed++;
  b.activeAfter.reference = 'different-construction/v1'; assert.deepEqual(semantics(a), semantics(b)); b.work.proposal.edgeChecks++; assert.throws(() => assert.deepEqual(semantics(a), semantics(b)));
  const changedView = structuredClone(a); changedView.activeAfter.viewRoot = 'wrong-current'; assert.throws(() => assert.deepEqual(semantics(a), semantics(changedView)));
  const raw = cell.arms[0].reference.queries[0].raw, phase2 = structuredClone(raw); phase2.prefix.stats.endpointChecks++; phase2.prefix.stats.duplicatePaths++; phase2.prefix.coverage.treeLookupLimit = !phase2.prefix.coverage.treeLookupLimit; assert.deepEqual(frontier(raw), frontier(phase2));
  phase2.prefix.stats.queued++; assert.throws(() => assert.deepEqual(frontier(raw), frontier(phase2))); const wrongKey = structuredClone(raw); wrongKey.prefix.routes[0].queryId = 'wrong-key'; assert.throws(() => assert.deepEqual(frontier(raw), frontier(wrongKey)));
});

test('parent publication guards reject stale rows, partial E2 roots and false completeness rather than trusting counts', () => {
  const c = matrix().cells[0], data = c.arms[0].reference.constructions[1].data, full = rawParents(c.fixture.frames[1].view, c.cell.round.epoch), bad = structuredClone(data);
  bad.parents[0].nodes.find(r => r.parent !== null).distance++; assert.throws(() => published(bad, full, false, false), /parent row/);
  const partial = structuredClone(data); partial.meta.complete = false; partial.parents[0].nodes = partial.parents[0].nodes.filter(r => r.parent === null); partial.meta.stats.treeNodes = partial.parents.reduce((n, t) => n + t.nodes.length, 0); published(partial, full, false, false); assert.throws(() => published(partial, full, false, true), /whole/);
  partial.meta.complete = true; assert.throws(() => published(partial, full, false, false), /incomplete forest/);
  const duplicate = structuredClone(data); duplicate.meta.complete = false; duplicate.parents[0].nodes.push({ ...duplicate.parents[0].nodes[0] }); duplicate.meta.stats.treeNodes++; assert.throws(() => published(duplicate, full, false, false));
  const missingRoot = structuredClone(data); missingRoot.meta.complete = false; missingRoot.parents[0].nodes = []; missingRoot.meta.stats.treeNodes = missingRoot.parents.reduce((n, t) => n + t.nodes.length, 0); assert.throws(() => published(missingRoot, full, false, false), /missing root/);
});

test('valid future query preserves prefixes, uniform unrelated requests preserve source keys, lagged best-of-two changes causally', () => {
  const { fixture: f } = matrix().cells.find(c => c.cell.id === 'shorter-insertion'), input = f.traces[0], base = runPathWitnessWorkload(input), future = structuredClone(input.steps[2]); future.id += ':future';
  assert.deepEqual(runPathWitnessWorkload({ ...input, steps: [...input.steps, future] }).rows.slice(0, base.rows.length), base.rows);
  const extra = structuredClone(input.steps[2]); extra.id += ':unrelated'; const shifted = runPathWitnessWorkload({ ...input, steps: [...input.steps.slice(0, 2), extra, ...input.steps.slice(2)] }); assert.equal(shifted.rows[3].result.proposalDigest, base.rows[2].result.proposalDigest); assert.notDeepEqual(shifted.rows[3].loadDelta, base.rows[2].loadDelta);
  const choice = structuredClone(input.steps[3]); choice.query.maxBranches = 1; const prior = structuredClone(choice); prior.id += ':prior';
  const alone = runPathWitnessWorkload({ ...input, steps: [...input.steps.slice(0, 2), choice] }), loaded = runPathWitnessWorkload({ ...input, steps: [...input.steps.slice(0, 2), prior, choice] }); assert.equal(alone.rows[2].loadDelta[0].id, 'a'); assert.equal(loaded.rows[3].loadDelta[0].id, 'x');
});

test('counter namespaces retain all arm/source/reference units and separate validation overhead without a cost scalar', () => {
  const r = matrix(); for (const c of r.cells) for (const a of c.arms) {
    assert.equal(a.receipt.rows.length, 4); assert.ok(a.receipt.rows[0].work.build); const update = a.receipt.rows[1].work; assert.ok(a.arm === 'rebuild' ? update.build : update.maintenance);
    if (a.arm === 'refresh') assert.ok(Object.hasOwn(update.maintenance, 'freshExpansions')); if (a.arm === 'repair') assert.ok(Object.hasOwn(update.maintenance, 'predecessorTrials'));
    assert.equal(Object.hasOwn(a.receipt.totals, 'totalWork'), false); assert.equal(Object.hasOwn(a.receipt.totals, 'speedup'), false); assert.ok(Object.isFrozen(a.receipt.rows));
  }
  assert.equal(r.counts.oracleLogicalRequests, 32); assert.equal(r.counts.oracleComputed + r.counts.oracleReused, 32); assert.ok(r.counts.oracleReused > 0); assert.ok(r.counts.parentReused > 0); assert.ok(r.counts.frontierNotComparable['frontier-not-executed'] > 0);
});
