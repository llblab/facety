import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHypothesis, verifyRegistration, confirmHypothesis, analyzeConfirmation, adjustStudy, runStatistic, sharpeningDesign } from '../src/evidence.mjs';
import { runExperiment } from '../src/experiment.mjs';
import { mapTasks } from '../src/parallel.mjs';
import { digestOf } from '../src/provenance.mjs';

const base = { scenario: 'sybil-cone', initialSize: 8, attackerShare: 0.25, days: 10 };
const minimal = (overrides = {}) => ({
  id: 'h', statement: 'A declared effect', kind: 'association', base,
  statistic: { metric: 'xp.total' },
  arms: { full: {}, ablated: { 'ablations.withholdGuarantorXp': true } },
  claims: [{ id: 'present', role: 'presence', contrast: { full: 1, ablated: -1 }, direction: 'greater' }],
  replicas: 5, exploration: { seeds: ['exploration-1'] },
  ...overrides,
});
const row = value => ({ value, censored: false, seed: 's' });
const values = (full, ablated) => ({ base: { full: full.map(row), ablated: ablated.map(row) } });

test('registration fails closed on designs that cannot be evidence', () => {
  assert.throws(() => registerHypothesis(minimal({ replicas: 4 })), /cannot reach alpha/);
  assert.throws(() => registerHypothesis(minimal({ kind: 'mechanism' })), /necessity claim/);
  assert.throws(() => registerHypothesis(minimal({
    kind: 'mechanism',
    claims: [...minimal().claims, { id: 'needs', role: 'necessity', contrast: { full: 1, ablated: -1 }, direction: 'greater' }],
  })), /alternative/);
  assert.throws(() => registerHypothesis(minimal({ statistic: { metric: 'xp.unknown' } })), /unknown statistic/);
  assert.throws(() => registerHypothesis(minimal({ arms: { full: { seed: 'x' } } })), /seed/);
  assert.throws(() => registerHypothesis(minimal({ contexts: [{ id: 'c', parameters: { 'ablations.withholdGuarantorXp': false } }] })), /both set/);
  assert.throws(() => registerHypothesis(minimal({ exploration: undefined })), /exploration/);
});

test('registration digests the normalized design and detects tampering', () => {
  const a = registerHypothesis(minimal());
  const b = registerHypothesis({ ...minimal(), arms: { ablated: { 'ablations.withholdGuarantorXp': true }, full: {} } });
  assert.equal(a.hash, b.hash);
  assert.equal(a.confirmationSeed, 'confirm:' + a.hash);
  assert.equal(a.plannedRuns, 10);
  assert.equal(verifyRegistration(a).implementationMatched, true);
  const tampered = structuredClone(a);
  tampered.spec.claims[0].margin = -1 + 1.5;
  assert.throws(() => verifyRegistration(tampered), /digest/);
  const otherCode = structuredClone(a);
  otherCode.implementation.digest = '0'.repeat(64);
  assert.throws(() => verifyRegistration(otherCode), /digest/);
});

test('native reanalysis verifies registered design before evaluating retained values', () => {
  const registration = registerHypothesis(minimal());
  const retained = values([3, 3, 3, 3, 3], [1, 1, 1, 1, 1]);
  const before = structuredClone({ registration, retained });
  const expected = analyzeConfirmation(registration, retained);
  assert.equal(expected.verdict, 'supported');
  assert.deepEqual(analyzeConfirmation(JSON.parse(JSON.stringify(registration)), retained), expected);
  for (const change of [
    item => { item.spec.claims[0].margin = 10; },
    item => { item.spec.claims[0].margin = 0; delete item.spec.claims[0].probability; },
    item => { item.randomness.version = 'changed'; },
    item => { item.confirmationSeed = 'different'; },
    item => { item.schema = 'unknown'; },
  ]) {
    const changed = structuredClone(registration);
    change(changed);
    for (const allowImplementationChange of [false, true]) {
      assert.throws(() => analyzeConfirmation(changed, retained, { allowImplementationChange }), /hypothesis:/);
    }
  }
  assert.deepEqual({ registration, retained }, before);
});

test('native reanalysis and confirmation preserve explicit historical implementation compatibility', async () => {
  const registration = registerHypothesis(minimal());
  const historical = structuredClone(registration);
  historical.implementation.digest = '0'.repeat(64);
  historical.hash = digestOf({ schema: historical.schema, spec: historical.spec, analysisPolicy: historical.analysisPolicy,
    implementation: historical.implementation.digest, randomness: historical.randomness });
  historical.confirmationSeed = 'confirm:' + historical.hash;
  const retained = values([3, 3, 3, 3, 3], [1, 1, 1, 1, 1]);
  assert.equal(verifyRegistration(historical, { allowImplementationChange: true }).implementationMatched, false);
  assert.throws(() => analyzeConfirmation(historical, retained), /implementation changed/);
  const analysis = analyzeConfirmation(historical, retained, { allowImplementationChange: true });
  assert.equal(analysis.verdict, 'supported');
  assert.deepEqual(analyzeConfirmation(JSON.parse(JSON.stringify(historical)), retained, { allowImplementationChange: true }), analysis);
  await assert.rejects(confirmHypothesis(historical), /implementation changed/);
  const confirmed = await confirmHypothesis(historical, { allowImplementationChange: true });
  assert.equal(confirmed.implementationMatched, false);
  assert.deepEqual(confirmed.analysis, analyzeConfirmation(historical, confirmed.values, { allowImplementationChange: true }));
  historical.spec.claims[0].margin = 10;
  assert.throws(() => analyzeConfirmation(historical, retained, { allowImplementationChange: true }), /digest/);
});

