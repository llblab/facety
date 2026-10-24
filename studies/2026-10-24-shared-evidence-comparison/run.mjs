// Owns: Exclusive fixed shared-evidence captures; excludes calibration, historical replay and mechanism confirmation.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runExperiment } from '../../src/experiment.mjs';
import { experimentConfig, experimentRandomness } from '../../src/experiment-config.mjs';
import { digestOf, implementationDigest } from '../../src/provenance.mjs';
import { caseConfig, projectRun, METHOD_FILES, methodDigests } from './contract.mjs';

const SOURCE = '50a20767e9e4829bdb1ba4aaf8b4fda0388faf5d22c70ded04a8d266b87dd3c3';
const DIRECTORY = new URL('./', import.meta.url);
const ROOT = new URL('../../', import.meta.url);
export function studyDesign() {
  const base = experimentConfig({ stepHours: 4, invitationReviewTiming: 'first-attended', initialSize: 12, initialTopology: 'clique', attackerShare: 0.25, days: 7, maxSubjects: 200, maxActions: 100000, includeState: true, activity: { honest: { invite: 0, inspect: 0, review: 1 }, attackers: { review: 0 } }, social: { verification: false } });
  return {
    schema: 'facety-shared-evidence-design/v1', level: 'exploratory-diagnostic-not-confirmation',
    source: { baseCheckpoint: 'fbc8a43', implementation: SOURCE, node: 'v26.8.1' },
    seeds: ['d44-shared-evidence-01', 'd44-shared-evidence-02', 'd44-shared-evidence-03', 'd44-shared-evidence-04'],
    populations: [
      { id: 'fabricated-descendants', scenario: 'sybil-cone', descendantsGenuine: false, criterion: 'false-liquidity' },
      { id: 'genuine-coalition-descendants', scenario: 'real-cartel', descendantsGenuine: true, criterion: 'council-majority' },
    ],
    calendars: [{ id: 'all-ticks', offset: null }, { id: 'one-tick-phase-0', offset: 0 }],
    timing: 'first-attended', evidence: ['independent', 'shared-target'],
    arms: [{ id: 'observe-only', disabled: true }, { id: 'veto', disabled: false }],
    randomness: Object.fromEntries(['independent', 'shared-target'].map(invitationEvidence => [invitationEvidence, experimentRandomness({ ...base, invitationEvidence })])),
    base,
    interpretation: [
      'Exactly four new fixed labels, 64 seven-day four-hour cases. Timing is first-attended throughout; no daily-slot, six-hour, phase-4 or horizon extension. No seed search or historical replay.',
      'Two supplied descendant classes, two initial-ID calendars, two first-stage signal laws and two veto-effect arms. Twelve declared genuine trusted clique roots include three genuine coalition operators. Fabricated descendants share an operator; genuine recruits are declared operators. Coordination alone is not misconduct or authenticated personhood.',
      'Sensitivity 0.8/FPR 0.01 are nominal single-look probabilities, not measured covariance or received-evidence equality. Shared-target persists per public target across reviewers/times; different IDs are separately keyed, not verified independent humans. Switching modes changes actual signal keys even at the same first-look time; post-divergence IDs/graphs need not describe the same later opportunities.',
      'Shared-target is an extremal target-specific first-stage common-mode counterfactual, not a full shared-media/observer/network-wide/adversarial evidence process. Other observations retain their reference keys. Verification is disabled; no fallback is invented after a negative first stage.',
      'All-ticks attention or one tick/day at 4*(initial index%6); transaction availability is unrestricted. Honest invitations/general Self-ID inspection and descendant review are zero. Public pending-list awareness and willingness are inherited scripts, not notification, human capacity or liability-derived incentives.',
      'Genuine-coalition invitation veto harm is measured separately from structural false-identity zeros. This does not test unaffiliated honest recruitment, ordinary Self-ID harm, usefulness, voluntary retention or welfare. Initial genuine coalition operators remain a separate real-person collusion risk.',
      'Daily pair trials, unit work weights, whole-run 100000-unit cohort budgets, protocol authority/windows and safety caps remain fixed. Net cost/XP differences include downstream trajectories, not marginal veto prices, calibrated human work or real attack-acquisition/private liability costs.',
      'Dense inherited support, raw active-degree/fixed Council, current-link liability, terminal XP and unspent veto remain legacy references, not D33/D34/D42 compliance. Ordinary XP maturation, historical duties and revised merits/appeals are not selected here.',
      'Retain full native states/events, process/evaluator counts, effort, money/system/ledger, class-specific admissions/conversions/XP, genuine harm and daily endpoints. Run completion at 168 h need not finish horizon-open invitation lifetimes; censoring retains partial raw values but not complete means.',
      'Match native-event prefixes only within a given evidence law before its first effect-changing veto; skip/count censored prefix checks explicitly. Native success criteria differ across descendant classes and are not pooled into a success/health rate.',
      'Methods and every imported historical method/data dependency have separate raw-byte digests and committed-before-capture gates. Reusing frozen offline validation/projection does not migrate F51, authenticate inputs or supply independent reviewer acceptance.',
      'No p-values, calibrated population uncertainty, universal policy ranking, endogenous vigilance or registered mechanism confirmation. Sparse/compromised support, scarce work, additional error/timing contexts and application externalities remain untested.',
    ],
  };
}

