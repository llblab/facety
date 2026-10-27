import test from 'node:test';
import assert from 'node:assert/strict';
import { EffortLedger, DEFAULT_WEIGHTS, SimulationLimit } from '../src/effort.mjs';
import { experimentConfig, withExperimentParameters, experimentRandomness, DEFAULT_ACTIVITY } from '../src/experiment-config.mjs';
import { runExperiment } from '../src/experiment.mjs';
import { mapTasks } from '../src/parallel.mjs';
import { registerHypothesis, verifyRegistration, runStatisticTask, HYPOTHESIS_SCHEMA } from '../src/evidence.mjs';
import { config as vouchConfig } from './support/vouch-experiment-fixture.mjs';
import { config as pbConfig } from './support/pb-experiment-fixture.mjs';
const cohorts = ['honest', 'attackers'], precision = 1000000n, scaled = n => BigInt(Math.round(n * 1000000)), number = n => Number(n) / 1000000;
const row = () => ({ attempts: 0, accepted: 0, rejected: 0, denied: 0, effort: 0n }), shown = r => ({ ...r, effort: number(r.effort) });
// Independent cumulative-cost reference: general use = all paid cost - min(R, paid eligible cost).
// It does not implement the production per-ticket split/debit algorithm.
function reference({ weights, budgets, reviewReserve = {}, maxActions = 100 }) {
  weights = Object.fromEntries(Object.entries(weights).map(([a, cost]) => [a, number(scaled(cost))])); budgets = Object.fromEntries(cohorts.map(c => [c, number(scaled(budgets[c]))]));
  const state = Object.fromEntries(cohorts.map(c => [c, { ...row(), byAction: Object.fromEntries(Object.keys(weights).map(a => [a, row()])), byPhase: { setup: row(), maintenance: row() }, review: 0n }])); let calls = 0, next = 0;
  return {
    act(cohort, action, phase, accepted) {
      if (calls === maxActions) throw new SimulationLimit('maxActions'); calls++;
      const s = state[cohort], cost = scaled(weights[action]), reserve = scaled(reviewReserve[cohort] ?? 0), budget = scaled(budgets[cohort]), eligible = phase === 'maintenance' && ['inspect', 'respond'].includes(action), candidateReview = s.review + (eligible ? cost : 0n), protectedCost = candidateReview < reserve ? candidateReview : reserve, targets = [s, s.byAction[action], s.byPhase[phase]];
      if (s.effort + cost - protectedCost > budget - reserve) { for (const r of targets) r.denied++; return null; }
      for (const r of targets) { r.attempts++; r[accepted ? 'accepted' : 'rejected']++; r.effort += cost; } s.review = candidateReview;
      return { id: next++, cohort, action, phase, cost: weights[action] };
    },
    summary() {
      const result = { unit: 'uncalibrated weighted action-effort units', weights, calls, maxActions, cohorts: Object.fromEntries(cohorts.map(c => { const s = state[c]; return [c, { ...shown(Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'review'))), byAction: Object.fromEntries(Object.entries(s.byAction).map(([a, r]) => [a, shown(r)])), byPhase: Object.fromEntries(Object.entries(s.byPhase).map(([p, r]) => [p, shown(r)])), budget: budgets[c], remaining: number(scaled(budgets[c]) - s.effort) }]; })) };
      if (cohorts.some(c => (reviewReserve[c] ?? 0) > 0)) result.allocation = { reference: 'maintenance-review-reserve/v1', cohorts: Object.fromEntries(cohorts.map(c => { const s = state[c], b = scaled(budgets[c]), r = scaled(reviewReserve[c] ?? 0), used = s.review < r ? s.review : r, general = s.effort - used; return [c, { generalBudget: number(b - r), reservedBudget: number(r), generalSpent: number(general), reservedSpent: number(used), generalRemaining: number(b - r - general), reservedRemaining: number(r - used) }]; })) };
      return result;
    },
  };
}
const tape = [['proposeGuarantee', 'setup'], ['confirmGuarantee', 'setup'], ['selfId', 'maintenance'], ['convert', 'maintenance'], ['inspect', 'maintenance'], ['respond', 'maintenance']];
function trace(reserve) { const ledger = new EffortLedger({ budgets: { honest: 4, attackers: 0 }, reviewReserve: { honest: reserve }, maxActions: 6 }), paid = []; for (const [action, phase] of tape) { const ticket = ledger.begin('honest', action, phase); paid.push(ticket !== null); if (ticket) ledger.finish(ticket, true); } return { paid, summary: ledger.audit() }; }

