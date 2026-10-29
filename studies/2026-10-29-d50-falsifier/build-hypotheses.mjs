// Builds the four D50 hypothesis files: {sybil-cone, real-cartel} x {weak, strong}.
// v1 (withdrawn before any value): D42 maturity XP, which the engine refuses once disputes create debt.
// v2 (current): legacy terminal XP; see README 'Registration'.
const VERSION = process.argv[2] ?? 'v2';
if (!['v1', 'v2'].includes(VERSION)) throw new Error('version must be v1 or v2');
import { writeFileSync } from 'node:fs';

const DEFENSES = {
  'no-defense': { 'disputes.enabled': false, 'activity.honest.challenge': 0 },
  challenge: { 'disputes.enabled': true, 'activity.honest.challenge': 0.05 },
  'challenge-verification': { 'disputes.enabled': true, 'activity.honest.challenge': 0.05, 'social.verification': true, 'social.investigation': true },
};
const WEIGHTS = [1, 5, 20];
const contexts = [];
for (const [defense, parameters] of Object.entries(DEFENSES)) {
  for (const weight of WEIGHTS) contexts.push({ id: defense + '-fab' + weight, parameters: { ...parameters, 'weights.fabricateIdentity': weight } });
}
const CLAIMS = {
  weak: {
    statistic: { metric: 'yield.honestPerEffort', summary: 'endpoint', subtract: 'yield.attackersPerEffort' },
    statement: 'Weak D50: at day 90, honest cohort FACY-equivalent holdings per unit of declared effort exceed the attacker cohort\'s (ratio > 1, encoded as a positive difference so negative attacker yields stay defined).',
    rationale: 'D109 kill: contradicted if, in any context, attacker yield per effort is at least honest yield in significantly more than half of the reserved replicas.',
  },
  strong: {
    statistic: { metric: 'yield.strongTargetGap', summary: 'endpoint' },
    statement: 'Strong D50: at day 90, honest yield per effort is at least ten times the attacker\'s (honest - 10 x attacker > 0, equivalent to log ratio > ln 10 for positive yields).',
    rationale: 'D109: the 10x target counts as supported only if it holds in every context.',
  },
};
const EXPLORATION = ['p1', 'p2', 'p3', 'x', 'explore-d50-1', 'explore-d50-2', 'explore-d50-3', 'd50-yield'];
for (const scenario of ['sybil-cone', 'real-cartel']) {
  for (const [level, claim] of Object.entries(CLAIMS)) {
    const hypothesis = {
      id: 'd50-' + level + '-' + scenario + (VERSION === 'v2' ? '-v2' : ''),
      statement: claim.statement + ' Scenario: ' + scenario + '.',
      kind: 'association',
      declaredOn: '2026-10-29',
      base: { scenario, seed: 'd50-' + scenario, days: 90, maxSubjects: 10000, maxActions: 5000000, ...(VERSION === 'v1' ? { policy: { xpFinality: 'maturity' } } : {}) },
      statistic: claim.statistic,
      arms: { protocol: {} },
      contexts,
      claims: [{ id: level, role: 'presence', contrast: { protocol: 1 }, direction: 'greater', margin: 0, probability: 0.5, rationale: claim.rationale }],
      alternatives: [],
      replicas: 30,
      alpha: 0.05,
      exploration: { seeds: EXPLORATION, source: 'studies/2026-10-29-d50-falsifier/README.md (probe.mjs and ad hoc 2026-10-29 runtime probes)' },
    };
    writeFileSync(new URL('hypotheses/' + hypothesis.id + '.json', import.meta.url), JSON.stringify(hypothesis, null, 2) + '\n');
  }
}
