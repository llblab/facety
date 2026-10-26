// Owns: Bounded advisory partial-path identity, local liveness, logical TTL/use and eviction; excludes witness/family authority, search, Model mutation and randomness.
import { createHash } from 'node:crypto';
import { pathWitnessContext, pathWitnessPolicyId } from './path-witness.mjs';
import { isPathWitnessView } from './path-witness-view.mjs';

export const PATH_SEGMENT_LIMITS = Object.freeze({ maxEntries: 1024, maxBytes: 1048576, ttlTicks: 1000000, maxChecks: 1024, maxResults: 64, maxNotices: 4096, maxIdBytes: 256, maxEdgeIdBytes: 64 });
const prepared = new WeakMap(), tuple = (a, b) => JSON.stringify([a, b]), cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function fields(value, keys) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== keys.length || Object.keys(value).length !== keys.length
    || keys.some(k => !Object.hasOwn(value, k)) || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('segment requires exact plain data fields');
}
function natural(value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > maximum) throw new RangeError('segment integer bound');
  return value;
}
function text(value, maximum = PATH_SEGMENT_LIMITS.maxIdBytes) {
  if (typeof value !== 'string' || !value.length || !value.isWellFormed()) throw new TypeError('segment requires nonempty Unicode text');
  if (value.length > maximum || Buffer.byteLength(value) > maximum) throw new RangeError('segment text byte bound');
  return value;
}
function array(value, maximum) {
  if (!Array.isArray(value) || ![Array.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('segment requires plain dense arrays');
  if (value.length > maximum) throw new RangeError('segment raw array bound');
  if (Object.keys(value).length !== value.length || Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError('segment requires dense arrays');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, i), 'value')) throw new TypeError('segment array holes/accessors');
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function work() { return { expired: 0, evicted: 0, refreshed: 0, checked: 0, returned: 0, preparedStorageEdges: 0, preparedNodes: 0, vertexChecks: 0, scoreChecks: 0, edgeChecks: 0, referenceReads: 0, idChecks: 0 }; }
function indexFor(view, counts) {
  let index = prepared.get(view);
  if (!index) {
    const data = view.toJSON(); index = { live: new Set(data.live.nodes), ids: new Map(data.source.storage.edges.map(e => [tuple(e.from, e.to), e.id])) };
    counts.preparedStorageEdges += data.source.storage.edges.length; counts.preparedNodes += data.live.nodes.length; prepared.set(view, index);
  }
  return index;
}
function checkPath(view, context, path, counts, original = null) {
  if (path.length === 1) return { reason: 'zero-hop' };
  if (new Set(path).size !== path.length) return { reason: 'non-simple' };
  const index = indexFor(view, counts), p = context.policy;
  for (const id of path) { counts.vertexChecks++; if (!index.live.has(id)) return { reason: 'vertex-unavailable' }; }
  if (p.minStanding !== null) for (const id of path.slice(1, -1)) {
    counts.scoreChecks++; const score = view.standing(id); if (score === null || score < p.minStanding) return { reason: 'intermediate-score' };
  }
  const hops = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], orientations = p.direction === 'directed-from-anchor' ? [[b, a]] : [[a, b], [b, a]], live = new Map();
    for (const [from, to] of orientations) {
      counts.edgeChecks++;
      if (view.edge(from, to)) {
        counts.referenceReads++; const id = index.ids.get(tuple(from, to));
        if (id === undefined) throw new Error('live segment edge lacks captured storage identity');
        live.set(tuple(from, to), { from, to, id });
      }
    }
    if (live.size === 0 || (p.direction === 'undirected' && p.undirectedProjection === 'reciprocal-only' && live.size !== 2)) return { reason: 'dead-edge' };
    if (original) {
      const matches = original[i - 1].map(ref => { counts.idChecks++; return live.get(tuple(ref.from, ref.to))?.id === ref.id; });
      const any = p.direction === 'undirected' && p.undirectedProjection === 'any-live-orientation';
      if (any ? !matches.some(Boolean) : !matches.every(Boolean)) return { reason: 'relation-changed' };
    } else {
      const refs = [...live.values()].sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to) || cmp(x.id, y.id));
      if (refs.some(ref => Buffer.byteLength(ref.id) > PATH_SEGMENT_LIMITS.maxEdgeIdBytes)) return { reason: 'identity-bound', unavailable: true };
      hops.push(refs);
    }
  }
  return { reason: null, hops };
}
function snapshot(entry) { return freeze({ ...entry.data, originRoot: entry.originRoot, storedAt: entry.storedAt, expiresAt: entry.expiresAt,
  lastVerifiedRoot: entry.lastVerifiedRoot, verifiedAt: entry.verifiedAt, uses: entry.uses, usesSaturated: entry.usesSaturated }); }
