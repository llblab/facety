# Facety protocol

Facety develops a voluntary common institution for people from different communities to recognize one another, make attributable claims, accept defined responsibilities and correct mistakes. Its purpose is to extend cooperation beyond personal acquaintance and local concentrations of power. A durable public registry of people who have lived preserves continuity and history. Like a registry office, Facety decides whether a subject represents one real, unique person and whether recorded acts follow its rules. Planetary cooperation is an aspiration, not a demand for cultural uniformity or authority to judge anyone's worth.

This specification states the rules in force and marks unresolved choices **Open**. An open choice is not permission to fill in an amount, authority or transition. The rules do not establish that a given implementation covers them or that the network is safe against fraud.

## Purpose and concepts

Assess distributed authority by who can participate, who answers for decisions and who can challenge them, not by node count. Earned differences in influence are compatible with this purpose: XP affects eligibility, members have equal Council votes, and money does not directly buy XP. Recognition, continuity over time, vouching for a claim and trusting someone to perform an obligation each need their own evidence.

More connections help where they enable useful cooperation and preserve responsibility. Dense isolated groups and compulsory intermediaries can defeat that purpose. A thousand connections is an aspiration for social capability, not a slot ceiling, a biological claim or an empirical result. Rewards should support participation and responsible attention; record counts and token issuance do not show that this work happened. Willingness, availability, recognition accuracy and effects on cooperation must be measured, not inferred from the design.

A **subject** is the persistent protocol identity to which history, rights and obligations belong. An account is a means of participating; a **key** signs on behalf of a subject when authorized. A signature establishes key control, not unique personhood. Replacing a key does not reset the subject's history, rate limit, XP, debt, obligations or dispute slot. Proof of continuity and recovery execution are open.

Treat distinct admitted subjects as distinct, responsible and rule-following unless the applicable procedure establishes a violation or identity conflict. This is a presumption, not proof. Separate personhood, intent, act validity, evidence and verdict: a genuine person can make an invalid act in good faith, and a valid act can be suspected and challenged. Association, coordination and losing a dispute do not by themselves prove another violation.

Keep invitation lineage, mutual guarantees, signed co-appearances and dispute participation distinct. None creates an edge in another by itself. Keep identity status, current reachability and liability distinct as well. A broken path is not proof of a false identity. Check alternative paths; loss of support blocks new acts that need it, not all transactions or all rights. It does not automatically erase links, history or descendants.

The base ledger records public, attributable claims, acts and consequences. That does not authorize a universal moral score or require disclosure of every part of someone's life. Participants can contest evidence, seek correction and appeal, and stop future participation without erasing recorded history or existing obligations. Public visibility does not prove truth or guarantee attention. External applications may use privacy-preserving proofs of a committed predicate without receiving the whole graph; this does not make the base ledger anonymous. Disclosure, freshness, revocation, proof soundness and what applications can reconstruct remain open. Identity credibility, contribution and economic rewards are separate: neither XP nor a guarantee measures usefulness.

## Identity and Self-ID

### Artifacts

The first publisher registers a media **artifact** by content hash or CID. Check the signing authority, supported profiles, bounded metadata and required rights assertion. Record the publisher, registration time, media type, canonicalization and detector versions, and the assertion. The publisher asserts the right to publish and dedicates the rights they control to the public domain. The bytes need not be on-chain. Do not register the same content hash again; perceptual reuse can be disputed, but a hash alone does not decide similarity, provenance or truth.

A **face reference** identifies the artifact, detector version and deterministic face index. The application shows the located faces so the signer can choose; it does not infer which is the signer. For the same canonical artifact and detector version the regions and indices must agree. No media type is mandatory. Images, group images, video and richer media can qualify if a face is reproducibly addressable; they do not earn different rewards. Canonical decoding, frame selection, model weights, ordering, version support and handling disputed or missing detections are open.

Several subjects may refer to the same artifact in separate signed claims within 24 hours of registration. Registration dates the chain reference, not the capture. If different subjects select the same face reference, record both and flag the collision publicly; submission order is not a verdict. Group media are encouraged when people meet, but co-signing establishes neither physical co-presence nor uniqueness. Same-subject reuse of a registered artifact at the intersection of the reference and reward windows remains open.

**Open:** Capture-time evidence, media and case access, retention and verification after loss of the bytes, publisher rights and consent, retraction, and safety for depicted people, including minors. Public accountability does not require copying sensitive media into runtime storage or permit unlawful redistribution.

### Recording a Self-ID

A **Self-ID** is a subject's signed identity claim. The author proves control of the signing key and asserts that the act is genuine and the selected face shows them. The author voluntarily dedicates their Self-ID record to the public domain; this is separate from the first publisher's assertion about the shared media. Later claimants need not repeat that assertion or claim rights they do not hold.

The same person can age, change their appearance or be injured without losing continuity. A genuine image of that person with a black eye can qualify; a different subject's appearance cannot. Unlike a passport photograph fixed at one point in time, the chain preserves successive observations of the same person. They are discrete claims, not continuous surveillance, a daily requirement, proof of presence between recordings or independent authentication of every appearance. Preserve the actual spacing and the evidence about each observation's time; registration time does not establish capture time.

