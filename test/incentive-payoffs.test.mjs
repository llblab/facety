import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runIncentiveForks } from '../src/incentives.mjs';
import { evaluateIncentivePayoffs } from '../src/incentive-payoffs.mjs';
import { FacetyModel } from '../src/model.mjs';

function preferences(overrides = {}) {
  return {
    facyValue: 1, xpValue: 0, workUnitCost: 1, admissionBenefit: 0, guaranteeBenefit: 0,
    expectedLosses: { 'invite-only': 0, 'invite-and-guarantee': 0 }, ...overrides,
  };
}
const outcomes = result => result.comparisons.map(row => row.conditionalTerminalDifference);

test('conditional terminal choices cross the measured XP break-even boundary without asserting equilibrium', () => {
  const artifact = runIncentiveForks();
  for (const xpValue of [2, 3, 4]) {
    const result = evaluateIncentivePayoffs(artifact, preferences({ xpValue }));
    assert.deepEqual(outcomes(result), [-2, xpValue - 3]);
    assert.deepEqual(result.comparisons[1].xpBreakEven, { status: 'threshold', value: 3, preferredWhen: 'xpValue > value' });
    assert.equal(result.comparisons[0].xpBreakEven.status, 'not-sensitive');
    const expected = xpValue < 3 ? ['wait-collector'] : xpValue === 3 ? ['wait-collector', 'invite-and-guarantee'] : ['invite-and-guarantee'];
    assert.deepEqual(result.choiceSummary.exactNumericalMaximizers, expected);
    assert.equal(result.choiceSummary.status, 'complete');
    assert.equal(result.fullDynamicUtility, null);
    assert.equal(result.networkExternality, null);
  }
});

test('no-incentive controls remain exact ties, while the positive-FACY counterexample favors waiting', () => {
  const artifact = runIncentiveForks();
  const zero = evaluateIncentivePayoffs(artifact, preferences({ facyValue: 0, workUnitCost: 0 }));
  assert.deepEqual(outcomes(zero), [0, 0]);
  assert.deepEqual(zero.choiceSummary.exactNumericalMaximizers, ['wait-collector', 'invite-only', 'invite-and-guarantee']);
  for (const workUnitCost of [0, 1]) {
    const result = evaluateIncentivePayoffs(artifact, preferences({ workUnitCost }));
    assert.ok(outcomes(result).every(value => value < 0));
    assert.deepEqual(result.choiceSummary.exactNumericalMaximizers, ['wait-collector']);
  }
});

test('unknown valuations propagate except where factual exposure is exactly zero', () => {
  const artifact = runIncentiveForks();
  const result = evaluateIncentivePayoffs(artifact, preferences({ xpValue: null }));
  assert.deepEqual(outcomes(result), [-2, null]);
  assert.equal(result.preferences.xpValue, null);
  assert.equal(result.comparisons[0].components.terminalXp, 0);
  assert.deepEqual(result.comparisons[1].missingComponents, ['terminalXp']);
  assert.equal(result.comparisons[1].xpBreakEven.value, 3);
  assert.equal(result.choiceSummary.status, 'partial');
  assert.equal(result.choiceSummary.exactNumericalMaximizers, null);
  assert.deepEqual(result.choiceSummary.knownMaximizers, ['wait-collector']);
  assert.deepEqual(result.choiceSummary.candidateBestResponses, ['wait-collector', 'invite-and-guarantee']);
  const unknownGuarantee = evaluateIncentivePayoffs(artifact, preferences({ guaranteeBenefit: null }));
  assert.deepEqual(outcomes(unknownGuarantee), [-2, null]);
  assert.equal(unknownGuarantee.comparisons[1].xpBreakEven.status, 'unknown-other-inputs');
});

test('unmodeled expected losses are not inferred from observed zero debt and may represent avoided losses', () => {
  const artifact = runIncentiveForks();
  const unknown = evaluateIncentivePayoffs(artifact, preferences({ expectedLosses: { 'invite-only': null, 'invite-and-guarantee': 0 } }));
  assert.deepEqual(outcomes(unknown), [null, -3]);
  assert.equal(unknown.comparisons[0].sponsor.debt, 0);
  assert.equal(unknown.comparisons[0].components.expectedLossAdjustment, null);
  assert.deepEqual(unknown.choiceSummary.candidateBestResponses, ['wait-collector', 'invite-only']);
  const avoided = evaluateIncentivePayoffs(artifact, preferences({ workUnitCost: 0, expectedLosses: { 'invite-only': -2, 'invite-and-guarantee': 0 } }));
  assert.deepEqual(outcomes(avoided), [1, -1]);
  assert.deepEqual(avoided.choiceSummary.exactNumericalMaximizers, ['invite-only']);
  const authorityDisutility = evaluateIncentivePayoffs(artifact, preferences({ xpValue: -1 }));
  assert.equal(authorityDisutility.comparisons[1].components.terminalXp, -1);
});

