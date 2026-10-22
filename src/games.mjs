// Owns: Empirical strategy games over simulated payoff facts — profiles, unilateral deviations and
// equilibrium analysis under explicit valuations. Excludes behavioral calibration and real-world preferences.
import { experimentConfig, runExperiment } from './experiment.mjs';
import { COHORTS } from './effort.mjs';
import { replicaSeed, describeValues } from './trials.mjs';
import { binomialUpperTail, bootstrapMeanInterval } from './statistics.mjs';
import { mapTasks } from './parallel.mjs';
import { provenance } from './provenance.mjs';

export const GAME_SCHEMA = 'facety-game/v1';
export const FACT_KEYS = Object.freeze([
  'subjects', 'acceptedSubjects', 'invalidatedSubjects', 'falseSubjects', 'liquidFacy', 'emitterFacy', 'stakeFacy', 'debt', 'falseLiquidFacy', 'falseStakeFacy', 'falseDebt', 'xp',
  'councilSeats', 'effort', 'convertedRewards', 'finesCollected', 'finesAsDebt', 'halvings', 'rewardsReceived', 'bribesPaid', 'bribesReceived',
]);
export const SYSTEM_KEYS = Object.freeze(['supply', 'burned', 'falseLiquidFacy', 'stakeFacy', 'falseStakeFacy', 'falseConvertedRewards', 'falseAcceptedSubjects', 'councilAttackerSeats', 'falseMintedShare', 'falseCirculatingShare']);
const INITIAL_GROUPS = Object.freeze(['conformist', 'deviant']);

function fail(message) { throw new Error('game: ' + message); }
function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object');
  if (keys) for (const key of Object.keys(value)) if (!keys.includes(key)) fail('unknown ' + label + ' field: ' + key);
}
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value)) fail(label + ' must be a short identifier');
}

function normalizeStrategy(role, strategy, days) {
  record(strategy, ['activity', 'schedule', 'description'], `${role} strategy`);
  const activity = { ...(strategy.activity ?? {}) };
  const schedule = (strategy.schedule ?? []).map(event => ({ ...event, activity: { ...event.activity } }));
  // Validation reuses the experiment's own activity and schedule checks.
  experimentConfig({ days, deviants: { share: 0.5, [role]: { activity, schedule } } });
  return { activity, schedule, ...(strategy.description ? { description: String(strategy.description) } : {}) };
}

export function normalizeGame(spec) {
  record(spec, ['id', 'description', 'base', 'roles', 'replicas', 'seed', 'deviation', 'maxRuns', 'valuation', 'reference'], 'specification');
  identifier(spec.id, 'id');
  const base = experimentConfig(spec.base ?? {});
  if (base.includeState) fail('games retain payoff facts, not protocol snapshots');
  if (base.perturbations.length || base.deviants.share !== 0) fail('base may not contain perturbations or deviants; strategies own all scheduling');
  record(spec.roles, COHORTS, 'roles');
  const roles = Object.fromEntries(COHORTS.map(role => {
    const declared = spec.roles[role]?.strategies;
    record(declared, null, role + ' strategies');
    const names = Object.keys(declared);
    if (!names.length || names.length > 8) fail(`declare 1..8 ${role} strategies`);
    return [role, Object.fromEntries(names.map(name => {
      identifier(name, role + ' strategy name');
      return [name, normalizeStrategy(role, declared[name], base.days)];
    }))];
  }));
  const replicas = spec.replicas ?? 20;
  if (!Number.isSafeInteger(replicas) || replicas < 2 || replicas > 10000) fail('replicas must be in [2, 10000]');
  const deviation = spec.deviation ?? null;
  if (deviation !== null) {
    record(deviation, ['share'], 'deviation');
    if (!(deviation.share > 0 && deviation.share <= 0.5)) fail('deviation.share must be in (0, 0.5]');
  }
  const maxRuns = spec.maxRuns ?? 20000;
  if (!Number.isSafeInteger(maxRuns) || maxRuns < 1) fail('maxRuns must be a positive integer');
  const [h, a] = COHORTS.map(role => Object.keys(roles[role]).length);
  const plannedRuns = h * a * (1 + (deviation ? h - 1 + a - 1 : 0)) * replicas;
  if (plannedRuns > maxRuns) fail(`planned ${plannedRuns} runs exceed maxRuns ${maxRuns}`);
  const reference = spec.reference ?? null;
  if (reference !== null) {
    record(reference, ['attackers'], 'reference');
    if (!Object.hasOwn(roles.attackers, reference.attackers)) fail('reference.attackers must name the rule-following attacker strategy');
  }
  return { id: spec.id, ...(spec.description ? { description: String(spec.description) } : {}), base: structuredClone(spec.base ?? {}), roles, replicas, seed: String(spec.seed ?? spec.id), deviation, maxRuns, reference };
}

