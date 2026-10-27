import test from 'node:test';
import assert from 'node:assert/strict';
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
