import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceRelay, accountabilitySnapshot } from '../src/accountability.mjs';
import { actObservationEnvironment } from '../src/act-observations.mjs';
import { experimentConfig } from '../src/experiment.mjs';
import { digestOf } from '../src/provenance.mjs';
import { causalWorld, runWalkthrough } from '../examples/causal-walkthroughs.mjs';

function setup({ valid = true, genuine = true, profile = 'good-faith', ordinary = 1, guarantor = 1,
  capacity = 2, sourceBudget = 12, sponsorBudget = 12, traceLimit = 200, claim = 'act-defect', reference = {} } = {}) {
  const world = causalWorld();
  const native = world.model.selfId(world.acts.Mira);
  const rates = Object.fromEntries(['self-id', 'invitation', 'guarantee'].map(kind => [kind,
    { ordinary: { valid: ordinary, invalid: ordinary }, guarantor: { valid: guarantor, invalid: guarantor } }]));
  const facts = { subjects: [{ id: native.subject, genuine, behaviorProfile: profile }],
    acts: [{ id: native.id, subject: native.subject, kind: 'self-id', recordedAt: native.recordedAt, valid, ...reference }] };
  const environment = actObservationEnvironment(facts, { seed: 'act-relay-software-only', rates });
  const draws = [];
  const port = Object.freeze({ ...environment, observe(request) { draws.push(structuredClone(request)); return environment.observe(request); } });
  const rules = experimentConfig({ disputes: { enabled: true, stakeBacking: 'reserved' } }).disputes;
  const relay = new EvidenceRelay(world.model, { claim, rules, traceLimit, actors: [
    { id: 'Outside', subject: null, budget: sourceBudget, reviewCapacity: 0 },
    { id: 'Aster', subject: 'Aster', budget: sourceBudget, reviewCapacity: capacity },
    { id: 'Bela', subject: 'Bela', budget: sponsorBudget, reviewCapacity: capacity },
  ] });
  return { ...world, relay, port, draws };
}
const source = { role: 'ordinary', opportunity: 'source-look', sourceGroup: 'public-media' };
const review = { role: 'guarantor', opportunity: 'sponsor-look', sourceGroup: 'declared-other-source' };
function packaged(world, actor = 'Aster') {
  const observation = world.relay.observeAct(actor, world.acts.Mira, world.port, { ...source, role: actor === 'Outside' ? 'ordinary' : 'guarantor' });
  assert.ok(observation.ok);
  return world.relay.package(actor, [observation.value]).value;
}
function reviewed(world, sponsor = 'Bela', sourceActor = 'Aster') {
  const id = packaged(world, sourceActor);
  assert.ok(world.relay.route(sourceActor, id, sponsor).ok);
  assert.ok(world.relay.reviewAct(sponsor, id, world.port, review).ok);
  return id;
}

test('funded genuine/profile/act combinations relay evidence without becoming false-person allegations or sanctions', () => {
  const outputs = [];
  for (const [genuine, valid, profile] of [[true, true, 'good-faith'], [true, false, 'good-faith'], [true, true, 'adversarial'], [false, false, 'adversarial']]) {
    const world = setup({ genuine, valid, profile });
    const before = accountabilitySnapshot(world.model);
    const id = reviewed(world);
    const item = world.relay.snapshot().packages[0];
    assert.equal(item.claim, 'act-defect');
    assert.equal(item.selfId, world.acts.Mira);
    assert.equal(item.subject, 'Mira');
    const attempted = world.relay.sponsor('Bela', id);
    assert.equal(attempted.reason, 'act-defect-adjudication-unimplemented');
    assert.throws(() => world.relay.resolve('relay-case:forged', true), /cannot use identity verdict/);
    assert.equal(world.relay.snapshot().cases.length, 0);
    assert.deepEqual(accountabilitySnapshot(world.model), before);
    assert.deepEqual(world.draws, [
      { act: world.acts.Mira, observer: 'Aster', role: 'guarantor', atHour: 72, opportunity: 'source-look' },
      { act: world.acts.Mira, observer: 'Bela', role: 'guarantor', atHour: 72, opportunity: 'sponsor-look' },
    ]);
    assert.deepEqual(world.relay.snapshot().actors.map(row => row.spent), [0, 3, 2]);
    outputs.push({ relay: world.relay.snapshot(), trace: world.relay.trace() });
  }
  for (const output of outputs) assert.deepEqual(output, outputs[0], 'fixed received evidence/observer profiles isolate hidden labels');
});

