import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { causalWorld, WALKTHROUGH_DESIGN } from './causal-walkthroughs.mjs';
import { EvidenceRelay, accountabilitySnapshot } from '../src/accountability.mjs';
import { experimentConfig } from '../src/experiment.mjs';
import { Random, RANDOM_GENERATOR } from '../src/random.mjs';
import { bootstrapMeanInterval } from '../src/statistics.mjs';
import { provenance } from '../src/provenance.mjs';

export const RELAY_ARMS = Object.freeze(['member', 'external-unrouted', 'external-relay']);
export const RELAY_CONTEXTS = Object.freeze([
  { id: 'independent-capacity2', reviewCapacity: 2, sharedReviewError: 0 },
  { id: 'independent-capacity1', reviewCapacity: 1, sharedReviewError: 0 },
  { id: 'correlated-capacity1', reviewCapacity: 1, sharedReviewError: 0.75 },
]);
export const RELAY_INPUTS = Object.freeze({ violationPrevalence: 0.5, sensitivity: 0.8, falsePositiveRate: 0.2,
  reviewSensitivity: 0.85, reviewFalsePositiveRate: 0.2, adjudicationAccuracy: 0.8, startHour: 72, endHour: 96 });
export const RELAY_RANDOMNESS = Object.freeze({ generator: RANDOM_GENERATOR, decisions: 'causal-relay-input-keyed-v1' });

export function runRelayArm(seed, context, arm, { traceLimit = 0, inertInspection = false } = {}) {
  if (!RELAY_ARMS.includes(arm)) throw new Error('unknown relay arm');
  const { model, acts } = causalWorld();
  const before = accountabilitySnapshot(model);
  const root = new Random(seed);
  const draw = (subject, stage, probability) => root.fork(JSON.stringify([subject, stage])).chance(probability);
  // Only this environment owns violation truth. Every downstream input is an observation or verdict.
  const violations = { Mira: draw('Mira', 'world', RELAY_INPUTS.violationPrevalence), Aster: false };
  const member = arm === 'member';
  const observer = member ? 'Bela' : 'Outside';
  const rules = experimentConfig({ disputes: { enabled: true, stakeBacking: 'reserved' } }).disputes;
  const relay = new EvidenceRelay(model, { traceLimit, rules, actors: [
    { id: 'Outside', subject: null, budget: member ? 0 : 6, reviewCapacity: 0 },
    { id: 'Bela', subject: 'Bela', budget: member ? 10 : 4, reviewCapacity: context.reviewCapacity },
  ] });
  const environments = [];
  const packages = [];
  const opened = [];
  for (const subject of ['Mira', 'Aster']) {
    const violation = violations[subject];
    const discovery = draw(subject, 'discovery', violation ? RELAY_INPUTS.sensitivity : RELAY_INPUTS.falsePositiveRate);
    const independentReview = draw(subject, 'review', violation ? RELAY_INPUTS.reviewSensitivity : RELAY_INPUTS.reviewFalsePositiveRate);
    const shared = draw(subject, 'shared-review-error', context.sharedReviewError);
    const review = shared ? discovery : independentReview;
    const upheld = draw(subject, 'adjudication-correct', RELAY_INPUTS.adjudicationAccuracy) === violation;
    environments.push({ subject, violation, discovery, review, sharedReviewError: shared, upheld });
    if (inertInspection) { relay.snapshot(); relay.trace(); accountabilitySnapshot(model); }
    const observed = relay.observe(observer, acts[subject], { suspicious: discovery, sourceGroup: 'media:' + subject });
    if (discovery && observed.ok) {
      const packaged = relay.package(observer, [observed.value]);
      if (packaged.ok) packages.push({ id: packaged.value, subject, review, upheld });
    }
  }
  for (const item of packages) {
    const routed = relay.route(observer, item.id, arm === 'external-unrouted' ? null : 'Bela');
    if (!routed.ok) continue;
    const reviewed = relay.review('Bela', item.id, { suspicious: item.review, sourceGroup: 'separate-review:' + item.subject });
    if (!reviewed.ok) continue;
    const challenge = relay.sponsor('Bela', item.id);
    if (challenge.ok) opened.push({ ...item, caseId: challenge.value });
  }
  model.advanceTo(73);
  for (const item of opened) relay.resolve(item.caseId, item.upheld);
  model.advanceTo(RELAY_INPUTS.endHour);
  const after = accountabilitySnapshot(model);
  const state = relay.snapshot();
  const genuine = after.subjects.filter(subject => !violations[subject.id]);
  const invalidated = id => model.subject(id).identityStatus !== 'accepted';
  const metrics = {
    violationOpportunities: Number(violations.Mira), corrected: Number(violations.Mira && invalidated('Mira')),
    missedViolations: Number(violations.Mira && !invalidated('Mira')),
    wrongfulInvalidations: genuine.filter(subject => invalidated(subject.id)).length,
    genuineRetained: genuine.filter(subject => !invalidated(subject.id)).length, genuineDenominator: genuine.length,
    genuineXpLost: genuine.reduce((sum, subject) => sum + Math.max(0, before.subjects.find(old => old.id === subject.id).xp - subject.xp), 0),
    unresolvedPackages: state.packages.filter(item => item.status !== 'resolved').length,
    pendingCases: state.cases.filter(item => item.resolvedAt === null).length,
    work: state.actors.reduce((sum, actor) => sum + actor.spent, 0), denied: state.actors.reduce((sum, actor) => sum + actor.denied, 0),
    burned: after.ledger.burned - before.ledger.burned, debtAdded: after.ledger.debt - before.ledger.debt,
    genuineCollectedPenalties: after.events.slice(before.events.length).filter(event => event.type === 'penalty-applied' && !violations[event.subject]).reduce((sum, event) => sum + event.collected, 0),
  };
  return { seed, context: context.id, arm, budget: 10, opportunities: ['Mira', 'Aster'], window: [72, 96], metrics,
    stageClocks: state.packages.map(item => {
      const record = state.cases.find(value => value.packageId === item.id);
      return { package: item.id, subject: item.subject, discovery: state.observations.find(value => item.observationIds.includes(value.id)).atHour,
        packaged: item.createdAt, review: item.routes.find(route => route.review)?.review.atHour ?? null,
        formalAccess: record?.openedAt ?? null, verdict: record?.resolvedAt ?? null,
        discoveryToVerdict: record?.resolvedAt === null || !record ? null : record.resolvedAt - item.createdAt, status: item.status };
    }),
    protocol: after, relay: state, trace: relay.trace(), evaluation: { environments } };
}

