// Exploratory D50 probe (2026-10-29): per-cohort FACY-equivalent holdings per unit of declared effort.
// Exploration seed labels only; not a registration, confirmation or reserved-seed result.
import { runExperiment } from '../../src/experiment.mjs';

const round = value => Math.round(value * 1000) / 1000;
const ARMS = {
  default: {},
  disputes: { disputes: { enabled: true } },
  'disputes+verification': { disputes: { enabled: true }, social: { verification: true, investigation: true } },
};
const rows = [];
for (const scenario of ['sybil-cone', 'real-cartel']) {
  for (const [arm, extra] of Object.entries(ARMS)) {
    for (const seed of ['explore-d50-1', 'explore-d50-2', 'explore-d50-3']) {
      const out = runExperiment({ scenario, seed, days: 60, ...extra });
      const row = { scenario, arm, seed };
      for (const [cohort, groups] of Object.entries(out.agents)) {
        const sum = { operators: 0, subjects: 0, invalidated: 0, effort: 0, holdings: 0 };
        for (const facts of Object.values(groups)) {
          sum.operators += facts.operators;
          sum.subjects += facts.subjects;
          sum.invalidated += facts.invalidatedSubjects;
          sum.effort += facts.effort;
          sum.holdings += facts.liquidFacy + facts.emitterFacy + facts.stakeFacy - facts.debt;
        }
        row[cohort] = { ...sum, effort: round(sum.effort), perOperator: round(sum.holdings / sum.operators), perEffort: sum.effort ? round(sum.holdings / sum.effort) : null };
      }
      row.yieldRatio = row.honest.perEffort !== null && row.attackers.perEffort ? round(row.honest.perEffort / row.attackers.perEffort) : null;
      rows.push(row);
    }
  }
}
console.log(JSON.stringify({ schema: 'facety-d50-probe/v1', days: 60, rows }, null, 1));