test('exact claim tests support, contradict or withhold judgment and count unknowns against the claim', () => {
  const registration = registerHypothesis(minimal());
  const supported = analyzeConfirmation(registration, values([3, 3, 3, 3, 3], [1, 1, 1, 1, 1]));
  assert.equal(supported.verdict, 'supported');
  assert.equal(supported.pValue, 1 / 32);
  assert.equal(supported.evidence, 'association-supported-within-model');
  const contradicted = analyzeConfirmation(registration, values([1, 1, 1, 1, 1], [1, 1, 1, 1, 1]));
  assert.equal(contradicted.verdict, 'contradicted');
  const unknown = analyzeConfirmation(registration, values([3, 3, 3, 3, null], [1, 1, 1, 1, 1]));
  assert.equal(unknown.verdict, 'inconclusive');
  assert.equal(unknown.tests[0].unknown, 1);
  assert.ok(Math.abs(unknown.tests[0].pValue - 6 / 32) < 1e-12);
  assert.throws(() => analyzeConfirmation(registration, values([1], [1])), /incomplete/);
});

test('an A/A null control flags a component difference and supports equivalence without overclaiming aggregate refutation', async () => {
  const registration = registerHypothesis(minimal({
    arms: { a: {}, b: {} },
    claims: [
      { id: 'different', role: 'presence', contrast: { a: 1, b: -1 }, direction: 'greater' },
      { id: 'equal', role: 'presence', contrast: { a: 1, b: -1 }, direction: 'within', margin: 0 },
    ],
  }));
  const result = await confirmHypothesis(registration);
  const [different, equal] = result.analysis.tests;
  assert.equal(different.contradicted, true);
  assert.equal(equal.supported, true);
  assert.equal(result.analysis.verdict, 'inconclusive');
  assert.equal(result.analysis.contradiction.pValue, 1 / 16);
});

test('a mechanism claim needs presence, necessity and a named alternative control on reserved seeds', async () => {
  const registration = registerHypothesis(minimal({
    kind: 'mechanism', statement: 'Guarantor XP sharing adds effective XP beyond Self-ID owners',
    arms: { full: {}, ablated: { 'ablations.withholdGuarantorXp': true }, 'equal-rates': { 'activity.attackers.selfId': 0.8 } },
    claims: [
      { id: 'present', role: 'presence', contrast: { full: 1 }, direction: 'greater', margin: 0 },
      { id: 'needs-guarantor-xp', role: 'necessity', contrast: { full: 1, ablated: -1 }, direction: 'greater' },
      { id: 'not-rate-artifact', role: 'alternative', contrast: { 'equal-rates': 1 }, direction: 'greater' },
    ],
    alternatives: [{ id: 'rates', explanation: 'Higher attacker Self-ID rate alone creates the XP', claim: 'not-rate-artifact' }],
  }));
  const sequential = await confirmHypothesis(registration);
  assert.equal(sequential.analysis.verdict, 'supported');
  assert.equal(sequential.analysis.evidence, 'mechanism-supported-within-model');
  assert.ok(Object.values(sequential.values.base.full).every(item => item.seed.includes(registration.hash)));
  const parallel = await confirmHypothesis(registration, { workers: 2 });
  assert.deepEqual(parallel.values, sequential.values);
  const study = adjustStudy([sequential, { ...sequential, registrationHash: 'other', analysis: { ...sequential.analysis, pValue: 0.5 } }]);
  assert.equal(study.hypotheses[0].adjustedPValue, 2 * sequential.analysis.pValue);
  assert.equal(study.hypotheses[1].supported, false);
});

test('run statistics use declared windows, differences and conservative missingness', () => {
  const run = runExperiment({ ...base, seed: 'statistic' });
  const endpoint = runStatistic(run, { metric: 'subjects', summary: 'endpoint', window: null, subtract: null });
  assert.equal(endpoint, run.history.filter(point => point.stage === 'day-end').at(-1).subjects);
  const change = runStatistic(run, { metric: 'subjects', summary: 'change', window: { startDay: 2, endDay: 10 }, subtract: null });
  assert.equal(change, endpoint - run.history.filter(point => point.stage === 'day-end')[2].subjects);
  assert.equal(runStatistic(run, { metric: 'subjects', summary: 'endpoint', window: null, subtract: 'subjects' }), 0);
  assert.equal(runStatistic(run, { metric: 'xp.gini', summary: 'mean', window: null, subtract: null }), null, 'undefined early Gini is not averaged away');
  assert.equal(runStatistic(run, { metric: 'outcome.success' }), Number(run.outcome.success));
  assert.equal(runStatistic({ ...run, outcome: { ...run.outcome, censored: true } }, { metric: 'subjects', summary: 'endpoint', window: null, subtract: null }), null);
});

test('worker execution preserves task order and propagates task failures', async () => {
  const module = new URL('../src/evidence.mjs', import.meta.url).href;
  const tasks = [1, 2, 3].map(index => ({ config: { ...base, seed: 'w' + index }, statistic: { metric: 'subjects', summary: 'endpoint', window: null, subtract: null } }));
  assert.deepEqual(await mapTasks(tasks, { workers: 3, module, exportName: 'runStatisticTask' }), await mapTasks(tasks, { workers: 0, module, exportName: 'runStatisticTask' }));
  await assert.rejects(mapTasks([{ config: { days: -1 }, statistic: {} }, ...tasks], { workers: 2, module, exportName: 'runStatisticTask' }));
});

test('the sharpening template crosses two sizes with two control values', () => {
  const design = sharpeningDesign({ parameter: 'attackerShare', values: [0.1, 0.3], sizes: [20, 80] });
  assert.deepEqual(design.arms['large-high'], { initialSize: 80, attackerShare: 0.3 });
  assert.deepEqual(design.claim.contrast, { 'large-high': 1, 'large-low': -1, 'small-high': -1, 'small-low': 1 });
});
