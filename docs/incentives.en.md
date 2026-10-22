# Incentive direction: protocol facts before utility claims

This document owns the bounded decision-fork harness and retained-fact reader in `src/incentives.mjs`, conditional terminal analysis in `src/incentive-payoffs.mjs`, and evaluator-only ownership counterfactuals in `src/incentive-ownership.mjs`. The [protocol](facety.protocol.en.md), especially sections 2, 23 and 34, supplies the intended incentive and useful-coordination thesis. [Model semantics](simulator.en.md) owns the implemented transitions. This harness neither adds a protocol rule nor proves a network effect.

## Three different claims

1. Protocol actions change FACY, XP and responsibilities in particular ways. Deterministic traces can establish these accounting facts.
2. Those actions are privately preferable to alternatives. This requires explicit preferences, effort valuation, opportunity costs and expected losses.
3. Additional participation benefits other users through useful coordination or applications. This requires a separate application-value model and, for real-world claims, evidence about use.

Reward growth, subject count, graph density and aggregate XP are not substitutes for the third claim. An imposed formula such as value proportional to squared population would assume the desired network effect rather than discover it.

## Run the bounded example

```sh
node examples/incentives.mjs
```

The example writes one `facety-incentive-forks/v1` JSON artifact to stdout and does not write files. It is not the general simulator CLI.

```js
import { runIncentiveForks } from './src/incentives.mjs';

const measured = runIncentiveForks({ xpFinality: 'terminal' });
console.log(measured.comparisons);
```

`xpFinality` accepts the model's `terminal` or `immediate` policy. All other policies and times are fixed and recorded. In particular, guarantee fees are zero; this is an explicit fixture assumption, not a closed protocol OPEN question. Unknown options, including prices, arbitrary graph/state injection and unimplemented policy controls, fail validation.

The scripts are deterministic. Repeating them tests replay, not a statistical sample or independent corroboration.

**Timing note:** the fixture and its measured tables use the superseded 3/7-day schedule (`LEGACY_FIXTURE_TIMING`: spend 72 h, conversion 168 h, no invitation freeze, XP kept on link break). They remain valid as recorded measurements under that schedule. Porting the fixture to the selected one-day windows is a backlog item.

## Common prefix and alternatives

Each branch starts with independent fresh model instances and replays exactly the same prefix:

- Two accepted, trusted genesis subjects, `sponsor` and `peer`, begin with no money or XP.
- The peer proposes a guarantee to the sponsor, and the sponsor confirms it.
- The peer performs Self-ID before the sponsor, making the peer active when the sponsor's act snapshots its guarantor.
- All work is charged, including this common prefix.

The people are assumed genuine in this research fixture; their existence or uniqueness is not proved by a path or by a protocol record. Every economic and graph-changing protocol action uses `FacetyModel`.

At day 3, the branches diverge:

- Wait (`wait-collector`): Keep the sponsor's emission and convert it on day 7.
- Invite (`invite-only`): Charge recruitment work, burn the sponsor's eligible emission for an invitation, and let the newcomer accept. Invitation lineage does not create a guarantee.
- Invite and guarantee (`invite-and-guarantee`): Perform the same admission, then establish a separate two-sided sponsor-to-newcomer guarantee.

The peer converts its own emission on day 7 in every branch. In the two admission branches, the newcomer performs one Self-ID on day 4 and converts that act on day 11. There are no additional daily submissions, market trades, inspections or judicial verdicts.

Named snapshots at days 0, 3, 4, 7 and 11 retain subjects, Self-ID rights, both graphs, Council membership and an audited monetary ledger. They are sparse checkpoints, **not daily histories** accepted by discovery or paired-control analysis. Actions, model events and per-subject work remain available for inspection.

## Measured terminal facts

With default unit action weights, both XP-finality choices have the following day-11 outcomes:

| Alternative | Sponsor FACY | Sponsor XP | Sponsor effort | Newcomer FACY |
| --- | ---: | ---: | ---: | ---: |
| Wait for Collector | 1 | 1 | 3 | Not admitted |
| Invite only | 0 | 1 | 4 | 1 |
| Invite and guarantee | 0 | 2 | 5 | 1 |

