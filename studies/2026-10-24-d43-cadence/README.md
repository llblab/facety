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

## Results (F48, exploratory)

The runner, analyzer, design and native implementation were committed/pushed as **`e4185b9` before capture**. Each of the four blocks was executed once; all **36 cases completed seven days without censoring**. `block-0.json` through `block-3.json` retain selected native measurements; `report.json` is the pure offline analysis, and `manifest.json` binds raw byte hashes/sizes separately from canonical design/runner digests. Native source: `30a6d69e3e7b384b48dfbda4dece7af7d6077f5948a1e6f135ab00bb21431379`, Node v26.8.1. No historical runner/result was replayed or changed.

### Four-hour mode

Means across the four fixed labels, not population estimates:

| Arm | False admitted | False converted | False XP | Defender work |
| --- | ---: | ---: | ---: | ---: |
| Unobserved | 3.5 | 4.25 | 14.25 | 377.25 |
| Observe-only | 3.5 | 4.25 | 14.25 | 428.25 |
| Veto | 0 | 0 | 0 | 384.25 |

Observe-only retained admitted-fake counts `[5,1,5,3]`, converted rewards `[3,3,8,3]` and false XP `[9,6,35,7]`. Veto had zero of each in all four worlds. Paying attention without a working veto changed effort, not those protocol consequences. This is the encoded enforcement pathway under supplied behavior, **not newly emergent vigilance or a confirmed human mechanism**.

The active four-hour trace contains **39 paid invitation inspections**, 13 positive signals and 13 successful cancellations, with no budget/unavailability/authority rejection at that stage. The evaluator separates 14 inspections of false targets (12 positive signals) from 25 of genuine targets (one positive signal). Hence **12 false invitations and one genuine invitation were cancelled**, at ages **4–12 h**, strictly before the 24-hour deadline. There was also **one genuine Self-ID veto** through the separate act-inspection path. These are observed errors, not harmless successful defense or a population error-rate estimate; observation selection and stopping after cancellation affect denominators.

At the declared unit weights, these invitation inspections/cancellations cost **52 work units gross across four worlds**. Total defender effort also includes bootstrap and all downstream work. Its net difference versus unobserved is +7 units/world; versus observe-only it is −44. Neither is a marginal price per cancellation: prevention changes the subsequent population and workload. Four-hour veto still leaves the three genuine coalition operators and mean coalition XP share **0.2617370841**; zero fabricated admissions is not elimination of real-person collusion or capture risk.

### Other cadences

- **Legacy 24 h:** all three arms have identical consequences/work in these labels; no frozen-invitation review can occur inside the one-day window. Mean false admissions 8.25, false conversions 3.75, false XP 20.75. This reproduces F47's path-specific scheduling gap, not a verdict against every legacy defense or old study.
- **Six hours:** observe-only mean false admissions 5.5, conversions 5, false XP 22; veto means 0.25, 0.5 and 2.5. One world admits one false subject, yielding two converted rewards and 10 false XP. Active veto cancels 16 false and one genuine invitation across the labels, at ages 6–18 h; one genuine Self-ID is also vetoed. The retained aggregate/selected cancellation packet does not identify the precise escape cause.
- **Do not rank four hours as universally superior:** only four fixed labels, one supplied detector, dense trusted bootstrap, unstrained budgets and fixed scripts were checked. Complete scheduler/namespace/settlement/sampling references differ. Sparse/compromised guarantees, attention scarcity, correlated or adversarial evidence, heterogeneous availability, calibrated private losses and endogenous monitoring/retention remain untested.

The narrow result is that **timely effective cancellation, not observation alone, prevents fabricated admission in these scripted worlds**, with real recorded work and genuine harm. D44's desired liability → vigilance → reliable growth feedback is still unconfirmed. D34 historical liability and D42 maturation/XP contracts remain open; source binding is not evidence authenticity. D45 regular timed entries are a separate native-test capability, not a new cohort inference. The canonical backlog retains the boundary/control follow-up; this fixed cohort is complete and must not be replayed for confidence.
