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

## Hoarding matured entitlements versus withdrawing them (diagnostic, attack-free, seed `grown-1`, 90 days)

`--keep-rights N` sets how many matured entitlements an honest account keeps on the Emitter account before converting the rest to liquid FACY (default 2). With N = 1000 nobody withdraws: XP is still earned at maturity (the maximum XP is 8,099 against 7,632 with N = 2; the median is lower only because the network is far younger and larger), but no account holds liquid FACY, so the first stake is refused 620 times and **no dispute ever opens**: with the declared backing (stakes are custody of liquid FACY only, Q23.4) a population that leaves its FACY on the Emitter account is a population without detection, and its honest network grows about ten times larger in the period because no false positive occurs. This is a consequence of the backing assumption, not of the protocol text, which leaves the backing open; it is the reason for Q23.4 to ask whether a matured entitlement on the Emitter account may back a stake.

## Recovery after a burst of false positives under the ladder (exploratory, attack-free, seeds `grown-1..4`)

A thirty-day burst with ten times the false-positive rate starting 100 days after the snapshot (the K4 scenario of the closure programme, now with the full ladder), against the paired control without a burst:

| Seed | Trough (share of the control) | Days after the burst ends at the trough | Days after the burst ends until 90% of the control | Honest accounts at the end against the control |
| --- | --- | --- | --- | --- |
| 1 | 0.45 | 74 | 222 | 0.91 |
| 2 | 0.66 | 49 | 84 | 0.96 |
| 3 | 0.53 | 43 | 114 | 0.93 |
| 4 | 0.72 | 28 | 77 | 1.12 |

The honest network returns to 90% of its control on 4 of 4 seeds within the year, but deeper and slower than before the ladder (the closure programme measured a trough of 0.69 and a return after 40 to 170 days under the abstract disputes). With one confirming look before a case opens (`--confirm 1`, unselected) the burst has no visible effect: the network stays at 0.98 or more of its own no-burst path. A burst of examiners' errors therefore costs honest people through the halving channel above, not through the burst itself; recovery needs no extra mechanism in the model but takes up to seven months at the worst seed.

## Stress panel under the ladder (exploratory, 30 operators, seeds `grown-1..4`, one year)

Joining assumptions, the K2 weakenings, cash-out, key loss and bought accounts, each varied alone from the baseline (the cone strategy, 30 operators). Honest cost is per honest account-year (population-time normalized). All runs pass both D129 lines (attacker share at most 0.31%, dirty-FACY share at most 0.29%).

| Variant | Honest accounts | Cases settled | Mean case days | Deepest ladder | Genuine / false invalidated | Honest restriction days | Honest FACY lost | Council seats changing hands |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 12,447 | 2,561 | 7.9 | 6 | 63 / 20 | 6.2 | 3.9 | 322 |
| nobody joins (`--join-rate 0 --council-rate 0`) | 12,143 | 2,527 | 7.0 | 1 | 128 / 28 | 4.2 | 5.0 | 310 |
| join rate 0.5 per day | 12,079 | 2,504 | 7.8 | 8 | 56 / 18 | 6.9 | 4.4 | 350 |
| Council attention 0.1 per day | 12,790 | 2,565 | 7.9 | 6 | 74 / 24 | 5.9 | 4.3 | 325 |
| proof of reality 0.7 within 14 days (`--defense 0.7 --defense-days 14`) | 12,511 | 2,259 | 12.0 | 6 | 398 / 20 | 8.2 | 9.9 | 240 |
| odd-profile examiners 5% at ten times (`--odd-share 0.05 --odd-mult 10`) | 12,505 | 3,428 | 7.9 | 6 | 95 / 16 | 8.3 | 5.6 | 366 |
| operators cash out half of their emissions (`--cash-out 0.5`) | 12,617 | 2,535 | 8.0 | 6 | 71 / 18 | 6.2 | 4.1 | 325 |
| key loss 20% a year (`--key-loss 0.2`) | 13,409 | 1,912 | 8.1 | 6 | 51 / 21 | 4.6 | 2.5 | 248 |
| 20% bought honest accounts (`--corrupt 0.2`) | 45,586 | 2,997 | 7.8 | 7 | 59 / 806 | 3.3 | 1.7 | 52 |

