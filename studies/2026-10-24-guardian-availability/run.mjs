// Owns: One fixed availability-control cohort; excludes population calibration and historical replay.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { experimentConfig, runExperiment } from '../../src/experiment.mjs';
import { SUBDAY_RANDOMNESS } from '../../src/activity-schedule.mjs';
import { digestOf, implementationDigest } from '../../src/provenance.mjs';

const SOURCE = '30a6d69e3e7b384b48dfbda4dece7af7d6077f5948a1e6f135ab00bb21431379';
const NODE = 'v26.8.1';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PATH = 'studies/2026-10-24-guardian-availability/run.mjs';

export function studyDesign() {
  return {
    schema: 'facety-guardian-availability-design/v1', level: 'exploratory-not-confirmation',
    source: { baseCheckpoint: '60b0cc6', implementation: SOURCE, node: NODE }, randomness: SUBDAY_RANDOMNESS,
    seeds: ['d44-availability-01', 'd44-availability-02', 'd44-availability-03', 'd44-availability-04'],
    contexts: [{ id: 'all-ticks', offset: null }, { id: 'one-tick-phase-0', offset: 0 }, { id: 'one-tick-phase-4', offset: 1 }],
    arms: [{ id: 'observe-only', disabled: true }, { id: 'veto', disabled: false }],
    base: experimentConfig({ stepHours: 4, initialSize: 12, initialTopology: 'clique', attackerShare: 0.25, days: 7, maxSubjects: 200, maxActions: 100000, includeState: true, activity: { honest: { invite: 0, inspect: 0, review: 1 } } }),
    interpretation: [
      'Exactly four new fixed labels and 24 cases; descriptive paired outcomes, not representative probabilities or mechanism confirmation.',
      'Only attention availability changes across contexts. Each initial subject i is available at one four-hour tick/day: phase 4*((i+offset)%6). Allocation uses declared IDs, not evaluator roles; the second phase rotates every calendar by four hours.',
      'Transaction hours, Self-ID phase, daily quotas, evidence quality and whole-run budgets stay fixed. Unavailable quota slots expire without catch-up; this tests that encoded intersection rule, not an optimal human rescheduling policy.',
      'Honest invitations and general Self-ID inspections are disabled to isolate invitation review and keep all honest guarantors in the initial calendar-covered pool. Genuine invitation/act harm and useful growth are therefore not evaluated, not demonstrated safe.',
      'New descendants are fabricated coalition subjects with review zero under this sybil-cone script. No measured human activity distribution, private utility or endogenous vigilance is supplied.',
      'Observe-only uses an explicit veto-effect counterfactual; signal/work prefixes match before cancellation divergence, not after differing populations and workloads.',
      'Dense trusted genesis, illustrative work weights, independent noisy evidence, unstrained budgets, raw topology and legacy terminal XP/indefinite unspent veto remain supplied references, not D33/D34/D42 compliance.',
      'F48 is retained unchanged and is not re-executed. This new matched baseline belongs only to this availability intervention and new labels.',
    ],
  };
}

export function caseConfig(design, seed, context, arm) {
  const actorProfiles = context.offset === null ? [] : Array.from({ length: design.base.initialSize }, (_, index) => ({
    subject: 'n' + index, attentionHours: Array.from({ length: design.base.days }, (_, day) => day * 24 + 4 * ((index + context.offset) % 6)),
  }));
  return experimentConfig({ ...design.base, seed, actorProfiles, ablations: { ...design.base.ablations, disableInvitationVeto: arm.disabled } });
}

export function runBlock(index) {
  if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('fixed block index 0..3 required');
  if (implementationDigest().digest !== SOURCE || process.version !== NODE) throw new Error('availability study requires its original source/runtime; no override');
  const design = studyDesign();
  if (digestOf(design) !== digestOf(JSON.parse(readFileSync(new URL('./design.json', import.meta.url), 'utf8')))) throw new Error('availability design changed');
  const runner = readFileSync(new URL(import.meta.url), 'utf8');
  if (execFileSync('git', ['show', 'HEAD:' + PATH], { cwd: ROOT, encoding: 'utf8' }) !== runner) throw new Error('availability runner must be committed unchanged before capture');
  const captureCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const binding = { block: index, designDigest: digestOf(design), runnerDigest: digestOf(runner), captureCommit };
  writeFileSync(new URL('./attempt-' + index + '.json', import.meta.url), JSON.stringify(binding) + '\n', { flag: 'wx' });
  const rows = [];
  for (const context of design.contexts) for (const arm of design.arms) {
    const config = caseConfig(design, design.seeds[index], context, arm);
    const run = runExperiment(config);
    const falseIds = new Set(run.state.truth.filter(subject => !subject.genuine).map(subject => subject.id));
    rows.push({
      seed: config.seed, context: context.id, arm: arm.id, configDigest: digestOf(config), randomness: run.randomness,
      outcome: run.outcome, process: run.invitationReview, ledger: run.metrics.ledger, money: run.money, sanctions: run.system.sanctions, state: run.state,
      metrics: {
        falseAccepted: run.system.falseAcceptedSubjects, falseConverted: run.impact.falseConversions,
        falseActs: run.state.selfIds.filter(act => falseIds.has(act.subject)).length,
        falseXp: run.state.subjects.filter(subject => falseIds.has(subject.id)).reduce((sum, subject) => sum + subject.xp, 0),
        defenderEffort: run.effort.cohorts.honest.effort, attackerEffort: run.effort.cohorts.attackers.effort,
        cancelled: run.system.trust.invitationsCancelled,
      },
      daily: run.history.filter(row => row.stage === 'day-end').map(row => ({ atHour: row.atHour, subjects: row.subjects, falseShare: row.falseShare, falseConverted: row.falseConversions })),
      cancellations: run.state.events.filter(event => event.type === 'invitation-cancelled').map(event => ({ atHour: event.at, actor: event.guarantor, invitation: event.invitation, createdAt: run.state.invitations.find(invitation => invitation.id === event.invitation).createdAt })),
    });
  }
  return { schema: 'facety-guardian-availability-block/v1', ...binding, source: design.source, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || !/^[0-3]$/.test(process.argv[2])) throw new Error('availability study accepts one fixed block index, no policy/scenario/output overrides');
  const index = Number(process.argv[2]);
  const block = runBlock(index);
  const output = new URL('./block-' + index + '.json', import.meta.url);
  const bytes = JSON.stringify(block) + '\n';
  writeFileSync(output, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ output: fileURLToPath(output), cases: block.rows.length, bytes: Buffer.byteLength(bytes) }));
}
