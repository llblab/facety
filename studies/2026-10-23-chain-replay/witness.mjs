import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FacetyModel, DAY } from '../../src/model.mjs';
import { experimentConfig } from '../../src/experiment.mjs';
import { challengeAccess, enforceIdentityVerdict } from '../../src/disputes.mjs';
import { EvidenceRelay, accountabilitySnapshot } from '../../src/accountability.mjs';
import { causalWorld } from '../../examples/causal-walkthroughs.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';

const baseline = '5f85bff5d46b1dafbcd756f935793e7c8c439fba';
const cwd = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd });
assert.equal(git('diff', '--name-only', baseline, '--', 'src').toString().trim(), '');
const retained = git('ls-tree', '-r', baseline, '--', 'src', 'studies').toString().trim().split('\n').map(line => {
  const [metadata, path] = line.split('\t'); return { hash: metadata.split(' ')[2], path };
});
const hashes = execFileSync('git', ['hash-object', '--no-filters', '--stdin-paths'], { cwd,
  input: retained.map(item => item.path).join('\n') + '\n' }).toString().trim().split('\n');
assert.deepEqual(hashes, retained.map(item => item.hash));
const identify = (model, subject) => model.createSelfId(subject, model.registerArtifact(subject));
function world() {
  const model = new FacetyModel({ genesis: ['subject', 'guarantor', 'challenger'], policy: { guarantorEligibility: 'accepted' } });
  const relation = model.proposeGuarantee('guarantor', 'subject');
  model.confirmGuarantee('subject', relation);
  return model;
}
function fund(model, subject, count) {
  for (let i = 0; i < count; i++) {
    const act = identify(model, subject);
    model.advanceTo(model.now + DAY);
    model.convertToCollector(subject, act);
  }
}
const rawCuts = ['unspent', 'converted', 'invitation'].map(disposition => {
  const model = world();
  const act = identify(model, 'subject');
  model.advanceTo(DAY);
  if (disposition === 'converted') model.convertToCollector('subject', act);
  if (disposition === 'invitation') model.createInvitation('subject', act, 'new');
  const first = model.voidSelfIdChain('subject');
  const before = accountabilitySnapshot(model);
  const second = model.voidSelfIdChain('subject');
  const after = accountabilitySnapshot(model);
  assert.deepEqual(after.ledger, before.ledger);
  assert.deepEqual(after.subjects, before.subjects);
  assert.equal(second.burnedRights, 0);
  assert.equal(after.events.length, before.events.length + 1);
  assert.deepEqual(second.xpRecipients, []);
  return { disposition, first, second, repeatedCutLedgerAndSubjectsEqual: true,
    fullSnapshotEqual: digestOf(before) === digestOf(after), beforeDisposition: before.acts[0].disposition,
    afterDisposition: after.acts[0].disposition, repeatedNativeEvents: after.events.slice(before.events.length) };
});
const overlapModel = world();
fund(overlapModel, 'subject', 2);
const fromAct = overlapModel.selfIds()[1].id;
const firstOverlap = overlapModel.voidSelfIdChain('subject', { fromAct });
const later = identify(overlapModel, 'subject');
const overlap = overlapModel.voidSelfIdChain('subject', { fromAct });
assert.equal(overlap.burnedRights, 1);
assert.equal(overlapModel.selfId(later).disposition, 'adjudicated-void');
const overlapControl = { first: firstOverlap, repeatedWithNewSuffix: overlap, laterAct: later,
  interpretation: 'A repeated fromAct can reach newly appended rights; a blanket subject-level dedup would suppress new effects.' };
