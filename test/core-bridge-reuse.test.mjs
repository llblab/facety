import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { digestOf } from '../src/provenance.mjs';
import { DirectedGraph } from '../src/graph.mjs';
import { pathWitnessGraphView } from '../src/path-witness-view.mjs';
import { encodePathWitness, verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
import { verifyInternallyDisjointPaths } from '../src/proofs.mjs';
const cells = [2, 3].flatMap(D => [1, 4, 12].map(M => ({ D, M })));
const policy = maxHops => ({ direction: 'directed-from-anchor', undirectedProjection: 'any-live-orientation',
  maxHops, maxDifficulty: 64, maxSlack: 0, graceEpochs: 0, maxIdBytes: 256, maxWitnessBytes: 65536, minStanding: null });
const context = (subject, maxHops = 2) => ({ domain: 'facety-core-t1-software', subject, policy: policy(maxHops) });
const verifiers = [verifyPathWitness, verifyPathWitnessRef2];
const tuple = (a, b) => JSON.stringify([a, b]);
function build({ D, M }, common = false) {
  const anchors = Array.from({ length: 2 * D }, (_, i) => 'a' + i), bridges = Array.from({ length: D }, (_, i) => 'b' + i);
  const inner = Array.from({ length: M }, (_, i) => 'u' + i), g = new DirectedGraph(`t1-D${D}-M${M}${common ? '-center' : ''}`);
  for (const id of [...anchors, ...bridges, ...inner, ...(common ? ['z'] : [])]) g.addNode(id);
  for (const [i, b] of bridges.entries()) {
    g.addEdge(anchors[i], b);
    for (const u of inner) g.addEdge(b, u);
    for (const other of bridges) if (other !== b) g.addEdge(b, other);
  }
  if (common) for (const a of anchors) g.addEdge('z', a);
  assert.equal(g.size, 3 * D + M + Number(common));
  assert.equal(g.edgeCount, D + D * M + D * (D - 1) + (common ? 2 * D : 0));
  for (const b of bridges) assert.equal([...g.outEdges(b)].length, M + D - 1);
  return { D, M, g, anchors, bridges, inner, issuers: [...inner, ...bridges] };
}
function capture(c, common = false) {
  return pathWitnessGraphView(c.g, { policy: policy(common ? 3 : 2), currentEpoch: 3,
    snapshots: [{ epoch: 3, difficulty: c.D, anchors: [...c.anchors, ...(common ? ['z'] : [])] }], removed: [], standing: [] });
}
function paths(c, subject, common = false) {
  return c.bridges.map((b, i) => [...(b === subject ? [subject, c.anchors[i]] : [subject, b, c.anchors[i]]), ...(common ? ['z'] : [])]);
}
function rawFamily(c, subject, family, common = false) {
  const arcs = new Set([...c.g.edges()].map(e => tuple(e.from, e.to))), occupied = new Set();
  if (family.length !== c.D) return false;
  for (const p of family) {
    if (p[0] !== subject || p.length < 2 || p.length - 1 > (common ? 3 : 2) || new Set(p).size !== p.length) return false;
    if (common ? p.at(-1) !== 'z' : !c.anchors.includes(p.at(-1))) return false;
    for (let i = 1; i < p.length; i++) if (!arcs.has(tuple(p[i], p[i - 1]))) return false;
    for (const id of p.slice(1, common ? -1 : undefined)) {
      if (occupied.has(id)) return false;
      occupied.add(id);
    }
  }
  return true;
}
function wire(c, subject, common = false) {
  return encodePathWitness({ subject, epoch: 3, paths: paths(c, subject, common) }, context(subject, common ? 3 : 2));
}
function semantic(result) {
  return Object.fromEntries(['accepted', 'reason', 'required', 'degreeBound', 'anchorBound', 'selected'].map(key => [key, result[key]]));
}
function pair(bytes, ctx, view, accepted) {
  const results = verifiers.map(verify => verify(bytes, ctx, view));
  assert.deepEqual(semantic(results[0]), semantic(results[1]));
  assert.equal(results[0].accepted, accepted);
  assert.equal(results[0].required, view.snapshot(3).difficulty);
  return semantic(results[0]);
}
function crossing(c, cut = false, common = false) {
  const core = new Set([...c.anchors, ...(common ? ['z'] : [])]);
  const actual = [...c.g.edges()].filter(e => core.has(e.from) && !core.has(e.to)).map(e => tuple(e.from, e.to)).sort();
  const expected = c.bridges.flatMap((b, i) => cut && i === 0 ? [] : [tuple(c.anchors[i], b)]).sort();
  assert.deepEqual(actual, expected);
  assert.equal(actual.length, c.D - Number(cut));
  return actual;
}
function forwardProof(c, subject) {
  return { version: 1, kind: 'internally-vertex-disjoint-paths', graph: c.g.name, revision: c.g.revision,
    source: 'z', target: subject, paths: paths(c, subject, true).map(p => {
      const nodes = [...p].reverse();
      return { version: 1, graph: c.g.name, revision: c.g.revision, nodes, edgeIds: nodes.slice(1).map((v, i) => c.g.edge(nodes[i], v).id) };
    }) };
}

test('D73 finite T1: actual dual-verified per-issuer support is reusable and public-identical roles cannot change it', t => {
  const rows = []; let families = 0;
  for (const dimensions of cells) {
    const c = build(dimensions), view = capture(c), beforeGraph = c.g.toJSON(), beforeView = view.toJSON(), repeated = new Map();
    const outsideAssumedFake = new Set(c.issuers), outsideAllGenuine = new Set(c.g.nodeIds());
    assert.equal(outsideAssumedFake.size, c.M + c.D);
    assert.equal(outsideAllGenuine.size, 3 * c.D + c.M);
    crossing(c);
    for (const subject of c.issuers) {
      assert.equal([...c.g.inEdges(subject)].length, c.D, 'I0 raw support only, not d_eff');
      assert.equal(view.degree(subject, 'directed-from-anchor', 'any-live-orientation'), c.D);
      const bytes = wire(c, subject), decoded = JSON.parse(bytes.toString());
      assert.ok(rawFamily(c, subject, decoded.witness.paths));
      const result = pair(bytes, context(subject), view, true);
      assert.deepEqual(result.selected, Array.from({ length: c.D }, (_, i) => i));
      repeated.set(subject, { bytes, result }); families++;
    }
    for (const subject of [...c.issuers].reverse()) {
      const prior = repeated.get(subject);
      assert.deepEqual(pair(prior.bytes, context(subject), view, true), prior.result, 'no cross-user support reservation');
    }
    const genuine = build(dimensions), genuineView = capture(genuine);
    assert.deepEqual(genuineView.toJSON(), beforeView, 'roles were never supplied to either graph capture');
    for (const subject of genuine.issuers) {
      const prior = repeated.get(subject), bytes = wire(genuine, subject);
      assert.deepEqual(bytes, prior.bytes);
      assert.deepEqual(pair(bytes, context(subject), genuineView, true), prior.result);
    }
    assert.deepEqual(c.g.toJSON(), beforeGraph);
    assert.deepEqual(view.toJSON(), beforeView);
    rows.push({ ...dimensions, B: c.D, assumedF: c.M + c.D, lambda: { numerator: c.M + c.D, denominator: c.D },
      bridgeOutgoing: c.M + c.D - 1, acceptedIssuerFamilies: c.issuers.length });
  }
  assert.equal(families, 49);
  t.diagnostic('t1-reuse ' + JSON.stringify({ cells: cells.length, issuerFamilies: families, nativeVerifierCalls: families * 6,
    modelCalls: 0, studies: 0, classification: 'finite supplied-live graph/raw-support only; not funded or selected d_eff/K', rows }));
});

test('D73 finite T1: cutting one actual boundary keeps inner raw guarantees but removes D-path support', t => {
  let rejected = 0, oldCaptureAccepted = 0;
  for (const dimensions of cells) {
    const c = build(dimensions), old = capture(c), submitted = new Map(c.issuers.map(subject => [subject, wire(c, subject)]));
    c.g.removeEdge('a0', 'b0');
    const current = capture(c);
    assert.notEqual(current.view().id, old.view().id);
    assert.equal(old.edge('a0', 'b0'), true);
    assert.equal(current.edge('a0', 'b0'), false);
    crossing(c, true);
    for (const subject of c.issuers) {
      if (c.inner.includes(subject)) assert.equal(current.degree(subject, 'directed-from-anchor', 'any-live-orientation'), c.D);
      assert.equal(rawFamily(c, subject, paths(c, subject)), false);
      const no = pair(submitted.get(subject), context(subject), current, false);
      assert.equal(no.reason, subject === 'b0' ? 'degree-infeasible' : 'insufficient-valid-paths');
      pair(submitted.get(subject), context(subject), old, true);
      rejected++; oldCaptureAccepted++;
    }
  }
  assert.equal(rejected, 49); assert.equal(oldCaptureAccepted, 49);
  t.diagnostic('t1-cut ' + JSON.stringify({ rejected, oldCaptureAccepted, nativeVerifierCalls: 2 * (rejected + oldCaptureAccepted),
    negativeBasis: 'literal only-crossing heads D-1; rejection not stale revision or a global search claim' }));
});

test('D73 finite T1: shared-center D36 physical paths are distinct from D61 distinct-terminal policy', t => {
  let commonAccepted = 0, commonCutRejected = 0, distinctTerminalRejected = 0;
  for (const dimensions of cells) {
    const c = build(dimensions, true), view = capture(c, true), proofs = new Map();
    crossing(c, false, true);
    for (const subject of c.issuers) {
      assert.ok(rawFamily(c, subject, paths(c, subject, true), true));
      const proof = forwardProof(c, subject);
      assert.equal(verifyInternallyDisjointPaths(c.g, proof, { source: 'z', target: subject, minimumPaths: c.D }), true);
      proofs.set(subject, proof); commonAccepted++;
      const result = pair(wire(c, subject, true), context(subject, 3), view, false);
      assert.equal(result.reason, 'family-conflict');
      assert.ok(result.anchorBound >= c.D, 'not merely too few supplied eligible terminals');
      distinctTerminalRejected++;
    }
    c.g.removeEdge('a0', 'b0');
    crossing(c, true, true);
    for (const subject of c.issuers) {
      assert.equal(rawFamily(c, subject, paths(c, subject, true), true), false);
      assert.equal(verifyInternallyDisjointPaths(c.g, proofs.get(subject), { source: 'z', target: subject, minimumPaths: c.D, requireRevision: false }), false);
      commonCutRejected++;
    }
  }
  assert.equal(commonAccepted, 49); assert.equal(commonCutRejected, 49); assert.equal(distinctTerminalRejected, 49);
  t.diagnostic('t1-center ' + JSON.stringify({ commonAccepted, commonCutRejected, distinctTerminalRejected,
    nativeMultiAnchorCalls: 2 * distinctTerminalRejected, commonEndpointCalls: commonAccepted + commonCutRejected,
    flowOrSearchCalls: 0, policyBoundary: 'shared final center allowed by generic D36, not by named D61 distinct-terminal reference' }));
});

const structuralPlan = JSON.parse(readFileSync(new URL('../studies/2026-10-26-trust-topology-condition-map/t3-t5-structural-plan.json', import.meta.url)));
function structuralCase(D, ratio, kind) {
  const c = build({ D, M: 1 });
  for (let i = 2 * D; i < ratio * D; i++) { const a = 'a' + i; c.anchors.push(a); c.g.addNode(a); }
  if (kind === 'boundary-cut') c.g.removeEdge('a0', 'b0');
  if (kind === 'shared-bottleneck') {
    c.g.addNode('x');
    for (let i = 0; i < D; i++) { c.g.removeEdge('a' + i, 'b' + i); c.g.addEdge('a' + i, 'x'); c.g.addEdge('x', 'b' + i); }
  }
  if (kind === 'long-branches') for (let i = 0; i < D; i++) {
    c.g.removeEdge('a' + i, 'b' + i); c.g.addNode('c' + i); c.g.addEdge('a' + i, 'c' + i); c.g.addEdge('c' + i, 'b' + i);
  }
  if (kind === 'outgoing-only' || kind === 'isolated-target') for (const b of c.bridges) {
    c.g.removeEdge(b, 'u0'); if (kind === 'outgoing-only') c.g.addEdge('u0', b);
  }
  if (kind === 'explicit-reciprocal' || kind === 'one-direction-cut') {
    for (const e of [...c.g.edges()]) if (!c.g.edge(e.to, e.from)) c.g.addEdge(e.to, e.from);
    if (kind === 'one-direction-cut') c.g.removeEdge('a0', 'b0');
  }
  // Independent literal edge algebra checks mutations of the reused T1 builder.
  const expected = [];
  for (let i = 0; i < D; i++) {
    for (let j = 0; j < D; j++) if (i !== j) expected.push(['b' + i, 'b' + j]);
    if (kind === 'shared-bottleneck') expected.push(['a' + i, 'x'], ['x', 'b' + i]);
    else if (kind === 'long-branches') expected.push(['a' + i, 'c' + i], ['c' + i, 'b' + i]);
    else if (!(kind === 'boundary-cut' && i === 0)) expected.push(['a' + i, 'b' + i]);
    if (kind === 'outgoing-only') expected.push(['u0', 'b' + i]);
    else if (kind !== 'isolated-target') expected.push(['b' + i, 'u0']);
  }
  if (kind === 'explicit-reciprocal' || kind === 'one-direction-cut') {
    for (const [a, b] of [...expected]) expected.push([b, a]);
  }
  const wanted = new Set(expected.map(([a, b]) => tuple(a, b)));
  if (kind === 'one-direction-cut') wanted.delete(tuple('a0', 'b0'));
  assert.deepEqual([...c.g.edges()].map(e => tuple(e.from, e.to)).sort(), [...wanted].sort());
  assert.equal([...c.g.inEdges('u0')].length, ['outgoing-only', 'isolated-target'].includes(kind) ? 0 : D);
  return c;
}
function structuralCapture(c, projection, hops, patch = {}) {
  const ctx = context('u0', hops);
  if (projection !== 'directed-from-anchor') ctx.policy.direction = 'undirected';
  ctx.policy.undirectedProjection = projection === 'reciprocal-only' ? 'reciprocal-only' : 'any-live-orientation';
  const view = pathWitnessGraphView(c.g, { policy: ctx.policy, currentEpoch: 3,
    snapshots: [{ epoch: 3, difficulty: c.D, anchors: c.anchors }], removed: [], standing: [], ...patch });
  return { view, ctx };
}
function rawNeighbors(c, node, projection) {
  const incoming = [...c.g.inEdges(node)].map(e => e.from);
  return projection === 'directed-from-anchor' ? incoming : projection === 'reciprocal-only'
    ? incoming.filter(v => c.g.edge(node, v)) : [...new Set([...incoming, ...[...c.g.outEdges(node)].map(e => e.to)])];
}
function rawAnchorDistances(c, projection, hops, blocked = null) {
  const distances = new Map([['u0', 0]]), queue = ['u0'];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]; if (distances.get(node) === hops) continue;
    for (const next of rawNeighbors(c, node, projection)) {
      if (next === blocked || distances.has(next)) continue;
      distances.set(next, distances.get(node) + 1); queue.push(next);
    }
  }
  return c.anchors.filter(a => distances.has(a)).length;
}
function rawStructuralFamily(c, family, projection, hops) {
  assert.equal(family.length, c.D); const used = new Set();
  for (const p of family) {
    assert.equal(p[0], 'u0'); assert.ok(p.length > 1 && p.length - 1 <= hops);
    assert.equal(new Set(p).size, p.length); assert.ok(c.anchors.includes(p.at(-1)));
    for (let i = 1; i < p.length; i++) assert.ok(rawNeighbors(c, p[i - 1], projection).includes(p[i]));
    for (const v of p.slice(1)) { assert.equal(used.has(v), false); used.add(v); }
  }
}
function negativeBasis(c, projection, hops, result) {
  const degree = rawNeighbors(c, 'u0', projection).length;
  if (result.reason === 'degree-infeasible') {
    assert.ok(degree < c.D); return { kind: 'raw-projected-degree', bound: degree };
  }
  assert.equal(result.stats.enumerationComplete, true); assert.equal(result.stats.packingComplete, true);
  const reachable = rawAnchorDistances(c, projection, hops);
  if (reachable < c.D) return { kind: 'raw-hop-reachable-terminals', bound: reachable };
  assert.equal(c.g.hasNode('x'), true); assert.equal(rawAnchorDistances(c, projection, hops, 'x'), 0);
  return { kind: 'single-physical-cut', vertex: 'x', bound: 1 };
}
function conjunction(a, b) {
  assert.ok([true, false, null].includes(a) && [true, false, null].includes(b));
  return a === false || b === false ? false : a === null || b === null ? null : true;
}
function armFacts(G, P, order = Object.keys(structuralPlan.arms)) {
  return Object.fromEntries(order.map(arm => [arm, arm === 'none' ? true : arm === 'guarantee-only' ? G : arm === 'path-only' ? P : conjunction(G, P)]));
}

