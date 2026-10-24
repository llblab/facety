import test from 'node:test';
import assert from 'node:assert/strict';
import { actObservationEnvironment, ACT_OBSERVATION_RANDOMNESS } from '../src/act-observations.mjs';
import { Random, RANDOM_GENERATOR } from '../src/random.mjs';

const kinds = ['self-id', 'invitation', 'guarantee'];
const roles = ['ordinary', 'guarantor'];
const rates = (valid = 0, invalid = 1) => Object.fromEntries(kinds.map(kind => [kind, Object.fromEntries(roles.map(role => [role, { valid, invalid }]))]));
function facts() {
  return { subjects: [{ id: 'person', genuine: true, behaviorProfile: 'good-faith' }, { id: 'strategist', genuine: true, behaviorProfile: 'adversarial' }],
    acts: ['person', 'strategist'].flatMap(subject => kinds.flatMap(kind => [false, true].map(valid => ({ id: subject + ':' + kind + ':' + valid, subject, kind, recordedAt: 12, valid })))),
  };
}
const request = (act, role = 'ordinary', observer = 'viewer') => ({ act, observer, role, atHour: 16, opportunity: 'supplied-software-opportunity' });

test('per-act validity stays distinct from genuine personhood/profile and the public capability leaks no truth fields', () => {
  const input = facts();
  const environment = actObservationEnvironment(input, { seed: 'act-schema-software', rates: rates() });
  assert.deepEqual(environment.randomness, { generator: RANDOM_GENERATOR, observations: 'act-observation-keyed-v1', trialUnit: 'observer-act-hour-opportunity', dependence: 'keyed-per-declared-opportunity' });
  assert.equal(environment.acts.length, input.acts.length);
  assert.deepEqual(Object.keys(environment).sort(), ['acts', 'observe', 'randomness']);
  for (const [index, act] of input.acts.entries()) {
    assert.deepEqual(environment.acts[index], { id: act.id, subject: act.subject, kind: act.kind, recordedAt: act.recordedAt });
    for (const role of roles) assert.deepEqual(environment.observe(request(act.id, role)), { suspicious: !act.valid });
  }
  assert.throws(() => { environment.acts[0].valid = false; }, TypeError);
  assert.throws(() => { environment.observe(request(input.acts[0].id)).genuine = true; }, TypeError);
  assert.ok(Object.isFrozen(environment) && Object.isFrozen(environment.acts) && Object.isFrozen(environment.randomness));
});

test('all kind/validity/role/observer partitions use the explicit supplied rate and named keyed-draw oracle', () => {
  const supplied = rates(0.15, 0.6);
  for (const kind of kinds) supplied[kind].guarantor = { valid: 0.3, invalid: 0.9 };
  let checked = 0;
  for (let index = 0; index < 32; index++) {
    const seed = 'act-key-software-' + index;
    const environment = actObservationEnvironment(facts(), { seed, rates: supplied });
    for (const act of facts().acts) for (const role of roles) for (const observer of ['first', 'second']) {
      const point = request(act.id, role, observer);
      const expected = new Random(seed).fork(ACT_OBSERVATION_RANDOMNESS.observations)
        .fork(JSON.stringify([point.act, point.observer, point.atHour, point.opportunity]))
        .chance(supplied[act.kind][role][act.valid ? 'valid' : 'invalid']);
      assert.equal(environment.observe(point).suspicious, expected);
      checked++;
    }
  }
  assert.equal(checked, 1536);
});

test('snapshot isolation and target-hidden-label controls hold with observer request, act validity and rates fixed', () => {
  const original = facts(), supplied = rates(0.2, 0.7);
  const environment = actObservationEnvironment(original, { seed: 'act-isolation-software', rates: supplied });
  const requests = original.acts.map(act => request(act.id));
  const before = requests.map(point => environment.observe(point));
  original.subjects[0].genuine = false;
  original.subjects[0].behaviorProfile = 'changed-intent';
  const hiddenChange = actObservationEnvironment(original, { seed: 'act-isolation-software', rates: supplied });
  assert.deepEqual(requests.map(point => hiddenChange.observe(point)), before);
  original.acts[0].valid = !original.acts[0].valid;
  original.acts[0].recordedAt = 1000;
  original.acts.push({ ...original.acts[1], id: 'future-act' });
  supplied['self-id'].ordinary.invalid = 0;
  assert.deepEqual(requests.map(point => environment.observe(point)), before);
  assert.equal(environment.acts.length, 12);
});

