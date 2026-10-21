import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../bin/facety.mjs', import.meta.url).pathname;
function facety(...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('CLI writes JSON only to stdout, reports errors on stderr and refuses overwrites', t => {
  const directory = mkdtempSync(join(tmpdir(), 'facety-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const config = join(directory, 'run.json');
  writeFileSync(config, JSON.stringify({ initialSize: 4, days: 2 }));
  const run = facety('run', config);
  assert.equal(run.code, 0);
  assert.equal(JSON.parse(run.stdout).schema, 'facety-experiment/v1');
  const out = join(directory, 'out.json');
  assert.equal(facety('run', config, '--out', out).code, 0);
  const refused = facety('run', config, '--out', out);
  assert.equal(refused.code, 1);
  assert.equal(refused.stdout, '');
  assert.match(refused.stderr, /refusing to overwrite/);
  assert.equal(facety('run', config, '--out', out, '--force').code, 0);
  assert.equal(facety('unknown').code, 1);
});

test('CLI registration, confirmation and offline reanalysis agree', t => {
  const directory = mkdtempSync(join(tmpdir(), 'facety-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const spec = join(directory, 'hypothesis.json');
  writeFileSync(spec, JSON.stringify({
    id: 'cli', statement: 'Guarantor XP sharing increases total XP', kind: 'association',
    base: { initialSize: 6, days: 8 }, statistic: { metric: 'xp.total' },
    arms: { full: {}, ablated: { 'ablations.withholdGuarantorXp': true } },
    claims: [{ id: 'more', role: 'presence', contrast: { full: 1, ablated: -1 }, direction: 'greater' }],
    replicas: 5, exploration: { seeds: [] },
  }));
  const registration = join(directory, 'registration.json');
  const confirmation = join(directory, 'confirmation.json');
  assert.equal(facety('register', spec, '--out', registration).code, 0);
  assert.equal(facety('confirm', registration, '--workers', '2', '--out', confirmation).code, 0);
  const confirmed = JSON.parse(readFileSync(confirmation, 'utf8'));
  const reanalyzed = facety('reanalyze-confirmation', registration, confirmation);
  assert.equal(reanalyzed.code, 0);
  assert.deepEqual(JSON.parse(reanalyzed.stdout), confirmed.analysis);
  const study = facety('study', confirmation);
  assert.equal(JSON.parse(study.stdout).hypotheses[0].adjustedPValue, confirmed.analysis.pValue);
});
