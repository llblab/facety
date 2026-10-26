// Owns: Bounded supplied-frame maintenance/prefix-query traces and peer-selection accounting; excludes canonical facts, ranking, proof acceptance, caches, network timing and admission.
import { createHash } from 'node:crypto';
import { isPathWitnessView } from './path-witness-view.mjs';
import { buildPathWitnessTrees, refreshPathWitnessTrees, repairPathWitnessTrees, proposePathWitnessFromPrefixes, PATH_TREE_LIMITS, PATH_TREE_REPAIR_LIMITS } from './path-witness-trees.mjs';
import { routePathWitnessPool, PATH_POOL_LIMITS } from './path-witness-pool.mjs';
import { pathWitnessContext } from './path-witness.mjs';
import { provenance } from './provenance.mjs';

export const PATH_WORKLOAD_LIMITS = Object.freeze({ maxFrames: 16, maxSteps: 128, maxPoolsPerFrame: 64, maxLoadIds: 4096 });
const cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const natural = n => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);
const prefixKeys = ['epoch', 'maxPrefixHops', 'maxPrefixes', 'maxExpansions', 'maxBranches', 'maxTreeLookups', 'maxCandidates', 'maxPackingSteps'];
function record(v) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('workload requires data records');
}
function fields(v, keys) {
  record(v);
  if (Reflect.ownKeys(v).length !== keys.length || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) throw new TypeError('workload requires exact fields');
}
function array(a, cap) {
  if (!Array.isArray(a) || a.length > cap) throw new RangeError('workload array bound');
  if (Reflect.ownKeys(a).length !== a.length + 1 || Object.keys(a).length !== a.length) throw new TypeError('workload requires dense arrays');
  for (let i = 0; i < a.length; i++) if (!Object.hasOwn(a, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(a, i), 'value')) throw new TypeError('workload array holes/accessors');
  return a;
}
function text(s, cap = 256) {
  if (typeof s !== 'string' || !s.length || !s.isWellFormed()) throw new TypeError('workload requires Unicode text');
  if (s.length > cap || Buffer.byteLength(s) > cap) throw new RangeError('workload text byte bound');
  return s;
}
function config(q, keys, limits) {
  fields(q, keys);
  for (const key of keys) if (!natural(q[key]) || (key !== 'epoch' && q[key] > limits[key])) throw new RangeError('unsupported workload budget/epoch ' + key);
  return Object.fromEntries(keys.map(k => [k, q[k]]));
}
function add(a, b) { if (!natural(a) || !natural(b) || !Number.isSafeInteger(a + b)) throw new RangeError('workload counter overflow'); return a + b; }
function freeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; }
function available(frame, epoch, grace) {
  return (!grace || (epoch <= frame.currentEpoch && frame.currentEpoch - epoch <= frame.policy.graceEpochs)) && frame.snapshots.some(s => s.epoch === epoch);
}
function normalize(input) {
  fields(input, ['domain', 'frames', 'steps']); const domain = text(input.domain), frames = new Map(), loadIds = new Set(); let namespace = null;
  const preflight = { frames: 0, steps: 0, poolRows: 0, retainedPoolEntries: 0, distinctLoadIds: 0, poolChecks: 0 };
  for (const row of array(input.frames, PATH_WORKLOAD_LIMITS.maxFrames)) {
    fields(row, ['id', 'view', 'pools']); const id = text(row.id);
    if (frames.has(id)) throw new TypeError('duplicate workload frame');
    if (!isPathWitnessView(row.view)) throw new TypeError('workload requires local immutable views');
    const data = row.view.toJSON(), policy = pathWitnessContext({ domain, subject: domain, policy: data.options.policy }).policy;
    const scope = { reference: row.view.capture.reference, storageName: data.source.storage.name };
    if (namespace && (scope.reference !== namespace.reference || scope.storageName !== namespace.storageName)) throw new TypeError('workload frame namespace differs');
    namespace = scope; const subjects = new Set(), pools = [];
    for (const entry of array(row.pools, PATH_WORKLOAD_LIMITS.maxPoolsPerFrame)) {
      fields(entry, ['subject', 'pool']); const subject = pathWitnessContext({ domain, subject: entry.subject, policy }).subject;
      if (subjects.has(subject)) throw new TypeError('duplicate workload pool subject'); subjects.add(subject);
      routePathWitnessPool(entry.pool, { seed: 'workload-preflight', domain, viewId: row.view.view().id, epoch: data.options.currentEpoch, subject, queryId: 'workload-preflight', step: 0, start: 0, count: 0, mode: 'uniform', excluded: [], loads: null });
      preflight.poolChecks++; preflight.poolRows++; preflight.retainedPoolEntries += entry.pool.ranked.length;
      for (const peer of entry.pool.ranked) { loadIds.add(peer.id); if (loadIds.size > PATH_WORKLOAD_LIMITS.maxLoadIds) throw new RangeError('workload load-ID bound'); }
      pools.push({ subject, pool: entry.pool });
    }
    pools.sort((a, b) => cmp(a.subject, b.subject));
    frames.set(id, { id, view: row.view, pools, policy, policyId: data.policyId, currentEpoch: data.options.currentEpoch, snapshots: data.options.snapshots }); preflight.frames++;
  }
  const steps = [], queryIds = new Set(); let symbolic = null;
  for (const raw of array(input.steps, PATH_WORKLOAD_LIMITS.maxSteps)) {
    record(raw); fields(raw, raw.op === 'query' ? ['op', 'id', 'frame', 'subject', 'query', 'routing'] : ['op', 'frame', 'query']);
    if (!['build', 'refresh', 'repair', 'query'].includes(raw.op)) throw new TypeError('unsupported workload operation');
    const frame = frames.get(text(raw.frame)); if (!frame) throw new TypeError('unknown workload frame');
    let request, context = null;
    if (raw.op === 'query') {
      const id = text(raw.id); if (queryIds.has(id)) throw new TypeError('duplicate workload query ID'); queryIds.add(id);
      context = pathWitnessContext({ domain, subject: raw.subject, policy: frame.policy });
      const query = config(raw.query, prefixKeys, PATH_TREE_LIMITS); if (query.maxPrefixHops > frame.policy.maxHops) throw new RangeError('workload prefix depth exceeds policy');
      fields(raw.routing, ['seed', 'step', 'mode']); const seed = text(raw.routing.seed, PATH_POOL_LIMITS.maxSeedBytes);
      if (!natural(raw.routing.step) || !['uniform', 'best-of-two'].includes(raw.routing.mode)) throw new TypeError('invalid workload routing');
      if (symbolic && symbolic.frame.policyId !== frame.policyId) throw new TypeError('workload active policy differs from query frame');
      request = { op: raw.op, id, frame: frame.id, subject: context.subject, query, routing: { seed, step: raw.routing.step, mode: raw.routing.mode } };
    } else {
      const query = raw.op === 'repair' ? config(raw.query, ['epoch', 'maxTreeNodes', ...Object.keys(PATH_TREE_REPAIR_LIMITS)], { ...PATH_TREE_LIMITS, ...PATH_TREE_REPAIR_LIMITS }) : config(raw.query, ['epoch', 'maxExpansions', 'maxTreeNodes'], PATH_TREE_LIMITS);
      request = { op: raw.op, frame: frame.id, query };
      symbolic = (raw.op === 'build' || symbolic) && available(frame, query.epoch, raw.op !== 'build') ? { frame, epoch: query.epoch } : null;
    }
    steps.push({ request, frame, context, expected: symbolic }); preflight.steps++;
  }
  preflight.distinctLoadIds = loadIds.size; return { domain, frames, steps, namespace, preflight, loadIds };
}
function describe(active) {
  if (!active) return null; const f = active.forest, m = f.meta;
  return { viewRoot: m.originRoot, policyId: m.policyId, epoch: m.epoch, reference: m.reference, status: m.status, reason: m.reason, complete: m.complete,
    eligibleRoots: f.anchors().length, retainedRoots: f.toJSON().parents.length, treeNodes: m.stats.treeNodes };
}
function maintenanceResult(status, reason, report = null) {
  const known = report && status !== 'unavailable', actions = known ? {} : null;
  if (known) for (const row of report.roots) actions[row.action] = (actions[row.action] ?? 0) + 1;
  return { status, reason, reset: report?.reset ?? null, deltaComplete: report?.deltaComplete ?? null, retiredRoots: known ? report.retired.length : null, rootActions: actions };
}
function missingQuery() { return { status: 'unavailable', reason: 'forest-missing', feasible: null, required: null, coverage: null, proposalDigest: null, wireDigest: null, wireBytes: null, verification: null }; }
function observeQuery(source, loadRowsBuilt, state) {
  if (source.schema !== 'facety-path-proposal/v1' || !['found', 'miss', 'censored', 'unavailable'].includes(source.status) || source.feasible !== (source.status === 'found' ? true : null) || !source.prefix) throw new Error('workload unexpected query result');
  const found = source.status === 'found';
  if (found && (!source.verification?.primary.accepted || !source.verification?.ref2.accepted || source.verification.primary.required !== source.required || source.verification.ref2.required !== source.required || typeof source.wire !== 'string')) throw new Error('workload positive verification disagreement');
  if (!found && (source.wire !== null || source.verification !== null)) throw new Error('workload unexpected nonpositive proof');
  const selections = new Map(); let offered = 0;
  for (const route of source.prefix.routes) for (const id of route.selected) {
    if (!state.loadIds.has(id)) throw new Error('workload selected unknown load ID');
    selections.set(id, add(selections.get(id) ?? 0, 1)); offered = add(offered, 1);
  }
  if (offered !== source.prefix.stats.routedPeers || source.prefix.routes.length !== source.prefix.stats.routeCalls || (source.status === 'unavailable' && offered)) throw new Error('workload route counter disagreement');
  const total = add(state.total, offered), loadDelta = [...selections].sort(([a], [b]) => cmp(a, b)).map(([id, selected]) => {
    const before = state.loads.get(id) ?? 0; return { id, before, selected, after: add(before, selected) };
  });
  const json = JSON.stringify(source), wire = found ? Buffer.from(source.wire, 'utf8') : null;
  const result = { status: source.status, reason: source.reason, feasible: source.feasible, required: source.required, coverage: source.prefix.coverage,
    proposalDigest: createHash('sha256').update(json).digest('hex'), wireDigest: wire ? createHash('sha256').update(wire).digest('hex') : null, wireBytes: wire?.length ?? null,
    verification: found ? { primaryAccepted: true, ref2Accepted: true } : null };
  const work = { proposal: { ...source.stats }, prefix: { ...source.prefix.stats }, accounting: { loadRowsBuilt, routeRowsFolded: source.prefix.routes.length, selectedPeersFolded: offered, proposalBytesHashed: Buffer.byteLength(json) } };
  for (const row of loadDelta) state.loads.set(row.id, row.after); state.total = total;
  return { result, work, loadDelta };
}
function summarizeLoads(state) {
  const rows = [...state.loads].sort(([a], [b]) => cmp(a, b)).map(([id, load]) => ({ id, load })); let total = 0n, squares = 0n, max = 0;
  for (const { load } of rows) { const n = BigInt(load); total += n; squares += n * n; max = Math.max(max, load); }
  if (total !== BigInt(state.total)) throw new Error('workload load total disagreement');
  return { unit: 'run-cumulative-route-selections/v1', total: state.total, distinct: rows.length, max, herfindahl: total === 0n ? null : Number(squares) / Number(total * total), rows };
}
export function runPathWitnessWorkload(input) {
  const normalized = normalize(input), state = { loads: new Map(), total: 0, loadIds: normalized.loadIds }, rows = [];
  const totals = { operations: Object.fromEntries(['build', 'refresh', 'repair', 'query'].map(op => [op, { requested: 0, called: 0, skipped: 0 }])), queries: { found: 0, miss: 0, censored: 0, unavailable: 0 }, loads: null }; let active = null;
  for (const [index, step] of normalized.steps.entries()) {
    const { request, frame } = step, activeBefore = describe(active), called = request.op === 'build' || active !== null; let result, work = null, loadDelta = [];
    const counter = totals.operations[request.op]; counter.requested++; counter[called ? 'called' : 'skipped']++;
    if (request.op === 'query') {
      if (!called) result = missingQuery();
      else {
        let loadRowsBuilt = 0; const pools = frame.pools.map(({ subject, pool }) => ({ subject, pool, loads: request.routing.mode === 'uniform' ? null : pool.ranked.map(({ id }) => { loadRowsBuilt++; return { id, load: state.loads.get(id) ?? 0 }; }) }));
        const source = proposePathWitnessFromPrefixes(active.forest, frame.view, step.context, request.query, { pools, routing: { ...request.routing, queryId: request.id } });
        ({ result, work, loadDelta } = observeQuery(source, loadRowsBuilt, state));
      }
      totals.queries[result.status]++;
    } else if (!called) result = maintenanceResult('unavailable', 'forest-missing');
    else if (request.op === 'build') {
      const forest = buildPathWitnessTrees(frame.view, request.query); result = maintenanceResult(forest.meta.status, forest.meta.reason); work = { build: { ...forest.meta.stats } };
      active = forest.meta.status === 'unavailable' ? null : { forest, frame };
    } else {
      const source = (request.op === 'refresh' ? refreshPathWitnessTrees : repairPathWitnessTrees)(active.forest, active.frame.view, frame.view, request.query);
      result = maintenanceResult(source.report.status, source.report.reason, source.report); work = { forest: source.forest ? { ...source.forest.meta.stats } : null, maintenance: { ...source.report.work } };
      active = source.forest ? { forest: source.forest, frame } : null;
    }
    if (Boolean(active) !== Boolean(step.expected) || (active && (active.forest.meta.originRoot !== step.expected.frame.view.view().id || active.forest.meta.epoch !== step.expected.epoch || active.forest.meta.policyId !== step.expected.frame.policyId))) throw new Error('workload active availability/state disagreement');
    rows.push({ index, request, called, activeBefore, activeAfter: describe(active), result, work, loadDelta });
  }
  totals.loads = summarizeLoads(state);
  return freeze({ schema: 'facety-path-workload/v1', reference: 'bounded-prefix-route-load/v1', provenance: provenance(), domain: normalized.domain, namespace: normalized.namespace,
    frames: [...normalized.frames.values()].map(f => ({ id: f.id, viewRoot: f.view.view().id, policyId: f.policyId, currentEpoch: f.currentEpoch, pools: f.pools.map(row => ({ subject: row.subject, poolId: row.pool.id })) })),
    preflight: normalized.preflight, rows, totals, finalForest: describe(active) });
}
