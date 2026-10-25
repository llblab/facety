import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY, ProtocolRejection } from '../src/model.mjs';

// Software fixtures only: no sampled study theta, calibration or research seed labels.
function config(overrides = {}, exitSlot = 'retain-until-V') {
  return { K: 2, T: 1, V: 3, B: 1, reference: { eligibility: 'accepted-reference', clockOrigin: 'commitment',
    funding: 'collector-liquid', exitSlot, bondRelease: 'supplied-clearance' }, ...overrides };
}
function funded(vouching = config(), coins = 2) {
  const model = new FacetyModel({ genesis: ['a', 'b', 'c'], vouching });
  const sources = [];
  for (let day = 0; day < coins; day++) {
    model.advanceTo(day * DAY);
    for (const owner of ['a', 'b']) sources.push([owner, model.createSelfId(owner, model.registerArtifact(owner))]);
  }
  model.advanceTo(coins * DAY);
  for (const [owner, source] of sources) model.convertToCollector(owner, source);
  return model;
}
function snapshot(model) {
  return { now: model.now, subjects: model.subjects(), acts: model.selfIds(), invitations: model.invitations(),
    vouches: model.vouchCommitments(), stakes: model.disputeStakes(), events: model.events(), ledger: model.audit(),
    lineage: model.lineage.toJSON(), guarantees: model.guarantees.toJSON() };
}
const clearance = id => ({ clearanceId: id, clear: true });

test('vouching is opt-in, closed and deeply immutable with every reference binding explicit', () => {
  const raw = config(), model = funded(raw);
  raw.K = 99; raw.reference.exitSlot = 'release-on-exit';
  assert.equal(model.vouching.K, 2);
  assert.equal(model.vouching.reference.exitSlot, 'retain-until-V');
  assert.throws(() => { model.vouching.K = 99; }, TypeError);
  assert.throws(() => { model.vouching.reference.funding = 'free'; }, TypeError);
  assert.throws(() => { model.vouching = null; }, TypeError);
  const legacy = funded(null);
  assert.equal(legacy.vouching, null);
  assert.equal(Object.keys(legacy).includes('vouching'), false);
  assert.equal(Object.hasOwn(legacy.ledger(), 'vouchVault'), false);
  assert.deepEqual(legacy.vouchCommitments(), []);
  const before = snapshot(legacy);
  assert.throws(() => legacy.commitVouch('a', 'x'), /disabled/);
  assert.throws(() => legacy.vouchCapacity('a'), /disabled/);
  assert.deepEqual(snapshot(legacy), before);
  assert.deepEqual(legacy.ledger(), { minted: 4, burned: 0, supply: 4, emitterVault: 0, collector: 4, feeVault: 0, stakeVault: 0, debt: 0 });
  for (const bad of [{}, [], false, config({ K: -1 }), config({ K: 0.5 }), config({ T: 0 }), config({ V: 0 }),
    config({ B: -1 }), config({ B: 0.5 }), config({ V: Number.MAX_SAFE_INTEGER }), config({ T: Number.MAX_SAFE_INTEGER }),
    { ...config(), other: true }, config({ reference: {} })]) assert.throws(() => new FacetyModel({ vouching: bad }));
  for (const key of Object.keys(config().reference)) {
    const missing = config(); delete missing.reference[key];
    assert.throws(() => new FacetyModel({ vouching: missing }));
    const unknown = config(); unknown.reference[key] = 'unbound';
    assert.throws(() => new FacetyModel({ vouching: unknown }));
  }
});

