import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { runRelayArm, RELAY_ARMS, RELAY_CONTEXTS, RELAY_INPUTS, RELAY_RANDOMNESS } from '../../examples/causal-relay.mjs';
import { provenance } from '../../src/provenance.mjs';
import { bootstrapMeanInterval } from '../../src/statistics.mjs';

export const SEEDS = Object.freeze(Array.from({ length: 24 }, (_, i) => 'd39-order-explore-' + String(i).padStart(2, '0')));
export const ORDERS = Object.freeze([
  Object.freeze({ id: 'mira-first', processingOrder: Object.freeze(['Mira', 'Aster']) }),
  Object.freeze({ id: 'aster-first', processingOrder: Object.freeze(['Aster', 'Mira']) }),
]);
const METRICS = Object.freeze(['violationOpportunities', 'corrected', 'missedViolations', 'wrongfulInvalidations', 'genuineRetained',
  'genuineDenominator', 'genuineXpLost', 'genuineCollectedPenalties', 'unresolvedPackages', 'pendingCases', 'work', 'denied', 'burned', 'debtAdded']);
const key = (context, seed, arm, order) => JSON.stringify([context, seed, arm, order]);
const packageInputs = run => run.relay.packages.map(({ routes, status, ...input }) => input);

export function analyzeRuns(runs, seeds = SEEDS) {
  assert.ok(seeds.length > 0 && new Set(seeds).size === seeds.length);
  const expected = RELAY_CONTEXTS.length * seeds.length * RELAY_ARMS.length * ORDERS.length;
  assert.equal(runs.length, expected, 'complete declared cohort');
  const indexed = new Map();
  for (const run of runs) {
    assert.ok(RELAY_CONTEXTS.some(context => context.id === run.context) && seeds.includes(run.seed) && RELAY_ARMS.includes(run.arm));
    const order = ORDERS.find(order => order.id === run.order);
    assert.ok(order);
    assert.deepEqual(run.processingOrder, order.processingOrder);
    const id = key(run.context, run.seed, run.arm, run.order);
    assert.ok(!indexed.has(id), 'unique paired input');
    indexed.set(id, run);
    assert.equal(run.trace.limit, 64);
    assert.equal(run.trace.omitted, 0, 'refusal evidence must be retained');
    assert.equal(run.budget, 10);
    assert.equal(run.relay.actors.reduce((sum, actor) => sum + actor.budget, 0), 10);
    assert.equal(run.relay.actors.find(actor => actor.id === 'Bela').reviewCapacity, RELAY_CONTEXTS.find(context => context.id === run.context).reviewCapacity);
    assert.ok(run.metrics.work <= 10);
    assert.deepEqual(run.opportunities, ['Mira', 'Aster']);
    assert.deepEqual(run.window, [72, 96]);
    assert.equal(run.protocol.atHour, 96);
    for (const metric of METRICS) assert.ok(Number.isFinite(run.metrics[metric]), 'known metric: ' + metric);
    assert.equal(run.metrics.corrected + run.metrics.missedViolations, run.metrics.violationOpportunities);
    assert.equal(run.metrics.genuineRetained + run.metrics.wrongfulInvalidations, run.metrics.genuineDenominator);
    const settled = run.trace.records.filter(row => row.action === 'adjudicate-and-enforce').map(row => row.target);
    assert.deepEqual(settled, ['Mira', 'Aster'].filter(target => run.relay.cases.some(row => row.subject === target)));
    const reviewed = run.trace.records.filter(row => row.action === 'review').map(row => row.target);
    assert.deepEqual(reviewed, run.arm === 'external-unrouted' ? [] : order.processingOrder.filter(target => run.relay.packages.some(row => row.subject === target)));
    if (run.arm === 'external-unrouted') {
      assert.equal(run.relay.cases.length, 0);
      assert.ok(run.stageClocks.every(row => row.formalAccess === null && row.verdict === null && row.discoveryToVerdict === null));
    }
  }
  const get = (context, seed, arm, order) => {
    const run = indexed.get(key(context, seed, arm, order));
    assert.ok(run, 'missing declared context/seed/arm/order');
    return run;
  };
  for (const context of RELAY_CONTEXTS) for (const seed of seeds) {
    const reference = get(context.id, seed, 'member', 'mira-first');
    for (const order of ORDERS) {
      const member = get(context.id, seed, 'member', order.id);
      const relay = get(context.id, seed, 'external-relay', order.id);
      assert.deepEqual(member.protocol, relay.protocol, 'matched member/relay placebo');
      assert.deepEqual(member.metrics, relay.metrics);
      for (const arm of RELAY_ARMS) {
        const run = get(context.id, seed, arm, order.id);
        const canonical = get(context.id, seed, arm, 'mira-first');
        assert.deepEqual(run.evaluation, reference.evaluation, 'common latent inputs across arms/orders');
        assert.deepEqual(run.relay.observations, canonical.relay.observations, 'unchanged discovery');
        assert.deepEqual(packageInputs(run), packageInputs(canonical));
        assert.deepEqual(run.relay.actors.map(({ budget, reviewCapacity }) => ({ budget, reviewCapacity })), canonical.relay.actors.map(({ budget, reviewCapacity }) => ({ budget, reviewCapacity })));
      }
    }
  }
  const contrasts = RELAY_CONTEXTS.flatMap(context => RELAY_ARMS.map(arm => {
    const paired = seeds.map(seed => {
      const a = get(context.id, seed, arm, 'mira-first');
      const b = get(context.id, seed, arm, 'aster-first');
      return { seed, delta: Object.fromEntries(METRICS.map(metric => [metric, b.metrics[metric] - a.metrics[metric]])) };
    });
    const totals = Object.fromEntries(ORDERS.map(order => [order.id, Object.fromEntries(METRICS.map(metric => [metric,
      seeds.reduce((sum, seed) => sum + get(context.id, seed, arm, order.id).metrics[metric], 0)]))]));
    const effects = Object.fromEntries(METRICS.map(metric => {
      const values = paired.map(row => row.delta[metric]);
      return [metric, { mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        positive: values.filter(value => value > 0).length, negative: values.filter(value => value < 0).length,
        zero: values.filter(value => value === 0).length,
        descriptiveMean95: bootstrapMeanInterval(values, { seed: JSON.stringify(['d39-order-descriptive', context.id, arm, metric]), resamples: 2000 }) }];
    }));
    const refusals = Object.fromEntries(ORDERS.map(order => {
      const counts = {};
      for (const seed of seeds) for (const row of get(context.id, seed, arm, order.id).trace.records) if (!row.outcome.ok) {
        const reason = row.action + ':' + row.outcome.reason;
        counts[reason] = (counts[reason] ?? 0) + 1;
      }
      return [order.id, counts];
    }));
    return { context: context.id, arm, n: seeds.length, contrast: 'aster-first minus mira-first', totals, effects, refusals, paired };
  }));
  return { schema: 'facety-service-order-analysis/v1', runs: expected, pairedWorldContexts: RELAY_CONTEXTS.length * seeds.length,
    controls: { completeUniquePairs: true, fixedDiscoveryAndSettlement: true, matchedMemberRelay: true, unroutedBlocked: true, noDroppedTraceRecords: true },
    inference: 'Descriptive paired synthetic-world bootstrap, not registered confirmation, multiplicity-controlled inference or real-world rates.', contrasts };
}

