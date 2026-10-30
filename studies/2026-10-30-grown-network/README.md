# Grown network versus 1–10 cooperating attackers (D122)

**Status: diagnostic, one seed per attacker count.** Design fixed before the attack runs; results below.

## Question

An honest network grows by its own rules from the 100-person genesis to 1000 honest participants, earning XP on the way, with an 11-seat Council (D33 lookup). From that one state, do 1, 2, …, 10 cooperating attackers take over, and how fast?

## Design

- **Runner:** [`src/topology-experiment.mjs`](../../src/topology-experiment.mjs) (`topology-takeover/v1`), D84/D104/D36 Council-path gate on, D33 Council lookup, valence mode, honest defaults unchanged (`selfId 0.9`, `invite 0.01`, `befriend 0.05`, `acceptNear 0.5`, `acceptFar 0.05`).
- **Snapshot:** seed `grown-1000-1`, genesis 100. The prefix run stops on the first day the honest accepted population reaches 1000 (`stopAtHonest: 1000`): day 133, with 1020 honest, D = 4, Council 11. Raw rows: [`runs/prefix-grown-1000-1.json`](runs/prefix-grown-1000-1.json).
- **Attack runs:** attackers enter on day 134 by ordinary invitations from distinct honest members, then cooperate exactly as in the topology study (invite fakes, pair inside the cone, seek honest partners). Every attack run replays the same seed, and [`probe.mjs`](probe.mjs) asserts that each pre-attack day equals the stored prefix row exactly, so all runs start from the identical snapshot.
- **Arms:** `gate` (path gate only) and `detect` (gate plus v3 detection: freeze veto, partner inspection, leaving, public look 0.02 with escalation, follow-up), detection active from day 134 only, so both arms share the snapshot.
- **Horizon:** 100 days after the attack (days 134–233); cap 10000 subjects.
- **Outcomes (D114):** attacker share of accepted subjects and dirty-FACY share over time; first day attackers reach 50%; attackers at the end; honest invalidated (detect arm).

Limits: one seed per cell, uncalibrated behavior rates, fakes cost nothing beyond protocol FACY, `activeCount` stands in for `N_verified`.
