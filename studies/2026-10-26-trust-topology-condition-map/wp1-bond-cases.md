# WP1 component: held and bounded vouch-bond settlement

**DIAGNOSTIC software validation, not G1 or a court/security result.** Completes an escrow execution component after [funded admission](wp1-admission.md); no selected D-rule, legacy default, automatic sanctions or researched human rate changes.

## Trusted API, not agent authority

- `openVouchBondCase(vouchId,{caseId})` records a custody hold on an existing reserved bond. One pending case per bond is supported; duplicate IDs are replay-rejected and overlapping pending cases fail closed until an ordering/coverage contract exists. The same external case ID may refer to several distinct bonds, but each is settled independently. This does not authenticate a challenger, price a case, establish covered duty or admit a late claim. Opening after V while funds remain held is technically supported; actual late-case admissibility remains the caller's explicit contract, not a selected limitation rule.
- `resolveVouchBondCase(vouchId,{caseId,upheld,burn,transfers})` requires a Boolean supplied verdict and explicit complete allocation. Each transfer is `{recipient,amount}` with a distinct known recipient and positive integer amount; burn is an explicit nonnegative integer. There is no default fine, finder share, burn ratio or remedy. Rejected cases (`upheld:false`) require zero burn/transfers; upheld cases may debit only currently remaining backing. No excess becomes debt or an automatic claim on the owner's wallet/third parties.
- `vouchBondCases()` exposes immutable pending/resolved receipts with opening collateral, timestamps, actual debit/burn and canonical recipient-sorted payouts. Source truth, merits, evidence accuracy, court access and per-party coverage remain outside the kernel. No identity/XP/graph/claim-source consequence is inferred. A supplied verdict is not evaluator truth.

## Principal, pending cases and clocks

Each commitment conserves `bond = bondRemaining + slashed + refunded`. Here **slashed is gross escrow debit**, not necessarily an attacker's net loss: payouts may return to the owner or another coalition member. Internal transfers cancel in coalition utility; only actual burn changes supply. Known invalidated recipients may receive custody, as native stake settlements allow; ordinary spending restrictions still apply.

Pending cases block refunds even after V, and encumbered/depleted commitments cannot support a new c-vouch admission. Exit remains free and does not escape held exposure; it neither resolves the case nor releases collateral. Neither the case nor a partial debit resets T or extends V/K slot occupancy. Partial remainder stays locked; after V and all holds resolve, an explicit separate clearance refunds only that remainder. Full debit can leave a zero-valued reserved record until its ordinary clearance. Rejected-case resolution clears that hold only, not every possible obligation or a missing clearance.

All verdict totals, recipient existence/duplicates/balances, supply bounds and remaining backing are preflighted before mutation. Per-bond debits across cases cannot exceed original B. Case/pending indexes, clearance fields and principal/allocation history are reconstructed by audit alongside full FACY conservation. No direct graph mutation, minted payout, fictitious recovery/debt burn, free refund or court integration is introduced.

## Validation and remaining gate

[Seven new families](../../test/vouch-bond-cases.test.mjs) cover holds across V/exit, actual partial burn/payout/cumulative B caps, pending/depleted admission guards, rejected/replayed/overlapping cases, invalidated/self recipient custody, immutable/canonical allocation and failed-call/future-ID/read atomicity. An independent integer recurrence checks256 two-case burn/transfer/refund partitions. All21 focused families,417 current tests and21 separately source-pinned historical compatibility tests pass. [Validation identity](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-26-trust-topology-condition-map/wp1-bond-validation.json) distinguishes engineering data from unrun research; DAG remains32 files/77 edges, acyclic.

```sh
node --test test/vouch-bond-cases.test.mjs test/vouch-admission.test.mjs test/vouch-commitments.test.mjs
npm test
```

These are deterministic software fixtures, not adaptive attacks, probabilities, full independent topology reimplementation or G1 prior confirmation. Pending procedural/court admission, concurrent-case ordering and complete collection/finder/source remedies are still unbound; nothing lifts the act-defect guard. Native source fingerprint changes, historical packets/guards do not. A later [paid native act-review adapter](wp1-review.md) now supplies received-signal/snapshot-veto composition, not court merits or full Standing. Remaining WP1 work is the full minimal action/resource/reference contract and native-v2 preregistration surface; no later WP, model study/search/confirmation seed, LLM testbed or pilot ran.
