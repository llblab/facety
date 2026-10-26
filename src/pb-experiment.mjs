// Owns: Native P/b creation-capacity workload and measured history; excludes recipient payback, adaptation and research inference.
import { FacetyModel, DAY, ProtocolRejection } from './model.mjs';
import { pbExperimentConfig, PB_OBSERVABLES, PB_RANDOMNESS } from './pb-experiment-config.mjs';
import { provenance } from './provenance.mjs';

export const PB_EXPERIMENT_ASSUMPTIONS = Object.freeze([
  'This is a closed deterministic capacity workload, not selected CORE, endogenous growth, H6 confirmation or WP5 economics.',
  'Two accepted genesis subjects and a Native support relation are conditional initial access, not verified humans/independence. Initial money/XP/source stock are zero.',
  'Bootstrap/action labor is unmodeled, not measured free work. The two Native guarantee calls count against the computational action cap; guaranteeFee0 is an explicit reference.',
  'Only the creator issues one actual Self-ID every q integer days. Own sources mature after24h and are banked without expiry; no purchased/external rights or free initial stock exist.',
  'P cooldown starts after successful creation, not an initial wait; failed offers spend no sources/cooldown. Explicit b0 has no own-Claim requirement in this Native reference.',
  'One invitation is offered per day; recipients are never accepted and do not earn. This demand cap does not measure the unrestricted maximum of P=null/b=0.',
  'Excluded acceptance/veto/other APIs remain Native capabilities outside this workload; this is not an attacker allowlist or full P/b behavior model.',
  'Positive b burns actual source principal; it is not refundable bond B, incremental recipient revenue, private utility or net coalition loss.',
  'Commands are inside [0,H); daily endpoints24 through H include automatic maturity then precede same-hour commands. There is no terminal-day offer or horizon0 bootstrap.',
  'maxActions counts bootstrap/artifact/issue/offer calls including refused offers, not reads/clock/human work. Censored future endpoints are missing, not carried forward or safe zeros.',
  'There is no observation, truth, random decision, verdict, conversion, debt, treasury or market. Seed is retained but unused; repeated seeds do not create empirical uncertainty.',
  'Success is unbound/null. Protocol counts/XP are not personhood, usefulness, concentration, fraud probabilities, equilibria or G1 acceptance.',
]);

export function runPbExperiment(input) {
  const config = pbExperimentConfig(input), model = new FacetyModel(config.model), actions = [], history = [];
  const { b } = model.invitationLimit;
  let nextEndpoint = DAY, relation = null, artifact = null, censored = false, offered = 0, cooldownDenied = 0, fundingDenied = 0;
  function sample() {
    model.advanceTo(nextEndpoint);
    const ledger = model.audit(), acts = model.selfIds(), matureUnspent = model.eligibleEmissions('creator').length;
    const pb = { created: model.invitations().length, offered, cooldownDenied, fundingDenied, minted: ledger.minted, burned: ledger.burned,
      emitterVault: ledger.emitterVault, matureUnspent, immatureUnspent: acts.filter(a => a.status === 'unspent').length - matureUnspent,
      xpTotal: model.subjects().reduce((sum, s) => sum + s.xp, 0) };
    if (Object.keys(pb).some(key => !Object.hasOwn(PB_OBSERVABLES, 'pb.' + key))) throw new Error('unregistered P/b measurement');
    history.push({ stage: 'day-end', atHour: nextEndpoint, pb }); nextEndpoint += DAY;
  }
  function call(atHour, op, execute) {
    if (actions.length >= config.maxActions) { censored = true; return false; }
    while (nextEndpoint <= atHour) sample();
    model.advanceTo(atHour);
    const row = { atHour, op, ok: true, reason: null };
    const value = execute(row);
    if (value !== undefined) row.value = value;
    actions.push(row); model.audit(); return true;
  }
  function offer(row, day) {
    offered++;
    const sources = model.eligibleEmissions('creator').slice(0, b);
    try { return model.createInvitation('creator', sources, 'target:' + day); }
    catch (error) {
      if (!(error instanceof ProtocolRejection)) throw error;
      if (error.message === 'invitation cooldown after use') cooldownDenied++;
      else if (error.message === 'invitation requires exactly b distinct own mature sources') fundingDenied++;
      else throw error;
      row.ok = false; row.reason = error.message;
    }
  }
  if (config.days > 0) {
    if (call(0, 'propose-support', () => { relation = model.proposeGuarantee('support', 'creator'); return relation; })
      && call(0, 'confirm-support', () => model.confirmGuarantee('creator', relation))) {
      for (let day = 0; day < config.days; day++) {
        const hour = day * DAY;
        if (day % config.emissionEveryDays === 0) {
          if (!call(hour, 'artifact', () => { artifact = model.registerArtifact('creator'); return artifact; })) break;
          if (!call(hour, 'issue', () => model.createSelfId('creator', artifact))) break;
        }
        if (!call(hour, 'offer', row => offer(row, day))) break;
      }
    }
  }
  if (!censored) while (nextEndpoint <= config.days * DAY) sample();
  return { schema: 'facety-native-pb-capacity-run/v1', classification: 'diagnostic', config, assumptions: [...PB_EXPERIMENT_ASSUMPTIONS],
    provenance: provenance(), randomness: { ...PB_RANDOMNESS }, history, actions,
    outcome: { success: null, successCriterion: 'unbound', censored, censorReason: censored ? 'maxActions' : null,
      horizonDays: config.days, horizonHours: config.days * DAY, endedAtHour: model.now, dailySampleOffsetHours: DAY },
    ...(config.includeState ? { state: { now: model.now, subjects: model.subjects(), selfIds: model.selfIds(), invitations: model.invitations(),
      relations: model.guaranteeRelations(), ledger: model.audit() } } : {}) };
}
