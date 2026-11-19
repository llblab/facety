# Facety: Rules of the Game

Facety is a voluntary public registry of people who have lived. You identify yourself, take responsibility for your claims and decide whom to guarantee. The network decides whether people are real and unique and whether acts follow the rules, not whether someone is a good person. This guide covers participation; the [protocol](facety.protocol.en.md) specifies the full rules.

## Your identity

A **subject** is the identity that keeps your history, rights and obligations. Your account and signing key are not your identity. Replacing a key, losing support or returning to the network does not make your history, XP, rate limit or debt start over. Different admitted subjects are treated as distinct and rule-following unless an applicable proceeding establishes otherwise.

A **Self-ID** is your signed claim that the act is genuine and the selected face in a registered artifact is yours. You voluntarily dedicate the record you author to the public domain. The first publisher registers the media reference and separately asserts publication rights and dedicates the rights they control. Later claimants need not make that assertion. Consent and the legal mechanism still need rules.

You may choose a supported media format. A **face reference** identifies the artifact, detector version and face index. Multiple people can use one group artifact within 24 hours of registration. If two select the same face, record both and flag the conflict; order of arrival decides nothing. Do not register the same content twice. Suspected near-duplicates can be challenged, and same-subject reuse at the boundary still needs a rule. A signature proves key control, and the time of registration does not prove capture time. A shared artifact does not establish a guarantee or prove co-presence.

## Joining and guaranteeing

Before someone can invite you, prepare an account with the required fields and publish your initial Self-ID. This act does not earn FCTY, require a burn or admit you; its treatment for responsibility and ordinary Self-ID history still needs detail.

An **invitation** is an addressed offer. To issue one, the inviter must have the required guarantees and paths and room for a slot at each end. Issuance burns 1 FCTY from the inviter's mature own emission, counts both slots and records the invitation together; the recipient pays nothing and owes nothing. Bought, transferred or withdrawn FCTY cannot be used for this burn.

An invitation waits 24 hours. A current guarantor of the inviter may cancel it during the wait. The burn stands; cancelling the invitation does not revoke units from its funding Self-ID. After the wait, valid acceptance admits the recipient and establishes the special mutual guarantee. There is no repeat of the issuance tests or extra slot charge. Keep one original inviter; a closed invitation is not reopened. Later offers do not create a second original inviter.

A **valence** is a one-sided offer to guarantee another subject. It burns 1 FCTY from eligible own emission and uses one of your slots immediately, even unanswered. Two valid opposite valences establish a **guarantee**, a relationship in which each accepts responsibility for the other. A bare offer earns nothing. Matching does not charge either side again. You may end the relationship for free. In an ordinary guarantee that cancels your valence and releases your slot, not the other party's offer. A new paid valence can match it again. No burn is refunded.

As a **guarantor**, you warrant that the subject represents one real, unique person and is identifiable through their prior, valid Self-ID chain. This does not put you into earlier acts' snapshots. Leaving affects future exposure, not the responsibility you accepted or the units you earned from unrefuted acts. For a challenged event, check who was responsible then, not who is linked now.

The ceiling `K` starts at 100. Count your open valences and your side of each invitation from issuance. Experience can increase capacity; the numerical schedule is not fixed. Reduced capacity does not cut existing links or refund anything. If you lose support you can return through an ordinary mutual guarantee without a new invitation. If you have no eligible own emission, the guarantor establishing the link pays for your valence. Your history and original inviter do not change.

## Support and paths

A rewarded Self-ID needs at least one current mutual guarantor and one qualifying path from you to the Council. Issuing an invitation needs **both** at least `D` qualifying mutual guarantors and `D` paths to `D` different Council members. `D` is the adopted difficulty; its target is the decimal digit count of the active verified population, clamped to at least one. Activity uses the past 28 days. Verification and difficulty adoption still need exact rules.

Use current mutual guarantees, not invitation ancestry. An invitation's paths share only the issuer, not an intermediary or another path's terminal. Each path has at most seven nodes by default, including both ends. Intermediaries need support: Council members start at level zero; another subject qualifies for a level if it has `D` current guarantors at lower levels, up to level five at the default bound. An accused subject in an active case is excluded from transit and support; a challenger is not excluded just for challenging. A path is not proof of personhood. There is no cluster quota. These rules apply from the beginning: the founding group starts with recorded mutual guarantees, not a waiver of paths.

## Making and maturing a Self-ID

You can record one rewarded Self-ID per rolling 24 hours if you meet the support tests and are not restricted by an active dispute. It creates a right to 1 FCTY, initially unavailable. **Emitter** is the state of the right; **Collector** holds ordinary FCTY that can be transferred. FCTY is **FaCT You**, with twelve decimal places.

