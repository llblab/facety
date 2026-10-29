// V3 Council paths and initial bootstrap: studies/2026-10-29-owned-valences/council-paths-contract.md (pre-code contract 702466c).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';
import { verifyInternallyDisjointPaths } from '../src/proofs.mjs';

const PATHS = { council: 'legacy-active-xp-leaderboard', terminal: 'single-member', self: 'other-member', bootstrap: 'latch-first-100-active', intermediaries: 'accepted-subjects', search: 'exact-unbounded' };
const REFERENCE = { source: 'own-mature-right', withdrawal: 'free', pairEndXp: 'withdrawer-only', withdrawDuringHold: 'allow', invitations: 'v2-special-link', eligibility: 'v3-council-paths', councilPaths: PATHS };
const GENESIS = Array.from({ length: 100 }, (_, index) => 'g' + String(index).padStart(3, '0'));
const PAIRS = Array.from({ length: 50 }, (_, index) => [GENESIS[2 * index], GENESIS[2 * index + 1]]);

// The only admissible Council member is g000: councilSize 1, own-act XP only, and g000 acts on every day any other actor does.
function construct({ genesis = GENESIS, genesisPairs = PAIRS, K = 100, reference = {} } = {}) {
  return new FacetyModel({ genesis, policy: { xpFinality: 'maturity', councilSize: 1 }, ablations: { withholdGuarantorXp: true, fixedInvitationThreshold: 2 },
    valences: { K, genesisPairs, reference: { ...REFERENCE, ...reference } } });
}
function build({ links = [], genesis, genesisPairs } = {}) {
  const facety = construct({ genesis, genesisPairs });
  const actors = [...new Set(['g000', ...links.flat()])].sort();
  const days = Math.max(1, ...actors.map(id => links.flat().filter(value => value === id).length));
  for (let day = 0; day < days; day++) {
    for (const id of actors) facety.createSelfId(id, facety.registerArtifact(id));
    facety.advanceTo(facety.now + DAY);
  }
  for (const [a, b] of links) {
    facety.openValence(a, b, facety.eligibleEmissions(a)[0]);
    facety.openValence(b, a, facety.eligibleEmissions(b)[0]);
  }
  assert.equal(facety.initialBootstrap, true);
  for (const id of GENESIS) if (!facety.isActive(id)) facety.createSelfId(id, facety.registerArtifact(id));
  assert.equal(facety.initialBootstrap, false, 'the 100th active participant ends the initial bootstrap');
  facety.advanceTo(facety.now + DAY);
  assert.deepEqual(facety.council().map(member => member.id), ['g000']);
  return facety;
}
function snapshot(facety) {
  return JSON.stringify({ acts: facety.selfIds(), invitations: facety.invitations(), ledger: facety.ledger(), guarantees: facety.guarantees.toJSON(), events: facety.events().length });
}
function rejectsUnchanged(facety, fn, pattern) {
  const before = snapshot(facety);
  assert.throws(fn, pattern);
  assert.equal(snapshot(facety), before);
}
function invite(facety, creator, target) {
  facety.preregisterAccount(target);
  return () => facety.createInvitation(creator, facety.eligibleEmissions(creator)[0], target);
}

test('councilPaths bindings are exact; with eligibility off they only set the Council reference (D115)', () => {
  assert.throws(() => construct({ reference: { councilPaths: { ...PATHS, terminal: 'mixed' } } }), TypeError);
  assert.throws(() => construct({ reference: { councilPaths: { ...PATHS, extra: 1 } } }), TypeError);
  assert.throws(() => construct({ reference: { councilPaths: null } }), TypeError);
  assert.throws(() => construct({ reference: { eligibility: 'off', councilPaths: { ...PATHS, council: 'other' } } }), TypeError);
  // D115: genesis pairs and a Council binding are allowed without the path gate; no bootstrap latch or gate follows.
  const off = construct({ reference: { eligibility: 'off' } });
  assert.equal(off.initialBootstrap, null);
  assert.ok(off.guarantees.edge('g000', 'g001') && off.guarantees.edge('g001', 'g000'));
  assert.equal(construct({ genesisPairs: [], reference: { eligibility: 'off', councilPaths: null } }).initialBootstrap, null);
});

test('genesis pairs establish mutual guarantees and count units without mint or burn', () => {
  const facety = construct({ genesis: ['a', 'b', 'c'], genesisPairs: [['a', 'b'], ['a', 'c']] });
  assert.ok(facety.guarantees.edge('a', 'b') && facety.guarantees.edge('b', 'a') && facety.guarantees.edge('c', 'a'));
  assert.equal(facety.ownedSlots('a').used, 2);
  assert.deepEqual(facety.ledger(), { minted: 0, burned: 0, supply: 0, emitterVault: 0, collector: 0, feeVault: 0, stakeVault: 0, debt: 0 });
  assert.ok(facety.valenceRecords().every(record => record.burnSource === null && record.origin === 'genesis-supplied'));
  facety.audit();
  assert.throws(() => construct({ genesis: ['a', 'b'], genesisPairs: [['a', 'a']] }), /distinct genesis members/);
  assert.throws(() => construct({ genesis: ['a', 'b'], genesisPairs: [['a', 'z']] }), /distinct genesis members/);
  assert.throws(() => construct({ genesis: ['a', 'b'], genesisPairs: [['a', 'b'], ['b', 'a']] }), /duplicate genesis pair/);
  assert.throws(() => construct({ genesis: ['a', 'b', 'c'], genesisPairs: [['a', 'b'], ['a', 'c']], K: 1 }), /exceed the owned-slot ceiling/);
});

