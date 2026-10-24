import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { causalWorld } from './causal-walkthroughs.mjs';
import { actObservationEnvironment } from '../src/act-observations.mjs';
import { EvidenceRelay, accountabilitySnapshot } from '../src/accountability.mjs';
import { experimentConfig } from '../src/experiment.mjs';
import { implementationDigest } from '../src/provenance.mjs';

export function runSponsorAssessmentExample() {
  const base = { goal: 'seek-correction', utilityUnit: 'illustrative-private-units',
    beliefs: { positiveDistinct: 0.9, positiveShared: 0.1, negative: 0.05, missing: null },
    payoffs: { upheld: 8, rejected: -4, participation: 0, workCost: 1, abstain: 0 } };
  const futile = { ...base, beliefs: { ...base.beliefs, positiveDistinct: 0 } };
  const profiles = [
    ['optimistic-correction', base], ['apparently-futile-correction', futile],
    ['private-participation-benefit', { ...futile, goal: 'adversarial-participation', payoffs: { ...base.payoffs, participation: 10 } }],
    ['unknown-prospects', { ...base, beliefs: { ...base.beliefs, positiveDistinct: null } }],
    ['exact-tie', { ...base, beliefs: { ...base.beliefs, positiveDistinct: 0.5 }, payoffs: { ...base.payoffs, upheld: 4, workCost: 0 } }],
  ];
  const rows = profiles.map(([label, profile]) => {
    const { model, acts } = causalWorld();
    const act = model.selfId(acts.Mira);
    const facts = { subjects: [{ id: 'Mira', genuine: true, behaviorProfile: 'good-faith' }],
      acts: [{ id: act.id, subject: 'Mira', kind: 'self-id', recordedAt: act.recordedAt, valid: true }] };
    const rates = Object.fromEntries(['self-id', 'invitation', 'guarantee'].map(kind => [kind,
      { ordinary: { valid: 1, invalid: 1 }, guarantor: { valid: 1, invalid: 1 } }]));
    const environment = actObservationEnvironment(facts, { seed: 'sponsor-assessment-example-software-only', rates });
    const rules = experimentConfig({ disputes: { enabled: true } }).disputes;
    const relay = new EvidenceRelay(model, { claim: 'act-defect', rules, traceLimit: 0, actors: [
      { id: 'Outside', subject: null, budget: 12, reviewCapacity: 0 },
      { id: 'Bela', subject: 'Bela', budget: 12, reviewCapacity: 2 },
    ] });
    const before = accountabilitySnapshot(model);
    const observation = relay.observeAct('Outside', act.id, environment, { role: 'ordinary', opportunity: 'source', sourceGroup: 'media' });
    const evidence = relay.package('Outside', [observation.value]);
    relay.route('Outside', evidence.value, 'Bela');
    relay.reviewAct('Bela', evidence.value, environment, { role: 'guarantor', opportunity: 'review', sourceGroup: 'other-tag' });
    const result = relay.sponsor('Bela', evidence.value, profile);
    assert.deepEqual(accountabilitySnapshot(model), before);
    return { label, evaluatorInputs: { facts, rates }, decision: result.decision, reason: result.reason,
      work: relay.snapshot().actors.map(({ id, subject, spent, denied }) => ({ id, subject, spent, denied })), protocolStateUnchanged: true };
  });
  return { schema: 'facety-sponsor-assessment-software-example/v1', level: 'software-interface-example-not-research', implementation: implementationDigest(),
    assumptions: ['Five independent funded-prefix software fixtures, not observations of people, research labels, equilibrium/adoption or D48 learning.',
      'Identical supplied evidence and native XP/stake access; changed own beliefs/payoffs are explicit private-value interventions, not target truth.',
      'All-one suspicion rates and nonbinding 12-unit budgets/two-review capacities are boundary fixtures, not calibration or a completed D46 scheduler.',
      'Outcome values are hypothetical private valuations, not selected remedies, protocol money/XP or welfare. Initial native setup work is unpriced; legacy custody remains.',
      'All cases remain blocked by the act-specific merits/remedy contract. Attempted means willing plus ready and eligible, not an opened case or actual harm.'], rows };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(runSponsorAssessmentExample(), null, 2));
