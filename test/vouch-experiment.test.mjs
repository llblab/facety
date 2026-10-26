import test from 'node:test';
import assert from 'node:assert/strict';
import { runVouchExperiment } from '../src/vouch-experiment.mjs';
import { vouchExperimentConfig, VOUCH_RANDOMNESS, VOUCH_OBSERVABLES } from '../src/vouch-experiment-config.mjs';
import { actObservationEnvironment } from '../src/act-observations.mjs';
import { registerHypothesis } from '../src/evidence.mjs';
import { CompositionReference, ReferenceRejection } from '../studies/2026-10-26-trust-topology-condition-map/reference.mjs';
import { profile, config } from './support/vouch-experiment-fixture.mjs';

function oracleHistory(cfg) {
  const r = new CompositionReference({ ...profile, ...cfg.model }), snapshots = [], accepted = [];
  let endpoint = 24;
  for (const event of cfg.events) {
    while (endpoint <= event.atHour) { r.apply({ op: 'time', hour: endpoint }); snapshots.push(r.snapshot()); endpoint += 24; }
    r.apply({ op: 'time', hour: event.atHour });
    const { atHour, authority, ...q } = event;
    if (q.op === 'pool') q.options = cfg.work;
    if (q.op === 'review') q.signal = !cfg.environment.validity[q.id]; // Explicit0/1 software fixture only, not an assumed research law.
    try { r.apply(q); accepted.push(true); } catch (e) { if (!(e instanceof ReferenceRejection)) throw e; accepted.push(false); }
  }
  while (endpoint <= cfg.days * 24) { r.apply({ op: 'time', hour: endpoint }); snapshots.push(r.snapshot()); endpoint += 24; }
  return { snapshots, accepted, final: r.snapshot() };
}

test('backend config is closed, explicit, immutable and validates ownership/rates/time without executing a tape', () => {
  const raw = config(), normalized = vouchExperimentConfig(raw);
  assert.deepEqual(normalized, raw);
  raw.model.vouching.B = 1000; raw.environment.validity['x:48'] = false; raw.events.length = 0;
  assert.equal(normalized.model.vouching.B, 2);
  assert.equal(normalized.environment.validity['x:48'], true);
  assert.ok(normalized.events.length > 20);
  assert.throws(() => { normalized.events[0].atHour = 1; }, TypeError);
  assert.throws(() => { normalized.work.costs.inspect = 0; }, TypeError);
});

test('real Native backend matches independent action acceptance/daily money/XP/work across all four fixed composition witnesses', () => {
  for (const plan of profile.settlementWitnesses) {
    const cfg = config(plan), run = runVouchExperiment(cfg), expected = oracleHistory(cfg);
    assert.equal(run.schema, 'facety-native-vouch-run/v1'); assert.equal(run.classification, 'diagnostic');
    assert.deepEqual(run.actions.map(a => a.ok), expected.accepted);
    assert.equal(run.history.length, cfg.days);
    assert.equal(run.outcome.censored, false); assert.equal(run.outcome.success, null);
    for (const [i, point] of run.history.entries()) {
      const e = expected.snapshots[i], m = point.vouch;
      assert.equal(point.atHour, e.now);
      for (const [actual, value] of Object.entries({ minted: e.ledger.minted, burned: e.ledger.burned, collector: e.ledger.collector,
        emitterVault: e.ledger.emitterVault, bondVault: e.ledger.vouchVault, members: e.members.length, admissions: e.admissions.length,
        xpTotal: e.members.reduce((n, s) => n + s.xp, 0), liveSlots: e.capacities.reduce((n, c) => n + c.used, 0) })) assert.equal(m[actual], value);
      assert.equal(m.reviewWork, e.work?.actors.reduce((n, a) => n + a.spent, 0) ?? 0);
      assert.deepEqual(Object.keys(m).map(key => 'vouch.' + key).sort(), Object.keys(VOUCH_OBSERVABLES).sort());
      for (const [key, value] of Object.entries(m)) { assert.ok(Object.hasOwn(VOUCH_OBSERVABLES, 'vouch.' + key)); assert.ok(Number.isFinite(value)); }
    }
    assert.deepEqual(run.state.ledger, expected.final.ledger);
    assert.equal(run.state.work.receipts.length, 2);
    assert.equal(run.history.at(-1).vouch.reviewWork, 3);
    assert.equal(run.history.at(-1).vouch.vetoes, 1);
    assert.equal(run.history.at(-1).vouch.rejections, 1);
  }
});

