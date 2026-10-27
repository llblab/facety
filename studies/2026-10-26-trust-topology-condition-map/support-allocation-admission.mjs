// Owns: Pre-data support-allocation arithmetic and existing API refusal evidence; excludes network execution and hypothesis confirmation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { FacetyModel } from '../../src/model.mjs';
import { experimentConfig } from '../../src/experiment.mjs';
import { experimentRandomness } from '../../src/experiment-config.mjs';
import { registerHypothesis, runStatisticsTask } from '../../src/evidence.mjs';
import { OBSERVABLES, observableForExperiment } from '../../src/discovery.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';
import { config as vouchConfig } from '../../test/support/vouch-experiment-fixture.mjs';
import { config as pbConfig } from '../../test/support/pb-experiment-fixture.mjs';

const designBytes = readFileSync(new URL('./support-allocation-design.json', import.meta.url));
const design = JSON.parse(designBytes), person = i => `n${String(i).padStart(2, '0')}`;
assert.equal(design.status, 'DESIGN ONLY / NOT REGISTERED / NOT RUN');
assert.equal(design.common.responsePolicy.reference, 'best-willing-public-standing/v1');
const participantIds = Array.from({ length: 18 }, (_, i) => person(i + 1));
const matching = [];
for (const [arm, data] of Object.entries(design.arms)) {
  const cash = new Map(participantIds.map(id => [id, 0])), days = [];
  assert.equal(data.duties.length, 30); assert.equal(data.transfers.length, 42);
  assert.equal(data.transfers.reduce((n, row) => n + row.amount, 0), 42);
  assert.equal(new Set(data.duties.map(row => row.giver + ':' + row.receiver)).size, 30);
  assert.ok(data.duties.every(row => row.giver !== row.receiver && row.fee === 1));
  for (let day = 1; day <= 14; day++) {
    for (const id of participantIds) cash.set(id, cash.get(id) + 1);
    for (const row of data.transfers.filter(row => row.day === day)) {
      assert.ok(cash.get(row.from) >= row.amount, arm + ': actual funding, no overdraft');
      cash.set(row.from, cash.get(row.from) - row.amount); cash.set(row.to, cash.get(row.to) + row.amount);
    }
    for (const row of data.duties.filter(row => row.day === day)) {
      assert.ok(cash.get(row.giver) >= row.fee, arm + ': fee must be paid by actual giver');
      cash.set(row.giver, cash.get(row.giver) - row.fee);
    }
    days.push({ day, cash: Object.fromEntries(cash), fees: data.duties.filter(row => row.day <= day).length });
  }
  matching.push({ arm, transferCount: data.transfers.length, grossTransferred: 42, supportFees: 30, days });
}
assert.deepEqual(matching[0].days, matching[1].days, 'nonvacuous14end-of-round per-person cash ledgers equal');
assert.deepEqual(design.arms.concentrated.duties.map(({ giver, ...row }) => row), design.arms.dispersed.duties.map(({ giver, ...row }) => row));
assert.equal(matching[0].days.at(-1).cash.n01, 0);
assert.equal(Object.values(matching[0].days.at(-1).cash).reduce((a, b) => a + b, 0), 222);
const unchanged = design.common.unchangedDuties;
assert.deepEqual(unchanged.leader.days, Array.from({ length: 18 }, (_, i) => i + 1));
assert.equal(unchanged.leader.days.length, unchanged.leader.count);
assert.equal(unchanged.coalition.days.length, unchanged.coalition.counts.length);
const commonDuties = unchanged.leader.count + unchanged.coalition.counts.reduce((a, b) => a + b, 0) + unchanged.inviter.count;
assert.equal(commonDuties + design.arms.concentrated.duties.length, design.matching.totalAllDuties);