For the first day, you cannot spend or withdraw the right. You or an authorized guarantor fixed at creation may cancel the eligible unspent act for free. That prevents its credit and removes the right, but the record and original 24-hour slot stay. The guarantor avoids liability for failing to prevent that act, not for a separate violation. At ordinary maturity the original veto ends even if you leave the right untouched. You may later withdraw to Collector or consume it for an eligible invitation or valence. Maturity alone does not withdraw anything, and spending does not credit anything again.

If a dispute activates against you, unprocessed Self-IDs are suspended, including those due at activation. They cannot yield a usable right, units, debt repayment or integrity repair while held. Your record, slot and original guarantors stay. You or the act's authorized guarantors can cancel while maturity is suspended, even past the scheduled time, subject to other obligations. The challenged Self-ID's unspent right can also be locked separately. When the verdict is executed, invalidation comes first. A surviving due act matures once at actual release with the original recipients, unless another hold still applies. A future act keeps its schedule. Other people proceed normally.

## XP

When an eligible Self-ID matures, credit one responsibility unit to its author and each eligible guarantor fixed at creation, subject to debt. The snapshot fixes the roster; the receipt records actual recipients and credit time. A later link does not add a recipient and a departure does not remove one. Guarantors get no FCTY mint for this. An authorized revocation removes the units from the actual recipients, not the current roster.

**Integrity** starts at 1. A loss in a dispute halves it, including for Council members who lose under the participation rule. Each valid matured own Self-ID adds 0.001, up to 1. Halving does not remove units. XP is non-transferable and determines procedural comparisons; buying FCTY does not buy XP.

```text
XP = floor(units * integrity)
```

Crediting one unit need not increase XP by one. The floor is for XP; the precision rule for integrity itself remains open.

## Filing a dispute

A **dispute** challenges an eligible claim or transaction. You can inspect evidence and ask a qualified participant for help even if you cannot file. An ordinary challenger must have more XP than the transaction's author, but need not be their guarantor. State the claim publicly; suspicion is not a finding of guilt.

A monetary filing reserves the **full first stake** from spendable Collector funds and occupies the accused subject's one unresolved slot in the same transaction. A refused filing reserves nothing, takes no slot and creates no case. Mature Emitter rights are not collateral. For 24 hours the opening holds the reservation and slot but starts no active restrictions or clock. Before that boundary the opening's author or an authorized guarantor of that author may cancel it for free. Release the whole reservation and the slot once. The challenged act's guarantors do not have that right merely because they can cancel the act.

At 24 hours an uncancelled dispute activates on the same reservation. There is no second charge or funding check. Once active, a dispute closes only by execution of its **verdict**; no withdrawal or agreement ends it. Apply the verdict before releasing this dispute's holds and free the slot last. The opening is itself a transaction that can be challenged, with its own guarantors at filing. Its merits charges and veto authentication still need detail.

## Joining and deciding

The accuser takes position 1. Each ordinary entrant takes the side opposite the preceding position and needs strictly higher XP than that entrant. One person takes each position. The accused can answer from activation and look for help, but no mandatory confirmer or pre-case verification step is added. Active participants on both sides cannot create Self-IDs, issue invitations or open guarantees. A new entrant does not release earlier participants.

A **stake** is the amount at risk. Before rounding, position `n` stakes `B * (6/5)^(n-1)` FCTY. Round the final amount upward once to a quantum of `10^-12 FCTY`, not each multiplication. The selected base is 7 FCTY in an identity case; for a non-author Self-ID correction it is the count described below. Other unsettled finances do not acquire a base by analogy. Later ordinary positions reserve only what is available up to the stake, with no minimum funds. Reservation is not collection or payment.

Positions get 7, 6, 5, 4, then 3 days each from their own entry. The shared deadline is the latest end, plus Council deferrals. Join before that deadline and before Council entry; the last ordinary side wins at cutoff if the Council has not entered. Silence is not proof. Refusals, notices and requests add no time.

The **Council** starts with three equal-vote seats below 100 active participants. From 100 its target follows the protocol's [difficulty lookup](facety.protocol.en.md#council), limited by eligible candidates and the active verified population. Any member can open a collective vote on the opposite side to the last ordinary entrant, without the ordinary XP gate or a stake. This is one terminal position on the same clock; no ordinary positions follow it. A dispute between members goes directly to the Council vote, with exact admission still open.