test('fixed B4 reserve2 displaces two ordinary calls, enables two review calls, spends no extra work', () => {
  const pooled = trace(0), reserved = trace(2); assert.deepEqual(pooled.paid, [true, true, true, true, false, false]); assert.deepEqual(reserved.paid, [true, true, false, false, true, true]); assert.equal(reserved.summary.cohorts.honest.effort, 4); assert.equal(reserved.summary.calls, 6); assert.equal(reserved.summary.allocation.cohorts.honest.reservedSpent, 2); assert.ok(!Object.hasOwn(pooled.summary, 'allocation'));
});

test('1080 weighted two-cohort/phase traces match independent BigInt cumulative accounting after every ticket', t => {
  let cases = 0, calls = 0;
  for (const quantum of [1, 100000, 1000000]) for (let b = 0; b <= 4; b++) for (let r = 0; r <= b; r++) for (let shape = 0; shape < 4; shape++) for (let shift = 0; shift < 6; shift++) {
    const q = quantum / 1000000, weights = Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map(a => [a, q])); weights.inspect = shape * q; weights.respond = ((shape + 1) % 4) * q; weights.verify = 2 * q;
    const options = { weights, budgets: { honest: b * q, attackers: (4 - b) * q }, reviewReserve: { honest: r * q, attackers: (4 - b) * q }, maxActions: 18 }, actual = new EffortLedger(options), expected = reference(options);
    for (let i = 0; i < 18; i++) { const [action, basePhase] = tape[(i + shift) % tape.length], phase = i % 5 === 0 ? 'setup' : basePhase, cohort = i % 3 ? 'honest' : 'attackers', accepted = i % 4 !== 0, chosen = i % 7 === 0 ? 'verify' : action, ticket = actual.begin(cohort, chosen, phase), wanted = expected.act(cohort, chosen, phase, accepted); assert.deepEqual(ticket, wanted); if (ticket) actual.finish(ticket, accepted); assert.deepEqual(actual.audit(), expected.summary()); if (r === 0 && b === 4) assert.equal(JSON.stringify(actual.summary()), JSON.stringify(expected.summary())); calls++; }
    const before = actual.summary(); assert.throws(() => actual.begin('honest', 'inspect'), SimulationLimit); assert.deepEqual(actual.summary(), before); cases++;
  }
  assert.equal(cases, 1080); assert.equal(calls, 19440); t.diagnostic('review-reserve-reference ' + JSON.stringify({ cases, calls, mismatch: 0, reference: 'BigInt cumulative paid cost minus min(reserve,eligible paid cost)' }));
});

test('reservation input rejects malformed/unsafe/over-budget records; copies validated values and preserves inert snapshots', () => {
  for (const value of [null, [], 1, '1', true, { other: 0 }, { honest: undefined }, { honest: null }, { honest: NaN }, { honest: Infinity }, { honest: -1 }, { honest: 0.0000001 }, { honest: '0' }, { honest: 1.000001 }, { honest: Number.MAX_SAFE_INTEGER }]) {
    assert.throws(() => new EffortLedger({ budgets: { honest: 1, attackers: 0 }, reviewReserve: value }), 'invalid reserve '+String(value)); assert.throws(() => experimentConfig({ budgets: { honest: 1, attackers: 0 }, reviewReserve: value }));
  }
  const input = { honest: 1 }, ledger = new EffortLedger({ budgets: { honest: 2, attackers: 0 }, reviewReserve: input }); input.honest = 0; assert.equal(ledger.summary().allocation.cohorts.honest.reservedBudget, 1);
  const snapshot = ledger.summary(); snapshot.allocation.cohorts.honest.generalSpent = 99; snapshot.cohorts.honest.byAction.inspect.effort = 99; assert.equal(ledger.audit().allocation.cohorts.honest.generalSpent, 0); assert.equal(ledger.summary().cohorts.honest.effort, 0);
});

