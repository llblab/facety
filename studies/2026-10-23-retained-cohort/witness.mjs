import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as current from '../../src/games.mjs';
import { RANDOMNESS_POLICY } from '../../src/experiment.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';

const previous = 'a821e2beb4e4963900b9948b303b7ebb857ccb27';
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
const control = await current.runGame({ id: 'retained-cohort-control', seed: 'retained-cohort-control',
  base: { initialSize: 8, attackerShare: 0.25, days: 6, maxSubjects: 100 }, replicas: 3, deviation: { share: 0.25 }, reference: { attackers: 'abstain' },
  roles: { honest: { strategies: { watch: { activity: { inspect: 1 } }, rest: { activity: { inspect: 0 } } } },
    attackers: { strategies: { abstain: { activity: { invite: 0, guarantee: 0 } }, farm: { activity: { invite: 0.2, guarantee: 1 } } } } } });
const valuations = [
  { honest: { facts: { subjects: 1 } }, attackers: { facts: { subjects: 1 } } },
  { honest: { facts: { liquidFacy: 1, subjects: 2, effort: -0.01 } }, attackers: { facts: { liquidFacy: 1, subjects: 2, effort: -0.01 } } },
];
const comparisons = valuations.map(valuation => {
  const before = old.analyzeGame(control, valuation);
  const after = current.analyzeGame(control, valuation);
  assert.deepEqual(after, before);
  const beforeSummary = old.deterrenceSummary(control, before);
  const afterSummary = current.deterrenceSummary(control, after);
  assert.deepEqual(afterSummary, beforeSummary);
  for (const criteria of [{}, { maxFalseMintedShare: 0.2, maxCoalitionCouncilShare: 0.5 }]) {
    assert.deepEqual(current.assessViability(afterSummary, criteria), old.assessViability(beforeSummary, criteria));
  }
  return { valuation, analysisDigest: digestOf(after), summaryDigest: digestOf(afterSummary), equal: true };
});
const probe = await current.runGame({ id: 'retained-cohort-probe', replicas: 6,
  base: { initialSize: 6, attackerShare: 0.5, days: 3 }, reference: { attackers: 'abstain' },
  roles: { honest: { strategies: { watch: { activity: { invite: 0 } } } },
    attackers: { strategies: { abstain: { activity: { invite: 0 } }, farm: { activity: { invite: 0 } } } } } });
// Synthetic retained utilities isolate inference, not real farming profitability or protocol mutations.
for (const entry of probe.facts) for (const replica of entry.replicas) {
  replica.agents.attackers.conformist.liquidFacy = entry.profile.attackers === 'abstain' ? 90 : 0;
  replica.agents.attackers.deviant.liquidFacy = 0;
}
const valuation = { honest: { facts: { subjects: 1 } }, attackers: { facts: { liquidFacy: 1 } } };
function evaluate(api, facts, cached = null) {
  try {
    const analysis = cached ?? api.analyzeGame(facts, valuation);
    const summary = api.deterrenceSummary(facts, analysis);
    return { payoff: analysis.profiles[0].payoffs.honest, best: analysis.bestResponses.honest.abstain,
      wrongfulReported: Object.hasOwn(analysis.profiles[0].sanctions, 'wrongfulInvalidated'),
      wrongful: analysis.profiles[0].sanctions.wrongfulInvalidated ?? null,
      equilibria: summary.equilibria?.length ?? null, honestWithoutFraud: summary.honestWithoutFraud,
      verdict: summary.verdict, viability: api.assessViability(summary) };
  } catch (error) { return { error: { name: error.name, message: error.message } }; }
}
const baseline = evaluate(current, probe);
assert.equal(baseline.viability.viable, true);
const cases = {};
for (const kind of ['partial-count', 'missing-payoff', 'sanction-first', 'sanction-later', 'sanction-null']) {
  const facts = structuredClone(probe);
  if (kind === 'partial-count') facts.game.replicas = 20;
  if (kind === 'missing-payoff') delete facts.facts[0].replicas[0].agents.honest.conformist.subjects;
  if (kind === 'sanction-first') delete facts.facts[0].replicas[0].sanctions.wrongfulInvalidated;
  if (kind === 'sanction-later') delete facts.facts[0].replicas[1].sanctions.wrongfulInvalidated;
  if (kind === 'sanction-null') facts.facts[0].replicas[1].sanctions.wrongfulInvalidated = null;
  const before = evaluate(old, facts);
  const after = evaluate(current, facts);
  cases[kind] = { before, after };
  if (kind === 'partial-count') { assert.equal(before.viability.viable, true); assert.match(after.error.message, /replica cohort/); }
  else if (kind === 'missing-payoff') {
    assert.equal(before.viability.viable, true); assert.equal(after.viability.viable, false); assert.equal(after.equilibria, null);
    const cached = old.analyzeGame(facts, valuation);
    const checked = evaluate(current, facts, cached);
    assert.equal(checked.verdict, 'unresolved'); cases[kind].oldCachedAnalysisRechecked = checked;
    const stale = evaluate(current, facts, current.analyzeGame(probe, valuation));
    assert.equal(stale.viability.viable, true);
    cases[kind].remainingStaleCompleteCache = { freshViable: after.viability.viable, staleViable: stale.viability.viable };
  } else {
    assert.equal(after.wrongfulReported, true); assert.equal(after.wrongful, null); assert.equal(after.viability.viable, false);
  }
}
console.log(JSON.stringify({ schema: 'facety-retained-cohort-diagnostic/v1', level: 'diagnostic', previousRevision: previous,
  oldAnalyzerSha256: createHash('sha256').update(oldSource).digest('hex'), provenance: provenance(), randomness: RANDOMNESS_POLICY,
  method: 'Old pure analyzer with unchanged current support modules; common complete native facts plus explicitly synthetic incomplete records. Not historical full-model replay or confirmation.',
  historicalPreservation: { rawBlobsEqual: true, studyFiles: originals.filter(item => item.path.startsWith('studies/')).length,
    unchangedSourceModules: originals.filter(item => item.path.startsWith('src/')).length },
  completeControl: { nativeRuns: control.runs, profiles: 4, deviations: 8, comparisons },
  syntheticProbe: { nativePrefixRuns: probe.runs, valuation, baseline, cases },
  limits: ['Seed identity consistency is not authentication, independent sampling or a complete fact-schema check.',
    'Cached analyses must correspond to the supplied facts and valuation; descriptor checks do not authenticate that association.',
    'Censoring, evidence validity, Sybils/collusion, arbitration capture, bootstrap and actual attack costs remain separate risks. No usefulness, adoption or sustainable-distribution claim.'],
}, null, 2));
