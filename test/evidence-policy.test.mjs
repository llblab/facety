import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHypothesis, verifyRegistration, analyzeConfirmation, reanalyzeConfirmation, confirmHypothesis,
  adjustStudy, ANALYSIS_POLICY, LEGACY_ANALYSIS_POLICY, HYPOTHESIS_SCHEMA, CONFIRMATION_SCHEMA, REANALYSIS_SCHEMA,
  LEGACY_HYPOTHESIS_SCHEMA, LEGACY_CONFIRMATION_SCHEMA } from '../src/evidence.mjs';
import { digestOf } from '../src/provenance.mjs';

function fixture({ claims = 2, contexts = 1, replicas = 5, duplicate = false, choose = (_, arm) => arm === 'a0' ? 1 : 20 } = {}) {
  const registration = registerHypothesis({
    id: 'policy-controls', statement: 'Synthetic method contract fixture', kind: 'association',
    base: { initialSize: 2, days: 1 }, statistic: { metric: 'xp.total' }, replicas, exploration: { seeds: [] },
    arms: Object.fromEntries(Array.from({ length: duplicate ? 1 : claims }, (_, i) => ['a' + i, {}])),
    claims: Array.from({ length: claims }, (_, i) => ({ id: 'c' + i, role: 'presence', contrast: { ['a' + (duplicate ? 0 : i)]: 1 }, direction: 'greater', margin: 10 })),
    contexts: Array.from({ length: contexts }, (_, i) => ({ id: 'ctx' + i, parameters: {} })),
  });
  const values = Object.fromEntries(registration.spec.contexts.map(context => [context.id,
    Object.fromEntries(Object.keys(registration.spec.arms).map(arm => [arm, Array.from({ length: replicas }, (_, i) => {
      const value = choose(context.id, arm, i);
      return { value, censored: value === null, seed: 'synthetic-' + i };
    })])),
  ]));
  return { registration, values };
}
function legacyVersion(registration) {
  const legacy = structuredClone(registration);
  legacy.schema = LEGACY_HYPOTHESIS_SCHEMA;
  delete legacy.analysisPolicy;
  legacy.hash = digestOf({ schema: legacy.schema, spec: legacy.spec, implementation: legacy.implementation.digest, randomness: legacy.randomness });
  legacy.confirmationSeed = 'confirm:' + legacy.hash;
  return legacy;
}
const envelope = (registration, values) => ({
  schema: registration.schema === HYPOTHESIS_SCHEMA ? CONFIRMATION_SCHEMA : LEGACY_CONFIRMATION_SCHEMA,
  ...(registration.analysisPolicy ? { analysisPolicy: registration.analysisPolicy } : {}),
  registrationHash: registration.hash, values,
});

test('v2 binds the selected method into its digest and v1 cannot acquire an unbound policy', () => {
  const { registration, values } = fixture();
  assert.equal(registration.schema, HYPOTHESIS_SCHEMA);
  assert.equal(registration.analysisPolicy, ANALYSIS_POLICY);
  assert.equal(registration.hash, digestOf({ schema: registration.schema, analysisPolicy: ANALYSIS_POLICY,
    spec: registration.spec, implementation: registration.implementation.digest, randomness: registration.randomness }));
  assert.equal(verifyRegistration(registration).analysisPolicy, ANALYSIS_POLICY);
  const legacy = legacyVersion(registration);
  assert.equal(verifyRegistration(legacy).analysisPolicy, LEGACY_ANALYSIS_POLICY);
  for (const change of [
    item => { item.analysisPolicy = LEGACY_ANALYSIS_POLICY; },
    item => { delete item.analysisPolicy; },
    item => { item.schema = LEGACY_HYPOTHESIS_SCHEMA; },
    item => { item.schema = LEGACY_HYPOTHESIS_SCHEMA; delete item.analysisPolicy; },
    item => { item.spec.claims[0].margin = 0; },
    item => { item.randomness.version = 'changed'; },
    item => { item.confirmationSeed = 'changed'; },
  ]) {
    const changed = structuredClone(registration);
    change(changed);
    for (const allowImplementationChange of [false, true]) assert.throws(() => analyzeConfirmation(changed, values, { allowImplementationChange }), /hypothesis:/);
  }
  assert.throws(() => analyzeConfirmation({ ...legacy, analysisPolicy: ANALYSIS_POLICY }, values, { allowImplementationChange: true }), /unknown registration field/);
  assert.throws(() => analyzeConfirmation(legacy, values, { analysisPolicy: ANALYSIS_POLICY }), /reanalysis|reanalyzeConfirmation/);
});

