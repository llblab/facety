import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Random } from '../src/random.mjs';
import { implementationDigest, digestOf } from '../src/provenance.mjs';
import { SOURCE, METHOD_FILES, studyDesign, methodDigests, casePlan, executeCase, validateRow } from '../studies/2026-10-24-sponsor-pipeline/contract.mjs';
import { assertVacantBlock, runBlock } from '../studies/2026-10-24-sponsor-pipeline/run.mjs';
import { summarizeRows, analyzeBlocks } from '../studies/2026-10-24-sponsor-pipeline/analyze.mjs';
const DIRECTORY = new URL('../studies/2026-10-24-sponsor-pipeline/', import.meta.url);
const softwareSeeds = ['01', '02', '03', '04'].map(id => 'd47-sponsor-pipeline-software-' + id);
const native = { skip: implementationDigest().digest !== SOURCE || process.version !== 'v26.8.1' ? 'fixed original source/runtime differs; no drift override or research labels' : false };
let retained = null;
function rows() { return retained ??= softwareSeeds.flatMap(seed => casePlan(seed).map(config => executeCase(config))); }
function captures() { return Object.fromEntries(readdirSync(DIRECTORY).filter(file => /^(?:attempt-|block-|failed-|analysis-|report\.json)/.test(file)).map(file => [file, createHash('sha256').update(readFileSync(new URL(file, DIRECTORY))).digest('hex')])); }
const before = captures();

test('fixed design declares 16 fresh sampling units, 1600 matched episodes and five bound method/fixture bytes without consuming any planned observation', () => {
  const d = studyDesign();
  assert.equal(d.seeds.length, 16);
  assert.equal(new Set(d.seeds).size, 16);
  assert.equal(d.cases, 1600);
  assert.equal(d.profiles.length * d.paths.length * d.validity.length * d.roles.length, 100);
  assert.equal(casePlan(softwareSeeds[0]).length, 100);
  assert.equal(d.source.implementation.digest, SOURCE);
  assert.equal(d.bootstrap.digest, digestOf(d.bootstrap.snapshot));
  assert.equal(d.bootstrap.snapshot.atHour, 72);
  assert.equal(d.bootstrap.snapshot.subjects.length, 4);
  assert.ok(softwareSeeds.every(seed => !d.seeds.includes(seed)));
  for (const kind of Object.values(d.rates)) for (const field of ['valid', 'invalid']) assert.equal(kind.guarantor[field], 10 * kind.ordinary[field]);
  assert.deepEqual(Object.keys(methodDigests()), [...METHOD_FILES]);
  assert.ok(Object.values(methodDigests()).every(hash => /^[a-f0-9]{64}$/.test(hash)));
});

test('exclusive ordering/orphan/failure/report guards are falsified without invoking a real block or touching capture artifacts', () => {
  const saved = names => name => names.includes(name);
  assert.doesNotThrow(() => assertVacantBlock(0, saved([])));
  assert.doesNotThrow(() => assertVacantBlock(1, saved(['attempt-0.json', 'block-0.json'])));
  for (const names of [['attempt-0.json'], ['block-0.json'], ['failed-3.json'], ['report.json'], ['analysis-attempt.json'], ['analysis-failed.json'], ['attempt-2.json', 'block-2.json']]) {
    assert.throws(() => assertVacantBlock(0, saved(names)), /stop, no retry/);
  }
  assert.throws(() => assertVacantBlock(1, saved([])), /out-of-order/);
  for (const index of [-1, 4, NaN, '0', null]) assert.throws(() => runBlock(index), /fixed block index/);
  assert.throws(() => analyzeBlocks([]), /exactly four|source\/runtime changed/);
  assert.deepEqual(captures(), before);
});

