import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel, DAY } from '../src/model.mjs';
import { pathWitnessGraphView, capturePathWitnessModelView, PATH_VIEW_LIMITS } from '../src/path-witness-view.mjs';
import { encodePathWitness, verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const verifiers = [verifyPathWitness, verifyPathWitnessRef2];
const options = (D = 2, anchors = ['a', 'b']) => ({ policy: structuredClone(base.policy), currentEpoch: 3,
  snapshots: [{ epoch: 3, difficulty: D, anchors }], removed: [], standing: [] });
function graph(nodes, edges = []) {
  const g = new DirectedGraph('supplied'); for (const id of nodes) g.addNode(id); for (const [a, b] of edges) g.addEdge(a, b); return g;
}
function verdicts(view, paths, context = base, epoch = 3) {
  const bytes = encodePathWitness({ subject: context.subject, epoch, paths }, context);
  const results = verifiers.map(verify => verify(bytes, context, view));
  for (const field of ['accepted', 'reason', 'selected', 'required', 'degreeBound', 'anchorBound']) assert.deepEqual(results[0][field], results[1][field]);
  return results[0];
}
function publicState(m) {
  return { now: m.now, subjects: m.subjects(), acts: m.selfIds(), relations: m.guaranteeRelations(), events: m.events(), ledger: m.audit(),
    guarantees: m.guarantees.toJSON(), lineage: m.lineage.toJSON() };
}
function guarantee(m, a, b) { const id = m.proposeGuarantee(a, b); m.confirmGuarantee(b, id); return id; }

test('all64 tiny directed graphs yield exact independent three-projection neighbors/degree and current eligible-anchor counts', () => {
  const nodes = ['u', 'a', 'b'], possible = nodes.flatMap(a => nodes.filter(b => a !== b).map(b => [a, b]));
  for (let bits = 0; bits < 64; bits++) {
    const edges = possible.filter((_, i) => bits & (1 << i)), g = graph(nodes, edges), o = options(); o.removed = ['b'];
    const view = pathWitnessGraphView(g, o), has = (a, b) => edges.some(([x, y]) => x === a && y === b);
    for (const subject of [...nodes, 'absent']) for (const mode of ['directed', 'any', 'reciprocal']) {
      const direction = mode === 'directed' ? 'directed-from-anchor' : 'undirected', projection = mode === 'reciprocal' ? 'reciprocal-only' : 'any-live-orientation';
      const wanted = nodes.filter(v => v !== subject && (mode === 'directed' ? has(v, subject) : mode === 'any' ? has(v, subject) || has(subject, v) : has(v, subject) && has(subject, v))).sort();
      assert.deepEqual(view.neighbors(subject, direction, projection), wanted); assert.equal(view.degree(subject, direction, projection), wanted.length);
    }
    assert.equal(view.anchorCount(3, 'u'), 1); assert.equal(view.anchorCount(3, 'a'), 0); assert.equal(view.anchor(3, 'b'), true);
    assert.equal(view.removed('b'), true); assert.equal(view.anchorCount(2, 'u'), 0); assert.equal(view.snapshot(2), null);
    assert.throws(() => view.neighbors('u', 'guess', 'any-live-orientation'), TypeError);
  }
});

test('31 portable structural cases retain verdicts with real computed graph metadata, rather than hand-fed counts', () => {
  const vectors = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/verifier-vectors.json', import.meta.url)));
  for (const row of vectors.cases) {
    const raw = row.state, snapshots = Object.entries(raw.snapshots).map(([epoch, snapshot]) => ({ epoch: Number(epoch), ...snapshot }));
    const nodes = new Set(['u', ...raw.edges.flat(), ...snapshots.flatMap(s => s.anchors)]);
    const view = pathWitnessGraphView(graph([...nodes], raw.edges), { policy: row.context.policy, currentEpoch: raw.currentEpoch, snapshots,
      removed: raw.removed, standing: Object.entries(raw.standings) });
    for (const verify of verifiers) assert.equal(verify(Buffer.from(row.wire), row.context, view).accepted, row.accepted, row.id);
  }
});

test('canonical immutable exports bind storage/history/config; old views remain old captures after source/input mutation', () => {
  const g = graph(['u', 'a', 'b'], [['a', 'u'], ['b', 'u']]), o = options(), view = pathWitnessGraphView(g, o);
  const { root, ...payload } = view.toJSON();
  assert.match(root, /^[0-9a-f]{64}$/);
  assert.equal(createHash('sha256').update('facety-path-view/v1').update(Buffer.from([0])).update(JSON.stringify(payload)).digest('hex'), root);
  const reorder = structuredClone(o); reorder.snapshots[0].anchors.reverse();
  assert.equal(pathWitnessGraphView(g, reorder).view().id, view.view().id);
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.capture) && Object.isFrozen(view.toJSON().source.storage.edges));
  assert.throws(() => view.nodeIds().push('injected'), TypeError);
  assert.throws(() => { view.snapshot(3).difficulty = 1; }, TypeError);
  assert.throws(() => { view.toJSON().live.edges[0][0] = 'injected'; }, TypeError);
  o.snapshots[0].anchors.length = 0; o.removed.push('a'); o.standing.push(['a', 999]);
  assert.equal(view.anchor(3, 'a'), true); assert.equal(view.removed('a'), false); assert.equal(view.standing('a'), null);
  assert.equal(verdicts(view, [['u', 'a'], ['u', 'b']]).accepted, true);
  g.removeEdge('a', 'u');
  const gone = pathWitnessGraphView(g, options());
  assert.notEqual(gone.view().id, view.view().id); assert.equal(gone.edge('a', 'u'), false); assert.equal(view.edge('a', 'u'), true);
  assert.equal(verdicts(gone, [['u', 'a'], ['u', 'b']]).accepted, false);
  g.addEdge('a', 'u'); const returned = pathWitnessGraphView(g, options());
  assert.equal(verdicts(returned, [['u', 'a'], ['u', 'b']]).accepted, true); assert.notEqual(returned.view().id, view.view().id);
});

