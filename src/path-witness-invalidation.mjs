// Owns: Explicit ordered whole/segment advisory notice fan-out and native state/receipt consistency; excludes canonical mapping, shared clocks, queries, rollback, lifecycle and economic authority.
import { PathWitnessCache, PATH_CACHE_LIMITS } from './path-witness-cache.mjs';
import { PathWitnessSegmentCache, PATH_SEGMENT_LIMITS } from './path-witness-segments.mjs';
import { PATH_WITNESS_LIMITS } from './path-witness.mjs';
import { provenance } from './provenance.mjs';
const counters = ['queries', 'cacheHits', 'hintHits', 'cacheRejects', 'hintRejects', 'primaryChecks', 'ref2Checks', 'oracleCalls', 'expired', 'invalidations', 'invalidated', 'fifoEvicted', 'retentionSkipped'];
const natural = n => Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0;
function fields(v, keys) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Reflect.ownKeys(v).length !== keys.length || Object.keys(v).length !== keys.length
    || keys.some(k => !Object.hasOwn(v, k)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('invalidation requires exact data fields');
}
function array(v, cap) {
  if (!Array.isArray(v) || ![Array.prototype, null].includes(Object.getPrototypeOf(v))) throw new TypeError('invalidation requires plain arrays');
  if (v.length > cap) throw new RangeError('invalidation array bound');
  if (Reflect.ownKeys(v).length !== v.length + 1 || Object.keys(v).length !== v.length) throw new TypeError('invalidation requires dense arrays');
  const copy = [];
  for (let i = 0; i < v.length; i++) {
    if (!Object.hasOwn(v, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v, i), 'value')) throw new TypeError('invalidation array holes/accessors');
    copy.push(v[i]);
  }
  return copy;
}
function text(v, cap = PATH_WITNESS_LIMITS.maxIdBytes) {
  if (typeof v !== 'string' || !v.length || !v.isWellFormed()) throw new TypeError('invalidation requires Unicode text');
  if (v.length > cap || Buffer.byteLength(v) > cap) throw new RangeError('invalidation text byte bound');
  return v;
}
function normalize(v, key, cap) {
  fields(v, ['edges', key]);
  const edges = array(v.edges, cap).map(edge => { const pair = array(edge, 2); if (pair.length !== 2) throw new TypeError('invalidation edge needs two IDs'); return pair.map(id => text(id)); });
  return { edges, [key]: array(v[key], cap).map(id => text(id)) };
}
function config(v, limits, segment) {
  const keys = segment ? ['ledgerId', 'maxEntries', 'maxBytes', 'ttlTicks'] : ['maxEntries', 'maxBytes', 'ttlTicks']; fields(v, keys);
  if (segment) text(v.ledgerId, PATH_SEGMENT_LIMITS.maxIdBytes);
  for (const key of ['maxEntries', 'maxBytes', 'ttlTicks']) if (!natural(v[key]) || v[key] > limits[key] || (key === 'ttlTicks' && v[key] === 0)) throw new RangeError('invalidation unsupported cache configuration');
}
function inventory(s, cfg, keys) {
  if (['entries', 'bytes', ...keys].some(k => !natural(s[k])) || (s.lastTick !== null && !natural(s.lastTick)) || s.entries > cfg.maxEntries || s.bytes > cfg.maxBytes
    || (s.entries === 0 ? s.bytes !== 0 || keys.some(k => s[k] !== 0) : s.bytes === 0 || s.lastTick === null)) throw new Error('invalidation unsafe native inventory');
}
function wholeStats(cache) {
  const s = PathWitnessCache.prototype.stats.call(cache); config(cache.config, PATH_CACHE_LIMITS, false);
  fields(s, [...counters, 'entries', 'bytes', 'edgeKeys', 'anchorKeys', 'lastTick']); inventory(s, cache.config, ['edgeKeys', 'anchorKeys']);
  if (counters.some(k => !natural(s[k]))) throw new Error('invalidation unsafe whole counters');
  return s;
}
function segmentStats(cache) {
  const s = PathWitnessSegmentCache.prototype.stats.call(cache); config(cache.config, PATH_SEGMENT_LIMITS, true);
  fields(s, ['schema', 'config', 'entries', 'bytes', 'endpointKeys', 'edgeKeys', 'vertexKeys', 'lastTick', 'records']); inventory(s, cache.config, ['endpointKeys', 'edgeKeys', 'vertexKeys']);
  if (s.schema !== 'facety-segment-inventory/v1' || JSON.stringify(s.config) !== JSON.stringify(cache.config)) throw new Error('invalidation segment schema/config disagreement');
  const records = array(s.records, cache.config.maxEntries), ids = new Set(); let bytes = 0;
  for (const r of records) {
    fields(r, ['id', 'bytes', 'originRoot', 'storedAt', 'expiresAt', 'lastVerifiedRoot', 'verifiedAt', 'uses', 'usesSaturated']); text(r.id); text(r.originRoot); text(r.lastVerifiedRoot);
    if (ids.has(r.id) || ['bytes', 'storedAt', 'expiresAt', 'verifiedAt', 'uses'].some(k => !natural(r[k])) || r.bytes === 0 || r.expiresAt - r.storedAt !== cache.config.ttlTicks
      || r.verifiedAt < r.storedAt || r.verifiedAt > s.lastTick || typeof r.usesSaturated !== 'boolean' || (r.usesSaturated && r.uses !== Number.MAX_SAFE_INTEGER)) throw new Error('invalidation segment record disagreement');
    ids.add(r.id); bytes += r.bytes; if (!natural(bytes)) throw new Error('invalidation segment byte overflow');
  }
  if (records.length !== s.entries || bytes !== s.bytes) throw new Error('invalidation segment inventory disagreement');
  return s;
}
function change(before, after, receipt, notices, key, indexes) {
  fields(receipt, ['evicted', 'edgeNotices', key === 'anchors' ? 'anchorNotices' : 'vertexNotices']); const countKey = key === 'anchors' ? 'anchorNotices' : 'vertexNotices';
  if (Object.values(receipt).some(n => !natural(n)) || receipt.edgeNotices !== notices.edges.length || receipt[countKey] !== notices[key].length || receipt.evicted > before.entries
    || after.entries !== before.entries - receipt.evicted || after.bytes > before.bytes || after.lastTick !== before.lastTick || indexes.some(k => after[k] > before[k])
    || (receipt.evicted === 0 ? after.bytes !== before.bytes || indexes.some(k => after[k] !== before[k]) : after.bytes >= before.bytes)) throw new Error('invalidation owner receipt/state disagreement');
}
function freeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }
export function invalidatePathWitnessCaches(whole, segments, input) {
  fields(input, ['whole', 'segments']); const request = { whole: normalize(input.whole, 'anchors', PATH_CACHE_LIMITS.maxNotices), segments: normalize(input.segments, 'vertices', PATH_SEGMENT_LIMITS.maxNotices) };
  if (!whole || Object.getPrototypeOf(whole) !== PathWitnessCache.prototype || !segments || Object.getPrototypeOf(segments) !== PathWitnessSegmentCache.prototype) throw new TypeError('invalidation requires exact local cache owners');
  const before = { whole: wholeStats(whole), segments: segmentStats(segments) };
  if (before.whole.invalidations === Number.MAX_SAFE_INTEGER || before.whole.invalidated > Number.MAX_SAFE_INTEGER - before.whole.entries) throw new RangeError('invalidation whole counter headroom');
  const wr = PathWitnessCache.prototype.invalidate.call(whole, request.whole), wa = wholeStats(whole);
  change(before.whole, wa, wr, request.whole, 'anchors', ['edgeKeys', 'anchorKeys']);
  for (const key of counters) if (wa[key] !== before.whole[key] + (key === 'invalidations' ? 1 : key === 'invalidated' ? wr.evicted : 0)) throw new Error('invalidation whole counter disagreement');
  const sr = PathWitnessSegmentCache.prototype.invalidate.call(segments, request.segments), sa = segmentStats(segments);
  change(before.segments, sa, sr, request.segments, 'vertices', ['endpointKeys', 'edgeKeys', 'vertexKeys']);
  const kept = new Set(sa.records.map(r => r.id)), survivors = before.segments.records.filter(r => kept.has(r.id)), removed = before.segments.records.filter(r => !kept.has(r.id));
  if (JSON.stringify(survivors) !== JSON.stringify(sa.records) || removed.length !== sr.evicted || removed.reduce((n, r) => n + r.bytes, 0) !== before.segments.bytes - sa.bytes) throw new Error('invalidation retained segment metadata disagreement');
  return freeze({ schema: 'facety-path-invalidation/v1', reference: 'explicit-dual-cache-notices/v1', provenance: provenance(), input: request, configs: { whole: whole.config, segments: segments.config },
    stages: { whole: { called: true, before: before.whole, receipt: wr, after: wa }, segments: { called: true, before: before.segments, receipt: sr, after: sa } },
    work: { whole: { calls: 1, edgeNotices: wr.edgeNotices, anchorNotices: wr.anchorNotices, evicted: wr.evicted }, segments: { calls: 1, edgeNotices: sr.edgeNotices, vertexNotices: sr.vertexNotices, evicted: sr.evicted } } });
}
