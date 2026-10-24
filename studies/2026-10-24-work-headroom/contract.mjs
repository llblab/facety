// Owns: Fixed work-headroom inputs, bootstrap/denial retention and resource checks; excludes simulation.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { digestOf } from '../../src/provenance.mjs';
import { caseConfig as referenceConfig, projectRun as referenceProjection, measure as referenceMeasure, FIELDS as REFERENCE_FIELDS } from '../2026-10-24-attended-comparison/contract.mjs';
export { validateRow } from '../2026-10-24-attended-comparison/analyze.mjs';

const ROOT = new URL('../../', import.meta.url);
export const METHOD_FILES = [
  'studies/2026-10-24-work-headroom/run.mjs', 'studies/2026-10-24-work-headroom/contract.mjs',
  'studies/2026-10-24-work-headroom/analyze.mjs', 'studies/2026-10-24-work-headroom/design.json',
  'studies/2026-10-24-attended-comparison/contract.mjs', 'studies/2026-10-24-attended-comparison/analyze.mjs', 'studies/2026-10-24-attended-comparison/design.json',
];
export const FIELDS = [...REFERENCE_FIELDS, 'defenderDenied', 'coalitionDenied', 'reviewInspectionDenied', 'reviewResponseDenied', 'falseSelfIdActs', 'falseUnspentActs'];
export function methodDigests() {
  return Object.fromEntries(METHOD_FILES.map(file => [file, createHash('sha256').update(readFileSync(new URL(file, ROOT))).digest('hex')]));
}
export function caseConfig(design, seed, population, resource, evidence, arm) {
  return { ...referenceConfig(design, seed, population, { offset: null }, design.timing, arm), invitationEvidence: evidence, budgets: { ...design.base.budgets, honest: resource.cap } };
}
export function bootstrapSummary(run) {
  const initial = run.history.find(point => point.stage === 'initial');
  return initial ? { atHour: initial.atHour, stage: initial.stage, subjects: initial.subjects, guaranteeEdges: initial.graph.edges,
    totalXp: initial.xp.total, xpGini: initial.xp.gini,
    cohorts: Object.fromEntries(['honest', 'attackers'].map(cohort => [cohort, initial.cohorts[cohort].sincePrevious])),
  } : null;
}
export function projectRun(run, population, resource, evidence, arm) {
  return { ...referenceProjection(run, population, { id: 'all-ticks' }, run.config.invitationReviewTiming, arm), resource: resource.id, evidence,
    bootstrap: bootstrapSummary(run),
    denialTrace: run.history.map(point => ({ atHour: point.atHour, stage: point.stage,
      cohorts: Object.fromEntries(['honest', 'attackers'].map(cohort => [cohort, {
        cumulativeEffort: point.cohorts[cohort].cumulativeEffort, deniedDelta: point.cohorts[cohort].sincePrevious.denied,
        byActionDeniedDeltas: Object.fromEntries(Object.entries(point.cohorts[cohort].byAction).map(([action, counts]) => [action, counts.denied])),
      }])),
    })),
  };
}
export function measure(row, population) {
  const falseIds = new Set(row.state.truth.filter(identity => !identity.genuine).map(identity => identity.id));
  return { ...referenceMeasure(row, population), defenderDenied: row.effort.cohorts.honest.denied, coalitionDenied: row.effort.cohorts.attackers.denied,
    reviewInspectionDenied: row.process.counters.inspectionDenied, reviewResponseDenied: row.process.counters.cancelBudgetDenied,
    falseSelfIdActs: row.state.selfIds.filter(act => falseIds.has(act.subject)).length,
    falseUnspentActs: row.state.selfIds.filter(act => falseIds.has(act.subject) && act.status === 'unspent').length,
  };
}
const COUNT_FIELDS = ['attempts', 'accepted', 'rejected', 'denied', 'effort'];
function keys(value, expected) { return value && Object.keys(value).sort().join() === [...expected].sort().join(); }
function validCounts(row) { return row && COUNT_FIELDS.every(key => Number.isSafeInteger(row[key]) && row[key] >= 0) && row.attempts === row.accepted + row.rejected; }
export function validateWork(row, config, design) {
  if (digestOf(row.bootstrap) !== digestOf(design.bootstrap)) throw new Error('work-headroom requires identical funded bootstrap');
  const actions = Object.keys(config.weights);
  if (actions.some(action => config.weights[action] !== 1) || digestOf(row.effort.weights) !== digestOf(config.weights) || !keys(row.effort.cohorts, ['honest', 'attackers']) || row.effort.maxActions !== config.maxActions || !Number.isSafeInteger(row.effort.calls) || row.effort.calls < 0 || row.effort.calls > config.maxActions) throw new Error('work-headroom weights/calls mismatch');
  let calls = 0;
  for (const cohort of ['honest', 'attackers']) {
    const value = row.effort.cohorts[cohort];
    if (!validCounts(value) || value.budget !== config.budgets[cohort] || value.remaining !== value.budget - value.effort || value.remaining < 0 || (value.denied > 0 && value.remaining !== 0) || !keys(value.byAction, actions) || !keys(value.byPhase, ['setup', 'maintenance'])) throw new Error('work-headroom cohort resource mismatch');
    for (const [action, counts] of Object.entries(value.byAction)) if (!validCounts(counts) || counts.effort !== counts.attempts) throw new Error('work-headroom action accounting mismatch: ' + action);
    for (const dimension of ['byAction', 'byPhase']) {
      if (Object.values(value[dimension]).some(counts => !validCounts(counts)) || COUNT_FIELDS.some(key => Object.values(value[dimension]).reduce((sum, counts) => sum + counts[key], 0) !== value[key])) throw new Error('work-headroom effort dimensions mismatch');
    }
    if (digestOf(value.byPhase.setup) !== digestOf(design.bootstrap.cohorts[cohort])) throw new Error('work-headroom setup effort mismatch');
    calls += value.attempts + value.denied;
  }
  if (calls !== row.effort.calls) throw new Error('work-headroom calls conservation mismatch');
  const c = row.process.counters, action = row.effort.cohorts.honest.byAction;
  if (action.inspect.attempts !== c.inspections || action.inspect.accepted !== c.inspections || action.inspect.rejected || action.inspect.denied !== c.inspectionDenied || action.verify.attempts || action.verify.denied || action.respond.denied !== c.cancelBudgetDenied || (!row.outcome.censored && (action.respond.accepted !== c.cancelled || action.respond.rejected !== c.cancelRejected || action.respond.attempts + action.respond.denied !== c.cancelCalls))) throw new Error('work-headroom invitation work/stage mismatch');
  if (!Array.isArray(row.denialTrace) || !row.denialTrace.length || row.denialTrace[0].stage !== 'initial' || row.denialTrace[0].atHour !== 0) throw new Error('work-headroom missing denial trace');
  const expected = [{ atHour: 0, stage: 'initial' }];
  for (let hour = 0; hour < config.days * 24; hour += 4) {
    if (hour > 0 && hour % 24 === 0) expected.push({ atHour: hour, stage: 'day-end' });
    expected.push({ atHour: hour, stage: 'tick-end' });
  }
  if (config.days) expected.push({ atHour: config.days * 24, stage: 'day-end' });
  expected.push({ atHour: config.days * 24, stage: 'horizon' });
  const observed = row.denialTrace.map(({ atHour, stage }) => ({ atHour, stage }));
  const prefix = row.outcome.censored ? observed.slice(0, -1) : observed;
  if (digestOf(prefix) !== digestOf(row.outcome.censored ? expected.slice(0, prefix.length) : expected) || (row.outcome.censored && row.outcome.elapsedHours !== expected[prefix.length]?.atHour)) throw new Error('work-headroom missing/reordered sample trace');
  const allowed = new Set(['initial', 'tick-end', 'day-end', 'horizon', 'censored']);
  const previousEffort = { honest: 0, attackers: 0 };
  const denied = Object.fromEntries(['honest', 'attackers'].map(cohort => [cohort, Object.fromEntries(actions.map(action => [action, 0]))]));
  let dailyBase = structuredClone(denied);
  let previousHour = 0;
  for (const point of row.denialTrace) {
    if (!allowed.has(point.stage) || !Number.isSafeInteger(point.atHour) || point.atHour < previousHour || point.atHour > row.outcome.elapsedHours || point.atHour % 4) throw new Error('work-headroom trace clock mismatch');
    previousHour = point.atHour;
    for (const cohort of ['honest', 'attackers']) {
      const value = point.cohorts[cohort];
      if (!Number.isSafeInteger(value.cumulativeEffort) || value.cumulativeEffort < previousEffort[cohort] || value.cumulativeEffort > config.budgets[cohort] || !Number.isSafeInteger(value.deniedDelta) || value.deniedDelta < 0 || !keys(value.byActionDeniedDeltas, actions) || Object.values(value.byActionDeniedDeltas).some(n => !Number.isSafeInteger(n) || n < 0) || Object.values(value.byActionDeniedDeltas).reduce((sum, n) => sum + n, 0) !== value.deniedDelta) throw new Error('work-headroom trace resource mismatch');
      if (point.stage === 'initial' && (value.cumulativeEffort !== design.bootstrap.cohorts[cohort].effort || value.deniedDelta !== 0)) throw new Error('work-headroom trace/bootstrap mismatch');
      const base = point.stage === 'day-end' ? dailyBase[cohort] : denied[cohort];
      const next = Object.fromEntries(actions.map(action => [action, base[action] + value.byActionDeniedDeltas[action]]));
      if (actions.some(action => next[action] < denied[cohort][action])) throw new Error('work-headroom overlapping trace counters regress');
      denied[cohort] = next;
      previousEffort[cohort] = value.cumulativeEffort;
    }
    if (point.stage === 'initial' || point.stage === 'day-end') dailyBase = structuredClone(denied);
  }
  for (const cohort of ['honest', 'attackers']) if (Object.values(denied[cohort]).reduce((sum, n) => sum + n, 0) !== row.effort.cohorts[cohort].denied || actions.some(action => denied[cohort][action] !== row.effort.cohorts[cohort].byAction[action].denied)) throw new Error('work-headroom terminal denials/trace mismatch');
  const last = row.denialTrace.at(-1);
  if (last.stage !== (row.outcome.censored ? 'censored' : 'horizon') || last.atHour !== row.outcome.elapsedHours || ['honest', 'attackers'].some(cohort => last.cohorts[cohort].cumulativeEffort !== row.effort.cohorts[cohort].effort)) throw new Error('work-headroom trace terminal mismatch');
}
