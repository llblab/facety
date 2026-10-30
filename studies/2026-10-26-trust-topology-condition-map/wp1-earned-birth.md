# WP1 prior1 — earned first and child-backed admission times

**2026-10-28 · DIAGNOSTIC analytic feasibility result for the existing closed Native reference, NOT measured growth/G1/selected admission rules.** [Independent review](wp1-core-prerequisite-results.md) selected this prerequisite; [BACKLOG](../../BACKLOG.md#trust-topology-condition-map-master-programme) alone owns continuation. Existing [composition](wp1-composition.md)/[fixture](wp1-composition-fixture.json)/[import-free reference](reference.mjs)/[Native bridge](native-reference-bridge.mjs) are reused, not replayed. [Bindings](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-26-trust-topology-condition-map/wp1-earned-birth-validation.json) retain scope/equivalence/proof checks. No Model/experiment calls, new backend, scientific sampling or source/test/protocol edits.

## Exact question and declared family

How early CAN first accepted child x and a subsequent child-backed y be admitted when collateral is earned, not supplied? This is a conditional best-case chronology, not a forecast of willingness, availability, retention or population exponent. Existing material supplies a fixed 48h/96h witness and service inequalities, but no general earliest-timing derivation for this family; do not count that fixed witness as new evidence.

Use days; hours=24days. Take the exact policy/ablations/reference fields of the existing composition fixture, replace only diagnostic vouch parameters: c=2; K_slot=K≥0, T,V positive integers, B≥0 integer. **K_slot denotes renewable probation slots**, NOT D75 active outgoing guarantees or lifetime quota. Two initially accepted founders a,b, no other members; no initial money, XP or source stock. Membership is a supplied unverified bootstrap; accepted-reference is not selected CORE Claim/Standing/path verification. Native createSelfId has no minimum-guarantor admission test; it snapshots available eligible guarantors. Do not silently add a CORE eligibility requirement to these founders or assume the result survives such a requirement.

First admission x needs prepaid a→x and b→x. Second y specifically needs b→y and x→y. These are the only commitments/admissions. Both target consents are supplied trusted calls available when needed; every subject stays accepted. Each subject MAY issue an ordinary unencumbered source immediately on acceptance and at most once per 24h, and explicitly convert its own right at age 24h. No pre-acceptance sources. No cancellation/false evidence/cases/D77 holds/debt/locks/exits/penalties, payments/transfers/markets, bought or delegated rights, refunds or later grants. Absence here is a scenario control, not immunity or cost-free real life. Non-review human labor is unmodeled; zero guaranteeFee and instantaneous sequential same-hour calls are existing reference assumptions, not a universal growth-friction claim. No extra Standing or own-XP condition is invented for commitVouch.

Only bounded safe integer inputs/constructed times, counters and balances admitted by existing number/graph/resource limits are covered by a Native realization; the algebra is not a promise to execute arbitrarily huge traces or ignore caps. Let H be a declared open command horizon [0,H). A time-τ admission is included only when τ<H; equality to terminalH is excluded, not a completed endpoint zero.

## Necessary lower bounds

For a subject born at β, no initial stock and immediate maximum ordinary issuance, by age u≥0 the number of convertible own units is at most floor(u). Source creation is not conversion; the first unit is collectible only at β+1. Therefore B positive collateral requires age at leastB. If there are pauses/cancellation/eligibility loss, this is optimistic, never a guaranteed receipt. At B0 this funding requirement disappears without introducing a first-use wait.

For K0 no commitment can pass vouchCapacity; no first or second admission is feasible, regardless of earned money. This is not a safety result.

For K≥1 let τx be x's admission. Each founder needs B own converted units, hence **τx≥B**. The child x has no initial cash/own sources, so its first B-backed commitment needs **τy≥τx+B**. Founder b's second commitment also obeys **τy≥s_bx+T**, where s_bx is its earlier successful commitment time, and s_bx≥B. If K1, its retained first slot requires **τy≥s_bx+V**; if K≥2 the first slot need not expire. No expiry alone refunds collateral.

The two founder→x commitments could occur at different times; that cannot beat these bounds because neither can precede B and x must await both. Delaying first acceptance also cannot advance x's own first convertible unit. Thus the lower bounds apply to ALL schedules in this exact family, not only a greedy trace.

## Exact conditional earliest times and constructive proof

For K≥1:

```text
τx* = B
τy* = B + max(B, T, V)     if K=1
τy* = B + max(B, T)        if K≥2
```

For K0 both are infeasible. These are **admission times in days**, not average interarrival rates, growth exponents or payback. Feasibility within [0,H): first iff H>τx*, both iff H>τy*, conditional on every declared resource/consent/eligibility assumption. Insufficient H is an explicit scope bound, not permanent impossibility.

Construction for B>0:

1. Founders issue B sources apiece at days0,…,B−1; convert each once at its day+1. At B, each has B liquid units and owes none. Commit a→x and b→x, then admit x in that order within the same timestamp. They are c-distinct, intact and live because V>0; each founder now has liquid0/bondB. No admission mints money or XP.
2. Starting at B, b and x each issue another B own sources at B,…,2B−1 and convert at B+1,…,2B. Founder a need not issue again. At2B, b and x each hold B liquid units; no refund or third-party transfer is needed. Both remain accepted and x's existing admission support is not automatically ended by slot expiry.
3. Wait, if needed, until τy*. Founder b's original successful-commitment cooldown has ended; its second slot is free (K≥2) or original occupancy has expired (K1). Child x has never committed, so it has no previous-use cooldown. Commit fresh b→y and x→y at τy*, then admit y at that same hour. Both fresh commitments remain live; no expired first-x commitment is reused for y.

Every wallet remains nonnegative after EACH call: a earns B/spends B; b earns2B/spends2B; x earnsB/spendsB; y starts0. All4B created units are explicitly converted, then held as four B bonds; at the construction endpoint **minted4B/burned0/supply4B=vouchVault4B, all Collector/Emitter balances0**, no fee/stake/debt. This is derived accounting, not a newly executed Native ledger. At K1 the expired first bonds still retain principal and historical active guarantee relations: free slot is not free capital or erased duty. This is precisely why K_slot cannot be relabeled D75 K.

For B0 omit ALL source/artifact/conversion actions: first two zero-principal commitments/admission at0; second b reuse waits T (and V for K1), x's first use has no cooldown. The same formula gives τx*=0 and τy*=max(T,V) orT. This c2/two-founder/reused-b family does not negate the existing c1 zero-age-chain witness; other consent/matching/founder configurations can behave differently.

### Derived specializations, not simulation cells

| B | T | V | K_slot | First x | Child-backed y | Binding after x |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2 | 1 | 3 | 2 | day2 | day4 | Child/founder earned second backing |
| 2 | 1 | 3 | 1 | day2 | day5 | Retained original slot |
| 1 | 4 | 2 | 2 | day1 | day5 | Successful-use cooldown |
| 0 | 1 | 3 | 2 | day0 | day1 | Cooldown despite no collateral |

The first line predicts the EXISTING fixture's first 48h/second96h admission times; the original fixture separately includes exit/review/later case/y-issuance and its final9-source ledger is NOT this construction's8-source endpoint. No old packet is rerun or relabeled. The second/third lines show different timing bottlenecks despite sufficient wallets; they are symbolic substitutions, not newly observed cohorts or a structural-security finding.

## Source map / falsification boundary

- `src/model.mjs` vouchingFrom/admitVouched: exact c2, K/T/V/B integer and named reference gates, distinct live intact unused prepaid commitments, trusted acceptance; no money grant on admission.
- createSelfId/eligibleEmissions/convertToCollector: accepted caller, retained rolling slot, ordinary own-source 24h maturity and explicit conversion; no external capital/XP conversion. `reference.mjs` apply(issue/withdraw), cash: independent source-history/BigInt cash reconstruction.
- vouchCapacity/commitVouch/#vouchOccupies and reference capacity: commitment-origin T, half-open [commit,commit+V) retained occupancy, immediate liquid B debit and unique target; first use has no previous cooldown.
- releaseVouchBond: a separate explicit trusted-clearance/refund operation, NOT implied by time or used in the construction. Source0/collector0 initially, lifetime/active-guarantee counters not substituted.
- Existing bridge/reference/test/vouch-reference differential families supply the reused software contract, not a fresh test run or new prior/G1 confirmation. Source/test/runtime unchanged, D79 fresh 766 current+21original compatible historical/86focused reused on exact equality only.

A violation of a necessary inequality would falsify this mathematical/source mapping; failing to realize the construction under SAME inputs would expose an omitted gate or capacity/operation limit, not invite a hidden rule change. Any different cadence, funding, observation, refund, c/founder matching, actual labor/consent or case behavior requires its own bound. The construction's ideal service and conditional access are NOT measured genuine-person growth; zero attacks/cases here do not establish defense or safety. Historical duty enforcement, actual personhood/topology and human participation remain separate.

## Convergence decision

This closes the selected analytic first/child-backed funded feasibility slice, not a general financed reproduction law. No new population engine or static replay is needed. The highest-value remaining prerequisite is now **same-party incremental receipt accounting against an actual lawful wait-collector branch**, reusing existing incentives/source primitives and retaining ordinary-versus-legacy maturity/reference boundaries. It must name payer/recipient scope, source principal once, exact matching/time/receipt/custody/recovery and missing values before any new execution. Prior2/7, actual scientific method/independent worlds/master G1 and D76 allocation capture remain gated; lifetime/C3/indexer stay parked. Continue that existing backlog slice without owner questionnaire or new mechanism assumptions.
