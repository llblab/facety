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
  const changed = execFileSync('git', ['diff', '--name-only', reference, '--', ...directories.map(name => 'studies/' + name)], { cwd: root, encoding: 'utf8' });
  assert.equal(changed, '');
});
