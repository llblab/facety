import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectedGraph } from '../src/graph.mjs';
import { FacetyModel, DAY } from '../src/model.mjs';
import { cohortMixing, measureNetwork, measureWork } from '../src/observables.mjs';
import { EffortLedger } from '../src/effort.mjs';
import { runExperiment } from '../src/experiment.mjs';
import { modelMetrics } from '../src/metrics.mjs';

function guarantee(model, from, to) {
  model.confirmGuarantee(to, model.proposeGuarantee(from, to));
}
function labels(ids, attackers = []) {
  return new Map(ids.map(id => [id, { id, cohort: attackers.includes(id) ? 'attackers' : 'honest', operator: id, genuine: true }]));
}

test('directed mixing distinguishes edge assortativity from population composition', () => {
  const graph = new DirectedGraph();
  for (const id of ['a', 'b', 'c']) graph.addNode(id);
  for (const [a, b] of [['a', 'b'], ['b', 'c'], ['c', 'b']]) graph.addEdge(a, b);
  const mixing = cohortMixing(graph, labels(['a', 'b', 'c'], ['c']));
  assert.equal(mixing.withinCohortFraction, 1 / 3);
  assert.equal(mixing.populationMixingBaseline, 1 / 3);
  assert.equal(mixing.excessWithinCohortFraction, 0);
  assert.ok(Math.abs(mixing.directedAssortativity + 0.5) < 1e-12);
  assert.equal(mixing.counts.honest.attackers, 1);
  assert.equal(cohortMixing(graph, labels(['a', 'b', 'c'])).directedAssortativity, null);
  graph.removeEdge('a', 'b');
  graph.removeEdge('b', 'c');
  graph.removeEdge('c', 'b');
  assert.equal(cohortMixing(graph, labels(['a', 'b', 'c'])).withinCohortFraction, null);
  assert.throws(() => cohortMixing(graph, new Map()));
});

test('macro measurements preserve XP semantics, normalized Council churn and passive state', () => {
  const model = new FacetyModel({ genesis: ['a', 'b', 'c'], policy: { councilSize: 2, guarantorEligibility: 'accepted', councilEligibility: 'accepted' } });
  const truth = labels(['a', 'b', 'c'], ['c']);
  guarantee(model, 'a', 'b');
  const before = measureNetwork(model, truth);
  assert.equal(before.xp.gini, null);
  assert.equal(before.xp.attackerShare, null);
  assert.equal(before.xp.topDecileShare, null);
  assert.equal(before.council.membershipChurn, null);
  assert.equal(before.connectivity.honestNonRootFraction, null);
  const act = model.createSelfId('c', model.registerArtifact('c'));
  model.advanceTo(7 * DAY);
  model.convertToCollector('c', act);
  const events = model.events();
  const revision = model.guarantees.revision;
  const after = measureNetwork(model, truth, { previousCouncilIds: before.council.memberIds });
  assert.equal(after.xp.attackerShare, 1);
  assert.ok(Math.abs(after.xp.gini - 2 / 3) < 1e-12);
  assert.equal(after.council.attackerShare, 0.5);
  assert.ok(Math.abs(after.council.membershipChurn - 2 / 3) < 1e-12);
  assert.equal(after.graph.density, 1 / 6);
  assert.equal(model.guarantees.revision, revision);
  assert.deepEqual(model.events(), events);
  assert.throws(() => measureNetwork(model, new Map()));
});

