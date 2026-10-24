// Owns: Post-data author checks/witness projections on retained blocks, not new worlds or inference.
import { digestOf } from '../../src/provenance.mjs';
import { analyzeBlocks } from './analyze.mjs';

export function auditBlocks(blocks) {
  const report = analyzeBlocks(blocks);
  const sorted = [...blocks].sort((a, b) => a.block - b.block);
  const rows = sorted.flatMap(block => block.rows);
  const invariants = [];
  for (const block of sorted) for (const population of ['fabricated-descendants', 'genuine-coalition-descendants']) {
    const controls = block.rows.filter(row => row.population === population && row.arm === 'observe-only');
    invariants.push({ seed: controls[0].seed, population, cases: controls.length, sameNativeState: new Set(controls.map(row => digestOf(row.state))).size === 1 });
  }
  const cells = report.cells.map(cell => {
    const cases = rows.filter(row => row.population === cell.population && row.calendar === cell.calendar && row.timing === cell.timing && row.arm === cell.arm);
    return { population: cell.population, calendar: cell.calendar, timing: cell.timing, arm: cell.arm,
      grossReviewResponseWork: cases.map(row => ['inspect', 'verify', 'respond'].reduce((sum, action) => sum + row.effort.cohorts.honest.byAction[action].effort, 0)),
      cancelledAges: cases.map(row => row.state.events.filter(event => event.type === 'invitation-cancelled').map(event => event.at - row.state.invitations.find(invitation => invitation.id === event.invitation).createdAt)),
      inspectionDenied: cases.map(row => row.process.counters.inspectionDenied), cancelBudgetDenied: cases.map(row => row.process.counters.cancelBudgetDenied),
      openInvitations: cases.map(row => row.state.invitations.filter(invitation => invitation.status === 'open').map(invitation => ({ id: invitation.id, createdAt: invitation.createdAt, deadline: invitation.createdAt + 24 }))),
    };
  });
  const genuineWitnesses = [];
  for (const row of rows.filter(row => row.population === 'genuine-coalition-descendants' && row.arm === 'veto')) {
    const control = rows.find(other => other.seed === row.seed && other.population === row.population && other.calendar === row.calendar && other.timing === row.timing && other.arm === 'observe-only');
    for (const event of row.state.events.filter(event => event.type === 'invitation-cancelled')) {
      const invitation = row.state.invitations.find(invitation => invitation.id === event.invitation);
      const shared = row.state.subjects.map(subject => ({ subject: subject.id, activeXp: subject.xp, controlXp: control.state.subjects.find(other => other.id === subject.id)?.xp ?? null })).filter(item => item.controlXp !== null && item.activeXp !== item.controlXp);
      genuineWitnesses.push({ seed: row.seed, calendar: row.calendar, timing: row.timing, event, invitation,
        controlInvitation: control.state.invitations.find(other => other.id === invitation.id) ?? null,
        sourceAct: row.state.selfIds.find(act => act.id === invitation.sourceSelfId), controlSourceAct: control.state.selfIds.find(act => act.id === invitation.sourceSelfId),
        sharedSubjectXp: shared.map(item => ({ ...item, delta: item.activeXp - item.controlXp })),
        controlOnlySubjects: control.state.subjects.filter(subject => !row.state.subjects.some(other => other.id === subject.id)),
        ledgerActive: row.ledger, ledgerControl: control.ledger,
        ledgerDeltas: Object.fromEntries(Object.keys(row.ledger).map(key => [key, row.ledger[key] - control.ledger[key]])),
        sanctionsActive: row.system.sanctions, sanctionsControl: control.system.sanctions,
      });
    }
  }
  return { schema: 'facety-attended-comparison-postdata-audit/v1', level: 'postdata-author-diagnostic-not-independent-review',
    cases: report.cases, completeEventPrefixChecks: report.vetoEffects.reduce((sum, effect) => sum + effect.completeEventPrefixChecks, 0),
    censoredPrefixChecksSkipped: report.vetoEffects.reduce((sum, effect) => sum + effect.censoredPrefixChecksSkipped, 0),
    observeOnlyInvariants: invariants, cells, genuineWitnesses,
    interpretation: [
      'No Model/capture call. Native-state invariance and witness projections are post-data author checks, not registered confirmation or independent review.',
      'Gross review/response work uses actual inspect/verify/respond effort; ordinary inspection is disabled and exit/verification are off by design. Total work also contains bootstrap and changed downstream actions.',
      'Genuine invitation targets are declared by the supplied real-cartel control; coordination is not guilt or evidence of other misconduct.',
      'Shared-account XP differences are terminal recorded deltas, not a full chronological credit replay or D42 compliance. xpCredited is not a current-credit receipt.',
      'Lower supply/minting is not extra burn or recovery. Open invitation lifetimes extend beyond the declared run; zero sampled harm does not establish safety.',
    ],
  };
}
