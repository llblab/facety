// Owns: Retained shared-evidence matrix validation/descriptive contrasts; excludes simulation and inference.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { digestOf } from '../../src/provenance.mjs';
import { caseConfig, validateRow, FIELDS, methodDigests } from './contract.mjs';

const DESIGN = JSON.parse(readFileSync(new URL('design.json', import.meta.url)));
function summary(values, complete) {
  return { values, mean: complete ? values.reduce((a, b) => a + b, 0) / values.length : null, min: Math.min(...values), max: Math.max(...values) };
}
function contrast(pairs) {
  const complete = pairs.every(({ treatment, control }) => !treatment.outcome.censored && !control.outcome.censored);
  return Object.fromEntries(FIELDS.map(field => [field, summary(pairs.map(({ treatment, control }) => treatment.metrics[field] - control.metrics[field]), complete)]));
}
export function analyzeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length !== 4) throw new Error('shared-evidence requires exactly four blocks');
  const sorted = [...blocks].sort((a, b) => a.block - b.block);
  const methods = methodDigests();
  const rows = [];
  for (const [index, block] of sorted.entries()) {
    if (block.schema !== 'facety-shared-evidence-block/v1' || block.block !== index || block.designDigest !== digestOf(DESIGN) || digestOf(block.methodDigests) !== digestOf(methods) || digestOf(block.source) !== digestOf(DESIGN.source) || !/^[a-f0-9]{40}$/.test(block.captureCommit) || block.captureCommit !== sorted[0].captureCommit || block.rows.length !== 16) throw new Error('shared-evidence source/method/matrix mismatch');
    const seen = new Set();
    for (const row of block.rows) {
      const population = DESIGN.populations.find(item => item.id === row.population);
      const calendar = DESIGN.calendars.find(item => item.id === row.calendar);
      const arm = DESIGN.arms.find(item => item.id === row.arm);
      const key = JSON.stringify([row.population, row.calendar, row.evidence, row.arm]);
      if (!population || !calendar || !arm || !DESIGN.evidence.includes(row.evidence) || row.timing !== DESIGN.timing || row.seed !== DESIGN.seeds[index] || seen.has(key)) throw new Error('shared-evidence case matrix mismatch');
      seen.add(key);
      const config = caseConfig(DESIGN, row.seed, population, calendar, row.evidence, arm);
      if (row.configDigest !== digestOf(config) || digestOf(row.randomness) !== digestOf(DESIGN.randomness[row.evidence]) || !Array.isArray(block.assumptions[row.evidence]) || row.assumptionsDigest !== digestOf(block.assumptions[row.evidence]) || digestOf(block.assumptions[row.evidence]) !== digestOf(sorted[0].assumptions[row.evidence])) throw new Error('shared-evidence config/policy/assumptions mismatch');
      const metrics = validateRow(row, population, arm, config);
      const hours = row.daily.map(point => point.atHour);
      if (!Number.isSafeInteger(row.outcome.completedDays) || row.outcome.completedDays < 0 || row.outcome.completedDays > Math.floor(row.outcome.elapsedHours / 24) || (!row.outcome.censored && (row.outcome.completedDays !== config.days || row.outcome.success === null)) || hours.some((hour, i) => !Number.isSafeInteger(hour) || hour <= 0 || hour % 24 || hour > row.outcome.elapsedHours || (i && hour <= hours[i - 1]))) throw new Error('shared-evidence outcome/endpoint mismatch');
      rows.push({ ...row, metrics });
    }
  }
  const cells = [], evidenceEffects = [], vetoEffects = [];
  const find = (population, calendar, evidence, arm, seed) => rows.find(row => row.population === population.id && row.calendar === calendar.id && row.evidence === evidence && row.arm === arm && row.seed === seed);
  for (const population of DESIGN.populations) for (const calendar of DESIGN.calendars) {
    for (const evidence of DESIGN.evidence) for (const arm of DESIGN.arms) {
      const cases = DESIGN.seeds.map(seed => find(population, calendar, evidence, arm.id, seed));
      cells.push({ population: population.id, calendar: calendar.id, evidence, arm: arm.id, completeRuns: cases.filter(row => !row.outcome.censored).length,
        metricApplicability: population.descendantsGenuine ? 'False-identity zeros are structural; declared genuine-coalition invitation harm is not general welfare.' : 'Fabricated identities remain distinct from genuine coalition operators; genuine newcomer harm is not tested in this population.',
        metrics: Object.fromEntries(FIELDS.map(field => [field, summary(cases.map(row => row.metrics[field]), cases.every(row => !row.outcome.censored))])),
        process: cases.map(row => ({ seed: row.seed, ...row.process })),
      });
    }
    for (const arm of DESIGN.arms) {
      const pairs = DESIGN.seeds.map(seed => ({ treatment: find(population, calendar, 'shared-target', arm.id, seed), control: find(population, calendar, 'independent', arm.id, seed) }));
      evidenceEffects.push({ population: population.id, calendar: calendar.id, arm: arm.id, contrast: 'shared-target-minus-independent', metrics: contrast(pairs) });
    }
    for (const evidence of DESIGN.evidence) {
      const pairs = DESIGN.seeds.map(seed => ({ treatment: find(population, calendar, evidence, 'veto', seed), control: find(population, calendar, evidence, 'observe-only', seed) }));
      for (const { treatment, control } of pairs) {
        if (treatment.outcome.censored || control.outcome.censored) continue;
        const cut = treatment.state.events.findIndex(event => event.type === 'invitation-cancelled');
        if (cut < 0 ? digestOf(treatment.state) !== digestOf(control.state) : digestOf(treatment.state.events.slice(0, cut)) !== digestOf(control.state.events.slice(0, cut))) throw new Error('shared-evidence veto-event prefix mismatch');
      }
      vetoEffects.push({ population: population.id, calendar: calendar.id, evidence, contrast: 'veto-minus-observe-only',
        completeEventPrefixChecks: pairs.filter(({ treatment, control }) => !treatment.outcome.censored && !control.outcome.censored).length,
        censoredPrefixChecksSkipped: pairs.filter(({ treatment, control }) => treatment.outcome.censored || control.outcome.censored).length,
        metrics: contrast(pairs),
      });
    }
  }
  return { schema: 'facety-shared-evidence-analysis/v1', level: DESIGN.level, designDigest: digestOf(DESIGN), methodDigests: methods, captureCommit: sorted[0].captureCommit,
    cases: rows.length, cells, evidenceEffects, vetoEffects,
    harmCoverage: 'Declared genuine-coalition invitation harm only; coordination is not guilt. No ordinary Self-ID/unaffiliated recruitment/useful growth or universal welfare assessment.',
    interpretation: ['Four fixed labels: retain raw values/ranges and paired descriptive means, not population trials, p-values or mechanism confirmation. Signal keys change across evidence laws; event-prefix comparisons apply within a law only.', ...DESIGN.interpretation],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('shared-evidence analysis accepts no input/output/policy overrides');
  const blocks = [0, 1, 2, 3].map(index => JSON.parse(readFileSync(new URL('block-' + index + '.json', import.meta.url))));
  const report = analyzeBlocks(blocks);
  writeFileSync(new URL('report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ cases: report.cases, cells: report.cells.length, complete: report.cells.reduce((sum, cell) => sum + cell.completeRuns, 0) }));
}
