// Owns: Snapshot environment for per-act validity and keyed suspicion; excludes protocol mutations, intent inference, entry and verdicts.
import { Random, RANDOM_GENERATOR } from './random.mjs';

export const ACT_OBSERVATION_RANDOMNESS = Object.freeze({
  generator: RANDOM_GENERATOR,
  observations: 'act-observation-keyed-v1',
  trialUnit: 'observer-act-hour-opportunity',
  dependence: 'keyed-per-declared-opportunity',
});
const KINDS = ['self-id', 'invitation', 'guarantee'];
const ROLES = ['ordinary', 'guarantor'];
function fields(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...expected].sort().join()) throw new TypeError(label + ' requires exactly: ' + expected.join(', '));
}
function text(value, label) {
  if (typeof value !== 'string' || !value.length) throw new TypeError(label + ' must be a nonempty string');
}
function hour(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(label + ' must be a non-negative safe integer');
}

// Facts stay in this closure. The caller retains its own evaluator input; the returned capability has no truth getter.
export function actObservationEnvironment(facts, options) {
  fields(facts, ['subjects', 'acts'], 'act facts');
  fields(options, ['seed', 'rates'], 'act observation options');
  text(options.seed, 'seed');
  if (!Array.isArray(facts.subjects) || !Array.isArray(facts.acts)) throw new TypeError('subjects and acts must be arrays');
  const subjects = new Set();
  for (const subject of facts.subjects) {
    fields(subject, ['id', 'genuine', 'behaviorProfile'], 'subject fact');
    text(subject.id, 'subject id'); text(subject.behaviorProfile, 'behavior profile');
    if (typeof subject.genuine !== 'boolean' || subjects.has(subject.id)) throw new TypeError('subject facts require unique ids and boolean personhood');
    subjects.add(subject.id);
  }
  const acts = new Map();
  for (const act of facts.acts) {
    fields(act, ['id', 'subject', 'kind', 'recordedAt', 'valid'], 'act fact');
    text(act.id, 'act id'); hour(act.recordedAt, 'recordedAt');
    if (!subjects.has(act.subject) || !KINDS.includes(act.kind) || typeof act.valid !== 'boolean' || acts.has(act.id)) throw new TypeError('act facts require unique ids, a known subject, supported kind and boolean validity');
    acts.set(act.id, { ...act });
  }
  fields(options.rates, KINDS, 'act rates');
  const rates = structuredClone(options.rates);
  for (const kind of KINDS) {
    fields(rates[kind], ROLES, kind + ' role rates');
    for (const role of ROLES) {
      fields(rates[kind][role], ['valid', 'invalid'], kind + '/' + role + ' rates');
      if (Object.values(rates[kind][role]).some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new RangeError('act suspicion rates must be in [0, 1]');
    }
  }
  const random = new Random(options.seed).fork(ACT_OBSERVATION_RANDOMNESS.observations);
  const publicActs = Object.freeze([...acts.values()].map(({ id, subject, kind, recordedAt }) => Object.freeze({ id, subject, kind, recordedAt })));
  return Object.freeze({
    randomness: ACT_OBSERVATION_RANDOMNESS,
    acts: publicActs,
    observe(request) {
      fields(request, ['act', 'observer', 'role', 'atHour', 'opportunity'], 'act observation request');
      text(request.act, 'act id'); text(request.observer, 'observer id'); text(request.opportunity, 'opportunity id'); hour(request.atHour, 'atHour');
      const act = acts.get(request.act);
      if (!act || !ROLES.includes(request.role)) throw new Error('unknown act or unsupported observer role');
      if (request.atHour < act.recordedAt) throw new RangeError('observation precedes act');
      const probability = rates[act.kind][request.role][act.valid ? 'valid' : 'invalid'];
      // Role changes the supplied threshold, not the underlying keyed draw. Membership/authority is not certified here.
      const key = [request.act, request.observer, request.atHour, request.opportunity];
      return Object.freeze({ suspicious: random.fork(JSON.stringify(key)).chance(probability) });
    },
  });
}