function profileConfig(game, profile, deviant = null) {
  const base = experimentConfig(game.base);
  const activity = Object.fromEntries(COHORTS.map(role => [role, { ...(game.base.activity?.[role] ?? {}), ...game.roles[role][profile[role]].activity }]));
  const perturbations = COHORTS.flatMap(role => game.roles[role][profile[role]].schedule.map((event, index) => ({
    id: `${role}:${profile[role]}:${index}`, startDay: event.startDay, endDay: event.endDay, activity: { [role]: event.activity },
  })));
  const deviants = { share: game.deviation?.share ?? 0, honest: null, attackers: null };
  if (deviant) {
    const strategy = game.roles[deviant.role][deviant.strategy];
    deviants[deviant.role] = { activity: { ...(game.base.activity?.[deviant.role] ?? {}), ...strategy.activity }, schedule: strategy.schedule };
  }
  return experimentConfig({ ...base, activity, perturbations, deviants });
}

// Retained payoff facts of one run; exported for worker threads.
export function gameRunTask({ config }) {
  const run = runExperiment(config);
  const { sanctions, trust, ...system } = run.system;
  return { seed: run.config.seed, censored: run.outcome.censored, agents: run.agents, system, sanctions: { ...sanctions, ...trust } };
}

function profileKey(profile) { return `${profile.honest}|${profile.attackers}`; }

function isShare(value) { return Number.isFinite(value) && value >= 0 && value <= 1; }
function meanShare(values, expected) {
  return values.length === expected && values.every(isShare) ? describeValues(values)?.mean ?? null : null;
}
function councilShare(system) {
  const seats = system?.councilSeats;
  const attackers = system?.councilAttackerSeats;
  if (!Number.isSafeInteger(seats) || !Number.isSafeInteger(attackers) || seats < 0 || attackers < 0 || attackers > seats) return null;
  return seats === 0 ? 0 : attackers / seats;
}
function observedExtreme(values, extreme) {
  return values.length && values.every(Number.isFinite) ? extreme(...values) : null;
}

function gamePlans(game) {
  const profiles = [];
  for (const honest of Object.keys(game.roles.honest)) for (const attackers of Object.keys(game.roles.attackers)) profiles.push({ honest, attackers });
  const plans = [];
  for (const profile of profiles) {
    plans.push({ kind: 'profile', profile, config: profileConfig(game, profile) });
    if (!game.deviation) continue;
    for (const role of COHORTS) {
      for (const strategy of Object.keys(game.roles[role])) {
        if (strategy !== profile[role]) plans.push({ kind: 'deviation', profile, role, strategy, config: profileConfig(game, profile, { role, strategy }) });
      }
    }
  }
  const tasks = plans.flatMap(plan => Array.from({ length: game.replicas }, (_, index) => ({ config: { ...plan.config, seed: replicaSeed(game.seed, plan.config.seed, index) } })));
  return { plans, tasks };
}

function assembleGame(game, plans, results) {
  const facts = plans.map((plan, index) => ({
    kind: plan.kind, profile: plan.profile, ...(plan.kind === 'deviation' ? { role: plan.role, strategy: plan.strategy } : {}),
    replicas: results.slice(index * game.replicas, (index + 1) * game.replicas),
  }));
  return { schema: GAME_SCHEMA, game, provenance: provenance(), runs: plans.length * game.replicas, facts };
}

export async function runGame(spec, { workers = 0 } = {}) {
  const game = normalizeGame(spec);
  const { plans, tasks } = gamePlans(game);
  const result = assembleGame(game, plans, await mapTasks(tasks, { workers, module: import.meta.url, exportName: 'gameRunTask' }));
  return spec.valuation ? { ...result, analysis: analyzeGame(result, spec.valuation) } : result;
}

function withPath(object, path, value) {
  const copy = structuredClone(object);
  const keys = path.split('.');
  let parent = copy;
  for (const key of keys.slice(0, -1)) parent = parent[key] ??= {};
  parent[keys.at(-1)] = value;
  return copy;
}

