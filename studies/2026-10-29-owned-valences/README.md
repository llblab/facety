# Owned valences and K counting (D83/D93/D94/D97/D100) — V1 pre-code contract

**2026-10-29 · opt-in reference engineering, NOT IMPLEMENTED at this commit.** Owner semantics live in [§19.4](../../docs/facety.protocol.en.md#194-active-mutual-guarantee-links-and-a-variable-ceiling-d75d81) and [§19](../../docs/facety.protocol.en.md#19-two-sided-guarantee-establishment); [BACKLOG](../../BACKLOG.md#trust-topology-condition-map-master-programme) owns the work. This contract is committed before code. It selects no OPEN rule: every unresolved choice below is a required explicit binding with no default. No default, legacy behavior, RNG, experiment engine or historical study changes.

## Scope

V1 implements only paid one-sided valences, mutual establishment and owned-slot counting between existing accepted subjects:

- **In:** D93 immediate own burn per valence (even unmatched), D83 mutual establishment from two opposite valences, D82 guarantor XP only through an established mutual guarantee, D94 own-only withdrawal with the opposite valence staying open, D97 no refund and K refusal of new owned increments only, D98 new records instead of reopening, D100 counting of own OPEN valences, D81/D74 ceiling changes without forced cuts, D77 hold on opening.
- **Out (later slices):** D105–D107 invitation-side units and pre-registered targets (V2), D84/D104 Council-path gates and D91 bootstrap (V3), D95 re-entry, governance execution of K changes, canonical on-chain records/signatures/gas.

Because V1 does not count invitation-side units, a valence-mode model **refuses `createInvitation`** rather than report an incomplete K.

## Constructor binding

```js
new FacetyModel({ genesis, valences: {
  K: 100,                                   // initial ceiling (D74 default); natural >= 1
  reference: {
    source: 'own-mature-right',             // D93 burn source; only supported value
    withdrawal: 'free' | 'burn-one-liquid', // D85 OPEN: no default
    pairEndXp: 'withdrawer-only' | 'both-relations', // D9 interaction OPEN: no default
    withdrawDuringHold: 'allow' | 'refuse', // D77 tentative termination exception OPEN: no default
  },
} })
```

Missing, extra or unsupported keys reject. `valences` is incompatible with `vouching`/`vouchAdmission` (separate references). With `valences: null` (default) the model is byte-for-byte unchanged.

- `source: 'own-mature-right'`: the burn consumes one caller-named own Emitter right with the same eligibility as an invitation source (own subject, unspent, not dispute-locked or debt-reserved, age ≥ `spendMaturityHours`); it is disposed as consumed with disposition `valence-burn`, so FACY is burned and terminal-mode XP follows the existing consumption rule.
- `withdrawal: 'burn-one-liquid'` burns 1 liquid FACY of any origin; `'free'` burns nothing.
- `pairEndXp`: when a pair ends, `'withdrawer-only'` ends both directed relations but applies `policy.linkBreakXp` only to the withdrawer's guarantor receipts; `'both-relations'` applies it to both sides.
- `withdrawDuringHold`: whether a D77 case participant may withdraw.

## API

- `openValence(owner, counterpart, sourceSelfId) → valenceId`
- `withdrawValence(owner, valenceId, sourceSelfId = null)` (source unused in V1; reserved)
- `setOwnedSlotCeiling(K)` — trusted supplied governance outcome (D81/D74); not a voting implementation.
- `ownedSlots(subject) → { K, used, open: [valenceId…] }`
- `valences() → frozen records` `{ id, owner, counterpart, openedAt, closedAt, status: 'open'|'withdrawn', burnSource, pairRelations }`

Legacy `proposeGuarantee`, `confirmGuarantee` and `endGuarantee` reject in valence mode; a pair ends only through `withdrawValence`.

## Semantics

1. **Open (atomic):** both subjects exist and are accepted; `owner ≠ counterpart`; owner not under a D77 hold; owner has no open valence toward counterpart; `used(owner) < K`; source eligible; graph capacity for two edges preflighted. Then burn, record, event `valence-opened`. If the counterpart already holds an open valence toward owner, the pair is established in the same transition: both directed guarantee edges are added with relation records (`activatedAt = now`, linked to both valences), event `valence-pair-established`. The counterpart's count does not change (retained matching).
2. **Count:** `used(s)` = number of `s`'s open valences. Matched or unmatched does not matter; establishment adds no unit.
3. **Ceiling:** `setOwnedSlotCeiling(K)` changes K for future increments only; subjects already at or above the new K keep every open valence and established pair.
4. **Withdraw (atomic):** only the owner of an open valence; D77 per binding; price per binding; then status `withdrawn`, `closedAt = now`, unit released. If its pair was established, both directed relations end (event `guarantee-ended`) with XP per `pairEndXp`. The opposite valence stays open and counted. No burn is refunded.
5. **Re-entry:** a later `openValence` by the same owner is a new record with a new burn; if the opposite valence is still open, the pair re-establishes without charging the opposite side.
6. **XP:** unchanged machinery — Self-ID guarantor snapshots read current eligible in-edges, so only established pairs create guarantor roles (D82); unmatched valences never carry XP or liability.

## Acceptance tests (before any claim)

1. Default model and existing suites unchanged; config validation rejects missing/extra/unsupported bindings and combination with vouching.
2. Unmatched open burns exactly one own mature right (`burned +1`), adds no edge and earns no XP; immature, foreign, locked or reserved sources, self, unknown, duplicate and D77-held openings reject with no mutation.
3. Matching establishes both edges; each side paid exactly one burn; a later Self-ID by either side credits the other as guarantor; before matching it does not.
4. K: an owner at K cannot open; a matcher at K cannot match; a retained side at K can still be matched; lowering K below `used` keeps everything and blocks new opens; raising K reopens capacity; K=1 and K=100/101 boundaries.
5. Withdrawal: releases one unit, ends both relations, keeps the opposite valence open/counted, applies each `pairEndXp`/`withdrawal`/`withdrawDuringHold` value as bound, never refunds; reopening re-establishes without a second charge to the opposite side.
6. Legacy guarantee API and `createInvitation` reject in valence mode; `audit()` conservation holds after every scenario.
7. Full `npm test`, historical tests and DAG unchanged.
