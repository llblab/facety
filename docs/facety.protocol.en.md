---
title: "Facety — Manifesto and Protocol Specification"
subtitle: "Human identity, social responsibility, procedural authority, and the economic growth of Atmo"
version: "living specification (maintained in the facety repository; history in git and Appendix A)"
date: "2026-10-23"
language: "English"
status: "Proposed protocol; not a claim of a shipped implementation or proven Sybil resistance"
source_basis: "Protocol owner decisions recorded in this repository, checked against the Facety simulator (docs/insights.en.md)"
---

# Facety: Manifesto and Protocol Specification

> **Facety's strategic thesis is an accountability substrate for emission distribution and network growth—not merely a dispute protocol.** It coordinates mutual identification through mutual guarantees and public accountability to ask: “Who are we actually dealing with?” The aim is distribution resistant to farming that sustains honest participation and useful network effects. This is a deliberate evaluation lens, not demonstrated sustainability. Repeated identity assertions, earned non-transferable XP, economic consequences and collective disputes support that coordination; none alone defines it. XP rewards responsibility, not truth or purchasable voting weight. Anyone may discover evidence, while qualified participants accept formal challenge responsibility. Whether these routes keep earned influence correctable is the research question—not a promised outcome. Atmo support is a separate conditional integration.

**[DIRECTION — D31, documented 2026-10-23; owner-provided framing]** “Mutual” describes the social architecture. Both parties consent to a directed guarantee; that consent does not create a reverse guarantee. Guarantees, invitation lineage, acquaintance channels and reachability evidence have different meanings. A path never proves unique personhood.

## How to read this document

This document is both a **manifesto** and a **technical design specification**. The manifesto explains the purpose and incentives. The specification defines the intended mechanisms and identifies the rules that still need exact parameters.

