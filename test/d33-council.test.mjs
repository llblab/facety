// D33 Council size reference (D115): studies/2026-10-29-topology-takeover/README.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetyModel, DAY } from '../src/model.mjs';

const PATHS = { council: 'd33-active-lookup', terminal: 'single-member', self: 'other-member', bootstrap: 'latch-first-100-active', intermediaries: 'accepted-subjects', search: 'exact-unbounded' };
const REFERENCE = { source: 'own-mature-right', withdrawal: 'free', pairEndXp: 'withdrawer-only', withdrawDuringHold: 'allow', invitations: 'v2-special-link', eligibility: 'off', councilPaths: PATHS };

function world(size, { council = 'd33-active-lookup', fixed = 101 } = {}) {
  const genesis = Array.from({ length: size }, (_, i) => 'g' + i);
  const model = new FacetyModel({ genesis, policy: { councilSize: fixed }, valences: { K: 100, genesisPairs: [], reference: { ...REFERENCE, councilPaths: { ...PATHS, council } } } });
  for (const id of genesis) model.createSelfId(id, model.registerArtifact(id));
  return model;
}

test('D33 lookup: under 100 active means no formal Council, 100 to 999,999 active means 11 seats', () => {
  for (const [size, target, seats] of [[1, 1, 0], [10, 1, 0], [99, 1, 0], [100, 11, 11], [250, 11, 11]]) {
    const model = world(size);
    assert.equal(model.activeCount(), size);
    assert.equal(model.councilTarget(), target, 'target at ' + size);
    assert.equal(model.council().length, seats, 'seats at ' + size);
  }
});

test('D33 lookup counts active subjects only and the legacy binding keeps the fixed size', () => {
  const model = world(100);
  assert.equal(model.councilTarget(), 11);
  model.advanceTo(29 * DAY);
  assert.equal(model.activeCount(), 0);
  assert.equal(model.councilTarget(), 1);
  assert.deepEqual(model.council(), []);
  const legacy = world(30, { council: 'legacy-active-xp-leaderboard', fixed: 7 });
  assert.equal(legacy.councilTarget(), 7);
  assert.equal(legacy.council().length, 7);
});

test('voiding a chain whose right paid a valence keeps the valence-burn audit valid (D116)', () => {
  const model = world(3);
  model.advanceTo(DAY);
  const [right] = model.eligibleEmissions('g0');
  model.openValence('g0', 'g1', right);
  model.invalidateIdentity('g0');
  model.voidSelfIdChain('g0');
  assert.equal(model.selfId(right).disposition, 'valence-burn+voided');
  model.audit();
});
