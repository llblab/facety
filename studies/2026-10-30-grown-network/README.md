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

## Depth bound (D123) and supported intermediaries (D124) — diagnostic, one seed

**Standing rule (D125):** attack runs always have detection on; the `gate`-only columns below are legacy baselines from before that rule and are not to be extended.

**Rules under test** ([protocol §46.15](../../docs/facety.protocol.en.md#4615-internally-vertex-disjoint-invitation-paths-d36)): every counted Council path has at most `L` nodes, endpoints included (`maxPathNodes`); optionally every intermediate must be *supported* (`pathSupport: 'layered'`): at least D current mutual guarantors with a strictly lower level, Council members at level 0, levels up to `L - 2`. The bound is chosen as a cap on on-chain traversal cost; the width threshold D is unchanged. Same snapshot seed `grown-1000-1`; each variant grows its own honest prefix (`prefix.mjs <seed> <L>[L]`), then 60 days of attack from the first day honest accepted subjects reach 1000. Probe: `probe.mjs <attackers> <arm> <seed> 60 10000 <L>[L]`; the suffix `L` means layered support. Runs with `L` in the file name: `runs/gate/a10-L4.json`, `...-L7L.json` and so on (`L7L` = 7 nodes plus layered support).

### Honest cost (growth to 1000 honest participants, no attackers)

| Rule | Days to 1000 honest | Council-path refusals of honest actions |
| --- | ---: | ---: |
| no bound | 134 | 9 |
| 7 nodes | 134 | 9 |
| 5 nodes | 134 | 9 |
| 4 nodes | 138 | 30 |
| 3 nodes | 163 | 326 |
| 7 nodes + layered support | 137 | 56 |

Seven nodes cost honest growth nothing in this world; the same trajectory as no bound. Four nodes cost 4 days, three nodes 29 days.

### Attack results (60 days after entry; share = attackers among accepted subjects)

| Rule | 1 attacker, gate | 10 attackers, gate | 1 attacker, detect | 10 attackers, detect |
| --- | --- | --- | --- | --- |
| no bound | 10.7% (304) | not run here | 0.1% (2) | 59.6% (2960) |
| 7 nodes | 7.4% (202) | **70.5% by day 160** (50% on day 157, 23 days after entry; run stopped by hand) | 0.1% (2) | 29.2% (833) |
| 5 nodes | not run | 40.7% at day 180, 45.4% at day 184 of 193 (run stopped by hand, still growing) | not run | not run |
| 4 nodes | not run | 13.8% (402) | not run | not run |
| 7 nodes + layered | **0.04% (1)** | **12.1% (337)** | **0% (0)** | **0.5% (9)** |

1. **The depth bound alone does not stop a cluster that is already inside the radius.** With 7 nodes the 10-attacker cone passes 50% 23 days after entry. A cone member needs D disjoint paths of at most 6 links; three or four links through the cone plus two or three through the honest side fit easily. Cutting to 5 nodes slows it (50% not reached by day 184, at least 27 days later than with 7 nodes) and 4 nodes cuts it to 13.8% by day 197, at the price of 4 days of honest growth; 3 nodes cost 29 days. So length alone trades honest growth for attacker growth along one curve.
2. **Supported intermediaries break the cone without a large honest cost.** A cone member cannot serve as a path intermediate until it has D guarantors that are themselves supported, so the first supported cone member needs D links into the supported honest core. With 10 attackers the cone stayed at 10 accounts for about 20 days and then grew slowly: 14, 59, 146, 244, 337 attackers on days 156, 166, 176, 186, 196. Attack-edge count rises at the same time (14 → 104 links to honest accounts between days 146 and 196), because attackers keep buying honest links from strangers (5% acceptance): the rule raises the price of each cone member, it does not remove the bridge. With detection the 10-attacker cone ends at 9 accounts and one lone attacker is removed.
3. **Honest cost of layered support:** 3 more days to 1000 honest (137 versus 134), 56 versus 9 path refusals in the prefix, and about 3% fewer honest participants 60 days after entry in the 1-attacker gate arm (2441 versus 2525). In the detect arms the honest counts are 1896 and 1822 against 2076 and 2004 without the rule (single seed; the size of seed-to-seed noise is unknown, so a few percent is not a measured cost). False verdicts against genuine people are similar (61–71 versus 61–73).
4. **The depth bound also keeps the search honest-cheap but not free:** the exact bounded search ran out of its work budget 22 times in the 1-attacker gate run and 93 times in the 10-attacker detect run with the 7-node bound (a lost search is refused like a missing family), and never with layered support or 4 nodes. The plain 7-node attacker results are therefore slightly understated.

Limits: one seed per cell; the "no bound" 10-attacker gate cell was not run in this snapshot (the [topology study](../2026-10-29-topology-takeover/README.md) is the no-snapshot comparison); two runs were stopped by hand after the takeover threshold or when the cone dominated cost; cap of 10000 subjects; attackers use the old strategy, with no adaptation to the supported-intermediary rule, so the rule is a diagnostic, not a security claim.

## Seeds, caution, adaptive attacker, double life (D125–D127) — diagnostic, detection always on

All runs here use the detect arm (public look 0.02, leaving, follow-up, veto) with 10 attackers, 7-node paths and 60 days after entry. `7` = 7 nodes; `7L` = 7 nodes plus layered support. Three snapshot seeds (`grown-1000-1/2/3`); other levers on seed 1 only.

### More seeds (D125)

| Rule | Seed 1 | Seed 2 | Seed 3 |
| --- | ---: | ---: | ---: |
| 7 nodes | 29.2% (833) | 45.3% (1702) | 19.5% (475) |
| 7 nodes + layered | 0.5% (9) | 0.4% (8) | 0.6% (12) |

The plain bound leaves a cone that grows 5–8% a day against about 1.1% for honest participants; the spread across seeds (20–45%) shows how much one seed misleads. Layered support kept the cone at 8–12 accounts on all three seeds. Seed 2 and 3 plain runs lost searches to the work budget 495 and 236 times, so those cones are slightly understated.

### Caution toward strangers (D126, `honest.vetting`)

An answerer takes a noisy look (sensitivity 0.8, false positive 0.01, the same as detection looks, an optimistic assumption) at a requester with the given probability and declines if it looks false. Seed 1:

| Rule | vetting 0 | 0.5 | 1.0 |
| --- | ---: | ---: | ---: |
| 7 nodes, attacker share | 29.2% | 10.5% | 9.2% |
| 7 nodes, cone growth (last 30 days) | 5.4%/day | 4.7%/day | 4.3%/day |
| 7 nodes + layered, attacker share | 0.5% | 0.5% | 0.4% |
| honest growth (last 30 days) | 1.10%/day | 1.09%/day | 1.10%/day |

Caution cut the plain-bound cone to a third and did not slow honest growth in this model: the look declines only 1% of genuine requesters, so the price is small by construction. The honest cost of caution is therefore an assumption about look quality, not a finding; the next sweep should lower sensitivity and raise the false-positive rate. With layered support the cone is already contained and caution adds little.

### Adaptive attacker (D125, `attackerStrategy: 'honest-first'`)

Every cone member first collects D honest partners, asking friends of its honest partners (the 'near' acceptance rate). Against 7 nodes + layered support: 8 accounts (0.4%) at the end; 75 links to honest accounts; 3 fakes invalidated and 39 invitations vetoed. The supported-intermediary rule held against this strategy on this seed; stronger strategies (fewer, better-placed honest links; patience) are untested.

### Double life and in-person meetings (D127)

2% of honest invitations go to a member's second account ('d'), invited in good faith by someone who met them; 30% of honest answers to a valence request are from people they know in person (no look, near acceptance). 7 nodes + layered, seed 1, snapshot with these levers on:

| Acquittal of honest inviters | off | on |
| --- | ---: | ---: |
| honest inviters hit by the leaving cascade | 43 | 0 (52 acquitted) |
| links left | 1100 | 137 |
| honest participants (day 196) | 1772 | 1886 |
| holders of second accounts invalidated | 17 | 18 |
| attackers at the end | 9 | 12 |

Spare the unwitting inviter and the honest network keeps about 6% more participants, with no visible gain for the attacker. The result is conditional on the model: honest inviters here are never careless or colluding, so acquittal costs nothing; with a colluding inviter who simply claims to have met anyone it would be a loophole. The open design question is in [Q19](../../DECISIONS_NEEDED.md#q19--second-accounts-and-the-unwitting-inviter-d127).

Limits: one seed except the seeds table; levers on seed 1; plain 7-node runs under-count because of lost searches; the look quality used by caution is a declared assumption.

### Success criterion (D129)

Primary outcome: dirty-FACY share of total supply. The defense passes a scenario if the share stays at or below 10% on its longest declared horizon, and fails above 10% (account share is secondary because young fake accounts hold little money). Against this criterion every cell above passes at 60 days (largest 3.1% for the legacy no-bound arm, 1.8% for 7 nodes on seed 2, about 0.01% with layered support), so 60 days cannot discriminate between rules: money lags accounts and catches up as rights mature. The discriminating tests are the long horizon (120 days running for the supported-first attacker; a year for the key cells next) and the number of operators (10, 30, 100).
