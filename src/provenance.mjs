// Owns: Implementation identity and canonical digests for replay records, not result authenticity.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

const SOURCE_DIRECTORY = new URL('./', import.meta.url);
let implementation = null;

// Content digest of every simulator source module. It identifies the implementation revision
// without depending on version control; a git commit is optional supporting metadata.
export function implementationDigest() {
  if (!implementation) {
    const files = readdirSync(SOURCE_DIRECTORY).filter(file => file.endsWith('.mjs')).sort();
    const hash = createHash('sha256');
    for (const file of files) hash.update(file).update('\0').update(readFileSync(new URL(file, SOURCE_DIRECTORY))).update('\0');
    implementation = Object.freeze({ method: 'sha256-src-mjs-v1', digest: hash.digest('hex'), files: files.length });
  }
  return implementation;
}

export function provenance() {
  return { implementation: implementationDigest(), runtime: { node: process.version } };
}

// Key-sorted JSON: equal plain data gives equal text regardless of property insertion order.
export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON requires finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  throw new TypeError('canonical JSON supports plain data only');
}

export function digestOf(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
