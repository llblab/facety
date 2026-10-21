# Confirmatory evidence for emergent properties

This document owns `src/evidence.mjs`, `src/statistics.mjs`, `src/provenance.mjs` and `src/parallel.mjs`. [Discovery](discovery.en.md) owns exploration and candidate selection. [Paired controls](controls.en.md) owns perturbation designs. This layer turns a selected pattern into a falsifiable, preregistered claim and tests it on seeds that exploration cannot have used.

## What counts as a supported emergent property here

A macro-level regularity counts as a **supported mechanism within the model** only when all of the following hold on reserved seeds:

1. **Presence.** The regularity appears, measured as a contrast between declared arms.
2. **Necessity.** Ablating the hypothesized interaction removes or reduces it. The ablation is a labeled counterfactual, not a protocol option.
3. **Alternatives.** Each named direct explanation, meaning an encoded rule or a scripted-rate artifact, is controlled, and the regularity survives the control.
4. **Robustness.** Every claim holds in every declared context, such as alternate bootstrap topologies or sizes.

A design with presence claims only can at most support an **association**. Results never transfer to real people, real attackers or an optimal strategy. Unnamed alternatives remain untested, and each study should list them.

## Workflow

```sh
# 1. Explore on exploration seed labels (parallel landscape or paired controls).
node bin/facety.mjs landscape exploration.json --workers auto --out results/landscape.json
# 2. Write a hypothesis file, then register and commit it before any confirmation run.
node bin/facety.mjs register hypothesis.json --out registration.json
git add hypothesis.json registration.json && git commit -m "Preregister ..."
# 3. Confirm on the reserved seed namespace.
node bin/facety.mjs confirm registration.json --workers auto --out confirmation.json
# 4. Adjust across all hypotheses of a study.
node bin/facety.mjs study h1.confirmation.json h2.confirmation.json --out study.json
```

The equivalent native APIs are `registerHypothesis`, `confirmHypothesis` (async), `analyzeConfirmation` (offline reanalysis) and `adjustStudy`. [The worked study](../studies/2026-10-22-coalition-council/README.md) runs this full cycle.

## Hypothesis file

```json
{
  "id": "short-identifier",
  "statement": "Plain-language claim.",
  "kind": "association | mechanism",
  "declaredOn": "YYYY-MM-DD",
  "base": { "scenario": "sybil-cone", "days": 30 },
  "statistic": { "metric": "council.attackerShare", "summary": "endpoint", "window": { "startDay": 0, "endDay": 30 }, "subtract": "attackerShare" },
  "arms": { "full": {}, "ablated": { "ablations.withholdGuarantorXp": true } },
  "contexts": [{ "id": "random-bootstrap", "parameters": { "initialTopology": "random" } }],
  "claims": [
    { "id": "present", "role": "presence", "contrast": { "full": 1, "ablated": -1 }, "direction": "greater", "margin": 0.05, "probability": 0.5, "rationale": "..." }
  ],
  "alternatives": [{ "id": "rate", "explanation": "...", "claim": "<alternative-role claim id>" }],
  "replicas": 40,
  "alpha": 0.05,
  "exploration": { "seeds": ["explore-A"], "source": "where the exploration is documented" }
}
```

- **Statistic.** Any scalar path from `OBSERVABLES`, or `outcome.success`. `endpoint` takes the last daily sample in the window and `change` takes last minus first. `mean`, `min`, `max` and `trend` (least-squares slope per day) need every day of the window. `subtract` takes the same summary of a second observable from the same run. A censored run, a missing day or an undefined observable gives `null`, never an imputed value.
- **Arms.** Named dotted-parameter overrides of `base`, as in `withExperimentParameters`. `seed` and `includeState` are not allowed. Arms and contexts may not set the same parameter, and all must share the horizon and success criterion.
- **Claims.** A `contrast` is a weighted sum of arm statistics for the same replica. `{ "a": 1 }` tests a level, `{ "a": 1, "b": -1 }` a paired difference, and four arms with ±1 weights a difference in differences, such as a necessity claim or `sharpeningDesign`. For each replica, `greater` holds when contrast > margin, `less` when contrast < −margin, and `within` when |contrast| ≤ margin (equivalence).
- **Mechanism kind.** It requires at least one necessity claim and at least one named alternative. Every alternative must reference an `alternative`-role claim, and every alternative claim must be named by an alternative.
- **Exploration.** Seeds must be declared, even as an empty list, so the selection history is part of the digest.

