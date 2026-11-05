// topology-takeover/v1 runner (D115): studies/2026-10-29-topology-takeover/README.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runTopologyExperiment, topologyConfig, TOPOLOGY_ENGINE } from '../src/topology-experiment.mjs';

const SMALL = { seed: 'topology-test', days: 24, attackStartDay: 12, attackers: 4, maxSubjects: 2000 };

test('topology config validates keys, engine and probabilities', () => {
  assert.equal(topologyConfig().engine, TOPOLOGY_ENGINE);
  assert.throws(() => topologyConfig({ extra: 1 }), /unknown topology key/);
  assert.throws(() => topologyConfig({ engine: 'other' }), /requires engine/);
  assert.throws(() => topologyConfig({ honest: { invite: 2 } }), /probability/);
  assert.throws(() => topologyConfig({ honest: { unknown: 1 } }), /unknown honest behavior/);
});

test('topology runs replay exactly and keep the honest head start', () => {
  const first = runTopologyExperiment(SMALL);
  const second = runTopologyExperiment(SMALL);
  assert.deepEqual(first.history, second.history);
  assert.equal(first.history.length, SMALL.days);
  for (const row of first.history) {
    if (row.day < SMALL.attackStartDay + 1) assert.equal(row.attackers, 0, 'no attacker before entry is accepted');
    assert.equal(row.honest + row.attackers, row.subjects);
    assert.ok(row.dirtyShare === null || (row.dirtyShare >= 0 && row.dirtyShare <= 1));
  }
  // After the first 100 active participants the D33 Council has 11 seats and the bootstrap latch is off.
  const late = first.history.at(-1);
  assert.equal(late.bootstrap, false);
  assert.equal(late.councilSize, 11);
  assert.ok(late.attackers > 0, 'invited attacker operators are admitted');
});

test('only the gate arm can refuse for Council paths; the no-gate arm has no bootstrap latch', () => {
  const off = runTopologyExperiment({ ...SMALL, gate: false });
  const refusals = off.history.at(-1).refusals;
  assert.equal(refusals.attackers['insufficient Council paths'] ?? 0, 0);
  assert.equal(refusals.honest['insufficient Council paths'] ?? 0, 0);
  assert.ok(off.history.every(row => row.bootstrap === null));
  assert.equal(off.history.at(-1).councilSize, 11);
});

test('opt-in detection vetoes and adjudicates through the model while audits keep holding (D116)', () => {
  const off = runTopologyExperiment(SMALL);
  assert.deepEqual(off.detection, { casesOpened: 0, falseInvalidated: 0, genuineInvalidated: 0, vetoedFalse: 0, vetoedGenuine: 0, casesDismissed: 0 });
  const settings = { ...SMALL, detection: { enabled: true, review: 1, inspect: 1, sensitivity: 1, falsePositiveRate: 0, windowDays: 1, accuracy: 1 } };
  const on = runTopologyExperiment(settings);
  assert.deepEqual(on.history, runTopologyExperiment(settings).history);
  // Perfect reviewers never veto or invalidate a genuine person, and they do catch fake invitations.
  assert.equal(on.detection.vetoedGenuine, 0);
  assert.equal(on.detection.genuineInvalidated, 0);
  assert.ok(on.detection.vetoedFalse + on.detection.falseInvalidated > 0);
  assert.throws(() => runTopologyExperiment({ ...SMALL, detection: { unknown: 1 } }), /unknown detection setting/);
});

test('v3 leaving, public patterns and follow-up stay opt-in, replay exactly and act through the model (D117)', () => {
  assert.equal(runTopologyExperiment({ ...SMALL, detection: { enabled: true } }).detection.linksLeft, undefined);
  const settings = { ...SMALL, days: 30, detection: { enabled: true, review: 1, inspect: 0, sensitivity: 1, falsePositiveRate: 0, windowDays: 1, accuracy: 1,
    leave: true, publicLook: 1, patternMinInvitees: 2, followUp: true, sponsorWillingness: 1 } };
  const run = runTopologyExperiment(settings);
  assert.deepEqual(run.history, runTopologyExperiment(settings).history);
  assert.ok(run.detection.linksLeft > 0, 'an honest reviewer who vetoes a fake invitation leaves the creator');
  assert.equal(run.detection.genuineInvalidated, 0);
  assert.equal(run.detection.vetoedGenuine, 0);
  for (const key of ['patternsFound', 'escalations', 'sponsorRefusals', 'followUpCases']) assert.ok(Number.isSafeInteger(run.detection[key]));
  assert.throws(() => runTopologyExperiment({ ...SMALL, detection: { leave: 1 } }), /must be boolean/);
});

