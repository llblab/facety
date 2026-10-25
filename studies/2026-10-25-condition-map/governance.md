# ARM_PURCHASE: treasury and governance lever — proposal addendum

**Master update2026-10-26:** [the governing programme](../2026-10-26-trust-topology-condition-map/README.md) now specifies PURCHASE as one/24h for b1 own matured emission within F1/3/7 days, all-burn versus80/20. It resolves the broad payment-source direction below, not freshness origin/fractional settlement/refund/authority details. Economics waits for G1/WP5; this document is a retained module, not an alternate work order.

**Owner-requested condition-map extension, not a selected D-rule or implementation.** No ARM_PURCHASE exists in the native simulator yet. Preserve the twelve isolated A/B/H/BOND/0 arms and CORE/legacy comparison; do not alias PURCHASE to their existing Self-ID burn. Purchase payer, asset/source, eligibility, price b, refund/cancellation, settlement and admission-gate bindings remain explicit prerequisites. All protocol-economic execution must eventually go through FacetyModel.

## Treasury policy and accounting

`s_treasury in [0,s_treasury_max]`, study default0 (all purchase proceeds burn), requested comparison0 versus0.2. The owner's governance cap symbol s_max is **not** V2's attacker-share threshold: use separate schema names. A share is in[0,1]; the cap is unbound, not silently1 or0.2. A0.2 cell requires cap>=0.2; incompatible cells are infeasible, not clipped or removed without reporting.

For a bound, actually settled purchase amount q, the accounting identity is `treasury_receipt=s*q`, `burn=(1-s)*q`; together they equal q, with no extra issuance, duplicated receipt or imaginary purchasing power. This is an identity, not a specified integer implementation: native FACY/source granularity, rounding/carry/batching and split/refund atomicity must be bound before execution. Splitting already-paid currency is different from redirecting unissued Self-ID rights. Gross payer cost remains q; changing burn into treasury custody changes supply/distribution/capture exposure, not automatically the payer's fee. Principal refunds and internal coalition round trips are not income.

**Comparison semantics must be fixed:** a fixed s0 versus fixed s0.2 policy experiment isolates the split; an adaptive-governance experiment starts at0 or0.2 and records the full voted s(t) path under the same action space. Initial0 is not immunity if the electorate can raise it. An immutable all-burn counterfactual is separately labeled, never confused with a changeable default. Register which contrasts are primary before data.

Report actual treasury stock/inflow/burn/outflow/commitments by asset and time, custody ownership and authorized uses. Do not count future fee forecasts as collected assets. Initial stock plus future redirected receipts must not be counted twice. Future flow depends on b, s, participation, price and capture itself; an uncaptured honest-growth forecast is not guaranteed withdrawable attacker revenue. Market valuation needs the scenario's actual price path/discount/horizon and separate native-asset totals, not a price guarantee.

## Eighth adversary (h): governance capture

Add governance capture to the existing seven classes, with the same declared in-world beta, generated-policy language, search budget, training/validation/reserved points+seeds and2x-search check. Signal manipulation can also be available to the other classes without assuming they control votes.

Electorates are assumption/model-form variants, not inferred independence or selected governance:

- **Standing-weighted:** bind eligible Standing, snapshots/epochs, decay, pending/disputed/corrected acts, delegated/rented accounts, quorum/threshold and veto/appeal. Standing does not certify truth, unique people or useful contribution; its existing CORE role is only vouch eligibility.
- **Random jury:** bind pool, sample size, replacement/shortage, selection visibility/manipulability, rotation, quorum/ties/nonparticipation and finality. Do not silently reuse the merits jury or fill the small-N contract.
- **Voucher-weighted:** bind whether weight means voucher count, locked collectible exposure or another declared quantity, plus overlap/lease/delegation/expiry. Raw degree, correlated guarantees or posted money do not prove independent people or honest votes.

Bind proposal, allocation, s/cap/b-bound changes, payout and safeguard-modification powers. Define capture success as an explicit unauthorized/private diversion or harmful policy outcome under a declared mandate, not mere coalition membership, voting coordination or a personhood verdict. Assess capture under paid bribes, acquired/rented authority, turnout manipulation and common control as applicable; use evaluator ownership only for measurement, never governance/adjudication inputs.

**Cost versus redirected value:** retain best-found successful cost and failed-attempt spend, time-to-control, capture probability/uncertainty, actually controlled/redirected receipts and stock, net recoverable value over the horizon and conditional discounted future flow. Separate burn/fees/actual losses, paid work, liquidity/time cost and collectible risk; keep capital locks/refunds/debt distinct. Self-financed purchase/treasury cycles cancel within the coalition. Report capture-cost/value ratios only on defined positive common-unit denominators; zero/censored cases stay explicit. A negative monetary capture payoff does not excuse sabotage/honest harm. No-found-attack is not a minimum-cost proof.

## Safeguards and honest flexibility

Measure each safeguard against an otherwise matched no-safeguard PURCHASE/governance candidate; preregister any combinations rather than silently multiplying the entire factorial. Use matched resources, information, seeds, attack effort and exogenous policy-change demands. A safeguard is not independently effective merely because encoded rules block one scripted transaction.

