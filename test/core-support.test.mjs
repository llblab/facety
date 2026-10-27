import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replayPathWitnessEvents } from '../src/path-witness-replay.mjs';
import { digestOf } from '../src/provenance.mjs';
const root = '../studies/2026-10-26-trust-topology-condition-map/';
const fixture = JSON.parse(readFileSync(new URL(root + 't2-support-vectors.json', import.meta.url)));
function fields(v, keys) {
  if (!v || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Reflect.ownKeys(v).length !== keys.length
    || keys.some(k => !Object.hasOwn(v, k)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => !Object.hasOwn(d, 'value'))) throw new TypeError('invalid observation fields');
}
function dense(a) {
  if (!Array.isArray(a) || Reflect.ownKeys(a).length !== a.length + 1) throw new TypeError('observation array must be dense data');
  for (let i = 0; i < a.length; i++) if (!Object.hasOwn(a, i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(a, i), 'value')) throw new TypeError('sparse/accessor observation');
}
function natural(v, minimum = 0) {
  if (!Number.isSafeInteger(v) || Object.is(v, -0) || v < minimum) throw new RangeError('invalid observation integer');
}
function id(v) { if (typeof v !== 'string' || !v.length) throw new TypeError('invalid observation ID'); }
function validate(o, p) {
  fields(o, ['subject', 'atHour', 'difficulty', 'incoming', 'lineage']); fields(p, ['sourceCap', 'minimumAgeHours']);
  id(o.subject); natural(o.atHour); natural(o.difficulty, 1); natural(p.sourceCap, 1); natural(p.minimumAgeHours);
  dense(o.lineage);
  const ancestry = new Map(), roots = new Map();
  for (const row of o.lineage) {
    fields(row, ['id', 'origin', 'parent']); id(row.id);
    if (ancestry.has(row.id) || !['genesis', 'invitation', 'unattributed'].includes(row.origin)) throw new TypeError('duplicate/invalid origin');
    if (row.origin === 'invitation') id(row.parent);
    else if (row.parent !== null) throw new TypeError('non-invitation parent');
    ancestry.set(row.id, row);
  }
  function source(start) {
    const path = [], seen = new Set(); let current = start, result;
    while (true) {
      if (roots.has(current)) { result = roots.get(current); break; }
      if (seen.has(current)) throw new TypeError('cyclic invitation ancestry');
      seen.add(current); path.push(current);
      const row = ancestry.get(current);
      if (!row || row.origin === 'unattributed') { result = null; break; }
      if (row.origin === 'genesis') { result = row.id; break; }
      current = row.parent;
    }
    for (const member of path) roots.set(member, result);
    return result;
  }
  for (const member of ancestry.keys()) source(member);
  if (o.incoming !== null) {
    dense(o.incoming); const relations = new Set(), guarantors = new Set();
    for (const row of o.incoming) {
      fields(row, ['relationId', 'guarantor', 'proposedAt', 'activatedAt']); id(row.relationId); id(row.guarantor);
      if (relations.has(row.relationId) || guarantors.has(row.guarantor) || row.guarantor === o.subject) throw new TypeError('duplicate/self support');
      relations.add(row.relationId); guarantors.add(row.guarantor);
      for (const at of [row.proposedAt, row.activatedAt]) if (at !== null) { natural(at); if (at > o.atHour) throw new RangeError('future relation time'); }
      if (row.proposedAt !== null && row.activatedAt !== null && row.activatedAt < row.proposedAt) throw new RangeError('activation before proposal');
    }
  }
  return source;
}
// Test-only arithmetic reference, not production d_eff or an invitation authorization API.
function support(o, p) {
  const source = validate(o, p), D = o.difficulty;
  const interval = (lower, upper) => ({ lower, upper, status: lower === null ? 'unknown' : lower >= D ? 'pass' : upper < D ? 'fail' : 'unknown' });
  if (o.incoming === null) return Object.fromEntries(['I0', 'I1', 'I2', 'I3'].map(arm => [arm, interval(null, null)]));
  const counts = new Map(); let unknownSource = 0, unknownAge = 0, old = 0;
  for (const row of o.incoming) {
    const s = source(row.guarantor);
    if (s === null) unknownSource++; else counts.set(s, (counts.get(s) ?? 0) + 1);
    if (row.activatedAt === null) unknownAge++;
    else if (o.atHour - row.activatedAt >= p.minimumAgeHours) old++;
  }
  const clipped = [...counts.values()].reduce((sum, n) => sum + Math.min(n, p.sourceCap), 0), N = o.incoming.length;
  return { I0: interval(N, N), I1: interval(counts.size, counts.size + unknownSource),
    I2: interval(clipped, clipped + unknownSource), I3: interval(old, old + unknownAge) };
}
const row = name => fixture.vectors.find(v => v.id === name);
function rename(o) {
  const copy = structuredClone(o), f = value => '\0Ω:' + value;
  copy.subject = f(copy.subject);
  for (const r of copy.incoming ?? []) { r.relationId = f(r.relationId); r.guarantor = f(r.guarantor); }
  for (const r of copy.lineage) { r.id = f(r.id); if (r.parent !== null) r.parent = f(r.parent); }
  return copy;
}
function freeze(v) { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }

