# Strategy games and incentive analysis

This document owns `src/games.mjs`, the dispute layer, deviant groups and payoff facts in `src/experiment.mjs`. [Incentive direction](incentives.en.md) owns the deterministic single-decision forks. [Evidence](evidence.en.md) owns confirmatory hypothesis tests. A game here answers a different question from a scenario probability: **given a declared menu of strategies and explicit valuations, which strategies are best responses, which profiles are equilibria, and does an individual gain by deviating?**

## Why randomness alone cannot model incentives

A scripted run fixes everyone's behavior; a higher success frequency for one script says nothing about what anyone would choose. In a game, randomness models only uncertainty in the world (detection, verdicts, timing). Choices come from comparing strategies:

1. **Strategy menus.** Each role (`honest`, `attackers`) declares named strategies: activity profiles plus optional day schedules (for example *farm, then go quiet from day 12*).
2. **Payoff facts.** Every profile (one strategy per role) is simulated over shared replica seeds. Each run retains protocol facts per operator group, not utilities.
3. **Valuation.** Utilities are explicit linear weights on those facts, applied offline. Changing the valuation never reruns the simulation, so conclusions can be swept across weights.
4. **Analysis.** Population best responses, pure and mixed equilibria of the finite menu, and individual deviation tests.

## Dispute layer (needed for any deterrence)

Without sanctions, inspection costs effort and earns nothing, so no rational agent inspects. When `disputes.enabled` is true:

- An observer without veto authority who sees a suspicious act **and has more effective XP than the act owner** may challenge, with probability `activity.<cohort>.challenge`. A challenge costs one `challenge` effort unit and requires the declared `stake` in liquid FACY.
- An environment verdict is correct with probability `accuracy`. It uses evaluator truth, as the observation model does; no protocol code reads the truth labels.
- **Upheld** (the subject is found false): the subject is invalidated; each liable party (`liability`: `subject`, `guarantors`, or `guarantors-and-inviter`) pays `fine`. A `rewardShare` of what is actually collected is transferred to the challenger and the rest goes through `penalize` (burn, then debt), with XP halving. `excludeLiable: true` also invalidates liable real guarantors, which models the "persona non grata" sanction.
- **Rejected:** the challenger pays the stake and, if `loserHalvesXp`, has XP halved.
- Invalidated subjects stop acting; their open invitations lapse.

This deliberately abstracts Chekharda to one step: no escalation, Council review, appeal or evidence procedure. All sanctions go through `FacetyModel`. A wrong verdict can invalidate a genuine person, and that harm is counted (`sanctions.wrongfulInvalidated`).

## Deviant groups and payoff facts

`deviants: { share, honest?, attackers? }` marks a seeded subset of each cohort's **initial operators** (at least one when a cohort exists). The fake subjects they control follow the deviant strategy too. Recruited genuine people follow their cohort profile. Deviant activity is specified relative to `DEFAULT_ACTIVITY` with its own schedule; cohort perturbations do not apply to it. Marking without a strategy changes no behavior, which a regression test checks.

Each run reports `agents[cohort][group]` for groups `conformist` (initial operators), `deviant` (initial operators) and `recruit` (later genuine operators), plus a `system` record:

- **Group facts:** operators, subjects, accepted/invalidated/false subjects, liquid and Emitter FACY, debt, FACY and debt held by false subjects, XP, Council seats, effort, converted rewards, fines collected or turned into debt, XP halvings and challenge rewards received.
- **System facts:** supply, burned FACY, liquid FACY held by false subjects, false converted rewards, accepted false subjects and coalition Council seats.

Controlled fakes count toward their operator's group, because custody pools money. XP stays per subject; Council seats count control of votes.

## Game specification

```json
{
  "id": "inspection-game-pilot",
  "base": { "scenario": "sybil-cone", "days": 30, "disputes": { "enabled": true } },
  "roles": {
    "honest": { "strategies": { "vigilant": { "activity": { "inspect": 3, "challenge": 1 } }, "passive": { "activity": { "inspect": 0 } } } },
    "attackers": { "strategies": { "farm": { "activity": {} }, "farm-then-hide": { "activity": {}, "schedule": [{ "startDay": 12, "endDay": 30, "activity": { "invite": 0 } }] } } }
  },
  "replicas": 24,
  "seed": "label",
  "deviation": { "share": 0.1 },
  "valuation": { "honest": { "facts": { "liquidFacy": 1, "effort": -0.05 }, "system": { "falseLiquidFacy": -0.02 } }, "attackers": { "facts": { "liquidFacy": 1, "debt": -1, "falseDebt": 1 } } }
}
```

Strategy activity overrides `base.activity` for that role. A schedule becomes role-only perturbations, and the base may not contain its own perturbations or deviants. Runs = profiles × (1 + deviations per profile) × replicas, bounded by `maxRuns`. All runs share replica seed labels, so comparisons between profiles are paired.

```sh
node bin/facety.mjs game examples/game.json --workers auto --out results/game.json
node bin/facety.mjs game-analyze results/game.json valuation.json
node bin/facety.mjs game-sweep results/game.json sweep.json   # { valuation, role, kind, key, values }
```

## Valuation

`valuation[role].facts[key]` weights a group fact; `valuation[role].system[key]` weights a shared system fact. Omitted weights are zero, and the normalized valuation is echoed in every analysis. A role's payoff is per initial operator: the summed weighted facts of the initial groups divided by their operators, plus the system terms.

Choose weights to express what is actually valued, and state them. For example, debt left on an exposed fake is uncollectible from an attacker who abandons it, so `debt: -1, falseDebt: 1` charges only debt on genuine identities.

## Analysis

- **Profiles:** mean payoff per role with a bootstrap 95% interval, censored replicas and mean sanction counts.
- **Population best responses:** for each opponent strategy, the role strategy with the highest mean. It is `clear` when the best strategy beats every alternative in more than half of paired replicas (exact sign test; ties and unknowns count against).
- **Pure equilibria** of the finite menu (mutual best responses, `strict` when all are clear) and **mixed equilibria** from support enumeration on the mean payoff bimatrix. Degenerate games with exact payoff ties can have equilibria that support enumeration misses.
- **Individual deviation tests:** in each profile, a deviant subset of a role switches to each alternative strategy while everyone else keeps the profile. Its per-operator payoff is compared, paired, with the same subset conforming. The verdict is `better`, `worse` or `undetermined` (a sign test, so it concerns the median, not the mean). `incentiveCompatible[profile][role]` is `stable` when every deviation is worse and `profitable-deviation` when any is better.
- **Social dilemma flag:** an individual deviation is profitable, but the whole role switching to it lowers that role's payoff, as with free-riding on a public good.
- `sweepValuation` recomputes best responses, equilibria and incentive compatibility while one weight varies.

## Limits

- An equilibrium of a finite menu is not an equilibrium of the full game. Untried strategies can beat every listed one.
- Population best responses treat a cohort as one coordinated player. Individual incentives come from the deviation tests.
- Strategies are fixed activity profiles and schedules, not adaptive policies conditioned on observed state. Adaptive agents remain on the backlog.
- The dispute layer is a declared abstraction of OPEN protocol procedures. Its accuracy, fines, liability and rewards are assumptions to sweep, not protocol facts.
- Payoffs cover the simulated horizon only. Later earnings, reputation outside the protocol, legal risk and market prices count only to the extent the valuation expresses them.