test('only maintenance inspect/respond may spend reserve; setup/verify cannot borrow, paid rejection is not a refund', () => {
  const ledger = new EffortLedger({ budgets: { honest: 2, attackers: 0 }, reviewReserve: { honest: 2 }, maxActions: 100 });
  for (const action of Object.keys(DEFAULT_WEIGHTS)) { assert.equal(ledger.begin('honest', action, 'setup'), null); if (!['inspect', 'respond'].includes(action)) assert.equal(ledger.begin('honest', action), null); }
  const inspection = ledger.begin('honest', 'inspect'); assert.throws(() => ledger.audit(), /unsettled/); assert.throws(() => ledger.finish(inspection, null), /invalid/); ledger.finish(inspection, false); const response = ledger.begin('honest', 'respond'); ledger.finish(response, true); assert.throws(() => ledger.finish(response, true)); assert.equal(ledger.begin('honest', 'respond'), null);
  const result = ledger.audit(); assert.equal(result.cohorts.honest.rejected, 1); assert.equal(result.allocation.cohorts.honest.reservedRemaining, 0); assert.equal(result.cohorts.honest.effort, 2); assert.equal(result.cohorts.attackers.effort, 0);
});

test('protected-first fractional split and one-micro affordability are atomic; zero work still consumes cap', () => {
  const l = new EffortLedger({ budgets: { honest: 2.000001, attackers: 0 }, reviewReserve: { honest: 1.000001 }, weights: { selfId: 1.000001, inspect: 2.000001, respond: 0 }, maxActions: 4 });
  assert.equal(l.begin('honest', 'selfId'), null); assert.equal(l.summary().cohorts.honest.effort, 0); const t = l.begin('honest', 'inspect'); l.finish(t, false); assert.deepEqual(l.audit().allocation.cohorts.honest, { generalBudget: 1, reservedBudget: 1.000001, generalSpent: 1, reservedSpent: 1.000001, generalRemaining: 0, reservedRemaining: 0 });
  for (let i = 0; i < 2; i++) l.finish(l.begin('honest', 'respond'), true); assert.throws(() => l.begin('honest', 'respond'), SimulationLimit);
  const micro = new EffortLedger({ budgets: { honest: 0.000002, attackers: 0 }, reviewReserve: { honest: 0.000001 }, weights: { inspect: 0.000003, respond: 0.000002 } }); const before = micro.summary(); assert.equal(micro.begin('honest', 'inspect'), null); assert.deepEqual(micro.summary().allocation, before.allocation); micro.finish(micro.begin('honest', 'respond'), true); assert.equal(micro.audit().cohorts.honest.remaining, 0);
  const large = new EffortLedger({ budgets: { honest: 9000000000, attackers: 0 }, reviewReserve: { honest: 4000000000 }, weights: { inspect: 5000000000, selfId: 4000000000 } }); large.finish(large.begin('honest', 'inspect'), true); large.finish(large.begin('honest', 'selfId'), true); assert.equal(large.begin('honest', 'inspect'), null); assert.equal(large.audit().cohorts.honest.effort, 9000000000);
  const first = new EffortLedger({ budgets: { honest: 3, attackers: 0 }, reviewReserve: { honest: 2 } }); first.finish(first.begin('honest', 'inspect'), true); assert.equal(first.audit().allocation.cohorts.honest.generalSpent, 0); first.finish(first.begin('honest', 'selfId'), true); assert.equal(first.audit().allocation.cohorts.honest.reservedRemaining, 1);
});

