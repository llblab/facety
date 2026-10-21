// Owns: Paired counterfactual measurements and finite-window return criteria, not causal proof or network health.
import { DAY } from './model.mjs';
import { experimentConfig, runExperiment, withExperimentParameters } from './experiment.mjs';
import { DEFAULT_OBSERVABLES, OBSERVABLES, metricSeries } from './discovery.mjs';
import { replicaSeed, describeValues, summarizeOutcomes } from './trials.mjs';
import { provenance } from './provenance.mjs';

function integer(value, name, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(name + ' is outside its integer bounds');
}
function record(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(name + ' must be an object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error('unknown ' + name + ' field: ' + key);
}

export function pairedOutcomeSummary(pairs) {
  if (!Array.isArray(pairs) || !pairs.length || pairs.some(pair => ![true, false, null].includes(pair.baseline) || ![true, false, null].includes(pair.treatment))) throw new Error('paired outcomes require booleans or null');
  const counts = { bothFailed: 0, bothSucceeded: 0, baselineOnly: 0, treatmentOnly: 0, unresolved: 0 };
  let lower = 0;
  let upper = 0;
  const observed = [];
  for (const pair of pairs) {
    const b = pair.baseline;
    const t = pair.treatment;
    lower += (t === true ? 1 : 0) - (b === false ? 0 : 1);
    upper += (t === false ? 0 : 1) - (b === true ? 1 : 0);
    if (b === null || t === null) {
      counts.unresolved++;
      continue;
    }
    counts[b && t ? 'bothSucceeded' : !b && !t ? 'bothFailed' : b ? 'baselineOnly' : 'treatmentOnly']++;
    observed.push(Number(t) - Number(b));
  }
  // Paired differences lie in [-1, 1]; unknown outcomes widen the sample-mean band.
  const radius = Math.sqrt(2 * Math.log(40) / pairs.length);
  return {
    baseline: summarizeOutcomes(pairs.map(pair => pair.baseline)),
    treatment: summarizeOutcomes(pairs.map(pair => pair.treatment)),
    pairedDifference: {
      counts, estimate: counts.unresolved ? null : (counts.treatmentOnly - counts.baselineOnly) / pairs.length,
      identificationBounds: { lower: lower / pairs.length, upper: upper / pairs.length },
      interval95: {
        lower: Math.max(-1, lower / pairs.length - radius), upper: Math.min(1, upper / pairs.length + radius),
        confidence: 0.95, method: 'Hoeffding bound for paired differences in [-1, 1]',
      },
      knownPairDifferences: describeValues(observed),
      interpretation: 'Treatment minus baseline goal-success frequency; paired differences, not a subtraction of marginal confidence intervals.',
    },
  };
}

export function describeReturn(rows, { days, afterDay, holdDays = 3, tolerance = 0 } = {}) {
  integer(days, 'days', 0);
  integer(afterDay, 'afterDay', 0, days);
  integer(holdDays, 'holdDays', 1);
  if (!Number.isFinite(tolerance) || tolerance < 0 || !Array.isArray(rows)) throw new Error('invalid return criterion');
  const values = new Map();
  let previous = -1;
  for (const row of rows) {
    integer(row.day, 'row day', 0, days - 1);
    if (row.day <= previous || (row.difference !== null && !Number.isFinite(row.difference))) throw new Error('return rows must be ordered with finite/null differences');
    values.set(row.day, row.difference);
    previous = row.day;
  }
  const difference = day => values.get(day) ?? null;
  const post = Array.from({ length: days - afterDay }, (_, i) => difference(afterDay + i));
  if (post.length < holdDays) return { returned: null, status: 'insufficient-window', firstWindowStartDay: null, confirmedAtDay: null, stayedWithinTolerance: null };
  for (let day = afterDay; day + holdDays <= days; day++) {
    const window = Array.from({ length: holdDays }, (_, i) => difference(day + i));
    if (window.some(value => value === null || Math.abs(value) > tolerance)) continue;
    const remaining = Array.from({ length: days - day }, (_, i) => difference(day + i));
    const breached = remaining.some(value => value !== null && Math.abs(value) > tolerance);
    return {
      returned: true, status: 'observed-return-window', firstWindowStartDay: day,
      confirmedAtDay: day + holdDays - 1,
      stayedWithinTolerance: breached ? false : remaining.every(value => value !== null) ? true : null,
    };
  }
  return {
    returned: post.every(value => value !== null) ? false : null,
    status: post.every(value => value !== null) ? 'not-observed-within-horizon' : 'unknown',
    firstWindowStartDay: null, confirmedAtDay: null, stayedWithinTolerance: null,
  };
}

function analysisSettings(overrides) {
  const defaults = { days: undefined, metrics: DEFAULT_OBSERVABLES, practicalChanges: {}, windows: undefined, recoveryAfterDay: null, holdDays: 3 };
  record(overrides, Object.keys(defaults), 'paired analysis');
  const settings = { ...defaults, ...overrides };
  integer(settings.days, 'days', 0, 3650);
  integer(settings.holdDays, 'holdDays', 1);
  if (!Array.isArray(settings.metrics) || !settings.metrics.length || new Set(settings.metrics).size !== settings.metrics.length
    || settings.metrics.some(metric => !Object.hasOwn(OBSERVABLES, metric))) throw new Error('paired metrics must be distinct known observables');
  record(settings.practicalChanges, settings.metrics, 'practicalChanges');
  const practicalChanges = Object.fromEntries(settings.metrics.map(metric => [metric,
    Object.hasOwn(settings.practicalChanges, metric) ? settings.practicalChanges[metric] : OBSERVABLES[metric],
  ]));
  if (Object.values(practicalChanges).some(value => !Number.isFinite(value) || value < 0)) throw new Error('practical changes must be finite and non-negative');
  const windows = settings.windows === undefined ? (settings.days ? [{ id: 'full', startDay: 0, endDay: settings.days }] : []) : settings.windows;
  if (!Array.isArray(windows) || windows.length > 64) throw new Error('at most 64 analysis windows are supported');
  const checked = windows.map(window => {
    record(window, ['id', 'startDay', 'endDay'], 'window');
    if (typeof window.id !== 'string' || !window.id.length) throw new Error('window ID must be non-empty');
    integer(window.startDay, 'window startDay', 0, settings.days);
    integer(window.endDay, 'window endDay', window.startDay + 1, settings.days);
    return { ...window };
  });
  if (new Set(checked.map(window => window.id)).size !== checked.length) throw new Error('duplicate window ID');
  if (settings.recoveryAfterDay !== null) integer(settings.recoveryAfterDay, 'recoveryAfterDay', 0, settings.days);
  return { ...settings, metrics: [...settings.metrics], practicalChanges, windows: checked };
}

function alignedSeries(baseline, treatment, metric, days) {
  const a = metricSeries(baseline, metric, { days });
  const b = metricSeries(treatment, metric, { days });
  return Array.from({ length: days }, (_, day) => {
    const left = a[day].value;
    const right = b[day].value;
    const difference = left !== null && right !== null ? right - left : null;
    if (difference !== null && !Number.isFinite(difference)) throw new RangeError('paired difference overflow');
    return { day, atHour: day * DAY, baseline: left, treatment: right, difference };
  });
}

export function analyzePairs(pairs, overrides) {
  const settings = analysisSettings(overrides);
  if (!Array.isArray(pairs) || !pairs.length || new Set(pairs.map(pair => pair.seed)).size !== pairs.length) throw new Error('pairs require distinct replay seed labels');
  for (const pair of pairs) {
    if (typeof pair.seed !== 'string') throw new Error('pair seed must be a string');
    for (const branch of [pair.baseline, pair.treatment]) {
      if (!branch || branch.seed !== pair.seed || branch.outcome?.horizonDays !== settings.days || typeof branch.outcome.censored !== 'boolean') throw new Error('pair branches require the same seed, horizon and explicit censoring');
      if (![true, false, null].includes(branch.outcome.success) || (branch.outcome.censored && branch.outcome.success === false)) throw new Error('a censored unresolved outcome must be null, not false');
      if (typeof branch.randomness?.generator !== 'string' || typeof branch.randomness?.decisions !== 'string') throw new Error('pair branches require a randomness manifest');
    }
    if (pair.baseline.randomness.generator !== pair.treatment.randomness.generator || pair.baseline.randomness.decisions !== pair.treatment.randomness.decisions) throw new Error('paired randomness policies must match');
  }
  const trajectories = pairs.map(pair => ({
    seed: pair.seed,
    metrics: Object.fromEntries(settings.metrics.map(metric => {
      const series = alignedSeries(pair.baseline.history, pair.treatment.history, metric, settings.days);
      const windows = Object.fromEntries(settings.windows.map(window => {
        const rows = series.slice(window.startDay, window.endDay);
        const available = rows.filter(row => row.difference !== null).length;
        return [window.id, {
          observedDays: available, expectedDays: rows.length,
          meanDifference: available === rows.length ? describeValues(rows.map(row => row.difference)).mean : null,
        }];
      }));
      return [metric, {
        series, windows,
        recovery: settings.recoveryAfterDay === null ? null : describeReturn(series, {
          days: settings.days, afterDay: settings.recoveryAfterDay, holdDays: settings.holdDays, tolerance: settings.practicalChanges[metric],
        }),
      }];
    })),
  }));
  const summaries = Object.fromEntries(settings.metrics.map(metric => [metric, {
    windows: Object.fromEntries(settings.windows.map(window => {
      const values = trajectories.map(pair => pair.metrics[metric].windows[window.id].meanDifference).filter(value => value !== null);
      const distribution = describeValues(values);
      return [window.id, {
        expectedPairs: pairs.length, completePairs: values.length, missingPairs: pairs.length - values.length,
        fullEnsembleMean: values.length === pairs.length ? distribution.mean : null,
        observedPairMeanDifferences: distribution,
      }];
    })),
    recovery: settings.recoveryAfterDay === null ? null : {
      afterDay: settings.recoveryAfterDay, holdDays: settings.holdDays, tolerance: settings.practicalChanges[metric],
      returnCriterionProbability: summarizeOutcomes(trajectories.map(pair => pair.metrics[metric].recovery.returned)),
      confirmationDays: describeValues(trajectories.map(pair => pair.metrics[metric].recovery.confirmedAtDay).filter(value => value !== null)),
      stayedWithinTolerance: summarizeOutcomes(trajectories.map(pair => {
        const returned = pair.metrics[metric].recovery;
        return returned.returned === false ? false : returned.returned === null ? null : returned.stayedWithinTolerance;
      })),
    },
  }]));
  return {
    settings,
    outcomes: pairedOutcomeSummary(pairs.map(pair => ({ baseline: pair.baseline.outcome.success, treatment: pair.treatment.outcome.success }))),
    summaries, trajectories,
    interpretation: 'Metric differences and finite-window return criteria within the declared model; not proof of causality, hysteresis or network health.',
  };
}

export function compareExperiments(overrides = {}, options = {}) {
  record(options, ['parameters', 'trials', 'seed', 'metrics', 'practicalChanges', 'windows', 'recoveryAfterDay', 'holdDays', 'maxRecordedSamples'], 'control option');
  const { parameters = {}, trials = 8, seed = 'controls', maxRecordedSamples = 100000 } = options;
  integer(trials, 'trials', 1, 10000);
  integer(maxRecordedSamples, 'maxRecordedSamples', 1);
  const baseline = experimentConfig(overrides);
  const treatment = withExperimentParameters(baseline, parameters);
  if (Object.hasOwn(parameters, 'seed') || Object.hasOwn(parameters, 'includeState')) throw new Error('paired seed and state metadata cannot be treatment parameters');
  if (baseline.includeState || treatment.includeState) throw new Error('paired controls retain histories, not full snapshots; use a single witness run');
  if (baseline.days !== treatment.days || baseline.successCriterion !== treatment.successCriterion || baseline.targetFalseConversions !== treatment.targetFalseConversions) throw new Error('paired comparisons require the same horizon and goal definition');
  const onlyShock = Object.keys(parameters).length === 1 && Object.hasOwn(parameters, 'perturbations')
    && baseline.perturbations.length === 0 && treatment.perturbations.length === 1;
  const shock = onlyShock ? treatment.perturbations[0] : null;
  const phases = shock ? [
    { id: 'pre', startDay: 0, endDay: shock.startDay },
    { id: 'perturbation', startDay: shock.startDay, endDay: shock.endDay },
    { id: 'post', startDay: shock.endDay, endDay: baseline.days },
  ].filter(window => window.startDay < window.endDay) : undefined;
  const settings = analysisSettings({
    days: baseline.days,
    metrics: options.metrics === undefined ? DEFAULT_OBSERVABLES : options.metrics,
    practicalChanges: options.practicalChanges === undefined ? {} : options.practicalChanges,
    windows: Object.hasOwn(options, 'windows') ? options.windows : phases,
    recoveryAfterDay: Object.hasOwn(options, 'recoveryAfterDay') ? options.recoveryAfterDay : shock?.endDay ?? null,
    holdDays: options.holdDays === undefined ? 3 : options.holdDays,
  });
  const plannedSamples = 2 * trials * (baseline.days + 2);
  if (!Number.isSafeInteger(plannedSamples) || plannedSamples > maxRecordedSamples) throw new RangeError('paired experiment exceeds maxRecordedSamples');
  const pairs = [];
  for (let index = 0; index < trials; index++) {
    const actualSeed = replicaSeed(seed, baseline.seed, index);
    const a = runExperiment({ ...baseline, seed: actualSeed });
    const b = runExperiment({ ...treatment, seed: actualSeed });
    const retained = run => ({ seed: run.config.seed, randomness: run.randomness, outcome: run.outcome, effort: run.effort, money: run.money, history: run.history });
    pairs.push({ seed: actualSeed, baseline: retained(a), treatment: retained(b) });
  }
  return {
    schema: 'facety-controls/v1', baseline, treatment, parameters: structuredClone(parameters),
    masterSeed: String(seed), randomness: pairs[0].baseline.randomness, provenance: provenance(),
    limits: { trials, maxRecordedSamples, plannedSamples },
    pairs, analysis: analyzePairs(pairs, settings),
    cautions: [
      'Positive outcome differences mean more target successes, not necessarily a general welfare judgment.',
      'Matching logical decision keys prevent unrelated RNG consumption from shifting other decisions. Different agents, targets and candidate sets need not share events.',
      'Activity profiles restore after a scheduled event; accumulated state, money, work, seen evidence and XP do not reset.',
      'Return means a declared metric band held for a finite number of daily samples; it is not proof of durable recovery, an attractor or hysteresis.',
      'Phase means with missing samples are conditional descriptive summaries, not full-ensemble estimates. Overlapping windows are not independent evidence.',
      'Replicate new hypotheses on reserved confirmation seeds. A selected strategy and the veto-only defense remain model assumptions.',
    ],
  };
}
