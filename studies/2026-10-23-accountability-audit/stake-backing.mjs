import assert from 'node:assert/strict';
import { FacetyModel } from '../../src/model.mjs';
import { DisputeStakes } from '../../src/dispute-stakes.mjs';
import { provenance } from '../../src/provenance.mjs';

function fund(model, owner, amount) {
  for (let i = 0; i < amount; i++) {
    const act = model.createSelfId(owner, model.registerArtifact(owner));
    model.advanceTo(model.now + 24);
    model.convertToCollector(owner, act);
  }
}
function probe(backing) {
  const model = new FacetyModel({ genesis: ['a', 'b'] });
  fund(model, 'a', 6);
  fund(model, 'b', 8);
  const book = new DisputeStakes(model, backing);
  for (const id of ['case:1', 'case:2']) {
    book.open(id, 'a', 3);
    book.enter(id, 'b', 4);
  }
  const committed = { subjects: model.subjects(), ledger: model.audit(), commitments: book.cases() };
  let spending = 'accepted';
  try { model.transferFacy('a', 'b', 5, 'spend-before-settlement'); } catch (error) { spending = error.message; }
  for (const id of ['case:1', 'case:2']) book.settle(id, 'genuine');
  const beforeReplay = { subjects: model.subjects(), events: model.events(), summary: book.summary() };
  let replay;
  try { book.settle('case:1', 'genuine'); } catch (error) { replay = error.message; }
  assert.deepEqual({ subjects: model.subjects(), events: model.events(), summary: book.summary() }, beforeReplay);
  assert.equal(book.summary().unpaid, backing === 'reserved' ? 0 : 5);
  return { backing, committed, spending, settlement: book.summary(), subjects: model.subjects(), ledger: model.audit(), replay, reservations: model.disputeStakes() };
}
console.log(JSON.stringify({
  schema: 'facety-stake-backing-probe/v1', level: 'diagnostic', provenance: provenance(),
  assumptions: ['Constructed two-case financial lifecycle, not an ordinary target/admission path or equilibrium.', 'All funds came from actual Self-ID/conversion.', 'Stake book does not own XP or merits.', 'Backing remains OPEN; reserved is not a protocol default.'],
  probes: ['unsecured', 'reserved'].map(probe),
}, null, 2));
