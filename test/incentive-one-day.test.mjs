import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runOneDayIncentiveForks, runIncentiveForks, readIncentiveComparisons, INCENTIVE_STRATEGIES } from '../src/incentives.mjs';
import { evaluateIncentivePayoffs } from '../src/incentive-payoffs.mjs';
import { compareIncentiveOwnership } from '../src/incentive-ownership.mjs';
import { FacetyModel, DEFAULT_POLICY } from '../src/model.mjs';
import { provenance } from '../src/provenance.mjs';
import { EffortLedger } from '../src/effort.mjs';

const point = (branch, stage) => branch.timeline.find(row => row.stage === stage);
const subject = (snapshot, id = 'sponsor') => snapshot.subjects.find(row => row.id === id);
const preferences = overrides => ({
  facyValue: 1, xpValue: 0, workUnitCost: 1, admissionBenefit: 0, guaranteeBenefit: 0,
  expectedLosses: { 'invite-only': 0, 'invite-and-guarantee': 0 }, ...overrides,
});

function reaccount(branch) {
  const ledgers = new Map(Object.keys(branch.work.bySubject).map(id => [id, new EffortLedger({ weights: branch.work.weights })]));
  for (const action of branch.actions) {
    const ledger = ledgers.get(action.actor);
    const ticket = ledger.begin('honest', action.action, action.phase);
    assert.ok(ticket);
    ledger.finish(ticket, true);
    action.effort = ticket.cost;
  }
  branch.work.bySubject = Object.fromEntries([...ledgers].map(([id, ledger]) => [id, ledger.audit().cohorts.honest]));
}

test('one-day v2 is a separate reproducible fixed reference with source identity and both XP modes', () => {
  for (const xpFinality of ['terminal', 'immediate']) {
    const source = runOneDayIncentiveForks({ xpFinality });
    assert.deepEqual(source, runOneDayIncentiveForks({ xpFinality }));
    assert.deepEqual(JSON.parse(JSON.stringify(source)), source);
    assert.equal(source.schema, 'facety-incentive-forks/v2');
    assert.equal(source.fixture, 'marginal-admission-24h-v1');
    assert.deepEqual(source.policy, { ...DEFAULT_POLICY, xpFinality });
    assert.deepEqual(source.schedule, { decisionHour: 24, admissionHour: 48, newcomerSelfIdHour: 48, horizonHour: 72 });
    assert.deepEqual(source.provenance, provenance());
    assert.deepEqual(source.branches.map(branch => branch.strategy), INCENTIVE_STRATEGIES);
    assert.deepEqual(readIncentiveComparisons(source), source.comparisons);
    for (const branch of source.branches) {
      assert.deepEqual(branch.timeline[0], source.branches[0].timeline[0]);
      assert.deepEqual(branch.timeline.map(row => row.atHour), [0, 24, 48, 48, 72]);
      assert.equal(branch.timeline.at(-1).eventCursor, branch.events.length);
      assert.ok(branch.timeline.every(row => !row.subjects.some(person => Object.hasOwn(person, 'genuine') || Object.hasOwn(person, 'operator'))));
    }
  }
  assert.equal(runIncentiveForks().schema, 'facety-incentive-forks/v1');
  assert.equal(runIncentiveForks().schedule.horizonDay, 11);
  for (const options of [null, [], { xpFinality: null }, { xpFinality: 'never' }, { schedule: {} }, { policy: DEFAULT_POLICY }, { seed: 'x' }, { guaranteeFee: 0 }, { expectedLosses: {} }]) {
    assert.throws(() => runOneDayIncentiveForks(options));
  }
});