// Runs the same game over a grid of simulation parameters (base paths such as
// sensitivity or disputes.accuracy). All cells share replica seeds and one worker pool.
export async function runGameGrid(spec, { axes, workers = 0, maxRuns = 200000, retainFacts = false } = {}) {
  record(axes, null, 'grid axes');
  const names = Object.keys(axes).sort();
  if (!names.length || names.some(name => !Array.isArray(axes[name]) || !axes[name].length || axes[name].length > 50)) fail('grid axes need 1..50 values each');
  if (!spec.valuation || !spec.reference) fail('a grid needs a valuation and reference.attackers to summarize deterrence');
  let coordinates = [{}];
  for (const name of names) coordinates = coordinates.flatMap(point => axes[name].map(value => ({ ...point, [name]: value })));
  const cells = coordinates.map(point => {
    const cellSpec = { ...spec, base: names.reduce((base, name) => withPath(base, name, point[name]), spec.base ?? {}) };
    const game = normalizeGame(cellSpec);
    return { point, cellSpec, game, ...gamePlans(game) };
  });
  const runs = cells.reduce((sum, cell) => sum + cell.tasks.length, 0);
  if (runs > maxRuns) fail(`grid plans ${runs} runs, above maxRuns ${maxRuns}`);
  const results = await mapTasks(cells.flatMap(cell => cell.tasks), { workers, module: import.meta.url, exportName: 'gameRunTask' });
  let offset = 0;
  return {
    schema: 'facety-game-grid/v1', id: spec.id, axes: Object.fromEntries(names.map(name => [name, [...axes[name]]])), provenance: provenance(), runs,
    cells: cells.map(cell => {
      const result = assembleGame(cell.game, cell.plans, results.slice(offset, offset += cell.tasks.length));
      const analysis = analyzeGame(result, spec.valuation);
      const deterrence = deterrenceSummary(result, analysis);
      return { coordinates: cell.point, deterrence, viability: assessViability(deterrence), ...(retainFacts ? { result } : {}) };
    }),
  };
}

// The fraud-budget limits default to off (1); a typical declared budget is 0.2 of minted money and
// less than half of Council seats.
export const DEFAULT_VIABILITY = Object.freeze({ minHonestRetention: 0.5, maxWrongfulInvalidations: 1, maxFalseMintedShare: 1, maxCoalitionCouncilShare: 1 });

// Declared viability criteria over a deterrence summary: fraud earns no premium, some honest strategy
// deters, honest equilibrium value keeps a minimum share of the fraud-free value, and wrongful
// invalidations of genuine people stay below a bound. The thresholds are analyst choices.
export function assessViability(deterrence, criteria = {}) {
  record(criteria, Object.keys(DEFAULT_VIABILITY), 'viability criteria');
  const limits = { ...DEFAULT_VIABILITY, ...criteria };
  for (const [key, value] of Object.entries(limits)) if (!Number.isFinite(value) || value < 0
    || (['maxFalseMintedShare', 'maxCoalitionCouncilShare'].includes(key) && value > 1)) fail('invalid viability limit: ' + key);
  const { minHonestRetention, maxWrongfulInvalidations, maxFalseMintedShare, maxCoalitionCouncilShare } = limits;
  const equilibria = deterrence.equilibria ?? [];
  const baseline = deterrence.honestWithoutFraud;
  const retention = Number.isFinite(baseline) && baseline > 0 ? observedExtreme(equilibria.map(eq =>
    Number.isFinite(eq.honestValue) ? eq.honestValue / baseline : null), Math.min) : null;
  const wrongful = observedExtreme(equilibria.map(eq => Number.isFinite(eq.wrongfulInvalidations)
    && eq.wrongfulInvalidations >= 0 ? eq.wrongfulInvalidations : null), Math.max);
  const failures = [];
  if (deterrence.verdict !== 'deterred') failures.push(deterrence.verdict);
  if (retention === null || retention < minHonestRetention) failures.push('honest-retention');
  if (wrongful === null || wrongful > maxWrongfulInvalidations) failures.push('wrongful-invalidations');
  const falseMinted = observedExtreme(equilibria.map(eq => isShare(eq.falseMintedShare) ? eq.falseMintedShare : null), Math.max);
  const coalitionCouncil = observedExtreme(equilibria.map(eq => isShare(eq.coalitionCouncilShare) ? eq.coalitionCouncilShare : null), Math.max);
  if (maxFalseMintedShare < 1 && (falseMinted === null || falseMinted > maxFalseMintedShare)) failures.push('fraud-budget-money');
  if (maxCoalitionCouncilShare < 1 && (coalitionCouncil === null || coalitionCouncil > maxCoalitionCouncilShare)) failures.push('fraud-budget-council');
  return {
    criteria: { minHonestRetention, maxWrongfulInvalidations, maxFalseMintedShare, maxCoalitionCouncilShare },
    honestRetention: retention, wrongfulInvalidations: wrongful, falseMintedShare: falseMinted, coalitionCouncilShare: coalitionCouncil,
    viable: !failures.length, failures,
  };
}

