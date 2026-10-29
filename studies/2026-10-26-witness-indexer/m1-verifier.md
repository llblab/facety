# M1-B supplied-state verifier, ref2 and structural vectors

**D61 diagnostic engineering contract before this slice's code.** Builds on [M1-A wire](m1-wire.md), not a new selected protocol rule, live-anchor process or funded admission gate. BACKLOG alone owns tasks. No Standing definition, epoch adoption/finality, Merkle authentication, indexer or capacity choice is made. This is the historical M1-B checkpoint at9ef37a5: [M2-A](m2-view.md) later adds immutable supplied/Native public-state captures without changing M1 acceptance; absent-adapter statements below describe M1's checkpoint.

## API and trusted StateAccessor

Primary `verifyPathWitness(bytes, context, state)` is exported from `src/path-witness.mjs`; ref2 `verifyPathWitnessRef2` from `src/path-witness-ref2.mjs`. Context/wire/policy are unchanged M1-A, including maxSlack0/1. Ref2 imports no production codec/verifier/local helper and independently parses canonical bytes/policy and checks candidate families. This is algorithmic/dependency separation, not independent authorship/acceptance.

State is a synchronous supplied **canonical-view capability**, not an indexer and not verified by these functions:

```text
view() -> {id, epoch}                  // nonempty bounded immutable version ID; safe epoch
snapshot(epoch) -> null | {difficulty} // adopted positive D <= policy.maxDifficulty
anchor(epoch,id) -> Boolean            // membership in supplied snapshot
removed(id) -> Boolean                 // current authorized emergency removal
edge(from,to) -> Boolean               // current directed live edge, false for absent/dead
degree(subject,direction,projection) -> null | nonnegative safe integer
anchorCount(epoch,subject) -> null | nonnegative safe integer // current eligible snapshot terminals excluding subject
standing(id) -> null | nonnegative safe integer // only required/read when minStanding != null
```

The caller supplies membership, liveness, degree and optional standing from declared observations, not evaluator truth. No network/Merkle/state/signature authority is inferred from callbacks. `view.id` must change without reuse on every relevant mutation; capture scalar id/epoch before reads and compare at finish. A changed view rejects, including a callback-triggered change. An accessor that lies/reuses a version ID is outside this trust contract; no arbitrary host callback sandbox/rollback is claimed. Missing methods, invalid canonical values and unexpected accessor errors **throw**, not fabricated clean ineligibility. Invalid trusted context also throws; malformed untrusted wire returns invalid-wire without state access.

## Acceptance and deterministic result

Result has accepted, reason, required (null until D read), selected canonical path indices, degreeBound/anchorBound(null if unknown), and bounded work stats. It is path evidence only: not economic authorization, independent humans or an anchor exemption. Check order: canonical wire; coherent initial view; epoch grace; snapshot existence/valid D; per-snapshot candidate count<=D+maxSlack; degree and eligible-anchor feasibility; individually valid paths; exact compatible family; final coherent view. A final view change overrides a provisional result with state-view-changed.

Each candidate needs positive length, expected start, different terminal snapshot anchor not currently removed, no repeated vertex, all current live edges and optional standing of **intermediate vertices only**. When standing is off, no score call occurs. Directed-from-anchor checks y→x for adjacent subject-first [x,y]; undirected any-live uses either orientation, reciprocal-only needs both. Zero-hop/cyclic/wrong-start/dead/removed/nonanchor/low-or-unknown-standing candidates do not count; valid slack can survive them. Noncanonical/oversized wire rejects as a whole.

Counted family shares only the subject, including no endpoint/transit overlap and distinct terminal anchors. No ban on an otherwise unshared anchor appearing as transit is added. Unknown degree/anchor count does not invent a count or invalidate an independently sufficient witness; a known bound<D reports degree-infeasible, not a search miss. Known eligible-anchor count<D similarly reports anchor-infeasible. Counts of eligible snapshot terminals exclude subject and currently removed anchors. These I7 diagnostics trust the maintained canonical degree/anchor metadata and is not verified independence. D=0/unsupported snapshot difficulty is an invalid state contract, never an empty-family pass.

Canonical tie-break chooses the lexicographically earliest D-index subfamily. With valid candidate count n<=D+1: if n=D, all must be disjoint; if n=D+1, at most one may be omitted. Primary builds non-subject vertex ownership. Three owners make omission of one insufficient. Every two-owner conflict must be covered by a single omitted candidate; only the two endpoints of the first conflict need testing. Choose the largest valid omitted index for the earliest retained family. No first-fit greedy rejection. Ref2 instead tries each possible omission and independently rebuilds occupied sets; it cannot call primary acceptance logic.

Memoized anchor/removal/edge/standing reads are O(k*r) (edge reads<=2*k*r), plus two view reads, one snapshot, one degree and one eligible-anchor-count read. Primary graph/family processing is linear in supplied vertex occurrences/conflicts; codec canonical sorting/hashing and ID byte work remain separately bounded by M1-A, **not** an asserted linear-total-CPU chain benchmark. Ref2 family CPU may be O(k²*r), bounded by k<=65/r<=64; memoized state reads remain linear. Statistics are software operation counts, not wages or measured hardware cost. Rejection is not a certified maximum/no-path graph result.

## Evidence and remaining boundary

Machine-readable `verifier-vectors.json` supplies context/state/witness and expected structural verdicts for other implementations. Tests use raw directed synthetic graphs and a separate submitted-family packing oracle; they check I1–I7 under supplied canonical-view assumptions, exact slack, degree, grace/removal, direction, optional-score invariance, coherent view changes, malformed byte mutations, dependency isolation and lookup bounds. No economic graph mutation, search/indexer completeness, globally optimal hop-flow, live verified membership, protocol difficulty migration or CPU curve is claimed.

Existing literal wire vectors must also be evaluated through ref2's own parser; matching only bytes encoded/decoded by primary is insufficient. Bounded negative/property cases are engineering acceptance, not registered E1 study data, exhaustive fuzz coverage, independent assurance, personhood/Sybil security or master G1. [Validation](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-26-witness-indexer/m1-verifier-validation.json) records exact source/reference/vector/test identities and separate current/historical passes. M2's public-graph exact oracle/adapter, later anchor/capacity/Model/v2 research remain separate and gated.
