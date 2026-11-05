// Grow the honest prefix to 1000 honest participants. Usage: node prefix.mjs [seed] [pathCap: none|nodes|nodesL]  (suffix L = D124 layered support)
import { writeFileSync } from 'node:fs';
import { runTopologyExperiment } from '../../src/topology-experiment.mjs';
const [seed = 'grown-1000-1', cap = 'none', vet = '0'] = process.argv.slice(2);
const vtag = vet === '0' ? '' : '-v' + vet;
const layered = cap.endsWith('L'), nodes = cap === 'none' ? null : Number(cap.replace(/L$/, ''));
const o = runTopologyExperiment({ seed, attackers: 0, days: 400, attackStartDay: 399, maxSubjects: 5000, stopAtHonest: 1000, maxPathNodes: nodes, pathSupport: layered ? 'layered' : null, honest: { vetting: Number(vet) } });
const h = o.history;
writeFileSync(new URL('runs/prefix-' + seed + (cap === 'none' ? '' : '-L' + cap) + vtag + '.json', import.meta.url), JSON.stringify({ config: o.config, outcome: o.outcome, counts: o.counts, history: h.map(({ refusals, ...r }) => r), refusals: h.at(-1).refusals }));
console.log(JSON.stringify(o.outcome), h.filter(r => r.day % 20 === 0 || r === h.at(-1)).map(r => `d${r.day}:H${r.honest}/D${r.D}/C${r.councilSize}`).join(' '), JSON.stringify(h.at(-1).refusals), JSON.stringify(o.counts));
