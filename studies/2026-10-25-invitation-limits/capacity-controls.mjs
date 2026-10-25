// Owns: Deterministic native invitation-capacity controls; excludes population growth, detection and private utility.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FacetyModel, DAY, ProtocolRejection } from '../../src/model.mjs';
import { digestOf, provenance } from '../../src/provenance.mjs';
import { invitationLimitArms, invitationCapacityPrior } from './contract.mjs';

export function capacityControl(arm, { days, emissionEveryDays }) {
  if (!Number.isSafeInteger(days) || days < 1 || !Number.isSafeInteger(emissionEveryDays) || emissionEveryDays < 1) throw new RangeError('control requires positive integer days and emissionEveryDays');
  const { P, b } = arm;
  if (P === null && b === 0) throw new RangeError('unrestricted arm has no finite capacity measurement; use its same-hour conformance witness');
  const model = new FacetyModel({ genesis: ['creator', 'support'], invitationLimit: { P, b },
    policy: { xpFinality: 'maturity', guarantorEligibility: 'accepted' } });
  const relation = model.proposeGuarantee('support', 'creator');
  model.confirmGuarantee('creator', relation);
  const usedAtDays = [], rejections = { cooldown: 0, funding: 0 };
  for (let day = 0; day <= days; day++) {
    model.advanceTo(day * DAY);
    if (day < days && day % emissionEveryDays === 0) model.createSelfId('creator', model.registerArtifact('creator'));
    const sources = model.eligibleEmissions('creator').slice(0, b);
    try {
      model.createInvitation('creator', sources, 'target:' + day);
      usedAtDays.push(day);
    } catch (error) {
      if (!(error instanceof ProtocolRejection)) throw error;
      if (error.message === 'invitation cooldown after use') rejections.cooldown++;
      else if (error.message === 'invitation requires exactly b distinct own mature sources') rejections.funding++;
      else throw error;
    }
  }
  const ledger = model.audit(), E = 1 / emissionEveryDays;
  return { arm: arm.id, P, b, days, E, emissionEveryDays, firstUseDay: usedAtDays[0] ?? null,
    invitations: usedAtDays.length, invitationsPerDay: usedAtDays.length / days,
    prior: invitationCapacityPrior({ P, b, E }), burnedFacy: ledger.burned,
    mintedFacy: ledger.minted, retainedOwnFacy: ledger.emitterVault, rejections, usedAtDays };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ schema: 'facety-invitation-capacity-controls/v1', evidence: 'deterministic-software-controls-not-H6-confirmation',
    provenance: provenance(), method: { id: 'native-Pb-capacity/v1',
      digest: digestOf([readFileSync(fileURLToPath(import.meta.url), 'utf8'), readFileSync(new URL('contract.mjs', import.meta.url), 'utf8')]) },
    randomness: { kind: 'none', seedLabels: [] }, horizonDays: 504,
    assumptions: { initialOwnStock: 0, maturedAfterHours: DAY, qualification: 'accepted reference',
      demand: 'one opportunity/day, sufficient for every bounded requested arm', recipientsAdmitted: false,
      ownEmissionBanking: true, ownEmissionLapse: false, zeroBurnRequiresClaim: false, sampling: 'none' },
    rows: [1, 2, 3].flatMap(emissionEveryDays => invitationLimitArms().filter(arm => arm.id !== '0')
      .map(arm => { const { usedAtDays, ...row } = capacityControl(arm, { days: 504, emissionEveryDays }); return row; })),
    unrestrictedControl: { finiteCapacity: null, status: 'unbounded by P/b; separate64-creation same-hour software witness, not a measured maximum' },
  }, null, 2));
}
