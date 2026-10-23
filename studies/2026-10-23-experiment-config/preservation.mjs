// Owns: Source-move and declared scheduler equivalence evidence, not empirical confirmation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as current from '../../src/experiment.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const previous = '0d2e7a4';
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const listed = directory => git('ls-tree', '-r', '--name-only', previous, '--', directory).toString().trim().split('\n').filter(Boolean);
const oldSourceFiles = listed('src').filter(path => path.endsWith('.mjs'));
const currentSourceFiles = readdirSync(join(root, 'src')).filter(path => path.endsWith('.mjs')).map(path => 'src/' + path).sort();
assert.deepEqual(currentSourceFiles.filter(path => !oldSourceFiles.includes(path)), ['src/experiment-config.mjs']);
const changed = oldSourceFiles.filter(path => hash(readFileSync(join(root, path))) !== hash(git('show', previous + ':' + path)));
assert.deepEqual(changed, ['src/experiment.mjs']);
const beforeSource = git('show', previous + ':src/experiment.mjs').toString();
const afterSource = readFileSync(join(root, 'src/experiment.mjs'), 'utf8');
const configSource = readFileSync(join(root, 'src/experiment-config.mjs'), 'utf8');
const start = 'export const SCENARIOS';
const scheduler = '// Truth is confined to this environment/evaluator';
const moved = beforeSource.slice(beforeSource.indexOf(start), beforeSource.indexOf(scheduler));
assert.equal(configSource.slice(configSource.indexOf(start)).replace('export function dayActivity(config, day)', 'function dayActivity(config, day)') + '\n', moved);
assert.equal(afterSource.slice(afterSource.indexOf(scheduler)), beforeSource.slice(beforeSource.indexOf(scheduler)));

