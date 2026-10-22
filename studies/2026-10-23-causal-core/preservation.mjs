import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { provenance, digestOf } from '../../src/provenance.mjs';
import { RANDOMNESS_POLICY } from '../../src/experiment.mjs';

const url = new URL('../../src/experiment.mjs', import.meta.url);
let source = await readFile(url, 'utf8');
const marker = '    observations, rejections, money, agents, system,';
assert.equal(source.split(marker).length, 2);
source = source.replace(marker, marker + '\n    protocolEventsForControl: model.events(),');
source = source.replace(/from '(\.\/[^']+)'/g, (_, relative) => 'from ' + JSON.stringify(new URL(relative, url).href));
const { runExperiment } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const capture = process.argv.includes('--capture');
const baseline = capture ? null : JSON.parse(await readFile(new URL('./preservation-baseline.json', import.meta.url), 'utf8'));
const checks = [];
for (const procedure of ['one-step', 'chekharda', 'chekharda-timed']) {
  for (const stakeBacking of ['unsecured', 'reserved']) {
    for (const hooks of [false, true]) {
      const config = {
        seed: 'causal-preservation:' + Number(hooks), initialSize: 20, attackerShare: 0.2, days: 18,
        includeState: true, maxSubjects: 1500,
        activity: { honest: { inspect: 3, challenge: 1, review: 1 }, attackers: { inspect: 2, challenge: 1 } },
        disputes: { enabled: true, procedure, stakeBacking, disputeWindowHours: 48, excludeLiable: hooks },
        social: { investigation: hooks, gossipHops: hooks ? 2 : 0 },
      };
      const run = runExperiment(config);
      const { provenance: ignored, ...retained } = run;
      const row = { config, digest: digestOf(retained), cases: run.disputes.cases.length, events: run.protocolEventsForControl.length };
      if (!capture) assert.deepEqual(row, baseline.checks[checks.length], procedure + '/' + stakeBacking + '/' + hooks);
      checks.push(row);
    }
  }
}
console.log(JSON.stringify({
  schema: 'facety-causal-preservation/v1', level: 'diagnostic', provenance: provenance(), randomness: RANDOMNESS_POLICY,
  method: 'Exact digest of every run field except provenance, plus the complete ordered protocol event log. Twelve declared procedure/backing/social-hook contexts; no favorable-seed search. Not a historical confirmation replay.',
  baselineImplementation: baseline?.provenance.implementation ?? provenance().implementation,
  equivalent: capture ? null : true, checks,
}, null, 2));
