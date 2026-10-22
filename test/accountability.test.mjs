import test from 'node:test';
import assert from 'node:assert/strict';
import { CausalJournal, EvidenceRelay, accountabilitySnapshot } from '../src/accountability.mjs';
import { experimentConfig } from '../src/experiment.mjs';
import { causalWorld, runWalkthrough, WALKTHROUGHS } from '../examples/causal-walkthroughs.mjs';

function setup({ budget = 12, capacity = 2, traceLimit = 200, disputeOverrides = {} } = {}) {
  const world = causalWorld();
  const rules = experimentConfig({ disputes: { enabled: true, stakeBacking: 'reserved', ...disputeOverrides } }).disputes;
  const relay = new EvidenceRelay(world.model, { traceLimit, rules, actors: [
    { id: 'Outside', subject: null, budget, reviewCapacity: 0 },
    { id: 'Aster', subject: 'Aster', budget, reviewCapacity: capacity },
    { id: 'Bela', subject: 'Bela', budget, reviewCapacity: capacity },
  ] });
  return { ...world, relay };
}
function packageFor({ relay, acts }) {
  return relay.package('Outside', [relay.observe('Outside', acts.Mira, { suspicious: true, sourceGroup: 'media' }).value]).value;
}
function reviewed(world, sponsor = 'Bela') {
  const id = packageFor(world);
  world.relay.route('Outside', id, sponsor);
  world.relay.review(sponsor, id, { suspicious: true, sourceGroup: sponsor + '-check' });
  return id;
}
function withoutTrace(run) { const { trace, ...rest } = run; return rest; }

test('all declared walkthroughs are identical with tracing off, on and truncated', () => {
  for (const name of WALKTHROUGHS) {
    const full = runWalkthrough(name);
    const off = runWalkthrough(name, { traceLimit: 0 });
    const short = runWalkthrough(name, { traceLimit: 1 });
    assert.deepEqual(withoutTrace(off), withoutTrace(full), name);
    assert.deepEqual(withoutTrace(short), withoutTrace(full), name);
    assert.equal(off.trace.records.length, 0);
    assert.equal(short.trace.records.length, 1);
    assert.equal(short.trace.omitted + 1, full.trace.records.length);
    assert.ok(full.trace.records.every(record => record.basis && record.mechanisms.length));
  }
});

test('external discovery does not grant membership/XP or mutate protocol state; reads and failed input are inert', () => {
  const world = setup();
  const before = accountabilitySnapshot(world.model);
  const id = packageFor(world);
  assert.equal(world.relay.route('Outside', id, 'Outside').reason, 'sponsor-has-no-protocol-membership');
  assert.equal(world.relay.route('Outside', id, 'missing').reason, 'no-sponsor');
  for (let i = 0; i < 3; i++) { world.relay.trace(); world.relay.snapshot(); accountabilitySnapshot(world.model); }
  assert.deepEqual(accountabilitySnapshot(world.model), before);
  assert.throws(() => world.model.subject('Outside'), /unknown subject/);
  assert.throws(() => world.relay.observe('Outside', world.acts.Mira, { suspicious: true, sourceGroup: 'media', genuine: false }), /evaluator-only/);
  assert.throws(() => world.relay.review('Bela', id, { suspicious: true, sourceGroup: 'new' }, { genuine: false }), /unknown review option/);
  assert.throws(() => world.relay.observe('Outside', 'forged-event', { suspicious: true, sourceGroup: 'media' }), /unknown Self-ID/);
  assert.equal(world.relay.package('Outside', ['forged-observation']).reason, 'unknown-supporting-observation');
  assert.deepEqual(accountabilitySnapshot(world.model), before);
});

