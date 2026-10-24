// Owns: One fixed source-bound timing-policy comparison; excludes calibration and historical replay.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runExperiment } from '../../src/experiment.mjs';
import { experimentConfig, experimentRandomness } from '../../src/experiment-config.mjs';
import { digestOf, implementationDigest } from '../../src/provenance.mjs';
import { caseConfig, projectRun, METHOD_FILES, methodDigests } from './contract.mjs';

const SOURCE = '5070d49ac2a99edd707d84adb80afb3a28d000098133657de5b6dfe23d6eb2e5';
const DIRECTORY = new URL('./', import.meta.url);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PREFIX = 'studies/2026-10-24-attended-comparison/';
export function studyDesign() {
  const base = experimentConfig({ stepHours: 4, initialSize: 12, initialTopology: 'clique', attackerShare: 0.25, days: 7, maxSubjects: 200, maxActions: 100000, includeState: true, activity: { honest: { invite: 0, inspect: 0, review: 1 } } });
  return {
    schema: 'facety-attended-comparison-design/v1', level: 'exploratory-diagnostic-not-confirmation',
    source: { baseCheckpoint: 'edc6c0f', implementation: SOURCE, node: 'v26.8.1' },
    seeds: ['d44-attended-compare-01', 'd44-attended-compare-02', 'd44-attended-compare-03', 'd44-attended-compare-04'],
    populations: [
      { id: 'fabricated-descendants', scenario: 'sybil-cone', descendantsGenuine: false, criterion: 'false-liquidity' },
      { id: 'genuine-coalition-descendants', scenario: 'real-cartel', descendantsGenuine: true, criterion: 'council-majority' },
    ],
    calendars: [{ id: 'all-ticks', offset: null }, { id: 'one-tick-phase-0', offset: 0 }, { id: 'one-tick-phase-4', offset: 1 }],
    timings: ['daily-slot', 'first-attended'], arms: [{ id: 'observe-only', disabled: true }, { id: 'veto', disabled: false }],
    randomness: Object.fromEntries(['daily-slot', 'first-attended'].map(invitationReviewTiming => [invitationReviewTiming, experimentRandomness({ ...base, invitationReviewTiming })])),
    base,
    interpretation: [
      'Exactly four new fixed labels, 96 seven-day cases: two supplied descendant classes, three calendars, two timing policies and two veto-effect arms. No seed search, historical recapture or data-dependent extension.',
      'Initial twelve operators are declared genuine trusted clique roots, including three coalition operators. Descendants are fabricated shared-operator subjects or declared genuine recruited operators; coordination alone is not misconduct. These are evaluator assumptions, never protocol judgments or authenticated personhood.',
      'Initial subject i has unrestricted attention or one tick/day at 4*((i+offset)%6); offset 1 rotates by four hours. IDs define calendars, never evaluator roles. Transactions remain unrestricted. Honest invitations/general Self-ID inspection are zero in every case; new coalition descendants review zero, keeping the honest reviewer pool calendar-covered.',
      'The genuine-only control evaluates erroneous invitation vetoes against genuine coalition descendants, not unaffiliated honest growth, ordinary Self-ID harm, overall welfare or sustained useful participation. Zero false-identity outcomes there are structural, not defense success.',
      'Daily trial units, sensitivity 0.8/FPR 0.01, unit action weights and whole-run caps remain fixed across timing/effect arms. Real recruitment/fabrication/acquisition costs and private utility remain unknown; genuine operators and fabricated subjects are not equal human resources.',
      'The first-attended policy is a behavioral counterfactual, not a new default, human reaction law or protocol change. It shares count keys, not actual review times or necessarily invitation IDs after divergence. Observation keys include time: moving a review can reveal different noisy evidence, not identical received signals.',
      'Observe-only removes only veto effect. Match native-event prefixes before the first changed cancellation within each policy; subsequent populations, work and source keys may diverge. Net costs are not marginal per-cancellation prices.',
      'Full native states, stage/evaluator counts, money/debt/ledger, cohort effort, daily endpoints and horizon-open invitations are retained. Complete runs need not complete pending invitation lifetimes; censored cells retain raw values but not complete means.',
      'Native outcome criteria differ between populations and are not aggregated into a cross-population success or health rate. False emission/XP, genuine harm, work, nominal sanctions and actual money stay separate.',
      'Dense inherited trust, independent noisy evidence, public pending-list awareness, unstrained budgets and scripted response remain assumptions. No sparse/shared-error/finite-capacity calibration, endogenous vigilance, real cost-of-attack condition, verified independence, D33/D34/D42 implementation or mechanism confirmation follows.',
    ],
  };
}

export function runBlock(index) {
  if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('comparison requires fixed block index 0..3');
  if (implementationDigest().digest !== SOURCE || process.version !== 'v26.8.1') throw new Error('comparison requires its original source/runtime; no drift override');
  const design = studyDesign();
  if (digestOf(design) !== digestOf(JSON.parse(readFileSync(new URL('design.json', DIRECTORY))))) throw new Error('fixed comparison design changed');
  for (const file of METHOD_FILES) if (execFileSync('git', ['show', 'HEAD:' + PREFIX + file], { cwd: ROOT, encoding: 'utf8' }) !== readFileSync(new URL(file, DIRECTORY), 'utf8')) throw new Error('comparison method must be committed unchanged before capture: ' + file);
  const binding = { block: index, captureCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), designDigest: digestOf(design), methodDigests: methodDigests(), source: design.source };
  writeFileSync(new URL('attempt-' + index + '.json', DIRECTORY), JSON.stringify(binding) + '\n', { flag: 'wx' });
  const rows = [];
  const assumptions = {};
  for (const population of design.populations) for (const calendar of design.calendars) for (const timing of design.timings) for (const arm of design.arms) {
    const config = caseConfig(design, design.seeds[index], population, calendar, timing, arm);
    let run = null;
    try {
      run = runExperiment(config);
      rows.push(projectRun(run, population, calendar, timing, arm));
      if (digestOf(run.config) !== digestOf(config) || digestOf(run.randomness) !== digestOf(design.randomness[timing]) || run.provenance.implementation.digest !== SOURCE) throw new Error('native comparison config/policy/source mismatch');
      assumptions[timing] ??= run.assumptions;
      if (digestOf(assumptions[timing]) !== digestOf(run.assumptions)) throw new Error('comparison assumptions unexpectedly differ');
    } catch (error) {
      writeFileSync(new URL('failed-' + index + '.json', DIRECTORY), JSON.stringify({ schema: 'facety-attended-comparison-failed/v1', ...binding, rows, assumptions, failedCase: { population: population.id, calendar: calendar.id, timing, arm: arm.id, config }, nativeReturn: run, error: { name: error?.name ?? 'Error', message: String(error?.message ?? error) } }) + '\n', { flag: 'wx' });
      throw error;
    }
  }
  return { schema: 'facety-attended-comparison-block/v1', ...binding, assumptions, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || !/^[0-3]$/.test(process.argv[2])) throw new Error('comparison accepts one fixed block index, no scenario/output/drift overrides');
  const index = Number(process.argv[2]);
  const block = runBlock(index);
  const text = JSON.stringify(block) + '\n';
  writeFileSync(new URL('block-' + index + '.json', DIRECTORY), text, { flag: 'wx' });
  console.log(JSON.stringify({ block: index, cases: block.rows.length, bytes: Buffer.byteLength(text) }));
}
