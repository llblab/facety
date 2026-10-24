// Owns: Fixed-packet offline validation/descriptive contrasts, not simulation or mechanism confirmation.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { digestOf } from '../../src/provenance.mjs';
import { caseConfig, measure, FIELDS, COUNTERS, EVALUATOR, methodDigests } from './contract.mjs';

const DESIGN = JSON.parse(readFileSync(new URL('design.json', import.meta.url)));
function summary(values, complete) {
  return { values, mean: complete ? values.reduce((a, b) => a + b, 0) / values.length : null, min: Math.min(...values), max: Math.max(...values) };
}
function keysMatch(value, keys) { return value && Object.keys(value).sort().join() === [...keys].sort().join(); }
function finite(value) { return Number.isFinite(value) && value >= 0; }
export function validateRow(row, population, arm, config) {
  if (row.outcome.horizonDays !== config.days || row.outcome.criterion !== population.criterion || typeof row.outcome.censored !== 'boolean' || ![true, false, null].includes(row.outcome.success) || !Number.isSafeInteger(row.outcome.elapsedHours) || row.outcome.elapsedHours < 0 || row.outcome.elapsedHours > config.days * 24) throw new Error('comparison outcome mismatch');
  const { counters: c, evaluator: e } = row.process;
  if (!keysMatch(c, COUNTERS) || !keysMatch(e, EVALUATOR) || [...Object.values(c), ...Object.values(e)].some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('comparison requires all process/evaluator counts');
  if (!row.outcome.censored && (c.reviewSlots !== c.inspections + c.inspectionDenied || c.cancelCalls !== c.cancelled + c.cancelRejected + c.cancelBudgetDenied + c.cancelUnavailable || c.cancelCalls !== c.positiveSignals)) throw new Error('comparison stage accounting mismatch');
  if (e.falseTargetsInspected + e.genuineTargetsInspected !== c.inspections || e.falseTargetPositive + e.genuineTargetPositive !== c.positiveSignals || c.positiveSignals > c.inspections || e.falseTargetPositive > e.falseTargetsInspected || e.genuineTargetPositive > e.genuineTargetsInspected || (population.descendantsGenuine ? e.falseTargetsInspected : e.genuineTargetsInspected) !== 0) throw new Error('comparison evidence/class mismatch');
  const metrics = measure(row, population);
  if (FIELDS.some(field => !finite(metrics[field]))) throw new Error('invalid comparison metric');
  if (row.system.falseAcceptedSubjects !== metrics.falseAccepted || row.impact.falseConversions !== metrics.falseConverted || row.nativePopulation.humanOperators !== metrics.operators || row.system.trust.invitationsCancelled !== c.cancelled) throw new Error('comparison native/state metric mismatch');
  if (population.descendantsGenuine && (metrics.falseAccepted || metrics.falseConverted || metrics.falseXp)) throw new Error('genuine-only control has false identity outcomes');
  const known = new Map(row.state.truth.map(identity => [identity.id, identity]));
  const ids = new Set(row.state.subjects.map(subject => subject.id));
  if (row.nativePopulation.initialSubjects !== config.initialSize || row.nativePopulation.initialAttackers !== Math.round(config.initialSize * config.attackerShare) || row.state.subjects.filter(subject => subject.genesis && known.get(subject.id)?.cohort === 'attackers').length !== row.nativePopulation.initialAttackers || ids.size !== row.state.subjects.length || ids.size !== known.size || row.state.subjects.filter(subject => subject.genesis).length !== config.initialSize || row.state.subjects.some(subject => typeof subject.genesis !== 'boolean' || !Number.isSafeInteger(subject.xp) || subject.xp < 0 || (subject.genesis ? !known.get(subject.id).genuine : known.get(subject.id).genuine !== population.descendantsGenuine)) || row.state.selfIds.some(act => !known.has(act.subject))) throw new Error('comparison census/source-class mismatch');
  if (Object.values(row.ledger).some(value => !Number.isSafeInteger(value) || value < 0) || row.ledger.minted !== row.ledger.burned + row.ledger.supply || row.ledger.supply !== row.ledger.emitterVault + row.ledger.collector + row.ledger.feeVault + row.ledger.stakeVault) throw new Error('comparison ledger conservation mismatch');
  for (const cohort of ['honest', 'attackers']) if (!finite(row.effort.cohorts[cohort].effort) || row.effort.cohorts[cohort].effort > config.budgets[cohort]) throw new Error('comparison whole-run effort mismatch');
  if (!row.outcome.censored && (row.outcome.elapsedHours !== config.days * 24 || row.daily.map(point => point.atHour).join() !== Array.from({ length: config.days }, (_, day) => (day + 1) * 24).join())) throw new Error('comparison daily endpoints missing');
  const invitations = new Map(row.state.invitations.map(invitation => [invitation.id, invitation]));
  if (invitations.size !== row.state.invitations.length) throw new Error('duplicate comparison invitation');
  for (const invitation of invitations.values()) {
    if (!['accepted', 'cancelled', 'open'].includes(invitation.status) || !Number.isSafeInteger(invitation.createdAt) || invitation.createdAt < 0 || invitation.createdAt > row.outcome.elapsedHours || invitation.createdAt >= config.days * 24 || invitation.createdAt % 4 || known.get(invitation.creator)?.cohort !== 'attackers') throw new Error('comparison invitation/script mismatch');
    if (invitation.status === 'accepted' && (!Number.isSafeInteger(invitation.acceptedAt) || invitation.acceptedAt < invitation.createdAt + config.policy.invitationFreezeHours || invitation.acceptedAt > row.outcome.elapsedHours || !known.has(invitation.target))) throw new Error('comparison admission timing mismatch');
  }
  const cancellations = row.state.events.filter(event => event.type === 'invitation-cancelled');
  if (cancellations.length !== c.cancelled || (arm.disabled && cancellations.length !== 0)) throw new Error('comparison cancellation count/effect mismatch');
  const seen = new Set();
  for (const event of cancellations) {
    const invitation = invitations.get(event.invitation);
    if (!invitation || invitation.status !== 'cancelled' || seen.has(invitation.id) || !Number.isSafeInteger(event.at) || event.at <= invitation.createdAt || event.at >= invitation.createdAt + config.policy.invitationFreezeHours || event.at > row.outcome.elapsedHours || event.at % 4 || known.get(event.guarantor)?.cohort !== 'honest') throw new Error('comparison cancellation journal/window mismatch');
    seen.add(invitation.id);
    const hours = config.actorProfiles.find(profile => profile.subject === event.guarantor)?.attentionHours;
    if (hours != null && !hours.includes(event.at)) throw new Error('comparison cancellation outside attention calendar');
  }
  if (row.state.invitations.filter(invitation => invitation.status === 'cancelled').length !== seen.size) throw new Error('comparison cancelled status lacks event');
  return metrics;
}

export function analyzeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length !== DESIGN.seeds.length) throw new Error('comparison requires exactly four blocks');
  const sorted = [...blocks].sort((a, b) => a.block - b.block);
  const expectedMethods = methodDigests();
  const rows = [];
  for (const [index, block] of sorted.entries()) {
    if (block.schema !== 'facety-attended-comparison-block/v1' || block.block !== index || block.designDigest !== digestOf(DESIGN) || digestOf(block.methodDigests) !== digestOf(expectedMethods) || digestOf(block.source) !== digestOf(DESIGN.source) || !/^[a-f0-9]{40}$/.test(block.captureCommit) || block.captureCommit !== sorted[0].captureCommit || block.rows.length !== 24) throw new Error('comparison source/method/matrix mismatch');
    const seen = new Set();
    for (const row of block.rows) {
      const population = DESIGN.populations.find(item => item.id === row.population);
      const calendar = DESIGN.calendars.find(item => item.id === row.calendar);
      const arm = DESIGN.arms.find(item => item.id === row.arm);
      const key = JSON.stringify([row.population, row.calendar, row.timing, row.arm]);
      if (!population || !calendar || !arm || !DESIGN.timings.includes(row.timing) || row.seed !== DESIGN.seeds[index] || seen.has(key)) throw new Error('comparison case matrix mismatch');
      seen.add(key);
      const config = caseConfig(DESIGN, row.seed, population, calendar, row.timing, arm);
      if (row.configDigest !== digestOf(config) || digestOf(row.randomness) !== digestOf(DESIGN.randomness[row.timing]) || !Array.isArray(block.assumptions[row.timing]) || row.assumptionsDigest !== digestOf(block.assumptions[row.timing]) || digestOf(block.assumptions[row.timing]) !== digestOf(sorted[0].assumptions[row.timing])) throw new Error('comparison config/policy/assumptions mismatch');
      rows.push({ ...row, metrics: validateRow(row, population, arm, config) });
    }
  }
  const cells = [];
  const timingEffects = [];
  const vetoEffects = [];
  function contrast(pairs) {
    const complete = pairs.every(({ treatment, control }) => !treatment.outcome.censored && !control.outcome.censored);
    return Object.fromEntries(FIELDS.map(field => [field, summary(pairs.map(({ treatment, control }) => treatment.metrics[field] - control.metrics[field]), complete)]));
  }
  for (const population of DESIGN.populations) for (const calendar of DESIGN.calendars) {
    for (const timing of DESIGN.timings) for (const arm of DESIGN.arms) {
      const cases = rows.filter(row => row.population === population.id && row.calendar === calendar.id && row.timing === timing && row.arm === arm.id);
      cells.push({ population: population.id, calendar: calendar.id, timing, arm: arm.id, completeRuns: cases.filter(row => !row.outcome.censored).length,
        metricApplicability: population.descendantsGenuine ? 'False-identity zeros are structural; genuine invitation cancellations measure declared genuine-coalition harm, not overall welfare.' : 'False identities and genuine initial coalition operators remain distinct; this arm does not evaluate genuine newcomer invitation harm.',
        metrics: Object.fromEntries(FIELDS.map(field => [field, summary(cases.map(row => row.metrics[field]), cases.every(row => !row.outcome.censored))])),
        process: cases.map(row => ({ seed: row.seed, ...row.process })),
      });
    }
    for (const arm of DESIGN.arms) {
      const pairs = DESIGN.seeds.map(seed => ({ treatment: rows.find(row => row.population === population.id && row.calendar === calendar.id && row.arm === arm.id && row.timing === 'first-attended' && row.seed === seed), control: rows.find(row => row.population === population.id && row.calendar === calendar.id && row.arm === arm.id && row.timing === 'daily-slot' && row.seed === seed) }));
      timingEffects.push({ population: population.id, calendar: calendar.id, arm: arm.id, contrast: 'first-attended-minus-daily-slot', metrics: contrast(pairs) });
    }
    for (const timing of DESIGN.timings) {
      const pairs = DESIGN.seeds.map(seed => ({ treatment: rows.find(row => row.population === population.id && row.calendar === calendar.id && row.timing === timing && row.arm === 'veto' && row.seed === seed), control: rows.find(row => row.population === population.id && row.calendar === calendar.id && row.timing === timing && row.arm === 'observe-only' && row.seed === seed) }));
      for (const { treatment, control } of pairs) {
        if (treatment.outcome.censored || control.outcome.censored) continue;
        const cut = treatment.state.events.findIndex(event => event.type === 'invitation-cancelled');
        if (cut < 0 ? digestOf(treatment.state) !== digestOf(control.state) : digestOf(treatment.state.events.slice(0, cut)) !== digestOf(control.state.events.slice(0, cut))) throw new Error('comparison veto-event prefix mismatch');
      }
      vetoEffects.push({ population: population.id, calendar: calendar.id, timing, contrast: 'veto-minus-observe-only', completeEventPrefixChecks: pairs.filter(({ treatment, control }) => !treatment.outcome.censored && !control.outcome.censored).length, censoredPrefixChecksSkipped: pairs.filter(({ treatment, control }) => treatment.outcome.censored || control.outcome.censored).length, metrics: contrast(pairs) });
    }
  }
  return { schema: 'facety-attended-comparison-analysis/v1', level: DESIGN.level, designDigest: digestOf(DESIGN), methodDigests: expectedMethods, captureCommit: sorted[0].captureCommit,
    cases: rows.length, cells, timingEffects, vetoEffects,
    harmCoverage: 'Genuine coalition invitation targets only; unaffiliated honest recruitment/general Self-ID harm/useful growth are not evaluated. Coordination is not guilt.',
    interpretation: ['Fixed-label raw values/ranges/paired descriptive means; no p-values, population probabilities, calibrated uncertainty, universal score or mechanism confirmation.', ...DESIGN.interpretation],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('comparison analysis accepts no input/output/policy overrides');
  const blocks = [0, 1, 2, 3].map(index => JSON.parse(readFileSync(new URL('block-' + index + '.json', import.meta.url))));
  const report = analyzeBlocks(blocks);
  writeFileSync(new URL('report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ cases: report.cases, cells: report.cells.length, complete: report.cells.reduce((sum, cell) => sum + cell.completeRuns, 0) }));
}