test('registered families preserve support, unknowns and calibrated contradiction across the meaningful partitions', () => {
  const cases = [
    [{ claims: 1, choose: () => 1 }, 'contradicted', 1 / 32],
    [{}, 'inconclusive', 1 / 16],
    [{ claims: 1, contexts: 2, choose: context => context === 'ctx0' ? 1 : 20 }, 'inconclusive', 1 / 16],
    [{ claims: 1, contexts: 2, choose: context => context === 'ctx0' ? 1 : null }, 'inconclusive', 1 / 16],
    [{ claims: 1, choose: (_, __, i) => i === 4 ? null : 1 }, 'inconclusive', 6 / 32],
    [{ claims: 1, choose: () => null }, 'inconclusive', 1],
    [{ replicas: 6 }, 'contradicted', 1 / 32],
    [{ contexts: 2, choose: () => 20 }, 'supported', 1],
    [{ duplicate: true, choose: () => 1 }, 'inconclusive', 1 / 16],
    [{ claims: 32 }, 'inconclusive', 1],
  ];
  for (const [options, verdict, p] of cases) {
    const { registration, values } = fixture(options);
    const result = analyzeConfirmation(registration, values);
    assert.equal(result.analysisPolicy, ANALYSIS_POLICY);
    assert.equal(result.verdict, verdict);
    assert.ok(Math.abs(result.contradiction.pValue - p) < 1e-12);
    assert.equal(result.contradiction.controlled, true);
    assert.equal(result.contradiction.familySize, registration.spec.claims.length * registration.spec.contexts.length);
    assert.equal(result.pValue, Math.max(...result.tests.map(row => row.pValue)));
    const legacy = analyzeConfirmation(legacyVersion(registration), values);
    assert.equal(legacy.analysisPolicy, LEGACY_ANALYSIS_POLICY);
    assert.equal(legacy.contradiction.pValue, null);
    assert.equal(legacy.contradiction.controlled, false);
    assert.deepEqual(result.tests.map(({ held, unknown, pValue, contradictionPValue }) => ({ held, unknown, pValue, contradictionPValue })),
      legacy.tests.map(({ held, unknown, pValue, contradictionPValue }) => ({ held, unknown, pValue, contradictionPValue })));
    assert.equal(legacy.verdict, legacy.tests.every(row => row.supported) ? 'supported' : legacy.contradicted.length ? 'contradicted' : 'inconclusive');
  }
});

test('family decisions ignore claim/context iteration order and refuse missing registered contexts', () => {
  const { registration, values } = fixture({ contexts: 2 });
  const reordered = registerHypothesis({ ...registration.spec,
    claims: [...registration.spec.claims].reverse(), contexts: [...registration.spec.contexts].reverse() });
  const before = analyzeConfirmation(registration, values);
  const after = analyzeConfirmation(reordered, values);
  assert.equal(before.verdict, after.verdict);
  assert.equal(before.pValue, after.pValue);
  assert.deepEqual(before.contradiction, after.contradiction);
  delete values.ctx1;
  assert.throws(() => analyzeConfirmation(registration, values), /missing context values/);
});

