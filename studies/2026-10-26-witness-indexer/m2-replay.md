# M2-C Native graph/status event replay and current-version comparison

**D61 engineering contract before code.** Completes M2's named Native reference baseline, not selected live epoch/duty semantics or M6 authorization. [M2-A](m2-view.md) supplies immutable captures, [M2-B](m2-oracle.md) exact bounded global search. BACKLOG alone owns tasks. No Model economic mutation, historical study recapture, authenticated event feed or finality/reorg policy is introduced.

## API and authority

`src/path-witness-replay.mjs` owns pure `replayPathWitnessEvents(events,{atHour,maxEvents,maxIdBytes})`, `captureReplayedPathWitnessModelView(model,options,{maxEvents})` and `comparePathWitnessModelVersion(model,previousNativeView,options,{maxEvents})`. Options retain M2-A's explicit policy/currentEpoch/snapshots/removals/standing; no epoch is inferred from wall time or Native clock. The version comparison accepts a local factory-branded Native capture, not a user/indexer callback or arbitrary DTO.

Pure replay returns frozen projection data, **not a factory-branded canonical view**. It reconstructs only subjects' public accepted/false status, guarantee lifecycle records and DirectedGraph storage/revision/edge IDs. It does not execute or verify money, XP, keys, disputes, vouch collateral eligibility, private truth or personal-chain history. Arbitrary supplied events may be consistent fiction; replay is not authentication, court merits, funded admission or a permission to mutate Model.

A fixed explicit event-type allowlist classifies current Native events as structural or predicate-inert. Unknown types fail so a later slash/duty event cannot silently be ignored. Every event needs nondecreasing nonnegative safe hour<=atHour. IDs are exact scalar UTF-8 strings under the explicit1…256-byte ceiling. maxEvents is an explicit nonnegative admitted-history bound<=100000, not a truncation hint: exceeding it throws rather than presenting a partial projection as current. Node/edge/relation/vouch retained counts use M2-A bounds. Native public getter copying precedes size checks and remains O(history); no cheap incremental replay/performance claim.

## Reconstruction and joins

- subject-added creates accepted subject/storage node; duplicate subject IDs fail. identity-invalidated sets public false status without deleting graph adjacency/records, including repeat invalidation allowed by Native.
- guarantee-proposed supplies ordinary relation endpoints/proposedAt. guarantee-activated joins that earlier record, rather than future final rows; duplicate/missing/conflicting activation fails.
- Vouch-backed activation has no ordinary proposal event. It must join an earlier vouch-committed's voucher/target/commit hour, with a now-known target, and creates the relation at its actual activation event. No path/subject support is granted at commitment alone. This structural join is not collateral/funding replay.
- guarantee-ended updates only the matching active relation/storage edge. Actor must be one endpoint; ordinary versus vouch financial/merit authority is left to the actual Model. Re-add creates a new relation/edge storage ID, retaining ended history.
- Other classified events do not affect this graph/status predicate. Their **type/hour/position** still enters the journal projection digest; ignored economic/key payloads do not. Digest is explicitly not a full-ledger hash/signature.

Replay order is the supplied array index, not sorted timestamps; same-hour transitions retain their actual order. A subject-added/activated prefix inside a compound Native operation is an internal journal state, **not necessarily an externally committed transaction boundary**. Only a full captured Native stream is compared with the coherent post-operation current capture. No arbitrary prefix becomes fresh admission authority.

## Full Native audit/version behavior

The audit captures Native public state, reads its event stream, replays at the captured Native hour and compares normalized subject status, full relation rows and graph storage IDs/counters with the capture. It then recaptures and rejects source changes. Missing/reordered/duplicate/inconsistent structural history or graph/record disagreement throws; it does not yield a clean ineligible verdict. Result is frozen `{view,replay,version}`; the branded view is the genuine M2-A capture, not a promotion of replay data. Version binds capture root, source event count/hour and the scoped journal digest.

Comparison makes a fresh audited capture under the explicitly supplied options, returning matches/previousRoot/currentRoot/current version. matches is conservative full-capture equality: unrelated events, clock, supplied policy/epoch/removal/score changes may invalidate the version even when an old vertex-only witness still passes both verifiers on the new view. Old snapshots stay old. The check is diagnostic/read-only and is not a lock, atomic compare-and-mutate, finality proof or time-of-use authorization. D41 guarantees/funding and Model-owned execution remain M6 work after dependent decisions.

## Evidence/acceptance

Use actual Model transitions and compare after committed operations, including same-hour proposal/activation/end/re-add/invalidation, Native invitation subject addition and funded vouch admission with its missing-proposal join. Compare pure reconstructed storage/records/status to public Model captures, including unrelated events and clock-only changes. Test malformed/unknown/dropped/duplicate/reordered history, valid-but-stale prefixes, bounds, root comparison, immutable exports and no Model mutation/ID consumption. Guard event-type coverage against current Model source; separate structural consistency from full ledger validity.

[Validation](m2-replay-validation.json) records exact source/test/contract bindings, finite ordering cases, current and pinned historical checks, and unchanged default trajectories. These are deterministic engineering cases, not independent authorship, E1–E8 capture, live chain/finality, actual Sybil resistance or G1. M3 may now use this reference baseline; advisory optimizations still need exact-oracle/certificate comparison before cost. M4–M6 owner gates remain unchanged.
