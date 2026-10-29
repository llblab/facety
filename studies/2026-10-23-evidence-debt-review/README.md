# Evidence pipeline and debt reservation review — 2026-10-23

**Bounded independent review with a degraded synthesis qualification; two unresolved findings.** Target: `a40fdb0f3879866137c04f2f4f3d41276e07f311`. Run: `facety-evidence-debt-review`, instance `fa3af91e-761d-4d8b-983f-3a294385ca6a`. The two original reviewers covered different surfaces; they are not two votes on either finding. Runtime completion is `done`, not implementation approval. No runtime, tests, defaults, randomness or historical study changed during this checkpoint.

## Evidence and source preservation

The coordinator directly inspected both original reports, verifier, merger, judge and normalization, plus the retained execution manifest and terminal lifecycle evidence. The original reviewer/verifier outputs are retained here rather than relying solely on the normalized summary:

| Runtime reference | Retained report | Role |
| --- | --- | --- |
| `execution.json#command-005` | [review-evidence.txt](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-evidence-debt-review/review-evidence.txt) | Original evidence/statistical reviewer |
| `execution.json#command-006` | [review-debt.txt](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-evidence-debt-review/review-debt.txt) | Original debt-reservation reviewer |
| `execution.json#command-007` | [verification.txt](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-evidence-debt-review/verification.txt) | Independent reproductions and bounded debt corroboration |
| `execution.json#command-008` | [merge.txt](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-evidence-debt-review/merge.txt) | Synthesis, relying on verifier's account of originals |
| `execution.json#command-009` | [judge.txt](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-evidence-debt-review/judge.txt) | Report-level judgment; did not receive original reports |
| `execution.json#command-010` | [normalized.txt](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-evidence-debt-review/normalized.txt) | Final normalized report; retains degraded status |

[execution.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-evidence-debt-review/execution.json) is the original runtime manifest. Its capture/session paths refer to the originating Run directory, not copied local subdirectories; the table supplies the durable report mapping. The coordinator checked command IDs, roles, successful exits and accepted substantive outputs against this manifest. All six retained reports match their source stdout exactly.

**Do not erase the degraded qualification.** The judge received the merger, not the original reviewer/verifier reports, and therefore did not independently establish source-level preservation. The normalizer inherited that limitation. Direct coordinator inspection and exact report retention repair discoverability and mapping, but do not retroactively turn that judge into a source-fidelity audit. No complete cross-session tool-transcript audit or independent fidelity re-review is claimed.

The four startup stages exited successfully and substantive tool access was subsequently observed. Their manifest entries nevertheless have `semantic_acceptance: rejected`; they did not emit the requested exact startup acknowledgement. This is preserved as an execution qualification, not mislabeled as four passing semantic preflights. Both original reviewers and all substantive later stages have accepted outputs. No new workflow was launched to manufacture consensus or hide these markers.

## E1 — Medium: Aggregate contradiction multiplicity

Original finding: evidence reviewer; independently reproduced by the verifier and then by the coordinator's [witness.mjs](witness.mjs).

Each claim/context has an unadjusted lower-tail contradiction test, but any such flag makes the whole hypothesis `contradicted`. This is not the support-side intersection-union test. In a synthetic 32-claim registration with five replicas, one claim receives five low values while the others receive high values. The native aggregate verdict is `contradicted`; the flagged raw p-value is `0.03125`, whereas the Holm comparison is `1`.

For hypothetical independent component hold probabilities of `0.6`, the probability of at least one five-replica contradiction among 32 claims is `1 - (1 - binomialLowerTail(0, 5, 0.6)) ** 32 ≈ 0.2806226721`. This is a conditional mathematical illustration, not a measured error rate for Facety or its historical studies, and existing components' independence is not established.

E1 reaches normal confirmation analysis and native offline analysis. The support-side maximum-p-value rule is not invalidated. Remaining decision: control the aggregate contradiction family, or explicitly narrow the aggregate label to unadjusted diagnostic flags. Holm is an illustrative available method, not a newly selected scientific contract. Historical results remain unchanged and source-bound.

