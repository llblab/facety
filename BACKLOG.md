# Facety simulator backlog

Scope: a reproducible research simulator for [the proposed protocol](docs/facety.protocol.en.md) (Rust, [`simulator/`](simulator)), not a production runtime or proof of personhood. This file alone owns open work. Meaning lives in the protocol, decisions in the [decision log](docs/decisions.en.md), findings in the [insight register](docs/insights.en.md#consolidated-findings), outcomes in [CHANGELOG](CHANGELOG.md), assumptions and owner questions in [DECISIONS_NEEDED](DECISIONS_NEEDED.md). The pre-consolidation backlog (full narrative, parked work packages) is at [`legacy-node`](https://github.com/llblab/facety/blob/legacy-node/BACKLOG.md).

**Current priority (D129, D132):** show with the Rust simulator, up to a year or two of network growth, that the topology defense keeps the dirty-FACY share at most 10% and the clean share at least two thirds, at a bearable cost to honest people. Detection is always on; its design is the variable.

**Phase (D140): forming the baseline.** Hypotheses, the best construction of the baseline and feedback; targeted checks, no exhaustive sweeps. A broad benchmark and a search for pits at particular values start only when every axis below is fixed.

| Baseline axis | Value | Status |
| --- | --- | --- |
| Path bound (nodes) | 7 | fixed (D123) |
| Council size | 3 below 100 active, then the D33 lookup; equal votes | fixed (D133) |
| Paths | D disjoint paths to D different Council members | fixed (D134) |
| Paths avoid accounts in a dispute | on | fixed (D131) |
| Owned-slot ceiling K | 100 | fixed (D100) |
| Guarantor count D | digits of the active count | fixed (stand-in for N_verified) |
| Layered support for intermediaries | off in code, tested on | open: owner adoption (D124) |
| Detection precision (inspect rate, false-positive rate, accuracy, windows) | 0.1, 0.01, 0.9, 7 days | open: owner choice of false-positive rate (0.3% proposed) |
| Proof of reality by a genuine account | success 0.95, 3 days | open: assumption (D136) |
| Honest behavior rates | uniform acceptance rates | open: realism (deliberate and careless acceptance) |
| Attacker model | cone, honest-first, supported-first; operators 10-100 | open: stronger attackers |
| Snapshot and horizon | 1000 accounts, 60 days to one year | open: horizon for the criterion |
| Social recovery (D135), identification reputation (D137) | recovery operations in the world, no scenarios; reputation not modeled | open: scenarios and model |

## Rust simulator

- [x] Core: graph, keyed randomness, exact length-bounded disjoint paths with verifier, layered support, world rules, runner, snapshot cloning, tests, documentation integrity guard.
- [x] Statistical validation against the retired simulator ([contract](docs/simulator.en.md#baseline-validation-statistical)). Node simulator, tests and raw artifacts deleted at the tag `legacy-node`.
- [ ] **Scale runs (gated by the baseline axes, D140).** One-year and two-year horizons, 10/30/100 operators and a stronger attacker against the fixed baseline; the batches started under the earlier rules were stopped. Gate: open axes in the table above.
- [ ] **Registration tooling.** A committed registration (claim, presence, necessity by ablation, named alternatives, kill criterion, reserved seeds) and a runner mode that refuses changed implementations; until then every result is diagnostic.
- [ ] **Standing: simulator efficiency (D138).** Never closed. Look for better algorithms and caching, even where the chain could not use them, so that more days and more nodes run locally: exact two-sided pruning of the path search (done), no-good memoization, negative caches per issuer and epoch, incremental support levels, bitset adjacency, struct-of-arrays instead of per-account heap allocations, threads inside one run for the daily detection pass. Every change must leave outcomes identical per seed (compare JSON before and after) or declare the deviation in the simulator contract.
- [ ] **Re-measure under the current rules.** Scale runs (year, 10/30/100 operators, supported-first) were started under the rules before D131, D133, D134 and D136 and were stopped; redo them only after the open axes above are fixed (D140).

## Topology defense

- [ ] **Detection precision.** The false-positive rate and the inspection rate decide honest cost (insight 5, 6). Design and compare: verification before opening a case, escalation thresholds, appeal and fee-free restoration of honest links, false-positive budgets per account.
- [ ] **Stronger attackers.** Patient or sleeper operators, real-person accomplices (D118) at 30-100 operators, detection-aware behavior, buying honest links systematically, compromised honest accounts.
- [ ] **Honest behavior realism.** Replace uniform acceptance rates with deliberate and careless acceptance, correlated friendships and cautious strangers' vetting with calibrated look quality.
- [ ] **Second accounts and the unwitting inviter (Q19).** Proof of fault, acquittal evidence (joint co-presence artifact), collusion risk, what the acquittal covers.
- [ ] **Remedy for a detected cluster (Q18, D119).** Quarantine, burden of proof, liability, recovery, repair for honest people.
- [ ] **Protocol text.** D123, D131, D133 and D134 are written in §46.14-§46.15; D124 stays a proposal until adopted. The retired first-100 exception (D91) was removed from the summary tables, §18, §20, §34 and §46; D89 is marked superseded.
- [ ] **Model the new concepts.** Social recovery (D135): the world-level operations and tests exist; still to do are runner scenarios (key-loss rate, recovery success and time, abuse by colluding former guarantors) and design variants. Identification reputation (D137): attestations weighted by closeness and independence, not modeled.

## Owner-gated protocol work (carried over, not active)

Dynamic Council and verified independence (D33), event-time liability (D34), 24-hour maturity credit in the simulator (D42), Council contracts (D64-D72), K-referendum weights (D87-D90), witness-certified path gate and indexer (D61, parked), human calibration (needs ethics and funding). Details at the tag above; reopen only through a concrete falsifier or an owner redirection.

## Maintenance

- [ ] Keep `cargo test --release` green (it guards links, anchors and English-only text). When a page is superseded, stub it to the tag instead of keeping parallel text.
