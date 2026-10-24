// Owns: Post-data author projections of retained F54 work/admission/harm records; excludes simulation and causal replay.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { digestOf } from '../../src/provenance.mjs';
import { analyzeBlocks } from './analyze.mjs';

export function auditBlocks(blocks) {
  const analysis = analyzeBlocks(blocks);
  const rows = [...blocks].sort((a, b) => a.block - b.block).flatMap(block => block.rows);
  const cases = rows.map(row => {
    const falseIds = new Set(row.state.truth.filter(label => !label.genuine).map(label => label.id));
    const initialIds = new Set(row.state.subjects.filter(subject => subject.genesis).map(subject => subject.id));
    const work = Object.fromEntries(['honest', 'attackers'].map(cohort => {
      const source = row.effort.cohorts[cohort];
      const first = row.denialTrace.find(point => point.cohorts[cohort].deniedDelta > 0);
      return [cohort, { budget: source.budget, setup: source.byPhase.setup, maintenance: source.byPhase.maintenance, spent: source.effort, remaining: source.remaining,
        denied: source.denied, byAction: source.byAction, firstDeniedSample: first ? { atHour: first.atHour, stage: first.stage, byActionDeniedDeltas: first.cohorts[cohort].byActionDeniedDeltas } : null }];
    }));
    const falseAdmissions = row.state.invitations.filter(invitation => invitation.status === 'accepted' && falseIds.has(invitation.target)).map(invitation => {
      const acts = row.state.selfIds.filter(act => act.subject === invitation.target);
      return { invitation: invitation.id, target: invitation.target, creator: invitation.creator, creatorIsInitialRoot: initialIds.has(invitation.creator), createdAt: invitation.createdAt, acceptedAt: invitation.acceptedAt,
        falseSelfIdActs: acts.map(act => ({ id: act.id, recordedAt: act.recordedAt, status: act.status })), terminalXp: row.state.subjects.find(subject => subject.id === invitation.target).xp };
    });
    const genuineCancellations = row.population !== 'genuine-coalition-descendants' ? [] : row.state.events.filter(event => event.type === 'invitation-cancelled').map(event => {
      const invitation = row.state.invitations.find(invitation => invitation.id === event.invitation);
      const identity = row.state.truth.find(identity => identity.id === event.guarantor);
      return { invitation: invitation.id, target: invitation.target, creator: invitation.creator, guarantor: event.guarantor, guarantorCohort: identity.cohort,
        createdAt: invitation.createdAt, cancelledAt: event.at, ageHours: event.at - invitation.createdAt, deadlineHour: invitation.createdAt + 24,
        classification: 'scenario-declared genuine target; lawful veto is not adjudicated misconduct' };
    });
    const pending = row.state.invitations.filter(invitation => invitation.status === 'open').map(invitation => ({ invitation: invitation.id, createdAt: invitation.createdAt, deadlineHour: invitation.createdAt + 24, observedThrough: row.outcome.elapsedHours }));
    return { seed: row.seed, population: row.population, resource: row.resource, evidence: row.evidence, arm: row.arm, outcome: row.outcome, bootstrap: row.bootstrap,
      work, falseAdmissions, genuineCancellations, pending, ledger: row.ledger, genuineXp: row.state.subjects.filter(subject => !falseIds.has(subject.id)).reduce((sum, subject) => sum + subject.xp, 0),
    };
  });
  const budgetPairs = rows.filter(row => row.resource !== 'generous-reference').map(lower => {
    const reference = rows.find(row => row.seed === lower.seed && row.population === lower.population && row.evidence === lower.evidence && row.arm === lower.arm && row.resource === 'generous-reference');
    return { seed: lower.seed, population: lower.population, resource: lower.resource, evidence: lower.evidence, arm: lower.arm,
      equalNativeState: digestOf(lower.state) === digestOf(reference.state), equalProcess: digestOf(lower.process) === digestOf(reference.process),
      equalActionWork: ['honest', 'attackers'].every(cohort => digestOf(lower.effort.cohorts[cohort].byAction) === digestOf(reference.effort.cohorts[cohort].byAction)),
      genuineXpDelta: cases.find(row => row.seed === lower.seed && row.population === lower.population && row.resource === lower.resource && row.evidence === lower.evidence && row.arm === lower.arm).genuineXp - reference.state.subjects.filter(subject => reference.state.truth.find(identity => identity.id === subject.id).genuine).reduce((sum, subject) => sum + subject.xp, 0),
      ledgerDelta: Object.fromEntries(Object.keys(lower.ledger).map(key => [key, lower.ledger[key] - reference.ledger[key]])),
    };
  });
  return { schema: 'facety-work-headroom-author-audit/v1', level: 'postdata-author-diagnostic-not-confirmation', designDigest: analysis.designDigest, captureCommit: analysis.captureCommit,
    cases, budgetPairs, bootstrapChecks: cases.length, completeEventPrefixChecks: analysis.vetoEffects.reduce((sum, row) => sum + row.completeEventPrefixChecks, 0),
    censoredPrefixChecksSkipped: analysis.vetoEffects.reduce((sum, row) => sum + row.censoredPrefixChecksSkipped, 0),
    qualifications: [
      'Retained-only post-data projections; the committed primary method/report and all native kernels remain unchanged. No model calls, new labels, tuning or replacement data.',
      'Full effort/counters and overlapping denial samples reconcile in the original analyzer; no exact within-tick denial order, per-invitation scarcity reconstruction, historical duty or sole causal attribution is inferred here.',
      'Native state/action-work equality is a scoped lower-cap/reference comparison, not matched later evidence across diverged graphs, authentic inputs, independent review or a general capacity threshold.',
      'Genuine classification comes from the declared descendant scenario, not a hidden protocol judgment; zero false identities in genuine controls is structural. No welfare, voluntary retention, calibrated human/private acquisition costs, safety guarantee or D33/D34/D42 migration.',
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('work-headroom audit accepts no input/output/policy overrides');
  const report = auditBlocks([0, 1, 2, 3].map(index => JSON.parse(readFileSync(new URL('block-' + index + '.json', import.meta.url)))));
  writeFileSync(new URL('audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ cases: report.cases.length, budgetPairs: report.budgetPairs.length, bootstrapChecks: report.bootstrapChecks }));
}
