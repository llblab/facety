import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pbExperimentConfig, PB_RANDOMNESS, PB_OBSERVABLES } from '../src/pb-experiment-config.mjs';
import { runPbExperiment } from '../src/pb-experiment.mjs';
import { registerHypothesis } from '../src/evidence.mjs';
import { pbCapacityReference } from '../studies/2026-10-26-trust-topology-condition-map/pb-reference.mjs';

import { config } from './support/pb-experiment-fixture.mjs';
function reference(cfg) { return pbCapacityReference({ ...cfg.model.invitationLimit, days: cfg.days, emissionEveryDays: cfg.emissionEveryDays, maxActions: cfg.maxActions }); }
function reason(row) {
  if (row.reason === null) return null;
  if (row.reason === 'invitation cooldown after use') return 'cooldown';
  if (row.reason === 'invitation requires exactly b distinct own mature sources') return 'funding';
  throw new Error('unexpected Native refusal: ' + row.reason);
}
function compare(cfg) {
  const run = runPbExperiment(cfg), expected = reference(cfg), s = run.state;
  assert.deepEqual(run.actions.map(a => ({ atHour: a.atHour, op: a.op, ok: a.ok, reason: reason(a) })), expected.actions);
  assert.deepEqual(run.history, expected.history);
  assert.equal(run.outcome.censored, expected.censored); assert.equal(run.outcome.endedAtHour, expected.final.now);
  assert.equal(run.outcome.success, null); assert.equal(run.outcome.horizonDays, cfg.days);
  assert.equal(s.relations[0]?.status ?? null, expected.final.relation);
  const indices = new Map(s.selfIds.map((a, index) => [a.id, index]));
  const disposed = new Map(s.invitations.flatMap(i => i.sourceSelfIds.map(id => [id, i.createdAt])));
  assert.deepEqual(s.selfIds.map(a => ({ atHour: a.recordedAt, consumedAt: disposed.get(a.id) ?? null, xpCredited: a.xpCredit !== null })), expected.final.sources);
  assert.deepEqual(s.invitations.map(i => ({ atHour: i.createdAt, target: i.target, sources: i.sourceSelfIds.map(id => indices.get(id)) })), expected.final.invitations);
  assert.equal(s.ledger.minted, expected.final.pb.minted); assert.equal(s.ledger.burned, expected.final.pb.burned);
  assert.equal(s.ledger.emitterVault, expected.final.pb.emitterVault);
  assert.equal(s.subjects.length, 2); assert.ok(s.subjects.every(m => m.liquidFacy === 0 && m.debt === 0));
  assert.equal(s.subjects.reduce((n, m) => n + m.xp, 0), expected.final.pb.xpTotal);
  assert.equal(run.actions.filter(a => a.op === 'artifact').length, expected.final.artifacts);
  assert.ok(s.selfIds.every(a => a.status === (disposed.has(a.id) ? 'consumed' : 'unspent')));
  for (const p of run.history) assert.deepEqual(Object.keys(p.pb).map(k => 'pb.' + k).sort(), Object.keys(PB_OBSERVABLES).sort());
  return { run, expected };
}

