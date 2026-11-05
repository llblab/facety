# Facety simulator backlog

Scope: a reproducible research simulator for [the proposed protocol](docs/facety.protocol.en.md) (Rust, [`simulator/`](simulator)), not a production runtime or proof of personhood. This file alone owns open work. Meaning lives in the protocol, decisions in the [decision log](docs/decisions.en.md), findings in the [insight register](docs/insights.en.md#consolidated-findings), outcomes in [CHANGELOG](CHANGELOG.md), assumptions and owner questions in [DECISIONS_NEEDED](DECISIONS_NEEDED.md). The pre-consolidation backlog (full narrative, parked work packages) is at [`legacy-node`](https://github.com/llblab/facety/blob/legacy-node/BACKLOG.md).

**Current priority (D129, D132):** show with the Rust simulator, up to a year or two of network growth, that the topology defense keeps the dirty-FACY share at most 10% and the clean share at least two thirds, at a bearable cost to honest people. Detection is always on; its design is the variable.

## Rust simulator

- [x] Core: graph, keyed randomness, exact length-bounded disjoint paths with verifier, layered support, world rules, runner, snapshot cloning, tests, documentation integrity guard.
- [x] Statistical validation against the retired simulator ([contract](docs/simulator.en.md#baseline-validation-statistical)). Node simulator, tests and raw artifacts deleted at the tag `legacy-node`.
- [ ] **Scale runs.** One-year runs at detection false-positive rates of 0.1%-0.3% (explosive honest growth, caps and memory), 100 operators against 7 nodes without layered support, supported-first at 30 operators, and a two-year horizon. Five year-long batches (10, 30 and 100 operators with layered support, 7 nodes without it, supported-first at 30) started with the old buffered output are still running (about 26 GB of memory) and print only at the end; new runs stream per seed. Results go to the [study](studies/2026-10-30-grown-network/README.md). Gate: compute and memory.
- [ ] **Registration tooling.** A committed registration (claim, presence, necessity by ablation, named alternatives, kill criterion, reserved seeds) and a runner mode that refuses changed implementations; until then every result is diagnostic.
- [ ] **Performance.** Profile the daily detection pass and the bounded search at 10^5-10^6 accounts; keep outcomes identical per seed.

## Topology defense

- [ ] **Detection precision.** The false-positive rate and the inspection rate decide honest cost (insight 5, 6). Design and compare: verification before opening a case, escalation thresholds, appeal and fee-free restoration of honest links, false-positive budgets per account.
- [ ] **Stronger attackers.** Patient or sleeper operators, real-person accomplices (D118) at 30-100 operators, detection-aware behavior, buying honest links systematically, compromised honest accounts.
- [ ] **Honest behavior realism.** Replace uniform acceptance rates with deliberate and careless acceptance, correlated friendships and cautious strangers' vetting with calibrated look quality.
- [ ] **Second accounts and the unwitting inviter (Q19).** Proof of fault, acquittal evidence (joint co-presence artifact), collusion risk, what the acquittal covers.
- [ ] **Remedy for a detected cluster (Q18, D119).** Quarantine, burden of proof, liability, recovery, repair for honest people.
- [ ] **Protocol text.** Restate D123, D124 and D131 in protocol §46.15 as the owner adopts them.

## Owner-gated protocol work (carried over, not active)

Dynamic Council and verified independence (D33), event-time liability (D34), 24-hour maturity credit in the simulator (D42), Council contracts (D64-D72), K-referendum weights (D87-D90), witness-certified path gate and indexer (D61, parked), human calibration (needs ethics and funding). Details at the tag above; reopen only through a concrete falsifier or an owner redirection.

## Maintenance

- [ ] Keep `cargo test --release` green (it guards links, anchors and English-only text). When a page is superseded, stub it to the tag instead of keeping parallel text.
