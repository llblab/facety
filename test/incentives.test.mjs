import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runIncentiveForks, readIncentiveComparisons, INCENTIVE_STRATEGIES } from '../src/incentives.mjs';
import { DirectedGraph } from '../src/graph.mjs';
import { findPathBfs, verifyPath } from '../src/proofs.mjs';

const final = branch => branch.timeline.at(-1);
const person = (snapshot, id = 'sponsor') => snapshot.subjects.find(subject => subject.id === id);
const checkpoint = (branch, stage) => branch.timeline.find(row => row.stage === stage);

test('decision forks replay a common funded prefix on independent instances under either XP policy', () => {
  for (const xpFinality of ['terminal', 'immediate']) {
    const result = runIncentiveForks({ xpFinality });
    assert.deepEqual(result, runIncentiveForks({ xpFinality }));
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    assert.deepEqual(result.branches.map(branch => branch.strategy), INCENTIVE_STRATEGIES);
    for (const branch of result.branches) assert.deepEqual(branch.timeline[0], result.branches[0].timeline[0]);
    assert.equal(result.policy.xpFinality, xpFinality);
    assert.equal(result.policy.guaranteeFee, 0);
    assert.throws(() => { result.policy.xpFinality = 'invented'; }, TypeError);
    assert.equal(result.branches[0].timeline[0].ledger.minted, 2);
    assert.equal(result.branches[0].timeline[0].ledger.emitterVault, 2);
  }
});

test('invitation burn, newcomer money and guarantee authority remain distinct in measured alternatives', () => {
  const result = runIncentiveForks();
  const [wait, invite, guarantee] = result.branches;
  assert.deepEqual(result.comparisons.map(row => row.sponsor), [
    { liquidFacy: -1, xp: 0, debt: 0, effort: 1, acceptedActions: 1 },
    { liquidFacy: -1, xp: 1, debt: 0, effort: 2, acceptedActions: 2 },
  ]);
  assert.equal(person(final(wait)).liquidFacy, 1);
  for (const branch of [invite, guarantee]) {
    const state = final(branch);
    assert.equal(person(state).liquidFacy, 0);
    assert.equal(person(state, 'newcomer').liquidFacy, 1);
    assert.equal(state.ledger.burned, 1);
    assert.equal(state.ledger.minted, 3);
    assert.equal(state.ledger.collector, 2);
    assert.equal(state.ledger.emitterVault, 0);
    assert.equal(state.lineage.edges.length, 1);
    assert.ok(state.subjects.every(subject => !Object.hasOwn(subject, 'genuine') && !Object.hasOwn(subject, 'operator')));
    const query = { roots: state.roots, target: 'newcomer' };
    const lineage = DirectedGraph.fromJSON(state.lineage);
    assert.equal(verifyPath(lineage, findPathBfs(lineage, query).proof, query), true);
    const graph = DirectedGraph.fromJSON(state.guarantees);
    const search = findPathBfs(graph, query);
    assert.equal(search.status, branch === invite ? 'unreachable' : 'found');
    if (search.proof) assert.equal(verifyPath(graph, search.proof, query), true);
  }
  assert.equal(final(wait).ledger.burned, 0);
  assert.equal(final(wait).ledger.minted, 2);
  assert.equal(person(final(invite)).xp, 1);
  assert.equal(person(final(guarantee)).xp, 2);
  for (const branch of result.branches) {
    for (const state of branch.timeline) {
      assert.equal(state.ledger.minted, state.selfIds.length);
      assert.equal(state.ledger.emitterVault, state.selfIds.filter(act => act.status === 'unspent').length);
      assert.equal(state.ledger.supply, state.ledger.collector + state.ledger.emitterVault + state.ledger.feeVault);
    }
  }
});

test('timed traces expose early own XP and later guaranteed XP rather than only terminal totals', () => {
  for (const xpFinality of ['terminal', 'immediate']) {
    const [wait, invite, guarantee] = runIncentiveForks({ xpFinality }).branches;
    assert.equal(person(checkpoint(wait, 'common-prefix')).xp, xpFinality === 'terminal' ? 0 : 1);
    assert.equal(person(checkpoint(wait, 'decision')).xp, xpFinality === 'terminal' ? 0 : 1);
    assert.equal(person(checkpoint(invite, 'decision')).xp, 1);
    assert.equal(person(checkpoint(guarantee, 'decision')).xp, 1);
    assert.equal(person(checkpoint(guarantee, 'newcomer-work')).xp, xpFinality === 'terminal' ? 1 : 2);
    assert.equal(person(final(guarantee)).xp, 2);
    const child = checkpoint(guarantee, 'newcomer-work').selfIds.find(act => act.subject === 'newcomer');
    assert.equal(child.recordedAt, 4 * 24);
    assert.equal(checkpoint(guarantee, 'collector').selfIds.find(act => act.id === child.id).status, 'unspent');
    assert.equal(final(guarantee).selfIds.find(act => act.id === child.id).status, 'converted');
    assert.equal(final(guarantee).atHour, 11 * 24);
  }
});

