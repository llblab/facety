// Owns: Reanalysis-integrity repair witnesses; no simulation, new scientific rule or debt mutation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeConfirmation, verifyRegistration } from '../../src/evidence.mjs';
import { holm } from '../../src/statistics.mjs';
import { provenance } from '../../src/provenance.mjs';

const historical = JSON.parse(readFileSync(new URL('../2026-10-23-evidence-debt-review/witness.json', import.meta.url), 'utf8'));
const { registration, values } = historical.E2;
assert.equal(verifyRegistration(registration, { allowImplementationChange: true }).implementationMatched, false);
assert.throws(() => analyzeConfirmation(registration, values), /implementation changed/);
const valid = analyzeConfirmation(registration, values, { allowImplementationChange: true });
assert.equal(valid.verdict, historical.E2.originalVerdict);
const changed = structuredClone(registration);
changed.spec.claims[0].margin = historical.E2.changedMargin;
let changedError;
try { analyzeConfirmation(changed, values, { allowImplementationChange: true }); } catch (error) { changedError = error.message; }
assert.match(changedError, /digest does not match/);

const originalE1 = historical.E1;
const e1 = analyzeConfirmation(originalE1.registration, originalE1.values, { allowImplementationChange: true });
assert.equal(e1.verdict, originalE1.verdict);
assert.equal(e1.tests[0].contradictionPValue, originalE1.rawContradictionPValue);
assert.equal(holm(e1.tests.map(test => test.contradictionPValue))[0], originalE1.holmComparisonPValue);
console.log(JSON.stringify({
  provenance: provenance(), sourceArtifact: 'studies/2026-10-23-evidence-debt-review/witness.json',
  reviewedImplementation: historical.provenance.implementation,
  method: 'Pure reanalysis of retained synthetic input, not a confirmation replay',
  E2: { originalHistoricalVerdict: valid.verdict, historicalImplementationOverrideRequired: true,
    oldTamperedVerdict: historical.E2.changedNativeAnalysisVerdict, changedDesignNowRejected: changedError },
  E1: { verdict: e1.verdict, rawP: e1.tests[0].contradictionPValue,
    holmComparisonP: holm(e1.tests.map(test => test.contradictionPValue))[0], inferenceUnchanged: true },
  boundaries: ['No confirmation or model simulation', 'Historical files unchanged', 'E1 and offline value provenance contracts remain unresolved'],
}, null, 2));