test('negative reviews and same declared source refuse; valid-act false suspicion and invalid-act misses remain possible', () => {
  for (const valid of [false, true]) {
    const missed = setup({ valid, ordinary: 0, guarantor: 0 });
    const id = packaged(missed);
    assert.equal(missed.relay.snapshot().observations[0].suspicious, false);
    missed.relay.route('Aster', id, 'Bela');
    assert.equal(missed.relay.reviewAct('Bela', id, missed.port, review).reason, 'review-not-suspicious');
    assert.equal(missed.relay.sponsor('Bela', id).reason, 'no-reviewed-open-route');
    assert.equal(missed.relay.snapshot().cases.length, 0);
    const shared = setup({ valid });
    const sharedId = packaged(shared);
    shared.relay.route('Aster', sharedId, 'Bela');
    assert.equal(shared.relay.reviewAct('Bela', sharedId, shared.port, { ...review, sourceGroup: source.sourceGroup }).reason, 'review-source-not-independent');
    assert.equal(shared.relay.snapshot().cases.length, 0);
  }
});

test('unavailable/conflicted/capacity/work blocks never acquire a sponsor signal; unfunded source never acquires any signal', () => {
  for (const [config, options, reason, routed = true] of [
    [{}, {}, 'no-pending-route', false],
    [{}, { available: false }, 'missed-notification-or-unavailable'],
    [{}, { conflicted: true }, 'disclosed-conflict'],
    [{ capacity: 0 }, {}, 'review-capacity-exhausted'],
    [{ sponsorBudget: 0 }, {}, 'work-budget-exhausted'],
  ]) {
    const world = setup(config);
    const id = packaged(world);
    if (routed) world.relay.route('Aster', id, 'Bela');
    assert.equal(world.relay.reviewAct('Bela', id, world.port, review, options).reason, reason);
    assert.equal(world.draws.length, 1);
    assert.equal(world.relay.trace().records.at(-1).visible.observation, null);
    assert.equal(world.relay.snapshot().packages[0].routes[0]?.review ?? null, null);
  }
  const world = setup({ sourceBudget: 0 });
  assert.equal(world.relay.observeAct('Aster', world.acts.Mira, world.port, source).reason, 'work-budget-exhausted');
  assert.equal(world.draws.length, 0);
  assert.equal(world.relay.trace().records[0].visible.suspicious, null);
  assert.equal(world.relay.snapshot().observations.length, 0);
});

test('native reference/schema/mode rejection is inert and never passes evaluator fields or caller timestamps through', () => {
  for (const reference of [{ kind: 'invitation' }, { recordedAt: 49 }, { id: 'not-native' }]) {
    const world = setup({ reference });
    const before = world.relay.snapshot();
    assert.throws(() => world.relay.observeAct('Aster', world.acts.Mira, world.port, source), /matching native/);
    assert.deepEqual(world.relay.snapshot(), before);
    assert.equal(world.draws.length, 0);
  }
  const world = setup();
  const before = world.relay.snapshot();
  for (const extra of [{ valid: true }, { genuine: false }, { atHour: 48 }, { role: 'judge' }, { opportunity: '' }, { sourceGroup: '' }]) {
    assert.throws(() => world.relay.observeAct('Aster', world.acts.Mira, world.port, { ...source, ...extra }));
  }
  assert.deepEqual(world.relay.snapshot(), before);
  assert.equal(world.draws.length, 0);
  assert.throws(() => world.relay.observeAct('Outside', world.acts.Mira, world.port, { ...source, role: 'guarantor' }), /recorded guarantor/);
  assert.throws(() => world.relay.observeAct('unknown', world.acts.Mira, world.port, source), /unknown relay actor/);
  const legacy = setup({ claim: 'false-identity' });
  assert.throws(() => legacy.relay.observeAct('Aster', legacy.acts.Mira, legacy.port, source), /act-defect relay/);
  assert.throws(() => setup({ claim: 'automatic-fraud' }), /unsupported relay claim/);
  const broken = setup();
  const modelBefore = accountabilitySnapshot(broken.model);
  const leaking = { ...broken.port, observe: () => ({ suspicious: true, valid: false }) };
  assert.throws(() => broken.relay.observeAct('Aster', broken.acts.Mira, leaking, source), /evaluator-only/);
  assert.deepEqual(accountabilitySnapshot(broken.model), modelBefore);
  assert.equal(broken.relay.snapshot().observations.length, 0);
  assert.equal(broken.relay.snapshot().actors.find(row => row.id === 'Aster').spent, 1);
  assert.equal(broken.relay.trace().records[0].outcome.reason, 'unexpected-error');
  assert.equal(broken.relay.trace().records[0].visible.suspicious, null);
});