test('daily endpoints precede same-hour commands, include automatic maturities and never execute horizon commands', () => {
  const cfg = config(), run = runVouchExperiment(cfg);
  assert.equal(run.history[0].atHour, 24);
  assert.equal(run.history[0].vouch.minted, 2);
  assert.equal(run.history[0].vouch.xpTotal, 2);
  assert.equal(run.history[1].vouch.admissions, 0);
  assert.equal(run.history[1].vouch.bondVault, 0);
  assert.equal(run.history[4].vouch.pendingCases, 1);
  assert.equal(run.history[4].vouch.bondVault, 8);
  assert.equal(run.history[4].vouch.rejections, 0);
  assert.equal(run.history[6].vouch.bondVault, 4); // Refund commands at168 run after this endpoint.
  assert.equal(run.history[7].vouch.bondVault, 0);
  cfg.events.push({ atHour: cfg.days * 24, authority: 'trusted-administration', op: 'pool' });
  assert.throws(() => vouchExperimentConfig(cfg), /horizon/);
});

test('caps censor with declared horizon and missing future endpoints, not a false success or fabricated rows', () => {
  const cfg = config(); cfg.maxActions = 2;
  const capped = runVouchExperiment(cfg);
  assert.equal(capped.actions.length, 2); assert.equal(capped.history.length, 0);
  assert.equal(capped.outcome.censorReason, 'maxActions'); assert.equal(capped.outcome.success, null);
  assert.equal(capped.outcome.horizonDays, 8); assert.equal(capped.outcome.endedAtHour, 0);
  const population = config(); population.maxSubjects = 2;
  const stop = runVouchExperiment(population);
  assert.equal(stop.outcome.censorReason, 'maxSubjects'); assert.equal(stop.history.length, 2);
  assert.equal(stop.state.subjects.length, 2); assert.equal(stop.state.ledger.vouchVault, 4);
  const exact = config(); exact.maxActions = exact.events.length;
  assert.equal(runVouchExperiment(exact).outcome.censored, false);
});

test('hidden person/profile labels cannot change defense/protocol outcomes and received false suspicion remains fallible', () => {
  const cfg = config(), other = config();
  for (const fact of other.environment.subjects) { fact.genuine = false; fact.behaviorProfile = 'different-private-profile'; }
  const a = runVouchExperiment(cfg), b = runVouchExperiment(other);
  assert.deepEqual(a.history, b.history); assert.deepEqual(a.actions, b.actions); assert.deepEqual(a.state, b.state);
  const falseAlarm = config();
  for (const rates of Object.values(falseAlarm.environment.rates)) for (const role of Object.values(rates)) { role.valid = 1; role.invalid = 0; }
  const scarce = runVouchExperiment(falseAlarm);
  assert.equal(scarce.actions.find(q => q.op === 'review').value.outcome, 'response-denied');
  falseAlarm.work.actors.find(a => a.id === 'review-a').budget = 2; // Explicit software resource contrast; not a calibrated cooperation rule.
  const harm = runVouchExperiment(falseAlarm);
  assert.equal(harm.state.selfIds.find(s => s.subject === 'x' && s.recordedAt === 48).status, 'cancelled');
  assert.equal(harm.state.subjects.find(s => s.id === 'x').identityStatus, 'accepted');
  assert.equal(harm.actions.find(q => q.op === 'review').value.suspicious, true);
  assert.equal(harm.history.at(-1).vouch.admissions, 1); // Local veto/funding effects, not fake-person detection.
});

