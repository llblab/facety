# Maturity XP and the dispute ladder: baseline convergence (D162, D163)

Question: what do the two owner clarifications of 2026-11-07 (Self-ID XP at 24-hour maturity, D163; overlapping monotonic dispute deadlines, D162) and the now-implemented Chekharda economics (D158, D159, D161) do to honest growth, Council stability, dispute duration and Sybil containment? All numbers are diagnostic unless a section says otherwise. Evidence level: exploratory, except the registered block below. Simulator rules and assumptions: [simulator contract](../../docs/simulator.en.md); assumptions awaiting the owner: [Q23](../../DECISIONS_NEEDED.md).

## Builds compared

| Name | What it is | Reproduce |
| --- | --- | --- |
| spend-credit | The previous baseline: XP credited when the source right is spent, fixed seven-day abstract disputes (commit `2badb30`, tag `baseline-spend-credit-d156`) | build the tag |
| maturity | D163 only: XP at maturity, abstract disputes unchanged (commit `9aa9d4a`) | build the commit |
| ladder | The converged baseline: maturity XP plus the staked ladder with overlapping deadlines (this commit) | `facety-sim grown ...` |

## Exploratory paired panel (seeds `grown-1..4`, 365 days after the 1000-account snapshot, detection on)

Mean over four seeds; "control" is `--attackers 0` on the same seeds. The prefix (growth to 1000 honest accounts) already differs between spend-credit and maturity because XP ranks the Council.

| Run | Build | Honest accounts | Attacker share of accounts | Dirty-FACY share | Cases on genuine people | Genuine invalidated |
| --- | --- | --- | --- | --- | --- | --- |
| control | spend-credit | 33,610 | 0 | 0 | 4,185 | 22.8 |
| control | maturity | 38,970 | 0 | 0 | 4,317 | 23.0 |
| control | ladder | 12,560 | 0 | 0 | 2,632 | 70.8 |
| 30 operators | spend-credit | 31,890 | 0.09% | 0.18% | 3,914 | 21.0 |
| 30 operators | maturity | 34,580 | 0.09% | 0.17% | 4,225 | 22.8 |
| 30 operators | ladder | 12,450 | 0.24% | 0.23% | 2,641 | 62.8 |
| 100 operators | spend-credit | 35,280 | 0.30% | 0.62% | 3,980 | 21.8 |
| 100 operators | maturity | 36,220 | 0.29% | 0.55% | 4,144 | 22.5 |
| 100 operators | ladder | 12,250 | 0.82% | 1.35% (max 1.89%) | 2,554 | 63.0 |

Reading (exploratory): maturity XP alone moves nothing that matters for containment (honest growth within seed noise: per-seed spread 31K to 50K), the D129 lines hold in every run, and the ladder costs honest growth about two thirds in the one-year control. The attacker share rises in relative terms only because the denominator shrinks.

## Attribution of the honest-growth loss (exploratory, attack-free control, seeds `grown-1` and `grown-2`, 365 days)

| Variant | Honest accounts (seed 1, seed 2) |
| --- | --- |
| ladder, all rules | 13,340; 12,250 |
| no stakes (a case is a hold with a deadline) | 13,123; 12,224 |
| no XP halving of losing participants | 44,675; 37,735 |
| neither | 30,571; 21,817 |
| nobody joins a dispute (no entries, no Council) | 12,138; 11,903 |

The loss follows the XP halving of losing participants, not the stakes and not the joining behavior. Mechanism probes (one seed, 420 days): sparing current Council members from halving gives 26,538 honest accounts (full ladder 12,789; no halving 27,058) with Council turnover 99 (full 233); one confirming look before a case opens (`--confirm 1`) gives 60,401 accounts with 25 cases a year. Reading: Council members hold the XP to challenge anyone, so they open the most cases; the baseline examiners' false positives (0.3% per look) make them frequent losers; each loss halves their XP and removes them from the XP-ranked Council; the churn breaks the paths to the seats and growth stalls near the point where D flips from 4 to 5. This is a hypothesis with a discriminating test, registered below.

## Registered confirmation (written before the runs; reserved seeds `grown-3001..3004`, never used)

Claims are conditional on the declared joining assumptions (`join_rate` 0.1, `council_rate` 0.5, `council_turnout` 0.7, supporters correct with probability 0.9), the honest and detection baselines of the BACKLOG axis table, the 1000-account snapshot and 365 days after it. Control means `--attackers 0`.