test('work is attributed to each acting subject, while unmodeled utility and expected losses stay unknown', () => {
  const result = runIncentiveForks();
  for (const branch of result.branches) {
    for (const [actor, row] of Object.entries(branch.work.bySubject)) {
      const performed = branch.actions.filter(action => action.actor === actor);
      assert.equal(row.attempts, performed.length);
      assert.equal(row.accepted, performed.length);
      assert.equal(row.rejected, 0);
      assert.equal(row.denied, 0);
      assert.equal(row.effort, performed.reduce((sum, action) => sum + action.effort, 0));
      assert.equal(row.byPhase.setup.accepted, performed.filter(action => action.phase === 'setup').length);
      for (const [action, counts] of Object.entries(row.byAction)) assert.equal(counts.accepted, performed.filter(entry => entry.action === action).length);
    }
  }
  assert.equal(result.branches[0].work.bySubject.newcomer, undefined);
  assert.equal(result.branches[1].work.bySubject.newcomer.accepted, 3);
  assert.equal(result.branches[2].work.bySubject.newcomer.accepted, 4);
  for (const comparison of result.comparisons) {
    assert.equal(comparison.subjects, 1);
    assert.equal(comparison.lineageEdges, 1);
    assert.equal(comparison.sponsor.debt, 0);
    assert.equal(comparison.privateUtility, null);
    assert.equal(comparison.expectedLiability, null);
    assert.equal(comparison.networkExternality, null);
  }
});

test('offline facts use checked terminal states and work rather than cached comparisons', () => {
  for (const xpFinality of ['terminal', 'immediate']) {
    const native = runIncentiveForks({ xpFinality });
    const retained = JSON.parse(JSON.stringify(native));
    retained.branches.reverse();
    retained.comparisons = [{ sponsor: { liquidFacy: 999, xp: 999, effort: 0 } }];
    const before = JSON.stringify(retained);
    assert.deepEqual(readIncentiveComparisons(retained), native.comparisons);
    assert.equal(JSON.stringify(retained), before);
  }
});

test('offline facts reject incomplete, incomparable or inconsistent used source data', () => {
  const native = runIncentiveForks();
  for (const corrupt of [
    data => { data.schema = 'invented'; },
    data => { data.fixture = 'invented'; },
    data => { data.schedule.horizonDay = 10; },
    data => { data.policy.guaranteeFee = 1; },
    data => { data.branches.pop(); },
    data => { data.branches[1].strategy = data.branches[0].strategy; },
    data => { [data.branches[1].strategy, data.branches[2].strategy] = [data.branches[2].strategy, data.branches[1].strategy]; },
    data => { data.branches[1].timeline.pop(); },
    data => { data.branches[1].timeline.at(-1).atHour = 240; },
    data => { data.branches[1].timeline[0].subjects[0].xp++; },
    data => { data.branches[1].timeline.at(-1).subjects[0].debt = 1; },
    data => { data.branches[1].timeline.at(-1).subjects[0].xp = null; },
    data => { data.branches[1].timeline.at(-1).ledger.collector++; },
    data => { data.branches[1].timeline.at(-1).guarantees.nodes.push('ghost'); },
    data => { data.branches[1].work.unit = 'calibrated hours'; },
    data => { data.branches[1].work.bySubject.sponsor.effort = 0; },
    data => { delete data.branches[1].work.weights.convert; },
    data => { data.branches[1].actions[0].effort = 0; },
    data => { data.branches[1].actions[0].atHour = 1; },
  ]) {
    const data = structuredClone(native);
    corrupt(data);
    assert.throws(() => readIncentiveComparisons(data));
  }
});

test('the bounded fixture rejects invented valuations, arbitrary state injection and unsupported controls', () => {
  for (const options of [null, [], { xpFinality: null }, { xpFinality: 'never' }, { facyPrice: 1 }, { networkValue: 100 }, { graph: {} }, { guaranteeFee: 1 }, { seed: 'invented' }]) {
    assert.throws(() => runIncentiveForks(options));
  }
  assert.throws(() => INCENTIVE_STRATEGIES.push('invented'), TypeError);
});

test('the standalone example emits one replayable JSON artifact and no diagnostic stdout', () => {
  const result = spawnSync(process.execPath, ['examples/incentives.mjs'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), runIncentiveForks());
});
