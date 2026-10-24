// Owns: Exclusive fixed work-headroom captures; excludes new economic rules, calibration and historical replay.
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
  const setup = effort => ({ attempts: effort, accepted: effort, rejected: 0, denied: 0, effort });
  return {
    schema: 'facety-work-headroom-design/v1', level: 'exploratory-diagnostic-not-confirmation',
    source: { baseCheckpoint: '6d27bf9', implementation: SOURCE, node: 'v26.8.1' },
    seeds: ['d44-work-headroom-01', 'd44-work-headroom-02', 'd44-work-headroom-03', 'd44-work-headroom-04'],
    populations: [
      { id: 'fabricated-descendants', scenario: 'sybil-cone', descendantsGenuine: false, criterion: 'false-liquidity' },
      { id: 'genuine-coalition-descendants', scenario: 'real-cartel', descendantsGenuine: true, criterion: 'council-majority' },
    ],
    resources: [{ id: 'headroom-63', cap: 261, nominalPostSetup: 63 }, { id: 'headroom-126', cap: 324, nominalPostSetup: 126 }, { id: 'generous-reference', cap: 100000, nominalPostSetup: 99802 }],
    bootstrap: { atHour: 0, stage: 'initial', subjects: 12, guaranteeEdges: 132, totalXp: 0, xpGini: null, cohorts: { honest: setup(198), attackers: setup(66) } },
    timing: 'first-attended', evidence: ['independent', 'shared-target'],
    arms: [{ id: 'observe-only', disabled: true }, { id: 'veto', disabled: false }],
    randomness: Object.fromEntries(['independent', 'shared-target'].map(invitationEvidence => [invitationEvidence, experimentRandomness({ ...base, invitationEvidence })])),
    base,
    interpretation: [
      'Exactly four fresh labels and 96 seven-day four-hour cases: two declared descendant classes, three honest-cohort whole-run caps, two first-stage evidence laws and two veto-effect arms. No seed search, historical recapture or data-dependent extension.',
      'All-ticks attention and unrestricted transactions; first-attended timing stays fixed. Honest invitations/general Self-ID inspection, descendant review and verification are disabled. These inherited public-awareness/willingness scripts are not human availability, finite service capacity or liability-induced vigilance.',
      'Twelve declared genuine clique roots include three genuine coalition operators. Each root pays 22 unit setup actions (11 proposals plus 11 confirmations): 198 honest and 66 coalition work, 132 active directed guarantees. Retain identical fully funded initial samples; low budgets must not produce an unfunded genesis. No initial money/XP or authentic personhood is inferred.',
      'Honest caps are 198+9*7=261, 198+2*9*7=324 and 100000. Nominal post-setup headrooms 63/126/99802 are a whole-cohort/run counterfactual, not per-person/daily grants, measured human capacity or a refill. Coalition cap stays 100000; unit weights remain uncalibrated.',
      'The whole honest work pool covers Self-ID, guarantee, conversion, inspection and response work. Cutting it can alter activity, eligibility, population, graph and available sources as well as review; this is not isolated attention scarcity, a pure marginal veto price, a utility equilibrium or a real attack-acquisition cost model.',
      'Economic budget denial is not a computational censor: complete runs retain all denials and outcomes. maxSubjects/maxActions safety caps retain partial raw measurements; complete means are null for censored cells/pairs. Extra denied calls also consume the declared global action-call cap.',
      'Capture retains full final state/events, invitation/evaluator stages, complete effort by cohort/action/phase, money/system/ledger/XP, daily endpoints, funded initial sample and all denial-sample traces. Day-end and tick streams overlap and must not be summed as disjoint work. First denied sample is an observation time, not exact within-tick action order; null through a partial prefix is not guaranteed future capacity.',
      'Nominal first-look sensitivity 0.8/FPR 0.01 are not calibrated covariance or identical received bits. Shared-target is an extremal persistent target-specific first stage; other observations retain separate references. Changed budgets/keys after trajectory divergence need not refer to the same later people/opportunities.',
      'Genuine-coalition invitation harm is separate from fabricated outcomes. Coordination is not misconduct; genuine false-identity zeros are structural, not defense success. Criteria false-liquidity versus Council-majority are never pooled into a universal success/health score. Useful growth, unaffiliated recruitment and ordinary Self-ID harm are not tested.',
      'Compare lower caps minus generous reference within each population/law/effect arm, plus within-cap evidence/effect contrasts. Match event prefixes only for veto versus effect-disabled within a cap/law before the first changed cancellation; skip/count censored prefix checks.',
      'Dense inherited trust, raw active-degree/fixed Council, current-link liability and terminal XP/unspent veto remain legacy, not D33/D34/D42 compliance. Sparse/compromised support, adversarial/calibrated evidence, notification, voluntary retention and real private liabilities remain untested.',
      'Commit seven new/imported method/config byte identities and pin native source/runtime before capture. Frozen F51 measurement validation is reused with new bootstrap/resource/trace checks, not old data or F53 scarcity-incompatible reconstruction. No authentication, independent acceptance, calibrated probability, new default/protocol rule or mechanism confirmation follows.',
    ],
  };
}

