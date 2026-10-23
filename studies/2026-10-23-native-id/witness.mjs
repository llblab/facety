import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FacetyModel, DAY } from '../../src/model.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';

const baseline = '8391c9e90eba74fb1eed9bec5625192590c10da9';
const cwd = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd });
assert.equal(git('diff', '--name-only', baseline, '--', 'src').toString().trim(), 'src/model.mjs');
const retained = git('ls-tree', '-r', baseline, '--', 'src', 'studies').toString().trim().split('\n').map(line => {
  const [metadata, path] = line.split('\t'); return { hash: metadata.split(' ')[2], path };
}).filter(item => item.path !== 'src/model.mjs');
const hashes = execFileSync('git', ['hash-object', '--no-filters', '--stdin-paths'], { cwd,
  input: retained.map(item => item.path).join('\n') + '\n' }).toString().trim().split('\n');
assert.deepEqual(hashes, retained.map(item => item.hash));
const url = new URL('../../src/model.mjs', import.meta.url);
const source = git('show', baseline + ':src/model.mjs').toString().replace(/from '(\.\/[^']+)'/g,
  (_, relative) => 'from ' + JSON.stringify(new URL(relative, url).href));
const { FacetyModel: OldModel } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const snapshot = model => ({ subjects: model.subjects(), acts: model.selfIds(), invitations: model.invitations(),
  relations: model.guaranteeRelations(), events: model.events(), ledger: model.audit(),
  lineage: model.lineage.toJSON(), guarantees: model.guarantees.toJSON() });
function prefix(Model) {
  const model = new Model({ genesis: ['a', 'b', 'c'] });
  const guarantee = model.proposeGuarantee('b', 'a');
  model.confirmGuarantee('a', guarantee);
  const b = model.createSelfId('b', model.registerArtifact('b'));
  const a = model.createSelfId('a', model.registerArtifact('a', { contentHash: 'existing' }));
  model.advanceTo(DAY);
  model.convertToCollector('a', a);
  model.convertToCollector('b', b);
  model.invalidateIdentity('c');
  return model;
}
function suffix(model) {
  const artifact = model.registerArtifact('a', { contentHash: 'suffix' });
  const selfId = model.createSelfId('a', artifact);
  model.advanceTo(2 * DAY);
  const invitation = model.createInvitation('a', selfId, 'new');
  model.advanceTo(3 * DAY);
  model.acceptInvitation(invitation, 'new');
  return { ids: { artifact, selfId, invitation }, snapshot: snapshot(model) };
}
const cases = [
  ['unknown-publisher', 'missing', { contentHash: 'suffix' }, /unknown subject/],
  ['invalidated-publisher', 'c', { contentHash: 'suffix' }, /not accepted/],
  ['invalid-face-count', 'a', { faceCount: 0, contentHash: 'suffix' }, /faceCount/],
  ['invalid-hash', 'a', { contentHash: '' }, /invalid content hash/],
  ['duplicate-hash', 'a', { contentHash: 'existing' }, /duplicate media/],
  ['explicit-invalid-id-control', 'a', { id: null }, /invalid or duplicate artifact/],
];
function probe(Model, expectRepair) {
  const control = suffix(prefix(Model));
  return cases.map(([name, publisher, options, reason]) => {
    const model = prefix(Model);
    const before = snapshot(model);
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.throws(() => model.registerArtifact(publisher, options), reason);
      assert.deepEqual(snapshot(model), before);
    }
    const after = suffix(model);
    const equal = digestOf(after) === digestOf(control);
    assert.equal(equal, expectRepair || name === 'explicit-invalid-id-control');
    assert.deepEqual(after.snapshot.ledger, control.snapshot.ledger);
    return { name, rejectedCalls: 2, immediateExposedStateEqual: true, laterFullStateAndIdsEqual: equal,
      controlIds: control.ids, actualIds: after.ids, ledgerEqual: true, stateDigest: digestOf(after.snapshot) };
  });
}
function occupancy(Model) {
  const model = new Model();
  model.registerArtifact('root', { id: 'artifact:0' });
  model.registerArtifact('root', { id: 'artifact:1' });
  const before = snapshot(model);
  assert.throws(() => model.registerArtifact('root', { faceCount: 0 }), /faceCount/);
  assert.deepEqual(snapshot(model), before);
  try { return { id: model.registerArtifact('root') }; }
  catch (error) { return { error: { name: error.name, message: error.message } }; }
}
const previous = probe(OldModel, false);
const current = probe(FacetyModel, true);
const occupied = { previous: occupancy(OldModel), current: occupancy(FacetyModel) };
assert.ok(occupied.previous.error);
assert.deepEqual(occupied.current, { id: 'artifact:2' });
console.log(JSON.stringify({ schema: 'facety-native-id-diagnostic/v1', level: 'diagnostic', baseline, provenance: provenance(),
  randomness: { generator: null, decisions: 'supplied-native-inputs-v1' },
  method: 'Funded public-API prefixes and identical successful suffixes after zero or two rejected registrations; old model with unchanged graph dependency, not historical full-scheduler replay.',
  previous, current, occupied,
  preservation: { unchangedOtherSourceModules: retained.filter(item => item.path.startsWith('src/')).length,
    unchangedHistoricalStudyFiles: retained.filter(item => item.path.startsWith('studies/')).length, rawBlobsEqual: true },
  limits: ['Observed defect is ID/event/claim-reference drift, not a demonstrated extra mint or realized economic loss.',
    'Automatic-name collisions deliberately change from rejection/retry to deterministic skipping; explicit duplicate IDs still reject.',
    'Model validation rejection does not erase separately charged scheduler work or authorize rollback of a successful earlier registration.',
    'No general rollback, callback/out-of-band mutation recovery or numeric counter-exhaustion proof; no D33 implementation or mechanism confirmation.'] }, null, 2));
