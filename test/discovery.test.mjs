import test from 'node:test';
import assert from 'node:assert/strict';
import { runLandscape, diagnoseLandscape, describeTrajectory, metricSeries } from '../src/discovery.mjs';
import { describeValues } from '../src/trials.mjs';
import { DEFAULT_ACTIVITY } from '../src/experiment.mjs';

const quiet = Object.fromEntries(Object.keys(DEFAULT_ACTIVITY.honest).map(key => [key, 0]));
const series = values => values.map((value, index) => ({ atHour: index * 24, value }));
function point(value, index, metric = 'xp.gini') {
  const result = { stage: 'day-end', atHour: index * 24 };
  const path = metric.split('.');
  let parent = result;
  for (const key of path.slice(0, -1)) parent = parent[key] = {};
  parent[path.at(-1)] = value;
  return result;
}
function cell(id, coordinates, values, { metric = 'xp.gini', censored = false } = {}) {
  return {
    id, coordinates,
    samples: Array.from({ length: 3 }, (_, replica) => ({
      seed: 'replica:' + replica,
      outcome: { success: false, censored: censored && replica === 0, horizonDays: (Array.isArray(values[0]) ? values[replica] : values).length },
      history: (Array.isArray(values[0]) ? values[replica] : values).map((value, i) => point(value, i, metric)),
    })),
  };
}

test('trajectory descriptors distinguish a constant null control, smooth change, jumps and plateaus', () => {
  const constant = describeTrajectory(series([0.2, 0.2, 0.2, 0.2, 0.2, 0.2]), { practicalChange: 0.05 });
  assert.equal(constant.jumpCandidate, false);
  assert.equal(constant.plateauAfterChange, false);
  assert.equal(constant.directionChanges, 0);
  assert.equal(constant.flatFraction, 1);
  const smooth = describeTrajectory(series([0, 0.1, 0.2, 0.3, 0.4, 0.5]), { practicalChange: 0.05 });
  assert.equal(smooth.jumpCandidate, false);
  assert.ok(Math.abs(smooth.trendPerDay - 0.1) < 1e-12);
  const step = describeTrajectory(series([0, 0, 0.8, 0.8, 0.8, 0.8]), { practicalChange: 0.05 });
  assert.equal(step.jumpCandidate, true);
  assert.equal(step.plateauAfterChange, true);
  assert.equal(step.maxStepAtHour, 48);
  assert.equal(step.maxStepChange, 0.8);
  const reversal = describeTrajectory(series([0, 0.3, 0.6, 0.3, 0]), { practicalChange: 0.05 });
  assert.equal(reversal.directionChanges, 1);
});

test('missing observables remain missing; gaps are not invented instantaneous jumps', () => {
  const features = describeTrajectory(series([0, null, 0.8, 0.8, 0.8, 0.8]), { practicalChange: 0.05 });
  assert.equal(features.missingPoints, 1);
  assert.equal(features.netObservedChange, 0.8);
  assert.equal(features.jumpCandidate, false);
  assert.equal(features.plateauAfterChange, false);
  assert.equal(describeTrajectory(series([null, null])).trendPerDay, null);
  assert.equal(describeTrajectory([]).firstObserved, null);
  assert.throws(() => describeTrajectory([{ atHour: 0, value: 1 }, { atHour: 0, value: 2 }]));
  assert.throws(() => describeTrajectory(series([Infinity])));
  assert.throws(() => describeTrajectory(series([1e308, 1e308])));
  assert.throws(() => metricSeries([{ stage: 'day-end', atHour: 0 }], 'xp.gini'));
  assert.throws(() => metricSeries([], 'invented'));
});

test('daily alignment retains omitted snapshots as null and rejects ambiguous timestamps', () => {
  const history = [point(0, 0), ...[2, 3, 4, 5].map(day => point(0.8, day))];
  const aligned = metricSeries(history, 'xp.gini', { days: 6 });
  assert.deepEqual(aligned, series([0, null, 0.8, 0.8, 0.8, 0.8]));
  const features = describeTrajectory(aligned, { practicalChange: 0.05 });
  assert.equal(features.jumpCandidate, false);
  assert.equal(features.missingPoints, 1);
  assert.equal(metricSeries(history, 'xp.gini', { days: 7 }).at(-1).value, null);
  assert.deepEqual(metricSeries([], 'xp.gini', { days: 0 }), []);
  for (const bad of [
    [point(0, 0), point(1, 0)], [point(0, 1), point(1, 0)],
    [point(0, 0.5)], [point(0, -1)], [point(0, 6)],
    [{ ...point(0, 0), atHour: '0' }],
  ]) assert.throws(() => metricSeries(bad, 'xp.gini', { days: 6 }));
  for (const days of [-1, null, 1.5, 3651]) assert.throws(() => metricSeries([], 'xp.gini', { days }));
});

