# Facety

**A living protocol and a research workbench for accountable human participation.** The self-contained [manifesto and protocol specification](docs/facety.protocol.en.md) owns Facety's purpose, mechanisms, selected rules and open contracts. This repository adds the decision log, the findings and one Rust simulator that tests the protocol's defenses against attack.

## Thesis

Facety is an accountability substrate for farming-resistant emission distribution and network growth ([D32](docs/facety.protocol.en.md#accountability-for-emission-and-growth-d32)): who is a real, unique, responsible participant, who vouched for whom, and what that costs. The aim is that honest participation is much easier and more profitable than identity fraud, and that the emission captured by violators stays too small to dilute the asset (D50, D129).

Three layers stay distinct: uniqueness (identity claims and guarantees are contestable, not certified personhood); contribution and reputation (XP records specified work and responsibility, not usefulness); emission and distribution.

## Where things live

| Question | Page |
| --- | --- |
| What are the default rules of participation? | [Rules of the Game](docs/rules-of-the-game.en.md) |
| What are the rules? | [Protocol](docs/facety.protocol.en.md) |
| Who decided what, when? | [Decision log](docs/decisions.en.md) |
| What did the simulations show? | [Insight register](docs/insights.en.md), study pages under [studies/](studies) |
| What does the simulator implement and assume? | [Simulator contract](docs/simulator.en.md) |
| How could people organize defense, and what is ready to rehearse? | [Proposed operational contract](docs/operational-defense.en.md), [unused manual kit](studies/2026-11-08-operational-defense/README.md) |
| What is open? What did we assume? | [BACKLOG](BACKLOG.md), [DECISIONS_NEEDED](DECISIONS_NEEDED.md) |
| What happened when? | [CHANGELOG](CHANGELOG.md) |
| Navigation of all documents | [docs/README.md](docs/README.md) |

## Current state (consolidated)

- **Research stage closed: REVISE operational assumptions before implementation/pilot (D168).** The [final evidence-core report](studies/2026-11-08-evidence-core/README.md) gives the frozen Rust baseline, minimal mechanism evidence, all 38 completed runs, failure examples and reproduction commands. Sampled containment survives; independent evidence and actual finite defense/appeal remain critical human dependencies. That study changed no selected rules. Its Grow Loop is stopped; further research, runtime or pilot work needs a separate assignment.
- The separate [operational proposal](docs/operational-defense.en.md) and [unused manual kit](studies/2026-11-08-operational-defense/README.md) prepare an owner decision without recruiting people or closing Q25. The later Council deferral rule is selected, including automatic seven-day extension without a majority; the binary-vote simulator and earlier results do not implement or validate it.
- The topology defense under study is the Council-path gate: a guarantor count `D` plus `D` internally vertex-disjoint current paths for every invitation, each ending at a different Council member (any `D` members of the Council, each used once; D134), each path at most 7 nodes (the bound limits on-chain verification cost), through layered-supported intermediaries excluding the accused of disputes (D157); every emission also needs one such path from the emitter, so that a cluster cut off from the Council cannot emit (D156). Detection of violators is always part of every attack simulation. The [consolidated findings](docs/insights.en.md#consolidated-findings) distinguish current evidence from historical readiness recommendations.
- The success criterion is the dirty-FACY share: at most 10% on the longest horizon, and a clean share of at least two thirds ([D129](docs/decisions.en.md)).
- The Node.js simulator is retired (D130). Its last version is the git tag `legacy-node`.

## The simulator

```text
cd simulator
cargo test --release                    # rule tests, graph oracles and the documentation integrity guard
cargo run --release -- grown --seeds 4 --attackers 10 --horizon 60      # the baseline rules; --no-layered is an ablation
```

Rust, standard library only. One command grows an honest network to a target size for each seed (the growth phase runs without detection), then runs the attack phase from that snapshot with detection on. Levers, defaults, assumptions, validation, the resource profile and the [benchmark panels for default-rule changes](docs/simulator.en.md#benchmark-panels-for-default-rule-changes) are in the [simulator contract](docs/simulator.en.md).

## Conventions

English only; no quotes of owner prompts. The protocol carries no provenance (decision IDs appear as bare trace tags). Every simulation result is conditional on its declared scenario, policy, horizon and seeds. Mechanism claims need a committed registration, a kill criterion and reserved seeds. See [AGENTS.md](AGENTS.md).

## License

This project is dedicated to the public domain and has no license: see [LICENSE](LICENSE). It belongs to everyone.
