# Strategy games and incentive analysis

This document owns `src/games.mjs`, the dispute layer, deviant groups and payoff facts in `src/experiment.mjs`. [Incentive direction](incentives.en.md) owns the deterministic single-decision forks. [Evidence](evidence.en.md) owns confirmatory hypothesis tests. A game here answers a different question from a scenario probability: **given a declared menu of strategies and explicit valuations, which strategies are best responses, which profiles are equilibria, and does an individual gain by deviating?**

## Why randomness alone cannot model incentives

A scripted run fixes everyone's behavior; a higher success frequency for one script says nothing about what anyone would choose. In a game, randomness models only uncertainty in the world (detection, verdicts, timing). Choices come from comparing strategies:

1. **Strategy menus.** Each role (`honest`, `attackers`) declares named strategies: activity profiles plus optional day schedules (for example *farm, then go quiet from day 12*).
2. **Payoff facts.** Every profile (one strategy per role) is simulated over shared replica seeds. Each run retains protocol facts per operator group, not utilities.
3. **Valuation.** Utilities are explicit linear weights on those facts, applied offline. Changing the valuation never reruns the simulation, so conclusions can be swept across weights.
4. **Analysis.** Population best responses, pure and mixed equilibria of the finite menu, and individual deviation tests.

## Dispute layer (needed for any deterrence)

Without sanctions/rewards or separately supplied civic/future utility, inspection costs effort and earns no direct money in this model. That accounting fact does not exclude unpaid human investigation under other preferences. When `disputes.enabled` is true:

- An observer without veto authority who sees a suspicious act **and has more effective XP than the act owner** may challenge, with probability `activity.<cohort>.challenge`. A challenge costs one `challenge` effort unit and requires the declared `stake` in liquid FACY.
- An environment verdict is correct with probability `accuracy`. It uses evaluator truth, as the observation model does; no protocol code reads the truth labels.
- **Upheld** (the subject is found false): the subject is invalidated; each liable party (`liability`: `subject`, `guarantors`, or `guarantors-and-inviter`) pays `fine`. A `rewardShare` of what is actually collected is transferred to the challenger and the rest goes through `penalize` (burn, then debt), with XP halving. `excludeLiable: true` also invalidates liable real guarantors, which models the "persona non grata" sanction.
- **Rejected:** the challenger pays the stake and, if `loserHalvesXp`, has XP halved.
- Invalidated subjects stop acting; their open invitations lapse.
- `fineMode: "chain"` voids the false subject's entire Self-ID chain through `FacetyModel.voidSelfIdChain`. Unspent rights burn, and XP credited by the chain is revoked from the subject and every guarantor recipient. Each liable party owes one coin per voided act (at least one), so the sanction grows with how long the fake operated. `liability: "inviter-chain"` adds the inviter and the inviter's guarantors. Guardian review/cancellation during the invitation freeze is implemented. Historical no-freeze study arms lacked that preventive opportunity; they are not results of the later default.

**Defaults** implement the owner's chain-cut/liability directions (§21.1) as research references: `fineMode: "chain"`, `liability: "inviter-chain"`. Stake 1 FACY and reward share 0.5 are model assumptions, not fully selected economic rules.

**Chekharda ladder** (`procedure: "chekharda"`, owner rule §26.5):

