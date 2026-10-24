// Owns: Offline summaries of the closed exploratory packet; excludes simulation and confirmation inference.
import { digestOf } from '../../src/provenance.mjs';
import { readFileSync } from 'node:fs';

const EXPECTED_DESIGN = JSON.parse(readFileSync(new URL('./design.json', import.meta.url), 'utf8'));

const FIELDS = ['subjects', 'operators', 'falseAccepted', 'falseActs', 'falseConverted', 'falseLiquid', 'falseXp', 'coalitionXpShare', 'falseActsVetoed', 'genuineActsVetoed', 'invitationsCancelled', 'cancelledFalse', 'cancelledGenuine', 'attackerEffort', 'defenderEffort', 'selfIdInspections'];

function summary(values, complete) {
  const known = values.filter(value => value !== null);
  return { values, mean: complete && known.length === values.length ? known.reduce((sum, value) => sum + value, 0) / values.length : null, min: known.length ? Math.min(...known) : null, max: known.length ? Math.max(...known) : null };
}

export function analyzeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length !== 4) throw new Error('D43 requires exactly four fixed blocks');
  const sorted = [...blocks].sort((a, b) => a.block - b.block);
  const first = sorted[0];
  const { design } = first;
  if (digestOf(design) !== digestOf(EXPECTED_DESIGN) || design?.schema !== 'facety-d43-cadence-design/v1' || design.seeds.length !== 4 || design.steps.join() !== '24,6,4' || design.arms.map(arm => arm.id).join() !== 'unobserved,observe-only,veto') throw new Error('unknown D43 design');
  const rows = [];
  for (const [index, block] of sorted.entries()) {
    if (block.schema !== 'facety-d43-cadence-block/v1' || block.block !== index || block.designDigest !== digestOf(block.design) || block.designDigest !== first.designDigest || block.runnerDigest !== first.runnerDigest || block.codeCommit !== first.codeCommit || block.runs.length !== 9) throw new Error('D43 block/source/cohort mismatch');
    const seen = new Set();
    for (const row of block.runs) {
      const arm = design.arms.find(arm => arm.id === row.arm);
      const key = row.stepHours + ':' + row.arm;
      if (!arm || !design.steps.includes(row.stepHours) || row.seed !== design.seeds[index] || seen.has(key) || row.review !== arm.review || row.vetoDisabled !== arm.vetoDisabled) throw new Error('D43 case mismatch');
      seen.add(key);
      const config = { ...design.base, seed: row.seed, stepHours: row.stepHours, ablations: { ...design.base.ablations, disableInvitationVeto: arm.vetoDisabled }, activity: { ...design.base.activity, honest: { ...design.base.activity.honest, review: arm.review } } };
      if (digestOf(row.randomness) !== digestOf(design.randomness[row.stepHours])) throw new Error('D43 randomness policy mismatch');
      if (digestOf(config) !== row.configDigest || row.outcome.horizonDays !== design.base.days || typeof row.outcome.censored !== 'boolean' || ![true, false, null].includes(row.outcome.success)) throw new Error('D43 config/outcome mismatch');
      for (const field of FIELDS) {
        const value = row.metrics[field];
        if (value === null && ['coalitionXpShare', 'cancelledFalse', 'cancelledGenuine'].includes(field)) continue;
        if (!Number.isFinite(value) || value < 0) throw new Error('invalid D43 metric: ' + field);
      }
      if (row.reviewProcess) {
        const { counters: c, evaluator: e } = row.reviewProcess;
        if ([...Object.values(c), ...Object.values(e)].some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('invalid review counters');
        if (!row.outcome.censored && (c.reviewSlots !== c.inspections + c.inspectionDenied || c.cancelCalls !== c.cancelled + c.cancelRejected + c.cancelBudgetDenied + c.cancelUnavailable || e.falseTargetsInspected + e.genuineTargetsInspected !== c.inspections || e.falseTargetPositive + e.genuineTargetPositive !== c.positiveSignals)) throw new Error('inconsistent review process');
        if (c.cancelled !== row.metrics.invitationsCancelled) throw new Error('cancellation total mismatch');
      }
      if (!row.outcome.censored) {
        const expectedHours = Array.from({ length: design.base.days }, (_, day) => (day + Number(row.stepHours !== 24)) * 24);
        if (row.daily.map(point => point.atHour).join() !== expectedHours.join()) throw new Error('incomplete or misaligned daily endpoints');
      }
      if (row.vetoDisabled && row.metrics.invitationsCancelled !== 0) throw new Error('disabled veto has a cancellation');
      if (row.cancellations) {
        if (row.cancellations.length !== row.metrics.invitationsCancelled) throw new Error('cancellation journal count mismatch');
        for (const cancellation of row.cancellations) if (!Number.isSafeInteger(cancellation.createdAt) || !Number.isSafeInteger(cancellation.cancelledAt) || typeof cancellation.falseTarget !== 'boolean' || !(cancellation.createdAt >= 0 && cancellation.cancelledAt > cancellation.createdAt && cancellation.cancelledAt < cancellation.createdAt + design.base.policy.invitationFreezeHours)) throw new Error('cancellation outside reaction window');
      }
      rows.push(row);
    }
  }
  const cells = [];
  const effects = [];
  for (const stepHours of design.steps) {
    for (const arm of design.arms) {
      const cases = rows.filter(row => row.stepHours === stepHours && row.arm === arm.id);
      const complete = cases.every(row => !row.outcome.censored);
      cells.push({ stepHours, arm: arm.id, runs: cases.length, completeRuns: cases.filter(row => !row.outcome.censored).length,
        successes: cases.filter(row => row.outcome.success === true).length, unknownOutcomes: cases.filter(row => row.outcome.success === null).length,
        metrics: Object.fromEntries(FIELDS.map(field => [field, summary(cases.map(row => row.metrics[field]), complete)])),
        reviewProcess: cases.map(row => ({ seed: row.seed, ...row.reviewProcess })),
      });
    }
    const paired = design.seeds.map(seed => ({ seed,
      control: rows.find(row => row.seed === seed && row.stepHours === stepHours && row.arm === 'observe-only'),
      treatment: rows.find(row => row.seed === seed && row.stepHours === stepHours && row.arm === 'veto'),
    }));
    effects.push({ stepHours, contrast: 'veto-minus-observe-only', metrics: Object.fromEntries(FIELDS.map(field => [field, summary(paired.map(({ control, treatment }) => control.metrics[field] === null || treatment.metrics[field] === null ? null : treatment.metrics[field] - control.metrics[field]), paired.every(pair => !pair.control.outcome.censored && !pair.treatment.outcome.censored))])) });
  }
  return { schema: 'facety-d43-cadence-analysis/v1', level: design.level, designDigest: first.designDigest, runnerDigest: first.runnerDigest, codeCommit: first.codeCommit,
    cases: rows.length, seeds: [...design.seeds], cells, effects,
    interpretation: ['Raw values/ranges and matched descriptive means across four fixed labels; no p-values, population probability, calibrated uncertainty or confirmation.', 'The counterfactual removes the veto effect, not the guarantee, prior funding, initial knowledge or inspection process. Work may differ after the first changed outcome.', 'Complete-mode cadence comparisons are not isolated step-size effects. Attention, detection, authority, costs, false positives and endogenous motivation remain distinct.', ...design.interpretation],
  };
}
