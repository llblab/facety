# Facety simulator context

Canonical open work: BACKLOG.md

Node.js 22+ research simulator: ESM `.mjs`, native `node:test`, no third-party dependencies or build step. The full pre-consolidation rule text is at [`8b77cd8`](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/AGENTS.md).

## Surfaces and ownership

- **English only, no prompt quotes.** The repository contains no Russian text and no literal quotes of owner prompts, voice notes or chat messages. Restate every owner decision as a rule or a research choice in plain English.
- [Protocol](docs/facety.protocol.en.md) owns meaning: a self-contained specification (D40) that states the current rules clearly, not a navigation hub, API manual, task list or history. It carries no provenance: no sources, quotes, owner attributions, decision dates or supersession history. A decision ID may appear as a bare trace tag, for example `(D104)`. Integrate each owner decision by rewriting the affected rule in its main section. Record the ID, date, status, a one-line paraphrase and what it supersedes in the decision log ([`docs/decisions.en.md`](docs/decisions.en.md)), and add an [insight register](docs/insights.en.md) entry. Research-only choices belong in the decision log and study pages, not in protocol rules. Supporting links must not supply missing protocol meaning.
- [Model contract](docs/simulator.en.md) owns implemented subset, deviations and the [coverage table](docs/simulator.en.md#protocol-coverage). Defaults follow SELECTED rules; never silently choose an OPEN item — name every simulation assumption there and in experiment output.
- BACKLOG alone owns tasks; CHANGELOG records milestones; [DECISIONS_NEEDED](DECISIONS_NEEDED.md) records assumptions and owner questions; studies retain their own evidence. No parallel plan or copied narrative across files.
- Keep every insight with its evidence level (confirmed, exploratory, diagnostic) and source; its follow-up goes to BACKLOG.

## Protocol fidelity

- **Selected but not implemented — keep the labeled legacy reference until contracts and an authorized migration exist:** D33/D35/D36 topology (guarantee AND path gates, pre-guaranteed genesis, no cluster quotas, internally vertex-disjoint paths: shared endpoints allowed, never an intermediary; not edge-disjoint); D34 event-time liability; D81–D107 slots/valences/invitations; D70–D72 Council referendum. Never infer verified independence from evaluator truth, raw degree or XP.
- **Settled — do not reopen or re-ask:** D42 24h maturity credit/veto expiry and retained own-emission custody (no automatic Collector conversion; default terminal XP stays labeled legacy); D47 presumption that distinct admitted SubjectIds are distinct rule-following participants (no upfront perfect personhood oracle); D79 free author cancellation keeping the original t0+24 slot; D82 no guarantor XP without an established mutual guarantee; D100/D106 K counting (own open valences + one invitation slot at each endpoint from issuance, no extra acceptance unit, no forced cuts); D93/D94/D97 paid valences never refunded; D104 current-mutual D paths without an invitation-chain member; D105 inviter pays 1/recipient 0; D107 eligibility checked once at issuance; D66 anytime Council voting; D67 common-channel notice (no diffusion study); D69 Council is the terminal entrant on the shared seven-day clock.
- **Settled 2026-10-29:** D110 free link termination cancels the terminating party's valence; D111 one equal Council vote regardless of XP; D112 re-entry by ordinary mutual guarantee without a new invitation, Self-ID/emission need ≥1 current mutual guarantee of any origin (D95's invitation requirement superseded); D109 binds the D50 falsifier design.
- **Unselected — keep as alternatives:** D87–D90 K-referendum weights, three-day Council duration, guarantee suspension, continuous-invite Self-ID (D96/D101). D113: K referendums pause nothing; the per-invite 24h veto freeze stays.
- Route all protocol-economic mutations through `FacetyModel`; direct graph mutation is for standalone algorithm experiments and cloned snapshots only.
- XP comes from actual Self-ID receipts plus chronological authorized adjustments; balances are caches (D54). Per-act penalties use each act's snapshot (D55). Personal-chain positions survive cancellation (D56); guarantees include preceding chain correctness without backdating rosters (D57); author self-correction vs non-author suffix cut (D59). D9 older credit stays separate.
- D77: open-dispute participants cannot create Self-IDs, invitations or guarantees; uninvolved life continues. Opt-in relay references are bounded, not a court.
- A membership path certifies reachability in a supplied canonical graph, not personhood. Keep invitation lineage, guarantees and identity judgments distinct; graph hashes are not proof of inviter or authentication. Raw guarantee counts use stored incoming edges.
- WP-G (D61) indexer output is advisory: canonical liveness, compatible slack families and bounded verification are never delegated to an untrusted cache. Anchors grant no Council authority; Standing is not XP.
- The dispute layer is a declared abstraction of OPEN Chekharda/Council procedures; verdicts use evaluator truth only through declared accuracy; detection is not correction; financial reservation is not an admitted complaint; trusted D55/D59 execution is not adjudication.

