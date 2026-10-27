import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FacetyModel, DAY } from '../src/model.mjs';
import { capturePathWitnessModelView, isPathWitnessView, pathWitnessGraphView } from '../src/path-witness-view.mjs';
import { DirectedGraph } from '../src/graph.mjs';
import { replayPathWitnessEvents, captureReplayedPathWitnessModelView, comparePathWitnessModelVersion,
  PATH_REPLAY_EVENT_TYPES, PATH_REPLAY_LIMITS } from '../src/path-witness-replay.mjs';
import { findPathWitness } from '../src/path-witness-oracle.mjs';
import { verifyPathWitness } from '../src/path-witness.mjs';
import { verifyPathWitnessRef2 } from '../src/path-witness-ref2.mjs';
const base = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url))).context;
const options = () => ({ policy: structuredClone(base.policy), currentEpoch: 3, snapshots: [{ epoch: 3, difficulty: 2, anchors: ['a', 'b'] }], removed: [], standing: [] });
const limits = { maxEvents: 1000 }, pure = (events, atHour = 0) => replayPathWitnessEvents(events, { atHour, maxEvents: 1000, maxIdBytes: 64 });
function state(m) { return JSON.stringify([m.now, m.subjects(), m.selfIds(), m.guaranteeRelations(), m.events(), m.guarantees.toJSON(), m.lineage.toJSON(), m.audit()]); }
function activate(m, a, b) { const id = m.proposeGuarantee(a, b); m.confirmGuarantee(b, id); return id; }
function permutations(values) { if (!values.length) return [[]]; return values.flatMap((v, i) => permutations(values.filter((_, j) => j !== i)).map(rest => [v, ...rest])); }
function audit(m, o = options()) {
  const before = state(m), result = captureReplayedPathWitnessModelView(m, o, limits);
  assert.equal(state(m), before); assert.equal(isPathWitnessView(result.view), true); assert.equal(isPathWitnessView(result.replay), false);
  assert.equal(result.view.view().id, capturePathWitnessModelView(m, o).view().id);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.replay.storage.edges) && Object.isFrozen(result.version));
  return result;
}

