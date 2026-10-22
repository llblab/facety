# Exploratory discovery and macro-state trajectories

The primary research question is which collective regimes arise from interacting local rules, not merely whether a chosen attacker reaches a Boolean goal. This document owns `src/observables.mjs` and `src/discovery.mjs`. [Protocol abstractions](simulator.en.md) and [cohort behavior](experiments.en.md) remain separate contracts.

## What is implemented

- Passive macro-state and realized-work measurements after each daily action batch.
- Bounded Cartesian parameter landscapes with repeatable replica seed labels.
- Raw histories, endpoint distributions, trajectory descriptors and exploratory pattern candidates.
- Offline reanalysis of an existing landscape under different declared diagnostic thresholds.
- Constant/no-effect, known-pattern, missing-data and computational-truncation controls in native tests.

[Matched controls and scheduled activity perturbations](controls.en.md) are implemented. CLI delivery remains open in [the backlog](../BACKLOG.md). No mechanism has been established merely by adding this instrumentation.

## Run the example

The example has six parameter cells and eight replicas per cell: 48 runs of 20 simulated days. It varies initial guarantee outdegree and honest inspection activity, while keeping the other parameters fixed.

```js
import { readFile } from 'node:fs/promises';
import { runLandscape, diagnoseLandscape } from './src/discovery.mjs';

const example = JSON.parse(await readFile('examples/discovery.json', 'utf8'));
const result = runLandscape(example.experiment, example.landscape);
console.log(result.diagnostics.summaries);
console.log(result.diagnostics.candidates);

// Changing diagnostic tolerances does not rerun the simulated network.
const reanalyzed = diagnoseLandscape(result.cells, result.axes, {
  ...result.diagnostics.settings,
  separation: 3,
});
console.log(reanalyzed.candidates);
```

Run this from the repository root as ESM. The native APIs require no package installation. Retain the entire result, including configurations, sample seed labels and raw histories, when investigating a pattern.

## Passive observables

The measurement code does not consume randomness, change balances, modify graph revisions or feed evaluator truth into an agent. Tests compare the final history point with canonical final metrics and verify that realized-work increments sum to the effort ledger.

Each history point retains the earlier population/cost fields and adds:

- Population: accepted subjects, active subjects, false-subject share, attacker-controlled share and distinct human operators.
- XP: total, Gini, top-decile share and attacker share. Top decile means the largest `ceil(N / 10)` balances. When total effective XP is zero, Gini and both shares are undefined (`null`); the raw total remains `0`. Equal positive XP has Gini `0`, a different state from having no effective authority.
- Council: member IDs, attacker seat share and membership churn. Churn is Jaccard distance between consecutive membership sets; the first sample has no previous set and reports `null`.
- Guarantees: actual edge count, directed density, degree concentration and cohort mixing.
- Admission: current N28-derived guarantor threshold, subjects qualifying on guarantees, and subjects also holding an eligible own Emitter right.
- Connectivity: rooted fraction, honest rooted fraction and honest non-root rooted fraction. No honest non-root subjects means the last fraction is `null`.
- Structure: guarantee reciprocity and the largest weak-component fraction (`null` without edges or nodes), cross-cohort attack edges and attack edges per attacker subject (`null` without attackers), and invitation-lineage maximum and mean depth from the genesis roots.
- XP coupling: `xp.attackerExcessShare` (attacker XP share minus attacker subject share) and `xp.outDegreeSpearman`, the tie-averaged rank correlation between effective XP and guarantee out-degree (`null` when either is constant).
- Realized work: cumulative effort and per-action attempted/accepted/rejected/denied work since the preceding sample, separately for both cohorts. The initial sample includes funded topology setup; subsequent increments do not count setup twice.

The existing `defenderEffort` field measures **all honest-cohort work**, including Self-ID and growth. It is not exclusively defensive review labor. Use inspection/response action measurements when studying review costs specifically.

Evaluator cohort and genuine/false labels are diagnostic inputs only. A false subject that has not been invalidated by protocol judgment can still have an accepted graph path. A missing path does not establish personal guilt.

## Mixing and normalization

`cohortMixing` records the full directed 2x2 edge-count matrix. It reports three distinct quantities:

- Within-cohort edge fraction.
- Excess within-cohort fraction over uniform random mixing of the current population without self-links.
- Directed categorical assortativity, using incoming/outgoing edge marginals to account for unequal edge activity.

These are not interchangeable. A large cohort can have many internal edges without homophilic selection. With no edges, edge fractions are undefined. If the edge marginals make assortativity unidentifiable, it is `null`, not a claim of perfect agreement or disagreement.

All initial subjects are trusted roots in the current scenario model. This can make overall rooted connectivity look reassuring. The non-root honest fraction is provided to avoid silently treating bootstrap membership as an independently demonstrated downstream trust path.

## Landscape contract

`runLandscape(experiment, options)` accepts:

- `axes`: Known dotted experiment parameters mapped to distinct primitive values, for example `attackerShare`, `initialDegree`, `activity.honest.inspect` or `budgets.attackers`.
- `trials`: Number of replicas per cell, default eight.
- `seed`: Master replica seed label. All cells use matching replica labels; initial roles/topology may still differ under the varied parameter.
- `maxCells`: Explicit grid bound, default 64.
- `maxRecordedSamples`: Bound on planned history points, default 100000. It accounts for every cell's horizon before any simulation runs.
- `diagnostics`: Selected metric paths and declared descriptor settings.

`runLandscapeParallel(experiment, { ...options, workers })` and CLI `landscape --workers` distribute replicas over worker threads. They return exactly the sequential result.

