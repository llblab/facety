// Owns: Post-data author projections/key-implied witnesses on retained blocks; excludes new worlds and per-look replay.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Random } from '../../src/random.mjs';
import { digestOf } from '../../src/provenance.mjs';
import { analyzeBlocks } from './analyze.mjs';
import { measure } from './contract.mjs';

const KERNELS = {
  'src/random.mjs': 'bb73976902a0e4954b61e7f09c1ac01d8187ec9d092f0ebd2e181f0257c0f7d1',
  'src/identity-observations.mjs': 'fa900922d2490e01bc8b4618ee9df57e5850be8b893ebd11d2c3d6da2b8dcef0',
};
const DESIGN = JSON.parse(readFileSync(new URL('design.json', import.meta.url)));
export function auditBlocks(blocks) {
  for (const [path, expected] of Object.entries(KERNELS)) if (createHash('sha256').update(readFileSync(new URL('../../' + path, import.meta.url))).digest('hex') !== expected) throw new Error('shared-evidence audit kernel changed; no implicit drift override');
  const report = analyzeBlocks(blocks);
  const sorted = [...blocks].sort((a, b) => a.block - b.block);
  const rows = sorted.flatMap(block => block.rows);
  const invariants = [];
  for (const block of sorted) for (const population of DESIGN.populations) {
    const controls = block.rows.filter(row => row.population === population.id && row.arm === 'observe-only');
    invariants.push({ seed: controls[0].seed, population: population.id, cases: controls.length, sameNativeState: new Set(controls.map(row => digestOf(row.state))).size === 1 });
  }
  const cells = report.cells.map(cell => {
    const cases = rows.filter(row => row.population === cell.population && row.calendar === cell.calendar && row.evidence === cell.evidence && row.arm === cell.arm);
    const falseIds = cases.map(row => new Set(row.state.truth.filter(identity => !identity.genuine).map(identity => identity.id)));
    return { population: cell.population, calendar: cell.calendar, evidence: cell.evidence, arm: cell.arm,
      grossReviewResponseWork: cases.map(row => ['inspect', 'verify', 'respond'].reduce((sum, action) => sum + row.effort.cohorts.honest.byAction[action].effort, 0)),
      negativeInspections: cases.map(row => row.process.counters.inspections - row.process.counters.positiveSignals),
      falseSelfIdActs: cases.map((row, index) => row.state.selfIds.filter(act => falseIds[index].has(act.subject)).length),
      falseUnspentActs: cases.map((row, index) => row.state.selfIds.filter(act => falseIds[index].has(act.subject) && act.status === 'unspent').length),
      cancellationAges: cases.map(row => row.state.events.filter(event => event.type === 'invitation-cancelled').map(event => event.at - row.state.invitations.find(invitation => invitation.id === event.invitation).createdAt)),
      inspectionDenied: cases.map(row => row.process.counters.inspectionDenied), cancelBudgetDenied: cases.map(row => row.process.counters.cancelBudgetDenied),
      pending: cases.map(row => row.state.invitations.filter(invitation => invitation.status === 'open').map(invitation => ({ id: invitation.id, createdAt: invitation.createdAt, deadline: invitation.createdAt + DESIGN.base.policy.invitationFreezeHours }))),
    };
  });
  const sharedFalseAdmissions = [];
  for (const row of rows.filter(row => row.population === 'fabricated-descendants' && row.evidence === 'shared-target' && row.arm === 'veto')) {
    const known = new Map(row.state.truth.map(identity => [identity.id, identity]));
    for (const invitation of row.state.invitations.filter(invitation => invitation.status === 'accepted' && known.get(invitation.target)?.genuine === false)) {
      const key = ['invitation-shared-target-v1', invitation.target];
      sharedFalseAdmissions.push({ seed: row.seed, calendar: row.calendar, invitation, creatorIsInitialSubject: row.state.subjects.find(subject => subject.id === invitation.creator).genesis,
        key, keyImpliedSuspicious: new Random(row.seed).fork('observations').fork(JSON.stringify(key)).chance(DESIGN.base.sensitivity),
        receiptBoundary: 'Latent signal under the retained law, not a journaled per-invitation paid-look receipt or full support/timing replay.',
      });
    }
  }
  const genuineWitnesses = [];
  const genuine = DESIGN.populations.find(population => population.descendantsGenuine);
  for (const row of rows.filter(row => row.population === genuine.id && row.arm === 'veto')) {
    const control = rows.find(other => other.seed === row.seed && other.population === row.population && other.calendar === row.calendar && other.evidence === row.evidence && other.arm === 'observe-only');
    for (const event of row.state.events.filter(event => event.type === 'invitation-cancelled')) {
      const invitation = row.state.invitations.find(invitation => invitation.id === event.invitation);
      const controlInvitation = control.state.invitations.find(other => other.id === invitation.id);
      const active = measure(row, genuine), baseline = measure(control, genuine);
      genuineWitnesses.push({ seed: row.seed, calendar: row.calendar, evidence: row.evidence, event, invitation, controlInvitation,
        sameCreation: ['id', 'creator', 'target', 'createdAt'].every(key => invitation[key] === controlInvitation?.[key]),
        genuineAcceptedActive: active.genuineAcceptedDescendants, genuineAcceptedControl: baseline.genuineAcceptedDescendants,
        genuineXpActive: active.genuineXp, genuineXpControl: baseline.genuineXp,
        initialXpActive: row.state.subjects.filter(subject => subject.genesis).reduce((sum, subject) => sum + subject.xp, 0),
        initialXpControl: control.state.subjects.filter(subject => subject.genesis).reduce((sum, subject) => sum + subject.xp, 0),
        ledgerDeltas: Object.fromEntries(Object.keys(row.ledger).map(key => [key, row.ledger[key] - control.ledger[key]])),
        sanctionsActive: row.system.sanctions,
      });
    }
  }
  return { schema: 'facety-shared-evidence-postdata-audit/v1', level: 'postdata-author-diagnostic-not-independent-review', kernels: KERNELS,
    cases: report.cases, completeEventPrefixChecks: report.vetoEffects.reduce((sum, effect) => sum + effect.completeEventPrefixChecks, 0),
    censoredPrefixChecksSkipped: report.vetoEffects.reduce((sum, effect) => sum + effect.censoredPrefixChecksSkipped, 0),
    observeOnlyInvariants: invariants, cells, sharedFalseAdmissions, genuineWitnesses,
    interpretation: [
      'No experiment/model call. This post-data projection is separate from the unchanged pre-data method; no confirmation or independent acceptance.',
      'Key-implied persistent signals do not reconstruct actual per-invitation inspections/support. Their timing and attribution remain a separate offline follow-up.',
      'Seed/calendar records overlap and can reuse target keys; six recorded admissions are not six independent population trials. Different evidence laws need not deliver the same bits.',
      'False Self-ID acts/unspent rights stay visible even when converted liquidity/terminal XP are zero. Whole-trajectory minting/burn/XP/work deltas are not marginal prices, formal fines, recovery or D42 compliance.',
      'Genuine control harm concerns declared identity class, not guilt by coordination or an illegal veto. Later IDs/graphs are not person-level counterfactual matches; net recruitment losses can exceed direct cancellations.',
      'Zero sampled shared-mode genuine cancellations is not safety evidence or universal superiority. Human/private utility, useful growth and calibrated oracle covariance remain unknown.',
    ],
  };
}
