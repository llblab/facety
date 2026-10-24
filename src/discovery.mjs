// Owns: Bounded parameter landscapes and exploratory trajectory diagnostics, not proofs of emergence.
import { DAY } from './model.mjs';
import { experimentConfig, withExperimentParameters, runExperiment } from './experiment.mjs';
import { describeValues, summarizeOutcomes, replicaSeed } from './trials.mjs';
import { mapTasks } from './parallel.mjs';
import { provenance } from './provenance.mjs';
import { combineExperimentRandomness } from './experiment-config.mjs';

export const OBSERVABLES = Object.freeze({
  subjects: 1, activeSubjects: 1, requiredGuarantors: 1, humanOperators: 1,
  attackerShare: 0.05, falseShare: 0.05,
  'xp.total': 1, 'xp.gini': 0.05, 'xp.topDecileShare': 0.05, 'xp.attackerShare': 0.05,
  'xp.attackerExcessShare': 0.05, 'xp.outDegreeSpearman': 0.1,
  'council.attackerShare': 0.05, 'council.membershipChurn': 0.05,
  'graph.density': 0.02, 'graph.degreeGini': 0.05, 'graph.reciprocity': 0.05,
  'graph.largestWeakComponentFraction': 0.05, 'graph.attackEdges': 1, 'graph.attackEdgesPerAttacker': 0.5,
  'lineage.maxDepth': 1, 'lineage.meanDepth': 0.25,
  'sanctions.challenges': 1, 'sanctions.upheld': 1, 'sanctions.rejected': 1, 'sanctions.falseInvalidated': 1,
  'sanctions.wrongfulInvalidated': 1, 'sanctions.excluded': 1, 'sanctions.missedFalse': 1, 'sanctions.voidedActs': 1, 'sanctions.ladderEntries': 1, 'sanctions.ladderDepth': 1, 'sanctions.councilInterventions': 1, 'sanctions.disputesResolved': 1, 'sanctions.disputesMooted': 1, 'sanctions.disputesOpen': 1, 'sanctions.disputeNotices': 1, 'sanctions.clusterChallenges': 1,
  'trust.strangerRefusals': 1, 'trust.verificationsCleared': 1, 'trust.followUps': 1, 'trust.bribesOffered': 1, 'trust.bribesAccepted': 1, 'trust.invitationsCancelled': 1, 'trust.guardianExits': 1, 'trust.cashouts': 1, 'trust.flowFlagged': 1, 'trust.flowFlaggedCoalition': 1, 'trust.gossipShares': 1, 'trust.gossipInspections': 1,
  'graph.mixing.excessWithinCohortFraction': 0.05, 'graph.mixing.directedAssortativity': 0.05,
  'connectivity.rootedFraction': 0.05, 'connectivity.honestFraction': 0.05, 'connectivity.honestNonRootFraction': 0.05,
  'admission.guaranteeQualifiedFraction': 0.05, 'admission.inviteReadyFraction': 0.05,
  falseConversions: 1, attackerEffort: 1, defenderEffort: 1,
  'cohorts.honest.sincePrevious.effort': 1,
  'cohorts.honest.byAction.inspect.accepted': 1,
  'cohorts.honest.byAction.respond.accepted': 1,
  'cohorts.attackers.sincePrevious.effort': 1,
});
export const DEFAULT_OBSERVABLES = Object.freeze([
  'subjects', 'xp.gini', 'xp.attackerShare', 'council.attackerShare',
  'graph.density', 'graph.mixing.excessWithinCohortFraction',
  'connectivity.honestNonRootFraction', 'admission.inviteReadyFraction',
  'falseConversions', 'defenderEffort',
]);

