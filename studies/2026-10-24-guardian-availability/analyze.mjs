// Owns: Offline analysis of the fixed availability packet, never simulation or confirmation.
import { readFileSync } from 'node:fs';
import { digestOf } from '../../src/provenance.mjs';

const DESIGN = JSON.parse(readFileSync(new URL('./design.json', import.meta.url), 'utf8'));
const RUNNER = digestOf(readFileSync(new URL('./run.mjs', import.meta.url), 'utf8'));
const FIELDS = ['falseAccepted', 'falseConverted', 'falseActs', 'falseXp', 'defenderEffort', 'attackerEffort', 'cancelled'];
function summary(values, complete) {
  return { values, mean: complete ? values.reduce((a, b) => a + b, 0) / values.length : null, min: Math.min(...values), max: Math.max(...values) };
}
function expectedConfig(seed, context, arm) {
  const actorProfiles = context.offset === null ? [] : Array.from({ length: DESIGN.base.initialSize }, (_, index) => ({
    subject: 'n' + index, activity: {}, transactionHours: null,
    attentionHours: Array.from({ length: DESIGN.base.days }, (_, day) => day * 24 + 4 * ((index + context.offset) % 6)),
  }));
  return { ...DESIGN.base, seed, actorProfiles, ablations: { ...DESIGN.base.ablations, disableInvitationVeto: arm.disabled } };
}
export function analyzeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length !== DESIGN.seeds.length) throw new Error('availability requires exactly four blocks');
  const sorted = [...blocks].sort((a, b) => a.block - b.block);
  const rows = [];
  for (const [index, block] of sorted.entries()) {
    if (block.schema !== 'facety-guardian-availability-block/v1' || block.block !== index || block.designDigest !== digestOf(DESIGN) || block.runnerDigest !== RUNNER || digestOf(block.source) !== digestOf(DESIGN.source) || !/^[a-f0-9]{40}$/.test(block.captureCommit) || block.captureCommit !== sorted[0].captureCommit || block.rows.length !== 6) throw new Error('availability block/source/matrix mismatch');
    const seen = new Set();
    for (const row of block.rows) {
      const context = DESIGN.contexts.find(item => item.id === row.context);
      const arm = DESIGN.arms.find(item => item.id === row.arm);
      const key = row.context + ':' + row.arm;
      if (!context || !arm || row.seed !== DESIGN.seeds[index] || seen.has(key) || row.configDigest !== digestOf(expectedConfig(row.seed, context, arm)) || digestOf(row.randomness) !== digestOf(DESIGN.randomness)) throw new Error('availability case/config/policy mismatch');
      seen.add(key);
      if (row.outcome.horizonDays !== DESIGN.base.days || typeof row.outcome.censored !== 'boolean' || ![true, false, null].includes(row.outcome.success)) throw new Error('availability outcome mismatch');
      for (const field of FIELDS) if (!Number.isFinite(row.metrics[field]) || row.metrics[field] < 0) throw new Error('invalid availability metric: ' + field);
      const falseIds = new Set(row.state.truth.filter(subject => !subject.genuine).map(subject => subject.id));
      const reconstructed = {
        falseAccepted: row.state.subjects.filter(subject => falseIds.has(subject.id) && subject.identityStatus === 'accepted').length,
        falseConverted: row.state.selfIds.filter(act => falseIds.has(act.subject) && act.status === 'converted').length,
        falseActs: row.state.selfIds.filter(act => falseIds.has(act.subject)).length,
        falseXp: row.state.subjects.filter(subject => falseIds.has(subject.id)).reduce((sum, subject) => sum + subject.xp, 0),
      };
      if (Object.entries(reconstructed).some(([field, value]) => value !== row.metrics[field])) throw new Error('availability state/metric mismatch');
      const { counters: c, evaluator: e } = row.process;
      if ([...Object.values(c), ...Object.values(e)].some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('invalid availability process counts');
      if (!row.outcome.censored && (c.reviewSlots !== c.inspections + c.inspectionDenied || c.cancelCalls !== c.cancelled + c.cancelRejected + c.cancelBudgetDenied + c.cancelUnavailable || e.falseTargetsInspected + e.genuineTargetsInspected !== c.inspections || e.falseTargetPositive + e.genuineTargetPositive !== c.positiveSignals)) throw new Error('availability process accounting mismatch');
      if (c.positiveSignals > c.inspections || c.cancelCalls > c.positiveSignals || e.falseTargetPositive > e.falseTargetsInspected || e.genuineTargetPositive > e.genuineTargetsInspected || e.genuineTargetsInspected !== 0) throw new Error('availability evidence/design inconsistency');
      if (c.cancelled !== row.metrics.cancelled || row.cancellations.length !== c.cancelled || (arm.disabled && c.cancelled !== 0)) throw new Error('availability cancellation mismatch');
      if (!row.outcome.censored && (row.outcome.elapsedHours !== DESIGN.base.days * 24 || row.daily.map(point => point.atHour).join() !== Array.from({ length: DESIGN.base.days }, (_, day) => (day + 1) * 24).join())) throw new Error('availability daily endpoints missing');
      const journal = row.state.events.filter(event => event.type === 'invitation-cancelled').map(event => ({ atHour: event.at, actor: event.guarantor, invitation: event.invitation, createdAt: row.state.invitations.find(invitation => invitation.id === event.invitation)?.createdAt }));
      if (digestOf(journal) !== digestOf(row.cancellations)) throw new Error('availability native journal mismatch');
      for (const cancellation of row.cancellations) {
        if (!/^n(0|[1-9]\d*)$/.test(cancellation.actor) || Number(cancellation.actor.slice(1)) >= DESIGN.base.initialSize || !Number.isSafeInteger(cancellation.atHour) || cancellation.atHour % 4 !== 0 || cancellation.atHour > DESIGN.base.days * 24 || !Number.isSafeInteger(cancellation.createdAt) || cancellation.createdAt < 0 || cancellation.atHour <= cancellation.createdAt || cancellation.atHour >= cancellation.createdAt + DESIGN.base.policy.invitationFreezeHours) throw new Error('availability cancellation window/actor mismatch');
        if (context.offset !== null && cancellation.atHour % 24 !== 4 * ((Number(cancellation.actor.slice(1)) + context.offset) % 6)) throw new Error('cancellation outside supplied attention window');
      }
      rows.push(row);
    }
  }
  const cells = [];
  const effects = [];
  for (const context of DESIGN.contexts) {
    for (const arm of DESIGN.arms) {
      const cases = rows.filter(row => row.context === context.id && row.arm === arm.id);
      cells.push({ context: context.id, arm: arm.id, cases: cases.length, complete: cases.filter(row => !row.outcome.censored).length,
        metrics: Object.fromEntries(FIELDS.map(field => [field, summary(cases.map(row => row.metrics[field]), cases.every(row => !row.outcome.censored))])),
        process: cases.map(row => ({ seed: row.seed, ...row.process })),
      });
    }
    const pairs = DESIGN.seeds.map(seed => ({ control: rows.find(row => row.context === context.id && row.arm === 'observe-only' && row.seed === seed), active: rows.find(row => row.context === context.id && row.arm === 'veto' && row.seed === seed) }));
    for (const { active, control } of pairs) {
      const firstCancellation = active.state.events.findIndex(event => event.type === 'invitation-cancelled');
      if (firstCancellation < 0 ? digestOf(active.state) !== digestOf(control.state) : digestOf(active.state.events.slice(0, firstCancellation)) !== digestOf(control.state.events.slice(0, firstCancellation))) throw new Error('availability veto-prefix mismatch');
    }
    effects.push({ context: context.id, contrast: 'veto-minus-observe-only', metrics: Object.fromEntries(FIELDS.map(field => [field, summary(pairs.map(({ active, control }) => active.metrics[field] - control.metrics[field]), pairs.every(({ active, control }) => !active.outcome.censored && !control.outcome.censored))])) });
  }
  return { schema: 'facety-guardian-availability-analysis/v1', level: DESIGN.level, designDigest: digestOf(DESIGN), runnerDigest: RUNNER, captureCommit: sorted[0].captureCommit, cases: rows.length, cells, effects, genuineHarmEvaluable: false, interpretation: [...DESIGN.interpretation] };
}
