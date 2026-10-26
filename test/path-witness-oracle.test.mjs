import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView, isPathWitnessView } from '../src/path-witness-view.mjs';
import { findPathWitness, PATH_ORACLE_LIMITS } from '../src/path-witness-oracle.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
const vectors = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/oracle-vectors.json', import.meta.url)));
const base = vectors.context, budget = vectors.query;
const tuple = (a, b) => JSON.stringify([a, b]);
function fixture(raw, patch = {}) {
  const context = structuredClone(base); Object.assign(context.policy, patch);
  const graph = new DirectedGraph('oracle-fixture');
  for (const node of raw.nodes) graph.addNode(node);
  for (const [a, b] of raw.edges) graph.addEdge(a, b);
  const view = pathWitnessGraphView(graph, { policy: context.policy, currentEpoch: raw.currentEpoch ?? 3,
    snapshots: raw.snapshots ?? [{ epoch: 3, difficulty: raw.difficulty, anchors: raw.anchors }], removed: raw.removed ?? [], standing: raw.standing ?? [] });
  return { view, context, graph };
}
function checked(result, view, context) {
  assert.equal(result.viewRoot, view.view().id);
  assert.ok(result.stats.expansions <= result.query.maxExpansions && result.stats.paths <= result.query.maxPaths && result.stats.packingSteps <= result.query.maxPackingSteps);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.stats) && Object.isFrozen(result.context.policy));
  if (result.status === 'found') {
    assert.equal(result.feasible, true); assert.equal(result.witness.paths.length, result.required);
    assert.equal(typeof result.wire, 'string'); assert.ok(Object.isFrozen(result.witness.paths));
    const bytes = Buffer.from(result.wire, 'utf8');
    for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(bytes, context, view).accepted, true);
    assert.equal(JSON.parse(JSON.stringify(result)).wire, result.wire);
  } else {
    assert.equal(result.witness, null); assert.equal(result.wire, null); assert.equal(result.verification, null);
    assert.equal(result.feasible, result.status === 'infeasible' ? false : null);
  }
  return result;
}
// Enumerate node permutations independent of graph edges/production neighbor enumeration.
function sequences(nodes, r) {
  const values = [];
  function visit(path) {
    if (path.length > 1) values.push([...path]);
    if (path.length - 1 === r) return;
    for (const v of nodes) if (!path.includes(v)) visit([...path, v]);
  }
  visit(['u']); return values;
}
// Full bit-subset enumeration over raw admissible paths, not production's recursive packing.
function brute(candidates, raw, policy) {
  const edges = new Set(raw.edges.map(e => tuple(...e))), anchors = new Set(raw.anchors), removed = new Set(raw.removed ?? []), scores = new Map(raw.standing ?? []);
  const valid = candidates.filter(path => {
    if (!anchors.has(path.at(-1)) || removed.has(path.at(-1))) return false;
    for (let j = 1; j < path.length; j++) {
      const forward = edges.has(tuple(path[j - 1], path[j])), backward = edges.has(tuple(path[j], path[j - 1]));
      if (!(policy.direction === 'directed-from-anchor' ? backward : policy.undirectedProjection === 'reciprocal-only' ? forward && backward : forward || backward)) return false;
      if (policy.minStanding !== null && j + 1 < path.length && (scores.get(path[j]) == null || scores.get(path[j]) < policy.minStanding)) return false;
    }
    return true;
  });
  assert.ok(valid.length < 24, 'tiny brute-force test domain, not a production cutoff');
  for (let mask = 0; mask < 2 ** valid.length; mask++) {
    const chosen = valid.filter((_, i) => mask & (2 ** i));
    if (chosen.length !== raw.difficulty) continue;
    const vertices = chosen.flatMap(path => path.slice(1));
    if (new Set(vertices).size === vertices.length) return true;
  }
  return false;
}

test('portable global/hop/layer/resource vectors distinguish found, exhausted infeasible and censored; every found witness passes both verifiers', () => {
  assert.equal(vectors.cases.length, 12);
  for (const row of vectors.cases) {
    const { view, context } = fixture(row.graph, row.policy);
    const query = { ...budget, ...row.budget }, result = checked(findPathWitness(view, context, query), view, context);
    assert.equal(result.status, row.expected, row.id);
    if (row.reason) assert.equal(result.reason, row.reason, row.id);
    if (Object.hasOwn(row, 'enumerationComplete')) assert.equal(result.stats.enumerationComplete, row.enumerationComplete);
    const actual = brute(sequences(row.graph.nodes, context.policy.maxHops), row.graph, context.policy);
    if (result.feasible !== null) assert.equal(result.feasible, actual, row.id);
  }
});

