# Owned valences V3 — Council paths and initial bootstrap (D84/D91/D104) pre-code contract

**2026-10-29 · opt-in reference engineering, NOT IMPLEMENTED at this commit.** Extends [V1](implementation.md) and [V2](invitations-implementation.md). Owner semantics: [§17.1 D84](../../docs/facety.protocol.en.md#171-identity-claim-not-a-tradable-nft), [§18.2 D104](../../docs/facety.protocol.en.md#182-dynamic-guarantor-threshold), [§46.14 D35/D91](../../docs/facety.protocol.en.md#4614-xp-centered-paths-pre-guaranteed-genesis-and-no-cluster-quotas-d35), [§46.15 D36/D103](../../docs/facety.protocol.en.md#4615-internally-vertex-disjoint-invitation-paths-d36). Committed before code. The protocol leaves Council snapshots, mixed/self terminals, phase counting, path bounds and genesis financing to contracts; this reference fixes **one explicit, labeled choice for each** as a required binding, selects none of them as protocol, and rejects every other value.

## Scope

- **In:** D84 Self-ID gate (≥1 established mutual guarantor; outside initial bootstrap that guarantor has a current mutual path to an admissible Council member); D104 invitation gate (≥D mutual guarantors AND D internally vertex-disjoint current mutual paths to an admissible Council member); D91 initial bootstrap waiving Council paths before the first 100 active participants; D35 pre-guaranteed genesis pairs; D36 whole-family disjointness with shared issuer/terminal only; D103 current relations only.
- **Out:** D33 dynamic Council size/consul rounding, verified-independence predicates, mixed terminals, path hop caps, mature-network decline below 100 (an unresolved separate case), D91 Chekharda shutdown (the dispute layer lives outside `FacetyModel`), D95 re-entry.

## Constructor binding

V2's reference gains two required keys, and `valences` gains `genesisPairs`:

```js
valences: {
  K, genesisPairs: [['a', 'b'], …],   // D35 supplied established pairs between genesis members; may be []
  reference: { ...V2 bindings,
    eligibility: 'v3-council-paths' | 'off',  // 'off' keeps V2 behavior exactly (genesisPairs must then be [])
    councilPaths: {                           // required object when eligibility is 'v3-council-paths'
      council: 'legacy-active-xp-leaderboard', // admissible members = model.council() at check time
      terminal: 'single-member',               // all D paths end at one admissible member (D36 math)
      self: 'other-member',                    // issuer/guarantor may not be its own terminal; zero-hop never counts
      bootstrap: 'latch-first-100-active',     // initial until activeCount() first reaches 100, then never again
      intermediaries: 'accepted-subjects',     // non-accepted identities are blocked as path vertices
      search: 'exact-unbounded',               // exact max-flow, no hop cap; every found family is re-verified
    },
  },
}
```

Existing V1/V2 configurations must add `eligibility: 'off'` and `genesisPairs: []`; their tests change only that.

## Semantics

1. **Genesis pairs (D35):** each listed pair of distinct genesis members becomes two open valence records with `burnSource: null` and `origin: 'genesis-supplied'`, plus the established pair. No mint, burn or refund; each record counts one unit for its owner; pairs must fit K; duplicates reject at construction.
2. **Graph:** current established mutual guarantees only (valence pairs and active invitation links), as directed edges in both directions; ended relations, unanswered valences, pending invitations, lineage and pre-registrations never count (D103).
3. **Phase:** `bootstrap` is true until the first moment `activeCount() ≥ 100` observed at any eligibility check or `advanceTo`; it then latches false permanently (event `bootstrap-ended`). A later decline does not re-enter bootstrap.
4. **Self-ID (D84):** `createSelfId` in valence mode additionally requires ≥1 eligible mutual guarantor (current `eligibleGuarantors`). Outside bootstrap, at least one of them must have ≥1 path (step 6) to an admissible member other than itself.
5. **Invitation (D104):** issuance additionally requires, outside bootstrap, D internally vertex-disjoint paths from the creator to one admissible member other than the creator. The existing ≥D guarantor count stays separate and always applies. Validation happens once, at issuance (D107).
6. **Path check:** for each admissible member `a` in deterministic order, `findInternallyDisjointPaths(graph, { source, target: a, minimumPaths, blockedNodes })` with non-accepted subjects blocked; the first `found` family is checked by `verifyInternallyDisjointPaths` and its certificate is stored on the act/invitation (`councilPath`). No admissible member, or only the issuer itself, means the gate fails (`insufficient Council paths`).
7. All checks precede any mutation; a failed check leaves state unchanged.

## Acceptance tests

1. `eligibility: 'off'` reproduces V2; incomplete or unsupported `councilPaths` values and non-empty genesis pairs with `'off'` reject.
2. Genesis pairs establish edges and count units without mint/burn; out-of-K, self or duplicate pairs reject.
3. During bootstrap, Self-ID needs exactly one mutual guarantor and no path; an isolated subject's Self-ID rejects.
4. Bootstrap latches at the first 100 active participants (boundary 99/100) and stays ended after a decline.
5. Outside bootstrap, Self-ID passes with a guarantor that reaches a member, fails when no guarantor reaches one other than itself.
6. Outside bootstrap, invitation needs D disjoint paths: a shared-intermediary graph fails at D=2 while a disjoint graph passes; edge-disjoint routes through one intermediary do not count; ended links and pending invitations do not provide paths; invalidated intermediaries are blocked; the stored certificate verifies.
7. The guarantor-count and path conditions are independent: each alone is insufficient.
8. `audit()` holds; full suite and historical tests pass; structural replay keeps refusing valence journals.
