# Incentive direction: protocol facts before utility claims

This document owns the bounded decision-fork harness and retained-fact reader in `src/incentives.mjs`, conditional terminal analysis in `src/incentive-payoffs.mjs`, and evaluator-only ownership counterfactuals in `src/incentive-ownership.mjs`. The [protocol](facety.protocol.en.md), especially sections 2, 23 and 34, supplies the intended incentive and useful-coordination thesis. [Model semantics](simulator.en.md) owns the implemented transitions. This harness neither adds a protocol rule nor proves a network effect.

**D42 boundary (2026-10-24):** the [selected protocol](facety.protocol.en.md#175-reward-and-rate-limit) now credits ordinary XP at 24-hour maturity without waiting for use and ends the original free veto then. The native model and v1/v2 fixtures below retain their original terminal/immediate credit modes and unspent-veto semantics; they do not implement D42. “Selected terminal” in the fixed P23 design/report means selected at its design date. A8/F45 and all retained numbers remain source-bound, not reclassified or replayed. The owner's later D42 clarification retains the matured own right until separately chosen withdrawal or invitation use, without automatic Collector conversion. A D42 counterpart must honor that resolved choice/provenance and still needs the remaining chronology/frozen-case/prior-credit contracts plus a separately identified design; do not silently mutate the closed existing fixtures/readers.

**WP1 prior3 preparation,2026-10-28 — contract only:** [Same-party incremental receipts](../studies/2026-10-26-trust-topology-condition-map/wp1-incremental-receipts.md) reuses these existing wait/ownership facts; an independent newcomer's income is not automatically inviter collection. Primary lawful cash difference counts foregone conversion once; explicit newborn remittance and genuine joint accounting are not false-alias control. Existing factories/readers still reject maturity/remittance; a closed separately identified counterpart is proposed in the same owner, NOT implemented by this note. Model ordinary unencumbered maturity/transfer ports already exist, full migration/cases remain gated. Transfer effort has no current EffortLedger action: no new global default weight or zero-cost guess. No new research/G1, old data relabel or payoff guarantee.

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

**Timing note:** the fixture and its measured tables use the superseded 3/7-day schedule (`LEGACY_FIXTURE_TIMING`: spend 72 h, conversion 168 h, no invitation freeze, XP kept on link break). They remain valid as recorded measurements under that schedule. It is kept unchanged. The separate one-day counterpart below is implemented; its fresh [F45 diagnostic tables](../studies/2026-10-24-one-day-incentives/README.md#executed-diagnostic-results-f45) remain distinct from these historical measurements.

<a id="one-day-counterpart-contract-p23-not-implemented"></a>

## One-day counterpart contract (P23)

**Design/code fixed before execution, 2026-10-24; source-bound F45 diagnostic tables now retained.** This is the [P23/D39 programme](research-interactions.en.md#root-pair-interaction-inventory) counterpart to the existing one-day port item in [BACKLOG.md](../BACKLOG.md). It changes neither protocol rules nor the legacy fixture described below. “Current-runtime” means the labeled fixed-101/current-link simulator, **not** implementation of D33/D34. Liability, pause, risk caps, correction funding, human preferences and usefulness remain outside this accounting slice.

### Inspected seam and chosen compatibility boundary

The legacy path in `src/incentives.mjs` pins more than two maturity constants: it accepts/records recruitment and admission at the same decision hour, checks five fixed day-based stages, restricts work timestamps and validates the legacy policy. Simply replacing 72/168 with 24 would attempt frozen admission too early or leave misleading stages. `src/incentive-payoffs.mjs` and `src/incentive-ownership.mjs` both use its shared fact reader; the ownership reader additionally requires sponsor recruitment at the named `decision` stage. The three legacy examples and their three original incentive test files retain those contracts; the separate one-day example/test family exercises the new path. No incentive consumer exists in `bin/`; no new general CLI is needed.

**Implemented boundary:** `runIncentiveForks({ xpFinality })`, its default output and v1 acceptance/output behavior stay unchanged. The same owner now exports `runOneDayIncentiveForks({ xpFinality })`. Its output tuple is `schema: "facety-incentive-forks/v2"`, `fixture: "marginal-admission-24h-v1"`. Default XP finality is selected `terminal`; `immediate` is only an explicitly labeled counterfactual comparison, never a protocol option. Do not add arbitrary policy, schedule, state, price, loss, ownership or actor callbacks to either factory.

Run the separate thin example with `node examples/incentive-one-day.mjs`; it emits one v2 JSON artifact without writing files. Both pure consumers below accept it as well as legacy v1. [Implementation and preservation controls](../studies/2026-10-24-one-day-incentives/README.md) record software validation and the separately executed diagnostic report, not human calibration or mechanism confirmation.

The new fixed descriptor records the complete implemented policy: 24-hour spend/conversion/freeze and relation-credit revocation, with the remaining current reference fields explicit. In particular the zero guarantee fee is still a named fixture assumption, not resolution of the production fee question. A future policy/timeline meaning change needs another fixture identity, not a floating interpretation of “current.” Trusted two-person genesis and abstract genuine recruitment remain supplied assumptions, not D35 bootstrap verification or measured acquisition costs.

Rejected alternatives are changing the legacy default/constants in place, accepting a policy/schedule bag, and duplicating a second live fork harness in an example. The existing domain owner should keep funded orchestration and shared checks local, with only a closed two-fixture descriptor where semantics genuinely share. No peer orchestration import, callback/context bag or module split for line count is justified.

### Earliest-feasible fixed timeline

This is an explicit scenario schedule derived from `FacetyModel.createInvitation`, `acceptInvitation`, `convertToCollector` and terminal crediting; native regressions verify its funded boundaries and actor accounting before any research report. Replay the same funded setup on three independent model instances, never inject balances or clone a live graph/model. Continue to compare only waiting, invitation alone and invitation plus a separate two-sided guarantee.

- **0 h — `common-prefix`:** establish peer→sponsor through proposal/confirmation; peer Self-ID precedes sponsor Self-ID, making the peer active for the sponsor's guarantor snapshot. Both rights are initially unspent; genesis acquisition is not priced. Charge setup work by acting subject.
- **24 h — `decision`:** convert the peer's own matured right in every branch first. Waiting converts the sponsor's own right; admission branches charge sponsor `recruitHuman` then burn the sponsor's own matured right to create a targeted invitation. Do **not** accept it here: its new 24-hour freeze is still running. Snapshot an open invitation and no newcomer in admission branches; waiting has no invitation. No liquid FACY or someone else's right substitutes for that funded burn.
- **48 h — `admission`:** accept the invitation at its exact freeze endpoint. In the guarantee branch, sponsor proposes and newcomer confirms the separate relation before the newcomer's Self-ID. Snapshot the admitted newcomer before its fresh identity work. Waiting samples the same clock without inventing work or a participant.
- **48 h — `newcomer-work`:** record one fresh newcomer Self-ID in admission branches. The guarantee branch's eligible sponsor belongs in its recording-time snapshot. This is a later journal position at the same hour, not another legal-event convention. Waiting again performs no invented work.
- **72 h — `horizon`:** convert that newcomer's own now-mature right; preserve all branches through the declared endpoint. No additional daily Self-IDs, vetoes, exits, market trades or verdicts are assumed.

The v2 schedule uses hours, not overloaded v1 day fields: `{ decisionHour: 24, admissionHour: 48, newcomerSelfIdHour: 48, horizonHour: 72 }`. The ordered stage list is exactly `common-prefix`, `decision`, `admission`, `newcomer-work`, `horizon`, with hours `[0, 24, 48, 48, 72]`. Native events use `at`; action/snapshot records use `atHour`. V2 snapshots additionally retain `invitations()` and an `eventCursor` into the retained ordered native event array. Native events are required for this v2 source: the cursor distinguishes the two 48-hour snapshots without inventing sub-hour clocks. It is nondecreasing (equal for waiting's no-ops), bounded by the event array and complete at the horizon. Admission precedes newcomer identity work in the native journal; these checks are not authentication or replay of every transition.

**Important analytical distinction (A8):** with equal 24-hour spend and conversion maturity, earliest invitation and earliest waiting conversion both finalize the sponsor's own terminal XP at 24 h. The old fixture's day-3 versus day-7 own-XP timing advantage is not inherited by this comparison. Newcomer/guarantor credits still depend on the distinct later act/finality. Do not copy the old terminal table or payoff threshold into a “measured one-day” report: even if fresh terminal vectors agree, intermediate timing and physical horizons differ. This three-day sparse script is not daily participation, an optimized earning rate or long-term willingness.

### Reader, provenance and consumer contract

The shared `readIncentiveComparisons` dispatcher admits only the exact legacy v1 tuple and the new v2 tuple, each with its own fixed policy, schedule, stages and used-accounting checks. It must reject cross-labeled or partial sources rather than infer an identity from whichever fields happen to fit. V1's present acceptance region, optional event-log behavior and output shape stay unchanged; v2's invitation/cursor requirements must not leak into v1.

For v2 it checks every snapshot's accounting, actor work, strategy/emission/graph consistency, open-invitation/no-newcomer decision state, admission-before-Self-ID snapshots and full horizon. The finite script's native-event projection (including artifact registration and two-sided guarantee events) and actor/action order must agree with event cursors; reaccounting cannot legitimize extra waiting work or moved recruitment. Check the required boundary distinctions without turning the reader into a general court, identity verifier or complete event-replay engine. Work timestamps must not place newcomer work before admission. Cached `comparisons` remain ignored; object/branch reordering that preserves meaning and JSON transport remain supported.

Only v2 adds producer `provenance` from the existing `src/provenance.mjs` contract and records deterministic/no-draw randomness. Its implementation digest identifies all native source modules; it is not evidence authentication. Preserve supplied source identity during offline analysis, never replace it with the analyzer's current digest or infer human truth from it. Reader checks require well-formed declared identity, not a new authentication or retrospective trust policy. A changed native implementation still limits reproduction and later confirmation; no historical study is automatically replayed/reclassified.

Both downstream analyses retain their existing terminal-linear and evaluator-ownership model meanings. They accept the newly checked source and preserve its `source.schema`, fixture, policy, hour schedule and **v2-only** provenance; v1 analysis results must remain byte-identical. Recruitment stays at `decision` (24 h), so the ownership reader's existing preparation convention remains meaningful despite later admission. Retain per-subject work/XP, actual custody and assumed operator mappings separately. Native/evaluator labels never enter protocol state; the controlled world remains an offline work/custody overlay, not another executed Sybil admission or a shared human-budget feasibility proof.

All private preferences and relative expected losses remain explicitly supplied or `null`. No verdict/debt in this script does not establish zero future liability. No new operator utility aggregator, voluntary retention rule, price, sponsor reward or contribution metric is added. A conditional terminal maximizer remains finite-menu arithmetic, not adoption/equilibrium or useful growth. Timing/rank effects stay outside that chosen functional rather than being assumed zero in reality.

### Implementation falsifiers and bounded handoff

- **Legacy preservation:** compare both XP-finality modes and all three existing JSON examples against the unchanged implementation at the preparation checkpoint, using compatibility controls rather than replaying stored scientific studies. Preserve complete v1 factory, reader, payoff and ownership outputs, including unknown propagation and optional event logs.
- **Funded one-day boundaries:** verify before/at 24-hour spend/conversion, before/at the invitation's 48-hour freeze endpoint, and before/at the newcomer's 72-hour conversion. Every mutation uses Model methods; all branches share the same setup, available effort units and horizon. The all-wait/no-newcomer branch must not accrue phantom work.
- **Temporal discrimination:** preserve ordered equal-hour admission/work snapshots and event cursors; reject premature acceptance, newcomer work before birth, swapped/omitted stages, wrong horizons, missing invitation evidence and contradictory cursor/event relationships. Do not select a D34 legal timestamp.
- **Accounting/authority:** independently check custody, burns, XP snapshots, actor effort and operator micro-unit totals. No common custody becomes summed subject XP. Do not assume the legacy numerical comparison vector or early-XP premium survives.
- **Pure consumers and unknowns:** verify v2 JSON/branch-order transport, ignored caches, source-provenance retention and evaluator-world separation without executing a model during analysis. Include explicit zero-value controls, supplied valuation sensitivity and unknown-loss controls based on newly checked vectors, not unmeasured human preferences.
- **Closed versioning:** reject unknown fixture/schema combinations, unsupported options and malformed policy/schedule/provenance. Do not weaken old bad-input cases or add v2 fields to old output. One new thin example may emit v2; existing examples remain legacy. Broader research runs/reporting are a later checkpoint after source/tests are locked.
- **Integration gate:** behavior implementation needs `npm test`, default differential checks and DAG/context validation. The existing flat ownership stays `incentives → model/graph/effort` and `payoffs/ownership → incentives`; adding `incentives → provenance` cannot introduce a local cycle because provenance imports only Node libraries. It does not require a new generic framework or model change.

The implementation checkpoint passes 247 native tests (eight new one-day families) and the full v1 differential controls, with a 27-module/66-edge acyclic DAG; reporting preparation adds five families for 252 passing tests. The [executed F45 diagnostic](../studies/2026-10-24-one-day-incentives/README.md#executed-diagnostic-results-f45) retains every fresh case and raw input. Its sponsor differences are `(-1 FACY,0 XP,+1 work)` and `(-1,+1,+2)`; conditional zero-loss/unit-cash/unit-work guarantee preference needs XP value above 3, not a measured willingness threshold. Unknown losses remain unknown. Broader voluntary relation choice stays with its existing backlog owner. Validation was inline/author-coordinated while the P16 actor-workflow qualification is unresolved; no independent-review assurance or repeated delegated workflow is substituted for that missing gate.

## Common prefix and alternatives

This and the measured sections below describe the unchanged **legacy v1** fixture unless explicitly stated otherwise.

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
