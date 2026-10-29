# WP1 actual P/b v2/dispatcher/observable admission

**DIAGNOSTIC software integration, not programme preregistration, G1 or empirical confirmation.** The [P/b capacity backend](wp1-pb.md) is now admitted by the **actual** common experiment/config/randomness/metric/evidence/worker path. No parallel lookalike schema/analyzer, historical-source override or reserved confirmation run is introduced.

## One real execution path, three distinct engine contracts

`experimentConfig` explicitly dispatches `native-pb-capacity/v1` and `native-vouch-tape/v1` to their strict normalizers. An own unknown/null/undefined engine fails closed before a legacy fallback or wrong-mode normalization. Legacy configs still have no default engine property. `withExperimentParameters` validates the actual resolved Model/source/workload parameters; it does not add legacy knobs or extra funding to the P/b profile.

`runExperiment`/CLI `run` normalizes through that owner and executes actual `runPbExperiment` or `runVouchExperiment`, otherwise the unchanged cohort runner. No expected/reference transition is used as the execution backend. The experiment facade's existing exports remain unchanged. A fixed full-state vouch run and the fixed legacy conformance run match their pre-integration semantic digests after excluding **only** `provenance.implementation`; source identity changes, not their protocol trajectories/defaults.

The real `registerHypothesis`/`verifyRegistration` accepts P/b scalar bases with **includeState:false** under `facety-hypothesis/v2` and the unchanged D37/D38 family-contradiction/v1 policy. Normal specification/implementation/manifest digests, namespace derivation, context/arm validation/limits, horizon/success constraints and drift/tamper guards apply. A legacy-v1 envelope cannot acquire either explicit engine, even with implementation-drift permission. Resolved context/arm statistics are checked for engine compatibility, not only the base.

## Deterministic is not stochastic

P/b's actual manifest stays `{generator:'none',decisions:'pb-deterministic-daily-v1',schedule:'pb-capacity-boundary-v1'}`. Config seed is explicit and retained but unused. The registration binds that fact rather than calling repeated labels empirical human/behavior samples. Replicating deterministic inputs does not supply human uncertainty/calibration or additional parameter coverage; a real G1 method must justify its estimand, independent reference, point/replicate/precision model and error family. Generic API admission does not waive those method obligations.

`combineExperimentRandomness` returns unchanged single-policy manifests. Legacy-only daily/subday mixtures retain their old descriptor, and existing vouch+legacy keyed mixtures retain decision-keyed-mixed-engine-v1. A mixture containing different/explicit generators now uses **mixed-explicit-generator-engine-v1**, generator **per-policy/v1** (or none if every constituent has none), and every distinct sorted child manifest. It cannot mislabel the no-draw P/b child as using the keyed generator. Nested mixed descriptors retain per-policy attribution too. No child RNG/key layout/generator or legacy scheduling rule changes.

## Engine-specific measurement and actual task execution

Global `OBSERVABLES` now includes `pb.*` without changing legacy default diagnostic metrics. A P/b run accepts only its P/b primary/subtract namespace, vouch only vouch.*, and legacy only its original namespace. Unknown engines, cross-engine parameters/statistics and unbound `outcome.success` fail closed, including on censored/empty histories; they do not become safe zeros. Full-state registrations remain refused.

Direct series use:

```js
metricSeries(run.history, 'pb.created', {
  days: run.outcome.horizonDays,
  offsetHours: 24,
  engine: run.config.engine,
});
```

The statistic pipeline supplies these fields. Declared24…H endpoints, not last-retained-row inference, determine missingness. Truncated/capped future endpoints and censored scalar runs yield null. The underlying no-terminal-offer, finite one/day demand, banked own-source/24h maturity and partial-prefix resource semantics remain those of [the backend](wp1-pb.md), not a new maximum/growth/payback estimator.

Actual `runStatisticTask`/`runStatisticsTask` exports use common dispatch, once per run for multiple statistics, and work through existing Node worker threads. Tests compare sequential versus two-worker mixed P/b/vouch scalar tasks and P/b multi-statistic/censored tasks on **ordinary software-only labels**. These are the real exports used by confirmation planning, but **no P/b or vouch-engine `confirmHypothesis` call/reserved label was executed**.

Legacy cohort trials/sweeps, landscape planning, paired controls, strategy-game payoffs and daily activity helpers still lack a P/b resource/payoff/sampling contract. They reject with a P/b-specific no-coercion error before execution; existing vouch refusal behavior remains unchanged. Generic dispatcher availability does not make these wrappers or adaptive search engines compatible.

## Software evidence and remaining gate

[Seven integration families](../../test/pb-v2.test.mjs) exercise genuine config/dispatch/parameters, no-draw/mixed manifests, separated metrics/declared-horizon missingness, real v2 binding/tamper/v1 refusal, actual scalar/multi-task workers and unsupported wrappers. [Validation](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-26-trust-topology-condition-map/wp1-pb-v2-validation.json) records47 focused/467 current passes plus21 separately source-pinned historical passes; DAG37/100 is acyclic, no errors/warnings. Test fixture/reference files outside src are separately blob-bound. The prior backend refusal test now checks the still-required snapshot refusal, rather than falsely claiming mode rejection.

Software-only reproduction:

```sh
node --test test/pb-v2.test.mjs test/pb-experiment.test.mjs test/vouch-v2.test.mjs
npm test
```

The test registrations are **ephemeral actual API objects**, not retained/committed programme methods. Their derived namespaces are not executed. No research/search/confirmation, old packet recapture, lifetime/ownership-cut/fake-admission engine, incremental recipient payback, selected CORE/Standing rule, WP5 study, frontier map, LLM testbed or pilot is produced. G1 remains open; [BACKLOG](../../BACKLOG.md#trust-topology-condition-map-master-programme) alone owns the remaining lifetime/cut/method coverage and pre-data registration/range/precision/numeric-kill closure.