test('actual liquid funds back each bond exclusively without mint, burn, membership, edges or XP', () => {
  const model = funded(config({ B: 2 }));
  const before = snapshot(model), id = model.commitVouch('a', 'not-admitted');
  assert.equal(model.subject('a').liquidFacy, 0);
  assert.equal(model.ledger().vouchVault, 2);
  assert.equal(model.ledger().minted, before.ledger.minted);
  assert.equal(model.ledger().burned, before.ledger.burned);
  assert.equal(model.ledger().supply, before.ledger.supply);
  assert.equal(model.size, before.subjects.length);
  assert.throws(() => model.subject('not-admitted'), /unknown subject/);
  assert.deepEqual(model.lineage.toJSON(), before.lineage);
  assert.deepEqual(model.guarantees.toJSON(), before.guarantees);
  assert.deepEqual(model.subjects().map(s => s.xp), before.subjects.map(s => s.xp));
  assert.throws(() => model.transferFacy('a', 'b', 1), /insufficient/);
  assert.throws(() => model.reserveDisputeStake('case', 'a', 1), /insufficient/);
  assert.throws(() => model.commitVouch('c', 'unfunded'), /insufficient/);
  assert.deepEqual(model.penalize('a', { fine: 1, halveXp: false }), { collected: 0, debtAdded: 1 });
  assert.equal(model.audit().vouchVault, 2);
  model.advanceTo(model.vouchCommitments()[0].expiresAt);
  assert.equal(model.subject('a').liquidFacy, 0);
  assert.equal(model.releaseVouchBond(id, clearance('paid-principal-only')), 2);
  assert.equal(model.subject('a').liquidFacy, 2);
  assert.equal(model.subject('a').debt, 1);
  assert.equal(model.audit().vouchVault, 0);
  assert.equal(model.ledger().burned, before.ledger.burned);
  const stakeModel = funded(config({ B: 2 }));
  stakeModel.reserveDisputeStake('prior', 'a', 1);
  assert.throws(() => stakeModel.commitVouch('a', 'double-pledge'), /insufficient/);
  assert.equal(stakeModel.audit().vouchVault, 0);
});

test('SubjectId cooldown has no banking/refund and exact V boundary frees concurrent slots', () => {
  const model = funded(config({ B: 0 })), start = model.now;
  const first = model.commitVouch('a', 'x');
  model.commitVouch('b', 'x');
  model.rotateKey('a', 'rotated');
  model.advanceTo(start + DAY - 1);
  assert.throws(() => model.commitVouch('a', 'y'), /cooldown/);
  model.advanceTo(start + DAY);
  model.commitVouch('a', 'y');
  model.exitVouch('a', first);
  model.advanceTo(start + 2 * DAY);
  assert.throws(() => model.commitVouch('a', 'z'), /slot/);
  model.advanceTo(start + 3 * DAY - 4);
  assert.equal(model.vouchCapacity('a').used, 2);
  model.advanceTo(start + 3 * DAY);
  assert.equal(model.vouchCapacity('a').used, 1);
  model.commitVouch('a', 'z');
  model.advanceTo(start + 20 * DAY);
  model.commitVouch('a', 'after-pause');
  assert.throws(() => model.commitVouch('a', 'no-bank'), /cooldown/);
  assert.equal(model.vouchCommitments()[0].bondStatus, 'reserved');
  assert.equal(model.audit().minted, 4);
  const zero = funded(config({ K: 0, B: 0 }), 0);
  assert.throws(() => zero.commitVouch('a', 'x'), /slot/);
  assert.equal(zero.audit().minted, 0);
});

test('both explicit exit-slot candidates keep bonds locked and never reset cooldown or overlap coverage', () => {
  for (const exitSlot of ['retain-until-V', 'release-on-exit']) {
    const model = funded(config({ K: 1 }, exitSlot)), start = model.now;
    const id = model.commitVouch('a', 'x');
    assert.throws(() => model.exitVouch('b', id), /own/);
    model.exitVouch('a', id);
    assert.equal(model.ledger().vouchVault, 1);
    assert.equal(model.subject('a').liquidFacy, 1);
    assert.equal(model.ledger().feeVault, 0);
    assert.throws(() => model.commitVouch('a', 'y'), /cooldown/);
    assert.throws(() => model.releaseVouchBond(id, clearance('early')), /locked/);
    assert.throws(() => model.exitVouch('a', id), /live/);
    model.advanceTo(start + DAY);
    if (exitSlot === 'release-on-exit') {
      assert.throws(() => model.commitVouch('a', 'x'), /overlapping/);
      model.commitVouch('a', 'y');
      assert.equal(model.ledger().vouchVault, 2);
    } else assert.throws(() => model.commitVouch('a', 'y'), /slot/);
    assert.equal(model.audit().burned, 0);
  }
});

