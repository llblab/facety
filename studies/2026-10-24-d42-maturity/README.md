# D42 maturity migration boundary — 2026-10-24

**Diagnostic software preparation, not a D42 implementation or new mechanism confirmation.** Baseline commit: `9ac299e`. The owner requested scoped Grow Loop continuation after resolving the custody choice: retain a matured own-emission right until separately chosen withdrawal or invitation use; XP and expiry of the original free veto occur at 24 hours without that choice. General D39 research and D41's separate XP-anchor gate are not resumed here.

## Retained controls

[`controls.mjs`](controls.mjs) executed seven fixed public-API worlds once for the retained [`controls.json`](controls.json): **38 ordered checkpoints and 113 native events**, no seed sampling or parameter search. Assertions check the legacy observations, unchanged prefix act records, known rejection atomicity and conservation at every checkpoint. The output binds the runner content hash, complete effective policy and native source/runtime:

- Implementation: `db930fbc29f6d18c4ddfd32897668cd2d3acd1a07f07cda674e1cb7bc3e09fc4`, `sha256-src-mjs-v1`, 27 modules; Node `v26.8.1`.
- Runner SHA-256: `92445d17f5502035c9876b01e091eda34c8536735c0d6603c879c4ea8e299cc7`.
- Policy: current legacy terminal XP, active recording-time guarantors, snapshot veto authority, one-day spend/conversion/invitation freeze, revoked relation XP, zero guarantee fee and reserved-until-mature debt recovery. These labels do not turn it into D42 compliance.

Three supplied accepted genesis subjects start with zero money/XP. Guarantors earn and convert their own prefix Self-IDs to fund subsequent possible link-break fees. No graph/balance injection or evaluator truth is used. Target ages are relative to `originHour`: ordinary targets are recorded at absolute hour 24; the two-credit penalty case at hour 48. Prefix act records are retained once and checked unchanged at every checkpoint. Checkpoints retain public account projections, the full target act, current eligible guarantors, invitations and the audited monetary ledger. Full native events and final relationship/graph state are retained per case. No hidden private XP ledger or independent credit timestamp is claimed.

1. **`idle-veto-24`:** At age 24 unused target XP is 0 and the free veto still succeeds. No automatic withdrawal occurs: the custody choice already matches, maturity XP and veto expiry do not.
2. **`withdraw-24`:** Withdrawal at age 24 changes subject XP 0→1; repeated withdrawal rejects. D42 credit must precede and not depend on this choice.
3. **`invite-cancel-25`:** Invitation use credits 1 XP; cancellation at age 25 removes it, leaves the source burned and leaves `xpCredited: true`. Consequences for prior matured XP need a contract; an ever-marked flag is not a current-credit receipt.
4. **`debt-24`:** Recovery at age 24 consumes the right, repays 1 debt and credits 1 XP once. The same endpoint can conceal a different trigger; preserve the initial veto opportunity.
5. **`locked-debt-48`:** Lock at age 23 delays recovery/credit through age 24; unlock at age 48 triggers both. XP maturation while disputed needs owner selection; locked value must remain unavailable.
6. **`guarantor-switch-23`:** The original snapshot keeps `old`, current support is `new`; late withdrawal credits neither guarantor for the target. Recording roles, live edges and actual credits differ; do not select a new recipient basis silently.
7. **`late-credit-after-halving`:** Subject XP starts at 2, stays 2 at age 24, halves to 1 at age 25, then becomes 2 on withdrawal at age 48. With D42's earlier +1 and the **same reference floor rounding**, it would be `floor((2+1)/2)=1`, with no later extra credit.

The last row is conditional arithmetic, not a new rounding choice or observed human response. It shows why adding XP lazily on withdrawal and backdating a timestamp cannot implement chronological D42 behavior. The later penalty is at age 25, not tied exactly with the age-24 deadline; exact same-time priority remains a separate contract.

## Implementation closure and remaining decisions

