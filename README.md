# Facety

**A living protocol and a research workbench for accountable human participation.** The self-contained [manifesto and protocol specification](docs/facety.protocol.en.md) owns Facety's purpose, mechanisms, selected rules, OPEN contracts and dated decisions (Appendix A). This repository develops and tests that proposal with a dependency-free Node.js / ESM simulator; the simulator is not a complete implementation of the selected protocol and proves no real-world Sybil resistance.

## Thesis

Facety is an **accountability substrate for farming-resistant emission distribution and network growth** ([D32](docs/facety.protocol.en.md#accountability-for-emission-and-growth-d32)), asking "who are we actually dealing with?". The proposed flywheel is emission → retention/growth → more accountable participation → better evidence about contribution → more defensible distribution; its inverse is farmed emission financing collusion and obstruction while honest participants leave. Traceable claims, guarantees, stakes and verdicts make those paths inspectable; they do not make evidence true.

- **Intent ([D50](docs/facety.protocol.en.md#honest-participation-and-incentive-asymmetry-d50)):** honest participation substantially easier and more profitable than identity fraud. 10× incentive asymmetry is a research target, not a measured result.
- **Human-operated defense ([D68](docs/facety.protocol.en.md#293-core-first-survivability-and-recovery-frontier-d68), D47):** permissioned traceable entry, public disputes and an authorized correction path; admitted subjects are distinct, presumptively rule-following participants absent contrary evidence. Organized defense is tested against organized attack, with no guaranteed victory.
- **Structure must earn its cost ([D49](docs/facety.protocol.en.md#structural-trust-must-earn-its-growth-cost-d49)):** stronger trust structure must buy resilience faster than it costs honest growth.
- **Economics ([D53](docs/facety.protocol.en.md#291-autonomous-issuance-and-the-monetary-stock-question-d53)):** bounded issuance or N² links imply no price floor; ATMO-governed support is conditional.

Keep three layers distinct:

- **Uniqueness / Sybil resistance:** identity claims and guarantees are contestable, not certified personhood.
- **Contribution / reputation:** XP records specified work and responsibility, not general usefulness; it cannot be bought with FACY.
- **Emission / distribution:** native accounting is executable; sustainable retention and farming resistance are not established.

Main risks: oracle/evidence validity, Sybils, collusion, arbitration capture, bootstrap vulnerability and whether real attack costs exceed realizable gains.

## Current state

- **Priority:** [D76 Evidence Core Convergence](docs/facety.protocol.en.md#4618-evidence-core-convergence-d76) — minimum causal evidence for genuine growth, honest incentive advantage, accountable XP, public correction, capture resistance and recovery, through longitudinal living-network trajectories. See the [evidence frontier](docs/research.en.md#minimum-evidence-frontier-d76).
- **Programme:** the [master trust-topology programme](studies/2026-10-26-trust-topology-condition-map/README.md) gates research; WP1/G1 needs a committed scientific method. Engineering is ahead of evidence: the annual 100→453-subject no-attack workload completes with full audits, which is not a security result.
- **Selected but not implemented:** D33/D35/D36 topology (guarantee AND internally vertex-disjoint path gates), D34 event-time liability, D81–D107 owned slots/paid valences/invitations, D70–D72 Council referendum mechanics. The legacy references stay labeled.
- **Work:** [BACKLOG](BACKLOG.md) alone owns open work; [CHANGELOG](CHANGELOG.md) records milestones.

Simulator defaults combine selected rules with labeled legacy/reference mechanics:

- **Selected:** one-day Self-ID spending/conversion and invitation-freeze windows; active-subject Council with one equal vote; debt recovery preserves the veto.
- **Legacy default / opt-in selected mode:** terminal XP by default; `xpFinality: 'maturity'` implements ordinary 24h credit/veto expiry (D42).
- **Reference:** relation-derived XP revocation, chain-proportional sanctions and liability in the optional dispute abstraction, `disputes.stakeBacking: "reserved"` custody (legacy `"unsecured"` default).

The [coverage table](docs/simulator.en.md#protocol-coverage) maps every rule to its mechanic.

## How the project connects to the protocol

```text
purpose / selected rules / OPEN contracts in the protocol
    -> explicit implementation subset and deviations in the model contract
    -> source-bound scenarios, controls and retained observations
    -> qualified findings and opposed explanations in the insight register
    -> owner decision, when warranted, integrated back into the living protocol
```

- **Meaning:** [protocol](docs/facety.protocol.en.md); only an explicit owner decision changes design authority.
- **Executable fidelity:** [model contract](docs/simulator.en.md), source and tests.
- **Questions and evidence:** [research](docs/research.en.md), [mechanisms](docs/mechanisms.json), [insights](docs/insights.en.md), [studies](docs/README.md).
- **Work and history:** [BACKLOG](BACKLOG.md), [CHANGELOG](CHANGELOG.md), [decision ledger](DECISIONS_NEEDED.md), [agent boundaries](AGENTS.md).

A failure can expose a code defect, a model limitation, an unsupported behavioral thesis or a protocol choice that needs revision. Do not change rules to make an experiment look successful.

## Run

Requires Node.js 22+ and this Git checkout (historical tests run from a pinned commit in a temporary clone). No install or build.

```sh
npm test
node bin/facety.mjs --help
node bin/facety.mjs run examples/four-hour.json
node examples/xp-state.mjs
```

`bin/facety.mjs` (also `npm run facety --`) wraps the native APIs: `run`, `trials`, `sweep`, `landscape`, `compare`, offline reanalysis, `register`, `confirm`, `reanalyze-confirmation`, `study`, games and graph-artifact commands. Set `stepHours: 4` (or `6`) for [sub-day scheduling](docs/simulator.en.md#integrated-participant-scheduling); omitted/`24` keeps daily behavior.

## See the causal core

```sh
node examples/causal-walkthroughs.mjs
node examples/causal-walkthroughs.mjs --json false-allegation-rejected
node examples/causal-relay.mjs
```

One accountability route: an observer sends an event-linked evidence package to a qualified sponsor, who checks it, may refuse, and funds a formal challenge; the accused answers and an explicit procedure applies only authorized consequences. The [mechanism chapter](docs/research.en.md#executable-causal-core) and [register](docs/mechanisms.json) separate real return links from open hypotheses.

## Proving emergent properties

Exploration proposes; preregistered confirmation decides. A hypothesis declares a statistic, arms (including labeled ablations), presence/necessity/alternative claims and robustness contexts; it is committed before confirmation on reserved seeds.

```sh
node bin/facety.mjs register hypothesis.json --out registration.json   # commit before confirming
node bin/facety.mjs confirm registration.json --workers auto --out confirmation.json
node bin/facety.mjs study h1.confirmation.json h2.confirmation.json   # Holm across hypotheses
```

See [confirmatory evidence](docs/evidence.en.md) and the [coalition Council study](studies/2026-10-22-coalition-council/README.md).

## Strategy games and incentives

Games declare strategy menus, simulate every profile on shared seeds and apply explicit valuations offline. Equilibria hold only for the declared menu and valuation.

```sh
node bin/facety.mjs game examples/game.json --workers auto --out results/game.json
node bin/facety.mjs game-sweep results/game.json sweep.json
node examples/incentives.mjs
node examples/incentive-payoffs.mjs
node examples/incentive-ownership.mjs
node examples/incentive-one-day.mjs
```

See [strategy games](docs/games.en.md), [incentives](docs/incentives.en.md) and the [F45 one-day report](studies/2026-10-24-one-day-incentives/README.md#executed-diagnostic-results-f45).

## Emergent behavior research

Runs retain time series of XP concentration, Council turnover, graph mixing/connectivity, admission readiness and realized work. Candidate counts are not discovered properties.

```js
import { readFile } from 'node:fs/promises';
import { runLandscape } from './src/discovery.mjs';
import { compareExperiments } from './src/controls.mjs';

const example = JSON.parse(await readFile('examples/discovery.json', 'utf8'));
console.log(runLandscape(example.experiment, example.landscape).diagnostics.candidates);
const control = JSON.parse(await readFile('examples/controls.json', 'utf8'));
console.log(compareExperiments(control.experiment, control.comparison).analysis.outcomes);
```

See [discovery](docs/discovery.en.md) and [paired controls](docs/controls.en.md). Randomness is decision-keyed and versioned: retain the manifest and `provenance.implementation` digest, not only the seed.

## Cohort and attack experiments

```js
import { runExperiment } from './src/experiment.mjs';
import { runTrials, sweepParameter } from './src/trials.mjs';

const scenario = {
  seed: 'example', initialSize: 30, attackerShare: 0.1, days: 30,
  activity: {
    honest: { selfId: 0.8, inspect: 2, respond: 0.9 },
    attackers: { selfId: 1, invite: 0.2, guarantee: 2 },
  },
  budgets: { honest: 10000, attackers: 3000 },
  weights: { selfId: 3, fabricateIdentity: 10, inspect: 1 },
};
console.log(runExperiment(scenario).outcome);
console.log(runTrials(scenario, { trials: 100, seed: 'replicas' }).probability);
console.log(sweepParameter(scenario, { parameter: 'budgets.attackers', values: [100, 1000, 10000], trials: 100 }).results.length);
```

Scenarios: `honest-growth`, `sybil-cone`, `real-cartel`. Cost is realized weighted work, not a token balance. Read [experiment semantics](docs/experiments.en.md) before interpreting a probability.

## Graph experiments

```js
import { generateGraph, mutateGraph } from './src/generators.mjs';
import { findPathBfs, findPathBidirectional, verifyPath } from './src/proofs.mjs';

const { graph, roots } = generateGraph({ topology: 'preferential', size: 1000, rootCount: 3, degree: 3, seed: 'example' });
const request = { roots, target: 'n999' };
const bfs = findPathBfs(graph, request);
console.log(verifyPath(graph, bfs.proof, request), findPathBidirectional(graph, request).stats);
const damaged = graph.clone();
mutateGraph(damaged, { kind: 'remove-hubs', count: 5, protectedNodes: roots, seed: 'damage' });
console.log(verifyPath(damaged, bfs.proof, request));
```

A certificate proves a directed path in the verifier's canonical graph from a trusted root, not that a person is real or unique. `findInternallyDisjointPaths` / `verifyInternallyDisjointPaths` produce/check D36 families ([boundary](docs/simulator.en.md#internally-vertex-disjoint-path-families-d36-primitive)); this is not an implemented invitation gate. The witness-certified path gate/indexer reference is documented in [indexer](docs/indexer.en.md).

```sh
node examples/graph-benchmark.mjs
node bin/facety.mjs graph-benchmark artifact.json queries.json --out benchmark.json
```

Both algorithms get identical snapshots/queries, each case is checked against unbounded BFS and the independent verifier before timing.

## Code map

- `bin/facety.mjs`: JSON-only CLI over the native APIs.
- `src/model.mjs`: subjects, two-sided guarantees, Self-ID, Emitter, invitations, FACY accounting and stake custody, chronological XP, veto-preserving debt recovery, penalties, labeled ablations. All protocol-economic mutations go through `FacetyModel`.
- `src/graph.mjs`, `src/proofs.mjs`, `src/generators.mjs`, `src/graph-workbench.mjs`, `src/social-graph.mjs`: directed graph with revisioned mutations; BFS/bidirectional/disjoint-path certificates; synthetic topologies; portable artifacts and benchmarks; read-only neighborhoods.
- `src/experiment.mjs`, `src/experiment-config.mjs`, `src/clock-agenda.mjs`, `src/activity-schedule.mjs`, `src/effort.mjs`, `src/trials.mjs`: cohort experiments, configuration/defaults, sub-day clocks, activity schedules, exact work budgets, replicas and sweeps.
- `src/living-experiment*.mjs`, `src/vouch-*.mjs`, `src/pb-experiment*.mjs`: opt-in longitudinal, Native vouch and P/b capacity backends.
- `src/disputes.mjs`, `src/dispute-stakes.mjs`, `src/accountability.mjs`, `src/act-observations.mjs`, `src/identity-observations.mjs`, `src/sponsor-assessment.mjs`: challenge access/settlement, stake records, evidence relay and causal journal, per-act and identity observation environments, optional sponsor willingness.
- `src/path-witness*.mjs`: D61 codec/verifier/ref2, captures, oracle, replay and the advisory cache/tree/pool/workload layer.
- `src/games.mjs`, `src/incentives.mjs`, `src/incentive-payoffs.mjs`, `src/incentive-ownership.mjs`: strategy games and equilibria; incentive forks, offline payoffs, evaluator-only ownership.
- `src/evidence.mjs`, `src/statistics.mjs`, `src/provenance.mjs`, `src/random.mjs`: registrations/confirmations, exact statistics/Holm, source digests, keyed SHA-256 xoshiro128** streams.
- `src/discovery.mjs`, `src/controls.mjs`, `src/observables.mjs`, `src/metrics.mjs`, `src/parallel.mjs`, `src/task-worker.mjs`: landscapes, matched counterfactuals, passive observables, metrics, order-preserving workers.
- `studies/`: source-bound records with their evidence level; untested raw outputs are archived at commit `8b77cd8`.
- `test/`: native `node:test` suites, including the link/anchor integrity guard.

## Research contract

Open protocol choices are named experiment policies, not doctrine. Read [model assumptions](docs/simulator.en.md) before interpreting outcomes. Disputes are declared references, not a complete court or market; observations come from the environment, never an omniscient defense. A success frequency applies only to the declared strategy, budget, horizon, seed sampling and criterion, not to an optimal real-world attacker. Pending collateral, refunds, losses and uncollected promises are never conflated.
