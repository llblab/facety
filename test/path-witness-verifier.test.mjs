import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodePathWitness, verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
const root = '../studies/2026-10-26-witness-indexer/';
const vectors = JSON.parse(readFileSync(new URL(root + 'verifier-vectors.json', import.meta.url)));
const wireVectors = JSON.parse(readFileSync(new URL(root + 'wire-vectors.json', import.meta.url)));
const implementations = [verifyPathWitness, verifyPathWitnessRef2];
const base = wireVectors.context;
const key = (a, b) => JSON.stringify([a, b]);
function fixture(raw, onRead = () => {}) {
  const edges = new Set(raw.edges.map(([a, b]) => key(a, b))), trace = [], version = { id: raw.viewId, epoch: raw.currentEpoch };
  const methods = {
    view: () => version, snapshot: epoch => raw.snapshots[epoch] ? { difficulty: raw.snapshots[epoch].difficulty } : null,
    anchor: (epoch, id) => raw.snapshots[epoch]?.anchors.includes(id) ?? false,
    removed: id => raw.removed.includes(id), edge: (a, b) => edges.has(key(a, b)),
    degree: () => raw.degree, anchorCount: () => raw.anchorCount ?? null, standing: id => raw.standings[id] ?? null,
  };
  const state = Object.fromEntries(Object.entries(methods).map(([name, fn]) => [name, (...args) => {
    trace.push([name, ...args]); onRead(name, version, trace); return fn(...args);
  }]));
  return { state, trace };
}
function state(edges, D = 2, anchors = ['a', 'b']) {
  return { currentEpoch: 3, viewId: 'synthetic-v1', snapshots: { 3: { difficulty: D, anchors } }, edges, removed: [], standings: {}, degree: null };
}
function compare(bytes, context, raw, expected) {
  const results = implementations.map(verify => verify(bytes, context, fixture(raw).state));
  for (const field of ['accepted', 'reason', 'required', 'degreeBound', 'anchorBound', 'selected']) assert.deepEqual(results[0][field], results[1][field], field);
  if (expected !== undefined) assert.equal(results[0].reason, expected);
  for (const result of results) {
    const k = JSON.parse(Buffer.from(bytes).toString()).witness.paths.length, r = context.policy.maxHops, calls = result.stats.lookups;
    assert.ok(calls.view <= 2 && calls.snapshot <= 1 && calls.degree <= 1 && calls.anchorCount <= 1);
    assert.ok(calls.anchor <= k && calls.removed <= k && calls.edge <= 2 * k * r && calls.standing <= k * r);
    assert.ok(result.stats.vertices <= k * (r + 1));
    assert.ok(result.stats.conflictsChecked <= (result === results[0] ? 3 : k) * k * r);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.selected) && Object.isFrozen(result.stats.lookups));
  }
  return results[0];
}
// Separate exhaustive packing on the supplied raw observations, not production/ref2 candidate helpers.
function packingOracle(paths, epoch, context, raw) {
  const p = context.policy, snap = raw.snapshots[epoch];
  if (!snap || epoch > raw.currentEpoch || raw.currentEpoch - epoch > p.graceEpochs || paths.length > snap.difficulty + p.maxSlack) return null;
  const graph = new Set(raw.edges.map(e => key(...e))), anchors = new Set(snap.anchors), candidates = [];
  paths.forEach((path, index) => {
    if (path.length < 2 || path.length - 1 > p.maxHops || path[0] !== context.subject || new Set(path).size !== path.length
      || !anchors.has(path.at(-1)) || raw.removed.includes(path.at(-1))) return;
    for (let j = 1; j < path.length; j++) {
      const forward = graph.has(key(path[j - 1], path[j])), backward = graph.has(key(path[j], path[j - 1]));
      if (!(p.direction === 'directed-from-anchor' ? backward : p.undirectedProjection === 'reciprocal-only' ? forward && backward : forward || backward)) return;
      if (p.minStanding !== null && j + 1 < path.length && (raw.standings[path[j]] == null || raw.standings[path[j]] < p.minStanding)) return;
    }
    candidates.push(index);
  });
  function choose(start, indices, occupied) {
    if (indices.length === snap.difficulty) return indices;
    for (let i = start; i < candidates.length; i++) {
      const index = candidates[i], used = paths[index].slice(1);
      if (used.some(v => occupied.has(v))) continue;
      const found = choose(i + 1, [...indices, index], new Set([...occupied, ...used]));
      if (found) return found;
    }
    return null;
  }
  return choose(0, [], new Set());
}
function allFamilies(paths, maximum) {
  const out = [[]];
  function visit(start, chosen) {
    if (chosen.length === maximum) return;
    for (let i = start; i < paths.length; i++) { const next = [...chosen, paths[i]]; out.push(next); visit(i + 1, next); }
  }
  visit(0, []); return out;
}
function allPaths(nodes) {
  const out = [];
  function visit(path) {
    if (['a', 'b'].includes(path.at(-1))) out.push(path);
    for (const v of nodes) if (!path.includes(v)) visit([...path, v]);
  }
  visit(['u']); return out;
}

