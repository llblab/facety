# WP1 component: atomic funded c-vouch admission

**DIAGNOSTIC engineering evidence, not G1 or a personhood/security finding.** Adds a membership transition to the prior [reservation kernel](wp1-kernel.md); selected protocol rules, legacy defaults and historical captures are unchanged.

## Explicit reference contract

Enable both `vouching` and immutable `vouchAdmission:{c,reference:'native-guarantees-commitment-reference'}`. No reference/c default is supplied; c is a positive safe integer and the mode cannot coexist with an invitation-limit arm. This named diagnostic package means:

- The target's trusted `admitVouched(target,vouchIds)` call represents acceptance/consent; actual signing/authentication is outside the Model API, as for native invitation acceptance.
- Exactly c distinct issuer SubjectIds must have distinct, currently live, unexited, reserved target-specific bonds. Issuers must remain accepted under the existing explicit accepted-reference qualification. No hidden genuine-person/ownership input or unimplemented Standing/path check is used.
- Coverage/slots/cooldown keep their original commitment clocks; admission does not restart V/T, return B or charge B a second time. All backing already exists in actual vouchVault custody. Successful admission never mints, burns, transfers money, grants XP/Standing or gives initial capital.
- Placement is one directed native guarantee per issuer→target, canonicalized by issuer SubjectId. No reverse edges or invitation-lineage parent are invented; the new lineage node has no invitation ancestry. Backed links pay no extra legacy guarantee fee. This is not selected verified independence or a D33/D35/D36 migration.
- Native policy still governs later Self-ID eligibility/snapshots/XP: this is explicitly a **native-policy reference**, not CORE's completed own-Standing-only machinery. For example, active versus accepted guarantor eligibility affects future snapshot rosters and must be bound in a study.
- Legacy invitation creation/acceptance is disabled in this mode so it cannot create a member around the c gate. Existing-peer legacy guarantee APIs remain reference operations, not a complete CORE action allowlist; the registered engine/harness must bind allowed actions. Without this mode all old invitation behavior remains unchanged.

## Atomic transition and exit

`admitVouched` rejects missing/sparse/duplicate/wrong-count/wrong-target/expired/exited/refunded commitments, judged-ineligible issuers and existing/phantom graph targets. Every check and aggregate capacity reservation for both graphs occurs before any subject, ID, edge, event or admission record is inserted. Thus a graph-counter limit or bad final issuer cannot leave a half-admitted node. Caller array order is not mutated and does not determine graph/ID order. `vouchAdmissions()` returns immutable history/arrays, and audit reconstructs each commitment→relation association without reusable backing.

Both parties can freely exit an admitted backed link through `exitVouch(actor,id)` or its native `endGuarantee` route, including after V/refund. This removes the active edge while retaining admission, commitment, bond/cooldown history and already-created Self-ID snapshots. The same native XP/link-break semantics are reused, not a new sanction rule; ordinary legacy links retain their old fee. Reservation-only issuer exit remains unchanged. Neither loss of support nor exit automatically invalidates a person. Supplied-clearance refunds remain separate; no slashing/court result is inferred.

## Software validation and remaining G1

[Seven new families](../../test/vouch-admission.test.mjs) cover closed immutable configuration/bypass guards; no second charge/free capital; canonical ordering/receipts; failed-call/future-ID/read atomicity; aggregate graph limits; both-party exit and retained snapshot veto; and a funded child becoming a voucher only after obtaining collateral. A3072-partition independent subset/status feasibility oracle checks cardinality, protocol eligibility, exits and expiry. These are deterministic software fixtures, not attack samples, calibrated rates or independent full dynamics.

```sh
node --test test/vouch-admission.test.mjs test/vouch-commitments.test.mjs
npm test
```

All14 focused families and410 current tests pass;21 archived-source compatibility tests pass separately, not as current-source validation. DAG remains32 files/77 edges, acyclic. [Validation binding](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-26-trust-topology-condition-map/wp1-admission-validation.json) records exact code identity; source fingerprint changes and no old guard/packet is overridden.

**G1 remains open:** [bounded slashing/held collateral](wp1-bond-cases.md) is now implemented as a separate trusted-execution component, not a court. The later [paid native act review](wp1-review.md) is an act-only received-signal/veto reference, not a full CORE Standing/membership window. Full minimal composition/action/resource contract, independent full minimal engine, native-v2 config/metrics and committed prior/range/kill/precision method remain. No WP2+ work, empirical prior verification, research/search/confirmation seed, LLM testbed or pilot ran. BACKLOG alone owns the next cohort.
