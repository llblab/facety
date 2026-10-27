// Owns: Budgeted action-effort accounting, not protocol balances or activity scheduling.
export const COHORTS = Object.freeze(['honest', 'attackers']);
export const DEFAULT_WEIGHTS = Object.freeze({
  selfId: 1,
  fakeSelfId: 1,
  fabricateIdentity: 1,
  recruitHuman: 1,
  invite: 1,
  acceptInvitation: 1,
  proposeGuarantee: 1,
  confirmGuarantee: 1,
  inspect: 1,
  respond: 1,
  challenge: 1,
  verify: 1,
  bribe: 1,
  cashout: 1,
  convert: 1,
});

export class SimulationLimit extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SimulationLimit';
    this.reason = reason;
  }
}

const PRECISION = 1_000_000;
function units(value, label) {
  const scaled = Math.round(value * PRECISION);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(scaled) || Math.abs(value - scaled / PRECISION) > Number.EPSILON * Math.max(1, value) * 2) throw new RangeError(label + ' must be non-negative, safe and have at most six decimal places');
  return scaled;
}
function display(row) { return { ...row, effort: row.effort / PRECISION }; }

export function effortWeights(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('weights must be an object');
  for (const key of Object.keys(overrides)) if (!Object.hasOwn(DEFAULT_WEIGHTS, key)) throw new Error('unknown effort action: ' + key);
  const weights = { ...DEFAULT_WEIGHTS, ...overrides };
  for (const [key, value] of Object.entries(weights)) weights[key] = units(value, key) / PRECISION;
  return Object.freeze(weights);
}

function counters() {
  return { attempts: 0, accepted: 0, rejected: 0, denied: 0, effort: 0 };
}

