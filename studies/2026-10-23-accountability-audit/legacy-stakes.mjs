// Diagnostic instrumentation of the legacy reference, never a protocol or actor execution path.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { FacetyModel } from '../../src/model.mjs';
import { runExperiment } from '../../src/experiment.mjs';
import { provenance } from '../../src/provenance.mjs';

const sourceUrl = new URL('../../src/experiment.mjs', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, 'diagnostic source marker must be unique');
  return text.replace(before, after);
}
let instrumented = replaceOnce(source, 'export function runExperiment(overrides = {}) {', 'export function runExperiment(overrides = {}) {\n  const stakeAudit = [];');
instrumented = replaceOnce(instrumented, '    openDisputes.push(dispute);', `    openDisputes.push(dispute);
    const committed = openDisputes.flatMap(item => item.entrants).filter(item => item.id === dispute.challenger).reduce((sum, item) => sum + item.stake, 0);
    if (committed > model.subject(dispute.challenger).liquidFacy) stakeAudit.push({ at: model.now, id: dispute.challenger, liquid: model.subject(dispute.challenger).liquidFacy, committed });`);
instrumented = replaceOnce(instrumented, "    schema: 'facety-experiment/v1',", "    schema: 'facety-experiment/v1', stakeAudit,");
instrumented = instrumented.replace(/from '(\.\/[^']+)'/g, (_, relative) => 'from ' + JSON.stringify(new URL(relative, sourceUrl).href));
const imported = await import('data:text/javascript;base64,' + Buffer.from(instrumented).toString('base64'));
const config = {
  scenario: 'sybil-cone', seed: 'disputes', initialSize: 30, attackerShare: 0.2, days: 24,
  maxSubjects: 1500, activity: { honest: { inspect: 3, challenge: 1 } },
  disputes: { enabled: true, procedure: 'chekharda-timed', stake: 3 }, includeState: true,
};
const { stakeAudit, ...observed } = imported.runExperiment(config);
assert.deepEqual(observed, runExperiment(config), 'instrumentation must not change the ordinary run');
assert.ok(stakeAudit.length > 0, 'legacy concurrent overcommitment witness');

// The isolated helper witness remains bound to the historical implementation, not the new case guard.
const historicalRevision = 'af9b12eb34204cdb0a0f6d523aacb44aa9fe5fe5';
const legacySource = execFileSync('git', ['show', historicalRevision + ':src/experiment.mjs'], { encoding: 'utf8' });
const begin = legacySource.indexOf('  function settleDispute(dispute) {');
const end = legacySource.indexOf('  // Everyone who defended', begin);
assert.ok(begin >= 0 && end > begin, 'legacy settlement extraction markers');
const model = new FacetyModel({ genesis: ['a', 'b'] });
for (let day = 0; day < 6; day++) {
  const act = model.createSelfId('a', model.registerArtifact('a'));
  model.advanceTo((day + 1) * 24);
  model.convertToCollector('a', act);
}
const settle = new Function('model', 'config', 'sanctions', 'disputeRecords', 'councilReached', 'return (' + legacySource.slice(begin, end).trim() + ')')(
  model, { disputes: { loserHalvesXp: true } }, { ladderDepth: 0 }, new Map(), () => false,
);
const makeCase = id => ({ id, entrants: [{ id: 'a', side: 'fraud', stake: 3 }, { id: 'b', side: 'genuine', stake: 4 }] });
const first = makeCase('probe:1');
const second = makeCase('probe:2');
model.transferFacy('a', 'b', 5, 'spend-before-settlement');
const snapshot = () => ({ a: model.subject('a'), b: model.subject('b'), ledger: model.audit() });
const before = snapshot();
settle(first);
settle(second);
const after = snapshot();
assert.equal(after.a.debt, 0);
assert.equal(after.b.liquidFacy - before.b.liquidFacy, 1);
model.transferFacy('b', 'a', 1, 'probe-refund');
settle(first);
const replayedHelper = snapshot();

console.log(JSON.stringify({
  schema: 'facety-legacy-stake-probe/v2', level: 'diagnostic', provenance: provenance(), randomness: observed.randomness, config, historicalSettlementRevision: historicalRevision,
  method: 'Current unsecured run instrumented in memory and compared exactly with its ordinary result; separate historical settlement helper from the named git revision with constructed cases and current real model balances. Original v1 raw output is retained unchanged.',
  ordinaryOvercommitment: stakeAudit,
  isolatedSettlement: { nominalLosingStakes: 6, before, after, actuallyTransferred: 1, unpaidWithoutDebt: 5, replayedHelper },
  limits: ['Backing semantics remain OPEN.', 'Constructed-case undercollection is not an ordinary admission-to-settlement witness.', 'The historical helper replay is not a normal-scheduler exploit; current DisputeStakes guards reject a second settlement.'],
}, null, 2));
