import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reportDesign, analyzeRaw, runStudy } from '../studies/2026-10-24-one-day-incentives/run.mjs';
import { runOneDayIncentiveForks, readIncentiveComparisons } from '../src/incentives.mjs';
import { evaluateIncentivePayoffs } from '../src/incentive-payoffs.mjs';
import { compareIncentiveOwnership } from '../src/incentive-ownership.mjs';
import { FacetyModel } from '../src/model.mjs';
import { digestOf, provenance } from '../src/provenance.mjs';

function fixture() {
  const design = reportDesign();
  return {
    schema: 'facety-p23-incentive-input/v1', designDigest: digestOf(design),
    runnerSha256: createHash('sha256').update(readFileSync(new URL('../studies/2026-10-24-one-day-incentives/run.mjs', import.meta.url))).digest('hex'),
    artifacts: design.modes.map(({ xpFinality }) => {
      const artifact = JSON.parse(JSON.stringify(runOneDayIncentiveForks({ xpFinality })));
      // Constructed software inputs, not retained science or authenticated historical provenance.
      // Keep these reader tests usable after unrelated native-source/runtime revisions.
      artifact.provenance = structuredClone(design.nativeSource);
      return { xpFinality, artifact };
    }),
  };
}

test('P23 report design fixes both mode roles and every valuation/unknown case without shared mutable defaults', () => {
  const design = reportDesign();
  assert.deepEqual(design.modes.map(row => row.xpFinality), ['terminal', 'immediate']);
  assert.equal(design.modes[0].role, 'selected-reference');
  assert.match(design.modes[1].role, /counterfactual/);
  assert.equal(design.valuationCases.length, 14);
  assert.equal(new Set(design.valuationCases.map(row => row.id)).size, 14);
  assert.deepEqual(design.checkpoints, [0, 24, 48, 48, 72]);
  assert.equal(design.valuationCases.find(row => row.id === 'unknown-losses').preferences.expectedLosses['invite-only'], null);
  const before = reportDesign();
  design.valuationCases[0].preferences.expectedLosses['invite-only'] = 999;
  design.nativeSource.implementation.digest = 'modified';
  assert.deepEqual(reportDesign(), before);
});

test('P23 pure report preserves all direct facts/analyses, ignores caches and supports complete reordered JSON sources', () => {
  const raw = fixture();
  for (const row of raw.artifacts) {
    row.artifact.comparisons = [{ sponsor: { xp: 999 } }];
    row.artifact.branches.reverse();
    for (const branch of row.artifact.branches) for (const point of branch.timeline) point.strategy = 'untrusted-extra-label';
  }
  raw.artifacts.reverse();
  const before = JSON.stringify(raw);
  const original = FacetyModel.prototype.createSelfId;
  try {
    FacetyModel.prototype.createSelfId = () => { throw new Error('pure report must not execute a model'); };
    const report = analyzeRaw(raw);
    assert.equal(JSON.stringify(raw), before);
    assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
    assert.deepEqual(report.counts, { modeArtifacts: 2, nativeBranches: 6, checkpointRows: 30, payoffAnalyses: 28, sponsorComparisons: 56, ownershipAnalyses: 2, evaluatorWorlds: 4, evaluatorBranchOutcomes: 12 });
    assert.equal(report.inputDigest, digestOf(raw));
    assert.equal(report.analysisSource.matchesPinnedSource, isPinnedRuntime());
    for (const mode of report.modes) {
      const artifact = raw.artifacts.find(row => row.xpFinality === mode.xpFinality).artifact;
      assert.deepEqual(mode.facts, readIncentiveComparisons(artifact));
      assert.deepEqual(mode.ownership, compareIncentiveOwnership(artifact));
      assert.deepEqual([...new Set(mode.checkpoints.map(row => row.strategy))], report.design.strategies);
      for (const row of mode.valuations) {
        const supplied = report.design.valuationCases.find(item => item.id === row.id).preferences;
        assert.deepEqual(row.analysis, evaluateIncentivePayoffs(artifact, supplied));
      }
      const unknown = mode.valuations.find(row => row.id === 'unknown-losses').analysis;
      assert.deepEqual(unknown.comparisons.map(row => row.conditionalTerminalDifference), [null, null]);
      assert.equal(unknown.choiceSummary.status, 'partial');
      const zero = mode.valuations.find(row => row.id === 'zero-value-control').analysis;
      assert.deepEqual(zero.comparisons.map(row => row.conditionalTerminalDifference), [0, 0]);
    }
    assert.deepEqual(analyzeRaw(JSON.parse(before)), report);
  } finally { FacetyModel.prototype.createSelfId = original; }
});

