# Deterrence threshold (2026-10-22, exploratory)

**Question:** how weak can fraud detection and dispute verdicts get before deterrence breaks? The aim is to turn "is the system viable?" into measurable requirements. Everything here is conditional on the model, the strategy menu, the illustrative valuation and a 30-day horizon. Nothing is registered or confirmed yet.

## Setup

The game is the [inspection-game pilot](../2026-10-22-inspection-game/README.md) with one more coalition strategy, `farm-and-harass`: it farms fakes and also challenges honest acts to collect rewards from wrong verdicts. That gives 3 honest × 4 coalition strategies and 16 replicas per profile, run over two grids:

- **Grid A:** detection `sensitivity` (0.1–0.8) × verdict `disputes.accuracy` (0.5–0.9), with false-suspicion rate 0.01. That is 30 cells, 5,760 runs.
- **Grid B:** `falsePositiveRate` (0.01–0.3) × verdict accuracy, with sensitivity 0.5. That is 25 cells, 4,800 runs.

`sensitivity` is the probability that one inspection flags a fake act as suspicious. The model doesn't care whether the cue comes from the image, from co-presence evidence, from key-possession anomalies or from the social graph. `falsePositiveRate` is the same probability for a genuine act and also drives guarantee vetting. `accuracy` is the probability that a challenge verdict is correct.

A cell counts as **viable** when all of the following hold:

- fraud earns no premium over the rule-following reference in any equilibrium of the menu;
- some honest strategy deters every fraud strategy;
- the honest equilibrium value is at least 50% of its fraud-free value;
- there is at most 1 wrongful invalidation of a genuine person per run.

These criteria are analyst choices. Re-assess with `grid-viability <grid.json> [criteria.json]`.

```sh
node bin/facety.mjs game-grid studies/2026-10-22-deterrence-threshold/game.json studies/2026-10-22-deterrence-threshold/axes-sensitivity.json --workers auto --out grid-sensitivity.json
node bin/facety.mjs grid-viability studies/2026-10-22-deterrence-threshold/grid-sensitivity.json
```

## Grid A: detection × verdict accuracy (false suspicions 1%)

Each cell shows the viability verdict, followed by honest equilibrium value as a share of the fraud-free value.

| Sensitivity \ Accuracy | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
| --- | --- | --- | --- | --- | --- |
| 0.10 | fraud pays | fraud pays | fraud pays | fraud pays | fraud pays (0.54) |
| 0.20 | fraud pays | fraud pays | fraud pays | harm (−0.16) | **viable (0.61)** |
| 0.35 | fraud pays | fraud pays | harm (−0.03) | **viable (0.61)** | **viable (0.63)** |
| 0.50 | harm | harm (0.03) | harm (0.40) | **viable (0.61)** | **viable (0.60)** |
| 0.65 | harm | harm (0.34) | wrongful (0.50) | **viable (0.64)** | **viable (0.63)** |
| 0.80 | harm (0.12) | harm (0.46) | **viable (0.64)** | **viable (0.65)** | **viable (0.65)** |

"Harm" means fraud earns no premium, but honest people lose most of their value or many are wrongfully invalidated.

## Grid B: false suspicions × verdict accuracy (sensitivity 0.5)

| False-positive rate \ Accuracy | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
| --- | --- | --- | --- | --- | --- |
| 0.01 | harm | harm | harm (0.40) | **viable (0.61)** | **viable (0.60)** |
| 0.05 | harm | harm | harm | fraud pays (0.53) | fraud pays (0.53) |
| 0.10–0.30 | harm | harm | harm or fraud pays | fraud pays | fraud pays |

## Reading

1. **Detection can be weak.** With accurate verdicts (≥ 0.8–0.9), flagging a fake act in only 20–35% of inspections suffices. Vigilant participants make three inspections a day and the coalition's real guarantors are liable, so even rare detection makes farming unprofitable.
2. **Verdict accuracy below about 0.8 is the main danger, and it comes from dispute abuse, not fakes.** Once `farm-and-harass` is available, inaccurate verdicts let a coalition invalidate dozens of genuine people per run. The honest value collapses even where fraud earns no premium. Without that strategy in the menu (first grid run, not retained), cells with accuracy 0.5 still looked deterred; that result was an artifact of too small a menu.
3. **False suspicions must stay around 1%.** At 5%, vigilance hurts honest people more than fakes do. A vigilant cohort falsely vetoes about 131 genuine Self-IDs per run (versus 27 at 1%; diagnostic sample of 8 seeds) and wrongfully invalidates a few genuine people. Honest people then rationally drop to lax inspection, and farming pays again (equilibrium `lax`/`farm`). Because the free guarantor veto costs the vetoer nothing, the protocol's preventive tool is also the channel through which false suspicion destroys honest income.
4. **Fraud never pays where the cell is viable, but it still occurs.** In viable cells the coalition mixes farming with abstaining at 0 premium, and honest people keep about 60–65% of their fraud-free value. The remainder is the cost of policing plus dilution.

## Requirements this suggests (to be confirmed)

| Quantity | Approximate requirement in this model |
| --- | --- |
| Probability an inspection flags a fake act | ≥ 0.2 with verdict accuracy 0.9; ≥ 0.35 with 0.8 |
| Verdict accuracy | ≥ 0.8 (≥ 0.7 only with sensitivity ≥ 0.8) |
| False-suspicion rate per inspection | ≈ 1%; 5% already breaks deterrence |

A small human study could estimate the first and third numbers. Show reviewers a mix of genuine and fabricated identity acts (single and group media, plus key-signature context) and measure the hit and false-alarm rates. Verdict accuracy depends on the unspecified Chekharda/Council procedure.

## Limits and next steps

- Exploratory: one seed batch per cell, 16 replicas, no registration. Confirm the boundary cells on reserved seeds.
- The thresholds depend on fines, liability scope, reward share, inspection intensity, valuation and horizon. Sweep these next (`excludeLiable`, longer horizons).
- Design levers worth testing as ablations: a cost or accountability for vetoes, appeals of wrongful invalidation, and a challenge stake (currently 0) to deter harassment.
- The menu is finite. Patient-aging and camouflage coalitions remain untested.
