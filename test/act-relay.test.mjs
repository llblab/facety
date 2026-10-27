import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceRelay, accountabilitySnapshot } from '../src/accountability.mjs';
import { actObservationEnvironment } from '../src/act-observations.mjs';
import { experimentConfig } from '../src/experiment.mjs';
import { FacetyModel, DAY } from '../src/model.mjs';
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

test('all ten legacy walkthroughs preserve economic digests except provenance and additive D54/D55/D56 state', () => {
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
    // Additive source/chain metadata and invitation snapshots are tested separately; no old economic field is dropped.
    const legacy = value => {
      if (Array.isArray(value)) return value.map(legacy);
      if (!value || typeof value !== 'object') return value;
      const invitation = Object.hasOwn(value, 'sourceSelfId') && Object.hasOwn(value, 'creator');
      const selfId = Object.hasOwn(value, 'xpRecipients') && Object.hasOwn(value, 'recordedAt');
      return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'xpCredit' && key !== 'xpHalvings'
        && !(invitation && key === 'guarantors') && !(selfId && (key === 'chainIndex' || key === 'previousSelfId')))
        .map(([key, child]) => [key, legacy(child)]));
    };
    assert.equal(digestOf(legacy(run)), digest, name);
  }
});

function timedWorld(valid = false, participationReference = 'd77-timed-act-converted/v1') {
  const counts = { author: 3, challenger: 8, defender: 12, creator: 1, giver: 1 };
  const model = new FacetyModel({ genesis: Object.keys(counts), policy: { xpFinality: 'maturity', guaranteeFee: 1 } });
  for (let day = 0; day < 12; day++) {
    const fresh = Object.keys(counts).filter(id => counts[id] > day).map(id => [id, model.createSelfId(id, model.registerArtifact(id))]);
    model.advanceTo((day + 1) * DAY);
    for (const [id, act] of fresh) model.convertToCollector(id, act);
  }
  const original = model.selfIds().filter(act => act.subject === 'author'), target = original[1];
  const rates = Object.fromEntries(['self-id', 'invitation', 'guarantee'].map(kind => [kind, { ordinary: { valid: 1, invalid: 1 }, guarantor: { valid: 1, invalid: 1 } }]));
  const environment = actObservationEnvironment({ subjects: Object.keys(counts).map(id => ({ id, genuine: true, behaviorProfile: 'supplied' })),
    acts: [{ id: target.id, subject: 'author', kind: 'self-id', recordedAt: target.recordedAt, valid }] }, { seed: 'd77-timed-software', rates });
  const options = { claim: 'act-defect', participationReference, actCaseReference: { formalCouncil: 'absent' }, traceLimit: 200,
    rules: experimentConfig({ disputes: { enabled: true, procedure: 'chekharda-timed', stakeBacking: 'reserved', councilDepth: 0, stakeGrowth: 0.1 } }).disputes,
    actors: [{ id: 'Outside', subject: null, budget: 50, reviewCapacity: 0 }, ...Object.keys(counts).map(id => ({ id, subject: id, budget: 50, reviewCapacity: 10 }))] };
  const relay = new EvidenceRelay(model, options);
  const observation = relay.observeAct('Outside', target.id, environment, { role: 'ordinary', opportunity: 'initial', sourceGroup: 'public' }).value;
  const packageId = relay.package('Outside', [observation]).value;
  assert.ok(relay.route('Outside', packageId, 'challenger').ok);
  assert.ok(relay.reviewAct('challenger', packageId, environment, { role: 'ordinary', opportunity: 'review', sourceGroup: 'declared-other' }).ok);
  return { model, relay, original, target, options, packageId };
}
function timedState(world) { return { model: accountabilitySnapshot(world.model), participation: world.model.disputeParticipations(), resolutions: world.model.selfIdResolutions() }; }
function openTimed(world) { const opened = world.relay.sponsor('challenger', world.packageId); assert.ok(opened.ok, opened.reason); return opened.value; }
function nonpartyLife(world) {
  const { model } = world;
  model.confirmGuarantee('creator', model.proposeGuarantee('giver', 'creator'));
  return model.createSelfId('creator', model.registerArtifact('creator'));
}

