# Simulator model and research contract

This document owns the implemented simulation semantics. The [protocol](facety.protocol.en.md) owns Facety design intent. A default below is an experiment assumption, not a decision that closes a protocol OPEN item.

## Architecture

```text
trial batches / sweeps -> experiment -> model, generators, metrics, effort
CLI composition (next checkpoint) -> trials, graph algorithms
experiment environment -> noisy observations -> bounded veto response
model -> directed graph
generators -> directed graph, seeded randomness
metrics -> reachability
path algorithms -> graph public API
```

The model never receives a hidden label saying that a subject is an attacker or a real person. An experiment evaluator may maintain those labels outside protocol state. Detection and adjudication require separately described observations and policies; omniscient deletion of every attacker is not a defense.

## Implemented protocol subset

- Subjects keep rate limits, debt, XP history and graph identity across key changes.
- Time uses integer hours. A day is 24 hours; there is at most one rewarded Self-ID per rolling day. Simulation time never moves backwards.
- Artifacts have abstract detector outputs (`faceCount`), registration timestamps and selected face indices. The reference window includes age 24 hours. Different subjects claiming the same face flag every affected claim without submission-order guilt.
- A normal Self-ID mints one modeled FACY into Emitter custody. It cannot be transferred as an Emitter right.
- An own unspent right can burn for a target-bound invitation at age 72 hours. Conversion transfers, rather than mints, at age 168 hours. No automatic conversion occurs.
- An authorized guarantor can cancel an unspent right even after seven days. Consumption and conversion permanently end that veto.
- Directed guarantees need a proposal from the guarantor and confirmation by the guaranteed subject. They do not create reciprocal guarantees or invitation lineage.
- Disconnection, invalidated identity and monetary liability are separate. `invalidateIdentity` marks only the adjudicated subject; it does not declare descendants false.
- Penalties are explicit exogenous inputs, not a claim that the simulator has solved adjudication.

## Research policies

`policyFrom(overrides)` rejects unknown keys and invalid values. Policies are immutable for the duration of a model instance.

- `xpFinality: "terminal"` (default) awards XP only when an act is consumed or converted. Cancellation awards no XP. `"immediate"` awards at acceptance, exposing the provisional-authority scenario for comparison.
- `cancellationAuthority: "snapshot"` (default) uses the act's eligible-guarantor snapshot. An ended relation can still authorize cancellation of its historical unspent acts. `"current"` instead checks the current active edge, including newly established edges.
- `guarantorEligibility: "active"` (default) requires an accepted subject with a non-cancelled Self-ID inside the preceding 28 days. `"accepted"` removes the activity requirement. Frozen acts still count for activity. At the exact 28-day boundary an act expires.
- `guaranteeFee: 0` (default) models an unfunded two-sided guarantee. A configured positive integer fee is paid by the guarantor from liquid FACY on confirmation and held in a fee vault, not burned. This is not the still-unspecified Emitter guarantee commitment.
- `councilSize: 101` (default) ranks eligible subjects by effective XP, breaking ties by JavaScript string order. Zero-XP eligible subjects qualify; fewer eligible subjects produce a smaller Council. A snapshot is an observation, not an implemented Council case.
- `councilEligibility: "active"` (default) makes the Council the XP leaderboard among currently active accepted subjects: those with an uncancelled Self-ID inside the preceding 28 days. Members drop out when their activity window expires. This follows the protocol owner's decision of 2026-10-22 on the §27.1 OPEN item; the protocol text is not yet updated. `"accepted"` keeps every accepted subject eligible and was the implicit behavior before that date, including for the 2026-10-22 coalition study.
- `debtRecovery: "reserve-until-mature"` (default) marks a debtor's new Self-ID right as reserved while outstanding debt exceeds the debtor's already reserved rights. The reserved right stays in Emitter custody, where guarantors can still cancel it, and the owner cannot spend or convert it. When it reaches 72 hours without a dispute lock, the next clock advance (or unlock) burns it, reduces debt by one and applies terminal XP. A cancelled reservation repays nothing. `"immediate-burn"` burns at acceptance and credits XP at once. It is retained only as a comparison policy, because it removes the selected free guarantor veto for debtors and makes their XP final sooner than everyone else's.

Other explicit assumptions:

- Genesis subjects are independently supplied trusted roots with zero money and XP. No attempt is made to prove bootstrap trust.
- For `N28 = 0`, the research invitation threshold is one; otherwise it is the decimal digit count. This fills an OPEN bootstrap choice only for experiments.
- An invitation binds one target ID, has no expiration and is accepted once. The threshold applies to its creator, not its recipient. An invitation alone does not create a guarantee.
- A link break costs exactly one liquid FACY, paid by the party ending the link, and transfers it to fee custody. No hardship exception is assumed.
- A dispute lock prohibits both owner disposition and guarantor cancellation. Unlocking does not reset age. Opening a lock does not itself prove admissibility.
- XP halving rounds down. Credits and halvings are chronological. Cancelling an immediate credit replays current XP without that source; historical votes or decisions are not rolled back. The foundation intentionally has no final court decisions.
- A monetary fine burns collectible liquid FACY first and assigns the remainder to subject debt. Existing Emitter balances are not seized. Future Self-ID repays one unit of debt per mature uncancelled right under the selected `debtRecovery` policy; its valid identity work can still earn XP. Nominal debt is never counted as an actual burn. The 72-hour reservation age is an experiment assumption for an OPEN seizure-order question.
- Monetary amounts use safe-integer FACY units, not production token precision. `penalize` rejects a fine that would make accumulated individual or aggregate debt unrepresentable before changing money, XP history or events. This is a numeric representation limit, not a calibrated economic ceiling. Signatures, key possession, media capture/detection, publication rights and lawful identity judgments are abstract inputs, not validated here.

