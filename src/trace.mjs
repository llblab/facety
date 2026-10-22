// Owns: Optional structured causal trace; excludes decisions, randomness and protocol mutation.
// A trace explains how a run executed. Event ancestry and mechanism tags are not proof of causal effect.

export const OUTCOMES = Object.freeze(['applied', 'blocked', 'refused', 'abstained', 'rejected', 'pending']);
// Closed vocabulary: a blocked or refused entry must name a reason the policy actually evaluated.
export const BLOCK_REASONS = Object.freeze([
  'budget-exhausted', 'capacity-exhausted', 'conflict-of-interest', 'duplicate-evidence', 'fee-unaffordable',
  'forged-input', 'funds-insufficient', 'inadequate-evidence', 'insufficient-xp', 'not-eligible',
  'no-sponsor', 'route-limit', 'window-missed', 'case-unresolved', 'below-threshold', 'policy-abstains',
]);
const BASIS_KINDS = Object.freeze(['protocol-rule', 'declared-rule', 'declared-input', 'scripted']);

function plain(value, label) {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError(label + ' must be JSON data');
  return JSON.parse(json);
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export class Trace {
  #entries = [];
  #index = new Map();
  #sequence = 0;
  #dropped = 0;
  // `maxEntries` bounds retained records only. Overflow is counted and reported; it never changes a run.
  constructor({ maxEntries = 10000 } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError('maxEntries must be a positive integer');
    this.maxEntries = maxEntries;
  }
  get dropped() { return this.#dropped; }
  get truncated() { return this.#dropped > 0; }
  // Fields: at, actor, action, target, mechanisms, observed (actor-visible), preconditions, basis, outcome,
  // reason, deltas, causes (earlier entry IDs) and evaluator (hidden truth, never visible to actors).
  record(fields) {
    const { at, actor, action, target = null, mechanisms = [], observed = {}, preconditions = [], basis, outcome = 'applied', reason = null, deltas = {}, causes = [], evaluator } = fields;
    if (!Number.isSafeInteger(at) || at < 0) throw new RangeError('trace time must be a non-negative integer hour');
    for (const [name, value] of Object.entries({ actor, action })) if (typeof value !== 'string' || !value.length) throw new TypeError('trace ' + name + ' must be non-empty');
    if (!OUTCOMES.includes(outcome)) throw new RangeError('unknown trace outcome: ' + outcome);
    if (!basis || !BASIS_KINDS.includes(basis.kind) || typeof basis.rule !== 'string' || !basis.rule.length) throw new TypeError('trace basis needs a kind and a rule description');
    if (!Array.isArray(mechanisms) || !Array.isArray(preconditions) || !Array.isArray(causes)) throw new TypeError('mechanisms, preconditions and causes must be arrays');
    for (const condition of preconditions) if (typeof condition.name !== 'string' || typeof condition.met !== 'boolean') throw new TypeError('each precondition needs a name and a boolean result');
    const stopped = outcome === 'blocked' || outcome === 'refused' || outcome === 'abstained' || outcome === 'rejected';
    // Do not invent reasons: a stop must name an allowed reason and show the condition that failed.
    if (stopped) {
      if (!BLOCK_REASONS.includes(reason)) throw new RangeError('a stopped entry needs an allowed reason');
      if (!preconditions.some(condition => !condition.met) && basis.kind !== 'declared-rule' && basis.kind !== 'scripted') throw new Error('a stopped entry must show an unmet precondition or a declared rule');
    } else if (reason !== null) throw new Error('only a stopped entry carries a reason');
    for (const cause of causes) if (typeof cause !== 'string') throw new TypeError('causes must be entry IDs');
    const id = 't:' + this.#sequence++;
    const entry = deepFreeze({
      id, at, actor, action, target,
      mechanisms: [...mechanisms], observed: plain(observed, 'observed'), preconditions: plain(preconditions, 'preconditions'),
      basis: { kind: basis.kind, rule: basis.rule }, outcome, reason, deltas: plain(deltas, 'deltas'), causes: [...causes],
      ...(evaluator === undefined ? {} : { evaluator: plain(evaluator, 'evaluator') }),
    });
    if (this.#entries.length < this.maxEntries) { this.#entries.push(entry); this.#index.set(id, entry); } else this.#dropped++;
    return id;
  }
  entry(id) { return this.#index.get(id) ?? null; }
  entries() { return [...this.#entries]; }
  // Actor-visible projection: evaluator truth is removed, so a reader cannot mistake it for an observation.
  actorView() {
    return this.#entries.map(entry => { const { evaluator, ...visible } = entry; return visible; });
  }
  // Earlier entries that supported `id`, oldest first. IDs lost to truncation are reported, not guessed.
  ancestry(id) {
    const seen = new Set();
    const missing = [];
    const walk = current => {
      const entry = this.#index.get(current);
      if (!entry) { missing.push(current); return; }
      for (const cause of entry.causes) if (!seen.has(cause)) { seen.add(cause); walk(cause); }
    };
    walk(id);
    const ordered = [...seen].filter(cause => this.#index.has(cause)).map(cause => this.#index.get(cause)).sort((a, b) => a.at - b.at || Number(a.id.slice(2)) - Number(b.id.slice(2)));
    return { entries: ordered, missing };
  }
}

// Read-only observation of declared subjects; never mutates the model.
export function watchState(model, ids) {
  const council = new Set(model.council().map(member => member.id));
  const state = {};
  for (const id of ids) {
    const subject = model.subject(id);
    state[id] = { xp: subject.xp, liquidFacy: subject.liquidFacy, debt: subject.debt, identity: subject.identityStatus, active: model.isActive(id), council: council.has(id) };
  }
  return state;
}
export function stateDeltas(before, after) {
  const deltas = {};
  for (const id of Object.keys(after)) {
    const changed = {};
    for (const key of Object.keys(after[id])) if (before[id]?.[key] !== after[id][key]) changed[key] = [before[id]?.[key] ?? null, after[id][key]];
    if (Object.keys(changed).length) deltas[id] = changed;
  }
  return deltas;
}

export function formatTrace(entries) {
  return entries.map(entry => {
    const head = `${entry.id} h${entry.at} ${entry.actor} ${entry.action}${entry.target ? ' → ' + entry.target : ''} [${entry.outcome}${entry.reason ? ': ' + entry.reason : ''}]`;
    const lines = [head, `    basis: ${entry.basis.kind}: ${entry.basis.rule}`];
    if (entry.mechanisms.length) lines.push('    mechanisms: ' + entry.mechanisms.join(', '));
    const unmet = entry.preconditions.filter(condition => !condition.met).map(condition => condition.name);
    if (unmet.length) lines.push('    unmet: ' + unmet.join(', '));
    for (const [id, change] of Object.entries(entry.deltas)) lines.push('    Δ ' + id + ' ' + Object.entries(change).map(([key, [from, to]]) => `${key} ${from}→${to}`).join(', '));
    if (entry.causes.length) lines.push('    after: ' + entry.causes.join(', '));
    return lines.join('\n');
  }).join('\n');
}