test('400 software-only episodes reconcile exact declared keys, stage missingness, native state and actor work without planned-label capture', native, () => {
  const d = studyDesign();
  for (const row of rows()) {
    const rng = new Random(row.config.seed).fork(d.randomness.observations.observations);
    const expectedSource = rng.fork(JSON.stringify([d.episode.selfId, 'Aster', 72, 'source'])).chance(d.rates['self-id'][row.config.role][row.config.valid ? 'valid' : 'invalid']);
    assert.equal(row.metrics.sourcePositive, expectedSource);
    if (row.metrics.reviewPaid) {
      const path = d.paths.find(path => path.id === row.config.path);
      const expectedReview = rng.fork(JSON.stringify([d.episode.selfId, path.sponsor, 72, 'review'])).chance(d.rates['self-id'].guarantor[row.config.valid ? 'valid' : 'invalid']);
      assert.equal(row.metrics.reviewSignal, expectedReview);
    } else assert.equal(row.metrics.reviewSignal, null);
    assert.equal(row.metrics.casesOpened, 0);
    assert.equal(digestOf(row.protocol), d.bootstrap.digest);
    assert.ok(row.relay.actors.every(actor => actor.spent <= 5 && actor.denied === 0));
  }
  assert.equal(rows().length, 400);
  assert.ok(rows().some(row => row.metrics.assessmentPaid));
  assert.ok(rows().some(row => row.metrics.preCaseRequested));
  assert.deepEqual(captures(), before);
});

test('software summary retains 100 cells/four seed units and paired evidence, role and source-tag controls without treating structural zeros as safety', native, () => {
  const summary = summarizeRows(rows());
  assert.equal(summary.rows, 400);
  assert.equal(summary.seedUnits, 4);
  assert.equal(summary.cells.length, 100);
  assert.equal(summary.profileComparisons.length, 80);
  assert.deepEqual(summary.controls, { rolePairs: 200, sameTagPairs: 80, profilePrefixPairs: 320 });
  for (const cell of summary.cells) {
    assert.equal(cell.n, 4);
    assert.equal(cell.positiveReviews + cell.negativeReviews, cell.reviewPaid);
    assert.equal(cell.reviewPaid + cell.missingReviews, 4);
    if (cell.structuralRequestZero) { assert.equal(cell.requests, 0); assert.equal(cell.nominalSeedInterval95, null); }
    else assert.ok(cell.nominalSeedInterval95.upper > 0);
  }
  assert.ok(summary.profileComparisons.every(item => item.meanWorkDifference === 0 && item.pairs.every(pair => pair.evidenceMatched)));
  assert.deepEqual(captures(), before);
});

test('corrupt state, hidden-label leak, unavailable-as-negative, work/assessment drift, duplicate/incomplete rows reject', native, () => {
  const row = rows().find(item => item.metrics.assessmentPaid);
  for (const mutate of [
    value => value.protocol.subjects[0].xp++, value => value.metrics.work++,
    value => value.relay.observations[0].genuine = true,
    value => value.outputs.sponsorship.decision.assessment.profile.payoffs.upheld++,
  ]) {
    const copy = structuredClone(row); mutate(copy);
    assert.throws(() => validateRow(copy), /sponsor-pipeline/);
  }
  const missing = structuredClone(rows().find(item => item.config.path === 'unavailable' && item.metrics.routed));
  missing.metrics.reviewSignal = false;
  assert.throws(() => validateRow(missing), /measurement mismatch/);
  assert.throws(() => summarizeRows([...rows(), rows()[0]]), /duplicate episode/);
  assert.throws(() => summarizeRows(rows().slice(1)), /incomplete context matrix/);
});

test('inert future inspection and trace retention preserve software episode outcomes; altered configuration rejects before creating a capture', native, () => {
  const config = casePlan(softwareSeeds[0]).find(row => !row.valid && row.role === 'guarantor' && row.profile === 'optimistic-correction' && row.path === 'available');
  const full = executeCase(config), inert = executeCase(config, { inertInspection: true });
  assert.deepEqual(inert, full);
  const { trace: a, ...left } = full;
  const { trace: b, ...right } = executeCase(config, { traceLimit: 0 });
  assert.deepEqual(left, right);
  assert.equal(b.records.length, 0);
  assert.throws(() => executeCase({ ...config, valid: null }), /invalid episode/);
  assert.throws(() => executeCase({ ...config, path: 'invented' }), /unknown profile\/contact/);
  assert.deepEqual(captures(), before);
});
