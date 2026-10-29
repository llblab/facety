// D114 exploratory trajectories: accepted attacker share and dirty FACY share (held by attackers) over 90 days.
// Usage: node trajectory-probe.mjs <sybil-cone|real-cartel> <none|challenge|verif> <fabricateIdentity weight>
import { runExperiment } from '../../src/experiment.mjs';
const [scenario, defense, fab] = process.argv.slice(2);
const DEF = { none: {}, challenge: { disputes: { enabled: true }, activity: { honest: { challenge: 0.05 } } },
  verif: { disputes: { enabled: true }, activity: { honest: { challenge: 0.05 } }, social: { verification: true, investigation: true } } };
const t = Date.now();
const out = runExperiment({ scenario, seed: 'explore-d114-1', days: 90, maxSubjects: 10000, maxActions: 5000000, weights: { fabricateIdentity: Number(fab) }, ...DEF[defense] });
const days = out.history.filter(p => p.stage === 'day-end');
const pick = [0, 10, 20, 30, 45, 60, 75, days.length - 1].map(i => days[i]).filter(Boolean);
const f = x => x === null ? 'null' : (100 * x).toFixed(1) + '%';
console.log([scenario, defense, 'fab' + fab, out.outcome.censoredReason ?? 'ok', (Date.now() - t) / 1000 + 's'].join(' '));
console.log('  day:      ' + pick.map(p => String(p.atHour / 24).padStart(6)).join(''));
console.log('  attackers:' + pick.map(p => f(p.dirty.acceptedAttackerShare).padStart(6)).join(''));
console.log('  dirtyHeld:' + pick.map(p => f(p.dirty.heldShare).padStart(6)).join(''));