export function runStudy() {
  for (const name of ['manifest.json', 'runs.json.gz', 'analysis.json']) assert.ok(!existsSync(new URL(name, import.meta.url)), 'output already exists: ' + name);
  const manifest = { schema: 'facety-service-order-design/v1', classification: 'unregistered exploratory, no mechanism confirmation', provenance: provenance(),
    design: ['../../examples/causal-walkthroughs.mjs', '../../examples/causal-relay.mjs', './run.mjs', './controls.mjs', '../../test/causal-relay.test.mjs'].map(path => ({
      path: fileURLToPath(new URL(path, import.meta.url)).slice(fileURLToPath(new URL('../../', import.meta.url)).length),
      sha256: createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex'),
    })),
    randomness: RELAY_RANDOMNESS, inputs: RELAY_INPUTS, seeds: SEEDS, contexts: RELAY_CONTEXTS, arms: RELAY_ARMS, orders: ORDERS,
    runBound: 432, traceLimit: 64, bootstrap: { resamples: 2000, confidence: 0.95, seedKey: ['d39-order-descriptive', 'context', 'arm', 'metric'] },
    assumptions: [
      'Fixed sequential exploratory labels, synthetic worlds, two opportunities and supplied accuracy/work; not a population sample or actual willingness.',
      'Only package service priority changes. Discovery/package construction and settlement stay canonical; all latent inputs are keyed by subject/stage.',
      'Reserved backing, strict individual-subject XP and one-step verdicts are references, not D34/D33 migration or new payment/authority rules.',
      'Ten total work units per arm: member 10 or external 6 plus sponsor 4; adjudication work is abstracted. No extra workforce, compensation or useful demand.',
      'Missing stage clocks remain null. Debt is not recovery; genuine burden is not necessarily wrongful. Member/relay arms are paired, not independent extra worlds.',
      'Correlated-capacity2, different prevalences/qualities, target populations, long horizons, live arrivals, human calendars and voluntary guarantee retention are not tested.',
      'Bootstrap intervals describe the declared seed-world model, are unadjusted and do not supply familywise or real-world guarantees. Zero effects do not establish equivalence.',
    ] };
  const runs = RELAY_CONTEXTS.flatMap(context => SEEDS.flatMap(seed => ORDERS.flatMap(order => RELAY_ARMS.map(arm => ({
    order: order.id, processingOrder: [...order.processingOrder], ...runRelayArm(seed, context, arm, { processingOrder: order.processingOrder, traceLimit: 64 }),
  })))));
  assert.equal(runs.length, manifest.runBound);
  const analysis = analyzeRuns(runs);
  writeFileSync(new URL('manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(new URL('runs.json.gz', import.meta.url), gzipSync(JSON.stringify({ schema: 'facety-service-order-runs/v1', runs }) + '\n'), { flag: 'wx' });
  writeFileSync(new URL('analysis.json', import.meta.url), JSON.stringify(analysis, null, 2) + '\n', { flag: 'wx' });
  return { runs: runs.length, controls: analysis.controls, contrasts: analysis.contrasts.map(row => ({ context: row.context, arm: row.arm, totals: row.totals,
    correctedDelta: row.effects.corrected, wrongfulDelta: row.effects.wrongfulInvalidations, refusals: row.refusals })) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(runStudy(), null, 2));
