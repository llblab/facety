// Owns: Bounded anchor BFS/refresh/path-label repair and tree/branch/prefix/segment/retained-union assembly; excludes global completeness, live ranking, amortized repair bounds and authority.
import { createHash } from 'node:crypto';
import { pathWitnessContext, pathWitnessPolicyId, encodePathWitness, decodePathWitness, verifyPathWitness } from './path-witness.mjs';
import { verifyPathWitnessRef2 } from './path-witness-ref2.mjs';
import { isPathWitnessView, pathWitnessGraphView } from './path-witness-view.mjs';
import { DirectedGraph } from './graph.mjs';
import { findPathWitness, PATH_ORACLE_LIMITS } from './path-witness-oracle.mjs';
import { createPathWitnessPool, routePathWitnessPool, PATH_POOL_RANDOMNESS } from './path-witness-pool.mjs';
import { PathWitnessSegmentCache, PATH_SEGMENT_LIMITS } from './path-witness-segments.mjs';

export const PATH_UNION_LIMITS = Object.freeze({ maxSubjectHops: 64, maxAnchorHops: 64, maxVertices: 4096, maxArcs: 65536, maxTreeRows: 65536, maxBallTrials: 1000000 });
export const PATH_SEGMENT_PROPOSAL_LIMITS = Object.freeze({ maxSegmentLookups: 65536, maxSegmentChecks: 1024, maxSegmentResults: 256 });
export const PATH_TREE_REPAIR_LIMITS = Object.freeze({ maxQueuePops: 1000000, maxPredecessorTrials: 1000000, maxScheduleTrials: 1000000, maxLabelUpdates: 1000000 });

