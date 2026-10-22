import test from 'node:test';
import assert from 'node:assert/strict';
import { runExperiment, experimentConfig } from '../src/experiment.mjs';

const base = { scenario: 'sybil-cone', initialSize: 30, attackerShare: 0.2, days: 24, maxSubjects: 1500, falsePositiveRate: 0.05, disputes: { enabled: true, accuracy: 0.8 }, activity: { honest: { inspect: 3, challenge: 1 } } };
const mean = (runs, pick) => runs.reduce((sum, run) => sum + pick(run), 0) / runs.length;
const runs = overrides => [0, 1, 2].map(i => runExperiment({ ...base, ...overrides, seed: 'social:' + i }));

test('social settings fail closed', () => {
  assert.throws(() => experimentConfig({ social: { scope: 'everyone' } }), /scope/);
  assert.throws(() => experimentConfig({ social: { hops: 0 } }), RangeError);
  assert.throws(() => experimentConfig({ social: { verification: 'yes' } }), TypeError);
  assert.throws(() => experimentConfig({ social: { unknown: 1 } }), /unknown social/);
  assert.equal(experimentConfig({}).social.scope, 'public');
});

test('acquaintance-only guaranteeing refuses strangers and cuts coalition-to-honest links', () => {
  const camouflage = { ablations: { randomGuaranteeTargets: true } };
  const open = runs(camouflage);
  const closed = runs({ ...camouflage, social: { scope: 'acquaintances' } });
  assert.ok(mean(closed, run => run.system.trust.strangerRefusals) > 0);
  assert.equal(mean(open, run => run.system.trust.strangerRefusals), 0);
  assert.ok(mean(closed, run => run.history.at(-1).graph.attackEdges) < mean(open, run => run.history.at(-1).graph.attackEdges));
});

test('graph screening steers inspections toward the weakly connected coalition', () => {
  // Sparse, weak inspection: where to look matters.
  const weak = { sensitivity: 0.3, activity: { honest: { inspect: 0.5, challenge: 1 } } };
  const plain = runs(weak);
  const screened = runs({ ...weak, social: { screening: true, screeningShare: 1 } });
  assert.ok(mean(screened, run => run.population.falseSubjects) < mean(plain, run => run.population.falseSubjects), 'earlier removal stops the cone from growing');
  assert.ok(mean(screened, run => run.system.falseAcceptedSubjects) < mean(plain, run => run.system.falseAcceptedSubjects));
});

test('second-stage verification prevents most false vetoes and wrongful challenges at a work cost', () => {
  const plain = runs({});
  const verified = runs({ social: { verification: true } });
  assert.ok(mean(verified, run => run.impact.honestEmissionsCancelled) < mean(plain, run => run.impact.honestEmissionsCancelled) / 4);
  assert.ok(mean(verified, run => run.system.trust.verificationsCleared) > 0);
  assert.ok(verified.every(run => run.effort.cohorts.honest.byAction.verify.attempts > 0));
  assert.ok(plain.every(run => run.effort.cohorts.honest.byAction.verify.attempts === 0));
});

test('lineage investigations follow up proven fakes within their budget', () => {
  const investigated = runs({ social: { investigation: true, maxFollowUps: 3 } });
  for (const run of investigated) {
    assert.ok(run.system.trust.followUps > 0);
    assert.ok(run.system.trust.followUps <= 3 * run.system.sanctions.upheld);
  }
  assert.ok(runs({}).every(run => run.system.trust.followUps === 0));
});

test('bribes are off-protocol payments that create liable honest guarantors of controlled subjects', () => {
  const bribed = runs({ social: { bribeAcceptance: 0.5, bribePrice: 4 }, activity: { honest: { inspect: 3, challenge: 1 }, attackers: { bribe: 0.3 } } });
  for (const run of bribed) {
    const paid = Object.values(run.agents.attackers).reduce((sum, group) => sum + group.bribesPaid, 0);
    const received = Object.values(run.agents.honest).reduce((sum, group) => sum + group.bribesReceived, 0);
    assert.equal(paid, received);
    assert.equal(paid, 4 * run.system.trust.bribesAccepted);
    assert.ok(run.system.trust.bribesAccepted > 0);
  }
  const refused = runs({ social: { bribeAcceptance: 0 }, activity: { honest: { inspect: 3, challenge: 1 }, attackers: { bribe: 0.3 } } });
  assert.ok(refused.every(run => run.system.trust.bribesAccepted === 0 && run.system.trust.bribesOffered > 0));
});

test('guarantors reviewing frozen invitations stop fake admissions, and exits escape the liability wave', () => {
  const settings = {
    ...base, policy: { invitationFreezeHours: 72 },
    disputes: { enabled: true, accuracy: 0.9, fineMode: 'chain', liability: 'inviter-chain' },
    activity: { honest: { inspect: 0.3, challenge: 0.2, review: 1 } },
  };
  const unwatched = runs({ ...settings, activity: { honest: { inspect: 0.3, challenge: 0.2, review: 0 } } });
  const watched = runs(settings);
  const leaving = runs({ ...settings, social: { exitOnFraud: true } });
  assert.ok(unwatched.every(run => run.system.trust.invitationsCancelled === 0));
  assert.ok(mean(watched, run => run.system.trust.invitationsCancelled) > 0);
  assert.ok(mean(watched, run => run.population.falseSubjects) < mean(unwatched, run => run.population.falseSubjects));
  assert.ok(mean(leaving, run => run.system.trust.guardianExits) > 0);
  assert.ok(watched.every(run => run.state === undefined));
  assert.throws(() => experimentConfig({ activity: { honest: { review: 2 } } }), RangeError);
});

test('cash-outs make fakes visible to flow analysis, and fabricated Self-IDs are priced separately', () => {
  const weak = { sensitivity: 0.3, activity: { honest: { inspect: 0.5, challenge: 1 }, attackers: { cashout: 0.5 } } };
  const blind = runs(weak);
  const traced = runs({ ...weak, social: { flowTracing: true } });
  assert.ok(blind.every(run => run.system.trust.cashouts > 0 && run.system.trust.flowFlagged === 0));
  assert.ok(traced.every(run => run.system.trust.flowFlagged > 0));
  assert.ok(traced.every(run => run.system.trust.flowFlaggedCoalition / run.system.trust.flowFlagged > 0.95), 'consolidation hubs point at the coalition');
  const noisy = runs({ ...weak, social: { flowTracing: true, honestTransferRate: 0.3 } });
  assert.ok(mean(noisy, run => run.system.trust.flowFlaggedCoalition / run.system.trust.flowFlagged) < mean(traced, run => run.system.trust.flowFlaggedCoalition / run.system.trust.flowFlagged), 'ordinary payments dilute flow evidence');
  const priced = runExperiment({ ...base, seed: 'priced', weights: { fakeSelfId: 3 } });
  const fakeWork = priced.effort.cohorts.attackers.byAction.fakeSelfId;
  assert.ok(fakeWork.attempts > 0);
  assert.equal(priced.effort.cohorts.honest.byAction.fakeSelfId.attempts, 0);
  assert.throws(() => experimentConfig({ social: { flowHubThreshold: 1 } }), RangeError);
});
