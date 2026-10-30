# D50 falsifier: honest versus fraudulent yield per unit of effort (D108)

**Status (2026-10-29):** design bound by [D109](../../docs/decisions.en.md#evidence-core-convergence-d76) (all [Q16](../../DECISIONS_NEEDED.md#q16--d50-falsifier-design-d108) defaults accepted); one of four registered balance confirmations executed (weak, sybil-cone: supported); the other three were superseded by [D114](../../docs/decisions.en.md#evidence-core-convergence-d76), which makes dirty-FACY share and attacker share over time the primary outcomes. No mechanism claim exists.

**Authority:** [D108](../../docs/decisions.en.md#evidence-core-convergence-d76) releases the master-programme order lock and the WP1/G1 method precondition for research runs. The evidence contract itself is unchanged: claims still need a committed registration before a reserved-seed confirmation, with presence, necessity and named alternatives where a mechanism is claimed.

## Question

[D50](../../docs/facety.protocol.en.md#honest-participation-and-incentive-asymmetry-d50) states that honest participation should be substantially easier and more profitable than identity fraud, with 10× asymmetry as a research target. This study asks the smallest falsifiable version: **in the declared model, does one unit of declared effort yield more protocol value when spent on genuine participation than when spent on fabricated or colluding identities?**

- **Weak D50 (falsifier):** honest yield per effort exceeds attacker yield per effort in every declared attack context. Failure in any context is a counterexample.
- **Strong D50 (target):** the ratio reaches 10× in every declared context.

Yield is FACY-equivalent holdings (liquid + unspent Emitter rights + reserved stake − debt) per unit of declared effort, per cohort. It is protocol accounting, not utility: XP, private benefits, market prices and real human costs stay outside the statistic.

## Exploratory probe (diagnostic, exploration seeds)

[`probe.mjs`](probe.mjs) runs the legacy cohort engine at commit `1990040` defaults for 60 days on three exploration labels per arm; [raw rows](probe-results.json).

| Scenario | Arm | Honest yield/effort | Attacker yield/effort | Ratio | Attacker subjects (of 2000 cap) | Invalidated |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| sybil-cone | default | 0.239–0.243 | 0.111–0.112 | 2.13–2.19 | 1929–1939 | 0 |
| sybil-cone | disputes enabled | identical to default | identical | 2.13–2.19 | identical | 0 |
| sybil-cone | disputes + verification/investigation | 0.224–0.229 | 0.111–0.112 | 2.00–2.06 | 1928–1940 | 0 |
| real-cartel | all three arms | 0.241–0.247 | 0.112 | 2.15–2.21 | 1929–1940 | 0 |

Observations, at diagnostic level only:

1. **The defense never fires under defaults.** Honest `challenge` activity defaults to 0, so enabling disputes changes nothing, and verification only adds honest cost. Zero attacker subjects are invalidated in every run.
2. **The about 2× ratio is structural, not defensive.** Attackers spend extra actions (fabrication, invitations, guarantees) per unit of emission. The ratio is therefore set mostly by the illustrative unit weights (`fabricateIdentity = recruitHuman = 1`).
3. **Absolute fraud dominates.** Three Sybil operators each end with about 1950 FACY versus about 16 per honest operator, because fraud scales with resources while honest emission is one identity per person. A per-effort ratio above 1 does not prevent profitable fraud whenever effort is cheap relative to FACY. Under a linear price `P` per FACY and cost `c` per effort unit, honest participation is profitable when `P/c > ~4.2` and this fraud when `P/c > ~9`. The window between them is the only region where the weak D50 holds in a profit sense.
4. **The resource cap binds.** Attacker cones saturate `maxSubjects = 2000` before day 60, so the horizon endpoint is cap-censored growth, not equilibrium.

These numbers are not evidence for or against D50; they show which assumptions decide the answer: effort weights, defense activity, the cap and the horizon.

## Bound design (D109)

- **Engine:** legacy cohort engine with D42 `policy.xpFinality: "maturity"`; V1–V3 valence references are not yet wired into the cohort runner.
- **Statistic:** a new per-day observable pair `yield.honestPerEffort` / `yield.attackersPerEffort` (holdings over cumulative effort), with the ratio as a contrast on the log scale, plus the absolute per-operator holdings as a reported secondary.
- **Contexts:** sybil-cone and real-cartel × {no defense, active honest challenge with one-step disputes, active challenge with verification/investigation} × fabrication weight {1, 5, 20}.
- **Kill:** weak D50 is contradicted in the model if, in any context, the attacker per-effort yield is at least the honest yield in a significant share of reserved replicas.
- **Controls:** the honest-growth scenario as the no-attack baseline; the `maxSubjects` cap raised or the horizon shortened so that endpoints are not cap-censored.

## Registration (committed before confirmation)

[`build-hypotheses.mjs`](build-hypotheses.mjs) writes four `association` hypotheses; each was registered with `node bin/facety.mjs register` and committed before any reserved-seed run:

| Hypothesis | Statistic (day-90 endpoint) | Claim | Registration |
| --- | --- | --- | --- |
| [weak, sybil-cone](hypotheses/d50-weak-sybil-cone-v2.json) | `yield.honestPerEffort` − `yield.attackersPerEffort` | > 0, median (p = 0.5) | [reg](hypotheses/d50-weak-sybil-cone-v2.registration.json) |
| [weak, real-cartel](hypotheses/d50-weak-real-cartel-v2.json) | same | same | [reg](hypotheses/d50-weak-real-cartel-v2.registration.json) |
| [strong, sybil-cone](hypotheses/d50-strong-sybil-cone-v2.json) | `yield.strongTargetGap` = honest − 10 × attacker | > 0, median | [reg](hypotheses/d50-strong-sybil-cone-v2.registration.json) |
| [strong, real-cartel](hypotheses/d50-strong-real-cartel-v2.json) | same | same | [reg](hypotheses/d50-strong-real-cartel-v2.registration.json) |

Each has 9 contexts (3 defenses × fabrication weight 1/5/20), 30 replicas, α = 0.05 and the v2 `family-contradiction/v1` analysis; Holm adjustment across the four via `study`. Base: 90 days, `maxSubjects` 10000, `maxActions` 5,000,000 (raised from 500,000 because the action cap, not the design, censored runtime probes), legacy terminal XP.

**Deviation from D109 (v1 withdrawn).** The first registrations (`hypotheses/d50-*-{sybil-cone,real-cartel}.json`, committed in `ed29272`) bound D42 `xpFinality: "maturity"`. Their first confirmation aborted with `debt/maturity ordering requires an explicit contract`: the model refuses to mature XP once dispute penalties create debt, an OPEN D42 migration item (BACKLOG "Remaining migration"). No statistic was computed or seen. The v2 registrations above differ only by using the labeled legacy terminal XP; the statistic is FACY holdings, which XP finality affects only indirectly through Council/eligibility. A D42-faithful rerun waits for the debt/maturity contract.

**Encoding note.** Q16's log ratio is undefined when attacker yield is ≤ 0, which is the strongest pro-D50 outcome. The registered statistics are the equivalent sign tests (ratio > 1 ⇔ difference > 0; ratio > 10 ⇔ honest − 10 × attacker > 0 for positive yields), defined for every sign. Log ratios are reported descriptively.

**Known inert context.** `real-cartel` attackers recruit genuine people, so the fabrication weight does not touch them; its three weight contexts are expected replicates, not robustness.

## D109 confirmation result

[`d50-weak-sybil-cone-v2.confirmation.json`](hypotheses/d50-weak-sybil-cone-v2.confirmation.json), implementation matched, v2 `family-contradiction/v1`: **supported** in all 9 contexts, 30/30 replicas each (p ≈ 9.3e-10 per component, max p = analysis p). Holm across the planned four was not computed because the other three were not run.

| Context | Median honest − attacker yield/effort |
| --- | ---: |
| no defense, fabrication 1 / 5 / 20 | 0.129 / 0.146 / 0.191 |
| challenge, fabrication 1 / 5 / 20 | 0.348 / 0.347 / 0.370 |
| challenge + verification, fabrication 1 / 5 / 20 | 2.262 / 2.091 / 1.649 |

Exact replays of replica 0 per context (descriptive) give honest/attacker ratios of 1.9× / 2.3× / 3.5× without defense and 9.8× with challenge at fabrication weight 1; elsewhere attacker holdings are negative. **Caveat:** negative attacker holdings are mostly uncollected debt on disposable Sybils (challenge + verification, fabrication 1: about 93,600 FACY fined, about 3,500 collected). Flooring each subject's holdings at zero gives 1.9× (no defense), 4.9× (challenge, fabrication 1), 12.8× (challenge, fabrication 20) and 12× (challenge + verification, fabrication 1).

**Not run (superseded by D114):** weak real-cartel and both strong hypotheses. Their registrations stay committed and valid; running them later is a separate decision, not a hidden result.

## D114 trajectories (diagnostic)

[`trajectory-probe.mjs`](trajectory-probe.mjs) on one exploration seed per arm, 90 days, `maxSubjects` 10000, legacy terminal XP; [output](trajectory-probe.txt). New observables: `dirty.heldShare` (FACY held by attacker-cohort subjects as liquid + unspent Emitter rights + reserved stake, over ledger supply) and `dirty.acceptedAttackerShare` (attacker share of accepted, not invalidated, subjects).

| Arm | Attackers d0 → d10 → d30 → d89 | Dirty FACY d0 → d30 → peak → d89 |
| --- | --- | --- |
| sybil-cone, no defense | 10% → 45% → 97% → 96% | 14% → 87% → 89% → 72% |
| sybil-cone, challenge, fab 1 | 10% → 43% → 96% → 95% | 14% → 75% → 83% → 49% |
| sybil-cone, challenge, fab 20 | 10% → 43% → 96% → 91% | 14% → 75% → 75% → 28% |
| sybil-cone, challenge + verification | 10% → 45% → 97% → 96% | 14% → 79% → 79% → 45% |
| real-cartel, all three arms | 10% → 45% → 98% → 96% | 14% → 87% → 89% → 72% |

1. **Population takeover in about 30 days in every arm.** Defense changes the attacker share by at most a few points; invalidations are tens to a few hundred against thousands of attacker subjects.
2. **Defense lowers dirty FACY late, not early.** The decline after day 45 coincides with attacker budget exhaustion (no new attacker emission) plus collected fines; it is not removal of attackers.
3. **real-cartel is untouched by defense** because its members are genuine people: identity challenges have nothing to find, and act-level misconduct is not modeled here.
4. **Cause candidates, not yet separated:** scripted attacker rates (invite 0.4 and guarantee 2 per subject-day versus honest 0.05 and 0.3), equal 100,000-unit budgets, and the absence of the selected D104/D36 path barrier from the legacy cohort engine.

## Not claimed

No real-world profitability, no optimal attacker, no calibrated effort price, no utility of XP and no network externality. A finite strategy menu cannot prove universal deterrence.
