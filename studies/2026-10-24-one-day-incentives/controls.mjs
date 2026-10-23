import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BASELINE = '30093eca9c844ac047b41c12b0595b2dba53f7e9';
const EXAMPLES = ['incentives', 'incentive-payoffs', 'incentive-ownership'];
// Exercise public v1 contracts only; no retained scientific study or current v2 table is replayed.
const PROGRAM = `
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const load = name => import(pathToFileURL(join(process.argv[1], 'src', name + '.mjs')));
const { runIncentiveForks, readIncentiveComparisons } = await load('incentives');
const { evaluateIncentivePayoffs } = await load('incentive-payoffs');
const { compareIncentiveOwnership } = await load('incentive-ownership');
const { provenance } = await load('provenance');
const preferences = [
  { facyValue: 0, xpValue: 0, workUnitCost: 0, admissionBenefit: 0, guaranteeBenefit: 0, expectedLosses: { 'invite-only': 0, 'invite-and-guarantee': 0 } },
  { facyValue: 1, xpValue: 4, workUnitCost: 1, admissionBenefit: -1, guaranteeBenefit: 2, expectedLosses: { 'invite-only': -1, 'invite-and-guarantee': 2 } },
  { facyValue: null, xpValue: null, workUnitCost: null, admissionBenefit: null, guaranteeBenefit: null, expectedLosses: { 'invite-only': null, 'invite-and-guarantee': null } },
];
const payload = ['terminal', 'immediate'].map(xpFinality => {
  const native = runIncentiveForks({ xpFinality });
  const reordered = JSON.parse(JSON.stringify(native));
  reordered.branches.reverse();
  reordered.comparisons = [{ sponsor: { xp: 999, effort: 0 } }];
  const withoutEvents = structuredClone(reordered);
  withoutEvents.provenance = { implementation: { digest: 'untrusted metadata is ignored by v1' } };
  for (const branch of withoutEvents.branches) delete branch.events;
  return { native, analyses: [native, reordered, withoutEvents].map(source => ({
    facts: readIncentiveComparisons(source),
    payoffs: preferences.map(preference => evaluateIncentivePayoffs(source, preference)),
    ownership: compareIncentiveOwnership(source),
  })) };
});
console.log(JSON.stringify({ provenance: provenance(), payload }));
`;

const temporary = mkdtempSync(join(tmpdir(), 'facety-incentive-legacy-'));
try {
  const archive = execFileSync('git', ['archive', BASELINE, 'src', 'examples'], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', temporary], { input: archive });
  const read = root => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', PROGRAM, root], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  const before = read(temporary);
  const after = read(ROOT);
  const baselinePayload = JSON.stringify(before.payload);
  assert.equal(JSON.stringify(after.payload), baselinePayload, 'complete v1 factory/reader/payoff/ownership outputs changed');
  const examples = EXAMPLES.map(name => {
    const args = ['examples/' + name + '.mjs'];
    const reference = execFileSync(process.execPath, args, { cwd: temporary, encoding: 'utf8' });
    const current = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
    assert.equal(current, reference, name + ' stdout changed');
    return { path: args[0], bytes: Buffer.byteLength(current), sha256: createHash('sha256').update(current).digest('hex'), byteIdentical: true };
  });
  console.log(JSON.stringify({
    schema: 'facety-incentive-legacy-preservation/v1', baseline: { commit: BASELINE, ...before.provenance },
    current: after.provenance, controls: {
      factoryArtifacts: 2, sourceTransportsPerMode: 3, checkedFactArrays: 6, payoffAnalyses: 18, ownershipAnalyses: 6,
      payloadBytes: Buffer.byteLength(baselinePayload), payloadSha256: createHash('sha256').update(baselinePayload).digest('hex'), byteIdentical: true,
    }, examples,
    boundary: 'Deterministic software compatibility controls, not replay of stored science, new v2 measurements or independent review.',
  }, null, 2));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
