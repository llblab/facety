// Owns: Fixed retained resource matrix, work validation and descriptive contrasts; excludes simulation and inference.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { digestOf } from '../../src/provenance.mjs';
import { caseConfig, validateRow, validateWork, measure, FIELDS, methodDigests } from './contract.mjs';

const DESIGN = JSON.parse(readFileSync(new URL('design.json', import.meta.url)));
function summary(values, complete) {
  return { values, mean: complete ? values.reduce((a, b) => a + b, 0) / values.length : null, min: Math.min(...values), max: Math.max(...values) };
}
function contrast(pairs) {
  const complete = pairs.every(({ treatment, control }) => !treatment.outcome.censored && !control.outcome.censored);
  return Object.fromEntries(FIELDS.map(field => [field, summary(pairs.map(({ treatment, control }) => treatment.metrics[field] - control.metrics[field]), complete)]));
}
export function analyzeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length !== 4) throw new Error('work-headroom requires exactly four blocks');
  const sorted = [...blocks].sort((a, b) => a.block - b.block);
  const methods = methodDigests(), rows = [];
  for (const [index, block] of sorted.entries()) {
    if (block.schema !== 'facety-work-headroom-block/v1' || block.block !== index || block.designDigest !== digestOf(DESIGN) || digestOf(block.methodDigests) !== digestOf(methods) || digestOf(block.source) !== digestOf(DESIGN.source) || !/^[a-f0-9]{40}$/.test(block.captureCommit) || block.captureCommit !== sorted[0].captureCommit || block.rows.length !== 24) throw new Error('work-headroom source/method/matrix mismatch');
    const seen = new Set();
    for (const row of block.rows) {
      const population = DESIGN.populations.find(value => value.id === row.population);
      const resource = DESIGN.resources.find(value => value.id === row.resource);
      const arm = DESIGN.arms.find(value => value.id === row.arm);
      const key = JSON.stringify([row.population, row.resource, row.evidence, row.arm]);
      if (!population || !resource || !arm || !DESIGN.evidence.includes(row.evidence) || row.timing !== DESIGN.timing || row.calendar !== 'all-ticks' || row.seed !== DESIGN.seeds[index] || seen.has(key)) throw new Error('work-headroom case matrix mismatch');
      seen.add(key);
      const config = caseConfig(DESIGN, row.seed, population, resource, row.evidence, arm);
      if (row.configDigest !== digestOf(config) || digestOf(row.randomness) !== digestOf(DESIGN.randomness[row.evidence]) || !Array.isArray(block.assumptions[row.evidence]) || row.assumptionsDigest !== digestOf(block.assumptions[row.evidence]) || digestOf(block.assumptions[row.evidence]) !== digestOf(sorted[0].assumptions[row.evidence])) throw new Error('work-headroom config/policy/assumptions mismatch');
      validateRow(row, population, arm, config);
      validateWork(row, config, DESIGN);
      const hours = row.daily.map(point => point.atHour);
      if (!Number.isSafeInteger(row.outcome.completedDays) || row.outcome.completedDays < 0 || row.outcome.completedDays > Math.floor(row.outcome.elapsedHours / 24) || (!row.outcome.censored && (row.outcome.completedDays !== config.days || row.outcome.success === null)) || hours.some((hour, i) => !Number.isSafeInteger(hour) || hour <= 0 || hour % 24 || hour > row.outcome.elapsedHours || (i && hour <= hours[i - 1]))) throw new Error('work-headroom outcome/endpoint mismatch');
      const metrics = measure(row, population);
      if (FIELDS.some(field => !Number.isFinite(metrics[field]) || metrics[field] < 0)) throw new Error('work-headroom invalid metric');
      rows.push({ ...row, metrics });
    }
  }
  const find = (population, resource, evidence, arm, seed) => rows.find(row => row.population === population.id && row.resource === resource.id && row.evidence === evidence && row.arm === arm && row.seed === seed);
  const cells = [], resourceEffects = [], evidenceEffects = [], vetoEffects = [];
  const reference = DESIGN.resources.find(resource => resource.id === 'generous-reference');
  for (const population of DESIGN.populations) {
    for (const resource of DESIGN.resources) {
      for (const evidence of DESIGN.evidence) for (const arm of DESIGN.arms) {
        const cases = DESIGN.seeds.map(seed => find(population, resource, evidence, arm.id, seed));
        cells.push({ population: population.id, resource: resource.id, evidence, arm: arm.id, completeRuns: cases.filter(row => !row.outcome.censored).length,
          metricApplicability: population.descendantsGenuine ? 'False-identity zeros are structural; genuine-coalition invitation harm is not overall welfare.' : 'False identity outcomes do not measure real-person collusion or genuine newcomer harm.',
          metrics: Object.fromEntries(FIELDS.map(field => [field, summary(cases.map(row => row.metrics[field]), cases.every(row => !row.outcome.censored))])),
          process: cases.map(row => ({ seed: row.seed, ...row.process })),
          firstDeniedSamples: cases.map(row => ({ seed: row.seed, elapsedHours: row.outcome.elapsedHours, censored: row.outcome.censored,
            cohorts: Object.fromEntries(['honest', 'attackers'].map(cohort => {
              const first = row.denialTrace.find(point => point.cohorts[cohort].deniedDelta > 0);
              return [cohort, first ? { atHour: first.atHour, stage: first.stage, byActionDeniedDeltas: first.cohorts[cohort].byActionDeniedDeltas } : null];
            })),
          })),
        });
        if (resource !== reference) {
          const pairs = DESIGN.seeds.map(seed => ({ treatment: find(population, resource, evidence, arm.id, seed), control: find(population, reference, evidence, arm.id, seed) }));
          resourceEffects.push({ population: population.id, resource: resource.id, evidence, arm: arm.id, contrast: resource.id + '-minus-generous-reference', metrics: contrast(pairs) });
        }
      }
      for (const arm of DESIGN.arms) {
        const pairs = DESIGN.seeds.map(seed => ({ treatment: find(population, resource, 'shared-target', arm.id, seed), control: find(population, resource, 'independent', arm.id, seed) }));
        evidenceEffects.push({ population: population.id, resource: resource.id, arm: arm.id, contrast: 'shared-target-minus-independent', metrics: contrast(pairs) });
      }
      for (const evidence of DESIGN.evidence) {
        const pairs = DESIGN.seeds.map(seed => ({ treatment: find(population, resource, evidence, 'veto', seed), control: find(population, resource, evidence, 'observe-only', seed) }));
        for (const { treatment, control } of pairs) {
          if (treatment.outcome.censored || control.outcome.censored) continue;
          const cut = treatment.state.events.findIndex(event => event.type === 'invitation-cancelled');
          if (cut < 0 ? digestOf(treatment.state) !== digestOf(control.state) : digestOf(treatment.state.events.slice(0, cut)) !== digestOf(control.state.events.slice(0, cut))) throw new Error('work-headroom veto-event prefix mismatch');
        }
        vetoEffects.push({ population: population.id, resource: resource.id, evidence, contrast: 'veto-minus-observe-only',
          completeEventPrefixChecks: pairs.filter(({ treatment, control }) => !treatment.outcome.censored && !control.outcome.censored).length,
          censoredPrefixChecksSkipped: pairs.filter(({ treatment, control }) => treatment.outcome.censored || control.outcome.censored).length,
          metrics: contrast(pairs),
        });
      }
    }
  }
  return { schema: 'facety-work-headroom-analysis/v1', level: DESIGN.level, designDigest: digestOf(DESIGN), methodDigests: methods, captureCommit: sorted[0].captureCommit,
    cases: rows.length, cells, resourceEffects, evidenceEffects, vetoEffects,
    harmCoverage: 'Declared genuine-coalition invitation harm only; lawful free veto is not adjudicated misconduct. No unaffiliated recruitment/ordinary Self-ID/useful growth/welfare assessment.',
    interpretation: ['Four fixed labels, raw values/ranges/descriptive contrasts only; no calibrated attack probabilities or mechanism confirmation. Denial traces contain overlapping tick/day streams; do not sum them or infer exact within-tick denial order.', ...DESIGN.interpretation],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('work-headroom analysis accepts no input/output/policy overrides');
  const report = analyzeBlocks([0, 1, 2, 3].map(index => JSON.parse(readFileSync(new URL('block-' + index + '.json', import.meta.url)))));
  writeFileSync(new URL('report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ cases: report.cases, cells: report.cells.length, complete: report.cells.reduce((sum, cell) => sum + cell.completeRuns, 0) }));
}
