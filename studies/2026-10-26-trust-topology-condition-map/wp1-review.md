# WP1 component: paid native act review and snapshot veto

**DIAGNOSTIC software composition only; not G1, personhood/detection performance or a new protocol rule.** [Funded admission](wp1-admission.md) and [bond custody](wp1-bond-cases.md) now have a separate [act-review adapter](../../src/vouch-review.mjs). Legacy defaults remain unchanged. This is not a 24h pending-membership/Standing implementation or a complete CORE allowlist.

## Explicit reference and scope

`new VouchActReview(model,{reference:'paid-single-suspicion-veto-reference',actors,costs})` requires an actual funded-admission `FacetyModel` with native maturity/snapshot policy. Each actor is `{id,subject,budget}`; subject is a known native SubjectId or null for an outside observer. Costs are explicit positive integer `{inspect,respond}`, budgets finite nonnegative integers, non-refilling. They are uncalibrated work units—not FACY, human time, wages or purchased useful evidence. The reference allows one work account per registered subject; custody actor IDs and procedural SubjectIds differ. Accounts, distinct subjects and source labels do not establish independent people/operators. No work is minted on admission; future engines must bind any new accounts/resources explicitly.

`review(actorId,selfId,environment,{opportunity})` composes:

1. Validate native public act/environment binding and the explicit opportunity. Closed24h windows, spent/disputed acts and insufficient inspection budget produce an unobserved receipt (`suspicious:null`), not a negative look.
2. Pay inspection work **before** acquiring the fallible signal from existing `actObservationEnvironment`. Its required supplied valid/invalid/role rates remain uncalibrated. Private personhood/profile/act-validity facts stay in that environment, outside the adapter/Model. The response accepts only a received Boolean suspicion.
3. A negative signal takes no response action. A suspicious ordinary observer has no veto authority and is not automatically routed to a sponsor/court. A suspicious creation-snapshot guarantor pays separately for a response, if affordable, and calls native `cancelSelfId` using its **SubjectId**, not its custody ID. Native acceptance/state checks remain authoritative; rejected attempts retain their paid cost and failure reason.

Caller choice of reviews is explicit; this fixed conditional response is not endogenous monitoring, cooperation, adoption or an adaptive attacker. It neither prescribes actual human monitoring/cover-up nor turns suspicion into guilt. Native original-snapshot authority survives a backed-link exit. A veto cancels one eligible Self-ID/emission through Model; it does not revoke membership, change personhood, slash B, open a case, infer verified independence or repair full Standing/Claim semantics. Native XP policy remains a declared reference, not CORE's completed own-Standing-only rule.

## Repetition, errors and audit

Each trial uses exactly the existing ACT key `[selfId,actorId,atHour,opportunity]`, with no consumed-stream offset or new randomness policy. Repeating it returns the immutable original receipt without work/redraw, including denial/error results. New-hour/opportunity supply must be fixed by the eventual engine/method; arbitrary new keys are not evidence of independent encounters. Reads do not draw or spend. No reclassification by hidden labels occurs.

`audit()` reconstructs per-actor inspection/response expenditure from immutable receipts; `snapshot()` is read-only. Unexpected observation errors/malformed signals retain paid inspection, null evidence and an error receipt, then propagate; they are not silent clean looks or free retries. Unexpected response errors also propagate with paid work retained. Arbitrary callback/out-of-band Model mutation and whole-engine recovery are outside this synchronous snapshot-environment contract.

## Validation, not research

[Eight families](../../test/vouch-review.test.mjs) cover closed immutable configuration, paid-before-acquisition and separate response costs, missingness/replay, custody/authority separation, snapshot exit, valid-act false suspicion/invalid-act misses, hidden-label controls, exact24h/stale/locked binding, error costs, inert-read/future-prefix controls and256 independent decision-recurrence partitions. Only `vetoed` means the act operation executed; a signal, attempted response or `veto-rejected` does not establish prevention. [Validation identity](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-26-trust-topology-condition-map/wp1-review-validation.json) records425 current tests and21 separately source-pinned historical passes; none is a sampled theta, full independent dynamics or measured attack probability.

```sh
node --test test/vouch-review.test.mjs test/vouch-bond-cases.test.mjs test/vouch-admission.test.mjs test/vouch-commitments.test.mjs
npm test
```

The later [closed composition profile/witness](wp1-composition.md) now binds a diagnostic action/resource subset, not full CORE or an authenticated port. A later [independent logical reference](wp1-reference.md) now covers the declared closed subset, not all CORE/Native behavior or independent acceptance. G1 still needs the actual generalized minimal engine, actual native-v2 config/observable registration and committed priors/ranges/precision/kill method before research execution. Graph/adaptive detector frontiers remain WP3 after G1. No research/search/confirmation label, LLM agent or pilot was run; historical packets/refusal guards are untouched, while the implementation fingerprint changes.
