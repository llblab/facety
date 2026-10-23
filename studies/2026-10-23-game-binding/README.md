# Game analysis input binding — 2026-10-23

**Diagnostic data-association repair, not evidence/output authentication or a protocol change.** This closes the stale-complete-cache example preserved by the [retained-cohort checkpoint](../2026-10-23-retained-cohort/README.md). It establishes none of D32's uniqueness, useful-contribution or sustainable-distribution goals.

## Caller inspection and repair

The only production caller pairing `deterrenceSummary(result, analysis)` is `runGameGrid`, which constructs fresh local analysis. The exported helper nevertheless accepted independently supplied stale complete descriptors. The CLI `game-analyze` already recomputes from raw facts; `grid-viability` consumes stored summaries without raw reconstruction.

`analyzeGame` now emits `inputDigest`. Before using cached conclusions, `deterrenceSummary` recomputes and checks a small private binding under **`sha256-typed-game-inputs-v1`**:

- Retained record, excluding its embedded `analysis` to avoid a self-reference.
- Normalized valuation and analysis alpha.
- Declared strategy-key order, which can affect tie selection, alongside preserved array order.
- Current implementation and Node runtime provenance.

Typed projection reuses the existing finite canonical SHA-256 digest. It distinguishes non-finite numbers, null and strings without weakening unknown-value analysis. Ordinary object keys sort, undefined object properties omit, and plain-data aliases become equivalent to equal duplicated subtrees. Valid JSON transport remains stable. A discarded V8-serialization candidate failed grid integration and was replaced before this checkpoint; it is not retained or claimed as a benchmark finding.

Inputs must be data-only acyclic plain retained records, with supported scalar unknowns; custom objects/callbacks are outside the contract. Lossy non-finite JSON conversion, changed record/context—even an unvalued field—valuation, analysis alpha, implementation or runtime requires fresh analysis. An explicit summary sign-test alpha override remains supported.

## Witness, migration and preservation

`witness.mjs` imports the preceding pure game module from **`c0123d3ee6606ec4e65476c278bc9dcdebd4bc20`**, resolving imports to unchanged current support modules. This is not historical full-tree replay.

- The old missing-valued-fact/stale-cache case returns a favorable result. The current helper rejects the stale pair with **`analysis inputs changed or binding missing; rerun analyzeGame`**; fresh analysis reports the unknown/unresolved case honestly.
- Finite payoff, sanction, context, valuation and alpha changes also reject stale analyses. Legacy unbound caches reject explicitly.
- Existing raw fact files remain usable: call `analyzeGame` or CLI `game-analyze` with the chosen valuation. No simulation rerun is required for offline reanalysis. The CLI regression exercises stored embedded-analysis transport and legacy raw-fact migration.
- **36** common native runs, four profiles/eight deviations and **three valuations** (including all-zero weights) preserve every computed analysis conclusion, summary and default/enabled-budget viability. Only the **new `inputDigest` field** is excluded from old/new analysis comparison; no other fields are discarded.
- All **24 other source modules** and **152 pre-existing study files** match their raw Git blobs. Native emission, XP, stake and randomness rules are unchanged. Twelve scheduler contexts retain fields/events except provenance (`scheduler-preservation.json`).

The additional twelve-run prefix receives explicitly synthetic retained utilities solely to isolate the false-safe classification; it is not evidence of real farming returns. `witness.json` binds implementation **`fb99a250b15c1285c1af210a5ff9c5af462e7f1fe1de3c085452964c00ed34c8`**, 25 source modules, Node v26.8.1 and randomness `{ generator: "sha256-xoshiro128starstar-v2", decisions: "decision-keyed-v1" }`.

Old diagnostic scripts remain bound to their old source and assertions. For example, the preceding witness deliberately expects the stale-cache hazard at `c0123d3`; execute that commit to reproduce it rather than modifying the historical witness/output to pass the repaired source.

## Validation and independent review

- **19/19** game/CLI tests; two new game regression families failed before the repair, plus a new positive CLI migration test. **212/212** full-suite tests (`tests.txt`).
- `validation.json`, `context.txt`, `dag.txt` and `scheduler-preservation.json` retain integrated evidence and limits.
- Raw `review-005.txt`/`006`: two independent readers each ran nineteen focused tests on matching source/test hashes. Reviewer 005 additionally reports 120 stale-association rejections and five equivalence controls. Reviewer 006 reports twelve old/current analysis comparisons, twenty-four summary/viability comparisons and twelve JSON comparisons across four valuations/three alphas, plus worker-grid/runtime probes. These are attributed reviewer results, separate from the coordinator's common-fact controls; overlapping tests are not added together.
- `007` independently inspected the source/hash/diff but did not rerun reviewer probes. `008` synthesizes. Judge/normalizer `009/010` are degraded for missing upstream-body access, not demonstrated reviewer failure. The coordinator retained/read all six bodies; no independently judged merge-fidelity or global readiness claim is made.

**Resource caveat:** reviewer 006's five-warmed-iteration microprobe on a 400-run, 1,236,555-byte native fact record reports mean analysis time **31.48 ms → 97.08 ms**. Typed projection/hashing adds full-record traversal and allocations at analysis and summary boundaries. This is an attributed bounded diagnostic, not a scaling benchmark or operational acceptance guarantee. Peak memory, maximum inputs and the supported Node-version matrix were not measured. Measure a representative workload before optimizing; do not weaken typed unknown handling or stale-input checks to remove this cost.

## Trust and scientific limits

This fingerprint checks association for honestly produced analysis. It does **not** authenticate evidence/authorship or verify intentionally modified cached output matrices; a caller can forge/modify both data and metadata. It is not a signature, independent-sampling certificate, complete fact-schema/censoring audit or proof of protocol safety.

Historical summary-only grids cannot reconstruct missing raw records and do not acquire current-source assurance by reapplying `grid-viability`. Oracle validity, Sybil attacks/collusion, arbitration capture, bootstrap vulnerability, actual attack costs and application usefulness remain independent questions. Source fingerprints change deliberately; prior confirmation status does not transfer.

Native rejected-operation/provenance inspection is next in [BACKLOG.md](../../BACKLOG.md). No new institution, contribution metric or automatic research sweep is selected.

## Reproduce

```sh
node --test test/games.test.mjs test/cli.test.mjs
npm test
node studies/2026-10-23-game-binding/witness.mjs
```

The witness prints and does not overwrite evidence. Its isolation guard requires all other source modules and old study files to match the named baseline; future changes need a separately justified boundary.
