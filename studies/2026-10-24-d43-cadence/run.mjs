// Owns: One fixed exploratory cadence diagnostic, not historical replay or protocol migration.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runExperiment, experimentConfig, RANDOMNESS_POLICY } from '../../src/experiment.mjs';
import { SUBDAY_RANDOMNESS } from '../../src/activity-schedule.mjs';
import { implementationDigest, digestOf } from '../../src/provenance.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const IMPLEMENTATION = '30a6d69e3e7b384b48dfbda4dece7af7d6077f5948a1e6f135ab00bb21431379';
const SEEDS = ['d43-cadence-check-01', 'd43-cadence-check-02', 'd43-cadence-check-03', 'd43-cadence-check-04'];

export function studyDesign() {
  return {
    schema: 'facety-d43-cadence-design/v1', level: 'exploratory-diagnostic-not-confirmation',
    source: { baseCheckpoint: 'ddee5af', implementation: IMPLEMENTATION, node: 'v26.8.1' },
    randomness: { 24: RANDOMNESS_POLICY, 6: SUBDAY_RANDOMNESS, 4: SUBDAY_RANDOMNESS },
    seeds: [...SEEDS], steps: [24, 6, 4], arms: [
      { id: 'unobserved', review: 0, vetoDisabled: false },
      { id: 'observe-only', review: 1, vetoDisabled: true },
      { id: 'veto', review: 1, vetoDisabled: false },
    ],
    base: experimentConfig({ seed: SEEDS[0], scenario: 'sybil-cone', initialSize: 12, initialTopology: 'clique', attackerShare: 0.25, days: 7, maxSubjects: 200, maxActions: 100000, includeState: true }),
    interpretation: [
      'Four fixed seed labels, not a representative seed sample or calibrated probability estimate.',
      'Within each cadence, unobserved removes review; observe-only pays for the same evidence/attempt process but suppresses an otherwise-authorized veto by an explicit counterfactual ablation; veto enables its effect. Prefix controls are matched, not equal expenditure after state divergence.',
      '24 versus 4/6 compares complete scheduler references: phase placement, RNG namespace, known-deadline settlement and sampling differ; not a pure step-size causal effect.',
      '4/6 share daily quota draws but not necessarily actor times, target sets or realized valid actions.',
      'Initial trust, illustrative cohort rates/weights and always-available baseline profiles are supplied. No voluntary retention or activity distribution is estimated.',
      'Native terminal XP/indefinite unspent veto, raw guarantee/active-count topology, fixed Council and current-link liability remain legacy. No D42/D33/D34 compliance.',
      'No new court, valuation, usefulness, application externality or full attack-acquisition cost is supplied. Debt is not burn or collection.',
      'The source evaluator classifies cancelled targets from the declared sybil-cone creation script and creator cohort; the defense never receives this classification.',
    ],
  };
}

