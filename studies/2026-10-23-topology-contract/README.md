# XP anchor and traversal contract preparation — 2026-10-23

**Bounded diagnostic preparation, not a selected topology policy or empirical security study.** Starting commit: `8b0001c`. The owner's new Grow Loop request selects the next D33/D35/D36 backlog slice. D36 already settles internal vertex disjointness. This checkpoint makes the remaining anchor/traversal choices concrete and repairs one existing malformed-certificate acceptance defect found by its negative control. It does not implement invitation gates, new genesis state, cluster quotas or a Council migration.

## Method and limits

`witness.mjs` creates supplied standalone directed graphs, not `FacetyModel` admissions. All edges and endpoint choices are explicit. The tiny fixtures enumerate simple paths and exhaustively pack families under D36's no-shared-intermediary condition. Each family checks canonical edges with the existing `verifyPath` certificate verifier and separately checks distinct paths and shared internal vertices. Hand-declared maximum assertions distinguish the named alternatives; there is no optimization or performance comparison. Larger genesis examples use an explicit path family plus an out-degree upper bound instead of exponential enumeration.

The multi-anchor alternative stops traversal at any anchor and disallows anchors as intermediate vertices. This is an **unselected diagnostic convention**, not a new protocol rule. Supplied XP and manually chosen centers are not inferred trustworthy identities. No ownership truth, sampling, calibration, monetary mutation or attack-probability estimate is used. `witness.json` retains graph inputs, paths, source/runtime provenance and assertions' measured outputs.

## 1. One center and a terminal core give different answers

At `D = 2`, consider only these edges:

```text
u -> x -> a
u -> y -> b
```

If `a` alone is the first-place center, the maximum is **1**. With terminal core `{a, b}`, it is **2** under the stated core convention. Both calculations retain internal vertex disjointness. One path to each of two consuls is not the same contract as two paths to first place. No graph search can decide which contract the protocol intends.

**Unselected recommendation:** start the contract discussion with a single XP leader as the simplest interpretation of “first place”; choose a multi-consul terminal core only explicitly. A core needs rules for membership, whether repeated terminal anchors are allowed, and whether a core member may be an intermediary. It can reduce single-anchor availability dependence but does not establish independent human interests. A single leader is a connectivity anchor, not special adjudication authority.

## 2. Search from the center is not an undirected guarantee

The second graph contains only:

```text
a -> x -> u
a -> y -> u
```

With `u` as the query start and `a` as the terminal, the maxima are:

| Declared edge projection | Maximum |
| --- | ---: |
| Original forward edges, issuer toward center | 0 |
| Reversed edges, equivalent to center toward issuer | 2 |
| Undirected projection of either directed guarantee | 2 |
| Only independently present reciprocal edges | 0 |

The undirected and reverse variants happen to agree here but define different policies. Converting one authorized guarantee into an undirected edge or requiring both directions is not settled by D36. D31's two-party consent to one directed guarantee does not create the reverse guarantee.

**Unselected recommendation:** describe traversal as center-to-issuer along explicitly eligible guarantee edges if the center is intended to support the participant. If stored edges mean guarantor-to-subject, a query from issuer to center then uses their reversal. Do not silently replace the graph with an undirected or reciprocal-only projection. This recommendation still needs owner selection and an edge-eligibility contract.

## 3. First place cannot satisfy its own ordinary simple-path gate

The existing generic reachability API correctly returns `[a]` when root equals target. That is a valid zero-edge reachability certificate, **not `D` independent support paths**. Under the positive-length simple-path convention, the maximum from `a` to itself is **0**: returning to `a` would repeat a vertex. No blanket exemption, counting of zero-length paths or cyclic substitution follows from the generic API.

The owner must select whether the apex uses other eligible anchors, a separate bounded rule, or cannot issue new invitations under that particular anchor contract. A proposed re-rooting to the highest eligible other participant needs explicit eligibility and snapshot/tie handling; it is not implemented here. This is invitation eligibility, separate from the still-open correction route for apex misconduct.

## 4. Pre-guaranteed genesis does not identify a unique XP center

The supplied complete directed genesis examples are illustrative, not a selected genesis topology. Every initial XP value is declared zero. A provisional non-self anchor is chosen manually solely to check structural feasibility:

| Genesis size | D if all are active verified | Certified maximum to chosen other anchor | Equal highest-XP candidates |
| --- | ---: | ---: | ---: |
| 7 | 1 | 6 | 7 |
| 9 | 1 | 8 | 9 |
| 10 | 2 | 9 | 10 |
| 12 | 2 | 11 | 12 |

For size `n`, the direct path and `n - 2` different two-edge paths give `n - 1` paths, meeting the issuer's out-degree upper bound. No fabricated XP or balance is needed to demonstrate that structural family. But the graph does not choose first place in an all-zero-XP tie. Existing simulator ID-order tie-breaking is a legacy assumption, not automatic selection for D35. Genesis activity, verification, financing, emission rights, tie-breaking and activation still need explicit fields; structural paths alone do not establish invitation eligibility or independent people.

## 5. Malformed in-memory certificate defect and repair

The initial missing-edge control failed at the old verifier: for a nonexistent `u -> a` edge and `edgeIds: [undefined]`, both the optional lookup's ID and supplied ID were `undefined`, so equality accepted the absent edge. A one-hole array has the same issue. Serialized JSON ordinarily converts those elements to `null`, which the old verifier rejected; this is an **in-memory malformed-input** witness, not a demonstrated JSON/CLI bypass, admitted identity, money loss or scheduler attack.

`src/proofs.mjs` now requires a canonical edge to exist before comparing its ID. The regression fails before the fix and passes afterwards. It covers undefined/hole/null/wrong IDs on a missing edge, missing ID on an existing edge, deletion of a formerly present edge, and an unchanged valid proof. The study additionally rejects a shared bridge even when edges differ, duplicate paths and an actual directed cyclic walk. Existing valid search/certificate behavior remains exercised by the four-node exhaustive BFS/bidirectional comparison.

Only this verifier boundary changes runtime source. No economic, XP, timing, randomness or D33/D35/D36 admission defaults are changed. The source-content digest deliberately changes, so historical confirmations keep their original implementation identity and are not silently inherited or rerun.

## Decisions still required and stop condition

The next owner question is **one highest-XP center or a defined terminal set of XP-ranked consuls?** The 1-versus-2 witness above makes the distinction observable. Direction/edge projection and apex treatment remain separate subsequent choices. No further permutation of these supplied graphs will select those contracts.

Preparation of this anchor/traversal slice is complete. Runtime migration remains gated; D34's independent event/duty/replay gate is not reopened. Another automatic iteration is not warranted merely to restate these choices. This checkpoint records no new owner decision, mechanism confirmation, safe-bootstrap result or D32 useful-distribution claim.

## Reproduction and validation

```sh
node studies/2026-10-23-topology-contract/witness.mjs
node --test test/proofs.test.mjs
npm test
```

The script prints its result without overwriting retained evidence. Six focused proof tests and all **216 native tests** passed at this checkpoint; the latter include the same six, not 222 distinct tests. The new regression was first observed to fail on the baseline verifier. Fresh context, whitespace, reproduction and preservation results are retained in `validation.json`. Validation is coordinator evidence, not independent human or subagent review.