test('landscape endpoints require the expected final daily snapshot, not the last retained value', () => {
  const active = { ...quiet, selfId: 1 };
  const landscape = runLandscape({
    initialSize: 3, days: 4, initialTopology: 'none', policy: { xpFinality: 'immediate' },
    activity: { honest: active, attackers: active },
  }, { axes: { initialDegree: [1, 2] }, trials: 3, diagnostics: { metrics: ['xp.total'] } });
  assert.deepEqual(landscape.diagnostics.candidates, []);
  assert.deepEqual(landscape.diagnostics.summaries.map(row => row.metrics['xp.total'].fullEnsembleMean), [12, 12]);
  for (const missingReplicas of [1, 3]) {
    const cells = structuredClone(landscape.cells);
    for (const sample of cells[1].samples.slice(0, missingReplicas)) {
      sample.history = sample.history.filter(row => row.stage !== 'day-end' || row.atHour !== 72);
    }
    const before = JSON.stringify(cells);
    const result = diagnoseLandscape(cells, landscape.axes, landscape.diagnostics.settings);
    const metric = result.summaries[1].metrics['xp.total'];
    assert.equal(metric.fullEnsembleMean, null);
    assert.equal(metric.endpoints?.count ?? 0, 3 - missingReplicas);
    assert.deepEqual(result.candidates, []);
    assert.equal(JSON.stringify(cells), before);
  }
  const empty = runLandscape({ initialSize: 3, days: 0 }, { axes: { initialDegree: [1] }, trials: 3, diagnostics: { metrics: ['subjects'] } });
  assert.equal(empty.diagnostics.summaries[0].metrics.subjects.fullEnsembleMean, null);
});

test('constant, no-effect control cells produce no automatic emergence discoveries', () => {
  const cells = [cell('a', { x: 0 }, [0.2, 0.2, 0.2, 0.2]), cell('b', { x: 1 }, [0.2, 0.2, 0.2, 0.2])];
  const result = diagnoseLandscape(cells, { x: [0, 1] }, { metrics: ['xp.gini'] });
  assert.deepEqual(result.candidates, []);
  assert.ok(result.cautions.some(note => note.includes('not proven emergent')));
});

test('known non-monotonic responses are only descriptive candidates, and thresholds can be reanalyzed offline', () => {
  const cells = [cell('a', { x: 0 }, [0.1, 0.1]), cell('b', { x: 1 }, [0.8, 0.8]), cell('c', { x: 2 }, [0.1, 0.1])];
  const before = JSON.stringify(cells);
  const result = diagnoseLandscape(cells, { x: [2, 0, 1] }, { metrics: ['xp.gini'] });
  const response = result.candidates.find(candidate => candidate.kind === 'non-monotonic-axis-response');
  assert.deepEqual(response.values, [0, 1, 2]);
  assert.deepEqual(response.cellIds, ['a', 'b', 'c']);
  assert.ok(result.candidates.every(candidate => /not|requires|descriptor/.test(candidate.interpretation)));
  const insensitive = diagnoseLandscape(cells, { x: [0, 1, 2] }, { metrics: ['xp.gini'], practicalChanges: { 'xp.gini': 1 } });
  assert.equal(insensitive.candidates.length, 0);
  assert.equal(JSON.stringify(cells), before);
});

test('repeated temporal shapes are surfaced without claiming an inferred mechanism', () => {
  const result = diagnoseLandscape([cell('step', { x: 0 }, [0, 0, 0.8, 0.8, 0.8, 0.8])], { x: [0] }, { metrics: ['xp.gini'] });
  assert.ok(result.candidates.some(candidate => candidate.kind === 'repeated-temporal-jump'));
  assert.ok(result.candidates.some(candidate => candidate.kind === 'repeated-change-to-plateau'));
  assert.ok(result.candidates.every(candidate => candidate.interpretation.includes('not proof')));
});

test('replicate dispersion suppresses coarse contrast flags and capped cells never look stable or safe', () => {
  const noisy = [
    cell('a', { x: 0 }, [[0, 0], [1, 1], [0.5, 0.5]]),
    cell('b', { x: 1 }, [[0.1, 0.1], [1, 1], [0.55, 0.55]]),
  ];
  assert.equal(diagnoseLandscape(noisy, { x: [0, 1] }, { metrics: ['xp.gini'] }).candidates.length, 0);
  const capped = [cell('a', { x: 0 }, [0.1, 0.1]), cell('b', { x: 1 }, [0.8, 0.8], { censored: true })];
  const result = diagnoseLandscape(capped, { x: [0, 1] }, { metrics: ['xp.gini'] });
  assert.equal(result.summaries[1].metrics['xp.gini'].fullEnsembleMean, null);
  assert.equal(result.summaries[1].censoredRuns, 1);
  assert.equal(result.summaries[1].metrics['xp.gini'].endpoints.count, 2);
  assert.equal(result.candidates.length, 0);
});

test('grid contrasts hold other coordinates fixed rather than comparing diagonal cells', () => {
  const cells = [];
  for (const x of [0, 1]) for (const y of [0, 1]) cells.push(cell(x + ':' + y, { x, y }, [10 * x + 100 * y, 10 * x + 100 * y], { metric: 'subjects' }));
  const result = diagnoseLandscape(cells, { y: [0, 1], x: [0, 1] }, { metrics: ['subjects'] });
  for (const candidate of result.candidates) {
    const [a, b] = candidate.cellIds.map(id => cells.find(entry => entry.id === id));
    const other = candidate.axis === 'x' ? 'y' : 'x';
    assert.equal(a.coordinates[other], b.coordinates[other]);
  }
  assert.equal(result.candidates.length, 4);
});

