// Owns: Closed Native vouch-tape execution and measured protocol/work history; excludes adaptive behavior, truth courts and inference.
import { FacetyModel, ProtocolRejection } from './model.mjs';
import { VouchActReview } from './vouch-review.mjs';
import { actObservationEnvironment } from './act-observations.mjs';
import { vouchExperimentConfig, VOUCH_RANDOMNESS, VOUCH_OBSERVABLES } from './vouch-experiment-config.mjs';
import { provenance } from './provenance.mjs';

export const VOUCH_EXPERIMENT_ASSUMPTIONS = Object.freeze([
  'This is a closed exogenous Native action tape, not selected CORE, endogenous adoption/cooperation or an adaptive attacker.',
  'Accepted genesis membership is a diagnostic seed assumption, not verified personhood/bootstrap. Initial money/XP are zero and all protocol-economic mutations use FacetyModel.',
  'Accepted-reference admission/claim/vouch eligibility and Native guarantor XP do not implement CORE Claim/Standing or verified independence.',
  'Cooldown and slots constrain repeated per-subject use, not a population exponent. With c=1/B=0 a newly admitted accepted-reference subject may immediately make its first commitment without a Self-ID.',
  'Authority classes are host declarations, not authentication or an actor-selectable court API. Verdict/clearance/coverage inputs are trusted and not inferred from suspicion.',
  'One explicit finite work allocation is not a birth reward/FACY subsidy or measured human capacity. Other action labor is unmodeled, not measured zero.',
  'Private personhood/profile/act-validity facts stay in the environment/evaluator config; defense consumes only public Native references and fallible received evidence.',
  'Daily endpoints include automatic maturities but precede commands at that exact day boundary; commands are inside [0,horizon). No horizon command or free catch-up trial exists.',
  'Resource caps censor unresolved execution. Unretained future endpoints are missing, not safe zeros. A subject cap conservatively stops before an offered new admission, not a declaration it would succeed.',
  'Bond debit is gross actual escrow flow, not net attacker loss; refund is principal, transfers may be internal and only actual burn reduces supply.',
  'Success is explicitly unbound/null. Measured counts are not fraud probabilities, verified human counts, useful work, equilibrium or a viability pass.',
]);

function measured(model, work, rejections) {
  const members = model.subjects(), bonds = model.vouchCommitments(), ledger = model.audit(), receipts = work?.audit().receipts ?? [];
  const values = {
    members: members.length, admissions: model.vouchAdmissions().length, commitments: bonds.length,
    activeRelations: model.guaranteeRelations().filter(r => r.status === 'active').length,
    liveSlots: members.reduce((n, m) => n + model.vouchCapacity(m.id).used, 0),
    pendingCases: model.vouchBondCases().filter(c => c.status === 'pending').length,
    minted: ledger.minted, burned: ledger.burned, collector: ledger.collector, emitterVault: ledger.emitterVault, bondVault: ledger.vouchVault,
    bondDebited: bonds.reduce((n, b) => n + b.slashed, 0), refunded: bonds.reduce((n, b) => n + b.refunded, 0),
    xpTotal: members.reduce((n, m) => n + m.xp, 0), observations: receipts.filter(r => r.suspicious !== null).length,
    suspicious: receipts.filter(r => r.suspicious === true).length, vetoes: receipts.filter(r => r.outcome === 'vetoed').length,
    reviewWork: receipts.reduce((n, r) => n + r.work.inspect + r.work.respond, 0), rejections,
    unobserved: receipts.filter(r => r.suspicious === null).length,
    inspectionDenied: receipts.filter(r => r.outcome === 'inspection-denied').length,
    responseDenied: receipts.filter(r => r.outcome === 'response-denied').length,
  };
  if (Object.keys(values).some(key => !Object.hasOwn(VOUCH_OBSERVABLES, 'vouch.' + key))) throw new Error('unregistered Native vouch measurement');
  return values;
}

