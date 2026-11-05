# Simulator contract

The simulator is one Rust crate, [`simulator/`](../simulator), standard library only (D130). It replaced the Node.js simulator; that implementation, its tests and its raw results are preserved only at the git tag `legacy-node`. This page owns what is implemented, the declared deviations from the [protocol](facety.protocol.en.md), every simulation assumption, and how the baseline was validated. Protocol meaning lives in the protocol; decisions in the [decision log](decisions.en.md); findings in the [insight register](insights.en.md); open work in [BACKLOG](../BACKLOG.md).

## Layout and use

| Module | Owns |
| --- | --- |
| `graph.rs` | directed graph with sorted adjacency lists, revision counter |
| `rng.rs` | decision-keyed randomness (policy `facety-sim-rng/v1`) |
| `paths.rs` | layered support (D124), exact length-bounded internally vertex-disjoint paths (D36/D123) with an independent verifier |
| `json.rs` | escaping and a strict validator, so saved results are always valid JSON |
| `world.rs` | accounts, Self-ID acts and XP, owned valences and K slots, special invitation links, disputes as activity holds, the Council-path gate |
| `runner.rs` | the takeover runner: honest behavior, attacker strategies, detection |
| `main.rs` | `facety-sim grown`: grow an honest network to a size, then attack clones of that snapshot |

```text
cargo test --release                     # unit tests, parity tests, documentation integrity
cargo run --release -- grown --seeds 20 --bound 7 --layered --attackers 10 --horizon 60
```

`grown` flags: `--bound N|none`, `--layered`, `--allow-disputed` (ablation of D131), `--attackers`, `--horizon`, `--target-honest`, `--strategy cone|honest-first|supported-first`, honest levers (`--vetting`, `--vet-sens`, `--vet-fpr`, `--met`, `--double`), detection levers (`--inspect`, `--fpr`, `--sens`, `--review`, `--accuracy`, `--public-look`, `--acquit`, `--detect-prefix`), `--council-seats`, `--max-d`, `--k`, `--xp-priority`, `--careless`, `--careless-accept`, `--patience`, `--defense`, `--defense-days`, `--disputes-from`, `--honest-genesis`, `--max-subjects`, `--threads`, `--out DIR`, `--prefix-only`. Output is one JSON line per seed, printed as each seed finishes (order by completion; sort by the `seed` field). Unknown or repeated options, missing values and invalid parameters (probabilities outside [0, 1] or not finite, zero seeds, threads or horizon, a path bound outside 2..32, layered support without a bound, a target below the genesis size) are refused with `error: ...` and exit code 2; nothing runs and nothing is saved.

With `--out DIR` each seed writes `DIR/<seed>-<configuration digest>.json` containing `meta` (build commit and whether the tree was dirty when built, elapsed seconds, threads, command line) and `result` (schema `facety-sim/result-v2`, engine, randomness policy, the initial configuration, every later phase with its day and complete configuration, the effective configuration, completed days, the reason the run stopped or was censored, counters, the daily history). The growing phase and the attack phase keep separate configurations. The digest covers seed, initial configuration and phases, so the same seed with different settings never shares a file. A file that already exists is never overwritten silently: the run reports the conflict and exits with code 3 unless `--overwrite` is given. `tests/cli.rs` guards the command line and the saved files; the result section is byte-identical for identical runs.

## Randomness

Every decision draws from its own stream keyed by (root seed, channel, actor, day), so unrelated decisions never share a stream offset. Generator: splitmix64 seeding into xoshiro256**. The identifier `facety-sim-rng/v1` replaces the retired `sha256-xoshiro128starstar-v2`; results are statistically comparable with the retired simulator, not bit-identical. A new key layout or generator needs a new identifier. A snapshot is a clone of the whole simulation state (`Sim: Clone`), so many attack variants start from one grown network without replaying its history.

## Implemented rules

The accepted rules are fixed in the code; they are not options.