## Research boundaries

- Strategic lens: D32 accountability for farming-resistant emission and growth; D49 structure must earn its growth cost; D50 10× asymmetry is a target, not a property; D62 51%/two-thirds are conditional questions, not thresholds; D68 core-first human-operated defense; D53 no price floor from finite issuance; D76 minimum causal evidence over more mechanisms, longitudinal over static.
- Keep evaluator ground truth outside protocol state; defense consumes declared observations only. Hidden identity/control labels never reach defense.
- Separate uniqueness, contribution/reputation and distribution; XP and traceability are never verified usefulness or truth. Keep effort, realizable net profit and actual recovery distinct; debt is not a burn; zero/negative/missing denominators stay honest.
- Report attack probabilities only conditional on scenario, policy, horizon, seed sampling and success criterion, with uncertainty and real recovered costs.
- Preserve missingness: endpoints come from the declared horizon; zero total XP has `null` concentration.
- Incentive analyses separate recorded consequences, supplied private utility and justified externalities; a max over scripts is not an equilibrium; report valuation sweeps and individual deviations.
- Mechanism claims need a registered `src/evidence.mjs` confirmation (presence, necessity by ablation, named alternatives), committed before running, on reserved seeds. Exploratory thresholds are not mechanisms; ablations are counterfactuals, not protocol options.
- D37/D38: v2 registrations bind `family-contradiction/v1`; v1 keeps its digest and statistics. Drift permission is not method switching; new-method analysis of old data is a separate artifact.
- D108 (2026-10-29) released the master-programme order lock and the WP1/G1 method precondition; every claim still needs a committed registration, kill criterion and reserved-seed confirmation, and real/personal data needs explicit license/ethics approval.

## Engineering

- Reproducibility needs the same `provenance.implementation` digest and randomness manifest; confirmations refuse changed implementations unless overridden.
- Randomness is decision-keyed: unrelated actions never couple through stream offsets. Preserve inert-inspection and future-intervention-prefix controls. A new key layout or generator needs a new randomness-policy identifier; scheduler optimizations must be bit-identical.
- Compare optimized path algorithms with the reference result and independent verifier before measuring performance.
- Delete verified dead code without asking; check entrypoints and consumers first and distinguish fingerprint changes from behavior changes.
- Archive rule (2026-10-29): the tree keeps study inputs, summaries and every file a current test/entrypoint reads; untested raw outputs live in git history (archive commit `8b77cd8`) and Markdown links to them use that permalink. A superseded pre-code contract/plan page whose implementation or results page exists becomes a stub linking that page and its verbatim `8b77cd8` text; commit order remains the contract-before-code record. `test/repository-integrity.test.mjs` must stay green.
- Run `npm test` for behavior changes: current tests on current source; four source-pinned historical groups run unchanged in an isolated checkout of their reference. Do not weaken their guards or call archived passes current validation.
- Commit scoped changes at validated checkpoints and push to the configured upstream. No force-push, history rewrite or unrelated changes.