test('during bootstrap Self-ID needs exactly one mutual guarantor and no Council path', () => {
  const facety = construct({ genesis: ['a', 'b', 'c'], genesisPairs: [['a', 'b']] });
  const act = facety.createSelfId('a', facety.registerArtifact('a'));
  assert.equal(facety.selfId(act).councilPath, undefined);
  const artifact = facety.registerArtifact('c');
  rejectsUnchanged(facety, () => facety.createSelfId('c', artifact), /established mutual guarantor/);
  facety.audit();
});

test('bootstrap latches at the first 100 active participants and never re-enters', () => {
  const facety = construct();
  for (const id of GENESIS.slice(0, 99)) facety.createSelfId(id, facety.registerArtifact(id));
  assert.equal(facety.activeCount(), 99);
  assert.equal(facety.initialBootstrap, true);
  facety.createSelfId('g099', facety.registerArtifact('g099'));
  assert.equal(facety.initialBootstrap, false);
  facety.advanceTo(facety.now + 30 * DAY);
  assert.equal(facety.activeCount(), 0);
  assert.equal(facety.initialBootstrap, false, 'a later decline is not bootstrap re-entry');
  assert.equal(facety.events().filter(event => event.type === 'bootstrap-ended').length, 1);
  facety.audit();
});

test('outside bootstrap a Self-ID guarantor must reach a Council member other than itself', () => {
  const facety = build({ links: [['g002', 'g000']] });
  const ok = facety.createSelfId('g003', facety.registerArtifact('g003'));
  const path = facety.selfId(ok).councilPath;
  assert.equal(path.guarantor, 'g002');
  assert.equal(path.target, 'g000');
  assert.ok(verifyInternallyDisjointPaths(facety.guarantees, path.proof, { source: 'g002', target: 'g000', minimumPaths: 1, requireRevision: false }));
  const [far, self] = [facety.registerArtifact('g099'), facety.registerArtifact('g001')];
  rejectsUnchanged(facety, () => facety.createSelfId('g099', far), /insufficient Council paths/);
  rejectsUnchanged(facety, () => facety.createSelfId('g001', self), /insufficient Council paths/, 'the sole member is not its own terminal');
  facety.audit();
});

const LINKS = [
  ['g010', 'g020'], ['g011', 'g000'], ['g020', 'g000'],                      // g010: disjoint via g011 and g020
  ['g040', 'g050'], ['g041', 'g060'], ['g050', 'g060'], ['g060', 'g000'],    // g040: both routes share g060
  ['g070', 'g080'], ['g071', 'g072'], ['g072', 'g000'], ['g080', 'g000'],    // g070: disjoint, one route through g072
];

test('outside bootstrap an invitation needs D internally vertex-disjoint current paths to one member', () => {
  const facety = build({ links: LINKS });
  const id = invite(facety, 'g010', 'n1')();
  const record = facety.invitations().find(value => value.id === id);
  assert.equal(record.councilPath.target, 'g000');
  assert.equal(record.councilPath.proof.paths.length, 2);
  assert.ok(verifyInternallyDisjointPaths(facety.guarantees, record.councilPath.proof, { source: 'g010', target: 'g000', minimumPaths: 2, requireRevision: false }));
  rejectsUnchanged(facety, invite(facety, 'g040', 'n2'), /insufficient Council paths/);
  facety.audit();
});

test('ended links and invalidated intermediaries stop providing paths', () => {
  const facety = build({ links: LINKS });
  const g020 = facety.valenceRecords().find(record => record.owner === 'g020' && record.counterpart === 'g000' && record.status === 'open');
  facety.withdrawValence('g020', g020.id);
  rejectsUnchanged(facety, invite(facety, 'g010', 'n1'), /insufficient Council paths/);
  facety.invalidateIdentity('g072');
  rejectsUnchanged(facety, invite(facety, 'g070', 'n2'), /insufficient Council paths/);
  facety.audit();
});

test('guarantor count and Council paths are independent conditions', () => {
  // g090 reaches g000 through genesis partner h (inactive, so not an eligible guarantor) and through g091.
  const genesis = [...GENESIS, 'h'], genesisPairs = [...PAIRS, ['g090', 'h'], ['h', 'g000']];
  const facety = build({ links: [['g091', 'g000']], genesis, genesisPairs });
  assert.equal(facety.eligibleGuarantors('g090').length, 1);
  facety.createSelfId('g090', facety.registerArtifact('g090'));
  facety.advanceTo(facety.now + DAY);
  rejectsUnchanged(facety, invite(facety, 'g090', 'n1'), /insufficient eligible guarantors/);
  facety.audit();
});