test('empty/isolated/historically absent anchors, exact Unicode tuple IDs and declared scores have no phantom support', () => {
  const empty = pathWitnessGraphView(graph([]), options(1, [])); assert.equal(empty.degree('u', 'directed-from-anchor', 'any-live-orientation'), 0);
  assert.equal(verdicts(empty, []).accepted, false);
  const o = options(2, ['é', 'y\0é', 'gone']); o.standing = [['x\0y', 0], ['x', null]];
  const c = structuredClone(base); c.subject = '🙂';
  const view = pathWitnessGraphView(graph(['🙂', 'x\0y', 'é', 'x', 'y\0é'], [['x\0y', '🙂'], ['é', 'x\0y'], ['x', '🙂'], ['y\0é', 'x']]), o);
  assert.equal(view.anchor(3, 'gone'), true); assert.equal(view.anchorCount(3, c.subject), 2);
  const futureOptions = options(1, ['é']); futureOptions.snapshots.push({ epoch: 4, difficulty: 1, anchors: ['é'] });
  const future = pathWitnessGraphView(graph(['u', 'é'], [['é', 'u']]), futureOptions);
  assert.equal(future.snapshot(4).difficulty, 1); assert.equal(verdicts(future, [['u', 'é']], base, 4).reason, 'epoch-outside-grace');
  assert.equal(view.standing('x\0y'), 0); assert.equal(view.standing('x'), null); assert.equal(view.standing('missing'), null);
  assert.equal(verdicts(view, [['🙂', 'x\0y', 'é'], ['🙂', 'x', 'y\0é']], c).accepted, true);
});

test('unsupported/malformed/duplicate resource inputs fail explicitly, with no quota or truncated content hash', () => {
  const g = graph(['u', 'a', 'b']);
  for (const mutate of [o => { delete o.removed; }, o => { o.extra = true; }, o => { o.currentEpoch = -0; },
    o => { o.snapshots.push(o.snapshots[0]); }, o => { o.snapshots[0].anchors.push('a'); }, o => { o.removed = ['a', 'a']; },
    o => { o.standing = [['a', 0], ['a', 1]]; }, o => { o.standing = [['a', -1]]; }, o => { o.standing = [new Array(2)]; },
    o => { o.policy.maxIdBytes = 63; }, o => { o.snapshots[0].difficulty = 0; }, o => { o.snapshots[0].anchors = ['\ud800']; },
    o => { o.snapshots = Array.from({ length: 1026 }, (_, epoch) => ({ epoch, difficulty: 1, anchors: [] })); }]) {
    const o = options(); mutate(o); assert.throws(() => pathWitnessGraphView(g, o));
  }
  const huge = graph(Array.from({ length: PATH_VIEW_LIMITS.nodes + 1 }, (_, i) => 'n' + i));
  assert.throws(() => pathWitnessGraphView(huge, options()), /graph bound/);
  assert.throws(() => pathWitnessGraphView(g.toJSON(), options()), /DirectedGraph/);
  assert.ok(Object.isFrozen(PATH_VIEW_LIMITS));
});

test('Native capture consumes consented active records, never proposals, reverse consent, XP/activity or evaluator labels; capture itself is inert', () => {
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }), a = m.proposeGuarantee('a', 'u'), b = m.proposeGuarantee('b', 'u');
  const before = publicState(m), proposed = capturePathWitnessModelView(m, options());
  assert.deepEqual(publicState(m), before); assert.equal(proposed.edge('a', 'u'), false);
  m.confirmGuarantee('u', a); m.confirmGuarantee('u', b);
  const activeBefore = publicState(m), active = capturePathWitnessModelView(m, options());
  assert.deepEqual(publicState(m), activeBefore); assert.equal(active.edge('a', 'u'), true); assert.equal(active.edge('u', 'a'), false);
  assert.equal(m.isActive('b'), false); assert.equal(m.subject('b').xp, 0);
  assert.equal(verdicts(active, [['u', 'a'], ['u', 'b']]).accepted, true);
  assert.equal(active.capture.reference, 'native-active-accepted-reference/v1');
  assert.deepEqual(Object.keys(active.toJSON().source.subjects[0]).sort(), ['id', 'identityStatus']);
});

