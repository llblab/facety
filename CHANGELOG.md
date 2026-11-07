# Changelog

Milestone ledger, newest first. Owner decisions and their dates live in the [decision log](docs/decisions.en.md#decision-log-and-supersession-ledger); study results live in their `studies/` pages; open work lives only in [BACKLOG](BACKLOG.md). The full per-change narrative (274 entries and review provenance) is preserved at [`8b77cd8`](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/CHANGELOG.md); `git log` holds every commit.

## Unreleased

### Maturity XP and overlapping dispute deadlines (2026-11-07)

- Owner rules D162 (each Chekharda position has its own window `max(3, 8 - n)` days from its own join; the shared deadline is the latest end point and never shortens) and D163 (Self-ID XP is earned at 24-hour maturity for the author and the creation-time snapshot, independent of withdrawing, burning or leaving the entitlement; economic use never rewrites the history that generated XP) in the decision log and the protocol. Simulator: XP credited at maturity (`settle`, one cursor, equals chronological processing), free early cancellation, source revocation, an audit of the maturity invariant, the retroactive-XP regression tests for both invitation and valence, a randomized check against an independent reference; the pure Chekharda ladder engine (`chekharda.rs`) with the goal's examples A-D, an exhaustive small-state check of monotonicity, refusal and same-hour determinism, Council entry as one terminal position, and stake settlement. The previous baseline is the tag `baseline-spend-credit-d156`.

### Baseline, correctness and growth levers (2026-11-05 to 2026-11-06)

- Rules adopted by the owner (decision log D131-D144, protocol §46.14-§46.15 and §19.4): paths avoid accounts in a dispute (D131); the Council has three equal-vote seats below 100 active accounts with no initial exception (D133); the D independent paths go to D different Council members (D134); key loss and social recovery as a customizable starting point (D135, proposal); cheap proof of reality by a genuine person (D136); reputation of identification as its own kind (D137); layered support, a 0.3% false-positive detector with 3% inspection and a seven-day minimum for proving reality enter the baseline (D142); the 7-node path bound is selected (D123). Working rules: record every owner statement, consolidate periodically and moderately, phases with the baseline first (D138-D141). Research note: find the levers that set the size at which growth stops and tune them by referendum (D144).
- Simulator: multi-terminal exact path search verified against brute force; Council of three; single-use social recovery with a provenance-checked audit; one formal-case procedure with the XP gate for every route; results that carry the full configuration, schema, engine, randomness policy, build commit and phases, valid JSON and no silent overwrite; strict argument and parameter validation; linear audit (a year of growth in about a minute); levers for the Council seats, the difficulty cap, the slot ceiling, careless honest accounts, patient operators and XP priority in the path search; `cargo fmt --check`, `cargo clippy -D warnings` and `cargo test` as the gates.
- Baseline results (diagnostic): the cone never forms with 10, 30 or 100 operators, patient or honest-first operators over a year or two (0.09% to 0.95% of accounts, at most 1.5% of FACY); without layered support the 10-operator scenario leaves 31.7% of accounts at 60 days. Honest growth stalls near 10,000 accounts; the Council size against D is the main lever (21 seats: 17,715 accounts against 10,482), then the difficulty cap and the path bound, not the slot ceiling.
- Documents: the first-100 exception removed from the protocol and D89 marked superseded; the simulator contract rewritten for the Rust simulator; consolidated findings 9 and 10; the consolidation protocol and the baseline phases in AGENTS; the study page of the grown network refreshed.

### Growth against security: Council size (2026-11-06)

- Owner decisions on the open questions: D156 confirmed (strict emission check); D157 (Q20): only the accused is excluded from paths, now the default (`--exclude-challengers` is the ablation): honest accounts about three times larger (one year, 30 operators: 11,330 to 31,886), dirty-FACY share not higher, 36 of 36 reserved-seed runs of the re-frozen adversary pass (new family 2001-2012, dirty-FACY share at most 1.66%); concepts D158 (the dispute window shortens as people join, from seven days toward three; function open, `--window` for the sensitivity) and D159 (escalating stake ladder, plus 20% a step; bindings in Q22). Q21(b) is answered by D160: no hard limit on damage to honest people, the simulator counts. The owner answered Q22: D159 (stake ladder bindings, not modeled) and D158 as a rule (the window shortens by one day per joining participant from seven days to a floor of three); protocol §26.5 and the finality window rewritten. The owner then settled the last bindings: base stake 7 FACY, guarantors' charges burned (the claim that an accusation removes twice the dirty FACY is withdrawn), and D161: any Council member may join any dispute, after which the whole Council votes on whether the first Council member who joined is right; no stake is required for that entry.
- Owner rule D156 (emission path check): every Self-ID needs a current path from the emitter to a Council member of at most seven nodes, intermediates supported and outside disputes; default on (`--self-path-from-guarantor` restores the earlier reading). Effect (4 seeds, one year): honest emission 1.90 to 0.86 million units, 30 operators' emission 8,673 to 4,382, dirty-FACY share 0.34% to 0.20%; the D155 closure results K1 and K5 were re-checked under the new default: 36 of 36 reserved-seed runs pass (dirty-FACY share at most 2.59%), runs are 13-15 s per seed.
- Efficiency (D145, owner request): the act records share their guarantor and recipient lists, revoked receipts are sparse and the XP-by-pair index is removed; outcomes are identical on six saved runs, memory per heavy seed falls from 1.4 GB to 0.28 GB (one year) and from 5.3 GB to 0.68 GB (two years), time by 25% and 14%.
- Time-series plots: `--svg DIR` writes an SVG per seed (honest accounts, attacker share, dirty-FACY share, phase starts); one example for the error-burst scenario is in the closure study.
- After the closure programme, BACKLOG triaged with the owner's agreement (registration tooling, scale re-measurement, detection-precision remainder and stronger-attacker remainder dropped or closed). Honest-regime sensitivity (sparse, dense, friendly, averse; the D129 lines hold in all twelve configurations, dirty-FACY share at most 2.33%) and a key-loss and social-recovery scenario (D135: about two thirds of started recoveries finish in a month, fewer than half of lost accounts within a year, lines unaffected; capture by a bought coalition counted). New flags `--befriend`, `--invite`, `--accept-far`, `--key-loss`, `--recovery-vouch`, `--recovery-delay`.
- Core closure programme (D155, diagnostic with reserved-seed confirmation): K1 absolute metrics (attacker-side accounts never exceed operators; honest network 0.98-1.00 of the paired control), K2 one-factor weakenings (containment unchanged; the proof window and correlated examiner errors move the honest network; the Q20 variants undo the damage), K3 false accusations (network not starved, wrongly invalidated people linear in false cases), K4 recovery (back to 90% of the control 40-170 days after the burst ends without an extra mechanism), K5 break attempts (frozen adversary: 12 of 12 reserved seeds pass at one year and at two, so does the reference); verdict: proceed within the stated bounds, owner questions Q20 and Q21. New simulator capabilities `--accuse`, `--accuse-hubs`, `--odd-share`, `--odd-mult`, `--shock-day`, `--shock-days`, `--shock-fpr-x` and absolute counters. Research loop stopped.
- Detection precision against growth (D153, diagnostic): the false-positive dispute load is a main limit on honest growth in the baseline (false-positive rate 0: 48,346 honest accounts after a year, baseline 0.003: 10,373; paths allowed to cross disputed accounts: 35,294), which qualifies the earlier reading of the plateau as set by the Council size alone. New opt-in lever: verification before a case opens (`--confirm N`, `--confirm-public`); one independent look cuts cases on genuine people from about 3,000 to about 20 a year and grows the network about four times larger at the same attacker share, but confirmation by the target's own partners fails against a fake cluster (without layered support the cone grows from 29% to 68%). New counter `casesOnGenuine`. A softer D131 (`--targets-only`: only the accused party of a case is excluded from paths) gives 31,068 honest accounts at the same containment. Owner question Q20.
- Stronger attackers (D154, diagnostic): bought or compromised honest accounts (`--corrupt`, accept every attacker link, no detection); with 30 operators and a year the criterion holds up to 50% bought accounts (dirty-FACY share 0.74%), while the fakes that get in and are caught grow from 12 to about 2,000; 80% did not finish in the time cap.
- D145: two baselines. The mechanics baseline (rules and axes) defines results; the efficiency baseline (search order, caches, data layout) must not change outcomes and is updated whenever something is faster. The XP-first search order is on automatically without layered support (17% fewer steps, 20% fewer lost searches) and off under the baseline.
- Simulator: lever for a Council size that scales with the difficulty (`--council-seats-per-d`), validation and tests; efficiency setting `xp_priority` is now automatic.
- Efficiency (D145): the search order has four values (none, XP, guarantors, both) and is chosen automatically by measurement; friend-of-friend selection and integer-keyed tables rewritten without changing a single result (about three times faster per seed). Search-order measurements and the finding that the search is not the cost at scale are in the BACKLOG.
- Incentive sweeps: a double-life ledger and a declared operator cash-out behavior (`--cash-out`) feed valuation sweeps for the inviter penalties (deterrence needs an emission worth less than 0.5-2 links; a fabricated artifact removes it) and for liquid recovery (16%-29% of the dirty FACY of cashing-out operators).
- Ablation of the withdrawn D146 finished (2 and 3 seats per thousand, capped at 120,000 accounts): no plateau, attacker share 0.08%; Council size stays on D33 (D148).
- Simulator: remaining parts of the D151 remedy built and measured as opt-in settings (`--restore-links`, `--recover-liquid`, `--xp-penalty` for the D34/D55 inviter penalty, proof window sweep); `World` gains `restore_link`, `burn_liquid`, `penalize_xp` with an audited XP adjustment; none moves the cluster outcome beyond the subtree burden and appeal. Q18 closed as a diagnostic.
- Simulator: appeal for wrongly invalidated people (`--appeal`, D151) reinstates the account (+5% honest accounts with a poor detector); the subtree remedy is neutral under the layered baseline; the collusion leak of D152 is priced as an estimate.
- Simulator: the acquittal of an inviter needs a co-presence artifact (`--artifact`, `--collusion`, D152), the cluster remedy gains a partial burden of proof on the invitation subtree (`--subtree-cases`, D151), and K by XP level was checked against the plateau (D147, starting value 1,000 XP, no effect at the baseline); configuration digests change because new settings are part of the configuration. Diagnostic tables in the grown-network study.
- Owner answers (D151, D152): the combined cluster remedy with appeal and link restoration, and the second-account rule with a conditional acquittal; Q18 and Q19 closed except for named details; protocol §D78 area, decision log, BACKLOG and DECISIONS_NEEDED updated.
- Owner answers (D148–D150, D147 selected): Council size stays on the D33 digit rule (D146 withdrawn, the growth plateau is a consequence), K grows by XP level, referendum weight is plain XP (D88 superseded, D90 retired), the guarantor pays a re-entrant's valence; protocol, decision log, BACKLOG and DECISIONS_NEEDED updated.
- Search order: the default is now more mutual guarantors first for every rule set (owner decision); outcomes are identical per seed (checked at 120 days), only the step counter moves.
- Path-discovery study: a structural certificate from the layered-support levels answers 99.5% of the invitation path questions 15 times faster with identical answers and valid certificates (default under layered support); the bounded-flow relaxation is exact but not worth its cost. Test harness `tests/path_probe.rs`.
- Council-size map (diagnostic, 500 days, 100 operators, 4 seeds): 11 seats 10,324 honest accounts (attacker share 0.95%), 21 seats 16,724, 31 seats 33,134, 51 seats 66,592 (0.15%); seats of 3, 4 and 5 per unit of D give 11,082, 16,951 and 24,917. A larger Council moves the growth plateau up and lowers the attacker share; the slot ceiling is not the cause. Study page, consolidated finding 10 and BACKLOG updated.

### Consolidation and the Rust simulator (2026-11-05)

- Milestone: the Node.js simulator, its 113 test files, the CLI, examples, the mechanism register and all raw study artifacts are deleted; the last version is the git tag `legacy-node` (D130, D132). Links into deleted files and retired pages were rewritten to permanent links at the tag; method pages of the retired machinery became stubs.
- The Rust simulator (`simulator/`, standard library only) replaces it: world rules, runner, three attacker strategies, always-on detection, snapshot cloning, 24 tests including a documentation integrity guard (links, anchors, English-only). Statistical validation against the retired simulator is in the [simulator contract](docs/simulator.en.md#baseline-validation-statistical); the speed gain is about 300 times for growing to 1000 accounts.
- D131: accounts in an open dispute are not path intermediaries (default). D129: dirty-FACY share at most 10% and clean share at least two thirds.
- The insight register gained a [consolidated findings](docs/insights.en.md#consolidated-findings) section; the exploratory topology entries were folded into it; BACKLOG, README, AGENTS and the grown-network study were rewritten compactly.

### Path depth and supported intermediaries (2026-11-05)

- Milestone: attack simulations run only with detection on (D125); no-detection arms are retired as self-evident. Milestone: the simulator moves from Node to one Rust crate (`simulator/`, D130; tag `legacy-node` at cutover); the ignored `results/` artifact directory was deleted, conclusions stay in the study pages.

- D123: opt-in depth bound on Council paths (`maxNodes`, endpoints included; `maxPathNodes` in the topology runner), exact lazy bounded search with a work budget and `pathSearchExhausted` counter. Diagnostic: 7 nodes cost honest growth nothing and do not stop 10 attackers; 4 nodes cost 4 days.
- D124: opt-in layered support for path intermediates (`pathSupport: 'layered'`). Diagnostic (one seed): with 7 nodes it holds 10 attackers at 12.1% without detection and 0.5% with detection, for 3 extra days of honest growth.

- D126/D127: opt-in honest vetting, adaptive attacker, in-person meetings, double-life invitees and inviter acquittal in the topology runner (all off by default, default output bit-identical). Diagnostics with detection always on: layered support held 10 attackers at 0.4–0.6% on three seeds; caution cut the plain 7-node cone to a third; acquitting unwitting inviters kept about 6% more honest participants. Standing rule D125: attack runs always have detection on.

### Research-gate release (2026-10-29)

- Docs: lost spaces around numbers, units, `D`, dates and commit hashes repaired in 93 further Markdown files (byte-guarded historical packets untouched). The owner task "English only, no prompt quotes, protocol without provenance" is complete.
- Docs: the protocol is now a rule specification without provenance: no Russian, prompt quotes, `Source:` lines, owner attributions, decision dates or supersession narratives; rule paragraphs open with `**[STATUS] (Dnn)**`; superseded text moved to the decision log; §46.12 states the topology rules in force and §46.13 the open topology contracts; lost spaces repaired. The historical-packet byte guard now undoes one declared Cyrillic-homoglyph repair (a Cyrillic lookalike of Latin P in `XP` in the F54 README) before comparing.
- Docs: protocol §46.18 research directions moved to the decision log; D110–D113 restated as plain rules; D121 invitation rights stated as a proposal under test in protocol §18.6.
- Docs: the decision log, research decisions (§47–§50) and their history moved from the protocol to [`docs/decisions.en.md`](docs/decisions.en.md), rewritten without Russian text or literal prompt quotes; the protocol keeps a short scope-and-confidence note.
- D121: per-pair invite rights (both sides of every pair, genesis included) replace D120's XP condition. Diagnostic: no honest-growth cost, cone delayed 4–5 days.
- D120: opt-in owner invite-right rule (`inviteRights: 'higher-xp-pair'`). Diagnostic: delays takeover 8–14 days, costs 35% of honest growth by day 100.
- D117: topology v3 (§18.5 leaving, public evidence by anyone, escalation to higher-XP sponsors, same-inviter follow-up). Diagnostic: with the gate, 3 infiltrators stay at 1% through day 199 and 10 are delayed 36 days; without the gate leaving does nothing.
- D116: topology v2 detection (freeze veto, partner inspection, one-step identity cases with D77 holds) and stranger-caution sweep. Diagnostic: no arm stops the cone; gate + no stranger acceptance + detection delays a 3-infiltrator takeover by about 28 days.
- D115: topology-takeover/v1 runner (valence mode, D84/D104/D36 gate, D33 Council lookup, 100 honest people with a 100-day head start). Diagnostic: with 10 infiltrators the gate and no-gate arms both reach 79% attackers 24 days after the attack; the gate only delays cones with fewer than D independent attack edges.

- D113 no pause during K referendums; D114 dirty-FACY share and attacker share over time become primary D50 outcomes (`dirty.*` observables). Weak D50 yield confirmed for sybil-cone (30/30 in 9 contexts); trajectories show about 96% attacker takeover by day 30 in every legacy arm.

- D109–D112: Q16 defaults bind the D50 design; free link termination; equal Council vote regardless of XP; re-entry by mutual guarantee. Remaining Q17 questions restated.

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
