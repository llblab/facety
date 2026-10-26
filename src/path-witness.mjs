// Owns: Bounded path-witness transport and supplied-state structural verification; excludes state authentication, search, identity and economic authorization.
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

export function verifyPathWitness(input, suppliedContext, state) {
  const context = contextFrom(suppliedContext), p = context.policy;
  const lookups = { view: 0, snapshot: 0, degree: 0, anchorCount: 0, anchor: 0, removed: 0, edge: 0, standing: 0 };
  let required = null, degreeBound = null, anchorBound = null, vertices = 0, conflictsChecked = 0;
  const result = (reason, selected = []) => Object.freeze({ accepted: reason === 'ok', reason, required, degreeBound, anchorBound,
    selected: Object.freeze(selected), stats: Object.freeze({ lookups: Object.freeze({ ...lookups }), vertices, conflictsChecked }) });
  let data;
  try { data = decodePathWitness(input, context); }
  catch (error) { if (error instanceof TypeError || error instanceof RangeError) return result('invalid-wire'); throw error; }
  function read(method, ...args) {
    if (typeof state?.[method] !== 'function') throw new TypeError('missing StateAccessor ' + method);
    lookups[method]++; return state[method](...args);
  }
  function view() {
    const value = read('view');
    if (!value || !Number.isSafeInteger(value.epoch) || Object.is(value.epoch, -0) || value.epoch < 0) throw new TypeError('invalid canonical view');
    return { id: id(value.id, p.maxIdBytes), epoch: value.epoch };
  }
  const first = view();
  function finish(reason, selected = []) {
    const last = view();
    return first.id === last.id && first.epoch === last.epoch ? result(reason, selected) : result('state-view-changed');
  }
  if (data.epoch > first.epoch || first.epoch - data.epoch > p.graceEpochs) return finish('epoch-outside-grace');
  const snapshot = read('snapshot', data.epoch);
  if (snapshot === null) return finish('snapshot-unavailable');
  if (!snapshot || !Number.isSafeInteger(snapshot.difficulty) || snapshot.difficulty < 1 || snapshot.difficulty > p.maxDifficulty) throw new TypeError('invalid canonical difficulty');
  required = snapshot.difficulty;
  if (data.paths.length > required + p.maxSlack) return finish('witness-path-count');
  degreeBound = read('degree', data.subject, p.direction, p.undirectedProjection);
  const natural = value => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
  if (degreeBound !== null && !natural(degreeBound)) throw new TypeError('invalid canonical degree');
  if (degreeBound !== null && degreeBound < required) return finish('degree-infeasible');
  anchorBound = read('anchorCount', data.epoch, data.subject);
  if (anchorBound !== null && !natural(anchorBound)) throw new TypeError('invalid canonical anchor count');
  if (anchorBound !== null && anchorBound < required) return finish('anchor-infeasible');
  const caches = Object.fromEntries(['anchor', 'removed', 'edge', 'standing'].map(key => [key, new Map()]));
  function cached(method, ...args) {
    const key = JSON.stringify(args), cache = caches[method];
    if (!cache.has(key)) {
      const value = read(method, ...args);
      if (method === 'standing' ? value !== null && !natural(value) : typeof value !== 'boolean') throw new TypeError('invalid canonical ' + method);
      cache.set(key, value);
    }
    return cache.get(key);
  }
  const valid = [];
  for (const [index, path] of data.paths.entries()) {
    const seen = new Set(); let simple = true;
    for (const v of path) { vertices++; if (seen.has(v)) simple = false; seen.add(v); }
    const anchor = path.at(-1);
    if (!simple || path.length < 2 || path[0] !== data.subject || anchor === data.subject
      || !cached('anchor', data.epoch, anchor) || cached('removed', anchor)) continue;
    let good = true;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const live = p.direction === 'directed-from-anchor' ? cached('edge', b, a)
        : p.undirectedProjection === 'reciprocal-only' ? cached('edge', a, b) && cached('edge', b, a)
          : cached('edge', a, b) || cached('edge', b, a);
      if (!live) { good = false; break; }
      if (p.minStanding !== null && i < path.length - 1) {
        const standing = cached('standing', b);
        if (standing === null || standing < p.minStanding) { good = false; break; }
      }
    }
    if (good) valid.push({ index, path });
  }
  if (valid.length < required) return finish('insufficient-valid-paths');
  const owners = new Map(), conflicts = [];
  for (const [i, candidate] of valid.entries()) for (const vertex of candidate.path.slice(1)) {
    const previous = owners.get(vertex) ?? [];
    if (previous.length > 0 && valid.length === required) return finish('family-conflict');
    if (previous.length === 2) return finish('family-conflict');
    if (previous.length === 1) { conflicts.push([previous[0], i]); conflictsChecked++; }
    previous.push(i); owners.set(vertex, previous);
  }
  let omit = -1;
  if (valid.length > required) {
    const drops = conflicts.length ? conflicts[0].filter(i => conflicts.every(pair => { conflictsChecked++; return pair.includes(i); })) : [valid.length - 1];
    if (!drops.length) return finish('family-conflict');
    omit = Math.max(...drops);
  }
  return finish('ok', valid.filter((_, i) => i !== omit).map(c => c.index));
}
