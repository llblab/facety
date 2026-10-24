// Owns: Fixed shared-evidence matrix, retained projection and byte-bound method closure; excludes simulation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { caseConfig as referenceConfig, projectRun as referenceProjection } from '../2026-10-24-attended-comparison/contract.mjs';
export { measure, FIELDS } from '../2026-10-24-attended-comparison/contract.mjs';
export { validateRow } from '../2026-10-24-attended-comparison/analyze.mjs';

const ROOT = new URL('../../', import.meta.url);
export const METHOD_FILES = [
  'studies/2026-10-24-shared-evidence-comparison/run.mjs',
  'studies/2026-10-24-shared-evidence-comparison/contract.mjs',
  'studies/2026-10-24-shared-evidence-comparison/analyze.mjs',
  'studies/2026-10-24-shared-evidence-comparison/design.json',
  'studies/2026-10-24-attended-comparison/contract.mjs',
  'studies/2026-10-24-attended-comparison/analyze.mjs',
  'studies/2026-10-24-attended-comparison/design.json',
];
export function methodDigests() {
  return Object.fromEntries(METHOD_FILES.map(file => [file, createHash('sha256').update(readFileSync(new URL(file, ROOT))).digest('hex')]));
}
export function caseConfig(design, seed, population, calendar, evidence, arm) {
  return { ...referenceConfig(design, seed, population, calendar, design.timing, arm), invitationEvidence: evidence };
}
export function projectRun(run, population, calendar, evidence, arm) {
  return { ...referenceProjection(run, population, calendar, run.config.invitationReviewTiming, arm), evidence };
}
