import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import * as currentWalks from '../../examples/causal-walkthroughs.mjs';
import * as currentRelay from '../../examples/causal-relay.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const previous = '71242626e532f0a3e08aa7c3bd987d962afef000';
const removed = ['src/relay.mjs', 'src/trace.mjs', 'src/walkthroughs.mjs'];
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const withoutProvenance = ({ provenance: ignored, ...run }) => run;
const changes = git('diff', '--name-status', previous, '--', 'src').toString().trim().split('\n').sort();
assert.deepEqual(changes, removed.map(path => 'D\t' + path).sort(), 'only the three unused source files may differ');
const temporary = mkdtempSync(join(tmpdir(), 'facety-dead-code-'));
try {
  const archive = git('archive', previous, 'src', 'examples/causal-walkthroughs.mjs', 'examples/causal-relay.mjs');
  execFileSync('tar', ['-x', '-C', temporary], { input: archive });
  const oldWalks = await import(pathToFileURL(join(temporary, 'examples/causal-walkthroughs.mjs')));
  const oldRelay = await import(pathToFileURL(join(temporary, 'examples/causal-relay.mjs')));
  const savedWalks = JSON.parse(gunzipSync(readFileSync(new URL('../2026-10-23-causal-core/walkthroughs.json.gz', import.meta.url))));
  const walkthroughs = currentWalks.WALKTHROUGHS.map((name, i) => {
    const before = oldWalks.runWalkthrough(name);
    const after = currentWalks.runWalkthrough(name);
    assert.deepEqual(withoutProvenance(before), withoutProvenance(savedWalks[i]), 'historical walkthrough ' + name);
    assert.deepEqual(withoutProvenance(after), withoutProvenance(before), name);
    return { name, digest: digestOf(withoutProvenance(after)) };
  });
  const before = oldRelay.runRelayComparison();
  const after = currentRelay.runRelayComparison();
  const saved = JSON.parse(gunzipSync(readFileSync(new URL('../2026-10-23-causal-core/relay-exploration.json.gz', import.meta.url))));
  assert.deepEqual(withoutProvenance(before), withoutProvenance(saved), 'historical relay output');
  assert.deepEqual(withoutProvenance(after), withoutProvenance(before), 'all paired runs and summaries');
  const historical = git('ls-tree', '-r', '--name-only', previous, '--', 'studies').toString().trim().split('\n');
  for (const path of historical) assert.equal(hash(readFileSync(join(root, path))), hash(git('show', previous + ':' + path)), path);
  console.log(JSON.stringify({
    schema: 'facety-dead-code-preservation/v1', level: 'diagnostic', previousRevision: previous,
    before: before.provenance, after: provenance(), randomness: after.randomness,
    sourceChange: 'Exactly three deletions; every remaining source module is byte-identical to the previous commit.',
    removed: removed.map(path => { const bytes = git('show', previous + ':' + path); return { path, sha256: hash(bytes), lines: bytes.toString().split('\n').length - 1 }; }),
    checks: { walkthroughs, pairedRuns: after.runs.length, pairedOutputDigest: digestOf(withoutProvenance(after)), historicalFilesUnchanged: historical.length },
    equivalentExceptProvenance: true,
    limit: 'Diagnostic equivalence of declared paths and exact source retention, not universal compatibility, a historical confirmation replay or an emergence claim.',
  }, null, 2));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
