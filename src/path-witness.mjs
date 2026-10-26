// Owns: Bounded canonical path-witness policy/transport; excludes live graph acceptance, search, identity and economic authorization.
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

export const PATH_WITNESS_LIMITS = Object.freeze({ maxHops: 64, maxDifficulty: 64, graceEpochs: 1024, maxSlack: 1, maxIdBytes: 256, maxWitnessBytes: 65536 });
const VERSION = 'facety-path-witness/v1';
const POLICY_KEYS = ['direction', 'graceEpochs', 'maxDifficulty', 'maxHops', 'maxIdBytes', 'maxSlack', 'maxWitnessBytes', 'minStanding', 'undirectedProjection'];
function fields(value, keys, label) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).sort().join() !== [...keys].sort().join()
    || Reflect.ownKeys(value).length !== keys.length) throw new TypeError(label + ' requires exact plain fields');
  if (Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError(label + ' cannot contain accessors');
}
function integer(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < minimum || value > maximum) throw new RangeError(name + ' outside supported bounds');
}
function id(value, limit) {
  if (typeof value !== 'string' || !value.length) throw new TypeError('ID/domain must be nonempty Unicode text');
  if (value.length > limit) throw new RangeError('ID/domain byte bound');
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('unpaired Unicode surrogate');
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new TypeError('unpaired Unicode surrogate');
  }
  if (Buffer.byteLength(value, 'utf8') > limit) throw new RangeError('ID/domain byte bound');
  return value;
}
function dense(array, maximum, label) {
  if (!Array.isArray(array)) throw new TypeError(label + ' must be an array');
  if (array.length > maximum) throw new RangeError(label + ' count/hop bound');
  if (Object.keys(array).length !== array.length || Reflect.ownKeys(array).length !== array.length + 1) throw new TypeError(label + ' must be a dense array');
  for (let i = 0; i < array.length; i++) if (!Object.hasOwn(array, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(array, i), 'value')) throw new TypeError(label + ' cannot contain holes/accessors');
}
export function pathWitnessPolicy(input) {
  fields(input, POLICY_KEYS, 'path policy');
  if (!['directed-from-anchor', 'undirected'].includes(input.direction) || !['any-live-orientation', 'reciprocal-only'].includes(input.undirectedProjection)) throw new TypeError('unsupported path projection');
  for (const [key, cap] of Object.entries(PATH_WITNESS_LIMITS)) integer(input[key], key, ['maxSlack', 'graceEpochs'].includes(key) ? 0 : 1, cap);
  if (input.minStanding !== null) integer(input.minStanding, 'minStanding', 0, Number.MAX_SAFE_INTEGER);
  return Object.freeze(Object.fromEntries(POLICY_KEYS.map(key => [key, input[key]])));
}
export function pathWitnessPolicyId(input) {
  return createHash('sha256').update('facety-path-policy/v1\0').update(JSON.stringify(pathWitnessPolicy(input))).digest('hex');
}
function contextFrom(context) {
  fields(context, ['domain', 'subject', 'policy'], 'witness context');
  const policy = pathWitnessPolicy(context.policy);
  return { domain: id(context.domain, policy.maxIdBytes), subject: id(context.subject, policy.maxIdBytes), policy };
}
function normalizedWitness(input, context) {
  const p = context.policy;
  fields(input, ['subject', 'epoch', 'paths'], 'witness');
  id(input.subject, p.maxIdBytes);
  if (input.subject !== context.subject) throw new TypeError('witness subject does not match expected subject');
  integer(input.epoch, 'epoch', 0, Number.MAX_SAFE_INTEGER);
  dense(input.paths, p.maxDifficulty + p.maxSlack, 'paths');
  const paths = new Map();
  for (const path of input.paths) {
    dense(path, p.maxHops + 1, 'path');
    if (path.length < 1) throw new TypeError('path requires a vertex');
    const copy = path.map(v => id(v, p.maxIdBytes));
    paths.set(JSON.stringify(copy), copy);
  }
  const entries = [...paths].map(([key, path]) => ({ key, path, bytes: Buffer.from(key, 'utf8') })).sort((a, b) => Buffer.compare(a.bytes, b.bytes));
  return { epoch: input.epoch, paths: entries.map(e => e.path), subject: input.subject };
}
function wire(witness, context) {
  const prefix = '{"domain":' + JSON.stringify(context.domain) + ',"policy":' + JSON.stringify(pathWitnessPolicyId(context.policy))
    + ',"version":' + JSON.stringify(VERSION) + ',"witness":{"epoch":' + witness.epoch + ',"paths":[';
  const suffix = '],"subject":' + JSON.stringify(witness.subject) + '}}';
  const parts = witness.paths.map(path => JSON.stringify(path));
  const size = Buffer.byteLength(prefix) + Buffer.byteLength(suffix) + parts.reduce((n, part) => n + Buffer.byteLength(part), 0) + Math.max(0, parts.length - 1);
  if (size > context.policy.maxWitnessBytes) throw new RangeError('witness wire byte bound');
  return Buffer.from(prefix + parts.join(',') + suffix, 'utf8');
}
export function encodePathWitness(witness, suppliedContext) {
  const context = contextFrom(suppliedContext);
  return wire(normalizedWitness(witness, context), context);
}
export function decodePathWitness(input, suppliedContext) {
  const context = contextFrom(suppliedContext);
  if (!(input instanceof Uint8Array)) throw new TypeError('witness wire requires Uint8Array bytes');
  if (input.byteLength > context.policy.maxWitnessBytes) throw new RangeError('witness wire byte bound');
  if (input.buffer instanceof SharedArrayBuffer) throw new TypeError('shared mutable witness wire is unsupported');
  const bytes = Buffer.from(input);
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new TypeError('invalid UTF-8/JSON witness wire'); }
  fields(parsed, ['domain', 'policy', 'version', 'witness'], 'wire');
  if (parsed.version !== VERSION || parsed.domain !== context.domain || parsed.policy !== pathWitnessPolicyId(context.policy)) throw new TypeError('witness domain/version/policy mismatch');
  const witness = normalizedWitness(parsed.witness, context);
  if (!wire(witness, context).equals(bytes)) throw new TypeError('noncanonical witness wire');
  return Object.freeze({ epoch: witness.epoch, paths: Object.freeze(witness.paths.map(path => Object.freeze(path))), subject: witness.subject });
}
