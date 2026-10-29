# D34 historical timelines and correction funding — 2026-10-23

**Bounded diagnostic preparation; no runtime, policy or test change.** Baseline `c95b71e4950fb108184e2eb3817c543abb84ffe6`. The owner resumed safe Grow Loop preparation after selecting D34's historical responsibility principle. This cohort exposes missing execution contracts; it does not implement them or reopen DEOS/D33 work.

## Method and evidence boundary

`witness.mjs` builds eleven native public-API scenario worlds sharing one identical funded prefix, plus one prefix-only capture. Five declared genesis subjects receive no initial funds. Two former-guarantor, two prospective-guarantor and six challenger Self-ID rewards are matured and converted before the original guarantee is established. The default model policy is retained, including active guarantor qualification, snapshot veto authority, terminal XP and the current-link liability reference. No direct graph mutation, hidden ownership/truth label, sampled seed or fabricated balance is used.

`commonPrefix` is retained once. Each row retains the new native events, relevant act and relationship records, financial/XP observations and a digest of the full measured native snapshot. These checksums identify content, not authentic evidence or actual human independence. Current-liability arithmetic uses a normalized **unenforced** `preflightIdentityVerdict` plan; exact snapshots before/after it match. A projected fine is not collection, burn or realized attack cost.

A read-only role projection replays the ordered **native model journal**, using immutable relationship IDs and their retained parties. It does not consume the optional bounded causal trace, install protocol state, select a legal timestamp convention or verify actual guilt. The journal ordering is evidence about this simulator, not a selected production historical-proof format.

## 1. Recording, terminal roles and actual XP differ

The common prefix ends at hour 240. Each arm records the target Self-ID then, and converts it at hour 264:

- **Stay:** the original guarantor remains; the act snapshot, terminal graph and legacy liability plan all contain `old`. Conversion credits the subject and `old` one XP each.
- **Exit:** `old` ends the relationship at hour 241 and pays the modeled one-liquid-FACY fee. The act snapshot still contains `old`, but there is no current guarantor; conversion credits only the subject and the legacy plan lists only the subject.
- **Switch:** after that exit, `new` establishes a guarantee at hour 242. The act snapshot still contains `old`; the terminal graph and legacy plan contain `new`. Neither guarantor receives this act's terminal XP. If Self-ID recording is chosen as the legal event, the legacy plan omits the historical guarantor and includes a later one; this conditional contrast does not itself select the legal event.
- **Re-link:** instead of switching parties, `old` establishes a **new relationship ID** at hour 242. Conversion credits `old` one XP because the current edge exists. Both relationship instances remain in history, but the act's guarantor/recipient arrays contain subject IDs rather than a relationship-instance ID. This is recorded reference behavior, not a newly selected re-link/credit rule.

In all four arms the recording snapshot contains `old`. The read-only reconstruction at conversion yields respectively `old`, nobody, `new`, `old`. The actual XP deltas are measured around that single terminal operation; the stored potential recipient list alone is not an actual-credit receipt.

The exit/switch/re-link arms pay one link-break fee; stay pays none. This is measured native accounting under the documented fee reference, not an equal-private-cost or welfare comparison. No fine is applied in these arms.

## 2. Same-hour history needs ordering

Two additional arms establish the guarantee, record the Self-ID and end the relationship in different orders **within hour 240**. Both relationship records have `activatedAt = endedAt = 240`, and both acts have `recordedAt = 240`:

- Record then exit: the native journal and act snapshot show `old` at recording.
- Exit then record: they show no guarantor at recording.

Thus the numeric time fields alone cannot distinguish these histories. Choosing a half-open timestamp interval would lose the first arm's order. D34 needs an explicit legal event and canonical ordering/proof convention; no interval rule or new state counter is added here.

## 3. Five funding states are not one cancellation

The five remaining arms observe existing routes at declared reference times, **not a selected early-reporting deadline**:

