# D37/D38 versioned inference migration — 2026-10-23

**Behavior change; diagnostic/regression evidence, not scientific confirmation.** Baseline: `77ba07c`. D37 selects calibrated aggregate contradiction; D38 records the owner's explicit compatibility/migration approval. Source changes are confined to `src/evidence.mjs`, plus CLI composition and native tests. Other source owners, model economics and randomness policy are unchanged; the source-content fingerprint changes.

## Implemented boundary

- New `facety-hypothesis/v2` registrations bind `analysisPolicy: "family-contradiction/v1"` into their digest/reserved namespace. New confirmations identify `facety-confirmation/v2` and the method.
- Ordinary native analysis uses only the verified registration's method. The full registered claim/context family controls aggregate contradiction through `min(1, M × min(raw contradiction p))`; support remains maximum-p-value IUT.
- Actual historical v1 registrations retain the original hash layout and inferred `unadjusted-contradiction/v1` by default, including with explicit implementation-drift permission. An unbound policy field on v1 is rejected.
- Explicit native/CLI A reanalysis produces `facety-reanalysis/v1`, identifying bound/requested methods, original registration, source-content digest and current implementation. It neither edits registration/inputs nor runs the model. CLI without the flag retains bare computed analysis; method-tagged metadata additions do not rewrite old stored results.
- Raw component tails/flags remain raw even when the family-controlled verdict is inconclusive. `adjustStudy` remains support-only and carries method/artifact identity; it is not authentication or contradiction control.

See [the API/CLI contract](../../docs/evidence.en.md#versioned-analysis-and-reanalysis-d38), [§47](../../docs/facety.protocol.en.md#47-calibrated-aggregate-contradiction-in-simulator-research-d37) and [§48](../../docs/facety.protocol.en.md#48-versioned-analysis-and-historical-compatibility-d38).

## Validation

`node --test test/evidence-policy.test.mjs test/evidence-policy-cli.test.mjs test/evidence.test.mjs test/cli.test.mjs`: **21 passed**. These are included in **234 passing tests** from `npm test`; see [tests.txt](tests.txt). Domain DAG: **27 modules / 65 local edges**, zero errors/warnings; see [dag.txt](dag.txt). [validation.json](validation.json) records final provenance, review status, historical preservation and context/whitespace checks.

New property/boundary partitions cover one/multiple claims and contexts, a fully unknown context that still counts toward M, unknown rows, stronger evidence, supported conjunctions, duplicate tests, the 32-component witness, decision-order invariance and missing contexts. Integrity controls cover v2 policy binding, downgrade/unbound-policy attempts, unsupported options, E2 design/namespace/randomness tampering, method/schema mismatch and refusal before output. Native/CLI controls preserve default legacy statistics, explicit A artifacts and unchanged input content; generic output overwrite still requires `--force`.

The frozen v1 artifact used in compatibility tests is the earlier **synthetic supplied-value witness**, not a replayed scientific confirmation. The full native suite also constructs its existing synthetic fake-old-implementation test registration; this is not a stored historical study. No historical scientific registration is passed to `confirmHypothesis`, and no old study result is overwritten or retrospectively relabeled. Old study scripts remain source-bound evidence, not migrated fixtures.

## Independent review and qualifications

Initial Run `facety-d37-policy-review` completed operationally but launched with the Recipe's empty tools default (`--no-tools`). It could inspect no implementation and is **insufficient_data**, never acceptance. All original outputs are retained as `first-run-{statistics,compatibility,verifier,merge,judge,normalized}.txt`.

After diagnosing that exact tool-policy boundary, the same maintained `swarm/lens-review` Recipe was relaunched as `facety-d37-policy-review-tools` with explicit `read,bash` access. Its primary reports are retained separately:

- [Statistical reviewer](review-statistics.txt): **complete**, no supported defects; independently executed 180 retained-value decision checks with an independent binomial mass recurrence across thresholds/directions/contexts/unknowns, plus focused native checks. This is not an empirical simulator study.
- [Compatibility reviewer](review-compatibility.txt): **degraded**, no supported implementation defects. Its intended test exclusion failed and executed the suite's newly constructed synthetic fake-old-digest confirmation test. This is an actor task-card execution-boundary deviation; it is preserved, not promoted to an unqualified approval. No stored historical scientific registration was replayed.

Both reviewers read the actual six scoped source/test files and recorded identical before/after SHA-256 hashes. Coordinator integration retains the same reviewed implementation. Their conclusions concern code/statistical compatibility, not universal readiness, evidence authentication or the complete simulator. The source/API documentation was reconciled by the coordinator while source/test review targets stayed stable.

**Pipeline reconciliation — degraded, bounded handoff:** the [verifier](review-verifier.txt) inspected both exact reviewer bodies, independently ran six policy tests and three exact-name-selected native/CLI tests, and corroborated the scoped implementation with stable hashes. The [merger](review-merge.txt), [judge](review-judge.txt) and [normalizer](review-normalized.txt) retain the workflow deviation and operator overwrite limitation; the latter stages do not independently audit the upstream primary bodies. Their fidelity qualification remains. The coordinator subsequently inspected and retained all six original retry reports, without claiming a new independent fidelity audit or upgrading the pipeline to unqualified acceptance. Scoped source review plus the coordinator's fresh 234-test integration supports this bounded implementation checkpoint; it does not establish scientific validity or repository-wide readiness.

**Operational limitation retained:** general CLI `--force` can overwrite a caller-selected existing path. Always choose a new reanalysis path; this migration does not sandbox arbitrary output paths or authenticate supplied scalar rows. Source/content digests and method tags identify inputs/methods, not truth or preregistration time.

## Non-goals and retained gates

No joint support/refutation or cross-hypothesis contradiction guarantee, no offline seed/censoring trust-model expansion, no new mechanism claim, no automatic historical study replay and no D33–D36/D34 runtime migration. Historical classifications remain statements under their original method/source. A separately requested A reanalysis is not retroactive preregistration.
