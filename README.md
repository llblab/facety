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

**Conditional-mainnet preparation is active; deployment is not authorized.** The owner-confirmed [plan](BACKLOG.md#conditional-mainnet-preparation) covers executable-spec closure, reference-kernel verification, launch measurement and bounded registered rule comparisons. Only contract-ready implementation is authorized; kernel extraction retains a separate owner checkpoint. No rehearsal or pilot is a prerequisite to development or authorized by this direction.

> **Frozen evidence-core verdict: REVISE operational assumptions.**
>
> The [study](studies/2026-11-08-evidence-core/README.md) completed 38 Rust runs. Attack containment survived within the tested scenarios; independent evidence, timely qualified help and effective correction remain unverified human dependencies. Development permission neither changes that verdict nor accepts launch risk without human evidence.

The Rust model implements maturity XP/integrity, supported Council paths, exact twelve-decimal FCTY, staked identity disputes, Council rounds, pending openings, ordinary-case withdrawal and core-only linked appeal/restoration with FIFO debt. The [model contract](docs/simulator.en.md#implemented-rules) owns coverage and assumptions. Typed transaction provenance is implemented; N-priced non-author Self-ID settlement, opening-guarantor veto and author-first self-dispute are not. Production admission/authentication, appeal finances, recovery migration and other named contracts remain open. Tests and earlier-build results do not validate these missing transitions or human behavior.

The [operational proposal](docs/operational-defense.en.md) and [manual kit](studies/2026-11-08-operational-defense/README.md) remain unused references, not staffing, human observations or permission for a session/pilot.

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
cargo fmt --check
cargo clippy --release --all-targets -- -D warnings
cargo test --release
```

The checks cover protocol transitions, independent graph references, accounting invariants and documentation integrity.

<details>
<summary><strong>Run a research scenario</strong></summary>

Command shape only, not a registered research packet. Before a new run, commit its question, exact configurations, fresh reserved seeds, resource budget, horizons and stop/kill rules; use fresh output directories. Plan approval alone authorizes no empirical run.

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
