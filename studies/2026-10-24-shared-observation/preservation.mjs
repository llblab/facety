// Owns: Fixed software comparison against archived 0d6ba4d, not scientific outcomes or historical replay.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runExperiment } from '../../src/experiment.mjs';
import { implementationDigest } from '../../src/provenance.mjs';

export async function checkPreservation(directory) {
  const baseline = await import(pathToFileURL(resolve(directory, 'src/experiment.mjs')).href);
  const identity = await import(pathToFileURL(resolve(directory, 'src/provenance.mjs')).href);
  assert.equal(identity.implementationDigest().digest, '5070d49ac2a99edd707d84adb80afb3a28d000098133657de5b6dfe23d6eb2e5');
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
  for (const stepHours of [4, 6]) {
    const dispute = { enabled: true, procedure: 'chekharda-timed', entryTiming: 'each-tick', roundsPerDay: 24 / stepHours };
    configs.push({ stepHours, disputes: dispute });
    const attended = { stepHours, initialTopology: 'clique', invitationReviewTiming: 'first-attended', activity: { honest: { review: 1, inspect: 0, invite: 0 }, attackers: { invite: 1 } } };
    configs.push(attended, { ...attended, disputes: dispute }, { ...attended, scenario: 'real-cartel' });
    for (const kind of ['none', 'staggered']) configs.push({ ...attended, actorProfiles: Array.from({ length: 10 }, (_, index) => ({ subject: 'n' + index, attentionHours: kind === 'none' ? [] : Array.from({ length: 6 }, (_, day) => 24 * day + stepHours * (index % (24 / stepHours))) })) });
  }
  const hash = createHash('sha256');
  let bytes = 0;
  for (const [index, config] of configs.entries()) {
    const input = { seed: 'shared-observation-preserve-' + index, days: 6, initialSize: 10, includeState: true, ...config };
    const old = structuredClone(baseline.runExperiment(input));
    const current = structuredClone(runExperiment(input));
    delete old.provenance;
    delete current.provenance;
    delete current.config.invitationEvidence;
    assert.deepEqual(current, old, 'independent-path software case ' + index);
    const payload = JSON.stringify(old);
    bytes += Buffer.byteLength(payload);
    hash.update(payload);
  }
  return { schema: 'facety-shared-observation-preservation/v1', referenceCheckpoint: '0d6ba4d', baseline: identity.implementationDigest(), current: implementationDigest(), node: process.version, comparisons: configs.length, bytes, sha256: hash.digest('hex'), exclusions: ['provenance', 'config.invitationEvidence'], interpretation: 'Fixed fresh software fixtures across 24/6/4-hour clocks, first-attended calendars and regular-dispute combinations. No historical research seed, common-mode outcome cohort or confirmation.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('one archived 0d6ba4d source directory required');
  console.log(JSON.stringify(await checkPreservation(process.argv[2])));
}
