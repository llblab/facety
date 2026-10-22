# Facety simulator

A dependency-free Node.js / ESM research workbench for the [proposed Facety protocol](docs/facety.protocol.en.md). It separates protocol state, graph algorithms, cohort strategies and evaluator ground truth. It does not establish real-world Sybil resistance.

## Run

Requires Node.js 22 or newer. No installation or build step is needed.

```sh
npm test
node bin/facety.mjs --help
```

## Command line

`bin/facety.mjs` (also `npm run facety --`) wraps the native APIs: `run`, `trials`, `sweep`, `landscape`, `compare`, offline reanalysis, the evidence commands `register`, `confirm`, `reanalyze-confirmation` and `study`, and graph-artifact commands. Inputs are JSON files holding the documented API arguments. Stdout carries JSON only and errors go to stderr. `--out` refuses to overwrite an existing file without `--force`. `--workers auto` parallelizes landscapes and confirmations without changing their results.

## Proving emergent properties

Exploration proposes and confirmation decides. A pattern found in a landscape becomes a preregistered hypothesis: a statistic, named arms (including labeled mechanism ablations), presence/necessity/alternative claims and robustness contexts. The hypothesis is digested together with the implementation and then tested on reserved seeds with exact binomial intersection-union tests. A `mechanism` verdict requires that the effect appears, disappears when the mechanism is ablated and survives every named encoded-rule alternative.

```sh
node bin/facety.mjs register hypothesis.json --out registration.json   # commit before confirming
node bin/facety.mjs confirm registration.json --workers auto --out confirmation.json
node bin/facety.mjs study h1.confirmation.json h2.confirmation.json   # Holm across hypotheses
```

See [confirmatory evidence](docs/evidence.en.md) and the [worked coalition Council study](studies/2026-10-22-coalition-council/README.md). That study supported two mechanisms within the model: guarantor-XP coupling amplifies a dense coalition's Council share, and a growing Sybil cone's under-representation is a transient of its age structure.

## Strategy games and incentives

Random scripted runs cannot show what anyone would choose. A game declares strategy menus for honest participants and attackers, simulates every profile on shared seeds and keeps per-operator protocol facts. It then applies explicit valuations offline to find best responses, equilibria and whether an individual gains by deviating. A minimal dispute layer (XP-gated challenge, verdict accuracy, fines, liability, rewards) provides the deterrence that inspection otherwise lacks.

```sh
node bin/facety.mjs game examples/game.json --workers auto --out results/game.json
node bin/facety.mjs game-sweep results/game.json sweep.json
```

See [strategy games](docs/games.en.md) and the [exploratory inspection-game note](studies/2026-10-22-inspection-game/README.md).

## Emergent behavior research

The primary output is a map of collective regimes, not one attack-success score. Runs retain time series of XP concentration, Council turnover, actual graph mixing/connectivity, admission readiness and realized cohort work. Bounded parameter landscapes flag exploratory shapes and contrasts without declaring a mechanism proven. XP concentration is undefined (`null`) until effective XP exists. Offline landscape endpoints follow the declared daily horizon; missing final observations are not replaced by earlier values.

```js
import { readFile } from 'node:fs/promises';
import { runLandscape } from './src/discovery.mjs';

const example = JSON.parse(await readFile('examples/discovery.json', 'utf8'));
const result = runLandscape(example.experiment, example.landscape);
console.log(result.diagnostics.summaries, result.diagnostics.candidates);
```

See [discovery semantics and controls](docs/discovery.en.md). The [example](examples/discovery.json) defines six cells and 48 replayable runs. Candidate counts are not counts of discovered emergent properties. [Paired controls and scheduled perturbations](docs/controls.en.md) are also available through the native APIs; general CLI delivery remains open.

### Paired disturbances and return criteria

```js
import { compareExperiments } from './src/controls.mjs';

const control = JSON.parse(await readFile('examples/controls.json', 'utf8'));
const paired = compareExperiments(control.experiment, control.comparison);
console.log(paired.analysis.outcomes, paired.analysis.summaries);
```

The [control example](examples/controls.json) temporarily pauses inspection and compares pre/during/post trajectories. Restored activity is not a rollback of XP, graph history or money. A metric's finite return to baseline is not a health verdict. Randomness is decision-keyed and versioned: retain the manifest and the `provenance.implementation` source digest, not only the seed.

### Incentive direction

```sh
node examples/incentives.mjs
node examples/incentive-payoffs.mjs
node examples/incentive-ownership.mjs
```

The first JSON example compares waiting for Collector, inviting only, and inviting plus guaranteeing the newcomer on the same funded prefix. It retains real FACY/XP changes and per-subject work without inventing their utility. The second revalues retained data under explicitly illustrative preferences, preserving unknown inputs and reporting conditional break-even points rather than predicted adoption. The third attaches explicit independent/controlled-newcomer worlds to the same trace, separating operator custody/work from per-subject XP. It is not a live Sybil execution or proof that a fabricated identity can pass Self-ID. See [incentive evidence and the conditional payoff boundary](docs/incentives.en.md): neither a larger reward balance nor a maximum over three scripts proves a useful network effect.

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
const run = runExperiment(scenario);
console.log(run.outcome, run.effort, run.population);
const batch = runTrials(scenario, { trials: 100, seed: 'replicas' });
console.log(batch.probability);
const sweep = sweepParameter(scenario, {
  parameter: 'budgets.attackers', values: [100, 1000, 10000], trials: 100,
});
console.log(sweep.results.map(row => [row.value, row.experiment.probability]));
```

Three scenarios are available: `honest-growth`, `sybil-cone`, and `real-cartel`. Cost is realized weighted attempted work, not a token balance or elapsed time. Read [experiment semantics](docs/experiments.en.md) before interpreting a probability. The APIs work now; CLI and algorithm benchmarks remain in the backlog.

## Graph experiments

```js
import { generateGraph, mutateGraph } from './src/generators.mjs';
import { findPathBfs, findPathBidirectional, verifyPath } from './src/proofs.mjs';

