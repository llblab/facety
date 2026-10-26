# WP1 priors1–3/7: pre-data contracts and actual coverage

**Audit checkpoint at82fe4ac; DIAGNOSTIC analytic/software preparation, not a G1 checkpoint, programme registration or empirical confirmation.** The later [P/b backend](wp1-pb.md) and [actual P/b v2 admission](wp1-pb-v2.md) close capacity-only execution/reference/common-path gaps, not incremental recipient payback; the audit's original source/validation binding remains historical. This audit narrows what can be tested after [actual Native v2 admission](wp1-v2.md). The algebra below states assumptions/candidate corrections; it is not independently authored/accepted verification. No population/search/prior sampling or Native reserved confirmation seed was executed. [BACKLOG](../../BACKLOG.md#trust-topology-condition-map-master-programme) alone owns next work; [Q01/Q02/Q11–Q13](../../DECISIONS_NEEDED.md) own unresolved choices. No selected D-rule or OPEN CORE contract is filled.

## Coverage is not the same as registration admission

- **Prior1 — concurrent service and growth:** the current Native tape, actual c-vouch Model and import-free logical reference cover funded commitments/admissions, commitment-origin T/V, retain-until-V slots and supplied-clearance refunds. `vouch.commitments` now measures cumulative successful reservations through normal series/v2 scalar tasks; failed offers do not count, expiry/exit/refund do not subtract. Existing `liveSlots`, `bondVault` and admissions are different stocks/flows, not substitutes. Per-voucher histories remain reconstructible from actual action/state receipts, not automatically available as arbitrary registered scalar statistics. A fixed exogenous tape is not a reproducing-population policy or measured endogenous growth.
- **Prior2 — lifetime quota:** neither this Model mode nor `CompositionReference` implements lifetime K. They implement renewable concurrent slots. Setting K<c or holding bonds forever does not turn either into the requested lifetime-quota counterfactual. Its mathematical inventory/atomic admission contract and distinct-voucher constraints need their own explicitly counterfactual verification; no alternate protocol option is selected.
- **Prior3 — sunk burn/payback:** Native `FacetyModel({invitationLimit:{P,b}})` and the historical [P/b capacity reference](../2026-10-25-invitation-limits/capacity-controls.mjs) exist. The current vouch engine explicitly requires `invitationLimit:null` and has no invitation-create/accept operation. Legacy cohort config does not admit an invitationLimit parameter either. Thus admitting Native vouch scalar tasks did **not** admit P/b experiments. The old504-day controls are historical engineering, not current G1 data. Refunding/slashing uppercase bond B cannot serve as lowercase sunk burn b. A scoped P/b execution/independent-reference and actual v2 measurement contract is needed before any new registered execution; BOND/PURCHASE/markets remain WP5-gated.
- **Prior7 — exactly-D attack-edge amplification:** the Model records funded vouchers/backed directed edges; raw action/state receipts can join commitments to admissions. The environment has person/act/profile facts but **no coalition/operator ownership map**. No current vouch scalar counts evaluator-false admissions or ownership-cut funded edges. `activeRelations` is not D_attack; `members/admissions` are not false identities. Profile strings/SubjectIds cannot substitute for ownership. Exact edge accounting/attribution and numerator/denominator observables remain missing; graph degree or D_gate cannot silently fill them.

The generic v2 schema and worker availability do not supply these missing scientific/measurement contracts. Do not create accepted-looking registrations around nonexistent outcomes.

## Prior1: service bound, startup and population law

Use days throughout; T>0, V>0, integer K>=0. For one already admitted voucher, let C(H) count **successful commitments in [0,H)**; each occupies one slot for V days, and consecutive successful uses are separated by T. Under retain-until-V and no reset/banking, for H>0:

```text
C(H) <= min(ceil(H/T), K*ceil(H/V))
limsup C(H)/H <= r = min(1/T, K/V)
C(0) = 0
```

