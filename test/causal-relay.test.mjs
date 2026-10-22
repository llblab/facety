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
