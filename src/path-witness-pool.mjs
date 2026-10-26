// Owns: Bounded supplied-score pools and keyed advisory next-hop sampling; excludes graph eligibility, witness assembly, load authority and economic permission.
import { createHash } from 'node:crypto';
import { Random, RANDOM_GENERATOR } from './random.mjs';

export const PATH_POOL_LIMITS = Object.freeze({ maxCandidates: 4096, maxPoolSize: 64, maxRoutes: 64, maxIdBytes: 256, maxSeedBytes: 1024 });
export const PATH_POOL_RANDOMNESS = Object.freeze({ policy: 'path-pool-keyed/v1', generator: RANDOM_GENERATOR });
const pools = new WeakSet(), cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const natural = n => Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0;
function fields(value, keys) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).length !== keys.length
    || Reflect.ownKeys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('path pool requires exact data fields');
}
function text(value, maximum = PATH_POOL_LIMITS.maxIdBytes) {
  if (typeof value !== 'string' || !value.length || !value.isWellFormed()) throw new TypeError('path pool requires nonempty Unicode text');
  if (value.length > maximum || Buffer.byteLength(value) > maximum) throw new RangeError('path pool text byte bound');
  return value;
}
function number(value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!natural(value) || value > maximum) throw new RangeError('path pool integer bound');
  return value;
}
function array(value, maximum) {
  if (!Array.isArray(value)) throw new TypeError('path pool requires a dense array');
  if (value.length > maximum) throw new RangeError('path pool raw array bound');
  if (Object.keys(value).length !== value.length || Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError('path pool requires a dense array');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, i), 'value')) throw new TypeError('path pool array holes/accessors');
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
export function createPathWitnessPool(input) {
  fields(input, ['metric', 'maxPoolSize', 'candidates']);
  if (!['supplied-synthetic/v1', 'supplied-xp/v1', 'supplied-standing/v1'].includes(input.metric)) throw new TypeError('unsupported supplied pool metric');
  const maxPoolSize = number(input.maxPoolSize, PATH_POOL_LIMITS.maxPoolSize), seen = new Set(); let unknown = 0;
  const ranked = [];
  for (const row of array(input.candidates, PATH_POOL_LIMITS.maxCandidates)) {
    fields(row, ['id', 'score']); const id = text(row.id);
    if (seen.has(id)) throw new TypeError('duplicate path pool ID');
    seen.add(id);
    if (row.score === null) unknown++; else ranked.push({ id, score: number(row.score) });
  }
  ranked.sort((a, b) => b.score - a.score || cmp(a.id, b.id)); ranked.length = Math.min(ranked.length, maxPoolSize);
  const id = createHash('sha256').update(JSON.stringify(['facety-path-pool/v1', input.metric, maxPoolSize, ranked])).digest('hex');
  const pool = freeze({ schema: 'facety-path-pool/v1', id, metric: input.metric, maxPoolSize, ranked, inputCandidates: seen.size, unknown });
  pools.add(pool); return pool;
}
export function routePathWitnessPool(pool, input) {
  if (!pools.has(pool)) throw new TypeError('routing requires a locally constructed pool');
  fields(input, ['seed', 'domain', 'viewId', 'epoch', 'subject', 'queryId', 'step', 'start', 'count', 'mode', 'excluded', 'loads']);
  const seed = text(input.seed, PATH_POOL_LIMITS.maxSeedBytes), domain = text(input.domain), viewId = text(input.viewId), subject = text(input.subject), queryId = text(input.queryId);
  const epoch = number(input.epoch), step = number(input.step), start = number(input.start), count = number(input.count, PATH_POOL_LIMITS.maxRoutes), mode = input.mode;
  if (count > 0 && start > Number.MAX_SAFE_INTEGER - (count - 1)) throw new RangeError('path pool ordinal overflow');
  if (!['uniform', 'best-of-two'].includes(mode)) throw new TypeError('unsupported path pool routing mode');
  const excluded = [...new Set(array(input.excluded, PATH_POOL_LIMITS.maxCandidates).map(id => text(id)))].sort(cmp), blocked = new Set([...excluded, subject]);
  const loads = new Map(), retained = new Set(pool.ranked.map(row => row.id)); let loadTelemetry = null, snapshot = null;
  if (mode === 'uniform') { if (input.loads !== null) throw new TypeError('uniform routing requires null loads'); }
  else {
    for (const row of array(input.loads, PATH_POOL_LIMITS.maxPoolSize)) {
      fields(row, ['id', 'load']); const id = text(row.id);
      if (!retained.has(id) || loads.has(id)) throw new TypeError('path pool load IDs must cover the retained pool exactly');
      loads.set(id, number(row.load));
    }
    if (loads.size !== retained.size) throw new TypeError('path pool load IDs must cover the retained pool exactly');
    snapshot = pool.ranked.map(({ id }) => ({ id, load: loads.get(id) }));
    let total = 0n, squares = 0n, maximum = 0;
    for (const { load } of snapshot) { const n = BigInt(load); total += n; squares += n * n; maximum = Math.max(maximum, load); }
    loadTelemetry = { total: String(total), max: maximum, herfindahl: total === 0n ? null : Number(squares) / Number(total * total) };
  }
  const query = { seed, domain, viewId, epoch, subject, queryId, step, start, count, mode, excluded, loads: snapshot };
  const remaining = pool.ranked.map(row => row.id).filter(id => !blocked.has(id)), selected = [], trials = [];
  const stats = { poolRows: pool.ranked.length, excludedIds: excluded.length, selections: 0, generators: 0, draws: 0, loadComparisons: 0 };
  for (let i = 0; i < count && remaining.length; i++) {
    const ordinal = start + i, random = new Random(JSON.stringify([PATH_POOL_RANDOMNESS.policy, seed, domain, viewId, epoch, subject, queryId, step, ordinal, mode, pool.id]));
    stats.generators++; const first = random.int(remaining.length); stats.draws++;
    const sampled = [remaining[first]]; let winner = first;
    if (mode === 'best-of-two' && remaining.length > 1) {
      let second = random.int(remaining.length - 1); if (second >= first) second++;
      stats.draws++; stats.loadComparisons++; sampled.push(remaining[second]);
      const a = loads.get(remaining[first]), b = loads.get(remaining[second]);
      if (b < a || (b === a && cmp(remaining[second], remaining[first]) < 0)) winner = second;
    }
    const chosen = remaining.splice(winner, 1)[0]; selected.push(chosen); trials.push({ ordinal, sampled, chosen }); stats.selections++;
  }
  const complete = selected.length === count;
  return freeze({ schema: 'facety-path-route/v1', status: complete ? 'routed' : 'partial', reason: complete ? 'ok' : 'pool-exhausted', complete,
    pool, query, randomness: PATH_POOL_RANDOMNESS, selected, trials, loadTelemetry, stats });
}
