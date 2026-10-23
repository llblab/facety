import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FacetyModel, DAY } from '../../src/model.mjs';
import { experimentConfig } from '../../src/experiment.mjs';
import { challengeAccess, preflightIdentityVerdict } from '../../src/disputes.mjs';
import { accountabilitySnapshot } from '../../src/accountability.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';

const baseline = 'c95b71e4950fb108184e2eb3817c543abb84ffe6';
const cwd = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd });
assert.equal(git('diff', '--name-only', baseline, '--', 'src', 'test', 'examples', 'bin', 'package.json').toString().trim(), '');
const retained = git('ls-tree', '-r', baseline, '--', 'src', 'studies').toString().trim().split('\n').map(line => {
  const [metadata, path] = line.split('\t'); return { hash: metadata.split(' ')[2], path };
});
const hashes = execFileSync('git', ['hash-object', '--no-filters', '--stdin-paths'], { cwd,
  input: retained.map(item => item.path).join('\n') + '\n' }).toString().trim().split('\n');
assert.deepEqual(hashes, retained.map(item => item.hash));
const state = model => ({ ...accountabilitySnapshot(model), invitations: model.invitations(),
  lineage: model.lineage.toJSON(), guarantees: model.guarantees.toJSON() });
const identify = (model, subject) => model.createSelfId(subject, model.registerArtifact(subject));
function guarantee(model, source) {
  const id = model.proposeGuarantee(source, 'subject');
  model.confirmGuarantee('subject', id);
  return id;
}
function setup() {
  const model = new FacetyModel({ genesis: ['subject', 'old', 'new', 'challenger', 'recipient'] });
  for (const [subject, count] of [['old', 2], ['new', 2], ['challenger', 6]]) for (let i = 0; i < count; i++) {
    const act = identify(model, subject);
    model.advanceTo(model.now + DAY);
    model.convertToCollector(subject, act);
  }
  const relation = guarantee(model, 'old');
  return { model, relation, start: model.now };
}
// Read-only event-prefix reconstruction, not a selected legal event/interval convention.
function rolesBefore(model, eventIndex) {
  const records = new Map(model.guaranteeRelations().map(row => [row.id, row]));
  const active = new Map();
  for (const event of model.events().slice(0, eventIndex)) {
    if (event.type === 'guarantee-activated') active.set(event.relation, records.get(event.relation));
    if (event.type === 'guarantee-ended') active.delete(event.relation);
  }
  return [...active.values()].filter(row => row.guaranteed === 'subject').map(row => row.guarantor).sort();
}
const findEvent = (model, type, id) => model.events().findIndex(row => row.type === type && row.selfId === id);
const prefix = setup();
const common = state(prefix.model);
const rules = experimentConfig({ disputes: { enabled: true, liability: 'guarantors', fineMode: 'chain', rewardShare: 0, excludeLiable: false } }).disputes;
const timelines = ['stay', 'exit', 'switch', 'relink'].map(mode => {
  const { model, relation, start } = setup();
  assert.deepEqual(state(model), common);
  const act = identify(model, 'subject');
  const recorded = findEvent(model, 'self-id-created', act);
  if (mode !== 'stay') { model.advanceTo(start + 1); model.endGuarantee('old', relation); }
  if (mode === 'switch' || mode === 'relink') {
    model.advanceTo(start + 2);
    guarantee(model, mode === 'switch' ? 'new' : 'old');
  }
  model.advanceTo(start + DAY);
  const before = state(model);
  model.convertToCollector('subject', act);
  const after = state(model);
  const terminal = findEvent(model, 'collector-converted', act);
  const plan = preflightIdentityVerdict(model, 'challenger', 'subject', rules);
  assert.deepEqual(state(model), after, 'planning does not enforce a verdict');
  const recordingRoles = rolesBefore(model, recorded);
  const terminalRoles = rolesBefore(model, terminal);
  assert.deepEqual(recordingRoles, ['old']);
  assert.deepEqual(terminalRoles, mode === 'switch' ? ['new'] : mode === 'exit' ? [] : ['old']);
  assert.deepEqual([...model.selfId(act).guarantors], ['old']);
  assert.deepEqual(plan.liable, ['subject', ...terminalRoles]);
  const xpDelta = Object.fromEntries(after.subjects.map(s => [s.id, s.xp - before.subjects.find(old => old.id === s.id).xp]));
  assert.equal(xpDelta.old, mode === 'stay' || mode === 'relink' ? 1 : 0);
  assert.equal(xpDelta.new, 0);
  return { mode, act: model.selfId(act), recordingEvent: recorded, terminalEvent: terminal,
    recordingRolesFromJournal: recordingRoles, terminalRolesFromJournal: terminalRoles,
    nativeTerminalXpDelta: xpDelta, legacyUnenforcedPlan: plan, relationHistory: model.guaranteeRelations(),
    nativeLinkBreakFeesSincePrefix: after.ledger.feeVault - common.ledger.feeVault,
    suffixEvents: after.events.slice(common.events.length), fullStateDigest: digestOf(after) };
});
const equalHour = ['record-then-exit', 'exit-then-record'].map(order => {
  const { model, relation } = setup();
  assert.deepEqual(state(model), common);
  if (order === 'exit-then-record') model.endGuarantee('old', relation);
  const act = identify(model, 'subject');
  if (order === 'record-then-exit') model.endGuarantee('old', relation);
  const index = findEvent(model, 'self-id-created', act);
  const record = model.guaranteeRelations()[0];
  assert.equal(record.activatedAt, model.selfId(act).recordedAt);
  assert.equal(record.endedAt, model.selfId(act).recordedAt);
  const roles = rolesBefore(model, index);
  assert.deepEqual(roles, order === 'record-then-exit' ? ['old'] : []);
  return { order, relationHistory: record, act: model.selfId(act), recordingEvent: index,
    rolesFromOrderedJournal: roles, suffixEvents: model.events().slice(common.events.length), stateDigest: digestOf(state(model)) };
});
const funding = ['unspent', 'converted-retained', 'transferred', 'invitation-consumed', 'debt-repaid'].map(disposition => {
  const { model, start } = setup();
  assert.deepEqual(state(model), common);
  if (disposition === 'debt-repaid') model.penalize('subject', { fine: 1, halveXp: false });
  const priorDebt = model.subject('subject').debt;
  const act = identify(model, 'subject');
  model.advanceTo(start + DAY);
  if (['converted-retained', 'transferred'].includes(disposition)) model.convertToCollector('subject', act);
  if (disposition === 'transferred') model.transferFacy('subject', 'recipient', 1);
  if (disposition === 'invitation-consumed') {
    const invite = model.createInvitation('subject', act, 'child');
    model.advanceTo(start + 2 * DAY);
    model.acceptInvitation(invite, 'child');
  }
  const before = state(model);
  const access = challengeAccess(model, 'subject', 'subject', rules.stake);
  assert.equal(access.reason, 'challenge XP gate');
  assert.throws(() => model.cancelSelfId('subject', act), /no cancellation authority/);
  assert.deepEqual(state(model), before, 'probed own routes do not implement self-correction');
  let veto;
  try { model.cancelSelfId('old', act); veto = { allowed: true }; }
  catch (error) { veto = { allowed: false, error: { name: error.name, message: error.message } }; }
  assert.equal(veto.allowed, disposition === 'unspent');
  if (!veto.allowed) assert.deepEqual(state(model), before);
  const after = state(model);
  const facts = { disposition, actBefore: before.acts.find(a => a.id === act), priorSubjectDebt: priorDebt,
    ledgerBefore: before.ledger, subjectBefore: before.subjects.find(s => s.id === 'subject'),
    recipientBefore: before.subjects.find(s => s.id === 'recipient'),
    xpSincePrefix: Object.fromEntries(before.subjects.map(s => [s.id, s.xp - (common.subjects.find(old => old.id === s.id)?.xp ?? 0)])),
    invitationsBefore: before.invitations, ordinarySelfChallenge: access, existingGuarantorVeto: veto,
    vetoLedgerDelta: Object.fromEntries(Object.keys(after.ledger).map(k => [k, after.ledger[k] - before.ledger[k]])),
    suffixEvents: before.events.slice(common.events.length), stateDigestBefore: digestOf(before), stateDigestAfterVetoProbe: digestOf(after) };
  if (disposition === 'transferred') { assert.equal(facts.subjectBefore.liquidFacy, 0); assert.equal(facts.recipientBefore.liquidFacy, 1); }
  if (disposition === 'debt-repaid') { assert.equal(priorDebt, 1); assert.equal(facts.subjectBefore.debt, 0); assert.equal(before.ledger.burned, 1); }
  if (disposition === 'invitation-consumed') { assert.equal(before.ledger.burned, 1); assert.equal(before.invitations[0].status, 'accepted'); }
  return facts;
});
console.log(JSON.stringify({ schema: 'facety-d34-preparation/v1', level: 'diagnostic', baseline, provenance: provenance(),
  randomness: { generator: null, decisions: 'supplied-native-inputs-v1' },
  method: 'Eleven funded public-API worlds sharing one identical prefix; no hidden truth, graph override, historical-liability enforcement or self-correction implementation.',
  policy: prefix.model.policy, legacyPlanRules: rules, commonPrefix: common, timelines, equalHour, funding,
  preservation: { sourceModules: retained.filter(r => r.path.startsWith('src/')).length,
    historicalStudyFiles: retained.filter(r => r.path.startsWith('studies/')).length, rawBlobsEqual: true },
  unresolved: ['Choose the legal event/operation, canonical ordering and historical duty/qualification; timestamps alone do not recover same-hour order.',
    'Specify relation-epoch meaning across exit/re-link and distinguish recorded potential XP recipients, actual credits and liable parties.',
    'Define penalty-event identity and overlap across cases; no deduplication policy is selected.',
    'Define early self-correction eligibility, deadlines and a self-facing route distinct from the ordinary greater-XP challenge.',
    'Name actual recovery for converted/transferred value, already-burned invitations and debt repayment; define dependent admissions and debt restoration without double burn or silent amnesty.'],
  limits: ['Journal replay is a read-only diagnostic projection, not selected D34 verification, adjudication or a new protocol-state field.',
    'Legacy plan membership follows current links; recording-versus-terminal roles are candidate bases, not a selected legal-event convention.',
    'No timing choice here defines the early-reporting deadline; the existing guarantor veto is not self-dispute.',
    'Balances are aggregate fungible holdings, not proof of a particular coin identity; no recovery is assumed from the third-party recipient.',
    'No runtime/test change, mechanism confirmation, calibrated incentives, uniqueness or sustainable-distribution claim.'] }, null, 2));
