import test from 'node:test';
import assert from 'node:assert/strict';
import { runRelayArm, RELAY_ARMS, RELAY_CONTEXTS } from '../examples/causal-relay.mjs';
import { analyzeRuns, ORDERS } from '../studies/2026-10-24-service-order/run.mjs';

const seeds = ['order-analysis-unit-00'];
const controlRuns = () => RELAY_CONTEXTS.flatMap(context => seeds.flatMap(seed => ORDERS.flatMap(order => RELAY_ARMS.map(arm => ({
  order: order.id, processingOrder: [...order.processingOrder], ...runRelayArm(seed, context, arm, { processingOrder: order.processingOrder, traceLimit: 64 }),
})))));

test('service-order analysis uses complete paired unit worlds and preserves zero/negative effects without confirmation claims', () => {
  const result = analyzeRuns(controlRuns(), seeds);
  assert.equal(result.runs, 18);
  assert.equal(result.pairedWorldContexts, 3);
  assert.equal(result.contrasts.length, 9);
  assert.ok(Object.values(result.controls).every(value => value === true));
  for (const row of result.contrasts) for (const effect of Object.values(row.effects)) {
    assert.equal(effect.positive + effect.negative + effect.zero, 1);
    assert.equal(effect.descriptiveMean95.resamples, 2000);
    assert.equal(effect.descriptiveMean95.lower, effect.mean);
    assert.equal(effect.descriptiveMean95.upper, effect.mean);
  }
});

test('service-order analysis rejects incomplete/duplicate pairs, unknown labels, unknown metrics and lost refusal evidence', () => {
  const runs = controlRuns();
  assert.throws(() => analyzeRuns(runs.slice(1), seeds), /complete declared cohort/);
  assert.throws(() => analyzeRuns([...runs.slice(0, -1), runs[0]], seeds), /unique paired input/);
  const wrongSeed = structuredClone(runs);
  wrongSeed[0].seed = 'unregistered-unit-label';
  assert.throws(() => analyzeRuns(wrongSeed, seeds));
  const unknown = structuredClone(runs);
  unknown[0].metrics.corrected = NaN;
  assert.throws(() => analyzeRuns(unknown, seeds), /known metric/);
  const dropped = structuredClone(runs);
  dropped[0].trace.omitted = 1;
  assert.throws(() => analyzeRuns(dropped, seeds), /refusal evidence/);
});
