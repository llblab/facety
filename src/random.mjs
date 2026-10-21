// Owns: Seeded experimental randomness, not cryptographic randomness.
import { createHash } from 'node:crypto';

// v2: SHA-256 seed derivation into a 128-bit xoshiro128** state. The former 32-bit
// FNV-1a/mulberry32 policy gave distinct decision keys identical streams after ~2^16 forks.
export const RANDOM_GENERATOR = 'sha256-xoshiro128starstar-v2';

function rotl(value, shift) { return (value << shift) | (value >>> (32 - shift)); }

// One xoshiro128** step on a Uint32Array(4) state; exported for reference-vector tests.
export function xoshiro128ss(s) {
  const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0;
  const t = s[1] << 9;
  s[2] ^= s[0];
  s[3] ^= s[1];
  s[1] ^= s[2];
  s[0] ^= s[3];
  s[2] ^= t;
  s[3] = rotl(s[3], 11);
  return result;
}

export class Random {
  #state = new Uint32Array(4);
  constructor(seed = 1) {
    this.seed = String(seed);
    const digest = createHash('sha256').update(this.seed).digest();
    for (let i = 0; i < 4; i++) this.#state[i] = digest.readUInt32LE(4 * i);
    if (this.#state.every(word => word === 0)) this.#state[0] = 1;
  }
  #next32() { return xoshiro128ss(this.#state); }
  // Uniform double in [0, 1) with 53 random bits.
  next() {
    return ((this.#next32() >>> 5) * 67108864 + (this.#next32() >>> 6)) / 9007199254740992;
  }
  int(max) {
    if (!Number.isSafeInteger(max) || max < 1 || max > 4294967296) throw new RangeError('max must be in [1, 2^32]');
    return Math.floor(this.next() * max);
  }
  chance(probability) {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new RangeError('probability must be in [0, 1]');
    return this.next() < probability;
  }
  pick(values) {
    if (!values.length) throw new RangeError('cannot sample an empty collection');
    return values[this.int(values.length)];
  }
  shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  fork(label) {
    return new Random(JSON.stringify([this.seed, String(label)]));
  }
}

// Index chosen by `random.pick` from 0..length-1 after removing distinct `skippedPositions`,
// computed without materializing the filtered list. Consumes exactly the same draw.
export function pickIndexExcluding(length, skippedPositions, random) {
  const skipped = [...skippedPositions].sort((a, b) => a - b);
  let index = random.int(length - skipped.length);
  for (const position of skipped) {
    if (position > index) break;
    index++;
  }
  return index;
}
