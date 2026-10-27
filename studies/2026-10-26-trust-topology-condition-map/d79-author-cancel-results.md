# D79 implemented — author cancellation keeps the original issued slot

**2026-10-28 · SELECTED owner rule / DIAGNOSTIC transition proof, not global DoS or research evidence.** [Pre-code contract](d79-author-cancel-contract.md) · [raw/bindings/checks](d79-author-cancel-results.json). Owner confirmation01:31:15Europe/Samara resolves the prior D78 candidate; protocol main/AppendixA retain the dated proposal then explicit D79 selection. BACKLOG alone owns work.

## Smallest actual change

Existing **FacetyModel.cancelSelfId(actor,selfId)** now accepts the act's author for an otherwise eligible unspent/unlocked right while age<24h, free and without a dispute/guarantor being online. Shared native single disposal burns existing Emitter backing, prevents ordinary maturity XP, preserves old source/guarantor/recipient/chain history and applies any actual provisional-reference revocation through existing chronology. Distinct **author-cancelled** disposition/**self-id-self-cancelled** event names the author, never a fictitious guarantor. Existing guarantor branch/event/authority/reference behavior is unchanged; Model/replay are the only runtime Source owners changed, no new API/module/court.

**No new clock code was needed:** creation already records lastRewardAt and enforces a rolling24h interval; shared disposal never clears it. New author authorization reuses that invariant. Literal examples with canonical state audits:

| Original recording | Author cancels | Next act accepted | Remaining wait |
| --- | --- | --- | --- |
| 0h | 0h | 24h | 24h |
| 0h | 23h | 24h | 1h |
| 100h | 123h | 124h | 1h |

Each cancellation burns exactly1existing unit, fee0, author/guarantor maturityXP0, no source-resolution/court record. The new act has position2 and predecessor the canceled position1; neither deletion/renumbering nor a cancellation-relative new24h wait. Immediately canceling/recreating again cannot bypass the next original issued slot. Key/artifact/face changes do not bypass it.

At exactly24h/later, author cancellation refuses even if value remains unused, and also cannot undo converted/invitation-used rights. Before24h, another unrelated actor or a source-specific lock cannot authorize it. An unlocked pre-existing right under a trusted D77 membership hold can be canceled without ending that hold: the next act remains forbidden until actual hold end. This is no admitted-case/merits or lock-precedence shortcut. Canceling a reserved pending debt right releases that canceled right's reservation only; actual debt remains and a later legitimately created source can be reserved again. No new general debt/maturity chronology chosen.

The labeled terminal-credit reference still permits its pre-existing late unspent GUARANTOR veto; D79 author permission always ends24h. That preserves the old reference, not a silent full D42/default migration. No default author self-inspection/cancellation behavior, actual cat detector, full admitted self-dispute path, guarantor-link fee waiver/identity exoneration or science/master gate change. Converted/D59-only relay references still exclude ordinary early-canceled own histories (guarantor or author); that is bounded reference coverage, not selected immunity from future claims.

## Properties / history and path boundaries

Three added existing-Model families cover supported terminal snapshot/current and maturity snapshot policies; author versus actual guarantor at0/23h; nonzero times/rotated keys/artifacts/faces/repeated cancel-recreate; ordinary XP/backing/role/history; stranger/duplicate/locked/24h unused-converted-invitation/debt/D77-held partitions. Existing Model families/bodies remain unchanged. An initial test matrix accidentally included the ALREADY unsupported maturity+current-veto policy; the existing production refusal stayed intact and the test used supported policy partitions. No rule weakening or favorable data/clock retry.

The fourth added family classifies the author event as passive graph history, like prior per-act cancellation. Canonical Model authorization/economic state, not graph replay, establishes who canceled. Deliberately changing only the passive author's payload preserves the graph projection: expected scope exclusion, not authentication or a hash collision. Existing literal-event completeness check now knows the event.

Archived unmodified pre-code Source fails all3new Model families on missing author authority; current Source passes. Fresh **766current+21original compatible-source historical**,86focused; native tests/audits verify actual current Source while historical bodies remain immutable compatibility, not current assurance. Fresh DAG55modules/177edges/0errors/warnings; two fixed legacy/vouch semantic trajectories unchanged. Independent archived Source compares15complete default outputs/exact keyed fork/draw/audit/snapshot streams,30full walkthroughs,2old one-step D77 outcomes and4timed ACT goldens. Current living3k-prefix full state/history/receipts equals both pre-D79 captured prefixes except ONLY implementation identity, with runtimeNode retained. No full NEW annual arm/ACT research capture or old study replay/relabel needed. New legitimate Source57015a72 is separate from historical7f2ec821.

## Evidence ceiling

D79 directly blocks resetting one SubjectId's issued slot through free cancellation; it does not prove global spam/DoS resistance, unique personhood, independently affordable honest access or incentive equilibrium. Public evidence/guarantor/invitation-trace D78 rationale remains; canceled act history is not erased and separate liabilities still need evidence/authority. D42 no automatic withdrawal, D56 historical continuity, D58/D59 later admitted/upheld correction and broader research/authority/privacy gates remain. This bounded owner-requested implementation is complete; no automatic Grow Loop/research restart is selected.
