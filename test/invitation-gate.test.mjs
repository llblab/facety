import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';
import { runExperiment, DEFAULT_ACTIVITY } from '../src/experiment.mjs';

// These controls exercise legacy active-accepted support, not verified independent people or D35 paths.
function guarantee(model, from, to) {
  const relation = model.proposeGuarantee(from, to);
  model.confirmGuarantee(to, relation);
  return relation;
}
function identify(model, id) {
  return model.createSelfId(id, model.registerArtifact(id));
}
function funded(size, supporters = 0, active = size) {
  const ids = Array.from({ length: size }, (_, i) => 's' + i);
  const model = new FacetyModel({ genesis: ids });
  const relations = ids.slice(1, supporters + 1).map(id => guarantee(model, id, ids[0]));
  const acts = Array(active);
  for (let i = active - 1; i >= 0; i--) acts[i] = identify(model, ids[i]);
  return { model, ids, relations, acts };
}
function state(model) {
  return {
    now: model.now, subjects: model.subjects(), acts: model.selfIds(), invitations: model.invitations(),
    relations: model.guaranteeRelations(), events: model.events(), ledger: model.audit(),
    lineage: model.lineage.toJSON(), guarantees: model.guarantees.toJSON(),
  };
}
function blocked(model, act) {
  const before = state(model);
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.throws(() => model.createInvitation('s0', act, 'new'), /insufficient eligible guarantors/);
    assert.deepEqual(state(model), before, 'rejection cannot burn, credit XP, record an invitation or change a graph');
  }
}

test('default invitation gate rejects D-1 and admits D at the 9/10 and 99/100 boundaries atomically', () => {
  for (const [size, difficulty] of [[2, 1], [9, 1], [10, 2], [99, 2], [100, 3]]) {
    const actual = funded(size, difficulty - 1);
    const control = funded(size, difficulty - 1);
    for (const { model } of [actual, control]) {
      model.advanceTo(DAY);
      assert.equal(model.activeCount(), size);
      assert.equal(model.requiredGuarantors(), difficulty);
      assert.equal(model.eligibleGuarantors('s0').length, difficulty - 1);
    }
    blocked(actual.model, actual.acts[0]);
    for (const { model, ids } of [actual, control]) guarantee(model, ids[difficulty], 's0');
    const invitation = actual.model.createInvitation('s0', actual.acts[0], 'new');
    assert.equal(invitation, control.model.createInvitation('s0', control.acts[0], 'new'), 'rejected attempts cannot consume IDs');
    assert.deepEqual(state(actual.model), state(control.model), 'later funded behavior matches a prefix without rejected attempts');
    assert.equal(actual.model.audit().burned, 1);
    assert.equal(actual.model.selfId(actual.acts[0]).status, 'consumed');
    assert.equal(actual.model.subject('s0').xp, 1);
    assert.equal(actual.model.lineage.edge('s0', 'new'), undefined, 'creation is not acceptance');
  }
});

test('invitation support means confirmed incoming distinct guarantors, not proposals, outgoing links, XP or money', () => {
  const { model, ids, acts } = funded(10, 1);
  const proposal = model.proposeGuarantee('s2', 's0');
  for (const id of ids.slice(2)) guarantee(model, 's0', id);
  assert.throws(() => model.proposeGuarantee('s1', 's0'), /invalid or duplicate guarantee/);
  let right = acts[0];
  for (const at of [DAY, 2 * DAY]) {
    model.advanceTo(at);
    model.convertToCollector('s0', right);
    right = identify(model, 's0');
  }
  model.advanceTo(3 * DAY);
  assert.equal(model.subject('s0').xp, 2);
  assert.equal(model.subject('s0').liquidFacy, 2);
  assert.deepEqual(model.eligibleGuarantors('s0'), ['s1']);
  blocked(model, right);
  model.confirmGuarantee('s0', proposal);
  assert.deepEqual(model.eligibleGuarantors('s0'), ['s1', 's2']);
  model.createInvitation('s0', right, 'new');
  // Extra support is allowed; D is a minimum, not an exact-degree restriction.
  guarantee(model, 's3', 's0');
  const next = identify(model, 's0');
  model.advanceTo(4 * DAY);
  assert.equal(model.eligibleGuarantors('s0').length, 3);
  model.createInvitation('s0', next, 'another');
  assert.equal(model.invitations().length, 2);
  assert.equal(model.subject('s0').liquidFacy, 2);
});

