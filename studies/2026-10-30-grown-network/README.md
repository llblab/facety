# Grown network versus 1–10 cooperating attackers (D122)

**Status: diagnostic, one seed per attacker count.** Design fixed before the attack runs; results below.

## Question

An honest network grows by its own rules from the 100-person genesis to 1000 honest participants, earning XP on the way, with an 11-seat Council (D33 lookup). From that one state, do 1, 2, …, 10 cooperating attackers take over, and how fast?

## Design

- **Runner:** [`src/topology-experiment.mjs`](../../src/topology-experiment.mjs) (`topology-takeover/v1`), D84/D104/D36 Council-path gate on, D33 Council lookup, valence mode, honest defaults unchanged (`selfId 0.9`, `invite 0.01`, `befriend 0.05`, `acceptNear 0.5`, `acceptFar 0.05`).
- **Snapshot:** seed `grown-1000-1`, genesis 100. The prefix run stops on the first day the honest accepted population reaches 1000 (`stopAtHonest: 1000`): day 133, with 1020 honest, D = 4, Council 11. Raw rows: [`runs/prefix-grown-1000-1.json`](runs/prefix-grown-1000-1.json).
- **Attack runs:** attackers enter on day 134 by ordinary invitations from distinct honest members, then cooperate exactly as in the topology study (invite fakes, pair inside the cone, seek honest partners). Every attack run replays the same seed, and [`probe.mjs`](probe.mjs) asserts that each pre-attack day equals the stored prefix row exactly, so all runs start from the identical snapshot.
- **Arms:** `gate` (path gate only) and `detect` (gate plus v3 detection: freeze veto, partner inspection, leaving, public look 0.02 with escalation, follow-up), detection active from day 134 only, so both arms share the snapshot.
- **Horizon:** 60 days after the attack (days 134–193); cap 10000 subjects. (Reduced from 100 days after the first attempt: the runs were too slow and had no checkpoints. `probe.mjs` now writes a progress line per day and a checkpoint every 5 days.)
- **Outcomes (D114):** attacker share of accepted subjects and dirty-FACY share over time; first day attackers reach 50%; attackers at the end; honest invalidated (detect arm).

Limits: one seed per cell, uncalibrated behavior rates, fakes cost nothing beyond protocol FACY, `activeCount` stands in for `N_verified`.

## Results

### Gate arm, 1 attacker (diagnostic, one seed) — [`runs/gate/a1.json`](runs/gate/a1.json)

| Day | Honest | Attackers | Attacker share | Honest–attacker links |
| ---: | ---: | ---: | ---: | ---: |
| 135 | 1043 | 1 | 0.1% | 1 |
| 160 | 1531 | 1 | 0.1% | 2 |
| 170 | 1787 | 7 | 0.4% | 7 |
| 180 | 2073 | 17 | 0.8% | 9 |
| 185 | 2242 | 36 | 1.6% | 12 |
| 190 | 2409 | 135 | 5.3% | 16 |
| 193 | 2525 | 304 | 10.7% | 17 |

1. **For 26 days the lone attacker is stuck.** With D = 4 it needs four honest partners; it has one (its inviter) until day 159.
2. **It then collects honest partners from strangers.** Honest people accept 5% of valence requests from strangers (`acceptFar`). By day 162 the attacker has four links to honest people, passes the gate and starts inviting fakes.
3. **After that the cone grows about 30% a day** while honest growth is about 1.5% a day: 304 attackers on day 193, against 17 honest–attacker links in total. The run ends at the 60-day horizon at 10.7% attacker share; on the observed rates the share would pass 50% within roughly a week.
4. **Why the gate stops holding:** a cone member needs D vertex-disjoint paths to the Council. Once the cone has D links to honest people at distinct cone members and is well connected inside, every member can route through different cone members to different exits. The gate then bounds nothing; only the first D honest links are hard.
5. **Dirty FACY stays small (0.3% of supply)** because the fakes are new; the attacker head count leads the money.

### Detect arm, 1 attacker (diagnostic, one seed) — [`runs/detect/a1.json`](runs/detect/a1.json)

Same snapshot and seed; detection (freeze veto, partner inspection, leaving, public look with escalation, follow-up) runs from day 134.

| Day | Honest | Attackers | Honest–attacker links |
| ---: | ---: | ---: | ---: |
| 140 | 1106 | 1 | 2 |
| 170 | 1587 | 1 | 4 |
| 175 | 1691 | 2 | 3 |
| 193 | 2076 | 2 | 3 |

1. **The attacker is contained.** It reached four honest links by day 170 and created 6 invitations; honest guarantors vetoed 5 of them during the 24h freeze and then left the link (§18.5), which kept the attacker below D = 4 links. One fake was admitted; the cone stayed at 2 accounts.
2. **The cost falls on honest people.** Over 60 days: 58 genuine people invalidated by wrong verdicts, 57 genuine invitations vetoed, 1231 links left, and 2076 honest participants on day 193 against 2525 in the gate arm (−18%). Most of the defense cost comes from the 1% false-positive rate applied to a large honest network, not from the attacker.

### Detect arm, 10 attackers (diagnostic, one seed) — [`runs/detect/a10.json`](runs/detect/a10.json)

| Day | Honest | Attackers | Attacker share | Honest–attacker links | Dirty FACY |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 140 | 1109 | 16 | 1% | 5 | 0.0% |
| 160 | 1393 | 110 | 7% | 4 | 0.2% |
| 177 | 1680 | 411 | 20% | 9 | 0.5% |
| 186 | 1852 | 1720 | 48% | 6 | 2.0% |
| 193 | 2004 | 2960 | 60% | 8 | 3.1% |

1. **Takeover despite detection:** attackers pass 50% of accepted subjects on day 193, 59 days after entry. No attacker reaches the Council (fakes have low XP), and dirty FACY is 3.1% of supply at the end.
2. **The cone grows in waves about every 9 days** (25 → 63 → 110 → 181 → 411 → 1720 → 2960): each generation of fakes matures its rights and invites the next one together.
3. **The cone stays connected to honest people through only 4–9 links.** That is enough for D = 4 vertex-disjoint paths for every cone member (see the 1-attacker gate run), so leaving links did not cut it off: honest people left 1495 links, but the cone kept regaining a handful.
4. **Detection removed fakes one by one:** 132 fakes invalidated and 24 vetoed, against 3092 admitted. The D77 hold refused attacker actions 14998 times while their cases were open; it slowed the cone but did not stop it.
5. **Honest cost:** 73 genuine people invalidated, 71 genuine invitations vetoed; honest growth 2004 on day 193 against 2525 in the 1-attacker gate run.