function positiveInteger(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new RangeError(name + ' must be a positive bounded integer');
}
function nonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(name + ' must be finite and non-negative');
}
function checkedRecord(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(label + ' must be an object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error('unknown ' + label + ': ' + key);
}
function settingsFrom(overrides = {}) {
  const defaults = {
    metrics: DEFAULT_OBSERVABLES, practicalChanges: {}, minReplicates: 3,
    separation: 2, patternFraction: 0.75, jumpFactor: 3, plateauSteps: 3,
  };
  checkedRecord(overrides, Object.keys(defaults), 'diagnostic setting');
  const settings = { ...defaults, ...overrides };
  if (!Array.isArray(settings.metrics) || !settings.metrics.length || new Set(settings.metrics).size !== settings.metrics.length
    || settings.metrics.some(metric => !Object.hasOwn(OBSERVABLES, metric))) throw new Error('metrics must be distinct known observable paths');
  checkedRecord(settings.practicalChanges, settings.metrics, 'practical change');
  settings.practicalChanges = Object.fromEntries(settings.metrics.map(metric => [metric, Object.hasOwn(settings.practicalChanges, metric) ? settings.practicalChanges[metric] : OBSERVABLES[metric]]));
  for (const value of Object.values(settings.practicalChanges)) nonnegative(value, 'practicalChange');
  positiveInteger(settings.minReplicates, 'minReplicates');
  if (settings.minReplicates < 2) throw new RangeError('at least two diagnostic replicates are required');
  for (const key of ['separation', 'jumpFactor']) {
    if (!Number.isFinite(settings[key]) || settings[key] < 1) throw new RangeError(key + ' must be >= 1');
  }
  if (!Number.isFinite(settings.patternFraction) || settings.patternFraction <= 0 || settings.patternFraction > 1) throw new RangeError('patternFraction must be in (0, 1]');
  positiveInteger(settings.plateauSteps, 'plateauSteps');
  return { ...settings, metrics: [...settings.metrics] };
}

export function metricSeries(history, metric, { days, offsetHours = 0 } = {}) {
  if (![0, DAY].includes(offsetHours)) throw new RangeError('daily sampling offset must be 0 or 24 hours');
  if (!Array.isArray(history) || !Object.hasOwn(OBSERVABLES, metric)) throw new Error('unknown history or observable');
  const series = history.filter(point => point.stage === 'day-end').map(point => {
    let value = point;
    for (const key of metric.split('.')) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('history is missing observable: ' + metric);
      value = value[key];
    }
    if (value !== null && !Number.isFinite(value)) throw new Error('observable must be a finite number or null');
    return { atHour: point.atHour, value };
  });
  if (days === undefined) return series;
  if (!Number.isSafeInteger(days) || days < 0 || days > 3650) throw new RangeError('days must be an integer in [0, 3650]');
  const values = new Map();
  let previous = -1;
  for (const point of series) {
    const day = (point.atHour - offsetHours) / DAY;
    if (!Number.isSafeInteger(point.atHour) || !Number.isInteger(day) || day < 0 || day >= days || day <= previous) throw new Error('daily samples must be ordered, distinct and inside the horizon');
    values.set(day, point.value);
    previous = day;
  }
  return Array.from({ length: days }, (_, day) => ({ atHour: day * DAY + offsetHours, value: values.get(day) ?? null }));
}

export function describeTrajectory(series, { practicalChange = 0, jumpFactor = 3, plateauSteps = 3 } = {}) {
  if (!Array.isArray(series)) throw new TypeError('series must be an array');
  nonnegative(practicalChange, 'practicalChange');
  if (!Number.isFinite(jumpFactor) || jumpFactor < 1) throw new RangeError('invalid jumpFactor');
  positiveInteger(plateauSteps, 'plateauSteps');
  for (let i = 0; i < series.length; i++) {
    const point = series[i];
    if (!Number.isFinite(point.atHour) || point.atHour < 0 || (i && point.atHour <= series[i - 1].atHour)
      || (point.value !== null && !Number.isFinite(point.value))) throw new Error('series requires increasing times and finite/null values');
  }
  const valid = series.filter(point => point.value !== null);
  const changes = [];
  let directionChanges = 0;
  let lastDirection = 0;
  let trailingFlatSteps = 0;
  let flatSteps = 0;
  for (let i = 1; i < series.length; i++) {
    const before = series[i - 1];
    const after = series[i];
    if (before.value === null || after.value === null) {
      lastDirection = 0;
      trailingFlatSteps = 0;
      continue;
    }
    const change = after.value - before.value;
    changes.push({ change, atHour: after.atHour });
    const direction = change > practicalChange ? 1 : change < -practicalChange ? -1 : 0;
    if (direction) {
      if (lastDirection && direction !== lastDirection) directionChanges++;
      lastDirection = direction;
      trailingFlatSteps = 0;
    } else {
      flatSteps++;
      trailingFlatSteps++;
    }
  }
  let trendPerDay = null;
  if (valid.length >= 2) {
    const meanTime = valid.reduce((sum, point) => sum + point.atHour / 24, 0) / valid.length;
    const meanValue = valid.reduce((sum, point) => sum + point.value, 0) / valid.length;
    const variance = valid.reduce((sum, point) => sum + (point.atHour / 24 - meanTime) ** 2, 0);
    trendPerDay = valid.reduce((sum, point) => sum + (point.atHour / 24 - meanTime) * (point.value - meanValue), 0) / variance;
  }
  if (trendPerDay !== null && !Number.isFinite(trendPerDay)) throw new RangeError('trajectory statistics overflow');
  const maxStep = changes.reduce((best, point) => best === null || Math.abs(point.change) > Math.abs(best.change) ? point : best, null);
  const typicalStep = describeValues(changes.map(point => Math.abs(point.change)))?.p50 ?? null;
  return {
    points: series.length, validPoints: valid.length, missingPoints: series.length - valid.length,
    firstObserved: valid[0]?.value ?? null, lastObserved: valid.at(-1)?.value ?? null,
    netObservedChange: valid.length ? valid.at(-1).value - valid[0].value : null,
    trendPerDay,
    validSteps: changes.length,
    maxStepChange: maxStep?.change ?? null, maxStepAtHour: maxStep?.atHour ?? null,
    flatFraction: changes.length ? flatSteps / changes.length : null,
    directionChanges, trailingFlatSteps,
    plateauAfterChange: lastDirection !== 0 && trailingFlatSteps >= plateauSteps,
    jumpCandidate: maxStep !== null && Math.abs(maxStep.change) > Math.max(practicalChange, jumpFactor * typicalStep),
  };
}