Second part of the panel (same seeds and horizon; honest regimes as in the closure programme: sparse `--befriend 0.02 --invite 0.005`, dense `--befriend 0.1 --invite 0.02`; Council attention 1.0 per day), each with its paired attack-free control where it is a regime:

| Variant | Honest accounts (control, 30 operators) | Attacker share max | Dirty-FACY share max | Cases settled | Mean case days | Deepest ladder | Genuine invalidated | Council seats changing hands |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sparse honest regime | 10,183; 9,645 | 0.34% | 0.59% | 928 | 7.9 | 6 | 26 | 203 |
| dense honest regime | 14,606; 14,840 | 0.22% | 0.02% | 4,080 | 7.9 | 6 | 104 | 400 |
| Council attention 1.0 per day | 12,152; 12,094 | 0.26% | 0.26% | 2,500 | 8.0 | 6 | 73 | 314 |

Both D129 lines hold in all three; the honest network is 0.95 to 1.02 of its paired control; Council attention up to its maximum changes neither duration nor growth, because the Council only enters contested disputes and the entry is terminal.

Reading (exploratory): the baseline numbers move little with the joining assumptions (honest accounts 12.1 to 12.8 thousand), so the headline growth loss is not an artifact of them; a slower proof of reality is the largest single cost to honest people (genuine invalidations 63 to 398, FACY lost per honest account-year 3.9 to 9.9, case duration 12 days), as in the closure programme; operators that cash out lose 936 FACY of stake on average and 125 of debt, and still never reach 0.3% of accounts. Bought accounts file no false cases, so the honest network grows to 45.6 thousand while 806 fakes are invalidated (the weak spot of the model: it treats corrupt examiners as absent, it does not model them filing attacks). Corrupt examiners that file attacks instead of abstaining are not modeled (no selected rule or declared behavior exists for them).

## Authority and chronology (exploratory, attack-free control, seeds `grown-1..4`, day 364)

| Build | XP median | XP 90th percentile | XP maximum |
| --- | --- | --- | --- |
| spend-credit | 236 | 2,134 | 17,931 |
| maturity | 225 | 2,058 | 17,756 |
| ladder | 219 | 1,862 | 9,413 |

XP at maturity leaves the distribution almost unchanged, because honest accounts convert surplus rights quickly; hoarding does not lower XP any more (tested at the unit level and by `--keep-rights`). The ladder halves the top of the distribution (the maximum falls from 17.8 thousand to 9.4 thousand) and triples Council turnover (310 to 334 seats a year against 107 to 120 without halving), so formal authority becomes less stable than the early-participant advantage that XP accumulation gives under the other builds. Challenge eligibility (more XP than the accused) is the gate that lets Council members open the most cases, which is the link to Q24.

## Reproduction

Builds: `baseline-spend-credit-d156` (tag), `9aa9d4a` (maturity), this repository's `main` (ladder). The seed family, one-year horizon and flags of every table are in the table headings; the invocation is `facety-sim grown --seeds 4 [--first-seed 3001] --attackers N --horizon 365 --threads 4 --out DIR` plus the listed flags (`--no-halving`, `--halving-spares-council`, `--confirm 1`, `--no-stakes`, `--join-rate`, `--council-rate`, `--defense`, `--defense-days`, `--odd-share`, `--odd-mult`, `--cash-out`, `--key-loss`, `--corrupt`, `--accuse`, `--shock-day 100 --shock-days 30 --shock-fpr-x 10`, `--strategy supported-first --patience 120` for the frozen adversary). Saved results record the configuration digest, schema `facety-sim/result-v3` and the build commit.

## Reproducibility and large-run correctness checks

- Former baseline: the tag `baseline-spend-credit-d156` builds on its own and reproduces its documented picture (3 seeds, 10 operators, 60 days: attacker share 0.46%, 0.65%, 0.63%, inside the 0.4% to 0.7% range of the contract) with byte-identical result sections on 1 and on 3 threads.
- Converged baseline: two year-long runs (30 operators, seeds `grown-1` and `grown-2`) executed with 1 and with 2 threads give byte-identical result sections (configuration, counters and the daily history), so scheduling does not change outcomes. The world audit (conservation of FACY, custody, holds, freezes, deadlines, XP maturity invariant) runs at the end of every `grown` attack run and after every unit test.
- Not done: a brute-force comparison of the ladder at scale (the ladder has no efficiency layer to compare; its engine is checked exhaustively on small states and against the closed form).

