# Topology takeover: does the D104/D36 path gate stop an attacker cone? (D115)

**Status (2026-10-29): pre-code contract.** Committed before the engine code; an implementation section follows once it exists. No result yet.

## Question

[D115](../../docs/facety.protocol.en.md#4618-evidence-core-convergence-d76) names the D104/D36 invitation gate as the critical defense: a new invitation needs at least D established mutual guarantors **and** D internally vertex-disjoint current mutual paths to one admissible Council member. The [D50 trajectories](../2026-10-29-d50-falsifier/README.md#d114-trajectories-diagnostic) showed attackers reaching about 96% of the legacy network in 30 days, but the legacy engine has no such gate. This study asks: **starting from 100 honest people with a 100-day head start, do attackers take over the network when the selected gate is in force, and how does that compare with the same world without the gate?**

Outcomes ([D114](../../docs/facety.protocol.en.md#4618-evidence-core-convergence-d76)), all daily trajectories:

1. attacker share of accepted subjects;
2. dirty-FACY share: FACY held by attacker-controlled subjects (liquid + unspent Emitter rights) over ledger supply;
3. attacker seats on the Council and Council size;
4. attack edges (established mutual links between honest and attacker subjects) and gate refusals.

## Engine: `topology-takeover/v1` (new, opt-in)

A new runner (`src/topology-experiment.mjs`) drives `FacetyModel` in valence mode (V1 valences, V2 invitations, V3 Council paths). It does not touch the legacy cohort engine. All protocol mutations go through `FacetyModel`.

### Model changes (opt-in, legacy defaults unchanged)

- **D33 Council size.** New `councilPaths.council` binding `'d33-active-lookup'`: `council()` returns the top C active accepted subjects by XP, where `D = digits(max(1, activeCount))`, `r = round(sqrt(D))` and C = 1, 11, 101, 1001, 10001, 100001 for r = 1…6 (beyond 6 rejected). C = 1 means no formal Council (`[]`). `activeCount` stands in for `N_verified`, whose verification contract is OPEN; this is a labeled assumption. `'legacy-active-xp-leaderboard'` keeps today's behavior.
- **Genesis pairs without the path gate.** `genesisPairs` become allowed with `eligibility: 'off'`, so the no-gate arm starts from the same D35 pre-guaranteed genesis.

### World

- **Genesis:** 100 honest people, pre-guaranteed mutual pairs on a ring lattice (offsets ±1, ±2) plus one seeded random chord per member. K = 100 (D100 default).
- **Head start:** days 0–99 honest only. On day 100, A = 10 attacker operators are pre-registered and invited by 10 distinct random honest members, who cannot tell them from real recruits (no detection in v1).
- **Horizon:** 200 days. A `maxSubjects` cap (default 20,000) censors the run and is reported, not hidden.

### Behavior scripts (scenario assumptions, not calibrated)

Every subject attempts at most one Self-ID per day (protocol limit) and spends only its own mature rights, so growth is limited by FACY, not by an effort budget.

- **Honest, per day:** Self-ID with probability 0.9. Then, per mature unspent right, in order: invite a new honest recruit with probability 0.01; open a valence toward a random friend-of-friend (two hops) with probability 0.05; and keep at most two unspent rights, converting older surplus to the Collector. An honest subject answers an incoming open valence (opens the opposite one) with probability 0.5 if the proposer is within two hops, otherwise 0.05. The same rule applies to attackers' requests: honest people cannot see who is an attacker.
- **Attackers, per day:** every attacker subject attempts a Self-ID. Per mature right, in order: invite a new fake account (pre-registered by its operator); open a valence toward another cone member that lacks D partners; request a valence from a random honest subject. Attackers answer every valence from their own cone and convert nothing. Fake accounts need no fabrication cost in v1 (an upper bound on attacker ease).

### Arms

- **gate:** `eligibility: 'v3-council-paths'` (D84 Self-ID support, D104/D36 invitation paths, D91 bootstrap latch) with D33 Council.
- **no-gate:** `eligibility: 'off'`, same genesis pairs, D33 Council used only for measurement; invitations still need at least D eligible guarantors.

### Not modeled in v1

No disputes, challenges, verification or penalties; no fabrication cost; no honest exit; no D77 holds. Results isolate the structural barrier. Seeds are exploration labels until a registration is committed.

## Acceptance before running

- Unit tests: the D33 lookup boundaries (9→1/no Council, 10→11, 99 999→11 with r = 2, 1 000 000→101); `'legacy-active-xp-leaderboard'` unchanged; genesis pairs accepted with eligibility off.
- Runner tests: deterministic replay; daily metrics reconcile with final model state; the head start holds (zero attacker subjects before day 100); the gate arm records `insufficient Council paths` refusals while the no-gate arm cannot.
- Full `npm test` and the pinned historical tests pass.
