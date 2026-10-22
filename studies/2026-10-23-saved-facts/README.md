# Saved-game missingness checkpoint — 2026-10-23

**Diagnostic correctness repair, not a protocol selection, calibrated viability result or mechanism confirmation.** This bounded cohort removes false-zero budget reporting and false approval of undefined summary metrics. Broader retained-record completeness is **not finished**; the residuals below are next in the canonical [backlog](../../BACKLOG.md).

## Witness and preservation

`witness.mjs` imports the old pure analyzer from commit `de0365b7b3344bcac2a4a2da91e986bd95e6bf62`, resolving its support modules to the current tree. It verifies every other source module and every previously committed study file against raw Git blobs before comparing the APIs. This is **not a historical full-model replay**.

- Missing saved minted/circulating/Council observations previously became zero. They now remain `null`.
- A supplied `deterred` summary without money/Council measurements previously passed explicit 0.2/0.5 caps; the same input now fails both enabled criteria. The supplied verdict isolates assessment behavior, not actual deterrence.
- A zero-baseline/missing-wrongful witness previously returned `viable: true` with `NaN` mandatory metrics. JSON serialized those values as null; separate witness flags preserve their actual non-finite nature. Now both criteria fail with honest unknowns.
- One common complete game (four profiles, eight deviations, three replicas, **36 native runs**) has exactly equal old/new analysis, deterrence summary and positive-baseline default viability. This is a bounded comparison, not a universal equivalence claim.
- All **24 unchanged support source modules** and **124 pre-existing study files** match their committed raw blobs. Historical numbers, logs and fingerprints are not rewritten.

`witness.json` binds implementation `3e9d46868e90541b66d7456e00c56ec78787b18ce0c8782a3fd00c5517ce1adc` (25 source modules), Node v26.8.1 and randomness `{ generator: "sha256-xoshiro128starstar-v2", decisions: "decision-keyed-v1" }`. The source code declares the scenario, valuation, horizon and replica seed label. No randomness policy or native transition changed. A future source fingerprint is a new diagnostic identity, not renewed historical confirmation.

## Measurement contract

The [game contract](../../docs/games.en.md) distinguishes a missing observation, measured zero, zero equilibrium support and an explicitly disabled criterion. Budget means require all declared replicas and valid shares/counts; positive-support missing measurements propagate as unknown. Explicit `(Council seats, attacker seats) = (0, 0)` retains the existing empty-Council zero convention. Caps below 1 require measurements; cap 1 remains disabled without hiding null outputs.

At the assessment boundary, mandatory retention/wrongful metrics must be known and valid. Retention requires a positive finite utility baseline; this is a declared ratio, not affine-invariant welfare. Non-negative finite analyst limits are required, with share caps in [0,1]. A null-driven failure means insufficient evidence, not a measured violation. These are analysis checks, not new protocol law.

## Validation and independent review

- **11/11** game tests, including four new regressions; **206/206** full-suite tests in `tests.txt`. The four regressions failed against the preceding implementation before the repair.
- Complete-data differential and raw historical/source checks in `witness.json`; all **12** declared scheduler procedure/backing/social-hook contexts preserve retained fields and ordered native events except provenance (`scheduler-preservation.json`).
- `validation.json`, `dag.txt` and `context.txt` bind the integrated checks and source identity.
- Raw `review-005.txt` and `review-006.txt`: two independent read-only reviewers each ran the 11 game tests; no introduced material defect established. Reviewer 006 additionally reports 24 native-run fact records and two complete valuations equal under old/current game modules with current support modules. This is attributed reviewer evidence, separate from the coordinator's 36-run common-fact analysis control.
- `review-007.txt`: verifier independently inspected the same source/test digests and ran the 11 game tests; some residual probes/differentials remain explicitly attributed, not rerun.
- `review-008.txt` preserves both residuals. Judge/normalizer `009/010` are **degraded for evidence access**: their inputs contained references/summaries rather than all underlying bodies. The coordinator retained and read all six raw reports; no global readiness or independently judged merge-fidelity claim is made. Overlapping test runs are not added together.

## Residuals and next bounded cohort

1. **Mandatory-summary completeness:** budget means require the declared replica count, but payoff/sanction summaries still use retained observations. Reviewer 005 reports that declaring 20 replicas while retaining six can still yield default viability with budget caps disabled. The verifier confirmed the source asymmetry, not that exact probe. This is pre-existing, not a new regression; it must not be called complete-replica validation. Next: reproduce, cover per-replica valued-fact missingness too, and prevent incomplete observations from establishing mandatory/equilibrium claims without guessing absent values.
2. **Raw-sanction compatibility:** reviewers independently found that an absent later-replica or null sanction can throw before profile-level unknown propagation; absence from the first replica behaves differently because keys come from that record. This unchanged helper fails closed in the demonstrated cases but is not uniform missingness handling. Next: make the admitted-record contract explicit and consistent in the same bounded cohort.

Full-suite success does not resolve these residuals. They remain actionable in `BACKLOG.md` before the native transition/provenance audit. No new research sweep or owner-dependent procedure was selected.

## Reproduce

```sh
node --test test/games.test.mjs
npm test
node studies/2026-10-23-saved-facts/witness.mjs
```

The witness prints output; it does not overwrite retained evidence. Its differential boundary is the stated preceding commit with only `src/games.mjs` changed. Later edits to other source modules intentionally require a separately justified boundary rather than weakening this guard.