test('portable structural vectors match separate parser/verifier, including exact slack and canonical selected family', () => {
  for (const row of vectors.cases) {
    const bytes = Buffer.from(row.wire);
    const got = compare(bytes, row.context, row.state, row.expected);
    assert.equal(got.accepted, row.accepted, row.id);
    if (got.accepted) assert.deepEqual(got.selected, packingOracle(JSON.parse(row.wire).witness.paths, row.witness.epoch, row.context, row.state), row.id);
    if (row.id === 'greedy-trap') assert.deepEqual(got.selected, [1, 2]);
  }
});

test('ref2 parser independently exercises literal canonical/noncanonical codec vectors and context/policy substitution', () => {
  const raw = state([['a', 'u'], ['b', 'u']]);
  for (const row of wireVectors.wireCases) for (const verify of implementations) {
    const result = verify(Buffer.from(row.wire), base, fixture(raw).state);
    assert.equal(result.reason !== 'invalid-wire', row.decodes, row.id);
  }
  const bytes = encodePathWitness({ subject: 'u', epoch: 3, paths: [['u', 'a'], ['u', 'b']] }, base);
  for (const modify of [c => { c.domain = 'different'; }, c => { c.subject = 'different'; },
    c => { c.policy.graceEpochs = 2; }, c => { c.policy.maxHops = 4; }, c => { c.policy.maxIdBytes = 63; },
    c => { c.policy.maxWitnessBytes = 8191; }, c => { c.policy.maxDifficulty = 7; }, c => { c.policy.maxSlack = 0; },
    c => { c.policy.minStanding = 1; }, c => { c.policy.direction = 'undirected'; }, c => { c.policy.undirectedProjection = 'reciprocal-only'; }]) {
    const c = structuredClone(base); modify(c);
    for (const verify of implementations) assert.equal(verify(bytes, c, fixture(raw).state).reason, 'invalid-wire');
  }
});

test('all 64 directed three-vertex graphs and every <=3 submitted family, in all three projections, match recursive packing (2880 pairs)', () => {
  const nodes = ['u', 'a', 'b'], possible = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b]));
  const families = allFamilies(allPaths(nodes), 3); assert.equal(families.length, 15);
  let pairs = 0;
  for (let bits = 0; bits < 64; bits++) for (const projection of ['directed', 'any', 'reciprocal']) for (const paths of families) {
    const c = structuredClone(base);
    if (projection !== 'directed') c.policy.direction = 'undirected';
    if (projection === 'reciprocal') c.policy.undirectedProjection = 'reciprocal-only';
    const raw = state(possible.filter((_, i) => bits & (1 << i))), bytes = encodePathWitness({ subject: 'u', epoch: 3, paths }, c);
    const canonical = JSON.parse(bytes.toString()).witness.paths, wanted = packingOracle(canonical, 3, c, raw);
    const result = compare(bytes, c, raw); assert.equal(result.accepted, wanted !== null);
    if (wanted) assert.deepEqual(result.selected, wanted);
    pairs++;
  }
  assert.equal(pairs, 2880);
});

test('all 4096 directed four-vertex graphs with a deterministic varying three-candidate family match raw packing, not an all-witness claim', () => {
  const nodes = ['u', 'x', 'a', 'b'], possible = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b]));
  const families = allFamilies(allPaths(nodes), 3).filter(f => f.length === 3);
  assert.equal(families.length, 120);
  for (let bits = 0; bits < 4096; bits++) {
    const raw = state(possible.filter((_, i) => bits & (1 << i))), paths = families[bits % families.length];
    const bytes = encodePathWitness({ subject: 'u', epoch: 3, paths }, base), canonical = JSON.parse(bytes.toString()).witness.paths;
    const wanted = packingOracle(canonical, 3, base, raw), result = compare(bytes, base, raw);
    assert.equal(result.accepted, wanted !== null);
    if (wanted) assert.deepEqual(result.selected, wanted);
  }
});

