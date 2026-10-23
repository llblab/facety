import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestOf } from '../src/provenance.mjs';

const CLI = new URL('../bin/facety.mjs', import.meta.url).pathname;
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('CLI v1 stays legacy; explicit A creates a separate identified artifact without changing its inputs', t => {
  const directory = mkdtempSync(join(tmpdir(), 'facety-policy-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const old = JSON.parse(readFileSync(new URL('../studies/2026-10-23-evidence-debt-review/witness.json', import.meta.url), 'utf8')).E1;
  const source = { schema: 'facety-confirmation/v1', registrationHash: old.registration.hash, values: old.values };
  const registration = join(directory, 'registration.json');
  const retained = join(directory, 'values.json');
  const output = join(directory, 'reanalysis.json');
  const registrationBytes = JSON.stringify(old.registration);
  const sourceBytes = JSON.stringify(source);
  writeFileSync(registration, registrationBytes);
  writeFileSync(retained, sourceBytes);
  const legacy = run('reanalyze-confirmation', registration, retained);
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.equal(JSON.parse(legacy.stdout).verdict, old.verdict);
  assert.equal(JSON.parse(legacy.stdout).analysisPolicy, 'unadjusted-contradiction/v1');
  const explicit = run('reanalyze-confirmation', registration, retained, '--analysis-policy', 'family-contradiction/v1', '--out', output);
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.equal(explicit.stdout, '');
  const artifact = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(artifact.schema, 'facety-reanalysis/v1');
  assert.equal(artifact.registeredAnalysisPolicy, 'unadjusted-contradiction/v1');
  assert.equal(artifact.analysisPolicy, 'family-contradiction/v1');
  assert.equal(artifact.methodChanged, true);
  assert.equal(artifact.analysis.verdict, 'inconclusive');
  assert.equal(artifact.analysis.contradiction.pValue, 1);
  assert.equal(artifact.source.inputDigest, digestOf(source));
  assert.equal(run('reanalyze-confirmation', registration, retained, '--analysis-policy', 'family-contradiction/v1', '--out', output).status, 1);
  for (const policy of ['unknown', 'unadjusted-contradiction/v1']) {
    const rejected = run('reanalyze-confirmation', registration, retained, '--analysis-policy', policy);
    assert.equal(rejected.status, 1);
    assert.equal(rejected.stdout, '');
  }
  assert.equal(run('confirm', registration, '--analysis-policy', 'family-contradiction/v1').status, 1);
  assert.equal(readFileSync(registration, 'utf8'), registrationBytes);
  assert.equal(readFileSync(retained, 'utf8'), sourceBytes);
  old.registration.spec.claims[0].margin = 0;
  writeFileSync(registration, JSON.stringify(old.registration));
  const rejectedFile = join(directory, 'rejected.json');
  const tampered = run('reanalyze-confirmation', registration, retained, '--analysis-policy', 'family-contradiction/v1', '--out', rejectedFile);
  assert.equal(tampered.status, 1);
  assert.equal(tampered.stdout, '');
  assert.match(tampered.stderr, /digest does not match/);
  assert.equal(existsSync(rejectedFile), false);
});