test('circulation cannot launder one observation into independent corroboration or duplicate cases', () => {
  const world = setup();
  const observation = world.relay.observe('Outside', world.acts.Mira, { suspicious: true, sourceGroup: 'shared-source' }).value;
  const id = world.relay.package('Outside', [observation, observation]).value;
  const duplicate = world.relay.package('Outside', [observation]);
  assert.equal(duplicate.reason, 'duplicate-package');
  assert.equal(duplicate.value, id);
  world.relay.route('Outside', id, 'Bela');
  assert.equal(world.relay.route('Outside', id, 'Bela').reason, 'duplicate-route');
  assert.equal(world.relay.review('Bela', id, { suspicious: true, sourceGroup: 'shared-source' }).reason, 'review-source-not-independent');
  assert.equal(world.relay.sponsor('Bela', id).reason, 'no-reviewed-open-route');
  assert.equal(world.relay.snapshot().packages.length, 1);
  assert.deepEqual(world.relay.snapshot().packages[0].sourceGroups, ['shared-source']);
  assert.equal(world.relay.snapshot().cases.length, 0);
});

test('weak/conflicted sponsors refuse, and an explicitly rerouted independent sponsor can open and resolve', () => {
  for (const conflicted of [false, true]) {
    const world = setup();
    const id = packageFor(world);
    world.relay.route('Outside', id, 'Aster');
    const response = world.relay.review('Aster', id, { suspicious: false, sourceGroup: 'Aster-check' }, { conflicted });
    assert.equal(response.reason, conflicted ? 'disclosed-conflict' : 'review-not-suspicious');
    world.relay.route('Outside', id, 'Bela');
    assert.ok(world.relay.review('Bela', id, { suspicious: true, sourceGroup: 'Bela-check' }).ok);
    const opened = world.relay.sponsor('Bela', id);
    assert.ok(opened.ok);
    assert.equal(world.model.ledger().stakeVault, 1);
    const before = world.model.audit();
    assert.ok(world.relay.resolve(opened.value, true).ok);
    assert.equal(world.model.subject('Mira').identityStatus, 'false');
    assert.equal(world.model.ledger().minted, before.minted);
    assert.equal(world.model.ledger().stakeVault, 0);
    assert.equal(world.relay.snapshot().cases[0].consequences.voidedActs, 1);
    world.model.audit();
    const settled = accountabilitySnapshot(world.model);
    assert.equal(world.relay.resolve(opened.value, true).reason, 'case-already-resolved');
    assert.deepEqual(accountabilitySnapshot(world.model), settled);
    const trace = world.relay.trace().records;
    const final = trace.find(record => record.action === 'adjudicate-and-enforce' && record.outcome.ok);
    assert.ok(final.supports.length && final.protocolEvents.length);
  }
});

test('capacity, work exhaustion and unavailable review stop only the evaluated path, preserving null pending stages', () => {
  const unavailable = setup();
  const id = packageFor(unavailable);
  unavailable.relay.route('Outside', id, 'Bela');
  assert.equal(unavailable.relay.review('Bela', id, { suspicious: true, sourceGroup: 'not-read' }, { available: false }).reason, 'missed-notification-or-unavailable');
  const stopped = unavailable.relay.trace().records.at(-1);
  assert.equal(stopped.visible.observation, null);
  assert.equal(stopped.work, 0);
  assert.equal(unavailable.relay.snapshot().packages[0].routes[0].review, null);
  unavailable.model.advanceTo(96);
  assert.ok(unavailable.relay.review('Bela', id, { suspicious: true, sourceGroup: 'independent' }).ok);
  const opened = unavailable.relay.sponsor('Bela', id);
  assert.equal(unavailable.relay.snapshot().cases[0].resolvedAt, null);
  assert.equal(unavailable.model.audit().stakeVault, 1);
  assert.ok(opened.ok);
  const scarce = setup({ capacity: 0 });
  const scarceId = packageFor(scarce);
  scarce.relay.route('Outside', scarceId, 'Bela');
  assert.equal(scarce.relay.review('Bela', scarceId, { suspicious: true, sourceGroup: 'review' }).reason, 'review-capacity-exhausted');
  const exhausted = setup({ budget: 0 });
  assert.equal(exhausted.relay.observe('Outside', exhausted.acts.Mira, { suspicious: true, sourceGroup: 'media' }).reason, 'work-budget-exhausted');
  assert.equal(exhausted.relay.snapshot().actors[0].denied, 1);
});