test('timed ACT positions derive source correction or rejection with D77 parties paused and actual nonparty growth, never evaluator truth', t => {
  const rows = [];
  for (const opposed of [false, true]) {
    const states = [];
    for (const valid of [false, true]) {
      const world = timedWorld(valid), { model, relay, original, target } = world, caseId = openTimed(world);
      assert.equal(relay.snapshot().cases[0].selfId, target.id);
      assert.equal(relay.snapshot().cases[0].deadline, 456);
      for (const id of ['author', 'challenger']) {
        const artifact = model.registerArtifact(id), before = timedState(world);
        assert.throws(() => model.createSelfId(id, artifact), /activity restriction/); assert.deepEqual(timedState(world), before);
      }
      const act = nonpartyLife(world);
      if (opposed) {
        model.advanceTo(292); assert.ok(relay.enterActCase('defender', caseId).ok);
        assert.equal(relay.snapshot().cases[0].deadline, 460);
        const artifact = model.registerArtifact('defender'); assert.throws(() => model.createSelfId('defender', artifact), /activity restriction/);
        assert.equal(model.ledger().stakeVault, 3);
      }
      model.advanceTo(312); assert.equal(model.selfId(act).xpCredit.at, 312); assert.equal(model.selfId(act).status, 'unspent');
      const invitation = model.createInvitation('creator', act, 'newcomer');
      model.advanceTo(336); model.acceptInvitation(invitation, 'newcomer');
      assert.equal(model.subjects().length, 6); assert.equal(model.audit().minted, 26); assert.equal(model.audit().burned, 1);
      model.advanceTo(opposed ? 456 : 455);
      assert.equal(relay.finalizeActCase(caseId).reason, 'act-case-response-window-open');
      model.advanceTo(opposed ? 460 : 456);
      assert.equal(relay.finalizeActCase(caseId).reason, 'act-case-exact-deadline-unsupported');
      model.advanceTo(opposed ? 461 : 457);
      assert.ok(relay.finalizeActCase(caseId).ok);
      const record = relay.snapshot().cases[0], money = model.audit();
      assert.equal(record.upheld, !opposed); assert.equal(record.sourceOutcome.selfId, target.id);
      assert.equal(record.sourceOutcome.initiator, 'challenger'); assert.equal(record.sourceOutcome.caseId, caseId);
      assert.equal(record.sourceOutcome.punitivePenaltiesApplied, false);
      assert.deepEqual(model.selfId(original[0].id), original[0]);
      assert.ok(model.subjects().every(subject => subject.identityStatus === 'accepted'));
      assert.equal(model.subject('author').xp, opposed ? 3 : 1); assert.equal(model.subject('challenger').xp, opposed ? 4 : 8);
      assert.equal(model.subject('defender').liquidFacy, opposed ? 13 : 12);
      assert.equal(record.sourceOutcome.acts.length, opposed ? 0 : 2);
      assert.equal(record.sourceOutcome.recovery.collected, opposed ? 0 : 2);
      assert.equal(record.sourceOutcome.recovery.debtAdded, 0);
      assert.equal(money.minted, 26); assert.equal(money.burned, opposed ? 1 : 3); assert.equal(money.collector, opposed ? 24 : 22);
      assert.equal(money.feeVault, 1); assert.equal(money.stakeVault + money.emitterVault + money.debt, 0);
      assert.equal(model.subjects().reduce((sum, subject) => sum + subject.xp, 0), opposed ? 23 : 25);
      assert.ok(model.disputeParticipations().every(row => row.closedAt === model.now));
      const settled = timedState(world); assert.equal(relay.finalizeActCase(caseId).reason, 'case-already-resolved'); assert.deepEqual(timedState(world), settled);
      assert.throws(() => relay.resolve(caseId, !opposed), /cannot use identity verdict/);
      const state = { ...timedState(world), relay: relay.snapshot(), trace: relay.trace() }; states.push(state);
      rows.push({ opposed, evaluatorValid: valid, hour: model.now, finalDeadline: record.deadline, population: model.size,
        authorXp: model.subject('author').xp, challengerXp: model.subject('challenger').xp, defenderLiquid: model.subject('defender').liquidFacy,
        positions: record.positions, sourceOutcome: record.sourceOutcome, money, protocolDigest: digestOf(state), identitiesInvalidated: 0 });
    }
    assert.deepEqual(states[0], states[1], 'identical observations/actions cannot be corrected by private validity labels');
  }
  t.diagnostic('d77-timed-act ' + JSON.stringify({ rows, scientificWorlds: 0, scope: 'conditional procedural/source operability; supplied signal rates, not truth/security/human calibration' }));
});

