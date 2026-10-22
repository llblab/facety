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

- `fineMode: "chain"` voids the false subject's entire Self-ID chain through `FacetyModel.voidSelfIdChain`. Unspent rights burn, and XP credited by the chain is revoked from the subject and every guarantor recipient. Each liable party owes one coin per voided act (at least one), so the sanction grows with how long the fake operated. `liability: "inviter-chain"` adds the inviter and the inviter's guarantors. The model does not yet let those guarantors see or cancel a pending invitation, so this wave can fine people who had no chance to prevent the fraud.

**Defaults** follow the protocol owner's rules (§21.1, §26.5): `fineMode: "chain"`, `liability: "inviter-chain"`, stake 1 FACY, reward share 0.5.

**Chekharda ladder** (`procedure: "chekharda"`, owner rule §26.5):

- Position 1 is the challenger with `stake`. Each further entrant needs strictly more XP than the previous one and stakes `ceil(previous × (1 + stakeGrowth))`.
- Honest candidates, scanned from the lowest eligible XP up to `maxScan`, receive a private signal of the truth. Its accuracy is `closeSignalAccuracy` for acquaintances of the accused (within two hops) and `signalAccuracy` otherwise. An optional public reputation prior (`reputationWeight`, the trust-propagation percentile of the accused versus the challenger) adjusts the belief.
- A candidate joins the side it believes when `belief × stake below > (1 − belief) × (own stake + xpValue × own XP / 2)`. Coalition members join the coalition side whenever eligible, since a disposable identity risks nothing personal.
- The last unopposed side wins, unless the ladder reaches `councilDepth`. Then the active Council votes by majority: honest members by belief, coalition members for the coalition.
- Each winner takes the stake of the entrant directly below. A losing top entrant's stake is burned (assumption for an OPEN case). Losers lose half their XP.
- The verdict then applies the ordinary sanctions. Counters: `sanctions.ladderEntries`, `ladderDepth`, `councilInterventions`.

**Timed Chekharda** (`procedure: "chekharda-timed"`, owner rule §26.5):

- A challenge opens a dispute and freezes the accused's unspent rights. It resolves when `disputeWindowHours` (168) pass after the last move, when the Council depth is reached, or at `maxRounds`.
- Each day, up to `roundsPerDay` positions can be taken. For each position, `noticeBase × N × (1 + height)` distinct subjects notice the dispute, where height is the largest entrant XP over mean network XP. Honest noticers' signal accuracy rises by `evidenceGain × height`.
- The next position goes to a willing eligible noticer chosen by `entrantChoice`: `lowest`, `highest` (the most senior first) or `random`. Coalition members join to defend with probability `activity.attackers.defend`, and with `social.attentionFeedback` every entrant becomes a screening target.
- Disputes still open at the horizon are counted as `sanctions.disputesOpen`; mooted ones (the accused removed meanwhile) as `disputesMooted`.

**Evidence and clusters:**

- `evidence: "public-proof"` replaces private signals with one public proof per dispute, correct with `proofStrength`, that every noticer and Council member sees.
- `clusterFollowUp: true` makes the most senior winning entrant of an upheld dispute challenge each entrant who defended the proven fake, subject to the XP gate.

The default `procedure` stays `"one-step"`, with its `accuracy` parameter, so that threshold studies can vary accuracy directly. The ladder derives accuracy instead; see insight F13.

The one-step procedure deliberately abstracts Chekharda to one step: no escalation, Council review, appeal or evidence procedure. All sanctions go through `FacetyModel`. A wrong verdict can invalidate a genuine person, and that harm is counted (`sanctions.wrongfulInvalidated`).

## Deviant groups and payoff facts

`deviants: { share, honest?, attackers? }` marks a seeded subset of each cohort's **initial operators** (at least one when a cohort exists). The fake subjects they control follow the deviant strategy too. Recruited genuine people follow their cohort profile. Deviant activity is specified relative to `DEFAULT_ACTIVITY` with its own schedule; cohort perturbations do not apply to it. Marking without a strategy changes no behavior, which a regression test checks.

Each run reports `agents[cohort][group]` for groups `conformist` (initial operators), `deviant` (initial operators) and `recruit` (later genuine operators), plus a `system` record:

- **Group facts:** operators, subjects, accepted/invalidated/false subjects, liquid and Emitter FACY, debt, FACY and debt held by false subjects, XP, Council seats, effort, converted rewards, fines collected or turned into debt, XP halvings, challenge rewards received, and off-protocol bribes paid or received.
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

## Deterrence thresholds

Declare the rule-following attacker strategy as `reference: { "attackers": "abstain" }`. `deterrenceSummary(result, analysis)` then reports:

- **Per honest strategy:** each fraud strategy's paired payoff gain over the reference, and whether that strategy deters every fraud strategy (all significantly worse).
- **Per equilibrium of the finite menu:** fraud probability, honest value, mean wrongful and false invalidations, and the **fraud premium**, meaning the attackers' equilibrium value minus what the reference earns against the same honest mix.
- **Verdict:**
  - `deterred`: no equilibrium pays a premium, and some honest strategy deters;
  - `fraud-pays`: some equilibrium pays a positive premium;
  - `premium-free-without-clear-deterrent`: no premium, but no honest strategy clearly deters;
  - `unresolved`: no equilibrium was found.

When the reference is in the equilibrium support, the attackers' indifference forces a zero premium. Fraud can then be frequent and still earn nothing above rule-following, while honest people pay for vigilance. Report the honest value next to the premium.

`runGameGrid(spec, { axes, workers })` (CLI `game-grid game.json axes.json`) reruns the whole game for every combination of base parameters, such as `sensitivity`, `falsePositiveRate` or `disputes.accuracy`. All cells share replica seeds and one worker pool, and each cell gets a deterrence summary. Cells are independent games: neighboring verdicts locate a threshold, but a single grid is exploratory, not a confirmed boundary.

Each profile also reports a **fraud budget**: the mean share of minted rights created by false identities (`falseMintedShare`), the share of circulating supply they hold (`falseCirculatingShare`), and the coalition's Council share. Equilibria report their expected values.

`assessViability(deterrence, criteria)` (CLI `grid-viability grid.json [criteria.json]`) adds declared welfare criteria to the deterrence verdict: a minimum honest retention (equilibrium honest value divided by the fraud-free value, default 0.5) and a maximum of wrongful invalidations per run (default 1). Fraud can earn no premium while honest people are ruined by dispute abuse or false vetoes, so report viability, not just deterrence. Optional fraud-budget limits, `maxFalseMintedShare` and `maxCoalitionCouncilShare`, default to off (1); a typical declared budget is `0.2` and `0.5`. The [deterrence-threshold study](../studies/2026-10-22-deterrence-threshold/README.md) shows both failure modes.

## Limits

- An equilibrium of a finite menu is not an equilibrium of the full game. Untried strategies can beat every listed one.
- Population best responses treat a cohort as one coordinated player. Individual incentives come from the deviation tests.
- Strategies are fixed activity profiles and schedules, not adaptive policies conditioned on observed state. Adaptive agents remain on the backlog.
- The dispute layer is a declared abstraction of OPEN protocol procedures. Its accuracy, fines, liability and rewards are assumptions to sweep, not protocol facts.
- Payoffs cover the simulated horizon only. Later earnings, reputation outside the protocol, legal risk and market prices count only to the extent the valuation expresses them.
