# Facety simulator

A dependency-free Node.js / ESM research workbench for the [proposed Facety protocol](docs/facety.protocol.en.md). It separates protocol state, graph algorithms, cohort strategies and evaluator ground truth. It does not establish real-world Sybil resistance.

## Run

Requires Node.js 22 or newer. No installation or build step is needed.

```sh
npm test
```

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

The [control example](examples/controls.json) temporarily pauses inspection and compares pre/during/post trajectories. Restored activity is not a rollback of XP, graph history or money. A metric's finite return to baseline is not a health verdict. Randomness is decision-keyed and versioned: retain the manifest and implementation revision, not only the seed.

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

- `src/incentives.mjs`: Deterministic marginal decision forks, timed protocol accounting, per-subject work and validated retained-fact extraction.
- `src/incentive-payoffs.mjs`: Explicit terminal-payoff assumptions, null-preserving offline revaluation, numerical bands and conditional finite-menu comparisons; no market or network-value calibration.
- `src/incentive-ownership.mjs`: Evaluator-only ownership worlds, operator custody/work and separate subject XP; no live attack replay or pooled procedural authority.
- `src/controls.mjs`: Matched counterfactuals, activity schedules, phase differences, censoring-safe uncertainty and finite-window return criteria.
- `src/discovery.mjs`: Bounded parameter landscapes, raw trajectories, offline reanalysis and exploratory diagnostics.
- `src/observables.mjs`: Passive macro-state, normalized mixing, admission readiness, Council churn and work increments.
- `src/experiment.mjs`: Cohort activity, budget-constrained growth, noisy observations, veto responses and evaluator outcomes.
- `src/effort.mjs`: Exact micro-unit effort budgets, action counters, rejected attempts and setup/maintenance attribution.
- `src/trials.mjs`: Reproducible replicas, Wilson intervals, censoring bounds and parameter sweeps.
- `src/model.mjs`: Deterministic subjects, two-sided guarantees, Self-ID, Emitter, invitations, FACY accounting, chronological XP and explicit penalties.
- `src/graph.mjs`: Directed adjacency indexes, immutable edge identities, pure capacity preflights, revisioned mutations and JSON snapshots.
- `src/proofs.mjs`: BFS / bidirectional BFS, independent certificate verification and reachable sets.
- `src/generators.mjs`: Tree, random fixed-outdegree, preferential, community and clique topologies; node/edge removal and rewiring.
- `src/metrics.mjs`: Connectivity, concentration, Council and ledger observations.
- `src/random.mjs`: Reproducible, non-cryptographic random streams.
- `test/`: Native Node tests, including exhaustive BFS equivalence on all four-node directed simple graphs.

## Research contract

Open protocol choices are named experiment policies, not Facety doctrine. Read [model assumptions](docs/simulator.en.md) before interpreting any outcome. Experiments currently model guarantor vetoes, not a complete dispute court or market. Noisy observations are generated by the experimental environment, not an omniscient defense. An estimated success frequency applies only to the declared strategy, budget, horizon and assumptions; it is not a bound against an optimal real-world attacker.

## Project context

- [Durable research boundaries](AGENTS.md)
- [Documentation](docs/README.md)
- [Remaining work](BACKLOG.md)
- [Delivered changes](CHANGELOG.md)
