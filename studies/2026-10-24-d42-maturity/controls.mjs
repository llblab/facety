// Owns: Fixed public-API legacy boundary witnesses for D42 migration, not a D42 implementation or empirical study.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FacetyModel, DAY, DEFAULT_POLICY, ProtocolRejection } from '../../src/model.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';

const SOURCE = 'db930fbc29f6d18c4ddfd32897668cd2d3acd1a07f07cda674e1cb7bc3e09fc4';
const CASES = ['idle-veto-24', 'withdraw-24', 'invite-cancel-25', 'debt-24', 'locked-debt-48', 'guarantor-switch-23', 'late-credit-after-halving'];
function identify(model, id) {
  return model.createSelfId(id, model.registerArtifact(id));
}
function guarantee(model, from, to) {
  const id = model.proposeGuarantee(from, to);
  model.confirmGuarantee(to, id);
  return id;
}
function fixture(id) {
  const model = new FacetyModel({ genesis: ['subject', 'old', 'new'] });
  const earned = id === 'late-credit-after-halving';
  const own = earned ? identify(model, 'subject') : null;
  const old = identify(model, 'old');
  const next = identify(model, 'new');
  model.advanceTo(DAY);
  model.convertToCollector('old', old);
  model.convertToCollector('new', next);
  if (earned) model.convertToCollector('subject', own);
  const relation = guarantee(model, 'old', 'subject');
  if (earned) {
    const second = identify(model, 'subject');
    model.advanceTo(2 * DAY);
    model.convertToCollector('subject', second);
    assert.equal(model.subject('subject').xp, 2);
  }
  if (id === 'debt-24' || id === 'locked-debt-48') model.penalize('subject', { fine: 1, halveXp: false });
  const prefixActs = model.selfIds();
  const target = identify(model, 'subject');
  return { model, relation, target, prefixActs, originHour: model.now };
}
function oneCase(id) {
  const { model, relation, target, prefixActs, originHour } = fixture(id);
  const checkpoints = [];
  const attempts = [];
  function capture(label) {
    assert.deepEqual(model.selfIds().filter(act => act.id !== target), prefixActs, 'non-target prefix records stay unchanged');
    const row = {
      label, atHour: model.now, ageHours: model.now - originHour, eventCursor: model.events().length,
      accounts: model.subjects().map(({ id, xp, liquidFacy, debt }) => ({ id, xp, liquidFacy, debt })),
      target: model.selfId(target), currentGuarantors: model.eligibleGuarantors('subject'),
      invitations: model.invitations(), ledger: model.audit(),
    };
    assert.equal(row.ledger.emitterVault, row.target.status === 'unspent' ? 1 : 0);
    assert.equal(row.accounts.reduce((sum, account) => sum + account.liquidFacy, 0), row.ledger.collector);
    assert.equal(row.accounts.reduce((sum, account) => sum + account.debt, 0), row.ledger.debt);
    checkpoints.push({ ...row, digest: digestOf(row) });
    return row;
  }
  function at(age, label) {
    model.advanceTo(originHour + age);
    return capture(label);
  }
  function attempt(operation, action) {
    const before = {
      accounts: model.subjects(), target: model.selfId(target), events: model.events(),
      invitations: model.invitations(), relations: model.guaranteeRelations(), ledger: model.audit(),
    };
    try {
      action();
      attempts.push({ atHour: model.now, ageHours: model.now - originHour, operation, accepted: true, error: null });
      return true;
    } catch (error) {
      if (!(error instanceof ProtocolRejection)) throw error;
      assert.deepEqual({
        accounts: model.subjects(), target: model.selfId(target), events: model.events(),
        invitations: model.invitations(), relations: model.guaranteeRelations(), ledger: model.audit(),
      }, before, 'known rejected disposition is inert');
      attempts.push({ atHour: model.now, ageHours: model.now - originHour, operation, accepted: false, error: error.message });
      return false;
    }
  }
  const baseline = capture('recorded');
  at(23, 'before-maturity');
  if (id === 'locked-debt-48') {
    model.freezeSelfId(target, 'declared-case');
    capture('locked-before-maturity');
  }
  if (id === 'guarantor-switch-23') {
    model.endGuarantee('old', relation);
    guarantee(model, 'new', 'subject');
    capture('switched-before-maturity');
  }
  const boundary = at(24, 'at-maturity');
  const xp = () => model.subject('subject').xp;
  if (id !== 'debt-24') assert.equal(xp(), baseline.accounts.find(row => row.id === 'subject').xp);
  if (id === 'idle-veto-24') {
    assert.equal(boundary.target.status, 'unspent');
    assert.equal(boundary.target.xpCredited, false);
    assert.equal(boundary.ledger.collector, baseline.ledger.collector, 'no automatic withdrawal');
    assert.equal(attempt('free-veto-at-24', () => model.cancelSelfId('old', target)), true);
    capture('legacy-veto-accepted');
    assert.equal(xp(), 0);
  } else if (id === 'withdraw-24') {
    model.convertToCollector('subject', target);
    capture('withdrawn');
    assert.equal(xp(), 1);
    assert.equal(attempt('repeat-withdrawal', () => model.convertToCollector('subject', target)), false);
    at(48, 'later-no-second-credit');
    assert.equal(xp(), 1);
  } else if (id === 'invite-cancel-25') {
    const invitation = model.createInvitation('subject', target, 'invitee');
    capture('invitation-created');
    assert.equal(xp(), 1);
    at(25, 'invitation-still-frozen');
    model.cancelInvitation('old', invitation);
    const cancelled = capture('invitation-cancelled');
    assert.equal(xp(), 0);
    assert.equal(cancelled.ledger.burned, 1);
    assert.equal(cancelled.target.xpCredited, true, 'ever-marked credit is not a current XP receipt');
  } else if (id === 'debt-24') {
    assert.equal(xp(), 1);
    assert.equal(model.subject('subject').debt, 0);
    assert.equal(boundary.target.disposition, 'debt-repayment');
    const ledger = model.audit();
    at(48, 'later-no-second-recovery');
    assert.deepEqual(model.audit(), ledger);
    assert.equal(xp(), 1);
  } else if (id === 'locked-debt-48') {
    assert.equal(model.subject('subject').debt, 1);
    assert.equal(attempt('withdraw-while-locked', () => model.convertToCollector('subject', target)), false);
    assert.equal(attempt('veto-while-locked', () => model.cancelSelfId('old', target)), false);
    at(48, 'still-locked');
    model.unfreezeSelfId(target, 'declared-case');
    capture('unlocked-and-recovered');
    assert.equal(xp(), 1);
    assert.equal(model.subject('subject').debt, 0);
    assert.equal(model.selfId(target).disposition, 'debt-repayment');
  } else if (id === 'guarantor-switch-23') {
    assert.deepEqual(boundary.target.guarantors, ['old']);
    assert.deepEqual(boundary.currentGuarantors, ['new']);
    at(48, 'before-late-withdrawal');
    model.convertToCollector('subject', target);
    capture('withdrawn-after-switch');
    assert.equal(xp(), 1);
    assert.equal(model.subject('old').xp, 1);
    assert.equal(model.subject('new').xp, 1, 'neither guarantor receives the target credit in this legacy switch');
  } else if (id === 'late-credit-after-halving') {
    at(25, 'before-later-halving');
    model.penalize('subject', { fine: 0, halveXp: true });
    capture('halved-before-late-credit');
    assert.equal(xp(), 1);
    at(48, 'before-late-withdrawal');
    model.convertToCollector('subject', target);
    capture('late-credit-after-halving');
    assert.equal(xp(), 2);
  }
  return {
    id, originHour, target, prefixActs, checkpoints, attempts,
    finalRelations: model.guaranteeRelations(), finalGuarantees: model.guarantees.toJSON(), events: model.events(),
  };
}

