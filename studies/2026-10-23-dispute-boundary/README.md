# Stateful dispute boundary assessment — 2026-10-23

**Diagnostic architecture assessment; no runtime change.** Inspected reference: `07283d3`, with the same source/test trees retained by this checkpoint. This closes the bounded `experiment.mjs` responsibility-split review after the configuration and public-graph extractions. It does not claim that every possible future extraction is undesirable.

## Decision and owner contract

Keep stateful dispute/scenario orchestration inside `runExperiment` for the current single-consumer simulator. The host owns scenario roles, declared noisy evidence, actor work accounting, keyed decisions, phase order, gossip/attention effects, case scheduling and evaluation. It does **not** own economic transition implementations, stake custody, configuration normalization or graph calculation algorithms.

Existing lower contracts remain:

- `experiment-config.mjs`: Validated defaults, assumptions, overrides and daily activity views; no scheduler/draws.
- `social-graph.mjs`: Ordered read-only neighborhoods and structural propagation; no observation or sanction decisions. Supplied graph objects remain mutable; read-only is the checked helper behavior, not a capability sandbox.
- `disputes.mjs`: Challenge access, one-step position settlement, current-link verdict planning/enforcement; no observations, truth or choice.
- `dispute-stakes.mjs`: Commitment records and actual/unpaid stake accounting; no merits, truth or XP policy.
- `FacetyModel`: All protocol-economic transitions, including custody, identity status, fines, XP and Self-ID locking.

Do not move the environment's truth-bearing case record into the shared consequence/custody owners. No new session object, lifecycle module, callback bag, event protocol or protocol policy is introduced.

## Observed state and cross-calls

The [inventory](inventory.json) covers nineteen named functions from `challenge` through `investigate`. Its explicit catalog finds **22 experiment bindings** across that set, plus five imported lower-level functions/types. This is a bounded token inventory with comments/string literals removed, corroborated by source inspection—not an AST free-variable analysis, exhaustive dependency proof or numeric rule about acceptable parameter counts.

The local state is not just a list of pending cases:

- `disputeSequence`: Shared one-step/ladder ID allocation; allocation stays on its existing success/failure path.
- `caseContexts`: Public case metadata and reason/upheld outcomes; merged with independent stake-book records at output.
- `openDisputes`: Timed-case queue, also used by the challenge duplicate guard and final open-case measurement. Opening appends; resolution splices; daily work iterates a snapshot.
- `pendingClusters`: Instant-ladder follow-up FIFO, pushed by `ladder` and drained by `challenge` after verdict consequences. Recursive challenges share that queue.
- `disputeRecords`: Cross-case won/lost history, read by entrant reliability/prior and regular-noticer policy, updated by settlement.
- Per-case runtime record: Entrants, last-move time, opening locks, graph-proximity snapshot, prior and supplied evidence. `genuine`/`coalitionSubject` are evaluator/environment fields, not protocol state or verified evidence.

Shared host state and services include admission-ordered rosters, current model/clock/XP, normalized rules, role and signal environment, work charging, decision streams, social verification, neighborhood queries, suspicion propagation, attention targets and outcome/work counters. Packing these bindings into a single `context` argument would not reduce their semantic coupling.

Two direct recursive paths are visible: `challenge → applyVerdict → investigate → challenge` and `challenge → clusterFollowUp → challenge`. Timed settlement can create further challenges while iterating the existing timed-queue snapshot. These are local workflow cycles, not import-DAG violations.

## Ordering obligations a future move must preserve

1. **Phase-local invalidation:** `inspectionWork` supplies an `onInvalidated` closure over its available/vetoed act cache. An immediate verdict invokes it before later actors select acts in that phase. Timed resolution instead supplies no-op callbacks after inspection; it does not retain an obsolete phase cache in a case record.
2. **Budget and recursion:** `attempt` charges the current actor/cohort/operator, records rejections and propagates simulation limits. Investigation shares a mutable follow-up budget across its recursive chain. Cluster follow-ups use their existing challenge invocation semantics; neither budget nor FIFO may be silently reset/reordered by an adapter.
3. **Settlement sequence:** The ladder determines a winner, settles stake custody, records case outcome, applies loser XP consequences, updates dispute history, then derives defender/lead fields before identity consequences/follow-ups. The one-step branch retains its distinct settlement path. Council beliefs do not automatically acquire the entrant track-record prior.
4. **Timed lifecycle:** Opening freezes only the currently eligible unspent rights. Resolution removes the timed case and releases matching locks before moot/settle handling. A no-longer-accepted target moots custody without another identity verdict. New rights are not automatically frozen by the current reference.
5. **Scheduler interleave:** Daily order remains guarantee/bribe work → inspection → timed disputes → guardian review → admission → cash flow/conversion. Terminal clock advancement is not an extra timed-work pass. Reordering changes actor eligibility, available balances, liability links, event order and possibly keyed decisions.
6. **Current versus snapshot inputs:** Roster order and current XP/status/council are read at their existing points; graph proximity/prior/evidence are retained per case at opening. Do not turn either category into the other as part of a file move.

These are inspected implementation dependencies, not newly selected protocol rules. Opening-rights-only locks, depth-triggered Council and current-link liability retain their existing reference limitations. D33–D36 operational contracts and D34 event/duty/correction contracts remain unresolved in their existing backlog owners.

## Alternatives assessed and stop rule

- **Whole dispute closure extraction:** Would move nineteen functions but still borrow the shared environment/work/social state above. A one-argument context or many callbacks would obscure rather than narrow that interface for the current consumer.
- **Timed queue only:** Would separate queue storage from entrant choice, custody, lock release, moot handling and identity consequences, requiring a new command/result or callback protocol to preserve the same synchronous effects. No second consumer or isolated correctness failure currently earns that protocol.
- **Merge runtime case with stake book:** Rejected: it mixes truth-bearing scenario evidence and merits with the already truth-free custody owner.
- **Extract only tiny arithmetic:** `fraudBelief` is locally pure, but a new one-use file for it does not resolve lifecycle ownership. Expanding the shared consequences module into belief/choice policy would contradict its current exclusion boundary.

**Stop the current refactor here.** `experiment.mjs` remains 957 lines by design, not by a line-count waiver or a claim of global minimality. Reopen with a concrete second consumer, independently valuable test seam/correctness failure, or an authorized migration with a defined lifecycle contract. Source size alone is not such a trigger. Existing protocol and methodology items retain their own explicit gates; this assessment grants no migration or inference permission.

## Validation and evidence reuse

No source, test, CLI, example, package, DAG configuration or mechanism-inventory file changes. [validation.json](validation.json) records exact tree identity and the reused [228-test / 27-module, 65-edge result](../2026-10-23-social-graph/validation.json), not a newly executed test suite. The seventeen trajectory/event controls and 215-history-file preservation result stay bound to that earlier checkpoint; this assessment does not rerun them or enlarge their coverage. Source fingerprint and randomness policy stay unchanged. Context links/structure and staged whitespace are checked for this documentation-only checkpoint.

This is coordinator architecture inspection, not independent review, scientific mechanism confirmation, security isolation, attack-cost calibration or evidence of personhood/useful distribution.
