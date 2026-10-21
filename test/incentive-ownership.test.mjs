import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runIncentiveForks, readIncentiveComparisons } from '../src/incentives.mjs';
import { compareIncentiveOwnership } from '../src/incentive-ownership.mjs';
import { EffortLedger } from '../src/effort.mjs';

const sponsor = branch => branch.operators.find(operator => operator.id === 'sponsor');
function reaccount(artifact, weights = artifact.branches[0].work.weights, budget = 100_000) {
  for (const branch of artifact.branches) {
    const ledgers = new Map(branch.timeline.at(-1).subjects.map(subject => [subject.id, new EffortLedger({ weights, budgets: { honest: budget, attackers: 0 } })]));
    branch.actions.sort((a, b) => a.atHour - b.atHour);
    for (const action of branch.actions) {
      const ledger = ledgers.get(action.actor);
      const ticket = ledger.begin('honest', action.action, action.phase);
      assert.ok(ticket);
      ledger.finish(ticket, true);
      action.effort = ticket.cost;
    }
    const summaries = [...ledgers].map(([id, ledger]) => [id, ledger.audit()]);
    branch.work = {
      unit: summaries[0][1].unit, weights: summaries[0][1].weights,
      bySubject: Object.fromEntries(summaries.map(([id, summary]) => [id, summary.cohorts.honest])),
    };
  }
  return artifact;
}

test('ownership worlds share untouched protocol traces under both XP policies, not a second live execution', () => {
  for (const xpFinality of ['terminal', 'immediate']) {
    const source = runIncentiveForks({ xpFinality });
    const before = JSON.stringify(source);
    const analysis = compareIncentiveOwnership(source);
    assert.equal(JSON.stringify(source), before);
    assert.deepEqual(JSON.parse(JSON.stringify(analysis)), analysis);
    assert.deepEqual(analysis.protocolBranches, source.branches.map(({ strategy, timeline, events }) => ({ strategy, timeline, events })));
    assert.deepEqual(analysis.worlds.map(world => world.id), ['independent-newcomer', 'sponsor-controlled-newcomer']);
    for (const branch of analysis.protocolBranches) {
      for (const point of branch.timeline) {
        for (const subject of point.subjects) {
          assert.equal(Object.hasOwn(subject, 'genuine'), false);
          assert.equal(Object.hasOwn(subject, 'operator'), false);
        }
      }
    }
    const reformatted = JSON.parse(before);
    reformatted.branches.reverse();
    reformatted.comparisons = [{ sponsor: { liquidFacy: 999, effort: 0 } }];
    reformatted.assumptions = ['Unverified imported metadata is not evaluator truth.'];
    assert.deepEqual(compareIncentiveOwnership(reformatted), analysis);
    for (const branch of reformatted.branches) delete branch.events;
    const withoutEventLogs = compareIncentiveOwnership(reformatted);
    assert.deepEqual(withoutEventLogs.worlds, analysis.worlds);
    assert.ok(withoutEventLogs.protocolBranches.every(branch => branch.events === null));
    assert.deepEqual(JSON.parse(JSON.stringify(withoutEventLogs)), withoutEventLogs);
  }
});

test('custody recovers newcomer money only with explicit control and charges all work to that operator', () => {
  const analysis = compareIncentiveOwnership(runIncentiveForks());
  const [independent, controlled] = analysis.worlds;
  assert.deepEqual(independent.branches.map(branch => [sponsor(branch).liquidFacy, sponsor(branch).work.effort]), [[1, 3], [0, 4], [0, 5]]);
  assert.deepEqual(controlled.branches.map(branch => [sponsor(branch).liquidFacy, sponsor(branch).work.effort]), [[1, 3], [1, 7], [1, 9]]);
  assert.deepEqual(independent.comparisons.map(row => [row.sponsorOperator.liquidFacy, row.sponsorOperator.effort]), [[-1, 1], [-1, 2]]);
  assert.deepEqual(controlled.comparisons.map(row => [row.sponsorOperator.liquidFacy, row.sponsorOperator.effort]), [[0, 4], [0, 6]]);
  for (let i = 1; i <= 2; i++) {
    assert.deepEqual(independent.branches[i].population, { subjects: 3, assumedOperators: 3, assumedGenuinePeople: 3 });
    assert.deepEqual(controlled.branches[i].population, { subjects: 3, assumedOperators: 2, assumedGenuinePeople: 2 });
    assert.deepEqual(controlled.branches[i].operators.find(row => row.id === 'peer'), independent.branches[i].operators.find(row => row.id === 'peer'));
    assert.deepEqual(sponsor(controlled.branches[i]).subjectIds, ['newcomer', 'sponsor']);
    assert.deepEqual(sponsor(controlled.branches[i]).xpBySubject, { sponsor: i, newcomer: 1 });
  }
  for (const world of analysis.worlds) {
    for (const row of world.comparisons) {
      assert.equal(row.privateUtility, null);
      assert.equal(row.expectedLiability, null);
      assert.equal(row.networkExternality, null);
      assert.equal(row.sponsorOperator.observedDebt, 0);
      assert.equal(Object.hasOwn(row.sponsorOperator, 'xp'), false);
    }
    for (const branch of world.branches) for (const operator of branch.operators) assert.equal(Object.hasOwn(operator, 'xp'), false);
  }
});

