// Owns: Advisory bounded whole-witness retention, eviction and verified exact fallback; excludes canonical-state authority, trees/pools, randomness and admission.
import { pathWitnessContext, pathWitnessPolicyId, PATH_WITNESS_LIMITS, decodePathWitness, verifyPathWitness } from './path-witness.mjs';
import { verifyPathWitnessRef2 } from './path-witness-ref2.mjs';
import { findPathWitness, PATH_ORACLE_LIMITS } from './path-witness-oracle.mjs';
import { isPathWitnessView } from './path-witness-view.mjs';

export const PATH_CACHE_LIMITS = Object.freeze({ maxEntries: 1024, maxBytes: 1048576, ttlTicks: 1000000, maxNotices: 4096 });
const natural = n => Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0;
const tuple = (a, b) => JSON.stringify([a, b]);
function fields(v, keys) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Reflect.ownKeys(v).length !== keys.length || Object.keys(v).length !== keys.length
    || keys.some(k => !Object.hasOwn(v, k)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('cache requires exact data fields');
}
function array(a, max) {
  if (!Array.isArray(a) || a.length > max) throw new RangeError('cache notice bound');
  if (Reflect.ownKeys(a).length !== a.length + 1 || Object.keys(a).length !== a.length) throw new TypeError('cache requires dense data arrays');
  for (let i = 0; i < a.length; i++) if (!Object.hasOwn(a, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(a, i), 'value')) throw new TypeError('cache notice holes/accessors');
}
function id(s) {
  if (typeof s !== 'string' || !s.length || s.length > PATH_WITNESS_LIMITS.maxIdBytes || Buffer.byteLength(s) > PATH_WITNESS_LIMITS.maxIdBytes) throw new TypeError('invalid cache notice ID');
  for (const c of s) if (c.codePointAt(0) >= 0xd800 && c.codePointAt(0) <= 0xdfff) throw new TypeError('invalid cache notice Unicode');
  return s;
}
export class PathWitnessCache {
  #entries = new Map(); #edges = new Map(); #anchors = new Map(); #bytes = 0; #lastTick = null;
  #counts = { queries: 0, cacheHits: 0, hintHits: 0, cacheRejects: 0, hintRejects: 0, primaryChecks: 0, ref2Checks: 0,
    oracleCalls: 0, expired: 0, invalidations: 0, invalidated: 0, fifoEvicted: 0, retentionSkipped: 0 };
  constructor(input) {
    fields(input, ['maxEntries', 'maxBytes', 'ttlTicks']);
    for (const key of ['maxEntries', 'maxBytes', 'ttlTicks']) if (!natural(input[key]) || input[key] > PATH_CACHE_LIMITS[key] || (key === 'ttlTicks' && input[key] === 0)) throw new RangeError('unsupported cache limit ' + key);
    Object.defineProperty(this, 'config', { value: Object.freeze({ maxEntries: input.maxEntries, maxBytes: input.maxBytes, ttlTicks: input.ttlTicks }), enumerable: true });
    Object.freeze(this);
  }
  stats() { return Object.freeze({ ...this.#counts, entries: this.#entries.size, bytes: this.#bytes, edgeKeys: this.#edges.size, anchorKeys: this.#anchors.size, lastTick: this.#lastTick }); }
  #drop(key) {
    const entry = this.#entries.get(key); if (!entry) return false;
    for (const [index, keys] of [[this.#edges, entry.edges], [this.#anchors, entry.anchors]]) for (const item of keys) {
      const members = index.get(item); members.delete(key); if (!members.size) index.delete(item);
    }
    this.#entries.delete(key); this.#bytes -= entry.bytes; return true;
  }
  #retain(key, outcome, tick) {
    const bytes = Buffer.byteLength(outcome.wire);
    if (!this.config.maxEntries || bytes > this.config.maxBytes) { this.#counts.retentionSkipped++; return null; }
    while (this.#entries.size >= this.config.maxEntries || this.#bytes + bytes > this.config.maxBytes) {
      this.#drop(this.#entries.keys().next().value); this.#counts.fifoEvicted++;
    }
    const edges = new Set(), anchors = new Set();
    for (const path of outcome.witness.paths) {
      anchors.add(path.at(-1));
      for (let i = 1; i < path.length; i++) { edges.add(tuple(path[i - 1], path[i])); edges.add(tuple(path[i], path[i - 1])); }
    }
    const entry = { wire: outcome.wire, bytes, edges, anchors, root: outcome.viewRoot, tick, expiresAt: tick + this.config.ttlTicks };
    this.#entries.set(key, entry); this.#bytes += bytes;
    for (const [index, keys] of [[this.#edges, edges], [this.#anchors, anchors]]) for (const item of keys) {
      if (!index.has(item)) index.set(item, new Set()); index.get(item).add(key);
    }
    return entry;
  }
  #check(wire, view, context, query, work) {
    if (typeof wire !== 'string' || wire.length > context.policy.maxWitnessBytes || Buffer.byteLength(wire) > context.policy.maxWitnessBytes) return null;
    const bytes = Buffer.from(wire, 'utf8'); if (bytes.toString('utf8') !== wire) return null;
    work.primaryChecks++; this.#counts.primaryChecks++; const primary = verifyPathWitness(bytes, context, view);
    work.ref2Checks++; this.#counts.ref2Checks++; const ref2 = verifyPathWitnessRef2(bytes, context, view);
    if (primary.accepted !== ref2.accepted || (primary.accepted && primary.required !== ref2.required)) throw new Error('advisory verifier disagreement');
    if (!primary.accepted) return null;
    const witness = decodePathWitness(bytes, context);
    if (witness.epoch !== query.epoch) return null;
    return Object.freeze({ status: 'found', feasible: true, reason: 'ok', viewRoot: view.view().id, reference: view.capture.reference,
      context, query, required: primary.required, witness, wire, stats: null, verification: Object.freeze({ primary, ref2 }) });
  }
  lookup(view, suppliedContext, suppliedQuery, request) { return this.#query(view, suppliedContext, suppliedQuery, request, false); }
  probe(view, suppliedContext, suppliedQuery, request) { return this.#query(view, suppliedContext, suppliedQuery, request, true); }
  #query(view, suppliedContext, suppliedQuery, request, probeOnly) {
    if (!isPathWitnessView(view)) throw new TypeError('cache lookup requires immutable path view');
    const context = pathWitnessContext(suppliedContext), policyId = pathWitnessPolicyId(context.policy);
    if (policyId !== view.toJSON().policyId) throw new TypeError('cache context policy differs from capture');
    fields(suppliedQuery, ['epoch', ...Object.keys(PATH_ORACLE_LIMITS)]);
    if (!natural(suppliedQuery.epoch)) throw new RangeError('invalid cache query epoch');
    for (const [key, cap] of Object.entries(PATH_ORACLE_LIMITS)) if (!natural(suppliedQuery[key]) || suppliedQuery[key] > cap) throw new RangeError('unsupported cache fallback budget ' + key);
    fields(request, probeOnly ? ['tick'] : ['tick', 'hint']);
    if (!natural(request.tick) || (this.#lastTick !== null && request.tick < this.#lastTick) || request.tick > Number.MAX_SAFE_INTEGER - this.config.ttlTicks) throw new RangeError('invalid/nonmonotonic cache tick or expiry overflow');
    const query = Object.freeze({ epoch: suppliedQuery.epoch, maxExpansions: suppliedQuery.maxExpansions, maxPaths: suppliedQuery.maxPaths, maxPackingSteps: suppliedQuery.maxPackingSteps });
    const key = JSON.stringify([context.domain, context.subject, policyId, query.epoch]);
    const work = { cacheChecks: 0, hintChecks: 0, primaryChecks: 0, ref2Checks: 0, oracleCalls: 0, expired: 0 };
    this.#lastTick = request.tick; this.#counts.queries++;
    for (const [k, entry] of this.#entries) if (request.tick >= entry.expiresAt) { this.#drop(k); this.#counts.expired++; work.expired++; }
    const finish = (outcome, source, entry) => Object.freeze({ ...outcome, schema: probeOnly ? 'facety-path-cache-probe/v1' : 'facety-path-advice/v1', source, work: Object.freeze({ ...work }),
      cache: Object.freeze({ reference: 'verified-whole-witness-fifo/v1', config: this.config, retained: entry !== null, originRoot: entry?.root ?? null, insertedAt: entry?.tick ?? null, expiresAt: entry?.expiresAt ?? null }) });
    const cached = this.#entries.get(key);
    if (cached) {
      work.cacheChecks++; const outcome = this.#check(cached.wire, view, context, query, work);
      if (outcome) { this.#counts.cacheHits++; return finish(outcome, 'cache', cached); }
      this.#drop(key); this.#counts.cacheRejects++;
    }
    if (probeOnly) return finish(Object.freeze({ status: 'miss', feasible: null, reason: 'cache-miss', viewRoot: view.view().id, reference: view.capture.reference,
      context, query, required: null, witness: null, wire: null, stats: null, verification: null }), 'cache', null);
    if (request.hint !== null) {
      work.hintChecks++; const outcome = this.#check(request.hint, view, context, query, work);
      if (outcome) { this.#counts.hintHits++; return finish(outcome, 'hint', this.#retain(key, outcome, request.tick)); }
      this.#counts.hintRejects++;
    }
    work.oracleCalls++; this.#counts.oracleCalls++; const outcome = findPathWitness(view, context, query);
    if (outcome.status === 'found') {
      work.primaryChecks++; work.ref2Checks++; this.#counts.primaryChecks++; this.#counts.ref2Checks++;
      return finish(outcome, 'oracle', this.#retain(key, outcome, request.tick));
    }
    return finish(outcome, 'oracle', null);
  }
  invalidate(input) {
    fields(input, ['edges', 'anchors']); array(input.edges, PATH_CACHE_LIMITS.maxNotices); array(input.anchors, PATH_CACHE_LIMITS.maxNotices);
    const edges = input.edges.map(edge => { array(edge, 2); if (edge.length !== 2) throw new TypeError('cache invalidation edge needs two IDs'); return tuple(id(edge[0]), id(edge[1])); });
    const anchors = input.anchors.map(id), affected = new Set();
    for (const [index, keys] of [[this.#edges, edges], [this.#anchors, anchors]]) for (const item of keys) for (const key of index.get(item) ?? []) affected.add(key);
    for (const key of affected) this.#drop(key);
    this.#counts.invalidations++; this.#counts.invalidated += affected.size;
    return Object.freeze({ evicted: affected.size, edgeNotices: edges.length, anchorNotices: anchors.length });
  }
}
