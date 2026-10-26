// Owns: Closed Native vouch-backend wire/config vocabulary; excludes execution, inference and selected CORE rules.
import { FacetyModel, DEFAULT_POLICY, DEFAULT_ABLATIONS } from './model.mjs';
import { actObservationEnvironment, ACT_OBSERVATION_RANDOMNESS } from './act-observations.mjs';

export const VOUCH_ENGINE = 'native-vouch-tape/v1';
export const VOUCH_RANDOMNESS = Object.freeze({ ...ACT_OBSERVATION_RANDOMNESS,
  decisions: 'exogenous-native-vouch-tape-v1', schedule: 'native-vouch-tape-boundary-v1' });
export const VOUCH_OBSERVABLES = Object.freeze(Object.fromEntries([
  'members', 'admissions', 'commitments', 'activeRelations', 'liveSlots', 'pendingCases', 'minted', 'burned', 'collector', 'emitterVault',
  'bondVault', 'bondDebited', 'refunded', 'xpTotal', 'observations', 'suspicious', 'vetoes', 'reviewWork', 'rejections',
  'unobserved', 'inspectionDenied', 'responseDenied',
].map(key => ['vouch.' + key, 1])));
const SHAPES = Object.freeze({
  artifact: ['owner', 'id'], issue: ['owner', 'id', 'artifact'], withdraw: ['owner', 'id'], commit: ['owner', 'target', 'id'],
  admit: ['target', 'bonds'], exit: ['owner', 'id'], hold: ['id', 'caseId'],
  settle: ['id', 'caseId', 'upheld', 'burn', 'transfers'], refund: ['id', 'clear', 'clearanceId'], pool: [], review: ['actor', 'id', 'opportunity'],
});
const ADMIN = new Set(['hold', 'settle', 'refund', 'pool']);
export function vouchAuthority(op) { return ADMIN.has(op) ? 'trusted-administration' : op === 'review' ? 'custody-review' : 'subject-call'; }
function fields(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new TypeError(label + ' requires exactly: ' + keys.join(', '));
}
function text(value, label) { if (typeof value !== 'string' || !value.length) throw new TypeError(label + ' must be nonempty text'); }
function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(label + ' must be a bounded safe integer');
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

