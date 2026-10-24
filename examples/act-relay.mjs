import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { causalWorld } from './causal-walkthroughs.mjs';
import { actObservationEnvironment } from '../src/act-observations.mjs';
import { EvidenceRelay, accountabilitySnapshot } from '../src/accountability.mjs';
import { experimentConfig } from '../src/experiment.mjs';
import { challengeAccess } from '../src/disputes.mjs';
import { implementationDigest } from '../src/provenance.mjs';

export function runActRelayExample() {
  const { model, acts } = causalWorld();
  const act = model.selfId(acts.Mira);
  const facts = { subjects: [{ id: 'Mira', genuine: true, behaviorProfile: 'good-faith' }],
    acts: [{ id: act.id, subject: 'Mira', kind: 'self-id', recordedAt: act.recordedAt, valid: false }] };
  const rates = Object.fromEntries(['self-id', 'invitation', 'guarantee'].map(kind => [kind,
    { ordinary: { valid: 1, invalid: 1 }, guarantor: { valid: 1, invalid: 1 } }]));
  const options = { seed: 'act-relay-example-software-only', rates };
  const environment = actObservationEnvironment(facts, options);
  const rules = experimentConfig({ disputes: { enabled: true, stakeBacking: 'reserved' } }).disputes;
  const relay = new EvidenceRelay(model, { claim: 'act-defect', rules, traceLimit: 100, actors: [
    { id: 'Aster', subject: 'Aster', budget: 12, reviewCapacity: 2 },
    { id: 'Bela', subject: 'Bela', budget: 12, reviewCapacity: 2 },
  ] });
  const before = accountabilitySnapshot(model);
  const observation = relay.observeAct('Aster', act.id, environment, { role: 'guarantor', opportunity: 'source-look', sourceGroup: 'public-media' });
  const evidence = relay.package('Aster', [observation.value]);
  const route = relay.route('Aster', evidence.value, 'Bela');
  const review = relay.reviewAct('Bela', evidence.value, environment, { role: 'guarantor', opportunity: 'sponsor-look', sourceGroup: 'declared-other-source' });
  const sourceAccess = challengeAccess(model, 'Aster', 'Mira', rules.stake);
  const attemptedEntry = relay.sponsor('Bela', evidence.value);
  assert.deepEqual(accountabilitySnapshot(model), before);
  assert.equal(attemptedEntry.reason, 'act-defect-adjudication-unimplemented');
  return { schema: 'facety-act-relay-software-example/v1', level: 'software-interface-example-not-research', implementation: implementationDigest(),
    assumptions: ['Native funded admission/acts, but legacy reference XP/custody, not D42 migration; prefix setup work remains unpriced.',
      'Validity is a supplied external act fact, not a selected requirement, media authentication or court conclusion.',
      'Extreme all-one rates are software boundary witnesses, not a detector recommendation, tenfold calibration or case-frequency model.',
      'Budgets/capacities use existing illustrative non-refilling relay work accounting, not calibrated human attention or D46 scheduler replacement.',
      'Distinct sourceGroup tags are declared scenario provenance only, not verified independent evidence or humans.',
      'Eligible act-defect sponsorship deliberately opens no case/stake and cannot invoke identity sanctions.'],
    evaluatorInputs: { facts, options }, observationPolicy: environment.randomness, sourceAccess, observation, evidence, route, review, attemptedEntry,
    relay: relay.snapshot(), trace: relay.trace(), protocolStateUnchanged: true };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(runActRelayExample(), null, 2));
