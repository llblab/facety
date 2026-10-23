# Accountable correction: causal models and research program

This document owns the mechanism chapter, research questions, causal designs, candidate survivability criteria and human-calibration design. Its [structured register](mechanisms.json) owns code-tied records and the parameter/state inventory. It does not select protocol rules or report unrun experiments. [Protocol coverage](simulator.en.md#protocol-coverage) owns implementation status; [discovery](discovery.en.md), [paired controls](controls.en.md), [games](games.en.md) and [confirmation](evidence.en.md) own their executable methods. The source is the owner's A–T design-discussion synthesis supplied with the development mandate, documented **2026-10-23**, not a newly discovered historical decision. Every insight is reconciled in the [register](insights.en.md#design-discussion-reconciliation-2026-10-23).

## Strategic evaluation lens (D32)

The owner's strategic-framing directive, documented **2026-10-23**, evaluates Facety as an **accountability substrate for emission distribution and network growth**, not merely dispute resolution. The [protocol's D32 section](facety.protocol.en.md#accountability-for-emission-and-growth-d32) owns the thesis, three-layer distinction, safeguards and success/failure conditions. This is a deliberate lens, not an observed flywheel or a replacement for D31's mutual-identification architecture.

The proposed return is emission → retention/contributor growth → more accountable participation → better evidence about contribution → more defensible distribution. The competing return is emission-funded farming/collusion → obstruction or wrongful exclusion → honest exit and weaker review → further extraction. Require evidence for each return rather than encoding retention, usefulness or honest superiority into a script. Oracle validity, Sybils, collusion, arbitration capture, bootstrap vulnerability and the cost-of-attack condition remain live alternatives and failure modes.

Evaluate **uniqueness**, **contribution/reputation** and **distribution** separately. Native Self-ID eligibility, terminal XP, custody and sanctions are recorded protocol consequences; they are not a general useful-contribution metric. Actual voluntary retention, service demand and attack/private opportunity costs need independent measurement or explicit conditional valuations. A scoped metric must say what is verified, by whom and how false attribution or collusion can be challenged. Do not turn “low-value” into a personhood judgment or select contribution-weighted emission by implication. Reuse the utility boundary, survivability vector, bootstrap/authority controls and existing study families below; no new study, parameter, confirmation or calibrated result follows from the framing alone.

## Central proposition and competing explanations

**HYPOTHESIS:** earned influence can remain correctable through public evidence, relationship withdrawal, credible challenges and collective decisions, even with a passive majority and bounded fraud. The competing hypothesis is that accumulated violations increase the resources, dependence and procedural power available to block future correction. Neither a high Council share nor an inaccurate verdict alone demonstrates that feedback.

A density-, age- and resource-matched community of genuine early builders is a required control for a collusive community. Dense reciprocal guarantees, high XP, shared interests and coordination are not offenses. A real-person coalition and a fabricated-identity farm are different adversaries. An investigator's allegiance is not a truth criterion: a malicious source may reveal a genuine violation, and a respected source may make a false allegation.

## Executable causal core

The question is the smallest faithful model exposing who knows what, who can act, why a path stops, and what changed state does to the next decision. **D31 is owner-provided intent**, not a finding: Facety coordinates mutual identification through mutual guarantees and public accountability. Directed consent is not a reverse guarantee; XP, finances, identity credibility, adjudication record and familiarity remain distinct.

```text
public events → supplied fallible observations → costed package / routing / review
   FacetyModel ← existing shared gate / stakes / consequences ← qualified sponsor
   native state → separate evaluator diagnostics + optional bounded causal journal
```

`src/model.mjs` alone changes protocol assets and authority. `src/accountability.mjs` owns the bounded reference's information/work lifecycle and journal; `src/disputes.mjs` owns shared challenge/consequence rules used by both scheduler and reference. Examples supply schedules, signals and verdicts while retaining evaluator truth separately. No new framework or implicit full-cohort feature is enabled.

### One maintained mechanism register

[mechanisms.json](mechanisms.json) owns the structured records, parameter/state inventory and simplification evidence. Each record has its question, initiating change, path, actual/missing return, conditional signs, clock, bottleneck, rule/assumption, code, observable, diagnostic, intervention, alternative, falsifier and status. The executable overview reads these records directly.

- **M01–M03:** recorded work/reward versus continued participation; preventive responsibility; relationship-supported influence/dependence.
- **M04–M06:** open discovery/sponsorship; public attention response; growth versus verification workload.
- **M07–M10:** contestability/equal-vote authority; future value/insider loyalty; false accusations/overload/exit; restoration/learning.
- **M11–M15:** debt, procedural record/familiarity, gossip, money-flow exposure and lineage/defender follow-up.

Legend: **[R]** protocol transition (selection/reference status remains explicit), **[A]** behavioral/environment/procedure assumption, **[O]** measurement/valuation, **[?]** missing link. Reinforcing/balancing signs are conditional, not health or stability verdicts. A causal loop may cycle even though source dependencies must not.

Some returns exist. Debt→reserved future right→actual repayment→less debt is a stock-balancing loop. Optional attention, gossip, record and follow-up memories affect later targeting/entry; favorable effects are not established. Rewards→responsibility, credibility→loyalty and precedent→better judgment remain open. In an exercised authority return, a rejected allegation reduces Bela's XP 7→3; a later reviewed challenge against 3-XP Mira fails the strict gate. This is encoded constraint feedback, not learned caution or emergence.

### Inventory and justified reduction

All normalized `runExperiment` default controls have tested grouped-path coverage, meaning, units, scope, provenance and status in the register. Uncertainty about their unknown real-world values is distinct from keyed randomness conditional on supplied values: illustrative levels are not calibrated distributions, and indistinguishable explanations do not justify another fitted coefficient. Stocks, cumulative flows, indexes, observations, behavioral memory, evaluation and analyst controls stay distinct. Dynamic schedules reuse activity units; proof/CLI/analysis settings and historical JSON retain their existing contract owners. The unused alternative relay/trace/walkthrough component has been removed after consumer inspection and [committed-before/current differential checks](../studies/2026-10-23-dead-code/README.md). Historical artifacts keep their original fingerprints; this does not transfer confirmation status.

Concrete changes:

- **One duplicate authority removed:** no `dispute.taken` set; explicit subject exclusion and `DisputeStakes.hasParticipant` derive participation from owned positions.
- **Existing rules isolated:** scheduler and reference share challenge access, one-step position settlement and verdict enforcement. Twelve predeclared procedure/backing/social contexts match all retained pre-existing fields and ordered protocol events except provenance. This is bounded diagnostic equivalence, not every run or historical confirmation.
- **Independent controls retained:** observation/verification/verdict quality, action demand/cost, spending/conversion clocks, XP/structural rank/procedural record/familiarity/liquidity. Equal defaults or one insensitive scenario do not authorize fusion. Independent accounting checks remain purposeful redundancy.
- **Compatibility names clarified, not deleted:** `rewardsReceived` includes all incoming transfers; `flowFlagged` also includes attention; `eligibleForUnmodeledXpChallenge` counts opportunities even with disputes; exact-disposition `inviteBurns` is not exhaustive historical invitation burn. Raw and invalidation-blocked connectivity differ. Historical consumer migration remains incomplete.
- **Bounded reduction declared:** one-unit relay work and supplied one-step merits expose stages without endogenous search/adoption, compensation, a trust scalar, immunity or reinstatement. False evidence, shared errors, outages and scarce review capacity remain inputs/contexts, not globally removed uncertainty.
- **Correctness change separated from refactoring:** independent review reproduced free `null`-actor evidence and partial settlement on aggregate-debt overflow. Public actor lookup is now mandatory; whole-verdict arithmetic is preflighted before reference custody settlement. Unexpected exceptions are journaled when retention permits and rethrown; disabled/full journals only count the omitted record. Numeric failure behavior deliberately changes; ordinary-path equivalence remains tested. This is not general transaction recovery from arbitrary out-of-band mutation or callbacks.

No protocol default changed: artifact reuse and stake backing remain OPEN references with legacy defaults intact. Source extraction changes the fingerprint even when ordinary behavior matches; old confirmations do not transfer.

### Walkthroughs and paired exploration

```sh
node examples/causal-walkthroughs.mjs
node examples/causal-walkthroughs.mjs --json false-allegation-rejected
node examples/causal-relay.mjs
node studies/2026-10-23-causal-core/preservation.mjs
```

Ten named variants answer five questions: influence/paid withdrawal versus cancelled credit; timely veto versus missed finality and later costly adjudication; outsider access/refusal/rerouting with true/false allegations; one terminal credit crossing a labeled one-seat Council boundary (no ballot); and review resumed after 24-hour neglect without resetting history. Runs retain native before/after state, actual costs/delays, missing/disabled link, trace and separate evaluation. An unresolved evidence package is not an open funded case; missing verdict latency stays null.

The small exploration compares member discovery, external evidence without a sponsor route and external relay on the same native prefix, two public-event opportunities, horizon, keyed quality draws and ten total work units. Member versus relay is a resource/quality placebo, not assumed superior outsourcing. Removing a route suppresses later processing, so equal budgets need not yield equal realized work. Capacity 1/2 and a correlated-review context expose congestion/shared error under illustrative inputs. Additional workforce, compensation and sponsor competition are deferred rather than confounded with this contrast.

The [checkpoint study](../studies/2026-10-23-causal-core/README.md) owns exact inputs, source identities, raw traces, numerical contrasts/uncertainty, commands and review limits. Walkthroughs are diagnostics; the comparison is exploratory. No reserved confirmation seeds, registered mechanism claim or favorable-seed search is used.

### Trace and interpretation boundary

Records carry time, actor/action/target, available inputs, evaluated preconditions/basis, outcome, work (null when unmeasured), native deltas, supporting public/decision events and mechanism IDs. Hidden correctness/allegiance is separate. The reference adjudicator supplies a verdict, not evaluator truth to the sponsor. Source-group labels declare provenance, not authentication or statistically independent errors. Reused support IDs/exact duplicate packages do not become independent corroboration.

Retention 0/full/1 and inert-read tests compare complete semantic outputs. Saturation counts omitted records without truncating simulation semantics. The reference consumes no randomness; examples use stable subject/stage keys and their own versioned manifest. Existing full-scheduler no-op, future-prefix, inert-inspection and sequential/parallel controls remain in the suite. Ancestry explains execution, not an independent causal effect; scripted actions acquire no invented expected-utility explanation.

**D34 research boundary:** historical event-time responsibility is now selected intent, not a result established by legacy current-link experiments. Early self-correction should reverse the event's recoverable emission and attributable XP; deadlines, admission, spent-value funding, repeated-penalty identity and exact historical duties remain OPEN in [§20.6](facety.protocol.en.md#206-historical-event-liability-and-early-self-correction-d34). Existing withdrawal/veto/relay controls do not implement that migration or establish profitable self-correction incentives. The [eleven-world timeline preparation](../studies/2026-10-23-d34-timelines/README.md) distinguishes recorded/current roles from actual credits, demonstrates equal-hour ordering ambiguity and exposes converted/transferred/invitation/debt funding boundaries without selecting an execution policy.

## Utility boundary and sensitivity plan

Keep three ledgers: **recorded protocol consequences**, **explicit private valuations**, and **independently justified application externalities**. A terminal XP balance is not itself wisdom, recoverable future income or network welfare. Operator custody of many accounts is not one subject's pooled procedural XP.

For future behavioral experiments, start with declared dimensionless stress-test ranges, not calibrated estimates: discount factor 0–1; share of prospective livelihood dependent on Facety 0–1; sponsor availability and notification reach 0–1; correlated-blind-spot probability 0–1; review capacity 0, 1, 2 and 4 cases per period. Sweep loyalty/civic/authority values from zero through both signs where meaningful, reporting the units and scale relative to a legitimate day's income. Keep risk preferences and exit opportunities explicit. Estimate future loss from a counterfactual *remaining* income/service stream; never charge the same sunk work again as future loss.

Finite menus require individual deviation tests and valuation sweeps. Adaptive policies additionally disclose observations, learning rule, memory, strategy generation, convergence/cycling and initial conditions. No maximum over a few scripts is adoption or an unrestricted equilibrium. External FACY prices, useful services and Atmo flows stay conditional and separate; none may silently fund an otherwise unsustainable core.

## Hypothesis matrix and staged study families

These are **unregistered designs**, not supported mechanisms. Exploration uses separate labels. A mechanism claim must later declare presence, necessity, named alternatives, contexts, practical margins and correction for selected hypotheses, commit its registration, then run reserved seeds with matching implementation/randomness manifests.

| Family | Presence/outcomes | Ablation and named alternative | Contexts and falsifier |
| --- | --- | --- | --- |
| Open investigation/sponsorship | Usable evidence, sponsor access, correction and false-allegation cost | Members-only; external without sponsor; single/multiple routing; compensation. Equal total investigation first, extra participation separately. Control skill/access and sponsor review work. | Congestion, conflicts, malicious true reports, respected false reports, duplicates. No gain at matched resources or unacceptable harm refutes broad relay benefit. |
| Motivated minority | Resolved valid cases per population, latency and backlog | Remove notification/review bottlenecks separately; equal total labor, independent versus correlated errors | Holidays, outages, workload and review responsiveness. More detection with growing unprocessed backlog refutes capacity sufficiency. |
| Long-term alignment | Individual willingness to sponsor/whistleblow and honest useful participation | Fixed loyalty stress test versus belief/utility-sensitive choices; separate future income, social ties and civic value | Discounting, exit options, sincere mistaken insiders. Profitable unilateral concealment or cycling refutes stable alignment. |
| Correction/withdrawal | Timely reports, loss, wrongful exclusion and remaining oversight | Feasible self-correction versus late sanction; exit with matched watcher capacity; leniency versus no leniency | Repeat offenses, unpaid fees, disputed acts, pending credits and liabilities. Profitable report-and-repeat abuse or more hidden harm refutes the proposed safeguard. |
| Authority/coalitions | Money, XP, eligibility, seats, votes and demonstrated obstruction separately | Size/age/resource/topology-matched genuine and collusive groups; XP coupling and tie-break counterfactuals | Small Councils, early advantage, near-threshold contamination, long horizons. A seat shift without corrupt action cannot support capture. |
| Recovery/survivability | Correctability after neglect; recovery time and irreversible harm | Restore attention/sponsors without resetting money, XP or relationships; compare undisturbed and compromised baselines | Low revenue, exits, churn, misinformation, sponsor/inspection loss and slow attacks. Return to a compromised baseline is not recovery. |
| Precedent/learning | Reasoned consistency by status, correction of erroneous decisions | Reasoned versus unexplained decisions; comparable insider/newcomer cases; no retroactive rule changes | Ambiguous boundary cases and bad precedents. Persistent status-conditioned inconsistency or inability to correct a bad precedent refutes beneficial learning. |

Positive candidates include investigative specialization, sponsor competition, honest coalition formation, effective gossip, voluntary correction, redundant routing and stable tolerable fraud. Search with equal seriousness for investigative monopoly, evidence bottlenecks, liability cascades, exclusion spirals and reputation-based impunity. Directly encoded clocks, arithmetic rewards, scripts and scheduler order are alternative explanations, not emergent discoveries.

## Survivability vector and stage clocks

Retain raw values and denominators, not a single success score:

- **Safety/fairness:** wrongful sanctions and exclusion, genuine membership retained, false-allegation review cost, proportional liability, access to correction, insider/newcomer differences.
- **Liveness/capacity:** admissions, normal transfers, package/case arrival and processing rates, unresolved queue age, sponsor availability, verdict and enforcement latency.
- **Economic/governance resilience:** actually collected losses, unpaid debt separately, honest work/fees, illegitimate money and XP, threshold crossings, seat mobility, voting independence, actual wrongful obstruction.
- **Recovery/usefulness:** residual ability to correct, time after restoration to declared health criteria, cumulative irreversible harm, churn and useful participation. External subsidy dependence is separate and unknown until modeled/calibrated.

Stage clocks are event→discovery→usable package→sponsor→hearing→verdict→collection→learning. Retain missing stages as pending/censored; absence of a hearing is not zero latency. Repeated copies of one package are not independent confirmations. Publicly observable counts/costs are separate from evaluator-only genuine/false labels, violation correctness, ownership and false-negative denominators; real-world versions of the latter may be unknown.

### Candidate regime criteria (must be registered before assignment)

Choose and publish practical tolerances, window length, horizon and minimum evidence **before** confirming a regime. Do not label current runs automatically with these names.

- **Healthy growth:** genuine useful participation grows while fairness, loss and queue bounds all hold over the declared window; reward/population growth alone does not qualify.
- **Stable bounded fraud:** evaluator harm/illegitimate-money trends stay within a declared near-zero slope margin and level bound, while authority, fairness and correction-access bounds hold. Small money contamination alone does not qualify.
- **Corrective overload:** case arrivals exceed service capacity over the declared window and unresolved age/backlog rise beyond specified margins, even if discovery improves.
- **Newcomer exclusion:** matched evidence/status comparisons show materially worse correction/admission access for genuine newcomers, beyond declared uncertainty/practical margins.
- **Entrenched influence:** low measured mobility coexists with failed contestability or failed influence removal after established misconduct. Stable honest membership alone is not entrenchment.
- **Self-protecting capture:** established violations causally increase subsequent obstruction under matched evidence/resources; restored ordinary correction cannot remove the obstruction within the declared horizon. Seats, scripted loyalty and one wrong verdict alone do not qualify.

Allow mixed, inconclusive and unclassified results. Require transient, population-size, horizon and initial-condition checks before naming a collective regime.

## Unselected adjudication reference comparisons

The legacy simulator uses a fixed-101 active leaderboard with equal votes. [D33/§46](facety.protocol.en.md#46-brightid-inspired-topology-design) now selects dynamic Council size and no formal one-consul institution; topology-aware effective-XP selection and majority/two-thirds guidance still need operational definitions. This research chapter does not implement that migration. Case admission, merits, conflicts, recusal, vote denominator, quorum and ties remain OPEN. Candidate comparisons, **not defaults**, should state: all-member versus participating-member quorum; abstention/tie/no-quorum behavior; accused-member participation versus recusal; conflicted-sponsor refusal versus disclosed review; fixed membership snapshot versus dynamic membership; smaller-Council handling; deadline interaction and appeal/finality. Record member/vote snapshots and reasons. A consul can be challenged through intended ordinary/collective routes without seniority immunity; no new supreme controller is proposed.

Jurisdiction concerns defined identity claims and procedural duties, not political agreement. Allegations require review; a losing defense does not establish another offense. Any experimental cluster liability must establish its own violation and knowledge/standard of care, rather than punish association. Safeguards to compare include weak-case refusal, clarification, bounded repeated reports, wrongful-outcome correction and non-retroactive precedent. Existing simplified procedures do not settle these choices.

## Small human-calibration study (design only)

**Human-gated; no recruitment or data collection has occurred.** Preregister a pilot with approximately 24–40 consenting adults, a balanced randomized within-person task order and explicit stopping/withdrawal rules. The pilot estimates uncertainty/feasibility, not population-wide fraud rates. Repeated tasks from one participant are clustered observations, not independent people.

1. **Safety and consent:** independent ethics/privacy review before recruitment; adult volunteers, no minors, no real allegations or live sanctions. Use consented staged media and clearly licensed synthetic examples, not impersonations of uninvolved people. Do not publish faces, acquaintance graphs or raw identifiable logs to a chain. Participation and payment do not depend on accusing someone or guessing correctly. Provide an opt-out from acquaintance vignettes without loss of compensation.
2. **Tasks:** time ordinary individual/group identity work; time permitted staged fabrication under a fixed resource budget; blinded genuine/fabricated review with signature/reference context; build a bounded evidence package; route it to a separate sponsor for an independent review; introduce randomized missed notifications, queue delay and availability. Use fictional acquaintance/insider scenarios to measure willingness to report and reconsider without asking volunteers to accuse actual acquaintances.
3. **Measurements:** capture active work time and failures, acquisition/packaging/review effort, hit/false-alarm rates, duplicate-source recognition, calibration of confidence, sponsor rejection/retry, notification misses, delay distributions and stated willingness. Record false-allegation burden and refusal/abstention as valid outcomes. Predeclare missingness, withdrawal, censored completion and skill/accessibility strata.
4. **Data minimization:** pseudonymous participant/task IDs; separate consent/key table under restricted custody; bounded retention and deletion date; no unnecessary biometric embeddings. Release aggregate, de-identified measurements only with explicit consent and a re-identification review. Compensation is a fixed funded research payment with payer, recipient, currency and failure log, never a protocol mint or transferable XP.
5. **Inference/update:** participant-cluster bootstrap or appropriate hierarchical intervals, exact count denominators and broad uncertainty bands; no threshold hunting. Update only measured parameter distributions (`selfId`/`fakeSelfId` effort ratios, sensitivity/false alarms, verification quality, notice/availability/review delays and capacity). Keep observed fabrication technology/resources explicit. Do not equate lab classification with Council accuracy, stated willingness with actual misconduct reporting, or a pilot cost ratio with a universal farm cost. Preserve old simulator studies; new calibration creates new configurations and registrations.

Executable follow-up, prerequisites and acceptance evidence live only in [BACKLOG.md](../BACKLOG.md).