test('T3/T5 finite192-cell matched raw-guarantee/path matrix has complete/current evidence and genuine controls', t => {
  const rows = [], counts = Object.fromEntries(Object.keys(structuralPlan.arms).map(arm => [arm, { true: 0, false: 0, null: 0 }]));
  const padding = new Map(); let found = 0, countNegatives = 0, completeNegatives = 0;
  for (const template of structuralPlan.templates) for (const D of structuralPlan.dimensions.difficulty)
    for (const ratio of structuralPlan.dimensions.anchorRatio) for (const hops of structuralPlan.dimensions.maxHops)
      for (const projection of structuralPlan.dimensions.projection) {
        const c = structuralCase(D, ratio, template.id), { view, ctx } = structuralCapture(c, projection, hops);
        const beforeGraph = c.g.toJSON(), beforeView = view.toJSON(), query = { ...structuralPlan.query };
        assert.equal(view.degree('u0', ctx.policy.direction, ctx.policy.undirectedProjection), rawNeighbors(c, 'u0', projection).length);
        const G = [...c.g.inEdges('u0')].length >= D, result = findPathWitness(view, ctx, query), P = result.feasible;
        const expectedP = (template.P ?? template['P_at_hops_' + hops])[projection];
        assert.equal(G, template.G_raw); assert.equal(P, expectedP, JSON.stringify({ template: template.id, D, ratio, hops, projection }));
        const facts = armFacts(G, P), repeat = findPathWitness(view, ctx, query);
        assert.deepEqual(repeat, result); assert.deepEqual(armFacts(G, P, Object.keys(structuralPlan.arms).reverse()), facts);
        const genuine = structuralCase(D, ratio, template.id), control = structuralCapture(genuine, projection, hops);
        const outsideAssumedFake = new Set(c.issuers), outsideAllGenuine = new Set(genuine.g.nodeIds());
        assert.ok(outsideAllGenuine.size > outsideAssumedFake.size);
        assert.deepEqual(control.view.toJSON(), beforeView);
        const controlled = findPathWitness(control.view, control.ctx, query);
        assert.deepEqual(controlled, result, 'outside roles do not enter public path/arm observations');
        assert.deepEqual(c.g.toJSON(), beforeGraph); assert.deepEqual(view.toJSON(), beforeView);
        let negative = null;
        if (P === true) {
          assert.equal(result.stats.enumerationComplete, true);
          pair(Buffer.from(result.wire), ctx, view, true); rawStructuralFamily(c, result.witness.paths, projection, hops); found++;
        } else {
          assert.equal(result.status, 'infeasible'); negative = negativeBasis(c, projection, hops, result);
          if (result.reason === 'degree-infeasible') countNegatives++; else completeNegatives++;
        }
        if (projection !== 'any-live-orientation') { assert.ok(P !== true || G); assert.equal(facts.both, P); }
        if (template.id === 'outgoing-only' && projection === 'any-live-orientation') { assert.equal(P, true); assert.equal(G, false); }
        const key = JSON.stringify([template.id, D, hops, projection]), semantic = { G_raw: G, P, arms: facts };
        if (padding.has(key)) assert.deepEqual(semantic, padding.get(key), 'isolated anchor padding does not create route support');
        else padding.set(key, semantic);
        for (const [arm, value] of Object.entries(facts)) counts[arm][String(value)]++;
        rows.push({ template: template.id, D, anchorRatio: ratio, maxHops: hops, projection, target: 'u0', rawIncoming: [...c.g.inEdges('u0')].length,
          ...semantic, status: result.status, reason: result.reason, negativeBasis: negative, enumerationComplete: result.stats.enumerationComplete,
          packingComplete: result.stats.packingComplete, viewRoot: result.viewRoot, paths: result.witness?.paths ?? null,
          verification: result.verification ? { primary: result.verification.primary.accepted, ref2: result.verification.ref2.accepted } : null });
      }
  assert.equal(rows.length, structuralPlan.softwareCells); assert.equal(found + countNegatives + completeNegatives, rows.length);
  assert.equal(found, 64); assert.equal(countNegatives, 72); assert.equal(completeNegatives, 56);
  assert.deepEqual(Object.fromEntries(Object.entries(counts).map(([arm, n]) => [arm, n.true])), { none: 192, 'guarantee-only': 144, 'path-only': 64, both: 56 });
  for (const row of rows) t.diagnostic('t3-t5-row ' + JSON.stringify(row));
  t.diagnostic('t3-t5-matrix ' + JSON.stringify({ cells: rows.length, armFacts: rows.length * 4, found, countNegatives, completeNegatives,
    counts, oracleCalls: rows.length * 3, independentPopulationSamples: 0, rowDigest: digestOf(rows), missingTimeAndCost: true }));
});

