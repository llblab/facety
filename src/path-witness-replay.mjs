// Owns: Native public graph/status journal reconstruction and capture-version audits; excludes economic replay, authentication, finality and admission execution.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { DirectedGraph } from './graph.mjs';
import { capturePathWitnessModelView, isPathWitnessView, PATH_VIEW_LIMITS } from './path-witness-view.mjs';

export const PATH_REPLAY_LIMITS = Object.freeze({ maxEvents: 100000, maxIdBytes: 256 });
const structural = ['subject-added', 'identity-invalidated', 'guarantee-proposed', 'guarantee-activated', 'guarantee-ended', 'vouch-committed'];
const passive = ['vouch-admitted', 'vouch-exited', 'vouch-bond-released', 'vouch-bond-case-opened', 'vouch-bond-case-resolved',
  'facy-transferred', 'debt-recovered', 'key-rotated', 'artifact-registered', 'self-id-created', 'self-id-cancelled',
  'invitation-created', 'invitation-accepted', 'invitation-cancelled', 'collector-converted', 'self-id-frozen', 'self-id-unfrozen',
  'dispute-stake-reserved', 'dispute-stake-settled', 'dispute-participation-started', 'dispute-participation-ended', 'dispute-participant-joined', 'penalty-applied', 'act-penalty-applied', 'self-id-source-recovered', 'self-id-resolved', 'self-id-chain-voided'];