Registration fails closed. Unknown fields, metrics or parameters are rejected, and so is any claim that could not reach `alpha` even if every replica held (`probability^replicas > alpha`).

## Reserved seeds and tamper evidence

`registerHypothesis` normalizes the design and computes SHA-256 over the design, the implementation digest and the randomness policy. Confirmation replicas use labels `replicaSeed("confirm:" + hash, base.seed, i)`, shared across arms and contexts so that arms are paired by common random numbers. Exploration cannot have used these labels without first knowing the final design.

`confirmHypothesis` re-normalizes and re-digests the registration. It refuses a changed design, a changed randomness policy or a changed implementation. `allowImplementationChange` permits the last case and reports `implementationMatched: false`. The implementation digest (`sha256-src-mjs-v1`) hashes every `src/*.mjs` file, so it identifies the code revision without version control. Commit a registration before running its confirmation; the commit order is the auditable record that the design came first. Re-registering after looking at confirmation output is a new hypothesis and needs its own correction.

## Statistical test

For each claim and context, the replica contrasts are independent draws because each replica has its own seed. The claim is tested as H1: P(claim holds for a replica) > `probability`, with an exact one-sided binomial test.

- With `probability: 0.5` and `greater`, this is a sign test that the median contrast exceeds the margin. A higher `probability` claims the effect holds in that fraction of seeds.
- An unknown (`null`) replica counts as *not holding* when testing support and as *holding* when testing contradiction. Censoring and undefined values can therefore only weaken both conclusions.
- A claim is **supported** when its p-value ≤ α. It is **contradicted** when the opposite tail (`P(X ≤ held + unknown)`) is ≤ α, meaning the claim holds in significantly fewer replicas than declared.
- A hypothesis is an intersection-union test over all claims and contexts. Its p-value is the maximum component p-value, which is valid at α without within-hypothesis correction. The verdict is `supported` if every component is supported, `contradicted` if any component is contradicted, and `inconclusive` otherwise.
- `adjustStudy` applies Holm step-down correction across separately registered hypotheses.

The output also reports one-sided Clopper–Pearson bounds on the per-replica hold probability, contrast quantiles and a deterministic percentile bootstrap interval for the mean contrast. These are descriptive and are not the decision rule. The test assumes nothing about the contrast distribution, but it answers a question about medians/quantiles, not means.

## Counterfactual ablations

Ablations are configured under `ablations` and recorded in every run. They are never Facety behavior:

- `withholdGuarantorXp` (model): Self-ID XP goes only to its owner. Guarantor cancellation authority is unchanged.
- `fixedInvitationThreshold` (model): a positive integer replaces the `decimal_digits(N28)` rule.
- `randomGuaranteeTargets` (behavior): guarantee proposals use uniform public matching without coalition or lineage preference.

Other mechanisms are removed through ordinary parameters, such as activity rates, `perturbations`, `policy.*` research policies or budgets. A necessity claim is only as meaningful as the declared correspondence between the ablation and the mechanism. Say what the ablation removes, and what else it changes, in the claim rationale. For example, removing coalition guarantee intensity also shrinks the population.

## Finite-size sharpening

A sharp collective transition should steepen with system size. `sharpeningDesign({ parameter, values: [low, high], sizes: [small, large] })` returns four arms and a difference-in-differences presence claim: the statistic's response to the parameter step is larger at the large size. Use it with a phase-transition hypothesis. A sampled steep contrast alone is not a mathematical phase transition.

## Parallel execution

`mapTasks` runs pure exported task functions on worker threads and returns results in task order. Confirmation, `runLandscapeParallel` and CLI `--workers` produce results identical to sequential execution, and tests check this. Parallelism changes only wall-clock time.

## Limits

- Support means support *within the simulator* under the declared scenario, policies, scripted strategies, observation model and contexts.
- Contexts are the only robustness the design establishes. Parameters left at defaults are not shown to be irrelevant.
- The binomial test controls error over seed sampling. It does not cover model misspecification, uncalibrated behavior or the choice among exploratory candidates; registering before confirming handles that choice.
- An inconclusive verdict is not evidence of absence, and a contradicted verdict refutes only the registered design.