function isPinnedRuntime() {
  return JSON.stringify(provenance()) === JSON.stringify(reportDesign().nativeSource);
}

test('P23 report keeps equal-hour checkpoints, first retained credits and custody distinct from authority', () => {
  const report = analyzeRaw(fixture());
  for (const mode of report.modes) {
    for (const strategy of ['invite-only', 'invite-and-guarantee']) {
      const rows = mode.checkpoints.filter(row => row.strategy === strategy);
      const admission = rows.find(row => row.stage === 'admission');
      const work = rows.find(row => row.stage === 'newcomer-work');
      assert.equal(admission.atHour, 48);
      assert.equal(work.atHour, 48);
      assert.ok(admission.eventCursor < work.eventCursor);
      assert.equal(admission.selfIds.some(act => act.subject === 'newcomer'), false);
      assert.equal(work.selfIds.some(act => act.subject === 'newcomer'), true);
      const credits = mode.creditCheckpoints.find(row => row.strategy === strategy).acts;
      const sponsor = credits.find(row => row.subject === 'sponsor');
      const newcomer = credits.find(row => row.subject === 'newcomer');
      assert.equal(sponsor.firstCreditedCheckpoint.atHour, mode.xpFinality === 'terminal' ? 24 : 0);
      assert.equal(newcomer.firstCreditedCheckpoint.atHour, mode.xpFinality === 'terminal' ? 72 : 48);
    }
    for (const world of mode.ownership.worlds) for (const branch of world.branches) for (const operator of branch.operators) {
      assert.equal(Object.hasOwn(operator, 'xp'), false);
      assert.ok(operator.xpBySubject);
    }
  }
});

test('P23 refuses incomplete modes, wrong source bindings and unmatched physical inputs rather than shrinking the comparison', () => {
  const native = fixture();
  for (const corrupt of [
    raw => { raw.schema = 'invented'; },
    raw => { raw.designDigest = 'f'.repeat(64); },
    raw => { raw.runnerSha256 = 'f'.repeat(64); },
    raw => { raw.artifacts.pop(); },
    raw => { raw.artifacts[1].xpFinality = 'terminal'; },
    raw => { raw.artifacts[1].artifact.policy.xpFinality = 'terminal'; },
    raw => { raw.artifacts[0].artifact.provenance.implementation.digest = 'f'.repeat(64); },
    raw => { raw.artifacts[0].artifact.provenance.runtime.node = 'v0.0.0'; },
    raw => { raw.artifacts[0].artifact.branches[1].timeline.pop(); },
    raw => { for (const branch of raw.artifacts[1].artifact.branches) branch.work.weights.fabricateIdentity++; },
  ]) {
    const raw = structuredClone(native);
    corrupt(raw);
    assert.throws(() => analyzeRaw(raw), undefined, corrupt.toString());
  }
});

test('P23 execution never overwrites an existing directory and rejects CLI scenario overrides before modeling', () => {
  const directory = mkdtempSync(join(tmpdir(), 'facety-p23-no-overwrite-'));
  const original = FacetyModel.prototype.createSelfId;
  try {
    FacetyModel.prototype.createSelfId = () => { throw new Error('no-overwrite check must precede modeling'); };
    assert.throws(() => runStudy(directory), /already exists/);
    assert.deepEqual(readdirSync(directory), []);
    const result = spawnSync(process.execPath, ['studies/2026-10-24-one-day-incentives/run.mjs', '--seed', 'invented'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /no CLI overrides/);
  } finally {
    FacetyModel.prototype.createSelfId = original;
    rmSync(directory, { recursive: true, force: true });
  }
});