function normalizedAxes(axes) {
  if (!axes || typeof axes !== 'object' || Array.isArray(axes) || !Object.keys(axes).length) throw new Error('axes must be a non-empty parameter map');
  return Object.fromEntries(Object.keys(axes).sort().map(parameter => {
    const values = axes[parameter];
    if (['seed', 'includeState'].includes(parameter) || !Array.isArray(values) || !values.length
      || values.some(value => !['number', 'string', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)))
      || new Set(values.map(value => JSON.stringify(value))).size !== values.length) throw new Error('axes require distinct primitive values; seed and includeState are not axes');
    return [parameter, [...values]];
  }));
}
function coordinatesKey(coordinates, axes) {
  return JSON.stringify(Object.keys(axes).map(key => [key, coordinates[key]]));
}
function summarizeCell(cell, settings) {
  if (!Array.isArray(cell.samples) || !cell.samples.length || new Set(cell.samples.map(sample => sample.seed)).size !== cell.samples.length || cell.samples.some(sample => typeof sample.seed !== 'string')) throw new Error('cell samples require distinct seed labels');
  if (cell.samples.some(sample => typeof sample.outcome?.censored !== 'boolean')) throw new Error('sample censoring must be explicit');
  const days = cell.samples[0].outcome.horizonDays;
  if (!Number.isSafeInteger(days) || days < 0 || days > 3650 || cell.samples.some(sample => sample.outcome.horizonDays !== days)
    || (cell.config !== undefined && cell.config?.days !== days)) throw new Error('cell samples require an explicit common horizon matching the cell configuration');
  const complete = cell.samples.filter(sample => !sample.outcome.censored);
  return {
    id: cell.id, coordinates: cell.coordinates,
    completeRuns: complete.length, censoredRuns: cell.samples.length - complete.length,
    metrics: Object.fromEntries(settings.metrics.map(metric => {
      const data = complete.map(sample => {
        const series = metricSeries(sample.history, metric, { days, offsetHours: sample.outcome.dailySampleOffsetHours ?? 0 });
        return {
          endpoint: series.at(-1)?.value ?? null,
          trajectory: describeTrajectory(series, {
            practicalChange: settings.practicalChanges[metric], jumpFactor: settings.jumpFactor, plateauSteps: settings.plateauSteps,
          }),
        };
      });
      const trajectories = data.map(row => row.trajectory).filter(row => row.validSteps > 0);
      const endpoints = describeValues(data.map(row => row.endpoint).filter(value => value !== null));
      const proportion = predicate => trajectories.length ? trajectories.filter(predicate).length / trajectories.length : null;
      return [metric, {
        endpoints,
        fullEnsembleMean: complete.length === cell.samples.length && endpoints?.count === cell.samples.length ? endpoints.mean : null,
        observedNetChanges: describeValues(data.map(row => row.trajectory.netObservedChange).filter(value => value !== null)),
        trendsPerDay: describeValues(data.map(row => row.trajectory.trendPerDay).filter(value => value !== null)),
        usableTrajectories: trajectories.length,
        jumpingFraction: proportion(row => row.jumpCandidate),
        reversingFraction: proportion(row => row.directionChanges > 0),
        plateauAfterChangeFraction: proportion(row => row.plateauAfterChange),
      }];
    })),
  };
}

