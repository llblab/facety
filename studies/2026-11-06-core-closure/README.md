# Core closure programme (K1-K5, D155)

**Evidence level: diagnostic, with one reserved-seed confirmation (K5).** Criteria and budgets were written in [BACKLOG](../../BACKLOG.md#core-closure-programme-opened-2026-11-06-finite) before the runs; the adversary of K5 was frozen and committed before the confirmation series. The Rust simulator has no registration tooling, so even the confirmation is a diagnostic result in the sense of [AGENTS](../../AGENTS.md). Tables below are means over the stated seeds; every row is one configuration; detection is on in every run (no no-detection arm exists here).

## Question

Is the mechanics baseline (the rules of the [simulator contract](../../docs/simulator.en.md), baseline axes of the BACKLOG table) a core worth implementing: does the defense hold, at what cost to honest people, and does the honest network recover? The accepted criteria are the D129 lines (dirty-FACY share at most 10%; attackers below one third of accounts and of FACY). No tolerance for damage to honest people is assigned here: the honest network is compared with a paired attack-free control on the same seeds (`--attackers 0`, identical prefix), and the 0.9 line used for recovery is a reporting line from the BACKLOG programme, not an owner tolerance.

## Setup

Simulator commit family of this page: the closure instrumentation (`--accuse`, `--accuse-hubs`, `--odd-share`, `--odd-mult`, `--shock-day`, `--shock-days`, `--shock-fpr-x`, absolute counters `emissionHonest`, `emissionAttackers`, `attackerHeld`). The default behavior is unchanged by them (seed 1, 10 operators, one year: 10,131 honest accounts, 16 genuine and 1 false account invalidated, before and after). Exploratory seeds `grown-1..6`; reserved seeds `grown-1001..1012`. Horizon one year after the 1000-account snapshot unless stated.

## K1 — the metrics measure the claim

Baseline, one year, 6 seeds. "Emission" is the units minted by Self-IDs of attacker-side accounts, cumulative whatever happens to the accounts later; "held" is the value (liquid plus unspent rights) of attacker-side accounts at the end, in units; the honest ratio is paired with the control seed by seed.

| Operators | Honest accounts | Honest / control | Attacker-side accounts | Share of accounts | Dirty-FACY share | Emission per operator | Held per operator | Cases on genuine people | Genuine invalidated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 (control) | 10,382 | 1.000 | 0 | 0 | 0 | - | - | 2,926 | 16.3 |
| 10 | 10,394 | 1.002 | 9.7 | 0.093% | 0.088% | 253 | 132 | 3,012 | 16.7 |
| 30 | 10,158 | 0.979 | 29.3 | 0.288% | 0.325% | 280 | 156 | 2,873 | 16.2 |
| 100 | 10,258 | 0.988 | 98.2 | 0.949% | 1.063% | 282 | 151 | 2,804 | 15.5 |

Success criterion met: attacker-side accounts never exceed the operators (no identity multiplication), and an operator mints and holds what a participant does (one Self-ID a day against 0.9 for an honest account), so the low shares are not a denominator effect: the absolute attacker holding grows linearly with the operators and the honest network is not smaller than the control beyond seed spread. The cases on genuine people (about 2,900 a year, each a seven-day dispute hold on two parties) are the dominant honest cost and do not depend on the number of operators.

## K2 — hidden assumptions of the defense

30 operators, one year, 6 seeds, one factor at a time (honest / control is against the attack-free control of the baseline environment).

| Run | Honest accounts | Honest / control | Attacker share | Dirty-FACY share | Cases on genuine | Genuine invalidated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | 10,158 | 0.979 | 0.29% | 0.33% | 2,873 | 16 |
| odd profiles 5% with 10 times the false-positive rate (correlated examiner errors) | 9,473 | 0.913 | 0.31% | 0.40% | 3,574 | 19 |
| same, 30 times | 7,376 | 0.710 | 0.40% | 0.51% | 4,410 | 22 |
| odd profiles 20%, 5 times | 7,851 | 0.756 | 0.37% | 0.47% | 4,158 | 21 |
| proof of reality succeeds with 0.7 | 10,281 | 0.990 | 0.29% | 0.32% | 2,833 | 87 |
| proof succeeds with 0.5 | 10,135 | 0.977 | 0.29% | 0.35% | 2,751 | 138 |
| proof takes 14 days | 8,582 | 0.827 | 0.34% | 0.46% | 2,379 | 14 |
| proof takes 28 days | 5,798 | 0.558 | 0.52% | 0.67% | 1,848 | 11 |
| proof 0.5 and 28 days | 7,284 | 0.702 | 0.41% | 0.55% | 2,084 | 106 |
| inspection 0.01 per partner and day (less attention) | 11,139 | 1.073 | 0.26% | 0.25% | 1,147 | 6 |
| inspection 0.003 | 13,663 | 1.315 | 0.22% | 0.22% | 450 | 3 |
| proof 28 days, softer D131 (`--targets-only`, Q20) | 14,492 | 1.398 | 0.21% | 0.29% | 3,419 | 19 |
| proof 28 days, one independent confirming look (`--confirm 1 --confirm-public`, Q20) | 37,346 | 3.591 | 0.09% | 0.21% | 17 | 0 |

Reading: the D129 lines hold in every row (dirty-FACY share at most 0.67%); the containment does not depend on any of the three assumptions. The honest network does: the time an accused person needs to prove reality is the most sensitive assumption (a four-week window leaves 56% of the control), correlated examiner errors come second (71% at the strongest setting), and the success probability of the proof moves the number of wrongly invalidated people (16 to 138) but hardly the network, because an unsuccessful case ends at the ordinary seven-day window. Less attention improves the honest network at the same containment: inspection is itself a cost through false cases. The two Q20 variants undo the damage of a slow proof, which shows that the sensitivity comes from the dispute holds and the exclusion of disputed accounts from paths (D131), not from the detection of attackers.

## K3 — false accusations as an attack on the availability of the defense

30 operators file false formal cases through the ordinary procedure (the public XP gate applies: an accuser needs more XP than the accused; the accuser stakes nothing, the worst case), 6 seeds.

| Cases per operator and day, target choice | Accusations opened | Honest accounts | Honest / control | Genuine invalidated | Emission per operator |
| --- | ---: | ---: | ---: | ---: | ---: |
| none | 0 | 10,158 | 0.979 | 16 | 280 |
| 0.3, random | 3,197 | 10,232 | 0.985 | 30 | 29 |
| 1, random | 10,638 | 10,697 | 1.031 | 65 | 2 |
| 3, random | 31,131 | 10,884 | 1.049 | 158 | 5 |
| 0.3, best-connected of 64 sampled | 3,200 | 10,521 | 1.014 | 30 | 30 |
| 1, best-connected | 9,371 | 10,522 | 1.014 | 59 | 2 |
| 3, best-connected | 27,654 | 10,830 | 1.043 | 145 | 3 |

Reading: the honest network is not starved. Accusers can only target accounts with less XP than themselves, which excludes the connected, high-XP intermediaries the paths need, and an accuser is held by its own case (D77), so its emission falls from 280 to a few units a year. The harm that remains is linear in the number of false cases: about 0.5% of them end with a wrongly invalidated person (the verdict error times the failure of the proof), 158 people a year in the heaviest row. The accuser pays only the loss of its own activity; whether an accusation should cost a stake is a normative question (Q21), not a result.

## K4 — recovery after a burst of errors

30 operators, a thirty-day burst starting 100 days after the snapshot with the false-positive rate multiplied, 6 seeds, trajectories paired with the control seed by seed.

| Burst | Appeal and fee-free restoration | Lowest honest / control | Days from the end of the burst to 90% of the control (6 seeds) | Final honest / control |
| --- | --- | ---: | --- | ---: |
| ten times | no | 0.69 | 67, 170, 106, 60, not reached, 119 | 0.97 |
| ten times | appeal 0.5, restoration | 0.68 | 55, 69, 102, 53, 127, 123 | 0.97 |
| thirty times | no | 0.67 | 104, 47, 40, 119, 149, 95 | 0.98 |

Reading: the honest network recovers without any extra mechanism (five of six seeds return to 90% of the control within the year in the first row, all six in the others); the trough is about 0.7, reached about two weeks after the burst ends, and recovery to 90% takes 40 to 170 days (typically about three months). The effect of appeal and restoration on the speed is inside the seed spread: insufficient to call them required for recovery.

Figure of one run (seed 1, ten-times burst between days 100 and 130 after the snapshot; honest accounts, attacker share, dirty-FACY share by day; dashed lines mark the phases): [shock-x10-30-operators-seed1.svg](figures/shock-x10-30-operators-seed1.svg). The honest count stops growing for the whole burst (consistent with the dispute holds on intermediaries, which is not isolated here) and grows faster afterwards; the attacker share keeps falling because only the denominator moves, which is why the absolute counters of K1 are reported next to the shares. Plots of any run: `facety-sim grown ... --svg DIR`.

## K5 — break attempts and reserved-seed confirmation

Exploratory (100 operators, seeds 1-4, one year): X1 supported-first, patience 120 days, 20% bought honest accounts; X2 honest-first, patience 120, cash-out 0.5, 20% bought; X3 cone with 30% bought; X4 best-connected false accusations 1 per operator and day with 20% bought and patience 120; X5 = X1 in a weakened environment (odd profiles 5% with ten times the rate, proof 0.7 within 14 days); reference without extras.

| Run | Honest accounts | Attacker-side accounts | Attacker share | Dirty-FACY share |
| --- | ---: | ---: | ---: | ---: |
| reference | 10,266 | 99.0 | 0.96% | 1.05% |
| X1 | 11,280 | 99.2 | 0.87% | 1.58% |
| X2 | 12,380 | 98.8 | 0.80% | 1.38% |
| X3 | 13,892 | 199.0 | 1.48% | 1.00% |
| X4 | 11,094 | 99.0 | 0.89% | 0.01% |
| X5 | 11,850 | 98.2 | 0.84% | 1.58% |

Frozen by the rule written beforehand: X1. Confirmation on the reserved seeds `grown-1001..1012` (100 operators; criterion per seed: dirty-FACY share at most 10% and attackers below one third of accounts and of FACY):

| Run | Finished seeds | Seeds passing | Dirty-FACY share (mean, max) | Attacker share of accounts (mean, max) | Honest accounts | Attacker-side accounts | Emission per operator | Held per operator | Genuine invalidated |
| --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| reference, one year | 12 | 12 | 1.08%, 1.49% | 0.93%, 0.97% | 10,390 | 97.0 | 285 | 155 | 12.6 |
| X1, one year | 12 | 12 | 1.57%, 1.66% | 0.88%, 0.93% | 10,987 | 97.7 | 354 | 257 | 10.1 |
| X1, two years | 12 | 12 | 1.47%, 1.54% | 0.85%, 0.89% | 11,378 | 97.4 | 708 | 609 | 46.8 (two years) |

All 36 reserved-seed runs finished and passed both lines; none was censored. The two-year run needs about four times the memory of the one-year run (twelve seeds in parallel exhausted 62 GB and were rerun four at a time). The value held per operator grows with time (609 after two years against 257 after one) while the share stays near 1.5%: the held value is the operators' own unspent rights, not a multiplier.

## Honest behavior regimes (backlog item, diagnostic)

One year, 4 seeds, paired with an attack-free control in each regime. Regimes: sparse (befriend 0.02 and invite 0.005 instead of 0.05 and 0.01), dense (0.1 and 0.02), friendly (stranger acceptance 0.2, half of the accounts careless at 0.8) and averse (stranger acceptance 0.01, no careless accounts).

| Regime | Operators | Honest accounts | Honest / control | Attacker share | Dirty-FACY share | Attacker-side accounts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| sparse | 0 | 7,470 | 1.000 | 0 | 0 | 0 |
| sparse | 30 | 6,860 | 0.921 | 0.43% | 0.68% | 29.2 |
| sparse | 100 | 6,814 | 0.915 | 1.43% | 2.33% | 98.0 |
| dense | 0 | 10,689 | 1.000 | 0 | 0 | 0 |
| dense | 30 | 10,571 | 0.991 | 0.28% | 0.28% | 29.8 |
| dense | 100 | 10,476 | 0.981 | 0.92% | 0.96% | 96.8 |
| friendly | 0 | 10,442 | 1.000 | 0 | 0 | 0 |
| friendly | 30 | 10,420 | 0.998 | 0.29% | 0.35% | 30.0 |
| friendly | 100 | 10,366 | 0.993 | 0.95% | 1.31% | 99.5 |
| averse | 0 | 10,349 | 1.000 | 0 | 0 | 0 |
| averse | 30 | 10,530 | 1.018 | 0.28% | 0.37% | 29.8 |
| averse | 100 | 10,531 | 1.018 | 0.93% | 1.22% | 99.0 |

Reading: the D129 lines hold in every regime (dirty-FACY share at most 2.33%) and attacker-side accounts never exceed the operators. Sparse connectivity is the weakest regime: the honest network is a third smaller (about 7,000 accounts) and operators hold a larger share of it (1.4% of accounts, 2.3% of FACY with 100 operators), and the network is 8% below its control. The model already has friend-of-friend closure and invitation trees; calibrated human behavior stays blocked on data about people.

## Key loss and social recovery (D135 scenario, diagnostic)

Honest accounts lose their private key with a yearly probability; the person (same identity, not an attacker) is recovered by a new account that one previous guarantor invites after a delay of 3 days, vouched for by previous guarantors (each opens a guarantee toward the new account with the stated daily probability; the new account always accepts them) until at least half of them and at least D guarantee it. 30 operators, one year, 4 seeds; recovery counts are means per run. "Capturable" counts lost accounts for which bought honest accounts (the declared corrupt share) would be at least half of the previous guarantors and at least D, i.e. accounts a coalition could take over through recovery.

| Run | Keys lost | Invited | Recovered | Recovered per key lost | Mean days to recover | Capturable | Honest / no-loss control | Dirty-FACY share |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| no loss | 0 | - | - | - | - | - | 1.000 | 0.34% |
| 5% a year | 360 | - | 136 | 38% | 29 | 0 | 1.042 | 0.34% |
| 20% a year | 1,476 | 1,233 | 647 | 44% | 28 | 0 | 1.033 | 0.35% |
| 20%, vouching 0.1 a day | 1,390 | - | 584 | 42% | 30 | 0 | 0.981 | 0.38% |
| 20%, 14-day delay | 1,488 | - | 590 | 40% | 42 | 0 | 1.098 | 0.35% |
| 20% with 20% bought accounts | 1,637 | - | 805 | 49% | 32 | 7.8 | 1.211 | 0.28% |
| 50% a year | 3,890 | - | 1,766 | 45% | 26 | 0 | 0.962 | 0.48% |
| 50% with 30% bought accounts | 4,768 | - | 2,126 | 45% | 31 | 195.8 | 1.257 | 0.31% |

Funnel of one run at 20% (seed 1): 1,502 keys lost, 1,233 recovery invitations, 1,170 new accounts admitted, 644 recoveries completed (55% of those started). A second seed: 1,396, 826, 792, 508 (64%). Two diagnostic reruns at 20%: a slot ceiling of 300 gives 59% of the started recoveries and vouching with certainty 61%, so neither the ceiling nor the willingness of guarantors is the bottleneck. A plausible cause is that the new account pays one right per guarantee (D93, D94) and emits one right a day, but it is not isolated here. Reading: recovery works as a mechanism (about two thirds of the recoveries that start finish, in about a month) and does not touch the D129 lines, yet fewer than half of the lost accounts are recovered within a year, and the lost accounts that are not recovered stay accepted and inert, which inflates the honest account count of these runs (the honest-to-control ratios above 1 are therefore not a gain, and their cause is not isolated). With 20%-30% bought accounts a fraction of lost accounts (0.5% to 4%) could be captured by a coalition through recovery; capture is counted, not executed.

## Limits

- Synthetic behavior throughout: honest acceptance rates, careless share, examiner quality, the proof-of-reality model and the bought-account model are assumptions of the simulator contract. Nothing here is evidence about real people, and no run replaces such evidence.
- The attacker never pays for anything: a bought account costs nothing, a false accusation costs only the accuser's own lockout, operators are free. Profitability is not assessed (the incentive sweeps of the grown-network study are the only economic analysis, and they sweep valuations).
- The confirming looks of Q20 assume independent and instantaneous examiners; the correlated-error row of K2 shows how fast independence matters.
- The 80% bought-share run and the combination of 50% bought accounts with the Q20 variants did not finish within the time cap; they are not claimed.
- Honest growth under the baseline ends near 10,000 accounts (the Council rule and the false-case load together, see the [consolidated findings](../../docs/insights.en.md#consolidated-findings)); all numbers above are for that regime.
- A single operator-driven model of strategy; the cone does not form under layered support, so these results say nothing about a network without layered support (there the cone takes 29%-32% of accounts, see the grown-network study).
