import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as current from '../../src/games.mjs';
import { RANDOMNESS_POLICY } from '../../src/experiment.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';

const previous = 'c0123d3ee6606ec4e65476c278bc9dcdebd4bc20';
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root });
assert.equal(git('diff', '--name-only', previous, '--', 'src').toString().trim(), 'src/games.mjs');
const originals = git('ls-tree', '-r', previous, '--', 'src', 'studies').toString().trim().split('\n').map(line => {
  const [metadata, path] = line.split('\t'); return { hash: metadata.split(' ')[2], path };
}).filter(item => item.path !== 'src/games.mjs');
const hashes = execFileSync('git', ['hash-object', '--no-filters', '--stdin-paths'],
  { cwd: root, input: originals.map(item => item.path).join('\n') + '\n' }).toString().trim().split('\n');
assert.deepEqual(hashes, originals.map(item => item.hash));
const oldSource = git('show', previous + ':src/games.mjs').toString();
const sourceUrl = new URL('../../src/games.mjs', import.meta.url);
const rewritten = oldSource.replace(/from '(\.\/[^']+)'/g, (_, path) => 'from ' + JSON.stringify(new URL(path, sourceUrl).href));
const old = await import('data:text/javascript;base64,' + Buffer.from(rewritten).toString('base64'));
const control = await current.runGame({ id: 'game-binding-control', seed: 'game-binding-control',
  base: { initialSize: 8, attackerShare: 0.25, days: 6, maxSubjects: 100 }, replicas: 3, deviation: { share: 0.25 }, reference: { attackers: 'abstain' },
  roles: { honest: { strategies: { watch: { activity: { inspect: 1 } }, rest: { activity: { inspect: 0 } } } },
    attackers: { strategies: { abstain: { activity: { invite: 0, guarantee: 0 } }, farm: { activity: { invite: 0.2, guarantee: 1 } } } } } });
