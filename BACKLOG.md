# Facety simulator backlog

Scope: a reproducible research simulator for [the proposed protocol](docs/facety.protocol.en.md) (Rust, [`simulator/`](simulator)), not a production runtime or proof of personhood. This file alone owns open work. Meaning lives in the protocol, decisions in the [decision log](docs/decisions.en.md), findings in the [insight register](docs/insights.en.md#consolidated-findings), outcomes in [CHANGELOG](CHANGELOG.md), assumptions and owner questions in [DECISIONS_NEEDED](DECISIONS_NEEDED.md). The pre-consolidation backlog (full narrative, parked work packages) is at [`legacy-node`](https://github.com/llblab/facety/blob/legacy-node/BACKLOG.md).

**Current priority (D129, D132):** show with the Rust simulator, up to a year or two of network growth, that the topology defense keeps the dirty-FACY share at most 10% and the clean share at least two thirds, at a bearable cost to honest people. Detection is always on; its design is the variable.

**Phase (D140): baseline complete, awaiting owner feedback.** Every axis below has a named value; the last three were proposed by the builder (D143) and the owner may overrule them. From here a broad benchmark and a search for pits at particular values make sense. Order of work (D141): stability, analysis, understanding, representativeness.

| Baseline axis | Value | Status |
| --- | --- | --- |
| Path bound (nodes) | 7 | fixed (D123) |
| Council size | 3 below 100 active, then the D33 lookup; equal votes | fixed (D133) |
| Paths | D disjoint paths to D different Council members | fixed (D134) |
| Paths avoid accounts in a dispute | on | fixed (D131) |
| Owned-slot ceiling K | 100 | fixed (D100) |
| Guarantor count D | digits of the active count | fixed (stand-in for N_verified) |
| Layered support for intermediaries | on | fixed (D124, D142) |
| Detection precision | false-positive rate 0.003, inspection 0.03, accuracy 0.9, window 7 days | fixed (D142) |
| Proof of reality by a genuine account | success 0.95, 7 days (minimum, D142) | days fixed; probability 0.95 is an assumption (D136) |
| Honest behavior rates | 20% careless accounts (accept strangers at 0.5, no second look), the rest at 0.05 | proposed (D143) |
| Attacker model | cone, honest-first, supported-first; operators 10-100; patience up to 120 days | proposed (D143); stronger models still welcome |
| Snapshot and horizon | snapshot at 1000 honest accounts; criterion at 365 days, 730 as stress | proposed (D143) |
| Social recovery (D135), identification reputation (D137) | recovery operations in the world, no scenarios; reputation not modeled | open: scenarios and model |

## Rust simulator

- [x] **Correctness and trust pass (2026-11-06).** Single-use social recovery with a strengthened audit; one formal-case procedure with the XP gate (§25) for every route; saved results with the full configuration, schema, engine, randomness policy, build commit and phases, valid JSON, no silent overwrite; strict parameter and argument validation; `cargo fmt --check`, `cargo clippy -D warnings` and `cargo test` green. Statistics of earlier runs are not comparable (see the simulator contract).
- [ ] **Recovery and dynamics (D141, after the baseline).** Measure how the system keeps and restores the honest community after errors (regrowth after false-positive shocks, restoration of wrongly invalidated accounts, time to recover) and show time series (attacker share, dirty-FACY share, honest accounts) as SVG or HTML graphs instead of single-day endpoints. Order of work: stability, analysis, understanding, representativeness.

- [x] Core: graph, keyed randomness, exact length-bounded disjoint paths with verifier, layered support, world rules, runner, snapshot cloning, tests, documentation integrity guard.
- [x] Statistical validation against the retired simulator ([contract](docs/simulator.en.md#baseline-validation-statistical)). Node simulator, tests and raw artifacts deleted at the tag `legacy-node`.
- [x] **Scale runs under the baseline (2026-11-06).** One year with 10, 30 and 100 operators, a patient supported-first attacker, an honest-first attacker (12 to 20 seeds each) and two years with 30 operators (3 seeds): the cone never forms, the attacker share is the operators divided by the honest accounts (0.09% to 0.95% of accounts, at most 1.5% of FACY), far inside the D129 criterion. Tables: [simulator contract](docs/simulator.en.md#baseline-validation-statistical).
- [ ] **Registration tooling.** A committed registration (claim, presence, necessity by ablation, named alternatives, kill criterion, reserved seeds) and a runner mode that refuses changed implementations; until then every result is diagnostic.
- [ ] **Standing: simulator efficiency (D138).** Never closed. Done: exact two-sided pruning of the path search (30%-40% faster in the heavy mode); the end-of-run `audit()` made linear instead of quadratic in accounts (58 s to 2 s for four seeds at 3000 honest accounts, outputs byte-identical), which turned a year of growth from impossible into about 50 s per seed. Efficiency settings are a baseline of their own (D145): they never change outcomes, and a faster mechanism becomes the default where it helps. Done: the search order among equal distances is a setting with four values (`--search-order none|xp|degree|both`, the owner's ideas of XP and of the number of guarantors, alone and together); measured steps: heavy ablation without layered support none 986M, XP 820M (best, 17% fewer, 20% fewer lost searches), degree 949M, both 906M; baseline with layered support none 126k (best), XP 301k, degree 834k, both 312k; at a year and 10,000 accounts the whole search is only 130k steps, so the order cannot matter there. The automatic default is XP without layered support and none with it. The real cost at scale is not the search but the honest behavior: friend-of-friend selection now uses a stamp array and a partial selection instead of sorting and deduplicating lists, and integer-keyed tables use a fast hasher; together about three times faster per seed (34-40 s to 12-14 s for 250 days), with byte-identical results; the two-sided structure already exists (distances from the Council are cached once a day and shared, distances from the issuer are computed per issuer). Next ideas: no-good memoization and negative caches per issuer and epoch in the path search, incremental support levels, bitset adjacency, struct-of-arrays instead of per-account heap allocations, threads inside one run for the daily detection pass. Every change must leave outcomes identical per seed (compare saved results before and after) or declare the deviation in the simulator contract.
- [ ] **Re-measure under the current rules.** Scale runs (year, 10/30/100 operators, supported-first) were started under the rules before D131, D133, D134 and D136 and were stopped; redo them only after the open axes above are fixed (D140).

## Topology defense

- [ ] **Growth stalls near 10,000 active accounts.** In every year-long run honest growth reaches about 10,100 accounts and then stays there while the difficulty D flips between 4 and 5 around the ten-thousand boundary. Refusals show the Council-path gate ("insufficient Council paths") far above the guarantor count as the blocker, so five disjoint paths of at most seven nodes to five different seats of an 11-seat Council are rarely available in a ten-thousand-account network. Targeted checks done (500 days, 4 seeds, honest accounts at the end): baseline 10,482; path bound 9: 12,018; D capped at 4: 12,422; K = 300: 10,673; 21 seats from 100 active: 17,715; attackers stay at 10 accounts everywhere. So the plateau is set mainly by the Council size against D. Council-size map done (500 days, 100 operators, 4 seeds, in the [study](studies/2026-10-30-grown-network/README.md#growth-against-security-council-size-d144-diagnostic)): 11 seats 10,324 honest accounts, 21 seats 16,724, 31 seats 33,134, 51 seats 66,592, with the attacker share falling from 0.95% to 0.15%; a rule of seats at least a multiple of D gives 11,082 (3 per unit), 16,951 (4) and 24,917 (5, attacker share 0.40%). Also 6 per unit of D: 32,491 and 8 per unit: 49,887 (attacker share 0.31% and 0.20%); two years with 5 per unit: 23,843, so every fixed rule has its own plateau (about 1,000 honest accounts per seat at D = 5). Next (D144): decide what plateau the network should have and how the number of seats should follow the size (a rule that grows faster than D), weigh the cost of a larger Council (computation, maintenance) and propose a Council-size rule; mind the open Council-size lookup (D33). Levers: `--bound`, `--council-seats`, `--max-d`, `--k`. This is a protocol-design question, not an attacker result.

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
