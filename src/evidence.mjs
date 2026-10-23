// Owns: Preregistered confirmatory tests of macro-level claims on reserved seeds; excludes exploration and real-world validity.
import { DAY } from './model.mjs';
import { experimentConfig, withExperimentParameters, runExperiment, RANDOMNESS_POLICY } from './experiment.mjs';
import { OBSERVABLES, metricSeries } from './discovery.mjs';
import { replicaSeed, describeValues } from './trials.mjs';
import { binomialUpperTail, binomialLowerTail, clopperPearson, holm, bootstrapMeanInterval } from './statistics.mjs';
import { canonicalJson, digestOf, implementationDigest } from './provenance.mjs';
import { mapTasks } from './parallel.mjs';

export const HYPOTHESIS_SCHEMA = 'facety-hypothesis/v1';
export const CONFIRMATION_SCHEMA = 'facety-confirmation/v1';
export const CLAIM_ROLES = Object.freeze(['presence', 'necessity', 'alternative']);
export const SUMMARIES = Object.freeze(['endpoint', 'mean', 'min', 'max', 'change', 'trend']);
const OUTCOME_METRIC = 'outcome.success';

function fail(message) { throw new Error('hypothesis: ' + message); }
function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + ' must be an object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('unknown ' + label + ' field: ' + key);
}
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) fail(label + ' must be a short identifier');
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim().length) fail(label + ' must be non-empty text');
}
function parameterMap(value, label) {
  record(value, Object.keys(value ?? {}), label);
  for (const key of Object.keys(value)) {
    if (['seed', 'includeState'].includes(key)) fail(label + ' cannot set seed or includeState');
  }
  return structuredClone(value);
}

function normalizeStatistic(statistic, days) {
  record(statistic, ['metric', 'summary', 'window', 'subtract'], 'statistic');
  const { metric, summary = 'endpoint', window = null, subtract = null } = statistic;
  const known = metric => metric === OUTCOME_METRIC || Object.hasOwn(OBSERVABLES, metric);
  if (!known(metric)) fail('unknown statistic metric: ' + metric);
  if (subtract !== null && (!Object.hasOwn(OBSERVABLES, subtract) || metric === OUTCOME_METRIC)) fail('subtract must be a known observable on an observable statistic');
  if (metric === OUTCOME_METRIC && (summary !== 'endpoint' || window !== null)) fail('outcome.success supports only the endpoint summary');
  if (!SUMMARIES.includes(summary)) fail('unknown summary: ' + summary);
  if (window !== null) {
    record(window, ['startDay', 'endDay'], 'statistic window');
    if (!Number.isSafeInteger(window.startDay) || !Number.isSafeInteger(window.endDay) || window.startDay < 0 || window.endDay <= window.startDay) fail('invalid statistic window');
  }
  if (days < 1 && metric !== OUTCOME_METRIC) fail('trajectory statistics require a positive horizon');
  return { metric, summary, window: window && { ...window }, subtract };
}

// Endpoint and change need only their boundary days; whole-window summaries need every day.
function summarize(series, summary) {
  if (!series.length) return null;
  if (summary === 'endpoint') return series.at(-1).value;
  if (summary === 'change') return series[0].value === null || series.at(-1).value === null ? null : series.at(-1).value - series[0].value;
  if (series.some(point => point.value === null)) return null;
  const values = series.map(point => point.value);
  if (summary === 'mean') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (summary === 'min') return Math.min(...values);
  if (summary === 'max') return Math.max(...values);
  if (values.length < 2) return null;
  const times = series.map(point => point.atHour / DAY);
  const meanTime = times.reduce((sum, value) => sum + value, 0) / times.length;
  const meanValue = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i++) {
    numerator += (times[i] - meanTime) * (values[i] - meanValue);
    denominator += (times[i] - meanTime) ** 2;
  }
  return numerator / denominator;
}

// Per-run scalar. A missing day, undefined observable or censored run yields null, never an imputed value.
export function runStatistic(run, statistic) {
  if (statistic.metric === OUTCOME_METRIC) return run.outcome.success === null ? null : Number(run.outcome.success);
  if (run.outcome.censored) return null;
  const days = run.outcome.horizonDays;
  const { startDay = 0, endDay = days } = statistic.window ?? {};
  if (endDay > days) throw new RangeError('statistic window exceeds the run horizon');
  const value = metric => summarize(metricSeries(run.history, metric, { days }).slice(startDay, endDay), statistic.summary);
  const primary = value(statistic.metric);
  if (statistic.subtract === null || primary === null) return primary;
  const secondary = value(statistic.subtract);
  return secondary === null ? null : primary - secondary;
}

