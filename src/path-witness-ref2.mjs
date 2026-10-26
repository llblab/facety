// Owns: Dependency-separated witness wire/state/family checking; excludes production verifier imports, state authentication and admission.
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

function record(value, keys) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== keys.length || Object.keys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key)) || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('ref2 invalid fields');
}
function nat(n, min, max) { return Number.isSafeInteger(n) && !Object.is(n, -0) && n >= min && n <= max; }
function text(s, max) {
  if (typeof s !== 'string' || !s.length || s.length > max) throw new TypeError('ref2 invalid ID');
  for (const c of s) if (c.codePointAt(0) >= 0xd800 && c.codePointAt(0) <= 0xdfff) throw new TypeError('ref2 invalid Unicode');
  if (Buffer.byteLength(s) > max) throw new RangeError('ref2 ID bound');
}
function array(a, max) {
  if (!Array.isArray(a) || a.length > max || Reflect.ownKeys(a).length !== a.length + 1 || Object.keys(a).length !== a.length) throw new TypeError('ref2 invalid array');
  for (let i = 0; i < a.length; i++) if (!Object.hasOwn(a, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(a, i), 'value')) throw new TypeError('ref2 sparse/accessor array');
}
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function trusted(context) {
  record(context, ['domain', 'subject', 'policy']);
  const keys = ['direction', 'undirectedProjection', 'maxHops', 'graceEpochs', 'maxSlack', 'maxDifficulty', 'maxIdBytes', 'maxWitnessBytes', 'minStanding'];
  record(context.policy, keys);
  const p = Object.fromEntries(keys.map(k => [k, context.policy[k]]));
  if (!['directed-from-anchor', 'undirected'].includes(p.direction) || !['any-live-orientation', 'reciprocal-only'].includes(p.undirectedProjection)
    || !nat(p.maxHops, 1, 64) || !nat(p.maxDifficulty, 1, 64) || !nat(p.graceEpochs, 0, 1024) || !nat(p.maxSlack, 0, 1)
    || !nat(p.maxIdBytes, 1, 256) || !nat(p.maxWitnessBytes, 1, 65536) || (p.minStanding !== null && !nat(p.minStanding, 0, Number.MAX_SAFE_INTEGER))) throw new RangeError('ref2 unsupported policy');
  text(context.domain, p.maxIdBytes); text(context.subject, p.maxIdBytes);
  return { p, domain: context.domain, subject: context.subject };
}
function parse(input, c) {
  if (!(input instanceof Uint8Array) || input.byteLength > c.p.maxWitnessBytes || input.buffer instanceof SharedArrayBuffer) throw new TypeError('ref2 byte input');
  const bytes = Buffer.from(input), doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  record(doc, ['domain', 'policy', 'version', 'witness']);
  const hash = createHash('sha256').update('facety-path-policy/v1').update(Buffer.from([0])).update(canonical(c.p)).digest('hex');
  if (doc.domain !== c.domain || doc.policy !== hash || doc.version !== 'facety-path-witness/v1') throw new TypeError('ref2 wire context');
  const w = doc.witness;
  record(w, ['subject', 'epoch', 'paths']); text(w.subject, c.p.maxIdBytes);
  if (w.subject !== c.subject || !nat(w.epoch, 0, Number.MAX_SAFE_INTEGER)) throw new TypeError('ref2 witness context');
  array(w.paths, c.p.maxDifficulty + c.p.maxSlack);
  let previous = null;
  for (const path of w.paths) {
    array(path, c.p.maxHops + 1); if (!path.length) throw new TypeError('ref2 empty path');
    for (const v of path) text(v, c.p.maxIdBytes);
    const key = Buffer.from(JSON.stringify(path));
    if (previous !== null && Buffer.compare(previous, key) >= 0) throw new TypeError('ref2 noncanonical path order');
    previous = key;
  }
  if (Buffer.from(canonical(doc)).compare(bytes) !== 0) throw new TypeError('ref2 noncanonical bytes');
  return w;
}
export function verifyPathWitnessRef2(input, context, state) {
  const c = trusted(context), p = c.p;
  const lookups = { view: 0, snapshot: 0, degree: 0, anchorCount: 0, anchor: 0, removed: 0, edge: 0, standing: 0 };
  let required = null, degreeBound = null, anchorBound = null, vertices = 0, conflictsChecked = 0;
  const result = (reason, selected = []) => Object.freeze({ accepted: reason === 'ok', reason, required, degreeBound, anchorBound, selected: Object.freeze(selected),
    stats: Object.freeze({ lookups: Object.freeze({ ...lookups }), vertices, conflictsChecked }) });
  let data;
  try { data = parse(input, c); }
  catch (e) { if (e instanceof TypeError || e instanceof RangeError || e instanceof SyntaxError) return result('invalid-wire'); throw e; }
  function access(method, ...args) {
    if (typeof state?.[method] !== 'function') throw new TypeError('ref2 missing accessor ' + method);
    lookups[method]++; return state[method](...args);
  }
  function view() {
    const v = access('view');
    if (!v || !nat(v.epoch, 0, Number.MAX_SAFE_INTEGER)) throw new TypeError('ref2 invalid view');
    text(v.id, p.maxIdBytes); return [v.id, v.epoch];
  }
  const first = view();
  const finish = (reason, selected = []) => { const end = view(); return end[0] === first[0] && end[1] === first[1] ? result(reason, selected) : result('state-view-changed'); };
  if (data.epoch > first[1] || first[1] - data.epoch > p.graceEpochs) return finish('epoch-outside-grace');
  const snap = access('snapshot', data.epoch);
  if (snap === null) return finish('snapshot-unavailable');
  if (!snap || !nat(snap.difficulty, 1, p.maxDifficulty)) throw new TypeError('ref2 invalid difficulty');
  required = snap.difficulty;
  if (data.paths.length > required + p.maxSlack) return finish('witness-path-count');
  degreeBound = access('degree', c.subject, p.direction, p.undirectedProjection);
  if (degreeBound !== null && !nat(degreeBound, 0, Number.MAX_SAFE_INTEGER)) throw new TypeError('ref2 invalid degree');
  if (degreeBound !== null && degreeBound < required) return finish('degree-infeasible');
  anchorBound = access('anchorCount', data.epoch, c.subject);
  if (anchorBound !== null && !nat(anchorBound, 0, Number.MAX_SAFE_INTEGER)) throw new TypeError('ref2 invalid anchor count');
  if (anchorBound !== null && anchorBound < required) return finish('anchor-infeasible');
  const memo = new Map();
  function fact(method, ...args) {
    const key = JSON.stringify([method, ...args]);
    if (!memo.has(key)) {
      const v = access(method, ...args);
      if (method === 'standing' ? v !== null && !nat(v, 0, Number.MAX_SAFE_INTEGER) : typeof v !== 'boolean') throw new TypeError('ref2 invalid fact ' + method);
      memo.set(key, v);
    }
    return memo.get(key);
  }
  const candidates = [];
  data.paths.forEach((path, index) => {
    vertices += path.length;
    if (path.length < 2 || path[0] !== c.subject || path.at(-1) === c.subject || new Set(path).size !== path.length) return;
    if (!fact('anchor', data.epoch, path.at(-1)) || fact('removed', path.at(-1))) return;
    for (let j = 0; j + 1 < path.length; j++) {
      const x = path[j], y = path[j + 1]; let valid;
      if (p.direction === 'directed-from-anchor') valid = fact('edge', y, x);
      else { const f = fact('edge', x, y), b = fact('edge', y, x); valid = p.undirectedProjection === 'reciprocal-only' ? f && b : f || b; }
      if (!valid) return;
      if (p.minStanding !== null && j + 2 < path.length) { const s = fact('standing', y); if (s === null || s < p.minStanding) return; }
    }
    candidates.push(index);
  });
  if (candidates.length < required) return finish('insufficient-valid-paths');
  const omissions = candidates.length === required ? [-1] : Array.from({ length: candidates.length }, (_, i) => candidates.length - i - 1);
  for (const omit of omissions) {
    const occupied = new Set(), selected = []; let disjoint = true;
    candidates.forEach((index, i) => {
      if (i === omit) return;
      selected.push(index);
      for (const v of data.paths[index].slice(1)) { conflictsChecked++; if (occupied.has(v)) disjoint = false; occupied.add(v); }
    });
    if (disjoint) return finish('ok', selected);
  }
  return finish('family-conflict');
}
