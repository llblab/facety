import test from 'node:test';
import assert from 'node:assert/strict';
import { implementationDigest, canonicalJson, digestOf } from '../src/provenance.mjs';
import { runExperiment } from '../src/experiment.mjs';

test('implementation digest identifies the source tree and is attached to runs', () => {
  const digest = implementationDigest();
  assert.match(digest.digest, /^[0-9a-f]{64}$/);
  assert.equal(digest.method, 'sha256-src-mjs-v1');
  assert.deepEqual(runExperiment({ initialSize: 3, days: 1 }).provenance.implementation, digest);
});

test('canonical JSON ignores key order and rejects non-plain data', () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, 'x'] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(digestOf({ a: 1, b: 2 }), digestOf({ b: 2, a: 1 }));
  assert.throws(() => canonicalJson({ a: NaN }), TypeError);
  assert.throws(() => canonicalJson(new Map()), TypeError);
});