- `FacetyModel.advanceTo` currently settles only mature debt reservations, not idle XP. `unfreezeSelfId` invokes that same recovery hook. A maturity clock must cover idle ordinary rights without making reads economically mutating.
- `createSelfId` stores potential recording-time recipients; `#credit` currently skips a departed relation and updates private chronological XP records. These are not interchangeable with current guarantors or current-credit receipts.
- `#dispose` currently couples non-cancelled spending/conversion/recovery to XP. D42 must decouple credit from disposition, retain one-time consumption and preserve the no-automatic-withdrawal selection.
- `cancelSelfId` lacks an age cutoff. `cancelInvitation` instead removes the source's active XP credit under the old consumption-triggered rule. It cannot be copied into the new maturity policy without the prior-credit contract.
- `endGuarantee` and `penalize` interact with the chronological credit ledger. Later penalties must see already due ordinary credits; freeze effects, relation changes/re-linking, same-time ordering and invitation-cancellation effects still need explicit contracts.
- Existing v1/v2 incentive readers/frozen reports are closed legacy references. Neither mutating their policy labels nor replaying them under new defaults establishes D42 evidence.

## Offline arithmetic audit

[`audit.mjs`](audit.mjs) and retained [`audit.json`](audit.json) reconstruct **all 38 checkpoints, 114 account rows and 113 native events** without importing/calling the model or capture runner. The auditor imports only Node built-ins. It checks every snapshot digest, account/ledger total, target state, current qualified guarantor list, invitation state, settled prefix record, final relation and graph snapshot. Closed case/policy/source bindings and total counts prevent shrinking the cohort. File hashes bind the retained input and capture code; the analyzer's own content hash/runtime is reported separately, not substituted for input provenance.

XP uses independently implemented exact scaled-integer arithmetic. For each still-valid credit, remember the number `h` of halvings already applied at credit time. With `H` total halvings, compute `floor(sum(2^h) / 2^H)` using BigInt, removing entries revoked by the declared link/source rules. This reproduces the captured chronological floor-halving reference without calling its private XP replay. The checked packet has one halving; this is not a general engine or confirmation of untested histories.

Four test families in `test/d42-audit.test.mjs` check purity/transport, changed snapshots even after digest recomputation, journal/case/policy/source tampering and strict CLI/file bindings. Negative controls initially exposed an accepted negative first timestamp and a truthy string in the **new auditor**, both repaired before retaining the final audit; these were not defects in the simulator or captured data. The audit confirms the native legacy snapshots, not D42 correctness. Credit-event times and rejected-attempt occurrence are not independently authenticated: there is no explicit native XP-credit event, and rejected attempts leave no corresponding success event. Those qualifications and input metadata trust remain explicit in the audit output.

This is an **author audit with an independent arithmetic implementation**, not independent reviewer acceptance, a new court policy or real-world evidence. Original capture/validation files remain unchanged; [audit validation](audit-validation.json) owns the subsequent evidence. All **266 native tests pass**, including the four focused audit families; the earlier capture checkpoint's 262-test record is retained as history, not overwritten or added to this count.

**Stop / next owner input:** the safe audit cohort is complete. For an act already disputed/frozen before age 24, select immediately usable XP, credited-but-quarantined XP, or credit deferred until resolution. The underlying value remains locked under the existing freeze. No further automatic iteration is useful before that contract choice; do not infer it from the legacy lock example or reopen the resolved custody choice.

[Validation](validation.json) retains the raw/runner hashes, capture count and coordinator checks: all 262 native tests pass; context/links/whitespace pass with zero errors and 27 existing warnings. The previous DAG result (27 modules/66 edges) is reused because native source/configuration are byte-identical, not rerun or counted as independent assurance.

No protocol default, scheduler/randomness key, source module or old study artifact changed. This capture is not preregistered empirical evidence; the scenarios are diagnostic software controls. Hashes identify content/source, not authenticity, independent people or a court verdict.

## Reproduction

```sh
node studies/2026-10-24-d42-maturity/controls.mjs
node studies/2026-10-24-d42-maturity/audit.mjs
```

Both scripts print JSON only and write no files. The capture refuses source drift; the auditor reads only the fixed retained data/code with strict content bindings. Both reject command-line overrides. Retained data must not be overwritten or treated as a fresh confirmation. Reproduction needs the original native source and runner; this checkpoint makes no performance or real-world claim.
