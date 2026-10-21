# Facety simulator backlog

Scope: a reproducible Node.js / ESM research simulator for [the proposed protocol](docs/facety.protocol.en.md), not a production runtime or proof of personhood.

## Checkpoint 2 — Emergent behavior discovery

Priority: discover collective regimes produced by interacting local rules, not merely optimize a preselected attack-success score. Investigate stabilizing behavior as well as failure and capture.

Acceptance: a bounded, reproducible discovery harness retains time series and ensemble distributions, exposes candidate regime changes and counterexamples, and distinguishes programmed rules, descriptive associations and evidence for a mechanism. A run need not find an emergent phenomenon to count as valid evidence.

### Incentive alignment — current research priority

Acceptance: distinguish protocol reward/accounting effects, private profitability under explicit preferences, and application-level network externalities. Neither more XP nor more subjects is itself evidence of increased user utility. Fixed activity scripts do not establish an equilibrium.

- [ ] After ownership-review reconciliation, test a conditional adverse-selection witness against both independent admission and waiting, with explicit per-subject authority values and relative expected losses. Keep actual preferences/feasibility unknown and do not pool XP into one identity's power. Falsifier: declared valuations, threshold/counterexample checks and unknown-loss controls.
- [ ] Extend behavioral choices to repeated farming/cartels and mechanism ablations before interpreting a local best response as an incentive-alignment result. Evaluate useful application externalities separately from rewards and subject counts. Falsifier: credible competing-strategy witnesses and declared useful-service controls; real-world utility claims remain calibration-gated.

### Delivery — after the incentive research boundary

- [ ] Validate the existing draft `src/graph-workbench.mjs`: artifact round-trips, standalone mutations, graph extraction, caller-owned roots/targets and independent path verification. It is not yet tested or a delivered CLI. Falsifier: native workbench regressions.
- [ ] Deliver CLI single-run/batch/sweep/discovery/paired-control output and offline reanalysis, plus graph export/mutation/proof workflows after validating the adapter. Keep stdout JSON-only and refuse existing output files by default. Falsifier: CLI smoke tests and end-to-end discovery/control runs.

## Checkpoint 3 — Algorithm optimization and independent review

Acceptance: correct path algorithms are benchmarked on identical snapshots; the research surface is documented and independently reviewed.

- [ ] Add an algorithm benchmark with independent certificate checks, identical queries/snapshots, resource counters and reproducible graph generation. Falsifier: differential algorithm and benchmark smoke tests.
- [ ] Document CLI/benchmark commands and remaining research limits. Falsifier: example commands and architecture/context validation.

## Limits

- Real-world attack probability remains research-gated: requires calibrated behavioral data and agreed protocol policies.
- Full Chekharda adjudication, Council merits procedure, media detection and Treasury D markets are not silently supplied by a simulated oracle.
- Full context validation still reports 11 pre-existing anchor errors in unchanged `docs/facety.protocol.en.md`. A separately scoped protocol-navigation/validator-compatibility check is needed before claiming a clean whole-context result; do not silently rewrite the protocol during simulator work.
