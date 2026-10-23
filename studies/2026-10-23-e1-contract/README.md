# E1 aggregate contradiction: owner decision packet — 2026-10-23

**UNSELECTED methodology alternatives; diagnostic controls only.** Inspected checkpoint: `4b2409c`. No inference/runtime/default/schema changes. This packet completes bounded preparation for E1; the remaining action is the owner's choice, not another sweep or automatic confirmation.

## Decision in one question

**Should an aggregate contradiction mean (A) a calibrated hypothesis-level refutation in the declared direction, or (B) only that at least one unadjusted component raised a diagnostic flag?**

Recommendation: **A** if the current “refutes the registered design” language is the intended promise. B is coherent if the intended output is exploratory triage. Neither is selected by this recommendation. The native engine still implements its existing unadjusted any-component rule.

- **A — Calibrated aggregate contradiction:** Keep the existing support test. For contradiction, use the complete registered claim/context family and a dependence-robust aggregate p-value below. Costs: fewer contradictions at a fixed replica count; five replicas cannot yield this aggregate decision at α=0.05 for two probability-0.5 components, even if a component never holds. Gains: a stated per-hypothesis, per-direction error guarantee, conditional on valid marginal tests.
- **B — Diagnostic flags:** Keep raw per-component tails/flags, but use explicitly diagnostic aggregate language such as `component-flagged`, without asserting calibrated hypothesis-level refutation. Costs: rename/qualify output and remove refutation/error-control implications from all callers/cautions; exact naming/version is part of the selected rollout. Gains: retain sensitivity for screening. A documentation footnote must not coexist with an unqualified “refutes the design” machine-output promise.

## Family and statistical meaning

Each component `j = (context ID, claim ID)` is a registered contrast test. Let `θ_j` be the probability that its contrast satisfies the registered inequality under the declared seed/scenario distribution; `q_j` is the registered probability threshold. Component **support** tests `θ_j ≤ q_j` against `θ_j > q_j`; component **contradiction** tests `θ_j ≥ q_j` against `θ_j < q_j`. Equality is a null boundary, not automatic proof in either direction.

Support of the all-components hypothesis remains the intersection-union rule `p_support = max_j p_support,j`. Requiring every component to support is valid at α without correcting each support component. E1 does not invalidate that support rule.

For A, the proposed contradiction family is **all registered claims × all registered contexts**, including presence, necessity and alternative roles, fixed before seeing values. Its size is `M`, currently at most 32 × 16. No dropping fully unknown contexts, filtering by support, retaining only raw flags, estimating an “effective M” from observed correlation, or post-hoc deduplication of identical contrasts. A different predeclared family would require an explicit new design contract, not a hidden optimization.

A minimal dependence-robust aggregate is:

```text
p_contradiction,hypothesis = min(1, M × min_j p_contradiction,j)
A verdict = supported if all components support;
            contradicted if p_contradiction,hypothesis ≤ α;
            inconclusive otherwise.
```

Under the global contradiction null `θ_j ≥ q_j` for every registered component, valid marginal p-values and the union bound give probability at most α of a false aggregate contradiction. This needs no independence between claims/contexts; it still relies on the marginal binomial-test assumptions about replicas and on legitimate supplied values. It does not authenticate evidence, calibrate the seed distribution or repair retained-input provenance.

**Holm versus Bonferroni:** For the binary “any contradiction?” decision, `min(Holm-adjusted p-values) = min(1, M × min(raw p-values))`. The first step already determines whether any component is rejected. Holm can identify more individually rejected components after that first rejection; it does not give a different aggregate any-component verdict. Thus “choose Holm” is not the missing owner decision. The missing decision is A's inferential promise versus B's diagnostic promise. Component-level adjusted attribution, if wanted, must be named separately from raw flags.

### Scope of α and missingness

- This A contract controls **one hypothesis's contradiction direction**. It is not a joint α guarantee across support plus contradiction, or across multiple hypotheses/studies. At a boundary where both directional nulls apply, giving each direction α does not make their combined false-decision probability ≤α. A joint guarantee would need a separately approved allocation and could change the existing support contract.
- Current `adjustStudy` applies Holm to hypothesis-level **support** p-values and retains `unadjustedVerdict`; it does not adjust aggregate contradictions. Do not repurpose its `supported` field to mean refutation. A desired cross-hypothesis refutation family needs a separately declared unit/list and correction contract.
- Unknown rows remain adverse to both directions: count them as not holding for support and as holding for contradiction. They do not shrink M. Missing registered contexts are rejected by native analysis, not quietly excluded.
- The current registration feasibility check concerns the best possible **support** p-value. It is not a power guarantee for A. For `q=0.5`, the minimum per-component contradiction tail is `2^-n`; with M=2 and α=0.05, n=5 is insufficient while n=6 can cross the proposed aggregate threshold. Insufficient power is not a new reason to reject a previously valid registration.

