# WP1 component: funded vouch commitments

**DIAGNOSTIC engineering checkpoint, not G1, prior confirmation or a research run.** This is the first bounded code slice after G0. It adds opt-in reservation/custody primitives to `FacetyModel`, not a complete CORE or membership engine. No selected D-rule or legacy default is changed.

[The subsequent admission component](wp1-admission.md) adds funded membership and both-party backed-link exit under a separate opt-in reference; this page owns the initial reservation contract, not a complete CORE engine.

## Explicit constructor contract

`new FacetyModel({vouching: {K,T,V,B,reference}})` requires all fields; null/omission disables it. K is a nonnegative integer concurrent slot count; T/V are positive integer days; B is nonnegative integer FACY. Safe hour/end/balance bounds are checked. The immutable nested reference record must explicitly supply:

```js
reference: {
  eligibility: 'accepted-reference',
  clockOrigin: 'commitment',
  funding: 'collector-liquid',
  exitSlot: 'retain-until-V', // or 'release-on-exit'
  bondRelease: 'supplied-clearance'
}
```

These are **available diagnostic bindings, not selected CORE rules**. Accepted-reference eligibility ignores Standing/verification, as the initial prior's immediate-eligibility approximation does; it never reads evaluator truth. The clock begins at the successful commitment, not an inferred admission. Only actual Collector liquidity funds B. Both explicit exit-slot interpretations are supported because Q02 is OPEN. No default binding is silently supplied.

## Transitions and accounting

- `commitVouch(voucher,target)` locks B, consumes one current slot and starts the voucher's SubjectId cooldown only after successful preflight. Target is a nonempty distinct reference; it may name a pending unknown candidate or an existing accepted subject. The method does **not** create a subject, graph guarantee/lineage edge, Standing, XP, verified independence or personhood. A known invalidated target/voucher is ineligible under this declared reference.
- `exitVouch(voucher,id)` is the issuer's free withdrawal of a live reservation, not a complete mutual-guarantee termination API. It keeps history, bond and cooldown. The chosen exitSlot policy determines capacity only; neither releases principal early. Overlapping commitments by the same voucher to the same target are rejected even after early exit.
- `vouchCapacity(voucher)` reports current occupied/free slots and remaining cooldown, with no mutation or random draws. V intervals are half-open: occupied before expiresAt, free exactly at it. There is no accumulated permit balance; key rotation, exit/refund and long inactivity do not reset/bank cooldown.
- `releaseVouchBond(id,{clearanceId,clear:true})` returns reserved principal only at/after V and only under an explicitly supplied trusted clearance. It is not case admission, adjudication, a verdict oracle or a self-service innocence proof. Advancing time does not automatically clear liability or refund money. Principal may return to an invalidated owner's custody, as native dispute refunds do; ordinary spending restrictions remain. Refund does not mint/burn, create income/XP or automatically erase debt.
- `vouchCommitments()` returns copied immutable receipts. Audit reconstructs locked principal, cooldown index, pair coverage, record chronology/current capacity and extended conservation. Opt-in ledgers add `vouchVault`; default ledger/event/value shapes remain unchanged. Reserved coins cannot simultaneously back transfers, disputes or additional vouches.

The retained-slot mode satisfies the declared prior1 assumption that each booking occupies V days. Release-on-exit is a different reference assumption, not a refutation of that prior. Both can retain capital longer than slot occupancy while awaiting clearance. Cost reporting must distinguish unused capacity, locked capital, actual loss and explicit refund.

## Validation, scope and remaining gate

[Seven software families](../../test/vouch-commitments.test.mjs) cover immutable/missing/invalid bindings; actual funding and exclusive backing; SubjectId/no-banking clocks; both exit candidates; exact4h/V boundaries and trusted-clearance replay; failure/future-ID/inert-inspection atomicity; and **4096 deterministic software partitions** against an independent event-replay accounting/slot oracle. The oracle does not call Model transitions/capacity logic. This is component property coverage, not a sampled attack experiment, calibrated probability or the required independent full topology reference.

At the initial reservation checkpoint, focused7/7 and full403/403 current tests passed;21/21 historical compatibility tests pass separately on pinned aab881f source, not as current-source validation. Native DAG remains32 files/77 edges, acyclic. [The validation record](wp1-kernel-validation.json) binds actual implementation/test identity and separates software evidence from research counts. The source fingerprint changes even with the option off; historical confirmations/guards remain unchanged and are not recaptured or overridden.

Software-only reproduction (not a study run):

```sh
node --test test/vouch-commitments.test.mjs
npm test
```

**G1 remains open.** The later c-vouch admission/consent/graph and [bounded case custody](wp1-bond-cases.md) components are now delivered separately. Remainder-only refunds and pending holds extend this initial principal contract; full court procedure is not implemented. Full veto/detector composition, an independent complete minimal reference, native-v2 experiment/metric integration and committed prior/kill/range/precision contracts remain. No R1/R2 frontier, adaptive attack, phase/market/LLM testbed or pilot was run. Only BACKLOG owns the next WP1 cohort. Q02/Q04/Q10/Q13 retain the corresponding OPEN choices and trade-offs.