test('analysis is pure offline revaluation, ignores cached comparisons and preserves serialization', () => {
  const artifact = JSON.parse(JSON.stringify(runIncentiveForks()));
  artifact.comparisons = [{ sponsor: { liquidFacy: 100000, xp: 100000, effort: 0 } }];
  const before = JSON.stringify(artifact);
  const supplied = preferences();
  const preferenceBefore = JSON.stringify(supplied);
  const original = FacetyModel.prototype.createSelfId;
  let result;
  try {
    FacetyModel.prototype.createSelfId = () => { throw new Error('offline analysis must not replay the protocol'); };
    result = evaluateIncentivePayoffs(artifact, supplied);
    const changed = evaluateIncentivePayoffs(artifact, preferences({ xpValue: 4 }));
    assert.deepEqual(outcomes(changed), [-2, 1]);
  } finally { FacetyModel.prototype.createSelfId = original; }
  assert.deepEqual(outcomes(result), [-2, -3]);
  assert.equal(JSON.stringify(artifact), before);
  assert.equal(JSON.stringify(supplied), preferenceBefore);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(evaluateIncentivePayoffs(JSON.parse(before), supplied), result);
  assert.equal(result.source.workUnit, artifact.branches[0].work.unit);
  assert.deepEqual(result.source.weights, artifact.branches[0].work.weights);
});

test('numerical tolerance is a declared band, not silently rounded exact indifference', () => {
  const artifact = runIncentiveForks();
  const supplied = preferences({ facyValue: 0.1, xpValue: 0.3, workUnitCost: 0.1 });
  const exact = evaluateIncentivePayoffs(artifact, supplied);
  const band = evaluateIncentivePayoffs(artifact, supplied, { comparisonTolerance: 1e-12 });
  assert.equal(band.numericPolicy.comparisonTolerance, 1e-12);
  assert.equal(band.comparisons[1].conditionalTerminalDifference, exact.comparisons[1].conditionalTerminalDifference);
  assert.notEqual(band.comparisons[1].conditionalTerminalDifference, 0);
  assert.equal(band.comparisons[1].relation, 'within-tolerance');
  assert.deepEqual(band.choiceSummary.candidateBestResponses, ['wait-collector', 'invite-and-guarantee']);
  const negativeZero = evaluateIncentivePayoffs(artifact, preferences({ facyValue: -0, xpValue: -0, workUnitCost: -0 }));
  assert.deepEqual(JSON.parse(JSON.stringify(negativeZero)), negativeZero);
});

test('the declared-preference example emits reproducible JSON with controls, thresholds and unknowns', () => {
  const run = spawnSync(process.execPath, ['examples/incentive-payoffs.mjs'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  const result = JSON.parse(run.stdout);
  const cases = new Map(result.evaluations.map(row => [row.label, row.analysis]));
  assert.deepEqual(outcomes(cases.get('no-incentive-control')), [0, 0]);
  assert.deepEqual(outcomes(cases.get('liquidity-preference')), [-2, -3]);
  assert.deepEqual(outcomes(cases.get('authority-break-even')), [-2, 0]);
  assert.deepEqual(outcomes(cases.get('authority-above-break-even')), [-2, 1]);
  assert.deepEqual(outcomes(cases.get('unknown-authority-value')), [-2, null]);
});

test('all preferences must be explicit, with unknowns spelled null and bounded arithmetic', () => {
  const artifact = runIncentiveForks();
  for (const key of Object.keys(preferences())) {
    const missing = preferences();
    delete missing[key];
    assert.throws(() => evaluateIncentivePayoffs(artifact, missing));
    assert.throws(() => evaluateIncentivePayoffs(artifact, preferences({ [key]: undefined })));
  }
  for (const bad of [null, [], preferences({ facyValue: -1 }), preferences({ workUnitCost: -1 }), preferences({ xpValue: Infinity }), preferences({ xpValue: '1' }), preferences({ invented: 1 }), preferences({ expectedLosses: {} })]) {
    assert.throws(() => evaluateIncentivePayoffs(artifact, bad));
  }
  for (const options of [null, { comparisonTolerance: null }, { comparisonTolerance: -1 }, { comparisonTolerance: Infinity }, { invented: true }]) {
    assert.throws(() => evaluateIncentivePayoffs(artifact, preferences(), options));
  }
  assert.throws(() => evaluateIncentivePayoffs(artifact, preferences({ workUnitCost: 1e308 })), /overflow/);
  assert.throws(() => evaluateIncentivePayoffs(artifact, preferences({ admissionBenefit: -1e308, guaranteeBenefit: -1e308 })), /overflow/);
  const unknown = preferences({ facyValue: null, xpValue: null, workUnitCost: null, admissionBenefit: null, guaranteeBenefit: null, expectedLosses: { 'invite-only': null, 'invite-and-guarantee': null } });
  assert.deepEqual(outcomes(evaluateIncentivePayoffs(artifact, unknown)), [null, null]);
});
