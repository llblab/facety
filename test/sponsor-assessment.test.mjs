import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessSponsorship, SPONSOR_ASSESSMENT_POLICY } from '../src/sponsor-assessment.mjs';
import { EvidenceRelay, accountabilitySnapshot } from '../src/accountability.mjs';
import { actObservationEnvironment } from '../src/act-observations.mjs';
import { experimentConfig } from '../src/experiment.mjs';
import { causalWorld } from '../examples/causal-walkthroughs.mjs';
import { runActRelayExample } from '../examples/act-relay.mjs';

const positive = { suspicious: true, distinctSource: true };
function profile(overrides = {}) {
  return { goal: 'seek-correction', utilityUnit: 'supplied-private-units',
    beliefs: { positiveDistinct: 0.9, positiveShared: 0.1, negative: 0.05, missing: null },
    payoffs: { upheld: 8, rejected: -4, participation: 0, workCost: 1, abstain: 0 }, ...overrides };
}
function setup({ valid = true, genuine = true, behaviorProfile = 'good-faith', sponsor = 'Bela', budget = 12, traceLimit = 200, reviewed = true } = {}) {
  const world = causalWorld();
  const native = world.model.selfId(world.acts.Mira);
  const rates = Object.fromEntries(['self-id', 'invitation', 'guarantee'].map(kind => [kind,
    { ordinary: { valid: 1, invalid: 1 }, guarantor: { valid: 1, invalid: 1 } }]));
  const environment = actObservationEnvironment({ subjects: [{ id: 'Mira', genuine, behaviorProfile }],
    acts: [{ id: native.id, kind: 'self-id', subject: 'Mira', recordedAt: native.recordedAt, valid }] },
  { seed: 'sponsor-assessment-software-only', rates });
  const rules = experimentConfig({ disputes: { enabled: true } }).disputes;
  const relay = new EvidenceRelay(world.model, { claim: 'act-defect', rules, traceLimit, actors: [
    { id: 'Outside', subject: null, budget: 12, reviewCapacity: 0 },
    { id: 'Aster', subject: 'Aster', budget, reviewCapacity: 2 },
    { id: 'Bela', subject: 'Bela', budget, reviewCapacity: 2 },
  ] });
  const observed = relay.observeAct('Outside', native.id, environment, { role: 'ordinary', opportunity: 'source', sourceGroup: 'media' });
  const packageId = relay.package('Outside', [observed.value]).value;
  relay.route('Outside', packageId, sponsor);
  if (reviewed) relay.reviewAct(sponsor, packageId, environment, { role: 'guarantor', opportunity: 'review', sourceGroup: 'other-tag' });
  return { ...world, relay, packageId, sponsor };
}

test('4860 finite private-value partitions match an independent direct threshold oracle across all received-evidence bases', () => {
  let count = 0;
  const evidence = [positive, { suspicious: true, distinctSource: false }, { suspicious: false, distinctSource: true }, { suspicious: null, distinctSource: null }];
  for (const p of [0, 0.1, 0.5, 0.9, 1]) for (const upheld of [-2, 0, 4]) for (const rejected of [-5, 0, 3])
    for (const participation of [-1, 0, 6]) for (const workCost of [0, 1, 3]) for (const abstain of [-2, 0, 2]) for (const received of evidence) {
      const supplied = profile({ beliefs: { positiveDistinct: p, positiveShared: p, negative: p, missing: p },
        payoffs: { upheld, rejected, participation, workCost, abstain } });
      const actual = assessSponsorship(received, supplied);
      const difference = p * upheld + (1 - p) * rejected + participation - workCost - abstain;
      assert.equal(actual.differenceFromAbstention, difference === 0 ? 0 : difference);
      assert.equal(actual.willing, difference > 0 ? true : difference < 0 ? false : null);
      assert.equal(actual.policy, SPONSOR_ASSESSMENT_POLICY);
      count++;
    }
  assert.equal(count, 4860);
});

