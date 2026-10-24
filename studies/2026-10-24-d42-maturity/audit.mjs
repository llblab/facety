// Owns: Offline arithmetic replay of the retained D42 boundary packet, not execution or selection of protocol rules.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const INPUT_SHA = '706d8d78ebcd670be74ab0cfab2d539ee2c90639564af420e40851cb79fd8a41';
const RUNNER_SHA = '92445d17f5502035c9876b01e091eda34c8536735c0d6603c879c4ea8e299cc7';
const SOURCE_SHA = 'db930fbc29f6d18c4ddfd32897668cd2d3acd1a07f07cda674e1cb7bc3e09fc4';
const CASES = ['idle-veto-24', 'withdraw-24', 'invite-cancel-25', 'debt-24', 'locked-debt-48', 'guarantor-switch-23', 'late-credit-after-halving'];
const POLICY = {
  xpFinality: 'terminal', cancellationAuthority: 'snapshot', guarantorEligibility: 'active', guaranteeFee: 0,
  councilSize: 101, debtRecovery: 'reserve-until-mature', councilEligibility: 'active', invitationFreezeHours: 24,
  linkBreakXp: 'revoke', spendMaturityHours: 24, conversionMaturityHours: 24, artifactReuse: 'registration-only',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { assert.ok(Number.isFinite(value)); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
function auditCase(record) {
  const accounts = new Map();
  const acts = new Map();
  const artifacts = new Map();
  const relations = new Map();
  const edges = new Map();
  const invitations = new Map();
  const activeCredits = new Set();
  const targetMetadata = record.checkpoints[0].target;
  const metadata = new Map([...record.prefixActs, targetMetadata].map(act => [act.id, act]));
  assert.equal(metadata.size, record.prefixActs.length + 1);
  assert.equal(record.target, targetMetadata.id);
  assert.equal(record.originHour, targetMetadata.recordedAt);
  const relationMetadata = new Map(record.finalRelations.map(row => [row.id, row]));
  const invitationMetadata = new Map(record.checkpoints.flatMap(point => point.invitations).map(row => [row.id, row]));
  let sequence = 0;
  let revision = 0;
  let edgeSequence = 0;
  let minted = 0;
  let burned = 0;
  let vault = 0;
  let fees = 0;
  let cursor = 0;
  let previousHour = -1;
  const points = [];
  const allocate = (prefix, id) => assert.equal(id, prefix + ':' + sequence++, 'closed-fixture allocation order');
  const person = id => { assert.ok(accounts.has(id), 'known account'); return accounts.get(id); };
  const edgeKey = (from, to) => JSON.stringify([from, to]);
  const active = (id, at) => [...acts.values()].some(act => act.subject === id && act.status !== 'cancelled' && at - act.recordedAt < 28 * 24);
  const guarantors = (id, at) => [...edges.values()].filter(edge => edge.to === id && active(edge.from, at)).map(edge => edge.from);
  // Exact alternative to replaying the native private XP ledger: scale credits by halving index, then divide once.
  function xp(account) {
    const scaled = account.credits.filter(row => activeCredits.has(row.source)).reduce((sum, row) => sum + (1n << BigInt(row.halvingIndex)), 0n);
    const result = Number(scaled / (1n << BigInt(account.halvings)));
    assert.ok(Number.isSafeInteger(result) && result >= 0);
    return result;
  }
  function credit(act) {
    if (act.xpCredited) return;
    act.xpCredited = true;
    activeCredits.add(act.id);
    for (const id of act.xpRecipients) {
      if (id !== act.subject && !edges.has(edgeKey(id, act.subject))) continue;
      const account = person(id);
      account.credits.push({ source: act.id, halvingIndex: account.halvings });
    }
  }
  function consume(act, status, disposition) {
    assert.equal(act.status, 'unspent');
    assert.equal(act.disputeLock, null);
    act.status = status;
    act.disposition = disposition;
    act.debtReserved = false;
    vault--;
    if (status === 'converted') person(act.subject).liquidFacy++;
    else burned++;
    if (status === 'cancelled') activeCredits.delete(act.id);
    else credit(act);
  }
  function event(row) {
    assert.ok(Number.isSafeInteger(row.at) && row.at >= 0 && row.at >= previousHour);
    previousHour = row.at;
    if (row.type === 'subject-added') {
      assert.equal(row.genesis, true);
      assert.equal(accounts.has(row.subject), false);
      accounts.set(row.subject, { id: row.subject, liquidFacy: 0, debt: 0, halvings: 0, credits: [] });
      revision++;
    } else if (row.type === 'artifact-registered') {
      allocate('artifact', row.artifact);
      person(row.publisher);
      artifacts.set(row.artifact, { publisher: row.publisher, at: row.at });
    } else if (row.type === 'self-id-created') {
      allocate('self-id', row.selfId);
      const meta = metadata.get(row.selfId);
      assert.ok(meta, 'act metadata exists');
      assert.equal(meta.subject, row.subject);
      assert.equal(meta.recordedAt, row.at);
      assert.equal(meta.faceIndex, 0);
      assert.equal(row.collision, false);
      assert.equal(artifacts.get(meta.artifact)?.publisher, row.subject, 'closed fixture publishes its own media');
      assert.ok(row.at - artifacts.get(meta.artifact).at <= 24);
      const qualified = guarantors(row.subject, row.at);
      assert.deepEqual(meta.guarantors, qualified);
      assert.deepEqual(meta.xpRecipients, [row.subject, ...qualified]);
      const account = person(row.subject);
      const reserved = [...acts.values()].filter(act => act.subject === row.subject && act.debtReserved).length;
      acts.set(row.selfId, {
        id: row.selfId, subject: row.subject, artifact: meta.artifact, faceIndex: 0, recordedAt: row.at,
        guarantors: qualified, xpRecipients: [row.subject, ...qualified], xpCredited: false,
        status: 'unspent', disposition: null, disputeLock: null, collision: false, debtReserved: account.debt > reserved,
      });
      minted++;
      vault++;
    } else if (row.type === 'collector-converted') {
      const act = acts.get(row.selfId);
      assert.equal(act.subject, row.subject);
      assert.equal(act.debtReserved, false);
      assert.ok(row.at - act.recordedAt >= 24);
      consume(act, 'converted', 'collector');
    } else if (row.type === 'guarantee-proposed') {
      allocate('guarantee', row.relation);
      const meta = relationMetadata.get(row.relation);
      assert.ok(meta);
      person(row.guarantor);
      person(row.guaranteed);
      assert.equal(meta.proposedAt, row.at);
      assert.equal(meta.guarantor, row.guarantor);
      assert.equal(meta.guaranteed, row.guaranteed);
      relations.set(row.relation, { id: row.relation, guarantor: row.guarantor, guaranteed: row.guaranteed, proposedAt: row.at, activatedAt: null, endedAt: null, status: 'proposed' });
    } else if (row.type === 'guarantee-activated') {
      const relation = relations.get(row.relation);
      assert.equal(relation.status, 'proposed');
      relation.status = 'active';
      relation.activatedAt = row.at;
      const key = edgeKey(relation.guarantor, relation.guaranteed);
      assert.equal(edges.has(key), false);
      edges.set(key, { id: 'edge:' + edgeSequence++, from: relation.guarantor, to: relation.guaranteed });
      revision++;
    } else if (row.type === 'guarantee-ended') {
      const relation = relations.get(row.relation);
      assert.equal(relation.status, 'active');
      assert.ok([relation.guarantor, relation.guaranteed].includes(row.actor));
      const payer = person(row.actor);
      assert.ok(payer.liquidFacy >= 1);
      payer.liquidFacy--;
      fees++;
      assert.equal(edges.delete(edgeKey(relation.guarantor, relation.guaranteed)), true);
      relation.status = 'ended';
      relation.endedAt = row.at;
      const account = person(relation.guarantor);
      account.credits = account.credits.filter(entry => acts.get(entry.source).subject !== relation.guaranteed);
      revision++;
    } else if (row.type === 'penalty-applied') {
      assert.ok(['fine', 'collected', 'debtAdded'].every(key => Number.isSafeInteger(row[key]) && row[key] >= 0));
      assert.equal(typeof row.halveXp, 'boolean');
      const account = person(row.subject);
      assert.equal(row.collected, Math.min(account.liquidFacy, row.fine));
      assert.equal(row.debtAdded, row.fine - row.collected);
      account.liquidFacy -= row.collected;
      account.debt += row.debtAdded;
      burned += row.collected;
      if (row.halveXp) account.halvings++;
    } else if (row.type === 'self-id-cancelled') {
      const act = acts.get(row.selfId);
      assert.ok(act.guarantors.includes(row.guarantor));
      consume(act, 'cancelled', 'guarantor-veto');
    } else if (row.type === 'self-id-frozen' || row.type === 'self-id-unfrozen') {
      const act = acts.get(row.selfId);
      assert.equal(act.status, 'unspent');
      assert.equal(act.disputeLock, row.type === 'self-id-frozen' ? null : row.lockId);
      act.disputeLock = row.type === 'self-id-frozen' ? row.lockId : null;
    } else if (row.type === 'debt-recovered') {
      const act = acts.get(row.selfId);
      assert.equal(act.subject, row.subject);
      assert.equal(act.debtReserved, true);
      assert.ok(row.at - act.recordedAt >= 24);
      assert.ok(person(row.subject).debt > 0);
      person(row.subject).debt--;
      consume(act, 'consumed', 'debt-repayment');
    } else if (row.type === 'invitation-created') {
      allocate('invitation', row.invitation);
      const meta = invitationMetadata.get(row.invitation);
      assert.ok(meta);
      const act = acts.get(meta.sourceSelfId);
      assert.equal(act.subject, row.creator);
      assert.equal(meta.creator, row.creator);
      assert.equal(meta.target, row.target);
      assert.equal(meta.createdAt, row.at);
      assert.equal(accounts.has(row.target), false);
      assert.equal(act.debtReserved, false);
      assert.ok(row.at - act.recordedAt >= 24);
      const population = [...accounts.keys()].filter(id => active(id, row.at)).length;
      assert.ok(guarantors(row.creator, row.at).length >= String(Math.max(1, population)).length);
      consume(act, 'consumed', 'invitation');
      invitations.set(row.invitation, { id: row.invitation, creator: row.creator, sourceSelfId: act.id, target: row.target, createdAt: row.at, acceptedAt: null, status: 'open' });
    } else if (row.type === 'invitation-cancelled') {
      const invitation = invitations.get(row.invitation);
      assert.equal(invitation.status, 'open');
      assert.ok(row.at - invitation.createdAt < 24);
      assert.ok(edges.has(edgeKey(row.guarantor, invitation.creator)));
      invitation.status = 'cancelled';
      const act = acts.get(invitation.sourceSelfId);
      assert.equal(act.status, 'consumed');
      act.disposition = 'invitation-cancelled';
      activeCredits.delete(act.id);
    } else assert.fail('unsupported closed-fixture event: ' + row.type);
  }
  for (const point of record.checkpoints) {
    const { digest, ...measured } = point;
    assert.equal(hash(canonical(measured)), digest, 'checkpoint digest');
    assert.ok(Number.isSafeInteger(point.atHour) && point.atHour >= (points.at(-1)?.atHour ?? record.originHour));
    assert.equal(point.ageHours, point.atHour - record.originHour);
    assert.ok(Number.isSafeInteger(point.eventCursor) && point.eventCursor >= cursor && point.eventCursor <= record.events.length);
    while (cursor < point.eventCursor) {
      assert.ok(record.events[cursor].at <= point.atHour, 'no future event in a checkpoint');
      event(record.events[cursor++]);
    }
    const projected = [...accounts.values()].map(account => ({ id: account.id, xp: xp(account), liquidFacy: account.liquidFacy, debt: account.debt }));
    const ledger = {
      minted, burned, supply: minted - burned, emitterVault: vault,
      collector: projected.reduce((sum, account) => sum + account.liquidFacy, 0), feeVault: fees, stakeVault: 0,
      debt: projected.reduce((sum, account) => sum + account.debt, 0),
    };
    assert.equal(vault, [...acts.values()].filter(act => act.status === 'unspent').length);
    assert.equal(ledger.supply, ledger.emitterVault + ledger.collector + ledger.feeVault);
    assert.ok(Object.values(ledger).every(value => Number.isSafeInteger(value) && value >= 0));
    assert.deepEqual(projected, point.accounts, 'replayed accounts');
    assert.deepEqual(ledger, point.ledger, 'replayed ledger');
    assert.deepEqual(acts.get(record.target), point.target, 'replayed target');
    assert.deepEqual(guarantors('subject', point.atHour), point.currentGuarantors, 'replayed qualification');
    assert.deepEqual([...invitations.values()], point.invitations, 'replayed invitations');
    assert.deepEqual([...acts.values()].filter(act => act.id !== record.target), record.prefixActs, 'settled prefix stays fixed');
    points.push({ label: point.label, atHour: point.atHour, ageHours: point.ageHours, eventCursor: cursor, subjectXp: projected.find(account => account.id === 'subject').xp, targetCreditEverMarked: point.target.xpCredited, targetCreditSourceActive: activeCredits.has(record.target) });
  }
  assert.equal(cursor, record.events.length, 'all native events consumed');
  assert.equal(acts.size, metadata.size);
  assert.deepEqual([...relations.values()], record.finalRelations);
  assert.deepEqual({ version: 1, name: 'guarantees', revision, nextEdge: edgeSequence, nodes: [...accounts.keys()], edges: [...edges.values()] }, record.finalGuarantees);
  return { id: record.id, checkpoints: points.length, accounts: points.length * accounts.size, events: cursor, points };
}

export function auditControls(raw) {
  assert.equal(raw.schema, 'facety-d42-migration-controls/v1');
  assert.equal(raw.evidence, 'diagnostic-software-reference-not-D42-runtime');
  assert.equal(raw.source.implementation.method, 'sha256-src-mjs-v1');
  assert.equal(raw.source.implementation.digest, SOURCE_SHA);
  assert.equal(raw.source.implementation.files, 27);
  assert.equal(raw.runnerSha256, RUNNER_SHA);
  assert.deepEqual(raw.policy, POLICY, 'closed legacy policy');
  assert.deepEqual(raw.selectedD42, { ordinaryMaturityAgeHours: 24, ordinarySubjectXp: 1, ordinaryEligibleGuarantorXp: 1, freeVetoEndsAtAgeHours: 24, retainOwnRightWithoutChosenUse: true, automaticCollectorConversion: false, spendingOrWithdrawalCreatesAnotherCredit: false });
  assert.deepEqual(raw.cases.map(record => record.id), CASES);
  const cases = raw.cases.map(auditCase);
  const counts = {
    cases: cases.length, checkpoints: cases.reduce((sum, row) => sum + row.checkpoints, 0),
    accountCheckpoints: cases.reduce((sum, row) => sum + row.accounts, 0), nativeEvents: cases.reduce((sum, row) => sum + row.events, 0),
  };
  assert.deepEqual(counts, { cases: 7, checkpoints: 38, accountCheckpoints: 114, nativeEvents: 113 });
  return { schema: 'facety-d42-offline-audit/v1', status: 'passed', method: 'public-journal-and-act-metadata-replay-with-exact-scaled-integer-XP', counts, cases,
    scope: 'Post-capture author audit; independent arithmetic implementation, not an independent reviewer, event authentication or D42 runtime proof. No FacetyModel execution or capture replay.',
    limits: [
      'Static act/media metadata and the supplied journal are inputs, not authenticated evidence.',
      'Rejected-attempt occurrence is supported by capture assertions, not independently reconstructed from journal events.',
      'The journal has no explicit XP-credit event; agreement is at retained event cursors under the declared legacy rules, not an independent exact credit timestamp.',
      'Only these seven closed fixture worlds are audited; this is not a general court, D42 engine or proof of untested histories.',
    ] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('D42 audit accepts no input, output or policy overrides');
  const input = readFileSync(new URL('./controls.json', import.meta.url));
  assert.equal(hash(input), INPUT_SHA, 'retained input hash');
  assert.equal(hash(readFileSync(new URL('./controls.mjs', import.meta.url))), RUNNER_SHA, 'retained capture code hash');
  const raw = JSON.parse(input);
  const report = auditControls(raw);
  process.stdout.write(JSON.stringify({ ...report, input: { sha256: INPUT_SHA, bytes: input.length, source: raw.source, runnerSha256: RUNNER_SHA }, analyzer: { sha256: hash(readFileSync(new URL(import.meta.url))), runtime: { node: process.version } } }) + '\n');
}