const rejected = [], calls = [], originals = new Map();
const mutators = ['advanceTo', 'registerArtifact', 'createSelfId', 'convertToCollector', 'proposeGuarantee', 'confirmGuarantee',
  'transferFacy', 'createInvitation', 'acceptInvitation', 'cancelSelfId', 'freezeSelfId', 'resolveSelfId', 'penalize',
  'beginDisputeParticipation', 'addDisputeParticipant', 'endDisputeParticipation', 'reserveDisputeStake'];
function refused(id, operation, expected) {
  let reason = null;
  try { operation(); } catch (error) { reason = error.message; }
  assert.ok(reason, id + ': unsupported capability must not appear admitted');
  assert.match(reason, expected); rejected.push({ id, reason });
}
try {
  for (const key of mutators) {
    const descriptor = Object.getOwnPropertyDescriptor(FacetyModel.prototype, key);
    if (!descriptor) continue;
    originals.set(key, descriptor);
    Object.defineProperty(FacetyModel.prototype, key, { ...descriptor, value: function () { calls.push(key); throw new Error('FORBIDDEN pre-data Model action: ' + key); } });
  }
  const unsupported = { engine: design.admission.proposedEngine, reference: design.admission.proposedReference };
  refused('legacy-relay-profile-key', () => experimentConfig({ participationReference: design.common.participationReference }), /unknown experiment key: participationReference/);
  refused('legacy-allocation-key', () => experimentConfig({ supportAllocation: 'concentrated' }), /unknown experiment key: supportAllocation/);
  refused('explicit-living-engine', () => experimentConfig(unsupported), /unsupported experiment engine/);
  refused('living-randomness-manifest', () => experimentRandomness(unsupported), /unsupported experiment randomness engine/);
  refused('registration-base-preflight', () => registerHypothesis({ id: 'support-allocation-refusal-only', statement: 'Pre-data capability rejection; NOT a study.', kind: 'association', base: unsupported }), /unsupported experiment engine/);
  const native = vouchConfig();
  refused('vouch-has-no-act-case-operation', () => experimentConfig({ ...native, events: [{ atHour: 0, authority: 'subject-call', op: 'act-case-open' }] }), /unknown Native vouch operation/);
  refused('pb-is-not-living-relay', () => experimentConfig({ ...pbConfig(), participationReference: design.common.participationReference }), /P\/b experiment requires exactly/);
  for (const metric of Object.keys(design.proposedScalars)) {
    assert.equal(Object.hasOwn(OBSERVABLES, metric), false);
    assert.equal(observableForExperiment(metric, unsupported), false);
  }
  refused('scalar-worker-living-metric', () => runStatisticsTask({ config: experimentConfig({ days: 365 }), statistics: {
    endpoint: { metric: 'living.taggedDefectCasesUpheld', summary: 'endpoint', window: null, subtract: null },
  } }), /statistic metric does not belong to experiment engine/);
  assert.deepEqual(calls, []);
} finally {
  for (const [key, descriptor] of originals) Object.defineProperty(FacetyModel.prototype, key, descriptor);
}
console.log(JSON.stringify({ schema: 'facety-support-allocation-admission/v1', classification: 'DIAGNOSTIC pre-data API/arithmetic, no network or scientific outcomes',
  provenance: provenance(), designDigest: digestOf(design), designFileSha256: createHash('sha256').update(designBytes).digest('hex'),
  matching, rejected, modelMutatorCalls: calls, constructorCaveat: 'Native vouch config performs disposable zero-wealth constructor validation; NOT a population/transaction run',
  newOutcomeRuns: 0, scientificWorlds: 0, registrationsCreated: 0, reservedSeedsAllocated: 0,
  identifiedGaps: ['config/dispatcher lacks this living reference', 'engine-specific living scalar namespace absent', 'randomness manifest absent', 'fixed no-draw tape has no independent sampling law', 'G1 and dependent master gates absent'],
  noSourceOrTestOrDefaultOrRandomnessChange: true,
  next: 'minimal typed existing-dispatcher/metric adapter under the separate contract, engineering-only; no comparative outcome probe or scientific admission/gate waiver',
}, null, 2));
