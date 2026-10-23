# Retained-cohort completeness — 2026-10-23

**Diagnostic offline-analysis repair, not a protocol selection, calibrated viability result or evidence of the D32 flywheel.** This closes the two raw-record residuals from the [saved-facts checkpoint](../2026-10-23-saved-facts/README.md), while retaining an important cache-correspondence limit below.

## Failures and changed contract

`witness.mjs` imports the old pure analyzer from `a821e2beb4e4963900b9948b303b7ebb857ccb27` with unchanged current support modules. One common native fact set and explicitly synthetic retained-data mutations isolate analysis behavior; this is **not historical full-model replay**.

- **Six of twenty:** with six retained records but twenty declared replicas, the preceding implementation returned a favorable mandatory/viability classification. Both current analysis entrypoints reject the invalid cohort rather than invent missing seed positions.
- **One unknown valued payoff:** the old analyzer reported an unknown count yet used its known-subset mean to fit a favorable equilibrium. Current descriptive statistics remain (five known, one unknown), but the affected best response/mixed table and complete-data viability claim do not.
- **Raw sanctions:** omitting a first-replica counter silently removed its profile key; omitting it later, or supplying null, threw. Counter means now use the observed-key union and nullable required verdict counters. Missing/non-finite observations give null regardless of record position; complete zeros remain zero.

The [game contract](../../docs/games.en.md) now requires at least two declared replicas, exact counts and the same ordered unique nonempty seed identities across every profile/deviation. This intentionally tightens malformed-record admission. It neither authenticates those identities nor proves independent/unbiased sampling. Historical fact files meeting that structure can still be reanalyzed with missing unvalued fields; absent valued facts remain unknown.

Best responses require complete means for all alternatives against the relevant opponent. Matrix fitting requires the complete payoff table. Missing reference utility leaves the fraud-free baseline undefined. A supplied matrix cannot override its own incomplete payoff descriptors. These are research inference boundaries, not emission/XP/stake rules or measurements of actual human retention.

## Bounded preservation and identity

`witness.json` binds implementation **`d2cc88a555bd8c2b2bc72586f6b22eaa463f66d25a10f596236858541fcef92f`**, 25 modules, Node v26.8.1 and randomness `{ generator: "sha256-xoshiro128starstar-v2", decisions: "decision-keyed-v1" }`.

- **36** common native runs: four profiles/eight deviations, three replicas. Complete analysis, deterrence summary and default/enabled-budget viability are exactly equal against the old pure analyzer under **two explicit valuations**. No favorable-seed search or confirmation was run.
- All **24 other source modules** and **138 pre-existing study files** match their original raw Git blobs. Native transitions and the sampling policy are unchanged; the source fingerprint changes deliberately.
- Twelve declared scheduler contexts compare all retained run fields and ordered native events except provenance in `scheduler-preservation.json`. This is bounded preservation, not a universal equivalence or historical confirmation claim.

The synthetic probe adds twelve native-prefix runs, then supplies artificial retained utilities solely to make the old false-safe classification decisive. It is not a claim about actual farming profitability or application value.

## Validation and review

- **14/14** focused game tests, including three new regression families that failed before the repair; **209/209** full-suite tests (`tests.txt`). The existing partial-budget regression now expects explicit invalid-cohort rejection.
- `validation.json`, `dag.txt` and `context.txt` retain the integrated validation identity and results.
- Raw reviewer reports `review-005.txt`/`006`: both independently ran all fourteen game tests on the same source/test hashes. Reviewer 005 additionally exercised a 2×2 unknown-alternative fixture and stale-cache probe; reviewer 006 reports exact old/current offline equality on one native game under three valuations, including all-zero weights. These are attributed independent reports, not extra coordinator runs to add to totals.
- `review-007.txt` verifies the supplied reports but explicitly did not rerun their probes. `008` synthesizes them. Judge/normalizer `009/010` are degraded because they lacked direct upstream bodies; this does not establish reviewer failure or independent implementation approval. The coordinator retained/read all six bodies and preserves the cache finding rather than treating consensus as proof.

## Remaining cache boundary and other limits

**Confirmed reviewer counterexample:** compute a complete analysis, change a valued raw fact, then supply the stale complete descriptors. Reviewer 005 reports `{ "fresh": false, "stale": true }` for viability; the coordinator independently reproduces and retains it in `witness.json` as `remainingStaleCompleteCache`. The current check suppresses **incomplete descriptors**, not stale complete ones. No claim is made that the hazard is repaired, authenticated, or a newly introduced regression.

This checkpoint makes the requirement that analysis correspond to supplied facts/valuation explicit; it does not establish that older documentation formally specified it. Next in [BACKLOG.md](../../BACKLOG.md): inspect actual callers and reproduce this association hazard, then choose the smallest justified guard or enforced contract without breaking admitted unknown-value semantics. The native rejected-operation/provenance audit follows; no unrelated research sweep is selected.

These checks are not complete fact-schema validation, authenticity, sample-independence or a censoring audit. Existing censor counts remain visible. Summary-only historical files cannot reconstruct missing raw records or acquire new implementation confidence. Oracle validity, Sybils/collusion, arbitration capture, bootstrap vulnerability and real attack costs remain separate risks; uniqueness, useful contribution and distribution are not interchangeable outcomes.

## Reproduce

```sh
node --test test/games.test.mjs
npm test
node studies/2026-10-23-retained-cohort/witness.mjs
```

The witness prints and never overwrites retained evidence. Its isolation guard requires all other source modules and previous study files to match the named commit. Future edits need a separately justified boundary, not a weakened historical guard.