## Owner answer D164 and the examiner model (exploratory, then registered)

The owner answered Q24 (D164): the halving stays for everyone, no verification or second confirmer is added, and the defect is the simulator's examiners, who file on one noisy look although a dispute against a person who can cheaply prove reality is a loss and an exposure for the opener. The model change is a behavior assumption, not a rule: `--examiner-looks K` makes an examiner repeat its own independent look K times and file only if every look is suspicious (K = 1 is the earlier behavior).

Exploratory sweep (seeds `grown-1..4`, one year, full ladder with halving):

| Examiner looks | Control honest accounts | 30 operators: honest accounts | Attacker share max | Dirty-FACY share max | Cases settled (control) | Council seats changing hands |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (earlier) | 12,561 | 12,447 | 0.26% | 0.26% | 2,526 | about 320 |
| 2 | 51,045 | 49,259 | 0.08% | 0.17% | 13 | 37 |
| 3 | 53,560 | 52,764 | 0.07% | 0.22% | 0 | 37 |

With two looks the honest network is about four times larger, the halving applies as selected, formal cases fall to about 13 a year in the control, and operators are still caught (25.8 invalidated attacker-side accounts with 30 operators). A third look adds little. This supports the owner's reading that the loss came from the examiner model.

### Registered confirmation of the proposed default (written before the runs; reserved seeds `grown-4001..4004`)

The proposed baseline axis is `examiner_looks = 2` (builder-proposed like the axes of D143; the owner may overrule). Conditions as in the earlier registration.

| Id | Claim | Criterion | Kill criterion |
| --- | --- | --- | --- |
| R1 | Two looks restore honest growth with the halving on | attack-free control honest accounts with two looks at least 2 times those with one look on every seed | any seed below 1.5 |
| R2 | The D129 lines hold for the frozen strongest adversary (100 operators, supported-first, patience 120, 20% bought, odd-profile examiners 5% at ten times, proof of reality 0.7 within 14 days) with two looks | dirty-FACY share at most 10% and attackers below one third of accounts and of FACY on every seed | any seed breaching either line |
| R3 | Two looks do not make the honest network pay for it elsewhere | genuine invalidated people per year with two looks at most those with one look on every seed | any seed above |

Results (seeds `grown-4001..4004`, one year):

| Seed | Control honest accounts, one look | Control, two looks | Ratio | Genuine invalidated, one / two looks | Frozen adversary with two looks: honest accounts, attacker share, dirty-FACY share |
| --- | --- | --- | --- | --- | --- |
| 4001 | 12,020 | 36,466 | 3.03 | 93 / 0 | 40,390; 0.25%; 1.08% |
| 4002 | 12,109 | 44,666 | 3.69 | 56 / 0 | 38,643; 0.25%; 0.98% |
| 4003 | 12,993 | 49,210 | 3.79 | 75 / 0 | 57,902; 0.17%; 0.77% |
| 4004 | 12,033 | 57,510 | 4.78 | 67 / 0 | 36,963; 0.27%; 1.11% |

R1, R2 and R3 all survive on 4 of 4 seeds (diagnostic in the sense of AGENTS: no mechanism registration tooling exists). `examiner_looks = 2` is now the default; it is a proposed baseline axis, conditional on the assumption that careful examiners repeat an independent look before filing. The earlier findings 20 and 23 describe the model with single-look examiners and stay as the record of that model.

## Integrity coefficient as the default (D165): exploratory and registered confirmation

The owner made the integrity coefficient the default (D165): XP is the live units of responsibility times a coefficient in [0, 1], rounded down; a lost dispute halves the coefficient, each matured own Self-ID adds 1/1000, never above 1. `--no-integrity` is the ablation (the halving of the balance of the first reading of D159).

Exploratory (seeds `grown-1..4`, one year, full ladder): single-look examiners 11,949 honest accounts in the control and 12,478 with 30 operators (the balance halving gave 12,561 and 12,447); two-look examiners 51,045 and 45,689 with the lines held (attacker share at most 0.14%, dirty-FACY share at most 0.17%), about 13 formal cases a year. The slow restoration (1/1000 per own Self-ID, about two years from 0.25 to 1) does not rescue careless examiners, who lose a dispute almost every time they file; it changes nothing for careful ones. The rule's stability therefore also depends on the examiner assumption.

