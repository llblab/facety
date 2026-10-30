import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { auditWindows, readRetainedBlocks as readF54 } from '../studies/2026-10-24-work-headroom/window-audit.mjs';
import { auditReviews, readRetainedBlocks as readF52 } from '../studies/2026-10-24-shared-evidence-comparison/review-audit.mjs';
import { assertMethod } from '../studies/2026-10-24-sponsor-pipeline/run.mjs';

const root = new URL('../', import.meta.url);
const reference = 'aab881f50c3cd2fd2cf76962558b7b71649252d7';
const directories = ['2026-10-24-work-headroom', '2026-10-24-shared-evidence-comparison', '2026-10-24-sponsor-pipeline', '2026-10-24-one-day-incentives'];
const ARCHIVED = [
  'studies/2026-10-24-one-day-incentives/execution-audit.json',
  'studies/2026-10-24-one-day-incentives/execution-validation.json',
  'studies/2026-10-24-one-day-incentives/report-validation.json',
  'studies/2026-10-24-one-day-incentives/results/report.json',
  'studies/2026-10-24-one-day-incentives/validation.json',
  'studies/2026-10-24-shared-evidence-comparison/review-audit-validation.json',
  'studies/2026-10-24-shared-evidence-comparison/review-audit.json',
  'studies/2026-10-24-shared-evidence-comparison/validation.json',
  'studies/2026-10-24-work-headroom/validation.json',
  'studies/2026-10-24-work-headroom/window-audit-validation.json',
  'studies/2026-10-24-work-headroom/window-audit.json',
];
const TEXT_REPAIRS = [
  ['studies/2026-10-24-work-headroom/README.md', 'work/XP/supply', 'work/X\u0420/supply'],
];
function packet() {
  const directory = new URL('studies/2026-10-24-sponsor-pipeline/', root);
  return Object.fromEntries(readdirSync(directory).map(file => [file, createHash('sha256').update(readFileSync(new URL(file, directory))).digest('hex')]));
}

test('current source refuses original model-bound audit/capture methods while retained packet bytes remain valid', () => {
  const before = packet();
  assert.equal(readF54().flatMap(block => block.rows).length, 96);
  assert.equal(readF52().flatMap(block => block.rows).length, 64);
  assert.throws(() => auditWindows([]), /F54 window kernels changed; no drift override/);
  assert.throws(() => auditReviews([]), /F52 review reference changed; no implicit drift override/);
  assert.throws(() => assertMethod(), /original source\/runtime/);
  assert.deepEqual(packet(), before);
});

test('historical study/method/report files are unchanged rather than rebound to the new XP implementation', () => {
  const diff = filter => execFileSync('git', ['diff', '--name-only', '--diff-filter=' + filter, reference, '--', ...directories.map(name => 'studies/' + name)], { cwd: root, encoding: 'utf8' });
  // Only link targets to archived outputs may change: undoing the permalink prefix must restore the reference bytes exactly.
  for (const path of diff('d').split('\n').filter(Boolean)) {
    assert.ok(path.endsWith('/README.md'), 'only packet READMEs may be relinked: ' + path);
    const prefix = 'https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/' + path.slice(0, path.lastIndexOf('/') + 1);
    let restored = readFileSync(new URL(path, root), 'utf8').replaceAll('](' + prefix, '](');
    // English-only repository rule: declared text repairs (Cyrillic homoglyph typos) are undone before the byte comparison.
    for (const [file, repaired, original] of TEXT_REPAIRS) if (file === path) restored = restored.replaceAll(repaired, original);
    assert.equal(restored, execFileSync('git', ['show', reference + ':' + path], { cwd: root, encoding: 'utf8' }), path);
  }
  // Consolidation C7 archived these untested outputs; they remain byte-identical at the reference and archive commits.
  assert.deepEqual(diff('D').split('\n').filter(Boolean).sort(), ARCHIVED.slice().sort());
});