export function runBlock(index) {
  if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('work-headroom requires fixed block index 0..3');
  if (implementationDigest().digest !== SOURCE || process.version !== 'v26.8.1') throw new Error('work-headroom requires original source/runtime; no drift override');
  const design = studyDesign();
  if (digestOf(design) !== digestOf(JSON.parse(readFileSync(new URL('design.json', DIRECTORY))))) throw new Error('work-headroom design changed');
  for (const file of METHOD_FILES) if (!execFileSync('git', ['show', 'HEAD:' + file], { cwd: fileURLToPath(ROOT) }).equals(readFileSync(new URL(file, ROOT)))) throw new Error('work-headroom method must be committed unchanged: ' + file);
  const saved = file => existsSync(new URL(file, DIRECTORY));
  const incomplete = [0, 1, 2, 3].some(i => saved('attempt-' + i + '.json') !== saved('block-' + i + '.json'));
  if (incomplete || [...[0, 1, 2, 3].map(i => 'failed-' + i + '.json'), 'report.json', 'attempt-' + index + '.json', 'block-' + index + '.json'].some(saved)) throw new Error('work-headroom existing/failed capture; stop, no retry');
  const binding = { block: index, captureCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(ROOT), encoding: 'utf8' }).trim(), designDigest: digestOf(design), methodDigests: methodDigests(), source: design.source };
  writeFileSync(new URL('attempt-' + index + '.json', DIRECTORY), JSON.stringify(binding) + '\n', { flag: 'wx' });
  const rows = [], assumptions = {};
  let failedCase = null, nativeReturn = null, phase = 'case-execution';
  try {
    for (const population of design.populations) for (const resource of design.resources) for (const evidence of design.evidence) for (const arm of design.arms) {
      const config = caseConfig(design, design.seeds[index], population, resource, evidence, arm);
      failedCase = { population: population.id, resource: resource.id, evidence, arm: arm.id, config };
      nativeReturn = null;
      nativeReturn = runExperiment(config);
      const row = projectRun(nativeReturn, population, resource, evidence, arm);
      rows.push(row);
      if (digestOf(row.bootstrap) !== digestOf(design.bootstrap)) throw new Error('work-headroom funded bootstrap mismatch');
      if (digestOf(nativeReturn.config) !== digestOf(config) || digestOf(nativeReturn.randomness) !== digestOf(design.randomness[evidence]) || nativeReturn.provenance.implementation.digest !== SOURCE) throw new Error('work-headroom native config/policy/source mismatch');
      assumptions[evidence] ??= nativeReturn.assumptions;
      if (digestOf(assumptions[evidence]) !== digestOf(nativeReturn.assumptions)) throw new Error('work-headroom assumptions differ');
    }
    phase = 'block-write'; failedCase = null; nativeReturn = null;
    const block = { schema: 'facety-work-headroom-block/v1', ...binding, assumptions, rows };
    writeFileSync(new URL('block-' + index + '.json', DIRECTORY), JSON.stringify(block) + '\n', { flag: 'wx' });
    return block;
  } catch (error) {
    writeFileSync(new URL('failed-' + index + '.json', DIRECTORY), JSON.stringify({ schema: 'facety-work-headroom-failed/v1', ...binding, phase, rows, assumptions, failedCase, nativeReturn, error: { name: error?.name ?? 'Error', message: String(error?.message ?? error) } }) + '\n', { flag: 'wx' });
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || !/^[0-3]$/.test(process.argv[2])) throw new Error('work-headroom accepts one block index; no scenario/output/drift overrides');
  const block = runBlock(Number(process.argv[2]));
  console.log(JSON.stringify({ block: block.block, cases: block.rows.length }));
}
