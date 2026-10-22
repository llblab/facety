// Differential scheduler control, not a replay of historical research under its original implementation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { runExperiment, RANDOMNESS_POLICY } from '../../src/experiment.mjs';
import { digestOf, provenance } from '../../src/provenance.mjs';

const revision = 'af9b12eb34204cdb0a0f6d523aacb44aa9fe5fe5';
const sourceUrl = new URL('../../src/experiment.mjs', import.meta.url);
const original = execFileSync('git', ['show', revision + ':src/experiment.mjs'], { encoding: 'utf8' });
const portable = original.replace(/from '(\.\/[^']+)'/g, (_, relative) => 'from ' + JSON.stringify(new URL(relative, sourceUrl).href));
const reference = await import('data:text/javascript;base64,' + Buffer.from(portable).toString('base64'));
function retainedFacts(run) {
  const copy = structuredClone(run);
  for (const groups of Object.values(copy.agents)) for (const facts of Object.values(groups)) {
    delete facts.stakeFacy;
    delete facts.falseStakeFacy;
  }
  delete copy.state.disputeStakes;
  delete copy.system.stakeFacy;
  delete copy.system.falseStakeFacy;
  for (const point of copy.history) delete point.stakes;
  return { state: copy.state, outcome: copy.outcome, effort: copy.effort, money: copy.money, agents: copy.agents,
    system: copy.system, impact: copy.impact, metrics: copy.metrics, history: copy.history,
    observations: copy.observations, rejections: copy.rejections };
}
const checks = [];
for (const procedure of ['one-step', 'chekharda', 'chekharda-timed']) {
  for (const seed of ['stake-compatibility:A', 'stake-compatibility:B']) {
    const config = {
      seed, scenario: 'sybil-cone', initialSize: 20, attackerShare: 0.2, days: 18, maxSubjects: 1500,
      sensitivity: 0.5, falsePositiveRate: 0.05, includeState: true,
      activity: { honest: { inspect: 3, challenge: 1, review: 1 }, attackers: { inspect: 2, challenge: 1 } },
      disputes: { enabled: true, procedure, stake: 3, disputeWindowHours: 48 },
    };
    const before = retainedFacts(reference.runExperiment(config));
    const after = retainedFacts(runExperiment(config));
    assert.deepEqual(after, before, procedure + '/' + seed);
    checks.push({ config, retainedFactsDigest: digestOf(after), equivalent: true });
  }
}
console.log(JSON.stringify({
  schema: 'facety-unsecured-scheduler-control/v1', level: 'diagnostic', provenance: provenance(), randomness: RANDOMNESS_POLICY,
  referenceSchedulerRevision: revision,
  method: 'Both schedulers use the CURRENT model/support modules. Compare all pre-existing retained state, trajectories, actions, costs, outcomes and measurements exactly; omit only newly added zero-valued stake facts and commitment records. This is not a historical implementation replay or a proof for other contexts.',
  checks,
}, null, 2));