export function diagnoseLandscape(cells, axes, overrides = {}) {
  const dimensions = normalizedAxes(axes);
  const settings = settingsFrom(overrides);
  const expected = Object.values(dimensions).reduce((product, values) => product * values.length, 1);
  if (!Array.isArray(cells) || cells.length !== expected || new Set(cells.map(cell => cell.id)).size !== cells.length) throw new Error('landscape must contain the complete grid with distinct cell IDs');
  const positions = new Set();
  for (const cell of cells) {
    if (!cell.coordinates || Object.keys(cell.coordinates).length !== Object.keys(dimensions).length
      || Object.entries(dimensions).some(([parameter, values]) => !values.includes(cell.coordinates[parameter]))) throw new Error('invalid cell coordinates');
    const key = coordinatesKey(cell.coordinates, dimensions);
    if (positions.has(key)) throw new Error('duplicate cell coordinates');
    positions.add(key);
  }
  const summaries = cells.map(cell => summarizeCell(cell, settings));
  const candidates = [];
  const usable = (cell, metric) => !cell.censoredRuns && cell.metrics[metric].fullEnsembleMean !== null
    && cell.metrics[metric].endpoints.count >= settings.minReplicates;
  const separation = (a, b, metric) => {
    const left = a.metrics[metric].endpoints;
    const right = b.metrics[metric].endpoints;
    const difference = right.mean - left.mean;
    const scale = Math.max(left.standardDeviation, right.standardDeviation, Number.EPSILON * Math.max(1, Math.abs(left.mean), Math.abs(right.mean)));
    return { difference, score: Math.abs(difference) / scale };
  };
  for (const cell of summaries) {
    for (const metric of settings.metrics) {
      if (!usable(cell, metric) || cell.metrics[metric].usableTrajectories < settings.minReplicates) continue;
      for (const [property, kind] of [
        ['jumpingFraction', 'repeated-temporal-jump'],
        ['reversingFraction', 'repeated-direction-change'],
        ['plateauAfterChangeFraction', 'repeated-change-to-plateau'],
      ]) {
        const fraction = cell.metrics[metric][property];
        if (fraction >= settings.patternFraction) candidates.push({ kind, metric, cellIds: [cell.id], fraction, interpretation: 'Exploratory shape descriptor; not proof of an emergent mechanism.' });
      }
    }
  }
  for (const [axis, values] of Object.entries(dimensions)) {
    const groups = new Map();
    for (const cell of summaries) {
      const other = Object.keys(dimensions).filter(key => key !== axis).map(key => [key, cell.coordinates[key]]);
      const key = JSON.stringify(other);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(cell);
    }
    const numeric = values.every(value => typeof value === 'number');
    for (const group of groups.values()) {
      group.sort((a, b) => numeric ? a.coordinates[axis] - b.coordinates[axis] : values.indexOf(a.coordinates[axis]) - values.indexOf(b.coordinates[axis]));
      for (const metric of settings.metrics) {
        const comparisons = [];
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            if (numeric && j !== i + 1) continue;
            const left = group[i];
            const right = group[j];
            if (!usable(left, metric) || !usable(right, metric)) continue;
            const contrast = separation(left, right, metric);
            const strong = Math.abs(contrast.difference) > settings.practicalChanges[metric] && contrast.score >= settings.separation;
            if (numeric) comparisons.push(strong ? Math.sign(contrast.difference) : 0);
            if (strong) candidates.push({
              kind: numeric ? 'adjacent-cell-separation' : 'categorical-contrast',
              axis, metric, cellIds: [left.id, right.id], values: [left.coordinates[axis], right.coordinates[axis]],
              difference: contrast.difference, dispersionSeparation: contrast.score,
              interpretation: 'Descriptive contrast, not a significance test or a demonstrated phase transition.',
            });
          }
        }
        if (numeric && group.length >= 3 && group.every(cell => usable(cell, metric))) {
          const directions = comparisons.filter(direction => direction !== 0);
          if (directions.some((direction, i) => i && direction !== directions[i - 1])) candidates.push({
            kind: 'non-monotonic-axis-response', axis, metric, cellIds: group.map(cell => cell.id),
            values: group.map(cell => cell.coordinates[axis]), means: group.map(cell => cell.metrics[metric].fullEnsembleMean),
            interpretation: 'Candidate non-monotonic association; requires independent seeds and controlled comparisons.',
          });
        }
      }
    }
  }
  return {
    settings, summaries, candidates,
    cautions: [
      'Diagnostics describe finite sampled trajectories and associations, not proven emergent properties or causal mechanisms.',
      'Thresholds are explicit exploratory heuristics, not protocol rules, p-values or multiple-comparison-adjusted evidence.',
      'Maturation clocks, invitation thresholds, XP tie rules, onboarding and requested versus realized density can directly explain patterns.',
      'Missing daily snapshots and observables are null, not zero. Expected endpoints follow the declared horizon; censored cells are excluded from candidate contrasts.',
      'Recheck selected patterns on new seed labels and explicit controls before making a mechanism claim.',
    ],
  };
}

