# Facety simulator backlog

Scope: a reproducible research simulator for [the proposed protocol](docs/facety.protocol.en.md) (Rust, [`simulator/`](simulator)), not a production runtime or proof of personhood. This file alone owns open work. Meaning lives in the protocol, decisions in the [decision log](docs/decisions.en.md), findings in the [insight register](docs/insights.en.md#consolidated-findings), outcomes in [CHANGELOG](CHANGELOG.md), assumptions and owner questions in [DECISIONS_NEEDED](DECISIONS_NEEDED.md). The pre-consolidation backlog (full narrative, parked work packages) is at [`legacy-node`](https://github.com/llblab/facety/blob/legacy-node/BACKLOG.md).

**Current phase: conditional-mainnet preparation (D188), redirected by [D204](docs/decisions.en.md) (2026-11-24): production-only human evidence.** Close the executable subset and prepare launch measurement; the owner has explicitly accepted launch risk and selected the production network as the only source of human evidence — no pilot or rehearsal precedes it. The [evidence-core verdict](studies/2026-11-08-evidence-core/README.md) remains REVISE: production observation is the first human-evidence source, not a confirmation of the model. Deployment proceeds only through the launch gates below.

**Phase: A → B → C → D → F1 with explicit gates.** The owner delegated the specified reference-stage selections and the bounded verification-first kernel extraction. Freeze the complete World replay baseline before extraction and implement instrumentation before pallet code. The commissioned diagnostic packet still requires a complete committed registration before execution. Outside that delegated scope, normative OPEN cells require proposals and an owner choice, never default implementations. At most one focused owner question per checkpoint. Under D204, deployment is authorized only after the launch gates (C1 instrumentation before launch-facing code, the Q28 privacy selection, D108 consent/ethics, C2 tripwires and Q29 pause controls with kill criteria, F1 dossier with signed risk acceptance); no session, recruitment or personal-data collection precedes those gates, and no new dependency or frozen-evidence rewrite follows. The frozen baseline below is not a launch configuration.

## Conditional-mainnet preparation

### A — Executable-spec closure

The [Self-ID fixture](docs/simulator.en.md#self-id-transaction-fixture) and [dispute lifecycle](docs/simulator.en.md#rule-conformance-mapping) are delivered (A1 and A1b). Remaining work:

- [ ] **A2 — Dispute finances and authority.** Implement the delegated funded appeal and typed invitation/opening remedy contracts. Preserve original transfers and burns; exercise exact debt cancellation, both directions of reversal and the general enforceable-event identity across sequential cases and overlapping duties. Verify that supported admitted non-author cases can settle on either merits outcome.
- [ ] **A3 — Recovery migration and independent referendums.** Propose the completed-key-recovery × appeal migration and collective initiation/participant attribution beyond the entering member before implementing OPEN transitions. Preserve round-start electorates and selected votes; distinguish Council merits/appeals from XP-weighted network referendums. Encode unsupported interactions as pre-mutation refusals. Validate no retired-source revival, duplicate units, partial restoration or invented collective authority. Questions: Q25-B/C and Q27.

### B — Reference kernel and verification

- [ ] **B1 — Freeze the World replay baseline.** Complete and verify the selected event order, typed replay adapter and deterministic encoding of semantic state with explicit bounds before extracting the authorized `core`/`alloc` kernel. Keep production ordering distinct from the reference policy (Q27).
- [ ] **B2 — Extract approved subset and differential replay.** Replay identical versioned event logs through current World and the extracted kernel; compare complete semantic-state bytes and refusal atomicity after every event, not just endpoints. Preserve exact 10^-12 money and declared model policies. Tests remain std-only; no Substrate dependency or pallet is introduced.
Independent path and event-log verification (B3 subset) is [delivered](docs/simulator.en.md#verification-surface); it does not authorize extraction.

### C — Launch measurement and governed interventions

- [ ] **C1 — Instrumentation contract before any pallet code and, under D204, before deployment (launch gate).** Propose versioned case/observation/response/service records and privacy options in the protocol's OPEN contracts (Q28), then implement the approved or explicitly candidate synthetic subset in the simulator. Distinguish fresh-look/reread assertions from proven independence, evaluator truth from authorized reversals, and actual queue/service records from per-case response probability. Validate round trips, missingness, latency origins, zero-collection denominators and privacy exclusions.
- [ ] **C2 — Launch observation plan (D204 launch gate).** Preregister mappings from measurable records to D168 unknowns, reporting denominators and missingness. Select tripwires tied to existing K/L referendums, emission pause and dispute-opening pause, with explicit kill criteria; no invented honest-harm tolerance, automatic authority or proof that unobserved human properties are identifiable. Gate privacy and activation/execution choices through Q28/Q29.
- [ ] **C3 — Register bounded T9 and bootstrap research before runs.** Commit questions, exact arms/configurations, fresh reserved seeds, resource budgets, horizons, stop/kill rules and metrics before any execution. Test pause recovery versus XP entrenchment/correction loss and the pre-guaranteed D=1-2/three-seat trajectory with proposed exposure bounds. Unselected N_min phases or pause semantics stay labeled counterfactuals, not defaults; bind genesis funding/eligibility and governance assumptions first (Q29). No post-result matrix expansion.

### D — Last commissioned robustness study

- [ ] **D1 — Register one inverted-baseline packet, then execute only that packet.** Fix the adverse environment, including reread dependence, Council rate 0.1/turnout 0.3 and D168's selected 3 accusation attempts/operator/day; freeze the remaining environment and existing adversary resources explicitly. Reconcile candidate arms with the funded-opening baseline before registration; any soft-opening, confirm-before-case, repeat-event-deduplication or D164-halving counterfactual needs an explicit arm. Q29 binds the exact arm semantics, fresh reserved seeds and budget before the registration commit/run. Report break-even surfaces over unpriced account value V and bought-link price, unfinished outcomes and conditional applicability, not pass/fail launch verdicts or human calibration. No extra arms after unfavorable results. Corrupt-examiner attacks/red-team search remain contract-only until owner behavior and budget are supplied.

### Final acceptance boundary

- [ ] **F1 — Pre-launch dossier and risk-acceptance record (D204 launch gate).** Assemble the implemented-subset contract, linked OPEN proposals, launch-parameter surfaces, instrumentation contract and the owner's signed risk-acceptance statement in `docs/mainnet-readiness.en.md`; index it when created. Keep D168 REVISE, unmeasured human properties, unresolved choices and counterexamples visible. A blocked question is a deliverable, not an answered rule; under D204 deployment waits on this signed statement.

**Per-checkpoint acceptance:** code where contract-ready, deterministic transition/refusal tests, model-contract coverage/deviations and a milestone CHANGELOG entry; decisions only for actual owner choices. Every commit passes `cargo fmt --check`, `cargo clippy --release --all-targets -- -D warnings` and `cargo test --release` from `simulator/`. Every saved result retains seed, full configuration/policies and build identity in a fresh non-overwritten directory. No empirical run is authorized by plan approval alone.

## Dispute safety reconciliation

Review the remaining choices; earlier active-withdrawal probes are [historical](docs/insights.en.md#q26-dispute-safety-probes).

- [ ] **Resolve the good-faith losing-accuser question:** under [Q26](DECISIONS_NEEDED.md#q26-dispute-safety-and-arithmetic-review), bind any integrity exception; until selected, apply ordinary halving. Keep the prepared [integrity-precision choice](DECISIONS_NEEDED.md#q26-integrity-precision-candidate) separate.

- [ ] **Bind the co-presence evidence contract (human-gated):** answer [Q19](DECISIONS_NEEDED.md#q19--second-accounts-and-the-unwitting-inviter-d127) on authenticity, freshness, signer-to-person binding, recognition authority and fabricated meetings before relying on the unwitting-inviter exception as a validated defense. No co-presence data collection, session, pilot or separate empirical programme is authorized.

## Admission and remedies

- [ ] **Close selected-rule coverage after contract approval.** Start from the [model gaps](docs/simulator.en.md#deviations-and-assumptions): addressed invitations with prepared recipients and both slots at issuance; XP capacity schedule and the payer on re-entry; signed Self-ID and evidence; canonical path/verification inputs, including canonical membership epochs; cluster remedies, direct peer Council cases, and the distinction between target custody and an accused account's maturities. The delegated [selections](docs/decisions.en.md#protocol-decisions-after-consolidation) are authority for their scoped implementation; keep external [questions](DECISIONS_NEEDED.md#q31-identity-admission-and-execution-contracts) distinct. Verify atomic refusal and no repeat gate at invitation acceptance; verify case-specific custody and fee-free repair without releasing unrelated holds. Keep these separate from trusted fixture coverage and from the frozen baseline.

## Frozen research baseline

These axes describe the pre-deferral research baseline, not current conformance. Use the [model contract](docs/simulator.en.md) for present settings and the [final study](studies/2026-11-08-evidence-core/README.md) for exact historical configurations. Sections C and D require fresh registrations.

| Baseline axis | Value | Status |
| --- | --- | --- |
| Path bound (nodes) | 7 | fixed (D123) |
| Council size | 3 below 100 active, then the D33 lookup; equal votes | fixed (D133) |
| Paths | D disjoint paths to D different Council members | fixed (D134) |
| Paths avoid the accused of a dispute | the accused party only; the challenger stays usable | fixed (D131, softened by D157) |
| Owned-slot ceiling K | 100 | fixed (D100) |
| Guarantor count D | digits of the active count | fixed (stand-in for N_verified) |
| Layered support for intermediaries | on | fixed (D124, D142) |
| Detection precision | false-positive rate 0.003, inspection 0.03, accuracy 0.9, window 7 days | fixed (D142) |
| Proof of reality by a genuine account | success 0.95, 7 days (minimum, D142) | days fixed; probability 0.95 is an assumption (D136) |
| Examiner care | two independent own looks before filing a case (`--examiner-looks`) | proposed (D164 reasoning; registered on seeds 4001-4004: R1-R3 survive); the owner may overrule |
| Honest behavior rates | 20% careless accounts (accept strangers at 0.5, no second look), the rest at 0.05 | proposed (D143) |
| Attacker model | cone, honest-first, supported-first; operators 10-100; patience up to 120 days; optional bought honest accounts, cash-out and false accusations | proposed (D143); stronger models only on owner request |
| Snapshot and horizon | cloned default snapshot at 1000 honest accounts; final criterion at 730 days, 365 also reported | frozen for D168 closure, not a universal horizon |
| Emission path check | every Self-ID needs one path from the emitter to a Council member, at most 7 nodes, supported intermediates excluding the accused of disputes | fixed (D156/D157); K1 and K5 historically re-checked under it |
| Social recovery (D135) | key loss and recovery scenario (`--key-loss`, `--recovery-vouch`, `--recovery-delay`) | scenario done; works but slow and incomplete (study) |
| Identification reputation (D137) | not modeled | parked: no selected rule, not part of the core |

The [previous backlog](https://github.com/llblab/facety/blob/8a9d0f52739b03c35a4b769a628d46edeefa70e0/BACKLOG.md#core-closure-programme-opened-2026-11-06-finite) preserves completed work and pinned study references. Milestones live in [CHANGELOG](CHANGELOG.md).

## Owner-gated protocol work (carried over, not active)

- [ ] **Registry continuity (D200, Q30) — not scheduled.** Propose, when the baseline phase allows, the living-to-lived record transition, an archive format whose proofs outlive a particular chain, and the relation of lasting public dedication (D186) to a choice made once; no simulator or protocol change until the owner selects. See [Q30](DECISIONS_NEEDED.md#q30-registry-continuity-and-archive).
