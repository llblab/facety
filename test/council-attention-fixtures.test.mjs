import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FacetyModel, ProtocolRejection } from '../src/model.mjs';
import { DisputeStakes } from '../src/dispute-stakes.mjs';

const packet = JSON.parse(readFileSync(new URL('../studies/2026-10-27-council-attention/fixtures.json', import.meta.url)));
function snapshot(model, book) {
  return { subjects: model.subjects(), ledger: model.audit(), events: model.events(), relations: model.guaranteeRelations(), cases: book.cases(), summary: book.summary() };
}
function replay(observed, backing) {
  const model = new FacetyModel({ genesis: ['a', 'b', 'c'], policy: { guaranteeFee: 0 } });
  for (const [owner, amount] of Object.entries(observed.funding)) for (let i = 0; i < amount; i++) {
    const act = model.createSelfId(owner, model.registerArtifact(owner));
    model.advanceTo(model.now + 24);
    model.convertToCollector(owner, act);
  }
  const origin = model.now;
  const book = new DisputeStakes(model, backing);
  const xp = () => model.subjects().map(({ id, xp }) => ({ id, xp }));
  const ranking = () => model.council().map(({ id, xp }) => ({ id, xp }));
  const beforeXp = xp(), beforeRanking = ranking();
  for (const { from, to, amount } of observed.transfers) model.transferFacy(from, to, amount);
  for (const [from, to] of observed.guarantees) model.confirmGuarantee(to, model.proposeGuarantee(from, to));
  assert.deepEqual(xp(), beforeXp, 'transfers and newly accepted guarantees do not mint XP');
  assert.deepEqual(ranking(), beforeRanking, 'capital shifts alone do not change reference Council ranking');
  const attempts = [];
  for (const offer of observed.arrivals) {
    model.advanceTo(origin + offer.atHour);
    const before = snapshot(model, book);
    let accepted = true;
    try { book.open(offer.id, offer.owner, offer.amount); }
    catch (error) {
      assert.ok(error instanceof ProtocolRejection);
      assert.match(error.message, /insufficient eligible liquid stake/);
      assert.deepEqual(snapshot(model, book), before, 'failed offer has no invented case/custody/XP effect');
      accepted = false;
    }
    attempts.push({ id: offer.id, atHour: offer.atHour, amount: offer.amount, accepted });
  }
  model.advanceTo(origin + observed.horizonHours);
  assert.deepEqual(xp(), beforeXp, 'elapsed observation horizon is not a verdict/XP penalty');
  const result = snapshot(model, book);
  assert.equal(result.ledger.minted, 15);
  assert.equal(result.ledger.supply, 15);
  assert.equal(result.ledger.burned, 0);
  assert.equal(result.ledger.debt, 0);
  assert.equal(result.summary.openCases, result.summary.cases);
  assert.equal(result.summary.pendingNominal, result.summary.nominalCommitted);
  assert.equal(result.ledger.stakeVault, backing === 'reserved' ? result.summary.pendingNominal : 0);
  assert.ok(result.subjects.every(subject => subject.identityStatus === 'accepted' && subject.debt === 0));
  return { attempts, ...result };
}

for (const family of ['recycled-stakes', 'early-burst', 'guarantee-ring', 'capital-shift']) test(`Council-attention ${family}: native funded facts, pending custody and legitimate observation control`, () => {
  assert.equal(packet.schema, 'facety-council-attention-fixtures/v1');
  assert.equal(packet.captureEnabled, false);
  assert.equal(packet.assumptions.councilTiming, 'any-time-while-dispute-open; no last-three-days gate');
  assert.equal(packet.assumptions.notice, 'common-dispute-channel; no material dissemination delay to declared present Council members; no separate diffusion model or actual channel access');
  assert.equal(packet.fixtures.length, 8);
  const pair = packet.fixtures.filter(row => row.family === family);
  assert.equal(pair.length, 2);
  assert.deepEqual(pair.map(row => row.evaluator.intent), ['adversarial-intent', 'legitimate-control']);
  assert.deepEqual(pair[0].observed, pair[1].observed, 'public data does not certify hidden intent');
  for (const row of pair) {
    assert.equal(row.observed.horizonHours, 168);
    assert.deepEqual(row.observed.offeredReviewSlots, [0, 24], 'supplied slots are not an implemented review algorithm');
    assert.equal(row.observed.ordinaryLastMoveWindowHours, 168);
    assert.ok(row.observed.arrivals.every((offer, i, all) => Number.isSafeInteger(offer.atHour) && offer.atHour >= 0 && offer.atHour < 168 && (!i || offer.atHour >= all[i - 1].atHour)));
  }
  for (const backing of ['unsecured', 'reserved']) {
    const a = replay(pair[0].observed, backing), b = replay(pair[1].observed, backing);
    assert.deepEqual(a, b, 'evaluator metadata never enters a protocol API or fabricated classifier');
    if (family === 'recycled-stakes' || family === 'early-burst') {
      assert.equal(a.attempts.length, 17);
      assert.equal(a.summary.cases, backing === 'reserved' ? 4 : 17);
      assert.equal(a.summary.pendingNominal, backing === 'reserved' ? 14 : 66);
      assert.equal(a.attempts.filter(row => !row.accepted).length, backing === 'reserved' ? 13 : 0);
      assert.equal(a.cases.at(-1).positions[0].owner, 'b', 'smaller independently funded offer is retained');
      assert.equal(a.summary.nominalLosing + a.summary.transferred + a.summary.burned + a.summary.released + a.summary.unpaid, 0);
      if (family === 'early-burst') {
        assert.equal(a.attempts.at(-1).atHour, 144);
        assert.equal(a.attempts.at(-1).atHour + pair[0].observed.ordinaryLastMoveWindowHours, 312, 'fixture ordinary response interval extends beyond H; this is not a Council-clock implementation');
        assert.ok(a.cases.every(row => row.closedAt === null && row.winner === null));
      } else {
        const transfers = a.events.filter(event => event.type === 'facy-transferred');
        assert.deepEqual(transfers.map(({ from, to, amount, memo }) => ({ from, to, amount, memo })), [{ from: 'a', to: 'b', amount: 12, memo: 'transfer' }, { from: 'b', to: 'a', amount: 12, memo: 'transfer' }]);
      }
    } else if (family === 'guarantee-ring') {
      assert.equal(a.relations.filter(row => row.status === 'active').length, 3);
      assert.equal(a.events.filter(event => event.type === 'facy-transferred').length, 0);
      assert.equal(a.summary.cases, 0);
      assert.deepEqual(a.subjects.map(({ xp }) => xp), [12, 2, 1]);
    } else {
      assert.equal(a.summary.pendingNominal, 12);
      assert.equal(a.summary.cases, 2);
      assert.deepEqual(a.subjects.map(({ xp }) => xp), [12, 2, 1]);
      assert.equal(a.subjects.find(row => row.id === 'b').liquidFacy, backing === 'reserved' ? 2 : 12);
    }
  }
});