Snapshot membership at the start of each round and count one vote per member. The choices are confirm the entering member, oppose (the last ordinary side wins), or defer. Use a simple majority of ballots cast, without quorum or recusal. Count all timely ballots only at the cutoff, not an early majority. If a majority defers or no choice has a majority, add seven days to the current deadline once. Even no ballots defers an entered vote. Start a fresh round with a new snapshot and no old ballots. Deferrals can repeat without a cap, keep holds and custody, and settle nothing. Mere notice is not Council entry.

## Collecting and repaying

Each ordinary winner gets back their own backing and receives what is actually collected from the losing position immediately below. If only the Council or no ordinary recipient is above a losing top stake, burn actual collection. There is no extra compensation to the accused. A separate merits charge may collect eligible mature emission; that does not make Emitter rights stake collateral.

**Debt** is the uncollected part of a losing stake or other applicable charge, not a payment or burn. Repay the oldest debt first from later mature emission, preserving the initial veto window. While the emission balance is negative, you cannot open invitations or guarantees and your acts earn no units for you or your guarantors. Valid own maturities still repair integrity. There is no debt ceiling, no catch-up credit and no Facety Treasury. Burned FCTY stay burned.

## Correcting a claim or verdict

Understand and accept the rules and check your own acts. You can cancel an eligible Self-ID within its first day or open a dispute against your own eligible transaction before someone else has disputed it. Others can defend the act. If upheld, author-first correction of a Self-ID reverses that act's economic effect and revokes its units; it is not a late unilateral veto. Filing priority, admission and funding still need exact rules.

If someone else challenges your Self-ID, filing fixes `N`, the count from the violating act through the last recorded act, including all those positions whether correct or not. Later acts do not add to it. If upheld, cut that suffix but keep all records, the preceding valid acts and the distinction between an act and a person's identity. Revoke units by each act's receipts and halve the losing author's integrity. The accused owes `N` FCTY toward the first accuser's award; each guarantor when the violating act was created separately owes `N` for burning, not to make up the award. Only actual collection pays or burns. No extra 7 FCTY identity charge applies. The [isolated one-act settlement](facety.protocol.en.md#collection-before-cut) collects the target's recoverable backing before cutting it under its stated conditions; it is not a general collection priority.

In a false identity case the accused owes 7 FCTY toward the first accuser's award, the invalid chain's units are revoked and the losing author's integrity is halved. Each guarantor who actually received credit from the subject's acts owes 7 FCTY for burning. A losing invitation halves the integrity of its creator and the responsible guarantors at issuance; its monetary remedy is open. A distinct violation needs its own case. Neither association nor an act error establishes that a person is fictitious.

A proven duplicate invalidates the second account and recovery reaches its holder. An unwitting inviter can be acquitted with a qualifying co-presence artifact jointly signed before invitation; authenticity and recognition still need rules. The cluster remedy combines scrutiny, a chance to prove reality, partial invalidation, liability and actual recovery. People wrongly cut off can appeal and receive fee-free repair of honest links. A broken path itself proves no violation.

An affected person can request an **appeal** of a closed case. A request takes no slot and starts no clock. A qualified participant with more XP than the prior accuser, or the Council collectively, must file against the prior accuser's opening. The prior accuser is now the accused. The filing holds their slot; after 24 hours the uncancelled appeal activates with a fresh Council electorate and a seven-day first round. The choices are confirm the verdict, reverse it and authorize restoration, or defer. Appeal finances remain open; neither a zero-cost filing nor a mandatory stake follows.

Execute an authorized reversal by restoring status and units revoked by that verdict to the original recipients, replaying integrity without that loss, and cancelling only the unpaid debt attributable to that verdict. For example, pay 5 on debts of 7 and then 7: reversing the first leaves the second at 7 and does not refund the earlier 5. Keep other losses, later repairs, other cases and holds, and all prior burns. Status alone is not restoration. No catch-up issuance, refund of transferred money or duplicate credit after key recovery is assumed; admission, execution, refunds and migration still need rules.

## Changing rules and outside support

Network referendums can change the slot ceiling and path bound. Your ballot weight is your XP, not your FCTY. A vote on slots pauses nothing. Atmo has a separate mandate over the ceiling and whether new invitations, emission and openings are enabled (all three enabled by default); the execution and effects of pauses on commitments and existing cases still need rules.

Atmo may release capital from **Bucket D** into **Treasury D** under its own policy. Treasury D uses an authorized budget to buy existing market FCTY and burn it. This is not an internal dispute fund, an identity verdict or a price guarantee. It can pause without changing the protocol's identity and dispute rights.
