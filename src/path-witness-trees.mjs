// Owns: Bounded single-parent anchor BFS advice and dual-verified candidate assembly; excludes global completeness, pool routing, dynamic repair and authority.
import { pathWitnessContext, pathWitnessPolicyId, encodePathWitness, decodePathWitness, verifyPathWitness } from './path-witness.mjs';
import { verifyPathWitnessRef2 } from './path-witness-ref2.mjs';
import { isPathWitnessView } from './path-witness-view.mjs';

export const PATH_TREE_LIMITS = Object.freeze({ maxExpansions: 1000000, maxTreeNodes: 65536, maxCandidates: 256, maxPackingSteps: 1000000 });
const forests = new WeakSet(), cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const natural = n => Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0;
function config(input, keys) {
  if (!input || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Reflect.ownKeys(input).length !== keys.length || Object.keys(input).length !== keys.length
    || keys.some(k => !Object.hasOwn(input, k)) || Object.values(Object.getOwnPropertyDescriptors(input)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('trees require exact data fields');
  for (const key of keys) if (!natural(input[key]) || (key !== 'epoch' && input[key] > PATH_TREE_LIMITS[key])) throw new RangeError('unsupported tree budget/epoch ' + key);
  return Object.freeze(Object.fromEntries(keys.map(k => [k, input[k]])));
}
function freeze(v) { if (v && typeof v === 'object') { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; }
export function buildPathWitnessTrees(view, input) {
  if (!isPathWitnessView(view)) throw new TypeError('tree build requires immutable capture');
  const budget = config(input, ['epoch', 'maxExpansions', 'maxTreeNodes']), data = view.toJSON(), p = data.options.policy;
  const snapshot = data.options.snapshots.find(s => s.epoch === budget.epoch), live = new Set(view.nodeIds());
  const anchors = Object.freeze((snapshot?.anchors ?? []).filter(a => live.has(a) && !view.removed(a)));
  const forward = new Map(view.nodeIds().map(v => [v, new Set()]));
  for (const [a, b] of data.live.edges) {
    if (p.direction === 'directed-from-anchor') forward.get(a).add(b);
    else if (p.undirectedProjection === 'any-live-orientation' || view.edge(b, a)) { forward.get(a).add(b); forward.get(b).add(a); }
  }
  const next = new Map([...forward].map(([v, neighbors]) => [v, [...neighbors].sort(cmp)]));
  const stats = { preparedNodes: live.size, preparedEdges: data.live.edges.length, projectedArcs: [...next.values()].reduce((n, a) => n + a.length, 0),
    rootsStarted: 0, rootsCompleted: 0, expansions: 0, treeNodes: 0 };
  const trees = new Map(); let stop = null;
  for (const anchor of anchors) {
    if (stats.treeNodes === budget.maxTreeNodes) { stop = 'tree-node-limit'; break; }
    const tree = new Map([[anchor, { distance: 0, parent: null }]]), queue = [anchor]; trees.set(anchor, tree);
    stats.rootsStarted++; stats.treeNodes++;
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head], distance = tree.get(node).distance;
      if (distance === p.maxHops) continue;
      if (node !== anchor && p.minStanding !== null) { const standing = view.standing(node); if (standing === null || standing < p.minStanding) continue; }
      for (const child of next.get(node)) {
        if (stats.expansions === budget.maxExpansions) { stop = 'build-expansion-limit'; break; }
        stats.expansions++;
        if (tree.has(child)) continue;
        if (stats.treeNodes === budget.maxTreeNodes) { stop = 'tree-node-limit'; break; }
        tree.set(child, { distance: distance + 1, parent: node }); stats.treeNodes++; queue.push(child);
      }
      if (stop) break;
    }
    if (stop) break;
    stats.rootsCompleted++;
  }
  const meta = freeze({ reference: 'single-parent-bounded-bfs/v1', status: !snapshot ? 'unavailable' : stop ? 'censored' : 'built',
    reason: !snapshot ? 'snapshot-unavailable' : stop ?? 'ok', complete: snapshot !== undefined && stop === null,
    originRoot: view.view().id, policyId: data.policyId, epoch: budget.epoch, maxHops: p.maxHops, config: budget, stats });
  const exported = freeze({ schema: 'facety-path-forest/v1', meta, anchors: [...anchors], parents: [...trees].map(([anchor, tree]) => ({ anchor,
    nodes: [...tree].sort(([a], [b]) => cmp(a, b)).map(([subject, record]) => ({ subject, distance: record.distance, parent: record.parent })) })) });
  const forest = Object.freeze({ meta, anchors: () => exported.anchors, toJSON: () => exported, path: (subject, anchor) => {
    const tree = trees.get(anchor); if (!tree?.has(subject)) return null;
    const path = [subject]; let node = subject;
    while (node !== anchor) { node = tree.get(node).parent; path.push(node); }
    return Object.freeze(path);
  } });
  forests.add(forest); return forest;
}
export function proposePathWitnessFromTrees(forest, view, suppliedContext, input) {
  if (!forests.has(forest) || !isPathWitnessView(view)) throw new TypeError('proposal requires local forest and immutable current capture');
  const context = pathWitnessContext(suppliedContext), p = context.policy, policyId = pathWitnessPolicyId(p);
  if (view.toJSON().policyId !== policyId || forest.meta.policyId !== policyId) throw new TypeError('tree proposal policy differs from capture');
  const query = config(input, ['epoch', 'maxCandidates', 'maxPackingSteps']);
  const stats = { treeLookups: 0, candidatesExamined: 0, liveCandidates: 0, edgeChecks: 0, scoreChecks: 0, packingSteps: 0,
    validationComplete: false, packingComplete: false };
  let required = null, witness = null, wire = null, verification = null;
  const result = (status, reason) => freeze({ schema: 'facety-path-proposal/v1', status, feasible: status === 'found' ? true : null, reason,
    viewRoot: view.view().id, canonicalReference: view.capture.reference, forestRoot: forest.meta.originRoot, forest: forest.meta,
    context, query, required, witness, wire, verification, stats: { ...stats } });
  if (forest.meta.epoch !== query.epoch) return result('unavailable', 'forest-epoch-mismatch');
  const current = view.view().epoch;
  if (query.epoch > current || current - query.epoch > p.graceEpochs) return result('unavailable', 'epoch-outside-grace');
  const snapshot = view.snapshot(query.epoch);
  if (snapshot === null || forest.meta.status === 'unavailable') return result('unavailable', 'snapshot-unavailable');
  required = snapshot.difficulty;
  const candidates = []; let candidateStop = false;
  function edge(a, b) { stats.edgeChecks++; return view.edge(a, b); }
  for (const anchor of forest.anchors()) {
    stats.treeLookups++; const path = forest.path(context.subject, anchor);
    if (!path || path.length < 2) continue;
    if (stats.candidatesExamined === query.maxCandidates) { candidateStop = true; break; }
    stats.candidatesExamined++;
    if (!view.anchor(query.epoch, anchor) || view.removed(anchor)) continue;
    let valid = true;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const present = p.direction === 'directed-from-anchor' ? edge(b, a) : p.undirectedProjection === 'reciprocal-only' ? edge(a, b) && edge(b, a) : edge(a, b) || edge(b, a);
      if (!present) { valid = false; break; }
      if (p.minStanding !== null && i < path.length - 1) {
        stats.scoreChecks++; const score = view.standing(b); if (score === null || score < p.minStanding) { valid = false; break; }
      }
    }
    if (valid) candidates.push(path);
  }
  stats.liveCandidates = candidates.length; stats.validationComplete = !candidateStop;
  let packingStop = false;
  function pack(start, chosen, used) {
    if (chosen.length === required) return [...chosen];
    if (candidates.length - start < required - chosen.length) return null;
    for (let i = start; i < candidates.length; i++) {
      if (stats.packingSteps === query.maxPackingSteps) { packingStop = true; return null; }
      stats.packingSteps++; const vertices = candidates[i].slice(1);
      if (vertices.some(v => used.has(v))) continue;
      vertices.forEach(v => used.add(v)); chosen.push(candidates[i]);
      const family = pack(i + 1, chosen, used); chosen.pop(); vertices.forEach(v => used.delete(v));
      if (family) return family; if (packingStop) return null;
    }
    return null;
  }
  const family = pack(0, [], new Set()); stats.packingComplete = family === null && !packingStop;
  if (!family) {
    if (packingStop) return result('censored', 'packing-limit');
    if (candidateStop) return result('censored', 'candidate-limit');
    if (!forest.meta.complete) return result('censored', 'tree-build-incomplete');
    return result('miss', candidates.length < required ? 'tree-path-shortage' : 'tree-family-conflict');
  }
  let bytes;
  try { bytes = encodePathWitness({ subject: context.subject, epoch: query.epoch, paths: family }, context); }
  catch (error) { if (error instanceof RangeError && error.message === 'witness wire byte bound') return result('censored', 'witness-byte-bound'); throw error; }
  const primary = verifyPathWitness(bytes, context, view), ref2 = verifyPathWitnessRef2(bytes, context, view);
  if (!primary.accepted || !ref2.accepted || primary.required !== required || ref2.required !== required) throw new Error('tree proposal verifier disagreement');
  witness = decodePathWitness(bytes, context); wire = bytes.toString('utf8'); verification = Object.freeze({ primary, ref2 });
  return result('found', 'ok');
}
