# Experiment configuration ownership — 2026-10-23

**Bounded behavior-preserving refactoring; diagnostic equivalence evidence.** Reference: `0d2e7a4`. The backlog selects responsibility separation before any D33–D36 scheduler migration. This checkpoint extracts configuration only; it changes no protocol, economic, observation, dispute or inference policy.

## Ownership and scope

`src/experiment-config.mjs` now owns defaults/assumptions, normalization and validation, dotted parameter overrides and day-specific activity views. It does not run the scheduler or consume random draws. Its dependencies are existing lower-level policy, effort, topology, randomness metadata and stake-reference contracts; it never imports `experiment.mjs`.

Existing clients still import the same constants and configuration functions from `experiment.mjs`. They are direct identity-preserving re-exports, not wrapper copies. `dayActivity` becomes a named internal configuration export for the scheduler but is not added to the experiment public facade. A permanent native test checks the exact facade names and re-export identities.

The main file shrinks **1,251 → 990 lines**. The new owner contains 274 lines, including imports/header and the 268-line moved block with its old inter-section separator trimmed at the new file boundary. This is clearer responsibility, not a claim that total source shrank or execution became faster. `assessViability` already resides in `games.mjs`; the backlog's earlier claim that it needed extraction from experiment was corrected, not acted on.

## Source and public-contract proof

`preservation.mjs` archives the reference source into a temporary directory and imports that implementation separately. It asserts:

- Exactly one existing source file changes: `experiment.mjs`; all other **24** existing source modules stay byte-identical.
- Exactly one source module is added: `experiment-config.mjs`.
- The configuration body is exactly the reference block, apart from making `dayActivity` exportable to its scheduler consumer and trimming one trailing inter-section blank line at the new file boundary.
- The entire source suffix from the observation environment through the end of the scheduler is byte-identical.
- Old/current experiment export names and all exported non-function constants match.
- Eighteen configurations match normalized values, start/middle/end daily views and a declared parameter override; twelve malformed configurations preserve rejection class/message.

The first focused run exposed an omitted scheduler import of `DEFAULT_ABLATIONS`: 34 of 38 tests failed with `ReferenceError`. Restoring that existing runtime dependency fixed the extraction; no scheduler-body change was needed. This failed implementation attempt is preserved as validation history, not a new model finding or an old-source defect.

## Trajectory and event comparison

The fresh comparison reuses **only the declared configuration inputs** of the earlier twelve-context scheduler control: three dispute procedures × two stake backings × social investigation/gossip hooks off/on. It compares the archived reference to current execution, not to old result digests, and does not replay an old confirmation.

Four additional contexts cover honest growth, real-person cartel, combined perturbation/deviant schedules with explicit legacy timing and counterfactual ablations, and action-cap censoring. Each run keeps its supplied seed and existing keyed draw policy. Read-only instrumentation adds the model's ordered event list to the returned control record; it does not perform extra economic transitions or random draws.

For all **16** before/after pairs, deep values and serialized bytes of **every returned field plus 27,381 ordered protocol events** match after removing only the `provenance` field. Both copies run on the same Node runtime. Full configurations, result digests, event counts, observed censorship and source identities are retained in [preservation.json](preservation.json).

This is bounded diagnostic equivalence plus a literal source-move proof, not exhaustive behavioral equivalence over all possible inputs, independent review, performance improvement or a security/emergence result. Inert-inspection and future-intervention-prefix controls also remain in the native tests.

## Validation and provenance

```sh
node studies/2026-10-23-experiment-config/preservation.mjs
node --test test/experiment.test.mjs test/perturbations.test.mjs test/disputes.test.mjs test/social.test.mjs
npm test
```

Observed: **38 focused tests**, then **226 aggregate tests** passed, with overlapping counts. The metadata inventory test is refreshed after its source-location descriptions change. The Domain DAG has **26 source modules / 64 local edges**, with zero errors/warnings. Context, whitespace and validation details are in [validation.json](validation.json); the full native test output is retained in [tests.txt](tests.txt).

All **207** files already tracked under `studies/` at the reference commit remain byte-identical. The source-content digest changes because a source file is added and imports move; `RANDOMNESS_POLICY` and the generator do not change. Historical artifacts retain their original source fingerprints, and no confirmation is automatically transferred or rerun. The previous review's source-fidelity qualification remains unchanged.

The next backlog slice examines stateless public-graph social helpers. Stateful dispute extraction remains subject to interface/state-coupling pressure; do not replace one cohesive closure with a callback-heavy facade just to reduce line count. D33/D35/D36 operational choices, D34 event/duty/recovery contracts and E1/retained-input methodology decisions remain gated. No personhood, safe bootstrap, anti-farming economics or useful-distribution result follows.
