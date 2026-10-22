# Inspection game pilot (2026-10-22, exploratory)

This is a first [strategy game](../../docs/games.en.md). It is **exploratory**: no hypothesis was registered, the valuation is illustrative and the dispute layer is a declared abstraction of OPEN procedures. Treat these results as a map of where to look, not as findings.

Reproduce it with:

```sh
node bin/facety.mjs game studies/2026-10-22-inspection-game/game.json --workers auto --out results/game-pilot.json
```

That runs 9 profiles plus 36 deviation settings, 24 replicas each (1,080 runs, about 45 s on 15 workers).

## Setup

The scenario is a sybil-cone with 40 initial people, 4 of them coalition members, over 30 days. The Council is active-only. Disputes use verdict accuracy 0.9, a fine of 5 FACY per liable party (subject plus its guarantors), a 50% challenger reward and XP halving for losers.

- **Honest strategies:** `vigilant` (3 inspections a day, always challenge when eligible), `lax` (0.3 inspections, challenge 20%), `passive` (no inspection, veto or challenge).
- **Coalition strategies:** `abstain` (behave like honest people, no fakes), `farm` (default Sybil script), `farm-then-hide` (stop admissions from day 12).
- **Valuation per initial operator:**
  - honest: liquid FACY +1, Emitter FACY +0.5, debt −1, effort −0.05 per unit, and −0.02 per liquid FACY held by fakes (dilution);
  - coalition: the same money and effort weights, Council seats +2, and debt left on fakes ignored (`falseDebt: +1`), because exposed fakes are abandoned.

## Payoffs per initial operator (mean, bootstrap 95%)

| Honest \ Coalition | abstain | farm | farm-then-hide |
| --- | --- | --- | --- |
| vigilant | 11.1 / 19.3 | 10.9 / **−120.7** | 11.1 / −66.7 |
| lax | 16.0 / 19.9 | 10.4 / 166.2 | 12.8 / 65.2 |
| passive | 16.5 / 19.9 | 8.7 / **211.4** | 9.7 / 109.3 |

Each cell is honest / coalition. Intervals are narrow (for example vigilant/farm: coalition [−127.7, −113.8]).

## What the pilot suggests

1. **Deterrence works when someone checks.** Against vigilant honest people, farming loses about 140 per coalition operator relative to abstaining. Against passive ones it gains about 190, roughly ten times the honest-like income. The loss comes from liability of the coalition's *real* guarantors: fines, halved XP and lost fake income. This holds even though debt on abandoned fakes is ignored.
2. **Vigilance is a public good, so this is an inspection game.** There is no pure equilibrium in the menu. The coalition farms when honest people are lax or passive, and honest people relax when there is nothing to catch. The mixed equilibrium of the population game is about 51% vigilant / 49% lax against about 92% farm / 8% abstain.
3. **Individual incentives point to an intermediate level of vigilance.** Challenger rewards make it profitable for one honest operator to become vigilant when others are lax and fakes exist (+4 to +11 per operator). When others are already vigilant, it pays to free-ride (+4). Several cells are social dilemmas: an individual gain coexists with a collective loss.
4. **Valuation sensitivity:**
   - **Effort cost.** At −0.1 per effort unit or higher, `lax`/`farm` becomes a strict pure equilibrium.
   - **Dilution.** If honest people place no value on fake money diluting supply, `passive`/`farm` becomes one.
   - **Council seats.** Their value to the coalition does not change best responses in this menu.

## Open next steps

- Register confirmatory hypotheses for points 1 and 3 on reserved seeds.
- Sweep verdict accuracy, fine, liability scope, reward share and `excludeLiable` (persona non grata). These are simulation parameters, so each value needs new runs.
- Add a patient coalition strategy (fakes go dormant to age before acting) and adaptive policies that respond to observed sanctions.
- Lengthen the horizon. Thirty days undervalues long-run honest income and long-run liability.