test('refund requires V plus explicit external clearance, is replay-safe and remains principal custody after invalidation', () => {
  const model = funded(), id = model.commitVouch('a', 'x'), until = model.vouchCommitments()[0].expiresAt;
  const receipt = model.vouchCommitments()[0];
  assert.throws(() => { receipt.bond = 100; }, TypeError);
  model.vouchCommitments().length = 0;
  assert.equal(model.vouchCommitments().length, 1);
  model.advanceTo(until - 1);
  assert.throws(() => model.releaseVouchBond(id, clearance('too-soon')), /locked/);
  model.advanceTo(until);
  assert.deepEqual(model.vouchCapacity('a'), { limit: 2, used: 0, free: 2, cooldownRemainingHours: 0 });
  assert.equal(model.ledger().vouchVault, 1);
  for (const bad of [undefined, null, {}, [], { clear: true }, { clearanceId: 'c' }, { clearanceId: '', clear: true },
    { clearanceId: 'c', clear: false }, { clearanceId: 'c', clear: true, truth: true },
    Object.assign(Object.create({ clear: true }), { clearanceId: 'c', other: true })]) {
    const before = snapshot(model);
    assert.throws(() => model.releaseVouchBond(id, bad));
    assert.deepEqual(snapshot(model), before);
  }
  model.invalidateIdentity('a');
  assert.throws(() => model.commitVouch('a', 'new'), /not accepted/);
  assert.equal(model.releaseVouchBond(id, clearance('trusted-clearance-not-merits')), 1);
  assert.equal(model.subject('a').liquidFacy, 2);
  assert.throws(() => model.releaseVouchBond(id, clearance('replay')), /not reserved/);
  assert.equal(model.audit().vouchVault, 0);
});

test('rejected commitments/exits/refunds preserve state, future IDs and inert-inspection prefixes', () => {
  const cases = [
    { attempt: m => m.commitVouch('a', '') },
    { attempt: m => m.commitVouch('a', 'a') },
    { attempt: m => m.commitVouch('missing', 'x') },
    { setup: m => m.invalidateIdentity('c'), attempt: m => m.commitVouch('a', 'c') },
    { setup: m => m.invalidateIdentity('a'), attempt: m => m.commitVouch('a', 'x') },
    { setup: m => m.commitVouch('a', 'x'), attempt: m => m.commitVouch('a', 'y') },
    { setup: m => m.commitVouch('a', 'x'), attempt: m => m.exitVouch('b', m.vouchCommitments()[0].id) },
    { attempt: m => m.releaseVouchBond('missing', clearance('c')) },
  ];
  const suffix = m => {
    const id = m.commitVouch('b', 'suffix'), artifact = m.registerArtifact('b');
    return { id, artifact, state: snapshot(m) };
  };
  for (const row of cases) {
    const model = funded(), twin = funded();
    row.setup?.(model); row.setup?.(twin);
    const before = snapshot(model);
    assert.throws(() => row.attempt(model));
    for (let i = 0; i < 3; i++) { model.vouchCapacity('b'); model.vouchCommitments(); model.audit(); }
    assert.deepEqual(snapshot(model), before);
    assert.deepEqual(suffix(model), suffix(twin));
  }
  const late = funded(config({ B: 0 })), twin = funded(config({ B: 0 }));
  late.advanceTo(Number.MAX_SAFE_INTEGER); twin.advanceTo(Number.MAX_SAFE_INTEGER);
  const before = snapshot(late);
  assert.throws(() => late.commitVouch('a', 'overflow'), /endpoint/);
  assert.deepEqual(snapshot(late), before);
  assert.equal(late.registerArtifact('b'), twin.registerArtifact('b'));
});