For a rewarded Self-ID, check the signature, assertions and face reference, including that artifact registration is no more than 24 hours old. Check the subject's support and path under [Paths](#paths), its participation restrictions and its rolling 24-hour interval. If admitted, record the signed evidence, time, subject, predecessor and position in its personal chain, and fix its guarantors at creation. Create one emission right. The claim is not transferable. Keep the record, position, predecessor and provenance after cancellation, withdrawal, use, invalidation or key change. A refusal creates no act, right or reward slot.

An account preparing for its first invitation completes the required fields and publishes an initial Self-ID before it can be addressed. This act supplies the conceptual recipient side of the invitation, not an ordinary valence. It emits and burns nothing, creates no spendable right or debt, and does not admit the account. Its required fields, address binding and treatment for units, correction counts and ordinary reward slots remain open. It is not the network's founding state.

### Maturity and cancellation

A rewarded act matures 24 hours after recording unless cancelled or suspended. Before maturity the author cannot spend or withdraw the right. Strictly before the scheduled boundary the author or a guarantor authorized in the act's creation snapshot may cancel an eligible unspent act for free. Cancel the right once, prevent credit and retain the record with who cancelled it and in which role. Under minted escrow, burn the backing. Cancellation does not end a guarantee or close a dispute. The original rolling slot still runs from recording: a cancellation at hour 23 neither permits immediate reissue nor restarts the wait. A refusal or repeat changes nothing. Cancellation protects against liability for failing to prevent that act, not under a separate identity or historical duty.