test('T3/T5 five capped/unavailable boundaries preserve unknown P and three-valued conjunction', t => {
  const rows = [];
  for (const spec of structuralPlan.boundaryControls) {
    const c = structuralCase(2, 2, spec.template), { view, ctx } = structuralCapture(c, spec.projection, 2, spec.capturePatch);
    const G = [...c.g.inEdges('u0')].length >= 2, query = { ...structuralPlan.query, ...spec.queryPatch };
    const result = findPathWitness(view, ctx, query), facts = armFacts(G, result.feasible);
    assert.equal(result.feasible, spec.P); assert.equal(facts.both, spec.both);
    if (spec.P === null) assert.ok(['censored', 'unavailable'].includes(result.status));
    else { assert.equal(result.status, 'infeasible'); assert.ok(rawNeighbors(c, 'u0', spec.projection).length < 2); }
    rows.push({ template: spec.template, projection: spec.projection, query, snapshotAvailable: !spec.capturePatch,
      G_raw: G, P: result.feasible, arms: facts, status: result.status, reason: result.reason });
  }
  for (const a of [true, false, null]) for (const b of [true, false, null]) {
    const expected = a === false || b === false ? false : a === true && b === true ? true : null;
    assert.equal(conjunction(a, b), expected);
  }
  const c = structuralCase(2, 2, 'supported'), { view, ctx } = structuralCapture(c, 'directed-from-anchor', 2);
  assert.throws(() => findPathWitness(view, ctx, { ...structuralPlan.query, maxExpansions: -1 }), RangeError);
  assert.throws(() => findPathWitness(view, { ...ctx, hiddenTruth: true }, structuralPlan.query), TypeError);
  assert.equal(rows.length, 5);
  t.diagnostic('t3-t5-boundaries ' + JSON.stringify({ rows, conjunctionCells: 9, invalidQueryContexts: 2, fullMatrixUncertainty: 0 }));
});