test('frozen historical v1 synthetic values stay legacy unless separate A reanalysis is requested', () => {
  const old = JSON.parse(readFileSync(new URL('../studies/2026-10-23-evidence-debt-review/witness.json', import.meta.url), 'utf8')).E1;
  const source = envelope(old.registration, old.values);
  const snapshot = structuredClone({ registration: old.registration, source });
  assert.throws(() => analyzeConfirmation(old.registration, old.values), /implementation changed/);
  const legacy = analyzeConfirmation(old.registration, old.values, { allowImplementationChange: true });
  assert.equal(legacy.verdict, old.verdict);
  assert.equal(legacy.tests[0].contradictionPValue, old.rawContradictionPValue);
  assert.equal(legacy.analysisPolicy, LEGACY_ANALYSIS_POLICY);
  assert.throws(() => reanalyzeConfirmation(old.registration, source, { analysisPolicy: ANALYSIS_POLICY }), /implementation changed/);
  const unchanged = reanalyzeConfirmation(old.registration, source, { allowImplementationChange: true });
  assert.equal(unchanged.methodChanged, false);
  assert.deepEqual(unchanged.analysis, legacy);
  const changed = reanalyzeConfirmation(old.registration, source, { analysisPolicy: ANALYSIS_POLICY, allowImplementationChange: true });
  assert.equal(changed.schema, REANALYSIS_SCHEMA);
  assert.equal(changed.registeredAnalysisPolicy, LEGACY_ANALYSIS_POLICY);
  assert.equal(changed.analysisPolicy, ANALYSIS_POLICY);
  assert.equal(changed.source.analysisPolicy, LEGACY_ANALYSIS_POLICY);
  assert.equal(changed.source.inputDigest, digestOf(source));
  assert.equal(changed.methodChanged, true);
  assert.equal(changed.analysis.verdict, 'inconclusive');
  assert.equal(changed.analysis.contradiction.pValue, 1);
  assert.equal(changed.implementationMatched, false);
  assert.deepEqual({ registration: old.registration, source }, snapshot);
});

test('reanalysis rejects method/transport/design tampering and does not accept a confirmation override', async () => {
  const { registration, values } = fixture();
  const confirmation = envelope(registration, values);
  for (const mutate of [
    item => { item.registrationHash = 'other'; }, item => { item.schema = LEGACY_CONFIRMATION_SCHEMA; },
    item => { delete item.analysisPolicy; }, item => { item.analysisPolicy = LEGACY_ANALYSIS_POLICY; },
    item => { item.analysis = { analysisPolicy: LEGACY_ANALYSIS_POLICY }; },
  ]) {
    const changed = structuredClone(confirmation);
    mutate(changed);
    assert.throws(() => reanalyzeConfirmation(registration, changed, { analysisPolicy: ANALYSIS_POLICY, allowImplementationChange: true }), /hypothesis:/);
  }
  for (const policy of ['unknown/v1', LEGACY_ANALYSIS_POLICY, null, 7]) assert.throws(() => reanalyzeConfirmation(registration, confirmation, { analysisPolicy: policy }), /explicit reanalysis policy/);
  const changed = structuredClone(registration);
  changed.spec.claims[0].margin = 0;
  assert.throws(() => reanalyzeConfirmation(changed, confirmation, { analysisPolicy: ANALYSIS_POLICY, allowImplementationChange: true }), /digest/);
  await assert.rejects(confirmHypothesis(registration, { analysisPolicy: LEGACY_ANALYSIS_POLICY }), /unknown confirmation options/);
  const legacy = legacyVersion(registration);
  const report = reanalyzeConfirmation(legacy, envelope(legacy, values), { analysisPolicy: ANALYSIS_POLICY });
  const study = adjustStudy([report, { schema: LEGACY_CONFIRMATION_SCHEMA, hypothesis: 'old', registrationHash: 'other', analysis: analyzeConfirmation(legacy, values) }]);
  assert.equal(study.hypotheses[0].analysisPolicy, ANALYSIS_POLICY);
  assert.equal(study.hypotheses[0].artifactSchema, REANALYSIS_SCHEMA);
  assert.equal(study.hypotheses[1].analysisPolicy, LEGACY_ANALYSIS_POLICY);
  assert.equal(study.hypotheses[0].adjustedPValue, 1);
});
