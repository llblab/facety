# WP1 actual v2 engine/observable admission

**DIAGNOSTIC software integration, not a programme registration or G1 result.** The [Native backend](wp1-backend.md) is now admitted through the real experiment/config/observable/evidence/worker APIs. No hand-built lookalike registration format, alternative analyzer or historical drift override is used.

## One execution and registration path

`experimentConfig` and `withExperimentParameters` accept the explicit complete `native-vouch-tape/v1` config; missing/unknown modes do not fall back to legacy. `runExperiment` delegates the explicit engine to `runVouchExperiment`, whose existing Model/review/environment ownership and assumptions remain unchanged. Legacy configs still have no added engine property/default and the public experiment facade's export set remains unchanged.

`registerHypothesis` now accepts that base with **`includeState:false`** and a measured `vouch.*` scalar. It uses actual `facety-hypothesis/v2`, existing D37/D38 `family-contradiction/v1`, the existing specification/implementation/randomness digest, derived reserved namespace, normalization and `verifyRegistration`. Arms/contexts use the same dotted-parameter validation and limits; no new map-wide inference or missing-method exemption is introduced. Changes to private scenario facts, work costs, claims or manifest still invalidate the digest. Implementation drift still requires its existing explicit override; no other tampering is waived.

The existing `runStatisticTask`/`runStatisticsTask` exports execute the actual dispatcher, including normal worker threads. Mode/metric compatibility is checked before execution. A multi-statistic task still runs the model once, not once per metric. Confirmation's existing planner calls these same exports; **no Native `confirmHypothesis` run was performed in this cohort**.

## Strict measurement and randomness boundaries

Global `OBSERVABLES` includes the backend's namespaced measured vocabulary; default legacy diagnostics are unchanged. Native `vouch.*` fields and legacy fields are not interchangeable. Both primary and subtract metrics must belong to the configured engine. Native `outcome.success` is rejected, including on censored runs, because its success criterion is unbound; it is not silently treated as zero/false/a viability predicate. Snapshot-bearing base configs remain rejected by registration. A fabricated legacy-v1 envelope cannot acquire the new Native engine, even with implementation-drift permission; that mode requires actual v2.

Direct Native series use an explicit engine tag:

```js
metricSeries(run.history, 'vouch.admissions', {
  days: run.outcome.horizonDays,
  offsetHours: 24,
  engine: run.config.engine,
});
```

The statistic pipeline supplies this automatically. Expected endpoints remain24…H from the declared horizon, not the last retained row; empty/capped/truncated suffixes yield null, not a favorable last value. Censored scalar tasks yield null. Counts remain accepted protocol nodes/emission/work, not verified people, useful contribution or net attacker loss.

`experimentRandomness` returns the actual backend manifest. ACT key/generator and its declared exogenous schedule remain unchanged. A genuinely mixed engine manifest uses `decision-keyed-mixed-engine-v1`; legacy-only mixed-subday designs retain their original identifier. No default legacy draw/layout/scheduler migration is implied.

## Legacy-only consumers fail explicitly

Legacy cohort trials/sweeps, landscape planning, paired controls, strategy-game payoff wrappers and daily activity helpers do **not** have a Native resource/payoff/success/sampling contract. They reject Native configs before execution instead of reading nonexistent cohort fields, fabricating probabilities/effort or coercing the config to legacy. Adding a supported backend does not make every old wrapper semantically generic. CLI `run`/`register`/the existing confirmation dispatch use their real API routes; unsupported CLI wrappers inherit explicit refusal. No WP3/WP6/WP7 functionality is claimed.

## Software evidence and research gate

[Six new integration families](../../test/vouch-v2.test.mjs) check actual common dispatch/config/parameters/randomness, engine-separated metrics and declared-horizon missingness, real registration/tamper verification, scalar/multi-scalar task exports and sequential/two-worker equality, and explicit unsupported-wrapper refusals. Existing backend/experiment/evidence families share the41-family focused cohort. A fixed legacy conformance run is bit-identical after removing **only** the implementation fingerprint; its full semantic digest is retained in [validation](wp1-v2-validation.json).450 current tests and21 separately source-pinned historical tests pass; DAG35/92 is acyclic, no errors/warnings.

The Native v2 registration objects in tests are **ephemeral software contract fixtures**, not committed programme methods. They derive namespaces to test the real API but no Native reserved confirmation seed is executed and no registration/confirmation artifact is retained as programme evidence. Worker tasks use explicitly software-only ordinary seeds. Existing historical tests remain separately qualified. Source implementation identity changes; old packets/guards/defaults are not rewritten or recaptured.

Next reconcile priors1–3/7 against actual backend/reference coverage (including unavailable lifetime/P-b controls and CORE gaps), then freeze and commit the real scoped claims/arms/contexts/ranges, precision/kill/selection/search contracts before empirical prior execution. The generic registry does not supply plausible human ranges, OPEN policy decisions or the master's extra method obligations. No research/search/confirmation, frontier map, LLM testbed or pilot occurred; G1 remains open and later WPs remain gated.