test('D120/D121 invite rights: a pair grants one right to the lower-XP side and each invitation consumes one', async () => {
  const { FacetyModel, DAY } = await import('../src/model.mjs');
  const reference = { source: 'own-mature-right', withdrawal: 'free', pairEndXp: 'withdrawer-only', withdrawDuringHold: 'allow', invitations: 'v2-special-link', eligibility: 'off', councilPaths: null };
  assert.throws(() => new FacetyModel({ genesis: ['a', 'b'], inviteRights: 'higher-xp-pair' }), /inviteRights requires/);
  // D121 per-pair: genesis pairs and later pairs grant one right to each side, regardless of XP.
  const perPair = new FacetyModel({ genesis: ['a', 'b', 'c'], policy: { xpFinality: 'immediate' }, valences: { K: 100, genesisPairs: [['a', 'b']], reference: { ...reference, eligibility: 'off', councilPaths: null } }, inviteRights: 'per-pair' });
  assert.deepEqual(['a', 'b', 'c'].map(id => perPair.inviteRights(id)), [1, 1, 0]);
  perPair.advanceTo(DAY);
  for (const id of ['a', 'c']) perPair.createSelfId(id, perPair.registerArtifact(id));
  perPair.advanceTo(2 * DAY);
  perPair.openValence('a', 'c', perPair.eligibleEmissions('a')[0]);
  perPair.openValence('c', 'a', perPair.eligibleEmissions('c')[0]);
  assert.deepEqual(['a', 'b', 'c'].map(id => perPair.inviteRights(id)), [2, 1, 1]);
  perPair.audit();
  const model = new FacetyModel({ genesis: ['a', 'b', 'c', 'd'], policy: { xpFinality: 'immediate', guarantorEligibility: 'accepted' }, ablations: { fixedInvitationThreshold: 1 },
    valences: { K: 100, genesisPairs: [], reference }, inviteRights: 'higher-xp-pair' });
  for (const id of ['a', 'a', 'b', 'c', 'd']) { model.advanceTo(model.now + DAY); if (id === 'a' || model.now >= 2 * DAY) model.createSelfId(id, model.registerArtifact(id)); }
  model.advanceTo(model.now + DAY);
  for (const id of ['a', 'b', 'c', 'd']) model.createSelfId(id, model.registerArtifact(id));
  model.advanceTo(model.now + DAY);
  assert.ok(model.subject('a').xp > model.subject('b').xp);
  model.openValence('a', 'b', model.eligibleEmissions('a')[0]);
  model.openValence('b', 'a', model.eligibleEmissions('b')[0]);
  assert.equal(model.inviteRights('b'), 1);
  assert.equal(model.inviteRights('a'), 0);
  model.preregisterAccount('x');
  assert.throws(() => model.createInvitation('a', model.eligibleEmissions('a')[0], 'x'), /no invitation right/);
  model.createInvitation('b', model.eligibleEmissions('b')[0], 'x');
  assert.equal(model.inviteRights('b'), 0);
  model.preregisterAccount('y');
  assert.throws(() => model.createInvitation('b', model.eligibleEmissions('b')[0] ?? 'none', 'y'), /no invitation right|unknown Self-ID/);
  model.audit();
});

test('D122 grown-network snapshot: stopAtHonest ends the prefix and an attack run replays it exactly before the attack day', async () => {
  const { runTopologyExperiment } = await import('../src/topology-experiment.mjs');
  const base = { seed: 'grown-test', honestGenesis: 20, maxSubjects: 400, gate: false };
  const prefix = runTopologyExperiment({ ...base, attackers: 0, days: 200, attackStartDay: 199, stopAtHonest: 30 });
  assert.equal(prefix.outcome.censoredReason, 'stopAtHonest');
  assert.equal(prefix.outcome.censored, false);
  assert.ok(prefix.history.at(-1).honest >= 30 && prefix.history.at(-2).honest < 30);
  const start = prefix.outcome.completedDays;
  const attack = runTopologyExperiment({ ...base, attackers: 2, attackStartDay: start, days: start + 5, detection: { enabled: true }, detectionStartDay: start });
  const strip = ({ refusals, detection, ...row }) => JSON.stringify(row);
  for (let day = 0; day < start; day++) assert.equal(strip(attack.history[day]), strip(prefix.history[day]), 'day ' + day);
  assert.equal(attack.history[start - 1].detection.casesOpened, 0);
  assert.throws(() => runTopologyExperiment({ stopAtHonest: -1 }), /stopAtHonest/);
});