const valuations = [
  { honest: { facts: { subjects: 1 } }, attackers: { facts: { subjects: 1 } } },
  { honest: { facts: { liquidFacy: 1, subjects: 2, effort: -0.01 } }, attackers: { facts: { liquidFacy: 1, subjects: 2, effort: -0.01 } } },
  { honest: {}, attackers: {} },
];
const comparisons = valuations.map(valuation => {
  const before = old.analyzeGame(control, valuation);
  const after = current.analyzeGame(control, valuation);
  const { inputDigest, ...conclusions } = after;
  assert.match(inputDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(conclusions, before, 'exclude only the newly added input binding');
  const beforeSummary = old.deterrenceSummary(control, before);
  const afterSummary = current.deterrenceSummary(control, after);
  assert.deepEqual(afterSummary, beforeSummary);
  for (const criteria of [{}, { maxFalseMintedShare: 0.2, maxCoalitionCouncilShare: 0.5 }]) {
    assert.deepEqual(current.assessViability(afterSummary, criteria), old.assessViability(beforeSummary, criteria));
  }
  const transported = JSON.parse(JSON.stringify({ ...control, analysis: after }));
  assert.deepEqual(current.deterrenceSummary(transported, transported.analysis), afterSummary);
  return { valuation, inputDigest, conclusionsDigest: digestOf(conclusions), summaryDigest: digestOf(afterSummary), equalExceptBinding: true, jsonRoundTripEqual: true };
});
const probe = await current.runGame({ id: 'game-binding-probe', replicas: 6,
  base: { initialSize: 6, attackerShare: 0.5, days: 3 }, reference: { attackers: 'abstain' },
  roles: { honest: { strategies: { watch: { activity: { invite: 0 } } } },
    attackers: { strategies: { abstain: { activity: { invite: 0 } }, farm: { activity: { invite: 0 } } } } } });
// Explicitly synthetic retained utilities isolate the old false-safe result, not farming profitability.
for (const entry of probe.facts) for (const replica of entry.replicas) {
  replica.agents.attackers.conformist.liquidFacy = entry.profile.attackers === 'abstain' ? 90 : 0;
  replica.agents.attackers.deviant.liquidFacy = 0;
}
const valuation = { honest: { facts: { subjects: 1 } }, attackers: { facts: { liquidFacy: 1 } } };
const oldCached = old.analyzeGame(probe, valuation);
const currentCached = current.analyzeGame(probe, valuation);
function evaluate(api, facts, cached) {
  try {
    const summary = api.deterrenceSummary(facts, cached);
    return { verdict: summary.verdict, viability: api.assessViability(summary) };
  } catch (error) { return { error: { name: error.name, message: error.message } }; }
}
assert.equal(evaluate(current, probe, currentCached).viability.viable, true);
const cases = {};
for (const kind of ['missing-valued-fact', 'finite-valued-fact', 'sanction', 'context', 'valuation', 'alpha']) {
  const facts = structuredClone(probe);
  const oldAnalysis = structuredClone(oldCached);
  const currentAnalysis = structuredClone(currentCached);
  if (kind === 'missing-valued-fact') delete facts.facts[0].replicas[0].agents.honest.conformist.subjects;
  if (kind === 'finite-valued-fact') facts.facts[0].replicas[0].agents.honest.conformist.subjects += 1;
  if (kind === 'sanction') facts.facts[0].replicas[0].sanctions.wrongfulInvalidated = 20;
  if (kind === 'context') facts.game.base.days += 1;
  if (kind === 'valuation') for (const analysis of [oldAnalysis, currentAnalysis]) analysis.valuation.honest.facts.subjects = 2;
  if (kind === 'alpha') for (const analysis of [oldAnalysis, currentAnalysis]) analysis.alpha = 0.01;
  const before = evaluate(old, facts, oldAnalysis);
  const after = evaluate(current, facts, currentAnalysis);
  assert.match(after.error.message, /rerun analyzeGame/);
  const fresh = evaluate(current, facts, current.analyzeGame(facts, currentAnalysis.valuation, { alpha: currentAnalysis.alpha }));
  assert.ok(!fresh.error);
  cases[kind] = { before, staleRejected: after, fresh };
}
assert.equal(cases['missing-valued-fact'].before.viability.viable, true);
assert.equal(cases['missing-valued-fact'].fresh.viability.viable, false);
const legacy = evaluate(current, probe, oldCached);
assert.match(legacy.error.message, /rerun analyzeGame/);
console.log(JSON.stringify({ schema: 'facety-game-binding-diagnostic/v1', level: 'diagnostic', previousRevision: previous,
  oldAnalyzerSha256: createHash('sha256').update(oldSource).digest('hex'), provenance: provenance(), randomness: RANDOMNESS_POLICY,
  method: 'Old pure analyzer with unchanged support modules; common native complete facts and explicit synthetic stale-data probes. Not historical full-model replay, source authentication or confirmation.',
  bindingPolicy: 'sha256-typed-game-inputs-v1',
  historicalPreservation: { rawBlobsEqual: true, studyFiles: originals.filter(item => item.path.startsWith('studies/')).length,
    unchangedSourceModules: originals.filter(item => item.path.startsWith('src/')).length },
  completeControl: { nativeRuns: control.runs, profiles: 4, deviations: 8, comparisons },
  syntheticProbe: { nativePrefixRuns: probe.runs, valuation, cases, legacyCache: legacy },
  limits: ['Only inputDigest metadata is excluded from analysis comparisons; no other result fields are discarded.',
    'An input fingerprint does not authenticate evidence, supplied output matrices, authorship or sampling independence.',
    'Legacy cached analyses need fresh offline analysis; summary-only historical grids cannot reconstruct raw missingness.',
    'Oracle validity, Sybils/collusion, arbitration capture, bootstrap, useful contribution and real attack economics remain separate questions.'],
}, null, 2));
