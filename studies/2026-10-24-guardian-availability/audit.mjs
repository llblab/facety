// Owns: Post-data author checks of retained states, horizon exposure and gross work; no model calls.
import { digestOf } from '../../src/provenance.mjs';
import { analyzeBlocks } from './analyze.mjs';

export function auditBlocks(blocks) {
  analyzeBlocks(blocks);
  const sorted = [...blocks].sort((a, b) => a.block - b.block);
  return {
    schema: 'facety-guardian-availability-postdata-audit/v1', level: 'postdata-author-audit-not-independent-confirmation',
    observeOnlyStateEqual: sorted.map(block => new Set(block.rows.filter(row => row.arm === 'observe-only').map(row => digestOf(row.state))).size === 1),
    cases: sorted.flatMap(block => block.rows.map(row => ({
      seed: row.seed, context: row.context, arm: row.arm,
      openInvitations: row.state.invitations.filter(invitation => invitation.status === 'open').length,
      cancelAges: row.cancellations.map(cancellation => cancellation.atHour - cancellation.createdAt),
      paidReviewResponseWork: row.process.counters.inspections + row.process.counters.cancelCalls,
      inspectionDenied: row.process.counters.inspectionDenied, cancelBudgetDenied: row.process.counters.cancelBudgetDenied,
    }))),
    interpretation: [
      'Completed seven-day runs are not complete lifetimes for still-open invitations. No inference beyond the declared horizon.',
      'Gross review/response work uses supplied unit weights; net defender effort also changes with downstream population/work.',
      'Equal observe-only native states are a postdata control check, not a preregistered confirmation or equality of paid work.',
    ],
  };
}