const { graph, roots } = generateGraph({
  topology: 'preferential', size: 1000, rootCount: 3, degree: 3, seed: 'example',
});
const request = { roots, target: 'n999' };
const bfs = findPathBfs(graph, request);
const bidirectional = findPathBidirectional(graph, request);
console.log(verifyPath(graph, bfs.proof, request), bfs.stats, bidirectional.stats);

const damaged = graph.clone();
const journal = mutateGraph(damaged, {
  kind: 'remove-hubs', count: 5, protectedNodes: roots, seed: 'damage',
});
console.log(journal, verifyPath(damaged, bfs.proof, request));
```

A certificate proves a directed path in the verifier's canonical graph from an independently supplied trusted root. It does **not** prove that a person is real or unique. Search-budget exhaustion is distinct from an unreachable target.

## Code map

- `bin/facety.mjs`: JSON-only command line over the native APIs.
- `src/games.mjs`: Strategy-menu games, payoff facts, valuations, best responses, pure/mixed equilibria, individual deviation tests and valuation sweeps.
- `src/evidence.mjs`: Hypothesis registration, reserved-seed confirmation, exact claim tests, verdicts, Holm study adjustment and finite-size sharpening designs.
- `src/statistics.mjs`: Exact binomial tails, Clopper–Pearson bounds, Holm adjustment and deterministic bootstrap intervals.
- `src/provenance.mjs`: Source-content implementation digest and canonical JSON digests.
- `src/parallel.mjs`, `src/task-worker.mjs`: Order-preserving worker-thread execution of pure tasks.

- `src/incentives.mjs`: Deterministic marginal decision forks, timed protocol accounting, per-subject work and validated retained-fact extraction.
- `src/incentive-payoffs.mjs`: Explicit terminal-payoff assumptions, null-preserving offline revaluation, numerical bands and conditional finite-menu comparisons; no market or network-value calibration.
- `src/incentive-ownership.mjs`: Evaluator-only ownership worlds, operator custody/work and separate subject XP; no live attack replay or pooled procedural authority.
- `src/controls.mjs`: Matched counterfactuals, activity schedules, phase differences, censoring-safe uncertainty and finite-window return criteria.
- `src/discovery.mjs`: Bounded parameter landscapes, raw trajectories, offline reanalysis and exploratory diagnostics.
- `src/observables.mjs`: Passive macro-state, normalized mixing, admission readiness, Council churn and work increments.
- `src/experiment.mjs`: Cohort activity, budget-constrained growth, noisy observations, veto responses and evaluator outcomes.
- `src/effort.mjs`: Exact micro-unit effort budgets, action counters, rejected attempts and setup/maintenance attribution.
- `src/trials.mjs`: Reproducible replicas, Wilson intervals, censoring bounds and parameter sweeps.
- `src/model.mjs`: Deterministic subjects, two-sided guarantees, Self-ID, Emitter, invitations, FACY accounting, chronological XP, veto-preserving debt recovery, explicit penalties and labeled mechanism ablations.
- `src/graph.mjs`: Directed adjacency indexes, immutable edge identities, pure capacity preflights, revisioned mutations and JSON snapshots.
- `src/proofs.mjs`: BFS / bidirectional BFS, independent certificate verification and reachable sets.
- `src/generators.mjs`: Tree, random fixed-outdegree, preferential, community and clique topologies; node/edge removal and rewiring.
- `src/metrics.mjs`: Connectivity, concentration, reciprocity, weak components, rank correlation, lineage depth, Council and ledger observations.
- `src/random.mjs`: Reproducible, non-cryptographic SHA-256-seeded xoshiro128** streams and draw-equivalent excluded-index picking.
- `src/graph-workbench.mjs`: Portable graph artifacts, extraction, standalone mutation and independently verified path queries.
- `studies/`: Preregistered hypotheses, registrations and confirmations with their exploration record.
- `test/`: Native Node tests, including exhaustive BFS equivalence on all four-node directed simple graphs, A/A null controls and parallel/sequential equivalence.

## Research contract

Open protocol choices are named experiment policies, not Facety doctrine. Read [model assumptions](docs/simulator.en.md) before interpreting any outcome. Experiments currently model guarantor vetoes, not a complete dispute court or market. Noisy observations are generated by the experimental environment, not an omniscient defense. An estimated success frequency applies only to the declared strategy, budget, horizon and assumptions; it is not a bound against an optimal real-world attacker.

## Project context

- [Durable research boundaries](AGENTS.md)
- [Documentation](docs/README.md)
- [Remaining work](BACKLOG.md)
- [Delivered changes](CHANGELOG.md)