test('T2 literal12 observations and3 controls match exact bounds, with no role/expected labels in scoring', t => {
  assert.equal(fixture.vectors.length, 12); assert.equal(fixture.parameterControls.length, 3); assert.equal(fixture.captureEnabled, false);
  for (const v of fixture.vectors) {
    const before = structuredClone(v), outside = [new Set(), new Set(v.observation.incoming?.map(r => r.guarantor) ?? [])];
    for (const roles of outside) {
      assert.ok(roles instanceof Set);
      assert.deepEqual(support(v.observation, v.parameters), v.expected, v.id);
    }
    assert.deepEqual(v, before);
  }
  for (const c of fixture.parameterControls) assert.deepEqual(support(row(c.base).observation, c.parameters), c.expected, c.base);
  assert.deepEqual(support(row('shared').observation, row('shared').parameters), { I0: { lower: 3, upper: 3, status: 'pass' },
    I1: { lower: 1, upper: 1, status: 'fail' }, I2: { lower: 2, upper: 2, status: 'fail' }, I3: { lower: 3, upper: 3, status: 'pass' } });
  t.diagnostic('t2-goldens ' + JSON.stringify({ vectors: 12, parameterControls: 3, pairedOutsideRoles: 24,
    populationWorlds: 0, defaultDEffChanged: false, meaning: 'encoded counterfactual arithmetic, not measured genuine/fake accuracy' }));
});

test('T2 observation order/opaque renaming/copies and partial-boundary decisions retain the same semantics', () => {
  for (const v of fixture.vectors) {
    const o = structuredClone(v.observation); o.incoming?.reverse(); o.lineage.reverse();
    assert.deepEqual(support(o, v.parameters), v.expected);
    assert.deepEqual(support(rename(o), v.parameters), v.expected);
    const reordered = Object.fromEntries(Object.entries(o).reverse());
    assert.deepEqual(support(reordered, Object.fromEntries(Object.entries(v.parameters).reverse())), v.expected);
    assert.deepEqual(support(freeze(structuredClone(o)), freeze(structuredClone(v.parameters))), v.expected);
    const first = support(o, v.parameters); first.I0.status = 'mutated-output';
    assert.deepEqual(support(o, v.parameters), v.expected);
  }
  const c = structuredClone(row('distinct')), first = support(c.observation, c.parameters);
  c.observation.incoming[0].activatedAt = 48; c.parameters.sourceCap = 1;
  assert.deepEqual(first, row('distinct').expected);
  assert.equal(support(c.observation, c.parameters).I3.lower, 2);
  const partial = row('shared-plus-unknown');
  for (const [D, status1, status2] of [[1, 'pass', 'pass'], [2, 'unknown', 'pass'], [3, 'fail', 'unknown'], [4, 'fail', 'fail']]) {
    const result = support({ ...partial.observation, difficulty: D }, partial.parameters);
    assert.equal(result.I1.status, status1); assert.equal(result.I2.status, status2);
    assert.deepEqual([result.I1.lower, result.I1.upper], [1, 2]);
    assert.deepEqual([result.I2.lower, result.I2.upper], [2, 3]);
  }
});

