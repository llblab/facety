# Facety simulator context

Canonical open work: BACKLOG.md

## Durable boundaries

- This is a Node.js 22+ research simulator using ESM `.mjs` modules and native `node:test`; it has no third-party dependencies or build step.
- [The protocol](docs/facety.protocol.en.md) is a living specification maintained here, not a shipped-runtime contract and not a numbered edition. Record every owner decision in it with its label and date, add it to Appendix A, and update the [insight register](docs/insights.en.md). Simulator defaults follow SELECTED rules; the [coverage table](docs/simulator.en.md#protocol-coverage) maps each rule to its mechanic. Do not silently choose rules for OPEN items: name every simulation assumption in [the model contract](docs/simulator.en.md) and in experiment output.
- Keep every insight: a finding goes into the insight register with its evidence level (confirmed, exploratory, diagnostic) and source study, and the backlog keeps its follow-up.
- Keep evaluator ground truth (attacker ownership, genuine/false identity labels) outside protocol state. Defense algorithms may consume declared observations, never omniscient labels.
- A membership path certifies reachability in a supplied canonical graph, not unique personhood. Keep invitation lineage, guarantees and identity judgments distinct.
- Report attack probabilities only conditional on scenario, policy, horizon, seed sampling and success criterion. Include uncertainty and real recovered costs; debt is not a token burn.
- Route all protocol-economic mutations through `FacetyModel`. Direct graph mutation is appropriate for standalone algorithm experiments and cloned snapshots, not a substitute for funded admission.
- Preserve measurement missingness: expected daily endpoints come from the declared horizon, not the last retained row. Zero total XP has undefined concentration (`null`), not zero inequality.
- Incentive analyses must separate recorded protocol consequences, explicitly supplied private utility and independently justified application externalities. A maximum over scripted strategies is not endogenous adoption or an equilibrium. Keep operator custody/work distinct from subject-level procedural XP authority. Game equilibria hold only for the declared strategy menu and valuation; report valuation sweeps and individual deviation tests, not only population best responses.
- The dispute layer is a declared abstraction of OPEN Chekharda/Council procedures. Verdicts may use evaluator truth only through the environment's declared accuracy, and sanctions must go through `FacetyModel`.
- Exploratory descriptor thresholds do not establish an emergent mechanism. Retain raw measurements, check encoded-rule and control explanations, and reserve new seed labels for confirmation before making a mechanism claim.
- A mechanism claim needs a registered `src/evidence.mjs` confirmation with presence, necessity (ablation) and named-alternative claims. Commit the registration before running its confirmation. Report contexts not tested and alternatives not controlled. Ablations are labeled counterfactuals, never protocol options.
- Results are reproducible only with the same `provenance.implementation` digest and randomness manifest. Registered confirmations refuse a changed implementation unless explicitly overridden.
- Decision/observation randomness must not couple unrelated actions through consumed stream offsets. Preserve the inert-inspection and future-intervention-prefix controls. Changing the logical random-key layout or the generator requires a new randomness-policy identifier; seeds alone do not identify an implementation revision. Scheduler optimizations must consume the same keyed draws and be checked bit-identical against the reference behavior.
- Delete verified dead code without routine approval requests. Check executable entrypoints and consumers first; preserve historical evidence and distinguish a source-fingerprint change from a behavioral change.
- At meaningful validated checkpoints, commit scoped changes and push to the branch's configured upstream. Do not force-push, rewrite history, or include unrelated changes.
- Run `npm test` for behavior changes. Compare optimized path algorithms with the reference result and independent certificate verifier before comparing performance.