test('received evidence selects subjective prospects; futile correction and independent participation benefit can lead to different choices', () => {
  const normal = profile();
  assert.equal(assessSponsorship(positive, normal).willing, true);
  assert.equal(assessSponsorship({ suspicious: false, distinctSource: false }, normal).willing, false);
  const futile = profile({ beliefs: { ...normal.beliefs, positiveDistinct: 0 } });
  assert.equal(assessSponsorship(positive, futile).willing, false);
  assert.equal(assessSponsorship(positive, { ...futile, goal: 'adversarial-label-only' }).willing, false, 'a label is not a magic behavioral rule');
  const privateBenefit = { ...futile, payoffs: { ...futile.payoffs, participation: 10 } };
  assert.equal(assessSponsorship(positive, privateBenefit).willing, true);
  assert.equal(assessSponsorship(positive, { ...privateBenefit, goal: 'adversarial' }).willing, true);
});

test('ties and unknowns remain undetermined; zero-probability missing outcomes are irrelevant rather than imputed', () => {
  const tie = profile({ beliefs: { positiveDistinct: 0.5, positiveShared: null, negative: null, missing: null },
    payoffs: { upheld: 4, rejected: -4, participation: 0, workCost: 0, abstain: 0 } });
  assert.equal(assessSponsorship(positive, tie).status, 'indifferent');
  assert.equal(assessSponsorship(positive, tie).willing, null);
  const unknown = assessSponsorship({ suspicious: null, distinctSource: null }, profile());
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.basis, 'missing');
  assert.equal(unknown.willing, null);
  const certain = profile({ beliefs: { positiveDistinct: 1, positiveShared: 0, negative: null, missing: null },
    payoffs: { upheld: 8, rejected: null, participation: 0, workCost: 1, abstain: 0 } });
  assert.equal(assessSponsorship(positive, certain).differenceFromAbstention, 7);
  assert.equal(assessSponsorship({ suspicious: true, distinctSource: false }, certain).willing, null);
  const absentCost = profile({ payoffs: { ...profile().payoffs, workCost: null } });
  assert.equal(assessSponsorship(positive, absentCost).willing, null);
});

test('closed schemas reject hidden truth, malformed probabilities/payoffs and overflow; snapshots and call order are inert', () => {
  const input = profile();
  const result = assessSponsorship(positive, input);
  input.beliefs.positiveDistinct = 0;
  assert.equal(result.profile.beliefs.positiveDistinct, 0.9);
  result.profile.payoffs.workCost = 999;
  assert.equal(input.payoffs.workCost, 1);
  for (const extra of [{ valid: true }, { genuine: true }, { targetProfile: 'good' }]) {
    assert.throws(() => assessSponsorship({ ...positive, ...extra }, profile()), /declared fields/);
    assert.throws(() => assessSponsorship(positive, { ...profile(), ...extra }), /declared fields/);
  }
  assert.throws(() => assessSponsorship({ suspicious: null, distinctSource: true }, profile()), /missing pair/);
  for (const invalid of [-0.1, 1.1, NaN, Infinity, '0.9']) assert.throws(() => assessSponsorship(positive, profile({ beliefs: { ...profile().beliefs, positiveDistinct: invalid } })));
  assert.throws(() => assessSponsorship(positive, profile({ payoffs: { ...profile().payoffs, workCost: -1 } })));
  assert.throws(() => assessSponsorship(positive, profile({ payoffs: { ...profile().payoffs, participation: Infinity } })));
  assert.throws(() => assessSponsorship(positive, profile({ payoffs: { upheld: Number.MAX_VALUE, rejected: Number.MAX_VALUE, participation: Number.MAX_VALUE, workCost: 0, abstain: 0 } })), /overflow/);
  const before = assessSponsorship(positive, profile());
  assessSponsorship({ suspicious: false, distinctSource: false }, input);
  assert.deepEqual(assessSponsorship(positive, profile()), before);
});

