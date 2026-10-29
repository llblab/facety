// Exploratory topology-takeover/v1 trajectories (D115). Usage: node probe.mjs <on|off> <attackers> <days> <attackStartDay> <maxSubjects> [seed]
import { runTopologyExperiment } from '../../src/topology-experiment.mjs';
const [gate, attackers, days, attackStartDay, maxSubjects, seed = 'explore-topo-1'] = process.argv.slice(2);
const out = runTopologyExperiment({ seed, gate: gate !== 'off', attackers: Number(attackers), days: Number(days), attackStartDay: Number(attackStartDay), maxSubjects: Number(maxSubjects) });
console.log(JSON.stringify({ config: out.config, outcome: out.outcome, counts: out.counts, history: out.history.map(({ refusals, ...row }) => row), refusals: out.history.at(-1).refusals }));
