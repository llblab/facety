// Owns: Opt-in paid native Self-ID observation/veto composition; excludes truth, personhood, courts, admission and calibration.
import { DAY, FacetyModel, ProtocolRejection } from './model.mjs';
import { ACT_OBSERVATION_RANDOMNESS } from './act-observations.mjs';

function fields(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new TypeError(label + ' requires exactly: ' + keys.join(', '));
}
function text(value, label) {
  if (typeof value !== 'string' || !value.length) throw new TypeError(label + ' must be a nonempty string');
}
function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(label + ' must be a safe integer >= ' + minimum);
}

// This is a caller-selected diagnostic response rule, not endogenous monitoring or a new selected protocol.
export class VouchActReview {
  #model;
  #actors = new Map();
  #costs;
  #records = new Map();
  constructor(model, options) {
    fields(options, ['reference', 'actors', 'costs'], 'vouch act review');
    if (options.reference !== 'paid-single-suspicion-veto-reference') throw new TypeError('unsupported vouch act review reference');
    if (!(model instanceof FacetyModel) || model.vouchAdmission === null || model.policy.xpFinality !== 'maturity') throw new TypeError('vouch act review requires funded admission and native maturity/snapshot policy');
    fields(options.costs, ['inspect', 'respond'], 'vouch review costs');
    const { inspect, respond } = options.costs;
    integer(inspect, 'inspection cost', 1); integer(respond, 'response cost', 1);
    this.#costs = Object.freeze({ inspect, respond });
    if (!Array.isArray(options.actors)) throw new TypeError('vouch review actors must be an array');
    const subjects = new Set();
    for (const input of [...options.actors]) {
      fields(input, ['id', 'subject', 'budget'], 'vouch review actor');
      const { id, subject, budget } = input;
      text(id, 'actor id'); integer(budget, 'actor work budget');
      if (this.#actors.has(id)) throw new TypeError('duplicate vouch review actor');
      if (subject !== null) {
        text(subject, 'actor subject'); model.subject(subject);
        if (subjects.has(subject)) throw new TypeError('one review work account per subject in this reference');
        subjects.add(subject);
      } else if (model.subjects().some(row => row.id === id)) throw new TypeError('external reviewer must not impersonate a subject');
      this.#actors.set(id, { id, subject, budget, spent: 0 });
    }
    this.#model = model;
  }
  #remember(key, row) {
    const receipt = Object.freeze({ ...row, work: Object.freeze({ ...row.work }) });
    this.#records.set(key, receipt);
    return receipt;
  }
  review(actorId, selfId, environment, options) {
    fields(options, ['opportunity'], 'vouch review request');
    const { opportunity } = options;
    text(opportunity, 'opportunity');
    const actor = this.#actors.get(actorId);
    if (!actor) throw new TypeError('unknown vouch review actor');
    const act = this.#model.selfId(selfId), atHour = this.#model.now;
    // The logical draw key is the existing environment key. Replays are not a second paid trial or a redraw.
    const key = JSON.stringify([selfId, actorId, atHour, opportunity]);
    if (this.#records.has(key)) return this.#records.get(key);
    const reference = environment?.acts?.find(row => row.id === selfId);
    if (typeof environment?.observe !== 'function' || environment?.randomness?.observations !== ACT_OBSERVATION_RANDOMNESS.observations
      || !reference || reference.kind !== 'self-id' || reference.subject !== act.subject || reference.recordedAt !== act.recordedAt) throw new TypeError('review requires a matching native act observation environment');
    const role = act.guarantors.includes(actor.subject) ? 'guarantor' : 'ordinary';
    const row = { actor: actorId, selfId, atHour, opportunity, role, suspicious: null, work: { inspect: 0, respond: 0 }, outcome: null, reason: null };
    if (atHour - act.recordedAt >= DAY) {
      row.outcome = 'window-closed';
    } else if (act.status !== 'unspent' || act.disputeLock !== null) {
      row.outcome = 'act-unavailable';
    } else if (actor.spent + this.#costs.inspect > actor.budget) {
      row.outcome = 'inspection-denied';
    } else {
      actor.spent += this.#costs.inspect;
      row.work.inspect = this.#costs.inspect;
      try {
        const received = environment.observe({ act: selfId, observer: actorId, role, atHour, opportunity });
        fields(received, ['suspicious'], 'received act signal');
        const { suspicious } = received;
        if (typeof suspicious !== 'boolean') throw new TypeError('received suspicion must be Boolean, not a verdict');
        row.suspicious = suspicious;
      } catch (error) {
        row.outcome = 'observation-error';
        this.#remember(key, row);
        throw error;
      }
      if (!row.suspicious) row.outcome = 'observed-no-suspicion';
      else if (role !== 'guarantor') row.outcome = 'no-veto-authority';
      else if (actor.spent + this.#costs.respond > actor.budget) row.outcome = 'response-denied';
      else {
        actor.spent += this.#costs.respond;
        row.work.respond = this.#costs.respond;
        try {
          this.#model.cancelSelfId(actor.subject, selfId);
          row.outcome = 'vetoed';
        } catch (error) {
          row.outcome = error instanceof ProtocolRejection ? 'veto-rejected' : 'response-error';
          if (error instanceof ProtocolRejection) row.reason = error.message;
          else { this.#remember(key, row); throw error; }
        }
      }
    }
    return this.#remember(key, row);
  }
  snapshot() {
    return Object.freeze({ reference: 'paid-single-suspicion-veto-reference', unit: 'uncalibrated non-refilling integer work units; not FACY, wages or time', costs: this.#costs,
      actors: Object.freeze([...this.#actors.values()].sort((a, b) => a.id < b.id ? -1 : 1).map(actor => Object.freeze({ ...actor, remaining: actor.budget - actor.spent }))),
      receipts: Object.freeze([...this.#records.values()]) });
  }
  audit() {
    const spent = new Map([...this.#actors.keys()].map(id => [id, 0]));
    for (const [key, row] of this.#records) {
      if (!spent.has(row.actor) || key !== JSON.stringify([row.selfId, row.actor, row.atHour, row.opportunity])
        || ![0, this.#costs.inspect].includes(row.work.inspect) || ![0, this.#costs.respond].includes(row.work.respond)
        || (row.work.respond > 0 && (row.work.inspect === 0 || row.suspicious !== true || row.role !== 'guarantor'))
        || (row.suspicious !== null && (typeof row.suspicious !== 'boolean' || row.work.inspect === 0))) throw new Error('vouch review receipt invariant failed');
      spent.set(row.actor, spent.get(row.actor) + row.work.inspect + row.work.respond);
    }
    for (const actor of this.#actors.values()) if (spent.get(actor.id) !== actor.spent || actor.spent > actor.budget) throw new Error('vouch review work invariant failed');
    return this.snapshot();
  }
}