export const PATH_TREE_LIMITS = Object.freeze({ maxExpansions: 1000000, maxTreeNodes: 65536, maxCandidates: 256, maxPackingSteps: 1000000, maxBranches: 64, maxTreeLookups: 65536, maxPrefixHops: 64, maxPrefixes: 4096 });
export const PATH_PREFIX_RANDOMNESS = Object.freeze({ policy: 'path-prefix-routing/v1', generator: PATH_POOL_RANDOMNESS.generator, childPolicy: PATH_POOL_RANDOMNESS.policy });
const forests = new WeakSet(), cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const natural = n => Number.isSafeInteger(n) && !Object.is(n, -0) && n >= 0;
function fields(input, keys) {
  if (!input || ![Object.prototype, null].includes(Object.getPrototypeOf(input)) || Reflect.ownKeys(input).length !== keys.length || Object.keys(input).length !== keys.length
    || keys.some(k => !Object.hasOwn(input, k)) || Object.values(Object.getOwnPropertyDescriptors(input)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('trees require exact data fields');
}
function config(input, keys, limits = PATH_TREE_LIMITS) {
  fields(input, keys);
  for (const key of keys) if (!natural(input[key]) || (key !== 'epoch' && key !== 'tick' && input[key] > limits[key])) throw new RangeError('unsupported tree budget/epoch ' + key);
  return Object.freeze(Object.fromEntries(keys.map(k => [k, input[k]])));
}
function freeze(v) { if (v && typeof v === 'object') { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; }
function prepareTreeGraph(view) {
  const data = view.toJSON(), p = data.options.policy, live = new Set(view.nodeIds()), forward = new Map(view.nodeIds().map(v => [v, new Set()]));
  for (const [a, b] of data.live.edges) {
    if (p.direction === 'directed-from-anchor') forward.get(a).add(b);
    else if (p.undirectedProjection === 'any-live-orientation' || view.edge(b, a)) { forward.get(a).add(b); forward.get(b).add(a); }
  }
  const next = new Map([...forward].map(([v, neighbors]) => [v, [...neighbors].sort(cmp)]));
  return { data, p, live, forward, next };
}
function treeStats(graph) {
  return { preparedNodes: graph.live.size, preparedEdges: graph.data.live.edges.length, projectedArcs: [...graph.next.values()].reduce((n, a) => n + a.length, 0),
    rootsStarted: 0, rootsCompleted: 0, expansions: 0, treeNodes: 0 };
}
function growTree(anchor, view, graph, budget, stats) {
  const tree = new Map([[anchor, { distance: 0, parent: null }]]), queue = [anchor], p = graph.p; let stop = null;
  stats.rootsStarted++; stats.treeNodes++;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head], distance = tree.get(node).distance;
    if (distance === p.maxHops) continue;
    if (node !== anchor && p.minStanding !== null) { const standing = view.standing(node); if (standing === null || standing < p.minStanding) continue; }
    for (const child of graph.next.get(node)) {
      if (stats.expansions === budget.maxExpansions) { stop = 'build-expansion-limit'; break; }
      stats.expansions++;
      if (tree.has(child)) continue;
      if (stats.treeNodes === budget.maxTreeNodes) { stop = 'tree-node-limit'; break; }
      tree.set(child, { distance: distance + 1, parent: node }); stats.treeNodes++; queue.push(child);
    }
    if (stop) break;
  }
  if (!stop) stats.rootsCompleted++;
  return { tree, stop };
}
function makeForest(view, budget, graph, anchors, trees, stats, stop, available, reference) {
  const meta = freeze({ reference, status: !available ? 'unavailable' : stop ? 'censored' : 'built',
    reason: !available ? 'snapshot-unavailable' : stop ?? 'ok', complete: available && stop === null,
    originRoot: view.view().id, policyId: graph.data.policyId, epoch: budget.epoch, maxHops: graph.p.maxHops, config: budget, stats });
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
export function buildPathWitnessTrees(view, input) {
  if (!isPathWitnessView(view)) throw new TypeError('tree build requires immutable capture');
  const budget = config(input, ['epoch', 'maxExpansions', 'maxTreeNodes']), graph = prepareTreeGraph(view);
  const snapshot = graph.data.options.snapshots.find(s => s.epoch === budget.epoch);
  const anchors = (snapshot?.anchors ?? []).filter(a => graph.live.has(a) && !view.removed(a)), stats = treeStats(graph), trees = new Map(); let stop = null;
  for (const anchor of anchors) {
    if (stats.treeNodes === budget.maxTreeNodes) { stop = 'tree-node-limit'; break; }
    const grown = growTree(anchor, view, graph, budget, stats); trees.set(anchor, grown.tree); stop = grown.stop;
    if (stop) break;
  }
  return makeForest(view, budget, graph, anchors, trees, stats, stop, snapshot !== undefined, 'single-parent-bounded-bfs/v1');
}
export function refreshPathWitnessTrees(forest, origin, current, input) {
  if (!forests.has(forest) || !isPathWitnessView(origin) || !isPathWitnessView(current)) throw new TypeError('refresh requires local forest and immutable captures');
  const query = config(input, ['epoch', 'maxExpansions', 'maxTreeNodes']), before = origin.toJSON(), after = current.toJSON(), p = after.options.policy;
  if (origin.view().id !== forest.meta.originRoot || before.policyId !== forest.meta.policyId) throw new TypeError('refresh origin differs from forest');
  if (origin.capture.reference !== current.capture.reference || before.source.storage.name !== after.source.storage.name) throw new TypeError('refresh capture namespace differs');
  const report = { schema: 'facety-tree-refresh/v1', originRoot: origin.view().id, currentRoot: current.view().id, query,
    status: 'unavailable', reason: null, reset: null, deltaComplete: null, retired: [], roots: [], work: Object.fromEntries([
      'preparedOldNodes', 'preparedCurrentNodes', 'preparedOldEdges', 'preparedCurrentEdges', 'oldProjectedArcs', 'currentProjectedArcs', 'changedArcs',
      'scoreEligibilityComparisons', 'classificationNodeChecks', 'reusedRoots', 'rebuiltRoots', 'retainedTreeNodes', 'reusedTreeNodes', 'freshTreeNodes', 'freshExpansions'].map(k => [k, 0])) };
  const unavailable = reason => { report.reason = reason; return freeze({ forest: null, report }); };
  const epoch = current.view().epoch;
  if (query.epoch > epoch || epoch - query.epoch > p.graceEpochs) return unavailable('epoch-outside-grace');
  const snapshot = after.options.snapshots.find(s => s.epoch === query.epoch);
  if (!snapshot) return unavailable('snapshot-unavailable');
  report.reset = !forest.meta.complete ? 'input-incomplete' : forest.meta.epoch !== query.epoch ? 'epoch-changed' : before.policyId !== after.policyId ? 'policy-changed' : null;
  report.deltaComplete = report.reset === null;
  const graph = prepareTreeGraph(current), stats = treeStats(graph), work = report.work, changedSources = new Set(), changedEligibility = new Set();
  work.preparedCurrentNodes = stats.preparedNodes; work.preparedCurrentEdges = stats.preparedEdges; work.currentProjectedArcs = stats.projectedArcs;
  const anchors = snapshot.anchors.filter(a => graph.live.has(a) && !current.removed(a)), targets = new Set(anchors);
  report.retired = forest.anchors().filter(a => !targets.has(a));
  const oldTrees = report.reset ? new Map() : new Map(forest.toJSON().parents.map(row => [row.anchor, row.nodes]));
  if (!report.reset) {
    const old = prepareTreeGraph(origin), oldStats = treeStats(old);
    work.preparedOldNodes = oldStats.preparedNodes; work.preparedOldEdges = oldStats.preparedEdges; work.oldProjectedArcs = oldStats.projectedArcs;
    for (const [a, b] of [[old, graph], [graph, old]]) for (const [source, children] of a.forward) for (const child of children) {
      if (!b.forward.get(source)?.has(child)) { changedSources.add(source); work.changedArcs++; }
    }
    if (p.minStanding !== null) for (const vertex of new Set([...old.live, ...graph.live])) {
      work.scoreEligibilityComparisons++;
      const x = old.live.has(vertex) ? origin.standing(vertex) : null, y = graph.live.has(vertex) ? current.standing(vertex) : null;
      if ((x !== null && x >= p.minStanding) !== (y !== null && y >= p.minStanding)) changedEligibility.add(vertex);
    }
  }
  const trees = new Map(); let stop = null;
  for (const anchor of anchors) {
    if (stop) { report.roots.push({ anchor, action: 'omitted' }); continue; }
    const rows = oldTrees.get(anchor); let affected = !rows;
    if (!affected) for (const row of rows) {
      work.classificationNodeChecks++;
      if (row.distance < p.maxHops && (changedSources.has(row.subject) || (row.subject !== anchor && changedEligibility.has(row.subject)))) { affected = true; break; }
    }
    if (!affected) {
      if (stats.treeNodes + rows.length > query.maxTreeNodes) { stop = 'tree-node-limit'; report.roots.push({ anchor, action: 'omitted' }); continue; }
      trees.set(anchor, new Map(rows.map(row => [row.subject, { distance: row.distance, parent: row.parent }])));
      stats.treeNodes += rows.length; work.reusedRoots++; work.reusedTreeNodes += rows.length; report.roots.push({ anchor, action: 'reused' });
    } else {
      if (stats.treeNodes === query.maxTreeNodes) { stop = 'tree-node-limit'; report.roots.push({ anchor, action: 'omitted' }); continue; }
      const oldCount = stats.treeNodes, grown = growTree(anchor, current, graph, query, stats); trees.set(anchor, grown.tree); stop = grown.stop;
      work.rebuiltRoots++; work.freshTreeNodes += stats.treeNodes - oldCount; report.roots.push({ anchor, action: stop ? 'partial' : 'rebuilt' });
    }
  }
  work.retainedTreeNodes = stats.treeNodes; work.freshExpansions = stats.expansions; report.status = 'refreshed'; report.reason = stop ?? 'ok';
  const refreshed = makeForest(current, query, graph, anchors, trees, stats, stop, true, 'affected-root-bounded-bfs/v1');
  return freeze({ forest: refreshed, report });
}
function prepareRepairGraph(view) {
  const graph = prepareTreeGraph(view), previous = new Map([...graph.live].map(v => [v, new Set()]));
  for (const [source, children] of graph.next) for (const child of children) previous.get(child).add(source);
  return { ...graph, previous };
}
function qualifies(view, graph, vertex) {
  if (!graph.live.has(vertex)) return false;
  if (graph.p.minStanding === null) return true;
  const score = view.standing(vertex); return score !== null && score >= graph.p.minStanding;
}
function compareLabels(a, b) {
  if (!b) return -1;
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) { const n = cmp(a[i], b[i]); if (n) return n; }
  return 0;
}
function settledRepairTree(anchor, labels, state) {
  const { graph, current } = state, trees = new Map();
  for (const [vertex, path] of labels) {
    if (path[0] !== anchor || path.at(-1) !== vertex || path.length > graph.p.maxHops + 1 || new Set(path).size !== path.length || path.some(v => !graph.live.has(v))) throw new Error('repair invalid settled path');
    if (vertex === anchor) { if (path.length !== 1) throw new Error('repair changed root label'); }
    else {
      const parent = labels.get(path.at(-2));
      if (!parent || compareLabels(path.slice(0, -1), parent) !== 0) throw new Error('repair unsettled parent prefix');
    }
    for (let i = 1; i < path.length; i++) if (!graph.forward.get(path[i - 1])?.has(path[i]) || (i < path.length - 1 && !qualifies(current, graph, path[i]))) throw new Error('repair invalid settled edge/role');
    trees.set(vertex, { distance: path.length - 1, parent: path.length === 1 ? null : path.at(-2) });
  }
  return trees;
}
function repairRoot(anchor, rows, state) {
  const { graph, old, current, query, work, activation } = state, invalid = new Set(), labels = new Map();
  if (rows) {
    const children = new Map(rows.map(row => [row.subject, []])), pending = [];
    for (const row of rows) if (row.parent !== null) {
      work.oldParentChecks++;
      if (!old.previous.get(row.subject)?.has(row.parent)) throw new Error('repair origin parent disagrees with capture');
      children.get(row.parent).push(row.subject);
      if (!graph.forward.get(row.parent)?.has(row.subject) || (row.parent !== anchor && !qualifies(current, graph, row.parent))) pending.push(row.subject);
    }
    for (let head = 0; head < pending.length; head++) {
      const vertex = pending[head]; if (invalid.has(vertex)) continue;
      invalid.add(vertex); work.invalidatedNodes++;
      for (const child of children.get(vertex)) { work.oldChildTrials++; pending.push(child); }
    }
    const retained = rows.filter(row => !invalid.has(row.subject)).sort((a, b) => a.distance - b.distance || cmp(a.subject, b.subject));
    if (work.retainedTreeNodes + retained.length > query.maxTreeNodes) return { stop: 'tree-node-limit' };
    for (const row of retained) {
      const prefix = row.parent === null ? [] : labels.get(row.parent);
      if (!prefix) throw new Error('repair invalid retained ancestry');
      labels.set(row.subject, [...prefix, row.subject]); work.labelRowsInitialized++;
    }
  } else { labels.set(anchor, [anchor]); work.labelRowsInitialized++; }
  work.peakWorkingLabels = Math.max(work.peakWorkingLabels, labels.size);
  // Fixed ring capacity bounds resident queue storage, not just the pending set.
  const ring = new Array(graph.live.size), pending = new Set(); let head = 0, tail = 0, size = 0;
  function schedule(vertex) {
    if (work.scheduleTrials === query.maxScheduleTrials) return false;
    work.scheduleTrials++;
    if (vertex === anchor || pending.has(vertex)) return true;
    ring[tail] = vertex; tail = (tail + 1) % ring.length; size++; pending.add(vertex); work.peakPending = Math.max(work.peakPending, size); return true;
  }
  const seeds = rows ? [...new Set([...invalid].filter(v => graph.live.has(v)).concat([...activation]))].sort(cmp) : graph.next.get(anchor);
  for (const seed of seeds) if (!schedule(seed)) return { stop: 'schedule-limit' };
  while (size) {
    if (work.queuePops === query.maxQueuePops) return { stop: 'queue-limit' };
    const vertex = ring[head]; ring[head] = undefined; head = (head + 1) % ring.length; size--; pending.delete(vertex); work.queuePops++;
    const prior = labels.get(vertex); let best = prior;
    for (const parent of graph.previous.get(vertex)) {
      if (work.predecessorTrials === query.maxPredecessorTrials) return { stop: 'predecessor-limit' };
      work.predecessorTrials++;
      const prefix = labels.get(parent);
      if (!prefix || (parent !== anchor && !qualifies(current, graph, parent)) || prefix.length > graph.p.maxHops || prefix.includes(vertex)) continue;
      const candidate = [...prefix, vertex]; if (compareLabels(candidate, best) < 0) best = candidate;
    }
    if (best && (!prior || compareLabels(best, prior) < 0)) {
      if (!prior && work.retainedTreeNodes + labels.size === query.maxTreeNodes) return { stop: 'tree-node-limit' };
      if (work.labelUpdates === query.maxLabelUpdates) return { stop: 'label-update-limit' };
      labels.set(vertex, best); work.labelUpdates++; if (!prior) work.labelsAdmitted++;
      work.peakWorkingLabels = Math.max(work.peakWorkingLabels, labels.size);
      for (const child of graph.next.get(vertex)) if (!schedule(child)) return { stop: 'schedule-limit' };
    }
  }
  return { tree: settledRepairTree(anchor, labels, state), stop: null };
}
export function repairPathWitnessTrees(forest, origin, current, input) {
  if (!forests.has(forest) || !isPathWitnessView(origin) || !isPathWitnessView(current)) throw new TypeError('repair requires local forest and immutable captures');
  const query = config(input, ['epoch', 'maxTreeNodes', 'maxQueuePops', 'maxPredecessorTrials', 'maxScheduleTrials', 'maxLabelUpdates'], { ...PATH_TREE_LIMITS, ...PATH_TREE_REPAIR_LIMITS });
  const before = origin.toJSON(), after = current.toJSON(), p = after.options.policy;
  if (origin.view().id !== forest.meta.originRoot || before.policyId !== forest.meta.policyId) throw new TypeError('repair origin differs from forest');
  if (origin.capture.reference !== current.capture.reference || before.source.storage.name !== after.source.storage.name) throw new TypeError('repair capture namespace differs');
  const report = { schema: 'facety-tree-repair/v1', originRoot: origin.view().id, currentRoot: current.view().id, query,
    status: 'unavailable', reason: null, reset: null, deltaComplete: null, retired: [], roots: [], work: Object.fromEntries([
      'preparedOldNodes', 'preparedCurrentNodes', 'preparedOldEdges', 'preparedCurrentEdges', 'oldProjectedArcs', 'currentProjectedArcs', 'changedArcs',
      'scoreEligibilityComparisons', 'classificationNodeChecks', 'activationArcReads', 'oldParentChecks', 'oldChildTrials', 'invalidatedNodes', 'labelRowsInitialized', 'labelsAdmitted',
      'queuePops', 'predecessorTrials', 'scheduleTrials', 'labelUpdates', 'peakPending', 'peakWorkingLabels', 'reusedRoots', 'repairedRoots', 'rebuiltRoots', 'abortedRoots', 'retainedTreeNodes'].map(k => [k, 0])) };
  const unavailable = reason => { report.reason = reason; return freeze({ forest: null, report }); };
  const epoch = current.view().epoch;
  if (query.epoch > epoch || epoch - query.epoch > p.graceEpochs) return unavailable('epoch-outside-grace');
  const snapshot = after.options.snapshots.find(s => s.epoch === query.epoch);
  if (!snapshot) return unavailable('snapshot-unavailable');
  report.reset = !forest.meta.complete ? 'input-incomplete' : forest.meta.epoch !== query.epoch ? 'epoch-changed' : before.policyId !== after.policyId ? 'policy-changed' : null;
  report.deltaComplete = report.reset === null;
  const graph = prepareRepairGraph(current), prepared = treeStats(graph), work = report.work, sources = new Set(), eligibility = new Set(), activation = new Set(); let old = null;
  work.preparedCurrentNodes = prepared.preparedNodes; work.preparedCurrentEdges = prepared.preparedEdges; work.currentProjectedArcs = prepared.projectedArcs;
  const anchors = snapshot.anchors.filter(a => graph.live.has(a) && !current.removed(a)), targets = new Set(anchors), trees = new Map();
  report.retired = forest.anchors().filter(a => !targets.has(a));
  const oldTrees = report.reset ? new Map() : new Map(forest.toJSON().parents.map(row => [row.anchor, row.nodes]));
  if (!report.reset) {
    old = prepareRepairGraph(origin); const oldStats = treeStats(old);
    work.preparedOldNodes = oldStats.preparedNodes; work.preparedOldEdges = oldStats.preparedEdges; work.oldProjectedArcs = oldStats.projectedArcs;
    for (const [a, b] of [[old, graph], [graph, old]]) for (const [source, children] of a.forward) for (const child of children) {
      if (!b.forward.get(source)?.has(child)) { sources.add(source); work.changedArcs++; if (a === graph) activation.add(child); }
    }
    if (p.minStanding !== null) for (const vertex of new Set([...old.live, ...graph.live])) {
      work.scoreEligibilityComparisons++;
      const x = qualifies(origin, old, vertex), y = qualifies(current, graph, vertex);
      if (x !== y) {
        eligibility.add(vertex);
        if (y) for (const child of graph.next.get(vertex)) { activation.add(child); work.activationArcReads++; }
      }
    }
  }
  const state = { graph, old, current, query, work, activation }; let stop = null;
  for (const anchor of anchors) {
    if (stop || work.retainedTreeNodes === query.maxTreeNodes) { stop ??= 'tree-node-limit'; report.roots.push({ anchor, action: 'omitted' }); continue; }
    const rows = oldTrees.get(anchor); let affected = !rows;
    if (!affected) for (const row of rows) {
      work.classificationNodeChecks++;
      if (row.distance < p.maxHops && (sources.has(row.subject) || (row.subject !== anchor && eligibility.has(row.subject)))) { affected = true; break; }
    }
    if (!affected) {
      if (work.retainedTreeNodes + rows.length > query.maxTreeNodes) { stop = 'tree-node-limit'; report.roots.push({ anchor, action: 'omitted' }); continue; }
      trees.set(anchor, new Map(rows.map(row => [row.subject, { distance: row.distance, parent: row.parent }])));
      work.retainedTreeNodes += rows.length; work.reusedRoots++; report.roots.push({ anchor, action: 'reused' });
    } else {
      const repaired = repairRoot(anchor, rows, state); stop = repaired.stop;
      if (stop) { work.abortedRoots++; report.roots.push({ anchor, action: 'aborted' }); }
      else {
        trees.set(anchor, repaired.tree); work.retainedTreeNodes += repaired.tree.size;
        if (rows) work.repairedRoots++; else work.rebuiltRoots++;
        report.roots.push({ anchor, action: rows ? 'repaired' : 'rebuilt' });
      }
    }
  }
  report.status = 'repaired'; report.reason = stop ?? 'ok';
  const stats = { preparedNodes: prepared.preparedNodes, preparedEdges: prepared.preparedEdges, projectedArcs: prepared.projectedArcs, treeNodes: work.retainedTreeNodes,
    queuePops: work.queuePops, predecessorTrials: work.predecessorTrials, scheduleTrials: work.scheduleTrials, labelUpdates: work.labelUpdates };
  return freeze({ forest: makeForest(current, query, graph, anchors, trees, stats, stop, true, 'bounded-path-label-repair/v1'), report });
}
export function proposePathWitnessFromUnion(forest, view, suppliedContext, input) {
  if (!forests.has(forest) || !isPathWitnessView(view)) throw new TypeError('union proposal requires local forest and immutable current capture');
  const context = pathWitnessContext(suppliedContext), p = context.policy, data = view.toJSON(), policyId = pathWitnessPolicyId(p);
  if (data.policyId !== policyId || forest.meta.policyId !== policyId) throw new TypeError('union proposal policy differs from capture');
  const query = config(input, ['epoch', ...Object.keys(PATH_UNION_LIMITS), ...Object.keys(PATH_ORACLE_LIMITS)], { ...PATH_UNION_LIMITS, ...PATH_ORACLE_LIMITS });
  if (query.maxSubjectHops > p.maxHops || query.maxAnchorHops > p.maxHops) throw new RangeError('union radius exceeds policy hop bound');
  const extraction = Object.fromEntries(['preparedNodes', 'preparedStorageEdges', 'projectedArcs', 'anchorSeedsExamined', 'anchorSeedsRetained',
    'subjectQueuePops', 'anchorQueuePops', 'ballTrials', 'treeRowsInspected', 'treeEdgesExamined', 'staleTreeEdges', 'arcAdmissionAttempts',
    'retainedVertices', 'retainedArcs', 'virtualNodes', 'virtualStorageEdges'].map(k => [k, 0]));
  const retained = { reference: 'projected-union-subgraph/v1', viewRoot: null, vertices: [], arcs: [] };
  let required = null, coverage = null, search = null, witness = null, wire = null, verification = null;
  const result = (status, reason) => freeze({ schema: 'facety-path-union-proposal/v1', reference: 'bounded-two-sided-union-m2/v1', status, reason,
    feasible: status === 'found' ? true : null, viewRoot: view.view().id, canonicalReference: view.capture.reference, forestRoot: forest.meta.originRoot,
    forest: forest.meta, context, query, required, witness, wire, verification, retained, coverage, work: { extraction, search } });
  if (forest.meta.epoch !== query.epoch) return result('unavailable', 'forest-epoch-mismatch');
  const epoch = view.view().epoch;
  if (query.epoch > epoch || epoch - query.epoch > p.graceEpochs) return result('unavailable', 'epoch-outside-grace');
  const snapshot = data.options.snapshots.find(s => s.epoch === query.epoch);
  if (!snapshot || forest.meta.status === 'unavailable') return result('unavailable', 'snapshot-unavailable');
  if (!view.nodeIds().includes(context.subject)) return result('unavailable', 'subject-unavailable');
  required = snapshot.difficulty;
  coverage = { vertexLimit: false, arcLimit: false, ballTrialLimit: false, treeRowLimit: false, subjectDepthCut: false, anchorDepthCut: false,
    forestIncomplete: !forest.meta.complete };
  const graph = prepareTreeGraph(view), reverse = new Map(view.nodeIds().map(v => [v, []]));
  extraction.preparedNodes = graph.live.size; extraction.preparedStorageEdges = data.live.edges.length;
  for (const [a, children] of graph.next) for (const b of children) { reverse.get(b).push(a); extraction.projectedArcs++; }
  for (const neighbors of reverse.values()) neighbors.sort(cmp);
  if (query.maxVertices === 0) { coverage.vertexLimit = true; return result('censored', 'retained-vertex-limit'); }
  const vertices = new Set([context.subject]), arcs = new Map(), roots = [];
  for (const a of snapshot.anchors) if (a !== context.subject && graph.live.has(a) && !view.removed(a)) {
    extraction.anchorSeedsExamined++;
    if (!vertices.has(a) && vertices.size === query.maxVertices) { coverage.vertexLimit = true; continue; }
    vertices.add(a); roots.push(a); extraction.anchorSeedsRetained++;
  }
  function admit(a, b) {
    extraction.arcAdmissionAttempts++;
    const missing = [a, b].filter(v => !vertices.has(v));
    if (vertices.size + missing.length > query.maxVertices) { coverage.vertexLimit = true; return false; }
    const additions = (p.direction === 'directed-from-anchor' ? [[a, b]] : [[a, b], [b, a]]).filter(pair => !arcs.has(JSON.stringify(pair)));
    if (arcs.size + additions.length > query.maxArcs) { coverage.arcLimit = true; return false; }
    for (const v of missing) vertices.add(v);
    for (const pair of additions) arcs.set(JSON.stringify(pair), pair);
    return true;
  }
  function ball(anchorSide) {
    const queue = (anchorSide ? roots : [context.subject]).map(v => [v, 0]), visited = new Set(queue.map(([v]) => v)), seeds = new Set(roots);
    const depth = anchorSide ? query.maxAnchorHops : query.maxSubjectHops, neighbors = anchorSide ? graph.next : reverse;
    for (let head = 0; head < queue.length; head++) {
      const [node, distance] = queue[head]; extraction[anchorSide ? 'anchorQueuePops' : 'subjectQueuePops']++;
      if (anchorSide && node === context.subject) continue;
      if (!(anchorSide ? seeds.has(node) : node === context.subject) && p.minStanding !== null) {
        const score = view.standing(node); if (score === null || score < p.minStanding) continue;
      }
      if (distance === depth) { if (neighbors.get(node).length) coverage[anchorSide ? 'anchorDepthCut' : 'subjectDepthCut'] = true; continue; }
      for (const next of neighbors.get(node)) {
        if (extraction.ballTrials === query.maxBallTrials) { coverage.ballTrialLimit = true; return false; }
        extraction.ballTrials++;
        if (!admit(anchorSide ? node : next, anchorSide ? next : node)) continue;
        if (!visited.has(next)) { visited.add(next); queue.push([next, distance + 1]); }
      }
    }
    return true;
  }
  if (ball(false)) ball(true);
  rows: for (const tree of forest.toJSON().parents) for (const row of tree.nodes) {
    if (extraction.treeRowsInspected === query.maxTreeRows) { coverage.treeRowLimit = true; break rows; }
    extraction.treeRowsInspected++;
    if (row.parent === null) continue;
    extraction.treeEdgesExamined++;
    if (!graph.forward.get(row.parent)?.has(row.subject)) { extraction.staleTreeEdges++; continue; }
    admit(row.parent, row.subject);
  }
  retained.vertices = [...vertices].sort(cmp); retained.arcs = [...arcs.values()].sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]));
  extraction.retainedVertices = vertices.size; extraction.retainedArcs = arcs.size;
  const restricted = new DirectedGraph('retained-union');
  for (const v of retained.vertices) restricted.addNode(v);
  for (const [a, b] of retained.arcs) restricted.addEdge(a, b);
  extraction.virtualNodes = restricted.size; extraction.virtualStorageEdges = restricted.edgeCount;
  const localView = pathWitnessGraphView(restricted, { policy: p, currentEpoch: epoch, snapshots: [snapshot], removed: data.options.removed, standing: data.options.standing });
  retained.viewRoot = localView.view().id;
  const local = findPathWitness(localView, context, { epoch: query.epoch, ...Object.fromEntries(Object.keys(PATH_ORACLE_LIMITS).map(k => [k, query[k]])) });
  if (local.schema !== 'facety-path-search/v1' || local.viewRoot !== retained.viewRoot || local.reference !== localView.capture.reference || local.required !== required
    || JSON.stringify(local.context) !== JSON.stringify(context) || !['found', 'infeasible', 'censored'].includes(local.status)
    || local.feasible !== (local.status === 'found' ? true : local.status === 'infeasible' ? false : null)) throw new Error('union search scope disagreement');
  search = { status: local.status, reason: local.reason, feasible: local.feasible, stats: local.stats };
  if (local.status === 'found') {
    if (typeof local.wire !== 'string' || JSON.stringify(local.witness) !== JSON.stringify(decodePathWitness(Buffer.from(local.wire), context))) throw new Error('union search proof disagreement');
    const primary = verifyPathWitness(Buffer.from(local.wire), context, view), ref2 = verifyPathWitnessRef2(Buffer.from(local.wire), context, view);
    if (!local.verification?.primary.accepted || !local.verification?.ref2.accepted || local.verification.primary.required !== required || local.verification.ref2.required !== required
      || !primary.accepted || !ref2.accepted || primary.required !== required || ref2.required !== required) throw new Error('union proposal verifier disagreement');
    wire = local.wire; witness = local.witness; verification = { retained: local.verification, current: { primary, ref2 } };
    return result('found', 'ok');
  }
  if (local.wire !== null || local.witness !== null || local.verification !== null) throw new Error('union search proof disagreement');
  if (local.status === 'censored') {
    if (local.reason === 'witness-byte-bound') return result('censored', local.reason);
    if (!['packing-limit', 'path-limit', 'expansion-limit'].includes(local.reason)) throw new Error('union search status disagreement');
    return result('censored', 'retained-search-' + local.reason);
  }
  for (const [flag, reason] of [['vertexLimit', 'retained-vertex-limit'], ['arcLimit', 'retained-arc-limit'], ['ballTrialLimit', 'ball-trial-limit'],
    ['treeRowLimit', 'tree-row-limit'], ['subjectDepthCut', 'subject-depth-limit'], ['anchorDepthCut', 'anchor-depth-limit'], ['forestIncomplete', 'tree-build-incomplete']]) {
    if (coverage[flag]) return result('censored', reason);
  }
  return result('miss', 'retained-search-miss');
}
export function proposePathWitnessFromTrees(forest, view, suppliedContext, input) { return propose(forest, view, suppliedContext, input, null); }
export function proposePathWitnessFromBranches(forest, view, suppliedContext, input, advice) {
  fields(advice, ['pool', 'routing']); fields(advice.routing, ['seed', 'queryId', 'step', 'mode', 'loads']);
  return propose(forest, view, suppliedContext, input, advice);
}
export function proposePathWitnessFromPrefixes(forest, view, suppliedContext, input, advice) {
  fields(advice, ['pools', 'routing']); fields(advice.routing, ['seed', 'queryId', 'step', 'mode']);
  return propose(forest, view, suppliedContext, input, advice, true);
}
export function proposePathWitnessFromSegments(forest, view, suppliedContext, input, advice, cache) {
  fields(advice, ['pools', 'routing']); fields(advice.routing, ['seed', 'queryId', 'step', 'mode']);
  return propose(forest, view, suppliedContext, input, advice, true, { cache });
}
function propose(forest, view, suppliedContext, input, advice, prefixMode = false, segmentPort = null) {
  if (!forests.has(forest) || !isPathWitnessView(view)) throw new TypeError('proposal requires local forest and immutable current capture');
  const context = pathWitnessContext(suppliedContext), p = context.policy, policyId = pathWitnessPolicyId(p);
  if (view.toJSON().policyId !== policyId || forest.meta.policyId !== policyId) throw new TypeError('tree proposal policy differs from capture');
  const prefixKeys = ['epoch', 'maxPrefixHops', 'maxPrefixes', 'maxExpansions', 'maxBranches', 'maxTreeLookups', 'maxCandidates', 'maxPackingSteps'];
  const query = config(input, segmentPort ? [...prefixKeys, 'tick', 'maxSegmentLookups', 'maxSegmentChecks', 'maxSegmentResults'] : prefixMode ? prefixKeys
    : advice ? ['epoch', 'maxCandidates', 'maxPackingSteps', 'maxBranches', 'maxTreeLookups'] : ['epoch', 'maxCandidates', 'maxPackingSteps'],
  segmentPort ? { ...PATH_TREE_LIMITS, ...PATH_SEGMENT_PROPOSAL_LIMITS } : PATH_TREE_LIMITS);
  if (prefixMode && query.maxPrefixHops > p.maxHops) throw new RangeError('prefix depth exceeds policy hop bound');
  const stats = { treeLookups: 0, candidatesExamined: 0, liveCandidates: 0, edgeChecks: 0, scoreChecks: 0, packingSteps: 0,
    validationComplete: false, packingComplete: false };
  const prefix = prefixMode ? { reference: 'bounded-prefix-tree/v1', randomness: PATH_PREFIX_RANDOMNESS, advice: normalizePrefixAdvice(advice, context, view, query),
    prefixes: [], routes: [], stats: { queued: 0, expanded: 0, maxPending: 0, neighborTrials: 0, scoreReads: 0, endpointChecks: 0, routeCalls: 0,
      generators: 0, draws: 0, routedPeers: 0, missingPools: 0, omittedNeighbors: 0, duplicatePaths: 0 }, coverage: null } : null;
  const branch = advice && !prefixMode ? { reference: 'one-hop-branch-tree/v1', eligiblePeers: null, branchesExpanded: 0, duplicatePaths: 0,
    route: routePathWitnessPool(advice.pool, { ...advice.routing, domain: context.domain, viewId: view.view().id, epoch: query.epoch, subject: context.subject,
      start: 0, count: 0, excluded: [] }) } : null;
  const segments = segmentPort ? prepareSegments(segmentPort, query) : null;
  let required = null, witness = null, wire = null, verification = null;
  const result = (status, reason) => freeze({ schema: 'facety-path-proposal/v1', status, feasible: status === 'found' ? true : null, reason,
    viewRoot: view.view().id, canonicalReference: view.capture.reference, forestRoot: forest.meta.originRoot, forest: forest.meta,
    context, query, required, witness, wire, verification, ...(branch ? { branch } : {}), ...(prefix ? { prefix } : {}), ...(segments ? { segments } : {}), stats: { ...stats } });
  if (forest.meta.epoch !== query.epoch) return result('unavailable', 'forest-epoch-mismatch');
  const current = view.view().epoch;
  if (query.epoch > current || current - query.epoch > p.graceEpochs) return result('unavailable', 'epoch-outside-grace');
  const snapshot = view.snapshot(query.epoch);
  if (snapshot === null || forest.meta.status === 'unavailable') return result('unavailable', 'snapshot-unavailable');
  if (prefix && !view.nodeIds().includes(context.subject)) return result('unavailable', 'subject-unavailable');
  required = snapshot.difficulty;
  if (prefix) growPrefixes(prefix, view, context, query);
  if (segments) segments.coverage = { segmentLookupLimit: false, segmentCheckLimit: false, segmentResultLimit: false };
  const candidates = [], seeds = [context.subject], seen = new Set(); let candidateStop = false, lookupStop = false, branchStop = false;
  if (branch) {
    const neighbors = new Set(view.neighbors(context.subject, p.direction, p.undirectedProjection));
    const excluded = branch.route.pool.ranked.filter(({ id }) => !neighbors.has(id) || id === context.subject).map(({ id }) => id);
    branch.eligiblePeers = branch.route.pool.ranked.length - excluded.length;
    branch.route = routePathWitnessPool(advice.pool, { ...branch.route.query, count: query.maxBranches, excluded });
    seeds.push(...branch.route.selected); branchStop = branch.route.selected.length < branch.eligiblePeers;
  }
  function edge(a, b) { stats.edgeChecks++; return view.edge(a, b); }
  function* paths() {
    if (prefix) {
      for (let ordinal = 0; ordinal < prefix.prefixes.length; ordinal++) {
        const path = prefix.prefixes[ordinal];
        if (path.length > 1) {
          prefix.stats.endpointChecks++;
          if (view.anchor(query.epoch, path.at(-1)) && !view.removed(path.at(-1))) yield { path };
        }
        for (const anchor of forest.anchors()) {
          if (stats.treeLookups === query.maxTreeLookups) { prefix.coverage.treeLookupLimit = true; break; }
          stats.treeLookups++; const tail = forest.path(path.at(-1), anchor);
          if (tail) yield { path: [...path.slice(0, -1), ...tail] };
        }
        if (segments) yield* segmentPaths(segmentPort.cache, segments, forest, view, context, query, path, ordinal, segmentPort.initialEntries);
      }
      return;
    }
    for (const seed of seeds) {
      let started = false;
      for (const anchor of forest.anchors()) {
        if (branch && stats.treeLookups === query.maxTreeLookups) { lookupStop = true; return; }
        if (!started) { if (branch && seed !== context.subject) branch.branchesExpanded++; started = true; }
        stats.treeLookups++; const tail = forest.path(seed, anchor);
        if (tail) yield { path: seed === context.subject ? tail : [context.subject, ...tail] };
      }
    }
  }
  for (const { path, join } of paths()) {
    if (path.length < 2) continue;
    const anchor = path.at(-1);
    if (stats.candidatesExamined === query.maxCandidates) { candidateStop = true; break; }
    if (join) { segments.joins.push({ candidateOrdinal: stats.candidatesExamined, ...join }); segments.stats.consumedJoins++; }
    stats.candidatesExamined++;
    if (path.length > p.maxHops + 1 || new Set(path).size !== path.length || !view.anchor(query.epoch, anchor) || view.removed(anchor)) continue;
    let valid = true;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const present = p.direction === 'directed-from-anchor' ? edge(b, a) : p.undirectedProjection === 'reciprocal-only' ? edge(a, b) && edge(b, a) : edge(a, b) || edge(b, a);
      if (!present) { valid = false; break; }
      if (p.minStanding !== null && i < path.length - 1) {
        stats.scoreChecks++; const score = view.standing(b); if (score === null || score < p.minStanding) { valid = false; break; }
      }
    }
    if (valid) {
      const key = JSON.stringify(path);
      if (!seen.has(key)) { seen.add(key); candidates.push(path); } else if (branch) branch.duplicatePaths++; else if (prefix) prefix.stats.duplicatePaths++;
    }
  }
  stats.liveCandidates = candidates.length; stats.validationComplete = !candidateStop && !lookupStop && !branchStop && (!prefix || !Object.values(prefix.coverage).some(Boolean))
    && (!segments || !Object.values(segments.coverage).some(Boolean));
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
    if (prefix) {
      for (const [flag, reason] of [['prefixLimit', 'prefix-limit'], ['expansionLimit', 'expansion-limit'], ['branchLimit', 'branch-limit'],
        ['prefixDepthLimit', 'prefix-depth-limit'], ['poolUnavailable', 'pool-unavailable'], ['treeLookupLimit', 'tree-lookup-limit']]) {
        if (prefix.coverage[flag]) return result('censored', reason);
      }
    }
    if (segments) for (const [flag, reason] of [['segmentLookupLimit', 'segment-lookup-limit'], ['segmentCheckLimit', 'segment-check-limit'], ['segmentResultLimit', 'segment-result-limit']]) {
      if (segments.coverage[flag]) return result('censored', reason);
    }
    if (lookupStop) return result('censored', 'tree-lookup-limit');
    if (branchStop) return result('censored', 'branch-limit');
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
function prepareSegments(port, query) {
  const cache = port.cache;
  if (!cache || Object.getPrototypeOf(cache) !== PathWitnessSegmentCache.prototype) throw new TypeError('proposal requires exact local segment cache');
  const inventory = PathWitnessSegmentCache.prototype.stats.call(cache); port.initialEntries = inventory.entries;
  if (inventory.lastTick !== null && query.tick < inventory.lastTick) throw new RangeError('segment proposal clock rollback');
  return { reference: 'bounded-prefix-tree-segments/v1', cache: { config: inventory.config, initialTick: inventory.lastTick },
    stats: { pairsExamined: 0, targetAnchorReads: 0, targetRemovalReads: 0, lookupCalls: 0, consumedJoins: 0, inventorySweepEntryUpperBound: 0 },
    work: Object.fromEntries(['expired', 'evicted', 'refreshed', 'checked', 'returned', 'preparedStorageEdges', 'preparedNodes', 'vertexChecks', 'scoreChecks', 'edgeChecks', 'referenceReads', 'idChecks'].map(k => [k, 0])),
    joins: [], coverage: null };
}
function* segmentPaths(cache, segments, forest, view, context, query, prefix, ordinal, initialEntries) {
  const s = segments.stats, flags = segments.coverage, child = pathWitnessContext({ ...context, subject: prefix.at(-1) });
  for (const anchor of forest.anchors()) {
    if (s.pairsExamined === query.maxSegmentLookups) { flags.segmentLookupLimit = true; break; }
    s.pairsExamined++; s.targetAnchorReads++;
    if (!view.anchor(query.epoch, anchor)) continue;
    s.targetRemovalReads++; if (view.removed(anchor)) continue;
    const maxChecks = Math.min(PATH_SEGMENT_LIMITS.maxChecks, query.maxSegmentChecks - segments.work.checked),
      maxResults = Math.min(PATH_SEGMENT_LIMITS.maxResults, query.maxSegmentResults - segments.work.returned);
    const found = PathWitnessSegmentCache.prototype.lookup.call(cache, view, child, { epoch: query.epoch, to: anchor, tick: query.tick, maxChecks, maxResults });
    s.lookupCalls++;
    // The initial inventory only decreases in this lookup-only synchronous consumer. This is a bound, not measured CPU.
    s.inventorySweepEntryUpperBound = s.lookupCalls * initialEntries;
    if (!['hit', 'partial', 'miss', 'censored'].includes(found.status)) throw new Error('segment proposal unexpected lookup status');
    fields(found.work, Object.keys(segments.work));
    if (found.work.checked > maxChecks || found.segments.length > maxResults || found.work.returned !== found.segments.length) throw new Error('segment proposal lookup budget disagreement');
    for (const key of Object.keys(segments.work)) {
      if (!natural(found.work[key]) || !Number.isSafeInteger(segments.work[key] + found.work[key])) throw new Error('segment proposal invalid work counter');
      segments.work[key] += found.work[key];
    }
    if (found.status === 'partial' || found.status === 'censored') {
      if (found.reason === 'check-limit') flags.segmentCheckLimit = true;
      else if (found.reason === 'result-limit') flags.segmentResultLimit = true;
      else throw new Error('segment proposal unexpected lookup limit');
    }
    for (const segment of found.segments) yield { path: [...prefix.slice(0, -1), ...segment.path], join: { prefixOrdinal: ordinal, target: anchor, segmentId: segment.id } };
  }
}
function prefixArray(value, maximum) {
  if (!Array.isArray(value) || ![Array.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('prefix requires plain dense data arrays');
  if (value.length > maximum) throw new RangeError('prefix raw array bound');
  if (Object.keys(value).length !== value.length || Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError('prefix requires dense data arrays');
  for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, i), 'value')) throw new TypeError('prefix array holes/accessors');
  return value;
}
function normalizePrefixAdvice(advice, context, view, query) {
  const rows = prefixArray(advice.pools, 64), empty = createPathWitnessPool({ metric: 'supplied-synthetic/v1', maxPoolSize: 0, candidates: [] });
  // The empty pool validates routing text/mode even without supplied rows; it supplies no search advice.
  const normalized = routePathWitnessPool(empty, { ...advice.routing, domain: context.domain, viewId: view.view().id, epoch: query.epoch, subject: context.subject,
    start: 0, count: 0, excluded: [], loads: advice.routing.mode === 'best-of-two' ? [] : null }).query;
  const pools = [], seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; fields(row, ['subject', 'pool', 'loads']);
    const subject = pathWitnessContext({ domain: context.domain, subject: row.subject, policy: context.policy }).subject;
    if (seen.has(subject)) throw new TypeError('duplicate prefix pool subject');
    seen.add(subject);
    const loads = row.loads === null ? null : Array.prototype.slice.call(prefixArray(row.loads, 64));
    const checked = routePathWitnessPool(row.pool, { ...normalized, subject, loads });
    pools.push({ subject, pool: checked.pool, loads: checked.query.loads });
  }
  return freeze({ pools, routing: { seed: normalized.seed, queryId: normalized.queryId, step: normalized.step, mode: normalized.mode } });
}
function growPrefixes(prefix, view, context, query) {
  const p = context.policy, stats = prefix.stats, queue = prefix.prefixes, rows = new Map(prefix.advice.pools.map(row => [row.subject, row]));
  const flags = prefix.coverage = { prefixLimit: false, expansionLimit: false, branchLimit: false, prefixDepthLimit: false, poolUnavailable: false, treeLookupLimit: false };
  if (query.maxPrefixes === 0) { flags.prefixLimit = true; return; }
  queue.push([context.subject]); stats.queued++; stats.maxPending = 1;
  frontier: for (let head = 0; head < queue.length; head++) {
    const path = queue[head], node = path.at(-1), depth = path.length - 1; stats.expanded++;
    if (depth === p.maxHops) continue;
    if (node !== context.subject && p.minStanding !== null) {
      stats.scoreReads++; const score = view.standing(node); if (score === null || score < p.minStanding) continue;
    }
    const visited = new Set(path), available = new Set();
    for (const next of view.neighbors(node, p.direction, p.undirectedProjection)) {
      if (stats.neighborTrials === query.maxExpansions) { flags.expansionLimit = true; break frontier; }
      stats.neighborTrials++; if (!visited.has(next)) available.add(next);
    }
    if (!available.size) continue;
    if (depth === query.maxPrefixHops) { flags.prefixDepthLimit = true; continue; }
    const row = rows.get(node);
    if (!row) { flags.poolUnavailable = true; stats.missingPools++; continue; }
    const excluded = row.pool.ranked.filter(({ id }) => !available.has(id)).map(({ id }) => id), eligible = row.pool.ranked.length - excluded.length;
    stats.omittedNeighbors += available.size - eligible;
    const queryId = createHash('sha256').update(JSON.stringify([PATH_PREFIX_RANDOMNESS.policy, prefix.advice.routing.queryId, path])).digest('hex');
    const route = routePathWitnessPool(row.pool, { ...prefix.advice.routing, queryId, domain: context.domain, viewId: view.view().id, epoch: query.epoch, subject: node,
      start: 0, count: query.maxBranches, excluded, loads: row.loads });
    stats.routeCalls++; stats.generators += route.stats.generators; stats.draws += route.stats.draws; stats.routedPeers += route.selected.length;
    prefix.routes.push({ prefix: path, poolId: row.pool.id, queryId, selected: route.selected, stats: route.stats });
    if (route.selected.length < eligible) flags.branchLimit = true;
    for (const next of route.selected) {
      if (queue.length === query.maxPrefixes) { flags.prefixLimit = true; break frontier; }
      queue.push([...path, next]); stats.queued++; stats.maxPending = Math.max(stats.maxPending, queue.length - head - 1);
    }
  }
}