test('formal access rechecks current strict XP and liquid stake, and moot cases refund custody', () => {
  const equal = setup();
  const equalId = reviewed(equal, 'Aster');
  assert.equal(equal.relay.sponsor('Aster', equalId).reason, 'challenge XP gate');
  const poor = setup();
  const poorId = reviewed(poor);
  poor.model.transferFacy('Bela', 'Aster', poor.model.subject('Bela').liquidFacy);
  assert.equal(poor.relay.sponsor('Bela', poorId).reason, 'insufficient challenge stake');
  const moot = setup();
  const caseId = moot.relay.sponsor('Bela', reviewed(moot)).value;
  const before = moot.model.subject('Bela');
  moot.model.invalidateIdentity('Mira');
  assert.equal(moot.relay.resolve(caseId, true).reason, 'moot-target-not-accepted');
  assert.equal(moot.model.subject('Bela').liquidFacy, before.liquidFacy + 1);
  assert.equal(moot.model.subject('Bela').xp, before.xp);
  assert.equal(moot.model.audit().stakeVault, 0);
});

test('hidden world labels change evaluation, never identical observations, sponsor decisions or enforcement', () => {
  const real = runWalkthrough('outsider-confirmed');
  const falseReport = runWalkthrough('false-allegation-upheld');
  for (const field of ['before', 'after', 'relay', 'trace']) assert.deepEqual(real[field], falseReport[field], field);
  assert.equal(real.headlines.cases.wrongfulInvalidations, 0);
  assert.equal(falseReport.headlines.cases.wrongfulInvalidations, 1);
  assert.notDeepEqual(real.evaluation, falseReport.evaluation);
});

test('losing a false allegation closes an exercised authority feedback into the next decision', () => {
  const run = runWalkthrough('false-allegation-rejected');
  const gates = run.trace.records.filter(record => record.action === 'formal-challenge');
  assert.deepEqual(gates.map(record => record.outcome.ok), [false, true, false]);
  assert.equal(gates[1].preconditions.challengerXp, 7);
  assert.equal(gates[2].preconditions.challengerXp, 3);
  assert.equal(gates[2].preconditions.targetXp, 3);
  assert.equal(gates[2].outcome.reason, 'challenge XP gate');
  assert.equal(run.headlines.genuineRetained.accepted, 4);
  assert.equal(run.headlines.monetaryChanges.burned, 1);
  assert.equal(run.headlines.cases.unresolved, 0);
  assert.equal(run.relay.packages.filter(item => item.status === 'open').length, 1); // open evidence is not an open funded case
});

test('public null actors cannot impersonate adjudication or create budget-free evidence', () => {
  const world = setup();
  const id = packageFor(world);
  const before = world.relay.snapshot();
  const journal = world.relay.trace();
  assert.throws(() => world.relay.observe(null, world.acts.Mira, { suspicious: true, sourceGroup: 'media' }), /unknown relay actor/);
  assert.throws(() => world.relay.package(null, before.packages[0].observationIds), /unknown relay actor/);
  assert.throws(() => world.relay.route(null, id, 'Bela'), /unknown relay actor/);
  assert.deepEqual(world.relay.snapshot(), before);
  assert.deepEqual(world.relay.trace(), journal);
});