export function runBlock(index) {
  if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('shared-evidence requires fixed block index 0..3');
  if (implementationDigest().digest !== SOURCE || process.version !== 'v26.8.1') throw new Error('shared-evidence requires original source/runtime; no drift override');
  const design = studyDesign();
  if (digestOf(design) !== digestOf(JSON.parse(readFileSync(new URL('design.json', DIRECTORY))))) throw new Error('shared-evidence design changed');
  for (const file of METHOD_FILES) if (!execFileSync('git', ['show', 'HEAD:' + file], { cwd: fileURLToPath(ROOT) }).equals(readFileSync(new URL(file, ROOT)))) throw new Error('shared-evidence method must be committed unchanged: ' + file);
  const saved = file => existsSync(new URL(file, DIRECTORY));
  const incomplete = Array.from({ length: 4 }, (_, i) => i).some(i => saved('attempt-' + i + '.json') !== saved('block-' + i + '.json'));
  if (incomplete || [...Array.from({ length: 4 }, (_, i) => 'failed-' + i + '.json'), 'report.json', 'attempt-' + index + '.json', 'block-' + index + '.json'].some(saved)) throw new Error('shared-evidence existing/failed capture; stop, no retry');
  const binding = { block: index, captureCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(ROOT), encoding: 'utf8' }).trim(), designDigest: digestOf(design), methodDigests: methodDigests(), source: design.source };
  writeFileSync(new URL('attempt-' + index + '.json', DIRECTORY), JSON.stringify(binding) + '\n', { flag: 'wx' });
  const rows = [];
  const assumptions = {};
  let failedCase = null, nativeReturn = null, phase = 'case-execution';
  try {
    for (const population of design.populations) for (const calendar of design.calendars) for (const evidence of design.evidence) for (const arm of design.arms) {
      const config = caseConfig(design, design.seeds[index], population, calendar, evidence, arm);
      failedCase = { population: population.id, calendar: calendar.id, evidence, arm: arm.id, config };
      nativeReturn = null;
      nativeReturn = runExperiment(config);
      rows.push(projectRun(nativeReturn, population, calendar, evidence, arm));
      if (digestOf(nativeReturn.config) !== digestOf(config) || digestOf(nativeReturn.randomness) !== digestOf(design.randomness[evidence]) || nativeReturn.provenance.implementation.digest !== SOURCE) throw new Error('shared-evidence native config/policy/source mismatch');
      assumptions[evidence] ??= nativeReturn.assumptions;
      if (digestOf(assumptions[evidence]) !== digestOf(nativeReturn.assumptions)) throw new Error('shared-evidence assumptions differ');
    }
    phase = 'block-write';
    failedCase = null;
    nativeReturn = null;
    const block = { schema: 'facety-shared-evidence-block/v1', ...binding, assumptions, rows };
    writeFileSync(new URL('block-' + index + '.json', DIRECTORY), JSON.stringify(block) + '\n', { flag: 'wx' });
    return block;
  } catch (error) {
    writeFileSync(new URL('failed-' + index + '.json', DIRECTORY), JSON.stringify({ schema: 'facety-shared-evidence-failed/v1', ...binding, phase, rows, assumptions, failedCase, nativeReturn, error: { name: error?.name ?? 'Error', message: String(error?.message ?? error) } }) + '\n', { flag: 'wx' });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || !/^[0-3]$/.test(process.argv[2])) throw new Error('shared-evidence accepts one block index; no scenario/output/drift overrides');
  const block = runBlock(Number(process.argv[2]));
  console.log(JSON.stringify({ block: block.block, cases: block.rows.length }));
}
