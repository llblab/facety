import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathWitnessPolicy, pathWitnessPolicyId, encodePathWitness, decodePathWitness, PATH_WITNESS_LIMITS } from '../src/path-witness.mjs';

const vectors = JSON.parse(readFileSync(new URL('../studies/2026-10-26-witness-indexer/wire-vectors.json', import.meta.url), 'utf8'));
const context = () => structuredClone(vectors.context);
const witness = () => structuredClone(vectors.canonical.input);
const rejects = invoke => assert.throws(invoke, e => e instanceof TypeError || e instanceof RangeError);

test('literal public wire/policy vectors agree with an independently written flat serializer, not just codec round trip', () => {
  const c = context(), raw = Object.fromEntries(Object.entries(c.policy).sort(([a], [b]) => a < b ? -1 : 1));
  const separateHash = createHash('sha256').update(Buffer.concat([Buffer.from('facety-path-policy/v1'), Buffer.from([0]), Buffer.from(JSON.stringify(raw))])).digest('hex');
  assert.equal(separateHash, vectors.policyId); assert.equal(pathWitnessPolicyId(c.policy), vectors.policyId);
  assert.equal(encodePathWitness(witness(), c).toString('utf8'), vectors.canonical.utf8);
  assert.deepEqual(decodePathWitness(Buffer.from(vectors.canonical.utf8), c), vectors.canonical.normalized);
  for (const row of vectors.wireCases) {
    if (row.decodes) assert.ok(decodePathWitness(Buffer.from(row.wire), c));
    else rejects(() => decodePathWitness(Buffer.from(row.wire), c));
  }
});

test('complete trusted policy bounds/projections are explicit immutable values, without defaults or unsupported slack', () => {
  const raw = context().policy, frozen = pathWitnessPolicy(raw);
  raw.maxHops = 1; assert.equal(frozen.maxHops, 5); assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(PATH_WITNESS_LIMITS));
  const reverse = Object.fromEntries(Object.entries(frozen).reverse());
  assert.equal(pathWitnessPolicyId(reverse), pathWitnessPolicyId(frozen));
  for (const mutate of [
    p => { delete p.graceEpochs; }, p => { p.extra = 1; }, p => { p.maxSlack = 2; },
    p => { p.maxHops = 65; }, p => { p.maxDifficulty = 0; }, p => { p.maxDifficulty = 65; },
    p => { p.maxWitnessBytes = 65537; }, p => { p.maxIdBytes = 257; }, p => { p.graceEpochs = 1025; },
    p => { p.minStanding = -1; }, p => { p.maxSlack = -0; }, p => { p.maxHops = 1.5; },
    p => { p.maxWitnessBytes = Infinity; }, p => { p.direction = 'outward-from-subject'; },
    p => { p.undirectedProjection = 'guess'; }, p => { p.minStanding = undefined; },
  ]) { const p = context().policy; mutate(p); rejects(() => pathWitnessPolicy(p)); }
  assert.equal(pathWitnessPolicy({ ...frozen, direction: 'undirected', undirectedProjection: 'reciprocal-only', maxSlack: 0, minStanding: 0 }).maxSlack, 0);
});

test('wire binds domain/expected subject/every policy field and exact version, rather than an untrusted witness policy', () => {
  const c = context(), bytes = encodePathWitness(witness(), c);
  for (const change of [
    x => { x.domain = 'another-deployment'; }, x => { x.subject = 'other'; },
    ...Object.keys(c.policy).map(key => x => { x.policy[key] = ({ direction: 'undirected', undirectedProjection: 'reciprocal-only', maxHops: 4,
      graceEpochs: 2, maxSlack: 0, maxDifficulty: 7, maxIdBytes: 63, maxWitnessBytes: 8191, minStanding: 0 })[key]; }),
  ]) { const other = context(); change(other); rejects(() => decodePathWitness(bytes, other)); }
  for (const text of [vectors.canonical.utf8.replace('/v1', '/v2'), vectors.canonical.utf8.replace('"epoch":3', '"epoch":-0'),
    vectors.canonical.utf8.replace('"epoch":3', '"epoch":9007199254740992')]) rejects(() => decodePathWitness(Buffer.from(text), c));
  rejects(() => encodePathWitness({ ...witness(), subject: 'wrong' }, c));
});