test('whole-verdict overflow rejects before stake/XP/chain mutations and leaves an honestly pending case', () => {
  const world = setup({ disputeOverrides: { fineMode: 'fixed', fine: Number.MAX_SAFE_INTEGER, rewardShare: 0 } });
  const caseId = world.relay.sponsor('Bela', reviewed(world)).value;
  const before = accountabilitySnapshot(world.model);
  const workflow = world.relay.snapshot();
  assert.throws(() => world.relay.resolve(caseId, true), /overflow aggregate debt/);
  assert.deepEqual(accountabilitySnapshot(world.model), before);
  assert.deepEqual(world.relay.snapshot(), workflow);
  assert.equal(world.relay.snapshot().stakes.openCases, 1);
  assert.equal(world.relay.snapshot().cases[0].resolvedAt, null);
  const last = world.relay.trace().records.at(-1);
  assert.equal(last.error.name, 'RangeError');
  assert.equal(last.outcome.reason, 'unexpected-error');
  assert.deepEqual(last.protocolEvents, []);
  assert.throws(() => world.relay.resolve(caseId, true), /overflow aggregate debt/);
  assert.deepEqual(accountabilitySnapshot(world.model), before);
});

test('exact aggregate-debt boundary remains usable and projects a real pending stake refund', () => {
  const world = setup({ disputeOverrides: { fineMode: 'fixed', fine: 2, rewardShare: 0 } });
  const existing = Number.MAX_SAFE_INTEGER - 4;
  world.model.penalize('Cato', { fine: existing + world.model.subject('Cato').liquidFacy, halveXp: false });
  assert.equal(world.model.audit().debt, existing);
  const caseId = world.relay.sponsor('Bela', reviewed(world)).value;
  assert.equal(world.model.subject('Bela').liquidFacy, 1);
  assert.ok(world.relay.resolve(caseId, true).ok);
  assert.equal(world.model.audit().debt, Number.MAX_SAFE_INTEGER);
  assert.equal(world.model.audit().stakeVault, 0);
});

test('bounded journal records unexpected failures and rethrows rather than treating them as policy refusals', () => {
  assert.throws(() => new CausalJournal(-1), /traceLimit/);
  const { model } = causalWorld();
  const journal = new CausalJournal(1);
  assert.throws(() => journal.step(model, { actor: 'diagnostic', action: 'failure' }, () => { throw new Error('programming error'); }), /programming error/);
  assert.equal(journal.snapshot().records.length, 1);
  assert.equal(journal.snapshot().records[0].error.message, 'programming error');
  assert.equal(journal.snapshot().records[0].basis, 'execution exception, not a policy decision');
});

test('paired removal of losing-challenger XP halving changes the later gate, not evidence or liquid resources', () => {
  const results = [];
  for (const loserHalvesXp of [true, false]) {
    const world = setup({ disputeOverrides: { loserHalvesXp } });
    const first = world.relay.sponsor('Bela', reviewed(world));
    world.relay.resolve(first.value, false);
    world.model.advanceTo(96);
    const act = world.model.createSelfId('Mira', world.model.registerArtifact('Mira'));
    const observation = world.relay.observe('Outside', act, { suspicious: true, sourceGroup: 'later-media' }).value;
    const id = world.relay.package('Outside', [observation]).value;
    world.relay.route('Outside', id, 'Bela');
    world.relay.review('Bela', id, { suspicious: true, sourceGroup: 'later-independent-check' });
    const before = world.model.subject('Bela');
    const decision = world.relay.sponsor('Bela', id);
    results.push({ before, decision, evidence: world.relay.snapshot().observations, work: world.relay.snapshot().actors.map(actor => actor.spent) });
  }
  assert.deepEqual(results.map(row => row.before.liquidFacy), [1, 1]);
  assert.deepEqual(results.map(row => row.before.xp), [3, 7]);
  assert.deepEqual(results.map(row => row.decision.ok), [false, true]);
  assert.deepEqual(results[0].evidence, results[1].evidence);
  assert.deepEqual(results[0].work, results[1].work);
  // This is necessity of an encoded gate in one fixture, not registered emergence or a protocol option.
});
