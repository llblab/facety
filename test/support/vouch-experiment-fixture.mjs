import { readFileSync } from 'node:fs';
import { VOUCH_ENGINE, vouchAuthority } from '../../src/vouch-experiment-config.mjs';

export const profile = JSON.parse(readFileSync(new URL('../../studies/2026-10-26-trust-topology-condition-map/wp1-composition-fixture.json', import.meta.url)));
export function config(plan = profile.settlementWitnesses[1]) {
  let atHour = 0;
  const events = [], validity = {};
  const at = hour => { atHour = hour; };
  const add = (op, fields = {}) => events.push({ atHour, authority: vouchAuthority(op), op, ...fields });
  const issue = (owner, id) => {
    add('artifact', { owner, id: 'media:' + id }); add('issue', { owner, id, artifact: 'media:' + id }); validity[id] = true;
  };
  for (const hour of [0, 24]) { at(hour); for (const owner of ['a', 'b']) issue(owner, owner + ':' + hour); }
  at(48);
  for (const owner of ['a', 'b']) for (const hour of [0, 24]) add('withdraw', { owner, id: owner + ':' + hour });
  add('commit', { owner: 'a', target: 'x', id: 'ax' }); add('commit', { owner: 'b', target: 'x', id: 'bx' });
  add('admit', { target: 'x', bonds: ['ax', 'bx'] }); add('pool'); issue('x', 'x:48'); issue('b', 'b:48');
  at(49); add('exit', { owner: 'a', id: 'ax' }); add('review', { actor: 'review-a', id: 'x:48', opportunity: 'composed-x-fixed' });
  at(72); issue('x', 'x:72'); issue('b', 'b:72'); at(96);
  for (const owner of ['x', 'b']) for (const hour of [48, 72]) add('withdraw', { owner, id: owner + ':' + hour });
  add('commit', { owner: 'x', target: 'y', id: 'xy' }); add('commit', { owner: 'b', target: 'y', id: 'by' });
  add('admit', { target: 'y', bonds: ['xy', 'by'] }); issue('y', 'y:96'); validity['y:96'] = false;
  at(97); add('review', { actor: 'review-x', id: 'y:96', opportunity: 'composed-y-fixed' }); add('hold', { id: 'ax', caseId: 'case' });
  at(120); add('refund', { id: 'ax', clear: true, clearanceId: 'a' }); add('refund', { id: 'bx', clear: true, clearanceId: 'b' });
  at(121); add('settle', { id: 'ax', caseId: 'case', upheld: plan.upheld, burn: plan.burn, transfers: structuredClone(plan.transfers) });
  add('refund', { id: 'ax', clear: true, clearanceId: 'a' });
  at(168); for (const id of ['xy', 'by']) add('refund', { id, clear: true, clearanceId: id });
  return { engine: VOUCH_ENGINE, reference: profile.reference, days: 8, seed: 'wp1-native-backend-software-only', includeState: true,
    maxActions: 100, maxSubjects: 10, successCriterion: 'unbound',
    model: structuredClone({ genesis: profile.genesis, policy: profile.policy, ablations: profile.ablations, invitationLimit: null,
      vouching: profile.vouching, vouchAdmission: profile.vouchAdmission }), work: structuredClone(profile.reviewAllocation.options),
    environment: { subjects: ['a', 'b', 'x', 'y'].map(id => ({ id, genuine: true, behaviorProfile: 'software-fact-only' })),
      validity, rates: structuredClone(profile.observationEnvironment.rates) }, events };
}
