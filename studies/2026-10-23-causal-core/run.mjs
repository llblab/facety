import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { WALKTHROUGHS, runWalkthrough, renderWalkthrough } from '../../examples/causal-walkthroughs.mjs';
import { runRelayComparison, runRelayArm, RELAY_CONTEXTS, renderRelayComparison } from '../../examples/causal-relay.mjs';

const walkthroughs = WALKTHROUGHS.map(name => runWalkthrough(name));
const comparison = runRelayComparison();
const traced = comparison.runs.map(original => {
  const replay = runRelayArm(original.seed, RELAY_CONTEXTS.find(context => context.id === original.context), original.arm, { traceLimit: 100, inertInspection: true });
  const { trace: off, ...expected } = original;
  const { trace, ...actual } = replay;
  assert.deepEqual(actual, expected, 'tracing/inspection changed ' + JSON.stringify([original.seed, original.context, original.arm]));
  return { seed: replay.seed, context: replay.context, arm: replay.arm, trace };
});
const artifacts = [
  ['walkthroughs.json.gz', walkthroughs],
  ['relay-exploration.json.gz', comparison],
  ['trace-control.json.gz', { provenance: comparison.provenance, design: comparison.design, randomness: comparison.randomness,
    equivalent: true, checks: traced.length, scope: 'All retained paired-run fields except optional trace compare exactly; full tracing plus inert inspection; diagnostic only.', runs: traced }],
  ['walkthroughs.md', '# Native causal walkthroughs\n\nDiagnostic supplied-input pathways, not population or incentive findings.\n\n' + walkthroughs.map(renderWalkthrough).join('\n\n') + '\n'],
  ['relay-summary.md', renderRelayComparison(comparison) + '\n'],
];
const check = process.argv.includes('--check');
// Verify every existing output before creating any missing one; never overwrite an artifact.
for (const [name, value] of artifacts) {
  const url = new URL(name, import.meta.url);
  if (check || existsSync(url)) {
    const saved = readFileSync(url);
    assert.deepEqual(name.endsWith('.gz') ? JSON.parse(gunzipSync(saved)) : saved.toString(), value, name + ': source/runtime identity and semantic output must match');
  }
}
if (!check) for (const [name, value] of artifacts) {
  const url = new URL(name, import.meta.url);
  if (!existsSync(url)) writeFileSync(url, name.endsWith('.gz') ? gzipSync(Buffer.from(JSON.stringify(value))) : value, { flag: 'wx' });
}
console.log(JSON.stringify({ mode: check ? 'verified existing' : 'captured new', walkthroughs: walkthroughs.length, runs: comparison.runs.length,
  provenance: comparison.provenance, randomness: comparison.randomness, artifacts: artifacts.map(([name]) => name) }, null, 2));