test('funded native spend/conversion and invitation-freeze boundaries are earliest feasible, not starting balances', () => {
  const model = new FacetyModel({ genesis: ['sponsor', 'peer'] });
  assert.equal(model.audit().collector, 0);
  const relation = model.proposeGuarantee('peer', 'sponsor');
  model.confirmGuarantee('sponsor', relation);
  const peer = model.createSelfId('peer', model.registerArtifact('peer'));
  const sponsor = model.createSelfId('sponsor', model.registerArtifact('sponsor'));
  model.advanceTo(23);
  assert.throws(() => model.createInvitation('sponsor', sponsor, 'newcomer'), /mature/);
  assert.throws(() => model.convertToCollector('peer', peer), /mature/);
  model.advanceTo(24);
  model.convertToCollector('peer', peer);
  const invitation = model.createInvitation('sponsor', sponsor, 'newcomer');
  assert.equal(model.subject('sponsor').liquidFacy, 0);
  assert.equal(model.audit().burned, 1);
  assert.throws(() => model.acceptInvitation(invitation, 'newcomer'), /frozen/);
  model.advanceTo(47);
  assert.throws(() => model.acceptInvitation(invitation, 'newcomer'), /frozen/);
  model.advanceTo(48);
  model.acceptInvitation(invitation, 'newcomer');
  const newborn = model.createSelfId('newcomer', model.registerArtifact('newcomer'));
  model.advanceTo(71);
  assert.throws(() => model.convertToCollector('newcomer', newborn), /mature/);
  model.advanceTo(72);
  model.convertToCollector('newcomer', newborn);
  assert.equal(model.subject('newcomer').liquidFacy, 1);
  assert.equal(model.audit().emitterVault, 0);
});

test('hour-48 snapshots distinguish frozen funding, admission and recording-time guarantors without an own-XP premium', () => {
  for (const xpFinality of ['terminal', 'immediate']) {
    const source = runOneDayIncentiveForks({ xpFinality });
    for (const branch of source.branches) {
      const invited = branch.strategy !== 'wait-collector';
      const decision = point(branch, 'decision');
      const admission = point(branch, 'admission');
      const work = point(branch, 'newcomer-work');
      const last = branch.timeline.at(-1);
      assert.equal(subject(decision).xp, 1);
      assert.equal(subject(branch.timeline[0]).xp, xpFinality === 'terminal' ? 0 : 1);
      assert.equal(decision.subjects.length, 2);
      assert.equal(decision.selfIds.length, 2);
      assert.equal(decision.invitations.length, Number(invited));
      assert.equal(admission.selfIds.length, 2);
      assert.equal(admission.subjects.length, 2 + Number(invited));
      assert.equal(work.selfIds.length, 2 + Number(invited));
      if (invited) {
        assert.equal(decision.invitations[0].status, 'open');
        assert.equal(decision.invitations[0].acceptedAt, null);
        assert.equal(admission.invitations[0].acceptedAt, 48);
        assert.ok(admission.eventCursor < work.eventCursor);
        const act = work.selfIds.find(row => row.subject === 'newcomer');
        const guarantors = branch.strategy === 'invite-and-guarantee' ? ['sponsor'] : [];
        assert.deepEqual(act.guarantors, guarantors);
        assert.deepEqual(act.xpRecipients, ['newcomer', ...guarantors]);
        assert.equal(act.recordedAt, 48);
        assert.equal(act.status, 'unspent');
        assert.equal(act.xpCredited, xpFinality === 'immediate');
        assert.equal(last.selfIds.find(row => row.id === act.id).status, 'converted');
        assert.equal(subject(last, 'newcomer').liquidFacy, 1);
        assert.equal(subject(last).liquidFacy, 0);
      } else {
        assert.equal(admission.eventCursor, work.eventCursor);
        assert.equal(subject(last).liquidFacy, 1);
        assert.equal(branch.work.bySubject.newcomer, undefined);
        assert.ok(branch.actions.every(action => action.atHour === 0 || action.atHour === 24));
      }
      for (const state of branch.timeline) {
        assert.equal(state.ledger.minted, state.selfIds.length);
        assert.equal(state.ledger.emitterVault, state.selfIds.filter(act => act.status === 'unspent').length);
        assert.equal(state.ledger.collector, state.subjects.reduce((total, person) => total + person.liquidFacy, 0));
        assert.equal(state.ledger.supply, state.ledger.minted - state.ledger.burned);
        assert.equal(state.ledger.supply, state.ledger.collector + state.ledger.emitterVault + state.ledger.feeVault);
      }
    }
  }
});

