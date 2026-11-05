# Simulator contract

The simulator is one Rust crate, [`simulator/`](../simulator), standard library only (D130). It replaced the Node.js simulator; that implementation, its tests and its raw results are preserved only at the git tag `legacy-node`. This page owns what is implemented, the declared deviations from the [protocol](facety.protocol.en.md), every simulation assumption, and how the baseline was validated. Protocol meaning lives in the protocol; decisions in the [decision log](decisions.en.md); findings in the [insight register](insights.en.md); open work in [BACKLOG](../BACKLOG.md).

## Layout and use

| Module | Owns |
| --- | --- |
| `graph.rs` | directed graph with sorted adjacency lists, revision counter |
| `rng.rs` | decision-keyed randomness (policy `facety-sim-rng/v1`) |
| `paths.rs` | layered support (D124), exact length-bounded internally vertex-disjoint paths (D36/D123) with an independent verifier |
| `world.rs` | accounts, Self-ID acts and XP, owned valences and K slots, special invitation links, disputes as activity holds, the Council-path gate |
| `runner.rs` | the takeover runner: honest behavior, attacker strategies, detection |
| `main.rs` | `facety-sim grown`: grow an honest network to a size, then attack clones of that snapshot |

```text
cargo test --release                     # unit tests, parity tests, documentation integrity
cargo run --release -- grown --seeds 20 --bound 7 --layered --attackers 10 --horizon 60
```

`grown` flags: `--bound N|none`, `--layered`, `--allow-disputed` (ablation of D131), `--attackers`, `--horizon`, `--target-honest`, `--strategy cone|honest-first|supported-first`, honest levers (`--vetting`, `--vet-sens`, `--vet-fpr`, `--met`, `--double`), detection levers (`--inspect`, `--fpr`, `--sens`, `--review`, `--accuracy`, `--public-look`, `--acquit`, `--detect-prefix`), `--max-subjects`, `--threads`, `--out DIR`, `--prefix-only`. Output is one JSON line per seed (and full histories with `--out`).

## Randomness

Every decision draws from its own stream keyed by (root seed, channel, actor, day), so unrelated decisions never share a stream offset. Generator: splitmix64 seeding into xoshiro256**. The identifier `facety-sim-rng/v1` replaces the retired `sha256-xoshiro128starstar-v2`; results are statistically comparable with the retired simulator, not bit-identical. A new key layout or generator needs a new identifier. A snapshot is a clone of the whole simulation state (`Sim: Clone`), so many attack variants start from one grown network without replaying its history.

## Implemented rules

The accepted rules are fixed in the code; they are not options.

