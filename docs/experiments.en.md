# Cohort experiments and attack effort

This document owns the research runner in `src/experiment.mjs`, effort accounting in `src/effort.mjs`, and statistical aggregation in `src/trials.mjs`. [The model contract](simulator.en.md) owns protocol abstractions and OPEN-policy defaults.

## Reproducible entry points

- `experimentConfig(overrides)`: Validates and freezes a configuration. Unknown configuration, policy, cohort, activity and weight keys fail closed.
- `runExperiment(config)`: Returns one seeded run with its configuration, assumptions, population, outcome, effort, money, observations, impacts, metrics and history.
- `runTrials(config, { trials, seed, includeRuns })`: Runs pseudo-random replicas with replayable derived seed labels. Full individual runs are optional.
- `sweepParameter(config, { parameter, values, trials, seed })`: Sweeps a known dotted configuration path such as `attackerShare`, `activity.honest.inspect` or `budgets.attackers`. Every candidate validates before the sweep runs.

See [the root example](../README.md#cohort-and-attack-experiments). The CLI is not implemented yet; these native ESM APIs require no installation.

## Population and ownership

`initialSize` and `attackerShare` define the starting accepted population. The attacker count rounds to the nearest integer; output includes both requested and realized shares. A seeded shuffle assigns roles independently of lexicographic XP tie-breaking.

All initial subjects represent genuine, distinct human operators and are trusted bootstrap roots. Some operators collude. The effort required to acquire that initial access is **not estimated**: the reported cost is conditional on the supplied starting state, not the full cost of infiltrating a real network.

Scenarios:

- `honest-growth`: No initial attackers; new subjects represent new genuine people.
- `sybil-cone`: Colluding operators recruit false subjects, each controlled by its inviter's existing human operator. New false subjects require actual invitation burns and separately established guarantees.
- `real-cartel`: New attacker subjects represent newly recruited genuine operators. Ordinary identity observations do not expose an otherwise valid person merely for belonging to a coalition.

Population percentages evolve with admission; they are not forcibly held constant. Output distinguishes subjects, false subjects, controlled subjects and human operators. `includeState: true` exports evaluator truth in a **separate** state field, never in protocol subject records.

## Activity and event ordering

Each cohort has its own `activity` profile:

- `selfId`: Probability of one rewarded Self-ID attempt per subject per day, in [0, 1].
- `invite`: Expected invitation opportunities per subject per day; only available mature personal rights are considered.
- `guarantee`: Expected new directed-guarantee proposals per subject per day. Confirmations are separate actions charged to the counterparty's cohort.
- `inspect`: Expected distinct public unspent-act inspections per subject per day.
- `respond`: Probability of acting on a suspicious observation when veto authority exists, in [0, 1].
- `convert`: Probability of converting each available seven-day right on a daily pass, in [0, 1].

For the non-probability rates, the scheduler takes the integer part plus a Bernoulli draw for the fractional part. This is not a Poisson arrival model. Rates are bounded by 100 to prevent accidental unbounded per-subject loops.

The scheduler initializes the requested synthetic guarantee topology through actual model proposal/confirmation operations, charging both cohorts' setup effort. The topology can be `none`. Initial accepted people are already trusted, so bootstrap relation matching does not use noisy re-vetting. A positive configured guarantee fee still requires real liquid FACY.

Every simulated day:

1. Seeded actor order is selected from subjects already admitted at the start of the day.
2. Subjects create Self-ID at their cohort's activity rate.
3. Guarantee work runs. Attackers favor controlled peers; honest agents prioritize their invitation descendants, then use random public mixing.
4. Inspection and authorized responses run before value can leave Emitter.
5. Invitation creation and matching acceptance run. Preparing a candidate costs work, and prepared candidates can be retried without paying setup again.
6. Agents may convert seven-day rights.
7. Monetary invariants are checked and a history sample is recorded.

New members first act on the following day. Simulation time advances on a 24-hour grid; within-day action ordering is explicit, not physically timed. Success is checked after every accepted action that can change the success criterion, as well as against the given initial state. The run continues to the horizon after first success, while retaining its exact effort prefix.

## Scheduled activity and random coupling

Experiments accept named `perturbations` over start-inclusive/end-exclusive day ranges, affecting only declared activity fields. History records active event IDs and effective profiles. [Paired controls](controls.en.md) owns this contract, finite return criteria and replay limits.

The current `randomness` manifest identifies the generator and decision-keyed coupling policy. Older consumed-stream seed-only results must not be assumed equivalent. Keep the configuration, manifest and implementation revision when replaying a witness.

## Measured effort

`budgets.honest` and `budgets.attackers` are separate pooled cohort limits. Activity creates opportunities; it does not grant free actions. Each performed action is charged before execution, including rejected actions. An unaffordable opportunity is denied without invoking the model and does not consume effort.

Weights cover Self-ID work, false-identity preparation, genuine recruitment, invitation creation/acceptance, guarantee proposal/confirmation, inspection, veto response and conversion. Defaults are all one: **illustrative action units**, not empirically measured labor.

Effort is accumulated as exact integer micro-units to avoid floating-point denial of affordable work (for example, three actions of 0.1 under a 0.3 budget). Weights and budgets support up to six decimal places within the safe-integer micro-unit range. Summaries expose ordinary effort units, raw attempt/accept/reject/deny counts, per-action totals and setup/maintenance totals.

Initial graph setup is charged to the setup phase. Daily work, including preparation of additional identities, belongs to the maintenance phase. Graph queries, scheduling and in-memory computation are not assigned human-effort weights; Node execution time is not attack cost.

Money remains separate:

- Invitation burns and cancelled-emission burns.
- Guarantee fees transferred to fee custody, counted for every relation ever activated (ended relations included), and link-break fees by the ending party.
- Converted rewards and liquid FACY.
- Outstanding debt, never counted as a burn.

The current experiment applies no judicial fine or XP-halving verdict; the underlying model supports explicit penalties for future adjudication experiments. Token market prices, Treasury D spending and realized fiat profit are not modeled.

## Disputes, deviants and payoff facts

`disputes` enables a one-step public challenge layer: an XP gate, a stake, a verdict of declared accuracy, fines, liability scope, a challenger reward share and optional exclusion of liable guarantors. `activity.<cohort>.challenge` is the probability of challenging an eligible suspicious act. `deviants` marks a seeded subset of initial operators that follow an alternative profile. Every run reports per-group payoff facts (`agents`), `system` facts and cumulative `sanctions` in history. [Strategy games](games.en.md) owns their semantics. With disputes disabled and no deviants, behavior is bit-identical to the previous scheduler.

## Social trust behavior

`social` declares how honest people extend and check trust. The defaults (`scope: "public"`, all switches off) reproduce the earlier scheduler bit for bit.

- `scope: "acquaintances"`: honest people propose guarantees only to their own invitees first, then to accepted subjects within `hops` steps (default 2) of their undirected guarantee and lineage neighborhood, in admission order. Honest guaranteed subjects refuse a stranger's proposal. Either side engages a stranger only with probability `strangerRate`, a draw keyed per opportunity. Refusals are counted in `trust.strangerRefusals`. The `randomGuaranteeTargets` ablation still forces public matching.
- `screening`: each day, subjects are ranked by SybilRank-style propagation from the public genesis roots over the undirected guarantee graph (⌈log₂ n⌉ steps, degree-normalized). Coalition genesis members are among the seeds, as in any real trusted-root set. A non-local honest inspection targets the lowest `screeningQuantile` with probability `screeningShare`. Screening chooses *where to look*; the observation remains the noisy detector.
- `verification`: a suspicious honest observation triggers a second-stage check, such as a call or a meeting. It costs one `verify` effort and flags fakes with `verificationSensitivity` and genuine people with `verificationFalsePositiveRate`. Only a confirmed suspicion leads to a veto or a challenge (`trust.verificationsCleared` counts cleared suspicions).
- `investigation`: after an honest challenger's upheld verdict, the challenger verifies the false subject's inviter, the inviter's other invitees and the false subject's own invitees. A confirmed suspect is challenged, subject to the XP gate. This is bounded by `maxFollowUps` per root challenge and counted in `trust.followUps`.
- Bribery: coalition actors make `activity.attackers.bribe` offers per day to random honest people who don't already guarantee them. A target accepts with probability `bribeAcceptance`, proposes a guarantee and becomes liable for it. The `bribePrice` is paid off-protocol and recorded as `bribesPaid` and `bribesReceived` payoff facts, not as FACY.

- Invitation review: when the `policy.invitationFreezeHours` freeze is positive, each honest current guarantor of an inviter reviews a pending invitation each day with probability `activity.honest.review`. A review observes the invited candidate with the ordinary detector and, if `verification` is on, verifies it. A confirmed suspicion cancels the invitation; with `exitOnFraud`, the guarantor also ends the relation (paying the 1 FACY link-break fee) and so escapes later `inviter-chain` liability. Leaving also removes that guarantor's oversight of the inviter. Counters: `trust.invitationsCancelled`, `trust.guardianExits`.

These are behavioral assumptions, not protocol rules. Verification quality in particular is a declared input for a human process the simulator does not model.

## Ablations and provenance

`ablations` accepts the model ablations from [the model contract](simulator.en.md#counterfactual-ablations) plus `randomGuaranteeTargets`, which replaces coalition and lineage-preferring guarantee targets with uniform public matching. Dotted paths such as `ablations.withholdGuarantorXp` work in sweeps, landscapes, controls and hypothesis arms. Enabled ablations appear in the recorded configuration and assumptions.

Every run, batch, landscape and control result carries `provenance.implementation`, a SHA-256 digest of all `src/*.mjs` files, together with the `randomness` manifest. Keep both: a seed replays a run only under the same implementation and randomness policy.

Scheduler optimizations choose targets by index arithmetic over admission-ordered rosters instead of filtering candidate lists. They consume the same keyed draws and produce bit-identical runs, which was checked against the filter-based reference and is covered by `pickIndexExcluding` equivalence tests.

## Observation and defense boundary

The environment knows the evaluator's identity labels and emits noisy observations according to `sensitivity` and `falsePositiveRate`. The honest response handler receives only a public act, protocol state, observer ID and observation. It does not receive the subject's truth label or coalition membership.

The baseline assumes conditionally independent observation draws. There is no shared blind spot, correlated detector error or calibrated media classifier. Guarantee vetting uses the same observation quality. Each observer inspects a given act at most once. `localInspectionShare` biases attention toward acts the observer can cancel; other attention is global.

Attackers with inspection/response activity may deliberately veto non-coalition acts when they have authority. This can hurt genuine people without proving identity fraud.

Only **authorized guarantor veto** is implemented. Suspicious outsider observations without that authority are counted, including cases that pass the ordinary XP gate. They do not magically open or win an unimplemented court case. Even perfect observation quality cannot manufacture cancellation authority.

Consequently, an attack success estimate measures this declared defense subset. It must not be advertised as the probability of defeating Facety with full Chekharda or Council proceedings.

## Macro-state research

Each history point also records passive normalized network measurements and work increments. [Discovery semantics](discovery.en.md) owns their definitions, parameter landscapes and offline descriptive diagnostics. These measurements do not change agent behavior and do not establish an emergent mechanism by themselves.

## Success, resilience and uncertainty

Two criteria are available:

- `false-liquidity`: At least `targetFalseConversions` false-subject rewards have actually converted to Collector. Legitimate earnings by colluding real operators do not count as false emission.
- `council-majority`: Attackers have held strictly more than half of current Council seats. This measures control of rank-based seats, not a corrupt merits verdict. If the supplied starting population already meets it, first success correctly costs zero additional effort.

`outcome.firstSuccess` records elapsed hours and both cohorts' actual effort at first achievement. Later activity is reported separately through final totals. A low-activity or badly allocating reference attacker is not necessarily optimal. Sweeps estimate a strategy-specific budget frontier, **not a lower bound on the cost of the best possible attack**.

Current honest connectivity and cancelled honest emissions are reported. Missing guarantee paths are not accusations of false personhood; some new subjects are merely awaiting guarantees. Connectivity damage is not causally attributed to attackers without a matched counterfactual run.

Native safety caps `maxSubjects` and `maxActions` are computational truncations, not defenses. If a cap stops a run before success is established, success is `null`, never `false`. An already observed success remains true after later truncation. Economic budget exhaustion, by contrast, is part of the experiment and does not itself censor the run.

Batches report successes, failures and unresolved trials:

- Without unresolved trials, the observed success fraction has a nominal 95% Wilson score interval.
- With unresolved trials, a point estimate is withheld. Identification bounds range from successes / all trials to (successes + unresolved) / all trials.
- A conservative Wilson envelope spans both assignments of unresolved trials.
- Zero observed successes does not imply zero underlying scenario risk.
- Descriptive resource distributions include all retained runs, including partial censored prefixes; first-success distributions explicitly condition on successful runs.

These intervals describe pseudo-random scenario sampling under the supplied assumptions. They do not quantify uncertainty in the assumptions, behavioral calibration, independence model or protocol design.