const quiet = Object.fromEntries(Object.keys(DEFAULT_ACTIVITY.honest).map(a => [a, 0]));
const software = () => ({ scenario: 'honest-growth', seed: 'software-review-reserve-wiring', initialSize: 2, initialTopology: 'clique', days: 2, stepHours: 4, includeState: true, budgets: { honest: 10, attackers: 0 }, activity: { honest: { ...quiet, selfId: 1 }, attackers: quiet } });

test('canonical zero preserves normalized config/full current native output and RNG; nonzero wires real constrained setup, not free funding', () => {
  const config = software(), baseline = runExperiment(config); for (const reviewReserve of [{}, { honest: 0 }, { honest: 0, attackers: 0 }]) { const c = experimentConfig({ ...config, reviewReserve }); assert.deepEqual(c, experimentConfig(config)); assert.equal(JSON.stringify(c), JSON.stringify(experimentConfig(config))); assert.ok(!Object.hasOwn(c, 'reviewReserve')); const zero = runExperiment({ ...config, reviewReserve }); assert.deepEqual(zero, baseline); assert.equal(JSON.stringify(zero), JSON.stringify(baseline)); }
  const input = { honest: 10 }, c = experimentConfig({ ...config, reviewReserve: input }); assert.deepEqual(c.reviewReserve, { honest: 10, attackers: 0 }); assert.ok(Object.isFrozen(c.reviewReserve)); input.honest = 0; assert.equal(c.reviewReserve.honest, 10); assert.deepEqual(experimentRandomness(c), experimentRandomness(experimentConfig(config)));
  const constrained = runExperiment(c); assert.equal(constrained.effort.cohorts.honest.byPhase.setup.effort, 0); assert.ok(baseline.effort.cohorts.honest.byPhase.setup.effort > 0); assert.ok(constrained.effort.cohorts.honest.denied > 0); assert.equal(constrained.metrics.guarantees.edges, 0); assert.equal(constrained.effort.allocation.cohorts.honest.reservedRemaining, 10); assert.ok(constrained.assumptions.some(s => s.includes('maintenance-review-reserve/v1')));
  assert.ok(!Object.hasOwn(withExperimentParameters(c, { 'reviewReserve.honest': 0 }), 'reviewReserve')); assert.throws(() => withExperimentParameters(config, { 'reviewReserve.honest': 1 }), /unknown experiment parameter/);
  for (const other of [vouchConfig(), pbConfig()]) assert.throws(() => experimentConfig({ ...other, reviewReserve: { honest: 1 } }), /requires exactly/);
});

test('actual legacy v2 envelope/scalar and sequential-worker routes accept opt-in configs without a programme registration or confirmation', async () => {
  const config = { ...software(), includeState: false, reviewReserve: { honest: 2 } }, statistic = { metric: 'subjects', summary: 'endpoint', window: null, subtract: null };
  const registration = registerHypothesis({ id: 'review-reserve-software-api-only', statement: 'Ephemeral software envelope, not programme method/empirical result', kind: 'association', base: config, statistic, arms: { reserved: {}, pooled: { 'reviewReserve.honest': 0 } }, claims: [{ id: 'presence', role: 'presence', contrast: { reserved: 1, pooled: -1 }, direction: 'greater' }], replicas: 5, exploration: { seeds: [] } }); assert.equal(registration.schema, HYPOTHESIS_SCHEMA); assert.equal(verifyRegistration(registration).implementationMatched, true);
  const tasks = ['software-allocator-worker-a', 'software-allocator-worker-b'].map(seed => ({ config: { ...config, seed }, statistic })), module = new URL('../src/evidence.mjs', import.meta.url).href;
  assert.deepEqual(await mapTasks(tasks, { workers: 2, module, exportName: 'runStatisticTask' }), tasks.map(runStatisticTask)); assert.deepEqual(await mapTasks(tasks, { workers: 0, module, exportName: 'runStatisticTask' }), tasks.map(runStatisticTask));
});