test('native parameter landscapes retain replayable raw trajectories and matching seed labels', () => {
  const config = { initialSize: 6, days: 4, initialTopology: 'none', activity: { honest: quiet, attackers: quiet } };
  const options = { axes: { initialDegree: [1, 2], attackerShare: [0, 0.5] }, trials: 3, seed: 'landscape-test', diagnostics: { metrics: ['subjects', 'xp.gini'] } };
  const a = runLandscape(config, options);
  assert.deepEqual(a, runLandscape(config, options));
  assert.equal(a.cells.length, 4);
  assert.equal(a.limits.plannedSamples, 72);
  assert.deepEqual(a.cells[0].samples.map(sample => sample.seed), a.cells[3].samples.map(sample => sample.seed));
  assert.equal(a.cells[0].samples[0].history.length, 6);
  assert.deepEqual(a.diagnostics.candidates, []);
  assert.deepEqual(JSON.parse(JSON.stringify(a)).diagnostics, a.diagnostics);
  const reanalyzed = diagnoseLandscape(a.cells, a.axes, a.diagnostics.settings);
  assert.deepEqual(reanalyzed, a.diagnostics);
});

test('all-null domains and truncation retain uncertainty rather than imputing zero endpoints', () => {
  const unknown = runLandscape(
    { initialSize: 3, attackerShare: 1, initialTopology: 'clique', days: 8, maxSubjects: 3, activity: { attackers: { invite: 1 } } },
    { axes: { sensitivity: [0, 1] }, trials: 3, diagnostics: { metrics: ['subjects'] } },
  );
  assert.equal(unknown.cells[0].probability.unresolved, 3);
  assert.equal(unknown.diagnostics.summaries[0].censoredRuns, 3);
  assert.equal(unknown.diagnostics.summaries[0].metrics.subjects.fullEnsembleMean, null);
  assert.equal(unknown.diagnostics.candidates.length, 0);
  const missing = runLandscape(
    { initialSize: 3, days: 2, activity: { honest: quiet, attackers: quiet } },
    { axes: { attackerShare: [0, 1] }, trials: 3, diagnostics: { metrics: ['connectivity.honestNonRootFraction'] } },
  );
  assert.equal(missing.diagnostics.summaries[0].metrics['connectivity.honestNonRootFraction'].endpoints, null);
  assert.equal(missing.diagnostics.candidates.length, 0);
});

test('invalid or oversized research plans fail before simulation, and artifact reanalysis rejects ambiguity', () => {
  for (const bad of [
    { axes: { initialDegree: [1, 1] } },
    { axes: { seed: ['new'] } },
    { axes: { unknown: [1] } },
    { axes: { initialDegree: [1, 2], attackerShare: [0, 1] }, maxCells: 3 },
    { axes: { days: [2, 4] }, trials: 3, maxRecordedSamples: 29 },
    { axes: { initialDegree: [1] }, diagnostics: { metrics: ['xp.typo'] } },
    { axes: { initialDegree: [1] }, diagnostics: { metrics: ['xp.gini'], practicalChanges: { 'xp.gini': null } } },
  ]) assert.throws(() => runLandscape({ initialSize: 3, days: 0 }, bad));
  assert.throws(() => runLandscape({ includeState: true }, { axes: { initialDegree: [1] } }));
  const a = cell('a', { x: 0 }, [0.1, 0.1]);
  assert.throws(() => diagnoseLandscape([a], { x: [0, 1] }));
  assert.throws(() => diagnoseLandscape([a, { ...a, id: 'b' }], { x: [0, 1] }));
  const duplicateSeeds = structuredClone(a);
  duplicateSeeds.samples[1].seed = duplicateSeeds.samples[0].seed;
  assert.throws(() => diagnoseLandscape([duplicateSeeds], { x: [0] }));
  for (const horizonDays of [undefined, null, -1, 1.5, 3651, 3]) {
    const badHorizon = structuredClone(a);
    badHorizon.samples[0].outcome.horizonDays = horizonDays;
    assert.throws(() => diagnoseLandscape([badHorizon], { x: [0] }, { metrics: ['xp.gini'] }));
  }
  assert.throws(() => diagnoseLandscape([{ ...a, config: { days: 3 } }], { x: [0] }, { metrics: ['xp.gini'] }));
});

test('descriptive statistics retain replicate dispersion without pretending it is a confidence interval', () => {
  const summary = describeValues([1, 2, 3]);
  assert.equal(summary.mean, 2);
  assert.equal(summary.standardDeviation, 1);
  assert.equal(summary.standardError, 1 / Math.sqrt(3));
  assert.equal(summary.p50, 2);
  assert.equal(describeValues([]), null);
  assert.throws(() => describeValues([NaN]));
});