export function runControls() {
  const source = provenance();
  assert.equal(source.implementation.digest, SOURCE, 'D42 controls require their original source; no implicit drift override');
  assert.equal(DEFAULT_POLICY.xpFinality, 'terminal');
  assert.equal(DEFAULT_POLICY.linkBreakXp, 'revoke');
  assert.equal(DEFAULT_POLICY.guarantorEligibility, 'active');
  assert.deepEqual([DEFAULT_POLICY.spendMaturityHours, DEFAULT_POLICY.conversionMaturityHours, DEFAULT_POLICY.invitationFreezeHours], [DAY, DAY, DAY]);
  const cases = CASES.map(oneCase);
  assert.equal(new Set(cases.map(row => row.id)).size, 7);
  return {
    schema: 'facety-d42-migration-controls/v1', evidence: 'diagnostic-software-reference-not-D42-runtime',
    source, runnerSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'), policy: DEFAULT_POLICY,
    selectedD42: {
      ordinaryMaturityAgeHours: 24, ordinarySubjectXp: 1, ordinaryEligibleGuarantorXp: 1,
      freeVetoEndsAtAgeHours: 24, retainOwnRightWithoutChosenUse: true, automaticCollectorConversion: false,
      spendingOrWithdrawalCreatesAnotherCredit: false,
    },
    assumptions: [
      'Supplied accepted genesis identities are trusted fixture inputs; acquisition cost, personhood and evidence authenticity are not measured.',
      'All funding, guarantees, rights, debt and penalties use FacetyModel public transitions; no direct graph or balance mutation.',
      'Target ages are relative to originHour; the funded prefix ends at hour 24, or hour 48 in the two-credit halving case.',
      'Snapshots retain a public account projection and the whole target act; all other prefix act records are retained once and checked unchanged at every snapshot.',
      'Events are the complete native journal; it has no explicit XP-credit event. Snapshot flags/recipient arrays are not current-credit receipts or exact independent credit timestamps.',
      'Locks, unlocks and penalties are supplied transition inputs, not executed court verdicts or new selected procedures.',
      'The 2-before-halving versus 1-at-maturity arithmetic uses the existing floor-halving reference, not a newly selected rounding rule.',
      'No randomness, strategy optimization, human preference, attack probability or mechanism confirmation is estimated.',
    ],
    cases,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('D42 controls accept no scenario, policy, output or drift overrides');
  process.stdout.write(JSON.stringify(runControls()) + '\n');
}