Effort is illustrative weighted work, not calibrated person-hours or money. Recruitment is one charged action, not an empirical human-acquisition cost. The sponsor's additional effort relative to waiting is therefore 1 or 2 units in this fixture, including the saved conversion action.

The newcomer performs its own acceptance, Self-ID and conversion work; it also confirms the guarantee in the third branch. The newcomer's FACY is not sponsor income. Per-subject accounting prevents silently treating pooled honest-cohort activity as the sponsor's private cost or payoff.

Invitation alone gives the sponsor no additional terminal XP from the newcomer. The extra XP in the third branch comes from the separate qualifying guarantee and the newcomer's completed identity work. Under terminal finality, consuming the sponsor's act awards its own XP on day 3 rather than day 7, while the newcomer's guaranteed XP arrives on day 11. Under immediate finality, those credits arrive earlier. The timed snapshots preserve this distinction.

`comparisons` reports treatment-minus-waiting differences. `privateUtility`, `expectedLiability` and `networkExternality` remain `null`. Observed debt zero means no debt was imposed in the script; it does not estimate expected future losses.

## A conditional payoff boundary, not an assumed result

For an explicitly chosen **terminal linear-payoff illustration**, let:

- FACY value `P`: Utility value of one liquid FACY at the terminal horizon.
- XP value `v`: Utility value of one additional terminal XP, ignoring rank discontinuities.
- Work cost `c`: Utility cost per illustrative work unit.
- Benefits `B_I` and `B_G`: The sponsor's additional private benefits from admission and the added guarantee.
- Losses `L_I` and `L_IG`: Additional expected private losses relative to waiting, supplied separately rather than inferred from no verdicts.

If earlier authority and intermediate cash-flow timing have no additional value, the measured differences give:

```text
U(invite-only) - U(wait) = B_I - P - c - L_I
U(invite-and-guarantee) - U(wait) = B_I + B_G + v - P - 2c - L_IG
```

These equations are conditional bookkeeping for the declared utility illustration, not an implemented market or a universal utility function for XP. Actual procedural XP can have rank-dependent, time-dependent and strategic value. Different horizons, participant behavior and liability procedures can change the measured vectors as well as their valuations.

A concrete counterexample to unconditional privately profitable recruitment is already available: choose `P > 0`, `v = B_I = B_G = 0`, nonnegative work costs, no extra value for earlier authority and zero expected penalties. Both recruitment alternatives lose to waiting even though all subjects are assumed genuine and no fraud succeeds. Native tests exercise this witness using the measured vectors. External benefits to other people can still exist; this sponsor need not capture them.

Conversely, sufficient private connection benefits or authority value can reverse the inequality. That establishes only a preference comparison among these scripts under the stated assumptions. It does not show that farming, collusion, exit or another strategy is less attractive, nor that any resulting equilibrium improves the whole network.

## Offline evaluation under declared preferences

```sh
node examples/incentive-payoffs.mjs
```

This second JSON example generates the measured forks once, serializes them, and revalues the retained data under five explicitly illustrative preference sets. It includes a no-incentive control, liquidity preference, an authority break-even point, a point above that threshold and unknown authority value. These are not calibrated prices or observed human preferences.

```js
import { evaluateIncentivePayoffs } from './src/incentive-payoffs.mjs';

const analysis = evaluateIncentivePayoffs(measured, {
  facyValue: 1,
  xpValue: 3,
  workUnitCost: 1,
  admissionBenefit: 0,
  guaranteeBenefit: 0,
  expectedLosses: { 'invite-only': 0, 'invite-and-guarantee': 0 },
});
console.log(analysis.comparisons, analysis.choiceSummary);
```

The evaluator returns `facety-incentive-payoffs/v1` with model identifier `terminal-linear-risk-adjusted-v1`. Every preference field and both loss entries are mandatory; explicitly use `null` for an unknown input. FACY value and work cost must be non-negative. XP value and private benefits may be signed. Expected losses are signed incremental utility losses relative to waiting: a negative entry means a declared avoided loss, not negative protocol debt. All supplied values must use common utility units. Loss adjustments must not double-count effects already included in the priced balances or work.

