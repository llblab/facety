// Owns: Original fixed diagnostic analysis of retained blocks; excludes reruns, calibrated rates and mechanism confirmation.
import { writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { digestOf, implementationDigest } from '../../src/provenance.mjs';
import { wilsonInterval } from '../../src/trials.mjs';
import { SOURCE, methodDigests, studyDesign, casePlan, validateRow, validateBlock } from './contract.mjs';
import { assertMethod, readBlock } from './run.mjs';
const DIRECTORY = new URL('./', import.meta.url);
const cellKey = config => JSON.stringify([config.valid, config.role, config.profile, config.path]);
const rowKey = config => JSON.stringify([config.seed, config.valid, config.role, config.profile, config.path]);
export function summarizeRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('sponsor-pipeline needs nonempty retained rows');
  const d = studyDesign(), seen = new Set(), groups = new Map(), byKey = new Map();
  for (const row of rows) {
    validateRow(row);
    const key = rowKey(row.config);
    if (seen.has(key)) throw new Error('sponsor-pipeline duplicate episode');
    seen.add(key); byKey.set(key, row);
    const cell = cellKey(row.config);
    if (!groups.has(cell)) groups.set(cell, []);
    groups.get(cell).push(row);
  }
  const seeds = [...new Set(rows.map(row => row.config.seed))];
  if (rows.length !== seeds.length * d.casesPerSeed) throw new Error('sponsor-pipeline incomplete context matrix');
  for (const seed of seeds) for (const config of casePlan(seed)) if (!seen.has(rowKey(config))) throw new Error('sponsor-pipeline missing assigned episode');
  const cells = [...groups.values()].map(items => {
    const { seed, ...context } = items[0].config;
    const count = field => items.filter(row => row.metrics[field] === true).length;
    const requests = count('preCaseRequested');
    const structuralRequestZero = context.path !== 'available' ? 'contact/review/XP control' : ['apparently-futile-correction', 'unknown-prospects'].includes(context.profile) ? 'encoded refusal/unknown policy' : null;
    if (structuralRequestZero && requests) throw new Error('sponsor-pipeline structural request guard violated');
    return { ...context, seeds: items.map(row => row.config.seed), n: items.length,
      sourcePositive: count('sourcePositive'), packaged: count('packaged'), routed: count('routed'), reviewPaid: count('reviewPaid'),
      positiveReviews: items.filter(row => row.metrics.reviewSignal === true).length, negativeReviews: items.filter(row => row.metrics.reviewSignal === false).length,
      missingReviews: items.filter(row => row.metrics.reviewSignal === null).length, assessmentPaid: count('assessmentPaid'),
      willing: items.filter(row => row.metrics.assessmentPaid && row.metrics.willing === true).length,
      unwilling: items.filter(row => row.metrics.assessmentPaid && row.metrics.willing === false).length,
      undetermined: items.filter(row => row.metrics.assessmentPaid && row.metrics.willing === null).length,
      requests, requestFraction: requests / items.length, structuralRequestZero,
      nominalSeedInterval95: structuralRequestZero ? null : wilsonInterval(requests, items.length),
      work: Object.fromEntries(['Aster', 'Bela'].map(id => [id, items.reduce((total, row) => total + row.relay.actors.find(actor => actor.id === id).spent, 0)])),
      casesOpened: 0, caseZeroReason: 'act-case contract guard; no safety/defense inference', outcomes: Object.fromEntries([...new Set(items.map(row => row.metrics.outcome))].map(reason => [reason, items.filter(row => row.metrics.outcome === reason).length])) };
  });
  const profileComparisons = [];
  for (const valid of d.validity) for (const role of d.roles) for (const path of d.paths) for (const profile of d.profiles.filter(item => item.value !== null)) {
    const pairs = seeds.map(seed => {
      const baseline = byKey.get(rowKey({ seed, valid, role, path: path.id, profile: 'scripted-reference' }));
      const treatment = byKey.get(rowKey({ seed, valid, role, path: path.id, profile: profile.id }));
      for (const stage of ['observation', 'package', 'route', 'review']) if (digestOf(baseline.outputs[stage]) !== digestOf(treatment.outputs[stage])) throw new Error('sponsor-pipeline profile changed prior received evidence');
      const baselinePrefix = baseline.trace.records.slice(0, baseline.outputs.sponsorship ? -1 : undefined);
      const treatmentPrefix = treatment.trace.records.slice(0, treatment.outputs.sponsorship ? -1 : undefined);
      if (digestOf(baselinePrefix) !== digestOf(treatmentPrefix)) throw new Error('sponsor-pipeline profile event prefix changed');
      return { seed, evidenceMatched: true, requestDifference: Number(treatment.metrics.preCaseRequested) - Number(baseline.metrics.preCaseRequested), workDifference: treatment.metrics.work - baseline.metrics.work };
    });
    profileComparisons.push({ valid, role, path: path.id, profile: profile.id, baseline: 'scripted-reference', pairs,
      meanRequestDifference: pairs.reduce((sum, pair) => sum + pair.requestDifference, 0) / pairs.length,
      meanWorkDifference: pairs.reduce((sum, pair) => sum + pair.workDifference, 0) / pairs.length });
  }
  let rolePairs = 0, sameTagPairs = 0;
  for (const seed of seeds) for (const valid of d.validity) for (const profile of d.profiles) {
    for (const path of d.paths) {
      const ordinary = byKey.get(rowKey({ seed, valid, role: 'ordinary', profile: profile.id, path: path.id }));
      const guarantor = byKey.get(rowKey({ seed, valid, role: 'guarantor', profile: profile.id, path: path.id }));
      if (ordinary.metrics.sourcePositive && !guarantor.metrics.sourcePositive) throw new Error('sponsor-pipeline same-draw threshold monotonicity violated');
      if (ordinary.metrics.reviewPaid && guarantor.metrics.reviewPaid && ordinary.metrics.reviewSignal !== guarantor.metrics.reviewSignal) throw new Error('sponsor-pipeline role changed a matched later review');
      rolePairs++;
    }
    for (const role of d.roles) {
      const available = byKey.get(rowKey({ seed, valid, role, profile: profile.id, path: 'available' }));
      const sameTag = byKey.get(rowKey({ seed, valid, role, profile: profile.id, path: 'same-tag' }));
      if (available.metrics.reviewSignal !== sameTag.metrics.reviewSignal || available.metrics.sourcePositive !== sameTag.metrics.sourcePositive) throw new Error('sponsor-pipeline source tag changed keyed evidence');
      sameTagPairs++;
    }
  }
  return { seedUnits: seeds.length, rows: rows.length, cells, profileComparisons, controls: { rolePairs, sameTagPairs, profilePrefixPairs: profileComparisons.reduce((n, item) => n + item.pairs.length, 0) },
    protocol: { casesOpened: 0, changedStates: 0, label: 'structural no-act-remedy guard, not recovery, extra burns, safety or adjudicated genuine harm' } };
}
export function analyzeBlocks(blocks) {
  const d = studyDesign();
  if (implementationDigest().digest !== SOURCE || process.version !== d.source.node) throw new Error('sponsor-pipeline original analysis source/runtime changed');
  if (!Array.isArray(blocks) || blocks.length !== 4) throw new Error('sponsor-pipeline requires exactly four retained blocks');
  const ordered = [...blocks].sort((a, b) => a.block - b.block), currentMethods = methodDigests();
  for (let index = 0; index < 4; index++) {
    const block = validateBlock(ordered[index]);
    if (block.block !== index || block.captureCommit !== ordered[0].captureCommit) throw new Error('sponsor-pipeline source/method/block matrix mismatch');
  }
  const summary = summarizeRows(ordered.flatMap(block => block.rows));
  if (summary.rows !== 1600 || summary.seedUnits !== 16) throw new Error('sponsor-pipeline original sample matrix incomplete');
  return { schema: 'facety-sponsor-pipeline-report/v1', level: d.level, captureCommit: ordered[0].captureCommit, source: d.source,
    designDigest: digestOf(d), methodDigests: currentMethods, randomness: d.randomness, assumptions: d.interpretation, ...summary };
}
export function readRetainedBlocks() {
  return [0, 1, 2, 3].map(readBlock);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('sponsor-pipeline analysis accepts no input/output/policy overrides');
  const saved = file => existsSync(new URL(file, DIRECTORY));
  if (['report.json', 'analysis-attempt.json', 'analysis-failed.json'].some(saved) || [0, 1, 2, 3].some(i => !saved('attempt-' + i + '.json') || !saved('block-' + i + '.json') || saved('failed-' + i + '.json'))) throw new Error('sponsor-pipeline original analysis requires complete fresh retained packet; stop, no retry');
  assertMethod();
  writeFileSync(new URL('analysis-attempt.json', DIRECTORY), JSON.stringify({ methodDigests: methodDigests(), designDigest: digestOf(studyDesign()) }) + '\n', { flag: 'wx' });
  try {
    const report = analyzeBlocks(readRetainedBlocks());
    writeFileSync(new URL('report.json', DIRECTORY), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ rows: report.rows, cells: report.cells.length, seedUnits: report.seedUnits }));
  } catch (error) {
    writeFileSync(new URL('analysis-failed.json', DIRECTORY), JSON.stringify({ error: { name: error.name, message: error.message } }) + '\n', { flag: 'wx' });
    throw error;
  }
}