function normalizeSpec(spec) {
  record(spec, ['id', 'statement', 'kind', 'base', 'statistic', 'arms', 'claims', 'contexts', 'alternatives', 'replicas', 'alpha', 'exploration', 'declaredOn'], 'specification');
  identifier(spec.id, 'id');
  text(spec.statement, 'statement');
  if (!['association', 'mechanism'].includes(spec.kind)) fail('kind must be association or mechanism');
  const base = experimentConfig(spec.base ?? {});
  if (base.includeState) fail('confirmation retains scalar statistics, not protocol snapshots');
  const statistic = normalizeStatistic(spec.statistic ?? {}, base.days);
  if (statistic.window && statistic.window.endDay > base.days) fail('statistic window exceeds the horizon');
  record(spec.arms, Object.keys(spec.arms ?? {}), 'arms');
  const armIds = Object.keys(spec.arms);
  if (!armIds.length || armIds.length > 32) fail('declare 1..32 arms');
  const arms = Object.fromEntries(armIds.sort().map(id => {
    identifier(id, 'arm id');
    return [id, parameterMap(spec.arms[id], 'arm ' + id)];
  }));
  const contexts = (spec.contexts ?? [{ id: 'base', parameters: {} }]).map(context => {
    record(context, ['id', 'parameters'], 'context');
    identifier(context.id, 'context id');
    return { id: context.id, parameters: parameterMap(context.parameters ?? {}, 'context ' + context.id) };
  });
  if (!contexts.length || contexts.length > 16 || new Set(contexts.map(context => context.id)).size !== contexts.length) fail('declare 1..16 distinct contexts');
  for (const context of contexts) {
    for (const [arm, parameters] of Object.entries(arms)) {
      const overlap = Object.keys(parameters).filter(key => Object.hasOwn(context.parameters, key));
      if (overlap.length) fail(`context ${context.id} and arm ${arm} both set ${overlap.join(', ')}`);
      const config = withExperimentParameters(base, { ...context.parameters, ...parameters });
      if (config.days !== base.days || config.successCriterion !== base.successCriterion) fail('arms and contexts must share the horizon and success criterion');
    }
  }
  const alpha = spec.alpha ?? 0.05;
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 0.2) fail('alpha must be in (0, 0.2]');
  const replicas = spec.replicas;
  if (!Number.isSafeInteger(replicas) || replicas < 1 || replicas > 10000) fail('replicas must be in [1, 10000]');
  if (!Array.isArray(spec.claims) || !spec.claims.length || spec.claims.length > 32) fail('declare 1..32 claims');
  const claims = spec.claims.map(claim => {
    record(claim, ['id', 'role', 'contrast', 'direction', 'margin', 'probability', 'rationale'], 'claim');
    identifier(claim.id, 'claim id');
    if (!CLAIM_ROLES.includes(claim.role)) fail('claim role must be one of ' + CLAIM_ROLES.join(', '));
    record(claim.contrast, armIds, 'claim contrast');
    const weights = Object.entries(claim.contrast);
    if (!weights.length || weights.some(([, weight]) => !Number.isFinite(weight) || weight === 0)) fail('contrast weights must be finite and non-zero');
    if (!['greater', 'less', 'within'].includes(claim.direction)) fail('direction must be greater, less or within');
    const margin = claim.margin ?? 0;
    if (!Number.isFinite(margin) || margin < 0) fail('margin must be finite and non-negative');
    const probability = claim.probability ?? 0.5;
    if (!Number.isFinite(probability) || probability < 0.5 || probability >= 1) fail('probability must be in [0.5, 1)');
    if (probability ** replicas > alpha) fail(`claim ${claim.id} cannot reach alpha ${alpha} with ${replicas} replicas even if every replica holds`);
    if (claim.rationale !== undefined) text(claim.rationale, 'claim rationale');
    return { id: claim.id, role: claim.role, contrast: Object.fromEntries(weights.sort(([a], [b]) => (a < b ? -1 : 1))), direction: claim.direction, margin, probability, ...(claim.rationale ? { rationale: claim.rationale } : {}) };
  });
  if (new Set(claims.map(claim => claim.id)).size !== claims.length) fail('claim ids must be distinct');
  const roles = new Set(claims.map(claim => claim.role));
  if (!roles.has('presence')) fail('declare at least one presence claim');
  const alternatives = (spec.alternatives ?? []).map(alternative => {
    record(alternative, ['id', 'explanation', 'claim'], 'alternative');
    identifier(alternative.id, 'alternative id');
    text(alternative.explanation, 'alternative explanation');
    if (!claims.some(claim => claim.id === alternative.claim && claim.role === 'alternative')) fail(`alternative ${alternative.id} must reference an alternative-role claim`);
    return { ...alternative };
  });
  if (spec.kind === 'mechanism') {
    if (!roles.has('necessity')) fail('a mechanism hypothesis needs a necessity claim (ablating the mechanism removes the effect)');
    if (!alternatives.length) fail('a mechanism hypothesis must name at least one direct/encoded-rule alternative and its control claim');
  }
  for (const claim of claims.filter(claim => claim.role === 'alternative')) {
    if (!alternatives.some(alternative => alternative.claim === claim.id)) fail(`alternative claim ${claim.id} must be referenced by a named alternative explanation`);
  }
  record(spec.exploration, ['seeds', 'source'], 'exploration');
  if (!Array.isArray(spec.exploration.seeds) || spec.exploration.seeds.some(seed => typeof seed !== 'string')) fail('exploration.seeds must list exploratory seed labels (possibly empty)');
  if (spec.exploration.source !== undefined) text(spec.exploration.source, 'exploration source');
  if (spec.declaredOn !== undefined && (typeof spec.declaredOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(spec.declaredOn))) fail('declaredOn must be YYYY-MM-DD');
  return {
    id: spec.id, statement: spec.statement.trim(), kind: spec.kind, base: structuredClone(spec.base ?? {}), statistic, arms, contexts, claims, alternatives,
    replicas, alpha, exploration: { seeds: [...spec.exploration.seeds], ...(spec.exploration.source ? { source: spec.exploration.source } : {}) },
    ...(spec.declaredOn ? { declaredOn: spec.declaredOn } : {}),
  };
}