test('paid conditional decisions separate eligibility/willingness/attempt/case and retain receipts with tracing off', () => {
  for (const traceLimit of [0, 1, 200]) for (const willing of [false, true]) {
    const world = setup({ traceLimit });
    const before = accountabilitySnapshot(world.model);
    const preferences = willing ? profile() : profile({ beliefs: { ...profile().beliefs, positiveDistinct: 0 } });
    const result = world.relay.sponsor('Bela', world.packageId, preferences);
    assert.equal(result.reason, willing ? 'act-defect-adjudication-unimplemented' : 'sponsor-declined');
    assert.equal(result.decision.assessment.willing, willing);
    assert.equal(result.decision.access.allowed, true);
    assert.equal(result.decision.attempted, willing);
    assert.equal(result.decision.caseOpened, false);
    assert.equal(result.decision.entrySupported, false);
    assert.deepEqual(world.relay.snapshot().packages[0].routes[0].decisions, [result.decision]);
    result.decision.assessment.profile.goal = 'caller-mutation';
    assert.notEqual(world.relay.snapshot().packages[0].routes[0].decisions[0].assessment.profile.goal, 'caller-mutation');
    assert.deepEqual(accountabilitySnapshot(world.model), before);
    assert.equal(world.relay.snapshot().cases.length, 0);
  }
  const unpaid = setup({ budget: 1 });
  const denied = unpaid.relay.sponsor('Bela', unpaid.packageId, profile());
  assert.equal(denied.reason, 'work-budget-exhausted');
  assert.equal(denied.decision, undefined);
  assert.equal(unpaid.relay.trace().records.at(-1).visible.assessment, null);
  assert.equal(unpaid.relay.snapshot().packages[0].routes[0].decisions, undefined);
});

test('willingness is not authority or observed harm: equal-XP, poor-stake and missing-evidence paths preserve gates and nulls', () => {
  const equal = setup({ sponsor: 'Aster' });
  const result = equal.relay.sponsor('Aster', equal.packageId, profile());
  assert.equal(result.decision.assessment.willing, true);
  assert.equal(result.decision.access.allowed, false);
  assert.equal(result.decision.attempted, false);
  assert.equal(result.reason, 'challenge XP gate');
  const poor = setup();
  poor.model.transferFacy('Bela', 'Aster', poor.model.subject('Bela').liquidFacy);
  const before = accountabilitySnapshot(poor.model);
  const denied = poor.relay.sponsor('Bela', poor.packageId, profile());
  assert.equal(denied.reason, 'insufficient challenge stake');
  assert.equal(denied.decision.assessment.willing, true);
  assert.equal(denied.decision.attempted, false);
  assert.deepEqual(accountabilitySnapshot(poor.model), before);
  const missing = setup({ reviewed: false });
  const unknown = missing.relay.sponsor('Bela', missing.packageId, profile());
  assert.equal(unknown.reason, 'sponsor-willingness-undetermined');
  assert.equal(unknown.decision.assessment.basis, 'missing');
  assert.equal(unknown.decision.reviewedRoute, false);
  assert.equal(unknown.decision.attempted, false);
});

test('fixed observer preferences and received evidence isolate hidden target validity/personhood/profile throughout conditional entry', () => {
  const outputs = [];
  for (const facts of [{ valid: true, genuine: true }, { valid: false, genuine: true }, { valid: true, genuine: false, behaviorProfile: 'adversarial' }]) {
    const world = setup(facts);
    const result = world.relay.sponsor('Bela', world.packageId, profile());
    world.relay.snapshot(); world.relay.trace();
    outputs.push({ result, relay: world.relay.snapshot(), trace: world.relay.trace(), model: accountabilitySnapshot(world.model) });
  }
  assert.deepEqual(outputs[0], outputs[1]);
  assert.deepEqual(outputs[1], outputs[2]);
});

test('the no-profile act relay remains exactly its prior software example after excluding only implementation fingerprint', () => {
  const { implementation: previous, ...expected } = JSON.parse(readFileSync(new URL('../studies/2026-10-24-act-relay/software-example.json', import.meta.url)));
  const { implementation: current, ...actual } = runActRelayExample();
  assert.deepEqual(actual, expected);
});
