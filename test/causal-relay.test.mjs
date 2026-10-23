import test from 'node:test';
import assert from 'node:assert/strict';
import { runRelayArm, runRelayComparison, RELAY_CONTEXTS, RELAY_ARMS } from '../examples/causal-relay.mjs';

test('routing controls match opportunity sets/budgets/draws, retaining a null blocked path and member placebo', () => {
  for (const context of RELAY_CONTEXTS) for (let i = 0; i < 12; i++) {
    const runs = RELAY_ARMS.map(arm => runRelayArm('relay-control-' + i, context, arm));
    const [member, absent, relay] = runs;
    for (const run of runs) {
      assert.equal(run.budget, 10);
      assert.equal(run.relay.actors.reduce((sum, actor) => sum + actor.budget, 0), 10);
      assert.deepEqual(run.opportunities, member.opportunities);
      assert.deepEqual(run.window, member.window);
      assert.deepEqual(run.evaluation, member.evaluation);
      assert.equal(run.metrics.genuineRetained + run.metrics.wrongfulInvalidations, run.metrics.genuineDenominator);
      assert.ok(run.metrics.work <= run.budget);
      assert.equal(run.protocol.ledger.supply, run.protocol.ledger.collector + run.protocol.ledger.emitterVault + run.protocol.ledger.feeVault + run.protocol.ledger.stakeVault);
    }
    assert.deepEqual(relay.protocol, member.protocol, 'membership alone cannot change the common quality/resource pathway');
    assert.deepEqual(relay.metrics, member.metrics);
    assert.equal(absent.relay.cases.length, 0);
    assert.ok(absent.stageClocks.every(row => row.formalAccess === null && row.verdict === null && row.discoveryToVerdict === null));
  }
});

test('tracing, saturation and inert inspections do not consume environmental randomness or alter reference semantics', () => {
  for (const context of RELAY_CONTEXTS) for (const arm of RELAY_ARMS) {
    const without = runRelayArm('relay-noninterference', context, arm);
    const withReads = runRelayArm('relay-noninterference', context, arm, { traceLimit: 1, inertInspection: true });
    const { trace: a, ...left } = without;
    const { trace: b, ...right } = withReads;
    assert.deepEqual(left, right);
  }
});

test('service priority is a complete two-target permutation and the canonical option preserves defaults', () => {
  for (const value of [null, {}, 'Mira', [], ['Mira'], ['Mira', 'Mira'], ['Mira', 'Bela'], ['Mira', 'Aster', 'Bela'], [, 'Aster']]) {
    assert.throws(() => runRelayArm('order-validation-control', RELAY_CONTEXTS[0], 'member', { processingOrder: value }), /processingOrder/);
  }
  for (const context of RELAY_CONTEXTS) for (const arm of RELAY_ARMS) {
    assert.deepEqual(runRelayArm('order-default-control', context, arm, { processingOrder: ['Mira', 'Aster'] }), runRelayArm('order-default-control', context, arm));
  }
});

test('service-order intervention fixes discovery, input draws, budgets and canonical settlement; matched arms remain placebos', () => {
  for (const context of RELAY_CONTEXTS) for (let i = 0; i < 16; i++) {
    const seed = 'order-matching-control-' + i;
    const canonical = RELAY_ARMS.map(arm => runRelayArm(seed, context, arm, { traceLimit: 64 }));
    const reversed = RELAY_ARMS.map(arm => runRelayArm(seed, context, arm, { processingOrder: ['Aster', 'Mira'], traceLimit: 64 }));
    for (let j = 0; j < RELAY_ARMS.length; j++) {
      const before = canonical[j];
      const after = reversed[j];
      assert.deepEqual(after.evaluation, before.evaluation);
      assert.deepEqual(after.relay.observations, before.relay.observations);
      assert.deepEqual(after.relay.packages.map(({ routes, status, ...base }) => base), before.relay.packages.map(({ routes, status, ...base }) => base));
      assert.deepEqual(after.relay.actors.map(({ budget, reviewCapacity }) => ({ budget, reviewCapacity })), before.relay.actors.map(({ budget, reviewCapacity }) => ({ budget, reviewCapacity })));
      assert.deepEqual(after.opportunities, before.opportunities);
      assert.deepEqual(after.window, before.window);
      assert.equal(after.trace.omitted, 0);
      const settled = after.trace.records.filter(row => row.action === 'adjudicate-and-enforce').map(row => row.target);
      assert.deepEqual(settled, ['Mira', 'Aster'].filter(target => after.relay.cases.some(row => row.subject === target)));
      const reviewed = after.trace.records.filter(row => row.action === 'review').map(row => row.target);
      assert.deepEqual(reviewed, j === 1 ? [] : ['Aster', 'Mira'].filter(target => after.relay.packages.some(row => row.subject === target)));
    }
    assert.deepEqual(reversed[0].protocol, reversed[2].protocol);
    assert.deepEqual(reversed[0].metrics, reversed[2].metrics);
    assert.equal(reversed[1].relay.cases.length, 0);
  }
});

test('a single packaged target and reversed-order inert/saturated reads have no semantic effect', () => {
  let singlePackages = 0;
  for (let i = 0; i < 16; i++) {
    const seed = 'order-single-control-' + i;
    const canonical = runRelayArm(seed, RELAY_CONTEXTS[1], 'external-relay', { traceLimit: 64 });
    if (canonical.relay.packages.length !== 1) continue;
    assert.deepEqual(runRelayArm(seed, RELAY_CONTEXTS[1], 'external-relay', { processingOrder: ['Aster', 'Mira'], traceLimit: 64 }), canonical);
    singlePackages++;
  }
  assert.ok(singlePackages > 0, 'the fixed control set includes a one-package opportunity');
  for (const context of RELAY_CONTEXTS) for (const arm of RELAY_ARMS) {
    const { trace: a, ...without } = runRelayArm('order-inert-control', context, arm, { processingOrder: ['Aster', 'Mira'] });
    const { trace: b, ...withReads } = runRelayArm('order-inert-control', context, arm, { processingOrder: ['Aster', 'Mira'], traceLimit: 1, inertInspection: true });
    assert.deepEqual(withReads, without);
    assert.ok(b.omitted > 0);
  }
});

test('exploration replays and bootstrap intervals preserve paired nulls without assigning mechanisms', () => {
  const options = { seeds: ['comparison-a', 'comparison-b'] };
  const first = runRelayComparison(options);
  assert.deepEqual(runRelayComparison(options), first);
  assert.equal(first.runs.length, 18);
  for (const contrast of first.contrasts.filter(row => row.contrast.endsWith('member'))) {
    for (const effect of Object.values(contrast.effects)) {
      assert.equal(effect.mean, 0);
      assert.equal(effect.interval.lower, 0);
      assert.equal(effect.interval.upper, 0);
    }
  }
});