export function extractRun(run) {
  const truth = new Map(run.state.truth.map(row => [row.id, row]));
  const falseIds = new Set(run.state.truth.filter(row => !row.genuine).map(row => row.id));
  const invitations = run.state.invitations;
  const cancellations = invitations ? run.state.events.filter(row => row.type === 'invitation-cancelled').map(event => {
    const invitation = invitations.find(row => row.id === event.invitation);
    return { invitation: event.invitation, createdAt: invitation.createdAt, cancelledAt: event.at, falseTarget: truth.get(invitation.creator).cohort === 'attackers' };
  }) : null;
  if (cancellations && cancellations.length !== run.system.trust.invitationsCancelled) throw new Error('invitation cancellation accounting mismatch');
  const cancelledFalse = cancellations ? cancellations.filter(row => row.falseTarget).length : run.system.trust.invitationsCancelled === 0 ? 0 : null;
  const cancelledGenuine = cancellations ? cancellations.filter(row => !row.falseTarget).length : run.system.trust.invitationsCancelled === 0 ? 0 : null;
  return {
    seed: run.config.seed, stepHours: run.config.stepHours, review: run.config.activity.honest.review, vetoDisabled: run.config.ablations.disableInvitationVeto, configDigest: digestOf(run.config),
    outcome: run.outcome, randomness: run.randomness,
    metrics: {
      subjects: run.population.finalSubjects, operators: run.population.humanOperators,
      falseAccepted: run.system.falseAcceptedSubjects, falseActs: run.state.selfIds.filter(row => falseIds.has(row.subject)).length,
      falseConverted: run.impact.falseConversions, falseLiquid: run.system.falseLiquidFacy,
      falseXp: run.state.subjects.filter(row => falseIds.has(row.id)).reduce((sum, row) => sum + row.xp, 0),
      coalitionXpShare: run.history.at(-1).xp.attackerShare,
      falseActsVetoed: run.impact.falseEmissionsCancelled, genuineActsVetoed: run.impact.honestEmissionsCancelled,
      invitationsCancelled: run.system.trust.invitationsCancelled, cancelledFalse, cancelledGenuine,
      attackerEffort: run.effort.cohorts.attackers.effort, defenderEffort: run.effort.cohorts.honest.effort,
      selfIdInspections: run.observations.inspections,
    },
    reviewProcess: run.invitationReview ? { counters: run.invitationReview.counters, evaluator: run.invitationReview.evaluator } : null,
    ledger: run.metrics.ledger, money: run.money, sanctions: run.system.sanctions,
    daily: run.history.filter(row => row.stage === 'day-end').map(row => ({ atHour: row.atHour, subjects: row.subjects, falseShare: row.falseShare, totalXp: row.xp.total, coalitionXpShare: row.xp.attackerShare, falseConverted: row.falseConversions, cancelled: row.trust.invitationsCancelled, attackerEffort: row.attackerEffort, defenderEffort: row.defenderEffort })),
    cancellations,
  };
}

export function runBlock(index) {
  if (!Number.isInteger(index) || index < 0 || index >= SEEDS.length) throw new Error('one fixed block index 0..3 is required');
  const design = studyDesign();
  if (digestOf(design) !== digestOf(JSON.parse(readFileSync(new URL('./design.json', import.meta.url), 'utf8')))) throw new Error('D43/D44 design changed; no implicit new cohort');
  if (implementationDigest().digest !== IMPLEMENTATION || process.version !== design.source.node) throw new Error('D43 cadence diagnostic requires its original source/runtime; no drift override');
  const relative = 'studies/2026-10-24-d43-cadence/run.mjs';
  const current = readFileSync(new URL(import.meta.url), 'utf8');
  if (execFileSync('git', ['show', 'HEAD:' + relative], { cwd: ROOT, encoding: 'utf8' }) !== current) throw new Error('D43 runner must be committed unchanged before execution');
  const policyCatalog = {};
  const runs = [];
  for (const stepHours of design.steps) for (const arm of design.arms) {
    const run = runExperiment({ ...design.base, seed: SEEDS[index], stepHours, ablations: { ...design.base.ablations, disableInvitationVeto: arm.vetoDisabled }, activity: { ...design.base.activity, honest: { ...design.base.activity.honest, review: arm.review } } });
    policyCatalog[stepHours === 24 ? 'legacy' : 'subday'] = { assumptionsDigest: digestOf(run.assumptions), randomness: run.randomness };
    runs.push({ arm: arm.id, ...extractRun(run) });
  }
  const codeCommit = execFileSync('git', ['log', '-1', '--format=%H', '--', 'src'], { cwd: ROOT, encoding: 'utf8' }).trim();
  return { schema: 'facety-d43-cadence-block/v1', block: index, codeCommit, design, designDigest: digestOf(design), runnerDigest: digestOf(current), policyCatalog, runs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || !/^[0-3]$/.test(process.argv[2])) throw new Error('D43 cadence accepts only one fixed block index 0..3; no scenario/output overrides');
  console.log(JSON.stringify(runBlock(Number(process.argv[2]))));
}
