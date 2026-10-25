# WP1 independent logical transition reference

**DIAGNOSTIC software verification, not G1, CORE conformance or a research result.** [The closed profile](wp1-composition.md) now has a full logical transition oracle for its declared action/resource closure, not merely final-balance arithmetic. This does not complete the native-v2 population engine or select protocol assumptions/ranges.

## Different owners and independence boundary

- [`reference.mjs`](reference.mjs) has **no imports or Native access**. It owns its own symbolic members, sources, artifacts, commitments, cases and work receipts. Each action is evaluated on a cloned candidate state; semantic rejection retains the prior state. Wallets are reconstructed using BigInt source/principal/refund/payout flows rather than Native wallet/vault mutation caches. XP is reconstructed from source maturity and receipt-time/link-exit predicates rather than Native credit/replay helpers. Graphs, capacities and work totals are derived from that state. Constructor/input/snapshot copies prevent caller mutation.
- [`native-reference-bridge.mjs`](native-reference-bridge.mjs) calls actual `FacetyModel`/`VouchActReview`, runs their audits and projects **actual** public state. It maps opaque generated IDs to independent logical handles. Public Native artifact events are used only to observe actual artifact registration, never as oracle inputs. No business-rule helper is shared with the oracle.
- [`vouch-reference` tests](../../test/vouch-reference.test.mjs) feed both sides the same declared commands and compare success/rejection plus normalized state **after every action**, including rejected calls. Acquisition requests, derived observer role, opportunity, cost, authority outcome and replay are compared, not just final cash. A skipped Native conversion canary must fail comparison, showing that expected state is not reconstructed from Native results.

This is **algorithmic/dependency separation, not independent authorship, clean-room review or independent acceptance**. Both paths can still share a contract/specification mistake. Native error wording, opaque ID allocation, event order, physical identity and all possible runtime/resource faults are not asserted equivalent. Existing Native ID/guard tests remain separately relevant.

## Logical domain and exogenous evidence

The oracle covers the closed accepted-reference, retain-until-V, maturity/snapshot, all-ablations-off profile: artifact/act issuance and24h conversion, source chronology/XP, funded reservations/admission/edges, both-party exit before/after maturity/refund, pending cases and explicit bounded allocation/refunds, one finite work-pool creation and paid review/memoization. It generalizes c/K/T/V/B and finite well-formed logical action inputs beyond the original fixed fixture. Fresh symbolic handles/artifacts and the profile's finite exogenous resource law remain prerequisites; it is not a replacement implementation of every Native API or malformed host object.

The differential bridge uses an explicit **received-signal tape**, not a new stochastic environment. Signals are supplied fallible observations, not act validity/personhood/ownership verdicts. It records actual requested act/observer/role/hour/opportunity and compares these to independent oracle requests. No generator/key layout changes; actual keyed RNG/rate behavior remains verified by the existing observation tests, not by pretending this tape reproduces random draws. Additional/future requests, reads and repeated opportunities cannot silently create work or observations. No research seed namespace is used.

Outside scope remain release-on-exit slots, other XP/eligibility policies/ablations, disputed/debt/identity/correction/ordinary-guarantee APIs, host callback errors/out-of-band mutation, graph-counter/memory exhaustion, full numeric-overflow proof, dynamic work grants, physical evidence/independence, attacker optimality, prices/utility, phase/jury/governance and actual CORE Claim/Standing. Native component tests cover several of those software guards separately. The source itself is unchanged; a profile omission is not an impossible attack or selected protocol restriction.

## Executed software evidence

Seven families verify isolation/dependency boundaries, all four original53-action composition tapes,72 fixed c/K/T/V/B partitions with58 offered actions each (4176 comparisons), additional post-credit target exits/case replays/remaining-budget/payee failures, large-safe-time arithmetic without an overflowing intermediate cooldown sum, inert/future prefixes and the skipped-conversion canary. Thus the original tapes and partition grid alone contribute4388 per-action comparisons, with both accepted and rejected actions and full intermediate normalized state. These are **fixed software equivalence classes**, not sampled theta, attack runs or confirmation seeds. The grid generator couples some work/signal inputs to B only to exercise denial/miss/veto boundaries; that is not a proposed economic joint law or research parameter distribution. No divergence occurred in the tested logical tapes; no exhaustive state-space/equivalence/security theorem follows.

Compared observables include time, accepted members/wallets/XP/last issuance, artifact references, source chains/credit receipts, original guarantors and revocations, bond principal/clocks/disposition, admission/relationship history, both canonical graph node sets/active edges/no fabricated lineage, case/actual allocation history, complete money ledger, per-subject slot/cooldown counters, work balances/receipts and acquisition requests. Raw source validity or ownership never enters Model/defense.

```sh
node --test test/vouch-reference.test.mjs
npm test
```

[Validation identities](wp1-reference-validation.json) bind the Native digest **and** oracle/bridge/profile/test files, since src-only provenance does not hash study/test modules. Seven focused and435 current tests pass;21 historical tests pass separately in their pinned source checkout, not as current-source validation. DAG evidence is reused only after verifying unchanged Native source/config; context has no errors. All research/search/confirmation/LLM/pilot counts remain zero.

Next is the actual native-v2 engine/config/observable integration and preregistered priors/ranges/precision/kill/search method, then written confirmation/correction of priors1–3/7. This reference's logical comparison alone cannot pass G1 or unlock later WPs.