test('timed ACT entry gates, queries, exact/late/duplicate operations cannot move clock or custody', () => {
  const world = timedWorld(), { model, relay } = world, caseId = openTimed(world);
  for (const [actor, reason] of [['Outside', 'entrant-has-no-protocol-membership'], ['author', 'act-case-target-or-repeat-entrant'],
    ['challenger', 'act-case-target-or-repeat-entrant'], ['giver', 'act-case-entry-XP-gate']]) {
    const before = timedState(world); assert.equal(relay.enterActCase(actor, caseId).reason, reason); assert.deepEqual(timedState(world), before);
    assert.equal(relay.snapshot().cases[0].deadline, 456);
  }
  model.transferFacy('defender', 'giver', 12);
  const before = timedState(world); assert.equal(relay.enterActCase('defender', caseId).reason, 'insufficient act-case stake'); assert.deepEqual(timedState(world), before);
  assert.throws(() => relay.enterActCase('giver', caseId, 'valid'), /recorded opposite side/);
  assert.throws(() => relay.finalizeActCase(caseId, true), /not a supplied verdict/);
  model.advanceTo(456); assert.equal(relay.enterActCase('defender', caseId).reason, 'act-case-exact-deadline-unsupported');
  model.advanceTo(457); assert.equal(relay.enterActCase('defender', caseId).reason, 'act-case-response-window-ended');
  assert.ok(relay.finalizeActCase(caseId).ok); assert.equal(relay.enterActCase('giver', caseId).reason, 'case-already-resolved');
});

test('a later nonparty can earn and mature before joining, but pending own sources refuse before new stake or D77 roster entry', () => {
  const world = timedWorld(), { model, relay } = world, caseId = openTimed(world);
  const own = model.createSelfId('defender', model.registerArtifact('defender'));
  model.advanceTo(292);
  const before = timedState(world);
  assert.equal(relay.enterActCase('defender', caseId).reason, 'D77 reference requires converted debt-free party sources');
  assert.deepEqual(timedState(world), before); assert.equal(relay.snapshot().cases[0].deadline, 456);
  model.advanceTo(312); model.convertToCollector('defender', own);
  assert.ok(relay.enterActCase('defender', caseId).ok); assert.equal(relay.snapshot().cases[0].deadline, 480);
  assert.equal(model.subject('defender').xp, 13); assert.deepEqual(model.disputeParticipations()[0].subjects, ['challenger', 'author', 'defender']);
  const artifact = model.registerArtifact('defender'); assert.throws(() => model.createSelfId('defender', artifact), /activity restriction/);
});