test('all current literal Native event types are explicitly classified; unknown future liveness events cannot silently pass', () => {
  const source = readFileSync(new URL('../src/model.mjs', import.meta.url), 'utf8');
  const actual = [...new Set([...source.matchAll(/#event\('([^']+)'/g)].map(m => m[1]))].sort();
  assert.deepEqual(PATH_REPLAY_EVENT_TYPES, actual); assert.ok(Object.isFrozen(PATH_REPLAY_EVENT_TYPES));
  assert.throws(() => pure([{ at: 0, type: 'guarantee-slashed', relation: 'r' }]), /unknown/);
});

test('D77 activity lifecycle replays as passive graph history, not authority or a bound participation roster', () => {
  const model = new FacetyModel({ genesis: ['u', 'a', 'b'] }), before = audit(model);
  model.beginDisputeParticipation('case', ['u', 'a']);
  const during = audit(model), forged = model.events().map(row => row.type === 'dispute-participation-started' ? { ...row, subjects: ['u', 'b'] } : row);
  assert.deepEqual(during.replay.storage, before.replay.storage);
  assert.deepEqual(during.replay.subjects, before.replay.subjects);
  assert.notEqual(during.version.journalDigest, before.version.journalDigest);
  assert.equal(pure(forged).journalDigest, during.version.journalDigest, 'passive payload omission is not a roster binding or hash collision');
  model.endDisputeParticipation('case');
  const after = audit(model);
  assert.deepEqual(after.replay.storage, before.replay.storage); assert.deepEqual(after.replay.subjects, before.replay.subjects);
  assert.equal(after.replay.eventCount, before.replay.eventCount + 2);
});

test('D77 later-party event stays passive graph evidence, never an authenticated activity roster', () => {
  const model = new FacetyModel({ genesis: ['u', 'a', 'b'] });
  model.beginDisputeParticipation('case', ['u', 'a']); model.addDisputeParticipant('case', 'b');
  const result = audit(model), forged = model.events().map(row => row.type === 'dispute-participant-joined' ? { ...row, subject: 'unbound-payload' } : row);
  assert.equal(pure(forged).journalDigest, result.version.journalDigest);
  assert.deepEqual(model.disputeParticipations()[0].subjects, ['u', 'a', 'b']);
  model.endDisputeParticipation('case'); audit(model);
});

test('24 same-hour committed operation orderings/336 checkpoints replay graph counters, relation history and public status exactly without mutation', () => {
  const orders = permutations(['Ap', 'Ac', 'Bp', 'Bc']).filter(v => v.indexOf('Ap') < v.indexOf('Ac') && v.indexOf('Bp') < v.indexOf('Bc'));
  assert.equal(orders.length, 6); let scripts = 0, checkpoints = 0;
  for (const order of orders) for (const ends of [['a', 'b'], ['b', 'a']]) for (const adds of [['a', 'b'], ['b', 'a']]) {
    const m = new FacetyModel({ genesis: ['u', 'a', 'b'], policy: { xpFinality: 'maturity', guarantorEligibility: 'accepted' } });
    const sources = ['a', 'b'].map(a => [a, m.createSelfId(a, m.registerArtifact(a))]);
    m.advanceTo(DAY); for (const [a, source] of sources) m.convertToCollector(a, source);
    const ids = {}, inspect = () => { const result = audit(m); checkpoints++; return result; };
    inspect();
    for (const op of order) { const actor = op[0].toLowerCase(); if (op[1] === 'p') ids[actor] = m.proposeGuarantee(actor, 'u'); else m.confirmGuarantee('u', ids[actor]); inspect(); }
    for (const a of ends) { m.endGuarantee(a, ids[a]); inspect(); }
    for (const a of adds) { ids[a] = m.proposeGuarantee(a, 'u'); inspect(); m.confirmGuarantee('u', ids[a]); inspect(); }
    m.invalidateIdentity('a'); inspect(); m.invalidateIdentity('a'); inspect(); m.advanceTo(DAY + 1);
    const result = inspect(); assert.equal(result.replay.relations.filter(r => r.status === 'ended').length, 2);
    assert.ok(m.guarantees.edge('a', 'u')); assert.equal(result.view.edge('a', 'u'), false); scripts++;
  }
  assert.equal(scripts, 24); assert.equal(checkpoints, 336);
});

test('funded vouch activation joins only the earlier commitment, never future final records; internal journal prefix is not a transaction boundary', () => {
  const m = new FacetyModel({ genesis: ['a'], policy: { xpFinality: 'maturity', guarantorEligibility: 'accepted' },
    vouching: { K: 1, T: 1, V: 1, B: 1, reference: { eligibility: 'accepted-reference', clockOrigin: 'commitment', funding: 'collector-liquid',
      exitSlot: 'retain-until-V', bondRelease: 'supplied-clearance' } }, vouchAdmission: { c: 1, reference: 'native-guarantees-commitment-reference' } });
  const o = options(); o.snapshots[0] = { epoch: 3, difficulty: 1, anchors: ['a'] };
  const source = m.createSelfId('a', m.registerArtifact('a')); m.advanceTo(DAY); m.convertToCollector('a', source);
  const vouch = m.commitVouch('a', 'u'), committed = audit(m, o);
  assert.equal(committed.replay.relations.length, 0); assert.equal(committed.replay.storage.nodes.includes('u'), false);
  m.advanceTo(DAY + 1); m.admitVouched('u', [vouch]); const admitted = audit(m, o), events = m.events();
  assert.equal(events.some(e => e.type === 'guarantee-proposed'), false);
  assert.equal(admitted.replay.relations[0].proposedAt, DAY); assert.equal(admitted.replay.relations[0].activatedAt, DAY + 1);
  const activation = events.findIndex(e => e.type === 'guarantee-activated');
  assert.equal(pure(events.slice(0, activation), m.now).storage.edges.length, 0);
  assert.equal(pure(events.slice(0, activation + 1), m.now).storage.edges.length, 1);
  assert.equal(isPathWitnessView(pure(events.slice(0, activation + 1), m.now)), false);
  m.advanceTo(2 * DAY); m.releaseVouchBond(vouch, { clearanceId: 'explicit-clear', clear: true }); assert.equal(audit(m, o).view.edge('a', 'u'), true);
  m.exitVouch('u', vouch); assert.equal(audit(m, o).view.edge('a', 'u'), false);
});

test('funded invitation acceptance adds a subject, not a reverse/guarantee edge; lineage is not replayed as trust', () => {
  const m = new FacetyModel({ genesis: ['creator', 'support'], policy: { xpFinality: 'maturity', guarantorEligibility: 'accepted' }, invitationLimit: { P: 1, b: 1 } });
  activate(m, 'support', 'creator');
  const source = m.createSelfId('creator', m.registerArtifact('creator')); m.advanceTo(DAY);
  const invitation = m.createInvitation('creator', [source], 'new'); m.advanceTo(2 * DAY); m.acceptInvitation(invitation, 'new');
  const result = audit(m); assert.ok(result.replay.storage.nodes.includes('new'));
  assert.ok(m.lineage.edge('creator', 'new')); assert.equal(result.view.edge('creator', 'new'), false);
});

test('fresh version equality is conservative: key/passive and clock changes stale a capture while old vertex proof may still pass fresh view', () => {
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); activate(m, 'a', 'u'); activate(m, 'b', 'u');
  const o = options(), original = audit(m, o), q = { epoch: 3, maxExpansions: 100, maxPaths: 100, maxPackingSteps: 100 };
  const proof = findPathWitness(original.view, base, q); assert.equal(proof.status, 'found');
  assert.equal(comparePathWitnessModelVersion(m, original.view, o, limits).matches, true);
  m.rotateKey('a', 'new-public-key'); const keyed = audit(m, o);
  assert.equal(comparePathWitnessModelVersion(m, original.view, o, limits).matches, false);
  for (const verify of [verifyPathWitness, verifyPathWitnessRef2]) assert.equal(verify(Buffer.from(proof.wire), base, keyed.view).accepted, true);
  m.advanceTo(1); const clocked = audit(m, o);
  assert.equal(clocked.replay.journalDigest, keyed.replay.journalDigest); assert.equal(comparePathWitnessModelVersion(m, keyed.view, o, limits).matches, false);
  const removal = { ...o, removed: ['a'] }; assert.equal(comparePathWitnessModelVersion(m, clocked.view, removal, limits).matches, false);
  assert.equal(Object.hasOwn(comparePathWitnessModelVersion(m, clocked.view, o, limits), 'authorized'), false);
});

const tape = [
  { at: 0, type: 'subject-added', subject: 'u', genesis: true }, { at: 0, type: 'subject-added', subject: 'a', genesis: true },
  { at: 0, type: 'guarantee-proposed', relation: 'r', guarantor: 'a', guaranteed: 'u' },
  { at: 0, type: 'guarantee-activated', relation: 'r' }, { at: 1, type: 'guarantee-ended', relation: 'r', actor: 'u' },
  { at: 1, type: 'guarantee-proposed', relation: 's', guarantor: 'a', guaranteed: 'u' },
  { at: 1, type: 'guarantee-activated', relation: 's' }, { at: 1, type: 'identity-invalidated', subject: 'a' },
];
test('malformed/dropped/duplicate/reordered structural history and hard resource overflow throw, not partial/current or clean-negative results', () => {
  const full = pure(tape, 1); assert.equal(full.storage.nextEdge, 2); assert.equal(full.storage.revision, 5);
  const exact = replayPathWitnessEvents(tape, { atHour: 1, maxEvents: tape.length, maxIdBytes: 64 }); assert.deepEqual(exact, full);
  assert.throws(() => replayPathWitnessEvents(tape, { atHour: 1, maxEvents: tape.length - 1, maxIdBytes: 64 }), /exceeds/);
  const variants = [tape.filter((_, i) => i !== 2), [...tape, tape[6]], [tape[0], tape[1], tape[3], tape[2]],
    [{ ...tape[0], at: -1 }], [{ ...tape[0], subject: '\ud800' }], [tape[0], tape[0]], [{ ...tape[0], type: 'unknown' }],
    [tape[0], tape[1], { ...tape[2], guaranteed: 'missing' }], [...tape.slice(0, 4), { ...tape[4], actor: 'missing' }],
    [tape[0], tape[1], { at: 0, type: 'guarantee-activated', relation: 'v', vouch: 'missing' }], new Array(1)];
  for (const events of variants) assert.throws(() => pure(events, 1));
  assert.throws(() => pure(tape, 0));
  assert.throws(() => replayPathWitnessEvents([], { atHour: 0, maxEvents: PATH_REPLAY_LIMITS.maxEvents + 1, maxIdBytes: 64 }));
  assert.throws(() => replayPathWitnessEvents([], { atHour: 0, maxEvents: 0, maxIdBytes: 257 }));
  assert.equal(replayPathWitnessEvents([], { atHour: 0, maxEvents: 0, maxIdBytes: 1 }).eventCount, 0);
});

test('Native audit rejects a valid-but-stale feed and observed source mutation; copied/non-Native views cannot pass version comparison', () => {
  const m = new FacetyModel({ genesis: ['u', 'a', 'b'] }); activate(m, 'a', 'u'); m.invalidateIdentity('a');
  const events = m.events(); m.events = () => events.slice(0, -1);
  assert.throws(() => captureReplayedPathWitnessModelView(m, options(), limits), /journal disagrees/);
  const changed = new FacetyModel({ genesis: ['u', 'a', 'b'] }), original = changed.events.bind(changed); let reads = 0;
  changed.events = () => { const result = original(); if (++reads === 3) changed.rotateKey('a', 'during-audit'); return result; };
  assert.throws(() => captureReplayedPathWitnessModelView(changed, options(), limits), /changed/);
  const normal = new FacetyModel({ genesis: ['u', 'a', 'b'] }), view = audit(normal).view;
  assert.throws(() => comparePathWitnessModelVersion(normal, { ...view }, options(), limits), /Native capture/);
  const graph = new DirectedGraph('supplied'); graph.addNode('u');
  assert.throws(() => comparePathWitnessModelVersion(normal, pathWitnessGraphView(graph, options()), options(), limits), /Native capture/);
});

test('scoped journal digest is not a full economic/key ledger hash; passive payloads are not execution authority', () => {
  const first = pure([...tape, { at: 1, type: 'facy-transferred', from: 'a', to: 'u', amount: 1, memo: 'one' }], 1);
  const second = pure([...tape, { at: 1, type: 'facy-transferred', from: 'different', to: 'other', amount: 999, memo: 'two' }], 1);
  assert.deepEqual(first, second);
  assert.throws(() => { first.subjects[0].identityStatus = 'accepted'; }, TypeError);
  assert.throws(() => { first.storage.edges.push({}); }, TypeError);
  assert.ok(Object.isFrozen(PATH_REPLAY_LIMITS));
});

test('same-hour order/scalar Unicode IDs are deterministic, pure replay has no final-row lookahead or random stream', () => {
  const events = [
    { at: 0, type: 'subject-added', subject: '🙂', genesis: true }, { at: 0, type: 'subject-added', subject: 'a\0b', genesis: true },
    { at: 0, type: 'guarantee-proposed', relation: 'é', guarantor: 'a\0b', guaranteed: '🙂' }, { at: 0, type: 'guarantee-activated', relation: 'é' },
  ];
  const before = JSON.stringify(events), a = pure(events); assert.equal(JSON.stringify(events), before); assert.deepEqual(pure(events), a);
  assert.equal(pure(events.slice(0, 3)).storage.edges.length, 0); assert.equal(a.storage.edges.length, 1);
  const source = readFileSync(new URL('../src/path-witness-replay.mjs', import.meta.url), 'utf8'); assert.doesNotMatch(source, /Math\.random|randomBytes/);
});