async function instrument(url, source) {
  const marker = '    observations, rejections, money, agents, system,';
  assert.equal(source.split(marker).length, 2);
  const instrumented = source.replace(marker, marker + '\n    protocolEventsForControl: model.events(),')
    .replace(/from '(\.\/[^']+)'/g, (_, relative) => 'from ' + JSON.stringify(new URL(relative, url).href));
  return import('data:text/javascript;base64,' + Buffer.from(instrumented).toString('base64'));
}
const withoutProvenance = ({ provenance: ignored, ...run }) => run;
const temporary = mkdtempSync(join(tmpdir(), 'facety-config-reference-'));
try {
  execFileSync('tar', ['-x', '-C', temporary], { input: git('archive', previous, 'src') });
  const oldUrl = pathToFileURL(join(temporary, 'src/experiment.mjs'));
  const old = await import(oldUrl);
  assert.deepEqual(Object.keys(current).sort(), Object.keys(old).sort());
  for (const name of Object.keys(old)) if (typeof old[name] !== 'function') assert.deepEqual(current[name], old[name], name);
  const before = await instrument(oldUrl, beforeSource);
  const after = await instrument(pathToFileURL(join(root, 'src/experiment.mjs')), afterSource);
  const reused = JSON.parse(readFileSync(new URL('../2026-10-23-native-id/scheduler-preservation.json', import.meta.url), 'utf8')).checks.map(row => row.config);
  const scheduled = {
    seed: 'config-extraction:schedules', initialSize: 8, days: 8, includeState: true,
    deviants: { share: 0.25, honest: { activity: { inspect: 0 }, schedule: [{ startDay: 2, endDay: 4, activity: { selfId: 0.4 } }] } },
    perturbations: [{ id: 'pause-growth', startDay: 4, endDay: 6, activity: { honest: { invite: 0 }, attackers: { guarantee: 0 } } }],
    policy: { xpFinality: 'immediate', spendMaturityHours: 72, conversionMaturityHours: 168, invitationFreezeHours: 0, linkBreakXp: 'keep' },
    ablations: { withholdGuarantorXp: true, fixedInvitationThreshold: 1, randomGuaranteeTargets: true },
    social: { scope: 'acquaintances', strangerRate: 0.1, verification: true },
  };
  const contexts = [...reused,
    { scenario: 'honest-growth', seed: 'config-extraction:honest', initialSize: 8, days: 8, includeState: true },
    { scenario: 'real-cartel', seed: 'config-extraction:cartel', initialSize: 8, days: 8, includeState: true },
    scheduled,
    { seed: 'config-extraction:censor', initialSize: 6, days: 5, maxActions: 3, includeState: true },
  ];
  const configurations = [{}, { days: 0 }, ...contexts].map(input => {
    const reference = old.experimentConfig(input);
    const actual = current.experimentConfig(input);
    assert.deepEqual(actual, reference);
    assert.equal(Object.isFrozen(actual), true);
    for (const day of new Set([0, Math.floor(actual.days / 2), actual.days])) {
      assert.deepEqual(current.activityAtDay(input, day), old.activityAtDay(input, day));
    }
    assert.deepEqual(current.withExperimentParameters(input, { 'activity.honest.inspect': 2 }), old.withExperimentParameters(input, { 'activity.honest.inspect': 2 }));
    return { input, digest: digestOf(actual) };
  });
  const invalidInputs = [
    { unknown: 1 }, { scenario: 'unknown' }, { days: -1 }, { seed: null },
    { activity: { honest: { selfId: 2 } } }, { budgets: { honest: -1 } }, { policy: { unknown: true } },
    { disputes: { enabled: 'yes' } }, { disputes: { stakeBacking: 'unknown' } },
    { deviants: { share: 0, honest: { activity: {} } } },
    { perturbations: [{ id: 'bad', startDay: 2, endDay: 2 }] },
    { perturbations: [{ id: 'a', startDay: 1, endDay: 3, activity: { honest: { inspect: 0 } } },
      { id: 'b', startDay: 2, endDay: 4, activity: { honest: { inspect: 2 } } }] },
  ];
  const failure = (api, input) => {
    try { api.experimentConfig(input); } catch (error) { return { name: error.name, message: error.message }; }
    assert.fail('invalid config accepted');
  };
  const rejections = invalidInputs.map(input => {
    const result = failure(current, input);
    assert.deepEqual(result, failure(old, input));
    return { input, ...result };
  });
  const runs = contexts.map(config => {
    const original = before.runExperiment(config);
    const result = after.runExperiment(config);
    assert.deepEqual(withoutProvenance(result), withoutProvenance(original));
    assert.equal(JSON.stringify(withoutProvenance(result)), JSON.stringify(withoutProvenance(original)));
    return { config, digest: digestOf(withoutProvenance(result)),
      events: result.protocolEventsForControl.length, observations: result.observations,
      censored: result.outcome.censored, cases: result.disputes.cases.length };
  });
  const historical = listed('studies');
  for (const path of historical) assert.equal(hash(readFileSync(join(root, path))), hash(git('show', previous + ':' + path)), path);
  const oldProvenance = await import(pathToFileURL(join(temporary, 'src/provenance.mjs')));
  console.log(JSON.stringify({
    baseline: previous, level: 'diagnostic', before: oldProvenance.provenance(), after: provenance(),
    randomness: current.RANDOMNESS_POLICY, exportedNames: Object.keys(current).sort(),
    sourceProof: { added: ['src/experiment-config.mjs'], changed, unchangedExistingSourceModules: oldSourceFiles.length - changed.length,
      movedBlockSha256: hash(moved), movedLines: moved.split('\n').length - 1, schedulerBodyByteIdentical: true,
      experimentLinesBefore: beforeSource.split('\n').length - 1, experimentLinesAfter: afterSource.split('\n').length - 1 },
    configurations, rejections, runs, historicalFilesUnchanged: historical.length, equivalentExceptProvenance: true, serializedBytesIdenticalExceptProvenance: true,
    method: 'Reference archived from the named commit. Compare all run fields except provenance plus read-only ordered event capture; no generator/key-layout changes, timing claim or historical confirmation replay.',
  }, null, 2));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