Registered before the runs (reserved seeds `grown-5001..5004`, one year, defaults of the repository, i.e. integrity on and two looks):

| Id | Claim | Criterion | Kill criterion |
| --- | --- | --- | --- |
| I1 | Under the integrity coefficient, careful examiners keep honest growth | attack-free control honest accounts with two looks at least 2 times those with one look on every seed | any seed below 1.5 |
| I2 | The D129 lines hold for the frozen strongest adversary (100 operators, supported-first, patience 120, 20% bought, odd-profile examiners 5% at ten times, proof of reality 0.7 within 14 days) | dirty-FACY share at most 10% and attackers below one third of accounts and of FACY on every seed | any seed breaching either line |
| I3 | A lost dispute is recoverable inside the horizon where the account keeps playing | in the control at least half of the accounts that lost a dispute have a coefficient above their post-loss value at the end | fewer than half on any seed |

Results (seeds `grown-5001..5004`, one year):

| Seed | Control, one look | Control, two looks (default) | Ratio | Frozen adversary: honest accounts, attacker share, dirty-FACY share | Accounts that lost integrity / recovering (one look; two looks; adversary run) |
| --- | --- | --- | --- | --- | --- |
| 5001 | 12,092 | 21,359 | 1.77 | 50,151; 0.20%; 0.92% | 1,477 / 1,238; 4 / 4; 36 / 36 |
| 5002 | 12,363 | 62,540 | 5.06 | 51,509; 0.19%; 0.80% | 1,503 / 1,366; 18 / 17; 50 / 48 |
| 5003 | 12,782 | 59,490 | 4.65 | 42,060; 0.23%; 1.02% | 1,528 / 1,297; 19 / 18; 38 / 36 |
| 5004 | 12,703 | 47,661 | 3.75 | 45,675; 0.21%; 0.95% | 1,472 / 1,344; 9 / 9; 43 / 43 |

I1: the criterion (at least 2 times on every seed) is **not met** on seed 5001 (1.77), and the kill line (1.5) is not crossed, so the registered claim is neither confirmed nor killed: three seeds show 3.8 to 5.1 times, one shows 1.8 times (growth under careful examiners has a wide seed spread, 21 to 63 thousand). I2 **survives** (dirty-FACY share 0.80% to 1.02%, attackers at most 0.23%). I3 **survives**: 84% to 90% of the accounts that lost integrity under single-look examiners have already recovered part of it within the year, and all but one of the few that lost it under careful examiners.

## Assessment of core readiness (diagnostic; model properties against real-world assumptions)

Tested model properties: (1) XP at maturity is a deterministic function of valid Self-ID history, snapshots and chronological adjustments, equal to an independent chronological reference under random event orders, with the retroactive-XP exploit blocked for invitations and valences; (2) the dispute deadline never shortens and equals the maximum window end, with deterministic refusals and same-hour ordering, and the stake ledger conserves FACY under custody, forfeits, burns, sanctions and debt (audit after every run); (3) the strongest adversary of the closure programme stays inside both D129 lines on 4 of 4 reserved seeds under the full ladder (the earlier confirmation of 12 seeds used the earlier rules); (4) the stake bounds false accusations by operator emission.

What is not established: whether honest examiners behave as modeled (they file on noisy looks and ignore the stake and XP cost); who joins disputes and how fast (Q23.6); the Council's real attention (the prolongation bound is conditional on it); independence of examiners' errors; the price of buying honest links; any real-world measurement. **The selected rules as modeled have a cost the owner has not yet seen:** with the baseline examiners, the XP halving of losing participants removes the high-XP Council members that open the most cases, and honest growth falls to about a third; verification before a case (`--confirm 1`, unselected) removes the effect in the model. The owner answered (D164): the halving stays and the fault was the examiner model; with careful examiners (two looks, a registered confirmation on `grown-4001..4004`) the honest network is 3 to 5 times larger under the same rules and the strongest adversary stays at a dirty-FACY share of about 1%. What remains unverified is the examiner behavior itself: how often real examiners file, how independent their looks are and how much a lost dispute costs them in practice.