// Does fraud pay? Compares every non-reference attacker strategy with the rule-following reference.
export function deterrenceSummary(result, analysis, { alpha = analysis.alpha } = {}) {
  const reference = result.game.reference?.attackers;
  if (!reference) fail('deterrence needs game.reference.attackers');
  const names = Object.fromEntries(COHORTS.map(role => [role, Object.keys(result.game.roles[role])]));
  const fraud = names.attackers.filter(name => name !== reference);
  const profile = (honest, attackers) => analysis.profiles.find(row => row.profile.honest === honest && row.profile.attackers === attackers);
  const entry = (honest, attackers) => result.facts.find(item => item.kind === 'profile' && item.profile.honest === honest && item.profile.attackers === attackers);
  const payoffs = (honest, attackers) => entry(honest, attackers).replicas.map(replica => groupUtility(replica, 'attackers', INITIAL_GROUPS, analysis.valuation.attackers));
  const byHonest = Object.fromEntries(names.honest.map(honest => {
    const gains = Object.fromEntries(fraud.map(name => [name, pairedGain(payoffs(honest, name), payoffs(honest, reference), `deterrence:${honest}:${name}`, alpha)]));
    return [honest, { fraudGainOverReference: Object.fromEntries(Object.entries(gains).map(([name, gain]) => [name, { mean: gain.mean, verdict: gain.verdict }])), deters: Object.values(gains).every(gain => gain.verdict === 'worse') }];
  }));
  const mixed = analysis.mixedEquilibria;
  const equilibria = mixed === null ? null : mixed.map(eq => {
    const referenceValue = names.honest.reduce((sum, honest) => sum + eq.honest[honest] * profile(honest, reference).payoffs.attackers.mean, 0);
    const weighted = (field, key) => {
      let known = true;
      const value = names.honest.reduce((sum, honest) => sum + names.attackers.reduce((inner, attackers) => {
        const mass = eq.honest[honest] * eq.attackers[attackers];
        if (mass === 0) return inner;
        const observation = profile(honest, attackers)[field]?.[key];
        if (!Number.isFinite(mass) || mass < 0 || !Number.isFinite(observation)) { known = false; return inner; }
        return inner + mass * observation;
      }, 0), 0);
      return known && Number.isFinite(value) ? value : null;
    };
    return {
      honest: eq.honest, attackers: eq.attackers,
      fraudProbability: 1 - eq.attackers[reference],
      fraudPremium: eq.values.attackers - referenceValue,
      honestValue: eq.values.honest,
      wrongfulInvalidations: weighted('sanctions', 'wrongfulInvalidated'),
      falseInvalidations: weighted('sanctions', 'falseInvalidated'),
      falseMintedShare: weighted('fraudBudget', 'falseMintedShare'),
      coalitionCouncilShare: weighted('fraudBudget', 'coalitionCouncilShare'),
    };
  });
  const honestWithoutFraud = Math.max(...names.honest.map(honest => profile(honest, reference).payoffs.honest.mean));
  const scale = Math.max(1, Math.abs(honestWithoutFraud));
  const premiumFree = equilibria !== null && equilibria.length > 0 && equilibria.every(eq => eq.fraudPremium <= 1e-6 * scale);
  const deterrent = Object.values(byHonest).some(row => row.deters);
  return {
    reference, byHonest, equilibria, honestWithoutFraud,
    verdict: equilibria === null || !equilibria.length ? 'unresolved' : !premiumFree ? 'fraud-pays' : deterrent ? 'deterred' : 'premium-free-without-clear-deterrent',
  };
}

