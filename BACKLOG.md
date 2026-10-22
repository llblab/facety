# Facety simulator backlog

Scope: a reproducible Node.js / ESM research simulator for [the proposed protocol](docs/facety.protocol.en.md), not a production runtime or proof of personhood.

## Checkpoint 2 — Emergent behavior discovery and confirmation

Priority: discover collective regimes produced by interacting local rules, then confirm or refute selected regimes with preregistered designs on reserved seeds. Investigate stabilizing behavior as well as failure and capture.

Acceptance: exploration retains raw trajectories and exposes candidates. A mechanism claim requires a committed registration whose confirmation supports presence, ablation necessity and named alternatives across declared contexts. A run need not find an emergent phenomenon to count as valid evidence.

### Emergence research — current priority

- [ ] Size-matched necessity control for the coalition-coupling study (H1): separate guarantee intensity from population size, for example by capping coalition admissions in the high-intensity arm. Falsifier: a registered DiD with matched final coalition sizes.
- [ ] Confirm or refute the exploratory reversal in which coupling *lowers* coalition XP share at honest-level guarantee intensity. Falsifier: a registered association across intensity levels and bootstrap sizes.
- [ ] Finite-size sharpening study for a candidate transition (`sharpeningDesign`), for example Council capture versus attacker guarantee intensity at two bootstrap sizes. Falsifier: registered DiD; a non-sharpening result is evidence of a crossover.
- [ ] Council tie-break ablation (random or seniority order) to test the ID-order alternative beyond the descriptive boundary check. Falsifier: an equivalence claim on seat share.

### Strategy games — current priority

Acceptance: equilibrium and incentive claims name the strategy menu, valuation and dispute assumptions, report valuation sweeps and individual deviation tests, and are confirmed on reserved seeds before being called findings.

- [ ] Register and confirm the inspection-game pilot's two main patterns: deterrence when honest people are vigilant, and the individually optimal intermediate vigilance level. Falsifier: registered paired contrasts across verdict accuracy contexts.
- [ ] Confirm the exploratory deterrence boundary (accuracy ≈ 0.8, false suspicions ≈ 1%, detection 0.2–0.35) on reserved seeds, then extend to fines, liability scope, reward share, challenge stake, `excludeLiable` and 90–180-day horizons. Falsifier: boundary cells that flip under replication or longer horizons.
- [ ] Ablate design levers against false-veto and harassment damage: veto cost/accountability, appeal of wrongful invalidation, positive challenge stakes. Falsifier: viability gained without losing deterrence.
- [ ] Confirm on reserved seeds the window comparison (24/24/24 versus 24/168/72 h) and the guardian-review result; add leniency for liable parties who report first; model guarantors who check less often than daily.
- [ ] Timed Chekharda levers (see the timed-Chekharda study): reputation-targeted attention (notify the Council and the accused's neighborhood first), decisive evidence for real persons, chain-cut liability for defenders of proven fakes, larger base stakes, early Council intervention, adaptive coalition `defend`/`challenge`. Falsifier: fraud still pays with all levers enabled.
- [ ] Senior call-in and stake rules (owner D23): with a declared probability a senior with ≥10× the last entrant's XP joins on the caller's side; compare fixed +g stakes against "at least the stake below" for fairness of the distribution. Also test faster freezing of all of the accused's new rights and the dispute-volume bottleneck (F18). Falsifier: fraud still pays with fast, senior-decided disputes and full freezes.
- [ ] Cash-flow game study: the coalition chooses between consolidating (visible) and holding (hard to spend) under a valuation with reduced value for fake-held FACY; include honest payment noise. Falsifier: the coalition's best response avoids consolidation without losing value.
- [ ] Calibrate the `fakeSelfId` cost and detection per format (text, short video, group, beacon-bound challenges); optional formats only, no mandatory type.
- [ ] Port the bounded incentive fixtures to the one-day schedule and re-measure their tables.
- [ ] Re-run the coalition H1/H2 hypotheses under the active Council and one-day defaults as new registrations.
- [ ] Human calibration study design: hit and false-alarm rates of reviewers on genuine versus fabricated identity acts (single/group media, signature context).
- [ ] Patient-coalition and camouflage strategies: dormant aging fakes, cross-cohort guarantees that reduce structural visibility. Falsifier: a strategy that beats every listed coalition strategy against vigilant honest people.
- [ ] Adaptive policies that respond to observed sanctions, payoffs or Council state, iterated to approximate equilibria beyond fixed menus (for example best-response or replicator dynamics over generated strategies). Falsifier: convergence/cycling diagnostics and robustness to the initial menu.
- [ ] Cartel visibility: can an observer separate fake clusters from honest pioneers using public graph data (reciprocity, cross-cohort edges, age structure)? Falsifier: detection quality versus honest early-core false positives.
- [ ] Calibrate daily fake Self-ID production cost and honest inspection effort; until then effort weights are illustrative.

### Incentive alignment

Acceptance: distinguish protocol reward/accounting effects, private profitability under explicit preferences, and application-level network externalities. Neither more XP nor more subjects is itself evidence of increased user utility. Fixed activity scripts do not establish an equilibrium.

- [ ] After ownership-review reconciliation, test a conditional adverse-selection witness against both independent admission and waiting, with explicit per-subject authority values and relative expected losses. Keep actual preferences/feasibility unknown and do not pool XP into one identity's power. Falsifier: declared valuations, threshold/counterexample checks and unknown-loss controls.
- [ ] Extend behavioral choices to repeated farming/cartels and mechanism ablations before interpreting a local best response as an incentive-alignment result. Evaluate useful application externalities separately from rewards and subject counts. Falsifier: credible competing-strategy witnesses and declared useful-service controls; real-world utility claims remain calibration-gated.

## Checkpoint 3 — Algorithm optimization and independent review

Acceptance: correct path algorithms are benchmarked on identical snapshots; the research surface is documented and independently reviewed.

- [ ] Add an algorithm benchmark with independent certificate checks, identical queries/snapshots, resource counters and reproducible graph generation. Falsifier: differential algorithm and benchmark smoke tests.
- [ ] Independent review of the evidence pipeline (test semantics, unknown handling, seed reservation) and of the debt-recovery reservation policy. Falsifier: reviewer counterexamples or reproduced verdicts.

## Limits

- Real-world attack probability remains research-gated: requires calibrated behavioral data and agreed protocol policies.
- Full Chekharda adjudication, Council merits procedure, media detection and Treasury D markets are not silently supplied by a simulated oracle.
- Full context validation still reports 11 pre-existing anchor errors in unchanged `docs/facety.protocol.en.md`. A separately scoped protocol-navigation/validator-compatibility check is needed before claiming a clean whole-context result; do not silently rewrite the protocol during simulator work.
