# Native registration integrity repair and one-day reservation coverage — 2026-10-23

**Bounded E2 correctness repair plus independent regression coverage.** Baseline: `14266db`, with the same runtime implementation reviewed at `a40fdb0`. E1 aggregate contradiction semantics, retained-value provenance policy, D33/D35/D36 migration and D34 legal-event/correction decisions are not selected here.

**Checkpoint identity reconciliation:** the initially observed review-record commit `14266db` was externally replaced by `6c20b8b` before integration. Their sole tree difference is one added `experiment.mjs` refactoring backlog item, which is preserved. The simulator source trees are identical (`943b131b05906f4d9b39d98fc8716362384204e4`); tests, CLI and historical study inputs are also unchanged between those commits. This does not invalidate the source-bound validation below and is not a history rewrite performed by this repair.

## 1. E2: Verify at the public native boundary

The [prior independent review](../2026-10-23-evidence-debt-review/README.md) and retained coordinator witness showed that direct `analyzeConfirmation` accepted a changed registered margin while `verifyRegistration` rejected the same unchanged-hash document. CLI and confirmation callers already verified before reaching analysis.

`analyzeConfirmation(registration, values, { allowImplementationChange = false } = {})` now obtains its specification through `verifyRegistration` before evaluating values. Design normalization, content digest, confirmation namespace and randomness policy remain mandatory. This is the existing fixed-design contract, not a new inference rule or evidence-authentication scheme.

**Historical compatibility is explicit:** native analysis refuses implementation drift by default; `{ allowImplementationChange: true }` accepts a valid unchanged old registration under the current analyzer. `confirmHypothesis` forwards its existing override, and CLI `reanalyze-confirmation` explicitly preserves its existing historical-reanalysis permission. Neither override permits changed design, namespace or randomness. Valid analyses retain their output shape; no support/contradiction arithmetic changes.

Two new native regression families failed before the source repair because the expected rejections did not occur. They now cover changed design, missing normalized fields, randomness, namespace and schema with and without the override, valid JSON round trips, input nonmutation, synthetic historical implementation refusal/opt-in, and confirmation override forwarding. A CLI regression separately checks historical reanalysis and changed-design rejection without emitting a result on error. Synthetic historical fingerprints in these tests exercise compatibility, not authenticated past experiments.

## 2. Selected-default debt reservation coverage

No model runtime changes were needed. A new native regression uses the exact default policy and a genuinely active guarantor supplied through ordinary `FacetyModel` Self-ID/guarantee operations. Three worlds check:

- **Normal maturity:** debt and terminal subject/guarantor XP remain unchanged at hour 23; hour 24 burns one reserved right, repays one debt unit and grants the specified terminal XP.
- **Lock:** a reservation remains unspent through maturity and hour 48 while locked; matching unlock settles using its original recording age, not a restarted clock.
- **Veto:** cancellation burns the right without repaying debt or granting XP; a replacement reservation later settles at its own exact maturity.

All worlds assert exact audited custody/debt totals, final XP and act disposition. A repeated same-time settlement call preserves full exposed subjects/acts/invitations/relationships/events/graphs/ledger and clock. The guarantor's own unrelated emission remains unspent, so it cannot disguise an extra terminal credit. Existing legacy-timing tests are retained because they cover distinct reservation accumulation and comparison-policy cases.

These are regression properties of the current reference, not selection of D34 correction, repayment priority against sanctions or a proof of real-world economic adequacy.

## 3. Reuse historical inputs without rewriting historical evidence

`witness.mjs` reads the prior review's unchanged synthetic `witness.json`:

- The original valid E2 registration still analyzes as `contradicted` with explicit implementation permission.
- Its old changed-margin construction is now rejected with a digest error instead of becoming `supported`.
- E1 still has aggregate `contradicted`, raw component p `0.03125` and Holm comparison `1`. E1 is unresolved; this is a control that the integrity repair did not silently alter scientific semantics.

No confirmation or model simulation is executed by this witness. Native test validation does run its ordinary transient test registrations and model fixtures; it does not replay historical studies or confirmations. [witness.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-registration-integrity/witness.json) retains current and reviewed implementation identities and these observations. Historical files remain byte-identical.

## Validation and boundaries

```sh
node studies/2026-10-23-registration-integrity/witness.mjs
node --test test/evidence.test.mjs test/cli.test.mjs
node --test test/model.test.mjs
npm test
```

Observed coordinator validation:

- Before repair: both new native reanalysis tests failed on missing expected exceptions.
- Focused evidence/CLI: **15 passed**.
- Focused model: **30 passed**.
- Full suite: **225 passed**, including those focused tests, not 270 distinct tests.
- Domain DAG: **25 modules / 58 local edges**, no errors or warnings.
- Context and whitespace checks, source-scope and historical-file preservation are recorded in [validation.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-registration-integrity/validation.json).

Only `src/evidence.mjs` changes simulator source; CLI forwarding and test/docs changes accompany it. The model, graph algorithms, randomness and protocol defaults remain unchanged. Source fingerprints deliberately change; old confirmations retain their original implementation and are not silently reconfirmed. The degraded source-fidelity qualification of the original review is preserved. This repair has coordinator regression/reproduction evidence, not a new independent post-fix review or universal correctness guarantee.

Remaining work belongs to `BACKLOG.md`: E1's aggregate inference contract and the separate trust boundary for offline retained values. No new protocol decision, empirical mechanism, attack probability, personhood or useful-distribution result is claimed.
