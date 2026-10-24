// Software-only D47 interface example; supplied validity/rate boundaries are not research data or human calibration.
import { actObservationEnvironment } from '../src/act-observations.mjs';

const facts = {
  subjects: [{ id: 'Anna', genuine: true, behaviorProfile: 'good-faith' }, { id: 'Mira', genuine: true, behaviorProfile: 'adversarial' }],
  acts: [
    { id: 'anna-correct', subject: 'Anna', kind: 'self-id', recordedAt: 0, valid: true },
    { id: 'anna-defective', subject: 'Anna', kind: 'self-id', recordedAt: 24, valid: false },
    { id: 'mira-correct', subject: 'Mira', kind: 'self-id', recordedAt: 0, valid: true },
  ],
};
const rates = Object.fromEntries(['self-id', 'invitation', 'guarantee'].map(kind => [kind, {
  ordinary: { valid: 0, invalid: 1 }, guarantor: { valid: 0, invalid: 1 },
}]));
const environment = actObservationEnvironment(facts, { seed: 'act-evidence-interface-software', rates });
console.log(JSON.stringify({
  level: 'software-interface-example-not-research',
  assumptions: ['Supplied act validity, not inferred from personhood or intent.', 'Extreme software rate boundaries only, not a selected probability/guarantor multiplier.', 'One explicitly supplied observation opportunity; no discovery schedule, work policy, challenge or verdict.'],
  randomness: environment.randomness,
  evaluatorInputs: facts,
  publicActs: environment.acts,
  observations: environment.acts.map(act => ({ act: act.id, observer: 'Boris', role: 'ordinary', atHour: act.recordedAt + 4,
    ...environment.observe({ act: act.id, observer: 'Boris', role: 'ordinary', atHour: act.recordedAt + 4, opportunity: 'software-first-look' }),
  })),
}, null, 2));