function planLandscape(overrides, options, extra = []) {
  const allowed = ['axes', 'trials', 'seed', 'maxCells', 'maxRecordedSamples', 'diagnostics', ...extra];
  checkedRecord(options, allowed, 'landscape option');
  const { axes, trials = 8, seed = 'landscape', maxCells = 64, maxRecordedSamples = 100000, diagnostics = {} } = options;
  positiveInteger(trials, 'trials', 10000);
  positiveInteger(maxCells, 'maxCells', 10000);
  positiveInteger(maxRecordedSamples, 'maxRecordedSamples');
  const dimensions = normalizedAxes(axes);
  const settings = settingsFrom(diagnostics);
  const cellCount = Object.values(dimensions).reduce((product, values) => product * values.length, 1);
  if (!Number.isSafeInteger(cellCount) || cellCount > maxCells) throw new RangeError('landscape exceeds maxCells');
  const config = experimentConfig(overrides);
  if (config.includeState) throw new Error('landscapes retain measurements, not full protocol snapshots; use includeState = false');
  let coordinates = [{}];
  for (const [parameter, values] of Object.entries(dimensions)) coordinates = coordinates.flatMap(point => values.map(value => ({ ...point, [parameter]: value })));
  const variants = coordinates.map(point => withExperimentParameters(config, point));
  const plannedSamples = variants.reduce((sum, variant) => sum + (variant.days * (variant.stepHours === 24 ? 1 : 24 / variant.stepHours + 1) + 2) * trials, 0);
  if (!Number.isSafeInteger(plannedSamples) || plannedSamples > maxRecordedSamples) throw new RangeError('landscape exceeds maxRecordedSamples');
  return { config, dimensions, settings, coordinates, variants, trials, seed: String(seed), limits: { maxCells, maxRecordedSamples, plannedSamples } };
}

function assembleLandscape(plan, samplesByCell) {
  const cells = plan.variants.map((variant, index) => ({
    id: 'cell:' + index, coordinates: plan.coordinates[index], config: variant,
    probability: summarizeOutcomes(samplesByCell[index].map(sample => sample.outcome.success)),
    samples: samplesByCell[index],
  }));
  return {
    schema: 'facety-landscape/v1', config: plan.config, axes: plan.dimensions, trials: plan.trials, masterSeed: plan.seed, randomness: combineExperimentRandomness(cells.map(cell => cell.samples[0].randomness)), provenance: provenance(),
    limits: plan.limits,
    cells, diagnostics: diagnoseLandscape(cells, plan.dimensions, plan.settings),
    interpretation: 'Bounded exploratory ensemble with recorded decision-keyed randomness. Matching logical decisions share draws; changed populations, candidate sets and paths need not match.',
  };
}

// One retained landscape sample; exported for worker threads.
export function landscapeSampleTask({ config }) {
  const run = runExperiment(config);
  return { seed: run.config.seed, randomness: run.randomness, outcome: run.outcome, history: run.history };
}

function sampleConfigs(plan) {
  return plan.variants.map(variant => Array.from({ length: plan.trials }, (_, index) => ({ ...variant, seed: replicaSeed(plan.seed, variant.seed, index), includeState: false })));
}

export function runLandscape(overrides = {}, options = {}) {
  const plan = planLandscape(overrides, options);
  return assembleLandscape(plan, sampleConfigs(plan).map(configs => configs.map(config => landscapeSampleTask({ config }))));
}

// Same result as runLandscape, with replicas distributed over worker threads.
export async function runLandscapeParallel(overrides = {}, options = {}) {
  const { workers = 'auto', ...rest } = options;
  const plan = planLandscape(overrides, rest);
  const configs = sampleConfigs(plan);
  const flat = await mapTasks(configs.flat().map(config => ({ config })), { workers, module: import.meta.url, exportName: 'landscapeSampleTask' });
  return assembleLandscape(plan, configs.map((cell, index) => flat.slice(index * plan.trials, (index + 1) * plan.trials)));
}