Proof: partition the prefix into half-open T windows (at most one use per window) or V windows (all commitments in one such window overlap at its last commitment, so at most K). Partial final windows preserve the initial-use allowance. The asymptotic bound is not the finite-prefix assertion C(H)<=r*H. Release-on-exit changes the occupancy argument and is outside this reference. Pending cases may lock money beyond V without extending slot occupancy.

For successful admissions A(H), each consumes c distinct qualifying prepaid records at most once, hence `c*A(H) <= sum_v C_v(H)`. Delayed matching, unused/expired commitments, missing distinct vouchers, veto/funding loss and admission time can make this strict. There is no claim that every financed reservation becomes a birth. Initial Collector is zero; B>0 needs actual convertible earnings/refunds, not an assumed starting K*B balance or automatic clearance at V. Non-review labor is unmodeled, not free measured effort.

The owner's `birth rate ~ r/c` and `Tdbl ~ ln(2)*c/r` require an additional population approximation: every member supplies a time-homogeneous flow r, is eligible/financed immediately, every c units are successfully matched, and losses/delays/mortality are excluded. Only that fluid closure gives `dN/dt=(r/c)*N`; at r=0 it gives no growth/finite doubling time. A long-run per-voucher cap alone does **not** prove a population exponent or that doubling time.

**Concrete Native boundary, not CORE:** accepted-reference has no own Claim/Standing gate. With c=1, K=1, B=0, positive T/V, a newly admitted subject can use its first slot immediately. The fixed three-link permission regression in [the backend tests](../../test/vouch-experiment.test.mjs) admits three successors at hour0 without any Self-ID/emission, agreeing with the independent logical reference. It does not violate the per-subject service bound: each voucher uses once. It does invalidate using that bound as a finite global startup/growth law without first-use/eligibility assumptions. This is a fixed software boundary witness, not a sampled attack frontier or proof of infinite execution: tapes, caps and identifiers are finite. Do not repair it by silently selecting a CORE Standing/window rule or claim it transfers to CORE.

For an explicitly ideal age-structured branching reference, a birth-age measure M instead satisfies `integral exp(-g*a) M(da)=1` when a suitable positive growth root exists. For one full child first at age a>0 and thereafter every P, this becomes `exp(-g*a)/(1-exp(-g*P))=1`; only a=P yields g=ln(2)/P. This is a different declared reproduction law, not a way to derive actual birth ages from c individual vouchers. Registered growth tests must bind first eligibility, synchronous/asynchronous matching, stock financing and bootstrap before comparing exponents. Zero-time first use and delayed finance are controls, not residual emergence.

## Prior2: total versus new, and pre-admission funding

**Explicit analytic counterfactual only:** s initially eligible seeds each have K unused lifetime uses; each new subject requires c distinct existing vouchers, consumes c uses **before** admission and only then receives K new uses. No renewal, outside supply, withdrawal or other gate. Let n be newly admitted subjects and Q unused lifetime uses just after an admission:

```text
Q = s*K + n*(K-c)
K<c and Q>=0 imply n <= s*K/(c-K)
therefore total s+n <= s*c/(c-K)
```

The master's expression is a loose fluid/inventory bound on **total**, not n. It is not an attained population prediction. Sequential prepaid admission strengthens the necessary bound: for n>0 the newest subject still has all K uses immediately after its own admission, so Q>=K and `n <= floor(K*(s-1)/(c-K))`. Distinctness/unused trailing quotas can tighten this further; neither inequality is asserted to be the exact attainable maximum. With K=1,c=2,s=2, the first birth leaves only the newborn's one use and no second distinct eligible voucher; the process stops after one new subject. This is a hand-derived inventory example, not a simulation/cell result.

K>=c removes this declining-total-quota argument, but does not establish actual self-sustain: if s<c no first birth is possible; time, financing, eligibility, matching, graph and intervention constraints remain separate. Concurrent Native K/V cannot be analyzed as lifetime K. No lifetime ceiling inferred from K<c is licensed for the actual renewable-slot mode.

## Prior3: dimensions, recovery and survival

