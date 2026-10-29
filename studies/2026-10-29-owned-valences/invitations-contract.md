# Owned valences V2 — invitation-side units (D105–D107) pre-code contract

**2026-10-29 · opt-in reference engineering, NOT IMPLEMENTED at this commit.** Extends the [V1 reference](implementation.md). Owner semantics: [§17.1 D107](../../docs/facety.protocol.en.md#171-identity-claim-not-a-tradable-nft), [§18 creator duties](../../docs/facety.protocol.en.md#18-admission-through-invitation), [§18.3 D105–D107](../../docs/facety.protocol.en.md#183-economic-effect), [§18.4 D95/D98/D99](../../docs/facety.protocol.en.md#184-invitations-are-accountable-not-anonymous-coupons), [§19.4 D100/D106](../../docs/facety.protocol.en.md#194-active-mutual-guarantee-links-and-a-variable-ceiling-d75d81). Committed before code; every unresolved choice is a required binding or an explicit refusal. Defaults, V1 semantics and history are unchanged.

## Scope

- **In:** D107 pre-registered target with a supplied zero Genesis act; D105 inviter burns 1 own mature right, recipient pays nothing; D106 one invitation-side unit at BOTH endpoints from issuance, no extra unit at acceptance; D107 eligibility validated once at issuance; existing 24h freeze and guarantor cancellation; acceptance admitting the target with ONE original creation inviter (D99) and activating the special inviter↔newcomer mutual link; D75 release of both units when the invitation or link validly ends; D98 closed invitations never reopen.
- **Out:** D104/D84 Council-path checks and D91 phase logic (V3); D95 re-entry of an admitted person; invitations to admitted accounts; canonical fields/signatures/addresses, zero-act XP/chain-N/rate-slot semantics, gas.

## Constructor binding

V1's `valences` object gains one required key:

```js
valences: { K, reference: { ...V1 bindings,
  invitations: 'v2-special-link' | 'refuse',   // 'refuse' keeps V1 behavior exactly
} }
```

`'refuse'` is the V1 behavior (all invitation calls reject). Existing V1 configurations must add `invitations: 'refuse'` explicitly; V1 tests are updated to that binding and must otherwise pass unchanged.

## API (valence mode with `invitations: 'v2-special-link'`)

- `preregisterAccount(id)` — records a pre-registered account with its zero Genesis act as a **caller-supplied assertion** that required fields are complete and the act is published. Mints/burns nothing, creates no Emitter right, XP, personal-chain position or reward slot, and the account is not a subject. Duplicate or existing-subject IDs reject.
- `createInvitation(creator, sourceSelfId, target) → invitationId` (same name, valence-mode semantics).
- `acceptInvitation(invitationId, target)`; `cancelInvitation(guarantor, invitationId)` (existing freeze-window veto).
- `endInvitationLink(actor, invitationId)` — either endpoint ends an active special link.
- `preregistrations()`, `ownedSlots(id)` accepts pre-registered IDs.

## Semantics

1. **Count:** `used(s)` = open own valences + invitation units of `s` for invitations in status `pending` or `active` (issued and received).
2. **Issue (atomic, validated once):** creator accepted and not D77-held; target pre-registered, not a subject, and holding no other pending invitation (duplicates refused — coalescing is OPEN); creator has ≥ `requiredGuarantors()` eligible established mutual guarantors (Council paths not checked in V2); `used(creator) < K` and `used(target) < K`; source is an own mature eligible right. Then burn it (disposition `invitation`), record `{ id, creator, target, sourceSelfId, guarantors, createdAt, status: 'pending', units: [creator, target] }`, event `invitation-created`.
3. **Freeze/veto:** for `policy.invitationFreezeHours` any current guarantor of the creator may cancel (existing rule); status `cancelled`, both units released, burn not refunded.
4. **Accept (no repeated eligibility, D107):** target matches, freeze elapsed, status `pending`. Creator support, paths or K changes since issuance are not rechecked. The target becomes a subject with lineage edge creator→target (one original creation inviter); the pre-registration is consumed; both directed guarantee edges become active as one special link (relations tagged with the invitation); status `active`; units stay counted (no release, no extra unit).
5. **End link:** either endpoint, priced by the V1 `withdrawal` binding, D77 per `withdrawDuringHold`; both relations end with XP per `pairEndXp` (the actor is the withdrawer); status `closed`; both units released (D75). The newcomer keeps its identity and history; a later relationship is a new valence or a new invitation (D98), never a reopened record.
6. **Refusals:** invitations to admitted subjects, unknown targets, second pending invitations to one target, foreign/immature/locked sources, and any unit overflow reject with no mutation.

## Acceptance tests

1. `invitations: 'refuse'` reproduces V1 exactly; missing binding rejects.
2. Pre-registration mints/burns nothing, is not a subject and has no slot until invited.
3. Issue burns exactly one own right, recipient pays nothing, each endpoint `used` +1; full creator or full target refuses atomically; recipient at K blocks even with free creator capacity.
4. Insufficient mutual guarantors, D77-held creator, duplicate pending target and admitted target refuse atomically.
5. Acceptance after the freeze admits with lineage, activates both edges, keeps both units, needs no recheck even after the creator's guarantor pair was withdrawn; acceptance during the freeze rejects.
6. Guarantor cancellation during the freeze releases both units without refund; a cancelled invitation cannot be accepted or reopened.
7. Ending the special link releases both units, ends both relations with the bound XP rule and leaves the newcomer a subject; newcomer Self-ID XP credits the inviter only while the link is active.
8. `audit()` conservation and new invariants (unit counts equal records; source burns; link/edge consistency); full suite and historical tests pass; structural replay keeps refusing valence journals.