// Independent event-replay accounting oracle; never calls Model capacity/transition logic.
function reference(policy, start, coins) {
  const events = [];
  let now = start;
  const rows = () => events.filter(e => e.kind === 'open').map((e, index) => ({ ...e, index,
    exit: events.find(x => x.kind === 'exit' && x.index === index)?.at ?? null,
    refund: events.find(x => x.kind === 'refund' && x.index === index)?.at ?? null }));
  const cash = owner => coins + events.reduce((sum, e) => sum + (e.owner === owner ? e.kind === 'open' ? -policy.B : e.kind === 'refund' ? policy.B : 0 : 0), 0);
  const active = r => r.until > now && (policy.reference.exitSlot === 'retain-until-V' || r.exit === null);
  return {
    get now() { return now; }, rows, cash,
    capacity(owner) {
      const own = rows().filter(r => r.owner === owner), last = own.at(-1)?.at;
      return { limit: policy.K, used: own.filter(active).length, free: policy.K - own.filter(active).length,
        cooldownRemainingHours: last === undefined ? 0 : Math.max(0, last + policy.T * DAY - now) };
    },
    apply(command) {
      if (command.kind === 'tick') { now += command.hours; return true; }
      const list = rows();
      if (command.kind === 'commit') {
        const own = list.filter(r => r.owner === command.owner);
        if (own.some(r => r.until > now && r.target === command.target) || own.filter(active).length >= policy.K
          || (own.length && now - own.at(-1).at < policy.T * DAY) || cash(command.owner) < policy.B) return false;
        events.push({ kind: 'open', owner: command.owner, target: command.target, at: now, until: now + policy.V * DAY });
        return true;
      }
      const row = list[0];
      if (!row) return false;
      if (command.kind === 'exit') {
        if (row.exit !== null || now >= row.until) return false;
        events.push({ kind: 'exit', index: 0, at: now });
      } else {
        if (row.refund !== null || now < row.until) return false;
        events.push({ kind: 'refund', index: 0, owner: row.owner, at: now });
      }
      return true;
    },
  };
}

test('slot/cooldown/exit/custody traces agree with an independent event-replay oracle in 4096 software partitions', () => {
  const commands = [{ kind: 'commit', owner: 'a', target: 'x' }, { kind: 'commit', owner: 'a', target: 'y' },
    { kind: 'commit', owner: 'b', target: 'x' }, { kind: 'exit' }, { kind: 'refund' },
    { kind: 'tick', hours: 4 }, { kind: 'tick', hours: 24 }, { kind: 'tick', hours: 48 }];
  let partitions = 0;
  for (const K of [1, 2]) for (const B of [0, 1]) for (const exitSlot of ['retain-until-V', 'release-on-exit']) {
    const policy = config({ K, B, V: 2 }, exitSlot);
    for (let encoded = 0; encoded < commands.length ** 3; encoded++) {
      const model = funded(policy), oracle = reference(policy, model.now, 2), ids = [];
      let cursor = encoded;
      for (let step = 0; step < 3; step++, cursor = Math.floor(cursor / commands.length)) {
        const command = commands[cursor % commands.length], expected = oracle.apply(command);
        let accepted = true;
        try {
          if (command.kind === 'commit') ids.push(model.commitVouch(command.owner, command.target));
          else if (command.kind === 'exit') model.exitVouch(model.vouchCommitments()[0]?.voucher ?? 'a', ids[0]);
          else if (command.kind === 'refund') model.releaseVouchBond(ids[0], clearance('software'));
          else model.advanceTo(model.now + command.hours);
        } catch (error) { if (!(error instanceof ProtocolRejection)) throw error; accepted = false; }
        assert.equal(accepted, expected, JSON.stringify({ K, B, exitSlot, encoded, step }));
        assert.equal(model.now, oracle.now);
        for (const owner of ['a', 'b']) {
          assert.equal(model.subject(owner).liquidFacy, oracle.cash(owner));
          assert.deepEqual(model.vouchCapacity(owner), oracle.capacity(owner));
        }
        assert.equal(model.audit().vouchVault, oracle.rows().filter(r => r.refund === null).length * B);
        assert.deepEqual(model.vouchCommitments().map(r => ({ owner: r.voucher, target: r.target, at: r.committedAt, until: r.expiresAt,
          exit: r.exitedAt, refund: r.releasedAt })), oracle.rows().map(r => ({ owner: r.owner, target: r.target, at: r.at, until: r.until, exit: r.exit, refund: r.refund })));
      }
      partitions++;
    }
  }
  assert.equal(partitions, 4096);
});