export function normalizeValuation(valuation) {
  record(valuation, COHORTS, 'valuation');
  return Object.fromEntries(COHORTS.map(role => {
    const declared = valuation[role] ?? {};
    record(declared, ['facts', 'system'], role + ' valuation');
    record(declared.facts ?? {}, FACT_KEYS, role + ' fact weights');
    record(declared.system ?? {}, SYSTEM_KEYS, role + ' system weights');
    const facts = Object.fromEntries(FACT_KEYS.map(key => [key, declared.facts?.[key] ?? 0]));
    const system = Object.fromEntries(SYSTEM_KEYS.map(key => [key, declared.system?.[key] ?? 0]));
    for (const weight of [...Object.values(facts), ...Object.values(system)]) if (!Number.isFinite(weight)) fail('weights must be finite');
    return [role, { facts, system }];
  }));
}

// Per-operator utility of a group of operators: linear in retained facts plus shared system terms.
function groupUtility(replica, role, groups, weights) {
  let operators = 0;
  let value = 0;
  for (const group of groups) {
    const facts = replica.agents[role][group];
    operators += facts.operators;
    for (const key of FACT_KEYS) if (weights.facts[key] !== 0) {
      if (!Number.isFinite(facts[key])) return null;
      value += weights.facts[key] * facts[key];
    }
  }
  if (!operators) return null;
  let shared = 0;
  for (const key of SYSTEM_KEYS) if (weights.system[key] !== 0) {
    if (!Number.isFinite(replica.system[key])) return null;
    shared += weights.system[key] * replica.system[key];
  }
  return value / operators + shared;
}

function summarize(values, seed) {
  const known = values.filter(value => value !== null);
  return { ...describeValues(known), unknown: values.length - known.length, bootstrapMean95: bootstrapMeanInterval(known, { seed }) };
}

// Paired comparison of per-replica payoffs a − b; ties and unknowns count against both directions.
function pairedGain(a, b, seed, alpha) {
  const gains = a.map((value, index) => value === null || b[index] === null ? null : value - b[index]);
  const positive = gains.filter(gain => gain !== null && gain > 0).length;
  const negative = gains.filter(gain => gain !== null && gain < 0).length;
  const pBetter = binomialUpperTail(positive, gains.length, 0.5);
  const pWorse = binomialUpperTail(negative, gains.length, 0.5);
  return {
    ...summarize(gains, seed), positive, negative, pBetter, pWorse,
    verdict: pBetter <= alpha ? 'better' : pWorse <= alpha ? 'worse' : 'undetermined',
  };
}