test('reordered/inert inspections and later appended opportunities do not consume unrelated randomness', () => {
  const options = { seed: 'act-prefix-software', rates: rates(0.2, 0.7) };
  const input = facts(), environment = actObservationEnvironment(input, options);
  const requests = input.acts.map(act => request(act.id));
  const before = requests.map(point => environment.observe(point));
  for (const point of [...requests].reverse()) {
    environment.observe({ ...point, observer: 'inert-extra-viewer' });
    environment.observe({ ...point, atHour: 100, opportunity: 'later-software-opportunity' });
  }
  assert.deepEqual(requests.map(point => environment.observe(point)), before);
  const extended = structuredClone(input);
  extended.acts.push({ ...input.acts[0], id: 'future-act', recordedAt: 200 });
  const later = actObservationEnvironment(extended, options);
  assert.deepEqual(requests.map(point => later.observe(point)), before);
  for (const point of requests) assert.deepEqual(environment.observe(point), environment.observe(point));
});

test('explicit rates admit valid-act false suspicion and invalid-act misses without granting procedural authority', () => {
  const supplied = rates();
  supplied['self-id'].ordinary = { valid: 1, invalid: 0 }; // Deliberate detector counterexample, not a calibrated policy.
  const environment = actObservationEnvironment(facts(), { seed: 'act-fallibility-software', rates: supplied });
  assert.deepEqual(environment.observe(request('person:self-id:true', 'ordinary', 'external-observer')), { suspicious: true });
  assert.deepEqual(environment.observe(request('person:self-id:false', 'ordinary', 'external-observer')), { suspicious: false });
  const response = environment.observe({ ...request('person:self-id:true'), atHour: 100 });
  assert.deepEqual(Object.keys(response), ['suspicious']);
  assert.equal(environment.challenge, undefined);
  assert.equal(environment.cancel, undefined);
  assert.equal(environment.verdict, undefined);
});

test('unsupported facts/rates/requests reject rather than inferring validity, rates, XP gates or time placement', () => {
  for (const change of [
    value => { delete value.acts[0].valid; }, value => { value.acts[0].valid = 'false'; },
    value => { value.acts[0].kind = 'other'; }, value => { value.acts[0].subject = 'absent'; },
    value => { value.acts.push({ ...value.acts[0] }); }, value => { value.subjects.push({ ...value.subjects[0] }); },
    value => { value.subjects[0].genuine = 1; }, value => { value.acts[0].recordedAt = -1; },
    value => { value.subjects[0].behaviorProfile = ''; }, value => { value.acts[0].xp = 1; },
  ]) { const value = facts(); change(value); assert.throws(() => actObservationEnvironment(value, { seed: 'software', rates: rates() })); }
  for (const change of [
    value => { value.seed = ''; }, value => { value.seed = null; }, value => { delete value.rates.guarantee; },
    value => { delete value.rates['self-id'].ordinary; }, value => { delete value.rates['self-id'].ordinary.valid; },
    value => { value.rates['self-id'].ordinary.valid = -0.1; }, value => { value.rates['self-id'].ordinary.valid = 1.1; },
    value => { value.rates['self-id'].ordinary.valid = NaN; }, value => { value.rates['self-id'].ordinary.valid = Infinity; },
    value => { value.budgets = {}; },
  ]) { const value = { seed: 'software', rates: rates() }; change(value); assert.throws(() => actObservationEnvironment(facts(), value)); }
  const environment = actObservationEnvironment(facts(), { seed: 'software', rates: rates() });
  for (const point of [
    { ...request('person:self-id:true'), act: 'missing' }, { ...request('person:self-id:true'), atHour: 11 },
    { ...request('person:self-id:true'), atHour: 1.5 }, { ...request('person:self-id:true'), atHour: Infinity },
    { ...request('person:self-id:true'), observer: '' }, { ...request('person:self-id:true'), opportunity: '' },
    { ...request('person:self-id:true'), role: 'judge' }, { ...request('person:self-id:true'), valid: true },
  ]) assert.throws(() => environment.observe(point));
});