test('timed ACT final preflight refuses changed roster/custody/source/identity and debt overflow before any payout, source cut or release', () => {
  for (const mode of ['roster', 'custody', 'source', 'identity', 'overflow']) {
    const world = timedWorld(), { model, relay, target } = world, caseId = openTimed(world);
    if (mode === 'roster') model.addDisputeParticipant(caseId, 'giver');
    if (mode === 'custody') model.settleDisputeStake(caseId, 'challenger');
    if (mode === 'source') model.resolveSelfId(target.id, { caseId: 'external-trusted-case', initiator: 'challenger', upheld: true });
    if (mode === 'identity') model.invalidateIdentity('author');
    if (mode === 'overflow') {
      model.penalize('giver', { fine: Number.MAX_SAFE_INTEGER, halveXp: false }); model.penalize('giver', { fine: 1, halveXp: false });
      model.transferFacy('author', 'creator', 3);
    }
    model.advanceTo(457); const before = timedState(world);
    if (mode === 'overflow') assert.throws(() => relay.finalizeActCase(caseId), /overflow aggregate debt/);
    else assert.equal(relay.finalizeActCase(caseId).ok, false);
    assert.deepEqual(timedState(world), before); assert.equal(relay.snapshot().cases[0].resolvedAt, null);
    assert.equal(model.disputeParticipations()[0].closedAt, null);
  }
});

test('overlapping timed ACT cases keep the shared challenger paused while a released author resumes amid the other open case', () => {
  const world = timedWorld(), { model, relay } = world, first = openTimed(world);
  const source = model.selfIds().find(act => act.subject === 'giver');
  const observation = relay.observe('Outside', source.id, { suspicious: true, sourceGroup: 'other-public-act' }).value;
  const item = relay.package('Outside', [observation]).value;
  relay.route('Outside', item, 'challenger'); relay.review('challenger', item, { suspicious: true, sourceGroup: 'other-review' });
  const second = relay.sponsor('challenger', item); assert.ok(second.ok);
  assert.equal(model.ledger().stakeVault, 2);
  model.advanceTo(457); assert.ok(relay.finalizeActCase(first).ok);
  const artifact = model.registerArtifact('challenger'); assert.throws(() => model.createSelfId('challenger', artifact), /activity restriction/);
  model.createSelfId('author', model.registerArtifact('author'));
  assert.ok(relay.finalizeActCase(second.value).ok);
  model.createSelfId('challenger', artifact);
  assert.equal(model.selfIdResolutions().length, 2); assert.ok(model.disputeParticipations().every(row => row.closedAt === 457)); model.audit();
});

test('derived ACT source execution records uncollected principal as debt, not a fictional burn or refunded-stake income', () => {
  const world = timedWorld(), { model, relay } = world, caseId = openTimed(world);
  model.transferFacy('author', 'creator', 3);
  model.advanceTo(457); assert.ok(relay.finalizeActCase(caseId).ok);
  const source = relay.snapshot().cases[0].sourceOutcome;
  assert.deepEqual(source.recovery, { emitterBurn: 0, alreadyBurned: 0, requestedFromAuthor: 2, collected: 0, debtAdded: 2 });
  assert.equal(model.subject('author').debt, 2); assert.equal(model.subject('author').xp, 1);
  assert.equal(model.ledger().minted, 25); assert.equal(model.ledger().burned, 0); assert.equal(model.ledger().debt, 2);
  assert.equal(model.subject('challenger').liquidFacy, 8, 'the original reserved1 is refunded, not earned');
  assert.equal(model.disputeParticipations()[0].closedAt, 457); model.audit();
});

test('timed ACT profile requires its exact explicit subset and preserves the default act guard instead of inferring Council or merits', () => {
  const { model, options } = timedWorld();
  for (const override of [{ claim: 'false-identity' }, { actCaseReference: null }, { actCaseReference: { formalCouncil: 'present' } },
    { actCaseReference: { formalCouncil: 'absent', winner: true } }, ...['stakeGrowth', 'councilDepth', 'stake', 'disputeWindowHours'].map(key => ({ rules: { ...options.rules, [key]: 9 } }))])
    assert.throws(() => new EvidenceRelay(model, { ...options, ...override }), /unsupported timed act-case/);
  assert.throws(() => new EvidenceRelay(model, { ...options, participationReference: null, actCaseReference: null }), /one-step rules/);
  const old = setup(); assert.equal(old.relay.sponsor('Bela', reviewed(old)).reason, 'act-defect-adjudication-unimplemented');
});