test('all64 three-node directed graphs ×3 projections ×2 hop bounds ×2 D values match global raw permutations/bit-subsets (768 queries)', () => {
  const nodes = ['u', 'a', 'b'], possible = nodes.flatMap(a => nodes.filter(b => b !== a).map(b => [a, b]));
  let queries = 0;
  for (let bits = 0; bits < 64; bits++) for (const mode of ['directed', 'any', 'reciprocal']) for (const r of [1, 2]) for (const D of [1, 2]) {
    const raw = { nodes, edges: possible.filter((_, i) => bits & (1 << i)), anchors: ['a', 'b'], difficulty: D };
    const patch = { maxHops: r, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected',
      undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' };
    const { view, context } = fixture(raw, patch), result = checked(findPathWitness(view, context, budget), view, context);
    assert.ok(['found', 'infeasible'].includes(result.status)); assert.equal(result.feasible, brute(sequences(nodes, r), raw, context.policy)); queries++;
  }
  assert.equal(queries, 768);
});

test('all4096 four-node directed graphs ×3 projections at r3/D2 match global brute force, not merely one supplied family (12288 queries)', () => {
  const nodes = ['u', 'x', 'a', 'b'], possible = nodes.flatMap(a => nodes.filter(b => b !== a).map(b => [a, b])), candidates = sequences(nodes, 3);
  let queries = 0;
  for (let bits = 0; bits < 4096; bits++) for (const mode of ['directed', 'any', 'reciprocal']) {
    const raw = { nodes, edges: possible.filter((_, i) => bits & (1 << i)), anchors: ['a', 'b'], difficulty: 2 };
    const { view, context } = fixture(raw, { maxHops: 3, direction: mode === 'directed' ? 'directed-from-anchor' : 'undirected',
      undirectedProjection: mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation' });
    const result = checked(findPathWitness(view, context, budget), view, context);
    assert.ok(['found', 'infeasible'].includes(result.status)); assert.equal(result.feasible, brute(candidates, raw, context.policy)); queries++;
  }
  assert.equal(queries, 12288);
});

test('exact exhausted-negative caps are complete; one-less enumeration/retention/packing budgets are unknown, never a no-path result', () => {
  const row = vectors.cases.find(c => c.id === 'layer-duplicated-person-trap'), { view, context } = fixture(row.graph, row.policy);
  const full = findPathWitness(view, context, budget); assert.equal(full.status, 'infeasible');
  assert.equal(full.stats.enumerationComplete, true); assert.equal(full.stats.packingComplete, true);
  const exact = { epoch: 3, maxExpansions: full.stats.expansions, maxPaths: full.stats.paths, maxPackingSteps: full.stats.packingSteps };
  assert.equal(findPathWitness(view, context, exact).status, 'infeasible');
  for (const key of ['maxExpansions', 'maxPaths', 'maxPackingSteps']) {
    const q = { ...exact, [key]: exact[key] - 1 }, result = checked(findPathWitness(view, context, q), view, context);
    assert.equal(result.status, 'censored'); assert.equal(result.feasible, null);
  }
});

test('score affects intermediary continuation, not terminal eligibility; removed anchors can remain live transit; subject self contributes no route', () => {
  const raw = { nodes: ['u', 'a', 'b'], edges: [['a', 'u'], ['b', 'a']], anchors: ['a', 'b'], difficulty: 1, standing: [['a', 0]] };
  let f = fixture(raw, { maxHops: 2, minStanding: 1 });
  let result = checked(findPathWitness(f.view, f.context, budget), f.view, f.context);
  assert.equal(result.status, 'found'); assert.deepEqual(result.witness.paths, [['u', 'a']]); assert.equal(result.stats.paths, 1);
  f = fixture({ ...raw, anchors: ['b'] }, { maxHops: 2, minStanding: 1 });
  assert.equal(findPathWitness(f.view, f.context, budget).status, 'infeasible');
  f = fixture({ ...raw, removed: ['a'], standing: [['a', 1]] }, { maxHops: 2, minStanding: 1 });
  result = checked(findPathWitness(f.view, f.context, budget), f.view, f.context);
  assert.equal(result.status, 'found'); assert.deepEqual(result.witness.paths, [['u', 'a', 'b']]);
  f = fixture({ ...raw, anchors: ['u'] }); assert.equal(findPathWitness(f.view, f.context, budget).reason, 'anchor-infeasible');
  f = fixture({ ...raw, anchors: ['u', 'a'] }); assert.equal(findPathWitness(f.view, f.context, budget).status, 'found');
});

test('outside-grace/missing snapshot is unavailable; typed query/policy errors and copied/pruned view objects throw, never become infeasible', () => {
  const f = fixture(vectors.cases[0].graph), missing = { ...budget, epoch: 2 };
  assert.equal(findPathWitness(f.view, f.context, missing).status, 'unavailable');
  assert.equal(findPathWitness(f.view, f.context, { ...budget, epoch: 4 }).reason, 'epoch-outside-grace');
  assert.ok(isPathWitnessView(f.view));
  for (const invalid of [{ ...f.view }, { ...f.view, neighbors: () => [] }, JSON.parse(JSON.stringify(f.view.toJSON())), null]) {
    assert.equal(isPathWitnessView(invalid), false); assert.throws(() => findPathWitness(invalid, f.context, budget), /locally constructed/);
  }
  for (const mutate of [q => { q.extra = 1; }, q => { delete q.epoch; }, q => { q.epoch = -0; }, q => { q.maxPaths = -1; },
    q => { q.maxPackingSteps = 0.5; }, q => { q.maxExpansions = PATH_ORACLE_LIMITS.maxExpansions + 1; }, q => { q.maxPaths = PATH_ORACLE_LIMITS.maxPaths + 1; },
    q => { q.maxPackingSteps = PATH_ORACLE_LIMITS.maxPackingSteps + 1; }]) {
    const q = { ...budget }; mutate(q); assert.throws(() => findPathWitness(f.view, f.context, q));
  }
  const c = structuredClone(f.context); c.policy.maxSlack = 0;
  assert.throws(() => findPathWitness(f.view, c, budget), /policy differs/); assert.ok(Object.isFrozen(PATH_ORACLE_LIMITS));
});

test('D64/r64 resource boundaries yield bounded valid output; Unicode/delimiter IDs are exact, not person aliases', () => {
  const anchors = Array.from({ length: 64 }, (_, i) => 'a' + i), raw = { nodes: ['u', ...anchors], edges: anchors.map(a => [a, 'u']), anchors, difficulty: 64 };
  let f = fixture(raw, { maxDifficulty: 64, maxHops: 1 }), result = checked(findPathWitness(f.view, f.context, budget), f.view, f.context);
  assert.equal(result.status, 'found'); assert.equal(result.witness.paths.length, 64);
  const long = ['u', ...Array.from({ length: 63 }, (_, i) => 'm' + i), 'a'];
  f = fixture({ nodes: long, edges: long.slice(1).map((v, i) => [v, long[i]]), anchors: ['a'], difficulty: 1 }, { maxHops: 64 });
  result = checked(findPathWitness(f.view, f.context, budget), f.view, f.context); assert.equal(result.status, 'found'); assert.equal(result.witness.paths[0].length, 65);
  f = fixture({ nodes: ['u', 'x\0y', 'é', 'x', 'y\0é'], edges: [['x\0y', 'u'], ['é', 'x\0y'], ['x', 'u'], ['y\0é', 'x']], anchors: ['é', 'y\0é'], difficulty: 2 });
  result = checked(findPathWitness(f.view, f.context, budget), f.view, f.context); assert.equal(result.status, 'found');
});

test('Native current-record capture is searched without Model mutation; source changes do not refresh an old root or provide fresh authorization', () => {
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] });
  for (const a of ['a', 'b']) m.confirmGuarantee('u', m.proposeGuarantee(a, 'u'));
  const o = { policy: base.policy, currentEpoch: 3, snapshots: [{ epoch: 3, difficulty: 2, anchors: ['a', 'b'] }], removed: [], standing: [] };
  const old = capturePathWitnessModelView(m, o), before = JSON.stringify([m.events(), m.subjects(), m.guaranteeRelations(), m.guarantees.toJSON(), m.audit()]);
  assert.equal(findPathWitness(old, base, budget).status, 'found');
  assert.equal(JSON.stringify([m.events(), m.subjects(), m.guaranteeRelations(), m.guarantees.toJSON(), m.audit()]), before);
  m.invalidateIdentity('a'); const fresh = capturePathWitnessModelView(m, o);
  assert.notEqual(fresh.view().id, old.view().id); assert.equal(findPathWitness(fresh, base, budget).status, 'infeasible');
  assert.equal(findPathWitness(old, base, budget).status, 'found');
});

test('repeat query/inert inspection/unrelated capture and search leave deterministic outputs unchanged; no RNG is consulted', () => {
  const f = fixture(vectors.cases[0].graph), before = findPathWitness(f.view, f.context, budget);
  f.view.toJSON(); f.view.nodeIds(); f.view.snapshot(3);
  const other = fixture({ nodes: ['u'], edges: [], anchors: [], difficulty: 1 }); findPathWitness(other.view, other.context, budget);
  assert.deepEqual(findPathWitness(f.view, f.context, budget), before);
  const source = readFileSync(new URL('../src/path-witness-oracle.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|randomBytes|from ['"].*random/);
});