const direct = world();
fund(direct, 'guarantor', 10);
fund(direct, 'challenger', 4);
fund(direct, 'subject', 2);
identify(direct, 'subject');
const rules = experimentConfig({ disputes: { enabled: true, fineMode: 'chain', liability: 'guarantors', rewardShare: 0.5, excludeLiable: false } }).disputes;
const firstVerdict = enforceIdentityVerdict(direct, 'challenger', 'subject', rules);
const beforeRepeat = accountabilitySnapshot(direct);
const newChallenge = challengeAccess(direct, 'challenger', 'subject', rules.stake);
assert.equal(newChallenge.reason, 'challenge target is not accepted');
const secondVerdict = enforceIdentityVerdict(direct, 'challenger', 'subject', rules);
const afterRepeat = accountabilitySnapshot(direct);
assert.equal(secondVerdict.voidedActs, 2);
assert.equal(secondVerdict.transferred, 1);
assert.equal(secondVerdict.burned, 1);
assert.equal(secondVerdict.debtAdded, 0);
const beforeGuarantor = beforeRepeat.subjects.find(s => s.id === 'guarantor');
const afterGuarantor = afterRepeat.subjects.find(s => s.id === 'guarantor');
assert.equal(beforeGuarantor.liquidFacy - afterGuarantor.liquidFacy, 2);
assert.equal(beforeGuarantor.xp, 5);
assert.equal(afterGuarantor.xp, 2);
const guarded = [];
for (const stakeBacking of ['unsecured', 'reserved']) for (const upheld of [false, true]) {
  const { model, acts } = causalWorld();
  const relayRules = experimentConfig({ disputes: { enabled: true, stakeBacking } }).disputes;
  const relay = new EvidenceRelay(model, { rules: relayRules, traceLimit: 100, actors: [
    { id: 'Outside', subject: null, budget: 12, reviewCapacity: 0 },
    { id: 'Bela', subject: 'Bela', budget: 12, reviewCapacity: 2 },
  ] });
  const observation = relay.observe('Outside', acts.Mira, { suspicious: true, sourceGroup: 'media' }).value;
  const pkg = relay.package('Outside', [observation]).value;
  relay.route('Outside', pkg, 'Bela');
  relay.review('Bela', pkg, { suspicious: true, sourceGroup: 'independent-check' });
  const caseId = relay.sponsor('Bela', pkg).value;
  assert.ok(relay.resolve(caseId, upheld).ok);
  const native = accountabilitySnapshot(model);
  const workflow = relay.snapshot();
  for (const repeated of [upheld, !upheld]) {
    assert.equal(relay.resolve(caseId, repeated).reason, 'case-already-resolved');
    assert.deepEqual(accountabilitySnapshot(model), native);
    assert.deepEqual(relay.snapshot(), workflow);
  }
  guarded.push({ stakeBacking, upheld, caseId, repeatedAndReversedVerdictsBlocked: true,
    nativeAndWorkflowUnchanged: true, nativeDigest: digestOf(native), workflowDigest: digestOf(workflow) });
}
console.log(JSON.stringify({ schema: 'facety-chain-replay-diagnostic/v1', level: 'diagnostic', baseline, provenance: provenance(),
  randomness: { generator: null, decisions: 'supplied-native-inputs-v1' },
  assumptions: ['Funded synthetic public-API prefixes, supplied adjudication outcomes, no evaluator labels in protocol decisions.',
    'Raw cut/low-level helper worlds explicitly use the accepted-guarantor reference; guarded relay worlds use their existing native walkthrough prefix.',
    'Calling enforceIdentityVerdict twice bypasses case ownership; it is NOT a replay achieved through the relay or scheduler.'],
  rawCuts, overlap: overlapControl,
  bareHelper: { firstVerdict, secondVerdict, guardedNewChallenge: newChallenge,
    before: { ledger: beforeRepeat.ledger, subjects: beforeRepeat.subjects, acts: beforeRepeat.acts },
    after: { ledger: afterRepeat.ledger, subjects: afterRepeat.subjects, acts: afterRepeat.acts },
    additionalEvents: afterRepeat.events.slice(beforeRepeat.events.length), classification: 'Explicit repeated adjudication input without a caseId contract; not an established guarded-caller exploit.' },
  guardedCases: guarded,
  preservation: { sourceModules: retained.filter(r => r.path.startsWith('src/')).length,
    historicalStudyFiles: retained.filter(r => r.path.startsWith('studies/')).length, rawBlobsEqual: true },
  gate: { classification: 'owner-gated', ruleNotSelected: 'Deduplication identity and scope across separate verdicts, overlapping cuts and guarantor duties.',
    smallestQuestion: 'May a separately admitted case impose a new penalty on a guarantor for already voided acts, or only for newly adjudicated acts/duties?',
    noAutomaticContinuation: true },
  limits: ['No runtime implementation change or new enforcement policy.', 'Raw economic/XP repeat safety does not mean full-state idempotence: events and +voided metadata change.',
    'Native/refund/book tests and inspected caller guards do not prove every future or out-of-band path.',
    'No real attack probability, private utility, contribution, uniqueness or sustainable-distribution conclusion.'] }, null, 2));
