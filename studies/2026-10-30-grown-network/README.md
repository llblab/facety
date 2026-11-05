# Grown network versus operators (D122-D132)

**Evidence level: diagnostic.** Seeds are samples of one scenario family; nothing here is a reserved-seed confirmation. The findings that stand are restated in the [consolidated findings](../../docs/insights.en.md#consolidated-findings); this page keeps the tables behind them. Raw run files of the retired Node simulator are in git history at the tag [`legacy-node`](https://github.com/llblab/facety/tree/legacy-node/studies/2026-10-30-grown-network/runs).

## Question

An honest network grows by its own rules from a 100-account genesis to 1000 accounts, with an 11-seat Council and difficulty D = 4. From that one snapshot, can 1 to 100 cooperating operators take it over, how much of the emission do they capture, and what does the defense cost honest people? The criterion is the dirty-FACY share at most 10% and a clean share of at least two thirds ([D129](../../docs/decisions.en.md)).

## Design

- Simulator: [`simulator/`](../../simulator), runner `grown`; the retired Node runner produced the first tables and fixed the baseline (see the [contract](../../docs/simulator.en.md#baseline-validation-statistical)).
- Rules: guarantor count D plus D internally vertex-disjoint paths to one Council member, each path at most 7 nodes (D123); optional layered support (D124); accounts in a dispute are not path intermediaries (D131). Detection is always on: freeze veto, partner inspection (10% of partners per day), noisy looks (sensitivity 0.8, false-positive 0.01 unless varied), leaving, public evidence with escalation, follow-up, one-step verdicts (accuracy 0.9) with D77 holds.
- Attack: operators enter by ordinary invitation from distinct honest members and build a cone of fakes. Fakes cost nothing beyond protocol FACY. 60 days after the snapshot unless stated.

## Results

**Rule changes after the tables below were measured.** The tables below were measured with the rule set before D131 (paths avoid disputes), D133 (Council of three below 100 active participants, no initial exception), D134 (paths to different Council members) and D136 (cheap proof of reality). The current baseline, 20 seeds, 10 operators, 60 days: 7 nodes leave a mean attacker share of 13.4% of accounts (range 1.6%-30.3%, 0.30% of FACY, 3 genuine accounts invalidated); 7 nodes plus layered support leave 0.6% (0.01% of FACY, 3 genuine invalidated, 1672 honest accounts against 2003). The sharp fall in invalidated genuine accounts (about 57 to 3) is the effect of letting a real person prove reality (D136); the tables below that count invalidated genuine accounts describe the earlier, wrong model of the honest cost.

### Honest cost of the path bound (days to 1000 honest accounts, no attackers)

| Rule | Retired simulator, seed 1 | Rust, mean of 12 seeds |
| --- | ---: | ---: |
| no bound | 134 | 127 |
| 7 nodes | 134 | 127 (identical per seed) |
| 5 nodes | 134 | n/a |
| 4 nodes | 138 | n/a |
| 3 nodes | 163 | n/a |
| 7 nodes + layered support | 137 | 136 |

### Ten operators, attacker share of accounts / of FACY after 60 days

| Rule | Retired simulator (seeds 1, 2, 3) | Rust (20 seeds) |
| --- | --- | --- |
| no bound (seed 1) | 59.6% / 3.1% | n/a |
| 7 nodes | 29.2%, 45.3%, 19.5% / 0.9%, 1.8%, 0.5% | mean 24.7% (9.2%-43.3%) / 0.7% |
| 4 nodes (seed 1) | 13.8% / 0.4% | n/a |
| 7 nodes + layered | 0.5%, 0.4%, 0.6% / 0.01% | mean 0.5% (0.4%-0.7%) / 0.01% |

Adaptive attackers against 7 nodes + layered support: honest-first (retired simulator, seed 1, 60 days) 0.4% of accounts; supported-first (retired simulator, 3 seeds, 112 to 121 days) 9 accounts throughout; supported-first (Rust, 12 seeds, one year, detection at 1% false positives) 5 to 10 accounts.

### Operators over a year (Rust, 8 seeds, layered support, detection at 1% false positives, disputes allowed)

| Operators | Attacker accounts at day 365 | Share of accounts | Share of FACY |
| ---: | ---: | ---: | ---: |
| 10 | 5-9 | 0.2%-0.4% | 0.1%-0.3% |
| 30 | 19-24 | 0.7%-1.0% | 0.6%-0.8% |
| 100 | 67-80 | 2.6%-3.3% | 2.0%-3.6% |

The cone adds nothing beyond the operators' own accounts. In the same runs about 1000 genuine accounts per year are invalidated (about 35% of the honest network) and honest growth stalls near 2 to 3 thousand accounts: the detector's false positives, not the attackers, are the binding cost.

### What detection precision does (Rust, 12 seeds, layered, 60 days, 10 operators, disputes excluded)

| Inspect rate / false-positive rate | Honest accounts | Genuine invalidated | Attacker share |
| --- | ---: | ---: | ---: |
| 0.1 / 0.01 (the default) | 1092 | 51 | 0.85% |
| 0.1 / 0.003 | 1982 | 20 | 0.53% |
| 0.1 / 0.001 | 2327 | 7 | 0.48% |
| 0.03 / 0.01 | 1761 | 20 | 0.61% |
| 0.03 / 0.003 | 2309 | 6 | 0.50% |
| 0.01 / 0.001 | 2421 | 0 | 0.47% |

D131 ablation (0.1 / 0.01): disputes allowed 1888 honest accounts versus 1092 excluded; at 0.1 / 0.003 2248 versus 1999; at 0.1 / 0.001 2380 versus 2329. Containment (attacker share about 0.5%) is the same.

### Levers on the retired simulator (seed 1, 10 operators, 7 nodes, 60 days)

Stranger caution (a noisy look at a requester before accepting a valence):

| Look (sensitivity / false positive) | Attacker share | Days to 1000 honest |
| --- | ---: | ---: |
| no caution | 29.2% | 134 |
| 0.8 / 0.01, probability 0.5 and 1.0 | 10.5%, 9.2% | 133, 130 |
| 0.3 / 0.05 | 22.9% | 135 |
| 0.5 / 0.2 | 8.1% | 141 |

With layered support the cone is already contained at 0.4%-0.6% for every look.

Double life (2% of honest invitations go to a member's second account; 30% of answers are to people known in person), 7 nodes + layered support:

| Honest inviters of a second account | blamed (old rule) | acquitted |
| --- | ---: | ---: |
| honest inviters hit by the leaving cascade | 43 | 0 |
| links left | 1100 | 137 |
| honest accounts at day 196 | 1772 | 1886 |
| holders of second accounts invalidated | 17 | 18 |

Acquittal keeps about 6% more honest accounts without visible gain to the attacker, under the assumption that honest inviters are never careless or colluding (the proof question is [Q19](../../DECISIONS_NEEDED.md)).

### Baseline under the current rules (D142, D143)

Rust, current rules: Council of three below 100 active accounts, paths to different Council members, paths avoiding disputes, layered support, false-positive rate 0.3%, inspection of 3% of partners per day, cheap proof of reality (success 0.95, seven days), XP gate for formal cases, 20% careless honest accounts, one-year horizon. The full table (10, 30 and 100 operators, patient and honest-first operators, two years, the ablation without layered support) is in the [simulator contract](../../docs/simulator.en.md#baseline-validation-statistical). In short, after a year 10, 30 and 100 operators hold 0.09%, 0.29% and 0.95% of accounts and at most 1.5% of FACY; the cone never forms; the honest community grows about ten times and then stalls near 10,000 accounts (open question in [BACKLOG](../../BACKLOG.md)). Without layered support the 10-operator scenario leaves 31.7% of accounts at 60 days. Diagnostic: 3 to 20 seeds of one scenario family; honest-behavior, attacker and horizon values are the builder's proposals (D143).

### Growth against security: Council size (D144, diagnostic)

Honest growth stops near 10,000 accounts under the baseline because the difficulty reaches D = 5 and an 11-seat Council cannot supply five disjoint short paths. Council size against 100 operators, 500 days, 4 seeds, baseline otherwise:

| Council seats from 100 active accounts | Honest accounts | Attacker accounts | Attacker share | Dirty-FACY share (mean, max) | Genuine invalidated |
| --- | ---: | ---: | ---: | --- | ---: |
| 11 (the D33 lookup, baseline) | 10,324 | 98 | 0.95% | 0.92%, 1.11% | 30 |
| 21 | 16,724 | 100 | 0.60% | 0.59%, 0.69% | 42 |
| 31 | 33,134 | 100 | 0.30% | 0.43%, 0.46% | 60 |
| 51 | 66,592 | 98 | 0.15% | 0.31%, 0.32% | 88 |
| at least 3 seats per unit of D (15 at D = 5) | 11,082 | 99 | 0.89% | 0.89%, 0.92% | 32 |
| at least 4 seats per unit of D (20 at D = 5) | 16,951 | 98 | 0.58% | 0.62%, 0.77% | 42 |
| at least 5 seats per unit of D (25 at D = 5, 30 at D = 6) | 24,917 | 98 | 0.40% | 0.55%, 0.57% | 49 |
| at least 6 seats per unit of D (3 seeds) | 32,491 | 99 | 0.31% | 0.49%, 0.51% | 61 |
| at least 8 seats per unit of D (3 seeds) | 49,887 | 101 | 0.20% | 0.40%, 0.42% | 77 |
| at least 5 seats per unit of D, two years (3 seeds) | 23,843 | 98 | 0.41% | 0.45%, 0.46% | 121 |

More seats let the honest network grow several times larger and lower the attacker and dirty-FACY shares at the same time (the operators stay at 100 accounts), so no security cost shows up in this scenario; the price is computation and a larger body to maintain. Other levers at 500 days, 10 operators: path bound 9 instead of 7 gives 12,018 honest accounts, difficulty capped at 4 gives 12,422, slot ceiling 300 gives 10,673 (baseline 10,482). The plateau moves with the number of Council seats against D, not with K. It also holds: with 5 seats per unit of D two years give 23,843 accounts against 24,917 at 500 days, so a fixed rule has a plateau of its own. Roughly 1,000 honest accounts per seat at D = 5.

## Limits

One snapshot family; honest behavior rates, detection quality and the 28-day activity window are assumptions; attackers do not adapt to detection beyond the three pairing strategies; fakes are free; the Rust runner refreshes the Council, difficulty, support levels and distance pruning once per day. Year-long runs at false-positive rates of 0.1%-0.3% and 100 operators against 7 nodes without layered support are pending ([BACKLOG](../../BACKLOG.md)).