test('one-day reader rejects cross-labels, incomplete temporal evidence and inconsistent accounting', () => {
  const native = runOneDayIncentiveForks();
  const changes = [
    data => { data.schema = 'facety-incentive-forks/v1'; },
    data => { data.fixture = 'marginal-admission-v1'; },
    data => { data.policy.invitationFreezeHours = 0; },
    data => { data.policy.linkBreakXp = 'keep'; },
    data => { data.schedule.horizonHour = 71; },
    data => { data.randomness = 'invented'; },
    data => { delete data.provenance; },
    data => { data.provenance.implementation.digest = 'not-a-digest'; },
    data => { data.provenance.implementation.files = 0; },
    data => { data.provenance.runtime.node = 'invented'; },
    data => { data.branches.pop(); },
    data => { data.branches[1].strategy = data.branches[0].strategy; },
    data => { delete data.branches[1].events; },
    data => { data.branches[1].events.reverse(); },
    data => { data.branches[1].events.push({ at: 72, type: 'invented' }); },
    data => { data.branches[1].timeline[1].invitations[0].acceptedAt = 24; },
    data => { data.branches[1].timeline[2].invitations = []; },
    data => { data.branches[1].timeline[2].eventCursor = data.branches[1].timeline[3].eventCursor; },
    data => { delete data.branches[1].timeline[2].eventCursor; },
    data => { [data.branches[1].timeline[2], data.branches[1].timeline[3]] = [data.branches[1].timeline[3], data.branches[1].timeline[2]]; },
    data => { data.branches[1].timeline.splice(2, 1); },
    data => { data.branches[1].timeline.at(-1).atHour = 48; },
    data => { data.branches[1].timeline.at(-1).ledger.collector++; },
    data => { data.branches[1].timeline.at(-1).subjects[0].xp++; },
    data => { data.branches[2].timeline[3].selfIds.find(act => act.subject === 'newcomer').guarantors = []; },
    data => { data.branches[2].timeline[2].subjects.push(structuredClone(data.branches[2].timeline[2].subjects[0])); },
  ];
  for (const change of changes) {
    const data = structuredClone(native);
    change(data);
    assert.throws(() => readIncentiveComparisons(data), undefined, change.toString());
  }
  const old = runIncentiveForks();
  old.schema = native.schema;
  old.fixture = native.fixture;
  assert.throws(() => readIncentiveComparisons(old));
});

test('reaccounting cannot disguise newcomer work before birth, wrong recruitment or invented waiting work', () => {
  for (const change of [
    branch => { branch.actions.find(row => row.actor === 'newcomer').atHour = 24; branch.actions.sort((a, b) => a.atHour - b.atHour); },
    branch => { branch.actions.find(row => row.action === 'recruitHuman').actor = 'peer'; },
    branch => { branch.actions = branch.actions.filter(row => row.action !== 'recruitHuman'); },
  ]) {
    const data = runOneDayIncentiveForks();
    change(data.branches[1]);
    reaccount(data.branches[1]);
    assert.throws(() => readIncentiveComparisons(data));
  }
  const data = runOneDayIncentiveForks();
  data.branches[0].actions.push({ ...data.branches[0].actions.at(-1), atHour: 48, action: 'recruitHuman' });
  reaccount(data.branches[0]);
  assert.throws(() => readIncentiveComparisons(data), /work script/);
});