function reviewedTimedSource(world, selfId) {
  const { relay } = world;
  const observation = relay.observe('Outside', selfId, { suspicious: true, sourceGroup: 'supplied-new-event' }).value;
  const packet = relay.package('Outside', [observation]).value;
  assert.ok(relay.route('Outside', packet, 'challenger').ok);
  assert.ok(relay.review('challenger', packet, { suspicious: true, sourceGroup: 'supplied-new-review' }).ok);
  return packet;
}

test('settled-history reference admits a NEW act after actual correction without restoring history or recollecting old principal; converted-v1 stays refused', () => {
  for (const profile of ['d77-timed-act-converted/v1', 'd77-timed-act-settled-history/v1']) {
    const world = timedWorld(false, profile), { model, relay, original } = world;
    const first = openTimed(world);
    model.advanceTo(457); assert.ok(relay.finalizeActCase(first).ok);
    const oldResolution = model.selfIdResolutions()[0], oldActs = original.map(act => model.selfId(act.id));
    assert.deepEqual(oldResolution.acts.map(act => act.selfId), original.slice(1).map(act => act.id));
    assert.equal(oldResolution.recovery.collected, 2);
    const next = [];
    for (const at of [481, 505]) {
      const act = model.createSelfId('author', model.registerArtifact('author'));
      next.push(act); model.advanceTo(at); model.convertToCollector('author', act);
    }
    assert.equal(model.subject('author').xp, 3); assert.equal(model.subject('author').liquidFacy, 3);
    assert.deepEqual(next.map(id => model.selfId(id).chainIndex), [4, 5]);
    assert.equal(model.selfId(next[0]).previousSelfId, original[2].id);
    const packet = reviewedTimedSource(world, next[0]), before = timedState(world), opened = relay.sponsor('challenger', packet);
    if (profile === 'd77-timed-act-converted/v1') {
      assert.equal(opened.reason, 'D77 reference requires converted debt-free party sources');
      assert.deepEqual(timedState(world), before); assert.equal(model.disputeParticipations().length, 1);
    } else {
      assert.ok(opened.ok, opened.reason);
      assert.throws(() => model.createSelfId('author', model.registerArtifact('author')), /open-dispute activity restriction/);
      model.advanceTo(674); assert.ok(relay.finalizeActCase(opened.value).ok);
      const later = model.selfIdResolutions()[1];
      assert.deepEqual(later.acts.map(act => act.selfId), next);
      assert.ok(later.acts.every(act => !oldResolution.acts.some(old => old.selfId === act.selfId)));
      assert.equal(later.recovery.collected, 2); assert.equal(later.recovery.debtAdded, 0);
      assert.equal(model.subject('author').xp, 1); assert.equal(model.subject('author').liquidFacy, 1);
      assert.equal(model.ledger().minted, 27); assert.equal(model.ledger().burned, 4); assert.equal(model.ledger().supply, 23);
      assert.equal(model.subject('challenger').liquidFacy, 8, 'two refunds are not earnings');
      assert.deepEqual(model.selfIdResolutions()[0], oldResolution);
      const after = timedState(world);
      assert.equal(relay.finalizeActCase(opened.value).ok, false); assert.deepEqual(timedState(world), after);
    }
    assert.deepEqual(original.map(act => model.selfId(act.id)), oldActs, 'old prefix/cancelled records/XP revocation are never rewritten');
    model.audit();
  }
});