test('P/b config is complete/immutable/closed and mathematical reference has no imports or Native calls', () => {
  const cfg = config(), frozen = pbExperimentConfig(cfg);
  cfg.model.invitationLimit.b = 999; cfg.model.policy.guaranteeFee = 99;
  assert.equal(frozen.model.invitationLimit.b, 2); assert.equal(frozen.model.policy.guaranteeFee, 0);
  assert.ok(Object.isFrozen(frozen.model.policy));
  assert.throws(() => { frozen.model.genesis.push('extra'); }, TypeError);
  const body = readFileSync(new URL('../studies/2026-10-26-trust-topology-condition-map/pb-reference.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(body, /^\s*import\b|import\s*\(|FacetyModel|runPbExperiment|capacityControl/m);
  for (const mutate of [
    c => { delete c.seed; }, c => { c.days = 3651; }, c => { c.days = -1; }, c => { c.days = 0.5; },
    c => { c.emissionEveryDays = 0; }, c => { c.maxActions = 0; }, c => { c.seed = ''; },
    c => { c.engine = 'CORE'; }, c => { c.reference = 'OTHER'; }, c => { c.includeState = 1; },
    c => { c.successCriterion = 'safe'; }, c => { c.work = {}; }, c => { c.environment = {}; },
    c => { c.model.genesis.push('new'); }, c => { delete c.model.policy.councilSize; },
    c => { c.model.policy.spendMaturityHours = 48; }, c => { c.model.policy.guaranteeFee = 1; },
    c => { c.model.ablations.disableInvitationVeto = true; }, c => { c.model.invitationLimit = null; },
    c => { c.model.invitationLimit = { P: 0, b: 1 }; }, c => { c.model.invitationLimit.claim_requires = true; },
  ]) { const raw = config(); mutate(raw); assert.throws(() => pbExperimentConfig(raw)); }
});

test('actual Native inventory/actions/daily stocks match the import-free recurrence over180 fixed software partitions', () => {
  for (const P of [null, 1, 3]) for (const b of [0, 1, 2, 4]) for (const q of [1, 2, 3]) for (const days of [0, 1, 2, 5, 8]) compare(config(P, b, days, q));
  compare(config(Math.floor(Number.MAX_SAFE_INTEGER / 24), Number.MAX_SAFE_INTEGER, 2, 3650));
});

test('cap prefixes preserve completed partial bootstrap/artifact and censored horizons, exact final exhaustion is not censoring', () => {
  for (const [P, b, q] of [[3, 2, 1], [null, 0, 3]]) {
    const full = reference(config(P, b, 5, q));
    for (let cap = 1; cap <= full.plannedActions + 1; cap++) compare(config(P, b, 5, q, cap));
  }
  const partial = compare(config(3, 2, 8, 1, 1)).run;
  assert.equal(partial.state.relations[0].status, 'proposed'); assert.equal(partial.history.length, 0);
  assert.equal(partial.outcome.endedAtHour, 0); assert.equal(partial.outcome.horizonDays, 8);
  const artifactOnly = compare(config(3, 2, 8, 1, 3)).run;
  assert.equal(artifactOnly.actions.at(-1).op, 'artifact'); assert.equal(artifactOnly.state.selfIds.length, 0);
});

test('maturity endpoints precede same-hour offers and exclude the historical terminal-day offer', () => {
  const run = compare(config(1, 1, 2)).run;
  assert.deepEqual(run.history.map(p => [p.atHour, p.pb.created, p.pb.minted, p.pb.burned, p.pb.matureUnspent, p.pb.xpTotal]),
    [[24, 0, 1, 0, 1, 2], [48, 1, 2, 1, 1, 4]]);
  assert.deepEqual(run.actions.filter(a => a.op === 'offer').map(a => [a.atHour, a.ok]), [[0, false], [24, true]]);
  assert.equal(run.state.invitations[0].createdAt, 24);
  assert.ok(run.actions.every(a => a.atHour < 48));
  const empty = compare(config(3, 2, 0)).run;
  assert.equal(empty.actions.length, 0); assert.equal(empty.history.length, 0); assert.equal(empty.state.relations.length, 0);
});

test('own emission banks independently of permit cooldown and actual multi-source burn is not recipient payback', () => {
  const run = compare(config(3, 2, 8)).run;
  assert.deepEqual(run.state.invitations.map(i => i.createdAt), [48, 120]);
  assert.equal(run.state.invitations.every(i => i.status === 'open' && i.acceptedAt === null && i.sourceSelfIds.length === 2), true);
  assert.equal(run.state.ledger.minted, 8); assert.equal(run.state.ledger.burned, 4); assert.equal(run.state.ledger.emitterVault, 4);
  assert.equal(run.state.subjects.length, 2);
  assert.ok(run.history.some(p => p.pb.cooldownDenied > 0 && p.pb.matureUnspent > 0));
});

test('zero burn uses empty funding and unbounded policy is not a measured one/day maximum', () => {
  const { run } = compare(config(null, 0, 4, 3));
  assert.deepEqual(run.state.invitations.map(i => i.createdAt), [0, 24, 48, 72]);
  assert.ok(run.state.invitations.every(i => i.sourceSelfIds.length === 0));
  assert.equal(run.state.ledger.burned, 0);
  assert.ok(run.assumptions.some(a => a.includes('does not measure the unrestricted maximum')));
  assert.ok(run.assumptions.some(a => a.includes('no own-Claim')));
});

test('deterministic manifest/seed invariance/inert result reads are explicit and snapshot opt-out is respected', () => {
  const cfg = config(), a = runPbExperiment(cfg), b = runPbExperiment({ ...cfg, seed: 'different-software-label' });
  assert.deepEqual(a.randomness, PB_RANDOMNESS); assert.equal(a.randomness.generator, 'none');
  assert.deepEqual(a.actions, b.actions); assert.deepEqual(a.history, b.history); assert.deepEqual(a.state, b.state);
  JSON.stringify(a); Object.keys(a.state); assert.deepEqual(runPbExperiment(cfg), a);
  const minimal = runPbExperiment({ ...cfg, includeState: false });
  assert.equal(Object.hasOwn(minimal, 'state'), false); assert.deepEqual(minimal.history, a.history);
});

test('actual v2 admission still refuses full-state P/b snapshots rather than silently dropping protocol metadata', () => {
  const cfg = config();
  assert.throws(() => registerHypothesis({ id: 'pb-software-refusal-only', statement: 'not a programme method', kind: 'association',
    base: cfg, statistic: { metric: 'pb.created', summary: 'endpoint' }, arms: { one: {} },
    claims: [{ id: 'present', role: 'presence', contrast: { one: 1 }, direction: 'greater' }], replicas: 5, exploration: { seeds: [] } }),
  /scalar statistics, not protocol snapshots/);
});