export function runRelayComparison({ seeds = Array.from({ length: 32 }, (_, i) => 'causal-relay-explore-' + String(i).padStart(2, '0')) } = {}) {
  const runs = RELAY_CONTEXTS.flatMap(context => seeds.flatMap(seed => RELAY_ARMS.map(arm => runRelayArm(seed, context, arm))));
  const contrasts = RELAY_CONTEXTS.flatMap(context => ['member', 'external-unrouted'].map(control => {
    const differences = seeds.map(seed => {
      const paired = runs.filter(run => run.context === context.id && run.seed === seed);
      const treatment = paired.find(run => run.arm === 'external-relay');
      const reference = paired.find(run => run.arm === control);
      return Object.fromEntries(['corrected', 'wrongfulInvalidations', 'unresolvedPackages', 'work', 'genuineXpLost'].map(key => [key, treatment.metrics[key] - reference.metrics[key]]));
    });
    return { context: context.id, contrast: 'external-relay minus ' + control, n: seeds.length,
      effects: Object.fromEntries(['corrected', 'wrongfulInvalidations', 'unresolvedPackages', 'work', 'genuineXpLost'].map(key => {
        const values = differences.map(row => row[key]);
        return [key, { mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
          interval: bootstrapMeanInterval(values, { seed: JSON.stringify([context.id, control, key]), resamples: 2000 }) }];
      })) };
  }));
  return { schema: 'facety-causal-relay-exploration/v1', provenance: provenance(), design: [WALKTHROUGH_DESIGN, { path: 'examples/causal-relay.mjs', sha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex') }], randomness: RELAY_RANDOMNESS,
    inputs: RELAY_INPUTS, contexts: RELAY_CONTEXTS, seeds, arms: RELAY_ARMS,
    assumptions: [
      'Exploratory input-driven reference, not committed confirmation, population reliability, equilibrium or emergence.',
      'All arms share the same native funded prefix, two event opportunities, 24-hour horizon, quality draws, 10 total work units and sponsor wallet/XP.',
      'The member origin and sponsor are Bela: 10 work units; external origin gets 6 and Bela gets 4. This allocates identical total processing capacity, not extra investigators.',
      'Discovery/package/route/review/challenge each cost one uncalibrated work unit. The member arm uses the same measured packaging/routing stages, not the legacy cohort scheduler.',
      'Unused budgets are retained, not reallocated to invent extra discoveries. Removing routing suppresses later work; equal budget does not imply equal realized cost.',
      'Source groups declare separate acquisition, not statistically independent interpretation. Shared errors correlate a separate reviewer signal with discovery, despite different source labels.',
      'Review capacity is per half-open day [72,96); queued packages remain unresolved at the declared horizon. No later review opportunity is silently added.',
      'Verdicts have supplied 0.8 accuracy. They may penalize genuine parties and leave debt; no compensation, utility or application value is assumed.',
      'Unresolved evidence and pending funded cases are separate. Resolved-case latency is conditional and must not replace the missing latency of unresolved packages.',
    ], contrasts, runs };
}

export function renderRelayComparison(result) {
  return ['# Matched-resource relay exploration', '', 'Exploratory, conditional on supplied inputs; bootstrap intervals are descriptive, not confirmation.',
    `${result.seeds.length} paired seeds per context; 2 public-event opportunities/seed; window 72–96 h; 10 total work units/arm. Effects below are per run, not real-world rates.`,
    '| Context | Contrast | Corrections/run Δ [95% interval] | Wrongful invalidations/run Δ | Unresolved packages Δ | Work Δ |',
    '| --- | --- | --- | --- | --- | --- |',
    ...result.contrasts.map(row => {
      const c = row.effects.corrected;
      const bounds = c.interval ? `${c.interval.lower.toFixed(3)}, ${c.interval.upper.toFixed(3)}` : 'unknown';
      return `| ${row.context} | ${row.contrast} | ${c.mean?.toFixed(3) ?? 'unknown'} [${bounds}] | ${row.effects.wrongfulInvalidations.mean?.toFixed(3) ?? 'unknown'} | ${row.effects.unresolvedPackages.mean?.toFixed(3) ?? 'unknown'} | ${row.effects.work.mean?.toFixed(3) ?? 'unknown'} |`;
    }), '', 'Member versus external-relay is a resource/quality-matched placebo, not an assumption that outsourcing improves skill.',
    'Wrongful sanctions, genuine XP loss, pending stages, per-seed paired inputs, monetary costs and full native state remain in JSON.',
    'No compensation/adaptive participation, endogenous search, Council merits or general identity reinstatement is modeled.'].join('\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runRelayComparison();
  console.log(process.argv.includes('--json') ? JSON.stringify(result, null, 2) : renderRelayComparison(result));
}