test('Native received signals use the existing keyed environment and identical seed/config replay is exact', () => {
  const cfg = config();
  for (const rates of Object.values(cfg.environment.rates)) for (const role of Object.values(rates)) { role.valid = 0.35; role.invalid = 0.65; }
  const run = runVouchExperiment(cfg);
  assert.deepEqual(runVouchExperiment(cfg), run);
  assert.deepEqual(run.randomness, VOUCH_RANDOMNESS);
  const ids = new Map(run.actions.flatMap((a, i) => cfg.events[i].op === 'issue' && a.ok ? [[a.value, cfg.events[i].id]] : []));
  const facts = { subjects: cfg.environment.subjects, acts: run.state.selfIds.map(a => ({ id: a.id, subject: a.subject,
    kind: 'self-id', recordedAt: a.recordedAt, valid: cfg.environment.validity[ids.get(a.id)] })) };
  const expected = actObservationEnvironment(facts, { seed: cfg.seed, rates: cfg.environment.rates });
  for (const r of run.state.work.receipts.filter(r => r.suspicious !== null)) assert.equal(r.suspicious,
    expected.observe({ act: r.selfId, observer: r.actor, role: r.role, atHour: r.atHour, opportunity: r.opportunity }).suspicious);
});

test('unsupported/omniscient/privileged/ambiguous configuration fails closed without legacy fallback', () => {
  for (const mutate of [
    c => { c.engine = 'CORE'; }, c => { delete c.reference; }, c => { c.successCriterion = 'safe'; },
    c => { c.environment.subjects.pop(); }, c => { delete c.environment.validity['y:96']; },
    c => { c.events[0].truth = true; }, c => { c.events[0].op = 'invalidateIdentity'; },
    c => { c.events.find(e => e.op === 'settle').authority = 'subject-call'; },
    c => { c.events[0].atHour = 1; }, c => { c.model.policy.xpFinality = 'terminal'; },
    c => { c.work.costs.inspect = 0; }, c => { c.events.find(e => e.op === 'review').signal = true; },
    c => { c.events.find(e => e.op === 'issue').id = 'y:96'; },
  ]) { const cfg = config(); mutate(cfg); assert.throws(() => vouchExperimentConfig(cfg)); }
  const cfg = config(); cfg.includeState = false;
  assert.equal(Object.hasOwn(runVouchExperiment(cfg), 'state'), false);
});

test('unavailable work allocation and explicit refused clearance are rejected inputs, never negative observations or partial grants', () => {
  const empty = config();
  empty.events = [
    { atHour: 0, authority: 'trusted-administration', op: 'pool' },
    { atHour: 0, authority: 'custody-review', op: 'review', actor: 'review-a', id: 'not-issued', opportunity: 'unavailable' },
  ];
  const unavailable = runVouchExperiment(empty);
  assert.equal(unavailable.actions.every(a => !a.ok), true);
  assert.equal(unavailable.actions[1].reason, 'work-pool-unavailable');
  assert.equal(unavailable.state.work, null);
  assert.equal(unavailable.history.at(-1).vouch.observations, 0);
  assert.equal(unavailable.history.at(-1).vouch.reviewWork, 0);
  assert.equal(unavailable.history.at(-1).vouch.rejections, 2);
  const cfg = config(), baseline = runVouchExperiment(cfg);
  const index = cfg.events.findIndex(e => e.op === 'refund');
  cfg.events.splice(index, 0, { ...cfg.events[index], clear: false });
  const refused = runVouchExperiment(cfg);
  assert.equal(refused.actions[index].ok, false);
  assert.deepEqual(refused.state, baseline.state);
  assert.equal(refused.history.at(-1).vouch.rejections, baseline.history.at(-1).vouch.rejections + 1);
});

test('v2 admission still refuses full-state backend snapshots rather than silently dropping private/protocol metadata', () => {
  assert.throws(() => registerHypothesis({ id: 'wp1-backend-software-only', statement: 'not an actual research method', kind: 'association',
    base: config(), statistic: { metric: 'vouch.admissions' }, arms: { one: {} },
    claims: [{ id: 'presence', role: 'presence', contrast: { one: 1 }, direction: 'greater' }], replicas: 20, exploration: { seeds: [] } }), /scalar statistics, not protocol snapshots/);
});