test('canonical settled self-correction can belong to target or later entrant, but correcting an old source is never reopened', () => {
  for (const history of ['author', 'defender', 'uncredited-author']) {
    const subject = history === 'uncredited-author' ? 'author' : history;
    const world = timedWorld(false, 'd77-timed-act-settled-history/v1'), { model, relay, original } = world;
    const source = history === 'uncredited-author' ? model.selfId(model.createSelfId(subject, model.registerArtifact(subject)))
      : model.selfIds().find(act => act.subject === subject && (subject !== 'author' || act.id === original[1].id));
    const previous = model.resolveSelfId(source.id, { caseId: 'trusted-prior-self-correction', initiator: subject, upheld: true });
    const oldAct = model.selfId(source.id);
    assert.equal(oldAct.disposition, 'self-corrected');
    if (subject === 'author') {
      const packet = history === 'uncredited-author' ? reviewedTimedSource(world, source.id) : world.packageId;
      const before = timedState(world), rejected = relay.sponsor('challenger', packet);
      assert.equal(rejected.reason, 'Self-ID source is already corrected or voided'); assert.deepEqual(timedState(world), before);
      if (history === 'uncredited-author') { assert.equal(oldAct.xpCredit, null); model.advanceTo(312); }
      const act = model.createSelfId('author', model.registerArtifact('author'));
      model.advanceTo(model.now + DAY); model.convertToCollector('author', act);
      const opened = relay.sponsor('challenger', reviewedTimedSource(world, act)); assert.ok(opened.ok, opened.reason);
      model.advanceTo(model.now + 169); assert.ok(relay.finalizeActCase(opened.value).ok);
      assert.deepEqual(model.selfIdResolutions()[1].acts.map(row => row.selfId), [act]);
      assert.equal(model.selfIdResolutions()[1].recovery.collected, 1);
    } else {
      const caseId = openTimed(world);
      model.advanceTo(292); assert.ok(relay.enterActCase('defender', caseId).ok);
      assert.equal(model.subject('defender').xp, 11);
      model.advanceTo(461); assert.ok(relay.finalizeActCase(caseId).ok);
      assert.equal(model.selfIdResolutions()[1].upheld, false);
    }
    assert.deepEqual(model.selfIdResolutions()[0], previous); assert.deepEqual(model.selfId(source.id), oldAct);
    model.audit();
  }
});

test('settled-history is exact canonical D59 compatibility, not permission for veto/legacy void/pending/locked/invitation/debt sources', () => {
  for (const kind of ['pending', 'locked', 'veto', 'legacy-void', 'rejected-then-legacy-void', 'invitation', 'debt']) {
    const world = timedWorld(false, 'd77-timed-act-settled-history/v1'), { model, relay, original } = world;
    if (kind === 'debt') model.penalize('author', { fine: 4, halveXp: false });
    else if (kind.includes('legacy-void')) {
      if (kind.startsWith('rejected')) model.resolveSelfId(original[0].id, { caseId: 'rejected-not-settled', initiator: 'challenger', upheld: false });
      model.voidSelfIdChain('author', { fromAct: original[2].id });
    } else {
      if (['veto', 'invitation'].includes(kind)) model.confirmGuarantee('author', model.proposeGuarantee('giver', 'author'));
      const act = model.createSelfId('author', model.registerArtifact('author'));
      if (kind === 'locked') model.freezeSelfId(act, 'unrelated-lock');
      if (kind === 'veto') model.cancelSelfId('giver', act);
      if (kind === 'invitation') { model.advanceTo(312); model.createInvitation('author', act, 'unused-newcomer'); }
    }
    const before = timedState(world), rejected = relay.sponsor('challenger', world.packageId);
    assert.equal(rejected.reason, 'D77 settled-history reference requires supported debt-free party sources', kind);
    assert.deepEqual(timedState(world), before, kind + ': no stake/case/hold/cut/restoration');
    assert.equal(relay.snapshot().cases.length, 0); assert.equal(model.disputeParticipations().length, 0);
    model.audit();
  }
});