test('T2 finite 27 source x27 age patterns retain cap/age identities and observation-missingness bounds', t => {
  let cases = 0;
  for (let sourceCode = 0; sourceCode < 27; sourceCode++) for (let ageCode = 0; ageCode < 27; ageCode++) {
    const sources = Array.from({ length: 3 }, (_, i) => Math.floor(sourceCode / 3 ** i) % 3);
    const ages = Array.from({ length: 3 }, (_, i) => Math.floor(ageCode / 3 ** i) % 3);
    const o = structuredClone(row('distinct').observation);
    o.lineage = [{ id: 'r0', origin: 'genesis', parent: null }, { id: 'r1', origin: 'genesis', parent: null }];
    for (let i = 0; i < 3; i++) {
      if (sources[i] < 2) o.lineage.push({ id: 'g' + i, origin: 'invitation', parent: 'r' + sources[i] });
      o.incoming[i].activatedAt = ages[i] === 0 ? 0 : ages[i] === 1 ? 25 : null;
    }
    const sizes = [0, 1].map(s => sources.filter(v => v === s).length), U = sources.filter(s => s === 2).length;
    const known = sizes.filter(n => n > 0).length, old = ages.filter(a => a === 0).length, unknownAge = ages.filter(a => a === 2).length;
    let previous = 0;
    for (const q of [1, 2, 3]) {
      const result = support(o, { sourceCap: q, minimumAgeHours: 24 }), cap = sizes.reduce((n, size) => n + Math.min(q, size), 0);
      for (const [arm, bounds] of Object.entries({ I0: [3, 3], I1: [known, known + U], I2: [cap, cap + U], I3: [old, old + unknownAge] })) {
        assert.deepEqual([result[arm].lower, result[arm].upper], bounds);
        assert.ok(0 <= bounds[0] && bounds[0] <= bounds[1] && bounds[1] <= 3);
      }
      assert.ok(result.I2.lower >= previous); previous = result.I2.lower;
      if (q === 1) assert.deepEqual(result.I2, result.I1);
      if (q === 3 && U === 0) assert.deepEqual(result.I2, result.I0);
      cases++;
    }
    if (unknownAge === 0) {
      const zeroAge = support(o, { sourceCap: 2, minimumAgeHours: 0 }); assert.deepEqual(zeroAge.I3, zeroAge.I0);
    }
    const base = support(o, { sourceCap: 2, minimumAgeHours: 24 }), less = structuredClone(o);
    less.lineage = less.lineage.filter(r => r.id !== 'g0'); less.incoming[0].activatedAt = null;
    const reduced = support(less, { sourceCap: 2, minimumAgeHours: 24 });
    for (const arm of ['I1', 'I2', 'I3']) {
      assert.ok(reduced[arm].lower <= base[arm].lower); assert.ok(reduced[arm].upper >= base[arm].upper);
    }
    assert.deepEqual(reduced.I0, base.I0);
  }
  assert.equal(cases, 2187);
  t.diagnostic('t2-partitions ' + JSON.stringify({ sourcePatterns: 27, agePatterns: 27, capValues: 3, arithmeticCases: cases,
    missingnessCases: 729, statisticalReplicas: 0, modelsOrRngOrGraphSearch: 0 }));
});