test('zero effective XP is undefined concentration, distinct from equal positive authority', () => {
  const ids = ['a', 'b', 'c'];
  const model = new FacetyModel({ genesis: ids });
  const truth = labels(ids);
  function check(total, coefficient) {
    const measured = measureNetwork(model, truth);
    assert.deepEqual(modelMetrics(model).xp, { total, gini: coefficient });
    assert.equal(measured.xp.total, total);
    assert.equal(measured.xp.gini, coefficient);
    assert.equal(measured.xp.topDecileShare, total ? 1 / 3 : null);
    assert.equal(measured.xp.attackerShare, total ? 0 : null);
    assert.equal(measured.graph.degreeGini, 0);
  }
  check(0, null);
  const acts = ids.map(id => model.createSelfId(id, model.registerArtifact(id)));
  check(0, null);
  model.advanceTo(7 * DAY);
  ids.forEach((id, index) => model.convertToCollector(id, acts[index]));
  check(3, 0);
  ids.forEach(id => model.penalize(id));
  check(0, null);
  const run = runExperiment({ initialSize: 3, days: 2, budgets: { honest: 0, attackers: 0 } });
  assert.ok(run.history.every(row => row.xp.total === 0 && row.xp.gini === null));
  assert.deepEqual(run.metrics.xp, { total: 0, gini: null });
});

test('new genuine descendants can lack a guarantee path without becoming false identities', () => {
  const model = new FacetyModel({ genesis: ['a', 'b'], policy: { guarantorEligibility: 'accepted', invitationFreezeHours: 0 } });
  const truth = labels(['a', 'b']);
  guarantee(model, 'a', 'b');
  const act = model.createSelfId('b', model.registerArtifact('b'));
  model.advanceTo(3 * DAY);
  model.acceptInvitation(model.createInvitation('b', act, 'new'), 'new');
  truth.set('new', { id: 'new', cohort: 'honest', genuine: true, operator: 'new' });
  assert.equal(measureNetwork(model, truth).connectivity.honestNonRootFraction, 0);
  assert.equal(measureNetwork(model, truth).falseSubjects, 0);
  guarantee(model, 'b', 'new');
  assert.equal(measureNetwork(model, truth).connectivity.honestNonRootFraction, 1);
});

test('activity deltas telescope to total charged work without floating-point drift', () => {
  const ledger = new EffortLedger({ weights: { inspect: 0.1 } });
  const a = ledger.begin('honest', 'inspect', 'setup');
  ledger.finish(a, true);
  const before = ledger.summary().cohorts;
  const b = ledger.begin('honest', 'inspect');
  ledger.finish(b, false);
  const c = ledger.begin('honest', 'inspect');
  ledger.finish(c, true);
  const current = ledger.audit().cohorts;
  const delta = measureWork(current, before).honest;
  assert.equal(delta.sincePrevious.effort, 0.2);
  assert.equal(delta.byAction.inspect.attempts, 2);
  assert.equal(delta.byAction.inspect.rejected, 1);
  assert.equal(delta.cumulativeEffort, 0.3);
  assert.throws(() => measureWork(before, current));
});

test('every trajectory ends at canonical final metrics and activity sums to the ledger', () => {
  for (const overrides of [
    { initialSize: 8, days: 12 },
    { initialSize: 3, attackerShare: 1, initialTopology: 'clique', days: 12, activity: { attackers: { invite: 0.1 } } },
    { initialSize: 6, days: 5, budgets: { honest: 0, attackers: 0 } },
    { initialSize: 6, maxActions: 1 },
  ]) {
    const run = runExperiment({ seed: 'observations', ...overrides });
    const last = run.history.at(-1);
    assert.equal(last.subjects, run.population.finalSubjects);
    assert.equal(last.activeSubjects, run.metrics.activeSubjects);
    assert.equal(last.requiredGuarantors, run.metrics.requiredGuarantors);
    assert.equal(last.xp.gini, run.metrics.xp.gini);
    assert.equal(last.graph.edges, run.metrics.guarantees.edges);
    assert.equal(last.connectivity.honestFraction, run.impact.honestConnectedFraction);
    assert.equal(last.council.attackerShare, run.metrics.council.seats ? run.metrics.council.attackerSeats / run.metrics.council.seats : null);
    for (const cohort of ['honest', 'attackers']) {
      const rows = run.history.map(point => point.cohorts[cohort].sincePrevious);
      assert.equal(rows.reduce((sum, row) => sum + row.attempts, 0), run.effort.cohorts[cohort].attempts);
      assert.equal(rows.reduce((sum, row) => sum + Math.round(row.effort * 1e6), 0), Math.round(run.effort.cohorts[cohort].effort * 1e6));
    }
  }
});