export class EffortLedger {
  #weights;
  #budgets;
  #cohorts;
  #allocation;
  #hasReserve;
  #pending = new Map();
  #next = 0;
  #calls = 0;
  #maxActions;
  constructor({ weights = {}, budgets = { honest: 100_000, attackers: 100_000 }, maxActions = 500_000, reviewReserve = {} } = {}) {
    this.#weights = effortWeights(weights);
    if (!budgets || Object.keys(budgets).some(key => !COHORTS.includes(key))) throw new Error('unknown budget cohort');
    for (const cohort of COHORTS) units(budgets[cohort], cohort + ' budget');
    if (!Number.isSafeInteger(maxActions) || maxActions < 1) throw new RangeError('maxActions must be positive');
    this.#budgets = Object.fromEntries(COHORTS.map(cohort => [cohort, units(budgets[cohort], cohort + ' budget')]));
    if (!reviewReserve || typeof reviewReserve !== 'object' || Array.isArray(reviewReserve) || Reflect.ownKeys(reviewReserve).some(key => !COHORTS.includes(key))) throw new TypeError('unknown review reserve cohort or invalid record');
    this.#allocation = Object.fromEntries(COHORTS.map(cohort => {
      const reservedBudget = units(Object.hasOwn(reviewReserve, cohort) ? reviewReserve[cohort] : 0, cohort + ' review reserve');
      if (reservedBudget > this.#budgets[cohort]) throw new RangeError('review reserve exceeds cohort budget');
      return [cohort, { generalBudget: this.#budgets[cohort] - reservedBudget, reservedBudget, generalSpent: 0, reservedSpent: 0, eligibleEffort: 0 }];
    }));
    this.#hasReserve = COHORTS.some(cohort => this.#allocation[cohort].reservedBudget > 0);
    this.#maxActions = maxActions;
    this.#cohorts = Object.fromEntries(COHORTS.map(cohort => [cohort, {
      ...counters(),
      byAction: Object.fromEntries(Object.keys(this.#weights).map(action => [action, counters()])),
      byPhase: { setup: counters(), maintenance: counters() },
    }]));
  }
  begin(cohort, action, phase = 'maintenance') {
    if (!COHORTS.includes(cohort) || !Object.hasOwn(this.#weights, action) || !['setup', 'maintenance'].includes(phase)) throw new Error('unknown cohort, action or phase');
    if (this.#calls >= this.#maxActions) throw new SimulationLimit('maxActions');
    this.#calls++;
    const state = this.#cohorts[cohort];
    const rows = [state, state.byAction[action], state.byPhase[phase]];
    const cost = units(this.#weights[action], action);
    const allocation = this.#allocation[cohort];
    const eligible = phase === 'maintenance' && (action === 'inspect' || action === 'respond');
    const protectedCost = eligible ? Math.min(cost, allocation.reservedBudget - allocation.reservedSpent) : 0;
    const generalCost = cost - protectedCost;
    if (allocation.generalSpent + generalCost > allocation.generalBudget) {
      for (const row of rows) row.denied++;
      return null;
    }
    allocation.reservedSpent += protectedCost;
    allocation.generalSpent += generalCost;
    if (eligible) allocation.eligibleEffort += cost;
    for (const row of rows) {
      row.attempts++;
      row.effort += cost;
    }
    const ticket = Object.freeze({ id: this.#next++, cohort, action, phase, cost: cost / PRECISION });
    this.#pending.set(ticket.id, ticket);
    return ticket;
  }
  finish(ticket, accepted) {
    if (typeof accepted !== 'boolean' || this.#pending.get(ticket?.id) !== ticket) throw new Error('invalid or already settled effort ticket');
    const state = this.#cohorts[ticket.cohort];
    for (const row of [state, state.byAction[ticket.action], state.byPhase[ticket.phase]]) row[accepted ? 'accepted' : 'rejected']++;
    this.#pending.delete(ticket.id);
  }
  summary() {
    const result = {
      unit: 'uncalibrated weighted action-effort units',
      weights: { ...this.#weights },
      calls: this.#calls,
      maxActions: this.#maxActions,
      cohorts: Object.fromEntries(COHORTS.map(cohort => [cohort, {
        ...display(this.#cohorts[cohort]),
        byAction: Object.fromEntries(Object.entries(this.#cohorts[cohort].byAction).map(([key, row]) => [key, display(row)])),
        byPhase: Object.fromEntries(Object.entries(this.#cohorts[cohort].byPhase).map(([key, row]) => [key, display(row)])),
        budget: this.#budgets[cohort] / PRECISION,
        remaining: (this.#budgets[cohort] - this.#cohorts[cohort].effort) / PRECISION,
      }])),
    };
    if (this.#hasReserve) result.allocation = {
      reference: 'maintenance-review-reserve/v1',
      cohorts: Object.fromEntries(COHORTS.map(cohort => {
        const a = this.#allocation[cohort];
        return [cohort, {
          generalBudget: a.generalBudget / PRECISION, reservedBudget: a.reservedBudget / PRECISION,
          generalSpent: a.generalSpent / PRECISION, reservedSpent: a.reservedSpent / PRECISION,
          generalRemaining: (a.generalBudget - a.generalSpent) / PRECISION, reservedRemaining: (a.reservedBudget - a.reservedSpent) / PRECISION,
        }];
      })),
    };
    return result;
  }
  audit() {
    if (this.#pending.size) throw new Error('unsettled effort tickets');
    for (const cohort of COHORTS) {
      const state = this.#cohorts[cohort];
      if (state.effort > this.#budgets[cohort] || state.attempts !== state.accepted + state.rejected) throw new Error('effort conservation failed');
      const a = this.#allocation[cohort];
      if (a.generalBudget + a.reservedBudget !== this.#budgets[cohort] || a.generalSpent < 0 || a.generalSpent > a.generalBudget || a.reservedSpent < 0 || a.reservedSpent > a.reservedBudget || a.generalSpent + a.reservedSpent !== state.effort || a.reservedSpent !== Math.min(a.reservedBudget, a.eligibleEffort) || a.eligibleEffort < 0 || a.eligibleEffort > state.byPhase.maintenance.effort || a.eligibleEffort > state.byAction.inspect.effort + state.byAction.respond.effort) throw new Error('review allocation conservation failed');
      for (const dimension of ['byAction', 'byPhase']) {
        for (const key of ['attempts', 'accepted', 'rejected', 'denied', 'effort']) {
          const sum = Object.values(state[dimension]).reduce((total, row) => total + row[key], 0);
          if (sum !== state[key]) throw new Error('effort dimension conservation failed');
        }
      }
    }
    return this.summary();
  }
}