All cell configurations validate before execution. Metadata fields `seed` and `includeState` cannot be axes. A landscape retains histories rather than full protocol snapshots; use a separate `runExperiment({ includeState: true })` for a particular witness graph.

Axis names are sorted for deterministic construction. Numeric-axis contrasts compare neighboring values in numeric order. Categorical axes have pairwise contrasts but no invented numerical ordering. Every contrast holds all other coordinates fixed.

A cell retains its exact configuration, conditional attack-outcome uncertainty and raw samples with seed, outcome and history. These are measurements, not proof that the input parameters describe real human behavior.

## Trajectory descriptors and diagnostic settings

`OBSERVABLES` lists allowed scalar metric paths and their default absolute practical-change tolerances. `DEFAULT_OBSERVABLES` selects a small initial view. Tolerances are analysis choices, not Facety policy.

`metricSeries(history, metric)` extracts only `day-end` snapshots: the state after each scheduled daily update. Initial, horizon-only and partial censored snapshots remain in raw histories but are not extra days of acted behavior. With `{ days }` as its third argument, it validates ordered, distinct daily timestamps inside that horizon and returns every expected day, inserting `null` for an absent snapshot. Discovery and paired controls share this alignment.

`diagnoseLandscape` requires an explicit common `outcome.horizonDays` for all replicas in each cell, matching `cell.config.days` when a cell configuration is supplied. It does not infer a horizon from retained row count. For a positive horizon, the expected endpoint is the daily-update snapshot at hour `(days - 1) * 24`, not an earlier retained row or the later horizon-expiration-only state. Zero-day runs have no daily series or endpoint.

`describeTrajectory` reports observed endpoints/change, a linear trend over available observations, largest adjacent step and its time, direction changes and practical flatness. It also describes jump candidates and a changed trajectory followed by a practical plateau.

Missing values stay missing. Adjacent-step descriptors do not bridge a null gap. Linear trends use available points and retain their actual time coordinates. A practical plateau means steps at or below the declared absolute tolerance; it does not necessarily mean exactly zero growth.

Defaults for candidate diagnostics:

- `minReplicates: 3`: Minimum usable uncensored replicas.
- `separation: 2`: Adjacent mean differences must exceed the larger sample standard deviation by this factor, as well as the metric's practical-change tolerance.
- `patternFraction: 0.75`: Fraction of usable trajectories that must exhibit a temporal shape.
- `jumpFactor: 3`: A largest step must exceed this multiple of the median absolute step and the practical-change tolerance.
- `plateauSteps: 3`: Minimum trailing sub-threshold steps after an earlier meaningful change.
- `practicalChanges`: Optional per-selected-metric tolerance overrides.

The current candidate kinds are repeated temporal jumps, repeated direction changes, repeated changes to practical plateaus, adjacent numeric-cell separation, categorical contrast and non-monotonic numeric-axis response. Constant trajectories alone are not automatically announced as discoveries.

Endpoint and feature distributions report replicate count, sample standard deviation, standard error, quantiles and range. These are descriptive dispersion summaries, **not confidence intervals for a mechanism**. Nominal Wilson intervals in the separate attack-outcome summary retain their narrower Bernoulli interpretation.

## Censoring and missing data

The runner retains capped raw trajectories. A cell with any computationally censored replica has no full-ensemble endpoint mean and cannot generate candidate contrasts or temporal findings. Descriptive distributions from complete replicas retain their actual count; they must not be mistaken for an unbiased estimate of the full parameter regime.

A metric with any missing expected endpoint likewise has no full-ensemble mean and cannot produce a candidate contrast or temporal flag. Available endpoint distributions retain their actual replica count. `completeRuns` counts uncensored model outcomes; it does not certify completeness of an imported history. Missing interior snapshots become null gaps, so adjacent-step descriptors do not bridge omitted days. A missing saved row is not relabeled as computational censoring.

Missing cohorts, zero XP and absent downstream populations are not imputed as zero risk or zero inequality. The zero-XP convention is shared by final `modelMetrics` and all macro-state snapshots. The generic `gini` helper and graph degree Gini retain their zero-vector convention of `0`; XP concentration uses the narrower undefined-authority convention.

Earlier saved histories may contain zero-XP Gini `0`. Reanalysis preserves recorded values rather than silently rewriting them. Rerun with the current implementation, or explicitly document a separate normalization, before combining measurements under the current convention. Retain implementation revision as well as seed and randomness policy.

Economic budget exhaustion is a modeled constraint, not computational censoring. It can explain a plateau directly. Resource-cap censoring is never reported as network resilience.

## Evidence ladder

1. Inspect trajectories and within-cell variability, not only an endpoint or a Boolean attack result.
2. Treat automated candidates as pointers for investigation. The number of candidates is **not** a count of emergent properties.
3. Check direct explanations: spend, conversion and invitation-freeze windows, 28-day expiry, decimal invitation thresholds, rounding of initial cohort sizes, XP tie-breaking, budgets and onboarding.
4. Replay the witness seed and vary one mechanism at a time under an explicitly labeled control. A selected strategy is not an optimal attacker.
5. Register the hypothesis, with presence, necessity and named-alternative claims plus robustness contexts, before confirming it on reserved seeds. See [confirmatory evidence](evidence.en.md). Do not reuse exploratory selection as independent confirmation.
6. Make a mechanism claim only when a registered confirmation supports it, and list the alternatives it did not test.

Diagnostics perform no significance test, multiple-comparison correction or causal identification. The recorded decision-keyed random policy shares draws for matching logical contexts, not for arbitrarily different agents, targets or candidate sets. See [paired-control coupling and replay limits](controls.en.md#counterfactual-random-coupling). A sharp sampled contrast is not by itself a mathematical phase transition; stabilization, capture, oscillation and recovery remain hypotheses to test.