test('pure one-day consumers preserve supplied provenance, JSON transport, unknowns and evaluator boundaries', () => {
  const source = JSON.parse(JSON.stringify(runOneDayIncentiveForks()));
  source.provenance.implementation.digest = 'f'.repeat(64);
  source.branches.reverse();
  source.comparisons = [{ sponsor: { xp: 999, liquidFacy: 999 } }];
  const before = JSON.stringify(source);
  const original = FacetyModel.prototype.createSelfId;
  try {
    FacetyModel.prototype.createSelfId = () => { throw new Error('offline analysis must not run a model'); };
    const zero = evaluateIncentivePayoffs(source, preferences({ facyValue: 0, workUnitCost: 0 }));
    assert.deepEqual(zero.comparisons.map(row => row.conditionalTerminalDifference), [0, 0]);
    assert.deepEqual(zero.choiceSummary.exactNumericalMaximizers, INCENTIVE_STRATEGIES);
    const unknown = evaluateIncentivePayoffs(source, preferences({ expectedLosses: { 'invite-only': null, 'invite-and-guarantee': null } }));
    assert.deepEqual(unknown.comparisons.map(row => row.conditionalTerminalDifference), [null, null]);
    assert.equal(unknown.choiceSummary.status, 'partial');
    const facts = readIncentiveComparisons(source);
    const guaranteed = facts.find(row => row.treatment === 'invite-and-guarantee').sponsor;
    assert.ok(guaranteed.xp > 0);
    const threshold = (-guaranteed.liquidFacy + guaranteed.effort) / guaranteed.xp;
    for (const xpValue of [threshold - 1, threshold, threshold + 1]) {
      const comparison = evaluateIncentivePayoffs(source, preferences({ xpValue })).comparisons[1];
      assert.equal(comparison.conditionalTerminalDifference, guaranteed.liquidFacy + guaranteed.xp * xpValue - guaranteed.effort);
      assert.equal(comparison.xpBreakEven.value, threshold);
    }
    const ownership = compareIncentiveOwnership(source);
    for (const analysis of [zero, unknown, ownership]) {
      assert.deepEqual(analysis.source.provenance, source.provenance);
      assert.notEqual(analysis.source.provenance, source.provenance);
      assert.equal(analysis.source.schema, source.schema);
      assert.equal(analysis.source.fixture, source.fixture);
      assert.deepEqual(analysis.source.schedule, source.schedule);
      assert.equal(analysis.fullDynamicUtility, null);
      assert.equal(analysis.networkExternality, null);
    }
    for (const world of ownership.worlds) {
      for (const branch of world.branches) {
        const state = ownership.protocolBranches.find(row => row.strategy === branch.strategy).timeline.at(-1);
        assert.equal(branch.operators.reduce((total, row) => total + row.liquidFacy, 0), state.ledger.collector);
        assert.deepEqual(Object.assign({}, ...branch.operators.map(row => row.xpBySubject)), Object.fromEntries(state.subjects.map(row => [row.id, row.xp])));
        for (const operator of branch.operators) {
          assert.equal(Object.hasOwn(operator, 'xp'), false);
          assert.equal(operator.work.effortMicroUnits, branch.workActions.filter(row => row.operator === operator.id).reduce((total, row) => total + Math.round(row.effort * 1e6), 0));
        }
      }
    }
    assert.equal(JSON.stringify(source), before);
  } finally { FacetyModel.prototype.createSelfId = original; }
});

test('one-day evidence requirements do not leak into optional legacy event logs or legacy consumer shapes', () => {
  const source = runIncentiveForks();
  const expectedPayoffs = evaluateIncentivePayoffs(source, preferences());
  const expectedOwnership = compareIncentiveOwnership(source);
  source.provenance = provenance();
  for (const branch of source.branches) delete branch.events;
  assert.deepEqual(evaluateIncentivePayoffs(source, preferences()), expectedPayoffs);
  const ownership = compareIncentiveOwnership(source);
  assert.deepEqual(ownership.source, expectedOwnership.source);
  assert.deepEqual(ownership.worlds, expectedOwnership.worlds);
  assert.ok(ownership.protocolBranches.every(branch => branch.events === null));
  assert.equal(Object.hasOwn(ownership.source, 'provenance'), false);
});

test('the separate one-day example emits only one v2 JSON artifact', () => {
  const result = spawnSync(process.execPath, ['examples/incentive-one-day.mjs'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), runOneDayIncentiveForks());
});
