<h1 align="center">
  <img src="docs/facety-banner.svg" alt="Facety" width="100%">
</h1>

<p align="center">
  <strong>Human trust. Shared responsibility.</strong><br>
  A proposed protocol and a Rust research workbench for accountable participation.
</p>

<p align="center">
  <strong><a href="docs/rules-of-the-game.en.md">Read the rules</a></strong>
  &nbsp; · &nbsp;
  <a href="docs/facety.protocol.en.md">Explore the protocol</a>
  &nbsp; · &nbsp;
  <a href="docs/README.md">Browse the docs</a>
</p>

<p align="center">
  <strong>Research stage</strong> ·
  <a href="studies/2026-11-08-evidence-core/README.md">Operational assumptions under revision</a>
</p>

---

## People, guarantees, consequences

Facety connects repeated identity claims, mutual guarantees and responsibility for public acts. Participants put their own history behind the people they vouch for. Claims can be challenged, defended and corrected through a shared dispute process.

The aim is to make honest participation easier and more rewarding than identity fraud, while limiting emission captured by fabricated identities. That is a design goal whose operational dependencies still need validation.

Three layers stay distinct:

- **Identity** — claims about real, unique people, open to challenge. Guarantees and paths do not certify personhood.
- **Responsibility** — personal XP and integrity from specified acts and consequences. They establish neither usefulness nor truth.
- **Emission** — FCTY (FaCT You) distribution under the protocol. Monetary holdings do not confer procedural authority.

## Where the project stands

> **Research closed. Revise the operational assumptions.**
>
> The [evidence-core study](studies/2026-11-08-evidence-core/README.md) completed 38 Rust runs. Attack containment survived within the tested scenarios; independent evidence, timely qualified help and effective correction remain unverified human dependencies. The study recommends resolving them before production implementation or a human pilot.

The Rust research model implements maturity-based XP, responsibility and integrity, supported Council paths, staked disputes, Council voting rounds, 24-hour pending openings, author cancellation and case-specific restoration with FIFO debt. An explicit appeal fixture now connects requests and prior opening transactions to Council review and exact restoration. FCTY accounting uses twelve decimal places.

The [simulator contract](docs/simulator.en.md#appeal-fixture-contract) defines that implemented subset and its assumptions. Earlier results retain their original builds and arithmetic; they do not validate later mechanics. Appeal admission/authentication, financial scope and active cancellation, production execution, completed key-recovery migration and actual human capacity remain open. A blocked restoration retains the Council's reversal authorization without partially restoring assets or XP. Self-ID chain-correction pricing is selected, with its count frozen at uncancelled 24-hour opening activation, but is not implemented. Distinct opening-guarantor veto and anytime author-cancellation authority are also selected; late/spent/finalized execution effects remain open rather than implying refunds or verdict rollback.

The owner has commissioned [conditional-mainnet preparation](BACKLOG.md#conditional-mainnet-preparation): executable-spec closure, reference-kernel verification, launch measurement and bounded registered rule comparisons. The owner confirmed the execution plan for contract-ready implementation; kernel extraction retains a separate owner checkpoint. No rehearsal or pilot precedes mainnet development under this direction. The proposed [operational defense contract](docs/operational-defense.en.md) and [manual kit](studies/2026-11-08-operational-defense/README.md) remain unused and supply no human evidence. D168 REVISE stands; development is not deployment permission or acceptance of launch risk without human evidence.

## Find your way

| Start here to… | Read |
| --- | --- |
| **Understand participation** | [Rules of the Game](docs/rules-of-the-game.en.md) · [Protocol](docs/facety.protocol.en.md) |
| **Assess the evidence** | [Findings](docs/insights.en.md#consolidated-findings) · [Final study](studies/2026-11-08-evidence-core/README.md) |
| **Inspect human-evidence gaps** | [Operational contract](docs/operational-defense.en.md) · [Manual kit](studies/2026-11-08-operational-defense/README.md) |
| **Inspect the model** | [Simulator contract](docs/simulator.en.md) · [Rust source](simulator/src) |
| **Trace a decision** | [Decision log](docs/decisions.en.md) · [Changelog](CHANGELOG.md) |
| **See what remains open** | [Backlog](BACKLOG.md) · [Questions and assumptions](DECISIONS_NEEDED.md) |

The [documentation index](docs/README.md) connects the full collection of specifications and studies.

## Work with the simulator

**Rust, standard library only.** From the repository root:

```sh
cd simulator
cargo test --release
cargo fmt --check
cargo clippy
```

The checks cover protocol transitions, independent graph references, accounting invariants and documentation integrity.

<details>
<summary><strong>Run a research scenario</strong></summary>

From `simulator/`:

```sh
cargo run --release -- grown \
  --seeds 4 \
  --attackers 10 \
  --horizon 60
```

Each seed first grows an honest network to the target size, then runs the attack phase from that snapshot with detection enabled. The growth prefix runs without detection. Results are conditional on the declared scenario, policies, horizon and seeds.

Consult the [simulator contract](docs/simulator.en.md) for defaults, levers, deviations, resource requirements and validation. The former Node.js simulator is archived at the `legacy-node` git tag.

</details>

## Working agreements

Read [AGENTS.md](AGENTS.md) before changing the project. Repository documentation is in English. The protocol owns meaning, the simulator contract owns model assumptions, and [BACKLOG.md](BACKLOG.md) alone owns open work. Research results keep their evidence level and limitations.

## Public domain

Dedicated to the public domain. See [LICENSE](LICENSE). It belongs to everyone.