test('D122 length-bounded disjoint paths: exact against brute force, certified, and refusing in the model gate', async () => {
  const { DirectedGraph } = await import('../src/graph.mjs');
  const { findLengthBoundedDisjointPaths, findInternallyDisjointPaths, verifyInternallyDisjointPaths } = await import('../src/proofs.mjs');
  // Deterministic pseudo-random graphs: compare with brute-force subsets of all bounded simple paths.
  let state = 12345; const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let trial = 0; trial < 90; trial++) {
    const n = 10, p = [0.15, 0.2, 0.3][trial % 3], graph = new DirectedGraph('t' + trial);
    for (let i = 0; i < n; i++) graph.addNode('n' + i);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < p) { graph.addEdge('n' + i, 'n' + j); graph.addEdge('n' + j, 'n' + i); }
    for (const maxNodes of [2, 3, 4, 5, 6, 7, 8]) for (const need of [1, 2, 3, 4]) {
      const got = findLengthBoundedDisjointPaths(graph, { source: 'n0', target: 'n9', minimumPaths: need, maxNodes });
      const routes = [];
      const walk = ['n0'];
      (function go(at) { if (at === 'n9') { routes.push([...walk]); return; } for (const e of graph.outEdges(at)) if (!walk.includes(e.to) && walk.length < maxNodes) { walk.push(e.to); go(e.to); walk.pop(); } })('n0');
      const best = (list, k, used, direct) => k === 0 || list.some((r, i) => (r.length === 2 ? !direct : !r.slice(1, -1).some(x => used.has(x))) && best(list.slice(i + 1), k - 1, new Set([...used, ...r.slice(1, -1)]), direct || r.length === 2));
      const expected = best(routes, need, new Set(), false);
      assert.equal(got.status === 'found', expected, `trial ${trial} L${maxNodes} D${need}`);
      if (got.status === 'found') assert.equal(verifyInternallyDisjointPaths(graph, got.proof, { source: 'n0', target: 'n9', minimumPaths: need, maxNodes }), true);
      const unbounded = findInternallyDisjointPaths(graph, { source: 'n0', target: 'n9', minimumPaths: need });
      if (got.status === 'found') assert.equal(unbounded.status, 'found');
    }
  }
  assert.throws(() => runTopologyExperiment({ maxPathNodes: 1 }), /maxPathNodes/);
});

test('D124 layered support: levels match a naive fixed point, verify independently and gate path intermediates', async () => {
  const { DirectedGraph } = await import('../src/graph.mjs');
  const { findLayeredSupport, verifyLayeredSupport } = await import('../src/proofs.mjs');
  let state = 4242; const rnd = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let trial = 0; trial < 120; trial++) {
    const n = 14, graph = new DirectedGraph('s' + trial);
    for (let i = 0; i < n; i++) graph.addNode('n' + i);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const r = rnd();
      if (r < 0.3) { graph.addEdge('n' + i, 'n' + j); graph.addEdge('n' + j, 'n' + i); } else if (r < 0.4) graph.addEdge('n' + i, 'n' + j);
    }
    const seeds = ['n0', 'n1'], blockedNodes = trial % 4 === 0 ? ['n5'] : [];
    for (const threshold of [1, 2, 3]) for (const maxLevel of [0, 1, 2, 5]) {
      const got = findLayeredSupport(graph, { seeds, threshold, maxLevel, blockedNodes });
      // Naive reference: repeat full passes, a node joins the round after threshold lower-level mutual neighbors exist.
      const want = new Map(seeds.map(id => [id, 0]));
      for (let round = 1; round <= maxLevel; round++) {
        const add = [];
        for (let i = 0; i < n; i++) {
          const id = 'n' + i;
          if (want.has(id) || blockedNodes.includes(id)) continue;
          let lower = 0;
          for (let j = 0; j < n; j++) { const other = 'n' + j; if (want.has(other) && want.get(other) < round && graph.edge(id, other) && graph.edge(other, id)) lower++; }
          if (lower >= threshold) add.push(id);
        }
        for (const id of add) want.set(id, round);
      }
      assert.deepEqual([...got].sort(), [...want].sort(), `trial ${trial} t${threshold} L${maxLevel}`);
      assert.equal(verifyLayeredSupport(graph, got, { seeds, threshold, maxLevel, blockedNodes }), true);
    }
  }
  assert.throws(() => runTopologyExperiment({ pathSupport: 'layered' }), /pathSupport/);
  assert.throws(() => runTopologyExperiment({ pathSupport: 'other', maxPathNodes: 7 }), /pathSupport/);
});

test('D125 adaptive attacker is opt-in: the default strategy is unchanged and an unknown strategy is refused', () => {
  assert.throws(() => runTopologyExperiment({ attackerStrategy: 'other' }), /attackerStrategy/);
  const base = { seed: 'adapt', days: 30, attackStartDay: 10, attackers: 3, honestGenesis: 20, maxSubjects: 400 };
  const a = runTopologyExperiment(base), b = runTopologyExperiment({ ...base, attackerStrategy: 'cone' });
  assert.deepEqual(a.history.at(-1), b.history.at(-1));
  const c = runTopologyExperiment({ ...base, attackerStrategy: 'honest-first' });
  assert.ok(c.history.at(-1).attackEdges >= a.history.at(-1).attackEdges);
});

test('D126 vetting is opt-in: vetting 0 is unchanged, an invalid value is refused and vetting lowers stranger acceptance', () => {
  assert.throws(() => runTopologyExperiment({ honest: { vetting: 2 } }), /vetting/);
  const base = { seed: 'vet', days: 40, attackStartDay: 10, attackers: 3, honestGenesis: 20, maxSubjects: 500 };
  const a = runTopologyExperiment(base), b = runTopologyExperiment({ ...base, honest: { vetting: 0 } });
  assert.deepEqual(a.history.at(-1), b.history.at(-1));
  const c = runTopologyExperiment({ ...base, honest: { vetting: 1 } });
  assert.ok(c.history.at(-1).attackEdges <= a.history.at(-1).attackEdges);
});