function solveLinear(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row;
    if (Math.abs(a[pivot][column]) < 1e-12) return null;
    [a[column], a[pivot]] = [a[pivot], a[column]];
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = a[row][column] / a[column][column];
      for (let k = column; k <= n; k++) a[row][k] -= factor * a[column][k];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

function subsets(size, k) {
  const result = [];
  const walk = (start, chosen) => {
    if (chosen.length === k) return void result.push([...chosen]);
    for (let i = start; i < size; i++) walk(i + 1, [...chosen, i]);
  };
  walk(0, []);
  return result;
}

// Support enumeration for a bimatrix game (row payoffs A, column payoffs B); assumes nondegeneracy.
export function mixedEquilibria(A, B, tolerance = 1e-9) {
  const rows = A.length;
  const columns = A[0].length;
  const found = [];
  for (let k = 1; k <= Math.min(rows, columns); k++) {
    for (const I of subsets(rows, k)) {
      for (const J of subsets(columns, k)) {
        // Column mix q over J makes every row in I indifferent: A[i]·q = v.
        const qSolution = solveLinear([...I.map(i => [...J.map(j => A[i][j]), -1]), [...J.map(() => 1), 0]], [...I.map(() => 0), 1]);
        const pSolution = solveLinear([...J.map(j => [...I.map(i => B[i][j]), -1]), [...I.map(() => 1), 0]], [...J.map(() => 0), 1]);
        if (!qSolution || !pSolution) continue;
        const q = new Array(columns).fill(0);
        const p = new Array(rows).fill(0);
        J.forEach((j, index) => { q[j] = qSolution[index]; });
        I.forEach((i, index) => { p[i] = pSolution[index]; });
        if ([...p, ...q].some(value => value < -tolerance)) continue;
        const rowValues = A.map(row => row.reduce((sum, value, j) => sum + value * q[j], 0));
        const columnValues = Array.from({ length: columns }, (_, j) => p.reduce((sum, value, i) => sum + value * B[i][j], 0));
        const rowBest = Math.max(...rowValues);
        const columnBest = Math.max(...columnValues);
        if (I.some(i => rowValues[i] < rowBest - tolerance * Math.max(1, Math.abs(rowBest))) || J.some(j => columnValues[j] < columnBest - tolerance * Math.max(1, Math.abs(columnBest)))) continue;
        const clean = values => values.map(value => (Math.abs(value) < tolerance ? 0 : value));
        const candidate = { row: clean(p), column: clean(q), rowValue: rowBest, columnValue: columnBest };
        if (!found.some(other => other.row.every((value, i) => Math.abs(value - candidate.row[i]) < 1e-7) && other.column.every((value, j) => Math.abs(value - candidate.column[j]) < 1e-7))) found.push(candidate);
      }
    }
  }
  return found;
}

// Offline analysis of retained facts under an explicit valuation; no simulation is rerun.
export function analyzeGame(result, valuationInput, { alpha = 0.05 } = {}) {
  if (result?.schema !== GAME_SCHEMA) fail('expected a facety-game/v1 result');
  if (!(alpha > 0 && alpha <= 0.2)) fail('alpha must be in (0, 0.2]');
  const valuation = normalizeValuation(valuationInput);
  const { game } = result;
  const names = Object.fromEntries(COHORTS.map(role => [role, Object.keys(game.roles[role])]));
  const profileFacts = new Map(result.facts.filter(entry => entry.kind === 'profile').map(entry => [profileKey(entry.profile), entry]));
  const payoffsOf = (entry, role, groups) => entry.replicas.map(replica => groupUtility(replica, role, groups, valuation[role]));
  const profiles = [...profileFacts.values()].map(entry => ({
    profile: entry.profile,
    censoredReplicas: entry.replicas.filter(replica => replica.censored).length,
    payoffs: Object.fromEntries(COHORTS.map(role => [role, summarize(payoffsOf(entry, role, INITIAL_GROUPS), `${profileKey(entry.profile)}:${role}`)])),
    sanctions: describeSanctions(entry.replicas),
    fraudBudget: {
      falseMintedShare: meanShare(entry.replicas.map(replica => replica.system?.falseMintedShare), game.replicas),
      falseCirculatingShare: meanShare(entry.replicas.map(replica => replica.system?.falseCirculatingShare), game.replicas),
      coalitionCouncilShare: meanShare(entry.replicas.map(replica => councilShare(replica.system)), game.replicas),
    },
  }));
  const mean = (profile, role) => profiles.find(row => profileKey(row.profile) === profileKey(profile)).payoffs[role].mean ?? null;

  // Strategy-level (population) best responses and pure equilibria, paired by shared replica seeds.
  const bestResponses = Object.fromEntries(COHORTS.map(role => {
    const other = role === 'honest' ? 'attackers' : 'honest';
    return [role, Object.fromEntries(names[other].map(opponent => {
      const options = names[role].map(strategy => ({ strategy, mean: mean({ [role]: strategy, [other]: opponent }, role) }));
      const best = options.reduce((top, option) => (option.mean !== null && (top === null || option.mean > top.mean) ? option : top), null);
      const comparisons = best === null ? [] : options.filter(option => option.strategy !== best.strategy).map(option => ({
        against: option.strategy,
        ...pairedGain(
          payoffsOf(profileFacts.get(profileKey({ [role]: best.strategy, [other]: opponent })), role, INITIAL_GROUPS),
          payoffsOf(profileFacts.get(profileKey({ [role]: option.strategy, [other]: opponent })), role, INITIAL_GROUPS),
          `br:${role}:${opponent}:${option.strategy}`, alpha),
      }));
      return [opponent, { best: best?.strategy ?? null, clear: comparisons.every(row => row.verdict === 'better'), comparisons }];
    }))];
  }));
  const pureEquilibria = profiles.filter(row => COHORTS.every(role => bestResponses[role][row.profile[role === 'honest' ? 'attackers' : 'honest']].best === row.profile[role]))
    .map(row => ({ profile: row.profile, strict: COHORTS.every(role => bestResponses[role][row.profile[role === 'honest' ? 'attackers' : 'honest']].clear) }));
  const A = names.honest.map(h => names.attackers.map(a => mean({ honest: h, attackers: a }, 'honest')));
  const B = names.honest.map(h => names.attackers.map(a => mean({ honest: h, attackers: a }, 'attackers')));
  const mixed = [...A, ...B].flat().some(value => value === null) ? null : mixedEquilibria(A, B).map(equilibrium => ({
    honest: Object.fromEntries(names.honest.map((name, i) => [name, equilibrium.row[i]])),
    attackers: Object.fromEntries(names.attackers.map((name, j) => [name, equilibrium.column[j]])),
    values: { honest: equilibrium.rowValue, attackers: equilibrium.columnValue },
  }));

  // Individual incentive compatibility: does a small group of initial operators gain by deviating?
  const deviations = result.facts.filter(entry => entry.kind === 'deviation').map(entry => {
    const baseline = profileFacts.get(profileKey(entry.profile));
    const conforming = payoffsOf(baseline, entry.role, ['deviant']);
    const deviating = payoffsOf(entry, entry.role, ['deviant']);
    const population = { ...entry.profile, [entry.role]: entry.strategy };
    const collectiveGain = mean(population, entry.role) === null || mean(entry.profile, entry.role) === null ? null : mean(population, entry.role) - mean(entry.profile, entry.role);
    const individual = pairedGain(deviating, conforming, `dev:${profileKey(entry.profile)}:${entry.role}:${entry.strategy}`, alpha);
    return {
      profile: entry.profile, role: entry.role, from: entry.profile[entry.role], to: entry.strategy,
      individualGain: individual,
      collectiveGain,
      socialDilemma: individual.verdict === 'better' && collectiveGain !== null && collectiveGain < 0,
    };
  });
  const incentiveCompatible = profiles.map(row => {
    const tests = deviations.filter(entry => profileKey(entry.profile) === profileKey(row.profile));
    return {
      profile: row.profile,
      ...Object.fromEntries(COHORTS.map(role => {
        const own = tests.filter(entry => entry.role === role);
        return [role, !own.length ? null : own.some(entry => entry.individualGain.verdict === 'better') ? 'profitable-deviation' : own.every(entry => entry.individualGain.verdict === 'worse') ? 'stable' : 'undetermined'];
      })),
    };
  });
  return {
    valuation, alpha,
    method: 'Per-operator linear utility of initial operators from retained protocol facts; paired comparisons share replica seeds and use exact sign tests (ties and unknowns count against both directions) with percentile bootstrap intervals.',
    profiles, bestResponses, pureEquilibria, mixedEquilibria: mixed, deviations, incentiveCompatible,
    cautions: [
      'Strategies are a finite declared menu; an equilibrium of this menu is not an equilibrium of the full game.',
      'Utility weights are explicit assumptions; use sweepValuation to locate where conclusions change.',
      'Population best responses compare whole-cohort policies. Individual incentives come from the deviation tests, which hold everyone else fixed.',
      'Payoffs exclude unmodeled consequences (reputation outside the protocol, legal risk, market prices) unless expressed through the declared weights.',
    ],
  };
}

function describeSanctions(replicas) {
  const keys = Object.keys(replicas[0].sanctions);
  return Object.fromEntries(keys.map(key => [key, describeValues(replicas.map(replica => replica.sanctions[key]))?.mean ?? null]));
}

// Recomputes equilibria while one valuation weight varies, locating where conclusions change.
export function sweepValuation(result, valuation, { role, kind = 'facts', key, values }) {
  if (!COHORTS.includes(role) || !['facts', 'system'].includes(kind) || !Array.isArray(values) || !values.length || values.length > 200) fail('sweep requires role, kind, key and 1..200 values');
  const base = normalizeValuation(valuation);
  if (!Object.hasOwn(base[role][kind], key)) fail('unknown sweep key: ' + key);
  return values.map(value => {
    const varied = structuredClone(base);
    varied[role][kind][key] = value;
    const analysis = analyzeGame(result, varied);
    return {
      value,
      pureEquilibria: analysis.pureEquilibria,
      bestResponses: Object.fromEntries(COHORTS.map(r => [r, Object.fromEntries(Object.entries(analysis.bestResponses[r]).map(([opponent, row]) => [opponent, row.best]))])),
      incentiveCompatible: analysis.incentiveCompatible,
    };
  });
}