## Adjudicated chain voiding

`voidSelfIdChain(id, { fromAct })` is an explicit adjudication input, like `penalize`. It cuts a subject's Self-ID chain from one act onward (default: the whole chain): unspent rights burn with no XP, and XP credited by every cut act is revoked from all its recipients by chronological replay. Converted or invitation-burned coins cannot be un-minted, so recovering them requires a separate fine. No court procedure is implied.

## Counterfactual ablations

`ablations` (constructor option, `ablationsFrom`) removes a protocol mechanism for evidence experiments: `withholdGuarantorXp` limits Self-ID XP to its owner while keeping guarantor cancellation authority, and `fixedInvitationThreshold` replaces the N28 digit rule. Defaults are off. Any enabled ablation is a labeled counterfactual, not Facety behavior, and [evidence](evidence.en.md) owns how it supports necessity claims.

## Graphs and certificates

The model keeps invitation lineage and current guarantees in different `DirectedGraph` instances. Guarantee history is retained in relation records. Synthetic topology generators deliberately bypass admission economics: use them to test algorithms, not to claim economically feasible network growth.

Graph edge IDs are immutable and never reused after removal. `clone()` and JSON snapshots preserve identities and safe-integer counters. A restored counter at `Number.MAX_SAFE_INTEGER` can remain readable, but mutations requiring exhausted capacity throw `RangeError` before changing state. Removing a node preflights the revisions needed for every incident edge as well as the node itself. Node/edge deletion and rewiring return explicit mutation journals. Hub removal ranks initial total degree rather than recalculating adaptive centrality.

`graph.assertCapacity({ revisions: 1, edgeIds: 0 })` checks non-negative safe-integer headroom without changing counters or reserving slots. Revisions count the actual node/edge mutations; edge-ID slots count new edge allocations, not node additions or edge deletions. The default checks one revision and no new edge ID. This is a synchronous preflight, not a lock or transaction manager.

The model preflights complete numeric resource requirements before its first side effect. Confirmation checks one guarantee revision and one edge ID before collecting its fee; termination checks one revision before collecting the break fee. Admission checks two lineage revisions (node plus edge), one lineage edge ID and one guarantee-node revision before inserting subject state. Capacity rejection leaves subjects, graphs, balances, statuses and events unchanged in an otherwise coherent model. Tests inject near-exhaustion counters and cover rejection as well as exact remaining capacity.

This does not introduce whole-model restoration or make arbitrary external graph mutation a supported admission path. A monetary `audit()` alone does not certify graph/identity coherence; the atomicity tests compare the complete exposed protocol state. The preflight guarantee concerns numeric capacity, not arbitrary corruption, user-overridden methods or runtime allocation failures.

`findPathBfs` and `findPathBidirectional` search directed paths from a caller-supplied root set. Bidirectional search uses incoming edges from the target and expands whole layers. Both report `found`, `unreachable`, or `budget-exceeded`, with visited-node / edge-check counters. Bidirectional visited counts include both search trees.

`verifyPath` checks the certificate against the verifier's current graph, canonical root set, target and optional blocked nodes. It checks direction, simplicity and each exact edge identity. Removing and re-adding the same endpoints invalidates an old certificate. Unrelated changes preserve a path unless `requireRevision: true` requests snapshot-strict verification.

These are reachability certificates, not cryptographic commitments, proofs of media authenticity, global uniqueness or liability. The verifier must obtain its canonical graph and trusted roots independently. A graph exported by an attacker is not a trusted ledger.

## Cohort experiments

[Experiment semantics](experiments.en.md) owns cohort activity, measured effort, success criteria, noisy observations and Monte Carlo uncertainty. These consume this model without changing its rules. Expected agent dispatch rejections use `ProtocolRejection`; unexpected programming or invariant errors abort a run rather than becoming ordinary rejected work.

## Validation and optimization

Run `npm test`. Proof tests compare shortest-path lengths on every directed simple graph of four nodes, plus larger seeded topologies, blocked paths, adversarial certificates and mutations. Model tests establish custody conservation, reward limits, terminal rights, chronological XP and conditional policy behavior.

The graph uses indexed incoming/outgoing adjacency and constant-time edge counts. Searches use queue cursors, not array shifts. Topology generation and rolling activity/XP replay are deliberately simple reference implementations; benchmark before adding indexes or caches, and compare optimized implementations to the existing semantics.