At ordinary maturity the original veto expires, units are credited under [XP](#xp), and the right stays in Emitter custody until a separate disposition. No automatic withdrawal, new mint of existing backing or second credit occurs. A mature right is not immune to an authorized dispute or correction. Debt recovery also waits through the initial veto window.

### Suspension

When a dispute activates, suspend the accused's unprocessed Self-IDs, including any due at that boundary. An active dispute against a particular Self-ID also locks that target's unspent right against use or withdrawal, even if mature. The lock is not a new right; attachment after conversion and financial precedence with other obligations remain open. Do not suspend other subjects' maturities or undo already processed credit merely by activation.

An act whose maturity is suspended earns no units, usable right, integrity repair or debt repayment yet. Keep its record, ownership, position, snapshot and original rolling slot. The author and the act's authorized creation guarantors may cancel it while suspended, including after the scheduled boundary, but may not use cancellation to evade independent liabilities or reservations. Refuse a conflicting cancellation if financial precedence is unresolved. This exception is for unprocessed maturity, not a new veto over mature acts.

At execution apply invalidation first, then release only this dispute's hold. If no independent hold remains, a surviving act already due matures once at actual release under the state then in force for credit, repair and debt, using its original snapshot. Record actual credit time separately from scheduled maturity. Future acts keep their schedule. Never credit cancelled or invalidated acts, backdate credit, reselect recipients, restart the window or issue catch-up acts. Unaffected subjects proceed normally.

### Continuity

Begin with a recorded genesis group and its already established mutual guarantees. A group of about 7–12 is illustrative; no exact size, complete graph, free funding, XP or founder immunity follows. Specify membership, authorizations, activity, verification, financing and activation; do not infer consent from opposite legacy graph edges. Ordinary path and dispute rules apply from the start, with the small-network Council. The transition from a living participant to a historical record and durable proofs independent of one chain or service remain open.

## Guarantees, invitations and paths

### Valences and guarantees

A **valence** is a paid, one-sided offer to guarantee another subject. Its author must authorize it, have capacity for a new slot and pay with eligible own emission. On creation burn 1 FCTY immediately, even if unanswered, and record the offer. A refusal does not partly debit or activate it. No refund or implicit expiry applies. Host fees and exact source, duplicate and matching contracts remain open.

A **guarantee** is the established mutual relationship. Two valid opposite valences establish it when creation is admitted and the matching conditions hold. There is no extra slot, second charge on a retained offer, separate activation transaction or automatic rescan of dormant pairs on a capacity increase. Acknowledgment, payment or a bare pair of graph edges alone is not authority. Acceptance of an invitation is the distinct route below. Neither a valence nor an invitation by itself earns units.

Either party may end a guarantee for free. For ordinary guarantees, cancel only the terminating party's valence and release its slot; the opposite stays open unless separately withdrawn. A new paid valence can match that retained offer without charging its owner again. A closed invitation cannot be revived or turned into a free ordinary offer; a new link does not inherit an old invitation's active status. The exact release and mapping of invitation slots on cancellation, expiry and termination remain open. No burn is refunded. End future exposure, not history, existing receipts or an act's fixed roster.

### Responsibility

A **guarantor** accepts responsibility for the person's reality and uniqueness. A guarantee also warrants that the person is identifiable through their preceding Self-ID chain and that it was formed without violations. A later guarantor makes a new promise about that history; it does not become an earlier signer, recipient or guarantor for each earlier act. Guarantors can check acts, prevent eligible acts or invitations, teach the rules and leave. The design expects people to vouch through acquaintance and refuse requests from strangers by default; this is guidance, not a new admission test. The inviter ordinarily helps the entrant learn the rules; there is no separate office or automatic liability for an acquaintance or observer.

For a challenged event, use the guarantee and duty effective at that event, not the current graph. Record the event, responsible parties and basis separately for Self-IDs, invitations and openings. An invitation's guarantors are not automatically the guarantors of the Self-ID that funded it. One guarantee can cover more than one relevant event; a path does not price liability or authorize charging a whole component. The actual receipts used in an identity case are a separate basis. Exact time boundaries, historical warranty coverage, fault and overlapping duties remain open. Intentional fraud and breach of a duty of care need their own evidence and findings.

### Slots

Count one slot for each of a subject's own open valences, answered or not, and one for its side of each counted invitation. An ordinary incoming offer uses no slot of the recipient without a response. Each invitation counts at both ends from issuance, without another slot on acceptance or for the initial Self-ID. A new increment must fit; matching a retained counted side needs no extra capacity. A reduced ceiling never forces existing records or links to close. A higher ceiling allows new operations, not automatic pairing.

The starting ceiling `K` is 100. The ceiling can increase with XP levels and can be changed by referendum. An extra 50 slots per level and 1,000 XP per level are starting values for tuning, not evidence of a required production schedule. See [Governance](#governance) for changes. There is no separate lifetime, outgoing or pending invitation quota.

### Invitations

An **invitation** is an addressed offer, with issuance and acceptance separate. At issuance check the inviter's authority, both tests in [Paths](#paths), the prepared recipient, each endpoint's capacity and the inviter's one mature, eligible, unspent own right. Bought, gifted, transferred or withdrawn FCTY cannot fund it. Burn 1 FCTY from that right, allocate one slot at each end, and record the bound offer, its author, time, scope, source and responsibility together. The recipient pays nothing and incurs no debt. A refusal does not burn, allocate or record. Own funding limits issuance, not the interval between uses of banked rights.

For 24 hours after issuance the invitation cannot admit the recipient. A current guarantor of the inviter may cancel it during that window. The burn stands and the funding Self-ID's units are not revoked by this cancellation. After the window, valid acceptance establishes the special mutual guarantee and first admission. Eligibility is checked only at issuance: acceptance does not repeat the support, path or capacity tests, and cannot revive a cancelled invitation. Refuse invalid acceptance without admitting anyone or changing slots. Record use and keep one original inviter. A later offer to an already admitted subject does not create a second original inviter, a valence or a new relationship by itself. Expiry, exact authorization and acceptance, duplicate handling and remedies for traded or coerced invitations remain open; there is no bearer admission right.

A subject without current support can return by ordinary mutual guarantee without another invitation. If it lacks eligible own FCTY, the guarantor establishing the link pays for its valence; whether that payer must satisfy a path condition remains open. Another valid paid invitation is also a route for an unsupported former entrant. Neither route resets identity, chain, original inviter, rights, units or debt. No bypass of the tests for future Self-IDs or invitations follows.

### Paths

Count distinct verified subjects active through qualifying Self-IDs in the past 28 days. Difficulty's direct target is the decimal digit count of `max(1, count)`: 0–9 gives 1, 10–99 gives 2, 100–999 gives 3, and so on. Verify status under a declared procedure, not by raw account count or a presumed truth oracle. Use the applicable difficulty `D` at enforcement; if adoption is delayed, distinguish it from the target. Verification, treatment of disputed acts, adoption, epochs and grace remain open. A difficulty change does not retroactively invalidate identity.

| Act | Guarantees | Paths to the Council |
| --- | --- | --- |
| Rewarded Self-ID | At least one current mutual guarantor, of any origin | One simple path from the author to a different subject who is a Council member, at every act |
| Invitation | At least `D` qualifying mutual guarantors of the issuer | `D` paths to `D` different eligible members |

Both tests must pass; neither XP, raw degree nor a path substitutes for qualifying guarantees. The tests apply at every size. Use canonical current mutual guarantees, not ancestry, pending offers or ended links. Invitation paths are simple, distinct and share only the issuer; the issuer cannot count as a terminal, and no terminal can also be an intermediary in that family. Edge-disjoint paths through the same intermediary fail. Internal vertex disjointness in general permits shared endpoints, but the invitation rule requires different Council endpoints, chosen from eligible members at issuance. No path must contain an invitation link. No cluster quota or cross-subject reservation of path capacity applies.

Every counted path has at most `L` nodes including both ends; the default is 7. Intermediaries must be accepted and supported. Neither an intermediary nor a terminal can be actively accused, even on a direct two-node path. Exclusion lasts until the last applicable hold ends; it does not remove a seat or vote or require recusal. A challenger, guarantor, voter or ordinary participant is not excluded by that role alone. Eligible Council members are supported at level 0; another eligible subject is supported at a level if at least `D` current mutual guarantors are supported at lower levels. Levels above `L - 2` do not exist. Exclude the accused from layered support as well as from transit. The issuer need not supply a level for itself; it must meet its own guarantee test. A path certifies only the specified reachability, not independent human control, universal honesty, transitive trust or Council authority. Council membership does not waive the Self-ID path test. A member author cannot count their own seat, with or without intermediaries, but need not guarantee another member directly. For Self-ID creation and invitation issuance evaluate guarantees, accepted status, exclusions and layered support at one current state revision using the adopted Council and difficulty. A cached result must account for all those inputs. Invitation acceptance does not repeat these tests.

Use bounded verification against canonical state for every consequential path decision. A witness must meet edge, node, endpoint, length and whole-family conditions together. An advisory indexer cannot supply authorization, and a search that runs out of budget does not certify a path or prove infeasibility. Status changes may block new entry or emission but create no general cascade or right to replace an inviter.

## Money and debt

### FCTY and custody

FCTY (FaCT You) is the fungible token. It has twelve decimal places: one quantum is `10^-12 FCTY`. **Emitter** is the state of the one-time right associated with a Self-ID. A rewarded act creates a right to 1 FCTY, not 1 FCTY of free funds. **Collector** is the ordinary FCTY balance. A subject may leave a mature right in place, withdraw the value to Collector, or consume the right for a permitted use of own emission. Withdrawal realizes that value once and ends its eligibility as own emission. No disposition can reuse backing or change who earned the act's units.

Reserve means put value aside exclusively, not collect it. Release restores access to the owner's backing, not a reward. Collect means take the amount actually available under an authorized obligation. Pay or transfer moves value to another holder; burn destroys issued money. Record actual mints and burns for supply (`ending supply = starting supply + mints - burns`). A missed future mint, uncollected obligation or transfer is not a burn. Once burned, FCTY stays burned. The asset representation (for example minted escrow or deferred mint) is open; it must preserve the link between outstanding rights and backing and account for cancellation, consumption and withdrawal exactly once.

Only spendable Collector funds can be reserved as a stake, including purchased or withdrawn FCTY. Mature Emitter rights are not collateral. Authorized collection on applicable merits charges is separate and can reach eligible mature emission. Source correction cannot erase withdrawn money reserved in another case, or simply remove money already transferred to someone else. General collection order among assets and commitments remains open.

### Debt

**Debt** is the uncollected part of a losing stake or other applicable charge. Record it against the subject with its decision, creation order and remaining amount. It is a negative emission balance, not an actual payment or burn; there is no ceiling. Future mature emission repays the oldest outstanding debt first before becoming disposable, without shortening any veto window. Account for the value actually consumed, not the nominal obligation. Under minted escrow, burn the backing used for repayment; a withheld future mint would not be a burn. An unpaid award is not a promise of later payment to the winner. The exact asset implementation and canonical order for simultaneous debts remain open. Abandoning an account does not collect its debt.

While that balance is negative the subject cannot open invitations or guarantees. Its maturities credit neither the author nor its guarantors with new units; later eligible acts earn units once the balance is non-negative. A valid own maturity still repairs integrity. Retain the suspension of credit: later repayment or reversal does not grant missed units retroactively. Debt alone does not permanently exclude the subject. There is no Facety Treasury or Council fund for internal dispute accounting; [Treasury D](#atmo) is separate.

Everyday use and market transfers create neither personhood nor XP. The one-act reward and rolling limit are not a price peg, fiat income, redemption promise, lifetime issuance cap or end to issuance. A finite concurrent population does not bound all-time issuance; possible social links do not imply market demand.

## XP

**Responsibility units** (units in this section) are credited from eligible Self-ID history. **Integrity** is a coefficient in [0, 1], starting at 1. **XP** is non-transferable. It ranks subjects on the public leaderboard and governs eligibility and comparisons, not truth, usefulness or ownership of money.

```text
XP = floor(units * integrity)
```

### Credit and revocation

When an eligible Self-ID matures, credit one unit to its author and each eligible guarantor fixed at creation, subject to the [debt rule](#debt). Only established mutual guarantees supply guarantor roles. Joining after creation cannot add a recipient; leaving cannot remove one or take away units for unrefuted acts. A snapshot fixes the eligible guarantors and veto roles; a receipt records the actual recipients and credit time. A pending, suspended or cancelled-before-credit act has no issued units. Neither withdrawal, burning, invitation, guarantee formation nor spending credits or redirects the units. Guarantors receive no FCTY mint from this credit.

An authorized revocation removes the unit attached to each actual receipt once, without deleting issuance provenance. Use the affected act's own receipts, not a present-day roster or a single roster applied to several acts. A mere challenge does not revoke units. An already revoked unit cannot be subtracted again or restored while another valid revocation still applies.

### Loss and repair

A losing participant's integrity is halved, including a Council member who loses under the applicable participation rule. Each independent loss halves it again. Halving does not divide units, transfer XP, or cancel guarantee links. Each valid matured own Self-ID adds `1/1000` to integrity, capped at 1. All units count at the resulting integrity; one credited unit need not increase XP by one. For example, 10,000 units at 0.25 give 2,500 XP. Another eligible own maturity with no intervening events brings the total to 10,001 units at 0.251, giving 2,510 XP. Exact representation or an explicit rounding rule for integrity itself is open; the floor in the formula applies to XP, not to each halving.

Derive XP from Self-ID receipts and authorized chronological changes. Snapshots, balances and indexes may speed up reads but must return the result of chronological processing, not stale eligibility. Ordinary maturities apply before other events at the same time except that activation first suspends the accused's unprocessed acts and verdict execution precedes release-time credits. Revocation does not silently undo past decisions taken using prior XP; correction of such decisions needs its own authority. Gain from sustained, accountable activity and early building is intentional, not immunity or proof that high-XP participants judge correctly.

## Disputes and Council

### Challenges

A participant may publicly challenge an eligible transaction if their XP is strictly greater than the author's. No guarantee between them is required. Eligible targets include Self-ID issuance and face claims, invitation creation and use, guarantee formation and termination, identity-related surety where an application uses it, and other admitted transaction classes. Preventive cancellation and [voluntary correction](#voluntary-correction) of a Self-ID do not require an ordinary dispute. The applicable evidence, deadlines by transaction class, and authority for admission and execution remain open. Participants must have a usable, authorized route from evidence to remedy, rather than depend on an unspecified administrator.

Anyone, including a nonmember or someone with too little XP, may investigate public evidence and ask a qualified participant to assess and sponsor a challenge. Only a willing, eligible sponsor can open it and take the risk; a contact request is not entry. Private compensation is possible outside the protocol, not a bounty or a right to another person's funds or private data. Evidence is judged apart from the source's allegiance; repeated reports of one claim are not independent confirmation. Distinguish discovery, evidence, sponsorship, entry, decision and execution. Higher positions put more XP and money at risk and can give a dispute more public attention; alert tiers and safe evidence access are open. Visibility does not ensure anyone responds.

### Filing

The opening is a transaction distinct from the dispute it starts. Identify the accused subject, target and class, claim and challenger. Check eligibility and record the XP used for admission, the opening's guarantors and, for a non-author Self-ID correction, the endpoint and count. For a monetary filing, price the [first stake](#stakes) and reserve it in full and exclusively from spendable Collector funds. Record the pending opening and occupy the accused subject's one unresolved slot in the same transaction. If any check fails, including an occupied slot or insufficient funds, refuse the whole filing: no case ID, slot or reservation, and no balance change. A balance check alone is not funding. From filing those funds cannot be spent, transferred, withdrawn or pledged again.

The slot belongs to the subject, not a key or transaction. It lasts through pendency, activity, all deferrals and execution. Key replacement or recovery does not itself free or migrate it. An admitted appeal uses the slot of the author of the opening it challenges; a request alone occupies nothing. A later admissible filing fixes new facts, but does not authorize repeating a penalty for an adjudicated loss. If the opening itself loses a challenge, apply its event-time responsibility, not the activation-time graph or the identity case's XP receipts.

### Cancellation and activation

For 24 hours the opening holds the slot and its reservation, but imposes no active custody, restriction, maturity suspension or response clock. Strictly before that boundary the author or an authorized guarantor of the opening's author may cancel it. Record the cancellation, release the entire reservation to its owner and free the slot once. There is no payout, penalty, debt or merits finding. The challenged Self-ID's veto roster does not by itself have this power; authentication and the effect of membership changes on the opening's veto remain open. A Council seat confers no unilateral collective authority.

At 24 hours an uncancelled opening activates. Use the reservation unchanged, with no second charge or funding check. A withdrawal, transfer, maturity, other filing or change in free funds cannot make an accepted opening fail to activate. Record filing, scheduled activation and actual activation or cancellation separately. Start the applicable suspension, restrictions and clock then; for an appeal start a fresh Council round of seven days. Appeal finances and other same-time ordering remain open.

### Positions and the clock

The ordinary ladder has one participant per position: the accuser at 1, the first defender at 2, then alternating sides. Before cutoff and before terminal Council entry, any otherwise eligible participant may join on the side opposite the most recent entrant if their XP is strictly greater than that entrant's. The accused may start defending at activation and seek help; no special first-defender privilege or required second confirmer applies. No mandatory pre-case verification step is added by the ladder. Extra money cannot substitute for XP.

Each admitted position, including a Council entry into an ordinary case, gets its own window from when it joins:

```text
window(n) = max(3, 8 - n) days
position deadline = join time + window(n)
```

The shared deadline is the latest of these ends, plus any [deferrals](#rounds). It never shortens. For example, ordinary positions joining on days 0, 1, 2 and 6 move the deadline to days 7, 7, 7 and 10. The floor applies to each position, not total duration. Record the time, ordinal and deadline before and after a successful entry. Refusal, duplicate attempts, notice and evidence add no position or time. Without Council entry, the last ordinary side wins at cutoff, even if the accusation was unopposed; silence is not evidence that the claim was true.

### Restrictions

While a dispute is active, its participants on either side may not create Self-IDs, issue invitations or open guarantees. Hold actual participation, not observers, relatives, contacts or every Council member by mere membership. Other subjects proceed unless separately restricted. A new position does not release earlier ones. Existing rights, the accused's [suspension](#suspension) and separate custody rules still apply; the three prohibitions are not a ban on transfers, withdrawal or defense in general. Permission to terminate a guarantee during a case, collective participation and delivery of previously issued invitations remain open. No catch-up issuance or compensation follows a hold.

### Stakes

A **stake** is a monetary commitment under the dispute rules. Each ordinary position `n` has the exact nominal amount `B * (6/5)^(n-1)` FCTY. The base `B` is the filing count `N` for a non-author Self-ID correction and 7 FCTY in other cases where that base is selected (including identity cases). The formula gives no default for invitation, opening or appeal finances. Voluntary correction has no stake. Round the final amount upward once to the least whole quantum not below it; never compound a previously rounded amount or round intermediate steps. The formula sets no cap on stakes or positions.

The first monetary position uses [full funding at filing](#filing). For later ordinary positions reserve available Collector funds up to the stake, with no minimum funds. Keep reservations until settlement. Shortfalls on winning positions are not debts. Shortfalls on losing positions are debts; they do not fund a payment or burn at verdict.

### Settlement

Release each ordinary winner's own backing and pay that winner the actual collection of the losing stake immediately below. A losing ordinary accuser's stake goes to the ordinary defender at position 2 when the defense wins. Apply the same rule separately to higher positions. When a losing top stake has no ordinary recipient above, including when only the Council is above, burn the amount actually collected; the Council receives none. Record the uncollected part under [Debt](#debt). A returned stake is not winnings; winning does not credit units. Apply the [loss rule](#loss-and-repair) to losing participants. An exception for a good-faith losing accuser remains open.

Merits charges below are separate from position forfeits. Pay only actual collection to the named recipient or burn what is collected for burning. An unfunded award is not topped up by another party's charges. “Open” does not mean zero or permission to borrow an identity-case price or sanction.

| Established loss | Who owes or loses | Consequence |
| --- | --- | --- |
| False identity | Accused | Invalidate the identity and its Self-ID chain, preserving the records. Revoke the chain's units, halve integrity and charge 7 FCTY toward the first accuser's award. |
| False identity | Guarantors who actually received credit for the subject's acts, including those who left | Charge 7 FCTY each for burning; revoke attributable units separately. Halving requires its own losing-role basis. |
| Non-author Self-ID correction | Accused and the violating act's creation guarantors, each separately | Apply the [correction](#self-id-correction) count and destinations, not another identity charge. |
| Losing invitation | Creator and guarantors responsible at issuance | Halve integrity; the monetary amount and destination are open. |
| Losing opening | Author and the opening's guarantors under the applicable duty | Use the event at filing. Merits amounts, destinations and penalty roles are open. |

The accused is not an ordinary position merely by being accused. Financial liability alone does not halve a guarantor's integrity. Apply only authorized effects once per enforceable penalty event. Whether two cases cover the same enforceable event, overlapping remedies and multiple roles need exact contracts; a later filing or a replay is not evidence of a new loss.

### Council

The **Council** is the collective body for dispute intervention and appeal. Below 100 active participants it has three equal-vote seats, filled by genesis members until enough accounts are active. From 100, take the nearest integer to `sqrt(D)` (there is no half-integer tie):

| Rounded root | Target seats |
| ---: | ---: |
| 2 | 11 |
| 3 | 101 |
| 4 | 1001 |
| 5 | 10001 |
| 6 | 100001 |

At the direct 100-participant threshold the target is 11. From 100, seats cannot exceed the active verified population or eligible candidates. Below 100 the three-seat rule applies on the way down as well as up. Rank on XP with active eligibility over the preceding 28 days; exact filters, topology adjustments, ties, vacancies, behavior beyond the lookup and seat transitions remain open. Recalculation need not replace members. Membership and rank grant neither immunity nor unilateral verdict power.

Any member may initiate intervention in an ongoing dispute before its cutoff if the Council has not entered. Propose the side opposite the last ordinary participant. Opening the vote immediately enters the Council once, without the ordinary XP gate or a stake. This is the terminal position on the shared clock, not a vote on permission to enter, and not a separate extra interval. Notice or a queue is not entry. The Council may intervene at any point before cutoff but need not hear every case; a member's private entry is distinct from collective entry. No later ordinary entry is allowed after Council entry, including after deferral.

A member may file against another member through the ordinary opening transaction. The peer case goes directly to the Council vote instead of ordinary escalation. Both parties keep their votes if in the electorate. Use the same choices and clock, not a separate Council-only interval. The exact peer admission, XP/access and collective settlement mapping remain open. The highest-XP subjects are not exempt from collective review.

### Rounds

Take a fresh membership snapshot when the Council vote starts and at the start of each **round**. Each member of that round's electorate has one vote, regardless of XP. Members can vote during the round; recognize its result only at the current shared deadline, using all timely ballots. An early majority does not end the round. There is no quorum or recusal; a single ballot can be the majority when it is the only ballot cast.

A simple majority is more than half the ballots cast.

| Choice with a simple majority | Effect in an ordinary dispute |
| --- | --- |
| Confirm the entering member | The Council side wins. |
| Oppose the entering member | The last ordinary side wins; settle as if the Council had not entered, keeping its entry and clock in the record. |
| Defer | Keep the dispute open and add seven days to the current shared deadline. |

If no choice has a simple majority at the cutoff of an entered vote, including no ballots, defer by the same seven days. Start the next round at that cutoff, with a fresh electorate and no carried ballots. Record the round, electorate, timely ballots, result and old and new deadlines. Apply each extension once, either by majority or by no majority, never both. Replay does not create a new result. The additions may repeat without a selected cap. They keep custody, holds and restrictions in force and do not give a winner, settle money or halve integrity. Without Council entry, notice or inaction does not trigger automatic deferral.

**Open:** Authentication and revision of ballots, ordering membership changes at round starts, duplicate referrals and ordering simultaneous entries, evidence and reasons, and replay-safe authorized execution. Recognition produces a **verdict** when merits are decided; execution applies it. A ballot or a majority is not proof of truth. A captured Council can damage the registry's credibility; there is no infinite superior ladder or guaranteed correction of collective failure.

### Closure

Only execution of the verdict closes an active dispute, including during a deferral. There is no unilateral withdrawal, agreement, cancellation payout or extra compensation to the accused. Apply settlement and authorized remedies before releasing only this dispute's custody and restrictions and processing surviving due acts under [Suspension](#suspension). Free the slot last. Reversing a verdict requires the separate appeal procedure.

## Correction and appeals

<a id="self-dispute"></a>

### Voluntary correction

An author may voluntarily correct one of their own matured Self-IDs. Require authority for the persistent subject and the exact uncorrected act. Use a signed correction bound to the network, protocol version, operation, author, target and replay nonce. There is no merits vote, case, clock or stake. During the initial or otherwise eligible suspended-maturity cancellation window, use free [preventive cancellation](#maturity-and-cancellation) instead.

Correction costs 2 FCTY and must be fully funded before mutation. Burn the source's 1 FCTY if still unspent and unencumbered. If it was withdrawn, transferred, used or already burned, burn 1 FCTY of replacement restitution from the author's spendable Collector instead. Separately burn a 1 FCTY fee from spendable Collector. Never reuse a historical burn as payment, touch reserved funds or seize another holder's FCTY. Refuse atomically if custody prevents correction or the required 1 or 2 FCTY of Collector funds are unavailable; this route creates no debt or refund.

Record one correction, revoke exactly the units in the target's actual receipt and remove its own maturity repair from chronological integrity replay. Preserve other losses, repairs, caps and independent revocation causes; recalculate XP from units and integrity. The target no longer supplies a valid observation or own emission. Preserve all historical IDs, timestamps, commitments and original signed links. Derive the valid successor by skipping invalidated records against their preserved history and correction evidence; do not assert an original signature over the skip. The original position remains a gap with no valid observation. No observation, reward or credit is replaced, moved or regenerated. Provenance does not require continued disclosure of the invalid media.

Priority is canonical recording order of successful funded operations. A live earlier external proceeding keeps its scope, obligations and custody; an earlier activated or decided proceeding for the same act uses its own review route. Refused requests and earlier pending filings cancelled before activation take no priority. Correction does not recalculate a frozen scope, validate a period using the invalid act or undo independently finalized actions. Keep valid later acts, provenance of uses of the backing, identity, guarantees and independently authorized operations. A second case cannot repeat the same loss; a distinct violation still needs its own authority and effect.

### Self-ID correction

At filing a non-author challenge against a Self-ID fixes the violating position `i` and the accused's current endpoint `end`. The count `N` includes the violation and the recorded positions through the endpoint, even acts that were otherwise correct, excluding acts already voluntarily corrected. Preserve the historical positions and the exact affected list. Use `N` for the first stake and each applicable charge. Neither activation, new acts, verdict nor deferral can reprice it. Acts recorded later are not in this case; they can be addressed only by a fresh admissible filing after closure. A pending cancellation decides no merits.

If upheld, cut that suffix, not the earlier prefix or the person's identity by inference. Retain the records and revoke the attributable units using each act's receipts. Halve the losing author's integrity. Collect the accused's `N` FCTY charge for the first accuser, paying at most `N` and only what is collected from the accused. Charge each guarantor from creation of the violating act `N` FCTY separately for burning, not for the award. Do not use the current roster, a union of suffix rosters or the identity case's recipients. The accuser's own principal and ordinary forfeits are separate; no extra 7 FCTY identity charge applies. A guarantor is not the author and gets no author-only single-act remedy by that role.

#### Collection before cut

For an admitted, upheld case with `N = 1`, suppose the accused has only the target's mature unspent Emitter right: no liquid FCTY, other assets, debt, prior correction or competing reservation. The accused, accuser and original guarantors are distinct and the guarantor charges have independent backing. Collect and transfer the existing 1 FCTY backing to the first accuser before cutting the source and revoking its receipts. This pays the accused's charge in full: no second burn of the source and no unpaid accused charge. The accuser's stake, guarantor burns and other merits effects stay separate. These premises describe this settlement, not general admission restrictions or a general asset-priority schedule. Broader collection order, unavailable backing, overlap and repeat enforcement remain open.

### Identity remedies

Impersonation, duplicate subjects, invented people and false identity evidence are grounds for applicable claims, not interchangeable verdicts. A genuine person can defend their reality through renewed visible presence, a meeting, witnesses or, voluntarily, documents. No mandatory passport or perfect evidence rule follows. Proving reality does not prove that every past act was valid. Investigate linked events, inviter ancestry or a defender's own history when there is evidence, but any further case needs its own claim and basis, even after a successful defense.

When a dispute opens against a node of a suspected fabricated cluster, its entry points receive heightened scrutiny. For the established cluster remedy, require accounts in the affected invitation subtree to establish they are real within a proof window or be invalidated. Invalidation is partial, not a declaration that every neighbor is false. Each invitation of a fake is a losing act for its creator and the invitation's guarantors. Burn recoverable unspent rights and liquid FCTY on invalidated accounts, not money transferred away. Wrongly invalidated people can appeal; restore honest links cut by mistake without a fee. Cut-off participants can regain support through honest guarantors outside the cluster. Exact evidence, scope, proof clock, link repair and any uses of recovered value other than burning remain open.

If a verdict finds two accounts belong to the same person, the holder is at fault. Invalidate the second account and recover everything the holder received through it under the applicable recovery authority. The consequence reaches the holder, including their original account, chain and new invitations; it does not make the original identity fabricated by inference. An unwitting inviter is acquitted if a qualifying co-presence artifact was jointly signed by inviter and invitee before the invitation. Record the acquittal rather than a finding against the inviter for that invitation. Do not cut the inviter's other guarantees or apply the corresponding loss of integrity or units as penalties for it. Without the acquittal, ordinary historical liability applies. Artifact authenticity, freshness, signer-to-person binding, recognition and fabricated-meeting handling remain open; signatures alone are not proof of co-presence or a general defense to other duties.

### Appeal

An affected person may request review of a closed case as erroneous. A request occupies no slot and starts no clock. To open an **appeal**, challenge the prior accuser's opening transaction. The prior accuser is the accused. A willing eligible participant with XP strictly greater than the prior accuser's, or the Council acting collectively without that gate, may file. The [filing lifecycle](#filing) applies to the subject's slot, pendency, veto and activation. Appeal stake, custody and financial scope are open: neither free admission nor a mandatory amount is inferred from monetary filing.

At activation take a fresh electorate and start a seven-day first Council round, not another ordinary ladder. Use the [round rules](#rounds) with these choices: confirm the prior verdict, reverse it and authorize restoration, or defer by seven days. The prior case's history and clock are not rewound. A request, opening or deferral does not reverse it. Recognition of an authorized reversal and execution of restoration are separate.

Restore status and the units this verdict revoked to their original recipients. Recalculate integrity chronologically without this verdict's loss, retaining later valid own maturities, other losses and the cap at 1. For example, `1 -> 0.5 -> 0.8 -> 0.4` after an erroneous loss, 300 valid own maturities and a later valid loss restores to `0.5`, not `0.8`: the repairs cap at 1 before the retained halving. Preserve prior records, other legitimate cases, holds and remedies. Current support and path gates still apply; there is no catch-up emission or credit. Status restoration alone is not the remedy.

Cancel only this decision's unpaid debt. For debts of 7 and then 7, a repayment of 5 leaves 2 and 7. Reversing the first debt's verdict cancels its 2; it leaves the other 7 and does not refund the 5 already burned. Past burns stay burned. Refunds of transferred money, funding, linked records, admission, collective authentication and execution authority remain open. After key recovery, never credit the same restored unit to both the retired source and the successor; their migration and attribution contract remains open.

## Governance and Atmo

### Governance

The network can change `K` and the path bound `L` by referendum. Each participant's ballot weight is their XP, not token holdings or a stake. Council dispute voting remains equal per member. A referendum on `K` pauses nothing; existing restrictions and the per-invitation veto window still apply. Electorate, XP snapshot, quorum, ties, execution and exact numerical slot progression remain open. Council size follows its lookup, not a free size parameter.

Atmo has a separately scoped mandate over `K` and whether to allow new invitations, new emission with associated credit, and new dispute openings. All three are enabled by default. This is not authority to decide individual cases. The control electorate, evidence, trigger, delay, duration, restoration and authority for execution remain open. A pause must not silently erase earned XP, history, rights, liabilities, collateral or existing cases. Exact effects on in-flight invitations and maturities, existing disputes, timers, Council entry and vetoes require their own cutoff rules. An allegation does not activate a pause.

Execution must be deterministic and resource-bounded. Bound evidence, graph verification and processing per operation; avoid full-network scans for activity changes or admission. An index or a delayed task must not decide stale eligibility. Version or explicitly migrate a changed policy without silently rewriting earlier identity or economic effects.

### Atmo

DEOS provides reusable runtime and economic mechanisms. Atmo is an instance with its own capital and governance; Facety is its application for accountable identity, not necessarily a separate chain. Other applications can use its attestations but decide their own permissions; a Facety claim is not a grant of access. Facety has no discretionary claim on Atmo's monetary anchor, development or operating Buckets A, B and C.

Bucket D is dormant until approved activation. Under Atmo's conditional demand policy, governance using ATMO may authorize release of available capital into Treasury D. Treasury D spends its separately authorized budget to buy existing FCTY on the market and burn what it acquires for that operation. Capital release and Treasury spending are separate checks. Distinguish committed capital and assets actually available to spend. Account publicly for the asset spent and actual FCTY burned. Local purchase, burn, budget and record must succeed atomically; a remote or asynchronous operation needs a recovery contract rather than pretending that local rollback undoes a market trade.

Define budget and spend limits, allowed assets and routes, actual output, slippage, price checks, replay protection, and review of pause and restart before execution. Atmo can reduce or stop buybacks after a material trust failure and restore them under approved policy after credible recovery. Health measures, governance and execution are open. This policy belongs to Atmo, not every DEOS instance; it creates neither XP nor invitation-eligible rights and promises neither redemption nor a price floor. It does not pay dispute shortfalls, change identity status or activate any of the four core controls. A recovery fork or a redirection of support to another instance is not an automatic remedy or authority to migrate claims, confiscate funds or exclude people by association.
