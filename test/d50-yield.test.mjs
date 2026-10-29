import test from 'node:test';
import assert from 'node:assert/strict';
import { runExperiment } from '../src/experiment.mjs';
import { metricSeries } from '../src/discovery.mjs';

function terminalHoldings(out, cohort) {
  let holdings = 0;
  let effort = 0;
  for (const facts of Object.values(out.agents[cohort])) {
    holdings += facts.liquidFacy + facts.emitterFacy + facts.stakeFacy - facts.debt;
    effort += facts.effort;
  }
  return { holdings, effort };
}

test('D50 yield observables reconcile with terminal per-cohort holdings and effort', () => {
  const out = runExperiment({ scenario: 'sybil-cone', seed: 'd50-yield', days: 12, disputes: { enabled: true, stakeBacking: 'reserved' }, activity: { honest: { challenge: 0.05 } } });
  const last = out.history.at(-1).yield;
  for (const cohort of ['honest', 'attackers']) {
    const { holdings, effort } = terminalHoldings(out, cohort);
    assert.equal(last[cohort + 'Holdings'], holdings);
    assert.ok(Math.abs(last[cohort + 'PerEffort'] - holdings / effort) < 1e-9);
  }
  assert.ok(Math.abs(last.strongTargetGap - (last.honestPerEffort - 10 * last.attackersPerEffort)) < 1e-12);
  const series = metricSeries(out.history, 'yield.honestPerEffort', { days: 12 });
  assert.equal(series.length, 12);
  assert.ok(series.every(point => point.value === null || Number.isFinite(point.value)));
});

test('D50 yield is null, not zero, for a cohort without declared effort', () => {
  const out = runExperiment({ scenario: 'honest-growth', seed: 'd50-yield', days: 5 });
  for (const point of out.history) {
    assert.equal(point.yield.attackersPerEffort, null);
    assert.equal(point.yield.strongTargetGap, null);
    assert.equal(point.yield.attackersHoldings, 0);
  }
});

test('D114 dirty FACY share and accepted attacker share reconcile with terminal holdings', () => {
  const out = runExperiment({ scenario: 'sybil-cone', seed: 'd114-dirty', days: 12, disputes: { enabled: true, stakeBacking: 'reserved' }, activity: { honest: { challenge: 0.05 } }, includeState: true });
  const last = out.history.at(-1).dirty;
  const attackers = new Set(out.state.truth.filter(identity => identity.cohort === 'attackers').map(identity => identity.id));
  let held = 0;
  for (const subject of out.state.subjects) if (attackers.has(subject.id)) held += subject.liquidFacy;
  for (const act of out.state.selfIds) if (act.status === 'unspent' && attackers.has(act.subject)) held++;
  for (const stake of out.state.disputeStakes) if (stake.status === 'reserved' && attackers.has(stake.owner)) held += stake.amount;
  assert.equal(last.supply, out.system.supply);
  assert.ok(Math.abs(last.heldShare - held / out.system.supply) < 1e-12);
  const accepted = out.state.subjects.filter(subject => subject.identityStatus === 'accepted');
  assert.equal(last.acceptedAttackerShare, accepted.filter(subject => attackers.has(subject.id)).length / accepted.length);
  for (const point of metricSeries(out.history, 'dirty.heldShare', { days: 12 })) assert.ok(point.value === null || (point.value >= 0 && point.value <= 1));
});
