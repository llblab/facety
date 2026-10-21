import test from 'node:test';
import assert from 'node:assert/strict';
import { EffortLedger, SimulationLimit, effortWeights } from '../src/effort.mjs';

test('attempted and rejected work consumes effort; unfunded actions never execute', () => {
  const ledger = new EffortLedger({ weights: { selfId: 2, inspect: 0.5 }, budgets: { honest: 1, attackers: 5 } });
  const accepted = ledger.begin('attackers', 'selfId', 'setup');
  ledger.finish(accepted, true);
  const rejected = ledger.begin('attackers', 'selfId');
  ledger.finish(rejected, false);
  assert.equal(ledger.begin('attackers', 'selfId'), null);
  const inspection = ledger.begin('honest', 'inspect');
  ledger.finish(inspection, true);
  assert.throws(() => ledger.finish(inspection, true));
  const { cohorts } = ledger.audit();
  assert.equal(cohorts.attackers.effort, 4);
  assert.equal(cohorts.attackers.attempts, 2);
  assert.equal(cohorts.attackers.rejected, 1);
  assert.equal(cohorts.attackers.denied, 1);
  assert.equal(cohorts.attackers.byPhase.setup.effort, 2);
  assert.equal(cohorts.honest.effort, 0.5);
});

test('effort stays inside fractional budgets and summaries cannot mutate the ledger', () => {
  const ledger = new EffortLedger({ weights: { inspect: 0.1 }, budgets: { honest: 0.3, attackers: 0 } });
  for (let i = 0; i < 10; i++) {
    const ticket = ledger.begin('honest', 'inspect');
    if (ticket) ledger.finish(ticket, true);
  }
  const result = ledger.audit();
  assert.equal(result.cohorts.honest.effort, 0.3);
  assert.equal(result.cohorts.honest.attempts, 3);
  assert.equal(ledger.begin('attackers', 'selfId'), null);
  result.cohorts.honest.effort = -1;
  assert.ok(ledger.summary().cohorts.honest.effort >= 0);
});

test('hard safety limits are distinct from economic budget denial, including zero-weight work', () => {
  const ledger = new EffortLedger({ weights: { selfId: 0 }, budgets: { honest: 0, attackers: 0 }, maxActions: 2 });
  for (let i = 0; i < 2; i++) ledger.finish(ledger.begin('attackers', 'selfId'), true);
  assert.throws(() => ledger.begin('attackers', 'selfId'), SimulationLimit);
  assert.equal(ledger.audit().cohorts.attackers.effort, 0);
  assert.throws(() => effortWeights({ typo: 1 }));
  assert.throws(() => effortWeights({ selfId: NaN }));
  const unsettled = new EffortLedger();
  unsettled.begin('honest', 'selfId');
  assert.throws(() => unsettled.audit());
});
