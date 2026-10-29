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
2. **The gate is a threshold on independent gateways, not a cap on cone size.** *(Wording corrected 2026-10-29 after the owner's D118 clarification.)* What matters is vertex-disjointness: every path from a fake must leave the cone through a different cone member that has its own honest link. A lone infiltrator is a cut vertex, so fakes behind it can never invite unless they obtain honest guarantors themselves, as the owner expects (1-infiltrator gate run: 33 attackers by day 169, growing only as fakes won honest valences). D colluding genuine people, each invited once by a different honest member, guarantee each other and supply D disjoint gateways; from then on cone growth matches the no-gate arm. In the 10-infiltrator run each infiltrator had 1–2 honest partners and still issued 16–18 invitations. Paths are checked for existence, not consumed.
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

## v2 exploratory results (diagnostic, seed `explore-topo-1`)

Implemented as contracted (`detection` block, freeze veto, partner inspection, one-step identity cases with D77 holds). Implementation note: voiding the chain of an invalidated account marks rights that paid valences `valence-burn+voided`; the valence audit now accepts that disposition (`test/d33-council.test.mjs`). Raw rows: [`runs/v2/`](runs/v2/). Attack on day 100, `maxSubjects` 3000.

| Infiltrators | Arm | Stranger acceptance | Detection | Attackers ≥ 50% on day | Fakes invalidated | Genuine invalidated | Fake invitations vetoed |
| ---: | --- | --- | --- | ---: | ---: | ---: | ---: |
| 10 | gate | 0.05 / 0.01 / 0 | off | 119 (all three identical) | — | — | — |
| 10 | gate | 0.05 / 0.01 / 0 | on | 120 (all three identical) | 1 | 19 | 87 |
| 10 | no gate | 0.05 / 0 | on | 120 | 0 | 17 | 87 |
| 3 | gate | 0.05 / 0.01 | off | 128 | — | — | — |
| 3 | gate | 0 | off | not reached; 1294 / 1306 at cap (d141) | — | — | — |
| 3 | gate | 0.05 / 0.01 | on | 128–129 | 0 | 21–23 | 33–38 |
| 3 | gate | 0 | on | **156** | 0 | 41 | 89 |
| 3 | no gate | 0.05 / 0 | on | 124 | 0 | 19 | 34 |

1. **Stranger caution does not matter with 10 infiltrators.** The cone always has members needing partners, so attackers never get to requesting strangers; their attack edges come from the ten invitation links and from honest friend-of-friend valences that reach infiltrators as *near* contacts (acceptance 0.5).
2. **Detection as modeled hurts honest people more than the cone.** Honest people inspect only their own partners, and almost no fakes are partners of honest people: 0–1 fakes were invalidated against 17–41 genuine people (1% false positives over hundreds of daily looks, 10% wrong verdicts). D77 holds also slowed honest growth (724–811 versus 942–1082 honest at the cap).
3. **The freeze veto catches only the first generation.** Honest inviters vetoed 33–89 fake invitations from infiltrators, but fakes invite fakes, and their guarantors are cone members who never veto.
4. **Gate + zero stranger acceptance + detection is the only combination that slowed takeover:** with 3 infiltrators, 50% on day 156 instead of 128 (11,007 path refusals). It is a delay, not a stop.
5. **Common cause:** after the first generation the cone is invisible to honest people, and the honest endpoints of attack edges never cut them. Section 18.5 says a guarantor who sees invitations going to people who do not look real is expected to cancel them **and, if needed, leave the relation**; v2 implements the cancel but not the leave.

## v3 contract: leaving, public evidence and escalation (D117)

**Check of the owner's expectation first.** With `includeState`, gate arm, 10 infiltrators, day 125: 1711 fakes, none with an honest mutual partner; 387 fakes issued invitations, each with on average 8.3 mutual partners, all inside the cone; each infiltrator had 1–2 honest partners and issued 16–18 invitations. The selected D104 text counts any qualifying mutual guarantors and allows paths through any accepted subject, so fakes guarantee each other and borrow the infiltrators' honest links. Requiring guarantors outside the inviter's own cluster would be a different rule (OPEN, recorded in D117).

v3 adds to the opt-in `detection` block (new keys default off, so v2 runs are unchanged):

- **`leave` (§18.5).** An honest guarantor who vetoes a fake-looking invitation, or whose partner's invitee is later ruled false, ends its own link with that partner: it withdraws its valence of a valence pair, or ends the invitation link.
- **`publicLook` (D68).** Each day each honest subject, with this probability, examines one random accepted subject's public record. A *pattern* is at least `patternMinInvitees` (5) admitted invitees whose mutual partners lie, in share at least `patternClosure` (0.8), inside the examined subject's own invitation subtree. On a pattern, the observer looks at up to three invitees (same sensitivity and false-positive rate).
- **Escalation (D46).** For a suspicious invitee, the observer asks the highest-XP accepted subject within two mutual hops (itself included) whose XP exceeds the target's. Honest sponsors accept with `sponsorWillingness` (0.5); attackers never sponsor against the cone. The sponsor opens the identity case (D77 hold on sponsor and target).
- **`followUp`.** When a case rules an account false, its sponsor looks at every other admitted invitee of the same inviter and opens cases on suspicious ones; honest partners of that inviter leave (`leave`).
- Truth labels feed only the noisy look and the verdict; the pattern itself is computed from public graph and lineage data.
- **v3.1 amendment (after the first v3 runs, before rerunning).** The pattern-gated public look almost never fired (0–1 patterns in four runs): random looks rarely hit one of the ten infiltrators, and a fake's invitees partner across the whole cone rather than inside the fake's own subtree. A public look now first examines the chosen subject's own identity evidence (same noisy look) and escalates if suspicious; the pattern step stays as an addition. The four first v3 runs are retained in [`runs/v3/`](runs/v3/) as v3.0.

Runs: gate arm and no-gate reference, 3 and 10 infiltrators, stranger acceptance 0.05; v2 detection plus `leave`, `publicLook` 0.02 and `followUp` on.

## v3 exploratory results (diagnostic, seed `explore-topo-1`)

Attack on day 100, stranger acceptance 0.05, `maxSubjects` 3000; v2 detection plus `leave`, `publicLook` 0.02 and `followUp`. Raw rows: [`runs/v3/`](runs/v3/) (v3.0) and [`runs/v3.1/`](runs/v3.1/).

| Infiltrators | Arm | Version | Attackers ≥ 50% on day | Last day: attackers / honest | Fakes invalidated | Genuine invalidated | Genuine invitations vetoed | Links left |
| ---: | --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 3 | gate | v3.0 | 152 | d153 (cap): 1913 / 1015 | 0 | 40 | 45 | 416 |
| 3 | gate | **v3.1** | **never** | **d199: 14 / 1843 (1%)** | 18 | 85 | 86 | 976 |
| 3 | no gate | v3.1 | 132 | d135 (cap): 1848 / 805 | 8 | 30 | 25 | 204 |
| 10 | gate | v3.0 | 129 | d132 (cap): 1879 / 790 | 0 | 24 | 33 | 191 |
| 10 | gate | **v3.1** | **155** | d162 (cap): 1178 / 1108 | 131 | 38 | 46 | 287 |
| 10 | no gate | v3.1 | 119 | d123 (cap): 2177 / 674 | 10 | 29 | 27 | 215 |

1. **Leaving works only together with the gate.** Without the gate, honest people cut every attack edge (0 left) and the cone still grows at full speed: it does not need connections to the honest network. With the gate, cutting attack edges below D closes the cone.
2. **Gate + leaving + public evidence contained 3 infiltrators for the whole 100 days.** Attack edges fell from 3 to 1–2 within a week, the cone stalled at 5–8 accounts, D rose to 4 at 1000 active people, and public looks then removed most of the remaining fakes (31 at the peak, 14 on day 199).
3. **Ten infiltrators were delayed by 36 days, not stopped.** Public evidence, escalation and follow-up removed 131 fakes, but ten independent honest inviters gave the cone enough attack edges to pass the gate in bursts. Because eligibility is checked only at issuance (D107), one moment with D edges lets every cone member with a right invite at once.
4. **Defense has a real cost to honest people:** 38–85 genuine people invalidated, 46–87 genuine invitations vetoed and many honest–honest links cut, all from the 1% false-positive rate over hundreds of daily looks and 10% wrong verdicts. Detection also ran during the head start, so the honest network reached only about 510 people by day 100 instead of 660.
5. **The public pattern step never fired** (0 patterns), even in v3.1: direct looks at the examined subject did the work.

Single-seed runs: whether 3 infiltrators are reliably contained, and where the infiltrator threshold lies, needs a multi-seed sweep before any claim.

## Acceptance before running

- Unit tests: the D33 lookup boundaries (under 100 → no Council, 100 → 11); `'legacy-active-xp-leaderboard'` unchanged; genesis pairs accepted with eligibility off.
- Runner tests: deterministic replay; daily metrics reconcile with final model state; the head start holds (zero attacker subjects before day 100); the gate arm records `insufficient Council paths` refusals while the no-gate arm cannot.
- Full `npm test` and the pinned historical tests pass.