export class PathWitnessSegmentCache {
  #entries = new Map(); #endpoints = new Map(); #edges = new Map(); #vertices = new Map(); #bytes = 0; #lastTick = null;
  constructor(input) {
    fields(input, ['ledgerId', 'maxEntries', 'maxBytes', 'ttlTicks']); const ledgerId = text(input.ledgerId);
    for (const key of ['maxEntries', 'maxBytes', 'ttlTicks']) natural(input[key], PATH_SEGMENT_LIMITS[key]);
    if (input.ttlTicks === 0) throw new RangeError('segment TTL must be positive');
    Object.defineProperty(this, 'config', { value: Object.freeze({ ledgerId, maxEntries: input.maxEntries, maxBytes: input.maxBytes, ttlTicks: input.ttlTicks }), enumerable: true }); Object.freeze(this);
  }
  stats() { return freeze({ schema: 'facety-segment-inventory/v1', config: this.config, entries: this.#entries.size, bytes: this.#bytes,
    endpointKeys: this.#endpoints.size, edgeKeys: this.#edges.size, vertexKeys: this.#vertices.size, lastTick: this.#lastTick,
    records: [...this.#entries.values()].map(e => ({ id: e.data.id, bytes: e.data.bytes, originRoot: e.originRoot, storedAt: e.storedAt, expiresAt: e.expiresAt,
      lastVerifiedRoot: e.lastVerifiedRoot, verifiedAt: e.verifiedAt, uses: e.uses, usesSaturated: e.usesSaturated })) }); }
  #drop(id) {
    const entry = this.#entries.get(id); if (!entry) return;
    for (const [index, keys] of [[this.#endpoints, [entry.bucket]], [this.#edges, entry.edges], [this.#vertices, entry.vertices]]) for (const key of keys) {
      const members = index.get(key); members.delete(id); if (!members.size) index.delete(key);
    }
    this.#entries.delete(id); this.#bytes -= entry.data.bytes;
  }
  #advance(tick, counts) {
    this.#lastTick = tick;
    for (const [id, entry] of this.#entries) if (tick >= entry.expiresAt) { this.#drop(id); counts.expired++; }
  }
  #request(view, suppliedContext, epoch, tick, insertion) {
    if (!isPathWitnessView(view)) throw new TypeError('segments require immutable path view');
    const context = pathWitnessContext(suppliedContext), policyId = pathWitnessPolicyId(context.policy);
    if (policyId !== view.toJSON().policyId) throw new TypeError('segment policy differs from capture');
    natural(epoch); natural(tick);
    if ((this.#lastTick !== null && tick < this.#lastTick) || (insertion && tick > Number.MAX_SAFE_INTEGER - this.config.ttlTicks)) throw new RangeError('segment clock rollback/expiry overflow');
    const scope = Object.freeze([this.config.ledgerId, context.domain, view.capture.reference, view.toJSON().source.storage.name, policyId, epoch]);
    const current = view.view().epoch;
    const unavailable = epoch > current || current - epoch > context.policy.graceEpochs ? 'epoch-outside-grace' : view.snapshot(epoch) === null ? 'snapshot-unavailable' : null;
    return { context, scope, currentRoot: view.view().id, unavailable };
  }
  put(view, suppliedContext, input) {
    fields(input, ['epoch', 'path', 'tick']);
    const request = this.#request(view, suppliedContext, input.epoch, input.tick, true), p = request.context.policy, raw = array(input.path, p.maxHops + 1), path = [];
    if (!raw.length) throw new TypeError('segment path needs a vertex');
    for (let i = 0; i < raw.length; i++) path.push(text(raw[i], p.maxIdBytes));
    if (path[0] !== request.context.subject) throw new TypeError('segment path differs from expected subject');
    const counts = work(); this.#advance(input.tick, counts);
    const result = (status, reason, entry = null, id = null, bytes = null) => freeze({ schema: 'facety-segment-put/v1', status, reason,
      config: this.config, context: request.context, epoch: input.epoch, currentRoot: request.currentRoot, segment: entry ? snapshot(entry) : null,
      id: entry?.data.id ?? id, bytes: entry?.data.bytes ?? bytes, work: { ...counts } });
    if (request.unavailable) return result('unavailable', request.unavailable);
    counts.checked++; const checked = checkPath(view, request.context, path, counts);
    if (checked.reason) return result(checked.unavailable ? 'unavailable' : 'rejected', checked.reason);
    const payload = JSON.stringify(['facety-path-segment/v1', ...request.scope, path, checked.hops]), bytes = Buffer.byteLength(payload), id = createHash('sha256').update(payload).digest('hex');
    if (!this.config.maxEntries || !this.config.maxBytes) return result('not-stored', 'capacity-disabled', null, id, bytes);
    if (bytes > this.config.maxBytes) return result('not-stored', 'byte-limit', null, id, bytes);
    if (this.#entries.has(id)) { this.#drop(id); counts.refreshed++; }
    while (this.#entries.size >= this.config.maxEntries || this.#bytes + bytes > this.config.maxBytes) { this.#drop(this.#entries.keys().next().value); counts.evicted++; }
    const data = freeze({ id, scope: [...request.scope], epoch: input.epoch, path, hopReferences: checked.hops, bytes }), edges = new Set(), vertices = new Set(path);
    for (let i = 1; i < path.length; i++) { edges.add(tuple(path[i - 1], path[i])); edges.add(tuple(path[i], path[i - 1])); }
    const entry = { data, bucket: JSON.stringify([...request.scope, path[0], path.at(-1)]), edges, vertices, originRoot: request.currentRoot,
      storedAt: input.tick, expiresAt: input.tick + this.config.ttlTicks, verifiedAt: input.tick, lastVerifiedRoot: request.currentRoot, uses: 0, usesSaturated: false };
    this.#entries.set(id, entry); this.#bytes += bytes;
    for (const [index, keys] of [[this.#endpoints, [entry.bucket]], [this.#edges, edges], [this.#vertices, vertices]]) for (const key of keys) {
      if (!index.has(key)) index.set(key, new Set()); index.get(key).add(id);
    }
    return result('stored', 'ok', entry);
  }
  lookup(view, suppliedContext, input) {
    fields(input, ['epoch', 'to', 'tick', 'maxChecks', 'maxResults']);
    const request = this.#request(view, suppliedContext, input.epoch, input.tick, false), to = text(input.to, request.context.policy.maxIdBytes);
    natural(input.maxChecks, PATH_SEGMENT_LIMITS.maxChecks); natural(input.maxResults, PATH_SEGMENT_LIMITS.maxResults);
    const counts = work(), segments = []; this.#advance(input.tick, counts);
    const result = (status, reason, completeCacheScan) => freeze({ schema: 'facety-segment-advice/v1', status, reason, completeCacheScan,
      config: this.config, context: request.context, query: { epoch: input.epoch, to, tick: input.tick, maxChecks: input.maxChecks, maxResults: input.maxResults },
      currentRoot: request.currentRoot, segments, work: { ...counts } });
    if (request.unavailable) return result('unavailable', request.unavailable, null);
    const ids = [...(this.#endpoints.get(JSON.stringify([...request.scope, request.context.subject, to])) ?? [])]; let at = 0, reason = 'ok';
    for (; at < ids.length; at++) {
      if (counts.checked === input.maxChecks) { reason = 'check-limit'; break; }
      if (segments.length === input.maxResults) { reason = 'result-limit'; break; }
      const entry = this.#entries.get(ids[at]); counts.checked++;
      const checked = checkPath(view, request.context, entry.data.path, counts, entry.data.hopReferences);
      if (checked.reason) { this.#drop(ids[at]); counts.evicted++; continue; }
      if (entry.uses === Number.MAX_SAFE_INTEGER) entry.usesSaturated = true; else entry.uses++;
      entry.verifiedAt = input.tick; entry.lastVerifiedRoot = request.currentRoot; segments.push(snapshot(entry)); counts.returned++;
    }
    const complete = at === ids.length;
    return result(segments.length ? complete ? 'hit' : 'partial' : complete ? 'miss' : 'censored', complete && !segments.length ? 'cache-miss' : reason, complete);
  }
  invalidate(input) {
    fields(input, ['edges', 'vertices']); const edges = array(input.edges, PATH_SEGMENT_LIMITS.maxNotices), vertices = array(input.vertices, PATH_SEGMENT_LIMITS.maxNotices), keys = [];
    for (let i = 0; i < edges.length; i++) {
      const edge = array(edges[i], 2); if (edge.length !== 2) throw new TypeError('segment notice needs two endpoints');
      const a = text(edge[0]), b = text(edge[1]); keys.push(tuple(a, b), tuple(b, a));
    }
    const vertexIds = []; for (let i = 0; i < vertices.length; i++) vertexIds.push(text(vertices[i]));
    const affected = new Set();
    for (const [index, notices] of [[this.#edges, keys], [this.#vertices, vertexIds]]) for (const key of notices) for (const id of index.get(key) ?? []) affected.add(id);
    for (const id of affected) this.#drop(id);
    return Object.freeze({ evicted: affected.size, edgeNotices: edges.length, vertexNotices: vertices.length });
  }
}