test('external discovery grants no XP; equal-XP and missing-stake gates survive before the act-merits guard', () => {
  const external = setup();
  const before = accountabilitySnapshot(external.model);
  const id = packaged(external, 'Outside');
  assert.equal(external.relay.route('Outside', id, 'Outside').reason, 'sponsor-has-no-protocol-membership');
  assert.equal(external.relay.route('Outside', id, 'missing').reason, 'no-sponsor');
  assert.deepEqual(accountabilitySnapshot(external.model), before);
  assert.throws(() => external.model.subject('Outside'), /unknown subject/);
  const equal = setup();
  assert.equal(equal.relay.sponsor('Aster', reviewed(equal, 'Aster', 'Outside')).reason, 'challenge XP gate');
  const poor = setup();
  const poorId = reviewed(poor);
  poor.model.transferFacy('Bela', 'Aster', poor.model.subject('Bela').liquidFacy);
  const transferred = accountabilitySnapshot(poor.model);
  assert.equal(poor.relay.sponsor('Bela', poorId).reason, 'insufficient challenge stake');
  assert.deepEqual(accountabilitySnapshot(poor.model), transferred);
});

test('trace limits, inert inspection and repeated same-key environmental requests preserve the paid relay path', () => {
  const outputs = [];
  for (const traceLimit of [0, 1, 200]) {
    const world = setup({ traceLimit });
    const request = { act: world.acts.Mira, observer: 'Bela', role: 'guarantor', atHour: 72, opportunity: 'sponsor-look' };
    for (let i = 0; i < 3; i++) { world.port.observe(request); world.relay.snapshot(); world.relay.trace(); }
    const id = reviewed(world);
    const result = world.relay.sponsor('Bela', id);
    outputs.push({ relay: world.relay.snapshot(), model: accountabilitySnapshot(world.model), result });
  }
  // Trace references are deterministic even when records are not retained.
  assert.deepEqual(outputs[0], outputs[1]);
  assert.deepEqual(outputs[1], outputs[2]);
});

test('all ten legacy walkthroughs preserve pre-change canonical output digests except implementation provenance', () => {
  // Captured at ad28fb2 before changing accountability.mjs; existing supplied-input software fixtures, not research labels.
  const expected = {
    'support-finalized': 'c5b436e0d909d25a91b0c1c866c1ca26d4dd2f6d9b58df55be782082210d32df',
    'support-vetoed': 'bb19615a9cdcf0cda5e7051344952572511d1bb2fa4d5e5939927608ece0ddab',
    'early-veto': 'a1d32b9bf89579378590a0b5de403b26b0138b273c3d5d172d61ea170ee9f8cc',
    'missed-veto': '1b77831a65dd6a25eff185bda0c773282bfa117d93905c30fbc115fc063958c8',
    'outsider-confirmed': '99dc9117f68d6714474bab73bbecd98831ac21edadee3bc3af2196b5585f93b8',
    'outsider-refused': '2acd274271d072e14c9d1e7f9bce1c4ad1aef625a79d40aa76e361652ac0bbf1',
    'false-allegation-rejected': '9931bc1750007b8439cbef81c6f04e46d0c87ed7c3c4261552df0eaf9211d03e',
    'false-allegation-upheld': 'f424f5e55fc14cf1734a168f43b84027df629459740b7ead45a98f8bcbc75620',
    'authority-boundary': '1a000dd9742c2936e2f6c0c5e11c6f974ab7061821e82c662d53733e9dd134de',
    'neglect-restored': 'fca33479cfbfdb09a5cf727b6fec0ba10a27d5f6824560624af5983415d06df2',
  };
  for (const [name, digest] of Object.entries(expected)) {
    const { provenance, ...run } = runWalkthrough(name);
    assert.equal(digestOf(run), digest, name);
  }
});
