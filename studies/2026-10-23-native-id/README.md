# Rejected native artifact registration and future IDs — 2026-10-23

**Diagnostic correctness repair, not an economic attack or protocol selection.** Baseline: `8391c9e90eba74fb1eed9bec5625192590c10da9`. The owner explicitly resumed only the Facety correctness loop; D33 remains unimplemented and DEOS is outside this scope.

## Defect and repair

`registerArtifact` allocated its default ID in the parameter initializer, before publisher/count/hash validation. Five rejection classes advanced a private shared counter without changing immediately exposed state. Two rejected calls shifted the next artifact `artifact:5 -> artifact:7`, Self-ID `self-id:6 -> self-id:8` and invitation `invitation:7 -> invitation:9`. Later event/claim references differed although the demonstrated ledger values did not.

The repair validates first and allocates only on successful registration. Explicit IDs remain supported and do not consume the generator. Automatic allocation skips names already occupied by explicit IDs; this deliberately changes automatic collisions from rejection/retry to successful fresh allocation. Explicit duplicate IDs still reject without side effects.

Two native regression families failed before the source edit and pass afterward. No raw fail-before log was archived; the old source remains in Git and `witness.mjs` reproduces it directly.

## Funded public-API evidence

`witness.mjs` loads the old model with the unchanged graph dependency, not the historical whole scheduler. Every prefix creates an authorized guarantee, two native Self-IDs, mature conversions and a supplied invalidation of the third root. No evaluator truth or direct graph mutation determines admission. The identical suffix creates another own Self-ID, burns its mature right for an invitation, waits for the contest window and admits a newcomer.

The cases are unknown publisher, invalidated publisher, invalid detector count, invalid hash and duplicate hash, plus an explicitly invalid-ID control. Every case executes two rejected calls. Old immediate exposed snapshots match; five old later suffixes drift. The explicit-ID control already preserves later state on the old model. All six current suffixes preserve the measured native state, IDs, graph snapshots and ordered events exactly. The successful suffix also reuses the candidate hash from rejected attempts, checking that it was not reserved.

The namespace control registers explicit `artifact:0` and `artifact:1`. A rejected invalid count leaves exposed state unchanged; old automatic allocation then rejects at the occupied name, while current allocation returns `artifact:2`. The unit test additionally covers explicit duplicate rejection, a non-generated explicit name and explicitly undefined ID.

## Validation and preservation

- **29/29 model tests; 214/214 full-suite tests.** Focused two-family fail-before evidence and subsequent model/full runs are coordinator execution, not independent review.
- **12 existing scheduler contexts** preserve every retained field and complete ordered native event log except provenance (`scheduler-preservation.json`). Those contexts do not exercise the intentionally changed rejection/collision cases; no universal behavioral-equivalence claim is made.
- **24 other source modules and 166 historical study files** are raw-Git-blob identical (`witness.json`). The witness requires source isolation and unchanged old artifacts; do not weaken its guard after future unrelated edits.
- Implementation: **`a3a5c26e6e34ece29a967d135ccde81ed132f9e7bd226673b4ef26ba7844e0f8`**, 25 modules, Node v26.8.1. Scheduler generator/key layout remain unchanged (`sha256-xoshiro128starstar-v2` / `decision-keyed-v1`). Native witness randomness is absent: inputs are supplied, not sampled.
- Context, DAG and whitespace results are recorded in `validation.json`, `context.txt` and `dag.txt`.

## Limits and next boundary

This closes registration-validation ID drift, not all private counter limits or all model transaction boundaries. A successful registration followed by failed Self-ID creation is two calls: the earlier successful registration is not rolled back. Separately charged scheduler attempts/work are not refunded. Allocation failure, arbitrary callbacks, externally mutated state and numeric counter exhaustion are outside the proof.

No extra mint, realized financial loss, attack probability, human uniqueness, useful contribution or sustainable distribution is demonstrated. Source identity changes deliberately; historical confirmations do not transfer. Saved-game analysis bindings likewise require fresh offline analysis under their existing source/runtime policy, even when the retained numeric facts are unchanged. D33 verification/topology/bootstrap/epoch/voting contracts and migration remain gated.

Next in [BACKLOG.md](../../BACKLOG.md): repeated identity-chain cuts and caller-owned sanctions, with repeat-verdict authority classified rather than invented. Stale proposals, terminal locks, re-link/historical liability and numeric counters remain open.

## Reproduce

```sh
node --test test/model.test.mjs
npm test
node studies/2026-10-23-native-id/witness.mjs
node studies/2026-10-23-causal-core/preservation.mjs
```

The witness prints without overwriting evidence. It is a source-isolated diagnostic, not a mechanism confirmation or historical full-tree replay.
