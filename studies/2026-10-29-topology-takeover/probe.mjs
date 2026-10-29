// Exploratory topology-takeover trajectories (D115/D116).
// Usage: node probe.mjs <on|off> <attackers> <days> <attackStartDay> <maxSubjects> [seed] [acceptFar] [detection on|off]
import { runTopologyExperiment } from '../../src/topology-experiment.mjs';
const [gate, attackers, days, attackStartDay, maxSubjects, seed = 'explore-topo-1', acceptFar = '0.05', detection = 'off'] = process.argv.slice(2);
const out = runTopologyExperiment({ seed, gate: gate !== 'off', attackers: Number(attackers), days: Number(days), attackStartDay: Number(attackStartDay), maxSubjects: Number(maxSubjects),
  honest: { acceptFar: Number(acceptFar) }, detection: { enabled: detection === 'on' } });
console.log(JSON.stringify({ config: out.config, outcome: out.outcome, counts: out.counts, detection: out.detection, history: out.history.map(({ refusals, ...row }) => row), refusals: out.history.at(-1).refusals }));
