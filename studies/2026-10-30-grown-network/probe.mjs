// Grown-network attack series (D122): one honest network grows from the 100-person genesis to 1000 honest participants,
// then cooperating attackers (1..10) enter from that same state. Usage: node probe.mjs <attackers> <arm: gate|detect> [seed] [horizonDays] [maxSubjects] [pathCap: none|nodes|nodesL] [strategy: cone|honest-first]  (suffix L = D124 layered support)
import { readFileSync, writeFileSync } from 'node:fs';
import { runTopologyExperiment } from '../../src/topology-experiment.mjs';
const [attackers, arm, seed = 'grown-1000-1', horizon = '100', maxSubjects = '10000', cap = 'none', strategy = 'cone', vet = '0'] = process.argv.slice(2);
// HONEST/PTAG must match the prefix; DETECTION='{"acquitMet":true}' and TAG only change the attack phase.
const vtag = (vet === '0' ? '' : '-v' + vet) + (process.env.PTAG ?? '');
const honestExtra = JSON.parse(process.env.HONEST ?? '{}'), detectionExtra = JSON.parse(process.env.DETECTION ?? '{}');
const layered = cap.endsWith('L'), maxPathNodes = cap === 'none' ? null : Number(cap.replace(/L$/, '')), pathSupport = layered ? 'layered' : null, suffix = cap === 'none' ? '' : '-L' + cap;
const prefix = JSON.parse(readFileSync(new URL('runs/prefix-' + seed + suffix + vtag + '.json', import.meta.url), 'utf8'));
const start = prefix.outcome.completedDays; // first day after the snapshot
const progress = [];
const out_suffix = suffix + vtag + (strategy === 'cone' ? '' : '-' + strategy) + (process.env.TAG ?? '');
const checkpoint = new URL('runs/' + arm + '/' + seed + '-a' + attackers + out_suffix + '.partial.json', import.meta.url);
const out = runTopologyExperiment({ seed, maxPathNodes, pathSupport, attackerStrategy: strategy, honest: { vetting: Number(vet), ...honestExtra }, attackers: Number(attackers), attackStartDay: start, days: start + Number(horizon), maxSubjects: Number(maxSubjects),
  detection: arm === 'detect' ? { enabled: true, leave: true, publicLook: 0.02, followUp: true, ...detectionExtra } : {}, detectionStartDay: start },
  { onDay(row) {
    if (row.day < start - 1) return;
    const { refusals, detection, ...rest } = row;
    // Progress line and checkpoint every day after the snapshot, so an interrupted run keeps its trajectory.
    console.error(JSON.stringify({ t: Math.round(process.uptime()), day: rest.day, honest: rest.honest, attackers: rest.attackers, share: rest.attackerShare, D: rest.D, council: rest.councilSize, councilAttackers: rest.councilAttackers }));
    progress.push(rest);
    if (rest.day % 5 === 0) writeFileSync(checkpoint, JSON.stringify({ partial: true, attackers: Number(attackers), arm, history: progress }));
  } });
// Snapshot check: every pre-attack day must equal the stored prefix row exactly (deterministic replay of one honest history).
const strip = ({ refusals, detection, ...row }) => JSON.stringify(row);
for (let day = 0; day < start; day++) if (strip(out.history[day]) !== strip(prefix.history[day])) throw new Error('snapshot mismatch on day ' + day);
console.log(JSON.stringify({ snapshotDay: start - 1, snapshotVerified: true, config: out.config, outcome: out.outcome, counts: out.counts, detection: out.detection,
  history: out.history.slice(start - 1).map(({ refusals, ...row }) => row), refusals: out.history.at(-1).refusals }));