Let b be a **sunk actual coalition cost** in FACY, E>0 a constant collectible FACY/day flow newly enabled by the funded act, and X a same-unit total external gain. Gross deterministic recovery time b/E excludes maturity/first receipt, interrupted eligibility, liquidity, wages/effort, discounting, market effects and the lawful counterfactual. Existing emission the payer would receive without the act is not automatically an incremental benefit. E=0,b>0 has no such recovery; 0/0 is undefined, not zero-day payback.

For survival time L with survival function S(t), expected finite-horizon flow is `E*integral_0^H S(t) dt`, or the explicitly discrete receipt sum when emission is not continuous. Only for a constant exponential removal hazard lambda>0, indefinite horizon and uninterrupted collectible flow does this equal E/lambda and E[L]=1/lambda. At lambda=0 no finite inverse-hazard lifetime exists; fixed delay/nonstationary/censoring/competing risks cannot be collapsed into that formula.

Thus `b >= E*E[L]+X` (with the same cost/benefit counterfactual and units) is a conditional expected-gross break-even comparison, not a deterrence guarantee, tail bound or equilibrium. At X=0 under that survival law the ratio is b*lambda/E. Refunded principal, gross escrow slash, coalition-internal finder payouts, innocent losses and uncollected debt are not interchangeable with b. At fixed p>0 and wholly token-denominated flows, p cancels from b/E; fiat wages, external X and time-varying prices do not generally cancel.

The P/b service cap `min(1/P,E/b)` additionally assumes a stationary usable own-source stream, no lapse, sufficient opportunities and declared first stock/maturity. Equality b=P*E co-binds; strict stationary reduction relative to 1/P needs b>P*E. P/b invitation creation without recipient acceptance/emission is a capacity control, **not** a measured false-person payback experiment.

## Prior7: define the cut before reporting a ratio

A candidate estimand is newly admitted evaluator-false subjects F(H) divided by D_attack>0, conditional on declared seed access, source/coalition ownership, funded boundary law, horizon, policy and search budget. Exclude initially supplied members from F and report their acquisition/prehistory separately. Genuine paid participants, genuine rule-breakers and false identities remain distinct. Evaluation may read ownership/truth; admission/defense/governance may not.

“Exactly D” still needs a choice among lifetime activated funded boundary records, concurrent live exposure, or reusable contact relationships; these differ under expiry/exit/renewal and have different real costs. Fix the membership cut/ownership over time and whether abandoned reservations count before constructing attack tapes. An offered edge is not a funded activated edge; all internal c-vouches are not external boundary access. A zero denominator is undefined/unbound, never zero amplification or a safety pass. Seed access may already permit internal reproduction with no newly purchased boundary edge, so it cannot be hidden in an excluded denominator.

No function of raw degree/D_gate, count of keys or XP alone supplies this estimand or verified independence. A finite cap-censored tape cannot show a finite maximum or unbounded attack. Exact-D construction must use actual Model funding/receipts, not direct graph edits, plus a genuinely separate evaluator/feasibility verifier and independent reference. The WP1/WP3 numeric X1 kill and all-rule/plausible-range quantification remain unbound; no universal kill/pass follows from these observations.

## Evidence and pre-data boundary

This cohort adds one raw success counter and two fixed software regression families; it does not add a lifetime/P-b engine, ownership/fake-edge metric, Claim/Standing policy, adaptive attacker or a new mechanism. Existing tests extend the four composition oracle comparisons and real v2 multi-statistic admission to the counter. All source/manifest guards remain. [Validation](wp1-priors-validation.json) binds software/test/doc blobs and records research counts separately.

A real G1 method must distinguish exact inventory/service checks from age-growth/payback/attack hypotheses; name missing backend/reference coverage rather than fabricate outputs; bind source-or-**no basis** ranges/joint laws, finite caps/horizon, precision/equivalence and error/selection family, numeric kills, actual measured statistics and reserved namespaces before research execution. Commit actual v2 registration only after supported execution/metric contracts exist, and before any empirical prior run. Recorded algebra/software observations here are not G1 acceptance or a reason to unlock later WPs. No calibration or actual programme registration exists.
