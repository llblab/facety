# WP1 Native tape backend foundation

**DIAGNOSTIC implementation; G1 and research remain unrun.** The [closed composition contract](wp1-composition.md) now has an executable source-owned backend, not only a test bridge. This bounded slice does **not yet wire it into `runExperiment`, global observable/discovery normalization or the actual v2 registry**. The existing registry rejects this mode; no schema-shaped registration or confirmation output is manufactured. That integration is the next BACKLOG cohort.

## Actual config and execution owners

- [`src/vouch-experiment-config.mjs`](../../src/vouch-experiment-config.mjs) owns `vouchExperimentConfig`, the exact `native-vouch-tape/v1`/reference binding, wire metric vocabulary and randomness/schedule manifest. All fields are explicit; unknown modes/operations/fields/authority classes, missing private facts, overwritten creation handles and out-of-horizon/reordered events fail closed. Configuration is deep-copied/frozen. Constructor-only checks use a validation-only zero-endowment Model and the existing environment's facts/rate checks; no tape or observation is executed during normalization.
- [`src/vouch-experiment.mjs`](../../src/vouch-experiment.mjs) owns `runVouchExperiment(config)`. Actual funding, maturity, membership, bonds, exits, cases, settlements and refunds use `FacetyModel`; actual paid observations/vetoes use `VouchActReview` and existing `actObservationEnvironment`. It never calls the independent oracle or the test bridge. There is no seeded free money/XP or automatic work on birth.

Required root fields are `engine`, `reference`, `days`, string `seed`, `includeState`, positive `maxActions/maxSubjects`, explicit `successCriterion:'unbound'`, complete `model`, `work`, private `environment` and ordered `events`. Model includes explicit genesis/policy/ablations/invitationLimit/vouching/vouchAdmission. Work is one explicit reference/actor/cost allocation. Environment contains declared subject facts, Boolean act validity by logical creation handle and complete role/kind rates. These are supplied uncalibrated inputs, never inferred truth or human costs.

Each event has an integer `atHour`, operation-specific fields and explicit host-declared authority: subject-call, trusted-administration or custody-review. Supported operations follow the closed contract; `pool` is one explicit allocation attempt, including after a declared subject exists. Administrative verdict/clearance is not a detector decision, phase-eligible court or an actor-selectable privilege. This is a trusted exogenous tape, **not authentication, a WP7 agent API, adaptive strategy, endogenous adoption or full CORE**. Non-review labor remains unmodeled, not a measured zero. Native transitions keep their own preflight semantics; a whole tape is not an invented all-or-nothing transaction.

## Observation, clock and missingness boundaries

Only the private environment reads person/profile/act-validity facts. Review receives public Native references and fallible suspicion; changing genuine/profile labels with act-validity/rates/seed fixed changes no protocol/defense output. A positive signal can be response-budget-denied, or a funded valid-act false suspicion can cause a native act veto/funding loss. Neither establishes fake personhood, membership removal, bond liability or attack prevention probability. Native Claim/Standing, verified independence and selected court gaps remain explicit.

Commands lie in `[0,H)` and retain declared same-hour order. Daily samples at24,48,…,H first process automatic maturities, then precede commands at that exact boundary; no command executes at H. Observations reuse `act-observation-keyed-v1` and its existing key/generator. The new exogenous decision/schedule descriptors are `exogenous-native-vouch-tape-v1` and `native-vouch-tape-boundary-v1`, not a claim of new independent encounters. Pure reads/repeated trials do not redraw or create work.

`maxActions` censors before an unresolved further command; exact exhaustion with no further command does not censor. The subject cap conservatively censors before an offered new admission when at capacity, without declaring that admission would succeed. Future endpoints are omitted/unknown, never populated from the last row or safe zeros. Declared horizon and actual stopped hour remain separate. Work denials are scenario outcomes, not computational censors. Expected Native policy rejections and explicitly refused clearance are logged without changing their completed predecessors; unexpected exceptions propagate rather than becoming clean observations or favorable outcomes.

## Measured output, not viability

The result is `facety-native-vouch-run/v1`, with diagnostic classification, config/assumptions/provenance/randomness, action outcomes, day-end history and optional protocol/work state. `outcome.success` stays **null** because its criterion is unbound. Private facts remain evaluator config, never Model state/defense inputs.

Namespaced `vouch.*` measurements cover actual members/admissions/relations/slots/cases, minted/burned/Collector/Emitter/bond custody/debit/refund quantities, XP total, paid observations/suspicion/veto/work, unobserved/inspection-denied/response-denied receipts and action rejections. Members are not verified humans, XP is not usefulness, gross debit is not net coalition loss, refund is principal, and no zero-XP concentration is invented. Every measured field is finite and the vocabulary is checked. Global `metricSeries`/evidence admission remains deliberately unavailable until the next integration slice.

## Validation

[Nine families](../../test/vouch-experiment.test.mjs) cover immutable closed normalization, real execution versus independent per-action/daily endpoint expectations for all four composition witnesses, exact boundary order, cap missingness, hidden-label/fallibility/resource contrasts, actual keyed observation/seed replay, invalid authority/truth-shaped inputs, failed pool/clearance handling and current v2 refusal. These are fixed software fixtures, not master experiment/search/confirmation seeds or calibrated laws.

```sh
node --test test/vouch-experiment.test.mjs
npm test
```

[Validation binding](wp1-backend-validation.json):444 current tests and21 separately source-pinned historical tests pass; DAG35 files/86 edges is acyclic, no errors/warnings. Native source **implementation identity changes** because two source modules are added; existing default behavior, historical packets and refusal guards are not rewritten or recaptured. Actual v2 dispatcher/config/metric/statistic admission, a committed real method with ranges/precision/kills/search budgets and written priors1–3/7 remain before G1. No research run, frontier map, LLM agent or pilot occurred.