export const PATH_REPLAY_EVENT_TYPES = Object.freeze([...structural, ...passive].sort());
const allowed = new Set(PATH_REPLAY_EVENT_TYPES), cmp = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const natural = v => Number.isSafeInteger(v) && !Object.is(v, -0) && v >= 0;
function fields(v, keys) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Object.keys(v).length !== keys.length || Reflect.ownKeys(v).length !== keys.length
    || keys.some(k => !Object.hasOwn(v, k)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('replay requires exact data fields');
}
function limits(input, keys) {
  fields(input, keys);
  if (!natural(input.maxEvents) || input.maxEvents > PATH_REPLAY_LIMITS.maxEvents) throw new RangeError('unsupported replay history bound');
  return input.maxEvents;
}
function freeze(v) { if (v && typeof v === 'object') { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; }
export function replayPathWitnessEvents(events, input) {
  limits(input, ['atHour', 'maxEvents', 'maxIdBytes']);
  if (!natural(input.atHour) || !natural(input.maxIdBytes) || input.maxIdBytes < 1 || input.maxIdBytes > PATH_REPLAY_LIMITS.maxIdBytes) throw new RangeError('unsupported replay hour/ID bound');
  if (!Array.isArray(events) || events.length > input.maxEvents) throw new RangeError('replay history exceeds admitted bound');
  if (Object.keys(events).length !== events.length || Reflect.ownKeys(events).length !== events.length + 1) throw new TypeError('replay requires dense event data');
  function id(v) {
    if (typeof v !== 'string' || !v.length || v.length > input.maxIdBytes || Buffer.byteLength(v) > input.maxIdBytes) throw new TypeError('invalid replay ID');
    for (const c of v) if (c.codePointAt(0) >= 0xd800 && c.codePointAt(0) <= 0xdfff) throw new TypeError('invalid replay Unicode');
    return v;
  }
  const graph = new DirectedGraph('guarantees'), subjects = new Map(), relations = new Map(), vouches = new Map();
  const digest = createHash('sha256').update('facety-path-journal/v1\0'); let lastHour = 0;
  const known = v => { id(v); if (!subjects.has(v)) throw new Error('unknown replay subject'); return v; };
  for (let index = 0; index < events.length; index++) {
    if (!Object.hasOwn(events, index) || !Object.hasOwn(Object.getOwnPropertyDescriptor(events, index), 'value')) throw new TypeError('sparse/accessor replay event');
    const e = events[index];
    if (!e || ![Object.prototype, null].includes(Object.getPrototypeOf(e)) || Object.values(Object.getOwnPropertyDescriptors(e)).some(d => !Object.hasOwn(d, 'value'))
      || !Object.hasOwn(e, 'at') || !Object.hasOwn(e, 'type') || !natural(e.at) || e.at < lastHour || e.at > input.atHour || !allowed.has(e.type)) throw new TypeError('unknown/malformed/nonchronological Native event');
    lastHour = e.at; let payload = null;
    switch (e.type) {
      case 'subject-added': {
        id(e.subject);
        if (subjects.has(e.subject) || typeof e.genesis !== 'boolean') throw new Error('duplicate/malformed replay subject');
        if (subjects.size === PATH_VIEW_LIMITS.nodes) throw new RangeError('replay node bound');
        subjects.set(e.subject, { id: e.subject, identityStatus: 'accepted' }); graph.addNode(e.subject);
        payload = [e.subject, e.genesis]; break;
      }
      case 'identity-invalidated': {
        known(e.subject); subjects.get(e.subject).identityStatus = 'false'; payload = e.subject; break;
      }
      case 'vouch-committed': {
        id(e.vouch); known(e.voucher); id(e.target);
        if (e.voucher === e.target || vouches.has(e.vouch)) throw new Error('duplicate/malformed replay vouch');
        if (vouches.size === PATH_VIEW_LIMITS.relations) throw new RangeError('replay vouch bound');
        vouches.set(e.vouch, { voucher: e.voucher, target: e.target, at: e.at, activated: false });
        payload = [e.vouch, e.voucher, e.target]; break;
      }
      case 'guarantee-proposed': {
        id(e.relation); known(e.guarantor); known(e.guaranteed);
        if (relations.has(e.relation) || e.guarantor === e.guaranteed) throw new Error('duplicate/malformed replay proposal');
        if (relations.size === PATH_VIEW_LIMITS.relations) throw new RangeError('replay relation bound');
        const record = { id: e.relation, guarantor: e.guarantor, guaranteed: e.guaranteed, proposedAt: e.at,
          activatedAt: null, endedAt: null, status: 'proposed', vouch: null };
        relations.set(e.relation, record); payload = record; break;
      }
      case 'guarantee-activated': {
        id(e.relation); let record = relations.get(e.relation);
        if (e.vouch !== undefined) {
          id(e.vouch); const vouch = vouches.get(e.vouch);
          if (record || !vouch || vouch.activated) throw new Error('missing/duplicate replay vouch activation');
          known(vouch.target);
          if (relations.size === PATH_VIEW_LIMITS.relations) throw new RangeError('replay relation bound');
          record = { id: e.relation, guarantor: vouch.voucher, guaranteed: vouch.target, proposedAt: vouch.at,
            activatedAt: null, endedAt: null, status: 'proposed', vouch: e.vouch };
          relations.set(e.relation, record); vouch.activated = true;
        }
        if (!record || record.status !== 'proposed' || graph.edge(record.guarantor, record.guaranteed)) throw new Error('missing/conflicting replay activation');
        if (graph.edgeCount === PATH_VIEW_LIMITS.edges) throw new RangeError('replay edge bound');
        graph.addEdge(record.guarantor, record.guaranteed); record.status = 'active'; record.activatedAt = e.at;
        payload = [record.id, record.guarantor, record.guaranteed, record.vouch]; break;
      }
      case 'guarantee-ended': {
        id(e.relation); const record = relations.get(e.relation);
        if (!record || record.status !== 'active' || ![record.guarantor, record.guaranteed].includes(e.actor)) throw new Error('missing/malformed replay end');
        if (!graph.removeEdge(record.guarantor, record.guaranteed)) throw new Error('missing replay active edge');
        record.status = 'ended'; record.endedAt = e.at; payload = [e.relation, e.actor]; break;
      }
    }
    digest.update(JSON.stringify([index, e.type, e.at, payload])).update('\n');
  }
  const storage = graph.toJSON(); storage.nodes.sort(cmp); storage.edges.sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.id, b.id));
  return freeze({ schema: 'facety-path-replay/v1', eventCount: events.length, atHour: input.atHour, lastEventHour: events.length ? lastHour : null,
    journalDigest: digest.digest('hex'), subjects: [...subjects.values()].sort((a, b) => cmp(a.id, b.id)),
    relations: [...relations.values()].sort((a, b) => cmp(a.id, b.id)), storage });
}
export function captureReplayedPathWitnessModelView(model, options, input) {
  const maxEvents = limits(input, ['maxEvents']);
  const view = capturePathWitnessModelView(model, options), source = view.toJSON().source, events = model.events();
  if (events.length !== source.eventCount) throw new Error('Native history changed during replay capture');
  const replay = replayPathWitnessEvents(events, { atHour: view.capture.atHour, maxEvents, maxIdBytes: view.toJSON().options.policy.maxIdBytes });
  const after = capturePathWitnessModelView(model, options);
  if (after.view().id !== view.view().id) throw new Error('Native view changed during replay audit');
  if (!isDeepStrictEqual(replay.subjects, source.subjects) || !isDeepStrictEqual(replay.relations, source.relations)
    || !isDeepStrictEqual(replay.storage, source.storage)) throw new Error('Native graph/status journal disagrees with capture');
  return Object.freeze({ view, replay, version: Object.freeze({ root: view.view().id, atHour: replay.atHour, eventCount: replay.eventCount,
    journalDigest: replay.journalDigest, reference: view.capture.reference }) });
}
export function comparePathWitnessModelVersion(model, previous, options, input) {
  if (!isPathWitnessView(previous) || previous.capture.reference !== 'native-active-accepted-reference/v1') throw new TypeError('version comparison requires a Native capture');
  const current = captureReplayedPathWitnessModelView(model, options, input);
  return Object.freeze({ matches: previous.view().id === current.version.root, previousRoot: previous.view().id,
    currentRoot: current.version.root, version: current.version });
}