- **Unspent:** the existing guarantor veto succeeds, burns the one unspent right and creates no XP. This is not an author-initiated dispute.
- **Converted and retained:** the act is converted, its subject has one liquid FACY and subject/old have one attributable terminal XP each. The original guarantor veto refuses because the right is spent. Available liquid funds do not by themselves authorize a new recovery rule.
- **Transferred:** that liquid unit has been transferred to the separate `recipient` subject. The author has zero liquid FACY and the recipient one; XP remains. Aggregate balances are not persistent identities of individual fungible coins. No permission to seize the recipient's funds or assumed willingness to repay is inferred.
- **Invitation-consumed:** the original unit is already burned, XP was credited and the resulting invitation has admitted a child after the existing contest window. The guarantor veto refuses. Correction must not silently burn the unit again or decide the child's status without a dependent-admission contract.
- **Debt-repaid:** before issuance the subject receives a supplied one-unit debt, with no liquid funds. The new right is reserved and burns at maturity, reducing debt **1→0** and crediting XP. It is already consumed when probed. A future reversal must explicitly say what happens to that prior debt; another burn cannot be assumed, and unrelated debt must not be silently forgiven. No debt-restoration policy is implemented by this observation.

In every arm the ordinary self-challenge fails the strict greater-XP gate, and the author's own free-cancellation attempt fails authority checks without native mutation. The other four guarantor-veto probes refuse without native mutation. These probe results plus source inspection establish the existing route boundary, not an assertion that trusted low-level adjudication inputs cannot change state.

## Required contract decisions and stop

Useful preparation of this selected cohort is complete. [BACKLOG](../../BACKLOG.md#paused-correctness-loop-repeat-verdict-authority-gate) is paused again; no further automatic continuation is selected.

1. **Legal event and order:** which event creates each guarantee duty—Self-ID recording, terminal disposition or another defined operation—and what canonical order resolves same-time changes?
2. **Historical role/credit basis:** which relationship instance/qualification covers that event, and how are potential XP recipients, actual credited parties and liable parties kept distinct across exit/re-link?
3. **Penalty identity:** what defines the same settled act/guarantor/duty across cases, and what incremental basis applies to overlapping/new suffix acts?
4. **Early correction route:** who may initiate/authorize it, with what evidence, deadline, fees/stakes and repeat-abuse controls, separately from ordinary challenges?
5. **Recovery:** who supplies any required value after conversion/transfer, and what happens to already-burned invitations/debt repayments and dependent rights?

D34 selects historical responsibility, not answers to these remaining choices. More scripted timelines do not authorize an enforcement default. The smallest first question is whether **Self-ID recording**, rather than terminal consumption, fixes the guarantor set for that Self-ID duty. No new protocol decision, general immunity or mathematical claim about useful contribution follows.

## Validation and preservation

`witness.json` retains every assertion-backed result. All **25 source modules and 180 pre-existing study files** match raw Git blobs. Runtime, tests, examples, CLI and package configuration are unchanged; implementation remains `a3a5c26e6e34ece29a967d135ccde81ed132f9e7bd226673b4ef26ba7844e0f8`, Node v26.8.1. Native witness randomness is absent (`supplied-native-inputs-v1`); the scheduler's keyed policy/generator are unchanged.

The source/runtime-bound **215-test**, twelve-context scheduler and 25-module/57-edge DAG evidence are reused from the [chain-replay](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-chain-replay/validation.json) and [native-ID](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-native-id/validation.json) checkpoints, not rerun or copied as new evidence. Fresh witness, context and whitespace results are in `validation.json`/`context.txt`. No behavior change requires a new native test here; diagnostic assertions do not make legacy liability normative. Checks are coordinator execution/inspection, not independent review.

No mechanism confirmation, calibrated incentives, real attack probability, oracle validity, personhood, arbitration independence, bootstrap safety, voluntary retention or sustainable distribution is demonstrated. Human uniqueness, contribution/reputation and emission/distribution remain distinct.

```sh
node studies/2026-10-23-d34-timelines/witness.mjs
```

The script prints without overwriting retained evidence and guards the named baseline source/history. Its source hash and the unchanged runtime identity are recorded separately in `validation.json`; neither is evidence authentication.