export function vouchExperimentConfig(input) {
  fields(input, ['engine', 'reference', 'days', 'seed', 'includeState', 'maxActions', 'maxSubjects', 'successCriterion', 'model', 'work', 'environment', 'events'], 'vouch experiment');
  if (input.engine !== VOUCH_ENGINE || input.reference !== 'native-funded-composition-reference/v1') throw new TypeError('unsupported Native vouch engine/reference');
  integer(input.days, 'days', 0, 3650); integer(input.maxActions, 'maxActions', 1); integer(input.maxSubjects, 'maxSubjects', 1);
  text(input.seed, 'seed');
  if (typeof input.includeState !== 'boolean' || input.successCriterion !== 'unbound') throw new TypeError('Native vouch backend requires includeState Boolean and explicit unbound success criterion');
  fields(input.model, ['genesis', 'policy', 'ablations', 'invitationLimit', 'vouching', 'vouchAdmission'], 'vouch model');
  fields(input.model.policy, Object.keys(DEFAULT_POLICY), 'complete Native policy');
  fields(input.model.ablations, Object.keys(DEFAULT_ABLATIONS), 'complete Native ablations');
  // Constructor validation only: no funding/actions/observations or retained protocol state is created here.
  const model = new FacetyModel(input.model), p = model.policy, b = model.vouching;
  if (!model.vouchAdmission || !b || model.invitationLimit !== null || Object.values(model.ablations).some(value => value !== false && value !== null)
    || p.xpFinality !== 'maturity' || p.cancellationAuthority !== 'snapshot' || p.guarantorEligibility !== 'accepted'
    || p.linkBreakXp !== 'revoke' || p.spendMaturityHours !== 24 || p.conversionMaturityHours !== 24
    || p.artifactReuse !== 'registration-only' || b.reference.exitSlot !== 'retain-until-V') throw new TypeError('unsupported closed Native vouch policy');
  if (input.maxSubjects < model.size) throw new RangeError('maxSubjects is below genesis size');
  fields(input.work, ['reference', 'actors', 'costs'], 'work allocation');
  if (input.work.reference !== 'paid-single-suspicion-veto-reference' || !Array.isArray(input.work.actors)) throw new TypeError('unsupported work allocation');
  fields(input.work.costs, ['inspect', 'respond'], 'work costs');
  integer(input.work.costs.inspect, 'inspect', 1); integer(input.work.costs.respond, 'respond', 1);
  const actors = new Set(), workSubjects = new Set();
  for (const actor of [...input.work.actors]) {
    fields(actor, ['id', 'subject', 'budget'], 'work actor'); text(actor.id, 'actor id'); integer(actor.budget, 'work budget');
    if (actors.has(actor.id)) throw new TypeError('duplicate work actor');
    actors.add(actor.id);
    if (actor.subject !== null) {
      text(actor.subject, 'actor subject');
      if (workSubjects.has(actor.subject)) throw new TypeError('duplicate work subject');
      workSubjects.add(actor.subject);
    }
  }
  fields(input.environment, ['subjects', 'validity', 'rates'], 'private observation environment');
  if (!input.environment.validity || typeof input.environment.validity !== 'object' || Array.isArray(input.environment.validity)
    || Object.values(input.environment.validity).some(value => typeof value !== 'boolean')) throw new TypeError('act validity must be an explicit private Boolean map');
  // Reuse the environment owner's facts/rates checks without performing a trial.
  actObservationEnvironment({ subjects: input.environment.subjects, acts: [] }, { seed: input.seed, rates: input.environment.rates });
  const facts = new Set(input.environment.subjects.map(s => s.id)), requiredSubjects = new Set(input.model.genesis);
  if (!Array.isArray(input.events)) throw new TypeError('events must be an array');
  let last = -1, pools = 0;
  const sourceHandles = new Set(), bondHandles = new Set();
  for (const event of [...input.events]) {
    if (!event || !Object.hasOwn(SHAPES, event.op)) throw new TypeError('unknown Native vouch operation');
    fields(event, ['atHour', 'authority', 'op', ...SHAPES[event.op]], 'vouch event');
    integer(event.atHour, 'event hour', 0);
    if (event.atHour >= input.days * 24 || event.atHour < last) throw new RangeError('events must be ordered inside [0,horizon)');
    last = event.atHour;
    if (event.authority !== vouchAuthority(event.op)) throw new TypeError('operation requires its explicit host-declared authority class');
    for (const key of ['owner', 'target', 'id', 'artifact', 'caseId', 'clearanceId', 'actor', 'opportunity']) if (Object.hasOwn(event, key)) text(event[key], key);
    if (event.op === 'admit') {
      if (!Array.isArray(event.bonds) || [...event.bonds].some(id => typeof id !== 'string' || !id.length)) throw new TypeError('admission bonds must be reference strings');
      requiredSubjects.add(event.target);
    }
    if (event.op === 'issue' || event.op === 'commit') {
      const handles = event.op === 'issue' ? sourceHandles : bondHandles;
      if (handles.has(event.id)) throw new TypeError('logical creation handles cannot be overwritten');
      handles.add(event.id);
      if (event.op === 'issue' && !Object.hasOwn(input.environment.validity, event.id)) throw new TypeError('every offered issue needs a separately supplied private validity fact');
    }
    if (event.op === 'settle') {
      if (typeof event.upheld !== 'boolean' || !Array.isArray(event.transfers)) throw new TypeError('settlement requires supplied Boolean verdict and transfers');
      integer(event.burn, 'burn');
      for (const transfer of [...event.transfers]) {
        fields(transfer, ['recipient', 'amount'], 'settlement transfer'); text(transfer.recipient, 'recipient'); integer(transfer.amount, 'transfer amount', 1);
      }
    }
    if (event.op === 'refund' && typeof event.clear !== 'boolean') throw new TypeError('clearance must be supplied Boolean');
    if (event.op === 'pool' && ++pools > 1) throw new TypeError('closed backend permits only one explicit work allocation attempt');
    if (event.op === 'review' && !actors.has(event.actor)) throw new TypeError('review actor is not declared in work allocation');
  }
  if ([...requiredSubjects].some(id => !facts.has(id))) throw new TypeError('private subject facts must cover all offered membership IDs');
  for (const actor of input.work.actors) if (actor.subject === null && requiredSubjects.has(actor.id)) throw new TypeError('external actor must not impersonate a declared member');
  return freeze(structuredClone(input));
}