test('operator custody, per-subject authority and counterfactual action accounting conserve their separate quantities', () => {
  const analysis = compareIncentiveOwnership(runIncentiveForks());
  for (const world of analysis.worlds) {
    for (const branch of world.branches) {
      const protocol = analysis.protocolBranches.find(row => row.strategy === branch.strategy);
      const state = protocol.timeline.at(-1);
      assert.equal(branch.operators.reduce((sum, row) => sum + row.liquidFacy, 0), state.ledger.collector);
      assert.deepEqual(Object.assign({}, ...branch.operators.map(row => row.xpBySubject)), Object.fromEntries(state.subjects.map(subject => [subject.id, subject.xp])));
      assert.equal(branch.operators.reduce((sum, row) => sum + row.work.acceptedActions, 0), branch.workActions.length);
      for (const operator of branch.operators) {
        const actions = branch.workActions.filter(action => action.operator === operator.id);
        assert.equal(operator.work.effortMicroUnits, actions.reduce((sum, action) => sum + Math.round(action.effort * 1e6), 0));
        for (const action of actions) assert.equal(world.evaluator.operatorBySubject[action.subject], operator.id);
      }
      const preparation = branch.workActions.filter(action => action.recordedAction === 'recruitHuman');
      assert.equal(preparation.length, branch.strategy === 'wait-collector' ? 0 : 1);
      for (const action of preparation) {
        assert.equal(action.action, world.evaluator.preparationAction);
        assert.equal(action.subject, 'sponsor');
        assert.equal(action.recordedEffort, 1);
      }
    }
  }
});

test('fabrication work uses its declared source weight, not a free relabeling or measured human recruitment', () => {
  for (const fabrication of [0, 0.333333, 2.5]) {
    const source = runIncentiveForks();
    for (const branch of source.branches) {
      branch.work.weights.fabricateIdentity = fabrication;
      branch.work.weights.selfId = 1 + Number.EPSILON;
    }
    const [independent, controlled] = compareIncentiveOwnership(source).worlds;
    assert.equal(sponsor(independent.branches[1]).work.effort, 4);
    assert.equal(sponsor(controlled.branches[1]).work.effortMicroUnits, 6e6 + Math.round(fabrication * 1e6));
    assert.equal(sponsor(controlled.branches[2]).work.effortMicroUnits, 8e6 + Math.round(fabrication * 1e6));
    for (const branch of controlled.branches) {
      for (const action of branch.workActions.filter(row => row.action === 'selfId')) assert.equal(action.effort, action.recordedEffort);
    }
  }
});

test('ownership analysis rejects missing endpoints and ambiguous preparation even when recorded work itself checks', () => {
  const incomplete = runIncentiveForks();
  incomplete.branches[1].timeline.pop();
  assert.throws(() => compareIncentiveOwnership(incomplete), /declared horizon/);
  for (const alter of [
    source => { source.branches[1].actions.find(row => row.action === 'recruitHuman').actor = 'peer'; },
    source => { source.branches[1].actions.find(row => row.action === 'recruitHuman').atHour = 96; },
    source => { source.branches[1].actions.find(row => row.action === 'recruitHuman').action = 'fabricateIdentity'; },
    source => { source.branches[1].actions = source.branches[1].actions.filter(row => row.action !== 'recruitHuman'); },
    source => { source.branches[0].actions.push({ ...source.branches[1].actions.find(row => row.action === 'recruitHuman') }); },
  ]) {
    const source = runIncentiveForks();
    alter(source);
    reaccount(source);
    assert.doesNotThrow(() => readIncentiveComparisons(source));
    assert.throws(() => compareIncentiveOwnership(source), /recorded sponsor recruitment step/);
  }
});

test('safe subject ledgers cannot silently overflow pooled operator micro-unit accounting', () => {
  const source = runIncentiveForks();
  const weights = Object.fromEntries(Object.keys(source.branches[0].work.weights).map(key => [key, 1_100_000_000]));
  reaccount(source, weights, 9_000_000_000);
  assert.doesNotThrow(() => readIncentiveComparisons(source));
  const before = JSON.stringify(source);
  assert.throws(() => compareIncentiveOwnership(source), /ownership effort accounting overflow/);
  assert.equal(JSON.stringify(source), before);
});

test('the example declares conditional preference witnesses without predicting adoption or merging authority', () => {
  const result = spawnSync(process.execPath, ['examples/incentive-ownership.mjs'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const { analysis, illustrations } = JSON.parse(result.stdout);
  assert.deepEqual(analysis, compareIncentiveOwnership(runIncentiveForks()));
  assert.deepEqual(illustrations.map(row => row.worlds.map(world => world.comparisons.map(comparison => comparison.conditionalTerminalDifference))), [
    [[-2, -3], [-4, -6]],
    [[-11, -12], [-4, -6]],
  ]);
  for (const row of illustrations) {
    assert.equal(row.preferences.xpValueForEverySubject, 0);
    assert.equal(row.preferences.relativeExpectedLossesForAllAlternatives, 0);
  }
  assert.equal(analysis.fullDynamicUtility, null);
  assert.equal(analysis.networkExternality, null);
});