The function prices only the sponsor's measured terminal FACY/XP changes, additional work, declared private benefits and declared loss adjustments. It does not set omitted timing or rank effects to zero in a real-world model; those effects are outside this chosen functional. `fullDynamicUtility` and `networkExternality` remain `null`.

A component stays unknown when its relevant valuation is null. A precisely zero factual exposure contributes zero even if its valuation is unknown: invitation alone has zero additional terminal XP, so unknown `xpValue` does not prevent pricing that alternative. The preference itself remains null in the retained manifest. Unknown expected losses are never filled from observed debt zero.

For `P=1`, `c=1`, zero private benefits and zero expected losses, the measured differences are:

```text
Invite only:           -2
Invite and guarantee:  v - 3
```

The second alternative has an XP break-even value of `3`; the first is not sensitive to terminal XP valuation. A threshold can be computed when the other components are known even if `xpValue` itself is unknown. This is an algebraic boundary of the selected functional, not a measured valuation of authority.

`choiceSummary.exactNumericalMaximizers` lists maxima only when all three conditional scores are known. Otherwise it is null. `knownMaximizers` refers only to available scores. `candidateBestResponses` conservatively retains every unknown score and every known score in the declared band of the best known score. It does not perform interval reasoning or claim that this is a sharp set of feasible optima. Waiting has a known zero difference from itself; this does not estimate its absolute utility.

The optional third argument `{ comparisonTolerance }` defaults to zero and is recorded. Arithmetic uses finite IEEE-754 numbers and rejects overflow. Nonzero tolerance creates a declared analysis band: a nonzero difference inside it is `within-tolerance`, not exact indifference, and the raw numerical value is not rounded away. Exact numerical ties also do not prove equality of real human preferences. The band is not a confidence interval.

### Retained-data checks and provenance

`readIncentiveComparisons(artifact)` is the shared fact-extraction contract. It accepts the current bounded fixture, requires its explicit policy/schedule and all five ordered checkpoints through day 11, and checks the used prefix/final accounting and graph snapshots. Strategy labels must agree with their admission, guarantee and sponsor-emission outcomes. Alternatives must share the same funded prefix, setup actions and effort units. Per-subject work is reconstructed from recorded actions with `EffortLedger`; stored summaries must agree.

The fact reader ignores cached `artifact.comparisons`, so editing that cache cannot substitute private returns or free work. Valid branch ordering and object-key formatting changes do not change the result. The evaluator neither reruns protocol transitions nor mutates the input artifact or supplied preferences. Retain the full original artifact as well as the analysis and implementation revision.

Malformed or incomplete source artifacts are rejected rather than silently using an earlier endpoint. Unknown preferences instead produce explicit unknown analysis components. These are different failure classes.

Validation is not authentication. It does not establish the truth of input data or independently verify every intermediate protocol transition, judicial outcome or human identity. The original producer and provenance remain part of the evidence boundary.

## Evaluator-only ownership counterfactuals

```sh
node examples/incentive-ownership.mjs
```

`compareIncentiveOwnership(artifact)` in `src/incentive-ownership.mjs` returns `facety-incentive-ownership/v1`. It reads the checked retained forks once and attaches two explicit evaluator worlds to the same protocol branches:

- Independent newcomer: The sponsor, peer and newcomer are assumed distinct genuine people and separate operators.
- Sponsor-controlled newcomer: The two genesis people remain genuine, but the sponsor is assumed to operate the newcomer as a false additional identity. This deliberately replaces the source fixture's genuine-newcomer assumption; it is not a discovery about that person's identity. Common custody alone does not establish false personhood.

Neither mapping is supplied to `FacetyModel`, an observation generator or a defense algorithm. The source artifact is not modified. Shared `protocolBranches` retain the same checkpoints and provided event logs for both worlds (an omitted log is explicitly null; event contents are not authenticated), rather than pretending to have executed a second admission or verified that a fabricated identity could complete Self-ID. Abstract protocol acceptance is held fixed. Biometric feasibility, detection and court outcomes remain outside this overlay.