test('T2 invalid observations reject without getter reads, mutation, hidden truth or fake genesis inference', t => {
  const changes = [o => { o.truth = true; }, o => { delete o.subject; }, o => { o.atHour = -0; }, o => { o.difficulty = 0; },
    o => { o.incoming[0].activatedAt = 49; }, o => { o.incoming[0].proposedAt = 1; }, o => { o.incoming[0].guarantor = o.subject; },
    o => { o.incoming[1].guarantor = o.incoming[0].guarantor; }, o => { o.incoming[1].relationId = o.incoming[0].relationId; },
    o => { o.incoming[0].relationId = ''; }, o => { o.incoming[0].activatedAt = -1; }, o => { o.incoming[0].proposedAt = 0.5; },
    o => { o.incoming[0].fake = false; }, o => { delete o.incoming[0]; }, o => { o.incoming.extra = 1; },
    o => { o.lineage.push({ ...o.lineage[0] }); }, o => { o.lineage[0].parent = 'r1'; },
    o => { o.lineage[0].origin = 'independent-person'; }, o => { o.lineage.find(r => r.id === 'g0').parent = null; },
    o => { o.lineage.push({ id: 'unseen', origin: 'invitation', parent: 'unseen' }); },
    o => { o.lineage.find(r => r.id === 'g0').parent = 'g1'; o.lineage.find(r => r.id === 'g1').parent = 'g0'; },
    o => { o.lineage.find(r => r.id === 'g0').origin = 'unattributed'; }, o => { o.lineage[0].id = o.lineage[1].id; },
    o => { o.lineage[Symbol('role')] = 'fake'; }, o => { delete o.lineage[0]; }];
  for (const mutate of changes) {
    const o = structuredClone(row('distinct').observation); mutate(o); const before = Object.getOwnPropertyDescriptors(o);
    assert.throws(() => support(o, row('distinct').parameters)); assert.deepEqual(Object.getOwnPropertyDescriptors(o), before);
  }
  for (const p of [{ sourceCap: 0, minimumAgeHours: 24 }, { sourceCap: 1.5, minimumAgeHours: 24 },
    { sourceCap: 2, minimumAgeHours: -1 }, { sourceCap: 2, minimumAgeHours: Infinity }, { sourceCap: 2, minimumAgeHours: 24, K: 100 }]) {
    assert.throws(() => support(row('distinct').observation, p));
  }
  let reads = 0;
  for (const kind of ['observation', 'row', 'array']) {
    const o = structuredClone(row('distinct').observation), getter = { enumerable: true, get() { reads++; throw Error('getter must be inert'); } };
    if (kind === 'observation') Object.defineProperty(o, 'atHour', getter);
    else if (kind === 'row') Object.defineProperty(o.incoming[0], 'activatedAt', getter);
    else Object.defineProperty(o.incoming, '0', getter);
    assert.throws(() => support(o, row('distinct').parameters), TypeError);
  }
  assert.equal(reads, 0);
  const absent = structuredClone(row('unavailable').observation);
  absent.lineage.push({ id: 'loop', origin: 'invitation', parent: 'loop' });
  assert.throws(() => support(absent, row('unavailable').parameters), /cyclic/);
  assert.equal(support(row('unattributed-origin').observation, row('unattributed-origin').parameters).I1.status, 'unknown');
  assert.equal(support(row('known-empty').observation, row('known-empty').parameters).I0.status, 'fail');
  assert.equal(support(row('unavailable').observation, row('unavailable').parameters).I0.status, 'unknown');
  t.diagnostic('t2-input ' + JSON.stringify({ malformedObservationFamilies: changes.length, malformedParameters: 5, getterLayouts: 3, getterReads: reads }));
});

test('T2 native path replay projection cannot substitute for full invitation-source observation binding', () => {
  const audit = JSON.parse(readFileSync(new URL(root + 't2-support-contract-validation.json', import.meta.url))).sourceAudit.evidence;
  const inputs = structuredClone(audit.inputs), before = structuredClone(inputs);
  assert.notEqual(inputs[0][2].creator, inputs[1][2].creator);
  const projections = inputs.map(events => replayPathWitnessEvents(events, { atHour: 48, maxEvents: 5, maxIdBytes: 256 }));
  assert.deepEqual(projections[0], projections[1]); assert.notEqual(digestOf(inputs[0]), digestOf(inputs[1]));
  assert.equal(Object.hasOwn(projections[0], 'lineage'), false);
  assert.deepEqual(inputs, before);
});
