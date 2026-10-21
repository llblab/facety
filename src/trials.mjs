// Owns: Seeded trial aggregation, uncertainty and parameter sweeps; excludes real-world calibration.
import { experimentConfig, runExperiment, withExperimentParameters } from './experiment.mjs';
import { provenance } from './provenance.mjs';

export function wilsonInterval(successes, trials) {
  if (!Number.isSafeInteger(trials) || trials < 1 || !Number.isSafeInteger(successes) || successes < 0 || successes > trials) throw new RangeError('invalid Bernoulli counts');
  const z = 1.959963984540054;
  const probability = successes / trials;
  const denominator = 1 + z * z / trials;
  const center = (probability + z * z / (2 * trials)) / denominator;
  const half = z * Math.sqrt(probability * (1 - probability) / trials + z * z / (4 * trials * trials)) / denominator;
  return { lower: Math.max(0, center - half), upper: Math.min(1, center + half), confidence: 0.95, method: 'Wilson score' };
}

export function summarizeOutcomes(outcomes) {
  if (!Array.isArray(outcomes) || !outcomes.length || outcomes.some(value => ![true, false, null].includes(value))) throw new Error('outcomes must be non-empty booleans or null');
  const successes = outcomes.filter(value => value === true).length;
  const failures = outcomes.filter(value => value === false).length;
  const unresolved = outcomes.length - successes - failures;
  return {
    trials: outcomes.length, successes, failures, unresolved,
    estimate: unresolved ? null : successes / outcomes.length,
    identificationBounds: { lower: successes / outcomes.length, upper: (successes + unresolved) / outcomes.length },
    interval95: unresolved ? null : wilsonInterval(successes, outcomes.length),
    conservativeEnvelope95: {
      lower: wilsonInterval(successes, outcomes.length).lower,
      upper: wilsonInterval(successes + unresolved, outcomes.length).upper,
    },
  };
}

export function describeValues(values) {
  if (!Array.isArray(values) || values.some(value => !Number.isFinite(value))) throw new RangeError('descriptive values must be finite numbers');
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = probability => {
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
  };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const standardDeviation = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : 0;
  if (!Number.isFinite(mean) || !Number.isFinite(standardDeviation)) throw new RangeError('descriptive statistics overflow');
  return { count: values.length, mean, standardDeviation, standardError: standardDeviation / Math.sqrt(values.length), min: sorted[0], p10: quantile(0.1), p50: quantile(0.5), p90: quantile(0.9), max: sorted.at(-1) };
}

export function replicaSeed(masterSeed, scenarioSeed, index) {
  for (const seed of [masterSeed, scenarioSeed]) {
    if (!['string', 'number'].includes(typeof seed) || (typeof seed === 'number' && !Number.isFinite(seed))) throw new TypeError('replica seeds must be strings or finite numbers');
  }
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError('replica index must be non-negative');
  return JSON.stringify([String(masterSeed), String(scenarioSeed), index]);
}

export function runTrials(overrides = {}, { trials = 100, seed = 'batch', includeRuns = false } = {}) {
  if (!Number.isSafeInteger(trials) || trials < 1 || trials > 10000) throw new RangeError('trials must be in [1, 10000]');
  if (typeof includeRuns !== 'boolean') throw new TypeError('includeRuns must be boolean');
  if (!['string', 'number'].includes(typeof seed) || (typeof seed === 'number' && !Number.isFinite(seed))) throw new TypeError('batch seed must be a string or finite number');
  const config = experimentConfig(overrides);
  const masterSeed = String(seed);
  const runs = [];
  for (let index = 0; index < trials; index++) runs.push(runExperiment({ ...config, seed: replicaSeed(masterSeed, config.seed, index), includeState: includeRuns && config.includeState }));
  const successful = runs.filter(run => run.outcome.success === true);
  return {
    schema: 'facety-trials/v1', config, masterSeed, randomness: runs[0].randomness, provenance: provenance(),
    interpretation: 'Conditional scenario frequency across seeded trials, not real-world attack probability. Unresolved safety-capped runs are not failures.',
    probability: summarizeOutcomes(runs.map(run => run.outcome.success)),
    censoredTrials: runs.filter(run => run.outcome.censored).length,
    resources: {
      attackerEffort: describeValues(runs.map(run => run.effort.cohorts.attackers.effort)),
      defenderEffort: describeValues(runs.map(run => run.effort.cohorts.honest.effort)),
      attackerEffortAtFirstSuccess: describeValues(successful.map(run => run.outcome.firstSuccess.attackerEffort)),
      hoursToFirstSuccess: describeValues(successful.map(run => run.outcome.firstSuccess.atHour)),
      honestEmissionsCancelled: describeValues(runs.map(run => run.impact.honestEmissionsCancelled)),
      honestConnectedFraction: describeValues(runs.map(run => run.impact.honestConnectedFraction).filter(value => value !== null)),
      falseConversions: describeValues(runs.map(run => run.impact.falseConversions)),
    },
    trialOutcomes: runs.map(run => ({ seed: run.config.seed, randomness: run.randomness, ...run.outcome })),
    ...(includeRuns ? { runs } : {}),
  };
}

export function sweepParameter(overrides, { parameter, values, trials = 100, seed = 'sweep' } = {}) {
  if (typeof parameter !== 'string' || !Array.isArray(values) || !values.length || values.length > 1000) throw new Error('sweep requires a parameter and 1..1000 values');
  const config = experimentConfig(overrides);
  const checked = values.map(value => withExperimentParameters(config, { [parameter]: value }));
  return {
    schema: 'facety-sweep/v1', parameter, seed: String(seed), provenance: provenance(),
    results: checked.map((candidate, index) => ({ value: values[index], experiment: runTrials(candidate, { trials, seed }) })),
  };
}