test('standing-off is invariant/inert; canonical degree unknown is not zero; anchor self requires paths to other anchors', () => {
  const bytes = encodePathWitness({ subject: 'u', epoch: 3, paths: [['u', 'x', 'a'], ['u', 'y', 'b']] }, base);
  for (const verify of implementations) for (const scores of [{}, { x: 0, y: 0 }, { x: 999, y: 999 }]) {
    const raw = state([['x', 'u'], ['a', 'x'], ['y', 'u'], ['b', 'y']], 2, ['u', 'a', 'b']); raw.standings = scores;
    const f = fixture(raw); f.state.standing = () => { throw Error('off is inert'); };
    const result = verify(bytes, base, f.state);
    assert.equal(result.accepted, true); assert.equal(result.degreeBound, null); assert.equal(result.anchorBound, null); assert.equal(result.stats.lookups.standing, 0);
    raw.degree = 2; raw.anchorCount = 2; assert.equal(verify(bytes, base, fixture(raw).state).accepted, true);
    const selfOnly = encodePathWitness({ subject: 'u', epoch: 3, paths: [['u']] }, base);
    assert.equal(verify(selfOnly, base, fixture(raw).state).accepted, false);
  }
});

test('canonical view changes reject and invalid accessor/context faults propagate, rather than clean negative verdicts', () => {
  const row = vectors.cases[0], bytes = Buffer.from(row.wire);
  for (const verify of implementations) {
    const f = fixture(row.state, (method, version) => { if (method === 'edge') version.id = 'changed'; });
    assert.equal(verify(bytes, row.context, f.state).reason, 'state-view-changed');
    for (const [method, value] of [['edge', undefined], ['degree', -1], ['anchorCount', -1], ['anchor', 1], ['snapshot', { difficulty: 0 }], ['snapshot', { difficulty: 65 }]]) {
      const broken = fixture(row.state).state; broken[method] = () => value;
      assert.throws(() => verify(bytes, row.context, broken), TypeError);
    }
    const thrown = new Error('external canonical provider fault'), broken = fixture(row.state).state;
    broken.edge = () => { throw thrown; }; assert.throws(() => verify(bytes, row.context, broken), error => error === thrown);
    assert.throws(() => verify(bytes, { ...row.context, extra: 1 }, fixture(row.state).state), TypeError);
  }
});

test('D1/D3/D64 bounds, higher slack conflict structure, permutation/dedup and memoized O(k*r) lookups', () => {
  const c = structuredClone(base); c.policy.maxDifficulty = 64;
  for (const D of [1, 3, 64]) {
    const anchors = Array.from({ length: D }, (_, i) => 'a' + i), paths = anchors.map((a, i) => ['u', 'x' + i, a]);
    const edges = anchors.flatMap((a, i) => [['x' + i, 'u'], [a, 'x' + i]]);
    const raw = state(edges, D, anchors), bytes = encodePathWitness({ subject: 'u', epoch: 3, paths }, c);
    compare(bytes, c, raw, 'ok');
    assert.deepEqual(encodePathWitness({ subject: 'u', epoch: 3, paths: [...paths].reverse() }, c), bytes);
    if (D < 64) assert.deepEqual(encodePathWitness({ subject: 'u', epoch: 3, paths: [...paths, paths[0]] }, c), bytes);
    for (const verify of implementations) {
      const f = fixture(raw);
      for (const field of ['indexer', 'cache', 'hints']) Object.defineProperty(f.state, field, { get() { throw Error('advisory state must not be read'); } });
      verify(bytes, c, f.state);
      const facts = f.trace.filter(([method]) => ['edge', 'anchor', 'removed', 'standing'].includes(method)).map(row => JSON.stringify(row));
      assert.equal(new Set(facts).size, facts.length);
    }
  }
  const longContext = structuredClone(c); longContext.policy.maxHops = 64;
  const long = ['u', ...Array.from({ length: 63 }, (_, i) => 'm' + i), 'a'];
  const longEdges = long.slice(1).map((v, i) => [v, long[i]]);
  compare(encodePathWitness({ subject: 'u', epoch: 3, paths: [long, ['u', 'b']] }, longContext), longContext, state([...longEdges, ['b', 'u']]), 'ok');
  const maximumAnchors = Array.from({ length: 64 }, (_, i) => 'a' + i), maximumPaths = maximumAnchors.map((a, i) => ['u', 'x' + i, a]);
  maximumPaths.push(['u', 'x0', 'x1', 'z']);
  const maximumEdges = maximumAnchors.flatMap((a, i) => [['x' + i, 'u'], [a, 'x' + i]]);
  maximumEdges.push(['x1', 'x0'], ['z', 'x1']);
  const maximumBytes = encodePathWitness({ subject: 'u', epoch: 3, paths: maximumPaths }, c);
  const maximumResult = compare(maximumBytes, c, state(maximumEdges, 64, [...maximumAnchors, 'z']), 'ok');
  assert.equal(maximumResult.selected.length, 64);
  const maximumCanonical = JSON.parse(maximumBytes.toString()).witness.paths;
  assert.ok(maximumResult.selected.every(i => maximumCanonical[i].at(-1) !== 'z'));
  const paths = [['u', 'x', 'a'], ['u', 'x', 'b'], ['u', 'y', 'c'], ['u', 'y', 'd']];
  const raw = state([['x', 'u'], ['a', 'x'], ['b', 'x'], ['y', 'u'], ['c', 'y'], ['d', 'y']], 3, ['a', 'b', 'c', 'd']);
  compare(encodePathWitness({ subject: 'u', epoch: 3, paths }, c), c, raw, 'family-conflict');
});

