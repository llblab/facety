# Guarantor prevention under sub-day scheduling

**D44 exploratory diagnostic, not a registered mechanism confirmation.** Source implementation is pinned in `design.json`; the baseline before the D44/D45 instrumentation is `ddee5af`. The owner first requested a small recheck under four-hour scheduling, then clarified the root question: attention/evidence → an authorized, funded and timely guarantor veto → consequences for false admission/emission, genuine harm and work. The original unexecuted two-arm draft was replaced **before any cohort data** with the three-arm design below. D45's regular timed-dispute scenario is checked separately by native tests, not silently mixed into this cohort.

## Fixed pre-data design

- **World:** `sybil-cone`, 12 trusted genuine genesis operators, 3 assigned to the coalition, clique bootstrap, seven days. The acquisition/verification cost of genesis is unpriced. Raw guarantee/activity topology, Council and native terminal-XP/indefinite unspent veto are explicitly legacy, not D33/D34/D42 compliance.
- **Activity:** inherited illustrative cohort rates, unit work weights and unrestricted baseline availability. No fitted human activity distribution, voluntary retention or private liability valuation. Sensitivity 0.8 and false-positive rate 0.01 are supplied environment assumptions, not authenticated evidence quality.
- **Matrix:** exactly four listed seed labels × `24/6/4`-hour mode × three arms = **36 runs**. Seeds are fixed diagnostic labels, not a representative random sample. Budgets/caps are pinned in `design.json`; censoring remains explicit and prevents complete-horizon means.
- **Unobserved:** invitation review 0; other activity unchanged.
- **Observe-only:** invitation review 1, with `disableInvitationVeto: true`. This counterfactual blocks an otherwise-authorized cancellation before mutation, not the guarantee or the observation/paid-attempt prefix. It is not a protocol option.
- **Veto:** invitation review 1 with normal funded/legal cancellation. Signals and work can be matched only before the first changed outcome; subsequent target sets, admissions and expenditure can diverge.
- **Outcomes:** false admissions, minted acts, conversion/liquidity and effective XP; genuine act/invitation cancellations; coalition XP separately from false-identity XP; actual charged cohort effort; attention/signal/verification/cancellation stages, with evaluator-only class counts separate from the defense. Ledger burn, collection and debt remain distinct native measurements.
- **Cadence caution:** legacy versus sub-day changes phase placement, namespace, known-deadline settlement and daily sampling, not just temporal precision. Compare implemented references, not an isolated causal step-size effect. Four/six-hour modes share quota keys, not necessarily valid actions or target sets.

## Source and execution

`run.mjs` prints one fixed seed block (nine cases), accepts only index `0..3`, writes no files, and refuses source/runtime/design drift or an uncommitted changed runner. `design.json` is the pre-data design; `analyze.mjs` checks its binding and the complete case matrix, then summarizes retained scalar/daily measurements without running the model. No p-values or calibrated probabilities are produced. This is author analysis, not independent reviewer acceptance or supplied-input authentication.

```sh
node studies/2026-10-24-d43-cadence/run.mjs 0
node studies/2026-10-24-d43-cadence/run.mjs 1
node studies/2026-10-24-d43-cadence/run.mjs 2
node studies/2026-10-24-d43-cadence/run.mjs 3
```

Each block records design/runner digests, source commit, per-mode randomness, normalized configuration digests, selected native measurements, declared daily timestamps and cancellation witnesses. These are not a full authenticated native event journal. `runnerDigest` is `digestOf` of the source string (canonical JSON string hashing), not a raw-file byte SHA. Raw-file hashes are recorded separately when capturing the packet. Missing legacy review traces remain `null`; zero total cancellations imply zero false/genuine cancellations, not observed recognition trials.

## Execution status

Prepared before data. No historical study runner/result is modified or automatically replayed. The canonical backlog owns execution and follow-up. Retained-right custody and unresolved frozen-XP/liability contracts are not reopened by this diagnostic.
