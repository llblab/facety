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

The equivalent native APIs are `registerHypothesis`, `confirmHypothesis` (async), `analyzeConfirmation(registration, values, { allowImplementationChange = false } = {})` (offline reanalysis) and `adjustStudy`. [The worked study](../studies/2026-10-22-coalition-council/README.md) runs this full cycle.

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

Both `confirmHypothesis` and public native `analyzeConfirmation` re-normalize and re-digest the registration before analysis. They refuse a changed design, a changed randomness policy or, by default, a changed implementation. An explicit `{ allowImplementationChange: true }` permits only the last case; it never permits design/hash/seed-namespace tampering. Confirmation reports `implementationMatched: false` for that override. CLI `reanalyze-confirmation` preserves its historical offline-reanalysis policy by explicitly allowing implementation drift while still verifying the registered design and matching confirmation hash; native callers must opt in themselves. Valid retained statistics keep their existing analysis result shape and inference. The [E2 repair witness](../studies/2026-10-23-registration-integrity/README.md) demonstrates rejection of the old changed-margin construction and acceptance of the unchanged old registration under this explicit policy. A content digest is not evidence authentication or proof of preregistration time. The implementation digest (`sha256-src-mjs-v1`) hashes every `src/*.mjs` file, so it identifies the code revision without version control. Commit a registration before running its confirmation; the commit order is the auditable record that the design came first. Re-registering after looking at confirmation output is a new hypothesis and needs its own correction.

## Statistical test

For each claim and context, the replica contrasts are independent draws because each replica has its own seed. The claim is tested as H1: P(claim holds for a replica) > `probability`, with an exact one-sided binomial test.

