import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runRelayArm, runRelayComparison, RELAY_ARMS, RELAY_CONTEXTS } from '../../examples/causal-relay.mjs';

const baseline = '94fec29d689a1de5d12afbdc489b84161a66934c';
const root = fileURLToPath(new URL('../../', import.meta.url));
execFileSync('git', ['diff', '--exit-code', baseline, '--', 'src', 'examples/causal-walkthroughs.mjs'], { cwd: root });
const source = execFileSync('git', ['show', baseline + ':examples/causal-relay.mjs'], { cwd: root, encoding: 'utf8' });
const temporary = new URL('../../examples/.service-order-reference-' + randomUUID() + '.mjs', import.meta.url);
let comparisons = 0;
writeFileSync(temporary, source, { flag: 'wx' });
try {
  const reference = await import(temporary.href);
  for (const context of RELAY_CONTEXTS) for (const arm of RELAY_ARMS) for (let i = 0; i < 8; i++) {
    const seed = 'd39-order-default-control-' + String(i).padStart(2, '0');
    assert.deepEqual(runRelayArm(seed, context, arm, { traceLimit: 64 }), reference.runRelayArm(seed, context, arm, { traceLimit: 64 }));
    comparisons++;
  }
  const options = { seeds: ['d39-order-comparison-control-00', 'd39-order-comparison-control-01'] };
  const omitChangedDesignHash = result => ({ ...result, design: result.design.map(entry => entry.path === 'examples/causal-relay.mjs' ? { ...entry, sha256: null } : entry) });
  assert.deepEqual(omitChangedDesignHash(runRelayComparison(options)), omitChangedDesignHash(reference.runRelayComparison(options)));
  console.log(JSON.stringify({ baseline, nativeAndWorldSourceUnchanged: true, completeDefaultArmComparisons: comparisons,
    comparisonWrapperRunsPerVersion: 18, wrapperDifferenceAllowed: 'Only examples/causal-relay.mjs source-design hash',
    historicalScientificStudyReplayed: false, interpretation: 'Default compatibility on control labels, not new scientific replicas.' }, null, 2));
} finally {
  unlinkSync(temporary);
}
