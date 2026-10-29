# Witness-certified path gate and indexer — WP-G

**2026-10-26 · D61 [DIRECTION] · M0 charter with later engineering checkpoints, not a research result.** Source: the owner's full witness/indexer implementation-track instruction. This is an implementation track inside the master condition-map research/evidence envelope, not a second research programme. [BACKLOG](../../BACKLOG.md#wp-g-witness-certified-path-gate-and-indexer-d61) alone owns executable tasks; [DECISIONS_NEEDED](../../DECISIONS_NEEDED.md#wp-g-owner-questions-and-reference-contracts-d61) owns unresolved choices.

## Direction and present decision

Implement an opt-in bounded path witness and deterministic verifier before advisory search. An epoch fixes adopted difficulty and a distinct-anchor target set; current canonical edge liveness and immediate authorized anchor removals still govern acceptance. Search/tree/cache/pool state is untrusted for safety. Anchors grant no Council/governance powers; D33 difficulty, D35 guarantee AND path meaning/no default quotas, D36 internal disjointness and D41 pre-burn guarantee authorization remain unchanged.

[Protocol §46.16/Appendix A](../../docs/facety.protocol.en.md#4616-witness-certified-path-reference-and-advisory-indexer-d61) records D61 and supersession limits. [The owner-readable summary](../../docs/indexer.en.md#owner-readable-summary) and detailed StateAccessor/codec/family, indexer, capacity, threat/privacy/runbook and acceptance contracts are documented **before any WP-G code**. Numeric defaults remain placeholders; no Standing/verified-person process or live epoch adoption is invented.

## Milestone history

Each milestone page holds its contract, API, validation links and limits; pre-code contracts were committed before code (frozen-contract commits listed) and survive verbatim at [`8b77cd8`](https://github.com/llblab/facety/tree/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-26-witness-indexer). All results are DIAGNOSTIC software/algorithm evidence on tiny supplied domains; the module/export table is in the [model contract](../../docs/simulator.en.md#witness-certified-path-gate-and-indexer-d61) and one-line findings in the [insight register](../../docs/insights.en.md#findings-d61-witness-indexer-2026-10-26).

| Milestone | Pages (pre-code contract → implementation) | Outcome |
| --- | --- | --- |
| M1-A codec/policy | [m1-wire](m1-wire.md), [wire vectors](wire-vectors.json) | Canonical bounded wire bound to domain/subject/epoch/policy. |
| M1-B verifier | [m1-verifier](m1-verifier.md), [verifier vectors](verifier-vectors.json) | Primary + dependency-separated ref2; exact compatible D-family for slack 0–1. |
| M2-A views | [m2-view](m2-view.md) | Immutable graph/Native public-state captures. |
| M2-B oracle | [m2-oracle](m2-oracle.md), [oracle vectors](oracle-vectors.json) | Exact bounded-hop search; found/infeasible/censored/unavailable. |
| M2-C replay | [m2-replay](m2-replay.md) | Native structural journal/version audit; not economic replay. |
| M3-A cache | [m3-cache](m3-cache.md), [epoch fix](m3-cache-epoch.md) | Advisory whole-witness cache; every hit re-verified; requested-epoch binding corrected. |
| M3-B trees | [m3-trees](m3-trees.md), [single-tree miss](single-tree-miss.json) | Single-parent trees expose explicit misses vs the oracle. |
| M3-C1 pools | [m3-pool](m3-pool.md) | Supplied-score pools and keyed uniform/best-of-two routing. |
| M3-C2 branches | [m3-branches](m3-branches.md), [five-node miss](branch-tree-miss.json) | One-hop branches repair old misses; five-node deeper miss retained. |
| M3-C3 prefixes | [contract](m3-prefix.md) (`486713c`) → [implementation](m3-prefix-implementation.md) | Bounded prefix/tree joins repair the five-node detour. |
| M3-D1 segments | [contract](m3-segments.md) (`49d7449`) → [implementation](m3-segments-implementation.md) | Bounded hot-segment store, relation identity, TTL/use. |
| M3-D2 segment joins | [contract](m3-segment-joins.md) (`f405b92`) → [implementation](m3-segment-joins-implementation.md) | Cached-tail assembly with full-family verification. |
| M3-E1 refresh | [contract](m3-tree-refresh.md) (`63a588d`) → [implementation](m3-tree-refresh-implementation.md) | Affected-root reuse/rebuild. |
| M3-E2 repair | [contract](m3-tree-repair.md) (`8559ffe`) → [implementation](m3-tree-repair-implementation.md) | Bounded within-root path-label repair. |
| M3-F1 workload | [contract](m3-workload.md) (`0e66c7d`) → [implementation](m3-workload-implementation.md), [preflight fix](m3-workload-preflight.md) | Supplied-frame maintenance/query runner with lagged route accounting. |
| M3-F2 paired conformance | [contract](m3-maintenance-pairs.md) (`846b140`) → [implementation](m3-maintenance-pairs-implementation.md) | 16 sealed cells across three maintenance arms. |
| M3-C4 union | [contract](m3-union.md) (`2271cde`) → [implementation](m3-union-implementation.md) | Two-sided retained-union reference with full-current acceptance. |
| M3-G pipeline | [contract](m3-pipeline.md) (`05441cb`) → [implementation](m3-pipeline-implementation.md) | Cache-first probe → union → full fallback. |
| M3-H lifecycle | [contract](m3-lifecycle.md) → [implementation](m3-lifecycle-implementation.md) | Fresh cache/forest lifecycle with explicit index-loss skips. |
| M3-I invalidation | [contract](m3-invalidation.md) → [implementation](m3-invalidation-implementation.md) | Dual-cache notice fan-out. |
| M3-J segment workload | [contract](m3-segment-workload.md) → [implementation](m3-segment-workload-implementation.md) | Segment/prefix/load lifetime. |
| M3-K composite | [contract](m3-composite.md) → [implementation](m3-composite-implementation.md) | Fixed cache/prefix/union/full coordinator. |
| M3-L composite workload | [contract](m3-composite-workload.md) → [implementation](m3-composite-workload-implementation.md) | Joint whole/segment/forest/offer lifetime. |
| Post-L acceptance | [acceptance](m3-acceptance.md) → [joint-churn results](m3-joint-churn-results.md) | 72 cells/864 queries, 0 mismatches; closes the finite integration gap. |


## Material unresolved contracts

- Own-days Standing is not repo XP: its proposed default needs a definition and D35 compatibility decision before live anchor ranking. Verification/activity cannot come from evaluator truth, degree or XP alone.
- Directed-from-anchor paths are bounded by U's live in-degree. If a mode holds it to c<D incoming vouchers the gate is infeasible; additional vouchers versus a different reference requires explicit choice.
- M1 now implements exact compatible D-subfamily for explicit slack0/1, not first-fit; broader slack/resources need a separately validated version. Canonical bytes/trusted limits and total CPU versus O(k*r) state accesses were fixed before implementation. Ordinary flow does not automatically impose r-hop disjointness; tree-only fallback is not full-graph complete.
- Literal unit anchor capacities limit total source flow to A; unit target capacity cannot carry D>1 demand. Capacity source/terminal demands, accepted-set fairness, epoch reuse and authenticated fraud-proof semantics are owner-gated, not a selected quota or a measured kill.
- Grace/current difficulty coherence, in-flight transactions, emergency authorization and real-data license/ethics remain gated. Supplied immutable graph/Native diagnostic snapshot captures allow safe structural verifier/global-oracle work without pretending those live contracts are resolved.

## Evidence and delivery boundary

M0 adds documentation/decision/context only. Existing `DirectedGraph`, fixed-pair disjoint-flow/independent verifier and the sealed2026-10-23 topology study are inventoried/reused, not replayed. No WP-G module/codec/vector set/indexer/capacity runtime, daemon, port, chain/pallet code or simulator default is introduced here. The [M0 validation record](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-26-witness-indexer/m0-validation.json) distinguishes exact unchanged runtime-source identity and reused test evidence from new documentation validation.

No `facety-hypothesis/v2` programme registration exists for this track. E1–E8 experiments/benchmarks, results/curves, proposed ranges, kills X1/X2/Y2/Z, master G1, confirmation seeds, LLM agents and pilots are **unrun/unbound**, not empty successful outcomes. Deterministic engineering unit/property tests remain separate from scientific evidence; actual supported v2 methods and master gates precede any claimed study capture. No attack probability, verified personhood, operator independence or real-world Sybil resistance is claimed. M7's <=2-page result/decision packet is a later evidence deliverable, not this M0 charter.
