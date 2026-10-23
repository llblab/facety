import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestOf, provenance } from '../../src/provenance.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIRECTORY = fileURLToPath(new URL('./results/', import.meta.url));
const STRATEGIES = ['wait-collector', 'invite-only', 'invite-and-guarantee'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const load = name => JSON.parse(readFileSync(resolve(DIRECTORY, name), 'utf8'));
const manifest = load('manifest.json');
const raw = load('raw.json');
const report = load('report.json');
assert.equal(manifest.status, 'complete');
assert.equal(manifest.runner.path, 'studies/2026-10-24-one-day-incentives/run.mjs');
assert.match(manifest.runner.commit, /^[a-f0-9]{40}$/);
assert.equal(hash(readFileSync(resolve(ROOT, manifest.runner.path))), manifest.runner.sha256);
assert.equal(hash(execFileSync('git', ['show', manifest.runner.commit + ':' + manifest.runner.path], { cwd: ROOT })), manifest.runner.sha256);
assert.deepEqual(manifest.files.map(row => row.name).sort(), ['raw.json', 'report.json']);
for (const file of manifest.files) {
  const bytes = readFileSync(resolve(DIRECTORY, file.name));
  assert.equal(bytes.length, file.bytes);
  assert.equal(hash(bytes), file.sha256);
}
assert.equal(digestOf(manifest.design), manifest.designDigest);
assert.equal(raw.designDigest, manifest.designDigest);
assert.equal(raw.runnerSha256, manifest.runner.sha256);
assert.equal(report.designDigest, manifest.designDigest);
assert.equal(report.inputDigest, digestOf(raw));
assert.deepEqual(report.design, manifest.design);
assert.deepEqual(manifest.provenance, provenance());
assert.deepEqual(report.analysisSource.provenance, manifest.provenance);
assert.equal(report.analysisSource.runnerSha256, manifest.runner.sha256);
assert.equal(report.analysisSource.matchesPinnedSource, true);
assert.equal(raw.artifacts.length, 2);
assert.deepEqual(raw.artifacts.map(row => row.xpFinality).sort(), ['immediate', 'terminal']);
assert.equal(manifest.design.valuationCases.length, 14);
assert.equal(new Set(manifest.design.valuationCases.map(row => row.id)).size, 14);

const last = branch => branch.timeline.at(-1);
const person = (branch, id) => last(branch).subjects.find(row => row.id === id);
const work = actions => ({
  effortMicroUnits: actions.reduce((sum, row) => sum + Math.round(row.effort * 1e6), 0), acceptedActions: actions.length,
});
const liquid = branch => person(branch, 'sponsor').liquidFacy;
function fact(baseline, treatment) {
  const before = person(baseline, 'sponsor');
  const after = person(treatment, 'sponsor');
  const a = work(baseline.actions.filter(row => row.actor === 'sponsor'));
  const b = work(treatment.actions.filter(row => row.actor === 'sponsor'));
  return {
    baseline: baseline.strategy, treatment: treatment.strategy,
    sponsor: { liquidFacy: after.liquidFacy - before.liquidFacy, xp: after.xp - before.xp, debt: after.debt - before.debt, effort: (b.effortMicroUnits - a.effortMicroUnits) / 1e6, acceptedActions: b.acceptedActions - a.acceptedActions },
    subjects: last(treatment).subjects.length - last(baseline).subjects.length,
    guaranteeEdges: last(treatment).guarantees.edges.length - last(baseline).guarantees.edges.length,
    lineageEdges: last(treatment).lineage.edges.length - last(baseline).lineage.edges.length,
    privateUtility: null, expectedLiability: null, networkExternality: null,
  };
}
const multiply = (coefficient, value) => coefficient === 0 ? 0 : value === null ? null : coefficient * value;
const sum = values => values.includes(null) ? null : values.reduce((a, b) => a + b, 0);
const totals = { positive: 0, negative: 0, zero: 0, unknown: 0 };
const summaries = [];
let checkpoints = 0;
let sponsorComparisons = 0;
let ownershipBranches = 0;
let ownershipComparisons = 0;

for (const { xpFinality, artifact } of raw.artifacts) {
  const mode = report.modes.find(row => row.xpFinality === xpFinality);
  assert.ok(mode);
  assert.equal(artifact.policy.xpFinality, xpFinality);
  assert.deepEqual(artifact.provenance, manifest.provenance);
  const branches = STRATEGIES.map(strategy => artifact.branches.find(row => row.strategy === strategy));
  assert.equal(artifact.branches.length, 3);
  assert.ok(branches.every(Boolean));
  const facts = branches.slice(1).map(branch => fact(branches[0], branch));
  assert.deepEqual(mode.facts, facts);
  assert.equal(mode.role, manifest.design.modes.find(row => row.xpFinality === xpFinality).role);
  assert.deepEqual(mode.checkpoints, branches.flatMap(branch => branch.timeline.map(point => ({ ...point, strategy: branch.strategy }))));
  assert.deepEqual(mode.creditCheckpoints, branches.map(branch => ({
    strategy: branch.strategy,
    acts: last(branch).selfIds.map(act => {
      let first = null;
      for (const point of branch.timeline) {
        if (point.selfIds.some(row => row.id === act.id && row.xpCredited)) { first = { stage: point.stage, atHour: point.atHour }; break; }
      }
      return { selfId: act.id, subject: act.subject, recordedAt: act.recordedAt, xpRecipients: act.xpRecipients, firstCreditedCheckpoint: first };
    }),
  })));
  assert.deepEqual(mode.ownership.protocolBranches, branches.map(({ strategy, timeline, events }) => ({ strategy, timeline, events })));
  for (const branch of branches) {
    assert.deepEqual(branch.timeline.map(row => row.atHour), [0, 24, 48, 48, 72]);
    assert.equal(last(branch).eventCursor, branch.events.length);
    for (const point of branch.timeline) {
      checkpoints++;
      assert.equal(point.ledger.minted, point.selfIds.length);
      assert.equal(point.ledger.emitterVault, point.selfIds.filter(act => act.status === 'unspent').length);
      assert.equal(point.ledger.burned, point.selfIds.filter(act => act.status === 'consumed').length);
      assert.equal(point.ledger.collector, point.subjects.reduce((total, subject) => total + subject.liquidFacy, 0));
      assert.equal(point.ledger.debt, point.subjects.reduce((total, subject) => total + subject.debt, 0));
      assert.equal(point.ledger.supply, point.ledger.minted - point.ledger.burned);
      assert.equal(point.ledger.supply, point.ledger.collector + point.ledger.emitterVault + point.ledger.feeVault);
      for (const subject of point.subjects) {
        assert.equal(subject.xp, point.selfIds.filter(act => act.xpCredited && act.xpRecipients.includes(subject.id)).length);
        assert.equal(Object.hasOwn(subject, 'genuine'), false);
        assert.equal(Object.hasOwn(subject, 'operator'), false);
      }
    }
    for (const [actor, declared] of Object.entries(branch.work.bySubject)) {
      const actions = branch.actions.filter(row => row.actor === actor);
      for (const action of actions) assert.equal(Math.round(action.effort * 1e6), Math.round(branch.work.weights[action.action] * 1e6));
      const counted = work(actions);
      assert.equal(declared.effort, counted.effortMicroUnits / 1e6);
      assert.equal(declared.accepted, counted.acceptedActions);
      assert.equal(declared.rejected, 0);
      assert.equal(declared.denied, 0);
    }
  }
  assert.deepEqual(mode.valuations.map(row => row.id), manifest.design.valuationCases.map(row => row.id));
  const cases = [];
  for (const { id, preferences: p } of manifest.design.valuationCases) {
    const analysis = mode.valuations.find(row => row.id === id).analysis;
    assert.deepEqual(analysis.preferences, p);
    assert.equal(analysis.numericPolicy.comparisonTolerance, 0);
    assert.equal(analysis.fullDynamicUtility, null);
    assert.equal(analysis.networkExternality, null);
    const values = facts.map((fact, index) => {
      const delta = fact.sponsor;
      const components = {
        liquidFacy: multiply(delta.liquidFacy, p.facyValue), terminalXp: multiply(delta.xp, p.xpValue),
        work: multiply(-delta.effort, p.workUnitCost), admissionBenefit: p.admissionBenefit,
        guaranteeBenefit: fact.treatment === 'invite-and-guarantee' ? p.guaranteeBenefit : 0,
        expectedLossAdjustment: p.expectedLosses[fact.treatment] === null ? null : -p.expectedLosses[fact.treatment],
      };
      for (const key of Object.keys(components)) if (components[key] === 0) components[key] = 0;
      const value = sum(Object.values(components));
      const row = analysis.comparisons[index];
      sponsorComparisons++;
      totals[value === null ? 'unknown' : value === 0 ? 'zero' : value > 0 ? 'positive' : 'negative']++;
      assert.deepEqual(row.components, components);
      assert.equal(row.conditionalTerminalDifference, value);
      assert.equal(row.relation, value === null ? 'unknown' : value === 0 ? 'indifferent' : value > 0 ? 'preferred' : 'disfavored');
      assert.deepEqual(row.missingComponents, Object.keys(components).filter(key => components[key] === null));
      const other = sum(Object.entries(components).filter(([key]) => key !== 'terminalXp').map(([, value]) => value));
      const threshold = delta.xp === 0 ? { status: 'not-sensitive', value: null, preferredWhen: null }
        : other === null ? { status: 'unknown-other-inputs', value: null, preferredWhen: null }
        : { status: 'threshold', value: -other / delta.xp, preferredWhen: delta.xp > 0 ? 'xpValue > value' : 'xpValue < value' };
      if (threshold.value === 0) threshold.value = 0;
      assert.deepEqual(row.xpBreakEven, threshold);
      return value;
    });
    const scores = [{ strategy: STRATEGIES[0], value: 0 }, ...values.map((value, index) => ({ strategy: STRATEGIES[index + 1], value }))];
    const known = scores.filter(row => row.value !== null);
    const best = Math.max(...known.map(row => row.value));
    const winners = known.filter(row => row.value === best).map(row => row.strategy);
    assert.equal(analysis.choiceSummary.status, known.length === 3 ? 'complete' : 'partial');
    assert.equal(analysis.choiceSummary.bestKnownDifference, best);
    assert.deepEqual(analysis.choiceSummary.knownMaximizers, winners);
    assert.deepEqual(analysis.choiceSummary.exactNumericalMaximizers, known.length === 3 ? winners : null);
    assert.deepEqual(analysis.choiceSummary.candidateBestResponses, scores.filter(row => row.value === null || row.value === best).map(row => row.strategy));
    cases.push({ id, values, status: analysis.choiceSummary.status });
  }
  for (const world of mode.ownership.worlds) {
    const controlled = world.id === 'sponsor-controlled-newcomer';
    assert.ok(controlled || world.id === 'independent-newcomer');
    const operatorBySubject = { sponsor: 'sponsor', peer: 'peer', newcomer: controlled ? 'sponsor' : 'newcomer' };
    assert.deepEqual(world.evaluator.operatorBySubject, operatorBySubject);
    assert.deepEqual(world.evaluator.genuineBySubject, { sponsor: true, peer: true, newcomer: !controlled });
    for (const branch of branches) {
      const output = world.branches.find(row => row.strategy === branch.strategy);
      ownershipBranches++;
      const actions = branch.actions.map(row => ({
        ...row, operator: operatorBySubject[row.actor],
        effort: controlled && row.action === 'recruitHuman' ? branch.work.weights.fabricateIdentity : row.effort,
      }));
      assert.equal(output.workActions.length, actions.length);
      assert.equal(output.population.subjects, last(branch).subjects.length);
      assert.equal(output.population.assumedOperators, new Set(last(branch).subjects.map(row => operatorBySubject[row.id])).size);
      assert.equal(output.population.assumedGenuinePeople, last(branch).subjects.filter(row => row.id !== 'newcomer' || !controlled).length);
      for (const operator of output.operators) {
        const held = last(branch).subjects.filter(row => operatorBySubject[row.id] === operator.id);
        assert.deepEqual(operator.subjectIds, held.map(row => row.id).sort());
        assert.equal(operator.liquidFacy, held.reduce((sum, row) => sum + row.liquidFacy, 0));
        assert.equal(operator.observedDebt, held.reduce((sum, row) => sum + row.debt, 0));
        assert.deepEqual(operator.xpBySubject, Object.fromEntries(held.map(row => [row.id, row.xp])));
        assert.equal(Object.hasOwn(operator, 'xp'), false);
        const counted = work(actions.filter(row => row.operator === operator.id));
        assert.deepEqual(operator.work, { effort: counted.effortMicroUnits / 1e6, ...counted });
      }
    }
    const sponsor = branch => branch.operators.find(row => row.id === 'sponsor');
    const baseline = sponsor(world.branches.find(row => row.strategy === 'wait-collector'));
    for (const row of world.comparisons) {
      ownershipComparisons++;
      const after = sponsor(world.branches.find(branch => branch.strategy === row.treatment));
      assert.equal(row.sponsorOperator.liquidFacy, after.liquidFacy - baseline.liquidFacy);
      assert.equal(row.sponsorOperator.effortMicroUnits, after.work.effortMicroUnits - baseline.work.effortMicroUnits);
      assert.equal(row.sponsorOperator.effort, row.sponsorOperator.effortMicroUnits / 1e6);
      assert.deepEqual(row.sponsorOperator.xpBySubject, { before: baseline.xpBySubject, after: after.xpBySubject });
      assert.equal(row.privateUtility, null);
      assert.equal(row.expectedLiability, null);
      assert.equal(row.networkExternality, null);
    }
  }
  summaries.push({
    xpFinality, facts, cases,
    terminalSponsor: branches.map(branch => ({ strategy: branch.strategy, liquidFacy: liquid(branch), xp: person(branch, 'sponsor').xp, work: work(branch.actions.filter(row => row.actor === 'sponsor')).effortMicroUnits / 1e6 })),
    creditCheckpoints: mode.creditCheckpoints,
    ownership: mode.ownership.worlds.map(world => ({ world: world.id, sponsorComparisons: world.comparisons.map(row => ({ strategy: row.treatment, ...row.sponsorOperator })) })),
  });
}
assert.equal(checkpoints, 30);
assert.equal(sponsorComparisons, 56);
assert.equal(ownershipBranches, 12);
assert.equal(ownershipComparisons, 8);
assert.deepEqual(report.counts, manifest.counts);
assert.deepEqual(summaries[0].facts, summaries[1].facts);
assert.deepEqual(summaries[0].cases, summaries[1].cases);
console.log(JSON.stringify({
  schema: 'facety-p23-diagnostic-audit/v1', source: manifest.provenance,
  checks: { manifestAndCodeHashes: true, completeRawInputs: true, checkpoints, sponsorComparisons, ownershipBranches, ownershipComparisons, noOmittedValuationCases: true },
  scoreCounts: totals, summaries,
  scope: 'Post-data author audit of retained data, independently coded raw-ledger/effort/payoff/ownership reconstruction. Not an independent reviewer, new model execution, authenticity proof or registered mechanism test.',
}, null, 2));
