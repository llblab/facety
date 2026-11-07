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