| Rule | Where |
| --- | --- |
| D35 pre-guaranteed genesis: ring lattice plus seeded chords, two open valences per pair, no mint or burn | `Sim::new`, `World::new` |
| D133 the Council has three equal-vote seats below 100 active accounts (genesis accounts seat it until enough are active); no initial-bootstrap exception | `council_target`, `World::tick` |
| D84 Self-ID needs one mutual guarantor that reaches a Council member within the path bound, at every size | `World::create_self_id` |
| D93/D94/D110 paid valences burn one own mature right, never refunded; matching opposite valences establish a mutual guarantee; withdrawal is free and ends the pair | `open_valence`, `withdraw_valence` |
| D100/D106 K slots: own open valences plus one invitation unit at each endpoint from issuance | `used_slots` |
| D105-D107 special invitation: inviter pays one right, eligibility checked once at issuance, 24h freeze with guarantor veto, free link termination | `create_invitation`, `accept_invitation`, `cancel_invitation`, `end_invitation_link` |
| D104/D134 invitations also need D internally vertex-disjoint current paths to D different Council members (any members, each used once) | `invitation_paths_ok`, `PathFinder::bounded` |
| D123 every counted path has at most `max_nodes` nodes, endpoints included (default 7) | `paths.rs` |
| D124 (adopted into the baseline, D142; lever `layered`) path intermediates must be layered-supported | `layered_support` |
| D131 accounts in an open dispute are not path intermediaries (lever `exclude_disputed`, default on) | `begin_case`, `end_case` |
| D77 open-dispute parties cannot create Self-IDs, invitations or valences | `require_free` |
| D33 Council lookup: 100 to 999,999 active accounts 11 seats, then 101, ... (three below 100, D133); D = digits of the active count stands in for N_verified | `council_target` |
| D135 key loss and social recovery: `lose_key`, `begin_recovery` (the new account is invited by a previous guarantor), `recovery_progress`, `complete_recovery` (at least half of the previous guarantors and at least D vouch by mutual guarantee). A lost account can be recovered by exactly one successor: validity and availability of the source are checked immediately before the transfer, consumption, XP transfer and retirement happen together, competing successors, repeated completion, self-recovery and invalid or retired sources are refused without changing anything. The earned XP returns; FACY, guarantees and invitations are not carried over. `audit` checks that every restored XP has a distinct, retired, lost source and a log entry. World-level only, the runner does not use it yet | `World` |
| D136 an accused genuine account proves reality with a declared probability and the case ends after a few days; fakes and second accounts cannot | `detect` (runner) |
| §25 ordinary direct challenge: a formal case opens only if the challenger holds more XP than the owner of the challenged transaction, both parties are accepted and distinct, and disputes are enabled at the current size (`disputes_from_active`). One procedure (`Sim::case_gate`, `open_case`) admits every route: partner inspection, public evidence, escalation and follow-up. An observer who does not qualify can only pass the suspicion on to a qualified, willing sponsor (`submit_suspicion`); a refused case changes nothing | `runner.rs` |
| D82 guarantor XP only for guarantees established when the right is used; XP revoked when a guarantee ends (the ending party's guarantor role) or a veto or chain cut revokes the source | `credit`, `deactivate` |
| D111 one equal Council vote (not exercised by the runner) | n/a |

## Deviations and assumptions

- Terminal XP finality: XP is credited when an emission right is used. This is the labeled legacy reference; the D42 24-hour maturity credit is not implemented.
- The Council, the active count and difficulty D, the layered-support levels and the distance pruning are refreshed once per simulated day, not on every call. An account created today is therefore not seen by today's distance pruning.
- Council ties break by account index (older first).
- No Collector market, stakes, fines, debt or Treasury: conversion only turns a right into liquid money so that dirty-FACY share can be measured.
- Disputes are an abstraction: a case holds both parties (D77) and a verdict is correct with the declared accuracy; detection is not correction. The challenged account stands for the owner of the challenged transaction in the XP gate, and stakes, Chekharda moves and the Council's merits vote are not modeled. The free cancellation of an immature Self-ID by a guarantor (the freeze veto) is a separate operation and does not pass the XP gate.
- Evaluator labels (cohort and identity kind) are read only by the observation functions of noisy looks and verdicts; the world never sees them.
- Fake accounts cost nothing beyond protocol FACY (an upper bound on attacker ease). Attacker operators are real people; only cone accounts and double-life accounts are false identities.
- Honest behavior rates, detection parameters and the 28-day activity window are scenario assumptions, not calibrated human behavior. Raw reports of attack outcomes are conditional on scenario, policy, horizon, seeds and the success criterion (D129).
- Detection is always on (D125); the retired no-detection arms are not reproduced.

## Research levers

Configuration exists only where the research varies something.

| Lever | Default | Meaning |
| --- | --- | --- |
| `world.max_nodes`, `world.layered`, `world.exclude_disputed`, `world.k`, `world.search_budget` | 7, on in the baseline (`--no-layered` is the ablation; the bare `WorldConfig` of the unit tests has it off), on, 100, 300000 | path bound, support rule, D131, K, work budget of one exact search (running out is counted and refused) |
| `strategy` | cone | attacker pairing: `cone` pairs inside the cone, `honest-first` first collects D honest partners through friends of its honest partners, `supported-first` also links fakes to supported cone members |
| `honest.careless_share`, `careless_accept_far` | 0.2, 0.5 | share of honest accounts that accept stranger requests at a higher rate and never take a second look (D143) |
| `world.council_seats`, `world.max_difficulty`, `world.xp_priority` | none, none, off | research levers: fix the Council seats from 100 active accounts, cap the difficulty D, try neighbors with more XP first in the path search (changes the work, not the answer, unless a search runs out of budget) |
| `attacker_patience_days` | 0 | patient operators build honest links and reputation for this many days before inviting fakes |
| `honest.vetting`, `vetting_sensitivity`, `vetting_false_positive` | 0 | probability and look quality of a look at a stranger before accepting a valence request (D126) |
| `honest.met_in_person`, `double_life`; `detection.acquit_met` | 0, 0, off | in-person acquaintance, a member's second account invited in good faith, and acquittal of honest inviters (D127, Q19) |
| `detection.*` | review 0.5, inspect 0.03, sensitivity 0.8, false positive 0.003, window 7 days, accuracy 0.9, public look 0.02, defense success 0.95, defense days 7 (both windows are at least seven days), `disputes_from_active` 0 (new cases open at any size) | freeze veto, partner inspection, noisy looks, one-step verdicts, public evidence with escalation, follow-up, leaving |
| `detection_start_day`, `stop_at_honest`, `honest_genesis` | 0 (the prefix runs detection), 0, 100 | snapshot controls and the genesis size |

## Baseline validation (statistical)

**Compatibility note.** The XP-gated formal-case procedure, single-use recovery, the baseline decisions of D142 and the baseline axes of D143 (careless honest accounts, patient operators, a one-year horizon) changed the simulator after the older tables below were measured; they describe the earlier simulators and are not comparable with it. Current baseline (Rust, `RunConfig::default()`), seed families `grown-1..`:

| Run | Attacker accounts | Attacker share of accounts | Dirty-FACY share (mean, max) | Honest accounts | Genuine invalidated |
| --- | --- | --- | --- | --- | --- |
| 10 operators, 60 days, 20 seeds | 10 | 0.6% (0.4%-0.7%) | 0.01% | 2308 | 0 |
| same, ablation `--no-layered` | cone grows | 31.7% (13.1%-53.8%) | 1.06% | 2275 | 0 |
| 10 operators, 365 days, 20 seeds | 10 | 0.09% | 0.10%, 0.14% | 10421 | 14 |
| 30 operators, 365 days, 12 seeds | 30 | 0.29% | 0.31%, 0.38% | 10295 | 15 |
| 100 operators, 365 days, 12 seeds | 98 | 0.95% | 1.15%, 1.53% | 10275 | 15 |
| 10 operators, patient 120 days, supported-first, 365 days, 12 seeds | 10 | 0.09% | 0.17%, 0.19% | 10470 | 16 |
| 30 operators, honest-first, 365 days, 12 seeds | 30 | 0.28% | 0.32%, 0.46% | 10415 | 15 |
| 30 operators, 730 days, 3 seeds | 30 | 0.29% | 0.29%, 0.34% | 10180 | 61 |

The cone never forms in the baseline: the attacker accounts are the operators themselves, so the shares are the operators divided by the honest accounts. Honest growth reaches about 10,000 accounts and then stalls (see the consolidated findings).


Two reference sets. Both use 10 attackers, 60 days after the snapshot, detection on.

**Earlier rule set (the retired simulator against Rust before D131, D133, D134 and D136).** The Rust runner reproduced the retired simulator's picture with the then-current rules (single Council endpoint, first-100 bootstrap, paths through disputes allowed, no reality proof):

| Rule | Retired simulator (3 seeds) | Rust (20 seeds) |
| --- | --- | --- |
| 7 nodes: attacker share of accounts | 29.2%, 45.3%, 19.5% | mean 24.7%, range 9.2%-43.3% |
| 7 nodes + layered support | 0.4%, 0.5%, 0.6% | mean 0.5%, range 0.4%-0.7% |
| days to 1000 honest accounts, 7 nodes | 134, 129, 128 | mean 127 (12 seeds, range 119-132) |
| days to 1000 honest accounts, layered | 137 (seed 1) | mean 136 (12 seeds, range 122-142) |

**Current rules (Rust only, 20 seeds).** The rules have moved on, so the retired simulator is no longer a reference; these numbers are the new baseline:

| Rule | Attacker share of accounts | Dirty-FACY share | Honest accounts after 60 days | Genuine invalidated | Days to 1000 honest |
| --- | --- | --- | --- | --- | --- |
| 7 nodes | mean 13.4% (1.6%-30.3%) | 0.30% | 2003 | 3 | 128 |
| 7 nodes + layered support | mean 0.6% (0.4%-0.8%) | 0.01% | 1672 | 3 | 137 |

After the end-of-run audit was made linear a year of network growth (one seed, about 11 thousand accounts) takes about 50 seconds. The speed gain over the retired simulator was about 300 times for growing to 1000 accounts and 10 to 100 times for a 60-day attack. Exactness is checked, not assumed: `paths.rs` is compared with brute-force enumeration on random graphs, including Council sets, blocked accounts and a source that is itself a member (bounded cases and the unbounded flow value); layered support is compared with a naive fixed point; `world.rs` keeps an `audit` of conservation, edges, XP recomputed from receipts and slot units that runs after every test run and every `grown` attack.
