# Facety simulator

**Facety's strategic thesis is an accountability substrate for emission distribution and network growth—not merely a dispute protocol.** It aims for distribution resistant to farming by asking: “Who are we actually dealing with?” Emission is intended to retain honest participants, attract contributors and support useful network effects, not function as a standalone payout. This is a deliberate owner-provided lens (D32, documented 2026-10-23), not proven sustainability.

The proposed flywheel is **emission → retention/growth → more accountable participation → better evidence about contribution → more defensible distribution**. Its inverse is farmed emission financing collusion and procedural obstruction, honest participants leaving, independent review weakening and further farming becoming easier. Traceable claims, evidence, sponsorships, stakes and verdicts make those paths inspectable; they do not make evidence true.

Keep three layers distinct:

- **Uniqueness / Sybil resistance:** repeated identity claims and guarantees are contestable, not proven unique-personhood certification.
- **Contribution / reputation:** XP records specified work/responsibility, not a universal measure of useful contribution; application-specific verification remains open.
- **Emission / distribution:** native accounting is executable; sustainable retention and farming resistance are not established. The current one-unit eligible Self-ID reward is not general contribution-proportional allocation.

Required safeguards are a credible uniqueness layer, a scoped contribution metric, anti-farming economics, an explicit bootstrap plan and an arbitration trust model. Main risks remain **oracle/evidence validity, Sybil attacks, collusion, arbitration capture, bootstrap vulnerability and whether real attack costs exceed realizable gains**. Eligible participants can both earn Self-ID emission and assume guarantee liability or dispute stakes; this neither buys XP nor makes all participants mandatory stakers. The [D32 framing and falsifiers](docs/facety.protocol.en.md#accountability-for-emission-and-growth-d32) define the boundary: useful honest participation must persist without subsidy-dependent extraction, capture or intolerable wrongful exclusion. More accounts or payouts alone do not establish success.

**Social architecture (D31):** Facety coordinates mutual identification through mutual guarantees and public accountability. This is owner-provided design intent, documented 2026-10-23. “Mutual” describes the social architecture: consenting to a directed guarantee does not create its reverse. Repeated identity assertions, non-transferable XP, economic consequences and collective disputes support coordination; none alone proves unique personhood.

Guarantees earn XP because building, checking and accepting responsibility are work. Early builders intentionally receive an earned advantage—not permanent immunity. XP cannot be purchased by accumulating FACY, and it is not proof of wisdom or honesty. Public histories make actions attributable, but attention, usable evidence, a willing sponsor and enforcement are separate bottlenecks. Anyone may discover evidence; a qualified participant accepts formal challenge responsibility. A formal Council gives **one equal vote each**, not extra votes for more XP. The owner's [D33 design](docs/facety.protocol.en.md#46-brightid-inspired-topology-design) replaces the former fixed-101 target with Network Difficulty, independent support and dynamic consuls; a one-consul target means no formal Council, not unilateral authority.

This repository is the dependency-free Node.js / ESM research workbench and [living protocol](docs/facety.protocol.en.md). It separates protocol state, behavioral policies, observations and evaluator-only truth. The aim is to establish when earned influence stays correctable—even with a passive majority and bounded fraud—and when the same incentives protect abuse. No real-world Sybil resistance, adoption or governance reliability is established. [Decisions and findings](docs/insights.en.md) retain their different evidence levels; the [causal research program](docs/research.en.md) defines tests rather than favorable assumptions.

### One accountability route

An outside observer finds an inconsistency in an influential participant's public identity act and sends an event-linked evidence package to a qualified sponsor. The sponsor independently checks it, can refuse a weak case or seek clarification, and accepts the cost/stake of a formal challenge. The accused can answer. An explicit procedure records an outcome and applies only authorized account/XP consequences; people may separately withdraw guarantees. If nobody can exceed the accused's XP, the intended collective Council route matters. It has a final human trust boundary, not an infallible algorithm or another supreme controller.

**Implemented versus intended:** native money, XP, guarantees and sanctions, noisy dispute references, and a bounded costed evidence→independent sponsor review→existing one-step outcome are executable. The small reference includes refusal, rerouting, false allegations and an actual later XP-gate consequence; it is not a selected court or proof of reliable investigation. Compensation, D34 historical event-time liability/early self-correction, reasoned Council merits and institutional learning remain unimplemented. D34 retains responsibility for past guaranteed events after exit; current-link liability is only the legacy simulator reference. [The coverage map](docs/simulator.en.md#protocol-coverage) is the current implementation ledger. Atmo demand, market prices and useful application income remain separate conditional models, not free support for the core.

**D33 implementation boundary:** the topology formulas, bootstrap safeguards, cluster quotas, hysteresis and external privacy options are recorded as design requirements/guidance, not implemented here. Verification/factor/epoch/voting contracts remain open; the simulator keeps its labeled legacy active-count/raw-guarantor/fixed-101 reference until a separately validated migration. See [conflicts and proposed resolutions](docs/facety.protocol.en.md#4613-conflicts-supersession-and-proposed-resolutions).

Simulator defaults combine pre-D33 selected rules with explicitly labeled direction/reference mechanics:

- **Selected:** one-day Self-ID spending/conversion and invitation-freeze windows;
- **Selected:** terminal XP for the subject and eligible guarantors;
- **Direction/reference:** relation-derived XP revocation, with detailed either-party and historical semantics kept explicit;
- **Selected:** active-subject Council eligibility and one equal vote per member;
- **Selected principle:** debt recovery preserves the veto; seizure priority remains an explicit reference;
- **Direction/reference:** chain-proportional sanctions and liability when the optional dispute abstraction is enabled.

## Run

Requires Node.js 22 or newer. No installation or build step is needed.

```sh
npm test
node bin/facety.mjs --help
```

## Command line

`bin/facety.mjs` (also `npm run facety --`) wraps the native APIs: `run`, `trials`, `sweep`, `landscape`, `compare`, offline reanalysis, the evidence commands `register`, `confirm`, `reanalyze-confirmation` and `study`, and graph-artifact commands. Inputs are JSON files holding the documented API arguments. Stdout carries JSON only and errors go to stderr. `--out` refuses to overwrite an existing file without `--force`. `--workers auto` parallelizes landscapes and confirmations without changing their results.

## See the causal core

```sh
node examples/causal-walkthroughs.mjs
node examples/causal-walkthroughs.mjs --json false-allegation-rejected
node examples/causal-relay.mjs
```

The [mechanism chapter](docs/research.en.md#executable-causal-core) and [structured register](docs/mechanisms.json) separate real return links from open hypotheses. Named walkthroughs show before/after state, work, money, missed windows, wrongful harm and exact blocked decisions; the matched-resource exploration keeps raw evidence and limits in its [study](studies/2026-10-23-causal-core/README.md). Neither a trace nor a directly encoded threshold is emergence. Full cohort defaults stay unchanged.

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

See [strategy games](docs/games.en.md) and the [exploratory inspection-game note](studies/2026-10-22-inspection-game/README.md). To inspect fully backed stakes without choosing a new protocol default, run `node bin/facety.mjs run examples/dispute-stakes.json`. This [timed reference example](examples/dispute-stakes.json) retains pending custody, case records and actual financial outcomes; it is not evidence of deterrence.

## Emergent behavior research

The primary output is a map of collective regimes, not one attack-success score. Runs retain time series of XP concentration, Council turnover, actual graph mixing/connectivity, admission readiness and realized cohort work. Bounded parameter landscapes flag exploratory shapes and contrasts without declaring a mechanism proven. XP concentration is undefined (`null`) until effective XP exists. Offline landscape endpoints follow the declared daily horizon; missing final observations are not replaced by earlier values.

```js
import { readFile } from 'node:fs/promises';
import { runLandscape } from './src/discovery.mjs';

const example = JSON.parse(await readFile('examples/discovery.json', 'utf8'));
const result = runLandscape(example.experiment, example.landscape);
console.log(result.diagnostics.summaries, result.diagnostics.candidates);
```

See [discovery semantics and controls](docs/discovery.en.md). The [example](examples/discovery.json) defines six cells and 48 replayable runs. Candidate counts are not counts of discovered emergent properties. [Paired controls and scheduled perturbations](docs/controls.en.md) are available through native APIs and CLI `compare`.

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

Three scenarios are available: `honest-growth`, `sybil-cone`, and `real-cartel`. Cost is realized weighted attempted work, not a token balance or elapsed time. Read [experiment semantics](docs/experiments.en.md) before interpreting a probability. Both APIs and CLI work; algorithm benchmarks remain open.

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
- `src/disputes.mjs`: Shared strict challenge access, one-step stake settlement and model-owned verdict consequences; no truth or observation policy.
- `src/accountability.mjs`: Input-driven evidence/sponsor research reference and bounded noninterfering causal journal; no new protocol defaults or external rights.
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
- `src/model.mjs`: Deterministic subjects, two-sided guarantees, Self-ID, Emitter, invitations, FACY accounting (including reference stake custody), chronological XP, veto-preserving debt recovery, explicit penalties and labeled mechanism ablations.
- `src/dispute-stakes.mjs`: Open/settled/mooted commitment records, actual-versus-promised collection, exclusive reserved backing and replay guards; no truth, XP or merits authority.
- `src/graph.mjs`: Directed adjacency indexes, immutable edge identities, pure capacity preflights, revisioned mutations and JSON snapshots.
- `src/proofs.mjs`: BFS / bidirectional BFS, independent certificate verification and reachable sets.
- `src/generators.mjs`: Tree, random fixed-outdegree, preferential, community and clique topologies; node/edge removal and rewiring.
- `src/metrics.mjs`: Connectivity, concentration, reciprocity, weak components, rank correlation, lineage depth, Council and ledger observations.
- `src/random.mjs`: Reproducible, non-cryptographic SHA-256-seeded xoshiro128** streams and draw-equivalent excluded-index picking.
- `src/graph-workbench.mjs`: Portable graph artifacts, extraction, standalone mutation and independently verified path queries.
- `studies/`: Preregistered hypotheses, registrations and confirmations with their exploration record.
- `test/`: Native Node tests, including exhaustive BFS equivalence on all four-node directed simple graphs, A/A null controls and parallel/sequential equivalence.

## Research contract

Open protocol choices are named experiment policies, not Facety doctrine. Read [model assumptions](docs/simulator.en.md) before interpreting any outcome. Experiments model vetoes and optional one-step/instant/timed dispute references, not a complete human court or market. Noisy observations come from the environment, not an omniscient defense. An estimated success frequency applies only to the declared strategy, budget, horizon, seed sampling and criterion; it is not a bound against an optimal real-world attacker. The [2026-10-23 audit](studies/2026-10-23-accountability-audit/README.md) records the clean 175-test starting state, reproduced media/stake concerns, tested reference remedies and historical-study scope limits. `disputes.stakeBacking: "reserved"` enables funded custody for comparison; `"unsecured"` remains the legacy default. Pending collateral, refunds, losses and uncollected promises must not be conflated.

## Project context

- [Durable research boundaries](AGENTS.md)
- [Documentation](docs/README.md)
- [Remaining work](BACKLOG.md)
- [Delivered changes](CHANGELOG.md)
