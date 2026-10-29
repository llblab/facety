# Owned valences V1 — implementation checkpoint

**2026-10-29 · opt-in reference engineering after the [pre-code contract](README.md) (`b6e01ae`); not a default, migration or empirical result.** [BACKLOG](../../BACKLOG.md#trust-topology-condition-map-master-programme) owns the remaining V2/V3 slices.

## What exists

`new FacetyModel({ valences: { K, reference: { source, withdrawal, pairEndXp, withdrawDuringHold } } })` in `src/model.mjs` adds `openValence`, `withdrawValence`, `setOwnedSlotCeiling`, `ownedSlots` and `valenceRecords`, exactly as contracted:

- Opening burns one caller-named own mature unspent right (disposition `valence-burn`) even when unmatched; unmatched valences add no guarantee edge and carry no XP or liability.
- Two opposite open valences establish both directed guarantee edges in the opening transition (`valence-pair-established`); guarantor XP therefore follows only established pairs through the existing snapshot machinery (D82).
- `used(s)` counts `s`'s open valences; opening at or above K rejects, matching a retained valence never charges its holder a unit, and ceiling changes never cut existing records or pairs.
- Withdrawal releases only the owner's unit, ends both pair relations (`pairEndXp` decides whose guarantor receipts follow `policy.linkBreakXp`), keeps the opposite valence open and counted, and never refunds a burn; reopening is a new record whose re-establishment charges only the reopening side.
- Legacy `proposeGuarantee`/`confirmGuarantee`/`endGuarantee`, `createInvitation` and vouching references reject in valence mode; `audit()` adds burn-source, index, pair and edge-count invariants.

## Deviations and boundaries recorded at implementation

- **D77 on the retained side:** establishment creates a new guarantee for both sides, so a retained valence whose holder is under an open-dispute hold cannot be matched until the hold ends. This conservative choice is the reference's, not a selected protocol rule.
- **Structural replay:** `src/path-witness-replay.mjs` classifies the four new events and rejects valence-mode journals explicitly rather than reconstructing a partial graph.
- `withdrawValence` accepts no source (the contract's reserved argument must be `null`).

## Validation

`test/valences.test.mjs` (12 tests) covers the contract's seven groups: default/validation, unmatched burn, atomic rejections, mutual establishment and XP, K refusal/retained matching/ceiling changes including 100/101 boundaries, withdrawal under both `pairEndXp` values with re-establishment, price/hold bindings, D77 retained-side hold, legacy refusal and replay refusal. Mutating the K check, the retained-side hold, the `pairEndXp` filter or the burn each fails at least one test. Full `npm test` and the pinned historical tests pass.