| Id | Claim | Presence | Necessity (ablation) | Named alternatives | Kill criterion |
| --- | --- | --- | --- | --- | --- |
| H1 | The honest-growth loss of the ladder baseline is caused by the XP halving of losing participants | honest accounts of the full ladder control are below 50% of the maturity-baseline control on every seed | `--no-halving` returns at least 2 times the honest accounts of the full ladder on every seed | stake custody and funding, joining behavior, longer holds | any seed with a ratio below 1.5 |
| H2 | The channel is Council churn | `--halving-spares-council` returns at least 75% of the `--no-halving` honest accounts on every seed, with fewer Council seats changing hands than the full ladder | the full ladder has more turnover than the sparing variant on every seed | halving of non-Council examiners lowering the case gate | any seed below 50%, or turnover not lower |
| H3 | Verification before a case opens (`--confirm 1`, an unselected lever) removes the loss while halving stays | `--confirm 1` returns at least 90% of the `--no-halving` honest accounts on every seed | the full ladder is the ablation | fewer cases simply holding fewer people | any seed below 60% |
| H4 | The D129 lines hold under the full ladder against the frozen strongest adversary of the closure programme (100 operators, supported-first, patience 120 days, 20% bought honest accounts, odd-profile examiners 5% at ten times the false-positive rate, proof of reality 0.7 within 14 days) | on every seed the dirty-FACY share is at most 10% and attackers are below one third of accounts and of FACY | not applicable (a containment check) | none | any seed that breaches either line |

The maturity-baseline control for H1 is the build of commit `9aa9d4a` run on the same reserved seeds.

## Results of the registered confirmation (seeds `grown-3001..3004`, 365 days, attack-free control, honest accounts)

| Seed | maturity build | full ladder | no halving | halving spares Council | `--confirm 1` | Council seats changing hands: full, spares, no halving |
| --- | --- | --- | --- | --- | --- | --- |
| 3001 | 41,211 | 12,635 | 38,750 | 23,932 | 57,398 | 306, 86, 107 |
| 3002 | 31,537 | 12,804 | 34,262 | 20,262 | 48,565 | 334, 80, 114 |
| 3003 | 32,559 | 12,839 | 39,433 | 21,372 | 50,171 | 318, 88, 113 |
| 3004 | 47,233 | 12,382 | 49,531 | 21,224 | 56,110 | 310, 94, 120 |

| Id | Registered criterion | Observed | Outcome |
| --- | --- | --- | --- |
| H1 | full below 50% of the maturity control on every seed; no-halving at least 2 times the full ladder on every seed; kill below 1.5 | 0.26 to 0.41 of the maturity control; no-halving 2.68 to 4.00 times the full ladder | **survives** (4 of 4) |
| H2 | sparing Council members returns at least 75% of the no-halving count on every seed with fewer Council changes; kill: any seed below 50% or no turnover drop | 0.62, 0.59, 0.54, 0.43 of the no-halving count; turnover down by two thirds on every seed | **killed as registered** (seed 3004 at 0.43): Council churn is a channel, not the whole explanation; it recovers about half of the loss on three seeds |
| H3 | `--confirm 1` returns at least 90% of the no-halving count on every seed; kill below 60% | 1.48, 1.42, 1.27, 1.13 times the no-halving count (about 25 cases a year instead of 2,700) | **survives** (4 of 4) |
| H4 | the frozen strongest adversary (100 operators, supported-first, patience 120, 20% bought accounts, odd-profile examiners, proof of reality 0.7 within 14 days) keeps the dirty-FACY share at most 10% and attackers below one third on every seed | dirty-FACY share 0.81% to 0.89%, attackers 0.19% to 0.21% of accounts, honest accounts 44,533 to 50,507 | **survives** (4 of 4); the honest count is higher than in the control because the 20% bought accounts take no part in detection and so file no false cases |

The remaining 40% to 60% of the loss that sparing the Council does not recover is unexplained (hypotheses, not tested: examiners of every rank lose the XP that opens the next case, and invalidation cascades follow every lost case that the accused cannot prove). Everything above is conditional on the declared joining assumptions; the claim "the loss is caused by halving" does not depend on them (the ablation with nobody joining gives the same count).

## What the ladder does to disputes (full ladder, attack-free control, seeds 3001..3004, one year)

Per honest account-year (population-time normalized): about 6 account-days of D77 restriction (1.7% of days), 3.8 to 4.6 FACY of lost stakes and charges (about 1% of the 365 units a participant mints a year), 4.0 to 5.1 million XP halved in total. The control has no fakes, so nearly every case is a false positive: the accuser lost 2,568 of 2,656 settled cases in seed 3001, which is the cost of examining people with a noisy look while the accuser stakes 7 FACY and half of its XP.