- **Hard cap s_treasury_max:** bound its value, enforcement and who can amend/bypass it. Distinguish a policy bound changed by the same captured vote from a hard limit requiring independent higher authority; do not assume immutability. Check diversion inside the cap, not only attempts exceeding it.
- **Timelock:** bind duration, start/reset, cancellation, emergency paths, notice and the information/cost of intervening. Delaying a payout is not prevention; track realized and horizon-censored losses.
- **Two-key approval:** bind role/key assignment, authorization/rotation/recovery and joint-compromise/lease costs. Two keys can share one owner/custodian; never infer two independent honest people from key count.
- **Sunset-to-default:** bind expiry, renewal authority, repeated renewal, clock/pending proposals and treatment of existing stock/commitments. Default0 resets the future split, not automatically burns accumulated funds or erases obligations. Captured renewal can defeat a nominal sunset.

For each, measure capture-cost/delay/probability and redirected value **and** honest flexibility: time/success rate to enact a predefined legitimate adjustment or payment, denied/delayed useful services, paid governance work, liquidity/lock and opportunity cost, and lost policy response under shocks. Register what counts as a useful adjustment; do not assume an honest majority is omniscient or price stabilization is always desirable. Keep the vector unless welfare weights are explicitly supplied. Include the costs in V3/V4 and map-boundary/dominance comparisons.

## Closed-loop burn law and signal attack

The variant is `b(t)=f(measured_lambda(t))` within vote-set bounds. Bind whether b is gross purchase q or its actually burned component; at s>0 these differ. Do not silently reinterpret the earlier source-burn phi/service prior for an externally funded purchase. No functional form, slope/sign, gain, smoothing, update cadence, delay, rounding, saturation/anti-windup, hysteresis, slew limit or missing/stale-signal fallback is selected. Vote-set bounds can themselves be a capture target; bind their amendment and enforcement authority. Preserve exact protocol windows and source/gate legality when b changes; specify quotation, pending-order and execution-time semantics instead of retroactively reburning sources or repricing settled purchases.

Bind which local/global lambda is measured, the at-risk denominator, observation window, evidence provenance, reporting costs and error/censor model. Never feed hidden evaluator truth into the controller. Since b can change activity, funding and evidence availability, measured response is endogenous, not a free exogenous defense upgrade.

Attack both directions: spoof successes, seed cheap/easy cases, suppress/delay adverse reports, contaminate denominators, selectively abstain or flood paid measurement/decision queues. Every action needs available information/resources and a declared effect on received evidence; no free forged oracle. Distinguish manipulation of measured lambda from a real change in effective suppression. Compare fixed-b and feedback candidates under matched funded conditions, including truthful measurement, noisy measurement and budgeted manipulation.

Report b/s/lambda time paths; peak/RMS amplitude, overshoot, settling time and recurrence/period only under registered estimators. Separate noise, delayed-feedback cycles and4h/24h aliasing through controls; a plotted wiggle is not a mechanism finding. Measure signal bias and b/treasury/participation response per real manipulation cost, boundary displacement and robustness to gain/lag/measurement assumptions. Preserve instability, saturation, exhausted budgets and non-settling/censored trajectories. Any mechanism claim needs committed presence, necessity and named-alternative registration before confirmation.

## Treasury benefit and paired asset: demonstrate, do not assume

Register an authorized purchase/use and a measurable delivered output, e.g. paid verification/audits, evidence availability, adjudication work or infrastructure. Then show the output's effect on effective response, honest costs/growth and V1–V5. Payments, grants, custody or a growing balance alone do not establish benefit, useful evidence or safety.

Required causal comparisons separate all-burn, treasury idle and treasury purchasing a specified service; add a declared matched-resource funding control/ablation where needed to distinguish better allocation from merely more available work. Never fund the all-burn comparator with an unrecorded subsidy. Report full payer/opportunity/governance/capture costs, fallible evidence and actual vendor work/acceptance; an assumed application externality remains separate. Net benefit and arm dominance require explicit valuation or a disaggregated trade-off, not treasury revenue counted as welfare.

**A paired asset is use-dependent, not automatically required or free.** Paying consenting vendors in FACY may be possible without a second asset under an explicit acceptance/value model; that does not prove external purchasing power or useful work. Cross-asset payouts, a two-sided liquidity pool or buying/supporting FACY against another asset require funded outside balances/counterparties, price/execution/slippage/liquidity/risk rules and custody liabilities. FACY alone cannot buy itself into guaranteed external demand or a price floor. If proposing ATMO/other backing, bind and report it as a separate conditional economic scenario, never silently adopt it or claim treasury solves D53.

## Registration and deliverables

These are additional assumptions, not new results. M1 includes the PURCHASE/s variants and eighth threat; M2 compares safeguarded cost/flexibility/net benefit, M3 includes the actual purchasing-power/paired-asset condition, M4 includes governance bootstrap/shortage, M5 ranks signal/governance/vendor/backing uncertainty, M6 evaluates safeguard/controller marginal effect with equivalence/power, and M7 retains governance/signal frontier traces. The reality contract names observable electorate/control/measurement/custody/service/backing conditions and unmeasurable assumptions.

Freeze purchase/split/electorate/safeguard/controller/use/asset contracts, contrast assignment, ranges, cost/value estimands and correction/precision/search/boundary policy in a real committed v2 registration before data. Added axes do not evade native fixed-context/claim limits or authorize a new sweep. No governance/PURCHASE engine, capture-cost estimate, beneficial treasury claim, empirical oscillation or map label exists yet.