## Checked synthetic controls

[controls.mjs](controls.mjs) constructs valid current registrations and deliberately supplied scalar rows; [controls.json](controls.json) retains exact output. Values are **not claimed to be realizations of native generator runs**. No `confirmHypothesis`, model execution or historical reanalysis occurs. Native registration verification remains enabled for fresh fixtures; the 32-component historical witness is reused from its retained artifact, not replayed.

| Control | M | Native verdict | A overlay | Family contradiction p |
| --- | ---: | --- | --- | ---: |
| One failing component, n=5 | 1 | Contradicted | Contradicted | 0.03125 |
| One failure among two claims | 2 | Contradicted | Inconclusive | 0.0625 |
| One failure among two contexts | 2 | Contradicted | Inconclusive | 0.0625 |
| Failing plus fully unknown context | 2 | Contradicted | Inconclusive | 0.0625 |
| One component, one unknown row | 1 | Inconclusive | Inconclusive | 0.1875 |
| All unknown | 1 | Inconclusive | Inconclusive | 1 |
| Stronger failure, two claims, n=6 | 2 | Contradicted | Contradicted | ≈0.03125 |
| All supported, two claims × two contexts | 4 | Supported | Supported | 1 |
| Two identical registered tests | 2 | Contradicted | Inconclusive | 0.0625 |

B converts each native `contradicted` in this table into a diagnostic `component-flagged` overlay, never a calibrated aggregate refutation. Other labels remain unchanged in this comparison. The nine fixture assertions also check the full registered family count and the Holm/Bonferroni aggregate identity. Additional controls check claim/context order invariance of keyed decision fields (not hash-seeded bootstrap intervals), native rejection of a missing context, and the support-only scope of `adjustStudy`.

The prior 32-component witness remains raw p=0.03125 versus family comparison p=1. Under the **hypothetical** joint distribution with five independent replicas and 32 mutually independent components, each true hold probability 0.6, the existing false-flag rule has probability ≈0.2806226721 of any false flag. With perfectly dependent components at the same marginal rate, that probability is 0.01024. These are two specified mathematical examples, not measured historical error rates or a claim that actual paired components are independent.

## Compatibility and acceptance after selection

Before any implementation, record the selected promise, family unit and α scope in `docs/evidence.en.md`. Keep raw component support/contradiction p-values and counts available; do not overwrite them with adjusted values or silently change the meaning of an existing list.

The selected rollout must expose the analysis method/version and raw versus aggregate quantities. Registration/content integrity and explicit implementation-drift permission remain mandatory. `allowImplementationChange` is not approval to reinterpret a historical design under a newly selected inference method. Historical artifacts stay immutable; any intentionally requested new-method reanalysis must identify both methods and remain a separate artifact, not an automatic confirmation replay or retroactive preregistration. Exact schema/CLI migration is an implementation contract to approve with the selected branch, not a field added by this packet.

A future implementation's acceptance controls are the nine partitions above, claim/context permutations, unknown-family preservation, family-boundary comparisons, direct native/CLI compatibility and preserved E2 fail-before-integrity tests. Run native/full validation for that behavior change. Independently review the selected method before using new confirmatory classifications. Do not bundle offline retained-input trust validation or new mechanism studies into E1.

## Evidence and stop

- Original [review and attribution](../2026-10-23-evidence-debt-review/review-evidence.txt) and [synthetic witness](../2026-10-23-evidence-debt-review/witness.json).
- Existing [statistical contract](../../docs/evidence.en.md#statistical-test), `testClaim`/`analyzeConfirmation`/`adjustStudy` in `src/evidence.mjs`, and `holm`/binomial tails in `src/statistics.mjs`.
- Fresh synthetic checks: `node studies/2026-10-23-e1-contract/controls.mjs`.
- [Validation](validation.json): executable/native-test inputs unchanged; prior 228-test/DAG evidence reused, not rerun. Fresh context/whitespace checks cover this packet.

**Preparation complete; owner-gated.** Choose A or B and its stated scope before inference changes. Further synthetic permutations cannot choose the intended promise. This is coordinator methodology preparation, not independent review, selected policy, scientific confirmation or evidence of real-world validity.
