# M3-B bounded single-parent anchor trees and verified proposals

**D61 engineering contract before code; M3 remains partial.** Builds on [M2 exact reference](m2-oracle.md) and [M3-A cache/fallback](m3-cache.md), not a complete multi-branch indexer, live anchor policy or cost study. BACKLOG alone owns remaining work. All anchors/epochs/standing observations come from supplied immutable captures; no ranking, personhood or governance power is invented.

## API, input and resource domain

`src/path-witness-trees.mjs` exports buildPathWitnessTrees(view,{epoch,maxExpansions,maxTreeNodes}), proposePathWitnessFromTrees(forest,currentView,context,{epoch,maxCandidates,maxPackingSteps}) and PATH_TREE_LIMITS. Context is normalized by M1; view/currentView must be local immutable M2 captures. The forest has local construction provenance, not authentication or acceptance authority. Captured policy identity must match the query policy; epoch mismatch/unavailable grace/snapshot is explicit. Old-root trees may be proposed against a new current capture only after full current checks.

First software ceilings:1000000 BFS neighbor trials,65536 total retained tree-node records (roots included),256 candidate path validation attempts,1000000 packing trials. Explicit budgets may be0, are safe nonnegative integers, and do not mean no-path when exhausted. These are prototype resource limits, not protocol quotas/calibrated parameters. At a cap, only an additional needed trial/record causes censorship; exact-final work may finish. Canonical-view projection preparation/copy/sort/capture cost is separate from BFS counters and remains bounded by M2's graph domain.

## Construction and path semantics

For every live/nonremoved anchor in the selected supplied snapshot, in unsigned UTF-8 order, build a FIFO BFS tree to depth r with one parent per reached vertex. Source stored edges are voucher→subject; forward anchor trees follow successors, the reverse of M2's subject-first predecessor queries. Undirected any-live/reciprocal projections use their explicitly qualified symmetric adjacency. Queue uses an index, not repeated shift. Parent distances increase exactly1; tie parent is first reached through byte-ordered neighbors. No zero-hop subject support is granted, although root distance0 is stored.

An anchor or other reached node may continue as transit. A non-root node's optional standing is checked only before expansion, when it would become an intermediary for a later subject. Its own reached path can still serve that node as subject regardless of its score. Root anchor score is exempt as terminal. Removed anchors are excluded as roots but may remain transit under canonical current edges/standing. These are M1 path semantics, not verified usefulness/unique humans.

Total record budget is shared across anchors, expansion budget across all BFS trials. Stop the deterministic build prefix on exhaustion, retaining completed/partial trees with status built/censored/unavailable, complete flag and work counters. Missing/unstarted tree data is not negative graph evidence. Forest exposes frozen meta/anchors/path(subject,anchor)/toJSON data; private parent maps never escape, inspection does not mutate budgets/route/load/TTL/RNG. Export is an advisory DTO, not a branded canonical-state view.

## Proposal and safety

For the expected subject, inspect the forest's anchor order and retrieve one stored subject-first path per root. Positive-length path attempts consume maxCandidates before filtering. On currentView recheck snapshot membership, emergency eligibility, declared edge projection and intermediate-only optional score; root labels/live bits from the forest are not authority. Record per-query tree lookups/attempts/live candidates/edge/score work separately. Continue to allow unshared anchor transit.

Exactly pack D current-valid candidates by recursive occupied non-subject vertex sets, endpoints included, under maxPackingSteps. No greedy rejection or a fabricated vertex-split/hop-layer flow guarantee. Every positive selected family is encoded and checked by both M1 primary/ref2 against currentView before return; unexpected disagreement throws. Wire byte bound is censored, not graph infeasibility. A valid partial-build/candidate prefix may already prove a positive.

Proposal status is found/miss/censored/unavailable. Only found has feasible:true; **every other outcome has feasible:null**, never false. Even a complete tree build and exhaustive packing can miss a globally feasible D-family because a single chosen BFS parent omits alternative paths. Build limits, candidate/packing caps, missing trees and stale proposals stay visible, never a definitive no-path. Return current root and forest origin root, profile/config/work, frozen witness/canonical UTF-8 wire string/verification when found. No shortest/min-cost/maximum/fairness/security conclusion about the network follows.

Compose with M3-A via hint=proposal.wire (or null): the cache independently revalidates and a miss/censor can invoke exactly one full-view M2 fallback with its own explicit budget. Query/TTL counters do not include tree preparation invisibly; this slice does not add an integrated cache-before-tree planner or claim preprocessing is free. A pruned forest/subgraph remains advisory even when its positive paths are valid.

## Validation, complexity and remainder

Check per-anchor shortest reachability/distances against independent raw path enumeration on tiny graphs, and candidate outcomes against M2's full global reference before cost. Retain a concrete same-length parent-choice counterexample where single-tree paths share a vertex but alternative global paths are disjoint; report exact tested misses, not graph infeasibility or an empirical human rate. Exhaust declared tiny directed graphs/projections, verify every positive with both M1 implementations, test fallback/zero-budget unknowns, direction, hop/score/anchor transit/self, exact resource boundaries and stale-root/current-edge/removal changes.

Counters bound logical BFS/candidate/packing work; byte/hash/map/preparation/verification are separate. Full rebuild BFS has conventional per-root graph traversal cost under its stated domain, not Even–Shiloach decremental or arbitrary-churn O(A*m*r) total. No machine/chain/human-work curve is measured. [Validation](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-26-witness-indexer/m3-trees-validation.json) binds implementation/test/counterexample data and current/historical checks.

Pool top-M metric/uniform/best-of-two/load/keyed routing, diversified branches/bidirectional search, hot segments/TTL, insertion/deletion/epoch update and bounded dynamic repair remain open in BACKLOG. No ambient RNG/stream key change, Model/default mutation, real graph/personal data, service, scientific E1–E8 registration/capture or G1 result is introduced.