test('paid Native end and re-proposal/re-add preserve history and change root; public false status filters leftover active adjacency without inventing emergency', () => {
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }), a = guarantee(m, 'a', 'u'); guarantee(m, 'b', 'u');
  const initial = capturePathWitnessModelView(m, options()), source = m.createSelfId('a', m.registerArtifact('a'));
  m.advanceTo(DAY); m.convertToCollector('a', source); const paidBefore = m.audit();
  m.endGuarantee('a', a); assert.equal(m.audit().feeVault, paidBefore.feeVault + 1);
  const ended = capturePathWitnessModelView(m, options()); assert.equal(ended.edge('a', 'u'), false);
  const next = guarantee(m, 'a', 'u'), returned = capturePathWitnessModelView(m, options());
  assert.notEqual(next, a); assert.notEqual(returned.view().id, initial.view().id); assert.equal(returned.edge('a', 'u'), true);
  assert.equal(returned.toJSON().source.relations.find(r => r.id === a).status, 'ended');
  assert.equal(verdicts(returned, [['u', 'a'], ['u', 'b']]).accepted, true);
  m.invalidateIdentity('a'); assert.ok(m.guarantees.edge('a', 'u'));
  assert.equal(m.guaranteeRelations().find(r => r.id === next).status, 'active');
  const invalid = capturePathWitnessModelView(m, options());
  assert.equal(invalid.edge('a', 'u'), false); assert.equal(invalid.anchor(3, 'a'), true); assert.equal(invalid.removed('a'), false);
  assert.equal(invalid.anchorCount(3, 'u'), 1); assert.equal(verdicts(invalid, [['u', 'a'], ['u', 'b']]).accepted, false);
});

test('Native funded vouch expiry/refund leaves the active current-record reference live until explicit free exit', () => {
  const m = new FacetyModel({ genesis: ['a'], policy: { xpFinality: 'maturity', guarantorEligibility: 'accepted' },
    vouching: { K: 1, T: 1, V: 1, B: 1, reference: { eligibility: 'accepted-reference', clockOrigin: 'commitment', funding: 'collector-liquid',
      exitSlot: 'retain-until-V', bondRelease: 'supplied-clearance' } }, vouchAdmission: { c: 1, reference: 'native-guarantees-commitment-reference' } });
  const source = m.createSelfId('a', m.registerArtifact('a')); m.advanceTo(DAY); m.convertToCollector('a', source);
  const vouch = m.commitVouch('a', 'u'); m.admitVouched('u', [vouch]);
  const o = options(1, ['a']); assert.equal(capturePathWitnessModelView(m, o).edge('a', 'u'), true);
  m.advanceTo(2 * DAY); m.releaseVouchBond(vouch, { clearanceId: 'supplied-clear', clear: true });
  const before = publicState(m), expired = capturePathWitnessModelView(m, o);
  assert.deepEqual(publicState(m), before); assert.equal(expired.edge('a', 'u'), true); assert.equal(m.vouchCapacity('a').used, 0);
  assert.equal(verdicts(expired, [['u', 'a']]).accepted, true);
  m.exitVouch('u', vouch); assert.equal(capturePathWitnessModelView(m, o).edge('a', 'u'), false);
});

test('Native direct graph injection/deletion and source mutation during capture fail instead of acquiring canonical authority', () => {
  const injected = new FacetyModel({ genesis: ['u', 'a', 'b'] }); injected.guarantees.addEdge('a', 'u');
  assert.throws(() => capturePathWitnessModelView(injected, options()), /unrecorded/);
  const absent = new FacetyModel({ genesis: ['u', 'a', 'b'] }); guarantee(absent, 'a', 'u'); absent.guarantees.removeEdge('a', 'u');
  assert.throws(() => capturePathWitnessModelView(absent, options()), /disagreement/);
  const node = new FacetyModel({ genesis: ['u', 'a', 'b'] }); node.guarantees.addNode('unowned');
  assert.throws(() => capturePathWitnessModelView(node, options()), /subject disagreement/);
  const changed = new FacetyModel({ genesis: ['u', 'a', 'b'] }), records = changed.guaranteeRelations.bind(changed);
  changed.guaranteeRelations = () => { changed.proposeGuarantee('a', 'u'); return records(); };
  assert.throws(() => capturePathWitnessModelView(changed, options()), /changed during/);
  assert.throws(() => capturePathWitnessModelView({ guarantees: graph(['u']) }, options()), /FacetyModel/);
});
