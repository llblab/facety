// Owns: Four exclusive fixed diagnostic captures; excludes overrides, recapture, retries and claim promotion.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { implementationDigest, digestOf } from '../../src/provenance.mjs';
import { SOURCE, METHOD_FILES, methodDigests, studyDesign, casePlan, executeCase, validateBlock } from './contract.mjs';
const DIRECTORY = new URL('./', import.meta.url), ROOT = new URL('../../', import.meta.url);
export function assertMethod() {
  const d = studyDesign();
  if (process.version !== 'v26.8.1' || implementationDigest().digest !== SOURCE || d.source.implementation.digest !== SOURCE || d.source.node !== process.version) throw new Error('sponsor-pipeline requires original source/runtime; no drift override');
  for (const file of METHOD_FILES) if (!execFileSync('git', ['show', 'HEAD:' + file], { cwd: fileURLToPath(ROOT) }).equals(readFileSync(new URL(file, ROOT)))) throw new Error('sponsor-pipeline method must be committed unchanged: ' + file);
  return d;
}
export function readBlock(index) {
  const block = JSON.parse(readFileSync(new URL('block-' + index + '.json', DIRECTORY)));
  const attempt = JSON.parse(readFileSync(new URL('attempt-' + index + '.json', DIRECTORY)));
  if (Object.keys(attempt).sort().join() !== 'block,captureCommit,designDigest,methodDigests,seeds,source'
    || Object.keys(attempt).some(key => digestOf(attempt[key]) !== digestOf(block[key]))) throw new Error('sponsor-pipeline attempt/block binding mismatch');
  return validateBlock(block);
}
export function assertVacantBlock(index, saved) {
  if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('sponsor-pipeline requires fixed block index 0..3');
  const orphan = [0, 1, 2, 3].some(i => saved('attempt-' + i + '.json') !== saved('block-' + i + '.json'));
  if (orphan || [0, 1, 2, 3].some(i => saved('failed-' + i + '.json')) || ['report.json', 'analysis-attempt.json', 'analysis-failed.json', 'attempt-' + index + '.json', 'block-' + index + '.json'].some(saved)
    || [0, 1, 2, 3].some(i => i < index ? !saved('block-' + i + '.json') : i > index && saved('block-' + i + '.json'))) throw new Error('sponsor-pipeline existing/failed/orphan/out-of-order capture; stop, no retry');
}
export function runBlock(index) {
  if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('sponsor-pipeline requires fixed block index 0..3');
  const d = assertMethod();
  assertVacantBlock(index, file => existsSync(new URL(file, DIRECTORY)));
  const binding = { block: index, captureCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(ROOT), encoding: 'utf8' }).trim(),
    designDigest: digestOf(d), methodDigests: methodDigests(), source: d.source, seeds: d.seeds.slice(index * 4, index * 4 + 4) };
  for (let previous = 0; previous < index; previous++) if (readBlock(previous).captureCommit !== binding.captureCommit) throw new Error('sponsor-pipeline capture checkpoint changed between blocks');
  writeFileSync(new URL('attempt-' + index + '.json', DIRECTORY), JSON.stringify(binding) + '\n', { flag: 'wx' });
  const rows = []; let currentCase = null, nativeReturn = null, phase = 'case-execution';
  try {
    for (const seed of binding.seeds) for (const config of casePlan(seed)) {
      currentCase = config; nativeReturn = null;
      nativeReturn = executeCase(config);
      rows.push(nativeReturn);
    }
    phase = 'block-write'; currentCase = null; nativeReturn = null;
    const block = validateBlock({ schema: 'facety-sponsor-pipeline-block/v1', ...binding, rows });
    writeFileSync(new URL('block-' + index + '.json', DIRECTORY), JSON.stringify(block) + '\n', { flag: 'wx' });
    return block;
  } catch (error) {
    writeFileSync(new URL('failed-' + index + '.json', DIRECTORY), JSON.stringify({ schema: 'facety-sponsor-pipeline-failed/v1', ...binding,
      phase, rows, currentCase, nativeReturn, caseEvidence: error.caseEvidence ?? null, error: { name: error.name, message: error.message } }) + '\n', { flag: 'wx' });
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || !/^[0-3]$/.test(process.argv[2])) throw new Error('sponsor-pipeline accepts one block index, no source/output/scenario overrides');
  const block = runBlock(Number(process.argv[2]));
  console.log(JSON.stringify({ block: block.block, cases: block.rows.length }));
}