test('in-grace adopted D and immediate current removal/liveness dominate old support; re-added live endpoints are vertex-only evidence', () => {
  const raw = state([['a', 'u'], ['b', 'u']]);
  raw.snapshots[2] = { difficulty: 1, anchors: ['a', 'b'] };
  const previous = encodePathWitness({ subject: 'u', epoch: 2, paths: [['u', 'a']] }, base);
  const current = encodePathWitness({ subject: 'u', epoch: 3, paths: [['u', 'a']] }, base);
  for (const verify of implementations) {
    assert.equal(verify(previous, base, fixture(raw).state).required, 1);
    assert.equal(verify(previous, base, fixture(raw).state).accepted, true);
    assert.equal(verify(current, base, fixture(raw).state).accepted, false);
    const gone = structuredClone(raw); gone.removed = ['a']; gone.viewId = 'removed';
    assert.equal(verify(previous, base, fixture(gone).state).accepted, false);
    gone.removed = []; gone.edges = [['b', 'u']]; gone.viewId = 'edge-removed';
    assert.equal(verify(previous, base, fixture(gone).state).accepted, false);
    gone.edges.push(['a', 'u']); gone.viewId = 'edge-readded';
    assert.equal(verify(previous, base, fixture(gone).state).accepted, true);
  }
});

test('bounded truncation/byte and structured mutations agree and every accepted mutated packet passes raw family oracle', () => {
  const row = vectors.cases[0], b = Buffer.from(row.wire), mutations = [];
  for (let i = 0; i < b.length; i++) { mutations.push(b.subarray(0, i)); for (const mask of [1, 128]) { const v = Buffer.from(b); v[i] ^= mask; mutations.push(v); } }
  mutations.push(Buffer.from(' ' + row.wire), Buffer.from(row.wire + '\n'), Buffer.from(row.wire.replace('"epoch":3', '"epoch":3,"epoch":3')),
    Buffer.from(row.wire.replace('"epoch":3', '"epoch":-0')), Buffer.alloc(base.policy.maxWitnessBytes + 1));
  for (const bytes of mutations) {
    const a = verifyPathWitness(bytes, row.context, fixture(row.state).state), b = verifyPathWitnessRef2(bytes, row.context, fixture(row.state).state);
    assert.equal(a.accepted, b.accepted); assert.equal(a.reason, b.reason); assert.deepEqual(a.selected, b.selected);
    if (a.accepted) { const doc = JSON.parse(bytes.toString()).witness; assert.deepEqual(a.selected, packingOracle(doc.paths, doc.epoch, row.context, row.state)); }
    if (a.reason === 'invalid-wire') assert.deepEqual(Object.values(a.stats.lookups), [0, 0, 0, 0, 0, 0, 0, 0]);
  }
});

test('ref2 has no local production imports; Unicode IDs with embedded delimiters use exact tuple keys', () => {
  const source = readFileSync(new URL('../src/path-witness-ref2.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]).filter(m => !m.startsWith('node:')), []);
  const c = structuredClone(base); c.subject = '🙂';
  const paths = [['🙂', 'x\0y', 'é'], ['🙂', 'x', 'y\0é']];
  const raw = state([['x\0y', '🙂'], ['é', 'x\0y'], ['x', '🙂'], ['y\0é', 'x']], 2, ['é', 'y\0é']);
  compare(encodePathWitness({ subject: c.subject, epoch: 3, paths }, c), c, raw, 'ok');
});
