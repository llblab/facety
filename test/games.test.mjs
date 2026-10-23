import test from 'node:test';
import assert from 'node:assert/strict';
import { runGame, runGameGrid, analyzeGame, sweepValuation, mixedEquilibria, normalizeGame, deterrenceSummary, assessViability } from '../src/games.mjs';

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

test('reserved stake facts can be explicitly valued without imputing missing historical custody as zero', async () => {
  const reservedSpec = { ...spec, replicas: 2, deviation: undefined, base: { ...spec.base, disputes: { enabled: true, procedure: 'chekharda-timed', stakeBacking: 'reserved' } } };
  const result = await runGame(reservedSpec);
  assert.deepEqual((await runGame(reservedSpec, { workers: 2 })).facts, result.facts);
  const current = analyzeGame(result, valuation);
  const withStakes = analyzeGame(result, { ...valuation, honest: { facts: { liquidFacy: 1, stakeFacy: 0.5 }, system: { falseStakeFacy: -0.1 } } });
  assert.ok(withStakes.profiles.every(profile => profile.payoffs.honest.unknown === 0));
  const historical = structuredClone(result);
  for (const entry of historical.facts) for (const replica of entry.replicas) {
    for (const groups of Object.values(replica.agents)) for (const facts of Object.values(groups)) {
      delete facts.stakeFacy;
      delete facts.falseStakeFacy;
    }
    delete replica.system.stakeFacy;
    delete replica.system.falseStakeFacy;
  }
  assert.deepEqual(analyzeGame(historical, valuation), current, 'zero-valued absent fields cannot corrupt an older valuation');
  const missing = analyzeGame(historical, { honest: { facts: { stakeFacy: 1 } } });
  assert.ok(missing.profiles.every(profile => (profile.payoffs.honest.mean ?? null) === null && profile.payoffs.honest.unknown === 2));
  assert.equal(missing.mixedEquilibria, null);
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

test('fraud budgets measure false minted money and coalition Council share and can bound viability', async () => {
  const result = await runGame({ ...spec, deviation: undefined, reference: { attackers: 'abstain' } });
  const analysis = analyzeGame(result, valuation);
  for (const row of analysis.profiles) {
    assert.ok(row.fraudBudget.falseMintedShare >= 0 && row.fraudBudget.falseMintedShare <= 1);
    assert.ok(row.fraudBudget.coalitionCouncilShare >= 0 && row.fraudBudget.coalitionCouncilShare <= 1);
  }
  const farmRow = analysis.profiles.find(row => row.profile.honest === 'rest' && row.profile.attackers === 'farm');
  assert.ok(farmRow.fraudBudget.falseMintedShare > 0);
  const summary = deterrenceSummary(result, analysis);
  const open = assessViability(summary);
  const strict = assessViability(summary, { maxFalseMintedShare: 0, maxCoalitionCouncilShare: 0 });
  assert.equal(open.criteria.maxFalseMintedShare, 1);
  assert.ok(strict.failures.length >= open.failures.length);
});

async function savedBudgetFixture(replicas = 2) {
  const result = await runGame({ id: 'saved-budget', base: { initialSize: 6, attackerShare: 0.5, days: 3 },
    roles: { honest: { strategies: { watch: { activity: { invite: 0 } } } },
      attackers: { strategies: { abstain: { activity: { invite: 0 } }, farm: { activity: { invite: 0 } } } } },
    replicas, reference: { attackers: 'abstain' } });
  // Synthetic retained measurements isolate offline missingness; they are not a simulated outcome claim.
  for (const entry of result.facts) for (const replica of entry.replicas) Object.assign(replica.system,
    { falseMintedShare: 0.2, falseCirculatingShare: 0.3, councilSeats: 4, councilAttackerSeats: 1 });
  return result;
}
const budgetValuation = { honest: { facts: { subjects: 1 } }, attackers: { facts: { subjects: 1 } } };

test('saved-game budget means require every declared replica and valid observed shares/counts', async () => {
  const result = await savedBudgetFixture();
  const expected = { falseMintedShare: 0.2, falseCirculatingShare: 0.3, coalitionCouncilShare: 0.25 };
  assert.deepEqual(analyzeGame(result, budgetValuation).profiles[0].fraudBudget, expected);
  for (const [field, metric] of [['falseMintedShare', 'falseMintedShare'], ['falseCirculatingShare', 'falseCirculatingShare'],
    ['councilSeats', 'coalitionCouncilShare'], ['councilAttackerSeats', 'coalitionCouncilShare']]) {
    for (const value of [undefined, null, NaN, Infinity, '0', -1]) {
      const incomplete = structuredClone(result);
      if (value === undefined) delete incomplete.facts[0].replicas[0].system[field];
      else incomplete.facts[0].replicas[0].system[field] = value;
      assert.equal(analyzeGame(incomplete, budgetValuation).profiles[0].fraudBudget[metric], null, field + ':' + value);
    }
  }
  const partial = structuredClone(result);
  partial.facts[0].replicas.pop();
  assert.throws(() => analyzeGame(partial, budgetValuation), /replica cohort/);
  const emptyCouncil = structuredClone(result);
  for (const replica of emptyCouncil.facts[0].replicas) Object.assign(replica.system, { councilSeats: 0, councilAttackerSeats: 0 });
  assert.equal(analyzeGame(emptyCouncil, budgetValuation).profiles[0].fraudBudget.coalitionCouncilShare, 0);
  emptyCouncil.facts[0].replicas[0].system.councilAttackerSeats = 1;
  assert.equal(analyzeGame(emptyCouncil, budgetValuation).profiles[0].fraudBudget.coalitionCouncilShare, null);
});

test('saved-game equilibrium measurements ignore zero mass, never positive-mass missing data', async () => {
  const result = await savedBudgetFixture();
  const analysis = analyzeGame(result, budgetValuation);
  const unused = analysis.profiles.find(row => row.profile.attackers === 'farm');
  unused.fraudBudget.falseMintedShare = null;
  delete unused.fraudBudget.coalitionCouncilShare;
  delete unused.sanctions.wrongfulInvalidated;
  analysis.mixedEquilibria = [{ honest: { watch: 1 }, attackers: { abstain: 1, farm: 0 }, values: { honest: 1, attackers: 1 } }];
  const zero = deterrenceSummary(result, analysis).equilibria[0];
  assert.equal(zero.falseMintedShare, 0.2);
  assert.equal(zero.coalitionCouncilShare, 0.25);
  assert.equal(zero.wrongfulInvalidations, 0);
  for (const mass of [0.25, 1e-12]) {
    analysis.mixedEquilibria[0].attackers = { abstain: 1 - mass, farm: mass };
    const supported = deterrenceSummary(result, analysis).equilibria[0];
    assert.equal(supported.falseMintedShare, null);
    assert.equal(supported.coalitionCouncilShare, null);
    assert.equal(supported.wrongfulInvalidations, null);
  }
});

test('saved-game admission rejects incomplete, duplicate and unaligned replica cohorts', async () => {
  const result = await savedBudgetFixture();
  const analysis = analyzeGame(result, budgetValuation);
  const mutations = [
    r => { r.game.replicas = 20; },
    r => { r.game.replicas = 0; },
    r => { r.facts[0].replicas = []; },
    r => { r.facts[0].replicas.pop(); },
    r => { delete r.facts[0].replicas[0]; },
    r => { r.facts[0].replicas[1].seed = r.facts[0].replicas[0].seed; },
    r => { delete r.facts[0].replicas[0].seed; },
    r => { r.facts[1].replicas.reverse(); },
    r => { r.facts.push({ kind: 'deviation', profile: r.facts[0].profile, role: 'attackers', strategy: 'farm', replicas: r.facts[0].replicas.slice(1) }); },
  ];
  for (const mutate of mutations) {
    const incomplete = structuredClone(result); mutate(incomplete);
    assert.throws(() => analyzeGame(incomplete, budgetValuation), /replica cohort/);
    assert.throws(() => deterrenceSummary(incomplete, analysis), /replica cohort/);
  }
});

test('saved-game known-subset payoff means cannot establish best responses or equilibria, including cached analyses', async () => {
  const result = await savedBudgetFixture(6);
  const weights = { honest: budgetValuation.honest, attackers: { facts: { liquidFacy: 1 } } };
  // Synthetic utilities create a decisive reference strategy, not a claim about actual farming returns.
  for (const entry of result.facts) for (const replica of entry.replicas) {
    replica.agents.attackers.conformist.liquidFacy = entry.profile.attackers === 'abstain' ? 90 : 0;
    replica.agents.attackers.deviant.liquidFacy = 0;
  }
  const complete = analyzeGame(result, weights);
  assert.equal(assessViability(deterrenceSummary(result, complete)).viable, true);
  for (const value of [undefined, null, NaN, Infinity, '0']) {
    const incomplete = structuredClone(result);
    if (value === undefined) delete incomplete.facts[0].replicas[0].agents.honest.conformist.subjects;
    else incomplete.facts[0].replicas[0].agents.honest.conformist.subjects = value;
    const analysis = analyzeGame(incomplete, weights);
    assert.equal(analysis.profiles[0].payoffs.honest.mean, 1, 'retain descriptive known-subset statistics');
    assert.equal(analysis.profiles[0].payoffs.honest.count, 5);
    assert.equal(analysis.profiles[0].payoffs.honest.unknown, 1);
    assert.equal(analysis.bestResponses.honest.abstain.best, null);
    assert.equal(analysis.bestResponses.honest.abstain.clear, false);
    assert.equal(analysis.pureEquilibria.length, 0);
    assert.equal(analysis.mixedEquilibria, null);
    const cached = { ...analysis, mixedEquilibria: complete.mixedEquilibria };
    for (const candidate of [analysis, cached]) {
      const summary = deterrenceSummary(incomplete, candidate);
      assert.equal(summary.equilibria, null);
      assert.equal(summary.honestWithoutFraud, null);
      assert.equal(summary.verdict, 'unresolved');
      assert.equal(assessViability(summary).viable, false);
    }
    assert.deepEqual(analyzeGame(incomplete, { honest: {}, attackers: {} }),
      analyzeGame(result, { honest: {}, attackers: {} }), 'unvalued absent fields stay irrelevant');
  }
});

test('saved-game sanction unknowns are nullable and independent of first or later replica position', async () => {
  const result = await savedBudgetFixture();
  assert.equal(analyzeGame(result, budgetValuation).profiles[0].sanctions.wrongfulInvalidated, 0);
  for (const index of [0, 1]) for (const value of [undefined, null, NaN, Infinity, '0']) {
    const incomplete = structuredClone(result);
    if (value === undefined) delete incomplete.facts[0].replicas[index].sanctions.wrongfulInvalidated;
    else incomplete.facts[0].replicas[index].sanctions.wrongfulInvalidated = value;
    const analysis = analyzeGame(incomplete, budgetValuation);
    assert.equal(analysis.profiles[0].sanctions.wrongfulInvalidated, null);
    const summary = deterrenceSummary(incomplete, analysis);
    assert.equal(summary.equilibria.find(eq => eq.attackers.abstain === 1).wrongfulInvalidations, null);
    assert.ok(assessViability(summary).failures.includes('wrongful-invalidations'));
  }
  const missing = structuredClone(result);
  for (const replica of missing.facts[0].replicas) delete replica.sanctions;
  assert.equal(analyzeGame(missing, budgetValuation).profiles[0].sanctions.wrongfulInvalidated, null);
  const laterOnly = structuredClone(result);
  laterOnly.facts[0].replicas[1].sanctions.extraCounter = 2;
  assert.equal(analyzeGame(laterOnly, budgetValuation).profiles[0].sanctions.extraCounter, null);
});

function knownDeterrence() {
  return { verdict: 'deterred', honestWithoutFraud: 10,
    equilibria: [{ honestValue: 10, wrongfulInvalidations: 0, falseMintedShare: 0.1, coalitionCouncilShare: 0.25 }] };
}

test('saved-game viability cannot approve unknown mandatory or enabled-budget measurements', () => {
  const strict = { maxFalseMintedShare: 0.2, maxCoalitionCouncilShare: 0.5 };
  assert.equal(assessViability(knownDeterrence(), strict).viable, true);
  for (const [field, failure] of [['falseMintedShare', 'fraud-budget-money'], ['coalitionCouncilShare', 'fraud-budget-council'],
    ['honestValue', 'honest-retention'], ['wrongfulInvalidations', 'wrongful-invalidations']]) {
    for (const value of [undefined, null, NaN, Infinity, '0']) {
      const missing = knownDeterrence();
      missing.equilibria[0][field] = value;
      const verdict = assessViability(missing, strict);
      assert.equal(verdict.viable, false, field + ':' + value);
      assert.ok(verdict.failures.includes(failure));
    }
  }
  for (const baseline of [0, -1, null, NaN, Infinity]) {
    const missing = knownDeterrence(); missing.honestWithoutFraud = baseline;
    assert.equal(assessViability(missing).honestRetention, null);
    assert.ok(assessViability(missing).failures.includes('honest-retention'));
  }
  const disabled = knownDeterrence(); delete disabled.equilibria[0].falseMintedShare;
  const open = assessViability(disabled);
  assert.equal(open.falseMintedShare, null);
  assert.equal(open.viable, true, 'cap=1 disables this criterion, not missing-data reporting');
  disabled.equilibria.push({ ...knownDeterrence().equilibria[0] });
  assert.equal(assessViability(disabled, strict).falseMintedShare, null, 'do not drop an incomplete equilibrium');
  const zero = knownDeterrence(); zero.equilibria[0].falseMintedShare = 0;
  assert.equal(assessViability(zero, { maxFalseMintedShare: 0 }).viable, true);
});

test('saved-game viability criteria reject non-finite, negative and out-of-range limits', () => {
  for (const key of ['minHonestRetention', 'maxWrongfulInvalidations', 'maxFalseMintedShare', 'maxCoalitionCouncilShare']) {
    for (const value of [null, NaN, Infinity, -1, '0', true]) assert.throws(() => assessViability(knownDeterrence(), { [key]: value }), /viability/);
  }
  for (const key of ['maxFalseMintedShare', 'maxCoalitionCouncilShare']) assert.throws(() => assessViability(knownDeterrence(), { [key]: 1.1 }), /viability/);
  assert.equal(assessViability(knownDeterrence(), { minHonestRetention: 2 }).viable, false, 'higher-than-baseline utility targets remain legal');
  assert.equal(assessViability(knownDeterrence(), { maxWrongfulInvalidations: 0.5 }).viable, true);
});