- With `probability: 0.5` and `greater`, this is a sign test that the median contrast exceeds the margin. A higher `probability` claims the effect holds in that fraction of seeds.
- An unknown (`null`) replica counts as *not holding* when testing support and as *holding* when testing contradiction. Censoring and undefined values can therefore only weaken both conclusions.
- A claim is **supported** when its p-value ≤ α. It is **contradicted** when the opposite tail (`P(X ≤ held + unknown)`) is ≤ α, meaning the claim holds in significantly fewer replicas than declared.
- Support for a hypothesis remains an intersection-union test over all claims and contexts. Its support p-value (`analysis.pValue`) is the maximum component support p-value, valid at α without within-hypothesis correction. The verdict is `supported` only when every component supports.
- **D37/D38, new v2 registrations:** the full registered claims × contexts product has size `M`. Aggregate contradiction uses `min(1, M × min(component contradiction p))`; the verdict is `contradicted` only when this is at most α, and `inconclusive` otherwise. It controls one hypothesis and the contradiction direction, conditional on valid marginal tests; not joint support/refutation or cross-hypothesis error. Minimum Holm-adjusted and Bonferroni p-values coincide for this any-component decision.
- **Historical v1 registrations:** retain the labeled legacy unadjusted any-component contradiction rule, including its [E1 multiplicity limitation](../studies/2026-10-23-evidence-debt-review/README.md), by default. Implementation-drift permission does not select A. The [archived decision packet](../studies/2026-10-23-e1-contract/README.md) remains pre-selection diagnostic evidence, not a new scientific confirmation.
- Every computed analysis identifies `analysisPolicy`. Its `contradiction` object reports `familySize`, `rawMinimumPValue`, `controlled`, `scope` and aggregate `pValue` (null for legacy's uncalibrated aggregate). `tests[].contradictionPValue` and the `contradicted` list remain **raw per-component** quantities/flags under both methods. That list may be nonempty while A's aggregate verdict is `inconclusive`; it is not an adjusted family rejection list. Unknown rows do not shrink the registered family.
- `adjustStudy` applies Holm step-down correction across separately registered hypotheses.

The output also reports one-sided Clopper–Pearson bounds on the per-replica hold probability, contrast quantiles and a deterministic percentile bootstrap interval for the mean contrast. These are descriptive and are not the decision rule. The test assumes nothing about the contrast distribution, but it answers a question about medians/quantiles, not means.

### Versioned analysis and reanalysis (D38)

**Selected and implemented:** [D37/§47](facety.protocol.en.md#47-calibrated-aggregate-contradiction-in-simulator-research-d37) selects calibrated contradiction; [D38/§48](facety.protocol.en.md#48-versioned-analysis-and-historical-compatibility-d38) approves the compatibility envelope. The [migration checkpoint](../studies/2026-10-23-d37-migration/README.md) retains validation and bounded independent review.

1. **New registrations:** `registerHypothesis` creates `facety-hypothesis/v2`, binding `analysisPolicy: "family-contradiction/v1"` into the registration digest and thus reserved namespace. `confirmHypothesis` returns `facety-confirmation/v2` with that policy. Ordinary `analyzeConfirmation(registration, values, { allowImplementationChange })` always uses the verified bound policy; analysis/confirmation options reject method overrides.
2. **Existing v1 registrations/JSON:** `verifyRegistration` uses the original v1 digest layout and infers `unadjusted-contradiction/v1`. A v1 registration may not acquire an unhashed policy field. Default native/CLI analysis retains its statistical classification; new computed reports tag the legacy method and limitation rather than claiming calibrated refutation. Historical stored JSON stays byte-identical. Explicit native implementation-drift permission remains required when applicable.
3. **Separate reanalysis:** `reanalyzeConfirmation(registration, confirmation, { analysisPolicy, allowImplementationChange })` verifies registration/hash and confirmation method/schema binding, then returns `facety-reanalysis/v1`. An omitted policy keeps the registered method; an explicit policy must be `family-contradiction/v1`. The artifact names `registeredAnalysisPolicy`, requested `analysisPolicy`, `methodChanged`, registration hash, current implementation and source metadata. `source.inputDigest` identifies the supplied canonical JSON, not evidence authenticity or preregistration time. V1's earlier schema-less `{ registrationHash, values }` transport is retained; v2 confirmations must carry their schema and bound policy. No source registration or artifact is rewritten and no model is run.
4. **CLI compatibility:** without a method flag, `reanalyze-confirmation` returns bare computed analysis as before, including its method tag. With `--analysis-policy family-contradiction/v1`, it emits the separate reanalysis artifact. The flag is rejected on other commands. Existing output files are still refused without `--force`; never point an intentional reanalysis at an original artifact.
5. **Study reports:** `adjustStudy` still corrects only support p-values, preserves `unadjustedVerdict`, and now carries each supplied analysis policy and artifact schema. Unversioned historical analyses infer the legacy method. This is provenance reporting over supplied analyses, not authentication or contradiction correction.

```js
import { analyzeConfirmation, reanalyzeConfirmation, ANALYSIS_POLICY } from './src/evidence.mjs';
// Ordinary historical analysis: old method, explicit implementation permission when needed.
const legacy = analyzeConfirmation(oldRegistration, oldConfirmation.values, { allowImplementationChange: true });
// Explicit A on old data: a distinct, method-identified reanalysis result.
const newMethod = reanalyzeConfirmation(oldRegistration, oldConfirmation, {
  analysisPolicy: ANALYSIS_POLICY, allowImplementationChange: true,
});
```

```sh
# Offline only: no confirm/run; write a NEW artifact, not the old confirmation.
node bin/facety.mjs reanalyze-confirmation registration.json confirmation.json \
  --analysis-policy family-contradiction/v1 --out reanalysis-A.json
```

The policy override never bypasses E2 normalization/digest/namespace/randomness verification. Retained numeric rows remain supplied statistics under the existing, separately gated trust contract: this migration does not authenticate seeds, censoring labels or observations. New source fingerprints still prevent unpermitted implementation drift. Independent source review and native/CLI regressions cover the selected transition; no historical scientific confirmation is automatically replayed.

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
