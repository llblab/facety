import test from 'node:test';
import assert from 'node:assert/strict';
import { runGame, runGameGrid, analyzeGame, sweepValuation, mixedEquilibria, normalizeGame, deterrenceSummary } from '../src/games.mjs';

const spec = {
  id: 'small',
  base: { scenario: 'sybil-cone', initialSize: 12, attackerShare: 0.25, days: 12, maxSubjects: 400, disputes: { enabled: true } },
  roles: {
    honest: { strategies: { watch: { activity: { inspect: 2, challenge: 1 } }, rest: { activity: { inspect: 0, challenge: 0 } } } },
    attackers: { strategies: { abstain: { activity: { invite: 0 } }, farm: { activity: {} } } },
  },
  replicas: 6, seed: 'g', deviation: { share: 0.25 },
};
const valuation = {
  honest: { facts: { liquidFacy: 1, effort: -0.05 }, system: { falseLiquidFacy: -0.05 } },
  attackers: { facts: { liquidFacy: 1, debt: -1, effort: -0.05 } },
};

test('support enumeration recovers textbook equilibria', () => {
  const pennies = mixedEquilibria([[1, -1], [-1, 1]], [[-1, 1], [1, -1]]);
  assert.equal(pennies.length, 1);
  pennies[0].row.forEach(value => assert.ok(Math.abs(value - 0.5) < 1e-9));
  const dilemma = mixedEquilibria([[3, 0], [5, 1]], [[3, 5], [0, 1]]);
  assert.deepEqual(dilemma.map(e => [e.row, e.column]), [[[0, 1], [0, 1]]]);
  const sexes = mixedEquilibria([[2, 0], [0, 1]], [[1, 0], [0, 2]]);
  assert.equal(sexes.length, 3);
});

test('game specifications fail closed', () => {
  assert.throws(() => normalizeGame({ ...spec, roles: { honest: spec.roles.honest } }), /attackers strategies/);
  assert.throws(() => normalizeGame({ ...spec, base: { ...spec.base, perturbations: [{ startDay: 0, endDay: 1, activity: {} }] } }), /perturbations/);
  assert.throws(() => normalizeGame({ ...spec, roles: { ...spec.roles, honest: { strategies: { bad: { activity: { unknown: 1 } } } } } }), /unknown/);
  assert.throws(() => normalizeGame({ ...spec, maxRuns: 10 }), /maxRuns/);
});

test('games are reproducible, parallel-identical and analyzable offline under explicit valuations', async () => {
  const sequential = await runGame(spec);
  const parallel = await runGame(spec, { workers: 3 });
  assert.deepEqual(parallel.facts, sequential.facts);
  assert.equal(sequential.runs, (4 + 4 * 2) * 6);
  const analysis = analyzeGame(sequential, valuation);
  assert.equal(analysis.profiles.length, 4);
  assert.equal(analysis.deviations.length, 8);
  for (const profile of analysis.profiles) assert.equal(profile.payoffs.honest.count, 6);
  assert.ok(analysis.pureEquilibria.length + (analysis.mixedEquilibria?.length ?? 0) > 0);
  const farmVsAbstain = analysis.bestResponses.attackers.rest;
  assert.equal(farmVsAbstain.comparisons.length, 1);
  const sweep = sweepValuation(sequential, valuation, { role: 'honest', key: 'effort', values: [0, -1] });
  assert.equal(sweep.length, 2);
  assert.equal(sweep[1].bestResponses.honest.abstain, 'rest', 'costly effort with nothing to catch favors resting');
});

test('a deviation to an identical strategy has exactly zero individual gain', async () => {
  const twin = await runGame({
    ...spec, id: 'twin',
    roles: { ...spec.roles, honest: { strategies: { watch: spec.roles.honest.strategies.watch, copy: spec.roles.honest.strategies.watch } } },
  });
  const analysis = analyzeGame(twin, valuation);
  for (const row of analysis.deviations.filter(row => row.role === 'honest')) {
    assert.equal(row.individualGain.mean, 0);
    assert.equal(row.individualGain.verdict, 'undetermined');
  }
});

test('deterrence summaries compare fraud with the declared rule-following strategy across a parameter grid', async () => {
  assert.throws(() => normalizeGame({ ...spec, reference: { attackers: 'missing' } }), /reference/);
  await assert.rejects(runGameGrid({ ...spec, deviation: undefined }, { axes: { sensitivity: [0.8] } }), /reference/);
  const grid = await runGameGrid({ ...spec, deviation: undefined, valuation, reference: { attackers: 'abstain' } }, { axes: { sensitivity: [0, 0.9] }, workers: 2 });
  assert.equal(grid.cells.length, 2);
  assert.equal(grid.runs, 2 * 4 * 6);
  const blind = grid.cells.find(cell => cell.coordinates.sensitivity === 0).deterrence;
  const sharp = grid.cells.find(cell => cell.coordinates.sensitivity === 0.9).deterrence;
  assert.ok(blind.byHonest.watch.fraudGainOverReference.farm.mean > sharp.byHonest.watch.fraudGainOverReference.farm.mean, 'fraud gains more when it is never suspicious');
  assert.ok(['fraud-pays', 'premium-free-without-clear-deterrent', 'deterred', 'unresolved'].includes(blind.verdict));
  for (const cell of grid.cells) assert.equal(typeof cell.viability.viable, 'boolean');
  for (const cell of grid.cells) {
    for (const equilibrium of cell.deterrence.equilibria ?? []) {
      assert.ok(Math.abs(Object.values(equilibrium.honest).reduce((a, b) => a + b, 0) - 1) < 1e-9);
      assert.ok(equilibrium.fraudProbability >= -1e-9 && equilibrium.fraudProbability <= 1 + 1e-9);
    }
  }
  const single = await runGame({ ...spec, deviation: undefined, reference: { attackers: 'abstain' } });
  const summary = deterrenceSummary(single, analyzeGame(single, valuation));
  assert.deepEqual(Object.keys(summary.byHonest), ['watch', 'rest']);
  assert.equal(summary.reference, 'abstain');
});
