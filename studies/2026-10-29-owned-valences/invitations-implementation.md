# Owned valences V2 — invitation-side units implementation checkpoint

**2026-10-29 · opt-in reference engineering after the [pre-code contract](invitations-contract.md) (`a7188b8`); not a default, migration or empirical result.** [BACKLOG](../../BACKLOG.md#trust-topology-condition-map-master-programme) owns V3.

## What exists

With `valences.reference.invitations: 'v2-special-link'`, `src/model.mjs` adds `preregisterAccount`, `preregistrations` and `endInvitationLink`, and gives `createInvitation`, `acceptInvitation` and `cancelInvitation` valence-mode semantics exactly as contracted. `'refuse'` keeps V1 behavior; V1 tests now bind it explicitly and pass unchanged otherwise. `ownedSlots(id)` also accepts pre-registered IDs and reports `invitations` alongside `open` valences.

- Pre-registration is a supplied assertion (no FACY, right, XP, chain position or slot).
- Issuance validates once: creator accepted, not D77-held, ≥ `requiredGuarantors()` eligible mutual guarantors (Council paths not checked — V3), own mature right, pre-registered target without a pending invitation, capacity at both endpoints. It burns the right and counts one unit at each endpoint.
- Acceptance after the freeze rechecks nothing about the creator (D107), admits the target with a lineage edge from its one creation inviter, activates both special-link edges and keeps both units.
- Guarantor cancellation during the freeze and `endInvitationLink` release both units (D75); burns are never refunded; closed invitations never reopen.

## Boundaries recorded at implementation

- The recipient-ceiling check is defensive: in V2 a pre-registered target can hold no other unit (one pending invitation, no valences), so it is unreachable until re-entry or invitations to admitted accounts exist.
- While a special link is active, the same two subjects cannot also form an ordinary valence pair (the edge already exists); the open valence stays unmatched.
- Structural replay classifies `account-preregistered` and `invitation-link-ended` as unsupported and refuses those journals.

## Validation

`test/valence-invitations.test.mjs` (9 tests) covers the contract's eight groups. Removing the target unit, the cancel release or the link-end release, or adding an acceptance-time eligibility recheck, each fails at least one test. Full `npm test` and the pinned historical tests pass.
