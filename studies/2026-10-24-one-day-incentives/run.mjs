import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INCENTIVE_STRATEGIES, readIncentiveComparisons, runOneDayIncentiveForks } from '../../src/incentives.mjs';
import { evaluateIncentivePayoffs } from '../../src/incentive-payoffs.mjs';
import { compareIncentiveOwnership } from '../../src/incentive-ownership.mjs';
import { digestOf, provenance } from '../../src/provenance.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RUNNER_PATH = 'studies/2026-10-24-one-day-incentives/run.mjs';
const MODES = ['terminal', 'immediate'];
const EXPECTED_SOURCE = {
  implementation: { method: 'sha256-src-mjs-v1', digest: '6e94fb9d4c886078011b08aae0e8a701267c9984d90fa03353a4661ee95d1d19', files: 27 },
  runtime: { node: 'v26.8.1' },
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const runnerHash = () => sha256(readFileSync(new URL('./run.mjs', import.meta.url)));

export function reportDesign() {
  const preferences = overrides => ({
    facyValue: 1, xpValue: 0, workUnitCost: 1, admissionBenefit: 0, guaranteeBenefit: 0,
    expectedLosses: { 'invite-only': 0, 'invite-and-guarantee': 0 }, ...overrides,
  });
  return {
    schema: 'facety-p23-incentive-design/v1', method: 'diagnostic-fixed-scripts-and-conditional-terminal-arithmetic',
    nativeSource: structuredClone(EXPECTED_SOURCE),
    modes: [{ xpFinality: 'terminal', role: 'selected-reference' }, { xpFinality: 'immediate', role: 'counterfactual-not-protocol-option' }],
    strategies: [...INCENTIVE_STRATEGIES], horizonHour: 72, checkpoints: [0, 24, 48, 48, 72],
    sampling: 'Two deterministic mode artifacts, each replaying three funded scripts. No sampled seeds, replicates, p-values or confidence intervals.',
    valuationCases: [
      { id: 'zero-value-control', preferences: preferences({ facyValue: 0, workUnitCost: 0 }) },
      { id: 'cash-only', preferences: preferences({ workUnitCost: 0 }) },
      { id: 'cash-and-work', preferences: preferences({}) },
      { id: 'cash-tenfold', preferences: preferences({ facyValue: 10 }) },
      { id: 'xp-unit', preferences: preferences({ xpValue: 1 }) },
      { id: 'xp-tenfold', preferences: preferences({ xpValue: 10 }) },
      { id: 'admission-unit', preferences: preferences({ admissionBenefit: 1 }) },
      { id: 'guarantee-unit', preferences: preferences({ guaranteeBenefit: 1 }) },
      { id: 'added-loss-unit', preferences: preferences({ expectedLosses: { 'invite-only': 1, 'invite-and-guarantee': 1 } }) },
      { id: 'avoided-loss-unit', preferences: preferences({ expectedLosses: { 'invite-only': -1, 'invite-and-guarantee': -1 } }) },
      { id: 'unknown-xp', preferences: preferences({ xpValue: null }) },
      { id: 'unknown-losses', preferences: preferences({ expectedLosses: { 'invite-only': null, 'invite-and-guarantee': null } }) },
      { id: 'unknown-benefits', preferences: preferences({ admissionBenefit: null, guaranteeBenefit: null }) },
      { id: 'all-unknown', preferences: { facyValue: null, xpValue: null, workUnitCost: null, admissionBenefit: null, guaranteeBenefit: null, expectedLosses: { 'invite-only': null, 'invite-and-guarantee': null } } },
    ],
    valuationBoundary: 'Supplied 0/1/10 unit contrasts, signed incremental losses and null controls; not calibrated prices, preference estimates or data-chosen break-even points. Existing analysis computes thresholds from fresh facts.',
    ownershipBoundary: 'Retain both existing evaluator worlds and per-subject XP; no operator utility aggregator, live fabricated admission or pooled procedural authority.',
    timingBoundary: 'First credited checkpoint is a sparse retained observation, not an independently measured exact XP-credit timestamp. Do not filter same-hour work by time and spill newcomer Self-ID into the admission checkpoint.',
    inferenceBoundary: 'Encoded accounting, not emergent mechanism, voluntary retention, equilibrium, personhood, calibrated risk, useful distribution, D33 or D34. Unknown expected losses never become zero from observed debt.',
  };
}

function checkSource(source) {
  if (!isDeepStrictEqual(source, EXPECTED_SOURCE)) throw new Error('P23 source/runtime changed; a new committed design is required');
}

function physicalProjection(artifact) {
  return INCENTIVE_STRATEGIES.map(strategy => {
    const branch = artifact.branches.find(row => row.strategy === strategy);
    return {
      strategy, actions: branch.actions, work: branch.work, events: branch.events,
      timeline: branch.timeline.map(({ council, subjects, selfIds, ...point }) => ({
        ...point, subjects: subjects.map(({ xp, ...subject }) => subject),
        selfIds: selfIds.map(({ xpCredited, ...act }) => act),
      })),
    };
  });
}

export function analyzeRaw(raw) {
  const design = reportDesign();
  if (raw?.schema !== 'facety-p23-incentive-input/v1' || raw.designDigest !== digestOf(design)
    || raw.runnerSha256 !== runnerHash()) throw new Error('P23 input design/runner identity mismatch');
  if (!Array.isArray(raw.artifacts) || raw.artifacts.length !== MODES.length
    || new Set(raw.artifacts.map(row => row.xpFinality)).size !== MODES.length
    || raw.artifacts.some(row => !MODES.includes(row.xpFinality))) throw new Error('P23 modes must be complete and unique');
  const ordered = MODES.map(mode => raw.artifacts.find(row => row.xpFinality === mode));
  const modes = ordered.map(({ xpFinality, artifact }) => {
    if (artifact?.schema !== 'facety-incentive-forks/v2' || artifact.fixture !== 'marginal-admission-24h-v1'
      || artifact.policy?.xpFinality !== xpFinality) throw new Error('P23 requires the declared one-day mode');
    checkSource(artifact.provenance);
    const facts = readIncentiveComparisons(artifact);
    const branches = INCENTIVE_STRATEGIES.map(strategy => artifact.branches.find(row => row.strategy === strategy));
    return {
      xpFinality, role: design.modes.find(row => row.xpFinality === xpFinality).role,
      source: structuredClone({ schema: artifact.schema, fixture: artifact.fixture, policy: artifact.policy, schedule: artifact.schedule, provenance: artifact.provenance }),
      facts,
      checkpoints: branches.flatMap(branch => branch.timeline.map(point => structuredClone({ ...point, strategy: branch.strategy }))),
      creditCheckpoints: branches.map(branch => ({
        strategy: branch.strategy,
        acts: branch.timeline.at(-1).selfIds.map(act => ({
          selfId: act.id, subject: act.subject, recordedAt: act.recordedAt, xpRecipients: [...act.xpRecipients],
          firstCreditedCheckpoint: branch.timeline.filter(point => point.selfIds.some(row => row.id === act.id && row.xpCredited)).map(({ stage, atHour }) => ({ stage, atHour }))[0] ?? null,
        })),
      })),
      valuations: design.valuationCases.map(({ id, preferences }) => ({ id, analysis: evaluateIncentivePayoffs(artifact, preferences) })),
      ownership: compareIncentiveOwnership(artifact),
    };
  });
  if (!isDeepStrictEqual(physicalProjection(ordered[0].artifact), physicalProjection(ordered[1].artifact))) throw new Error('P23 XP modes must hold physical inputs/work/accounting fixed');
  return {
    schema: 'facety-p23-incentive-report/v1', designDigest: raw.designDigest, inputDigest: digestOf(raw),
    analysisSource: { provenance: provenance(), runnerSha256: runnerHash(), matchesPinnedSource: isDeepStrictEqual(provenance(), EXPECTED_SOURCE) },
    design, modes,
    counts: {
      modeArtifacts: modes.length, nativeBranches: modes.reduce((sum, mode) => sum + mode.creditCheckpoints.length, 0),
      checkpointRows: modes.reduce((sum, mode) => sum + mode.checkpoints.length, 0),
      payoffAnalyses: modes.reduce((sum, mode) => sum + mode.valuations.length, 0),
      sponsorComparisons: modes.reduce((sum, mode) => sum + mode.valuations.reduce((total, row) => total + row.analysis.comparisons.length, 0), 0),
      ownershipAnalyses: modes.length, evaluatorWorlds: modes.reduce((sum, mode) => sum + mode.ownership.worlds.length, 0),
      evaluatorBranchOutcomes: modes.reduce((sum, mode) => sum + mode.ownership.worlds.reduce((total, world) => total + world.branches.length, 0), 0),
    },
    interpretation: design.inferenceBoundary,
  };
}

function committedRunner() {
  let committed;
  try { committed = execFileSync('git', ['show', 'HEAD:' + RUNNER_PATH], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('P23 runner must be committed unchanged before execution'); }
  if (sha256(committed) !== runnerHash()) throw new Error('P23 runner must be committed unchanged before execution');
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

export function runStudy(outputDirectory = fileURLToPath(new URL('./results/', import.meta.url))) {
  if (typeof outputDirectory !== 'string' || !outputDirectory.length) throw new Error('P23 output directory must be a nonempty path');
  if (existsSync(outputDirectory)) throw new Error('P23 output directory already exists; no overwrite or automatic retry');
  const commit = committedRunner();
  checkSource(provenance());
  mkdirSync(outputDirectory);
  const raw = {
    schema: 'facety-p23-incentive-input/v1', designDigest: digestOf(reportDesign()), runnerSha256: runnerHash(),
    artifacts: MODES.map(xpFinality => ({ xpFinality, artifact: runOneDayIncentiveForks({ xpFinality }) })),
  };
  const write = (name, value) => {
    const bytes = JSON.stringify(value, null, 2) + '\n';
    writeFileSync(resolve(outputDirectory, name), bytes, { flag: 'wx' });
    return { name, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) };
  };
  // Retain raw evidence before analysis; a failed/partial directory is not automatically replayed.
  const rawFile = write('raw.json', raw);
  const report = analyzeRaw(raw);
  const reportFile = write('report.json', report);
  const manifest = {
    schema: 'facety-p23-incentive-manifest/v1', status: 'complete', runner: { path: RUNNER_PATH, commit, sha256: runnerHash() },
    provenance: provenance(), design: reportDesign(), designDigest: raw.designDigest, files: [rawFile, reportFile], counts: report.counts,
    assurance: 'Author-coordinated diagnostic execution; not independent review, preregistered mechanism confirmation or calibrated human evidence.',
  };
  write('manifest.json', manifest);
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 2) throw new Error('P23 runner accepts no CLI overrides');
    console.log(JSON.stringify(runStudy(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
