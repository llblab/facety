// Source-pinned historical tests run unchanged against their recorded compatible tree, never a drift override.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const reference = 'aab881f50c3cd2fd2cf76962558b7b71649252d7';
const historical = ['incentive-report-study.test.mjs', 'review-reconstruction.test.mjs', 'work-windows.test.mjs', 'sponsor-pipeline-study.test.mjs'];
const live = readdirSync(join(root, 'test')).filter(file => file.endsWith('.test.mjs') && !historical.includes(file));
const options = process.argv.slice(2);
function execute(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal) throw new Error('test process terminated by ' + result.signal);
  return result.status;
}
let temporary;
try {
  for (const file of historical) {
    const path = 'test/' + file;
    const original = execFileSync('git', ['show', reference + ':' + path], { cwd: root });
    if (!original.equals(readFileSync(join(root, path)))) throw new Error('historical test changed; do not silently test a different archived body: ' + path);
  }
  console.log('\n=== Current implementation / current tests ===');
  const currentStatus = execute(process.execPath, ['--test', ...options, ...live.map(file => 'test/' + file)], root);
  temporary = mkdtempSync(join(tmpdir(), 'facety-source-tests-'));
  const archived = join(temporary, 'reference');
  if (execute('git', ['clone', '--quiet', '--shared', '--no-checkout', root, archived], root) !== 0) throw new Error('cannot prepare historical test tree');
  if (execute('git', ['checkout', '--quiet', '--detach', reference], archived) !== 0) throw new Error('cannot select historical test source');
  console.log('\n=== Historical compatibility ONLY / ' + reference + ' ===');
  const historicalStatus = execute(process.execPath, ['--test', ...options, ...historical.map(file => 'test/' + file)], archived);
  process.exitCode = currentStatus || historicalStatus;
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