| Rule | Where |
| --- | --- |
| D35 pre-guaranteed genesis: ring lattice plus seeded chords, two open valences per pair, no mint or burn | `Sim::new`, `World::new` |
| D91 initial bootstrap until the first 100 active accounts, then a permanent latch | `World::tick` |
| D84 Self-ID needs one mutual guarantor; outside bootstrap that guarantor reaches a Council member within the path bound | `World::create_self_id` |
| D93/D94/D110 paid valences burn one own mature right, never refunded; matching opposite valences establish a mutual guarantee; withdrawal is free and ends the pair | `open_valence`, `withdraw_valence` |
| D100/D106 K slots: own open valences plus one invitation unit at each endpoint from issuance | `used_slots` |
| D105-D107 special invitation: inviter pays one right, eligibility checked once at issuance, 24h freeze with guarantor veto, free link termination | `create_invitation`, `accept_invitation`, `cancel_invitation`, `end_invitation_link` |
| D104/D36 invitations also need D internally vertex-disjoint current paths to one Council member | `invitation_paths_ok` |
| D123 every counted path has at most `max_nodes` nodes, endpoints included (default 7) | `paths.rs` |
| D124 (lever `layered`) path intermediates must be layered-supported | `layered_support` |
| D131 accounts in an open dispute are not path intermediaries (lever `exclude_disputed`, default on) | `begin_case`, `end_case` |
| D77 open-dispute parties cannot create Self-IDs, invitations or valences | `require_free` |
| D33 Council lookup: under 100 active accounts no formal Council, 100 to 999,999 active accounts 11 seats, then 101, ...; D = digits of the active count stands in for N_verified | `council_target` |
| D82 guarantor XP only for guarantees established when the right is used; XP revoked when a guarantee ends (the ending party's guarantor role) or a veto or chain cut revokes the source | `credit`, `deactivate` |
| D111 one equal Council vote (not exercised by the runner) | n/a |

## Deviations and assumptions

- Terminal XP finality: XP is credited when an emission right is used. This is the labeled legacy reference; the D42 24-hour maturity credit is not implemented.
- The Council, the active count and difficulty D, the layered-support levels and the distance pruning are refreshed once per simulated day, not on every call. An account created today is therefore not seen by today's distance pruning.
- Council ties break by account index (older first).
- No Collector market, stakes, fines, debt or Treasury: conversion only turns a right into liquid money so that dirty-FACY share can be measured.
- Disputes are an abstraction: a case holds both parties (D77) and a verdict is correct with the declared accuracy; detection is not correction.
- Evaluator labels (cohort and identity kind) are read only by the observation functions of noisy looks and verdicts; the world never sees them.
- Fake accounts cost nothing beyond protocol FACY (an upper bound on attacker ease). Attacker operators are real people; only cone accounts and double-life accounts are false identities.
- Honest behavior rates, detection parameters and the 28-day activity window are scenario assumptions, not calibrated human behavior. Raw reports of attack outcomes are conditional on scenario, policy, horizon, seeds and the success criterion (D129).
- Detection is always on (D125); the retired no-detection arms are not reproduced.

## Research levers

Configuration exists only where the research varies something.

| Lever | Default | Meaning |
| --- | --- | --- |
| `world.max_nodes`, `world.layered`, `world.exclude_disputed`, `world.k`, `world.search_budget` | 7, off, on, 100, 300000 | path bound, support rule, D131, K, work budget of one exact search (running out is counted and refused) |
| `strategy` | cone | attacker pairing: `cone` pairs inside the cone, `honest-first` first collects D honest partners through friends of its honest partners, `supported-first` also links fakes to supported cone members |
| `honest.vetting`, `vetting_sensitivity`, `vetting_false_positive` | 0 | probability and look quality of a look at a stranger before accepting a valence request (D126) |
| `honest.met_in_person`, `double_life`; `detection.acquit_met` | 0, 0, off | in-person acquaintance, a member's second account invited in good faith, and acquittal of honest inviters (D127, Q19) |
| `detection.*` | review 0.5, inspect 0.1, sensitivity 0.8, false positive 0.01, window 7 days, accuracy 0.9, public look 0.02 | freeze veto, partner inspection, noisy looks, one-step verdicts, public evidence with escalation, follow-up, leaving |
| `detection_start_day`, `stop_at_honest` | 0 (the prefix runs detection), 0 | snapshot controls |

## Baseline validation (statistical)

The retired simulator grew an honest network to 1000 accounts without detection and switched detection on at the snapshot; the Rust runner reproduces that with the default flags (without `--detect-prefix`). Ten attackers, 60 days after the snapshot, detection on:

| Rule | Retired simulator (3 seeds) | Rust (20 seeds) |
| --- | --- | --- |
| 7 nodes: attacker share of accounts | 29.2%, 45.3%, 19.5% | mean 24.7%, range 9.2%-43.3% |
| 7 nodes + layered support | 0.4%, 0.5%, 0.6% | mean 0.5%, range 0.4%-0.7% |
| days to 1000 honest accounts, 7 nodes | 134, 129, 128 | mean 127 (12 seeds, range 119-132) |
| days to 1000 honest accounts, layered | 137 (seed 1) | mean 136 (12 seeds, range 122-142) |

The speed gain is about 300 times for growing to 1000 accounts and 10 to 100 times for a 60-day attack. Exactness is checked, not assumed: `paths.rs` is compared with brute-force enumeration on random graphs (8400 bounded cases and the unbounded flow value), layered support with a naive fixed point, and `world.rs` keeps an `audit` of conservation, edges, XP recomputed from receipts and slot units that runs after every test run and every `grown` attack.