test('encoder normalizes path order/duplicates while strict decoder refuses alternative canonical wire forms', () => {
  const c = context(), normalized = vectors.canonical.normalized;
  assert.deepEqual(encodePathWitness(normalized, c), encodePathWitness(witness(), c));
  const altered = [
    '\ufeff' + vectors.canonical.utf8, vectors.canonical.utf8 + '\n',
    vectors.canonical.utf8.replace('"subject":"u"', '"subject":"\\u0075"'),
    vectors.canonical.utf8.replace('[["u","a"],["u","b"]]', '[["u","a"],["u","a"],["u","b"]]'),
    vectors.canonical.utf8.replace('"epoch":3,', '"epoch":3,"unknown":1,'),
  ];
  for (const text of altered) rejects(() => decodePathWitness(Buffer.from(text), c));
  const parsed = JSON.parse(vectors.canonical.utf8);
  const reorder = { witness: parsed.witness, version: parsed.version, policy: parsed.policy, domain: parsed.domain };
  rejects(() => decodePathWitness(Buffer.from(JSON.stringify(reorder)), c));
});

test('UTF-8/Unicode are exact scalar IDs with byte limits and no normalization or replacement decoding', () => {
  const c = context(), w = witness(); c.subject = 'é'; w.subject = 'é'; w.paths = [['é', '🙂']];
  const b = encodePathWitness(w, c); assert.deepEqual(decodePathWitness(b, c).paths, w.paths);
  rejects(() => decodePathWitness(b, { ...c, subject: 'e\u0301' }));
  for (const text of ['\ud800', '\udfff', 'x\ud800z']) {
    rejects(() => encodePathWitness({ subject: 'u', epoch: 0, paths: [['u', text]] }, context()));
  }
  const small = context(); small.policy.maxIdBytes = 1; small.domain = 'd';
  rejects(() => encodePathWitness({ subject: 'u', epoch: 0, paths: [['u', 'é']] }, small));
  for (const bad of [[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xef, 0xbb, 0xbf]]) rejects(() => decodePathWitness(Uint8Array.from(bad), context()));
});

test('raw byte/path/ID/hop limits and malformed data are rejected before normalizing duplicates; no arbitrary coercion', () => {
  const c = context();
  rejects(() => decodePathWitness(Buffer.alloc(c.policy.maxWitnessBytes + 1), c));
  rejects(() => decodePathWitness(vectors.canonical.utf8, c));
  rejects(() => decodePathWitness(new Uint8Array(new SharedArrayBuffer(4)), c));
  rejects(() => encodePathWitness({ ...witness(), paths: Array.from({ length: 10 }, () => ['u', 'a']) }, c));
  rejects(() => encodePathWitness({ ...witness(), paths: [['u', ...Array(6).fill('a')]] }, c));
  const tiny = context(); tiny.policy.maxWitnessBytes = 1;
  rejects(() => encodePathWitness(witness(), tiny));
  for (const bad of [null, [], {}, { ...witness(), extra: 1 }, { ...witness(), epoch: NaN }, { ...witness(), epoch: -0 },
    { ...witness(), paths: new Array(1) }, { ...witness(), paths: [[]] }, { ...witness(), paths: [['u', 1]] },
    { ...witness(), paths: [['u', null]] }, { ...witness(), paths: [['u', { toString() { return 'a'; } }]] }]) rejects(() => encodePathWitness(bad, c));
  const getter = witness(); Object.defineProperty(getter, 'subject', { get() { throw new Error('must not execute'); }, enumerable: true });
  rejects(() => encodePathWitness(getter, c));
  const nestedGetter = witness(); Object.defineProperty(nestedGetter.paths[0], '0', { get() { throw new Error('must not execute'); }, enumerable: true });
  rejects(() => encodePathWitness(nestedGetter, c));
});

test('systematic truncated/one-byte mutated inputs yield bounded canonical data or explicit parse rejection, never graph acceptance', () => {
  const c = context(), b = encodePathWitness(witness(), c);
  const check = bytes => {
    try {
      const data = decodePathWitness(bytes, c);
      assert.deepEqual(encodePathWitness(data, c), bytes);
      assert.equal(Object.hasOwn(data, 'accepted'), false); assert.ok(data.paths.length <= c.policy.maxDifficulty + c.policy.maxSlack);
      assert.ok(Object.isFrozen(data) && Object.isFrozen(data.paths) && data.paths.every(Object.isFrozen));
    } catch (error) { if (!(error instanceof TypeError || error instanceof RangeError)) throw error; }
  };
  for (let i = 0; i < b.length; i++) {
    check(b.subarray(0, i));
    for (const mask of [1, 0x80]) { const changed = Buffer.from(b); changed[i] ^= mask; check(changed); }
  }
});

test('codec deliberately does not certify freshness/liveness/simple paths/endpoint support or required D', () => {
  const c = context();
  for (const data of [{ subject: 'u', epoch: 0, paths: [] }, { subject: 'u', epoch: 0, paths: [['u']] }, { subject: 'u', epoch: Number.MAX_SAFE_INTEGER, paths: [['other', 'missing', 'other']] }]) {
    const result = decodePathWitness(encodePathWitness(data, c), c);
    assert.equal(result.epoch, data.epoch); assert.equal(Object.hasOwn(result, 'accepted'), false);
  }
});