- Depth of settled cases (seed 3001): 1,390 lone accusations, 736 with two positions, 275 with three, 251 with four, 2 with five and 2 with six. Mean duration 7.9 days (maximum depth 6); 1,147 positions extended a deadline; the Council entered 522 times.
- Funds were almost never the binding limit (3 to 7 refused first stakes a year in the control): honest accounts convert surplus rights to liquid FACY.
- A guarantor of an accused person who loses is charged 7 FACY (D159); accounts have up to 100 mutual guarantors (the average Council member has 70 to 90), so 88 wrongful invalidations burned 17,641 FACY of honest guarantors in seed 3001, 93,421 FACY in the 100-operator adversary run. This is the rule as selected; its size follows from guarantor counts, not from the stake.
- Under the strongest adversary the mean duration is 12.2 days (attackers enter on the last day before every deadline), attackers are restricted for about 11,000 account-days a year and their losses of stake are zero in that arm (fakes never form, so the accounts they defend are operators).

## How long can an adversary hold an accused person? (closed form, checked against the engine)

[`prolongation.py`](prolongation.py) and the engine test `last_hour_entries_prolong_a_dispute_by_each_window_minus_an_hour` agree. An adversary that owns a chain of eligible accounts (strictly increasing XP, enough liquid FACY) and enters in the last hour before each deadline extends the dispute by each window minus one hour. Without the Council: 3 entries 21.9 days, 6 entries 30.7 days, 10 entries 42.6, 20 entries 72.2 days, with a last stake of 269 FACY and 1,587 FACY locked in all positions. The three-day floor is therefore not a three-day maximum. What constrains it: the XP chain (each entrant must out-rank the last participant; a losing account loses half its XP), the compound stake, and the terminal Council entry. With a Council member looking at a contested dispute with probability q per day, the mean duration with 20 eligible adversary accounts is 22.0 days at q = 0.1, 14.0 at 0.3 and 13.1 at 0.5 (95th percentile 49.5, 17.9, 13.0 days). If both sides belong to the adversary the stakes mostly circulate inside it, so the stake bound is a liquidity requirement, not a cost. The unconstrained quantity is Council attention, which the simulator treats as a declared assumption (Q23.6).

## False accusations under stakes (exploratory, 30 operators accusing once per operator and day, seeds `grown-1..4`, one year)

| Variant | Accusations that opened a case | Refused for lack of funds | Honest accounts | Genuine invalidated |
| --- | --- | --- | --- | --- |
| stakes on, operators hold no liquid FACY | 0 | 10,640 | 12,450 | 62.8 |
| stakes on, operators convert every emission to liquid FACY | 403 | 10,230 | 12,390 | 71.8 |
| stakes on, funded operators, no halving | 620 | 10,840 | 38,950 | 86.8 |
| no stakes (the earlier abstraction) | 10,430 | 0 | 12,970 | 355.5 |

The stake makes the false-accusation attack self-limiting: an operator can afford about one case a week and loses 7 FACY and half its XP when the accused proves reality (attackers lost 2,753 FACY a year in the funded arm). The XP gate and the held accuser limited it before, but only the stake turns the attack into a cost. Honest damage is bounded by that rate (about 70 wrongly invalidated people a year, the same as the control).

## Assessment of core readiness (diagnostic; model properties against real-world assumptions)

Tested model properties: (1) XP at maturity is a deterministic function of valid Self-ID history, snapshots and chronological adjustments, equal to an independent chronological reference under random event orders, with the retroactive-XP exploit blocked for invitations and valences; (2) the dispute deadline never shortens and equals the maximum window end, with deterministic refusals and same-hour ordering, and the stake ledger conserves FACY under custody, forfeits, burns, sanctions and debt (audit after every run); (3) the strongest adversary of the closure programme stays inside both D129 lines on 4 of 4 reserved seeds under the full ladder (the earlier confirmation of 12 seeds used the earlier rules); (4) the stake bounds false accusations by operator emission.

What is not established: whether honest examiners behave as modeled (they file on noisy looks and ignore the stake and XP cost); who joins disputes and how fast (Q23.6); the Council's real attention (the prolongation bound is conditional on it); independence of examiners' errors; the price of buying honest links; any real-world measurement. **The selected rules as modeled have a cost the owner has not yet seen:** with the baseline examiners, the XP halving of losing participants removes the high-XP Council members that open the most cases, and honest growth falls to about a third; verification before a case (`--confirm 1`, unselected) removes the effect in the model. This needs an owner decision (Q24) before the ladder can be called a settled part of the core.