test('an emission recorded below a decade boundary cannot grandfather invitation support after difficulty rises', () => {
  const { model, acts } = funded(10, 1, 9);
  assert.equal(model.requiredGuarantors(), 1);
  assert.deepEqual(model.selfId(acts[0]).guarantors, ['s1']);
  model.advanceTo(DAY);
  identify(model, 's9');
  assert.equal(model.activeCount(), 10);
  assert.equal(model.requiredGuarantors(), 2);
  blocked(model, acts[0]);
  guarantee(model, 's2', 's0');
  model.createInvitation('s0', acts[0], 'new');
  assert.equal(model.invitations().length, 1);
});

test('ended, invalidated and exactly expired guarantors cannot authorize a later invitation from an existing right', () => {
  for (const loss of ['ended', 'invalidated', 'expired']) {
    const { model, ids, relations, acts } = funded(11, 2);
    model.advanceTo(DAY);
    if (loss === 'ended') model.convertToCollector('s2', acts[2]);
    model.advanceTo(27 * DAY);
    let right;
    for (const id of ids) {
      if (loss === 'expired' && id === 's2') continue;
      const act = identify(model, id);
      if (id === 's0') right = act;
    }
    assert.deepEqual(model.selfId(right).guarantors, ['s1', 's2']);
    model.advanceTo(28 * DAY);
    if (loss === 'ended') model.endGuarantee('s2', relations[1]);
    if (loss === 'invalidated') model.invalidateIdentity('s2');
    assert.equal(model.activeCount(), loss === 'ended' ? 11 : 10);
    assert.equal(model.requiredGuarantors(), 2);
    assert.deepEqual(model.eligibleGuarantors('s0'), ['s1']);
    blocked(model, right);
    guarantee(model, 's3', 's0');
    model.createInvitation('s0', right, 'new');
    assert.equal(model.audit().burned, 1);
  }
});

test('the ordinary scheduler cannot grow an unsupported network but can grow with sufficient active incoming support', () => {
  const quiet = Object.fromEntries(Object.keys(DEFAULT_ACTIVITY.honest).map(key => [key, 0]));
  const options = {
    scenario: 'honest-growth', seed: 'invitation-gate-regression', initialSize: 10, days: 4,
    includeState: true, activity: { honest: { ...quiet, selfId: 1, invite: 1 } },
  };
  const unsupported = runExperiment({ ...options, initialTopology: 'none' });
  const supported = runExperiment({ ...options, initialTopology: 'clique' });
  assert.equal(unsupported.config.ablations.fixedInvitationThreshold, null);
  assert.equal(unsupported.config.policy.guarantorEligibility, 'active');
  assert.equal(unsupported.outcome.censored, false);
  assert.equal(unsupported.population.finalSubjects, 10);
  assert.equal(unsupported.state.lineage.edges.length, 0);
  assert.equal(unsupported.metrics.ledger.burned, 0);
  assert.equal(unsupported.effort.cohorts.honest.byAction.invite.accepted, 0);
  assert.ok(unsupported.effort.cohorts.honest.byAction.invite.rejected > 0);
  assert.ok(unsupported.state.selfIds.every(act => act.status === 'unspent'));
  assert.equal(supported.outcome.censored, false);
  assert.ok(supported.population.finalSubjects > 10);
  assert.ok(supported.state.lineage.edges.length > 0);
  assert.ok(supported.effort.cohorts.honest.byAction.invite.accepted > 0);
  assert.ok(supported.metrics.ledger.burned > 0);
});
