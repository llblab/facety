// Owns: Small deterministic software fixtures; excludes programme parameter/range/seed selection.
import { DEFAULT_POLICY, DEFAULT_ABLATIONS } from '../../src/model.mjs';
import { PB_ENGINE, PB_REFERENCE } from '../../src/pb-experiment-config.mjs';

export function config(P = 3, b = 2, days = 8, q = 1, maxActions = 1000) {
  return { engine: PB_ENGINE, reference: PB_REFERENCE, days, seed: 'pb-backend-software-only', includeState: true, maxActions,
    successCriterion: 'unbound', emissionEveryDays: q,
    model: { genesis: ['creator', 'support'], policy: { ...DEFAULT_POLICY, xpFinality: 'maturity', guarantorEligibility: 'accepted' },
      ablations: { ...DEFAULT_ABLATIONS }, invitationLimit: { P, b }, vouching: null, vouchAdmission: null } };
}
