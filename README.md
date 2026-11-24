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

<p align="center">
  <a href="https://doi.org/10.5281/zenodo.24454490"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.24454490.svg" alt="Research snapshot DOI: 10.5281/zenodo.24454490"></a>
</p>

---

## People, guarantees, consequences

Facety began by asking whether economic incentives could grow the human social network itself. Basing issuance on individual people rather than computing power or institutional privilege raises an immediate question: how can the network tell a person from any number of accounts? Mutual identification, accountable guarantees and a way to correct claims follow from that problem. See the [project's origin and design logic](docs/insights.en.md#genesis-and-recursive-development).

Facety is a voluntary public registry of people who have lived. It helps people from different communities recognize one another, take responsibility for public claims and correct mistakes. The long-term aim is meaningful cooperation beyond personal acquaintance and local concentrations of power, under shared rules and distributed authority. It does not require cultural uniformity, seek to replace governments or judge anyone's worth.

Unlike a passport photograph, a Self-ID history can show changes in the same person over time. A correction leaves a gap, not a replacement picture or a rewritten signature.

A connection matters when it helps people cooperate and makes responsibility clear. A path checks reachability, not independent human control or trust. Access to challenge and appeal matters more than node count alone. People can stop participating without erasing past records or obligations; public claims don't require publishing every part of their lives. Whether people will show up, recognize one another accurately or cooperate across groups remains an empirical question.

The aim is to make honest participation easier and more rewarding than identity fraud, while limiting emission captured by fabricated identities. That is a design goal whose operational dependencies still need validation.

Three layers stay distinct:

- **Identity** — claims about real, unique people, open to challenge. Guarantees and paths do not certify personhood.
- **Responsibility** — units from Self-IDs and integrity from chronological losses and repair determine personal XP. They establish neither usefulness nor truth.
- **Emission** — FCTY (FaCT You) distribution under the protocol. Monetary holdings do not confer procedural authority.

## Where the project stands

**Conditional-mainnet preparation is active; deployment is gated by the owner decision [D204](docs/decisions.en.md).** The owner-confirmed [plan](BACKLOG.md#conditional-mainnet-preparation) covers executable-spec closure, reference-kernel verification, launch measurement and bounded registered rule comparisons. D204 (2026-11-24) selects production as the only source of human evidence and explicitly accepts launch risk, gated on instrumentation before launch-facing code, consent/ethics, preregistered tripwires and pause controls with kill criteria, and the signed F1 risk-acceptance statement. No rehearsal or pilot precedes mainnet; personal-data collection stays unauthorized until those gates are met. The delegated reference stage authorizes the bounded kernel only after an independent World replay baseline is frozen.

> **Frozen evidence-core verdict: REVISE operational assumptions.**
>
> The [study](studies/2026-11-08-evidence-core/README.md) completed 38 Rust runs. Attack containment survived within the tested scenarios; independent evidence, timely qualified help and effective correction remain unverified human dependencies. Development permission neither changes that verdict nor accepts launch risk without human evidence.

Use the [conformance map](docs/simulator.en.md#rule-conformance-mapping) to distinguish Rust coverage from protocol rules. The model checks funded filing, pending cancellation, suspended maturity, Council rounds, case-specific restoration and direct two-FCTY correction of one matured Self-ID. Correction and case fixtures receive trusted authority premises. Addressed invitation issuance with both slots, production authentication and appeal finances remain outside the modeled subset.

## Find your way

| Start here to… | Read |
| --- | --- |
| **Understand participation** | [Rules of the Game](docs/rules-of-the-game.en.md) · [Protocol](docs/facety.protocol.en.md) |
| **Assess the evidence** | [Findings](docs/insights.en.md#consolidated-findings) · [Final study](studies/2026-11-08-evidence-core/README.md) |
| **Inspect human-evidence gaps** | [Operational proposal](docs/operational-defense.en.md) · [Open questions](DECISIONS_NEEDED.md#q25-operational-evidence-and-finite-defense-after-closure) |
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

Each seed first grows an honest network to the target size, then runs the attack phase from that snapshot with detection enabled. The default CLI growth prefix runs without detection; `--detect-prefix` enables it during growth too. Results are conditional on the declared scenario, policies, horizon and seeds.

Consult the [simulator contract](docs/simulator.en.md) for defaults, levers, deviations, resource requirements and validation. The former Node.js simulator is archived at the `legacy-node` git tag.

</details>

## Cite a research snapshot

Use [CITATION.cff](CITATION.cff) for software citation metadata. When using an archived release, cite its version DOI. For a specific result, also cite the [study report](docs/README.md#studies) and the executable version it records; a current source snapshot does not replace those historical builds.

## Working agreements

Read [AGENTS.md](AGENTS.md) before changing the project. Repository documentation is in English. The protocol owns meaning, the simulator contract owns model assumptions, and [BACKLOG.md](BACKLOG.md) alone owns open work. Research results keep their evidence level and limitations.

## Public domain

Dedicated to the public domain. See [LICENSE](LICENSE). It belongs to everyone.