function registrationDigest(spec, implementation, randomness) {
  return digestOf({ schema: HYPOTHESIS_SCHEMA, spec, implementation: implementation.digest, randomness });
}

// Freezes the full test design before any confirmation run. The digest binds the design,
// implementation and randomness policy, and derives seed labels no exploration could have used.
export function registerHypothesis(spec) {
  const normalized = normalizeSpec(spec);
  const implementation = implementationDigest();
  const hash = registrationDigest(normalized, implementation, RANDOMNESS_POLICY);
  const confirmationSeed = 'confirm:' + hash;
  if (normalized.exploration.seeds.some(seed => seed.includes(hash))) fail('exploration seeds overlap the reserved confirmation namespace');
  return {
    schema: HYPOTHESIS_SCHEMA, hash, spec: normalized, implementation, randomness: { ...RANDOMNESS_POLICY }, confirmationSeed,
    plannedRuns: normalized.replicas * normalized.contexts.length * Object.keys(normalized.arms).length,
  };
}

export function verifyRegistration(registration, { allowImplementationChange = false } = {}) {
  record(registration, ['schema', 'hash', 'spec', 'implementation', 'randomness', 'confirmationSeed', 'plannedRuns'], 'registration');
  if (registration.schema !== HYPOTHESIS_SCHEMA) fail('unsupported registration schema');
  const spec = normalizeSpec(registration.spec);
  if (canonicalJson(spec) !== canonicalJson(registration.spec)) fail('registered specification is not in normalized form');
  if (registrationDigest(spec, registration.implementation, registration.randomness) !== registration.hash || registration.confirmationSeed !== 'confirm:' + registration.hash) fail('registration digest does not match its content');
  if (canonicalJson(registration.randomness) !== canonicalJson(RANDOMNESS_POLICY)) fail('registered randomness policy differs from the current implementation');
  const current = implementationDigest();
  const implementationMatched = current.digest === registration.implementation.digest;
  if (!implementationMatched && !allowImplementationChange) fail('implementation changed since registration; re-register or pass allowImplementationChange');
  return { spec, implementationMatched, implementation: current };
}

