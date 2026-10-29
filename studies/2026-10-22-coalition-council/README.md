# Coalition Council study (2026-10-22)

The first worked study using the [confirmatory evidence pipeline](../../docs/evidence.en.md). Every result below is conditional on the declared sybil-cone scenario, simulator policies, scripted strategies and 30-day horizon. Nothing here is a real-world attack estimate.

This study ran before the Council default became active-only (`councilEligibility: "active"`, later the same day), so its Council counted every accepted subject. The registrations are bound to that implementation digest. Re-registering under the new default is a separate hypothesis.

| Hypothesis | Kind | Verdict | Holm-adjusted p |
| --- | --- | --- | --- |
| [H1: guarantor-XP coupling amplifies coalition Council share](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-22-coalition-council/h1-coupling-amplification.json) | mechanism | supported within model | 3.7e-11 |
| [H2: a growing coalition's Council shield is a transient of its age structure](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-22-coalition-council/h2-growth-shield.json) | mechanism | supported within model | 1.8e-12 |

## Exploration

Exploration used seed labels `explore-A` to `explore-G`. The first screens (A–E) were ad hoc scripts with 10 replicas per arm. They were then repeated as reproducible CLI inputs on new labels:

```sh
node bin/facety.mjs landscape studies/2026-10-22-coalition-council/exploration-landscape.json --workers auto --out results/exploration-landscape.json
node bin/facety.mjs compare studies/2026-10-22-coalition-council/exploration-growth-halt.json --out results/exploration-growth-halt.json
```

The landscape crosses guarantor-XP ablation × attacker guarantee intensity (0.3 or 2 proposals per subject-day) × attacker Self-ID probability (0.8 or 1) × bootstrap topology, with 16 cells × 10 replicas. Endpoint means at day 29 (random bootstrap; the preferential bootstrap is similar):

| Attacker guarantee | Attacker Self-ID | Coupling | Attacker subject share | Attacker Council share | Attacker XP share |
| --- | --- | --- | --- | --- | --- |
| 2 | 1.0 | on | 0.916 | 0.619 | 0.687 |
| 2 | 1.0 | ablated | 0.916 | 0.472 | 0.606 |
| 2 | 0.8 | on | 0.889 | 0.589 | 0.628 |
| 2 | 0.8 | ablated | 0.889 | 0.440 | 0.521 |
| 0.3 | 1.0 | on | 0.763 | 0.455 | 0.292 |
| 0.3 | 1.0 | ablated | 0.763 | 0.437 | 0.448 |

The automatic diagnostics flagged 228 exploratory candidates across eight metrics, most of them temporal jumps and plateaus that the encoded 3/7-day clocks explain. That count is not a count of discoveries. Two patterns were selected for confirmation:

1. **Coupling amplification.** Coalition seat share rises by about 0.15 when guarantor XP sharing is on, but only when the coalition guarantees intensively.
2. **Growth shield.** About 92% of subjects are coalition members, yet they hold only about 62% of seats. In the paired growth-halt control (`explore-G`), halting coalition invitations on day 15 left them with 34% of subjects and 49% of seats, which turns the gap from negative to positive.

An unconfirmed observation is worth a future hypothesis. At honest-level guarantee intensity, coupling *lowers* the coalition's XP share (0.448 → 0.292) while barely changing its seat share.

## Preregistration

Both designs were registered and committed (`7d0761f`) before any run on the reserved seed namespace `confirm:<registration hash>`. Each registration binds the normalized design, the implementation digest `40ed56a70fd447e2…` and the randomness policy `sha256-xoshiro128starstar-v2` / `decision-keyed-v1`.

- H1: `4ecebfd44be2fdb7733ac4633854e68ba31862e20432173a7dc993bbbc390749`, 6 arms × 2 bootstrap contexts × 40 replicas = 480 runs.
- H2: `5478eeecab6063cb9fcdd0256f3b93594dfbc432977f3e594476247b5439733e`, 3 arms × 2 contexts × 40 replicas = 240 runs.

Each claim states that the paired per-replica contrast exceeds its margin in more than half of replicas (`probability: 0.5`, an exact binomial test at α = 0.05). Every claim must hold in every context (intersection-union). Holm then adjusts across the two hypotheses.

## Confirmation

Contrast means include deterministic 95% bootstrap intervals. "Held" counts replicas in which the claim's inequality held.

| H | Context | Claim (role) | Held | Mean contrast [95% bootstrap] |
| --- | --- | --- | --- | --- |
| 1 | random | coupling amplifies (presence) | 40/40 | +0.143 [0.133, 0.153] |
| 1 | random | requires coalition intensity (necessity, DiD) | 40/40 | +0.127 [0.117, 0.138] |
| 1 | random | survives equal Self-ID (alternative) | 40/40 | +0.148 [0.137, 0.158] |
| 1 | preferential | coupling amplifies (presence) | 40/40 | +0.166 [0.154, 0.179] |
| 1 | preferential | requires coalition intensity (necessity, DiD) | 39/40 | +0.150 [0.137, 0.163] |
| 1 | preferential | survives equal Self-ID (alternative) | 40/40 | +0.165 [0.152, 0.177] |
| 2 | random | shielded: seats − subjects (presence) | 40/40 | −0.306 [−0.312, −0.300] |
| 2 | random | growth halt removes shield (necessity) | 40/40 | +0.457 [0.446, 0.470] |
| 2 | random | survives immediate XP (alternative) | 40/40 | −0.180 [−0.194, −0.166] |
| 2 | preferential | shielded: seats − subjects (presence) | 40/40 | −0.293 [−0.302, −0.285] |
| 2 | preferential | growth halt removes shield (necessity) | 40/40 | +0.450 [0.440, 0.460] |
| 2 | preferential | survives immediate XP (alternative) | 40/40 | −0.112 [−0.123, −0.103] |

No replica was censored or had an undefined statistic. Raw per-replica values are in `h1.confirmation.json` and `h2.confirmation.json`. Holm results are in `study.json`.

## Interpretation and limits

- **H1** shows a network-coupled effect, not a new rule. XP sharing is encoded per guarantee edge. The finding is that the encoded rule turns into rank-based Council over-representation only when guarantee intensity is concentrated inside the coalition, and the higher scripted Self-ID rate does not explain it. Because XP never feeds back into agent behavior, the full and ablated arms have identical graphs under shared seeds, so the presence contrast is an exact counterfactual. The necessity DiD compares worlds with different populations (about 390 versus 1100 subjects), so population size is confounded with intensity. Separating them needs a size-matched control.
- **H2** is a demographic property of exponential admission: young subjects have had little time to accumulate XP. Terminal XP finality accounts for part of the shield (−0.30 → −0.18 or −0.11 under immediate XP) but not all of it. Once growth stops, the same coalition becomes over-represented. "Shield" therefore describes an observed transient, not a defense: halting growth was a coalition choice that raised its seat-minus-subject gap.
- **Checked descriptively, not confirmed:** Council tie-breaking by ID string. In four witness runs the tie group at seat 101 had 2–4 members and moved at most one seat (≈0.01), well below the 0.05–0.15 margins.
- **Untested alternatives:** other bootstrap sizes, attacker shares and horizons; behavior that adapts to XP; correlated observation errors; a real Council procedure. The scripted strategies are not optimized attackers, and neither hypothesis is an equilibrium claim.

## Reproduce

```sh
node bin/facety.mjs confirm studies/2026-10-22-coalition-council/h1.registration.json --workers auto
node bin/facety.mjs reanalyze-confirmation studies/2026-10-22-coalition-council/h1.registration.json studies/2026-10-22-coalition-council/h1.confirmation.json
```

`confirm` refuses to run after any `src/*.mjs` change unless `--allow-implementation-change` is passed, and the output then reports `implementationMatched: false`. Reanalysis of the retained values needs no rerun.