## E2 — Medium: Native reanalysis accepts a changed registered design

Original finding: evidence reviewer; independently reproduced by verifier and coordinator.

Register a claim with margin 10 and analyze five synthetic retained values of 1: `contradicted`. Clone the registration and change its margin to zero without changing the hash. `verifyRegistration` rejects the mismatch, but direct `analyzeConfirmation` returns `supported`. The native public reanalysis boundary therefore does not enforce its documented fixed-design contract.

Inspected CLI reanalysis and `confirmHypothesis` verify first; no bypass of those callers is shown. The next safe implementation slice is to verify registration at the native API boundary, add a fail-before regression and explicitly preserve legitimate historical-implementation reanalysis. Allowing a changed implementation must never allow a changed registered design. No new protocol choice is needed to enforce that existing integrity contract.

## Debt reservation — Bounded no-supported-defect result

The original reviewer inspected model transitions and focused scheduler/dispute callers, ran **29 native model tests**, and reports 15 additional reservation/atomicity checks. The verifier independently ran a **39-test** group including those model tests and **5 focused evidence tests**, plus its own selected-default reservation probes. These counts overlap and are not additive independent tests.

Checked behavior includes deferred debt/XP at reservation, the selected 24-hour maturity boundary, locks and matching unlock, no overreservation, additional debt, veto without debt repayment, voided rights, repeated settlement and examined rejected-operation atomicity. Immediate-burn remains an explicit comparison reference. No supported defect was found in those checked transitions. The verifier did not independently repeat every original reported check; the coordinator did not rerun the debt probes or native suite in this documentation/diagnostic checkpoint.

The detailed existing reservation regression uses legacy timing, while the selected-default checks here are execution probes, not permanent native regressions. Permanent default-boundary coverage remains useful. This is not exhaustive state-machine correctness, proof of economic adequacy or a resolution of D34 historical liability/correction/dependent-debt rules.

## Observations kept separate from defects

- **Retained input provenance:** supplying numeric rows marked censored with repeated seed labels can still yield `supported` and zero unknowns. The coordinator reproduces this in `witness.mjs`. It is acceptance of inconsistent offline input, not evidence that native generation emits such rows. A trust-boundary contract is needed before broadening validation or calling this an additional defect.
- **Unlock before sanction:** the scheduler's existing ordering can settle a mature reserved right when it unlocks before a later verdict. No current inspected contract establishes this as wrong; do not infer a D34 correction rule.
- **Probe history:** the evidence reviewer first attempted to mutate a frozen implementation descriptor and observed `TypeError`; its successful later probe used a mutable clone. Preserve the failure separately from successful reproductions.
- **Scope:** no confirmation study was rerun. Synthetic retained values and transient in-memory registrations are diagnostic, not preregistered evidence of an emergent mechanism, attack probability, personhood, honest retention or D32 useful distribution.

## Reproduction and validation

```sh
node studies/2026-10-23-evidence-debt-review/witness.mjs
```

[witness.json](witness.json) retains the synthetic inputs, registrations, outputs and source/runtime identity. It demonstrates the reviewed implementation's current defects, so replay requires that implementation; a future integrity repair is expected to reject the E2 construction instead. The script does not simulate, confirm a hypothesis or overwrite its output file.

Fresh coordinator checks: E1/E2 and retained-input observation reproduced, exact six-report retention and execution mappings checked, runtime source/tests/examples/CLI/package and all prior study artifacts compared to the target, context validator and whitespace check. [validation.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-evidence-debt-review/validation.json) records this evidence. Prior 221-test/DAG evidence from the unchanged target is reused, not relabeled as a fresh test run. Findings remain unresolved; Checkpoint 3 is narrowed to their remediation and remaining scientific/input-boundary decisions, not declared fully accepted.
