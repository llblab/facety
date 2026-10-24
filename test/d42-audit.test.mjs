import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditControls } from '../studies/2026-10-24-d42-maturity/audit.mjs';
import { digestOf } from '../src/provenance.mjs';

const directory = new URL('../studies/2026-10-24-d42-maturity/', import.meta.url);
const input = readFileSync(new URL('controls.json', directory), 'utf8');
const fixture = () => JSON.parse(input);
const world = (raw, id) => raw.cases.find(row => row.id === id);
const point = (raw, id, label) => world(raw, id).checkpoints.find(row => row.label === label);
function resign(raw) {
  for (const row of raw.cases) for (const checkpoint of row.checkpoints) {
    const { digest, ...content } = checkpoint;
    checkpoint.digest = digestOf(content);
  }
  return raw;
}

test('D42 offline audit is pure, imports no model/capture code and reconstructs every retained checkpoint', () => {
  const raw = fixture();
  const before = JSON.stringify(raw);
  const report = auditControls(raw);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(report.status, 'passed');
  assert.deepEqual(report.counts, { cases: 7, checkpoints: 38, accountCheckpoints: 114, nativeEvents: 113 });
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  assert.deepEqual(auditControls(fixture()), report);
  const cancelled = report.cases.find(row => row.id === 'invite-cancel-25').points.at(-1);
  assert.equal(cancelled.targetCreditEverMarked, true);
  assert.equal(cancelled.targetCreditSourceActive, false);
  assert.equal(cancelled.subjectXp, 0);
  assert.equal(report.cases.find(row => row.id === 'late-credit-after-halving').points.at(-1).subjectXp, 2);
  const source = readFileSync(new URL('audit.mjs', directory), 'utf8');
  assert.ok([...source.matchAll(/from '([^']+)'/g)].every(match => match[1].startsWith('node:')));
});

test('recomputed snapshot digests cannot conceal changed XP, custody, roles, locks, credit flags or invitations', () => {
  const changes = [
    raw => { point(raw, 'idle-veto-24', 'at-maturity').accounts[0].xp = 1; },
    raw => { point(raw, 'debt-24', 'at-maturity').ledger.debt = 1; },
    raw => { point(raw, 'invite-cancel-25', 'invitation-cancelled').target.xpCredited = false; },
    raw => { point(raw, 'guarantor-switch-23', 'at-maturity').currentGuarantors = ['old']; },
    raw => { point(raw, 'locked-debt-48', 'at-maturity').target.disputeLock = null; },
    raw => { point(raw, 'withdraw-24', 'recorded').target.status = 'converted'; },
    raw => { point(raw, 'invite-cancel-25', 'invitation-cancelled').invitations[0].status = 'open'; },
    raw => { world(raw, 'withdraw-24').prefixActs[0].status = 'unspent'; },
    raw => {
      const row = point(raw, 'guarantor-switch-23', 'switched-before-maturity');
      row.ledger.feeVault = 0;
      row.ledger.burned = 1;
      row.ledger.supply--;
    },
    raw => { point(raw, 'withdraw-24', 'withdrawn').target.xpRecipients = ['subject', 'new']; },
  ];
  for (const change of changes) {
    const raw = fixture();
    change(raw);
    assert.throws(() => auditControls(resign(raw)));
  }
  const wrongDigest = fixture();
  point(wrongDigest, 'idle-veto-24', 'recorded').digest = '0'.repeat(64);
  assert.throws(() => auditControls(wrongDigest), /checkpoint digest/);
});

test('offline replay refuses altered chronology, unknown events, reduced cohorts and substituted source/policy', () => {
  const changes = [
    raw => { world(raw, 'late-credit-after-halving').events.find(row => row.type === 'penalty-applied').halveXp = false; },
    raw => { world(raw, 'late-credit-after-halving').events.find(row => row.type === 'penalty-applied').halveXp = 'false'; },
    raw => { world(raw, 'debt-24').events.find(row => row.type === 'penalty-applied').fine = -1; },
    raw => { world(raw, 'withdraw-24').events[0].at = -1; },
    raw => { world(raw, 'guarantor-switch-23').events = world(raw, 'guarantor-switch-23').events.filter(row => row.type !== 'guarantee-ended'); },
    raw => { point(raw, 'withdraw-24', 'recorded').eventCursor = 999; },
    raw => { point(raw, 'debt-24', 'recorded').eventCursor--; },
    raw => { world(raw, 'withdraw-24').events[0].type = 'unmodeled-correction'; },
    raw => { world(raw, 'idle-veto-24').checkpoints.splice(1, 1); },
    raw => { raw.cases.pop(); },
    raw => { raw.cases[1] = raw.cases[0]; },
    raw => { raw.cases.reverse(); },
    raw => { raw.policy.xpFinality = 'immediate'; },
    raw => { raw.policy.extraRule = true; },
    raw => { raw.runnerSha256 = '0'.repeat(64); },
    raw => { raw.source.implementation.digest = '0'.repeat(64); },
    raw => { raw.source.implementation.files = 26; },
    raw => { raw.selectedD42.automaticCollectorConversion = true; },
    raw => { world(raw, 'withdraw-24').finalGuarantees.revision++; },
    raw => { world(raw, 'guarantor-switch-23').finalRelations[0].endedAt--; },
  ];
  for (const [index, change] of changes.entries()) {
    const raw = fixture();
    change(raw);
    assert.throws(() => auditControls(resign(raw)), 'alteration ' + index);
  }
});

test('D42 audit CLI binds retained files and analyzer separately, emits JSON only and rejects override arguments', () => {
  const executable = fileURLToPath(new URL('audit.mjs', directory));
  const result = spawnSync(process.execPath, [executable], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  const { input: binding, analyzer, ...pure } = report;
  assert.deepEqual(pure, auditControls(fixture()));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(binding.sha256, sha(Buffer.from(input)));
  assert.equal(binding.bytes, Buffer.byteLength(input));
  assert.equal(analyzer.sha256, sha(readFileSync(executable)));
  assert.equal(analyzer.runtime.node, process.version);
  const rejected = spawnSync(process.execPath, [executable, '--policy', 'maturity'], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.equal(rejected.stdout, '');
  assert.match(rejected.stderr, /accepts no input, output or policy overrides/);
});
