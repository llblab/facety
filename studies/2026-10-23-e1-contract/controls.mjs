// Owns: Synthetic decision-contract comparisons; no selected inference policy or simulator execution.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHypothesis, analyzeConfirmation, adjustStudy } from '../../src/evidence.mjs';
import { holm, binomialLowerTail } from '../../src/statistics.mjs';
import { provenance } from '../../src/provenance.mjs';

const alpha = 0.05;
const makeSpec = (id, claims = 1, contexts = 1, replicas = 5, duplicate = false) => ({
  id, statement: 'Synthetic contract fixture, not simulator-generated or confirmatory evidence', kind: 'association',
  base: { days: 1 }, statistic: { metric: 'xp.total', summary: 'endpoint' }, replicas, alpha,
  arms: Object.fromEntries(Array.from({ length: duplicate ? 1 : claims }, (_, i) => ['a' + i, { 'activity.honest.selfId': i % 2 }])),
  claims: Array.from({ length: claims }, (_, i) => ({ id: 'c' + i, role: 'presence', contrast: { ['a' + (duplicate ? 0 : i)]: 1 }, direction: 'greater', margin: 10, probability: 0.5 })),
  contexts: Array.from({ length: contexts }, (_, i) => ({ id: 'ctx' + i, parameters: { 'social.gossipHops': i } })),
  exploration: { seeds: [] },
});
const retainedValues = (spec, choose) => Object.fromEntries(spec.contexts.map(context => [context.id,
  Object.fromEntries(Object.keys(spec.arms).map(arm => [arm, Array.from({ length: spec.replicas }, (_, i) => {
    const value = choose(context.id, arm, i);
    return { value, censored: value === null, seed: 'synthetic-row-' + i };
  })])),
]));
const summarize = (registration, values) => {
  const analysis = analyzeConfirmation(registration, values);
  const raw = analysis.tests.map(test => test.contradictionPValue);
  assert.equal(raw.length, registration.spec.claims.length * registration.spec.contexts.length, 'family is the complete registered claim/context product');
  const adjusted = holm(raw);
  const familyP = Math.min(1, raw.length * Math.min(...raw));
  assert.equal(Math.min(...adjusted), familyP, 'Holm and Bonferroni minima agree for the any-component decision');
  const candidateA = analysis.verdict === 'supported' ? 'supported' : familyP <= alpha ? 'contradicted' : 'inconclusive';
  const candidateB = analysis.verdict === 'supported' ? 'supported' : raw.some(p => p <= alpha) ? 'component-flagged' : 'inconclusive';
  return { registrationHash: registration.hash, components: raw.length, supportP: analysis.pValue,
    nativeVerdict: analysis.verdict, unselectedCandidateA: candidateA, unselectedCandidateB: candidateB,
    familyContradictionP: familyP,
    componentTests: analysis.tests.map((test, i) => ({ context: test.context, claim: test.claim, held: test.held,
      unknown: test.unknown, rawContradictionP: raw[i], holmContradictionP: adjusted[i] })) };
};
const definitions = [
  { id: 'single-negative', expected: ['contradicted', 'contradicted'], choose: () => 1 },
  { id: 'two-claims', claims: 2, expected: ['contradicted', 'inconclusive'], choose: (_, arm) => arm === 'a0' ? 1 : 20 },
  { id: 'two-contexts', contexts: 2, expected: ['contradicted', 'inconclusive'], choose: context => context === 'ctx0' ? 1 : 20 },
  { id: 'unknown-context-counted', contexts: 2, expected: ['contradicted', 'inconclusive'], choose: context => context === 'ctx0' ? 1 : null },
  { id: 'single-one-unknown', expected: ['inconclusive', 'inconclusive'], choose: (_, __, i) => i === 4 ? null : 1 },
  { id: 'all-unknown', expected: ['inconclusive', 'inconclusive'], choose: () => null },
  { id: 'two-claims-stronger', claims: 2, replicas: 6, expected: ['contradicted', 'contradicted'], choose: (_, arm) => arm === 'a0' ? 1 : 20 },
  { id: 'all-supported', claims: 2, contexts: 2, expected: ['supported', 'supported'], choose: () => 20 },
  { id: 'duplicate-tests', claims: 2, duplicate: true, expected: ['contradicted', 'inconclusive'], choose: () => 1 },
];
const fixtures = definitions.map(definition => {
  const spec = makeSpec('e1-contract:' + definition.id, definition.claims, definition.contexts, definition.replicas, definition.duplicate);
  const registration = registerHypothesis(spec);
  const values = retainedValues(spec, definition.choose);
  const result = summarize(registration, values);
  assert.deepEqual([result.nativeVerdict, result.unselectedCandidateA], definition.expected);
  assert.equal(result.unselectedCandidateB === 'component-flagged', result.nativeVerdict === 'contradicted');
  return { id: definition.id, replicas: spec.replicas, ...result };
});
const spec = makeSpec('e1-contract:permutation', 2, 2);
const values = retainedValues(spec, (context, arm) => context === 'ctx0' && arm === 'a0' ? 1 : 20);
const original = summarize(registerHypothesis(spec), values);
const reordered = summarize(registerHypothesis({ ...spec, claims: [...spec.claims].reverse(), contexts: [...spec.contexts].reverse() }), values);
const decisions = result => [...result.componentTests].sort((a, b) => JSON.stringify([a.context, a.claim]).localeCompare(JSON.stringify([b.context, b.claim])));
assert.deepEqual(decisions(original), decisions(reordered));
for (const key of ['nativeVerdict', 'supportP', 'familyContradictionP', 'unselectedCandidateA', 'unselectedCandidateB']) assert.equal(original[key], reordered[key]);
const incomplete = structuredClone(values);
delete incomplete.ctx1;
assert.throws(() => analyzeConfirmation(registerHypothesis(spec), incomplete), /missing context values/);
const example = registerHypothesis(makeSpec('e1-contract:study-support-only', 2));
const analysis = analyzeConfirmation(example, retainedValues(example.spec, (_, arm) => arm === 'a0' ? 1 : 20));
const study = adjustStudy([{ hypothesis: example.spec.id, registrationHash: example.hash, analysis }]);
assert.equal(study.hypotheses[0].unadjustedVerdict, 'contradicted');
assert.equal(study.hypotheses[0].adjustedPValue, analysis.pValue);
const old = JSON.parse(readFileSync(new URL('../2026-10-23-evidence-debt-review/witness.json', import.meta.url), 'utf8')).E1;
assert.equal(old.rawContradictionPValue, 0.03125);
assert.equal(old.holmComparisonPValue, 1);
const independentComponentRate = binomialLowerTail(0, 5, 0.6);
console.log(JSON.stringify({
  level: 'diagnostic', provenance: provenance(), method: 'Native analysis of newly supplied synthetic scalar rows, plus unselected arithmetic overlays. No confirmHypothesis, model execution or historical reanalysis.',
  fixtures, permutation: { components: original.components, decisionFieldsAndKeyedComponentsEqual: true, bootstrapIntervalsNotCompared: true },
  missingContext: 'Native analysis rejects a missing registered context; it is not removed from the family',
  studyCorrection: { method: study.method, onlySupportAdjusted: true, unadjustedVerdict: study.hypotheses[0].unadjustedVerdict },
  reusedHistoricalWitness: { path: 'studies/2026-10-23-evidence-debt-review/witness.json', originalImplementation: old.registration.implementation,
    nativeVerdictRecordedPreviously: old.verdict, rawContradictionP: old.rawContradictionPValue,
    comparisonPRecordedPreviously: old.holmComparisonPValue, currentNativeReanalysisExecuted: false },
  conditionalMathematics: { replicas: 5, components: 32, trueHoldProbability: 0.6, declaredHoldProbability: 0.5,
    independentComponentFalseFlagProbability: independentComponentRate,
    independentAnyFalseFlagProbability: 1 - (1 - independentComponentRate) ** 32,
    perfectlyDependentAnyFalseFlagProbability: independentComponentRate,
    note: 'Two specified joint-distribution examples, not simulator or historical error-rate estimates' },
  boundaries: ['Candidates A/B are unselected', 'Source/registration verification and unknown semantics unchanged', 'No claim of joint support/refutation or cross-hypothesis error control', 'Synthetic values are not native-generator realizations or evidence-authenticated inputs'],
}, null, 2));