export function runVouchExperiment(input) {
  const config = vouchExperimentConfig(input), model = new FacetyModel(config.model);
  const sources = new Map(), bonds = new Map(), actions = [], history = [];
  let work = null, nextEndpoint = 24, rejections = 0, censorReason = null;
  const source = id => sources.get(id) ?? '@missing-source:' + id;
  const bond = id => bonds.get(id) ?? '@missing-bond:' + id;
  const logicalSource = id => [...sources].find(([, actual]) => actual === id)?.[0];
  function environment() {
    const acts = model.selfIds().map(a => ({ id: a.id, subject: a.subject, kind: 'self-id', recordedAt: a.recordedAt,
      valid: config.environment.validity[logicalSource(a.id)] }));
    return actObservationEnvironment({ subjects: config.environment.subjects, acts }, { seed: config.seed, rates: config.environment.rates });
  }
  function sample() {
    model.advanceTo(nextEndpoint);
    history.push({ stage: 'day-end', atHour: nextEndpoint, vouch: measured(model, work, rejections) });
    nextEndpoint += 24;
  }
  for (const q of config.events) {
    if (actions.length >= config.maxActions) { censorReason = 'maxActions'; break; }
    while (nextEndpoint <= q.atHour) sample();
    model.advanceTo(q.atHour);
    if (q.op === 'admit' && model.size >= config.maxSubjects && !model.subjects().some(m => m.id === q.target)) { censorReason = 'maxSubjects'; break; }
    const row = { atHour: model.now, authority: q.authority, op: q.op, ok: true, reason: null };
    try {
      let value;
      if (q.op === 'artifact') value = model.registerArtifact(q.owner, { id: q.id, faceCount: 1, contentHash: null });
      else if (q.op === 'issue') { value = model.createSelfId(q.owner, q.artifact); sources.set(q.id, value); }
      else if (q.op === 'withdraw') model.convertToCollector(q.owner, source(q.id));
      else if (q.op === 'commit') { value = model.commitVouch(q.owner, q.target); bonds.set(q.id, value); }
      else if (q.op === 'admit') value = model.admitVouched(q.target, q.bonds.map(bond));
      else if (q.op === 'exit') model.exitVouch(q.owner, bond(q.id));
      else if (q.op === 'hold') value = model.openVouchBondCase(bond(q.id), { caseId: q.caseId });
      else if (q.op === 'settle') value = model.resolveVouchBondCase(bond(q.id), { caseId: q.caseId, upheld: q.upheld, burn: q.burn, transfers: q.transfers });
      else if (q.op === 'refund') value = model.releaseVouchBond(bond(q.id), { clear: q.clear, clearanceId: q.clearanceId });
      else if (q.op === 'pool') work = new VouchActReview(model, config.work);
      else if (q.op === 'review') {
        if (work === null) { row.ok = false; row.reason = 'work-pool-unavailable'; }
        else value = work.review(q.actor, source(q.id), environment(), { opportunity: q.opportunity });
      } else throw new Error('unhandled Native vouch operation');
      if (value !== undefined) row.value = value;
    } catch (error) {
      const refusedClearance = q.op === 'refund' && q.clear === false && error instanceof TypeError;
      if (!(error instanceof ProtocolRejection) && !refusedClearance) throw error;
      row.ok = false; row.reason = error.message;
    }
    if (!row.ok) rejections++;
    actions.push(row);
    model.audit(); work?.audit();
  }
  if (censorReason === null) while (nextEndpoint <= config.days * 24) sample();
  return { schema: 'facety-native-vouch-run/v1', classification: 'diagnostic', config, assumptions: [...VOUCH_EXPERIMENT_ASSUMPTIONS],
    provenance: provenance(), randomness: { ...VOUCH_RANDOMNESS }, history, actions,
    outcome: { success: null, successCriterion: 'unbound', censored: censorReason !== null, censorReason,
      horizonDays: config.days, horizonHours: config.days * 24, endedAtHour: model.now, dailySampleOffsetHours: 24 },
    ...(config.includeState ? { state: { now: model.now, subjects: model.subjects(), selfIds: model.selfIds(), ledger: model.audit(),
      vouches: model.vouchCommitments(), admissions: model.vouchAdmissions(), relations: model.guaranteeRelations(), cases: model.vouchBondCases(),
      work: work?.audit() ?? null } } : {}) };
}
