import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digestOf } from '../src/provenance.mjs';

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

test('CLI graph benchmark retains deterministic JSON and rejects invalid requests without output', t => {
  const directory = mkdtempSync(join(tmpdir(), 'facety-cli-benchmark-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const config = join(directory, 'graph.json');
  const artifact = join(directory, 'artifact.json');
  const options = join(directory, 'queries.json');
  const output = join(directory, 'benchmark.json');
  writeFileSync(config, JSON.stringify({ topology: 'tree', size: 12, rootCount: 1, seed: 'cli-benchmark' }));
  writeFileSync(options, JSON.stringify({ queries: [{ target: 'n11' }], iterations: 2, warmup: 0 }));
  assert.equal(facety('graph-create', config, '--out', artifact).code, 0);
  const first = facety('graph-benchmark', artifact, options);
  assert.equal(first.code, 0);
  assert.equal(first.stderr, '');
  const result = JSON.parse(first.stdout);
  assert.equal(result.schema, 'facety-graph-benchmark/v1');
  assert.equal(result.cases[0].algorithms.bidirectional.verified, true);
  assert.equal(facety('graph-benchmark', artifact, options, '--out', output).code, 0);
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), result);
  assert.equal(facety('graph-benchmark', artifact, options, '--out', output).code, 1);
  writeFileSync(options, JSON.stringify({ queries: [{ target: 'n11', algorithm: 'unknown' }] }));
  const invalid = facety('graph-benchmark', artifact, options);
  assert.equal(invalid.code, 1);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /unknown benchmark query field/);
});

test('CLI game JSON transport and legacy raw-fact reanalysis retain input bindings', t => {
  const directory = mkdtempSync(join(tmpdir(), 'facety-cli-game-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const weights = { honest: { facts: { subjects: 1 } }, attackers: { facts: { subjects: 1 } } };
  const spec = join(directory, 'game.json');
  const facts = join(directory, 'facts.json');
  const valuation = join(directory, 'valuation.json');
  writeFileSync(spec, JSON.stringify({ id: 'cli-binding', base: { initialSize: 6, attackerShare: 0.5, days: 3 },
    roles: { honest: { strategies: { watch: { activity: { invite: 0 } } } },
      attackers: { strategies: { abstain: { activity: { invite: 0 } }, farm: { activity: { invite: 0 } } } } },
    replicas: 2, reference: { attackers: 'abstain' }, valuation: weights }));
  writeFileSync(valuation, JSON.stringify(weights));
  assert.equal(facety('game', spec, '--out', facts).code, 0);
  const stored = JSON.parse(readFileSync(facts, 'utf8'));
  assert.match(stored.analysis.inputDigest, /^[a-f0-9]{64}$/);
  const reanalyzed = facety('game-analyze', facts, valuation);
  assert.equal(reanalyzed.code, 0);
  assert.equal(JSON.parse(reanalyzed.stdout).inputDigest, stored.analysis.inputDigest);
  const legacy = join(directory, 'legacy.json');
  const expected = stored.analysis.inputDigest;
  delete stored.analysis.inputDigest;
  writeFileSync(legacy, JSON.stringify(stored));
  const migrated = facety('game-analyze', legacy, valuation);
  assert.equal(migrated.code, 0);
  assert.equal(JSON.parse(migrated.stdout).inputDigest, expected);
});

test('CLI historical reanalysis permits a valid old implementation but never a changed design', t => {
  const directory = mkdtempSync(join(tmpdir(), 'facety-cli-historical-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const spec = join(directory, 'hypothesis.json');
  const registrationFile = join(directory, 'registration.json');
  const valuesFile = join(directory, 'values.json');
  writeFileSync(spec, JSON.stringify({
    id: 'historical', statement: 'Synthetic offline compatibility probe', kind: 'association',
    base: { initialSize: 4, days: 1 }, statistic: { metric: 'xp.total' }, arms: { a: {} },
    claims: [{ id: 'positive', role: 'presence', contrast: { a: 1 }, direction: 'greater' }],
    replicas: 5, exploration: { seeds: [] },
  }));
  assert.equal(facety('register', spec, '--out', registrationFile).code, 0);
  const historical = JSON.parse(readFileSync(registrationFile, 'utf8'));
  historical.schema = 'facety-hypothesis/v1';
  delete historical.analysisPolicy;
  historical.implementation.digest = '0'.repeat(64);
  historical.hash = digestOf({ schema: historical.schema, spec: historical.spec,
    implementation: historical.implementation.digest, randomness: historical.randomness });
  historical.confirmationSeed = 'confirm:' + historical.hash;
  writeFileSync(registrationFile, JSON.stringify(historical));
  writeFileSync(valuesFile, JSON.stringify({ registrationHash: historical.hash,
    values: { base: { a: Array.from({ length: 5 }, (_, i) => ({ value: 1, censored: false, seed: `synthetic-${i}` })) } } }));
  const accepted = facety('reanalyze-confirmation', registrationFile, valuesFile);
  assert.equal(accepted.code, 0);
  assert.equal(JSON.parse(accepted.stdout).verdict, 'supported');
  historical.spec.claims[0].margin = 10;
  writeFileSync(registrationFile, JSON.stringify(historical));
  const rejected = facety('reanalyze-confirmation', registrationFile, valuesFile);
  assert.equal(rejected.code, 1);
  assert.equal(rejected.stdout, '');
  assert.match(rejected.stderr, /digest does not match/);
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
  assert.equal(JSON.parse(readFileSync(registration, 'utf8')).schema, 'facety-hypothesis/v2');
  assert.equal(confirmed.schema, 'facety-confirmation/v2');
  assert.equal(confirmed.analysisPolicy, 'family-contradiction/v1');
  assert.equal(confirmed.analysis.contradiction.controlled, true);
  const reanalyzed = facety('reanalyze-confirmation', registration, confirmation);
  assert.equal(reanalyzed.code, 0);
  assert.deepEqual(JSON.parse(reanalyzed.stdout), confirmed.analysis);
  const study = facety('study', confirmation);
  assert.equal(JSON.parse(study.stdout).hypotheses[0].adjustedPValue, confirmed.analysis.pValue);
});
