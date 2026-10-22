import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as current from '../../src/games.mjs';
import { RANDOMNESS_POLICY } from '../../src/experiment.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';

const previous = 'de0365b7b3344bcac2a4a2da91e986bd95e6bf62';
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root });
assert.equal(git('diff', '--name-only', previous, '--', 'src').toString().trim(), 'src/games.mjs');
const originals = git('ls-tree', '-r', previous, '--', 'src', 'studies').toString().trim().split('\n').map(line => {
  const [metadata, path] = line.split('\t'); return { hash: metadata.split(' ')[2], path };
}).filter(item => item.path !== 'src/games.mjs');
const hashes = execFileSync('git', ['hash-object', '--no-filters', '--stdin-paths'],
  { cwd: root, input: originals.map(item => item.path).join('\n') + '\n' }).toString().trim().split('\n');
assert.deepEqual(hashes, originals.map(item => item.hash), 'raw historical studies and all native support modules');
const oldSource = git('show', previous + ':src/games.mjs').toString();
const sourceUrl = new URL('../../src/games.mjs', import.meta.url);
const rewritten = oldSource.replace(/from '(\.\/[^']+)'/g, (_, path) => 'from ' + JSON.stringify(new URL(path, sourceUrl).href));
const old = await import('data:text/javascript;base64,' + Buffer.from(rewritten).toString('base64'));
const result = await current.runGame({ id: 'saved-facts-control', seed: 'saved-facts-control',
  base: { initialSize: 8, attackerShare: 0.25, days: 6, maxSubjects: 100 }, replicas: 3, deviation: { share: 0.25 }, reference: { attackers: 'abstain' },
  roles: { honest: { strategies: { watch: { activity: { inspect: 1 } }, rest: { activity: { inspect: 0 } } } },
    attackers: { strategies: { abstain: { activity: { invite: 0, guarantee: 0 } }, farm: { activity: { invite: 0.2, guarantee: 1 } } } } } });
const valuation = { honest: { facts: { liquidFacy: 1, subjects: 2, effort: -0.01 } }, attackers: { facts: { liquidFacy: 1, subjects: 2, effort: -0.01 } } };
const before = old.analyzeGame(result, valuation);
const after = current.analyzeGame(result, valuation);
assert.deepEqual(after, before, 'complete retained facts');
const beforeSummary = old.deterrenceSummary(result, before);
const afterSummary = current.deterrenceSummary(result, after);
assert.deepEqual(afterSummary, beforeSummary, 'complete supported mixture');
assert.deepEqual(current.assessViability(afterSummary), old.assessViability(beforeSummary), 'complete positive-baseline viability');
const legacy = structuredClone(result);
for (const entry of legacy.facts) for (const replica of entry.replicas) {
  delete replica.system.falseMintedShare;
  delete replica.system.falseCirculatingShare;
  delete replica.system.councilSeats;
  delete replica.system.councilAttackerSeats;
}
const legacyBefore = old.analyzeGame(legacy, valuation).profiles[0].fraudBudget;
const legacyAfter = current.analyzeGame(legacy, valuation).profiles[0].fraudBudget;
assert.equal(legacyBefore.falseMintedShare, 0);
assert.equal(legacyAfter.falseMintedShare, null);
const supplied = { verdict: 'deterred', honestWithoutFraud: 100, equilibria: [{ honestValue: 100, wrongfulInvalidations: 0 }] };
const limits = { maxFalseMintedShare: 0.2, maxCoalitionCouncilShare: 0.5 };
const unsafe = old.assessViability(supplied, limits);
const safe = current.assessViability(supplied, limits);
assert.equal(unsafe.viable, true);
assert.equal(safe.viable, false);
const undefinedInput = { verdict: 'deterred', honestWithoutFraud: 0, equilibria: [{ honestValue: 0 }] };
const undefinedBefore = old.assessViability(undefinedInput);
const undefinedAfter = current.assessViability(undefinedInput);
assert.equal(undefinedBefore.viable, true);
assert.equal(undefinedAfter.viable, false);
console.log(JSON.stringify({ schema: 'facety-saved-facts-diagnostic/v1', level: 'diagnostic', previousRevision: previous,
  oldAnalyzerSha256: createHash('sha256').update(oldSource).digest('hex'), provenance: provenance(), randomness: RANDOMNESS_POLICY,
  method: 'Old pure analyzer imported from git with unchanged current support modules; one common newly generated fact set. Not a historical full-model replay or confirmation.',
  historicalPreservation: { rawBlobsEqual: true, studyFiles: originals.filter(item => item.path.startsWith('studies/')).length,
    unchangedSourceModules: originals.filter(item => item.path.startsWith('src/')).length },
  completeControl: { profiles: after.profiles.length, deviations: after.deviations.length, nativeRuns: result.runs,
    analysisDigest: digestOf(after), summaryDigest: digestOf(afterSummary), analysisEqual: true, summaryEqual: true, viabilityEqual: true },
  missingProfile: { before: legacyBefore, after: legacyAfter },
  missingEnabledBudget: { before: unsafe, after: safe },
  undefinedMandatoryMetrics: { before: undefinedBefore, retentionWasNaN: Number.isNaN(undefinedBefore.honestRetention),
    wrongfulWasNaN: Number.isNaN(undefinedBefore.wrongfulInvalidations), after: undefinedAfter },
  limit: 'Synthetic incomplete records isolate analysis safety. No fraud probability, calibrated welfare, new equilibrium or protocol-rule claim.',
}, null, 2));