This is a **living specification**. It is maintained together with the Facety simulator in one repository; there are no numbered editions. Git history and [Appendix A](#appendix-a-decision-log-and-supersession-ledger) record what changed and when. **Later explicit decisions take precedence over earlier text.** The [simulator contract](simulator.en.md#protocol-coverage) maps each implemented mechanic to its section here, and research findings are kept in the [insight register](insights.en.md).

The current time model uses **one-day windows**: a Self-ID emission is contestable for 24 hours before it can be spent or withdrawn, and an invitation is contestable for 24 hours before it can be applied. The **28-day period remains** the window for counting active subjects.

Use the following labels:

- **[SELECTED]** — An explicit protocol decision made in the design discussion. It remains subject to implementation and security testing.
- **[DIRECTION]** — An agreed objective or behavior without a complete transition contract.
- **[REFERENCE]** — A proposed implementation that can realize the selected behavior. It is not yet a selected requirement.
- **[OPEN]** — A choice that the protocol must settle before production.
- **[HYPOTHESIS]** — An economic or social prediction that needs simulation or evidence.
- **[MODEL FINDING]** — A result of the Facety simulator under declared assumptions, with a link to its study. It informs design; it is not real-world evidence and does not by itself select a rule.

**MUST** describes an intended protocol invariant. It does not claim that the existing DEOS runtime implements the rule. This text follows many principles of Simplified Technical English: defined terms, direct sentences, and explicit conditions. It has **not** passed a formal ASD-STE100 vocabulary audit.

## Document map

- [Part I — Manifesto](#part-i-manifesto): the problem, incentives, social responsibility, and the Atmo network effect.
- [Part II — System and Data Model](#part-ii-system-and-data-model): actors, assets, graph types, and subject identity.
- [Part III — Identity Evidence and Self-ID](#part-iii-identity-evidence-and-self-id): media artifacts, deterministic FaceRef, group Self-ID, and Emitter rights.
- [Part IV — Invitations, Guarantees, and Graph Responsibility](#part-iv-invitations-guarantees-and-graph-responsibility): social admission, payments, and two kinds of liability.
- [Part V — XP, Public Disputes, and the Council](#part-v-xp-public-disputes-and-the-council): earned authority, halving, Chekharda, and the historical top-101 route, refined by D33.
- [Part VI — FACY Economics and Atmo Integration](#part-vi-facy-economics-and-atmo-integration): deflation, debt, and Bucket D buyback-and-burn.
- [Part VII — Reference Implementation Contracts](#part-vii-reference-implementation-contracts): state records, example transitions, and protocol invariants.
- [Part VIII — Threat Model, Research, and Delivery](#part-viii-threat-model-research-and-delivery): adversarial tests, unresolved policies, and development sequence.
- [Part IX — Condensed Protocol Constitution](#part-ix-condensed-protocol-constitution): the rules and final thesis.
- [Part X — Network Difficulty and Topology Safeguards](#part-x-network-difficulty-and-topology-safeguards-d33): D33's invitation thresholds, dynamic consuls, independent support, cluster quotas, privacy and explicit conflicts.
- [Appendix A — Decision log and supersession ledger](#appendix-a-decision-log-and-supersession-ledger): dated decisions and what they replaced.
- [Appendix B — Sources and confidence](#appendix-b-sources-and-confidence): scope and evidence limits.

## An evidence-to-correction example

An outside observer notices an inconsistency in a public identity assertion by an influential participant. The observer identifies the event and supporting observations without claiming that an allegation proves guilt. A qualified sponsor independently checks the package, may request clarification or refuse it, and accepts the work, stake and public responsibility of a formal challenge. The ordinary gate still requires more XP than the transaction owner. If that route cannot reach an apex participant, the intended collective Council route matters; its referral and merits details remain OPEN.

The accused can answer with evidence. A specified dispute procedure records a reasoned outcome, followed by only the consequences it authorizes: a chain cut, actual collectible losses and debt separately, XP changes, and independently chosen relationship withdrawal. A rejected accusation can instead cost its challenger. Revoking XP does not silently reverse decisions already executed. Other people may then learn from the public reasons; precedent mechanics are a proposal, not a selected court engine.

**Implementation boundary:** `FacetyModel` implements the economic/XP/relationship transitions. The simulator has noisy one-step, instant-ladder and timed-ladder dispute abstractions, not a complete human court. At the 2026-10-23 audit baseline it had no explicit external evidence-package/sponsorship lifecycle. The bounded [causal reference](research.en.md#executable-causal-core) now exercises costed outsider discovery, independent supplied sponsor review, the existing one-step gate/consequences, refusal and false allegations. It does not implement voluntary self-reporting, reasoned Council merits, compensation or institutional learning. [Coverage](simulator.en.md#protocol-coverage) tracks subsequent changes; this example distinguishes intended routes from executable facts.

The final trust boundary is human collective judgment. Equal votes limit individual dominance but do not guarantee independent interests or honest decisions. The objective can be useful self-government with bounded fraud, provided safety, capacity, authority and recoverability remain acceptable—not perfect Sybil resistance, nor acceptance of any fraud level merely because people can disagree. See the [research criteria](research.en.md#survivability-vector-and-stage-clocks).

## Protocol at a glance

| Event | Human and economic rule |
| --- | --- |
| Self-ID | One signed identity assertion tied to one artifact and one deterministic face index. It proves control of the subject key and claims fresh presence. A valid act creates a one-unit FACY emission right; when the right is spent or withdrawn without cancellation, the subject and each of its guarantors gain 1 XP. |
| First 24 hours | The holder cannot use the emission. An authorized guarantor may cancel the Self-ID for free while the emission exists. |
| From 24 hours | The owner can spend the unspent right on an invitation or convert it to fungible FACY on the Collector. An unspent right remains cancellable. |
| Invitation | Burn one personally earned eligible emission; under D33 the creator also needs `D = decimal_digits(max(1, N_verified))` effective independent guarantors. The invitation stays frozen for 24 hours, during which the creator's guarantors can cancel it. |
| Liability | A proven false identity voids its whole Self-ID chain. Its inviter, its guarantors and the inviter's guarantors who stayed linked each owe one coin per voided act. Guarantors escape by cancelling the frozen invitation or leaving the relation in time. |
| Guarantee | Both subjects must authorize the directed responsibility link. Either can end it under a separate 1 FACY fee rule. |
| Dispute | Eligible challenger XP exceeds transaction-owner XP. Each later Chekharda position needs more XP and stakes a fixed percentage more (10–20%); each winner takes the stake of the position directly below it. |
| XP penalty | A liable loss can halve effective XP; monetary penalties can create collectible debt. |
| Council | D33 selects a difficulty-based target `1, 11, 101, 1001, 10001, 100001`, capped by active verified/eligible participants; target 1 is no formal Council. Each formal consul has one vote. The old fixed-101 design is preserved below as superseded context. |
| Atmo | Bucket D activates under policy, releases capital to Treasury D, and can buy and burn FACY under bounded rules. |

---

# Part I: Manifesto

## 1. A network of people, not a collection of accounts

Digital systems can create accounts at almost no cost. Accounts do not prove that distinct human beings control them. The difference matters for governance, distribution, trust, communication, and economic coordination.

Facety starts with a narrower claim: a subject represents one real, unique person. The subject can repeatedly make a signed claim about its continued presence. Other people can accept responsibility for that claim.

Facety does not make a photograph equivalent to proof of unique personhood. A media artifact, a signature, a social guarantee, and a resolved dispute supply different kinds of evidence. The protocol combines these elements. None is sufficient in isolation.

The objective is not a global moral score. Facety does **not** certify political views, wealth, social worth, or virtue. A guarantee concerns the identity claim and the responsibilities explicitly attached to it.

### Accountability for emission and growth (D32)

**[DIRECTION — D32, documented 2026-10-23; owner-provided strategic framing]** Emission should serve retention, contributor recruitment and network effects, not be evaluated as a standalone reward. Claims, evidence, sponsorships, disputes, stakes and verdicts should make responsibility traceable and contestable. Eligible participants may earn personal Self-ID emission while also accepting guarantee liability or staking in disputes; these roles do not establish personhood, buy XP or introduce proof-of-stake consensus.

**[HYPOTHESIS]** The intended flywheel is:

```text
emission → honest retention / contributor growth → more accountable participation
         → better evidence about identity and contribution → more defensible distribution
         → sustained useful participation
```

Every behavioral arrow needs evidence. The inverse can also reinforce itself: farmed emission finances more controlled activity and collusive support; accumulated procedural influence obstructs correction; wrongful sanctions or exclusion drive honest people out; weaker independent review permits further farming. FACY does not directly purchase XP, and public traces do not establish evidence validity.

**Three distinct layers:**

- **Uniqueness / Sybil resistance:** Facety supplies repeated identity claims, guarantees and contest mechanisms. Signatures establish key control and paths establish reachability; neither proves one unique human. Evidence accuracy and real-world Sybil resistance remain open.
- **Contribution / reputation:** Self-ID and guarantee XP record specified work and responsibility, not universal useful contribution. Identity credibility, adjudication history and application contribution need distinct, scoped verification. A unique person is not necessarily a useful contributor; low measured activity or disagreement is not an identity offense.
- **Emission / distribution:** Native accounting implements emission rights and their authorized consequences. The selected Self-ID rule creates one unit per eligible act, not a general contribution-proportional allocation. Sustainable retention, market value and farming resistance are not established. “Distribution proportional to verified contribution” is a conditional objective requiring an explicit contribution metric and verification model, not a description of current rewards.

**Required safeguards:**

- **Uniqueness layer:** Specify evidence provenance, freshness, impersonation/duplicate controls and false-accept/false-reject limits. Oracle/evidence validity is an unresolved trust boundary; traceability is not truth.
- **Contribution metric:** Define what work or application benefit counts, who verifies it and how attribution can be contested. Test collusion and metric gaming; do not collapse XP, reputation and usefulness into a single score or classify people as intrinsically “low-value.”
- **Anti-farming economics:** Under declared valuations, resources and horizon, compare realizable attack gains—including emission and indirect capture benefits—with fabrication/control costs and expected actually collected losses. Require honest participation to remain worthwhile too. Refundable stake principal is not a loss, debt is not realized collection, and a nominal fine is not deterrence. The cost-of-attack condition is necessary for the economic thesis, not a sufficient security proof.
- **Bootstrap plan:** State initial admission/evidence assumptions, financing, concentration limits and how early decision-makers remain correctable. Bootstrap vulnerability cannot be hidden behind a permanently honest founding group; earned early advantage is not immunity.
- **Arbitration trust model:** Name admissibility, independent review capacity, conflicts, recusal, quorum, appeal/repair and actual enforcement assumptions. Arbitration capture and correlated error can turn accountable-looking records into protection for a collusive farm. OPEN procedures remain OPEN; no new court or rule is selected here.

**Success or failure:** this framing succeeds only if credible identity/contribution evidence and affordable correction make honest useful participation persist while bounding farming, collusion and wrongful exclusion across bootstrap, scale and neglect. It fails if emission mainly subsidizes extraction, capture or review overload—or if retention depends only on assumed token prices/subsidies rather than demonstrated usefulness. Increasing accounts, XP, rewards or recorded disputes alone supports neither conclusion. [The research program](research.en.md#strategic-evaluation-lens-d32) specifies the evaluation boundary, not proof that the flywheel operates.

## 2. Social growth must also produce responsibility

Facety is designed to spread through people who know other people. A person cannot join through an anonymous market purchase alone. A new subject needs an invitation and qualifying social guarantees.

A participant gains FACY from personal Self-ID work. A participant gains XP both from personal Self-ID work and from successful Self-ID work by people it guarantees. **[DIRECTION, clarified 2026-10-23]** Guarantee-derived XP compensates network-building work and exposure to liability instead of relying solely on unpaid enthusiasm. Unequal earned influence is intentional; removing these credits merely to equalize influence would remove part of the incentive.

That wider network also creates exposure. The guarantor can become responsible for false identity claims and for failing to prevent invalid Self-ID acts within the defined rules.

The intended result is a feedback loop:

```text
real people -> guarantees -> repeated Self-ID
    -> FACY + XP -> more eligible invitations and connections
    -> more public responsibility -> stronger incentives to detect abuse
    -> a more useful and credible network of people
```

**[HYPOTHESIS]** If honest participation remains easier and more profitable than fraud, a trusted early community can accumulate a durable advantage over later Sybil operations. This is a design thesis, not a security proof.

## 3. Time is part of the security model

Money can move instantly. A credible history of human work cannot be bought instantly under the selected rules.

Facety deliberately combines different time scales:

- **24 hours:** the minimum interval between rewarded Self-ID acts by the same subject.
- **24 hours:** the allowed period to reference a newly registered shared artifact, measured from its on-chain registration time.
- **24 hours:** the contest window of a Self-ID emission. Afterwards an unspent emission can be spent on an invitation or converted to Collector FACY.
- **24 hours:** the freeze of a new invitation, during which the creator's guarantors can cancel it before the invitee is admitted.
- **28 days:** the rolling window used to count active subjects for the dynamic invitation threshold and for Council eligibility.
- **Months and years:** the accumulation of XP, social ties, public decisions, and responsibility.

These periods serve different functions. They MUST NOT be conflated.

**[SELECTED, 2026-10-22]** All contest windows are one day. A day is an understandable unit, long delays discourage people, and one day still gives guarantors time to stop a violating transaction. Two separate days apply: one to contest the emission (the Self-ID transaction that earns the coin) and one to contest its spending (the invitation transaction).

**[MODEL FINDING]** With one-day windows the simulated system stayed viable: fraud earned no premium over honest play, and honest people kept most of their fraud-free value. Fast payouts make an unchecked farm grow quickly, so vigilance pays. One-day windows assume that guarantors look at their people's new activity daily, for example through notifications. See the [social-trust study](../studies/2026-10-22-social-trust-threshold/README.md), section 6.

## 4. Reputation is valuable because it can be lost

XP is not a token. It is a non-transferable measure of identity work and **procedural authority**. A person can use XP to qualify for disputes. A leaderboard makes accumulated XP visible.

Long-term participation may create a large amount of XP. **[HYPOTHESIS]** That history may create social credibility and greater exposure when someone takes a false position; high XP does not define someone as informed, honest or long-term-oriented. Identity credibility, guarantee reliability, adjudication history, social recognition and protocol XP are distinct. A newcomer can have decisive evidence, and a respected investigator can be wrong. Reputation can be correlated, mistaken or manipulated.

A liable loser of a dispute can lose **50% of effective XP**. Repeated losses can halve effective XP again. The loss can remove access to future dispute opportunities and can remove a person from the Council of 101.

**[HYPOTHESIS]** A participant with substantial legitimate XP, public history, and a large honest social network often has more to lose from deliberate fraud than from refusing it. This incentive is not universal. Collusion, indifference, coercion, and mistaken judgments remain possible.

## 5. Responsibility includes the right to prevent errors

Guarantors must not bear responsibility for another person's identity acts without a way to stop harmful acts before their economic rights are consumed.

An eligible guarantor can cancel a specific, unspent Self-ID emission without paying a fee. The cancellation destroys that emission right and its backing FACY under the selected monetary representation.

This is preventive accountability. It is separate from a later dispute that establishes liability and applies penalties.

A guarantor can keep a long-term relationship with a real person while rejecting one invalid Self-ID from that person. A person can also unilaterally break an established guarantee link if the guarantor abuses cancellation power. The established-link break has its own **1 FACY fee**.

The protocol should make it easier to correct an error than to hide it.

## 6. Important disputes earn public attention

Facety uses **Leapfrog / Chekharda (Чехарда)**. A participant with more effective XP than the transaction owner can challenge an eligible transaction. Another participant can take the opposite side only by exceeding the XP of the preceding participant. Monetary stakes rise with escalation.

Small disputes can end near the people who know the evidence. Large disputes can attract people with significant public social capital. The visibility of a dispute rises with the XP and money placed at risk.

The highest 101 XP holders form a Council. They each get one vote, regardless of their different XP totals. The Council may choose to intervene in any dispute. It need not intervene in ordinary local conflicts.

Facety does not need an infinite sequence of higher courts. It accepts a final social assumption: if its most respected participants collectively abuse their position, the network can lose legitimacy. Publicly corrupt Council behavior is comparable, as a **trust failure**, to a monetary network abandoning a rule that made it credible. Loss of legitimacy is not a guaranteed method of repair.

## 7. Meetings can create stronger shared evidence

A group can register one media artifact. Each person shown can sign a separate Self-ID that references the same artifact and selects its own detected face.

The same artifact can thus produce multiple independent emission rights. The shared hash and separate signatures create mutually inspectable claims of co-presence. They encourage real meetings and joint identity work.

This is not biometric identification by the runtime. The software deterministically addresses a face region. People and the dispute protocol remain responsible for the truth of the corresponding human claim.

## 8. Atmo supports a human network, not merely a token price

DEOS supplies economic execution. Atmo is a network that uses DEOS. Facety is an application and a human-trust layer within Atmo. FACY is the Facety fungible token. XP is its independent measure of procedural authority.

The Atmo instance assigns **Bucket D** to a demand-generation policy. Bucket D is dormant until approved activation. Released capital enters **Treasury D**. Treasury D can buy FACY on the market and burn the acquired tokens.

```text
Bucket D (Dormant)
    -> approved Demand activation
    -> capital release
    -> Treasury D
    -> controlled FACY market purchase
    -> actual FACY burn
```

This is a controlled interface between two economies, not a redemption promise. Atmo does not buy individual identity claims. It influences aggregate FACY demand while Facety keeps its own admission, identity, XP, and dispute rules.

If the Facety trust graph has serious Sybil problems, Atmo can slow or pause buyback. If the network recovers, the approved policy can restore the flow. This makes Bucket D an **economic isolation and coupling mechanism**, similar to an isolation transformer: the systems exchange effects without merging their internal control planes.

The deeper marketing idea is that Atmo does not merely purchase attention. It helps create a reusable human coordination network. The network can grow through invitations, continued Self-ID, responsibility, and the applications that use its identity evidence.

## 9. The intended social equilibrium

Facety aims to create conditions in which:

1. Honest entry is feasible through real social relationships.
2. False entry requires time, controlled subjects, eligible earned emissions, and responsible guarantors.
3. Honest participation earns FACY and XP.
4. Dishonest participation risks money, XP, access, social links, and future earnings.
5. Guarantors can prevent local damage before a reward becomes freely liquid.
6. Participants can challenge suspicious actions outside their own guarantee network.
7. Important conflicts attract more scrutiny as reputational capital increases.
8. The economy can reduce its external support during systemic trust failures.

**Facety's ultimate ambition is an open, self-expanding, self-policing network of human identity claims.** The ambition requires a mechanism that survives adversarial incentives. The existence of public rules alone does not establish that outcome.

**[DIRECTION] A public, accountable market.** Anonymous cryptocurrencies hide who is connected to whom. Facety deliberately does the opposite, without zero-knowledge layers. Identity acts, guarantees, invitations, money flows and disputes are public, and the chain remembers them. This transparency is the defense: graph analysis, lineage tracing and flow tracing work only because everything is visible, and a guarantee bought from a real person stays on record as that person's liability. It is also a risk. Public faces, social graphs and money flows together can enable harassment, coercion of guarantors and targeting of visible wealth (see [§39](#39-public-evidence-and-personal-safety)). Design work must decide what must be public for accountability and what can stay private.

**D33 privacy refinement, 2026-10-23:** §46.11 permits privacy-preserving proofs to external applications, including optional ZK, while retaining accountable internal evidence. This explicitly narrows the earlier no-ZK direction; it does not silently privatize the base ledger.

**[DIRECTION] Who earns what.** Facety is a distribution mechanism for emission that rewards the network effect. An ordinary participant earns a modest, steady income from daily presence. People who invest effort over a long time — guaranteeing, inviting, checking and resolving disputes — accumulate XP and receive large returns from the network. The design goal is that the most committed rule-followers hold the most XP.

**[HYPOTHESIS, 2026-10-22; scope clarified 2026-10-23] The honest network effect prevails.** The owner's hypothesis is that acquaintance, repeated cooperation and information propagation can give an honest community an advantage. A denser honest graph and roughly quadratic efficiency were predictions, not runtime formulas or established facts. Both genuine and adversarial communities can be dense and exploit the same rewards and gossip. Useful service value, population growth, arithmetic XP scaling and demonstrated manipulation resistance must be measured separately.

**[DIRECTION, 2026-10-22; clarified 2026-10-23] A bounded fraud budget.** Perfect detection is not required. The owner's 80% honest / 20% undetected-fake coin example illustrates tolerable bounded harm; it is not a calibrated acceptance threshold or proof of usefulness. Conditions must include:

- **Authority and actual action:** XP contamination, procedural gates, Council seats, voting independence and demonstrated obstruction separately. A small XP change can cross a decisive gate; a seat share alone is not a wrongful verdict.
- **Trend and correction:** stable monetary harm, genuine participation, case capacity and remaining ability to correct after neglect. Recalculation or a flat fraud share alone does not establish resilience.
- **Outside support:** Treasury D can benefit undetected fakes as well as genuine participants. Its health estimates, funding and pause/restart effects require a separate conditional model.

**[MODEL FINDING, exploratory]** Some retained finite-menu games had equilibria in which fraud earned no premium over the rule-following reference while honest people paid a policing cost. This depends on the declared valuation, strategy menu, accuracy, costs and horizon; zero premium partly follows from indifference when the reference is in equilibrium support. It is not an unrestricted equilibrium or a real-world fraud estimate. See the [insight register](insights.en.md).

---

# Part II: System and Data Model

## 10. System boundaries

| Layer | Scope | Does not own |
| --- | --- | --- |
| **DEOS** | Reusable deterministic runtime architecture, economic primitives, assets, routing, Actors, governance, bounded execution. | Facety-specific human truth. |
| **TMCTOL** | Token Minting Curve and Treasury-Owned Liquidity. | Facety identity rules or its XP. |
| **Atmo Network** | Concrete DEOS instance, DOT-oriented reserve policy, Buckets, Treasuries, instance governance, and support for applications. | Individual Facety identity judgments. |
| **Facety** | Subjects, artifacts, Self-ID, invitations, guarantees, XP, disputes, liability, identity graph. | Direct discretionary access to Atmo capital. |
| **FACY** | Fungible economic asset used by the Facety economy. | Human identity or XP authority. |
| **XP** | Earned, non-transferable procedural authority and recorded identity work. | A transferable monetary claim. |

Facety is not required to run as a separate blockchain. The target is the Atmo runtime based on Substrate/Polkadot SDK and DEOS mechanisms. **DEOS Actors** are runtime execution infrastructure and are distinct from the separate pi-actors project.

No section of this document implies that a named Facety pallet, actor, API, or storage item is already shipped.

## 11. Canonical concepts

**Subject (`SubjectId`)** — A persistent on-chain identity intended to represent one real and unique person. A subject can have authorized keys, a history, current guarantees, XP, debt, and identity status.

**Identity key** — A cryptographic key associated with a subject. The signature on a transaction proves control of the signing key, not human uniqueness.

**Artifact (`ArtifactId`)** — A registered media object addressed by content hash or CID, with an on-chain registration time and a publication-rights assertion.

**Face reference (`FaceRef`)** — A stable reference to a detected face in an artifact. At minimum it includes artifact identity, detector version, and deterministic face index.

**Self-ID** — An immutable, individually addressable record of a subject's signed identity assertion, linked to a specific artifact and FaceRef. It has a mutable dispute state and a one-time emission right. It has **NFT-like semantics** but is not necessarily a transferable NFT-standard asset.

**Emitter** — The one-time emission-right state associated with a Self-ID. It defines whether the related FACY is restricted, available for network use, disputed, cancelled, consumed, or converted.

**Collector** — The ordinary fungible FACY balance or destination to which an eligible Emitter emission can be converted after 24 hours. The term is a protocol role, not necessarily a separate token or chain.

**Guarantor** — A subject that explicitly accepts responsibility for another subject's identity under an established guarantee relation.

**Guarantee relation** — A directed responsibility edge that requires matching transactions from both parties. A reciprocal guarantee is a separate relation.

**Invitation** — An entry authorization created by burning **1 FACY from the creator's own eligible Self-ID emission** and satisfying the dynamic guarantor threshold.

**Active subject** — A unique subject with a qualifying Self-ID during the previous 28 days. The exact treatment of disputed or cancelled acts is open.

**XP credit** — One unit of earned identity work, from an eligible personal Self-ID or a qualifying Self-ID by a guaranteed subject.

**Effective XP** — The current XP measure used to rank subjects and authorize participation in disputes after the penalty history is applied.

**Dispute** — A public challenge against an eligible protocol transaction, with positions, XP gates, monetary stakes, evidence, time rules, and a conclusion.

**Chekharda / Leapfrog** — A sequence of alternating dispute positions with strictly increasing participant XP and growing stakes.

**Council of 101** — The 101 highest-effective-XP subjects, with equal voting rights in Council proceedings.

**Trust cone** — A directed, time-ordered part of the invitation and guarantee graph that depends on one or more upstream identity claims or entry paths.

**Disconnected subject** — A subject that has lost an accepted trust path. It is not automatically an impostor.

**Emission debt** — A negative protocol obligation that reduces future eligible economic rewards. It is not a negative quantity of already issued circulating FACY.

## 12. Distinct graphs

Facety records several related structures. They MUST NOT be merged into one undifferentiated edge type.

| Graph | Edge meaning | Consequence |
| --- | --- | --- |
| **Invitation lineage** | Subject A invited subject B. | Entry provenance and possible upstream risk. |
| **Guarantee graph** | A explicitly guarantees B, with B's matching consent. | Assigned ongoing identity responsibility. |
| **Co-appearance graph** | A and B made signed claims that reference the same artifact. | Additional evidence of reported shared presence, but not a guarantee. |
| **Dispute graph** | Participants supported, challenged, or appealed recorded claims. | Public procedural history and liability. |

An edge in one graph MUST NOT automatically create an edge in another. For example, appearing in a group photo does not create a mutual guarantee.

## 13. Subject lifecycle and initial trust

**[SELECTED]** The network starts with a small group of trusted enthusiasts who know one another. This provides a practical initial foundation for real-person guarantees and gives early participants time to accumulate experience and responsibility capital.

**[OPEN]** The genesis set, activation requirements, initial invitation rights, and source of first guarantees are not fully specified. These require an explicit genesis or bounded bootstrap contract.

A subject may change authorized keys under a defined recovery procedure. Key rotation MUST NOT reset the subject's Self-ID rate limit, XP penalty history, debt, invitation lineage, or guarantee obligations.

Trust history survives account changes. A wallet address alone does not define personhood.

---

# Part III: Identity Evidence and Self-ID

## 14. Media artifacts and publication

### 14.1 Registration

**[SELECTED]** An initial publisher registers an artifact on-chain. Registration establishes at least:

```text
Artifact {
    artifact_id
    content_cid_or_hash
    registered_at
    publisher_subject_id
    publication_rights_assertion
    media_type
    canonicalization_profile
    detector_profile_version
}
```

The artifact bytes can be stored outside the runtime, for example through content-addressed storage. The chain anchors the reference, its registration time, and the public assertions. Runtime storage need not contain photos, videos, stereo data, or NeRF scenes.

A registered artifact can be reused for the Self-ID of multiple subjects. The reference window for new group Self-ID claims is **24 hours from on-chain registration**.

**Important evidence limit:** The registration timestamp proves when a reference entered the chain. It does **not** prove when a camera captured the scene. The protocol can deterministically enforce a 24-hour *registration age*. A stronger requirement about real capture time needs additional evidence and is **[OPEN]**.

### 14.2 The four assertions

An ordinary Self-ID contains three mandatory assertions and one conditional rights assertion:

1. **Key control:** I control the key that signs this Self-ID for my subject. The signature must verify.
2. **Genuine act:** I assert that this identity act is genuine and not deliberately fabricated.
3. **My image is present:** I assert that the selected face in the referenced artifact shows me.
4. **Publication rights and public-domain dedication:** I assert that I have the necessary rights to publish this artifact and dedicate the rights that I control to the public domain.

**[SELECTED]** The first publisher MUST make assertion 4, because the shared artifact must be available for public reference. Later participants who use that registered artifact make assertions 1–3. They MUST NOT claim authorship or rights that they do not possess.

**[OPEN / LEGAL INTERFACE]** A checkbox cannot automatically transfer rights that a publisher does not own. Copyright dedication, personality rights, consent by depicted persons, jurisdiction, and revocation limits need a defined legal and publishing mechanism. Public inspectability of the proof is not identical to a valid public-domain dedication.

### 14.3 Supported media

The design permits self-images, group images, short videos, stereo data, light-field captures, and NeRF-like artifacts. The standard economic reward does not increase with media complexity.

Each media class needs a deterministic method for addressing a person's image. A camera format is not itself a human-uniqueness proof. Liveness, provenance, edited imagery, synthetic media, and accessibility remain part of the verification and dispute model.

### 14.4 Media diversity and reuse

**[SELECTED, 2026-10-22]** A Self-ID proves control of the subject key (the signature) and claims fresh presence (the media). A group Self-ID is additionally a public act of co-presence.

- **No mandatory media type.** Participants choose the format. Group photos should be used whenever an occasion exists, such as holidays and meetings.
- **The same media cannot be reused.** A registered content hash may not be registered again, and a perceptual near-duplicate is a reason to dispute. Exact supplied-hash equality is cheap to check; perceptual equivalence and fabrication are not established by a hash.
- **[OPEN, documented 2026-10-23] Same-subject reuse of an existing artifact.** The inclusive 24-hour reference age and rolling reward interval meet at hour 24. The current legacy simulator can reward a second claim by the same subject on that artifact, including the same face. The broad no-reuse intention and legitimate multi-subject group-media use need this distinction made explicit. The simulator's `artifactReuse: "once-per-subject"` is a labeled stronger reference interpretation, not a newly selected rule. It rejects a subject's second use regardless of face, key rotation or prior cancellation without forbidding other people's shared-media claims.
- **[DIRECTION]** Optional varied formats (text, short video, group media) and small challenges derived from public randomness at the time of the act (for example, words to say or a code to show) can strengthen freshness without forcing a format. They raise the daily cost of fabricating a fake.

**[MODEL FINDING, exploratory]** The retained timed-dispute menu changed to abstention when the *assumed* `fakeSelfId` effort cost was ten times an honest act. That one-factor audit makes fabrication effort a high-value calibration target, not a measured primary barrier or a guarantee that large farms are exposed. Economies of production, correlated detection, camouflage and finite investigative capacity remain alternatives. See the original [assumption audit](../studies/2026-10-22-timed-chekharda/README.md#assumption-audit-assumption-auditjson), whose historical results are not rerun by this wording.

## 15. Deterministic face references

**[SELECTED / DIRECTION]** The application includes a reproducible face-localization algorithm. For the same canonical artifact and detector version, it finds the same face regions and assigns the same face indices.

The user sees outlined faces and selects the face that represents the user. The signed Self-ID contains a small index rather than a full face crop or biometric embedding.

```text
FaceRef = (
    artifact_id,
    detector_version,
    face_index
)
```

The algorithm identifies **where the claim points**. It does not assert the legal identity or uniqueness of the depicted person.

The following details are **[OPEN]** and require canonical definitions before using face indices as protocol identifiers:

- Exact media decoding and orientation rules.
- Resolution, scaling, and frame-selection rules for videos.
- The face-detection implementation, execution profile, and reproducible model weights if a model is used.
- Rounding, overlap filtering, tie-breaking, and ordering of detected regions.
- Version pinning and support for historical detector versions.
- Face references for stereo, light-field, or NeRF media.
- Behavior when no face is found, a face is partly hidden, or the detector output is disputed.

Cross-device reproducibility cannot be assumed solely from deterministic-looking user interface behavior.

## 16. Group Self-ID and shared presence

**[SELECTED]** Multiple subjects can create different Self-ID records that reference the same artifact within its 24-hour registration window.

Example:

```text
Artifact H registered at T
  Alice signs Self-ID A -> (H, detector_v1, face_index=0)
  Bob   signs Self-ID B -> (H, detector_v1, face_index=1)
  Carol signs Self-ID C -> (H, detector_v1, face_index=2)
```

Each valid Self-ID is independent. Each subject can earn its own standard **1 FACY** and **1 XP** under the normal frequency and cancellation rules. Each act can also give the subject's eligible guarantors XP.

The common artifact lets observers compare multiple independently signed claims about the same reported meeting. It can create stronger contextual evidence than three unrelated personal images. It does not prove that all participants were physically together: montage, generated media, mistaken claims, and collusion remain possible.

**[SELECTED]** If two subjects claim the **same** `FaceRef`, the runtime MUST NOT reject the second Self-ID solely for this conflict. It records both claims, identifies the collision, and exposes it publicly as a suspicious condition.

```text
Self-ID A -> FaceRef(H, v1, 2)
Self-ID B -> FaceRef(H, v1, 2)
    -> both claims recorded
    -> collision flagged
    -> guarantor cancellation or public dispute possible
```

A collision is a reason to examine evidence. It is not proof that the second claim is false merely because it was submitted later.

The runtime or an authorized index should support efficient lookup of other claims to the same `FaceRef` without scanning all historical acts.

## 17. Self-ID as an NFT-like claim with its own Emitter state

### 17.1 Identity claim, not a tradable NFT

**[DIRECTION]** Each Self-ID is a unique, individually addressable, non-transferable object with immutable evidence fields and a controlled state for its emission right. Calling it an *NFT-like Self-ID* describes uniqueness and one-time disposition. It does not imply that it must use an NFT marketplace or `pallet_nfts`.

The Emitter no longer needs to be a separate user wallet. Its logical account is a field or nested record inside the Self-ID.

```text
SelfId {
    id: SelfIdId,
    subject_id: SubjectId,
    artifact_id: ArtifactId,
    detector_version: DetectorVersion,
    face_index: FaceIndex,
    recorded_at: Timestamp,
    signer_key_ref: KeyReference,
    assertion_flags: Assertions,
    guarantor_authority: GuarantorSnapshotOrRule,
    emission: EmissionRight,
    dispute_status: DisputeStatus,
}
```

Stable historical fields remain available after the emission is consumed. A completed Self-ID is still relevant to XP, graph provenance, evidence inspection, and later misconduct disputes.

### 17.2 Economic right

**[SELECTED]** A normal rewarded Self-ID creates **one unit of FACY entitlement** attached to its individual Emitter. The entitlement is not a general transferable FACY balance.

**[REFERENCE]** One implementation mints 1 real fungible FACY into a common runtime-controlled Emitter vault when the Self-ID is accepted. The Self-ID stores the sole right to dispose of that unit. The Emitter vault is the custody layer, not a new freely transferable token.

Other accounting representations, including deferred minting, are possible. **[OPEN]** The final mint/custody implementation must be selected and must give correct meanings to invitation burn, cancellation burn, total issuance, and transfers to the Collector.

Under the reference minted-escrow implementation:

```text
Self-ID accepted:
    mint 1 FACY to common Emitter vault
    Self-ID.emission = Unspent

Valid guarantor cancellation:
    burn its 1 FACY from the Emitter vault
    Self-ID.emission = Cancelled

Invite creation after 24 hours:
    burn its 1 FACY from the Emitter vault
    Self-ID.emission = UsedForInvitation

Collector conversion after 24 hours:
    transfer its 1 FACY from the Emitter vault to Collector
    Self-ID.emission = Converted
```

A guarantee commitment is also a permitted network operation after 24 hours. **[OPEN]** Whether it consumes, holds, or releases its source emission must be specified. Do not silently treat all guarantee commitments as burns.

### 17.3 The one-day schedule

**[SELECTED, 2026-10-22]** Let `age = chain_time - SelfId.recorded_at`. This replaces the earlier 3-day / 7-day schedule.

| Age | Ordinary transfer | Network use from Emitter | Free guarantor cancellation |
| --- | --- | --- | --- |
| `0 <= age < 24 hours` | No | No | Yes, while unspent. |
| `age >= 24 hours` | Yes, by first converting the unspent emission to Collector. | Invitation and defined guarantee operations. | **Yes**, while the emission remains unspent on Emitter. |
| After consumption or Collector conversion | The particular emission is no longer on Emitter. | Cannot spend that emission again. | Cannot cancel that original emission through the free Emitter-veto mechanism. |

Reaching 24 hours does **not** make an automatic transfer. The holder chooses an authorized operation. A participant can leave an unspent emission on Emitter, and a guarantor can still cancel it while it remains there.

**[SELECTED]** *Network use* is a special, constrained Emitter operation. It is not ordinary spending and cannot be used for an arbitrary transfer or market sale. The FACY unit enters normal fungible circulation only by an authorized Collector conversion.

**[SELECTED, 2026-10-22] Debt recovery keeps the veto window.** For a subject with debt, a new Self-ID right is reserved for repayment. It stays cancellable during its 24-hour window and then burns to repay one unit of debt. Burning it immediately would deny guarantors their veto and make a debtor's XP final sooner than anyone else's.

**[SELECTED]** Once an emission is lawfully consumed for an invitation or an irrevocable guarantee operation, or converted to Collector, its original free cancellation window ends. A later dispute against misconduct remains possible under its own rules. It must not retroactively burn a token that no longer exists on Emitter.

### 17.4 Dispute freeze

**[SELECTED]** If an eligible dispute targets a Self-ID, its emission becomes frozen for the duration of that dispute. The owner cannot use it for invitations, guarantee operations, or Collector conversion until the dispute is resolved.

A freeze MUST preserve the original emission disposition and history. It is a procedural lock, not a second economic right. If a guarantor cancellation is also attempted while the act is disputed, the runtime needs a defined precedence and termination rule **[OPEN]**.

### 17.5 Reward and rate limit

**[SELECTED]** A subject can receive at most one normal rewarded Self-ID per rolling 24 hours, regardless of key rotation. A valid act provides:

| Recipient | Reward |
| --- | --- |
| Subject that created the Self-ID | 1 FACY on the Self-ID Emitter. |
| Same subject | 1 XP credit. |
| Each eligible guarantor for that act | 1 XP credit. |

Guarantors receive XP, not an automatic FACY mint, for that act.

**[SELECTED, 2026-10-22]** XP is credited at the terminal disposition, not at acceptance. When the emission is spent (invitation, debt repayment) or withdrawn to Collector without having been cancelled, the subject gains 1 XP and **each guarantor that was eligible when the Self-ID was recorded** gains 1 XP. A cancelled Self-ID credits no XP. XP is therefore never earned by an act that could still be vetoed.

### 17.6 Emission finality is not immunity

Cancellation, conversion, and subsequent punishment are different operations:

- **Preventive cancellation** invalidates an unspent Self-ID emission and burns the associated Emitter FACY under the minted-escrow representation.
- **Collector conversion** makes the economic unit transferable and ends this preventive cancellation route.
- **Network use** irreversibly consumes the emission instead of converting it.
- **Later dispute** can still establish an identity violation and apply defined financial and XP penalties. It cannot simply pretend that a spent emission remained available to burn.

The system MUST record a terminal emission disposition exactly once.

---
# Part IV: Invitations, Guarantees, and Graph Responsibility

## 18. Admission through invitation

### 18.1 Invitation conditions

**[SELECTED]** An invitation is not free and cannot be mass-produced by buying FACY on the open market.

The creator MUST:

1. Have a valid Facety subject with the right to create invitations.
2. Have the required dynamic number of valid guarantors.
3. Control **one unspent Self-ID emission earned by that subject**, aged at least 24 hours.
4. Burn the **1 FACY** corresponding to that emission as part of creating the invitation.
5. Record an invitation that can be traced to the creator and its authorization.

A FACY unit bought, gifted, received from a transfer, or received from another subject's Self-ID does **not** provide invitation eligibility. A unit already converted to normal circulating FACY on the Collector does not regain Self-ID provenance through a market purchase.

The restriction applies to the **origin of the emission right**, not merely the current wallet balance.

### 18.2 Dynamic guarantor threshold

**D33 update, 2026-10-23:** [§46.1–§46.3](#461-network-difficulty) names this decimal threshold **Network Difficulty**, clamps the numeric zero case, selects active **verified** participants as the intended count, and requires effective independent support rather than raw edges. The earlier `N28` description below is preserved as the pre-D33 rule and simulator reference; verification, bootstrap and hysteresis transition details remain explicitly OPEN. No fixed minimum of two or more is selected.

Let `N28(t)` be the count of **distinct active subjects** with qualifying Self-ID during the rolling 28-day window before time `t`.

For `N28 >= 1`:

```text
required_guarantors(N28) = decimal_digit_count(N28)
```

| Active subjects in last 28 days | Minimum qualifying guarantors for an invitation creator |
| ---: | ---: |
| 1–9 | 1 |
| 10–99 | 2 |
| 100–999 | 3 |
| 1,000–9,999 | 4 |
| 10,000–99,999 | 5 |
| 100,000–999,999 | 6 |
| 1,000,000–9,999,999 | 7 |
| 10,000,000–99,999,999 | 8 |

The dynamic threshold applies to **the subject that creates invitations**. It must not be silently restated as a requirement that the recipient already has that number of guarantors.

**[OPEN]** Bootstrap behavior when `N28 = 0`, treatment of disputed acts, qualification of an active subject, and qualification of an eligible guarantor require exact rules. The runtime should count subjects, not the number of Self-ID records. A single person who self-identifies 20 times inside 28 days contributes no more than one active subject.

The threshold can go down when the active population declines. This can aid recovery, but it also lowers an admission defense. The tradeoff must be tested.

### 18.3 Economic effect

An invitation destroys one **existing** personally earned FACY unit under the minted-escrow reference design. It also consumes the underlying Self-ID emission right.

```text
own Self-ID -> Emitter emission
    -> at least 24 hours
    -> dynamic-guarantor check
    -> burn 1 personally earned FACY
    -> invitation recorded and frozen for 24 hours
    -> invitee admitted unless a guarantor of the creator cancelled it
```

The creator cannot sell the right on the market and later buy it back. Selling ordinary FACY can provide personal liquidity; keeping an Emitter emission makes it available for direct network expansion.

**[HYPOTHESIS]** This creates a tradeoff between personal liquidity and expansion of a responsibility-bearing social network.

### 18.4 Invitations are accountable, not anonymous coupons

An invitation must retain its creator, timestamp, intended scope, and later use. The creator's responsibility does not disappear if the invite reaches an undesirable subject.

**[OPEN]** Target binding, invite expiration, acceptance, whether an invitation can be transferred, and remedies for traded or coerced invitations need explicit definitions. The protocol must not accidentally turn personally earned invite rights into freely tradable bearer coupons.

### 18.5 Invitation freeze

**[SELECTED, 2026-10-22]** A new invitation is frozen for 24 hours before the invitee can be admitted. During the freeze, any current guarantor of the creator can cancel it. The burned emission stays burned, and any XP credited by its consumption is revoked. The freeze is what makes guarantors responsible for whom their people invite: a guarantor who sees invitations going to people who do not look real is expected to cancel them and, if needed, leave the relation.

**[MODEL FINDING]** Liability for an inviter's guarantors helps only if they can see and cancel the invitation. Without a freeze, the simulated honest community preferred not to expose fakes, because exposure fined honest friends of a real cheater. With a reviewable freeze, the fraud premium fell from about 190 to single digits. See the [social-trust study](../studies/2026-10-22-social-trust-threshold/README.md), sections 4–5.

## 19. Two-sided guarantee establishment

### 19.1 Both parties must agree

**[SELECTED]** A guarantee edge requires **two matching protocol transactions**, one from each participating subject. One person cannot create an active guarantee merely by naming another person.

For a directed guarantee `A guarantees B`:

```text
A: proposes responsibility for B
B: confirms that same proposed relation
    -> check identities, authority, source operations and validity
    -> activate directed A -> B guarantee
```

The matching confirmation does not automatically produce `B guarantees A`. Reciprocity requires another explicitly authorized directed relation.

A guarantee makes a specific claim: A accepts the defined responsibility for B's asserted real and unique identity. It does not certify every future opinion or action by B.

### 19.2 Payment or commitment

**[SELECTED]** An eligible Self-ID emission can be used for a defined network-building guarantee operation after it reaches 24 hours of age. Such use is different from arbitrary FACY spending.

**[OPEN]** The amount required from each party, whether the value is burned, transferred as a fee, reserved as liability backing, or temporarily committed, and the return rules for unmatched proposals remain undecided.

The implementation MUST distinguish:

- **Proposal** — one party expresses intent; the counterparty has not matched it.
- **Matched authorization** — both parties have agreed to the same edge.
- **Active guarantee** — the protocol has applied the defined eligibility and economic transitions.
- **Ended guarantee** — one side has validly broken the established relation.

No design should assume that a guarantee automatically burns 1 FACY. The confirmed **1 FACY burn** applies to **invitations**, not to every form of guarantee commitment.

### 19.3 Unilateral link break

**[SELECTED]** Either party can unilaterally end an established guarantee relation under the protocol's rules. A normal established-link break incurs a **1 FACY fee**.

This is a **fee**. It is not automatically a burn. Its payer, recipient or destination, permitted source balance, and treatment of debt are **[OPEN]**.

An abusive guarantor may repeatedly cancel otherwise valid Self-ID records. The guaranteed subject can decide to end that relation. A guarantor can also withdraw from an unsustainable responsibility relation.

**[DIRECTION, 2026-10-22] XP follows the relation.** A guarantor that ends a relation loses the XP it earned through that person. Rights recorded while the relation existed no longer credit the departed guarantor. It is wrong to keep counting XP from someone one no longer vouches for.

**[DIRECTION] Exit as a duty.** If a guarantee's subject starts behaving suspiciously, for example by inviting people who do not look real, the rational and expected reaction is to cancel those invitations and break the relation as soon as possible. Liability for later sanctions follows the relations that still exist when the violation is adjudicated.

**[MODEL FINDING]** Leaving escapes liability but also removes a watcher. With weak detection, early exits let the coalition's later invitations go unreviewed.

The free cancellation of a particular Self-ID and the paid termination of an established guarantee are separate operations. Terminating the link must not retroactively erase its previous existence, public decisions, or established liability history.

## 20. Two independent kinds of responsibility

### 20.1 Identity-guarantee responsibility

The first duty concerns the underlying subject:

> I accept responsibility for my claim that this subject corresponds to the real and unique person it represents.

A false identity, an impersonation, a duplicate subject (*twin*), or an invented person can trigger a dispute about this duty. A guarantor who knowingly supports such a claim and a guarantor who was negligent can face different types of liability.

### 20.2 Specific Self-ID act responsibility

The second duty concerns a particular act:

> I have the ability to detect and prevent a suspect emission that my guaranteed subject created.

A real person can submit an invalid Self-ID by mistake or misconduct, such as selecting an animal image while asserting that it shows the person's own face.

**[SELECTED]** An authorized guarantor can cancel an eligible, unspent Self-ID for free. The cancellation prevents that act's emission from reaching a usable terminal state. It protects the responsible guarantors from **liability for failing to stop that specific act**.

This protection does **not** automatically clear liability for a separate false-person guarantee. A real person who made one erroneous Self-ID and a fabricated identity are different cases.

The cancellation also does not prove malicious intent. A later dispute establishes the type of misconduct and the correct consequences, if any.

### 20.3 Why prevention matters

This structure makes a guarantor more than a passive witness. The guarantor receives XP from a person's continued identity work, can inspect public evidence, and can stop a suspect act before its value leaves Emitter.

The guardian can correct a mistake without necessarily destroying a valid identity relationship. Conversely, the subject can break a harmful guarantee relation.

The intended incentive is that responsible participants teach one another to comply with the rules, rather than wait for a preventable violation to become an expensive dispute.

### 20.4 How trust forms

**[DIRECTION, 2026-10-22]** People do not vouch for anyone at random. Liability makes guarantees expensive, so a guarantee is given first to people one has known for a long time, and then to friends of friends. A request for a guarantee from a stranger is treated like spam: blocked by default. One may still vouch for someone one knows even if that person does not yet know the guarantor. Trust therefore flows through existing social clusters, and an honest network is a dense web of acquaintances.

**[MODEL FINDING]** Acquaintance-only guaranteeing, followed by a call or meeting before any veto or challenge, nearly eliminated wrongful invalidations. It also made paying honest strangers to vouch for fakes unprofitable, because the bribed guarantor carries the liability. See the [social-trust study](../studies/2026-10-22-social-trust-threshold/README.md).

### 20.5 Correction routes and early reporting

**[DIRECTION, documented 2026-10-23]** Correction can come through self-correction, a guarantor's intervention or withdrawal, evidence-backed challenge, Chekharda escalation, or collective Council action. The absence of an infallible algorithm is not the absence of a correction route. The owner's preference is that timely appropriate self-reporting provides a viable exit from a mistake without punishment for that appropriate early correction.

**[OPEN]** Eligibility, report deadlines, restitution, effects on others' existing liabilities and prevention of repeated profitable abuse need exact rules. This direction is not unlimited immunity. Preventive cancellation of one erroneous act by a real person does not clear a separate false-person guarantee. The simulator has preventive vetoes, but no selected voluntary-reporting policy.

## 21. Fraud classes and proof chains

**[SELECTED]** Serious identity offenses include:

- Pretending to be another person.
- Creating multiple subjects for the same real person.
- Inviting or guaranteeing people who do not exist.
- Making false identity claims or supporting fabricated identity evidence.

The dispute framework distinguishes at least two fault classes:

1. **Intentional fraud:** a participant knowingly makes or supports a false claim.
2. **Negligent responsibility:** a participant supports an invalid claim without knowledge of its falsity, but fails a defined duty of care.

A correct decision needs evidence of the underlying violation and a separate reason for assigning fault to each liable party. Liability can follow the recorded invitation and guarantee path as the policy defines.

**[DIRECTION]** Monetary sanctions can depend on the affected proof-chain length and can reach the transaction creator and its accountable guarantors. The exact chain-length function, maximum liability, responsibility scope, and allocation of a penalty are **[OPEN]**.

Responsibility must be recorded and verifiable. A claim that every connected subject is guilty is not an acceptable substitute for a liability rule.

### 21.1 Chain-cut sanction

**[DIRECTION, 2026-10-22]** A subject's Self-ID acts form a personal chain of confirmations, a small private ledger in which confirmations take the place of blocks. The goal is a chain made only of valid confirmations.

- If a dispute proves that step X was invalid and N steps followed it, the chain is cut from step X. The coins created illegitimately by those N steps are removed from the system, and the XP they credited is revoked from the subject and its guarantors.
- As a sanction, each liable party also pays N coins. The penalty spreads outward like a wave and grows with how deeply the violation is embedded in the chain.
- If the violation starts at the invitation (the subject never was a real, unique person), N is the number of acts the false subject performed. The fine falls on the inviter, who spent an invitation on a non-existent person, and on the inviter's guarantors, who vouched for a person registering fake people and did not cancel the frozen invitation. The false subject's own guarantors are liable as well.

Converted coins cannot be un-minted; recovering them is part of the fine. **[OPEN]** Caps, collection order from recoverable assets, partial cuts for real persons with an isolated invalid act, and treatment of guarantors who left before the violation was proven.

**[MODEL FINDING]** Sanction size is the decisive deterrence lever. A fixed fine of 5 let fraud pay, while chain-proportional fines (or a fine of 10) made the simulated network viable. See the [social-trust study](../studies/2026-10-22-social-trust-threshold/README.md), sections 3–4.

## 22. Disconnected cones and historical trust

If an important guarantor breaks a link, or an upstream inviter loses a dispute proving that the person is not real or unique, downstream invitation or guarantee paths may become invalid. A whole trust cone can become disconnected from the accepted network.

This is a meaningful attack surface: a malicious root can put a much larger dependent network at risk. It also gives honest participants an incentive to scrutinize critical upstream claims.

However, three questions remain distinct:

```text
identity_status:   accepted | questioned | false | other
trust_path_status: connected | under_review | disconnected
liability_status:  none | alleged | proven | settled
```

A subject that loses its only accepted trust path may be **real**. Its current proof chain is broken, not its physical existence. The runtime should check alternative valid trust paths before declaring disconnection.

**[OPEN]** Reconnection, re-verification, downstream freezes, recovery of innocent subjects, and whether loss of a path changes the right to create further invitations need explicit state transitions.

**[HYPOTHESIS]** A large fraudulent cone is more expensive to sustain because failure of accountable roots threatens more accrued capital. This must be compared with the possibility that threatened guarantors collude to conceal an upstream violation.

---

# Part V: XP, Public Disputes, and the Council

## 23. XP as earned procedural authority

**[SELECTED]** XP is non-transferable. A subject earns one XP credit from each qualifying personal Self-ID and one XP credit from each qualifying Self-ID by a subject it guarantees.

A person with many active, genuine guarantee relations can earn far more than one XP per day. This is intentional. The network rewards social expansion, continued observation, and responsibility. Equal XP distribution is **not** a design goal.

**[DIRECTION, clarified 2026-10-23]** Early builders intentionally receive an earned advantage for building before the network was attractive. This is not permanent immunity, inaccessible governance or an assumption that they stay honest forever. Non-transferability blocks direct purchase of XP by token accumulation; it does not automatically block bribery, coercion, account control, delegated influence or coordination among real people.

A public leaderboard ranks subjects by effective XP. High XP may provide access to disputes of higher procedural rank and an opportunity to receive dispute rewards. The quantity of XP is not a token balance and cannot be transferred, minted by FACY purchase, or delegated merely as a market asset.

A conceptual relation is:

```text
social standing ~ accumulated XP × demonstrated rule compliance
```

This is an **interpretation**, not a selected runtime formula. The protocol must not silently add a numerical reputation multiplier that changes dispute power without an explicit decision. **D33 (§46.6/§46.9)** explicitly adds topology-aware support and Council-ranking guidance, but leaves factor scales and the ranking/dispute-authority boundary OPEN; it does not select a universal trust score or change XP credit arithmetic.

## 24. XP losses and accounting

**[SELECTED]** A liable losing participant in a dispute can receive an XP halving. The effective XP after a penalty is half of its value before the penalty, under a defined integer rounding rule. Independent later penalties can halve the value again.

For example, absent later earnings:

```text
10,000 XP -> first loss -> 5,000 XP
 5,000 XP -> next loss  -> 2,500 XP
```

The penalty represents lost access and public reputation, not the transfer of XP to the winner.

**[OPEN]** The exact set of punished losing participants, treatment of liable guarantors, rounding rule, appeals, and the timing of future earned credits must be fixed. In particular, lifetime credits divided by `2^losses` is not equivalent to applying halving events in chronological order when new credits arrive between losses.

**[REFERENCE]** An ordered ledger of `XP_Credit` and `XP_Halving` events can preserve this distinction. Efficient snapshots may implement the same semantics.

The selected terminal-credit rule (§17.5) prevents still-cancellable Self-ID credits from becoming procedural XP. Earlier provisional-credit candidates are comparison policies only. Later adjudicated revocation replays XP without silently undoing executed decisions; appeal/finality remedies remain OPEN.

## 25. Right to challenge

**[SELECTED]** Any participant may challenge an eligible protocol transaction if it satisfies the XP gate. Examples include:

- Invitation creation and use.
- Self-ID issuance and the truth of a face claim.
- Guarantee formation and termination.
- Identity-related surety commitments, including loan-surety transactions where such an application uses Facety.
- Other transaction classes explicitly admitted by the protocol.

The ordinary direct challenge rule is:

```text
XP(challenger) > XP(transaction_owner)
```

A challenger supplies a monetary stake under the dispute policy and publicly states the challenged claim. The word **any** describes an open challenger population, not a right to bypass XP eligibility or the list of supported transaction classes.

A subject can inspect and challenge other subjects' actions even without an existing guarantee link. This creates an oversight network larger than the local set of guarantors.

The distinct **free guarantor cancellation** of an unspent Self-ID does not require this general XP gate. It is a specific protective authority provided by an existing guarantee.

### 25.1 Open discovery and qualified sponsorship

**[DIRECTION, documented 2026-10-23]** Anyone can identify an inconsistency, investigate it and supply useful evidence, including people with no XP or no Facety membership. Separate discovery, evidence construction, formal sponsorship, adjudication and enforcement. A qualified participant can independently evaluate an external or low-XP source's package and accept the formal procedural responsibility. This channel does not give an external observer XP, membership, private-information access or a bypass of the ordinary challenge gate.

The investigator and sponsor may negotiate compensation outside protocol. A built-in bounty marketplace, transferable XP or mandatory new token is not required. Funding, payer/recipient, currency, payment conditions, sponsor effort, collection risk and enforceability are **[OPEN / RESEARCH ASSUMPTIONS]**, not free resources or silently minted FACY.

**[HYPOTHESIS]** An active investigative minority with sufficiently responsive sponsors and decision-makers can support a much larger passive population and expose violations beyond the accused's local guarantor cluster. Outsiders, rivals and former collaborators may supply evidence, but they need access and a willing capable sponsor. Multiple routing, publication and sponsor competition are possible mechanisms to test, not omnipotent fallbacks. Public availability does not imply attention or enforcement.

Evidence must be evaluated apart from source allegiance: a malicious source can reveal a real violation; a respected source can submit a false accusation. An allegation is not a verdict. Repeated circulation of one package is not independent confirmation. **[REFERENCE / OPEN]** Packages may retain public-event references, claimed duty, supporting observations/source identities, timestamps and review history without publishing additional sensitive personal data. Evidence admission, clarification/refusal, conflict handling, retries and harassment safeguards remain to be specified and tested. See the [research program](research.en.md).

## 26. Chekharda / Leapfrog

### 26.1 Alternating positions

**[SELECTED]** Chekharda is a sequence of public positions in which a later participant enters on the opposite side of the preceding position. Each new entrant MUST have strictly more effective XP than the immediately preceding entrant. Monetary stakes rise with escalation.

```text
Transaction owner: 100 XP
    <- challenger:       180 XP, stake S1
    <- defender:         430 XP, stake S2 > S1
    <- challenger:     1,250 XP, stake S3 > S2
    <- defender:       8,400 XP, stake S4 > S3
```

These XP values are illustrative. They are not protocol thresholds.

The system uses both forms of capital:

- **XP** determines who may participate at the current escalation level.
- **FACY or another approved stake asset** places transferable economic value at risk.

More money cannot bypass the XP condition. More XP does not establish factual truth by itself.

### 26.2 Earlier deadline candidates (superseded)

**[DIRECTION]** Simple disputes should end locally. The last unopposed side can prevail when the response period ends under the finality rule.

**Historical candidates, superseded by the selected 7-day restart window in §26.5:** the period could become longer as participants enter the sequence. A candidate is to add approximately **one day for each new participant**. Another candidate is to use a function of escalation depth, rounded to whole days.

For example:

```text
new_deadline = previous_deadline + extension(escalation_depth)
```

**[OPEN]** Timeout/execution bounds, minimum notice and Council interaction still need definition. Base finality itself is selected in §26.5; the earlier extension candidates above are not current defaults.

A simple mathematical increase of XP does not by itself bound a dispute's runtime cost. The implementation needs explicit state and execution limits.

### 26.3 Publicity increases with stakes

**[SELECTED / DIRECTION]** A dispute becomes more publicly prominent as larger XP and monetary stakes enter it. The reason is social: people with more known relationships and longer histories put more of their own reputation at risk.

The chain can preserve all dispute records. Indexers and clients can provide different attention tiers while keeping an auditable history.

**[OPEN]** Exact thresholds for alerts, public broadcasts, exposure of evidence, and privacy protections must be set.

### 26.4 Winners, losers, and evidence

The intended rule is that a false or unsupported position exposes a participant to monetary loss and possible XP halving. A successful challenge can establish sanctions for an underlying false Self-ID, invitation, or guarantee.

**[DIRECTION]** Winning participants can receive a defined share of the losing monetary stakes. This creates an opportunity to earn money by doing difficult dispute work, not a passive yield for holding XP.

### 26.5 Stake ladder

**[DIRECTION, 2026-10-22]** Each new position stakes a fixed percentage more than the previous one, for example 10–20%. Stakes therefore grow by compound interest: a dispute that starts small puts much more money at risk the higher it climbs.

```text
stake(k) = stake(k-1) * (1 + g)        g ~ 0.10 .. 0.20
```

- When the dispute ends, **each winning position receives the stake of the position directly below it**.
- A winner at position `k` therefore earns `1 / (1 + g)` of its own stake (about 83–91%), and every participant contests exactly one opponent.
- The lowest winning position, the first challenger, is paid from the sanction on the rule-breaking transaction owner.
- Losers also lose half their XP.

With a private belief `p` that its side is right, joining at position `k` is worthwhile when

```text
p * stake(k-1) > (1 - p) * (stake(k) + value_of_half_own_XP)
```

On the illustrative money-only calculation this needs slightly better than even confidence (about 52–55%). **[HYPOTHESIS]** XP risk may select for greater confidence among high-XP entrants; it does not guarantee their accuracy, independence or private valuation of XP. The arrangement resembles a prediction market or an escalating dispute-bond game.

**[SELECTED, 2026-10-22] Finality window.** A dispute runs until **7 days** pass after the last move. Within that time anyone eligible can take the opposite side, and every new entry restarts the 7-day clock. The last unopposed side then wins, unless the Council intervenes. The accused's unspent rights stay frozen meanwhile (§17.4).

**[HYPOTHESIS, 2026-10-22] Fast escalation to senior judgment.** In real disputes participants may join every few minutes, not once a day, and each may have several times the previous entrant's XP, because many people want the last word and the money. A visible dispute therefore climbs quickly to long-standing members with large reputations. They gain nothing by ruling against themselves or against the crowd. Attention grows with a dispute's height (its largest XP relative to the network) and with the number of people it has drawn. Among all who notice, someone will want to take the right side; winning requires presenting evidence.

**[DIRECTION, 2026-10-22] Dispute-resolution reputation.** People who take part in disputes differ from ordinary participants, and many never take part at all. Regulars know one another, may befriend one another and may form their own coalitions. Each person's chain of disputes is visible in an explorer, so it is statistically clear who tends to stand on the right side. This is a second reputation, separate from identity reputation.

**[HYPOTHESIS, 2026-10-22] Calling seniors.** A dispute participant can call a more senior acquaintance for help, one with, say, ten times the XP. With some probability (for example 10%), such a person joins if one exists in the graph, so stakes and seniority rise in jumps.

**[DIRECTION, 2026-10-22] Cluster disputes.** A participant who defends a proven violator without evidence draws attention to itself and may be part of the same scheme. After a violation is proven, disputes can be opened automatically and in parallel against the cluster that defended it.

**[REFERENCE / OPEN, clarified 2026-10-23]** Attention is not a finding of guilt. Legitimate defense, mistaken judgment and knowing obstruction of established evidence differ. A separate sanction needs evidence of a defined identity or procedural duty, not mere association with a losing side or political disagreement. The legacy `clusterFollowUp` option is a scripted stress test, not a complete standard for proving obstruction.

**[CANDIDATE] Other markets for resolving sides.** Parimutuel pools on the claim, automated market makers, and Schelling-point juries are alternatives to the alternating ladder that deserve comparison.

**[MODEL FINDING, diagnostic; scope corrected 2026-10-23]** In one retained cheap-fake run, a top-XP coalition defender ended all 89 resolved disputes at depth 2 despite a common noisy signal favoring the accusation. This demonstrates an XP-gate obstruction under that script. It does not prove that XP dominance is necessary for every wrongful verdict, that non-dominance guarantees safety, or that real fabrication costs prevent dominance; see insight F21.

**[OPEN]** Whether a position's stake must only be at least the stake below rather than a fixed +g, and how winnings are then distributed fairly.

**[OPEN]** What happens to the stake of a losing top position, which has no winner above it (the legacy simulator burns the collectible amount as an assumption). The base stake, caps and Council intervention timing. Stake backing is also unresolved: exclusive custody/reservation versus an unsecured commitment changes concurrent-case capacity and recoverability. The legacy simulator only checks current liquid funds and collects up to the remaining balance at settlement, so nominal stakes are not guaranteed winnings. The implemented `disputes.stakeBacking: "reserved"` comparison holds real model custody, excludes it from spending/unrelated fines, refunds winners or mooted cases, and retains open-horizon commitments. Passive refunds/winnings can reach known invalidated accounts without restoring rights. These backing/priority choices are research references, not selected economics; default backing remains legacy unsecured.

**[MODEL FINDING]** A ladder decided only by the last unopposed side favors the side with the most disposable high-XP identities. Fake identities have nothing to lose, and mutual guarantees inflate their XP. In the simulator, verdict accuracy fell to 0.2–0.4 without Council intervention. Accuracy reached 0.83–0.89 (1.0 without coalition harassment) when the active Council could step in early, at depth 2–4; at depth 6 it came too late. The Council's honest majority and its willingness to intervene early are the anchor of the dispute system. See the [insight register](insights.en.md).

**[HYPOTHESIS, 2026-10-22]** In practice fakes rarely open disputes against honest players. A dispute draws attention to its initiator and invites a counter-dispute, so disputes are mostly opened against suspected fakes, using public statistics. The participants who support a fake are mostly other fakes. A side with real reputation (history, tenure, ties to the honest network) attracts more support than one without it.

**[OPEN]** The evidence standard, treatment of innocent mistakes, and safeguards against fabricated disputes are not final.

A final result must be attributable to a specified procedure. The mere willingness of a wealthy or high-XP participant to join a side does not prove that side true.

## 27. Council of 101

**Historical title retained. D33 supersession, 2026-10-23:** [§46.4–§46.5](#464-dynamic-consul-council-size) replaces the fixed target prospectively with difficulty-based dynamic size and no formal one-consul institution. The text below retains the original rule and unresolved procedures, not a competing current size requirement. Formal intervention powers apply only when a formal Council exists; bootstrap apex correction remains OPEN. Existing simulations still implement the legacy reference, not D33.

### 27.1 Membership and equal votes

**[SELECTED 2026-10-22; fixed size superseded by D33]** The **101 highest-effective-XP subjects** form a dynamic Council. Its members appear on the public leaderboard. Each member gets **one vote**. The person with the largest XP does not receive extra Council votes.

**[SELECTED, 2026-10-22]** The leaderboard counts only **active** subjects: those with an uncancelled Self-ID in the preceding 28 days. Inactive members drop out. **Recalculation is not turnover:** continuously active leaders may retain their seats. Stability is not itself failure, and frequent replacement is not itself success. Measure actual mobility, contestability, independence of judgment and removal of influence after established misconduct.

Council membership changes as XP/activity changes. **[REFERENCE / OPEN]** A deterministic case-membership snapshot can avoid ambiguous replacements; dynamic membership is a distinct comparison. The current leaderboard does not choose an active-case policy.

**[OPEN]** How the Council operates when fewer than 101 qualified subjects exist, and tie-breaking at rank 101 require defined rules.

### 27.2 Voluntary intervention

**[SELECTED]** The Council may decide to intervene in **any dispute**. It is not required to take every local conflict. Its members can hold a public vote on whether collective intervention is appropriate.

This creates an upper review path for conflicts involving the largest amount of social capital, including an allegation against a subject that nobody can challenge through the ordinary `XP(challenger) > XP(owner)` gate.

The Council's capacity to hear apex cases prevents individual maximum-XP immunity in the intended design. **[SELECTED restatement, 2026-10-23]** A consul has no seniority immunity: another consul may challenge through the applicable ordinary or collective route. XP does not add votes inside the Council. This restatement does not settle the still-OPEN referral and merits procedures.

### 27.3 An intervention vote is not automatically a truth verdict

A vote on **whether to intervene** is different from a vote on **which underlying claim is true**. The design permits a collective Council resolution route, but the exact merits procedure has not been selected.

**[OPEN]** Define separately:

1. Who can submit a case for Council attention.
2. Whether a public vote opens formal intervention.
3. The quorum and majority required for intervention.
4. Whether the Council subsequently votes on the merits or activates another bounded procedure.
5. Whether an accused member can participate, and how conflicts of interest are handled.
6. How the Council decision interacts with an ordinary Chekharda deadline.
7. How evidence, appeals, finality, and penalties are recorded.

A 51-versus-50 simple-majority example illustrates equal voting. It is not an approved threshold. A supermajority for cases against apex participants was a separate candidate, not an adopted rule at that checkpoint. **D33 (§46.9)** now recommends simple majority for ordinary decisions and two-thirds for critical interventions; quorum, vote denominator, critical-case definition and merits/referral procedures remain OPEN. The earlier example is historical, not an alternate current threshold.

### 27.4 The limit of internal legitimacy

If a majority of the most respected members starts to protect visible misconduct, the social value of their XP and Facety's identity assurances can collapse. This is the intended credibility constraint at the apex.

There is no requirement for an infinite chain of councils above the Council of 101. The public network can lose trust in its highest body, much as a monetary network can lose credibility after abandoning a fundamental monetary rule.

**[HYPOTHESIS]** Large reputational exposure discourages such collective misconduct. The protocol cannot guarantee this behavior. Public votes make responsibility observable; they do not force honest results or automatically restore damaged trust.

---
### 27.5 Reasoned outcomes and precedent

**[CANDIDATE / OPEN, documented 2026-10-23]** The owner suggested public, reasoned precedent for boundary cases. Interpreting an ambiguous existing rule differs from changing the rule prospectively. Compare comparable insider/newcomer cases, preserve reasons and action provenance, and test correction of bad precedents and protection from retroactive punishment. No precedent engine, unbounded appeal hierarchy or extra supreme controller is selected by this proposal.

# Part VI: FACY Economics and Atmo Integration

## 28. A monetary token and a separate authority measure

Facety deliberately separates FACY from XP:

| Property | FACY | XP |
| --- | --- | --- |
| Nature | Fungible economic token. | Non-transferable procedural experience. |
| Primary issuance | 1 FACY for a valid, rewarded Self-ID. | 1 credit for an eligible own Self-ID, plus 1 per qualifying guaranteed Self-ID. |
| Market transfer | Yes, after the applicable Emitter-to-Collector conversion or through already liquid holdings. | No. |
| Invitation eligibility | Only personally earned, unspent Emitter emission, at least 24 hours old. | Does not substitute for the FACY invitation burn. |
| Dispute role | Monetary stake and possible winnings or penalties. | Admission and escalation authority. |
| Penalty | Real balance loss, possible burn, or future-reward debt under policy. | Possible 50% reduction in effective XP. |

The two measures are complementary. Large market wealth does not directly buy procedural XP, and large XP does not mint arbitrary FACY.

The amount of FACY issued per Self-ID is fixed by the standard reward rule. Its market price is not fixed by Facety. There is no selected dollar peg or promised daily income in fiat terms.

## 29. Monetary operations and supply

The design distinguishes actual token operations from ledger claims.

| Operation | Effect on fungible FACY supply |
| --- | --- |
| Valid Self-ID under minted-escrow reference | Mint 1 FACY into controlled Emitter custody. |
| Invite from eligible Emitter right | Burn its one backing FACY. |
| Free cancellation of an unspent Self-ID | Burn the remaining backing FACY in the minted-escrow reference. |
| Collector conversion | Transfer an existing FACY unit; do **not** mint a second unit. |
| Bilateral guarantee commitment | **Open**: may reserve, pay, or burn according to a later approved rule. |
| Unilateral established-link break | Charge 1 FACY as a **fee**; not an automatic burn. |
| Monetary sanction | Burn only if the approved rule executes an actual burn; otherwise transfer or record debt. |
| Treasury D buyback | Buy existing market FACY; burn the acquired quantity. |

General supply identity:

```text
FACY_supply_end
    = FACY_supply_start
    + actual_mints
    - actual_burns
```

A debt entry of `-100 FACY` is **not** an actual burn of 100 existing tokens. A transfer to another participant is not a burn. A skipped future mint can reduce expected supply growth but does not destroy already circulating FACY.

Under the minted-escrow reference design, an invariant must connect the common Emitter vault to outstanding individual Self-ID rights. If guarantees reserve backing or split rights, the accounting must include all such commitments and ensure that no rights can claim the same FACY twice.

## 30. Monetary penalties and negative emission balances

**[SELECTED / DIRECTION]** A participant can incur a monetary penalty larger than its current liquid and recoverable balances. The remaining obligation becomes a negative emission balance or debt. Future valid identity work can reduce that debt before the participant receives free disposable FACY.

Illustrative ledger:

```text
Recorded penalty debt: 8 FACY
Next valid Self-ID:   standard reward = 1 FACY
Apply debt recovery:  debt falls to 7 FACY
Disposable reward:    0 FACY
```

This describes the intended economic result. It does **not** select the exact asset implementation. A final implementation could withhold a future mint or mint into restricted custody and burn after the selected veto window; immediate burning at acceptance is superseded by §17.3. Total-issuance effects must match the chosen representation.

The debt should follow the `SubjectId`, not a changeable account key. A person who makes an error may continue to participate and work toward a non-negative balance. Negative debt is not, by itself, permanent exclusion.

**[OPEN]** Decide the seizure order among Collector FACY, unspent Emitter emissions, other eligible balances, commitments, and future rewards; debt ceilings; appeal effects; inherited liability; write-offs; and what happens if a debtor abandons participation. Distinguish a promised nominal fine from a recoverable amount.

**[DIRECTION]** Proven serious violations can create actual deflation through burns of collectible FACY. This is separate from the 1 FACY invitation burn and from the Atmo buyback burn.

## 31. The DEOS / Atmo capital model

The Atmo instance uses the separation of capital allocation and spending authority defined by DEOS and TMCTOL.

| Capital component | Intended role |
| --- | --- |
| **Bucket A** | Immutable monetary anchor; not discretionary Facety funding. |
| **Bucket B → Treasury B** | Development and builder-related spending under its own policy. |
| **Bucket C → Treasury C** | Operational capital and available native/reserve assets. |
| **Bucket D → Treasury D** | Dormant allocation at launch; later a Demand policy used to support Facety through FACY buyback and burn. |

Buckets and Treasuries are not interchangeable. The right to change the capital's liquidity position is a different control plane from the right to spend treasury assets.

**[SELECTED]** The Facety buyback-and-burn is an **Atmo instance policy**. It is not a universal rule imposed on every DEOS instance. Another instance could use its Bucket D for another lawful purpose.

## 32. Treasury D market buyback and burn

**[SELECTED]** For Atmo, the intended flow is:

```text
Bucket D capital, initially Dormant
    -> policy-authorized activation
    -> release of available capital from its position
    -> Treasury D spend budget
    -> market route into FACY
    -> purchase existing FACY
    -> burn all FACY acquired for that operation
    -> auditable accounting
```

The capital may begin as reserve or native economic assets, such as DOT or ATMO, depending on the current approved Atmo design and the funds actually released. The policy must preserve exact asset units and balances. It cannot treat available liquidity, committed liquidity, and free treasury funds as the same asset claim.

**[REFERENCE]** A bounded DEOS Actor can run the buyback through the existing Axial Router or a compatible market adapter. Example names include `FacetyBurnActor` and `BurnReceipt`. These are proposed names, not shipped-component claims.

A reasonable minimum execution policy includes:

- Explicit Treasury D budget and maximum spend per period.
- Maximum spend per operation and optional minimum interval.
- Approved input assets and market routes.
- Minimum actual FACY output, slippage, and price-impact limits.
- Fresh reference-price or market-health checks.
- A pause mechanism and rules for restoring activity.
- Replay protection and actual balance-delta accounting.
- A public record of the asset spent and FACY burned.

For an atomic local market, the purchase, burn, consumed budget, and execution record should form one atomic transition. A failure to burn the purchased FACY must also fail the local purchase operation. Remote or asynchronous market execution needs a separate recovery protocol; local storage rollback cannot undo an already completed remote trade.

**Invariants:** A Treasury D buyback does not mint invitation-eligible Self-ID emissions and does not create XP. Buying FACY does not buy personhood. A completed buyback must account for actual FACY burned, not a theoretical quote.

## 33. Bucket D as a controlled economic interface

Atmo can **reduce or stop** its FACY buyback policy when Facety suffers a serious Sybil outbreak or a material failure of the trust graph. It can restore spending after credible recovery under the approved policy.

This is not a guarantee of price support or redemption. The buyback is capped and conditional. Facety remains responsible for its internal social truth; Atmo remains responsible for capital allocation.

**[HYPOTHESIS]** A Sybil outbreak dilutes the honest participants' proportional claim on total issuance and can depress market value. Honest participants have a stronger reason to detect abuse. If Atmo pauses buyback during the outbreak, attackers can lose part of the outside demand that makes their false-emission operation profitable. The possibility of restoring buyback creates another reason to repair the network.

However, a pause may also reduce honest participants' incentives to inspect and challenge others. Health signals must be harder to manipulate than simply filing many false accusations. Measured health, credible proof of misconduct, public appeals, and recovery conditions all matter.

The metaphor of an **isolation transformer** refers to controlled economic coupling. It does not imply zero contagion risk or strict independence of market prices.

## 34. The marketing and network-effect thesis

Traditional acquisition spending purchases attention or registrations. Facety aims to spend capital in a system where participation can leave reusable social evidence, maintained guarantees, identity histories, and public responsibility.

Atmo benefits if Facety becomes a common human layer used by governance and applications. Facety benefits from access to Atmo's economic infrastructure and conditional demand policy.

A practical value thesis is:

```text
more genuine active people
    + more reliable human links
    + more independently useful attestations
    + more applications that reuse them
    -> greater coordination capacity
```

This is a **hypothesis about useful coordination**, not a mathematical law of token prices. Counts of wallets, emitted tokens, selfie files, or XP alone do not establish it.

Atmo's Bucket D should therefore be understood as a **protocol-native marketing mechanism**: it can amplify social-network development, but it cannot manufacture credible identities merely by spending.

### 34.1 Application-level uses and optional extensions

Facety can be a low-level human-identity and trust primitive that other Atmo applications reuse. Possible higher-level uses include human-aware governance, Sybil-resistant public-goods funding, social recovery, membership and attendance claims, portable reputation, and human-authorized agent actions. A Facety identity claim must not automatically grant all of these permissions. Each application defines its own access and consequence rules.

The earlier design material also considers additional **FACY utility surfaces**: verifier staking, attestation fees, dispute and appeal deposits, anti-spam charges, organization and API access, curation, and selected Facety governance parameters. These are **[DIRECTION / CANDIDATE]** surfaces unless this specification defines an exact transition for them. The selected foundation is narrower: Self-ID emission, invitation burn, guarantee-related operations, dispute stakes and sanctions, and market buyback-and-burn.

Likewise, Facety can publish reusable attestations and context-specific reputation without treating XP as a universal social score. The basic layer concerns human identity and social guarantees. Future layers may consume that evidence for different purposes without changing its historical meaning.

---

# Part VII: Reference Implementation Contracts

## 35. Suggested logical records

The following structures are **[REFERENCE]**, not validated descriptions of the current DEOS codebase.

```text
Subject {
    subject_id
    authorized_keys
    identity_status
    trust_path_status
    effective_xp
    xp_event_history_or_snapshot
    emission_debt
    current_guarantees
    current_invitation_rights
    last_rewarded_self_id_at
}

Artifact {
    artifact_id
    cid_or_content_hash
    registered_at
    publisher_subject_id
    public_domain_rights_assertion
    media_profile
    detector_profile_version
}

SelfId {
    self_id_id
    subject_id
    artifact_id
    detector_version
    face_index
    signed_assertions
    recorded_at
    guarantor_authority_record
    emitter_right
    dispute_lock
    outcome_history
}

EmitterRight {
    source_self_id_id
    amount = ONE_FACY
    status: unspent | allocated | consumed | converted | cancelled
    eligibility_time = recorded_at + 24 hours
    collector_time = recorded_at + 24 hours
    custody_reference
}

GuaranteeRelation {
    relation_id
    guarantor_subject_id
    guaranteed_subject_id
    proposal_transaction
    matching_transaction
    activation_time
    status
    funds_or_commitments
    end_time
    liability_history
}

Invitation {
    invitation_id
    creator_subject_id
    source_self_id_id
    source_emission_disposition
    created_at
    target_and_expiry_policy
    accepted_subject_id
    status
}

Dispute {
    dispute_id
    target_transaction_id
    target_subject_id
    dispute_kind
    positions_and_stakes
    xp_snapshots
    opened_at
    response_deadline
    escalation_depth
    status
    resolution
    penalties_and_rewards
}

CouncilCase {
    case_id
    associated_dispute_id
    council_members_snapshot
    disclosed_conflicts_or_recusals
    intervention_vote
    possible_merits_proceeding
    public_outcome
}

TreasuryDBuyback {
    campaign_id
    execution_nonce
    spent_asset_and_amount
    route_and_output
    facy_acquired
    facy_burned
    effective_execution_price
    remaining_budget
    block_number
}
```

These records should be normalized or split as needed for bounded Substrate storage. Historical media bytes should not be placed directly into unbounded on-chain state.

## 36. Self-ID emission operations

The following pseudocode defines useful transaction boundaries. Any **[OPEN]** input must be supplied by a future approved policy before deployment.

### 36.1 Register an artifact

```text
register_artifact(publisher, cid, media_profile, rights_assertion):
    require authorized subject and signature
    require valid publication-rights assertion
    require supported media and canonical profiles
    require acceptable bounded metadata
    store registered_at from chain time
    return artifact_id
```

### 36.2 Create Self-ID

```text
create_self_id(subject, artifact_id, detector_version, face_index, assertions):
    require valid subject key signature
    require valid first three assertions
    require artifact registration age <= 24 hours
    require detector and face_index valid under selected profile
    require subject has not used its rolling 24-hour reward slot
    create unique SelfId with one unspent emission right
    perform approved FACY issuance/custody transition
    apply approved XP-credit timing rule
    check and publicly flag conflicting FaceRef claims
    record all results as one valid runtime transition
```

An invalid claim can still be recorded if the only problem is that another subject claimed the same face. A duplicate face claim is a conflict signal, not automatic proof of which claimant is wrong.

### 36.3 Cancel an unspent Self-ID

```text
cancel_self_id(guarantor, self_id_id):
    require guarantor has the defined authority over this act
    require original emitter right is still cancellable and unspent
    require applicable dispute-precedence policy
    cancel the Self-ID emission
    burn the unit held in emitter custody under minted-escrow design
    reverse or settle XP under approved rules
    record that this guarantor prevented this act's emission
    do not automatically break the long-term guarantee relation
```

There is no cancellation fee for an authorized guarantor. Other transaction-validity and anti-spam checks still apply. A truly free blockchain submission must work through the complete transaction-payment pipeline, not merely refund a fee after dispatch.

### 36.4 Create an invitation

```text
create_invitation(creator, source_self_id):
    require active and authorized creator
    require qualifying_guarantor_count >= decimal_digits(N28)
    require source_self_id belongs to creator
    require emitter right is unspent and not disputed
    require emitter right age >= 24 hours
    burn exactly ONE_FACY of eligible emitter backing
    mark source emission UsedForInvitation
    record accountable invitation, frozen for 24 hours
    commit all changes atomically

cancel_invitation(guarantor, invitation):
    require invitation is open and still frozen
    require guarantor currently guarantees the creator
    mark invitation Cancelled; the burned emission stays burned
    revoke the XP credited by consuming the source emission
```

### 36.5 Convert to Collector

```text
convert_to_collector(owner, self_id_id):
    require owner is authorized for self_id_id
    require emitter right is unspent and not disputed
    require emitter right age >= 24 hours
    transfer the ONE_FACY backing to ordinary Collector balance
    mark source emission Converted
    commit once
```

A market transfer from Collector does not retroactively recreate an Emitter right. A Collector conversion is not an invitation burn and does not reduce total FACY supply.

### 36.6 Open a dispute against a Self-ID

```text
open_self_id_dispute(challenger, self_id_id, evidence, stake):
    require supported dispute and eligible XP gate
    require valid stake and declared evidence
    record dispute and response deadline
    freeze targeted Self-ID's still-unspent emitter right
    publish discoverable dispute metadata
```

A dispute against an already consumed or converted Self-ID can proceed under the later-liability policy, but cannot freeze or burn its nonexistent Emitter right.

## 37. Non-negotiable invariants

The implementation MUST preserve the selected invariants below. Where exact mechanics remain open, the invariant states the minimum obligation and names the missing policy.

### Identity and artifact integrity

1. A subject's authorized-key change does not reset identity history, debt, XP penalties, or Self-ID rate limits.
2. A subject cannot receive two standard rewarded Self-ID acts inside one rolling 24-hour period.
3. A Self-ID is linked to one subject, one signed set of assertions, and one addressable face reference.
4. A FaceRef is deterministic only under a pinned canonicalization and detector version.
5. Two subjects can reference the same FaceRef. A collision is flagged, not silently resolved by submission order.
6. A shared artifact can support multiple independent signed Self-ID claims.
7. The 24-hour artifact-reference window is evaluated against registered chain time; it does not claim to verify camera capture time.
8. Artifact-publication rights are not inferred from a later participant's claim to appear in that artifact.
9. A co-appearance reference does not automatically form a guarantee or transfer XP apart from the normal Self-ID rewards.

### Emission and token integrity

10. Each eligible Self-ID produces no more than one standard FACY entitlement.
11. One emission right has no more than one terminal disposition: cancellation, invitation consumption, defined guarantee disposal, or Collector conversion.
12. Before 24 hours, an emission cannot be spent or converted by its owner.
13. From 24 hours onward, only explicitly approved network-building operations can use a still-restricted Emitter emission.
14. An invitation cannot be applied before its 24-hour freeze ends, and a current guarantor of its creator can cancel it during the freeze.
15. From 24 hours onward, an unspent emission may convert to Collector; conversion is not automatic.
16. An unspent Emitter emission remains subject to valid guarantor cancellation for as long as it stays unspent.
17. A consumed or converted emission cannot be cancelled again through the original free Emitter-veto mechanism.
18. An active dispute freezes its target's still-unspent emission against use or conversion.
19. FACY bought or received from another subject does not create invitation eligibility.
20. An invitation burns exactly 1 FACY backed by its creator's personally earned eligible Emitter emission.
21. Every actual burn reduces fungible FACY issuance by the amount actually burned under the selected asset model.
22. The custody and entitlement ledger cannot create multiple claims against the same backing FACY.
23. Debt and nominal penalties cannot be counted as actual token burns.

### Social graph and responsibility

24. A directed guarantee requires matching authorization by both subjects.
25. A reciprocal guarantee requires its own explicit relationship.
26. Breaking an established guarantee is distinct from free cancellation of an individual Self-ID and is subject to its own 1 FACY fee rule.
27. An authorized guarantor can prevent liability for a specific suspect Self-ID by validly cancelling that act, without automatically negating the underlying guarantee.
28. The graph preserves historical links and accountability after later link breaks, subject recovery, and disputes.
29. Disconnection alone cannot establish that every dependent subject is fake or liable.
30. The dynamic invitation threshold uses a count of unique qualifying subjects in the rolling 28-day window.
31. The count and eligibility checks are performed against canonical runtime state, not an untrusted indexer estimate.

### XP and dispute procedure

32. XP cannot be bought, transferred, or generated merely by moving FACY.
33. Each qualifying Self-ID creates exactly the XP credits defined by the selected reward rule, subject to valid cancellation accounting.
34. An ordinary direct challenger has strictly more effective XP than the owner of the challenged transaction.
35. A later Chekharda participant has strictly more effective XP than the immediately preceding participant.
36. Monetary stake and XP do not silently substitute for one another.
37. An eligible losing and liable participant receives the defined XP penalty at most once per enforceable penalty event; later independent losses can cause another halving.
38. XP credits and halving events preserve their true chronological meaning.
39. Council membership snapshots and all vote results are deterministic for each case.
40. Every eligible Council member has one vote, regardless of XP magnitude; eligibility requires activity within the last 28 days.
41. The highest-XP subjects have an intended collective path for apex disputes and are not automatically beyond all review.
42. The outcome of a dispute must be derived from an explicit timeout, accepted position, or Council procedure, never from an unstated moderator decision.

### Atmo separation

43. Facety does not obtain discretionary control over Bucket A, B, or C through its identity rules.
44. Bucket D capital activation and Treasury D spending use separate authority checks.
45. Treasury D purchases market FACY; it does not mint invitation-eligible FACY.
46. Every successful local buyback/burn accounts for the actual purchased and burned amount, and fails atomically when any indispensable local step fails.
47. Suspending Atmo buybacks must not silently modify a subject's identity, XP, guarantee status, or legal dispute rights.
48. Public audit data must not require storing private media bytes directly in runtime state.

## 38. Bounded execution requirements

Substrate execution is deterministic and resource-bounded. The implementation must specify maximum costs for each kind of transition. Use bounded evidence metadata, bounded guarantees per operation, bounded dispute histories or summaries, and bounded queue processing.

Do not scan every subject each block to maintain `N28`. Use a deterministic expiration index or equivalent bounded update method. A missed or delayed background operation must not create inconsistent eligibility results. If eligibility depends on lazy expiration, prove that the value seen by the dispatch is canonical.

Do not perform an unbounded search of the global trust graph during a transaction. More complex graph analysis can occur off-chain, but every consequential on-chain decision must reference accepted inputs and authorized verification rules.

Governance changes to economics, XP, and dispute rules require versioning or explicit migration semantics. A new policy MUST NOT silently rewrite the meaning of already recorded identity claims or completed economic operations.

## 39. Public evidence and personal safety

Facety relies on public accountability. That does not mean all sensitive media and personal data should be copied into an immutable public storage layer.

The specification must separately describe:

- What is committed on-chain and what is stored through a content-addressed network.
- Who can inspect images, recordings, identity claims, and case evidence.
- How long an artifact must stay accessible for guarantors and disputes.
- How a claim can be checked if the original bytes are no longer available.
- Which rights an artifact publisher can legitimately dedicate to the public.
- How to handle false consent claims, minors, biometric privacy, and non-consensual publication.
- How public disagreement and corrections remain visible without requiring unlawful media redistribution.

A hash alone does not guarantee artifact availability or media truth. An accessible face image can expose a person to risks that are separate from Sybil economics. These considerations are part of deployment correctness, not optional UI polish.

---

# Part VIII: Threat Model, Research, and Delivery

## 40. Attacker goals and attack surfaces

Facety must be evaluated against several adversaries, not only a person who buys many tokens.

| Threat | Attacker strategy | Relevant defense or unresolved risk |
| --- | --- | --- |
| Market-financed Sybil farm | Buy FACY and mass-create identities. | Bought FACY does not create invitation rights; entry also needs accountable guarantees. |
| Earned-right Sybil farm | Maintain false subjects until they earn their own Emitter rights. | Time delay, witnesses, guarantee liability, disputes; successful false entry remains a significant risk. |
| XP farming cartel | Use dense mutual guarantees to earn XP at high speed. | Public graph and liability; **open:** whether authority outruns independent evidence. |
| Impersonation or twins | Claim another person's image or create multiple subjects for one person. | FaceRef collision visibility, signed claims, guarantor cancellation, disputes. |
| Synthetic group artifact | Generate an image that appears to show several real people. | Multiple claims are inspectable; no automatic guarantee of physical co-presence. |
| Malicious guarantor | Cancel many valid Self-ID acts to coerce a real person. | Subject can terminate the guarantee; 1 FACY link-break fee may itself create pressure. |
| Hidden invalid act | Guarantors ignore suspect Self-ID to protect themselves. | Public challenge by eligible outsiders; risk of collusive concealment remains. |
| Root collapse | An upstream inviter or guarantor fails identity verification. | Trace dependent paths; distinguish disconnected real people from guilty parties. |
| Large-debt evasion | Abandon subject after a fine. | Persistent subject debt; ability to compel repayment remains limited by recoverable assets. |
| Dispute farming | Coordinate artificial disputes and redistribute stakes. | Evidence, rising stakes, penalties; exact procedure remains open. |
| Council capture | A coalition blocks review of its own misconduct. | Equal Council votes and public history; no guaranteed protocol-native correction. |
| Treasury manipulation | Manufacture health signals to pause or trigger buyback. | Separate Atmo policy and robust market/health checks; exact policy remains open. |

A registered artifact, a high XP score, and many guarantors are **evidence and incentives**, not cryptographic uniqueness proofs.

### 40.1 How fraud surfaces

**[DIRECTION, 2026-10-22]** Detection need not be perfect, because it works through several independent public channels:

- **Media checks:** detectors of generated imagery, duplicate-media checks and the difficulty of producing fresh, varied fake media every day.
- **Graph analysis:** a large region connected to the rest of the network only through narrow links is a reason to examine it. Statistical analysis can rank the most suspicious nodes.
- **Lineage tracing:** who invited whom can be followed up to the account that started registering fakes.
- **Money flows:** fakes must eventually move their coins somewhere useful. Consolidation from many accounts into one is visible on a public chain.
- **Verification by contact:** suspicion is a reason to find out, not to punish immediately. A call or a meeting settles most cases. A person acting publicly and responsibly can announce such a meeting.

The fact that a dispute can be opened deters fraud, and an actual dispute regulates the network once trust is undermined. The initiator has a material interest in winning and in not losing.

**[MODEL FINDING]** In the simulator:

- graph screening separated fakes from real people with an AUC of about 0.8–0.9 even against camouflage;
- consolidation hubs pointed almost exclusively at the coalition, until ordinary honest payments diluted the signal;
- a call or meeting before any veto or challenge was necessary to keep false suspicion from destroying honest income.

Deterrence held only while verdict accuracy was at least about 0.8 and raw false suspicion stayed near 1%, unless a second-stage verification filtered suspicions.

## 41. Required simulation scenarios

The design needs an agent-based or other explicit incentive simulation before relying on it for expensive treasury support or high-stakes identity disputes.

### 41.1 Honest growth and bootstrap

Simulate a small honest genesis community that expands through invited real people. Measure time to eligibility, XP growth, invitation throughput, the effect of the changing decimal threshold, and the cost of maintaining real guarantees.

### 41.2 Colluding false cones

Let a small set of genuine attackers create false subject chains. Include their ability to earn personal Emitter rights and produce their own XP. Measure the real time and external expenditure required for the attack to rival the honest trust graph.

### 41.3 XP concentration

Compare a wide honest network, a very dense group of mutually guaranteeing genuine people, and a synthetic identity cone. Determine whether XP rank measures responsibility or simply the number of repeated internal verification opportunities.

### 41.4 Emitter lifecycle adversaries

Test an honest cancellation inside the first 24 hours, network-use consumption after 24 hours, attempted cancellation after consumption, a conversion after 24 hours, a cancelled frozen invitation, and a still-unspent emission left on Emitter for weeks. Confirm that only the still-unspent emission can be preventively cancelled.

### 41.5 Duplicate FaceRef and group artifacts

Test two different subjects claiming the same face. Both Self-ID records must be recorded and flagged. A challenge must freeze unspent emission rights. The process must support an evidence-based outcome without automatically declaring the second submitter guilty.

Also test people on the same artifact with different face indices. A group Self-ID should generate independent rewards without unintentionally creating mutual guarantees.

### 41.6 Preventive cancellation versus guarantee liability

Simulate a valid real subject who submits a bad artifact. A responsible guarantor cancels the Self-ID and avoids liability for failing to prevent that particular act. The underlying person's identity and guarantee history remain available. Separately simulate a guarantee of an actual nonexistent person.

### 41.7 Disconnected honest descendants

Break an important upstream link in a trust cone that includes real people. Measure how many subjects become disconnected, how many remain connected through alternate paths, and what recovery process is needed. Do not count all disconnected people as fraudulent.

### 41.8 Chekharda escalation

Simulate rational truthful actors, careless actors, paid colluders, and participants who avoid risk. Measure whether higher XP and stakes correlate with stronger evidence and accurate outcomes. Test timeouts, appeals, stake capture, and targeted false accusations.

### 41.9 Council failure

Simulate a leading person accused of misconduct, Council recusals, a Council majority that refuses intervention, and a captured Council that publicly supports false claims. Track the economic damage before broader participants lose trust.

### 41.10 Atmo demand pause

Test a large Sybil outbreak with Treasury D active, reduced, and paused. Measure both attacker income and honest verifier participation. A buyback pause can reduce attack incentives but can also impair honest defense activity.

### 41.11 Relevant metrics

Measure, at minimum:

```text
honest_unique_active_subjects
false_or_duplicate_subjects_detected
undetected_false_subjects
N28 and invitation threshold
FACY minted / burned / converted / still on Emitter
FACY restricted for disputes
invite burns and guarantee fees
XP distribution / concentration / loss events
Council composition and conflict exposure
accepted, challenged, cancelled and invalidated Self-ID counts
guarantee and invitation cone connectivity
dispute cost, accuracy and time to finality
actual recovered financial penalties / unpaid debt
Treasury D capital spent / FACY acquired and burned
independent applications using Facety identity evidence
```

An attack-cost model should compare actual, not merely nominal, penalties:

```text
expected_attack_gain
    = market_value_realized_from_false_rewards
    + outside_benefit_from_fraud
    + dispute_manipulation_gain
    - real_setup_and_operation_cost
    - expected_collectible_monetary_losses
    - expected_value_of_lost_authority_and_access
```

The model also needs the utility and opportunity cost of honest observers. Protecting a network is not automatically rational for every participant, even when it benefits the community overall.

### 41.12 Simulation status

The repository's simulator implements the subset in the [coverage map](simulator.en.md#protocol-coverage), with declared assumptions for open mechanics. D33's topology and dynamic-Council design is not implemented; the fixed-101/raw-guarantor legacy reference remains explicitly identified rather than presented as conforming to every current selected requirement. The [insight register](insights.en.md) lists every finding with its evidence level and study. Findings labeled confirmed passed a preregistered test on reserved seeds; the others are exploratory maps.

## 42. Decisions still open before production

D33's [§46.13 conflict register](#4613-conflicts-supersession-and-proposed-resolutions) refines this earlier list: the numeric zero-count difficulty and dynamic Council lookup are now selected, while verification, genesis activation, topology factors, quotas, hysteresis and voting execution still need precise contracts. The earlier items remain for traceability and MUST be read with that supersession.

The following are gaps in the **protocol**, not discretionary coding choices. An implementer must not insert arbitrary defaults and then present them as Facety doctrine.

### A. Identity and evidence

1. Exact key recovery and proof that key changes belong to the same subject.
2. Canonical face detector, sorting, media normalization, and format-specific addressability.
3. Artifact availability and the legal meaning of public-domain publication assertions.
4. Whether an additional proof of real capture time is required beyond on-chain registration freshness.
5. Evidence rules for human uniqueness, impersonation, fabricated media, and twins.
6. Whether and how a known actor can retract a published artifact while preserving dispute evidence.

### B. Self-ID and Emitter

7. Exact same-subject reuse semantics on an already registered artifact (§14.4); terminal XP timing itself is selected in §17.5.
8. Minted escrow versus deferred mint, including exact supply accounting and custody.
9. Chronological reversal and later-credit semantics; terminal XP, not provisional effective credit, is selected in §17.5.
10. Guarantor authority snapshot versus current graph authority at the time of cancellation.
11. Precedence of an authorized guarantor cancellation and an open Self-ID dispute.
12. Freeze and appeal effects on age-based eligibility and finality.
13. Exact guarantee-commitment disposition of an Emitter emission.
14. Meaning of a terminal Emitter right when backing value was only temporarily reserved.

### C. Entry, guarantees, and graph

15. Bootstrap membership and `N28 = 0` handling.
16. What makes a guarantor active and eligible; limits on repeated links and reused guarantors.
17. How disputed or cancelled acts affect the rolling active-subject count.
18. Invitation target binding, expiration, acceptance, replay protection, and any cancellation remedy.
19. Amount, source, purpose and disposition of funds in the two-sided guarantee transaction.
20. Payer, destination and possible exception rules for the 1 FACY guarantee-break fee.
21. Connectedness policy, liability scope for upstream roots, recovery and alternative paths.

### D. Disputes, XP, and the Council

22. Exact XP rounding, event ordering, new-credit treatment after halving, and penalty finality.
23. Which participants in a losing side or guarantee chain receive XP penalties.
24. What makes a challenge admissible, including deadlines for different transaction types.
25. Stake asset, initial amount, escalation schedule and winning-stake distribution.
26. Execution bounds and deadline interactions; the selected finality window is 7 days after the last entry (§26.5), superseding earlier extension candidates.
27. Whether provisional XP can be used in a dispute that will itself become final before the source XP.
28. Council referral, membership snapshot, recusal, quorum and intervention threshold.
29. Merits decision procedure after Council intervention, and how it overrides or continues the ordinary Chekharda sequence.
30. Evidence thresholds for intentional fraud versus negligent guarantees.

### E. Money, operations, and safety

31. Financial penalty function, relation to proof-chain length, per-person caps and recoverable assets.
32. Debt collection versus token burn, repayment order, and identity abandonment.
33. Treasury D activation, pause and restart policy, credible health measures and market limits.
34. Bounded on-chain storage, indexing, execution weights, and migrations.
35. Privacy, access to identity media, safety of public artifact publication, and dispute evidence retention.

## 43. Suggested implementation sequence on DEOS

The following sequence is **[REFERENCE]**. It aims to prove the smallest complete economic and identity transitions before building the full social system.

| Stage | Deliverable | Required test |
| --- | --- | --- |
| 1. Framework alignment | Pin current DEOS runtime and SDK contracts. | Existing asset, Router, Actor, treasury and payment behavior are mapped to Facety needs. |
| 2. Artifact and FaceRef | Hash registration, timestamps, deterministic face indices. | Same canonical artifact produces the same references across supported clients. |
| 3. Self-ID and Emitter | NFT-like Self-ID plus exactly one emission right. | No double emission; correct one-day restrictions; cancellation while still unspent. |
| 4. Group Self-ID | Multiple separate signed claims on one artifact. | Two different subjects can claim different indices; duplicate index conflict is flagged, not rejected. |
| 5. Guarantees and invitations | Matching authorizations, dynamic threshold, earned FACY burn. | Purchased FACY cannot create invitations; guarantee links need both authorizations. |
| 6. XP and prevention | Personal and guarantor XP credits; free act cancellation. | Unspent bad act cancels without leaving illicit FACY or unjustified XP. |
| 7. Dispute engine | Ordinary challenge, Chekharda, monetary stakes, deadlines. | Valid XP escalation, freezes, deterministic outcomes and penalties. |
| 8. Council | Top-101 snapshots and intervention ballots. | One vote per member; apex disputes have a bounded review path. |
| 9. Financial sanctions | Real burns, recoverable debt, auditable XP halving. | No double collection or fictitious burns. |
| 10. Atmo demand interface | Treasury D purchase and burn under bounded policy. | Treasury limits, actual output burn, pause behavior and atomic local execution. |
| 11. Adversarial system tests | Agent-based model and fault-injection integration tests. | Honest-growth and coordinated-attack scenarios expose quantified outcomes. |

A UI and indexer should display the same canonical state as the runtime. They may enrich visibility, but they must not invent identity finality, balances, or Council results.

---

# Part IX: Condensed Protocol Constitution

## 44. Principles to preserve

1. **A subject is not a wallet.** An identity survives an authorized key change.
2. **A Self-ID is a signed, individually addressable claim.** Its media and FaceRef do not automatically prove unique personhood.
3. **One successful Self-ID can create one individual FACY emission and one personal XP credit.** Qualifying guarantors also earn XP when the emission is spent or withdrawn without cancellation.
4. **An Emitter emission is not ordinary liquid FACY.** It has a specific, one-time disposition.
5. **One day opens both network-building operations and Collector conversion; a new invitation is frozen for one more day.** Neither happens automatically.
6. **An unspent Emitter emission remains cancellable by an authorized guarantor.** Cancellation ends when the emission is used or converted, not merely when it ages.
7. **The guarantor can prevent one bad act without automatically revoking a real person's identity.** Responsibility for identity guarantees is separate from responsibility for individual Self-ID acts.
8. **A real guarantee needs both subjects' authorization.** Either party can end a relation under the fee and graph rules.
9. **An invitation consumes personally earned FACY and requires a size-dependent number of guarantors.** Market capital cannot directly buy the right to create invites.
10. **Group artifacts create independent claims about shared appearance, not automatic guarantees.** Duplicate face-index claims remain visible and disputable.
11. **XP is earned authority.** It is not money. Participants compete for it and risk losing it in public disputes.
12. **Chekharda escalates responsibility through strictly increasing XP and monetary stakes.** Higher XP grants a procedural role, not an automatic proof of truth.
13. **The Council of 101 gives equal votes to the largest XP holders.** It can intervene in disputes without becoming an unlimited single-person sovereign.
14. **Fraud can damage an accountable proof chain.** Disconnection and proven personal guilt must remain separate findings.
15. **Recorded debt is not a burned token.** Actual monetary supply changes require actual mint and burn operations.
16. **Facety's credibility is a public good.** Public misconduct by its most respected participants can destroy its legitimacy.
17. **Bucket D connects Atmo to Facety through an approved, bounded economic policy.** Atmo can buy and burn FACY, but cannot purchase historical XP or define human truth through market spending.
18. **The test of the design is behavioral.** The protocol succeeds only if honest participation is practical and large, profitable fraud becomes sufficiently difficult under realistic adversarial behavior.
19. **Vouch for people you know.** Guarantees flow through real acquaintance; requests from strangers are refused by default.
20. **A proven false identity cuts its whole chain.** Illegitimate coins and XP are removed, and liability spreads to those who stayed responsible for it.
21. **Everything is public by design.** Transparency is the defense and must be balanced against personal safety.
22. **Following the rules must be easy and profitable; breaking them must be hard and very unprofitable.** This holds at every step: identity acts, guarantees, invitations and disputes. The simulator checks it as the condition that fraud earns no premium over rule-following, together with honest welfare.

## 45. Final thesis

Facety proposes a different way to organize network growth.

A person brings a key, an image claim, and real social relationships. Continued Self-ID creates FACY and XP. Genuine guarantees let a participant expand the network and accept responsibility for the people it helps admit. Public disputes challenge false claims. Time, money, and accumulated XP make incorrect behavior costly. A small trusted community can build responsibility capital that later participants inherit as a protective social environment.

The application does not ask Atmo to decide who is human. It asks Atmo to support a credible and useful human network through bounded demand for FACY. **Bucket D is the controlled economic coupling between Atmo and Facety.** It can amplify growth without joining the two systems' internal governance or monetary rules.

The essential claim is not that trust can be created by software alone. The claim is that **software can record human commitments, reward durable cooperation, make false commitments costly, and expose the public process by which a community defends its own credibility**.

That is the proposed foundation of Facety as a protocol for social self-identification and as a network-effect engine for Atmo.

---

# Part X: Network Difficulty and Topology Safeguards (D33)

## 46. BrightID-inspired topology design

**D33 — [SELECTED / DIRECTION / OPEN], documented 2026-10-23.** Source: the owner's explicit design-discussion directive on BrightID-inspired topology, invitation thresholds and dynamic consuls. MUST statements below are selected design requirements; SHOULD statements are design guidance, and MAY statements identify permitted options. Formulas retain the status stated in their subsection; the weighted-factor product is a template, not a selection of factor scales. Unspecified verification predicates, factor scales, graph algorithms, epochs and voting procedures remain **[OPEN]**. This is a protocol-documentation decision, not an implemented runtime migration, independent BrightID audit, proof of Sybil resistance or empirical mechanism finding. “BrightID-inspired” credits the discussion's inspiration; it does not assert that these exact formulas or policies are BrightID's deployed rules.

The design serves D32's goal of distribution resistant to farming while keeping uniqueness, contribution/reputation and emission/distribution distinct. Topological support is not truth or useful contribution. A dense genuine community is not automatically a farm. Evaluator-only ownership labels MUST NOT become protocol observations. Oracle/evidence validity, Sybil inflation, collusion, arbitration/core capture, bootstrap vulnerability and real attack costs remain explicit research obligations.

### 46.1 Network Difficulty

The protocol MUST define dynamic **Network Difficulty** from the number of active verified participants over the rolling activity window:

```math
N = N_verified = number of distinct active verified participants
D = floor(log10(max(1, N))) + 1
```

For `N = 1..9`, `D = 1`; for `10..99`, `D = 2`; for `100..999`, `D = 3`; for `1000..9999`, `D = 4`; and so on. At `N = 0` the formula also returns `1`; this does not create a participant or a first guarantee. Implementations MUST evaluate decade boundaries exactly, for example through integer decimal digit count rather than imprecise floating-point logarithms.

`N_verified`, not raw account count or the number of repeated Self-ID records, SHOULD determine difficulty so that merely creating accounts cannot increase it. “Verified” means recognized by a declared protocol verification process, not evaluator knowledge that a person is genuinely unique. The verification predicate, disputed/frozen-state treatment and membership updates MUST be specified before enforcement. Verification itself can be wrong or captured; selecting this count does not solve Sybil inflation. The existing rolling activity window is 28 days unless explicitly changed.

Network Difficulty represents the required level of independent social confirmation for invitation rights and governance expansion. Section 46.10 distinguishes instantaneous formula targets from epoch-adopted values when hysteresis is used; the examples below are the direct formula reference.

### 46.2 Minimum guarantor threshold

The minimum number of qualifying guarantors for the **invitation creator**, not the invitee, MUST equal Network Difficulty:

```math
k = D
effective_independent_guarantors(user) >= D
```

Thus `k` is 1, 2, 3 and 4 for the four population bands above. The protocol MUST NOT impose a fixed minimum of 2, 3 or more regardless of network size. At `N = 2`, `k` MUST be `1`. This numeric threshold is not a promise that every two-node graph already contains a qualifying independent guarantee.

Raw incoming edge count MUST be distinguished from effective independent guarantor count. A guarantor contributing to invitation eligibility SHOULD satisfy all of these conditions:

1. It is not a descendant of the user in the invitation graph.
2. It is not part of the same closed low-conductance cluster.
3. It has sufficient external trust or external boundary connections.
4. It has been active for a minimum protocol-defined age.
5. It is not currently frozen, disputed or penalized under the applicable eligibility rules.
6. It accepts the economic or reputational liability of the guarantee.

The exact age, dispute admissibility, penalty expiry, independence and external-support tests remain OPEN. A mere unsupported allegation is not proof of misconduct; dispute-triggered exclusion needs anti-harassment safeguards and review. Exclusion from this eligibility calculation MUST NOT silently erase a guarantee, its history or its established liability. Existing matching consent for a directed edge remains required; consent does not create a reciprocal edge.

### 46.3 Bootstrap and genesis rules

The protocol MUST allow cold-start operation from a very small network. For `N < 10`, difficulty is `1`; a participant MAY become eligible with one qualifying guarantor, and the network MAY operate without a formal Council. Governance and dispute resolution SHOULD rely primarily on XP, public accountability, preventive cancellation, time delays and Chekharda-style escalation, subject to the no-special-authority rule in §46.5.

Early-bootstrap safeguards SHOULD include:

- A minimum account/activity age before issuing invitations.
- A limited number of pending invitations for participants operating at `k = 1`.
- A contest freeze for invitations; the existing selected duration is 24 hours, not a newly reopened timing default.
- Guarantor cancellation or freezing of eligible unspent emissions or invitations under explicitly authorized conditions.
- Limited early emission until the participant satisfies the current difficulty level.

These are design requirements for safeguards, not a new selected numerical emission schedule or an unrestricted guarantor power over spent value. Age, pending-invitation limits, additional freeze authority and early-emission limits remain OPEN. The selected one-unit eligible Self-ID reward and existing cancellation finality are not silently replaced.

When difficulty increases, existing participants MUST NOT lose identity status retroactively. They SHOULD obtain the additional effective guarantors before exercising new invitation rights. Activation times, grace periods and the treatment of already pending invitations MUST be defined prospectively.

At `N = 0` or `1`, a threshold of one does not supply a non-self guarantor. The genesis set, first verification, first guarantee, financing and any bounded exception remain OPEN under §13. The descendant/closed-cluster exclusions also need an explicit bootstrap interpretation: the protocol MUST NOT claim that the formula alone solves this dependency or assume permanently honest founders.

### 46.4 Dynamic Consul Council size

The protocol MUST define the target size through the rounded square root of difficulty:

```math
r = round(sqrt(D))
```

The selected lookup sequence is:

```text
r = 1 -> C_target =      1
r = 2 -> C_target =     11
r = 3 -> C_target =    101
r = 4 -> C_target =   1001
r = 5 -> C_target =  10001
r = 6 -> C_target = 100001
```

This is the stated lookup, not the repunit sequence `1, 11, 111, ...`. No extension or saturation rule for `r > 6` is selected; such a rule MUST be specified if that domain is admitted.

```text
N =             1..9        D = 1  sqrt(D) = 1       r = 1  C_target =   1
N =            10..99       D = 2  sqrt(D) ~ 1.414   r = 1  C_target =   1
N =           100..999      D = 3  sqrt(D) ~ 1.732   r = 2  C_target =  11
N =          1000..9999     D = 4  sqrt(D) = 2       r = 2  C_target =  11
N =         10000..99999    D = 5  sqrt(D) ~ 2.236   r = 2  C_target =  11
N =        100000..999999   D = 6  sqrt(D) ~ 2.449   r = 2  C_target =  11
N =       1000000..9999999  D = 7  sqrt(D) ~ 2.645   r = 3  C_target = 101
```

Actual membership MUST NOT exceed the active verified population. The protocol SHOULD use:

```math
C_actual = min(C_target, N_verified)
```

This is a population cap, not permission to fill seats with ineligible candidates. Filled seats MUST also be bounded by eligible candidates; vacancies, minimum functioning quorum and recusal handling remain OPEN. At `N = 0`, actual membership is zero even though the lookup target is one.

The protocol MAY reduce membership to an odd number not exceeding the applicable population/target cap, or define an explicit tie-breaking rule. It MUST define a tie rule if even membership is permitted. Odd rounding, vacancies and eligibility filters MUST NOT grant a lone remaining person the powers prohibited in §46.5.

### 46.5 One consul phase is not a formal Council

When the formula returns one consul, this MUST be interpreted as the absence of a formal institutional Council mechanism. The single-consul value is a placeholder, not a special office, extra vote, unilateral merits power or exemption from review.

In the direct formula reference, `N < 100` has no formal Council. Coordination SHOULD use XP, public accountability, guarantees, preventive cancellation, time delays and Chekharda escalation. At `N = 100`, `D = 3` and the target becomes 11: this marks the intended transition from direct social coordination to representative Council coordination.

**[HYPOTHESIS]** The owner describes the small phase as a high-trust environment below approximately Dunbar-scale limits, where direct social accountability is intended to be sufficient. Population size does not establish acquaintance, honesty, adequate attention or safe dispute outcomes. This is not evidence that direct accountability is actually sufficient. In particular, the maximum-XP participant still needs an accessible correction route; no formal small-Council fallback is invented here. Bootstrap apex review and phase behavior during hysteresis remain OPEN.

### 46.6 Effective guarantors and independent support

Raw incoming guarantees MUST NOT be sufficient for invitation eligibility. Define effective support:

```math
d_eff(u) = Σ weight(g -> u)

weight(g -> u) = trust(g)
              * age_factor(g)
              * independence_factor(g, u)
              * stake_factor(g)
              * dispute_penalty(g)
```

The multiplicative expression is a design template; its factor definitions, units, normalization and caps remain OPEN. The protocol SHOULD require:

```math
d_eff(u) >= D
```

It SHOULD discount or exclude circular guarantees; guarantees inside the same closed cluster; mutually dependent or newly created support; low-trust or disputed sources; excessive guarantor exposure; and nodes inferred from declared observations to be controlled by the same cluster. Hidden evaluator ownership MUST NOT be used to perform that inference.

A weighted support value MUST NOT let one wealthy or high-XP guarantor impersonate `D` independent sources. A resolution SHOULD either cap each independent source at one effective unit or retain a separate distinct-source-count gate alongside the weighted threshold; the precise rule remains OPEN. Economic/reputational liability is required, but `stake_factor` does not select mandatory token staking, purchasable XP or proof-of-stake consensus.

These factors concern support for a declared purpose. They MUST NOT silently collapse protocol XP, identity credibility, adjudication history, structural rank, acquaintance and finances into a universal trust score. Section 46.9 separately addresses the proposed Council-ranking adjustment.

### 46.7 Cluster boundary and invitation quota

The protocol MUST constrain invitation capacity of closed clusters. Let `C` be a cluster, invitation subtree or detected community. Define:

```math
B_eff(C) = Σ independent external support to C
```

The boundary MUST count independent external nodes, not raw edges. Multiple edges to the same external node SHOULD count as one source. Strong dependence among different external nodes SHOULD reduce their combined contribution. Cluster definitions, overlapping memberships and independence estimates MUST be explicit and contestable.

A cluster SHOULD issue invitations only if:

```math
B_eff(C) >= D
```

The protocol SHOULD assign the cluster quota:

```math
invite_quota(C) = floor(B_eff(C) / D)
```

For `D = 4`:

```text
B_eff(C) =  3 -> quota = 0
B_eff(C) =  4 -> quota = 1
B_eff(C) =  7 -> quota = 1
B_eff(C) =  8 -> quota = 2
B_eff(C) = 12 -> quota = 3
```

The intended effect is to prevent a closed cluster from turning a few external links into unlimited invitations. This is not established by the quotient alone. The protocol MUST define the accounting window, quota consumption/reservation/release, pending versus accepted invitations, reuse of external support across clusters, overlap and split/merge/reset behavior before enforcement. These choices remain OPEN; repeatedly renaming a cluster MUST NOT be assumed to create independent capacity. The existing own-emission burn and invitation contest window still apply separately.

### 46.8 BrightID-inspired graph topology rules

**Trusted seed or healthy core.** The protocol MAY maintain high-trust seeds, such as long-term participants, Council members or highly effective XP holders. Trust propagation SHOULD be weighted by proximity to this core. Core selection, rotation, correction and compromised-seed recovery MUST be explicit; proximity and founder status are not proofs of honesty or uniqueness.

**Independent degree.** The protocol MUST prefer independent effective degree over raw degree. Many edges or many paths with the same controlling source are not many independent confirmations.

**Conductance.** The protocol SHOULD evaluate the discussion's cluster-boundary ratio:

```math
conductance(C) = external_boundary(C) / internal_volume(C)
```

High internal density with low external conductance SHOULD reduce invitation capacity. The graph, edge directions/weights and meaning of `internal_volume` remain OPEN; this ratio MUST NOT be silently equated to a different standard conductance definition. Zero/undefined volume requires explicit handling, not zero-imputation. Dense genuine groups and weakly connected genuine newcomers require matched controls and review, not automatic identity invalidation.

**Min-cut and independence.** Clusters SHOULD have multiple independent external paths to the trusted core. A single bridge node SHOULD NOT support high invitation capacity. The path/cut independence definition MUST be specified; a reachability certificate alone does not establish independent people or honest sources.

**Community detection.** The protocol MAY periodically evaluate communities or invitation subtrees for internal density, external boundary, age, dispute rate, frozen emissions, shared guarantors, burst growth and dependence on single bridge nodes. Algorithms, update schedules, evidence provenance and contestability remain OPEN.

**Temporal analysis.** External guarantees SHOULD reach a minimum age before contributing to invitation rights. The protocol SHOULD detect guarantee bursts, sudden cluster growth, guarantees created immediately before invitation attempts and one guarantor inviting many participants in a short period. Detection is a review/eligibility signal, not proof of fraudulent intent.

**Negative edges and disputes.** Disputes, cancellations, penalizations and failed challenges SHOULD reduce relevant trust assessments for the affected participant, its guarantors and potentially its cluster under an explicit relevance/liability policy. Such assessments are not automatic XP halving, guilt by association or truth labels. Distinguish a malicious failed challenge from a good-faith error, a preventive cancellation from proven fraud, and pending allegations from final verdicts. Evidence thresholds, duration, propagation bounds, proportionality and appeal remain OPEN.

### 46.9 Council selection and voting

Council members SHOULD be selected by **effective XP**, not raw accrued XP. Beyond existing chronological credit/revocation/halving, the proposed eligibility/ranking adjustment SHOULD discount closed-cluster farming, circular guarantees, recently created networks, disputed/frozen accounts and guarantees lacking independent external support. This extends the design meaning of effective XP; no numerical topology discount is selected or implemented here. XP does not become a tradable token or universal reliability score.

The protocol MAY require candidates to satisfy both:

```text
effective_independent_guarantors(candidate) >= D
no unresolved critical disputes
```

Each consul has one vote. Ordinary Council decisions SHOULD require a simple majority; critical interventions SHOULD require a two-thirds majority. Even membership MUST have an explicit tie rule. Quorum, eligible/cast-vote denominator, critical-case classification, abstention, recusal, membership snapshots, rounding and case interaction with Chekharda remain OPEN; a vote to intervene is still distinct from a merits verdict.

The protocol SHOULD limit capture by any single cluster. A design example is: **no more than 20% of consuls SHOULD belong to the same invitation subtree or detected cluster**. This is a candidate cap, not a measured safe concentration. Group assignment, overlap, integer rounding, vacancies and an infeasible cap when too few independent groups qualify require explicit resolution. The protocol MUST NOT manufacture candidates or infer collusion solely from genuine community membership.

### 46.10 Difficulty hysteresis

The protocol SHOULD apply hysteresis so temporary activity changes do not cause oscillation or easy manipulation. Increases MAY take effect at the next epoch boundary. Decreases SHOULD require the lower count to persist for multiple epochs. A 28-day rolling count MAY be used; it is already the selected activity-window duration in this specification.

For clarity, the instantaneous formula value in §46.1 is the **target**, `D_target`. If delayed adoption is used, publish a distinct **current/adopted** value, `D_current`. Invitation eligibility MUST use a declared snapshot/value; the target MUST NOT silently be mistaken for an already applied threshold. The shorthand `k = D` refers to the applicable adopted difficulty at enforcement. Epoch length, decrease persistence, upward/downward ordering and activation/grace rules remain OPEN.

Difficulty changes MUST NOT retroactively invalidate identity status. Council phase/size must also have explicit timing: for example, `N` can fall below 100 while a delayed `D_current` remains 3. The strict small-network no-Council statement and an epoch-retained Council target then need a precedence rule. A proposed resolution is to publish phase separately and keep the `N < 100` no-special-authority safeguard while choosing how Council and invitation transitions use target/adopted difficulty. That resolution is not silently selected here.

### 46.11 Privacy consideration

Public guarantees expose social relationships. The protocol SHOULD support privacy-preserving proofs where possible so a participant can prove:

```text
I have at least D effective independent guarantors.
```

without necessarily exposing the full guarantor list to external applications. It MAY use zero-knowledge proofs, selective disclosure or encrypted graph commitments for external verification. Internal dispute resolution MAY reveal relevant relationships when necessary for accountable adjudication, subject to explicit authorization and personal-safety limits.

This refines D15's earlier no-ZK direction **for the external application interface**. It does not select an anonymous base ledger or erase public responsibility history. The public/private boundary, canonical committed graph, proof soundness, independence predicate, freshness/revocation, authorized disclosure and data availability remain OPEN. A cryptographic proof can establish a committed predicate, not the truth or unique personhood of the underlying claims. External proof minimization alone cannot conceal relationships already published under linkable identifiers; the disclosure design MUST state what an application can reconstruct from public history before claiming relationship privacy.

### 46.12 Canonical protocol addition

Facety MUST use dynamic Network Difficulty based on the number of active verified participants. The minimum number of effective independent guarantors required for invitation rights MUST equal Network Difficulty. The protocol MUST allow cold-start operation with one guarantor. For networks below approximately 100 active verified participants, the formal council mechanism MAY be absent, and coordination SHOULD rely on XP, public accountability, time delays, preventive cancellation, and Chekharda-style dispute escalation. At larger scales, council size MUST expand dynamically according to the rounded square root of Network Difficulty, using the sequence 1, 11, 101, 1001, 10001, 100001. Invitation capacity MUST be constrained not only by individual guarantors but also by cluster effective external boundary, independent support, temporal aging, and dispute history.

This owner-provided summary is interpreted with the exact phase rule, genesis limitations and unresolved transition contracts above. It is not a new allocation formula: one-unit Self-ID emission, non-transferable XP and accountable guarantees remain distinct from useful-contribution measurement and sustainable distribution. Success requires useful honest participation and correctable influence with bounded extraction, capture and wrongful exclusion; more graph edges, XP or payouts alone establish none of these.

### 46.13 Conflicts, supersession and proposed resolutions

- **Earlier §18.2 active-subject count versus verified count:** D33 selects `N_verified` as the design input and retains the decimal threshold. Proposed resolution: specify a publicly auditable verification/activity predicate without evaluator truth, then migrate count/guarantor eligibility. Until then, the simulator's active-accepted count is a legacy reference, not implementation of verified independence.
- **Fixed top-101 Council in §27/D3:** D33 supersedes fixed size prospectively with the selected lookup and no formal one-consul institution. Equal votes remain. Proposed resolution: parameterize Council target/phase after verification, eligible-candidate and case-transition rules are settled. Old 101-member simulations remain historical evidence under their original source and assumptions.
- **Effective XP and §23's no silent multiplier:** D33 explicitly introduces topology-aware selection guidance, not a complete new XP arithmetic. Proposed resolution: define bounded ranking/eligibility adjustments and test genuine dense groups alongside farms before adopting factors; preserve credit/penalty history and distinguish ranking from dispute authority.
- **D15's no-ZK wording and public evidence:** §46.11 permits privacy proofs to external applications while retaining accountable internal evidence. Proposed resolution: define the disclosure/commitment interface separately from base-ledger visibility; no unreviewed secrecy migration or mandatory ZK implementation is authorized.
- **Bootstrap exclusions and single-consul authority:** a one-guarantor threshold does not create a first independent guarantor, and lineage/cluster exclusions can block the intended small starting group. The entire genesis network has zero external boundary, so indiscriminate application of the quota also blocks growth. Proposed resolution: define which clusters are subject to the gate and a bounded genesis/aging transition and apex correction route without self-guarantees, omniscient verification or permanent founder immunity. Details remain OPEN.
- **Hysteresis versus instantaneous formulas and the `N < 100` phase:** distinguish target, adopted threshold and institutional phase; select activation/precedence explicitly. The direct formula examples do not authorize an unstated epoch policy.
- **Boundary quotas, weighted sources and the example cluster seat cap:** these are not enforceable budgets without normalization, persistent cluster/source accounting, quota periods and infeasible-cap handling. Proposed resolution: define those contracts and test reset/split, rented bridge and genuine-newcomer cases before implementation; never treat one source's wealth as many independent people.
- **Topology suspicion versus liability and truth:** low conductance, shared guarantors, a failed challenge or an allegation cannot alone prove a false identity or inherited guilt. Proposed resolution: keep eligibility observations contestable and use declared adjudication/authorized model transitions for sanctions. No mandatory stake, bought XP, verified-contribution reward or all-purpose trust score is selected.

The [simulator coverage map](simulator.en.md#protocol-coverage), [insight register](insights.en.md) and [backlog](../BACKLOG.md) record implementation gaps. No runtime change or new empirical evidence accompanies D33.

---

## Appendix A: Decision log and supersession ledger

This ledger prevents earlier drafts from being mistaken for the latest decisions. Git history holds the exact text changes.

### Decisions of 2026-10-22

| Decision | Status |
| --- | --- |
| One-day windows replace 3-day network use and 7-day Collector conversion. | **[SELECTED]** (§3, §17.3) |
| New invitations are frozen for 24 hours and cancellable by the creator's guarantors. | **[SELECTED]** (§18.5) |
| XP is credited at terminal disposition to the subject and its eligible guarantors; cancelled acts credit nothing. | **[SELECTED]** (§17.5) |
| The Council is the top-101 XP leaderboard among subjects active in the last 28 days. | **[SELECTED]** (§27.1) |
| Debt repayment keeps the guarantor veto window. | **[SELECTED]** (§17.3) |
| No mandatory media type; the same media cannot be reused; group media whenever possible. | **[SELECTED]** (§14.4) |
| Chain-cut sanction with a liability wave to the inviter and its guarantors. | **[DIRECTION]** (§21.1) |
| XP earned through a relation is revoked when the guarantor leaves it. | **[DIRECTION]** (§19.3) |
| Chekharda stake ladder: +g per position, each winner takes the stake below. | **[DIRECTION]** (§26.5) |
| A dispute is final 7 days after the last move; every entry restarts the clock. | **[SELECTED]** (§26.5) |
| Design principle: easy and profitable to follow the rules, hard and very unprofitable to break them. | **[DIRECTION]** (§44) |
| Guarantees flow through acquaintance; strangers are refused by default. | **[DIRECTION]** (§20.4) |
| Public, accountable market without zero-knowledge layers. | **[DIRECTION]** (§9) |

### Discussion reconciliation documented 2026-10-23

Source: the owner's A–T synthesis in the research/development mandate; this is the actual documentation date, not a retroactive decision date. [The insight register](insights.en.md#design-discussion-reconciliation-2026-10-23) preserves each item, its status, implementation/gap, falsifier and follow-up.

| Item | Status and canonical section |
| --- | --- |
| Coordination for mutual identification through mutual guarantees and public accountability; directed consent is not reciprocity | **[DIRECTION]** D31, introduction/§1; owner clarification documented 2026-10-23, not a change to rights or defaults |
| A–B: guarantee XP compensates responsibility; earned early advantage without immunity | **[DIRECTION]** D17/D16, §2, §23; high-XP behavioral quality is **[HYPOTHESIS]** |
| C–F: public history is not automatic accountability; reputation is not XP; future credibility and exit have opposing incentives | **[DIRECTION / HYPOTHESIS / RESEARCH INTERPRETATION]** §4, §9, §19.3; no invented utility or automatic reputational loss |
| G: multiple correction routes and appropriate early self-reporting | **[DIRECTION / OPEN]** D29, §20.5; no unlimited immunity |
| H–I: equal votes, active eligibility, no senior immunity; recalculation need not replace members | **[SELECTED restatement / RESEARCH INTERPRETATION]** D3, §27.1–§27.3; merits and active-case membership remain OPEN |
| J–M: motivated minority, external/low-XP discovery, qualified sponsorship, optional private compensation and nonlocal exposure | **[DIRECTION / HYPOTHESIS / OPEN]** D28, §25.1; no mandatory market, token or procedural-right bypass |
| N–P: source allegiance is not truth; dense genuine communities are valid; scalable exposure and network effects need mechanisms | **[RESEARCH BOUNDARY / HYPOTHESIS]** §21, §23, §25.1, §40.1; no guaranteed detection or quadratic honesty bonus |
| Q–R: bounded fraud requires a vector; investigate abuse-assisted obstruction and corrective exposure | **[DIRECTION / HYPOTHESIS]** D27, §9, §41.9; seats alone are not capture |
| S: reasoned precedent for boundary cases | **[CANDIDATE / OPEN]** D30, §27.5; not an approved new institution |
| T: retain corrected critique scope and conditional evidence levels | **[EDITORIAL / RESEARCH BOUNDARY]** intended senior-challenge routes exist; access/effectiveness still need tests |
| Same-subject artifact replay and concurrent stake backing reproduced at the audit baseline | **[DIAGNOSTIC MODEL FINDING / OPEN]** §14.4, §26.5; tested once-per-subject and funded-stake references do not silently become selected defaults |

### Strategic framing documented 2026-10-23

**D32 — [DIRECTION], §1, “Accountability for emission and growth.”** Source: the owner's explicit strategic-framing directive. Facety is evaluated as an accountability substrate for farming-resistant emission distribution, retention and network growth. Uniqueness, contribution/reputation and distribution remain separate layers. The flywheel and its inverse are **[HYPOTHESIS]**; oracle validity, Sybil attacks, collusion, arbitration capture, bootstrap vulnerability and attack economics remain explicit risks. This extends D16/D17/D27/D31 without selecting a contribution metric, changing emission/XP/stake rules or establishing readiness.

### BrightID-inspired topology design documented 2026-10-23

**D33 — [SELECTED / DIRECTION / OPEN], §46.** Source: the owner's explicit directive to permanently record the BrightID-inspired design discussion. Selected design requirements: `D = floor(log10(max(1, N_verified))) + 1`, invitation `k = D`, no size-independent floor of two or more, non-retroactive identity status, `r = round(sqrt(D))` with the lookup `1, 11, 101, 1001, 10001, 100001`, population/eligibility caps, no special authority for the one-consul placeholder, and independent rather than raw support. Guidance includes weighted guarantors, `B_eff`/quota accounting, core/degree/conductance/min-cut/community/temporal/dispute signals, effective-XP Council selection, majority/two-thirds voting, cluster capture limits and hysteresis. External privacy proofs MAY include ZK, refining D15 without selecting an anonymous base ledger. D33 supersedes D3's fixed Council target and refines §18.2/§23; §46.13 records conflicts and proposed resolutions. Verification and factor algorithms, genesis, quotas, epochs, phase transitions, quorum/merits and proof/disclosure contracts remain OPEN. This documentation adds no runtime implementation, new emission schedule or empirical confirmation; the simulator remains an explicitly named legacy reference until a separately validated migration.

### Earlier supersessions

| Earlier description | Status |
| --- | --- |
| 24-hour Self-ID cooling period from early discussions. | **Superseded** as the principal Emitter lifecycle; 24 hours still limits reward frequency and artifact-reference age. |
| Emitter restricted for 28 days before free withdrawal. | **Superseded:** first by 7-day conversion, now by **24-hour** conversion. |
| Network operations at 3 days. | **Superseded:** network operations at **24 hours**; still only special network-building uses, not ordinary transferable spending. |
| Guarantor cancellation during a fixed 28-day period. | **Superseded:** valid cancellation while the specific Self-ID emission remains **unspent on Emitter**; no cancellation after lawful consumption or conversion. |
| Self-ID emission described as a generic balance. | **Refined:** each Self-ID is an NFT-like individual act containing a one-time Emitter right; common FACY vault custody remains a reference implementation. |
| Separate personal media per Self-ID. | **Extended:** multiple subjects may reference one registered artifact within 24 hours and select deterministic indexed faces. |
| Reject a duplicate face selection automatically. | **Not selected:** both claims are recorded and the collision becomes publicly disputable. |
| Artifact public-domain checkbox optional for everyone. | **Refined:** first publisher asserts rights and public-domain dedication; later claimants need only the identity assertions. |
| Guarantor accountability treated as a single category. | **Separated:** responsibility for the guaranteed identity and preventive responsibility for a specific Self-ID act. |
| One-way guarantee transaction. | **Superseded:** a directed guarantee needs matching authorization from both parties. |
| Council as a higher judge that must process all hard cases. | **Refined:** Council can vote to intervene in any dispute but is not obliged to hear ordinary local cases. The subsequent merits procedure is open. |

## Appendix B: Sources and confidence

The primary source is the protocol owner's design decisions, recorded in this repository together with the simulator that tests them. Earlier design notes are superseded by this text. The document does not claim independent validation of these design rules in a shipped DEOS repository or independent proof of the economic hypotheses. Simulator findings are model results under declared assumptions.

Sections labeled **[REFERENCE]** or **[OPEN]** are deliberately not presented as previously selected protocol rules. Where a newer statement did not fully settle an issue, this text preserves the ambiguity rather than inventing a binding answer.

**Editorial note:** The document uses direct technical English and a controlled local terminology. It is not a certified ASD-STE100 publication.
