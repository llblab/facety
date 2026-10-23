// Owns: Synthetic offline-analysis counterexamples, not confirmation runs or protocol policy.
import assert from 'node:assert/strict';
import { registerHypothesis, verifyRegistration, analyzeConfirmation } from '../../src/evidence.mjs';
import { binomialLowerTail, holm } from '../../src/statistics.mjs';
import { provenance } from '../../src/provenance.mjs';

const specification = {
  id: 'review-registration-boundary', statement: 'Synthetic registered-analysis boundary probe',
  kind: 'association', base: { initialSize: 4, days: 1 },
  statistic: { metric: 'xp.total' }, arms: { a: {} },
  claims: [{ id: 'positive', role: 'presence', contrast: { a: 1 }, direction: 'greater', margin: 10 }],
  replicas: 5, exploration: { seeds: [], source: 'Synthetic diagnostic; no experiment or confirmation executed' },
};
const rows = (value, censored = false, repeatedSeed = false) => Array.from({ length: 5 }, (_, i) => ({
  value, censored, seed: repeatedSeed ? 'synthetic-duplicate' : `synthetic-replica-${i}`,
}));
const registration = registerHypothesis(specification);
assert.equal(verifyRegistration(registration).implementationMatched, true);
const retained = { base: { a: rows(1) } };
const original = analyzeConfirmation(registration, retained);
const tampered = structuredClone(registration);
tampered.spec.claims[0].margin = 0;
let verificationError;
try { verifyRegistration(tampered); } catch (error) { verificationError = error.message; }
assert.match(verificationError, /digest does not match/);
const changed = analyzeConfirmation(tampered, retained);
assert.equal(original.verdict, 'contradicted');
assert.equal(changed.verdict, 'supported');
assert.equal(tampered.hash, registration.hash);

const armNames = Array.from({ length: 32 }, (_, i) => `a${i}`);
const family = registerHypothesis({
  ...specification, id: 'review-contradiction-family',
  arms: Object.fromEntries(armNames.map(name => [name, {}])),
  claims: armNames.map((name, i) => ({
    id: `c${i}`, role: 'presence', contrast: { [name]: 1 }, direction: 'greater', margin: 10,
  })),
});
assert.equal(verifyRegistration(family).implementationMatched, true);
const familyValues = { base: Object.fromEntries(armNames.map((name, i) => [name, rows(i === 0 ? 1 : 20)])) };
const analyzed = analyzeConfirmation(family, familyValues);
const adjusted = holm(analyzed.tests.map(test => test.contradictionPValue));
assert.equal(analyzed.verdict, 'contradicted');
assert.equal(analyzed.tests[0].contradictionPValue, 1 / 32);
assert.equal(adjusted[0], 1);
const conditionalProbability = 1 - (1 - binomialLowerTail(0, 5, 0.6)) ** 32;
assert(Math.abs(conditionalProbability - 0.28062267211876313) < 1e-12);

const unverifiedInput = { base: { a: rows(20, true, true) } };
const inconsistent = analyzeConfirmation(registration, unverifiedInput);
assert.equal(inconsistent.verdict, 'supported');
assert.equal(inconsistent.tests[0].unknown, 0);

console.log(JSON.stringify({
  baseline: 'a40fdb0f3879866137c04f2f4f3d41276e07f311', provenance: provenance(),
  method: 'Synthetic retained values and in-memory registrations; no simulations or confirmations',
  randomness: 'none-supplied-synthetic-rows-v1',
  E1: { registration: family, values: familyValues, verdict: analyzed.verdict,
    rawContradictionPValue: analyzed.tests[0].contradictionPValue, holmComparisonPValue: adjusted[0],
    hypotheticalIndependentHoldProbability: 0.6, hypotheticalIndependentFalseContradictionProbability: conditionalProbability,
    limitation: 'Conditional mathematical illustration, not an observed simulator-study error rate. Holm is a comparison, not a selected remedy.' },
  E2: { registration, values: retained, originalVerdict: original.verdict,
    changedMargin: tampered.spec.claims[0].margin, unchangedHash: tampered.hash === registration.hash,
    verifyRegistrationError: verificationError, changedNativeAnalysisVerdict: changed.verdict,
    limitation: 'Native API boundary only; inspected CLI and confirmation callers verify first.' },
  retainedInputObservation: { values: unverifiedInput, verdict: inconsistent.verdict, unknown: inconsistent.tests[0].unknown,
    limitation: 'Inconsistent supplied rows accepted; no demonstration that native simulation generates them. Trust-boundary policy remains unresolved.' },
}, null, 2));
