// Owns: Immutable supplied/live-accepted Native graph captures for witness queries; excludes authentication, epoch selection, global search and economic mutation.
import { createHash } from 'node:crypto';
import { DirectedGraph } from './graph.mjs';
import { FacetyModel } from './model.mjs';
import { pathWitnessPolicy, pathWitnessPolicyId } from './path-witness.mjs';

export const PATH_VIEW_LIMITS = Object.freeze({ nodes: 4096, edges: 65536, snapshots: 1025, anchorEntries: 65536, relations: 65536 });
const cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const pair = (a, b) => JSON.stringify([a, b]);
const natural = value => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
const constructedViews = new WeakSet();
export function isPathWitnessView(value) { return constructedViews.has(value); }
function fields(v, keys) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.keys(v).length !== keys.length || Reflect.ownKeys(v).length !== keys.length
    || keys.some(k => !Object.hasOwn(v, k)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('invalid path view fields');
}
function array(v, max) {
  if (!Array.isArray(v) || v.length > max) throw new RangeError('path view array bound');
  if (Object.keys(v).length !== v.length || Reflect.ownKeys(v).length !== v.length + 1) throw new TypeError('path view requires dense data arrays');
  for (let i = 0; i < v.length; i++) if (!Object.hasOwn(v, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v, i), 'value')) throw new TypeError('path view sparse/accessor array');
}
function id(value, p) {
  if (typeof value !== 'string' || !value.length || value.length > p.maxIdBytes) throw new TypeError('invalid path view ID');
  for (const c of value) if (c.codePointAt(0) >= 0xd800 && c.codePointAt(0) <= 0xdfff) throw new TypeError('invalid path view Unicode');
  if (Buffer.byteLength(value) > p.maxIdBytes) throw new RangeError('path view ID byte bound');
  return value;
}
function ids(values, max, p) {
  array(values, max); const copy = values.map(value => id(value, p));
  if (new Set(copy).size !== copy.length) throw new TypeError('duplicate path view ID');
  return copy.sort(cmp);
}
function freeze(v) {
  if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); }
  return v;
}
function optionsFrom(input) {
  fields(input, ['policy', 'currentEpoch', 'snapshots', 'removed', 'standing']);
  const policy = pathWitnessPolicy(input.policy);
  if (policy.maxIdBytes < 64) throw new RangeError('path view needs64-byte ID envelope for its full SHA-256 token');
  if (!natural(input.currentEpoch)) throw new RangeError('invalid path view epoch');
  array(input.snapshots, PATH_VIEW_LIMITS.snapshots);
  const epochs = new Set(); let count = 0;
  const snapshots = input.snapshots.map(row => {
    fields(row, ['epoch', 'difficulty', 'anchors']);
    if (!natural(row.epoch) || epochs.has(row.epoch) || !natural(row.difficulty) || row.difficulty < 1 || row.difficulty > policy.maxDifficulty) throw new RangeError('invalid/duplicate path snapshot epoch/difficulty');
    epochs.add(row.epoch);
    const anchors = ids(row.anchors, PATH_VIEW_LIMITS.nodes, policy); count += anchors.length;
    if (count > PATH_VIEW_LIMITS.anchorEntries) throw new RangeError('path view total anchor bound');
    return { epoch: row.epoch, difficulty: row.difficulty, anchors };
  }).sort((a, b) => a.epoch - b.epoch);
  const removed = ids(input.removed, PATH_VIEW_LIMITS.anchorEntries, policy);
  array(input.standing, PATH_VIEW_LIMITS.nodes);
  const seen = new Set(), standing = input.standing.map(row => {
    array(row, 2);
    if (row.length !== 2 || (row[1] !== null && !natural(row[1]))) throw new TypeError('invalid declared standing');
    const subject = id(row[0], policy);
    if (seen.has(subject)) throw new TypeError('duplicate declared standing');
    seen.add(subject); return [subject, row[1]];
  }).sort((a, b) => cmp(a[0], b[0]));
  return freeze({ policy, currentEpoch: input.currentEpoch, snapshots, removed, standing });
}
function storageFrom(graph, p) {
  if (!(graph instanceof DirectedGraph)) throw new TypeError('path view requires DirectedGraph');
  if (graph.size > PATH_VIEW_LIMITS.nodes || graph.edgeCount > PATH_VIEW_LIMITS.edges) throw new RangeError('path view graph bound');
  const revision = graph.revision, raw = graph.toJSON();
  if (graph.revision !== revision || raw.revision !== revision) throw new Error('graph changed during path capture');
  const nodes = ids(raw.nodes, PATH_VIEW_LIMITS.nodes, p), known = new Set(nodes);
  array(raw.edges, PATH_VIEW_LIMITS.edges); id(raw.name, p);
  const keys = new Set(), edgeIds = new Set();
  const edges = raw.edges.map(edge => {
    if (!known.has(edge.from) || !known.has(edge.to) || edge.from === edge.to || typeof edge.id !== 'string'
      || !/^edge:\d+$/.test(edge.id) || keys.has(pair(edge.from, edge.to)) || edgeIds.has(edge.id)) throw new TypeError('invalid path capture storage edge');
    keys.add(pair(edge.from, edge.to)); edgeIds.add(edge.id);
    return { id: edge.id, from: edge.from, to: edge.to };
  }).sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.id, b.id));
  return freeze({ version: 1, name: raw.name, revision, nextEdge: raw.nextEdge, nodes, edges });
}
function build(storage, options, source, liveNodes = storage.nodes) {
  const live = new Set(liveNodes), removed = new Set(options.removed), scores = new Map(options.standing);
  const edges = storage.edges.filter(e => live.has(e.from) && live.has(e.to));
  const out = new Map(liveNodes.map(v => [v, new Set()])), incoming = new Map(liveNodes.map(v => [v, new Set()]));
  for (const edge of edges) { out.get(edge.from).add(edge.to); incoming.get(edge.to).add(edge.from); }
  const directed = new Map(), any = new Map(), reciprocal = new Map(), empty = Object.freeze([]);
  for (const node of liveNodes) {
    directed.set(node, Object.freeze([...incoming.get(node)].sort(cmp)));
    any.set(node, Object.freeze([...new Set([...incoming.get(node), ...out.get(node)])].sort(cmp)));
    reciprocal.set(node, Object.freeze([...incoming.get(node)].filter(v => out.get(node).has(v)).sort(cmp)));
  }
  const snapshots = new Map(options.snapshots.map(row => [row.epoch, { meta: Object.freeze({ difficulty: row.difficulty }),
    anchors: new Set(row.anchors), available: new Set(row.anchors.filter(v => live.has(v) && !removed.has(v))) }]));
  const payload = freeze({ version: 'facety-path-view/v1', policyId: pathWitnessPolicyId(options.policy), options,
    live: { nodes: [...liveNodes], edges: edges.map(e => [e.from, e.to]) }, source: { ...source, storage } });
  const root = createHash('sha256').update('facety-path-view/v1\0').update(JSON.stringify(payload)).digest('hex');
  const exported = freeze({ root, ...payload }), current = Object.freeze({ id: root, epoch: options.currentEpoch });
  const capture = Object.freeze({ reference: source.reference, root, sourceRevision: storage.revision, atHour: source.atHour ?? null });
  function neighbors(subject, direction, projection) {
    if (!['directed-from-anchor', 'undirected'].includes(direction) || !['any-live-orientation', 'reciprocal-only'].includes(projection)) throw new TypeError('unsupported path view projection');
    const map = direction === 'directed-from-anchor' ? directed : projection === 'reciprocal-only' ? reciprocal : any;
    return map.get(subject) ?? empty;
  }
  const view = Object.freeze({ capture, view: () => current, snapshot: epoch => snapshots.get(epoch)?.meta ?? null,
    anchor: (epoch, subject) => snapshots.get(epoch)?.anchors.has(subject) ?? false, removed: subject => removed.has(subject),
    edge: (from, to) => out.get(from)?.has(to) ?? false, standing: subject => scores.get(subject) ?? null,
    degree: (subject, direction, projection) => neighbors(subject, direction, projection).length,
    anchorCount: (epoch, subject) => { const values = snapshots.get(epoch)?.available; return values ? values.size - Number(values.has(subject)) : 0; },
    nodeIds: () => exported.live.nodes, neighbors, toJSON: () => exported });
  constructedViews.add(view);
  return view;
}
export function pathWitnessGraphView(graph, input) {
  const options = optionsFrom(input);
  return build(storageFrom(graph, options.policy), options, { reference: 'supplied-live-directed-graph/v1' });
}
export function capturePathWitnessModelView(model, input) {
  const options = optionsFrom(input);
  if (!(model instanceof FacetyModel)) throw new TypeError('path capture requires FacetyModel');
  if (model.size > PATH_VIEW_LIMITS.nodes) throw new RangeError('path capture subject bound');
  const graph = model.guarantees, start = { hour: model.now, size: model.size, revision: graph.revision, events: model.events().length };
  const storage = storageFrom(graph, options.policy), subjects = model.subjects(), records = model.guaranteeRelations();
  if (model.guarantees !== graph || model.now !== start.hour || model.size !== start.size || graph.revision !== start.revision || model.events().length !== start.events) throw new Error('model changed during path capture');
  array(subjects, PATH_VIEW_LIMITS.nodes); array(records, PATH_VIEW_LIMITS.relations);
  const subjectsById = new Map(), subjectRows = subjects.map(subject => {
    id(subject.id, options.policy);
    if (subjectsById.has(subject.id) || !['accepted', 'false'].includes(subject.identityStatus)) throw new TypeError('invalid canonical subject status');
    subjectsById.set(subject.id, subject.identityStatus); return { id: subject.id, identityStatus: subject.identityStatus };
  }).sort((a, b) => cmp(a.id, b.id));
  if (subjectsById.size !== storage.nodes.length || storage.nodes.some(v => !subjectsById.has(v))) throw new Error('model graph/subject disagreement');
  const relationIds = new Set(), activePairs = new Set(), storagePairs = new Set(storage.edges.map(e => pair(e.from, e.to)));
  const relationRows = records.map(record => {
    id(record.id, options.policy);
    if (relationIds.has(record.id) || !subjectsById.has(record.guarantor) || !subjectsById.has(record.guaranteed) || record.guarantor === record.guaranteed
      || !['proposed', 'active', 'ended'].includes(record.status) || !natural(record.proposedAt) || record.proposedAt > start.hour) throw new TypeError('invalid canonical guarantee record');
    relationIds.add(record.id);
    if (record.status === 'proposed' ? record.activatedAt !== null || record.endedAt !== null
      : !natural(record.activatedAt) || record.activatedAt < record.proposedAt || record.activatedAt > start.hour
        || (record.status === 'active' ? record.endedAt !== null : !natural(record.endedAt) || record.endedAt < record.activatedAt || record.endedAt > start.hour)) throw new TypeError('invalid guarantee chronology');
    if (record.status === 'active') {
      const k = pair(record.guarantor, record.guaranteed);
      if (activePairs.has(k) || !storagePairs.has(k)) throw new Error('model graph/active record disagreement');
      activePairs.add(k);
    }
    if (record.vouch !== undefined) id(record.vouch, options.policy);
    return { id: record.id, guarantor: record.guarantor, guaranteed: record.guaranteed, proposedAt: record.proposedAt,
      activatedAt: record.activatedAt, endedAt: record.endedAt, status: record.status, vouch: record.vouch ?? null };
  }).sort((a, b) => cmp(a.id, b.id));
  if (activePairs.size !== storagePairs.size) throw new Error('model graph contains unrecorded active edges');
  return build(storage, options, { reference: 'native-active-accepted-reference/v1', atHour: start.hour, eventCount: start.events,
    subjects: subjectRows, relations: relationRows }, subjectRows.filter(row => row.identityStatus === 'accepted').map(row => row.id));
}
