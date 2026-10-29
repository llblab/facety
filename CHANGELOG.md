# Changelog

Milestone ledger, newest first. Owner decisions and their dates live in [protocol Appendix A](docs/facety.protocol.en.md#appendix-a-decision-log-and-supersession-ledger); study results live in their `studies/` pages; open work lives only in [BACKLOG](BACKLOG.md). The full per-change narrative (274 entries and review provenance) is preserved at [`8b77cd8`](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/CHANGELOG.md); `git log` holds every commit.

## Unreleased

### Research-gate release (2026-10-29)

- D108: owner released the master-programme order lock and WP1/G1 method precondition; recorded in protocol §46.18/Appendix A, insights, BACKLOG, AGENTS and README.
- D50 falsifier study opened with an exploratory yield probe (diagnostic) and draft design; owner bindings in DECISIONS_NEEDED Q16, migration questions in Q17.

### Owned valences (2026-10-29)

- V1 pre-code contract for an opt-in valence/K reference (D83/D93/D94/D97/D98/D100, D82 XP); OPEN choices are required bindings.
- V1 implemented opt-in in `FacetyModel` (`openValence`, `withdrawValence`, `setOwnedSlotCeiling`, `ownedSlots`, `valenceRecords`) with `test/valences.test.mjs`; structural path replay refuses valence journals explicitly.
- V2 pre-code contract for invitation-side units (D105–D107), then implemented opt-in (`preregisterAccount`, valence-mode invitations, `endInvitationLink`) with `test/valence-invitations.test.mjs`.
- V3 pre-code contract for D84/D104 Council paths, D91 bootstrap and D35 genesis pairs, then implemented opt-in (`genesisPairs`, `initialBootstrap`, Self-ID/invitation path gates with verified certificates) with `test/valence-council-paths.test.mjs`.

### Garden (2026-10-29)

- Witness indexer packet: superseded pre-code contracts stubbed, README history condensed to a milestone table (439KB → 216KB).
- Trust-topology packet: 25 superseded pre-code contracts/launch specs stubbed, README status narrative replaced by an evidence map (761KB → 545KB).
- Review allocation: superseded measurement contract stubbed; stale "not implemented"/"acceptance pending" status lines on the C0 contract and two prior2 derivations now carry dated current-status notes. Garden totals: studies Markdown 1.71MB → 1.26MB; repository Markdown 2.81MB → 2.36MB; tracked 36.0MB.

### Consolidation (2026-10-29)

- C1: link/anchor integrity guard (`test/repository-integrity.test.mjs`), two broken Q15 anchors fixed, 334 untested raw study outputs (7.37MB) archived to `8b77cd8` permalinks; test-read files and study inputs kept.
- C2: this ledger replaces the per-change narrative (183KB → 8KB).
- C3: BACKLOG reduced to open work, gates and unblockers (88KB → 24KB); legacy anchors kept.
- C4: README, AGENTS and DECISIONS_NEEDED concentrated (166KB → 46KB); integrity guard now checks README example imports.
- C5 (part): insight register condensed to one line per decision/finding (334KB → 94KB); simulator D61 narrative replaced by an API/contract table.
- C7: archived 11 untested outputs (7.1MB) from the four immutable 2026-10-24 packets; the historical guard now pins the archived set and verifies README relinks restore reference bytes.
- C5: docs index restructured (38KB → 10KB, guard: every study README indexed); research/simulator/indexer result narratives replaced by concise contract text and pointers.
- Result versus baseline `8b77cd8`: tracked bytes 51.66M → 36.55M (−29%), Markdown 3.53M → 2.81M (−20%); 804 tests green. Optional studies-prose consolidation stays in BACKLOG maintenance.

### Owned slots, valences and invitations (D81–D107, documentation only)

- K starts at 100 and counts own OPEN valences plus one invitation-side slot at each endpoint from issuance (D81 → D100 → D106); referendums move K without forced cuts.
- Valences: immediate own 1-FACY burn, no XP/liability while one-sided, own-only withdrawal, never refunded (D83, D93, D94, D97).
- Guarantor XP requires an established mutual guarantee (D82).
- Invitations: inviter pays 1 own FACY, recipient 0 (D92 → D105); pre-registered zero-Genesis target, eligibility checked once at issuance (D107); one original creation inviter (D99); same-identity re-entry by new invitation (D95); closed records never reopen (D98).
- Paths: ≥D mutual guarantors AND D internally vertex-disjoint current-mutual Council paths (D84, D102 → D103 → D104); initial first-100 bootstrap without Council paths/Chekharda (D91).
- Governance candidates recorded, not selected: termination price (D85), base-coin vs FACY (D87), FACY×XP and square-root weights (D88, D90).

### WP1 prior checks (D80)

- prior2 unit-lifetime maximum derived and independently supported; own-earned serial lift derived; c3 funded comparator conformance: 4 cases, 204 commands, Native/reference agreement after every command. G1 still not passed.
- prior1 recursive finance and C5 internal funding constructions derived and independently supported; prior3 receipt reader and prior7 attribution implemented study-locally; continuation-sensitivity study stopped before data.

### Longitudinal life, D77 holds and D79 cancellation (D76–D79)

- D76 Evidence Core Convergence: five-obligation evidence frontier; living-network direction.
- Longitudinal preflight, profile and same-draw fast path: the annual 100→453-subject no-attack workload now completes with full audits.
- Opt-in `native-living-accountability/v1` runner and typed living scalar adapter.
- D77 open-dispute participants cannot create Self-IDs, invitations or guarantees: opt-in relay references `d77-one-step-converted/v1`, `d77-timed-act-converted/v1`, `d77-timed-act-settled-history/v1`.
- D79 author may cancel an eligible pending own Self-ID before 24h, keeping the original slot.

### Core survival, Council and topology (D62–D75)

- D68 core-first framing; funded coalition entry/support checks; correction-route audit locates the missing act-case → D59 binding.
- Core authority checkpoint (equal 118-unit issuance, different legacy electorates); C1 fixed automatic-Council settlement with no ordinary winning entrant; C2 D72 entry contract frozen.
- Council design D64–D72: anytime voting, common-channel notice, terminal collective entrant on the shared seven-day clock, consul-initiated referendum, consul-versus-consul route.
- D73 structural checks: T1 reusable support/cuts, T2 observable-support vectors, T3/T5 192-cell matched acceptance.
- D63 fixed-total review-allocation counterfactual: opt-in `reviewReserve`, scalar admission, 40-config comparison.

### Witness-certified path gate and indexer (D61)

- M1 canonical codec/verifier/ref2 with portable vectors; M2 immutable captures, exact bounded-hop oracle, Native graph/status replay.
- M3-A…M3-L advisory layer: whole-witness and segment caches, anchor trees/branches/prefix joins, keyed pools, affected-root refresh and path-label repair, workload runners, retained-union reference, cache-first pipeline, lifecycle, notice fan-out and composite coordinators; paired maintenance and joint-churn conformance. Two cache epoch/preflight bugs fixed.

### Master trust-topology programme and WP1 components (D60, 2026-10-26)

- Master programme WP0–WP8 with G0 inventory and assumption ledger; D62 majority-resilience framing.
- WP1 opt-in components: funded vouch reservation and c-vouch admission, bond execution, paid act review, composition witness, independent logical oracle, Native vouch and P/b capacity backends admitted through v2 config/dispatch.
- D60 P/b invitation-limit family implemented opt-in.

### Self-ID chain, XP receipts and verdict execution (D49–D59)

- D54 Self-ID-sourced XP receipts/revocations with reconstructible balances; D55 per-act penalties.
- D56 `chainIndex`/`previousSelfId`; D57 guarantee includes preceding chain correctness; D58/D59 author vs non-author correction and the bounded Native verdict-execution kernel.
- D49 resilience-vs-growth, D50 incentive-asymmetry target, D51/D52 recruitment and public accountability, D53 autonomous vs ATMO economics recorded.

### Guarantor prevention and act evidence (D42–D48)

- D42 ordinary 24h maturity credit/veto expiry; opt-in `xpFinality: 'maturity'`.
- D43 sub-day cadence: `src/clock-agenda.mjs`, opt-in `stepHours: 4|6`.
- D44 guarantor-prevention stages, `invitationReviewTiming: first-attended`, `invitationEvidence: shared-target`; F48–F55 fixed captures and retained-only reconstructions.
- D46–D48 per-act evidence: `act-defect` claims in `EvidenceRelay`, `two-outcome-private-utility-v1` sponsor assessment, sponsor-pipeline diagnostic.

### Protocol as living specification and research method (D31–D41)

- D40 protocol is a self-contained living manifesto/specification; D39 integrated research programme and interaction design.
- D37/D38 v2 registrations bind `family-contradiction/v1`; v1 keeps its digest and statistics. E2 fixed: confirmation analysis verifies design/hash/namespace/randomness.
- D33 BrightID-inspired topology, difficulty, dynamic Council and clusters (design; legacy reference retained); D34 event-time liability; D35/D36 guarantee AND path gates with internally vertex-disjoint paths; `findInternallyDisjointPaths`.
- P16 service-order and P23 one-day incentive studies; reference-checked BFS/bidirectional benchmark.
- Experiment refactor: `experiment-config.mjs`, `social-graph.mjs`; three unused relay modules removed.

### Disputes, incentives and evidence foundations (2026-10-22 – 2026-10-23)

- Dispute layer: one-step XP-gated challenge; timed Chekharda (`disputes.procedure: "chekharda-timed"`); reputation, gossip, public proof; `stakeBacking: "reserved"` custody; chain-proportional sanctions (`voidSelfIdChain`).
- Strategy games (`src/games.mjs`, `game`, `game-grid`, `game-sweep`), fraud budgets, deterrence and social-trust threshold studies; game analyses bound to their retained inputs.
- Incentive forks, terminal-payoff analysis and evaluator-only ownership counterfactuals.
- Confirmatory evidence pipeline (`src/evidence.mjs`) with presence/necessity/alternative claims; first preregistered study (coalition-council).
- Correctness: debt-recovery veto bypass, fee accounting, artifact-ID allocation after validation, numeric-boundary atomicity (R1/R2, NUM-1), landscape endpoint missingness (STAT-1), zero-XP Gini `null` (STAT-2).
- Randomness: `sha256-xoshiro128starstar-v2` and decision-keyed streams; fixed-seed outputs from earlier policies intentionally changed.
- Simulator defaults follow selected rules (24h spend/conversion/invitation freeze, `linkBreakXp: "revoke"`); Council defaults to the active XP leaderboard.

### Foundation

- Deterministic identity graphs, seeded topologies, mutation journals, Emitter timing and monetary conservation; directed membership-path certificates; measured attack/defense effort with Wilson uncertainty; cohort experiments; emergent-behavior instrumentation; JSON CLI (`bin/facety.mjs`); worker-thread execution with sequential-identical results.
