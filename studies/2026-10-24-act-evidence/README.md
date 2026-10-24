# Per-act evidence environment: first engineering checkpoint

**Software implementation/validation, not an exploratory study or mechanism confirmation.** This is the first bounded worker cohort after the owner's explicit D46–D48 implementation/tests/experiments/Grow Loop request. The [model contract](../../docs/simulator.en.md#implemented-per-act-evidence-environment-d46d47-first-slice) owns the implemented API/assumptions; [protocol D47](../../docs/facety.protocol.en.md#252-intent-act-validity-suspicion-and-adjudication-d47) owns the person/act/belief distinction; [BACKLOG](../../BACKLOG.md#new-behavioral-model-directions-d46d48-documentation-first) owns remaining integration.

## Delivered boundary

- `src/act-observations.mjs`: snapshot environment with genuine-person/profile facts separate from each Self-ID/invitation/guarantee act's validity. It validates references/closed inputs and exposes frozen public act references plus a suspicion-only observation capability, never a truth getter or protocol mutation.
- Explicit rate tables for every kind/role/validity, without selected defaults, a clamped multiplier or inferred XP dependence. Role is caller-declared context, not certified authority; rates can express software fallibility/stress counterexamples, not only the expected qualitative law.
- `act-observation-keyed-v1`: a new opt-in key layout under the unchanged generator, with `(act, observer, hour, opportunity)` identity. Role selects the threshold on the same draw. No clock scheduling, mandatory observation, retry/refill, independent-human evidence claim, case entry or adjudication is introduced.
- Six test families: per-act/schema/public-boundary, 1536 exact supplied-rate/key partitions, snapshot/target-hidden-label isolation, inert/reordered/later-opportunity preservation, valid-act false suspicion/invalid-act misses, and rejected malformed/unknown inputs. These are software properties, not research trials.

## Actual validation

`node --test test/act-observations.test.mjs`: **6 passed**. `npm test`: **343 passed / 0 failed / 0 skipped** as reported by the runner. Source-gated historical native smokes are not reinterpreted as having executed against their old digest: their guards remain unchanged, and the retained source-bound packet auditors still check original byte identities. Exact unchanged old kernel bytes, not a fresh old-label world, support behavioral preservation of that path.

Domain DAG: **31 modules / 75 edges, acyclic, 0 errors / 0 warnings**. Whitespace and [context validation](validation.json) are recorded separately. No old model/scheduler/identity-observation/random/relay/test/capture file was changed; a new source file necessarily changes the whole implementation fingerprint from `50a20767…` to `43e9a0f71716fdeb5120ad820a31ad04342b343c4c34411a7c93057cda25a359` (31 source files). Old source-pinned research runners must refuse that digest, not silently override it. The old generator and native decision/observation key layouts are untouched.

[`examples/act-evidence.mjs`](../../examples/act-evidence.mjs) was executed once as a software interface smoke; [its output](software-example.json) retains evaluator inputs separately from public act refs/signals. The extreme zero/one rates are boundary witnesses only, not human estimates, a preferred detector or the owner's tenfold calibration. The example creates no `FacetyModel`, graph, FACY, XP, invitation or legal sanction; these are supplied fact records, not funded protocol trajectories or research outcomes. It demonstrates a genuine good-faith person's defective act and an adversarial profile's correct act without deriving validity from intent.

## Not delivered by this slice

There is no intent-to-act generator, automatic D46 tenfold policy, average-XP law, exposure/calendar scheduler, shared-source media environment, photo authentication, private utility/learning/loyalty, funded act adapter, sponsor assessment or act-specific case/remedy implementation. A signal does not cancel, challenge, establish misconduct or invoke identity sanctions. Caller-supplied rates/opportunities and validity are assumptions, not empirical accuracy; future composition must retain their complete actual configuration and evidence boundary.

Next is an explicitly act-specific observation→evidence package→sponsor assessment/refusal cohort using funded native references and existing eligibility/work accounting, without treating a defect as false personhood. No planned research labels were executed, no new experiment method/capture exists, and historical F48–F55/D42/P16/P23 data remains closed. This checkpoint is author software validation, not independent acceptance, calibrated probabilities, endogenous behavior, new protocol selection or D33/D34/D42 compliance.