function plannedTasks(registration) {
  const { spec, confirmationSeed } = registration;
  const base = experimentConfig(spec.base);
  const tasks = [];
  for (const context of spec.contexts) {
    for (const [arm, parameters] of Object.entries(spec.arms)) {
      const config = withExperimentParameters(base, { ...context.parameters, ...parameters });
      for (let replica = 0; replica < spec.replicas; replica++) {
        tasks.push({ context: context.id, arm, replica, config: { ...config, seed: replicaSeed(confirmationSeed, base.seed, replica) }, statistic: spec.statistic });
      }
    }
  }
  return tasks;
}

// Evaluates one registered statistic per run. Replica labels are shared across arms and contexts.
export function runStatisticTask(task) {
  const run = runExperiment(task.config);
  return { value: runStatistic(run, task.statistic), censored: run.outcome.censored, seed: run.config.seed };
}

// Several named statistics from one run, for exploratory screens that must not rerun the model per metric.
export function runStatisticsTask(task) {
  const run = runExperiment(task.config);
  return { values: Object.fromEntries(Object.entries(task.statistics).map(([name, statistic]) => [name, runStatistic(run, statistic)])), censored: run.outcome.censored, seed: run.config.seed };
}

export async function confirmHypothesis(registration, { workers = 0, allowImplementationChange = false } = {}) {
  const { spec, implementationMatched, implementation } = verifyRegistration(registration, { allowImplementationChange });
  const tasks = plannedTasks(registration);
  const results = await mapTasks(tasks, { workers, module: new URL('./evidence.mjs', import.meta.url).href, exportName: 'runStatisticTask' });
  const values = {};
  tasks.forEach((task, index) => {
    values[task.context] ??= {};
    values[task.context][task.arm] ??= [];
    values[task.context][task.arm][task.replica] = results[index];
  });
  return {
    schema: CONFIRMATION_SCHEMA, registrationHash: registration.hash, hypothesis: spec.id, statement: spec.statement,
    implementation, implementationMatched, randomness: { ...RANDOMNESS_POLICY }, values,
    analysis: analyzeConfirmation(registration, values, { allowImplementationChange }),
  };
}

function claimHolds(direction, margin, d) {
  if (d === null) return null;
  if (direction === 'greater') return d > margin;
  if (direction === 'less') return d < -margin;
  return Math.abs(d) <= margin;
}

function testClaim(claim, rows, { alpha, seed }) {
  const contrasts = rows.map(row => {
    let total = 0;
    for (const [arm, weight] of Object.entries(claim.contrast)) {
      const value = row[arm].value;
      if (value === null) return null;
      total += weight * value;
    }
    return Number.isFinite(total) ? total : null;
  });
  const holds = contrasts.map(d => claimHolds(claim.direction, claim.margin, d));
  const n = holds.length;
  const held = holds.filter(value => value === true).length;
  const violated = holds.filter(value => value === false).length;
  const unknown = n - held - violated;
  // Unknown replicas count against support and, separately, against contradiction.
  const pSupport = binomialUpperTail(held, n, claim.probability);
  const pContradiction = binomialLowerTail(held + unknown, n, claim.probability);
  const observed = contrasts.filter(d => d !== null);
  const bounds = clopperPearson(held, n, alpha);
  return {
    claim: claim.id, role: claim.role, replicas: n, held, violated, unknown,
    holdProbabilityLowerBound: bounds.lower,
    holdProbabilityUpperBound: clopperPearson(held + unknown, n, alpha).upper,
    pValue: pSupport, contradictionPValue: pContradiction,
    supported: pSupport <= alpha, contradicted: pContradiction <= alpha,
    contrast: { ...describeValues(observed), bootstrapMean95: bootstrapMeanInterval(observed, { seed }) },
  };
}