- Position 1 is the challenger with `stake`. Each further entrant needs strictly more XP than the previous one and stakes `ceil(previous × (1 + stakeGrowth))`.
- Honest candidates, scanned from the lowest eligible XP up to `maxScan`, receive a private signal of the truth. Its accuracy is `closeSignalAccuracy` for acquaintances of the accused (within two hops) and `signalAccuracy` otherwise. An optional public reputation prior (`reputationWeight`, the trust-propagation percentile of the accused versus the challenger) adjusts the belief.
- A candidate joins the side it believes when `belief × stake below > (1 − belief) × (own stake + xpValue × own XP / 2)`. Coalition members join the coalition side whenever eligible, since a disposable identity risks nothing personal.
- The last unopposed side wins, unless the ladder reaches `councilDepth`. Then the active Council votes by majority: honest members by belief, coalition members for the coalition.
- Each winner takes the collectible amount of the stake directly below. `stakeBacking: "unsecured"` is the legacy default: checking funds does not reserve them, concurrent cases reuse balances and later spending/penalties reduce collection. `"reserved"` is an unselected fully collateralized reference using model custody. Winners recover their own collateral, lower losing stakes transfer, losing tops burn and mooted cases refund. Unpaid unsecured stake is not debt. Losers receive the configured XP halving. See [custody and priority assumptions](simulator.en.md#dispute-stake-custody-reference); conservation alone does not prove backing.
- The verdict then applies the ordinary sanctions. Counters: `sanctions.ladderEntries`, `ladderDepth`, `councilInterventions`.

**Timed Chekharda** (`procedure: "chekharda-timed"`, owner rule §26.5):

- A challenge opens a dispute and freezes the opening snapshot of the accused's unspent rights; subsequently created rights are not automatically locked in this reference. It resolves when `disputeWindowHours` (168) pass after the last move, when the Council depth is reached, or at `maxRounds`.
- Each day, up to `roundsPerDay` positions can be taken. For each position, `noticeBase × N × (1 + height)` distinct subjects notice the dispute, where height is the largest entrant XP over mean network XP. Honest noticers' signal accuracy rises by `evidenceGain × height`.
- The next position goes to a willing eligible noticer chosen by `entrantChoice`: `lowest`, `highest` (the most senior first) or `random`. Coalition members join to defend with probability `activity.attackers.defend`, and with `social.attentionFeedback` every entrant becomes a screening target.
- Disputes still open at the horizon are counted as `sanctions.disputesOpen`; mooted ones (the accused removed meanwhile) as `disputesMooted`. Case reasons distinguish the selected-window timeout from experimental round/scan termination limits, incomplete entry and Council intervention. A cap-triggered verdict is not evidence that the selected seven-day finality window elapsed.

**Evidence and clusters:**

- `evidence: "public-proof"` supplies one fallible common environment signal per dispute, correct with `proofStrength`, seen by every noticer/Council voter. The historical option name does not mean cryptographic proof, an agent-visible truth flag or a complete evidence-admission process.
- `clusterFollowUp: true` makes the most senior winning entrant of an upheld dispute challenge each defender, subject to the XP gate. This is a scripted stress-test channel, not a selected guilt-by-association rule or a standard of proof of knowingly obstructing evidence.

The default `procedure` stays `"one-step"`, with its `accuracy` parameter, so that threshold studies can vary accuracy directly. The ladder derives accuracy instead; see insight F13.

The one-step procedure deliberately abstracts Chekharda to one step: no escalation, Council review, appeal or evidence procedure. All sanctions go through `FacetyModel`. A wrong verdict can invalidate a genuine person, and that harm is counted (`sanctions.wrongfulInvalidated`).

## Deviant groups and payoff facts

`deviants: { share, honest?, attackers? }` marks a seeded subset of each cohort's **initial operators** (at least one when a cohort exists). The fake subjects they control follow the deviant strategy too. Recruited genuine people follow their cohort profile. Deviant activity is specified relative to `DEFAULT_ACTIVITY` with its own schedule; cohort perturbations do not apply to it. Marking without a strategy changes no behavior, which a regression test checks.

Each run reports `agents[cohort][group]` for groups `conformist` (initial operators), `deviant` (initial operators) and `recruit` (later genuine operators), plus a `system` record:

- **Group facts:** operators, subjects, accepted/invalidated/false subjects, liquid/Emitter FACY, `stakeFacy` in pending custody, debt, false-subject liquid/custody/debt, XP, Council seats, effort, converted rewards, actually collected/debt fines, XP halvings, received transfers and off-protocol bribes. Custody refunds are not profit; stake losses are separately retained actual transfers/burns, not fictitious fine collection.
- **System facts:** supply, burned FACY, pending `stakeFacy` and `falseStakeFacy`, false liquid holdings/conversions/accepted subjects and coalition Council seats. False circulating holdings include still-owned reserved stakes, rather than hiding them when they leave liquid balances.

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

Choose weights to express what is actually valued, and state them. Pending stake custody can be valued explicitly with `stakeFacy`/`falseStakeFacy`; it is neither disposable liquidity nor an already realized loss. A nonzero weight on a missing/non-finite saved fact makes that utility unknown; zero-weight absent fields do not corrupt older valuations. This does not silently impute missing historical custody as zero. For example, debt left on an exposed fake is uncollectible from an attacker who abandons it, so `debt: -1, falseDebt: 1` charges only debt on genuine identities.

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

Each profile also reports a **fraud budget**: the mean share of minted rights created by false identities (`falseMintedShare`), the share of circulating supply they hold (`falseCirculatingShare`), and the coalition's Council share. A mean requires all declared replicas and valid observed shares/counts. Missing, null, non-finite or out-of-domain data make that metric `null`; they are not zero observations and known subsets are not averaged as if complete. Explicitly recorded zero Council seats and zero attacker seats retain the existing zero-share convention; a missing count does not.

Equilibrium expectations require a known measurement in every positive-probability profile. A zero-probability profile contributes nothing and may have missing data; even tiny positive support requires its observation. This applies to fraud budgets and sanction expectations. Saved schema-v1 data without newer budget fields remain analyzable, but those unsupported budget claims remain unknown.

**Current residuals:** this is not comprehensive saved-record completeness validation. Mandatory payoff/sanction summaries still aggregate retained observations even when fewer replicas than declared remain, and partially absent raw sanctions can throw before profile-level unknown handling. At the assessment boundary an unknown summary metric fails, but that does not certify its upstream sample completeness. Both boundaries remain in the [next correctness cohort](../BACKLOG.md).

`assessViability(deterrence, criteria)` (CLI `grid-viability grid.json [criteria.json]`) adds declared welfare criteria to the deterrence verdict: a minimum honest retention (equilibrium honest value divided by the fraud-free value, default 0.5) and a maximum of wrongful invalidations per run (default 1). Fraud can earn no premium while honest people are ruined by dispute abuse or false vetoes, so report viability, not just deterrence. Optional fraud-budget limits, `maxFalseMintedShare` and `maxCoalitionCouncilShare`, default to off (1); a typical declared budget is `0.2` and `0.5`. With a limit below 1, missing measurements fail that criterion instead of silently passing; with the limit disabled, the output still reports the missing metric as `null`. A null-driven failure means insufficient evidence, not a measured violation.

Retention requires a positive finite fraud-free utility baseline and finite equilibrium values. Zero/negative/invalid baselines leave the ratio undefined (`null`) and fail the mandatory retention criterion; missing/invalid wrongful-sanction counts likewise cannot pass. This is an explicitly declared ratio criterion, not an affine-invariant welfare measure or a calibrated claim about usefulness. Analyst limits must be finite and non-negative; share caps must be in [0,1]. Targets above one for relative utility and fractional limits on mean sanctions remain legal. These checks do not choose protocol rules. The [saved-facts diagnostic](../studies/2026-10-23-saved-facts/README.md) retains the original false-safe witnesses and bounded complete-data preservation. The [deterrence-threshold study](../studies/2026-10-22-deterrence-threshold/README.md) shows both failure modes.

## Limits

- An equilibrium of a finite menu is not an equilibrium of the full game. Untried strategies can beat every listed one.
- Population best responses treat a cohort as one coordinated player. Individual incentives come from the deviation tests.
- Strategies are fixed activity profiles and schedules, not adaptive policies conditioned on observed state. Adaptive agents remain on the backlog.
- The dispute layer is a declared abstraction of OPEN protocol procedures. Its accuracy, fines, liability and rewards are assumptions to sweep, not protocol facts.
- Payoffs cover the simulated horizon only. Later earnings, reputation outside the protocol, legal risk and market prices count only to the extent the valuation expresses them.
