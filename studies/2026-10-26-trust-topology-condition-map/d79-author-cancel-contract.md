# D79 — free author cancellation, original rolling slot retained

**2026-10-28 · base1698fc7 · owner-confirmed selected basic rule, not a court/general maturity migration.** Owner voice01:31:15Europe/Samara confirms D78's candidate: author can cancel own pending Self-ID free, like the responsible guarantor, without a dispute. An erroneous cat/photo example motivates early self-correction; it supplies no actual personal data or detector rule. **Next Self-ID is still no earlier than original recordedAt+24h**, NOT cancellationAt+24h and NOT immediately after cancellation. Anti-spam rationale is not a proof of general network DoS resistance. BACKLOG owns this bounded implementation.

## Smallest change before code

Extend existing FacetyModel.cancelSelfId actor authorization, no new API/module/fee/court. Author may cancel its own eligible unspent/unlocked act only while age<24h, under both ordinary maturity and labeled legacy XP references; at exactly24/after, source recovery remains admitted/upheld D58/D59, not renewed free cancellation. Existing guarantor snapshot/current authority and labeled legacy unspent-veto behavior stay exact; no general default migration. Author is NOT recorded as an old guarantor.

Reuse native single-disposal/#revokeXp handling: burn existing Emitter backing once, prevent ordinary maturity credit (and remove actual prior provisional credit only through existing reference semantics), preserve all source/guarantor/recipient history/chainIndex/previousSelfId. Set a distinct author-cancel disposition and explicit author-cancellation event, not a fake guarantor-veto or upheld D59 resolution. Graph replay classifies this event like existing per-act cancellation; it is not an authority/identity certificate. No Source truth field or automatic fraud judgment.

Keep subject.lastRewardAt and rolling24h validation untouched: failed attempts, cancellation, key change, different artifact/face or an unused original source cannot reset the issued slot. Cancel at23→next24; cancel at0→next24; t0=100/cancel123→next124. History/index survive. No new holding period starting at cancellation.

Preserve spent/converted/consumed/frozen safeguards, no case release/lock override, automatic D77 hold termination, identity exoneration, D34 waiver, guarantor-link termination, new penalty/fault rule or debt erasure. A pending debt-reservation cancellation reuses the already supported prevention behavior (clears that canceled right's reservation, keeps actual debt); do not define unsupported debt/maturity chronology. No new eligibility for canceled histories in the bounded converted/D59-only research relay profiles: those remain explicit reference coverage, not selected later-claim immunity. No full self-dispute controller or scientific/registry/master bypass.

## Literal/property validation before probe

Existing Model/replay test owners, few meaningful families:

1. Author/guarantor cancellation before24h across maturity/terminal references and snapshot/current guarantee authority: exact backing burn/no fee/no maturityXP, old roster/history/links unchanged; distinguish actual author event versus guarantor event. Never credit a canceled source at24h. Other actor/duplicate cancellation inert.
2. Original-time boundaries at0/23 and nonzero100/123, after key rotation/different artifact: before t0+24 create rejected; at t0+24 new source succeeds, position2/predecessor first canceled source, no cancellation-relative delay. Repeated cancel/recreate cannot reset slot.
3. At24/late author veto refuses for unused/withdrawn/invitation-used rights, current pending lock refuses before24 with no mutation or case/hold release; debt reservation cancellation retains debt and no extra recovery. Guarantor original reference behavior untouched.
4. Passive event replay/liveness capture and literal event-type classification remain exact; no backdated author-as-guarantor payload.

Archive unchanged Source/examples before code. Fresh current+21original isolated historical/focused/DAG/two fixed trajectories/default keyed/old D77/timed/current living prefix conformance; preserve old bodies/guards/packets and compare OLD fixed-year outputs excluding ONLY implementation provenance if closure needs that compatibility check. Source fingerprints legitimately change. No NEW full annual allocation/ACT research outcome/reserved capture, no favorable input retuning or unrelated optimization. Selected protocol main/AppendixA/insight/register/model/AGENTS/backlog updated, prior D78 proposal kept as dated history then explicitly superseded by D79.
