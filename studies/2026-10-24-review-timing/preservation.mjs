// Owns: Default-path software compatibility against the archived reference, not new research evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runExperiment } from '../../src/experiment.mjs';
import { implementationDigest } from '../../src/provenance.mjs';

export async function checkPreservation(directory) {
  const baseline = await import(pathToFileURL(resolve(directory, 'src/experiment.mjs')).href);
  const identity = await import(pathToFileURL(resolve(directory, 'src/provenance.mjs')).href);
  assert.equal(identity.implementationDigest().digest, '30a6d69e3e7b384b48dfbda4dece7af7d6077f5948a1e6f135ab00bb21431379');
  const cases = [
    {}, { scenario: 'honest-growth' }, { scenario: 'real-cartel' }, { initialTopology: 'clique' },
    { initialTopology: 'none', activity: { honest: { selfId: 0, guarantee: 0, inspect: 0, invite: 0 }, attackers: { selfId: 0, guarantee: 0, inspect: 0, invite: 0 } } },
    { budgets: { honest: 0, attackers: 0 } }, { maxActions: 100 }, { policy: { invitationFreezeHours: 0 } },
    { disputes: { enabled: true }, activity: { honest: { challenge: 1 }, attackers: { invite: 1 } } },
    { disputes: { enabled: true, procedure: 'chekharda-timed', roundsPerDay: 3, disputeWindowHours: 25 }, activity: { honest: { challenge: 1 }, attackers: { invite: 1 } } },
    { social: { scope: 'acquaintances', gossipHops: 2, verification: true } },
    { perturbations: [{ startDay: 2, endDay: 4, activity: { honest: { selfId: 0.2 } } }] },
  ];
  const configs = [24, 6, 4].flatMap(stepHours => cases.map(config => ({ ...config, stepHours })));
  for (const stepHours of [4, 6]) configs.push({ stepHours, disputes: { enabled: true, procedure: 'chekharda-timed', entryTiming: 'each-tick', roundsPerDay: 24 / stepHours } });
  const hash = createHash('sha256');
  let bytes = 0;
  for (const [index, config] of configs.entries()) {
    const input = { seed: 'review-timing-preserve-' + index, days: 6, initialSize: 10, includeState: true, ...config };
    const old = structuredClone(baseline.runExperiment(input));
    const current = structuredClone(runExperiment(input));
    delete old.provenance;
    delete current.provenance;
    delete current.config.invitationReviewTiming;
    assert.deepEqual(current, old, 'default-path software case ' + index);
    const payload = JSON.stringify(old);
    bytes += Buffer.byteLength(payload);
    hash.update(payload);
  }
  return { schema: 'facety-review-timing-preservation/v1', referenceCheckpoint: 'c4b700f', baseline: identity.implementationDigest(), current: implementationDigest(), comparisons: configs.length, bytes, sha256: hash.digest('hex'), exclusions: ['provenance', 'config.invitationReviewTiming'], interpretation: 'Fixed software fixtures across 24/6/4-hour defaults and regular-dispute variants; no historical research capture or first-attended outcome study.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('one archived c4b700f source directory required');
  console.log(JSON.stringify(await checkPreservation(process.argv[2])));
}
