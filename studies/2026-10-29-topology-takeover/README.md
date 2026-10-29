# Topology takeover: does the D104/D36 path gate stop an attacker cone? (D115)

**Status (2026-10-29):** pre-code contract committed (`85c63f4`), engine implemented (see Implementation), exploratory trajectories below. No registered confirmation yet.

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

- **D33 Council size.** New `councilPaths.council` binding `'d33-active-lookup'`: `council()` returns the top C active accepted subjects by XP, where `D = digits(max(1, activeCount))`, `r = round(sqrt(D))` and C = 1, 11, 101, 1001, 10001, 100001 for r = 1…6 (beyond 6 rejected), so under 100 active there is no formal Council and from 100 to 999,999 it has 11 seats. C = 1 means no formal Council (`[]`). `activeCount` stands in for `N_verified`, whose verification contract is OPEN; this is a labeled assumption. `'legacy-active-xp-leaderboard'` keeps today's behavior.
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

## Implementation

`src/topology-experiment.mjs` (`runTopologyExperiment`, `topologyConfig`) and the two `src/model.mjs` changes exist as contracted; [`probe.mjs`](probe.mjs) runs one arm. Tests: `test/d33-council.test.mjs` (lookup boundaries, active-only count, legacy binding unchanged), `test/topology-experiment.test.mjs` (config validation, exact replay, head start, 11-seat Council after bootstrap, no path refusals in the no-gate arm) and the updated `test/valence-council-paths.test.mjs` binding test.

**Correction at implementation.** The contract's first boundary list (10 → 11 seats) was arithmetically wrong: `round(sqrt(2)) = 1`, so the formal Council starts at 100 active participants, as the protocol states. The tests use the correct boundaries.

## Exploratory results (diagnostic, one seed per arm)

Seed `explore-topo-1`; 100 honest genesis; attack on day 100; `maxSubjects` 5000 (A = 10) or 3000 (A = 1–3), whose hit censors the run. Raw rows: [`runs/`](runs/). By day 100 the honest network has grown from 100 to about 660 people; the Council has 11 seats from day 1.

| Infiltrators | Arm | ≥ 50 attackers on day | Attackers ≥ 50% on day | Last day: attackers / honest | Path refusals |
| ---: | --- | ---: | ---: | --- | ---: |
| 10 | gate | 109 | 119 | d124 (cap): 3830 / 994 (79%) | 22 |
| 10 | no gate | 109 | 119 | d124 (cap): 3862 / 1020 (79%) | 0 |
| 3 | gate | 112 | 128 | d129 (cap): 1581 / 1082 (59%) | 510 |
| 3 | no gate | 112 | 123 | d125 (cap): 1836 / 1036 (64%) | 0 |
| 2 | gate | 134 | — | d146 (cap): 1342 / 1400 (49%) | 137 |
| 2 | no gate | 115 | 126 | d127 (cap): 1690 / 1063 (61%) | 0 |
| 1 | gate | — | — | d169: 33 / 2044 (2%), still growing | 322 |
| 1 | no gate | 141 | — | d153 (cap): 1278 / 1617 (44%) | 0 |

Observations at diagnostic level:

1. **With 10 infiltrators the gate changes nothing.** Both arms follow the same trajectory to 79% attackers within 24 days of the attack. Ten infiltrators admitted by ten different honest inviters already give the cone ten independent links into the honest region, so every cone member easily finds D = 3 (later 4) internally vertex-disjoint paths to an honest Council member.
2. **The gate is a threshold on independent attack edges, not a cap on cone size.** It bites only while the cone has fewer than D disjoint connections to the honest region (1–2 infiltrators): it delayed the 2-infiltrator takeover by about 20 days and kept the 1-infiltrator cone at 33 subjects by day 169. Once attack edges reach D, growth matches the no-gate arm. Paths are checked for existence, not consumed: the same few links certify thousands of invitations.
3. **Attack edges keep growing.** Attackers spend FACY on valence requests to random honest people; at a 5% stranger acceptance rate, 1–3 seeded links became 6–12 within weeks. The day-116 stall in the 3-infiltrator gate run coincides with D rising from 3 to 4 at 1000 active participants, and growth resumed once attack edges reached 4.
4. **The Council stays honest** (0 attacker seats in every run): the honest head start keeps XP ahead. The gate still fails because paths can end at honest Council members.
5. **Dirty FACY lags population.** At 79% attackers, attackers hold only 14% of FACY, because they burn their rights on invitations and valences. Population share is the earlier warning sign.

These are single-seed exploration runs under scripted behavior with no detection, disputes or fabrication cost; they are not a confirmation. The structural point in observation 2 is graph-theoretic (Menger: D disjoint paths exist whenever the cut has at least D vertices) and does not depend on the seed.

## v2 contract: detection, disputes and cautious acceptance (D116)

Committed before the v2 code. Opt-in `detection` block (default `enabled: false`, so v1 trajectories are unchanged):

- **Labels.** Honest people and attacker operators are genuine people; only accounts created by the cone (`f…`) are false identities. Detection can only find false identities; misconduct by genuine colluders is not modeled.
- **Observation.** A look at a subject returns *suspicious* with probability `sensitivity` (0.8) for a false identity and `falsePositiveRate` (0.01) for a genuine one, independently per look. No actor reads the labels directly.
- **Invitation veto (§18.5).** On the day an invitation is created, each honest current guarantor of its creator looks at the target with probability `review` (0.5) and cancels the invitation during the 24h freeze if the look is suspicious.
- **Partner inspection and challenge.** Each day every honest subject looks at each mutual partner with probability `inspect` (0.1). A suspicious look opens an identity case (one open case per target) that puts challenger and target under the D77 activity hold. After `windowDays` (7) the case resolves: the verdict is correct with probability `accuracy` (0.9). A "false" verdict invalidates the identity and voids its Self-ID chain (unspent rights burn, XP revoked); the hold ends either way. No stakes, fines or chain liability in v2.
- **Cautious acceptance (option 3).** `honest.acceptFar` (stranger acceptance) is swept over 0.05, 0.01 and 0.
- **New metrics.** Cases opened, false and genuine identities invalidated, invitations vetoed by target type.

Runs: gate arm, 3 and 10 infiltrators, `acceptFar` ∈ {0.05, 0.01, 0} × detection off/on, plus no-gate references at detection on. Exploration seeds only.

## Acceptance before running

- Unit tests: the D33 lookup boundaries (under 100 → no Council, 100 → 11); `'legacy-active-xp-leaderboard'` unchanged; genesis pairs accepted with eligibility off.
- Runner tests: deterministic replay; daily metrics reconcile with final model state; the head start holds (zero attacker subjects before day 100); the gate arm records `insufficient Council paths` refusals while the no-gate arm cannot.
- Full `npm test` and the pinned historical tests pass.
