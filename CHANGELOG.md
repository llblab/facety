# Changelog

> Each release keeps at most 8 outcome records of at most 512 characters.

Decisions and dates live in the [decision log](docs/decisions.en.md#decision-log-and-supersession-ledger), evidence in the [study index](docs/README.md), and open work in [BACKLOG](BACKLOG.md). The [previous milestone ledger](https://github.com/llblab/facety/blob/a4fc5cc3ad4b839f26788e1cde111e0f99ca0de5/CHANGELOG.md) and [earlier per-change history](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/CHANGELOG.md) preserve detailed outcomes and provenance.

## Unreleased

- Implemented three-choice Council rounds in Rust: deadline-only recognition, fresh electorate and ballots after each seven-day deferral, replay protection and continuing custody/holds. Added ladder/World/runner regressions, explicit execution/voting assumptions, result-v5 and randomness v3. Frozen research evidence is unchanged.
- Selected Council appeals with three choices: confirm the prior verdict, reverse and authorize restoration, or defer seven days. A greater-XP participant or the Council opens a challenge to the prior accuser's opening transaction, starting a new seven-day round. Updated the operational contract and unused kit; exact remedies, financial scope and execution remain open.

## 0.1.0 — 2026-11-08

- Established an English-only protocol with separate decision history and a coherent participant-facing Rules of the Game. Consolidated selected participation, emission, guarantee, dispute and recovery defaults while keeping unfinished contracts explicit.
- Replaced the retired Node.js simulator with a standard-library-only Rust simulator. Added exact path verification against independent references, deterministic configuration and build provenance, repository integrity checks, and outcome-preserving performance improvements. The legacy implementation remains at the `legacy-node` tag.
- Implemented 24-hour maturity XP, receipt-based responsibility and integrity, overlapping dispute windows, staked escalation, soft backing and emission debt. Added held-right collection, historical-guarantor liability, custody and restriction audits, exact stake arithmetic, recovery scenarios and reproducible economic witnesses; remaining deviations stay explicit in the simulator contract.
- Closed D168 with 18 local and 20 final Rust runs on a frozen evidence core: REVISE operational assumptions. Preserved the killed B4 honest-growth claim and earlier negative findings. Conditional attack containment does not establish independent evidence, collectible rewards or finite human correction capacity. Research stopped; follow-ups remain in Q25.
- Prepared an operational-defense owner decision, end-to-end contract and synthetic manual-validation kit with voluntary roles, concealed case keys, shared clocks and blank observation logs. Admission, execution and appeal gaps remain open. No people were recruited, exercise run, personal data collected, or runtime/pilot started.
- Selected a third Council ballot choice: defer seven days from the current latest deadline, repeatably. An entered referendum without a majority automatically defers at cutoff; holds and restrictions continue. The binary simulator and frozen research results do not implement or validate this later rule.
- Renamed the monetary ticker from FACY to FCTY across current documentation and Rust-generated captions. Facety's name and asset mechanics are unchanged; immutable evidence, archived figures and compatible serialized/historical API identifiers retain their original bytes and names.
- Consolidated project context and reconciled obsolete backlog blockers with implemented maturity XP and settled referendum choices. Folded the milestone ledger into this versioned summary, preserving detailed history through permanent links and retaining study evidence, negative results and owner-gated work in their authoritative homes.
