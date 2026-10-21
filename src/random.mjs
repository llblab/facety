// Owns: Seeded experimental randomness, not cryptographic randomness.
export const RANDOM_GENERATOR = 'fnv1a32-mulberry32-v1';
export class Random {
  #state;
  constructor(seed = 1) {
    this.seed = String(seed);
    let hash = 2166136261;
    for (const char of this.seed) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
    this.#state = hash >>> 0;
  }
  next() {
    let value = this.#state += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    this.#state >>>= 0;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
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