Work is also a declared counterfactual, not free relabeling. The controlled world replaces the recorded sponsor `recruitHuman` preparation charge with one `fabricateIdentity` charge at the declared source weight. The source weight is interpreted with the native micro-unit effort contract. Other actions and their recorded costs remain unchanged. Each `workActions` row keeps the subject actor, assumed operator, recorded action/cost and evaluated action/cost. The overlay requires exactly one sponsor recruitment step at the decision checkpoint for each admission, and none for waiting; ambiguous preparation is rejected.

With default illustrative weights, terminal custody and work are:

| Alternative | Independent FACY | Independent work | Controlled FACY | Controlled work |
| --- | ---: | ---: | ---: | ---: |
| Wait | 1 | 3 | 1 | 3 |
| Invite only | 0 | 4 | 1 | 7 |
| Invite + guarantee | 0 | 5 | 1 | 9 |

These are **sponsor-operator** totals. The sponsor's own protocol wallet still has zero FACY after admission. The controlled world's one FACY stays in the newcomer wallet and is counted as sponsor-held only under the explicit custody assumption. No extra minting or transfer was executed. The peer's money/work stays with the peer.

Relative to waiting, independent admission changes sponsor FACY/work by `(-1, +1)` or `(-1, +2)`; controlled admission changes them by `(0, +4)` or `(0, +6)`. Recovering custody of the newcomer's receipt is therefore not free: all newcomer acceptance, Self-ID, conversion and, when applicable, guarantee-confirmation work belongs to the controlling operator. Fabrication/recruitment weights remain illustrative, not calibrated acquisition costs.

XP stays in `xpBySubject`: the sponsor has 1 or 2 terminal XP, and an admitted newcomer has its own 1 XP. Holding both subjects does not turn them into a single subject with summed authority. Population reports similarly separate subjects, assumed operators and assumed genuine people. Both worlds add a protocol subject; only the independent world assumes an additional genuine person/operator.

Operator work uses authoritative integer `effortMicroUnits`, with a displayed `effort` value and accepted-action count. Overflow is rejected even when the individual subject ledgers are safe. These are post-hoc custody/work totals, not proof that the script fits a shared human budget, realistic preparation cost or legal admission process.

### Conditional ownership witnesses

The example explicitly chooses two cash/work-only terminal illustrations: `P=1,c=1` and `P=10,c=1`. It assigns zero value to every subject's XP, private benefits, relative expected losses, and extra timing/rank effects **for these illustrations only**, not by inference from the trace. The accounting analysis itself leaves private utility, expected liability, full dynamic utility and network externalities unknown.

Under those declared zero-other-contribution conditions, the controlled-minus-independent sponsor comparison is:

```text
Invite only:          P - 3c
Invite and guarantee: P - 4c
```

At `P=1,c=1`, extra controlled work outweighs custody recovery: the admission scores relative to waiting are `-2,-3` for independent admission and `-4,-6` for controlled admission. At `P=10,c=1`, controlled admission is less costly (`-4,-6` versus `-11,-12`), but every admission is still worse than waiting's zero difference in that illustration.

Thus a relative private preference for the lower-quality outcome can appear without proving that anyone would adopt either strategy. Different preparation costs, authority values, private benefits or expected penalties can reverse these inequalities. No full operator-utility evaluator, actual preference estimate, endogenous adoption or successful attack is supplied by this study.

## Evidence boundary

The harness provides actual protocol consequences for explicit local alternatives. It does not estimate FACY prices, Treasury D effects, liability probabilities, endogenous recruitment, optimal attacks, collective equilibria or application-level network value. The underlying cohort runner also uses configured activity rates rather than a payoff-maximizing choice rule.

To support the stronger incentive thesis, private choices must be compared against credible competing strategies under declared assumptions, and useful externalities must be evaluated independently of rewards and population counts. A favorable local comparison is not proof of the real-world network-effect thesis. Current executable work remains in the canonical [backlog](../BACKLOG.md).