// Pure reanalysis verifies the registered design; only implementation drift has an explicit override.
export function analyzeConfirmation(registration, values, { allowImplementationChange = false } = {}) {
  const { spec } = verifyRegistration(registration, { allowImplementationChange });
  const tests = [];
  for (const context of spec.contexts) {
    const byArm = values[context.id];
    if (!byArm) fail('missing context values: ' + context.id);
    for (const arm of Object.keys(spec.arms)) {
      if (!Array.isArray(byArm[arm]) || byArm[arm].length !== spec.replicas || byArm[arm].some(row => !row || (row.value !== null && !Number.isFinite(row.value)))) fail(`incomplete values for ${context.id}/${arm}`);
    }
    const rows = Array.from({ length: spec.replicas }, (_, replica) => Object.fromEntries(Object.keys(spec.arms).map(arm => [arm, byArm[arm][replica]])));
    for (const claim of spec.claims) tests.push({ context: context.id, ...testClaim(claim, rows, { alpha: spec.alpha, seed: `${registration.hash}:${context.id}:${claim.id}` }) });
  }
  const supported = tests.every(test => test.supported);
  const contradicted = tests.filter(test => test.contradicted).map(test => ({ context: test.context, claim: test.claim, role: test.role }));
  const verdict = supported ? 'supported' : contradicted.length ? 'contradicted' : 'inconclusive';
  return {
    alpha: spec.alpha,
    method: 'Exact one-sided binomial test per claim and context of P(contrast satisfies the claim) > declared probability; replicas are independent seeds; unknown values count against the tested direction. The hypothesis is an intersection-union test: its p-value is the maximum component p-value, valid at alpha without within-hypothesis correction.',
    tests,
    pValue: Math.max(...tests.map(test => test.pValue)),
    verdict,
    evidence: !supported ? 'none' : spec.kind === 'mechanism' ? 'mechanism-supported-within-model' : 'association-supported-within-model',
    contradicted,
    cautions: [
      'Support is conditional on the declared scenario, policies, ablation semantics, horizon, contexts and replica distribution; it is not a real-world claim.',
      'A supported mechanism means the effect appeared, required the ablated mechanism and survived the named alternative controls; unnamed explanations remain untested.',
      'Inconclusive is not evidence of absence. A contradicted claim refutes the registered design in this model only.',
      'Combine several hypotheses only with a study-level correction such as adjustStudy (Holm).',
    ],
  };
}

// Family-wise Holm adjustment across independently registered hypotheses.
export function adjustStudy(confirmations, { alpha = 0.05 } = {}) {
  if (!Array.isArray(confirmations) || !confirmations.length) fail('study requires confirmations');
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 0.2) fail('study alpha must be in (0, 0.2]');
  if (new Set(confirmations.map(item => item.registrationHash)).size !== confirmations.length) fail('study hypotheses must be distinct registrations');
  const adjusted = holm(confirmations.map(item => item.analysis.pValue));
  return {
    alpha, method: 'Holm step-down family-wise error control over hypothesis-level intersection-union p-values',
    hypotheses: confirmations.map((item, index) => ({
      hypothesis: item.hypothesis, registrationHash: item.registrationHash, pValue: item.analysis.pValue,
      adjustedPValue: adjusted[index], supported: adjusted[index] <= alpha, unadjustedVerdict: item.analysis.verdict,
    })),
  };
}

// Template for a finite-size sharpening claim: the response of the statistic to a control
// parameter step grows with system size. Arms are crossed (size, value) settings.
export function sharpeningDesign({ parameter, values, sizeParameter = 'initialSize', sizes, margin = 0, probability = 0.5, id = 'sharpening' }) {
  if (typeof parameter !== 'string' || !Array.isArray(values) || values.length !== 2 || !Array.isArray(sizes) || sizes.length !== 2) fail('sharpening needs a parameter with two values and two sizes');
  const [low, high] = values;
  const [small, large] = sizes;
  const arm = (size, value) => ({ [sizeParameter]: size, [parameter]: value });
  return {
    arms: { 'large-high': arm(large, high), 'large-low': arm(large, low), 'small-high': arm(small, high), 'small-low': arm(small, low) },
    claim: {
      id, role: 'presence', direction: 'greater', margin, probability,
      contrast: { 'large-high': 1, 'large-low': -1, 'small-high': -1, 'small-low': 1 },
      rationale: `The ${parameter} step from ${low} to ${high} changes the statistic more at ${sizeParameter}=${large} than at ${small}.`,
    },
  };
}
