import test from 'node:test';
import assert from 'node:assert/strict';
import { Random, xoshiro128ss, RANDOM_GENERATOR, pickIndexExcluding } from '../src/random.mjs';

test('xoshiro128** matches the published reference sequence for state 1, 2, 3, 4', () => {
  const state = new Uint32Array([1, 2, 3, 4]);
  assert.deepEqual(Array.from({ length: 6 }, () => xoshiro128ss(state)), [11520, 0, 5927040, 70819200, 2031721883, 1637235492]);
  assert.equal(RANDOM_GENERATOR, 'sha256-xoshiro128starstar-v2');
});

test('seeded streams replay exactly, and many decision forks do not share streams', () => {
  const a = new Random('seed');
  const b = new Random('seed');
  assert.deepEqual(Array.from({ length: 10 }, () => a.next()), Array.from({ length: 10 }, () => b.next()));
  const root = new Random('collisions');
  const first = new Set();
  for (let i = 0; i < 100_000; i++) first.add(root.fork(JSON.stringify(['decision', i])).next());
  assert.equal(first.size, 100_000, 'the former 32-bit seed space collided at this scale');
});

test('draws are uniform at a coarse chi-square check and helpers respect their ranges', () => {
  const random = new Random('uniform');
  const bins = new Array(20).fill(0);
  const draws = 100_000;
  for (let i = 0; i < draws; i++) {
    const value = random.next();
    assert.ok(value >= 0 && value < 1);
    bins[Math.floor(value * 20)]++;
  }
  const expected = draws / 20;
  const chiSquare = bins.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
  assert.ok(chiSquare < 43.82, 'chi-square ' + chiSquare + ' exceeds the df=19, p=0.001 critical value');
  assert.throws(() => random.int(0), RangeError);
  assert.throws(() => random.chance(1.5), RangeError);
  assert.deepEqual(random.shuffle([1, 2, 3, 4]).sort(), [1, 2, 3, 4]);
});

test('excluded-index picking matches picking from the explicitly filtered list', () => {
  const shape = new Random('shape');
  for (let trial = 0; trial < 2000; trial++) {
    const length = 1 + shape.int(30);
    const skipped = new Set(Array.from({ length: shape.int(length) }, () => shape.int(length)));
    if (skipped.size === length) continue;
    const kept = Array.from({ length }, (_, i) => i).filter(i => !skipped.has(i));
    assert.equal(pickIndexExcluding(length, skipped, new Random('draw:' + trial)), new Random('draw:' + trial).pick(kept));
  }
});
