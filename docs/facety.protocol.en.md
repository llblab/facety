---
title: "Facety — Manifesto and Protocol Specification"
subtitle: "Human identity, social responsibility, procedural authority, and the economic growth of Atmo"
version: "living specification (maintained in the facety repository; history in git and Appendix A)"
date: "2026-10-29"
language: "English"
status: "Proposed protocol; not a claim of a shipped implementation or proven Sybil resistance"
source_basis: "Owner-selected design and dated decisions; open contracts and conditional research evidence are distinguished from protocol rules"
---

# Facety: Manifesto and Protocol Specification

> **Facety's strategic thesis is an accountability substrate for emission distribution and network growth—not merely a dispute protocol.** It coordinates mutual identification through mutual guarantees and public accountability to ask: “Who are we actually dealing with?” The aim is distribution resistant to farming that sustains honest participation and useful network effects. This is a deliberate evaluation lens, not demonstrated sustainability. Repeated identity assertions, earned non-transferable XP, economic consequences and collective disputes support that coordination; none alone defines it. XP rewards responsibility, not truth or purchasable voting weight. Anyone may discover evidence, while qualified participants accept formal challenge responsibility. Whether these routes keep earned influence correctable is the research question—not a promised outcome. Atmo support is a separate conditional integration.

**[DIRECTION — D31, documented 2026-10-23; owner-provided framing]** “Mutual” describes the social architecture. Both parties consent to a directed guarantee; that consent does not create a reverse guarantee. Guarantees, invitation lineage, acquaintance channels and reachability evidence have different meanings. A path never proves unique personhood. **Subsequent D82 clarification (2026-10-28):** this dated directed-record description does not permit guarantor XP without an established mutual guarantee; see the current XP/establishment rule in §17.5/§19.1. It does not select automatic reverse edges.

## How to read this document

This document is both a **manifesto** and a **technical design specification**. The manifesto explains the purpose and incentives. The specification defines the intended mechanisms and identifies the rules that still need exact parameters.

This is a **living specification**, not a numbered edition or a description of a shipped runtime. The main sections state the current design, including its unresolved contracts. Git history and [Appendix A](#appendix-a-decision-log-and-supersession-ledger) preserve decisions and supersessions. **Later explicit owner decisions take precedence; retained earlier rules are labeled historical rather than offered as competing defaults.** A selected rule can remain unimplemented, and a successful model run cannot select a rule.

### Self-contained living protocol (D40)

**D40 — [SELECTED documentary role], documented 2026-10-24.** The owner's directive is that this document stand on its own at the intersection of specification and manifesto, **not serve as the project's navigation hub**. It must explain what Facety seeks, how its human/economic mechanisms connect, what each operation means and what remains undecided. Self-contained does not mean complete or proven: an OPEN contract must be intelligible here without inventing its answer.

The manifesto supplies purpose and the conditions under which the proposal would fail. The specification makes that purpose inspectable through actors, rights, obligations, clocks, state changes and limits. Neither rhetoric nor implementation substitutes for the other. Supporting research can challenge the thesis; it does not redefine identity, rewards or authority by implication.

Repository navigation, executable APIs, task ordering and full experiment records belong outside this document. Optional references provide evidence and implementation detail, not missing definitions or rules needed to understand Facety. Project artifacts must identify the protocol question or rule they realize or test, state their deviations, and return supported findings or proposed decisions to this living design. This directive changes documentary ownership and coherence, not protocol economics or the authorization to deploy unresolved mechanisms.

### Status and time

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
- [Part V — XP, Public Disputes, and the Council](#part-v-xp-public-disputes-and-the-council): earned authority, halving, Chekharda, dynamic consuls and limits on apex judgment.
- [Part VI — FACY Economics and Atmo Integration](#part-vi-facy-economics-and-atmo-integration): deflation, debt, and Bucket D buyback-and-burn.
- [Part VII — Reference Implementation Contracts](#part-vii-reference-implementation-contracts): state records, example transitions, and protocol invariants.
- [Part VIII — Threat Model, Research, and Delivery](#part-viii-threat-model-research-and-delivery): adversarial tests, unresolved policies, and development sequence.
- [Part IX — Condensed Protocol Constitution](#part-ix-condensed-protocol-constitution): the rules and final thesis.
- [Part X — Network Difficulty and Topology Safeguards](#part-x-network-difficulty-and-topology-safeguards-d33): current D33/D35/D36 guarantees plus independent XP-centered paths, pre-guaranteed genesis, dynamic consuls and privacy; deferred cluster quotas remain labeled history.
- [Appendix A — Decision log and supersession ledger](#appendix-a-decision-log-and-supersession-ledger): dated decisions and what they replaced.
- [Appendix B — Sources and confidence](#appendix-b-sources-and-confidence): scope and evidence limits.
- [Appendix C — Research and development decisions](#appendix-c-research-and-development-decisions): research/development contracts, separate from the protocol's participant-facing rules.

## From identity work to a maintained network

A participant makes an ordinary rewarded signed Self-ID about fresh presence. Unlike D107's pre-registration zero Genesis Self-ID (no emission), that act creates one restricted FACY entitlement, not immediately liquid money or verified personhood. At the end of its 24-hour contest period, an uncancelled act earns the subject and its eligible guarantors 1 XP each, even if its value remains unused; the original free guarantor veto ends then (D42). The matured value remains the subject's own non-vetoable emission right, not an automatic Collector payment. Its holder separately chooses withdrawal or invitation use, subject to own-emission provenance and the independent-guarantee/path conditions (D42 clarification, 2026-10-24; §17.3). The invitation then has its own 24-hour freeze. D105 revises the special invitation price to1own FACY, no newborn payment/debt. D106 reserves one K slot at EACH endpoint on issuance. D107 addresses an already pre-registered account with completed fields and a zero Genesis Self-ID; that act only conceptually supplies the recipient-side channel opening, with no actual mint/burn, and no repeated issuance-eligibility check at acceptance. Admission/acceptance/activation and the newcomer's own identity work retain distinct explicit transitions; an unaccepted offer alone does not create mutual responsibility.

A guarantee joins compensation to responsibility: qualifying identity work can earn its guarantor XP, while the guarantor can inspect and prevent specific suspect acts. A genuine mistake need not destroy the relationship. Either party can end the guarantee under its separate fee/XP rules, but ending it does not erase responsibility for historical events under D34. Whether participants willingly maintain these relations, rather than avoid risk or conceal problems, is a hypothesis about human choices, not a result of credit arithmetic.

The hoped-for return is a useful network whose members keep participating and whose influence remains correctable. Emission alone is not that return. Applications must find the identity evidence useful under their own rules; Atmo's conditional support cannot establish its truth or usefulness. The economic accounting, duties, correction routes and application boundary below are parts of this one proposal.

## An evidence-to-correction example

An outside observer notices an inconsistency in a public identity assertion by an influential participant. The observer identifies the event and supporting observations without claiming that an allegation proves guilt. A qualified sponsor independently checks the package, may request clarification or refuse it, and accepts the work, stake and public responsibility of a formal challenge. The ordinary gate still requires more XP than the transaction owner. If that route cannot reach an apex participant, the intended collective Council route matters; its referral and merits details remain OPEN.

The accused can answer with evidence. A specified dispute procedure records a reasoned outcome, followed by only the consequences it authorizes: a chain cut, actual collectible losses and debt separately, XP changes, and independently chosen relationship withdrawal. A rejected accusation can instead cost its challenger. Revoking XP does not silently reverse decisions already executed. Other people may then learn from the public reasons; precedent mechanics are a proposal, not a selected court engine.

**Design versus implementation:** this example explains the intended route, not a complete deployed court. Economic/XP/relationship accounting and bounded fallible evidence/sponsorship references exist in the research simulator. They do not implement D34 historical-liability/voluntary-correction contracts, D33/D35/D36 verified topology, reasoned Council merits, compensation or institutional learning. Those missing contracts remain explicit below; neither simulated acceptance nor an illustrative verdict fills them in.

The final trust boundary is human collective judgment. Equal votes limit individual dominance but do not guarantee independent interests or honest decisions. The objective can be useful self-government with bounded fraud, provided safety, capacity, authority and recoverability remain acceptable—not perfect Sybil resistance, nor acceptance of any fraud level merely because people can disagree. Assess wrongful harm, access to correction, processing capacity, actually recovered losses and unpaid obligations, authority/obstruction and recovery separately. A low fraud balance alone does not establish useful self-government.

## Protocol at a glance

| Event | Human and economic rule |
| --- | --- |
| Ordinary rewarded Self-ID | At least1mutual guarantor; outside initial D91 bootstrap also Council reachability. Signed act creates1FACY entitlement, ordinary XP at24h (D42); no automatic withdrawal. |
| First 24 hours | The holder cannot use the emission. An authorized guarantor may cancel it for free during this window. A cancelled act earns no ordinary XP. |
| From 24 hours | The uncancelled act earns the subject and each eligible guarantor 1 XP even if unused. The original free veto ends. Invitation use also retains that credit and creates no second XP reward. The matured own right stays in place until its holder chooses withdrawal or invitation use; no automatic Collector movement. |
| Invitation | D105 inviter burns1own FACY, recipient0/no debt. D106 counts1slot at EACH endpoint from issuance; D107 pre-registered recipient has a zero Genesis Self-ID, no mint/burn. Issuance checks once, no acceptance recheck; special mutual link follows the selected pending/admission transition.≥Dmutual guarantors; outside initial D91 startup also D internally vertex-disjoint paths on the current mutual Council graph (D104), no mandatory invitation ancestry or cascade.24h freeze/no cluster quota retained. |
| Liability | A proven false identity voids its whole Self-ID chain. Its inviter and the guarantors liable at the relevant historical events owe the defined per-act sanction; under D34, later link termination does not erase past responsibility. Timely cancellation can prevent the defined act/invitation liability; exit limits future exposure, not past responsibility. Exact event/duty, overlap and recovery contracts remain OPEN. |
| Guarantee / valence | D93 creates a one-sided valence for immediate1own-FACY burn, even unanswered; only valid opposite valences establish ordinary mutual XP/liability. D94 own withdrawal leaves opposite open; recreate own for NEW1burn/current K, not a fresh opposite charge. |
| Dispute | Eligible challenger XP exceeds transaction-owner XP. Each later Chekharda position needs more XP and stakes a fixed percentage more (10–20%); each winner takes the stake of the position directly below it. |
| XP penalty | A liable loss can halve effective XP; monetary penalties can create collectible debt. |
| Council | D33 selects a difficulty-based target `1, 11, 101, 1001, 10001, 100001`, capped by active verified/eligible participants; target 1 is no formal Council. Each formal consul has one vote. The old fixed-101 design is preserved below as superseded context. |
| Atmo / network governance | D53 support remains separate. D74 records defaults; D100 counts own OPEN valences/invitations from creation, initial K100 referendum-adjustable with existing records/links preserved. D87 defers ballot assets; D88/D90 offer product/square-root internal vote weights (not adopted; root scope to confirm). D89 proposes pre-Council Chekharda-off startup, not a path-gate waiver. |

---

# Part I: Manifesto

## 1. A network of people, not a collection of accounts

Digital systems can create accounts at almost no cost. Accounts do not prove that distinct human beings control them. The difference matters for governance, distribution, trust, communication, and economic coordination.

Facety starts with a narrower claim: a subject represents one real, unique person. The subject can repeatedly make a signed claim about its continued presence. Other people can accept responsibility for that claim.

Facety does not make a photograph equivalent to proof of unique personhood. A media artifact, a signature, a social guarantee, and a resolved dispute supply different kinds of evidence. The protocol combines these elements. None is sufficient in isolation.

The objective is not a global moral score. Facety does **not** certify political views, wealth, social worth, or virtue. A guarantee concerns the identity claim and the responsibilities explicitly attached to it.

### Honest participation and incentive asymmetry (D50)

Facety is designed to make honest participation substantially easier and more profitable than identity fraud.

The protocol combines existing human relationships, earned authority, public accountability, preventive controls, and economic liability. These mechanisms aim to increase the cost and reduce the expected return of dishonest participation as the trusted network grows.

**D50 — [SELECTED manifesto intent; measurable research target, not a demonstrated advantage], documented 2026-10-24.** The owner selects the formulation above and places **10× incentive asymmetry** in the research objectives, not in claims of achieved performance. Distinguish the cost/difficulty of honest participation from its realizable net benefit; “ten times easier and more profitable” is not one self-evident ratio. Outcome, units, comparator, horizon, resource/utility assumptions and uncertainty must precede the numerical test. A profit ratio is not meaningful merely because fraud has zero or negative profit, and zero honest costs do not imply an infinite measured advantage.

The adversarial scope includes individual/coordinated Sybil farms **and long-lived coalitions of genuine people coordinating violations**. Genuine coordination alone is not misconduct. A significant weaker result would be sustained economic unprofitability of the tested fraud strategies while honest participation remains viable; a supported tenfold advantage would be a stronger result. Neither has yet been established. Preserve profitable attack counterexamples, honest losses, uncollected liability, uncertainty, untested strategies and horizons; no finite strategy menu proves universal deterrence. Application usefulness, private non-token benefits and actual human costs need their own evidence rather than an assumed XP price or subsidy. This direction changes no reward, penalty, admission requirement or D42 maturation rule.

### Structural trust must earn its growth cost (D49)

**D49 — [OWNER HYPOTHESIS and selected priority for the next major research result], documented 2026-10-24.** The owner identifies the decisive network-effect test: making the trust structure more demanding should increase network resilience faster than it reduces the network's ability to grow. This makes the resilience–growth trade-off central to evaluating Facety, rather than treating admission friction as a secondary implementation concern. It is a claim to test and potentially reject, **not an instruction to produce a favorable result or an already demonstrated property**.

“More demanding” must name actual trust requirements, dependencies and accountability burdens, not code volume, raw degree or accumulated XP. Resilience must protect legitimate participation, usable access and farming-resistant emission distribution under a declared adversary/evidence/resource model; a network that admits nobody or loses its honest participants is not thereby resilient. Growth must separate feasible funded admission, realized genuine participation/retention and independently justified usefulness. More accounts, emission or scripted willingness alone do not establish a network effect.

Compare the same supplied starting conditions, resources, demand and horizon under a simpler reference and explicitly named structural interventions, **both without attack and under comparable attacks**. This separates ordinary participation overhead from attack-induced loss avoided. Keep attack resources, honest work, admission delay/rejection, genuine harm, concentration/capture, fragmentation and monetary/XP consequences visible rather than hiding them in one safety or welfare score. Evidence must expose regions where added structure helps, ceases to help or locks the network into a closed/captured state. Network-effect claims additionally need a scoped account of how participation creates value for others; no such benefit follows automatically from membership or XP.

The exact complexity axis, attack/horizon family, growth/resilience measures, normalization and acceptable burdens remain **OPEN research contracts**. Quantities with different units cannot establish “faster” merely by subtracting arbitrary scores or percentages. D33/D35/D36 verified support, XP-centered paths and dynamic consuls retain their unresolved operational contracts; D34 historical liability and D42 chronology/maturation gates also remain. No migration, new reward/sanction, verified-person predicate, favorable calibration or historical rerun is selected by this priority. Existing small studies and act-level software can inform components but do not constitute this decisive test.

### Public participation and practical defense (D78)

**D78 — [OWNER audience clarification and practical-defense rationale, documented2026-10-27; not measured accessibility or a new identity oracle].** The intended audience includes real people willing to make their presence sufficiently public and form accountable invitation/guarantee relationships. Entry is not intended to be as frictionless as opening a conventional social-media account: an invitation and people accepting responsibility are part of the protection, not accidental UI friction. A person unwilling to accept that public/social commitment is not automatically in the project's intended audience; that preference is not fraud, proof of non-personhood or moral inferiority. Public participation does not require celebrity, a mandatory passport or a newly selected numerical publicity score.

The owner expects finding responsible contacts to become easier in a sufficiently large network. This is a conditional social-access hypothesis, not a proof that every genuine person can enter cheaply everywhere. Evaluate admission/retention burdens for the declared intended audience, and separately retain genuine people excluded or deterred by privacy/social/access costs; do not quietly reclassify them as attackers or remove genuine-growth friction to manufacture D49 resilience. Ordinary public identity evidence, the specific-act/identity distinction and the correction paths are stated in §25.2/§20.5; no perfect upfront personhood oracle or new data-collection permission follows.

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

### 2.1 Recruiting existing social capital (D51)

**D51 — [DIRECTION and falsifiable growth hypothesis, not demonstrated protection], documented 2026-10-24.** Real relationships precede Facety. An established participant can know a finite set of non-members through acquaintance, shared history, external reputation and existing communities. The protocol need not create those relationships; it can give the participant a reason to recognize, invite and maintain genuine newcomers. External recognition is evidence context, **not verified unique personhood or permission to skip admission**.

The intended incentive loop refines the earlier network-building compensation direction:

```text
existing off-chain acquaintance opportunities
    -> choice to recruit a genuine newcomer and fund an eligible invitation
    -> mutually authorized guarantees and maintained participation
    -> repeated uncancelled qualifying Self-ID acts
    -> applicable guarantor XP at each ordinary maturation
    -> greater prospective value of recruiting and maintaining genuine contacts
    -> a larger, responsibility-bearing network
```

**Invitation alone awards no guarantor XP.** That XP comes from qualifying Self-ID by the guaranteed participant under §17.5, with D42's cancellation-conditioned maturity and the applicable eligibility/relation rules. A relationship can continue producing such credits when recruitment pauses but its participant continues valid identity work; authority accumulation after growth stops therefore needs testing, not a presumption that a transient honest lead is permanent. Expected XP is procedural opportunity, not demonstrated reliability, external reputation or application value. D9 exit-credit effects and D34 historical duties remain distinct costs; unknown legal exposure is not zero risk.

An established genuine network may have a recruitment advantage over a new Sybil coalition because it already reaches real people and separate communities. **This is a hypothesis.** Genuine coordinating groups and fabricated-identity operations may also acquire dense connections and XP; equal-size/degree/resource and patient-coalition controls can defeat the proposed honest advantage. Finite acquaintances, time, willingness, declining marginal opportunities and responsibility limit recruitment. Choices must respond to observed opportunities and supplied preferences; fixed invitation rates or an offline utility maximum do not establish endogenous growth or human adoption.

Evaluate this incentive together with **both** difficulty-sized qualifying guarantees and internally vertex-disjoint XP-centered paths (§18.2/§46). These requirements may encourage bridges between genuine communities or instead block honest newcomers. Neither benefit is automatic. Verification, anchors, direction, genesis activation and epoch contracts remain OPEN; no new anchor, raw-degree replacement, deferred cluster quota or exemption is selected. Removing a required gate or guarantor rewards is only a labeled research counterfactual. D48 permits changing participation/intent as a research question; it does not prescribe increasing loyalty. Useful retention and Atmo/application demand need evidence beyond more subjects or XP.

## 3. Time is part of the security model

Money can move instantly. A credible history of human work cannot be bought instantly under the selected rules.

Facety deliberately combines different time scales:

- **24 hours:** the minimum interval between rewarded Self-ID acts by the same subject.
- **24 hours:** the allowed period to reference a newly registered shared artifact, measured from its on-chain registration time.
- **24 hours:** the ordinary contest/maturation window of a Self-ID emission. Its expiry credits XP for an uncancelled act and ends the original free guarantor veto, independently of spending or withdrawal (D42).
- **24 hours:** the freeze of a new invitation, during which the creator's guarantors can cancel it before the invitee is admitted.
- **28 days:** the rolling window used to count active subjects for the dynamic invitation threshold and for Council eligibility.
- **Months and years:** the accumulation of XP, social ties, public decisions, and responsibility.

These periods serve different functions. They MUST NOT be conflated.

**[SELECTED, 2026-10-22]** All contest windows are one day. A day is an understandable unit, long delays discourage people, and one day still gives guarantors time to stop a violating transaction. Two separate days apply: one to contest the emission (the Self-ID transaction that earns the coin) and one to contest its spending (the invitation transaction).

**[MODEL FINDING]** With one-day windows the simulated system stayed viable: fraud earned no premium over honest play, and honest people kept most of their fraud-free value. Fast payouts make an unchecked farm grow quickly, so vigilance pays. One-day windows assume that guarantors look at their people's new activity daily, for example through notifications. See the [social-trust study](../studies/2026-10-22-social-trust-threshold/README.md), section 6.

## 4. Reputation is valuable because it can be lost

XP is not a token. It is a non-transferable measure of identity work and **procedural authority**. A person can use XP to qualify for disputes. A leaderboard makes accumulated XP visible.

Long-term participation may create a large amount of XP. **[HYPOTHESIS]** That history may create social credibility and greater exposure when someone takes a false position; high XP does not define someone as informed, honest or long-term-oriented. Identity credibility, guarantee reliability, adjudication history, social recognition and protocol XP are distinct. A newcomer can have decisive evidence, and a respected investigator can be wrong. Reputation can be correlated, mistaken or manipulated.

A liable loser of a dispute can lose **50% of effective XP**. Repeated independent losses can halve effective XP again. The loss can remove access to future dispute opportunities and affect eligibility or rank in the difficulty-sized Consul Council.

**[HYPOTHESIS]** A participant with substantial legitimate XP, public history, and a large honest social network often has more to lose from deliberate fraud than from refusing it. This incentive is not universal. Collusion, indifference, coercion, and mistaken judgments remain possible.

## 5. Responsibility includes the right to prevent errors

Guarantors must not bear responsibility for another person's identity acts without a way to stop harmful acts before their economic rights are consumed.

An eligible guarantor can cancel a specific unspent Self-ID emission without paying a fee **before its 24-hour maturity** (D42). The cancellation destroys that emission right and its backing FACY under the selected monetary representation. Merely leaving the value unused does not extend the free veto beyond that window.

This is preventive accountability. It is separate from a later dispute that establishes liability and applies penalties. **D79 [SELECTED basic rule, confirmed2026-10-28]:** the author as well as an eligible guarantor may cancel the author's eligible still-pending Self-ID for free before24h, without a dispute (§20.2–§20.5). Cancellation does not return the author's rolling24h issuance slot: the next act is no earlier than the original recording time+24h, not cancellation time+24h and not immediate retry. This confirms D78's earlier candidate; it is not a renewed mature veto or a guarantor-link termination.

A guarantor can keep a long-term relationship with a real person while rejecting one invalid Self-ID from that person. A person can also unilaterally break an established guarantee link if the guarantor abuses cancellation power. D85 leaves the established-link termination price as free versus burning1FACY of any permitted origin; neither candidate is selected.

The protocol should make it easier to correct an error than to hide it.

## 6. Important disputes earn public attention

Facety uses **Leapfrog / Chekharda (Чехарда)**. A participant with more effective XP than the transaction owner can challenge an eligible transaction. Another participant can take the opposite side only by exceeding the XP of the preceding participant. Monetary stakes rise with escalation.

Small disputes can end near the people who know the evidence. Large disputes can attract people with significant public social capital. The visibility of a dispute rises with the XP and money placed at risk.

At the institutional scale, qualifying XP-ranked consuls form a Council whose target grows in steps with Network Difficulty, capped by the active verified and eligible population (§27, §46.4). Each formal consul gets one vote, regardless of XP magnitude. The one-consul target means no formal Council, not a sovereign individual. A formal Council may choose to intervene in a dispute without being required to hear every local conflict; small-network apex review remains OPEN.

Facety does not need an infinite sequence of higher courts. It accepts a final social assumption: if its most respected participants collectively abuse their position, the network can lose legitimacy. Publicly corrupt Council behavior is comparable, as a **trust failure**, to a monetary network abandoning a rule that made it credible. Loss of legitimacy is not a guaranteed method of repair.

## 7. Meetings can create stronger shared evidence

A group can register one media artifact. Each person shown can sign a separate Self-ID that references the same artifact and selects its own detected face.

The same artifact can thus produce multiple independent emission rights. The shared hash and separate signatures create mutually inspectable claims of co-presence. They encourage real meetings and joint identity work.

This is not biometric identification by the runtime. The software deterministically addresses a face region. People and the dispute protocol remain responsible for the truth of the corresponding human claim.

## 8. Atmo supports a human network, not merely a token price

DEOS supplies economic execution. Atmo is a network that uses DEOS. Facety is an application and a human-trust layer within Atmo. FACY is the Facety fungible token. XP is its independent measure of procedural authority.

The Atmo instance assigns **Bucket D** to a demand-generation policy. Bucket D is dormant until approved activation. Released capital enters **Treasury D**. Treasury D can buy FACY on the market and burn the acquired tokens. **D53 — [OWNER governance direction, 2026-10-24]:** Atmo governance using the **ATMO token** decides whether to authorize this economic support. This identifies the outside policy-control plane, not a completed ballot specification: voting weight, quorum, delegation, timing and execution permissions remain to be specified under Atmo's rules. FACY holdings and Facety XP do not themselves grant discretionary control over Bucket D; an authorization cannot bypass capital-release, Treasury budget or market-execution checks.

```text
Bucket D (Dormant)
    -> approved Demand activation
    -> capital release
    -> Treasury D
    -> controlled FACY market purchase
    -> actual FACY burn
```

This is a controlled interface between two economies, not a redemption promise. Atmo does not buy individual identity claims. D53's support interface influences aggregate FACY demand; it does not itself authorize changing Facety admission, identity, XP or dispute rules. D74 separately delegates the four expressly named parameter controls in §8.1, not arbitrary identity judgments or a general power to rewrite those rules.

If the Facety trust graph has serious Sybil problems, Atmo can slow or pause buyback. If the network recovers, the approved policy can restore the flow. This makes Bucket D an **economic isolation and coupling mechanism**, similar to an isolation transformer: financial support and internal identity adjudication remain distinct. A buyback pause is not an implicit D74 core-control activation.

The deeper marketing idea is that Atmo does not merely purchase attention. It helps create a reusable human coordination network. The network can grow through invitations, continued Self-ID, responsibility, and the applications that use its identity evidence.

### 8.1 Explicit Atmo core-parameter mandate (D74)

**D74 — [OWNER-selected parameter-governance scope and defaults; execution contracts OPEN], documented 2026-10-27.** Source: the owner's path-gate/core-test brief explicitly assigning four core parameters to voting at the Atmo level. This is a separately recorded extension beyond D53's authority over conditional financial support, not an interpretation that pausing Bucket D already controls Facety.

- **Open-authorization limit K — default100, referendum-adjustable (D100/D106).** Count own open valences and invitation-side units from issuance: EACH invitation occupies1slot at issuer AND recipient, even before acceptance. Ordinary matching charges no extra slot to a retained counted side. Existing paid records/links survive reductions; no refund/forced cut. Canonical status/duplicate/cutover handling remains an implementation contract, not an unresolved recipient-count choice.
- **Invitations — enabled.** Control over new invitations; treatment of existing mature own rights and already frozen/issued invitations remains OPEN.
- **Emission — enabled.** Control over new FACY issuance and associated XP production; the exact new-act/previously committed-act/credit cutoff and behavior during a pause remain OPEN.
- **Dispute opening — enabled.** Control over opening new disputes; existing cases, D72 entry into an existing case, shared timers and preventive act-specific vetoes require explicit separate treatment.

**D87 — [OWNER priority/alternatives and XP-use boundary],2026-10-29.** The essential selected capability is changing K through a network referendum; governance detail is deferred, not the next discussion prerequisite. Non-FACY base-coin control OR FACY-weighted Facety self-governance are alternatives, neither adopted. D74's earlier Atmo mandate/defaults remains dated context, not an implemented ballot or selection of either variant. D87 placed XP in dispute mechanisms/relative familiarity rather than parameter-vote weight. The subsequent conditional D88 candidate below qualifies that earlier exclusion; neither XP as transferable money nor a voting implementation is selected. XP remains neither truth nor usefulness. Dispute standing, Council's dispute role/equal votes and lack of path-anchor powers remain; no external governance/token action is authorized.

**D88 — [CONDITIONAL OWNER CANDIDATE],2026-10-29.** IF Facety has internal referendums, a proposed voter's weight is `FACY_committed_by_that_voter × XP_of_that_voter`. This is an offered weighting formula, not adoption of internal/FACY governance, a base-coin choice or a new Council merits vote. It qualifies D87's prior unconditional XP-weight exclusion for this candidate only; XP stays personal/non-transferable, not pooled money or evidence of truth. Define which FACY is actually committed (lock/burn/return), non-reuse across ballots, custody/source, voter/XP snapshot and chronological adjustments, eligibility/quorum/denominator/ties and execution before any implementation/research. No favorable security/economic claim, default or live governance action follows.

**D90 — [ADDITIONAL OWNER CANDIDATE; radical scope to confirm],2026-10-29.** The owner also proposes a square-root referendum weight. A working parenthesized display is `sqrt(FACY_committed × personal_XP)`; `sqrt(FACY_committed) × personal_XP` is a DIFFERENT formula and must not be silently substituted. The original unparenthesized wording leaves that scope to confirm before freezing a model/method. D88's product remains another candidate, neither adopted. Under the whole-product interpretation only, multiplying the product by4 multiplies weight by2 (an arithmetic illustration, not security evidence). No inference follows about capture, account-splitting, cooperation, market cost or effective recovery; personal earned XP is not a freely redistributable coalition budget. D88's custody/non-reuse/snapshot/quorum contracts remain.

These parameter names/defaults do not select a ballot implementation, instantaneous activation or an unlimited emergency mandate. The new controls' electorate, voting weight/quorum, proposal/authentication/execution authority, possible Facety-Council confirmation, health-evidence requirements, time-lock, duration limit and automatic restoration are OPEN. D53's ATMO-token support vote does not silently settle these controls' exact electorate or a proposed Council-plus-Atmo variant. FACY holdings and XP alone create no new outside authority.

D100/D106 make initial K100 a ceiling on own open valences PLUS issued AND received invitation-side units, not only mutual degree, incoming popularity, a fixed lifetime quota or Native K/V slots. A new owned increment must fit current K; retained counted sides need no extra slot to match. Reductions do not erase paid records/effective links/history/credits/duties. Both invitation endpoints are already counted at issuance (D106); exact record/status/duplicates/cutover/governance/failure contracts remain; own-emission flow does not define/refill K. No runtime/default counter migration is implemented.

A pause MUST NOT silently erase source/history, earned XP, pending contractual rights, liabilities, collateral or already-open cases. This preservation boundary does not decide every allowed future disposition: new-act admission, previously committed maturity/credit, in-flight invitations, existing dispute/Council/veto operation, execution order and resumption still need explicit contracts. “Stop opening new disputes” is not automatically “all correction is disabled,” but it is a material attack surface where correction may be needed most. No alleged unhealthy graph or public accusation automatically authorizes activation.

The ordinary autonomous core baseline keeps these controls fixed at their declared defaults and assumes no Atmo financial rescue. Governance capture/false-trigger experiments separately model actual acquisition/authorization costs and genuine losses, not free outside power or protection. D74 selects no automatic cluster quota, default runtime migration, monetary backstop, confiscation, emergency verdict, real ATMO transaction or proof of resilience. The T9 research direction under D73 must distinguish disabling issuance from entrenching existing XP holders and disabling correction.

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

### Changing participation and network loyalty (D48)

**D48 — [OWNER HYPOTHESIS and selected research direction; no transition law selected], 2026-10-24.** The owner proposes that participants **may become more loyal to the network over time**. A participant's behavior/intent profile therefore need not be an immutable good/bad type. This extends the D32 participation/growth question and D46–D47's act/observer model; it does not turn XP, membership age or repeated presence into factual truth, verified personhood or permanent honesty. A person's intent can change without rewriting the validity of past acts or erasing past responsibility.

For investigation, distinguish continued participation, willingness to inspect/respond/sponsor, and support for the network's rules from mere obedience to established members. Whether beneficial participation, perceived fairness, useful future opportunities or experienced costs change those choices is **[RESEARCH QUESTION]**, not a selected favorable feedback coefficient. Loss of confidence, reduced participation, concealment and attachment to one's own group are **[COMPETING RESEARCH EXPLANATIONS]**, not owner-selected outcomes. No monotone age/XP loyalty bonus, new reward, automatic forgiveness or mandatory service is introduced. Evidence must distinguish supplied preferences and scripted behavior from observed learning, voluntary retention and independently justified usefulness. The behavioral state, observable experience inputs, update law, heterogeneity and human calibration remain OPEN; native implementation is absent. D51 recruitment/maintenance experience and D52 scrutiny or harassment may change later choices in either direction; neither loop establishes that loyalty grows. Fixed-profile, no-feedback, time-only and group-allegiance alternatives must remain distinguishable.

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

Facety is not required to run as a separate blockchain. The target is the Atmo runtime based on Substrate/Polkadot SDK and DEOS mechanisms. **DEOS Actors** here means bounded runtime execution infrastructure, not the human participants whose identity claims Facety records.

No section of this document implies that a named Facety pallet, actor, API, or storage item is already shipped.

## 11. Canonical concepts

**Subject (`SubjectId`)** — A persistent on-chain identity intended to represent one real and unique person. A subject can have authorized keys, a history, current guarantees, XP, debt, and identity status.

**Identity key** — A cryptographic key associated with a subject. The signature on a transaction proves control of the signing key, not human uniqueness.

**Artifact (`ArtifactId`)** — A registered media object addressed by content hash or CID, with an on-chain registration time and a publication-rights assertion.

**Face reference (`FaceRef`)** — A stable reference to a detected face in an artifact. At minimum it includes artifact identity, detector version, and deterministic face index.

**Self-ID** — An immutable, individually addressable record of a subject's signed identity assertion, linked to a specific artifact and FaceRef. It has a mutable dispute state and, for an ordinary rewarded act, a one-time emission right. It has **NFT-like semantics** but is not necessarily a transferable NFT-standard asset.

**Zero Genesis Self-ID (D107)** — The initial signed Self-ID of a pre-registered account, published with the required completed fields before an invitation can target its address. It creates NO FACY emission/right to spend and performs no actual burn. It conceptually supplies the recipient's invitation-channel side, not a paid ordinary valence, debt or subsidy; it is distinct from the network's founding genesis population. Publication alone is not protocol admission, verified personhood or an activity-count decision. No XP/chargeable-N/ordinary rolling-slot policy is inferred from this choice.

**Emitter** — The one-time emission-right state associated with a Self-ID. It defines whether the related FACY is restricted, available for network use, disputed, cancelled, consumed, or converted.

**Collector** — The ordinary fungible FACY balance or destination to which an eligible Emitter emission can be converted after 24 hours. The term is a protocol role, not necessarily a separate token or chain.

**Guarantor** — A subject that explicitly accepts responsibility for another subject's identity under an established guarantee relation.

**Valence** — A paid, one-sided request to guarantee a particular account (D93): creation immediately burns1own-issued eligible FACY. It can remain open without an answer and is not mutual responsibility or guarantor XP.

**Guarantee relation** — Established mutual responsibility from two valid opposite valences, or D92's accepted special invitation. Ordinary matching/current-K checks and canonical signed records are required, not raw legacy reciprocal graph edges. D94 withdrawal removes only one's valence and preserves the opposite; history survives. The earlier directed-only model is dated history, not the current XP/liability rule.

**Invitation** — D105 special admission paid by1eligible own-issued FACY from the inviter, recipient0/no debt. D106 occupies1slot at each endpoint on issuance; D107 requires the target's completed pre-registration and zero Genesis Self-ID, with issuance-only eligibility validation. Acceptance establishes a first mutual inviter–newcomer link with distinct inviter provenance/responsibility. Initial D91 bootstrap requires≥Dmutual guarantors; outside startup also Dinternally vertex-disjoint current mutual Council paths (D104), with no mandatory invitation-chain member or long-ancestry check. Pending invitation, lineage and established mutuality remain distinct canonical records.

**Active subject** — A distinct subject with a qualifying Self-ID during the previous 28 days. Counting a subject once does not establish a unique human. The exact treatment of disputed or cancelled acts is OPEN.

**Active verified participant** — An active subject recognized under a declared protocol verification process. The verification predicate and status updates remain OPEN; neither evaluator knowledge nor raw account count supplies this status.

**Network Difficulty (`D`)** — The applicable difficulty based on the active verified count, with direct target `floor(log10(max(1, N_verified))) + 1`. If hysteresis is used, the adopted difficulty must be distinct from the instantaneous target; transition rules remain OPEN.

**XP credit** — One unit of earned identity work, from an eligible personal Self-ID or a qualifying Self-ID by a guaranteed subject.

**Effective XP** — The current XP measure used to rank subjects and authorize participation in disputes after the penalty history is applied.

**Dispute** — A public challenge against an eligible protocol transaction, with positions, XP gates, monetary stakes, evidence, time rules, and a conclusion.

**Chekharda / Leapfrog** — A sequence of alternating dispute positions with strictly increasing participant XP and growing stakes.

**Consul Council** — The qualifying XP-ranked collective body, with a difficulty-dependent target, population/eligibility caps and one equal vote per formal member. A target of one means no formal Council. **Council of 101** is the historical fixed-size design, not the current universal target.

**Trust cone** — A directed, time-ordered part of the invitation and guarantee graph that depends on one or more upstream identity claims or entry paths.

**Disconnected subject** — A subject that has lost an accepted trust path. It is not automatically an impostor.

**Emission debt** — A negative protocol obligation that reduces future eligible economic rewards. It is not a negative quantity of already issued circulating FACY.

## 12. Distinct graphs

Facety records several related structures. They MUST NOT be merged into one undifferentiated edge type.

| Graph | Edge meaning | Consequence |
| --- | --- | --- |
| **Invitation lineage** | Subject A invited subject B. | Entry provenance and possible upstream risk. |
| **Guarantee graph** | D83/D84 established mutual responsibility links; canonical authorized records required. | Mutual guarantee responsibility and the declared reachability gates, not raw reciprocal-edge proof. |
| **Co-appearance graph** | A and B made signed claims that reference the same artifact. | Additional evidence of reported shared presence, but not a guarantee. |
| **Dispute graph** | Participants supported, challenged, or appealed recorded claims. | Public procedural history and liability. |

An edge in one graph MUST NOT automatically create an edge in another. For example, appearing in a group photo does not create a mutual guarantee.

## 13. Subject lifecycle and initial trust

**[SELECTED — D35, 2026-10-23]** The starting route is an explicit small genesis group with its already established guarantees, now represented explicitly as mutual relationships under D83/D84. Roughly 7–12 people who know one another is illustrative, not a required population or complete graph. Genesis is a supplied initial trust assumption, not proof of personhood, ordinary funded admission or permanent founder immunity.

The genesis record must identify actual subjects and established mutual relationships; old directed records need a declared mapping, not inferred reciprocal authorization. **[OPEN]** Verification/activity, authorization evidence, initial XP/balances/emission rights, financing and activation of ordinary guarantee/path checks still require a contract. Already established guarantees resolve how the chosen starting route obtains its first links; they do not create free money or XP. The normal decimal difficulty remains: 7–9 active verified founders imply `D=1`, and 10–12 imply `D=2` (§46.14).

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

**D107 — [SELECTED pre-registration/zero Genesis act],2026-10-29.** Before receiving an invitation the account is ALREADY pre-registered, has completed the required fields and published its zero Genesis Self-ID. The invitation is addressed to this existing account/address, not issued into an unbound pool for a later arbitrary person. The zero act does NOT print FACY, burn FACY, create a spendable Emitter entitlement or incur invitation debt. Its conceptual use as the recipient-side channel opening is not a monetary transaction or an ordinary paid valence. D84 below concerns ordinary REWARDED Self-ID, not a circular requirement to obtain a mutual guarantor before publishing this zero act. Canonical fields/signatures/address binding and zero-act XP/chain-N/ordinary rate-slot semantics need an implementation contract; no arbitrary field list, extra subsidy, personal-data collection authority or default migration follows.

**D84 — [SELECTED eligibility distinction],2026-10-29, with D91 bootstrap exception.** A new rewarded Self-ID needs at least ONE established mutual guarantor. Outside D91's INITIAL bootstrap, that guarantor must have a mutual-guarantee path to an admissible Council member. D guarantors AND independent paths are instead required for invitations (§18.2). Prior admission is not a permanent support exemption; unilateral offers do not qualify. D91 selects the initial no-Council path waiver (§46.14); exact phase/count snapshots, first100 activation, bounded verification and same-time changes still need contracts. This conditions NEW acts, not retroactive erasure of identity/XP/sources; D77 and evidence/24h rules remain.

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

D105 invitation creation from 1 eligible own right after 24 hours:
    burn its backing unit (1 FACY total), not a mint
    mark the source Self-ID.emission = UsedForInvitation
    target the D107 pre-registered account/zero Genesis act; mint/burn NOTHING for it
    allocate 1 invitation-side K unit to EACH endpoint (D106)

Collector conversion after 24 hours:
    transfer its 1 FACY from the Emitter vault to Collector
    Self-ID.emission = Converted
```

**D93 clarifies D83,2026-10-29:** successful creation of each one-sided valence IMMEDIATELY burns1eligible self-issued FACY, even if never answered (§19.2). A fresh ordinary pair accounts for two paid valences/2FACY, not an atomic fresh2burn at every activation or a refundable bond. D94 can restore mutuality with a retained opposite valence without charging it again. D105 now burns1own FACY from the inviter, none from the recipient; D107 zero Genesis is conceptual counterpart support, not a second real burn. Existing maturity/provenance and atomic failure handling remain.

### 17.3 The one-day schedule

This schedule describes ordinary emission-bearing Self-ID. D107's zero Genesis Self-ID has no FACY issuance to mature/spend; do not silently turn it into a funded source or infer its XP/rate-slot policy from the ordinary table.

**[SELECTED, D1; clarified by D42 on 2026-10-24]** Let `age = chain_time - SelfId.recorded_at`. The one-day schedule replaces the earlier 3-day / 7-day schedule. **D42 selects age-based maturation, not spending-triggered XP or an unlimited unspent-right veto.**

| Age/state | Ordinary use and network use | Free preventive cancellation | Ordinary XP |
| --- | --- | --- | --- |
| `0 <= age < 24 hours` | No owner spending or withdrawal. | Author or eligible guarantor, while cancellable/unspent (D79). | Not yet earned. |
| `age >= 24 hours`, ordinary uncancelled act | The matured own right remains in place without automatic withdrawal; its holder chooses Collector conversion or eligible invitation use. | **No**, even if the value remains unused. | Once: +1 to the subject and +1 to each eligible guarantor, without waiting for an operation. |
| After invitation use or withdrawal | Cannot spend the same backing again. | Cannot cancel the original matured emission through this veto. | No second credit for spending or withdrawal. |

The owner's phrase “a normal irrevocable coin after one day” selects maturity against the **original free guarantor veto**, not immunity from adjudicated fraud, sanctions or an authorized dispute freeze. D42 does not abolish the separate 24-hour invitation freeze or permit invitation spending before emission maturity.

**[SELECTED D42 clarification, 2026-10-24] No automatic withdrawal.** After 24 hours the subject retains its own matured, non-vetoable emission right. The holder separately chooses withdrawal to ordinary Collector FACY or spending that own right on an eligible invitation. XP credit and expiry of the original free veto occur at maturity without waiting for that choice; neither subsequent operation credits XP again. Maturation MUST NOT itself move the backing into the ordinary Collector balance. Own-emission provenance, one-time use and the prohibition on market-funded invitations remain intact.

**D42 preventive-maturation clarification, 2026-10-24 — [SELECTED meaning, not a new rule].** Cancellation and ordinary maturation are branches of **one conditional 24-hour boundary**, not independent reward and veto processes. The holder's reward vests only if the original act was not validly cancelled during its initial window. Under a minted-escrow representation the restricted backing may already exist at recording; maturation does not mint it again.

```text
Self-ID recorded at t0
    -> before t0 + 24h: eligible free cancellation; no owner spend/withdrawal
        -> cancelled: emission right invalidated; no ordinary maturation XP
        -> uncancelled at ordinary maturity:
             original free veto ends
             subject +1 XP; each eligible guarantor +1 XP, once
             own emission right matures and remains with its holder
             no automatic Collector transfer
                 -> later withdrawal OR eligible invitation use
                 -> neither disposition awards another Self-ID XP credit
```

**D79 — [SELECTED,2026-10-28] Cancellation retains the original rolling slot.** Recording at `t0` uses that subject's rolling24h issuance slot even if the author or guarantor later cancels the act. A cancellation at `t0+23h` permits the next otherwise eligible act at `t0+24h`, not immediately and not at `t0+47h`; cancellation at `t0` also cannot permit a new act before `t0+24h`. Retain the original recording/cooldown history across cancellation, artifact/face/key changes and D56 chain positions. This limits repeated issue/cancel/reissue under one subject; it is not a universal network DoS proof, extra cancellation cooldown or a waiver of other eligibility/transaction limits.

The independence in D42 concerns **later disposition**, not independence of cancellation from the right/XP maturation condition. The invitation has its own separate 24-hour freeze after its creation. Cancelling that invitation does not by itself retroactively cancel the already matured original Self-ID or its XP; any such effect needs a separately specified rule. This ordinary diagram chooses no precedence for frozen/disputed acts, debt, link changes or same-hour competing events, and is not a native migration.

**[OPEN implementation details]** The final mint/escrow representation, disputed/locked maturity, debt and same-time event ordering, relation eligibility and prior-credit effects still require a migration contract. The no-automatic-transfer choice is resolved; these remaining details do not reopen it.

**[SELECTED, D4] Debt recovery keeps the veto window.** A debt-reserved Self-ID must retain its full initial 24-hour veto opportunity before recovery consumes the reserved value. D42 bases ordinary XP on maturation, not an early or late recovery call. Freeze, debt-settlement and same-time credit/penalty ordering require a migration contract; no new repayment amount or recovery priority is selected here.

**Historical rule superseded by D42:** an unspent Emitter right formerly remained freely cancellable until consumption/conversion. It now loses that free veto when its 24-hour maturation window ends, even if left unused. Later adjudicated consequences remain separate.

### 17.4 Dispute freeze

**[SELECTED]** If an eligible dispute targets a Self-ID, its emission becomes frozen for the duration of that dispute. The owner cannot use it for invitations, guarantee operations, or Collector conversion until the dispute is resolved.

A freeze MUST preserve the original emission disposition and history. It is a procedural lock, not a second economic right. If a guarantor cancellation is also attempted while the act is disputed, the runtime needs a defined precedence and termination rule **[OPEN]**.

**D77 clarification — [SELECTED participant activity restriction, 2026-10-27; §26.5].** While a dispute is open, **no participant in that dispute may create a Self-ID, issue a new invitation or open a new guarantee**. This is not an accused-only rule. For a participant, new Self-IDs during that participation interval are prohibited, rather than permitted under an invented rule for freezing their later emission. The rest of the network is not thereby paused. This supersedes the 2026-10-27 question of letting that participant keep recording new Self-IDs and choosing which of their future rights to freeze; it does not retrospectively reclassify earlier records or evidence.

**[OPEN — existing-right/custody execution mapping.]** Bind attachment if the disputed emission was already converted, and the treatment of rights already recorded before a participant entered, including frozen/precredited XP, custody, veto precedence and eligibility. D77 does not answer those questions, authorize automatic third-party seizure or change ordinary D42 maturation/withdrawal. A financial reservation or trusted source-reversal preview does not establish an admitted case or its participant roster. The participant restriction and the original emission lock are separate obligations; neither is a second economic right.

### 17.5 Reward and rate limit

**[SELECTED]** A subject can receive at most one normal rewarded Self-ID per rolling 24 hours, regardless of key rotation. A valid act provides:

**D82 — [SELECTED mutual-guarantee prerequisite for guarantor XP], documented2026-10-28.** The owner clarifies: proposing to vouch is not having established a guarantee; without an established mutual guarantee there is no guarantor XP from the other person's Self-ID. Unilateral votes/offers, an uncompleted activation, or mere acknowledgment of a directed proposal are not an alternative XP-earning relationship. Mutual establishment is necessary, not by itself a credit event: an eligible role must belong to the particular new Self-ID's creation-time roster, followed by that act's ordinary D42 maturity/cancellation rules. Later establishment does not backdate that roster. This concerns GUARANTOR XP from another person's act, not the author's own XP or a new ban on own emission. D54 pending rights after exit and separate D9 older-credit treatment remain; no requirement to hold a link for an extra24h is selected. Canonical mutual activation/records, funding, other permissions and general eligibility remain separate execution contracts. Existing directed-reference XP/code/results remain legacy, not D82 evidence or a default migration.

| Recipient | Reward |
| --- | --- |
| Subject that created the Self-ID | 1 FACY on the Self-ID Emitter. |
| Same subject | 1 XP credit. |
| Each eligible guarantor for that act | 1 XP credit. |

Guarantors receive XP, not an automatic FACY mint, for that act.

**D42 — [SELECTED, documented 2026-10-24] Age-based XP.** In the ordinary uncontested lifecycle, an uncancelled Self-ID earns **1 XP for its subject and 1 XP for each eligible guarantor when 24 hours have elapsed since recording**, whether its FACY remains unused, is spent on an invitation, or is withdrawn. Spending/withdrawal is not the credit trigger and MUST NOT create a second credit. An act cancelled within the initial window earns no ordinary maturation XP. At maturity its original free guarantor veto ends. The existing recording-time eligibility basis and D9's relation-credit revocation must be reconciled explicitly for link changes and same-time events; D42 does not silently choose a new guarantor snapshot. Unresolved dispute/freeze effects remain OPEN (§17.4).

**D2 historical rule, superseded:** the 2026-10-22 rule credited XP on terminal consumption/conversion. Its simulator implementation and source-bound studies remain historical references; they do not implement D42.

### 17.6 Emission finality is not immunity

Cancellation, conversion, and subsequent punishment are different operations:

- **Preventive cancellation** invalidates an eligible unspent Self-ID within its initial 24 hours and burns the associated Emitter FACY under the minted-escrow representation.
- **Maturation (D42)** ends the original free veto and credits ordinary XP at 24 hours, independently of use. It is not an adjudication of truth.
- **Collector conversion** is the holder's separately chosen withdrawal of matured value, not an automatic maturity event or the XP trigger (D42 clarification).
- **Network use** irreversibly consumes the emission instead of converting it; an invitation does not forfeit or duplicate its matured Self-ID XP.
- **Later dispute** can still establish an identity violation and apply defined financial and XP penalties. It cannot simply pretend that a spent emission remained available to burn.

The system MUST record a terminal emission disposition exactly once.

---
# Part IV: Invitations, Guarantees, and Graph Responsibility

## 18. Admission through invitation

### 18.1 Invitation conditions

**[SELECTED]** An invitation is not free and cannot be mass-produced by buying FACY on the open market.

The creator MUST:

1. Have a valid Facety subject with the right to create invitations.
2. Have at leastDqualifying established mutual guarantors. Outside initial D91 bootstrap, ALSO satisfy the independent mutual-path/Council threshold (§18.2); verification/snapshots remain explicit.
3. Control **one unspent eligible Self-ID emission earned by that subject**, aged at least24hours (D105).
4. Address an ALREADY pre-registered account with completed required fields and its published zero Genesis Self-ID (D107).
5. Fit the new invitation-side increment into BOTH endpoints' current K and allocate1slot to each on issuance (D106), not only to the sender or on later acceptance.
6. Burn **1own FACY** irreversibly at creation; the recipient pays nothing and receives no invitation debt (D105).
7. Record the bound invitation, both counted side units and its authorization atomically.

A FACY unit bought, gifted, received from a transfer, or received from another subject's Self-ID does **not** provide invitation eligibility. A unit already converted to normal circulating FACY on the Collector does not regain Self-ID provenance through a market purchase.

The restriction applies to the **origin of the emission right**, not merely the current wallet balance.

**D107 — [SELECTED validation timing],2026-10-29.** Validate invitation eligibility at its issuance transaction, not again at later acceptance. Subsequent loss of issuer support/paths does not retroactively fail that already issued invitation, require a second current support/path test or reserve the same K units again. Future NEW transactions use their own current state. Preserve actual record/cancellation/delay transitions, not a new assumption that a cancelled invitation can be admitted. This choice does not waive the ordinary future Self-ID gate or D77/source restrictions. Remaining same-time/status implementation detail is not a new owner-selected policy or a reason to reopen this settled validation timing.

### 18.2 Dynamic guarantor threshold

**[SELECTED — D33/D35/D36 target,2026-10-23; D104 ordinary current-mutual path family,2026-10-29]** Let `N_verified` count distinct active verified participants over the rolling 28-day activity window, not accounts, repeated acts or evaluator-known genuine people. The direct difficulty target is:

```text
D_target = floor(log10(max(1, N_verified))) + 1
D = the applicable adopted difficulty under the declared transition policy
qualifying_independent_guarantees(creator) >= D
if outside_initial_D91_bootstrap:
    qualifying_mutual_internally_vertex_disjoint_paths(creator, Council_anchor) >= D
```

**D104 — [SELECTED simplified invitation gate],2026-10-29.** At NEW invitation issuance, require at leastDqualifying established mutual guarantors AND Dqualifying internally vertex-disjoint paths to admissible Council membership through the CURRENT mutual-guarantee graph. NO path is required to follow invitation ancestry or have an invitation-kind witness. This supersedes D102's mandatory invitation-chain member; D103's current-valid-graph-only rule remains. Invitation-origin mutual links may qualify like other current mutual links, but old invitation records, unanswered offers and bare stored reciprocal edges do not supply authorization.

Keep D36 independence across the whole family, D91 initial-bootstrap path waiver and D84 Self-ID support/reachability. No long invitation-ancestry check is required for invitations or Self-ID, and no downstream cascade or general inviter-replacement operation is introduced. Original inviter/provenance, inviter-paid1FACY admission (D105), paid valences/K, pending rights/history/liability remain unchanged. Seek short compatible witnesses as an optimization preference, NOT a selected hop cap or CPU/search guarantee. Exact canonical mutual state, episode/status/direction, Council snapshots/self/mixed terminals/bounds and independently fresh verification remain contracts before code/data; no default migration, indexer restart, empirical equivalence/security proof or historical evidence replay follows.

**The invitation tests apply to the creator, not the recipient.** D91 waives Council-path checks ONLY during initial bootstrap before the first100active participants; at leastDmutual guarantors remain required. Outside that phase both tests apply, neither substituting for the other. Each path is simple and distinct. Counted paths toward a single center may share the creator and final center, but no intermediary. Edge-disjoint routes through the same intermediary do not supply separate paths. D104 retains D84's qualifying mutual graph/Council endpoint without a mandatory invitation-chain member. Paths reach any admissible Council member, not all members or an arbitrary highest-XP/healthy seed. Canonical mutual records, independent-support qualification, Council snapshots, mixed-terminal/self/zero-hop and small-network startup remain contracts (§46.14–§46.15). D61 remains a research reference, not a default migration, capacity quota or Standing-to-XP conversion.

| Active verified participants | Direct difficulty target / minimum qualifying guarantees and paths |
| ---: | ---: |
| 1–9 | 1 |
| 10–99 | 2 |
| 100–999 | 3 |
| 1,000–9,999 | 4 |
| 10,000–99,999 | 5 |
| 100,000–999,999 | 6 |
| 1,000,000–9,999,999 | 7 |
| 10,000,000–99,999,999 | 8 |

At zero the numeric target is also one; the formula creates neither a founder nor a non-self guarantee. Genesis follows §13. No fixed floor of two or more is selected. Raw edge count, path reachability and disjoint vertices do not prove independent humans. Effective-support qualification and verification remain OPEN; D83/D84 mutual support cannot be inferred from raw reciprocal legacy edges or used to authorize automatic reverse records.

**No cluster invitation quota or external-boundary capacity gate is imposed for now (D35).** The own-emission burn, individual guarantee/path conditions and invitation freeze still apply. Difficulty changes must not retroactively invalidate identity. Epoch/hysteresis adoption, grace periods, pending-invitation handling and recovery after an anchor/count change remain OPEN; direct formula examples do not choose those policies.

**D41 — [SELECTED enforcement priority], documented 2026-10-24.** The difficulty-sized guarantee threshold is a hard authorization barrier at **invitation creation**, not merely a graph statistic or an XP effect. A creator with fewer than `D` qualifying guarantors MUST NOT create an invitation, even with a mature own emission, high XP or liquid FACY. The authorization check MUST precede the invitation burn and recording. The owner explicitly prioritizes implementing/verifying this boundary. This reaffirms the guarantee gate; it neither removes the separate D35/D36 path gate nor selects the still-OPEN verification/independence, anchor, graph, genesis-activation or difficulty-adoption contracts. A legacy raw-count check is only an implemented subset, not verified independence or full topology compliance.

**Historical/simulator reference, not the current selected count:** the earlier threshold was `decimal_digit_count(N28)` for distinct active accepted subjects, without the new verification/path contract. That reference explains older results and the current simulator; it must not be presented as verified independence or full D33/D35/D36 admission. The decimal bands survive, while their qualifying population and support semantics have changed.

### 18.3 Economic effect

**D105–D107 — [SELECTED current special invitation route],2026-10-29.** The inviter burns1eligible own-issued FACY (D105), superseding D92's2price. Recipient-side preparation is an existing pre-registered account with required fields and its zero Genesis Self-ID (D107): that act is the CONCEPTUAL counterpart for opening the invitation channel, with NO actual recipient emission, burn, minus1debt or automatic first-emission collection. This remains a SPECIAL invitation route, not two ordinary paid valences. D106 occupies1K slot at EACH endpoint on issuance, including before acceptance; no additional matching slot for those counted units. D107 fixes eligibility at issuance, not a repeated support/path/K check at acceptance. Keep the separately selected24h invitation contest delay unless explicitly changed; issuance, counted pending units and established mutual/admitted state remain distinct canonical transitions. The owner has not selected immediate unfrozen admission or a new timing rule by rejecting the earlier overlong ordering discussion.

The stronger inviter responsibility reflects the risk that an inviter itself created/registered a fake. This is a role-specific scrutiny/accountability rationale, not proof of shared control, automatic guilt, a new numeric sanction or release of other historically liable parties. Preserve D34/D55/D57 and D54 act rosters.

**Dated history:** D84 retained1and offered2; D92 selected2paid by inviter. D105 now returns to1paid by inviter, still recipient0/no debt, with D106 both-side slots and D107 zero Genesis/pre-registration. Preserve each dated record and old data assumptions; neither historical invite1 nor invite2 datasets are automatically evidence for this new lifecycle.

Under minted escrow, a D105 invitation destroys ONE existing personally earned backing unit and consumes that eligible Self-ID right. No FACY is minted/transferred/burned for the recipient's zero Genesis act. Old one-source/one-burn code matching the nominal price remains legacy unless it also implements the selected registration, both-side slots, support and timing contracts.

```text
1 own Self-ID -> 1 eligible Emitter right aged at least 24 hours
    + target account already pre-registered with required fields and zero Genesis Self-ID
    -> D mutual guarantors; outside initial D91 bootstrap ALSO D independent Council paths
   on the CURRENT mutual graph (D104), no mandatory invitation ancestry; disjoint across the WHOLE family
    -> validate issuance once; allocate 1 K slot to EACH endpoint
    -> burn 1 personally earned FACY (D105); recipient mint/burn/debt = 0
    -> addressed invitation recorded and frozen for 24 hours
    -> valid uncancelled invitation proceeds to admission without a repeated eligibility test (D107)
```

The creator cannot sell the right on the market and later buy it back. Under the D42 clarification, keeping the matured own emission preserves its eligible invitation use; separately withdrawing it supplies ordinary Collector FACY instead. Maturity alone does not make that choice. The asset implementation must preserve provenance and prevent double use.

**D60 — [RESEARCH direction, not a selected protocol change], documented 2026-10-25.** The owner requests a separate comparison of creator invitation cooldown P and own-matured-emission burn b, including zero-burn/no-limit counterfactuals. Current retained own rights constrain long-run funding but do not themselves impose a minimum interval between invitations: several banked rights can fund a burst. A research arm called (P1,b1) must therefore distinguish an explicit cooldown from this existing resource limit. The comparison does not replace the selected guarantee/path gate, custody or invitation freeze, and selects no new Standing, bond or jury system. Its capacity prior and H6 are research claims, not verified safety or automatic authority to change defaults.

**[HYPOTHESIS]** This creates a tradeoff between personal liquidity and expansion of a responsibility-bearing social network.

### 18.4 Invitations are accountable, not anonymous coupons

**D99 — [SELECTED original creation-inviter clarification],2026-10-29.** An ordinary invited account is created through ONE invitation and has ONE original inviter. The earlier “no more than two invites” wording is not adopted as an outgoing, pending or lifetime limit: a participant may issue as many as its eligible own funding, current K and invitation gates allow. The current D105 price is1own FACY, not a separate outgoing-count quota. D107 means technical account/zero-act pre-registration PRECEDES this first admission invitation; “creation inviter” denotes original admission provenance, not the creator of a previously nonexistent key/address. An additional invitation addressed to an already admitted account is NOT itself an ordinary valence, another account-creation event or an automatic second responsibility/XP relationship. D95's specifically authorized unsupported-person re-entry remains a separate episode/acceptance contract with the SAME identity and preserved original creation provenance; it must not reset history or multiply SubjectIds. Supplied genesis remains its separately declared starting assumption, not a fabricated inviter.

**D95 — [SELECTED re-entry after loss of initial invitation support],2026-10-29.** If the inviter ends the newcomer's only invitation relationship before the newcomer has an eligible own emission, the person lacks current support/access; the broken first invitation does not continue to qualify. Another participant may issue a NEW paid special invitation (current D105 price1own FACY) to that person, restoring support on acceptance without requiring a self-funded ordinary valence first. This is re-entry, not creation of another person, another clean zero Genesis act or a new SubjectId: preserve existing identity, personal-chain/XP/debt/history and per-act rights. “Outside the network” does not mean a proven false identity, erased balances or a blanket transaction ban. Ordinary paid valence entry remains possible when its source/authorization/support conditions can actually be met. Exact re-admission target binding and episode/status/count transitions need a contract; old Native new-target-only admission is not this mechanism.

**D112 — [SELECTED re-entry by mutual guarantee; supersedes D95's invitation requirement], 2026-10-29.** Source: owner reply: "повторный вход может быть без нового приглашения, достаточно установить взаимопоручительские связи, но регистрировать новые Self-ID и заниматься эмиссией FACY можно только при наличии хотя бы одного поручительства — не важно инвайт или нет". A person who lost current support re-enters by establishing ordinary mutual guarantee links; a NEW invitation is one possible route, not a requirement. New Self-IDs and FACY emission require at least one current established mutual guarantee, whether invitation-origin or ordinary (consistent with D84's one-guarantor minimum). SubjectId, chain, XP, debt and history are preserved as under D95. **Pending bindings:** who pays the re-entrant's valence when they hold no eligible own FACY (D93 prices a valence in self-issued FACY), and whether D84's outside-bootstrap path-to-Council condition still applies to that guarantor.

**D98 — [SELECTED new transactions, not reopening closed invitations],2026-10-29.** A closed invitation cannot be resumed or reset. One can create a NEW invitation or a NEW valence transaction; their own costs, current K and authorizations apply. A new ordinary valence must not silently resurrect the old invitation's active type/privileges, and no unpaid opposite valence may be fabricated from a dead invitation. Historical invitation provenance/actual past D34 duties remain records, not a permanent active-link type or assumed extra liability of every new ordinary relationship. D94's retained opposite ordinary valence remains its own still-open record; withdrawing and recreating one's side is a new transaction, never revival of the withdrawn record. Canonical special-link/ordinary-valence mapping remains an execution contract.

An invitation must retain its creator, timestamp, intended scope, and later use. The creator's responsibility does not disappear if the invite reaches an undesirable subject.

**[OPEN]** Target binding, invite expiration, acceptance, whether an invitation can be transferred, and remedies for traded or coerced invitations need explicit definitions. The protocol must not accidentally turn personally earned invite rights into freely tradable bearer coupons.

### 18.5 Invitation freeze

**Terminology clarification pending,2026-10-29.** In the latest voice the owner interpreted “freeze” as a referendum pause on issuing invitations. That is DIFFERENT from the selected per-invitation24h contest delay below. The message does not explicitly abolish that delay; retain it pending an explicit owner clarification, not an assumed cancellation of its guarantor-veto window. Self-ID24h maturity is a third separate boundary. This naming question does not select a referendum pause/activation policy or a native change.

**D113 — [SELECTED no referendum pause; D77 restated], 2026-10-29.** Source: owner reply "во время референдумов о смене K никаких заморозок не должно быть по идее... а вот когда открыт спор, то оба участника не должны совершать акты Self-ID и устанавливать новые поручительские связи". A K-change referendum pauses nothing: invitations, valences, Self-IDs and guarantees continue during the vote. The selected per-invitation 24h guarantor-veto freeze below is unchanged. While a dispute is open, both parties may not create Self-IDs or establish new guarantee links, restating the selected D77 activity hold (which also covers invitations).

**[SELECTED, 2026-10-22]** A new invitation is frozen for 24 hours before the invitee can be admitted. During the freeze, any current guarantor of the creator can cancel it. The burned emission stays burned. **D42 boundary:** consumption is no longer an XP-credit event; the former D2 rule revoked that consumption credit on cancellation. Treatment of an already matured Self-ID credit must now be specified separately, not silently inherited from D2 or invented here. The freeze is what makes guarantors responsible for whom their people invite: a guarantor who sees invitations going to people who do not look real is expected to cancel them and, if needed, leave the relation.

**D44 — [SELECTED modeling/research focus, not a calibrated behavioral law], 2026-10-24.** The core pathway is directed: `G guarantees S; S invites C; G may cancel S's pending invitation`. Separate the chance that G attends, the quality and possible error of the evidence, G's authority and available work, and a timely actual cancellation. A suspicious signal is not knowledge of evaluator truth. Liability is intended to motivate vigilance and correction, but that motivation and its contribution to a reliable growing network remain hypotheses, not results of a scripted response. Preventing this invitation does not erase past or other knowing-guarantee duties (D34). No numerical probability, automatic innocence or duty to inspect every few hours is selected here.

**D46 — [SELECTED modeling direction; probability and routing contracts OPEN], 2026-10-24.** The next detection model starts from the chance that each Self-ID, invitation or guarantee act draws an observer's suspicion, not a hard aggregate work-budget cutoff as the primary explanation of attention. The owner proposes roughly an order-of-magnitude greater chance for the relevant guarantors than for an otherwise ordinary observer. This is a role-sensitive scenario assumption, not calibrated detection, a mandatory probability, independent human evidence or proof that liability causes vigilance. Separate exposure/notice, fallible suspicion/evidence, a request for help, actual participation, procedural authority and timely action. Suspicion of a guarantee does not introduce a new free guarantee-veto or automatic sanction. Work/private costs must still be reported rather than declared zero; technical execution bounds remain labeled censors, not a behavioral model.

**Owner clarification under D46:** the participant with XP below that of a typical guarantor is the **observer who notices the suspect act**, not necessarily its author. That observer may seek help from a higher-XP participant and wider parts of the network through the discovery/sponsorship route in §25.1. Exact per-act versus per-observer probability units, time basis/retries, role overlap, the definition of average guarantor XP and any XP-dependent notice function, evidence dependence/error law, contact reachability and willingness to join remain OPEN. No new XP credibility multiplier or eligibility bypass is selected. The integrated probability/relay model remains incomplete; an isolated per-act evidence primitive and a bounded funded Self-ID evidence/sponsor adapter are documented in the model contract, not new protocol rules or full discovery/entry integration. Historical budget/timing studies retain their original source and meaning.

**[HISTORICAL MODEL FINDING, source-bound]** Liability for an inviter's guarantors helps only if they can see and cancel the invitation. Without a freeze, the simulated honest community preferred not to expose fakes, because exposure fined honest friends of a real cheater. With a reviewable freeze, the fraud premium fell from about 190 to single digits. See the [social-trust study](../studies/2026-10-22-social-trust-threshold/README.md), sections 4–5.

## 19. Two-sided guarantee establishment

### 19.1 Both parties must agree

**[SELECTED, clarified D93/D94]** Ordinary mutuality requires two valid opposite paid valences, one authorized by each subject. One-sided creation immediately burns its own1FACY but does not create mutual responsibility/XP. Recreating only one's withdrawn valence can match the still-open opposite without charging it again. D105–D107 invitation is the special route paid1by the inviter, with a pre-registered zero Genesis act supplying the conceptual recipient side (no recipient mint/burn/debt), not two ordinary paid newborn valences.

**Current D81/D82 meaning:** a proposal is not an established mutual guarantee, and no guarantor XP is earned from the other person's Self-ID without that mutual establishment (§17.5). Receiving or acknowledging an offer must not be silently treated as the completed XP-qualifying relationship. This preserves the two-party matching requirement without choosing canonical record layout, activation ordering or funding; two raw opposite graph edges alone are not proof of authorized establishment.

**Historical D31 directed-establishment representation, not sufficient by itself for D82 XP:** for a directed guarantee `A guarantees B`:

```text
A: proposes responsibility for B
B: confirms that same proposed relation
    -> check identities, authority, source operations and validity
    -> activate directed A -> B guarantee
```

In that historical representation, matching confirmation does not automatically produce `B guarantees A`; reciprocity requires another explicitly authorized directed relation. D82 now excludes using the directed-only state as an XP-earning substitute for an established mutual guarantee. Do not silently implement this as automatic reverse edges, rewrite old rosters, or relabel the existing directed simulator as current mutual semantics.

A guarantee makes a specific claim: A accepts the defined responsibility for B's asserted real and unique identity. It does not certify every future opinion or action by B.

### 19.2 Payment or commitment

**[SELECTED]** An eligible Self-ID emission can be used for a defined network-building guarantee operation after it reaches 24 hours of age. Such use is different from arbitrary FACY spending.

**D93 — [SELECTED paid valences and matching],2026-10-29.** A valence is a signed one-sided request to guarantee a particular account. Successful creation IMMEDIATELY burns1eligible self-issued FACY as a protocol transaction charge, even if unanswered. The open valence is NOT a mutual link, XP entitlement or guarantee responsibility. Unmatched payment is not refunded; no implicit expiry is selected. Own-act/independent duties remain. Whether this charge is additional to or integrated with host/base fees is unselected; the FACY burn is not replaced by another asset.

Two present valid opposite valences establish an ordinary mutual relationship, subject to current K/eligibility. **D97, as refined by D100:** capacity preflight now counts the creator's OWN open valences/invitations, including unmatched requests, not only mutual degree. A full creator cannot open another counted unit. A first party's already-counted valence needs no extra slot when a reciprocal transaction arrives; do not reject matching solely because that retained counterparty has no additional free slot if its count does not increase. Preserve existing offers when new creation is blocked. Exact duplicate/recipient/special-invitation accounting and atomic snapshots still need a contract. Valid opposite valences suffice once their creation is admitted; no extra mutuality transaction or dormant-pair rescan on K increase is selected. A fresh pair accounts for two1FACY burns at their creation times, NOT a fresh deferred atomic2burn at each matching. Only the established double link supplies guarantor XP roles/mutual responsibility; D42/D54 per-act receipts, not payment/establishment itself, produce XP. Authorized paid valences are not raw reciprocal legacy edges or personhood proof. D92 is a separate inviter-paid special route.

The implementation MUST distinguish:

- **Open valence** — paid one-sided request occupying1creator-owned K slot immediately (D100), but no guarantor XP/mutual responsibility by itself.
- **Ordinary mutual relationship** — valid opposite valences and admitted capacity/eligibility; uses already counted owned authorizations, no extra mutual-degree slot on matching (D100).
- **Invitation mutual relationship** — D92 accepted invitation with special funding/provenance; no newborn payment/fabricated ordinary valence.
- **Withdrawn valence / ended interval** — one's withdrawal ends ordinary mutuality but leaves the opposite valence open if not withdrawn (D94).

Own-source/identity validation, duplicate requests, D77 phases, matching/current-K atomicity, rejected-transaction/host fee handling and invitation-specific withdrawal mapping need execution contracts. Do not partially activate/debit on rejection or silently activate an over-cap relationship when room later appears.

**D97 irreversible-burn clarification:** an already executed burn is NEVER refunded, including after an unanswered request, withdrawal, cancellation or later inability to match. This does not count debt/reserved unburned capital as a burn or forbid separately funded authorized remedies. A rejected transaction that creates no valence is distinct from an executed paid request; retain preflight/no-partial-mutation boundaries and bind host gas separately.

**Dated supersession:** D83 chose fresh-pair own1+own1 cost; D93 resolves immediate per-valence burn and lasting unmatched state. D97's final full-initiator transaction guard replaces the owner's earlier tentative suggestion of accepting full-capacity double valences and activating them on K increase; that tentative branch is not adopted. Old unpaid directed proposals/refundable B-bonds remain legacy; no replay/default migration or new quota.

### 19.3 Unilateral link break

**[SELECTED]** Either party can unilaterally end an established guarantee under protocol rules. **D85 — [OWNER alternatives],2026-10-29:** free termination OR burning1FACY of any permitted origin, even non-self-issued. **D110 — [SELECTED free termination], 2026-10-29:** the owner selects the free branch: "цена разрыва связи бесплатна — отменяет валентность" ("breaking a link is free — it cancels the valence"). Termination charges nothing and cancels the terminating party's valence of that link; its K slot is released (D75) and the FACY burned to create it stays burned (D93/D97). The counterparty's valence follows the existing D94/D98 matching rules. Atomic ordering and D34 history still need execution contracts.

**Dated history:** the old1FACY break fee had source/destination OPEN, not an automatic burn. D85 reopened that treatment and D110 selects free termination; legacy fee code is not a current choice. D75 valid-end immediate capacity release and D34 history remain under either candidate.

An abusive guarantor may repeatedly cancel otherwise valid Self-ID records. The guaranteed subject can decide to end that relation. A guarantor can also withdraw from an unsustainable responsibility relation.

**[DIRECTION, 2026-10-22] XP follows the relation.** A guarantor that ends a relation loses the XP it earned through that person. Rights recorded while the relation existed no longer credit the departed guarantor. It is wrong to keep counting XP from someone one no longer vouches for.

**[DIRECTION] Exit as a duty.** If a guarantee's subject starts behaving suspiciously, for example by inviting people who do not look real, the rational and expected reaction is to cancel those invitations and break the relation as soon as possible. **Historical wording, superseded by D34 on 2026-10-23:** the earlier draft attached later sanctions to relations still present at adjudication. D34 instead retains responsibility for events that occurred while the guarantee was effective; exit prevents new exposure, not accountability for the past.

**[MODEL FINDING under the legacy current-link liability reference, not D34]** Leaving escapes modeled liability but also removes a watcher. With weak detection, early exits let the coalition's later invitations go unreviewed.

Free cancellation of a particular Self-ID and termination of an established guarantee are separate operations; D110 makes the latter free (it cancels the terminating party's valence). Terminating the link must not retroactively erase its previous existence, public decisions, or established liability history.

### 19.4 Active mutual-guarantee links and a variable ceiling (D75/D81)

#### Current counted resource: own open valences and both-side invitation units (D100/D106)

**D100/D106 — [SELECTED open-unit counter and both-side invitation rule],2026-10-29.** Count a participant's own open outgoing valences AND its issued/received invitation-side units. D106 settles the formerly unresolved recipient side: an invitation occupies1slot at issuer AND recipient from issuance, even before acceptance, not only at mutual activation. D107 zero Genesis preparation supplies the conceptual recipient channel side without a real mint/burn or a second extra slot for the zero act itself. This supersedes D81 mutual-counterpart-only counting and refines D97; initial common K100 stays referendum-adjustable, not XP, lifetime use, graph-query budget or safety proof.

At K100,100unanswered own requests can exhaust the sender's capacity. To open another it must close/cancel an owned open unit or obtain sufficient K increase; the earlier executed burn never returns. Matching opposite ordinary valences does not charge a second slot to the first participant: its original valence already occupies one. Each party's owned valence remains counted while open whether mutual or unmatched; ending mutuality by withdrawing one's own valence releases THAT party's unit immediately, not the still-open opposite party's unit. A new reciprocal transaction must fit any new owned-unit increment, not demand another free slot for a retained already-counted authorization.

Each NEW invitation must fit a1unit increment at EACH endpoint and counts both atomically at issuance (D106). Do not require another free slot/reallocate those units at acceptance (D107), silently release them merely because accepted, or interpret the recipient's zero Genesis as an ordinary paid valence. Exact pending/active/closed records, duplicates/coalescing and termination mapping remain contracts; whether to count the recipient is no longer OPEN. Ordinary incoming one-sided valences remain different: they count only their creator until a separate owned response is created. Mutual responsibility/XP still requires valid establishment, not an open slot/bare offer.

**Variable ceiling and preservation.** Referendums may raise/lower K;100/150/200/300 are examples, not adopted values or automatic growth stages. Preserve already effective links and existing paid open records when full/over a reduced cap; no forced cuts, refund or historical erasure. New owned openings must fit the applicable ceiling. Increasing K supplies capacity for NEW transactions, not automatic pairing of blocked/dormant double links or a graph-wide activation pass. Host authorization/snapshot/pending governance contracts remain, not a silent default migration.

**Restoration is a new transaction.** D94/D98 allow a new paid valence to match a still-open valid opposite after one's withdrawal, not revival of the withdrawn record or a second charge of the retained side. The creator needs current capacity for its new unit. Closed invitations cannot be reopened; a new ordinary relation does not automatically inherit their active type, while old provenance/D34 duties remain history. Exact special invitation/ordinary mapping and failed-transaction ordering still need contracts. D85 free-versus-burning1any-origin FACY withdrawal pricing remains unselected.

**Invitation counts and identity.** D99 gives an ordinary invited account ONE original creation inviter, not a two-outgoing-invite quota or lifetime issuance limit. Issuing is bounded by actual own funding (currently1own FACY per invitation, D105), eligibility and K. Merely sending an additional invitation to an existing account does not create an ordinary valence, a second account-creation event or automatic guarantor XP. D95 re-entry preserves the same SubjectId/history; an episode sponsor is not silently rewritten as its original creator.

**Implementation/evidence boundary.** Existing unpaid-directed/K_slot/T/V/B-bond/invite1 references do not implement this owned-open-unit counter, paid valence matching, D105–D107/D95 registration/admission or phase contracts. Preserve historical artifacts/defaults; no replay/relabel, independent-person oracle, cross-user capacity quota, scientific G1 or native migration follows. D34/D42/D54/separate D9 rights and source/party history survive slot changes.

**Dated D75/D81 history:** D75 (2026-10-27) counted outgoing distinct supported SubjectIds; D81 (2026-10-28) clarified active mutual bilateral counterparts and non-destructive referendum reductions. D100 now replaces the counted resource with own open valences/invitations. Valid closure releases the relevant counted owned unit, not every surviving authorization at both endpoints. The original decisions remain in Appendix A/Git, not competing current counters.

#### 19.4 Active outgoing guarantor slots (D75)

**Dated history, not the current counted-resource rule above:** D75 (2026-10-27) recorded an active outgoing distinct-SubjectId count, valid-end immediate release and retained D34. D81 (2026-10-28) clarifies/supersedes outgoing-only counting where it includes unmatched unilateral support and qualifies any universal snapshot |S_g|≤K claim after a reduction; it retains valid-end/history protections. The dated D75 record remains in Appendix A and its original main text in Git history; neither historical studies nor their input rules are retroactively changed.

<a id="20-two-independent-kinds-of-responsibility"></a>

## 20. Guarantee responsibilities

Identity-guarantee responsibility, prevention of a specific Self-ID and D57's historical-chain warranty concern distinct claims/duties, even when one guarantee accepts more than one of them.

### 20.1 Identity-guarantee responsibility

The first duty concerns the underlying subject:

> I accept responsibility for my claim that this subject corresponds to the real and unique person it represents.

A false identity, an impersonation, a duplicate subject (*twin*), or an invented person can trigger a dispute about this duty. A guarantor who knowingly supports such a claim and a guarantor who was negligent can face different types of liability.

### 20.2 Specific Self-ID act responsibility

The second duty concerns a particular act:

> I have the ability to detect and prevent a suspect emission that my guaranteed subject created.

A real person can submit an invalid Self-ID by mistake or misconduct, such as selecting an animal image while asserting that it shows the person's own face.

**[SELECTED, clarified by D42]** An authorized guarantor can cancel an eligible unspent Self-ID for free **during its initial 24-hour window only**. The cancellation prevents ordinary maturation and its emission/XP effect. It protects the responsible guarantors from **liability for failing to stop that specific act**.

This protection does **not** automatically clear liability for a separate false-person guarantee. A real person who made one erroneous Self-ID and a fabricated identity are different cases.

The cancellation also does not prove malicious intent. A later dispute establishes the type of misconduct and the correct consequences, if any.

**D79 early author cancellation — [SELECTED basic rule, confirmed2026-10-28].** The owner confirms D78's candidate as basic protocol behavior: the author can cancel its own eligible pending Self-ID for free, just as an authorized guarantor can, while age<24h and without a dispute. The author need not wait for guarantors to be online or prove the mistake before exercising this prevention right. Author authorization does not make the author its own guarantor or alter old NFT rosters. Cancel the existing backing once and prevent this act's ordinary maturity XP while retaining D56 record/index/predecessor and the original used24h slot; no identity-invalidity finding, general exoneration or responsibility for separate false-person/history claims is implied. Preserve unspent/unlocked/otherwise eligible-source and applicable dispute-precedence limits: no frozen/consumed/converted right cancellation or case/hold termination follows. A reserved canceled right cannot erase the actual debt; broader debt/maturity chronology remains OPEN. At exactly24h/afterwards the free right has ended; correction is through appropriately admitted/upheld D58/D59 self-dispute, not a restored free veto. D42 no-automatic-withdrawal, same-act credit provenance and guarantor-link termination fees remain unchanged. D78's proposal is retained as dated history in AppendixA, superseded here by the explicit confirmation.

### 20.3 Why prevention matters

This structure makes a guarantor more than a passive witness. The guarantor receives XP from a person's continued identity work, can inspect public evidence, and can stop a suspect act before its initial 24-hour maturation window ends.

The guardian can correct a mistake without necessarily destroying a valid identity relationship. Conversely, the subject can break a harmful guarantee relation.

The intended incentive is that responsible participants teach one another to comply with the rules, rather than wait for a preventable violation to become an expensive dispute.

### 20.4 How trust forms

**[DIRECTION, 2026-10-22]** People do not vouch for anyone at random. Liability makes guarantees expensive, so a guarantee is given first to people one has known for a long time, and then to friends of friends. A request for a guarantee from a stranger is treated like spam: blocked by default. One may still vouch for someone one knows even if that person does not yet know the guarantor. Trust therefore flows through existing social clusters, and an honest network is a dense web of acquaintances.

**[MODEL FINDING]** Acquaintance-only guaranteeing, followed by a call or meeting before any veto or challenge, nearly eliminated wrongful invalidations. It also made paying honest strangers to vouch for fakes unprofitable, because the bribed guarantor carries the liability. See the [social-trust study](../studies/2026-10-22-social-trust-threshold/README.md).

### 20.5 Correction routes and early reporting

**[DIRECTION, documented 2026-10-23]** Correction can come through self-correction, a guarantor's intervention or withdrawal, evidence-backed challenge, Chekharda escalation, or collective Council action. The absence of an infallible algorithm is not the absence of a correction route. The owner's preference is that timely appropriate self-reporting provides a viable exit from a mistake without punishment for that appropriate early correction.

**D58 — [SELECTED post-window self-dispute availability / correction direction / OPEN funding and guarantor procedure], documented 2026-10-25.** The owner reaffirms D34's event-level self-correction: an author can open a dispute against its own specific Self-ID, including after the initial24h cooling period. This is a disputed correction route, not unilateral deletion or renewed free veto. Other participants may oppose it. A compliant act can be defended against the author's challenge; authorship does not establish that the act is defective. The owner's expectation that a justified correction is unlikely to attract a winning opposing position is not an infallible-merits, no-response settlement or probability rule.

For an appropriately admitted and upheld correction of an erroneous act, the intended outcome reverses that act's economic effect: the owner describes a one-unit reduction on the author side and withdrawal of the act's original one-unit XP credit from every actual credited recipient, including author and guarantors. Under D54 this means source-credit revocation with chronology and no double subtraction, not blindly subtracting1 from every present-day guarantor balance; already revoked/penalized credits must be handled from provenance. D56 retains the historical NFT record, predecessor/index and correction outcome rather than erasing or renumbering history. The direction is to repair the chain after an appropriate correction, not automatically void all subsequent valid acts or invalidate a real person's identity. Exact restoration of dependent rights remains subject to the applicable correction contract.

**[OPEN]** Eligibility and timing relative to discovery/already open cases, funding the author's one-unit correction, fees/stakes, dependent rights, prior debts/settlements and repeated-abuse controls still need exact rules. An available Emitter right, converted/transferred value, an invitation-burned unit and a debt-repayment right are different funding states; a burned unit cannot burn twice, and nominal debt is not collected money. No additional punitive unit or automatic setoff against separate obligations is inferred here. Appropriate self-correction is not unlimited immunity for separate fraud, identity/history promises or already established obligations.

**D59 — [SELECTED initiator-dependent remedy / implementation mandate], documented 2026-10-25.** The owner resolves the D58 initiator distinction and requests implementation: an appropriately upheld author-initiated dispute corrects the author's one Self-ID; an upheld challenge initiated by anyone else discards the affected chain. Following §21.1, the affected chain is the suffix beginning with the disputed act, not an otherwise valid preceding prefix. A recorded guarantor is not the author and receives no author-only single-act remedy merely by holding that role. A false/rejected self-challenge does not reverse a valid act. Historical records/links remain, and the author can create a later eligible Self-ID under the unchanged issuance limits. The intended benefit of cleaner circulating value is not a guarantee that outstanding debt has been recovered.

**[OPEN implementation boundaries]** A non-author initiator may be recorded in the disputed NFT, may have received its XP, may hold a later D57 historical-chain claim, or may simply be an outside observer. These roles still matter for actual source reversal and independently established liabilities: absence from the old snapshot does not exclude a later historical claim, and today's edge does not establish old credit. D59 chooses author versus non-author remedy scope, not all challenge admission, stake, monetary-allocation or historical-fault contracts. Opening a case alone establishes neither innocence, successful correction, immunity nor a right to burn/revoke another person's effects. The ordinary strict greater-XP gate cannot itself admit an author against the same author; the selected availability needs an explicitly scoped procedure rather than a general authority bypass. The native source-reversal kernel now implements this distinction under a supplied verdict; complete case admission/merits, punitive allocation and unsupported funding/lock contracts remain separate.

### 20.6 Historical event liability and early self-correction (D34)

**D34 — [SELECTED / DIRECTION / OPEN], documented 2026-10-23.** Source: the owner's voice clarification after the chain-replay audit. For each disputed event, liability MUST be evaluated from the guarantees that were effective when that event occurred, not merely from links still present when it is adjudicated. A later-discovered fabrication can therefore create a fine for a former guarantor for the confirmations it guaranteed. Ending or replacing the relation MUST NOT erase that recorded responsibility; it does not make the former guarantor responsible for unrelated later events outside its guarantee period.

Conceptually:

```text
HistoricalGuarantors(e) = guarantors whose recorded relation covered event e
LiabilityBasis(e) = HistoricalGuarantors(e), under the applicable duty and verdict
LiabilityBasis(e) != merely the current incoming guarantee graph at adjudication
```

This selects the historical basis, not automatic guilt by association. The relevant legal event/operation, canonical event ordering, equal-timestamp activation/end boundaries, identity-guarantee versus act-level duties, inviter-chain extensions and evidence of fault still need precise contracts. Proposal time is not automatically activation, current XP is not a historical-role record, and an XP-recipient snapshot need not equal the complete liable-party set. No numeric historical interval convention is silently selected here.

**[DIRECTION] Early voluntary event correction.** The owner describes a responsible guarantor privately prompting the author of an invalid event to open a dispute against that own event as early as possible. The informal conversation is not itself a protocol verdict or concealment exemption. An eligible self-initiated correction should reverse the event's emission/XP effect rather than impose the ordinary punitive outcome for that appropriate early correction, consistent with D29. It MUST remain attributable and auditable.

The intended reversal is:

```text
Identify the erroneous own event and request early self-correction
    -> apply the defined admissibility/evidence procedure
    -> burn or cancel its corresponding recoverable emission
    -> revoke that transaction's attributable XP from every credited recipient
    -> record correction, actual recovery and any unresolved obligations
```

“All recipients” includes the author and everyone historically credited by that transaction, not just current guarantors. XP reversal MUST follow credit provenance and chronological penalty/revocation semantics; previously revoked credits MUST NOT be subtracted again. This is restoration of the affected event's effects, not an automatic whole-identity invalidation, whole-history wipe or immunity for a separate false-person guarantee. Treatment of dependent later events remains OPEN under §21.1.

**[OPEN] Eligibility and implementation.** Define “as early as possible,” deadlines relative to discovery/pending disputes, repeated-abuse controls, evidence/admission, adjudicator/appeal, fees/stakes and how appropriate correction affects each historical duty. Define actual recovery when the right is already converted, transferred, invitation-consumed or otherwise unavailable: a burned unit cannot burn twice, debt is not a burn, and third-party holdings cannot disappear by accounting assertion. The intended simple cancellation does not select a new source of money or automatic seizure of innocent recipients' funds. A right already used to repay debt also requires a decision about the prior debt: its recorded disappearance is not automatically preserved or reversed by self-correction. Ordinary self-challenge fails the strict greater-XP gate; an explicit self-correction procedure/exception is needed, not an undeclared bypass for arbitrary challenges.

**Still OPEN from the chain-replay gate:** this clarification identifies *who was responsible for which event*, but does not explicitly decide whether the same act/guarantor/duty may be fined again in another case, what a final enforceable penalty-event identity is, or how overlapping/new suffix acts are charged. Historical attribution MUST NOT be mistaken for authorization to replay a settled penalty. The current simulator uses current-link verdict liability and has no self-dispute correction lifecycle; these remain explicit legacy/reference gaps until a separately specified and validated migration. No runtime behavior is changed by this decision record.

### 20.7 Historical-chain warranty and accumulated human review (D57)

**D57 — [SELECTED guarantee meaning / OWNER mentoring direction / HYPOTHESIS about security], documented 2026-10-25.** Source: the owner's voice choice of historical-chain responsibility after distinguishing identity, act-level and whole-history promises. Guaranteeing a subject accepts responsibility not only for its correspondence to a real unique person, but also for the claim that the represented person is identifiable throughout its preceding personal Self-ID chain and that this prior chain was formed without violations. This is a substantive historical claim, not merely that links/indices are well formed or that a few recent pictures were inspected. Whether the guarantee includes the prior chain is now selected, not an unresolved alternative.

A late joiner makes a new guarantee about an existing history; this does not rewrite the guarantor/XP-recipient lists of earlier Self-ID NFTs or make that person a signer at an earlier date. Under D34, responsibility is tied to the applicable recorded duty/event. D57 adds a historical referent to the newly accepted guarantee; it does not replace event-time attribution with the current graph. Act-period responsibility and the historical-chain claim must remain distinguishable when assigning a per-party monetary amount. The attested chain endpoint at signing/activation, exact fault versus risk-bearing standard, coverage of cancelled/corrected/adjudicated history, overlap/deduplication, remedies and enforceable amounts remain OPEN. How appropriately corrected history can support a later guarantee also needs that contract; D57 alone selects neither a permanent ban after any past mistake nor an automatic amnesty. Earlier specific-act veto protection (§20.2), historical attribution and D55's distinct XP roles are not silently repealed. A photo defect does not by itself establish a fabricated person or authorize collective exclusion.

**[OWNER mentoring direction]** The inviter ordinarily serves as an entrant's mentor: it teaches correct Self-ID practice and explains that violations can expose the subject and its accountable guarantors, not only the subject alone. Continued guarantor inspection, new guarantee decisions and profile review are intended to prevent a defective chain from growing unchecked. This describes responsibility through defined accepted roles, not guilt of every acquaintance/viewer or an automatically established formal mentor office. An ordinary profile view is not itself a signed guarantee or proof of completed inspection.

**[HYPOTHESIS, not confirmation finality]** The owner expects more actual review opportunities as the network and a subject's history persist: new guarantors inspect the past, continuing participants review profiles (especially recent acts), and mentors help prevent/correct violations. Conditional on informative evidence, attention, independent correction and functioning adjudication, defects may be found earlier and late reversal of a chain about100 acts deep may become rare. This is not an observed probability, automatic age/XP/index confidence law or a100-act finality threshold. Time and new NFTs create opportunities, not proof that anybody inspected the relevant old act; recent valid acts do not repair an earlier defect. Correlated/coalition review, hidden evidence, unavailable work/sponsors and captured adjudication can defeat the proposed return.

The Bitcoin confirmation analogy motivates accumulating scrutiny, but does not transfer proof-of-work/consensus security to a human guarantee chain. Neither elapsed time, a larger network, an unchallenged profile nor raw guarantee count supplies independently verified historical validity. Collective exposure may motivate teaching/checking, but may also motivate concealment or rejection of honest entrants; the security benefit must earn its honest-growth cost under D49. D57 selects the broader promise, not a proven favorable equilibrium or a new automatic sanction formula.

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

**D56 — [OWNER structural direction; monetary counting details OPEN], documented 2026-10-25.** The owner clarifies that each Self-ID is an individual NFT-like act while successive acts of the same subject belong to a linked personal NFT chain. Each later act references its predecessor/history and has a sequential personal index. A link to the immediate predecessor permits traversal of the earlier history; a global transaction/NFT identifier is not a substitute for this per-subject position. D54's act-specific guarantor snapshot and actual XP receipts remain attached to each individual act. Revocation changes recorded validity/accounting, not the existence of its historical record; linkage does not establish personhood, transferable XP or automatic liability for every connected party.

Indices locate the range relevant to a chain-cut sanction; they are not by themselves a monetary amount. **Conditional arithmetic, not a selected counting rule:** if every position in an affected suffix from index `i` through endpoint `L` is chargeable once, its count is `L - i + 1`; a terminal one-act suffix has count1, matching D55's example. Whether cancelled/previously voided/already adjudicated positions count, which endpoint is fixed for the case and which historical guarantor duties cover which acts remain OPEN. The earlier wording “N steps followed X” must not silently decide whether X itself belongs to the charged set or equate a raw ordinal with the fine. D56 supplies the chain/index structure, not general cross-case deduplication or authority to impose one unchanged guarantor roster across all later acts. The owner's subsequent explicit implementation request authorizes public predecessor/local-index metadata while preserving historical acts, guarantors and XP provenance; it explicitly excludes changing `N` or running research experiments.

- If a dispute proves that step X was invalid and N steps followed it, the chain is cut from step X. The coins created illegitimately by those N steps are removed from the system, and the XP they credited is revoked from the subject and its guarantors.
- As a sanction, each liable party also pays N coins. The penalty spreads outward like a wave and grows with how deeply the violation is embedded in the chain.
- If the violation starts at the invitation (the subject never was a real, unique person), N is the number of acts the false subject performed. The fine falls on the inviter, who spent an invitation on a non-existent person, and on the inviter's guarantors, who vouched for a person registering fake people and did not cancel the frozen invitation. The false subject's own guarantors are liable as well.

Converted coins cannot be un-minted; recovering them is part of the fine. **[OPEN]** Caps, collection order from recoverable assets, partial cuts for real persons with an isolated invalid act, and exact historical duties/time boundaries for former guarantors. D34 selects survival of past-event liability after link exit; whether exit alone erases that past responsibility is no longer OPEN.

**D73 review boundary,2026-10-27:** D34 does not select a universal “one personal chain of liability per bought bridge.” A guarantor of an inviter may be responsible for multiple historical suspect invitations/child chains under the applicable duties, not only the inviter's own Self-ID chain. A proposed low-exposure attack must specify inviter/guarantor roles, historical rosters, covered events and actual recovery; moving later growth downstream may change that exposure. Conversely, graph connectivity does not authorize fining an entire component. Exact per-party duty/overlap/count/cap rules remain OPEN rather than a favorable assumed price for a bridge.

**[OPEN, audit clarification documented 2026-10-23] Repeat-verdict identity and scope.** The once-per-enforceable-penalty-event invariant in §37 needs a defined event/violation identity across separate cases, overlapping cuts and guarantor duties. Replaying one finalized case differs from admitting a later case with a new basis. Decide whether already adjudicated acts can ground another penalty, how genuinely new suffix acts are counted, and the exact historical event/duty boundary for each liability. D34 now selects historical attribution rather than an adjudication-time current-link test; repeat-event identity remains OPEN. The [chain-replay diagnostic](../studies/2026-10-23-chain-replay/README.md) finds existing case guards, but no lower-level general deduplication contract: raw cuts do not repeat money/XP removal without new acts, whereas explicitly applying an unkeyed verdict helper again can impose another guarantor penalty. This is not a demonstrated guarded-caller exploit or authorization to add blanket per-subject/per-act deduplication. No new penalty or finality rule is selected by this audit.

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

### 23.1 Self-ID-sourced XP state (D54)

**D54 — [SELECTED accounting architecture / implementation direction], documented 2026-10-25.** Source: the owner's proposal to make the Self-ID NFT-like state, rather than a free-standing XP balance or repeated full-block scan, the source of earned XP. When a qualifying Self-ID actually credits XP, its state records the actual subject/guarantor recipients. The author's ordinary credit is included; under D42 the ordinary uncancelled act credits after24h without requiring withdrawal. Invitation creation alone supplies no new credit.

**Owner clarification, same date:** an ordinary Self-ID fixes its guarantor list at creation. A guarantor joining later during its24h window does not join this act's recipient/veto set. Any guarantor in the fixed list can validly cancel the Self-ID within its window, preventing ordinary XP for everyone, including the author. If it completes uncancelled, the intended recipients are the author and that fixed guarantor set; there is no new recipient selection from the current graph at maturity. The distinction between a snapshot/list and an actual receipt concerns entitlement versus completed issuance, not permission to substitute different people at24h.

Retain the creation snapshot and actual receipt separately: a pending/cancelled act has not issued its ordinary XP. A credit receipt does not itself establish every D34 duty/liable-party qualification, verified personhood or usefulness. Authorized credit revocation records its invalidation without deleting issuance provenance. **Owner confirmation, 2026-10-25:** an instant relation end affects future snapshots, not the pending credit/veto/historical responsibility in an already created Self-ID. An initial guarantor remains in that act's successful-maturity recipient set after exit. Existing D9 treatment of already credited relation XP is not automatically repealed. Do not use the legacy current-edge filter to remove this pending entitlement.

**Owner design proposal, not implemented:** a positive guarantee may have a24h cooling period, while ending a guarantee should be immediate rather than vetoable by the departing person's guarantors, avoiding hostage membership. The positive period's start/authorization, cancellation rights and activation effects still need a contract. Ending a relationship and cancelling a specific Self-ID are different operations; no new waiting/veto rule or automatic retroactive cancellation is installed here.

Effective XP is derived from these source credits together with authorized chronological adjustments, including revocations and XP penalties (§24). A subject-level balance may be an incrementally maintained cache, and recipient indexes may locate its source Self-IDs without replaying every block. Neither cache nor index creates an independent right to XP. Penalties cannot be reduced to dividing every lifetime credit by one final factor: credits before and after a penalty must remain distinguishable, including events in the same clock hour. Exact production representation/indexing and remaining disputed-maturity/eligibility/chronology contracts are not chosen by this direction.

**Implementation boundary:** actual credit receipts and cache/index reconstruction can be authoritative without replacing labeled historical timing. The bounded model now additionally supports ordinary unencumbered24h snapshot maturity, not full D42 migration or D34 adjudication/enforcement. Initial ordinary recipients, pending entitlement after exit and no automatic withdrawal are settled, not reopened. Frozen acts, changed identity/eligibility, debt/penalty order and later remedies/prior-credit interactions still need the separate migration contract.

## 24. XP losses and accounting

**[SELECTED]** A liable losing participant in a dispute can receive an XP halving. The effective XP after a penalty is half of its value before the penalty, under a defined integer rounding rule. Independent later penalties can halve the value again.

For example, absent later earnings:

```text
10,000 XP -> first loss -> 5,000 XP
 5,000 XP -> next loss  -> 2,500 XP
```

The penalty represents lost access and public reputation, not the transfer of XP to the winner.

**[OPEN, narrowed by D55/§24.1]** The act-specific Self-ID/invitation XP roles below are selected. Other losing-role qualification, integer rounding, appeals and remaining future-credit/remedy ordering still require contracts. In particular, lifetime credits divided by `2^losses` is not equivalent to applying halving events in chronological order when new credits arrive between losses.

**[REFERENCE]** An ordered ledger of `XP_Credit` and `XP_Halving` events can preserve this distinction. Efficient snapshots may implement the same semantics.

The selected 24-hour maturity-credit rule (D42, §17.5) prevents an act still subject to its original free veto from already supplying ordinary procedural XP. Earlier provisional-credit candidates are comparison policies only. Later adjudicated revocation replays XP without silently undoing executed decisions; appeal/finality remedies remain OPEN.

### 24.1 Act-specific penalty roles (D55)

**D55 — [SELECTED sanction direction; quantitative/lifecycle details remain OPEN], documented 2026-10-25.** Source: the owner's clarification accompanying D54 model implementation. For an established losing **Self-ID act**, monetary liability covers its author and the guarantors fixed in that Self-ID. The author's XP is halved; guarantors do **not** receive an XP-halving penalty merely from this Self-ID case. The owner's terminal/top-act example charges one coin to each liable party; a deeper affected chain charges the declared `N` to each. This is separate from any authorized revocation of the invalid act's attributable credits: removing a source credit is not halving all of a guarantor's XP.

For an established losing **invitation act**, the XP-halving consequence applies to the invitation creator and the guarantors responsible when that invitation was created. Record that invitation-specific snapshot; do not substitute the current graph or automatically copy a different source Self-ID's roster. The invitation monetary amount/formula is not newly specified here.

The fixed act snapshot identifies the responsibility basis under this selected act-specific rule; it does not infer hidden intent, declare a genuine person fabricated, make public defense an offense or replace admissibility/merits. A trusted model sanction input is not a complete court. Keep actual collectible burn and added debt distinct: the model cannot burn missing money.

**[OPEN]** Exact suffix/depth counting for `N`, cancelled/overlapping acts, penalty-event identity across separate cases, invitation monetary basis, restoration/revocation order and full adjudication/appeal remain separately specified. A bounded primitive may take the monetary amount explicitly and protect against replay of the same supplied case ID without silently choosing general cross-case deduplication or depth arithmetic. No default whole-identity invalidation or descendant exclusion follows from a defective real-person Self-ID.

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

The distinct **free guarantor cancellation** of an eligible unspent Self-ID **before 24-hour maturity** does not require this general XP gate. It is a specific protective authority provided by an existing guarantee.

### 25.1 Open discovery and qualified sponsorship

**[DIRECTION, documented 2026-10-23]** Anyone can identify an inconsistency, investigate it and supply useful evidence, including people with no XP or no Facety membership. Separate discovery, evidence construction, formal sponsorship, adjudication and enforcement. A qualified participant can independently evaluate an external or low-XP source's package and accept the formal procedural responsibility. This channel does not give an external observer XP, membership, private-information access or a bypass of the ordinary challenge gate.

**D46 clarification, 2026-10-24 — [SELECTED observer/relay distinction, not guaranteed participation].** A low-XP noticer can ask a higher-XP participant to assess the evidence and take responsibility for an eligible challenge, including seeking a wider audience rather than relying only on the accused's local guarantors. This reaffirms D28 and the senior-contact hypothesis in §26.5: low XP belongs to the noticer, and the contact request is not itself a Chekharda position. The contacted participant must actually be reachable, assess the evidence, be willing and satisfy the applicable XP/stake gates before entering. A request does not guarantee arrival, independent support, a true accusation, a favorable verdict or access to half the network; contact/exposure assumptions remain explicit and OPEN. The proposed roughly tenfold guarantor suspicion advantage is not the earlier illustrative tenfold **senior XP** or 10% **joining chance** in §26.5, and does not select those numbers.

The investigator and sponsor may negotiate compensation outside protocol. A built-in bounty marketplace, transferable XP or mandatory new token is not required. Funding, payer/recipient, currency, payment conditions, sponsor effort, collection risk and enforceability are **[OPEN / RESEARCH ASSUMPTIONS]**, not free resources or silently minted FACY.

**[HYPOTHESIS]** An active investigative minority with sufficiently responsive sponsors and decision-makers can support a much larger passive population and expose violations beyond the accused's local guarantor cluster. Outsiders, rivals and former collaborators may supply evidence, but they need access and a willing capable sponsor. Multiple routing, publication and sponsor competition are possible mechanisms to test, not omnipotent fallbacks. Public availability does not imply attention or enforcement.

Evidence must be evaluated apart from source allegiance: a malicious source can reveal a real violation; a respected source can submit a false accusation. An allegation is not a verdict. Repeated circulation of one package is not independent confirmation. **[REFERENCE / OPEN]** Packages may retain public-event references, claimed duty, supporting observations/source identities, timestamps and review history without publishing additional sensitive personal data. Evidence admission, clarification/refusal, conflict handling, retries and harassment safeguards remain to be specified and tested. See the [research program](research.en.md).

### 25.2 Intent, act validity, suspicion and adjudication (D47)

**D78 practical person-defense clarification — [OWNER rationale and evidence direction, documented2026-10-27].** A real person has concrete ways to answer a false allegation of being invented/nonexistent: renewed visible presence in an ordinary public setting, meeting someone willing to vouch, joint/witness-supported evidence, and potentially voluntarily offered identity documents. The owner regards these routes as practically accessible for the intended public/social audience, not as an absent defense that requires inventing an infallible algorithm. This is a qualitative accessibility expectation, not measured error-free acceptance, guaranteed funded turnout or a requirement to collect passports/faces. A photo, meeting, document, signature and guarantee provide different evidence; none automatically proves uniqueness, rules compliance, independent support or every historical act. No mandatory government-ID validator, fixed evidence threshold, privacy waiver or permitted personal-data download is selected. Distinguish **“this subject is not a real/unique person”** from **“this real person committed a specific violation”**: person-presence evidence cannot by itself settle the latter, and act correction cannot automatically invalidate the person. Existing evidence/authority/merits and D47 presumption remain.

**D47 — [SELECTED modeling distinctions; distributions and evidence procedure OPEN], 2026-10-24.** The owner's clarification separates a participant's supplied behavior/intent profile from whether a particular Self-ID act satisfies the rules. A genuine, good-faith participant can accidentally produce an invalid act or one that fails to establish the required identity claim. Conversely, the intent assigned to an actor does not by itself make every act invalid. Unique personhood, intent, act-level validity, observed evidence/belief and an adjudicated result are distinct. An act defect is not automatically proof of a false person or malicious intent, and good intent does not automatically make a defective act valid. This distinction grants neither automatic immunity nor a new sanction/fault standard.

**D47 owner clarification, 2026-10-27 — [PRESUMPTION / protocol-visible participants versus evaluator truth].** Different admitted SubjectIds are handled as distinct responsible participants and presumptively rule-following unless the relevant violation or identity conflict is established through the applicable evidence/decision procedure. The mere possibility that one person controls several claims is not evidence that a particular pair is the same person; acquaintance, shared interests or possible coordination alone establish neither duplicate identity nor misconduct. This is not proof that every admitted claim really belongs to a different human. In research, actual identity/control, intent and act validity may be separately supplied evaluator facts, but protocol/defense actors must not read those hidden labels or use them as sanctions. Do not demand a perfect physical-personhood oracle or proof that no collusion exists before testing a clearly labeled conditional model of admitted participants. This clarification does not bypass admission/eligibility, settle the D33 verification/anchor/epoch migration, forbid evidence-led suspicion/challenges or D42's specific-act preventive veto, select a new proof standard/quorum, or authorize automatic guilt/cluster punishment. Presumption, investigation, preventive action and an established violation remain distinct.

A valid Self-ID can nevertheless evoke suspicion and lead an eligible participant to open a dispute. The model must admit the owner's example: evidence establishes that the act is valid, so the challenge fails and the challenging procedural side loses. The low-XP noticer/contact source in D46 is not automatically that formal challenger; existing participation/responsibility rules still apply. Discovery, suspicion, a contact request, actual case entry, presentation of evidence and adjudication are separate transitions. An allegation is not a violation, and opening a case is not winning one.

**D47 owner clarification, 2026-10-24 — [QUALITATIVE MODEL EXPECTATION; rates OPEN].** Properly and honestly made photo Self-IDs should lead to formal disputes less often than rule-violating acts under comparable exposure, observer and procedural conditions. The distinction concerns **case-opening frequency**, not merely the chance of winning after a case has opened. Preserve a nonzero possibility of mistaken suspicion/escalation rather than giving valid and invalid acts equal case rates or granting valid acts automatic immunity. Implement the expectation through declared observable evidence and conditional suspicion/assessment/entry, not a challenger reading hidden act-validity or intent labels. **Further owner rationale, 2026-10-24:** case opening is a selective decision after evidence assessment, not an unconditional random dispute arrival for every act. For a participant seeking to establish a violation, an act that appears compliant and a challenge expected to achieve nothing provide no apparent reason to incur the work, stake and XP exposure of formal entry. Model perceived prospects, goals and costs explicitly; no universal utility threshold, perfect foresight or guaranteed rationality is selected. Mistaken assessment and different/adversarial motives can still produce a case. This reasoning uses the observer's information, not hidden actual validity. Exact relative rates, calibration and adversarial/dependence exceptions remain unspecified; this is not a universal inequality regardless of visibility or malicious behavior, and the photo example does not select a mandatory media type.

The owner expects some such chains to be very rare; this is **[HYPOTHESIS / SCENARIO ASSUMPTION]**, not a measured frequency or permission to omit them. Compose conditional probabilities for the stages rather than silently multiplying independent marginal rates. Act validity and person/intent labels belong in the observation/evaluation environment, not omniscient defense state; participants and the dispute abstraction act on declared evidence and uncertainty. The successful-defense example does not select infallible adjudication in every case. The intent-to-act-validity distribution, act-specific false suspicion/recognition, escalation willingness and evidence-to-verdict error/correlation law remain OPEN. Existing merits, monetary/XP consequences, D34 liability and D42 maturity contracts are not replaced. The existing scheduler's identity-class observation/dispute reference is not this full act-level model; the isolated per-act evidence primitive and bounded Self-ID relay stop before act-level entry/adjudication, rather than substituting identity sanctions for unspecified act remedies. Behavior generation, calibrated willingness and merits integration remain incomplete. A named optional prospective private-utility assessment now supplies a bounded simulator assumption, not a selected human behavioral law, actual payoff from blocked act cases or an act remedy. Historical results must not be relabeled as its implementation.

## 26. Chekharda / Leapfrog

**D91 selected startup exception,2026-10-29:** Chekharda is OFF during INITIAL bootstrap before the first100active participants (§46.14), while the1/Dmutual-guarantor thresholds, preventive vetoes and other duties remain. Later shrinkage below100does not automatically reactivate startup mode or close cases; transition/count/history contracts remain. The earlier D89 paragraph below is dated proposal history, now refined by D91 for initial startup.

**D89 — [OWNER startup proposal/direction, not a completed activation contract],2026-10-29.** While no Council has formed (the owner gives fewer than100active participants), Chekharda may be disabled as a startup mode. This does not create a Council/path anchor, waive D84's Self-ID/invitation reachability gates, disable preventive Self-ID/invitation vetoes, erase liability/history or close existing cases. Bind canonical active-count/phase snapshots, enablement at the boundary, downward crossings/adoption, existing cases/D77 holds/pending rights and access to later correction before implementation. Do not substitute raw legacy counts, evaluator labels or a static `disputes.enabled` arm for that chronology. The D84 no-Council eligibility/startup contract remains OPEN; no runtime/default change or scientific conclusion is selected by this proposal.

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

**D77 — [SELECTED, 2026-10-27] Activity restrictions during dispute participation.** Source: the owner's clarification that no participant in an open dispute may make Self-IDs, invite new participants or open new guarantees. The restriction covers participants on either side, not just the accused or the latest entrant. Merely receiving notice, observing, reviewing or associating with a party is not by itself an established case-participation roster; the runtime must bind actual procedural participation, rather than infer it from suspicion or social labels. During that participation in the open dispute, the participant MUST NOT create a Self-ID, issue a new invitation or open a new guarantee. Other participants in the network may continue ordinary activity when not subject to an open-case restriction themselves. Do not release a restriction merely because another opposing entrant has arrived; bind the case's actual end and any other still-open case participation before lifting it.

**D77 tentative exception — [PROPOSAL, NOT SELECTED].** The owner said a participant may *probably* still terminate a guarantee. That tentative exception is not yet a chosen permission, prohibition, fee waiver or erasure of D34 historical duties. Guarantee termination remains subject to its actual authorization/funding and historical-liability contract. Execution details remain **[OPEN]**: canonical participation/entry/end records (including collective Council participation), atomic/same-time operations, proposal versus activation phases, pending invitations, and existing-right/XP/custody chronology. Do not broaden the three named prohibitions into an unstated universal ban on transfers, withdrawal or all procedural defense actions; existing specific locks still apply. No automatic catch-up issuance or compensation for the restricted interval is selected. This rule is a protocol choice, not a statement that the current simulator enforces it or that its growth cost/false-accusation resistance is established.

**D45 — [SELECTED scenario capability, not a mandatory entry rate], 2026-10-24.** A modeled Chekharda may offer the next opposing position every four hours. This is distinct from batching several entries in a daily quota. Each actual entrant still needs greater eligible XP, the required stake and willingness to join; an empty slot does not create a participant. Every accepted entry restarts the same seven-day last-move window, unless the Council intervenes. Four-hour opportunities impose no universal cadence and no hard eight-person cap.

**[HYPOTHESIS, 2026-10-22] Fast escalation to senior judgment.** In real disputes participants may join every few minutes, not once a day, and each may have several times the previous entrant's XP, because many people want the last word and the money. A visible dispute therefore climbs quickly to long-standing members with large reputations. They gain nothing by ruling against themselves or against the crowd. Attention grows with a dispute's height (its largest XP relative to the network) and with the number of people it has drawn. Among all who notice, someone will want to take the right side; winning requires presenting evidence.

**[DIRECTION, 2026-10-22] Dispute-resolution reputation.** People who take part in disputes differ from ordinary participants, and many never take part at all. Regulars know one another, may befriend one another and may form their own coalitions. Each person's chain of disputes is visible in an explorer, so it is statistically clear who tends to stand on the right side. This is a second reputation, separate from identity reputation.

**[HYPOTHESIS, 2026-10-22] Calling seniors.** A dispute participant can call a more senior acquaintance for help, one with, say, ten times the XP. With some probability (for example 10%), such a person joins if one exists in the graph, so stakes and seniority rise in jumps.

**[EARLIER D26 DIRECTION, 2026-10-22; qualified by D52] Cluster scrutiny.** Earlier discussion proposed automatic parallel disputes against those defending a proven violator. The retained purpose is public scrutiny, not automatic admissibility or guilt. D52 below makes each further investigation/claim/evidence/access step separate; mere defense, association or loss cannot supply a new violation or sanction.

**[REFERENCE / OPEN, clarified 2026-10-23]** Attention is not a finding of guilt. Legitimate defense, mistaken judgment and knowing obstruction of established evidence differ. A separate sanction needs evidence of a defined identity or procedural duty, not mere association with a losing side or political disagreement. The legacy `clusterFollowUp` option is a scripted stress test, not a complete standard for proving obstruction.

**[CANDIDATE] Other markets for resolving sides.** Parimutuel pools on the claim, automated market makers, and Schelling-point juries are alternatives to the alternating ladder that deserve comparison.

**[MODEL FINDING, diagnostic; scope corrected 2026-10-23]** In one retained cheap-fake run, a top-XP coalition defender ended all 89 resolved disputes at depth 2 despite a common noisy signal favoring the accusation. This demonstrates an XP-gate obstruction under that script. It does not prove that XP dominance is necessary for every wrongful verdict, that non-dominance guarantees safety, or that real fabrication costs prevent dominance; see insight F21.

**[OPEN]** Whether a position's stake must only be at least the stake below rather than a fixed +g, and how winnings are then distributed fairly.

**[OPEN]** What happens to the stake of a losing top position, which has no winner above it (the legacy simulator burns the collectible amount as an assumption). The base stake, caps and exact collective Council entry/ballot recognition under the shared clock (D69), not a late-only voting gate (D66). Stake backing is also unresolved: exclusive custody/reservation versus an unsecured commitment changes concurrent-case capacity and recoverability. The legacy simulator only checks current liquid funds and collects up to the remaining balance at settlement, so nominal stakes are not guaranteed winnings. The implemented `disputes.stakeBacking: "reserved"` comparison holds real model custody, excludes it from spending/unrelated fines, refunds winners or mooted cases, and retains open-horizon commitments. Passive refunds/winnings can reach known invalidated accounts without restoring rights. These backing/priority choices are research references, not selected economics; default backing remains legacy unsecured.

**[MODEL FINDING]** A ladder decided only by the last unopposed side favors the side with the most disposable high-XP identities. Fake identities have nothing to lose, and mutual guarantees inflate their XP. In the simulator, verdict accuracy fell to 0.2–0.4 without Council intervention. Accuracy reached 0.83–0.89 (1.0 without coalition harassment) when the active Council could step in early, at depth 2–4; at depth 6 it came too late. The Council's honest majority and its willingness to intervene early are the anchor of the dispute system. See the [insight register](insights.en.md).

**[HYPOTHESIS, 2026-10-22]** In practice fakes rarely open disputes against honest players. A dispute draws attention to its initiator and invites a counter-dispute, so disputes are mostly opened against suspected fakes, using public statistics. The participants who support a fake are mostly other fakes. A side with real reputation (history, tenure, ties to the honest network) attracts more support than one without it.

**[OPEN]** The evidence standard, treatment of innocent mistakes, and safeguards against fabricated disputes are not final.

A final result must be attributable to a specified procedure. The mere willingness of a wealthy or high-XP participant to join a side does not prove that side true.

**D64 — [OWNER correction-route restatement / HYPOTHESIS; timing record corrected by D69], documented 2026-10-27.** An old, high-XP participant knowingly supporting an incorrect position is not, by that fact alone, a successful attack on the complete protocol. The intended counter-loop is public prominence and human/automated observation, evidence reaching a more senior eligible participant, and Council intervention when individual XP escalation cannot provide correction. Higher XP/history/relationships are proposed attention channels, not verified independence, honesty, useful contribution or guaranteed reach. The owner expects a rule-following Council majority, interested in network integrity and a share of a successful dispute's proceeds, to mobilize; unanimity or participation by every member is not the premise. This is a conditional institutional/economic hypothesis, not a selected quorum, a guaranteed response, proof of accurate evidence or a change to D33's unresolved voting contracts. XP-only last-move obstruction and historical depth-triggered Council accuracy do not test the full endogenous mobilization loop.

**D69 — [OWNER clarification of the shared Chekharda clock; correction of the earlier D64 documentary interpretation], documented 2026-10-27.** There is **one common seven-day last-move window**, not an additional Council-specific seven days. Each accepted new participant takes the opposite side and restarts that same window. The Council is the final collective entrant in this escalation; its accepted entry follows the same clock, and its voting occurs within that applicable window. Do not stack a Council response interval or another voting extension on top, nor treat each member's ballot as a new entrant that renews the timer. D66 still permits Council voting at any time during an ongoing dispute; there is no final-three-days gate. The owner's suggestion of a shorter **three-day Council voting duration** is a candidate only, not a selected exception or a late-only voting rule. The collective Council need not wait for every member to vote to affect the outcome; D72 recognizes referendum opening as immediate collective entry; remaining ballot, applicable majority/quorum/recusal, merits execution and finality contracts stay OPEN, without reopening the shared-clock rule. The earlier D64 record of a separate additional Council interval was an incorrect interpretation, not a second current default.

**D64 reward direction retained.** The Council's proposed share must come from actually collectible, authorized dispute proceeds; recipient eligibility, allocation, custody, losses, conflicts and net individual incentives still need contracts. A public position or wrong verdict alone does not authorize a separate sanction (D52).

### 26.6 Second-order public accountability (D52)

**D52 — [DIRECTION and falsifiable accountability hypothesis], documented 2026-10-24.** A high-XP participant's public defense can attract attention to that participant's own history, guarantees, invitation activity, Self-ID acts, XP sources and economic behavior. The first-order process concerns the originally challenged transaction. A **second-order investigation concerns a separately admissible alleged violation in the defender's own or otherwise applicable history**. It may continue after the original dispute ends, including after a successful defense; winning one claim supplies no immunity from a different, evidenced claim. Public history is attributable evidence to inspect, not proof that any violation exists.

**D78 traceable-neighborhood clarification — [OWNER accountability direction, documented2026-10-27].** An evidenced problem or evidence-led question about an act/identity can direct scrutiny toward its guarantors, the inviter who enabled admission, earlier invitation ancestors and their applicable guarantee/history relationships. Invitation lineage provides an intelligible route for investigation and attribution; it is not itself a unique-personhood certificate, independent evidence of every neighbor's misconduct or an automatic chain-wide sanction. Looking further is not the same as finding a separate violation, and neither attention nor a link is actual financial recovery. Apply D34 event-time roles/D57 historical warranties/specific-act veto protection/D55 source roles and the appropriate independent allegation/decision before consequences. Actual recovered principal, burned sources, already spent value and unpaid debt remain distinct. No default automatic cluster case, upstream guilt, backdated roster or new per-party collection/fault rule is selected by this direction.

Keep eight stages separate:

1. A public position is recorded and attributed.
2. Some audience is exposed, depending on visibility, dispute significance and the declared reach model.
3. Some exposed observers notice and choose to investigate, with their own time, goals and work limits.
4. Investigators obtain and inspect available historical evidence.
5. They may discover grounds for an independently admissible allegation, with error/correlation/missingness retained.
6. Evidence reaches a willing qualified sponsor through actual contacts (§25.1), or stops/refuses/remains pending.
7. A distinct formal case may open only under its own XP/stake/admissibility rules.
8. A specified adjudication may produce only that case's authorized consequences, including actual collection and unpaid debt separately.

No stage is guaranteed by the previous one. Exposure is not detection; detection is not admission, a verdict or recovery. Higher XP/significance may increase exposure under a declared hypothesis, not a new guilt probability or evidence-quality multiplier. Local collusive contacts may suppress investigation; outside-community observers may help only if they can access evidence and procedural authority. The Council's intended apex route retains OPEN referral, quorum and merits contracts; a wider audience does not invent them or transfer low-XP observers' responsibility to themselves as challengers.

A defender can be correct, honestly mistaken, misinformed or knowingly dishonest. **Taking a public position, defending a suspicious act or being on a losing side is not an independent violation.** This mechanism adds no automatic monetary/XP penalty or blanket defender-chain liability; any already defined procedural exposure remains subject to its own duty/scope and OPEN contracts. A later case must identify its separate target, duty, supporting evidence, time and authorized remedy. Genuine coalitions are not false identities, and an act defect cannot be silently converted into false-person enforcement.

**Hypotheses and competing explanations:** increased visibility can expose pre-existing misconduct and make dishonest defense less attractive; equally it can enable harassment of honest senior participants, crowd out other scrutiny, repeat one shared error or fail at sponsor/court capacity. A dishonest participant might win the original case yet lose more through independently justified later consequences, but that is a possible outcome to test—not a guaranteed offset, encoded punishment or proven deterrent. Match attention/work and histories, include no-extra-exposure, equivalent non-defense publicity, local/outside reach, ineffective routing and clean-history controls. Record public-position→inspection→discovery→opening→resolution times and pending stages, plus harms to innocent participants. The current `attentionFeedback` and legacy `clusterFollowUp` references are components/limited scripts, not a completed demonstration of this chain.

<a id="27-council-of-101"></a>

## 27. Consul Council

The Council is the intended collective route for correcting concentrated influence, not a fixed set of 101 people at every network size. **D33, selected 2026-10-23**, replaces the old universal target while retaining equal votes and no seniority immunity. Institutional size is a design requirement, not proof of independent judgment or a completed merits procedure.

### 27.1 Membership and equal votes

The direct formula uses Network Difficulty from §18.2/§46.1. **D33 clarification, documented 2026-10-24:** `round` means the nearest integer, not ceiling/always-up rounding. Since `D` is an integer digit count, `sqrt(D)` cannot be exactly a half-integer; no half-way tie choice is needed here:

```text
r = round(sqrt(D))
r:          1    2    3     4      5       6
C_target:   1   11  101  1001  10001  100001
```

The lookup is not the repunit sequence `1,11,111,...`; behavior beyond `r=6` remains OPEN. Membership cannot exceed the active verified population or the eligible candidate set. A target of one means **no formal Council**: it creates no special office, unilateral verdict power or immunity. Under the direct formula, `N_verified<100` has no formal Council; at 100 the target is 11. The interaction with delayed difficulty adoption remains OPEN (§46.10), not an implicit phase rule.

**[SELECTED] Each formal consul has one vote**, regardless of XP magnitude. **D111 — [OWNER reconfirmation], 2026-10-29:** "в совете, да, один участник — один голос, не важно какой у него XP" ("in the Council, yes, one participant — one vote, whatever their XP"). XP may determine Council eligibility/ranking but never vote weight inside the Council. Whether network-wide K referendums (D87–D90) use the same rule is a separate pending clarification. Eligibility requires activity over the preceding 28 days under the declared verification/eligibility contract. Topology-aware effective-XP ranking is D33 guidance, not a selected numerical multiplier or a replacement for chronological XP credits/penalties. The ranking/dispute-authority boundary, candidate filters and graph observations still need exact contracts.

Membership changes with XP/activity. **Recalculation is not turnover:** continuously active leaders may retain seats. Stability is not itself failure, and rapid replacement is not itself success; actual contestability, independence and influence removal after established misconduct matter. An active-case membership snapshot and dynamic membership are distinct references. Ties at the last seat, vacancies, additional recusal, minimum functioning quorum and case-membership updates remain OPEN; D71 excludes both parties from a consul-versus-consul case. A lone remaining member cannot acquire the powers denied to the one-consul phase.

**Historical reference:** the 2026-10-22 top-101 leaderboard among active subjects remains the simulator's fixed-size reference. D33 supersedes that target; old simulations retain their original interpretation, not compliance with the current verified/dynamic design. The full topology and transition obligations are stated in §46, not supplied by a leaderboard implementation.

### 27.2 Voluntary intervention

**[SELECTED]** The Council may decide to intervene in **any dispute**. It is not required to take every local conflict. D70 selects individual-consul initiation and a collective referendum on the opposing position's merits (§27.3), not merely an administrative vote granting permission to intervene.

**D66 — [SELECTED anytime voting / rejection of a late-only rule], documented 2026-10-27.** The Council may vote **at any time while a dispute is ongoing**, under its applicable procedure. There is no rule requiring it to wait until the final three days, the second half of a dispute or a fixed T-minus threshold. The owner's explicit correction rejects the late-only interpretation in the D65 strategic brief. Information diffusion may be modeled as an optional research mechanism; high-XP dispute prominence is an expected signal, not a mandatory artificial waiting period or a calibrated diffusion law. This timing permission does not supply turnout, referral access, quorum, merits or automatic intervention. D69 clarifies that the Council uses the same seven-day last-entry clock, without a separate added Council interval; timing permission and collective-entry recognition remain distinct.

**D67 — [OWNER-selected research notice assumption / no separate diffusion study], documented 2026-10-27.** The intended community has dedicated Discord and Telegram channels discussing disputes, with many Council members present. For the current attention/capacity inquiry, take a published dispute as available to that common channel at opening and treat notice to the declared present members as having no material dissemination delay. Do not add a separate information-diffusion investigation or simulate slow graph propagation as a prerequisite. This is an explicit simplifying input, not measured deployment, universal Council presence, required surveillance, permission to access real channels or a guarantee that everyone reads every message. It grants no automatic vote, work, quorum, correct evidence or execution: under overload, distinguish available notices, funded/available review, priority, merits and disposition. High-XP prominence may inform salience, but it need not manufacture a second delivery gate once common-channel notice is assumed.

This creates an upper review path for conflicts involving the largest amount of social capital, including an allegation against a subject that nobody can challenge through the ordinary `XP(challenger) > XP(owner)` gate.

The Council's capacity to hear apex cases prevents individual maximum-XP immunity in the intended design. **[SELECTED restatement, 2026-10-23]** A consul has no seniority immunity: another consul may challenge through the applicable ordinary or collective route. XP does not add votes inside the Council. D70 below selects the individual-consul referral and merits-referendum shape. D71 selects direct referendum adjudication for disputes between two consuls, with both parties excluded from that case's voting body; remaining operational contracts are explicit.

<a id="273-an-intervention-vote-is-not-automatically-a-truth-verdict"></a>

### 27.3 Individual initiation and collective merits referendum (D70)

**D70 — [SELECTED initiator, sequence and ballot subject; operational remainder OPEN], documented 2026-10-27.** Source: the owner's clarification of how a Council that is not yet participating joins an existing dispute. Any formal Council member may select such a dispute and initiate the Council's referendum, proposing to take the side **opposite the last non-Council participant**, in accordance with Chekharda's alternation. One member can trigger Council participation and the proposed opposing position under D72; that is not unilateral power to determine the Council's collective merits verdict. The no-formal-Council phase in §27.1 supplies no individual substitute for this power.

The referendum asks the Council to judge the disputed positions: **is taking the proposed opposite side correct, or was the last non-Council participant already on the correct side?** It is a collective merits choice, not only “may our colleague intervene?” A collective result supporting opposition backs the proposed opposite position; a collective result supporting the previous participant means the proposed opposition was not justified. That second merits result is not equivalent to no opinion, insufficient turnout or an expired/unresolved ballot. A vote is a procedural judgment under the evidence rules, not an infallible truth oracle; ordinary error, correlated error and capture remain possible. Preserve the actual claim and alternating position meaning rather than hard-code “yes” as fraud or “no” as genuine identity.

**D72 — [SELECTED immediate collective entry and shared-clock restart], documented 2026-10-27.** Opening this referendum by a consul explicitly acting at Council level **immediately counts as Council entry into the ongoing Chekharda** and restarts its common seven-day window. No prior majority approval or later ratification is required to activate that procedural entry. If the referendum opens at time t while the dispute is still open, its new deadline is **t + 7 days**, not the previous deadline plus another seven days and not a separate Council-only clock. The owner identifies this as the intended last-moment safeguard: the Council can enter just before an otherwise imminent ending and obtain the common response period for collective voting. Exact same-timestamp opening-versus-finalization ordering still needs an execution contract; no automatic reopening of an already finalized case is selected.

D70's merits referendum then determines whether the proposed opposition is right or the previous participant was already right. Initiating that collective process and determining its merits are distinct powers. The earlier assistant-proposed no-clock request followed by accepted entry only after approval is **not the rule**. D69's terminal collective Council role, D66 anytime voting and D67 common-channel near-immediate notice remain. Ballots and further referrals to a case already entered by the same Council do not create new Council entrants or renew the window; they cannot stack seven-day extensions. A consul's ordinary private participation is distinct from explicitly opening the Council referendum; membership alone does not turn every private act into this collective entry.

**[OPEN]** Define the remaining execution contracts:

1. Referral representation, formal initiator/membership snapshot and the last-position/claim snapshot bound by the referendum, including the ordering of concurrent ordinary entry versus Council opening and duplicate referrals.
2. Pending referendum state and legal custody/stake/XP/finality consequences of either merits result, insufficient turnout, ties or expiry; no silent rollback of the D72 entry/clock or deletion “as if never entered.” Opening the referendum is already the selected collective-entry event, not an unresolved request-versus-ratification choice.
3. Applicable quorum, vote denominator, majority/critical-case threshold, ties, abstention and insufficient-turnout/timeout effects, separately from explicit support for the previous participant. No example48–72h window,50%+1 quorum or shorter three-day exception is selected here.
4. Evidence presentation/access, reasoning, error and recording within the selected collective merits referendum; its existence and ballot subject are no longer OPEN alternatives to an unspecified replacement court.
5. Other conflict/recusal and active-case membership contracts; D71 already excludes both disputing consuls from the electorate in a consul-versus-consul case. Accused-member participation outside that peer-case route still needs a contract.
6. Authorized settlement, collectible proceeds/rewards, appeals and attribution/recording of consequences. Public defense, an incorrect vote or refusal alone is not an independently proved violation.

A 51-versus-50 simple-majority example illustrates equal voting. It is not an approved threshold. A supermajority for cases against apex participants was a separate candidate, not an adopted rule at that checkpoint. **D33 (§46.9)** now recommends simple majority for ordinary decisions and two-thirds for critical interventions; quorum, vote denominator, critical-case definition and operational merits/referral contracts remain OPEN; D70 selects the initiator and merits-ballot subject, and D71 selects the direct peer-case route with both parties excluded. The earlier example is historical, not an alternate current threshold.

### 27.4 The limit of internal legitimacy

If a majority of the most respected members starts to protect visible misconduct, the social value of their XP and Facety's identity assurances can collapse. This is the intended credibility constraint at the apex.

There is no requirement for an infinite chain of councils above the Consul Council. The public network can lose trust in its highest body, much as a monetary network can lose credibility after abandoning a fundamental monetary rule.

**[HYPOTHESIS]** Large reputational exposure discourages such collective misconduct. The protocol cannot guarantee this behavior. Public votes make responsibility observable; they do not force honest results or automatically restore damaged trust.

---
### 27.5 Reasoned outcomes and precedent

**[CANDIDATE / OPEN, documented 2026-10-23]** The owner suggested public, reasoned precedent for boundary cases. Interpreting an ambiguous existing rule differs from changing the rule prospectively. Compare comparable insider/newcomer cases, preserve reasons and action provenance, and test correction of bad precedents and protection from retroactive punishment. No precedent engine, unbounded appeal hierarchy or extra supreme controller is selected by this proposal.

### 27.6 Disputes between consuls (D71)

**D71 — [SELECTED peer-dispute route and party exclusion; execution remainder OPEN], documented 2026-10-27.** Consuls retain the right to dispute one another. A consul opens a dispute against another consul through the ordinary dispute-opening transaction. For this peer case the adjudication route is **not a Chekharda escalation ladder**: it proceeds directly to a referendum in which the **rest of the Council** judges which of the two disputed positions is correct. This is distinct from D70's Council entry into an already ongoing non-Council ladder, though both use collective judgment on the merits. Rank or a Council seat provides no immunity; one initiating consul cannot issue the collective verdict.

**Both parties are excluded from voting in this case.** The initiating and responding consuls do not sit as judges of their own dispute. The remaining eligible Council members form the case's voting body; this is a case-specific exclusion, not automatic removal from office, an XP penalty or a requirement that every remaining member cast a ballot. Additional conflicts, membership snapshots and changes, quorum, vote denominator/threshold, ties, abstention, unavailable/insufficient remaining members and timeout effects still need exact contracts. A failed vote is not a merits finding; neither returning votes to the parties nor inventing a unilateral substitute is an implicit remedy for missing adjudicators. The no-formal-Council and no-single-consul-sovereignty boundaries of §27.1 remain.

The ordinary opening transaction does not itself settle all special-route admission or execution details. Bind the admissible act/claim, the application of XP/access and funded stake requirements, exact transition into the peer referendum, its clock/finality, evidence, authorized custody/reward/sanction consequences and cross-/duplicate-case handling before code or research. Do not silently apply a new universal XP bypass, assume an XP ordering that grants apex immunity, or import example48–72h/three-day voting rules or an added Council-only window. The case concerns its particular allegation; disagreement, Council membership, an incorrect vote or losing this case is not automatically false identity, an unrelated violation or removal from office. D68 core-first survivability and the existing evidence/merits/recovery boundaries remain intact.

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
| D92 invitation | Burn2distinct eligible own-source backing FACY from inviter; newcomer pays0/no debt. |
| Free eligible Self-ID cancellation before 24 h | Burn Emitter backing; no maturity XP (D42). |
| Collector conversion | Transfer an existing FACY unit; do **not** mint a second unit. |
| D93 valence creation | Burn1own-issued FACY now, even unanswered; matching has no extra burn (§19.2). |
| Established-link termination | D110: free; cancels the terminating party's valence (§19.3). |
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

### 29.1 Autonomous issuance and the monetary-stock question (D53)

**D53 — [OWNER economic framing and hypotheses], documented 2026-10-24.** The owner distinguishes the original single-network/single-token value thesis from the actual Atmo-coupled economic design. Analyse **autonomous FACY economics without assumed external demand** separately from **conditional Atmo-supported economics**. These are analytical contexts, not a newly selected deployment mode or a change to the one-FACY reward, invitation rules or D42.

With genuine unique participation, each person's normal rewarded acts are limited to at most one per rolling 24 h. This rate argument depends on uniqueness enforcement; admitted Sybil accounts need not respect the human-population bound. At a fixed participating population, full-rate gross issuance is linear in elapsed time; with changing participation it can accelerate or slow. A person's lifetime and the contemporaneous human population are finite. The owner's illustrative **four billion participants** is a saturation scenario, not a protocol cap, a forecast or a verified-population input. Future generations and continuing participation mean that a bounded simultaneous population does **not** by itself bound lifetime cumulative token issuance.

For a simplified fully participating constant population `N`, no burns, unchanged reward and elapsed time `t` in days, gross daily issuance is `N FACY/day` and stock is `S(t) = S(0) + N*t`. A single added unit has relative size `1/S(t)`; the entire daily issue has relative size `N/S(t)`. Both can shrink, but **one tiny coin is not the entire issuance flow**. Actual supply always follows §29's mint-minus-actual-burn identity; cancellations, invitations and real market burns must not be replaced by nominal debt or assumed deflation. No automatic issuance end, aggregate hard cap or new emission-halving schedule is selected.

**[HYPOTHESES, not price laws]** The earlier intuition compares roughly quadratic network opportunity with linear per-person issuance. `N*(N-1)/2` counts possible undirected pairs, not valuable interactions, token demand, market capitalization or a FACY price floor. Genuine useful links may create value; duplicate accounts, collusion, low utilization, review costs and saturation may not. A falling issue/stock ratio does not establish negligible monetary effects or nonzero long-run price. As a counterexample, an explicitly assumed fixed desired aggregate token holding value alongside indefinitely growing stock could make unit price tend toward zero even as percentage issuance falls. This is a toy alternative, not the selected market model. The owner also expects a maturing network's accumulated useful economy to make incremental issuance less significant. That is a hypothesis about economic development over time, not a result implied by age, token stock or population saturation; applications and useful activity can grow, stagnate or disappear even at fixed population. Demand, token value capture, holdings/velocity, application use, actual funding and burns require their own evidence.

### 29.2 Majority-conditioned economic resilience (D62)

**D62 — [OWNER research direction / conditional resilience target; operational contracts OPEN], documented 2026-10-26.** The owner asks whether more than half, specifically 51%, or two-thirds of participants following the rules can prevent catastrophic currency devaluation or keep adversarial damage acceptable, and delegates routine next-step choices. These fractions are comparison questions, not selected safety thresholds, a new Council quorum or an established guarantee. Neither fraction alone bounds protocol abuse or purchasing-power loss. No present Facety-wide majority/supermajority economic theorem or result is established.

**People, power and defense are separate.** Declare which cohort of genuine people supplies the fraction (each actual person counted once), separately mapping account/resource control, which rules/opportunities and time interval define compliance, and how entries, exits and changing behavior are counted. Genuine people may violate rules; honest people may lack time, evidence or qualified access to defend them. Admitted accounts, aliases, issuance, XP/other eligibility, local jury votes, sponsor governance and funded response capacity have distinct denominators. A global human majority need not control a particular local decision. Evaluator ownership/personhood/compliance labels describe scenarios and measurements, never defense-visible truth. Exactly two-thirds is not automatically the same as strictly more than two-thirds; generic consensus fractions cannot be imported as monetary guarantees.

**Chosen resilience question.** For both requested fractions and the boundaries around them, identify conditions on admission/evidence, concentration of authority, funded attack/response resources, growth, collection and demand under which attack-attributable damage remains bounded while genuine access and growth remain usable. Report false emission/extraction, actual recovered principal, unpaid debt, innocent harm, authority capture and recovery separately. A network that prevents abuse only by preventing genuine participation has not earned a resilience result. An adversary's lawful personal issuance is not fraud solely because of intent; aliases and genuine-person violation coalitions both require explicit tests.

**Economic scope.** Distinguish protocol integrity and bounded incremental attack loss from the market price itself. Even universal rule-following cannot guarantee demand, liquidity or a price floor (§29.1). Autonomous FACY and finite conditional Atmo support (§33.1) remain separate; no free sponsor, protected price or automatic recovery fork may fill a missing contract. Comparisons need matched declared no-attack resources/demand conditions, an explicit horizon, loss units/budgets, bad-event/risk criteria and attacker scope. Acceptable-loss tolerances are parameters of a conditional frontier until bound before evidence, not invented universal constants. Finite-horizon or bounded active-abuse results do not imply bounded cumulative loss forever.

**Status and OPEN remainder.** Human/evidence/market calibration, local sampling and authority, funded response latency/collection, plausible ranges and precision/error/kill contracts remain explicit. The existing master evidence gates govern testing; this direction selects no new reward, vote, verification oracle, threshold or default migration. D33/D35/D36/D41, D49's genuine-growth test, D50's incentive target, D53's economic boundaries and D61's named reference remain intact. Autonomous preparation does not turn unknown assumptions into favorable facts or waive separate approval for irreversible, external or personal-data actions.

### 29.3 Core-first survivability and recovery frontier (D68)

**D68 — [OWNER research priority / conditional survivability hypothesis; not a threshold theorem], documented 2026-10-27.** The owner redirects effort to the protocol's social graph, human behavior, incentives, economics and earned XP as an internally accountable core. Money-flow investigation may be useful, but is an optional defense enhancement, not a premise that rescues the baseline. Test the core without such peripheral detection or assumed external financial rescue before crediting improvements from them. Actual monetary bookkeeping, custody, funded actions, collectible recovery and economic cost remain part of the core; excluding a flow-based classifier does not exclude accounting. This direction does not select the separately proposed CORE/Standing design, new capacity limits or an unimplemented topology migration.

**D68 owner clarification,2026-10-27 — [HUMAN-OPERATED CORRECTION / FUNCTIONAL REQUIREMENT].** Much of security is exercised by people: rule-following participants need actionable ways to investigate, contest and correct violations, just as adversaries have actionable ways to attack. The system must provide a reachable, funded and authorized path from participants' evidence/decisions to an appropriate executable remedy, including removal where warranted, rather than a nominal API or an outside administrator silently supplying the result. First test procedural operability under explicitly favorable information, willingness and adequate declared resources: can available eligible corrective actors reach and execute a decision despite permitted adversarial counter-actions? A failure even in that conditional best case exposes a concrete mechanism/contract gap without requiring measured human detection rates first. Passing it is not proof of real human cooperation, infallibility or closed security. A received evidence input or participants' explicit action is not an automatic verdict from evaluator truth; roles, authorization, stakes, deadlines and consequences still require enforcement. Preserve the right to defend against false accusations and the distinction between correcting an act and excluding a subject; this requirement selects no new proof standard, quorum, universal XP bypass, punishment or default migration.

**Further D68 owner clarification,2026-10-27 — permissioned entry and traceable accountability.** The system does not recognize lies independently of people noticing and contesting them. Ordinary entry is not permissionless: admission follows the defined invitation/authorization route, with the separately specified genesis boundary, and its origin/relevant historical responsibility can be traced. The owner identifies that traceability, together with usable public disputes and human action, as the intended advantage for rule-following participants. This is not a perfect identity detector, proof that every admitted actor is honest, a demonstrated net incentive advantage or guilt for every upstream acquaintance. Preserve actual invitation/guarantee history and D34 event/role attribution; liability and exclusion still require the applicable established violation and authorized consequences. Research should test whether informed, willing and funded participants can use this accountable route against adversarial counter-actions, rather than make an automatic truth classifier the premise of security.

**D68 owner research hypothesis,2026-10-27 — organized defense and an early-coalition head start.** The owner argues that rule-following participants can organize and communicate before an attacking coalition, coordinating evidence, effort and action through dispute mechanisms to preserve the system. Test organized human defense against organized attack, not isolated reactive honest actors against a coalition assumed to coordinate perfectly. An earlier legitimate community, earned XP/relationships, resources and experience may supply a declared starting advantage; whether it becomes usable correction and survives adversarial coordination is the hypothesis. Do not encode permanent honesty, guaranteed turnout/correct votes, free shared resources or victory as the answer. Communication is not independent evidence, a group XP total is not an authorized individual's standing, and a private coalition is not automatically a Council. Compare matched genuine growth/resources and, where methodologically bound, coordination ablations labeled as research counterfactuals, never new protocol options or a calibrated human law. D67's common-channel notice assumption still does not imply cooperation or successful enforcement. This direction adds no automatic group-XP pooling, initial-entry exemption, quorum, reward, collective guilt or source/default migration. If coordination earns an individual new standing through subsequent guarantees, it must carry the actual source-linked warranty duties and funding costs; it is not a conversion of the group's old XP into authority. The same actions may be available to coordinated violators, so increased organizational capacity/XP alone establishes neither an honest-only advantage nor the truth of a complaint. Distinguish the ability to fund an entry from actual complaint admission, authorized merits and appropriate execution.

**Target condition and distinct denominators.** The owner proposes testing survival when more than two-thirds of people follow the rules, or when more than two-thirds of earned XP is controlled by rule-following people. These are distinct hypotheses, not interchangeable thresholds. For procedural power use the declared current effective XP after authorized adjustments, and keep cumulative historical earned credits separately identified; never silently substitute one denominator for the other. Zero total effective XP has an undefined share. The genuine-person mapping and rule-following classification are evaluator assumptions, not defense-visible truth. A global XP share is not the maximum individual XP, the local available challenge pool, Council seat/vote share or funded timely defense. Bind initial versus continuously maintained conditions; behavior switching, penalties, admission and exit can change those shares endogenously. Do not impose favorable future compliance as an outcome-free input.

**Survival is not perfect purity.** Nonzero adversarial participation, escaped violations or imperfect issuance attribution need not imply collapse. The core must preserve usable genuine participation and the ability to correct violations, retain legitimate authority and fund authorized responses without borrowing effectiveness from optional detectors or free support. Track innocent losses, unresolved cases, actual recovery, debt, active abuse and cumulative attack-attributable harm separately. Lawful earnings by a genuine coordinated adversary are not automatically illicit. This is a protocol/economic viability target, not guaranteed purchasing power or proof that every emitted coin is backed by an honest person.

**Recovery frontier, not a universal percentage.** Seek the boundary between states from which specified authorized internal actions can restore the declared viable region, and states from which they cannot under the stated response resources, evidence, horizon and permitted interventions. Bound both observation H and recovery horizon H_r, actual funded repair budget, innocent-harm/access tolerances and the attacker action scope before data. Absence of recovery by H_r or failure of a bounded search is not proof of absolute irreversible ruin. The same honest-XP fraction can have different recovery prospects because concentration, graph position, earlier damage, active Council capacity and liabilities differ; a sharp threshold or monotonic response is a hypothesis, not a required result.

**Research discipline.** D66 anytime Council voting and D67 common-channel near-immediate notice remain supplied core conditions; no separate diffusion study is required. Available evidence may be erroneous, correlated or missing; near-immediate notice is not an omniscient merits oracle or free review. Compare core-only/no-attack/attack/recovery contexts at matched resources and ordinary opportunities, including genuine-person violation coalitions, honest overload and adverse initial histories. Optional detector arms come later as marginal improvements. A conditional mathematical guarantee needs an explicit formal model, assumptions and proof; simulation can test/falsify a scoped claim and estimate a bounded frontier, not establish universal survival from sampled runs. Existing master prerequisites, committed methods and selected-rule OPENs remain intact; D68 changes priority, not their truth or a safety threshold.

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

**[DIRECTION]** Proven serious violations can create actual deflation through burns of collectible FACY. This is separate from D105's1FACY invitation burn, D93's1FACY valence charge and Atmo buyback burn.

## 31. The DEOS / Atmo capital model

The Atmo instance uses the separation of capital allocation and spending authority defined by DEOS and TMCTOL.

| Capital component | Intended role |
| --- | --- |
| **Bucket A** | Immutable monetary anchor; not discretionary Facety funding. |
| **Bucket B → Treasury B** | Development and builder-related spending under its own policy. |
| **Bucket C → Treasury C** | Operational capital and available native/reserve assets. |
| **Bucket D → Treasury D** | Dormant allocation at launch; later a Demand policy used to support Facety through FACY buyback and burn. |

Buckets and Treasuries are not interchangeable. The right to change the capital's liquidity position is a different control plane from the right to spend treasury assets.

**D65 — [OWNER economic framing / proposal, not established funding or a sustainability theorem], documented 2026-10-27.** The strategic brief proposes a one-sixth protocol-flow allocation and describes DEOS/Facety as economic L1/L2 federal layers. These are proposed integration terms, not evidence of an existing universal DEOS transfer, guaranteed liquidity or a separate blockchain requirement. DEOS supplies reusable execution; Atmo is the concrete instance; Facety is its accountable-human application. An allocation needs its actual asset, flow base, authority, budget, available funds and routing contract. D53's autonomous FACY versus conditional Atmo support remains intact; neither a nominal fraction nor a research work cap supplies outside money, a price floor or verified economic demand.

**D65 terminology — Protocol Income.** Use this term for an explicitly specified service/fee receipt attributed to reducing uncertainty or verification work. It does not declare every FACY emission a service payment or establish that work was useful/true. The fixed-total review-resource comparison conserves an assumed work endowment; it does not prove independence from new participants, eliminate Ponzi risk, establish contribution-proportional income or solve long-run financing.

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

### 33.1 Conditional demand as an integrity incentive (D53)

**D53 — [OWNER direction / falsifiable incentive hypothesis], 2026-10-24.** Atmo's ability to withhold or redirect support can discipline a captured Facety network **from outside its own XP/governance structure**. Capturing internal authority need not capture the sponsor's capital-allocation authority. The intended publicly intelligible incentive is that credible genuine participation preserves eligibility for outside economic demand, whereas farming/capture can destroy that future opportunity:

```text
credible and useful human network
    -> Atmo governance can authorize bounded support
    -> funded liquidity/demand policy and actual buyback/burn
    -> valued future participation opportunities
    -> a possible incentive to preserve integrity and correct abuse
```

“Support rewards honesty” describes this intended network-level conditionality; it is not an individual truth oracle, automatic wage or guarantee that all participants understand/believe it. The incentive depends on perceived future value, horizon, actual authorized resources, credible observable health signals and a sponsor able and willing to act. Short-horizon extraction, outside benefits or coordinated genuine-person violations can remain profitable. A private attack gain can exceed the attacker's own share of a funding loss borne by the whole network. A sponsor unwilling to harm innocent users or its own dependent applications may also make a threatened pause/redirection non-credible; these are competing incentive explanations, not selected behavior. Atmo governance can also be captured or misinformed; falsely alleged capture can punish an honest network, and a pause can reduce review capacity precisely when correction is needed. Preserve sponsor independence as a tested assumption, not a property inferred from different token names or source tags.

External support supplies real order flow/resources, not free value or guaranteed redemption/price. §32's buy-and-burn route buys existing market FACY; it does not mint invitation-eligible emissions or XP. Support for liquidity must have its own approved route/budget/custody: buyback is not automatically a liquidity-provider position. Report actual sponsor spend and acquired/burned FACY in their own units, fees/depth/slippage, who receives the funds and who bears pause losses. Do not give autonomous-core experiments an undisclosed subsidy or value XP by an assumed protected FACY price.

### 33.2 Redirectable sponsorship and a recovery fork (D53)

**D53 — [OWNER-proposed recovery option, not an implemented rule or automatic remedy], 2026-10-24.** If a captured instance cannot be repaired, the owner proposes a possible fork/reconstituted Facety network excluding **independently evidenced violators**, with Atmo governance able to authorize support for that replacement instead. The threat matters only if identification, collective migration and funding redirection are credible and affordable; it is not proof that capture is temporary or economically irrational.

Graph/history/flow analysis may suggest investigations. Graph membership, density, community labels, association or a losing defense alone cannot certify who violated a rule. Genuine dissenters, mistaken participants and innocents linked to violators must remain distinguishable. A recovery cannot silently use evaluator ownership/personhood labels as an exclusion oracle or convert Atmo's funding preference into a canonical identity verdict.

**[OPEN recovery/governance contracts]** Define admissible exclusion evidence and contest/appeal, who authorizes the new instance, snapshot/genesis and anchor activation, migrated identity/evidence/guarantee/XP state, balances/asset identity, outstanding rights, debt and historical duties, concurrent claims/double funding, applications/liquidity/social coordination and genuine migration/fragmentation costs. The replacement token is not automatically the same asset or a redemption promise; a fork must not silently erase D34 responsibilities, confiscate balances or import the captured authority it is intended to escape. Selecting a funding destination does not rewrite the old ledger or constitute a selected punitive fork procedure. No automatic fork, graph filter, airdrop, balance/XP reset or governance threshold is authorized here.

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

Atmo's Bucket D should therefore be understood as a **protocol-native marketing mechanism**: it can amplify social-network development, but it cannot manufacture credible identities merely by spending. D51 adds the hypothesis that existing external relationships plus continuing guarantor Self-ID XP motivate genuine recruitment and maintenance; D52 adds the possibility that accumulated authority increases investigative exposure rather than immunity. These may reinforce useful growth or enable collusive concentration/harassment. Neither more emission nor publicity supplies application demand, and no new payment or increasing-loyalty coefficient is selected.

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
    record the used slot at original creation time; cancellation cannot reset it (D79)
    create unique SelfId with one unspent emission right
    perform approved FACY issuance/custody transition
    schedule ordinary XP credit and the end of free veto at 24-hour maturity (D42)
    do not credit ordinary XP on creation or wait for spending/withdrawal
    check and publicly flag conflicting FaceRef claims
    record all results as one valid runtime transition
```

An invalid claim can still be recorded if the only problem is that another subject claimed the same face. A duplicate face claim is a conflict signal, not automatic proof of which claimant is wrong.

### 36.3 Cancel an unspent Self-ID

```text
cancel_self_id(actor, self_id_id):
    require actor is this act's author OR an eligible authorized guarantor (D79)
    require original emitter right is still cancellable and unspent
    require Self-ID age < 24 hours (D42)
    require applicable dispute-precedence policy
    cancel the Self-ID emission
    burn the unit held in emitter custody under minted-escrow design
    record that this cancelled act earns no ordinary maturation XP
    record actual canceller as author or guarantor, without changing the old roster
    preserve the used rolling slot and original recording/chain history (D79)
    do not automatically break the long-term guarantee relation or close an open case
```

There is no cancellation fee for the author or an authorized guarantor within the eligible original window. The author waits only until the original act's24h boundary for its next otherwise eligible Self-ID; cancellation neither refunds the used slot nor restarts24h. Other transaction-validity and anti-spam checks still apply. A truly free blockchain submission must work through the complete transaction-payment pipeline, not merely refund a fee after dispatch.

### 36.4 Create an invitation

```text
create_invitation(creator, registered_target, source_self_id):
    require active and authorized creator
    require declared bootstrap/Council/verification/graph/difficulty and K-activation contracts
    D = applicable_network_difficulty(canonical_snapshot)
    require qualifying_mutual_guarantors(creator) >= D
    if outside_initial_D91_bootstrap:
        require qualifying_mutual_internally_vertex_disjoint_paths(creator, Council_anchor) >= D
    require target pre-registration fields and published zero Genesis Self-ID (D107)
    require new 1-unit invitation opening fits current K at EACH endpoint (D106)
    require own source right unspent, eligible, not disputed and age >= 24 hours
    burn exactly ONE_FACY of its existing backing (D105), no recipient mint/burn/debt
    mark source emission UsedForInvitation
    count exactly 1 invitation-side unit at EACH endpoint from this issuance
    record addressed accountable invitation, frozen for 24 hours
    later acceptance does not repeat issuance eligibility or allocate these units again (D107)
    commit all changes atomically

cancel_invitation(guarantor, invitation):
    require invitation is open and still frozen
    require guarantor currently guarantees the creator
    mark invitation Cancelled; the burned emission stays burned
    do not treat the source consumption as an XP-credit trigger (D42)
    apply only separately authorized XP consequences; treatment of prior matured credit is OPEN
```

### 36.5 Convert to Collector

**[SELECTED D42 lifecycle; reference asset representation]** Conversion is an explicit holder choice after maturity, never automatic. Ordinary XP was already credited at 24 hours; this operation does not credit it again.

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
15. Ordinary uncancelled Self-ID maturity at 24 hours credits XP once and leaves a matured own right in place; withdrawal/invitation use is a separate holder choice, not an automatic transfer or second credit (D42).
16. Free author/eligible guarantor cancellation requires age < 24 hours; leaving an emission unused does not extend it (D42/D79), and cancellation never resets the original issued24h slot.
17. A consumed or converted emission cannot be cancelled again through the original free Emitter-veto mechanism.
18. An active dispute freezes its target's still-unspent emission against use or conversion.
19. FACY bought or received from another subject does not create invitation eligibility.
20. D105 invitation burns exactly1FACY backed by one creator-earned eligible Emitter right. D106 counts1slot at each endpoint on issuance; D107 zero Genesis/recipient emits and burns nothing, no debt, no repeated acceptance eligibility test.
21. Every actual burn reduces fungible FACY issuance by the amount actually burned under the selected asset model.
22. The custody and entitlement ledger cannot create multiple claims against the same backing FACY.
23. Debt and nominal penalties cannot be counted as actual token burns.

### Social graph and responsibility

24. D93 ordinary mutuality requires valid opposite paid valences; each creation immediately burns1own-issued FACY even unanswered. D105–D107 invitation is a special inviter-paid1route, recipient zero Genesis conceptual half with no mint/burn/debt, not two newborn-paid valences.
25. A paid unilateral valence uses1creator-owned K slot from creation (D100), but gives no guarantor XP/mutual responsibility; matching retained units adds no mutual-degree slot. Own-act/independent duties remain.
26. Link termination is distinct from free Self-ID cancellation; D110 makes it free and cancels the terminating party's valence, with valid-end capacity release/history preserved.
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
47. Suspending Atmo buybacks must not silently modify a subject's identity, XP, guarantee status, or legal dispute rights. D74 core-parameter actions require their own explicit authority, scope and activation contract; pausing buyback alone is never that authorization or permission to erase historical/pending rights.
48. Public audit data must not require storing private media bytes directly in runtime state.

## 38. Bounded execution requirements

Substrate execution is deterministic and resource-bounded. The implementation must specify maximum costs for each kind of transition. Use bounded evidence metadata, bounded guarantees per operation, bounded dispute histories or summaries, and bounded queue processing.

Do not scan every subject each block to maintain the active verified count and its activity window. A legacy `N28` index is not by itself the selected verification process. Use a deterministic expiration index or equivalent bounded update method. A missed or delayed background operation must not create inconsistent eligibility results. If eligibility depends on lazy expiration, prove that the value seen by the dispatch is canonical.

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
| Malicious guarantor | Cancel valid Self-ID acts to coerce a real person. | Subject can terminate for free (D110). |
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

### 40.2 Council attention, mobilization and false-positive controls (D65)

**D65 — [OWNER threat-research direction / proposed mechanisms; no proven security result], documented 2026-10-27.** Evaluate attention/capacity attacks against the complete intended correction loop, not only an XP ladder without its Council route. An attacker may grow or acquire access to a senior identity and try a knowingly false position; identity transfer/key exclusivity, actual costs, evidence and authorized loss remain explicit. Old conditional verdict rates do not prove immunity or that baiting attackers is profitable. A rule-following Council majority and collectible proceeds are assumptions to examine, not an oracle or a guarantee that every member earns net income.

**Attention Prioritization** names a proposed filter using visible dispute stakes, significance and public reports. Nominal stakes are not exclusive funded collateral, public outrage is not independent evidence, and many reports can share one source. **Privatized Collective Defense** names the Council-reward incentive hypothesis: authorized successful dispute work may earn part of actual collected proceeds. Allocation/free riding, effort/risk, shared error, collusion, harassment and funding/custody can defeat that incentive; profitability is not selected by naming it. **Time-Lock Mobilization Window** names the opportunity created by the shared seven-day last-move rule, not guaranteed observation or compulsory late-only voting; D66 permits Council voting throughout an ongoing dispute.

**Attention-flood controls.** Compare recycled/unsecured nominal commitments with exclusively funded simultaneous stakes at equal available capital; retain ordinary independently funded smaller disputes. Match legitimate circular transfers and legitimate dispute surges so stake-origin patterns cannot become guilt labels. Under D67, make common-channel notices immediately available to the declared present members, without a separate diffusion model; test early bursts, small or late-arriving harms, response/work outages, shared evidence and pending cases across the declared observation horizon; do not invent a final-three-days filter or resolve pending rights at horizon. Early tripwires/hot lists are notification candidates only, not extra votes, truth or automatic authority.

**Graph and capital controls.** Compare genuine low-transaction communities with collusive rings; no economic transfer does not mean uselessness, and guarantee edges alone neither prove false people nor create XP. Structural witness/indexer validity is not verification of economic value. Compare otherwise matched wealthy and low-balance subjects: FACY cannot buy XP or extra votes, and each formal consul retains one vote. A verified-person mapping and any age/quality/lifetime guarantor-capacity formula remain distinct unresolved contracts; do not infer a selected quota from these tests.

**Admissibility boundary.** The brief's proposed automatic slash/ignore for circular funding and reputation decay for low economic activity are not adopted as enforcement rules. The same observations can arise from legitimate treasuries, refunds, communities or ordinary transfers. Screening may invite independently evidenced review; sanctions require a defined violation, evidence, authorized procedure and actual funded execution. Preserve valid earlier history, innocent defense and non-retroactive duties. No penalty solely for graph membership, public defense, a losing side, capital or reported outrage; no blanket identity verdict from a money-flow flag. Genuine coordinated violation coalitions and clean-history controls are required alongside false identities.

## 41. Required simulation scenarios

The design needs an agent-based or other explicit incentive simulation before relying on it for expensive treasury support or high-stakes identity disputes.

### 41.1 Honest growth and bootstrap

Simulate a small honest genesis community that expands through invited real people. Measure time to eligibility, XP growth, invitation throughput, the effect of the changing decimal threshold, and the cost of maintaining real guarantees.

### 41.2 Colluding false cones

Let a small set of genuine attackers create false subject chains. Include their ability to earn personal Emitter rights and produce their own XP. Measure the real time and external expenditure required for the attack to rival the honest trust graph.

### 41.3 XP concentration

Compare a wide honest network, a very dense group of mutually guaranteeing genuine people, and a synthetic identity cone. Determine whether XP rank measures responsibility or simply the number of repeated internal verification opportunities.

### 41.4 Emitter lifecycle adversaries

Test author and guarantor free cancellation at age23h and rejection at exactly24h; cancel23→next24 and cancel0→next24 must retain the original issued slot across key/artifact changes, not allow instant retry or start a new24h wait (D79). An unused act must credit ordinary XP at24h without a spend/withdrawal call. Invitation use, withdrawal and debt recovery must not duplicate that credit. A matured act left unused for weeks must not become freely cancellable again. Test the separate invitation freeze/cancellation and report its still-OPEN consequences for prior matured XP. Freeze/appeal and exact same-time credit/penalty ordering require declared contracts; historical terminal/unspent-veto fixtures are compatibility references, not D42 acceptance.

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
active verified count, target/adopted difficulty and guarantee/path eligibility
legacy N28 separately when evaluating the older reference
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

The repository's simulator implements the subset in the [coverage map](simulator.en.md#protocol-coverage), with declared assumptions for open mechanics. D33's topology and dynamic-Council design is not implemented; the fixed-101/raw-guarantor legacy reference remains explicitly identified rather than presented as conforming to every current selected requirement. Research evidence does not by itself change these rules. A confirmed model claim passed a preregistered test on reserved seeds under its source and assumptions; an exploratory result maps a finite tested range, and a diagnostic explains a targeted rule or execution boundary. None establishes deployed personhood, real retention or general attack resistance. Full study records are supporting evidence, not additional participant obligations.

## 42. Decisions still open before production

The current design selects the zero-count numeric clamp, dynamic Council lookup, pre-guaranteed genesis route and internal vertex-disjointness. Cluster invitation quotas and external-boundary admission gates are deferred, not current blockers. The remaining questions below concern operational meaning and protection from abuse; §46.13–§46.15 preserve the reasons and supersessions, not a requirement to revive older choices.

The following are gaps in the **protocol**, not discretionary coding choices. An implementer must not insert arbitrary defaults and then present them as Facety doctrine.

### A. Identity and evidence

1. Exact key recovery and proof that key changes belong to the same subject.
2. Canonical face detector, sorting, media normalization, and format-specific addressability.
3. Artifact availability and the legal meaning of public-domain publication assertions.
4. Whether an additional proof of real capture time is required beyond on-chain registration freshness.
5. Evidence rules for human uniqueness, impersonation, fabricated media, and twins.
6. Whether and how a known actor can retract a published artifact while preserving dispute evidence.

### B. Self-ID and Emitter

7. Exact same-subject reuse semantics on an already registered artifact (§14.4); ordinary age-based XP timing at 24 hours is selected by D42 in §17.5.
8. Minted escrow versus deferred mint, including exact supply accounting and custody.
9. Chronological reversal, relation eligibility and same-time credit/penalty semantics; D42 selects 24-hour maturity credit, not spending-triggered or immediate credit.
10. Guarantor authority snapshot versus current graph authority at the time of cancellation.
11. Precedence of an authorized guarantor cancellation and an open Self-ID dispute.
12. Freeze and appeal effects on age-based eligibility and finality.
13. D93 selects immediate1own-FACY burn per created valence, even unanswered/no refund; source provenance, invalid/frozen/debt/D77/failure/matching/K atomic execution remain.
14. Meaning of a terminal Emitter right when backing value was only temporarily reserved.

### C. Entry, guarantees, and graph

15. Actual pre-guaranteed genesis membership, verification/activity, financing and activation; the numeric zero clamp and already-guaranteed starting route are selected, not open alternatives.
16. D100 resolves K's OWN OPEN valence/invitation resource (unanswered included, retained matching not charged again), replacing mutual-only degree. D99 one original creation inviter is not a two-outgoing invite quota; D104 removes D102's mandatory invitation-chain member; Dcurrent mutually qualifying Council paths with D36 whole-family independence remain, no ancestry prerequisite/cascade. D105–D107 now select invite1/both-side slots/preregistered zero Genesis/issuance-only validation; startup/paid valence/same-ID re-entry/closed-record rules remain. Bind owned-unit duplicates/pending/accepted/recipient-side mapping, canonical ordinary/special records, source/failure/D77/cutover, first100/Council activation, mature downturns and path/member snapshots/bounds/self cases; no raw legacy counter/graph or lifetime quota.
17. How disputed or cancelled acts affect the rolling active-subject count.
18. Invitation target binding, expiration, acceptance, replay protection, and any cancellation remedy.
19. D105–D107 settle inviter1/recipient0,1slot at each endpoint at issuance, existing pre-registration/zero Genesis with no recipient mint/burn and no repeated acceptance gate. D93/D94 ordinary paid valence/opposite persistence remain. Bind canonical ordinary/special/zero-act records, duplicates/K/pending/failure/D77/source chronology, not a reopening of those choices.
20. D110 selects free termination (D85's free branch); bind atomic execution and history, not the superseded fixed-fee premise.
21. Connectedness policy, liability scope for upstream roots, recovery and alternative paths.

### D. Disputes, XP, and the Council

22. Exact XP rounding, event ordering, new-credit treatment after halving, and penalty finality.
23. Which participants in a losing side or guarantee chain receive XP penalties.
24. What makes a challenge admissible, including deadlines for different transaction types.
25. Stake asset, initial amount, escalation schedule and winning-stake distribution.
26. Execution bounds and deadline interactions; the selected finality window is 7 days after the last entry (§26.5), superseding earlier extension candidates.
27. Finality/appeal effects when reversal of already matured XP affects prior eligibility or decisions; an act in its initial free-veto window earns no ordinary maturity credit (D42).
28. Council referral, membership snapshot, recusal, quorum and intervention threshold.
29. Merits decision procedure after Council intervention, and how it overrides or continues the ordinary Chekharda sequence.
30. Evidence thresholds for intentional fraud versus negligent guarantees.

### E. Money, operations, and safety

31. Financial penalty function, relation to proof-chain length, per-person caps and recoverable assets.
32. Debt collection versus token burn, repayment order, and identity abandonment.
33. Treasury D activation, pause and restart policy, credible health measures and market limits.
34. Bounded on-chain storage, indexing, execution weights, and migrations.
35. Privacy, access to identity media, safety of public artifact publication, and dispute evidence retention.
36. D74 core-control electorate/weight/quorum/proposal/execution, health-evidence safeguards, delay/duration/restoration and the exact pending-invitation/emission-XP/existing-case/Council-entry/timer/veto effects; the four delegated parameter names/defaults are selected in §8.1, not OPEN alternatives.

## 43. Suggested implementation sequence on DEOS

The following sequence is **[REFERENCE]**. It aims to prove the smallest complete economic and identity transitions before building the full social system.

| Stage | Deliverable | Required test |
| --- | --- | --- |
| 1. Framework alignment | Pin current DEOS runtime and SDK contracts. | Existing asset, Router, Actor, treasury and payment behavior are mapped to Facety needs. |
| 2. Artifact and FaceRef | Hash registration, timestamps, deterministic face indices. | Same canonical artifact produces the same references across supported clients. |
| 3. Self-ID and Emitter | NFT-like Self-ID plus exactly one emission right. | No double emission; free cancellation only before 24 hours; explicit matured-custody contract (D42). |
| 4. Group Self-ID | Multiple separate signed claims on one artifact. | Two different subjects can claim different indices; duplicate index conflict is flagged, not rejected. |
| 5. Guarantees and invitations | Matching authorizations, verified difficulty, separate qualifying guarantee/path gates and earned FACY burn. | Purchased FACY cannot create invitations; path witnesses exclude shared intermediaries; verification/anchor/genesis contracts precede enforcement. |
| 6. XP and prevention | Age-based personal/guarantor credits; initial-window free cancellation. | Unused valid act credits once at 24 hours; spending/withdrawal cannot duplicate it; pre-maturity cancellation prevents it (D42). |
| 7. Dispute engine | Ordinary challenge, Chekharda, monetary stakes, deadlines. | Valid XP escalation, freezes, deterministic outcomes and penalties. |
| 8. Council | Difficulty-sized eligible consuls, phase/case snapshots and intervention ballots. | No formal one-consul powers; one vote per formal member; apex review, quorum and membership changes have explicit contracts. |
| 9. Financial sanctions | Real burns, recoverable debt, auditable XP halving. | No double collection or fictitious burns. |
| 10. Atmo demand interface | Treasury D purchase and burn under bounded policy. | Treasury limits, actual output burn, pause behavior and atomic local execution. |
| 11. Adversarial system tests | Agent-based model and fault-injection integration tests. | Honest-growth and coordinated-attack scenarios expose quantified outcomes. |

A UI and indexer should display the same canonical state as the runtime. They may enrich visibility, but they must not invent identity finality, balances, or Council results.

---

# Part IX: Condensed Protocol Constitution

## 44. Principles to preserve

1. **A subject is not a wallet.** An identity survives an authorized key change.
2. **A Self-ID is a signed, individually addressable claim.** Its media and FaceRef do not automatically prove unique personhood.
3. **An uncancelled Self-ID earns its subject and eligible guarantors 1 XP each at 24-hour maturity (D42).** Unused value counts too; invitation use or withdrawal neither triggers nor duplicates that reward.
4. **Before maturity the emission is restricted; its one-time provenance remains essential afterwards.** Matured-custody representation must not enable double use or market-funded invitations.
5. **One day credits XP and ends the original free veto; it does not automatically withdraw the matured own right.** The holder separately chooses withdrawal or invitation use; a new invitation has its own additional 24-hour freeze (D42).
6. **Free guarantor cancellation ends at 24 hours even if the emission is unused (D42).** Later adjudicated correction and sanctions are separate, not an extension of that veto.
7. **The guarantor can prevent one bad act without automatically revoking a real person's identity.** Responsibility for identity guarantees is separate from responsibility for individual Self-ID acts.
8. **A real guarantee needs both subjects' authorization.** Either party can end a relation under the fee and graph rules.
9. **An invitation consumes personally earned FACY and requires both difficulty-sized independent guarantee support and internally vertex-disjoint XP-centered paths.** Verification/anchor details remain OPEN; no cluster quota is selected for now, and market capital cannot directly buy the right to invite.
10. **Group artifacts create independent claims about shared appearance, not automatic guarantees.** Duplicate face-index claims remain visible and disputable.
11. **XP is earned authority.** It is not money. Participants compete for it and risk losing it in public disputes.
12. **Chekharda escalates responsibility through strictly increasing XP and monetary stakes.** Higher XP grants a procedural role, not an automatic proof of truth.
13. **A difficulty-sized Consul Council gives each eligible member one vote.** Its target is capped by population/eligibility; the one-consul target means no formal Council, not a single-person sovereign. Referral and merits contracts remain OPEN.
14. **Fraud can damage an accountable proof chain.** Disconnection and proven personal guilt must remain separate findings.
15. **Recorded debt is not a burned token.** Actual monetary supply changes require actual mint and burn operations.
16. **Facety's credibility is a public good.** Public misconduct by its most respected participants can destroy its legitimacy.
17. **Bucket D connects Atmo to Facety through an approved, bounded economic policy.** Atmo can buy and burn FACY, but cannot purchase historical XP or define human truth through market spending.
18. **The test of the design is behavioral.** The protocol succeeds only if honest participation is practical and large, profitable fraud becomes sufficiently difficult under realistic adversarial behavior.
19. **Vouch for people you know.** Guarantees flow through real acquaintance; requests from strangers are refused by default.
20. **A proven false identity cuts its whole Self-ID chain under the defined sanction.** Actual recovery is distinct from nominal debt, and D34 retains responsibility for relevant historical events after exit. Duty, event/penalty identity, overlap and correction funding still need exact contracts.
21. **Accountability needs inspectable evidence, not unlimited personal exposure.** Base-history visibility, lawful access and safety need explicit boundaries; D33 permits optional privacy-preserving proofs to external applications without erasing internal responsibility.
22. **Following the rules must be easy and profitable; breaking them must be hard and very unprofitable.** This design goal applies to identity acts, guarantees, invitations and disputes. It is not established by more XP, a finite-menu payoff maximum or an assumed token price; real usefulness, human choice and attack costs require evidence.

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

**Later clarification — D35, documented 2026-10-23:** [§46.14](#4614-xp-centered-paths-pre-guaranteed-genesis-and-no-cluster-quotas-d35) adds a separate `D`-path requirement toward the XP apex/core, selects a pre-guaranteed genesis starting group, and defers cluster invitation quotas. Earlier D33 text is retained for history; D35 takes precedence where stated.

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

**D35 refinement:** the `D` guarantees and `D` paths toward the XP apex/core are separate, conjunctive requirements (§46.14). The owner's term “mutual guarantees” does not by itself select a new reciprocal-edge counting rule.

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

**D35 refinement:** bootstrap starts from an explicitly recorded, already mutually guaranteed genesis group; roughly 7–12 participants is the owner's example, not a mandatory range (§46.14). The earlier unresolved first-guarantee question below is historical for that selected starting route; exact genesis contents and activation remain to be specified.

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

The protocol MUST define the target size through the **nearest-integer** square root of difficulty, not ceiling (D33 owner clarification, 2026-10-24):

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

**Superseded for the current design stage by D35:** the owner selected no cluster invitation quotas or cluster-boundary admission gates for now. The following formulas and rationale are retained as deferred design material, not active requirements. They MUST NOT be enforced by default or kept as prerequisites for the current path-based invitation design (§46.14).

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

**D35 scope:** the XP-centered path requirement replaces an unspecified healthy-core direction with the owner's chosen XP anchor concept; exact anchor membership remains OPEN. Conductance/community observations remain research material, but MUST NOT impose the deferred cluster capacity limits described below.

**Trusted seed or healthy core.** The protocol MAY maintain high-trust seeds, such as long-term participants, Council members or highly effective XP holders. Trust propagation SHOULD be weighted by proximity to this core. Core selection, rotation, correction and compromised-seed recovery MUST be explicit; proximity and founder status are not proofs of honesty or uniqueness.

**Independent degree.** The protocol MUST prefer independent effective degree over raw degree. Many edges or many paths with the same controlling source are not many independent confirmations.

**Conductance.** The protocol SHOULD evaluate the discussion's cluster-boundary ratio:

```math
conductance(C) = external_boundary(C) / internal_volume(C)
```

**Historical capacity proposal, deferred by D35:** high internal density with low external conductance was intended to reduce invitation capacity; this is not a current quota or cluster-boundary gate. Conductance remains a possible review observation. The graph, edge directions/weights and meaning of `internal_volume` remain OPEN; this ratio MUST NOT be silently equated to a different standard conductance definition. Zero/undefined volume requires explicit handling, not zero-imputation. Dense genuine groups and weakly connected genuine newcomers require matched controls and review, not automatic identity invalidation.

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

**Historical D33 summary:** preserved verbatim as requested. D35 (§46.14) supersedes its mandatory cluster-boundary capacity constraint for now and adds the separate XP-centered path gate. This paragraph MUST NOT be read as reactivating cluster quotas.

Facety MUST use dynamic Network Difficulty based on the number of active verified participants. The minimum number of effective independent guarantors required for invitation rights MUST equal Network Difficulty. The protocol MUST allow cold-start operation with one guarantor. For networks below approximately 100 active verified participants, the formal council mechanism MAY be absent, and coordination SHOULD rely on XP, public accountability, time delays, preventive cancellation, and Chekharda-style dispute escalation. At larger scales, council size MUST expand dynamically according to the rounded square root of Network Difficulty, using the sequence 1, 11, 101, 1001, 10001, 100001. Invitation capacity MUST be constrained not only by individual guarantors but also by cluster effective external boundary, independent support, temporal aging, and dispute history.

This owner-provided summary is interpreted with the exact phase rule, genesis limitations and unresolved transition contracts above. It is not a new allocation formula: one-unit Self-ID emission, non-transferable XP and accountable guarantees remain distinct from useful-contribution measurement and sustainable distribution. Success requires useful honest participation and correctable influence with bounded extraction, capture and wrongful exclusion; more graph edges, XP or payouts alone establish none of these.

### 46.13 Conflicts, supersession and proposed resolutions

**D35 update:** pre-guaranteed genesis resolves the starting-route choice, not every initial-state field; the cluster quota/accounting gate below is deferred rather than a blocker. XP-centered paths narrow the core concept; D36 (§46.15) subsequently selects internal vertex disjointness. Graph direction and anchor membership remain OPEN. Remaining D33 conflicts below apply only where not superseded by §46.14.

- **Earlier §18.2 active-subject count versus verified count:** D33 selects `N_verified` as the design input and retains the decimal threshold. Proposed resolution: specify a publicly auditable verification/activity predicate without evaluator truth, then migrate count/guarantor eligibility. Until then, the simulator's active-accepted count is a legacy reference, not implementation of verified independence.
- **Fixed top-101 Council in §27/D3:** D33 supersedes fixed size prospectively with the selected lookup and no formal one-consul institution. Equal votes remain. Proposed resolution: parameterize Council target/phase after verification, eligible-candidate and case-transition rules are settled. Old 101-member simulations remain historical evidence under their original source and assumptions.
- **Effective XP and §23's no silent multiplier:** D33 explicitly introduces topology-aware selection guidance, not a complete new XP arithmetic. Proposed resolution: define bounded ranking/eligibility adjustments and test genuine dense groups alongside farms before adopting factors; preserve credit/penalty history and distinguish ranking from dispute authority.
- **D15's no-ZK wording and public evidence:** §46.11 permits privacy proofs to external applications while retaining accountable internal evidence. Proposed resolution: define the disclosure/commitment interface separately from base-ledger visibility; no unreviewed secrecy migration or mandatory ZK implementation is authorized.
- **Bootstrap exclusions and single-consul authority:** a one-guarantor threshold does not create a first independent guarantor, and lineage/cluster exclusions can block the intended small starting group. The entire genesis network has zero external boundary, so indiscriminate application of the quota also blocks growth. Proposed resolution: define which clusters are subject to the gate and a bounded genesis/aging transition and apex correction route without self-guarantees, omniscient verification or permanent founder immunity. Details remain OPEN.
- **Hysteresis versus instantaneous formulas and the `N < 100` phase:** distinguish target, adopted threshold and institutional phase; select activation/precedence explicitly. The direct formula examples do not authorize an unstated epoch policy.
- **Boundary quotas, weighted sources and the example cluster seat cap:** these are not enforceable budgets without normalization, persistent cluster/source accounting, quota periods and infeasible-cap handling. Proposed resolution: define those contracts and test reset/split, rented bridge and genuine-newcomer cases before implementation; never treat one source's wealth as many independent people.
- **Topology suspicion versus liability and truth:** low conductance, shared guarantors, a failed challenge or an allegation cannot alone prove a false identity or inherited guilt. Proposed resolution: keep eligibility observations contestable and use declared adjudication/authorized model transitions for sanctions. No mandatory stake, bought XP, verified-contribution reward or all-purpose trust score is selected.

**Implementation boundary:** the verified-count, independent-support/path, genesis-activation and dynamic-Council contracts are not implemented in the research simulator. Its active-accepted/raw-guarantor/fixed-101 reference is not this selected topology design. No runtime change or new empirical evidence accompanies D33.

---

### 46.14 XP-centered paths, pre-guaranteed genesis and no cluster quotas (D35)

**D35 — [SELECTED / DIRECTION / OPEN], documented 2026-10-23.** Source: the owner's voice clarification of the three D33 blockers. This records the chosen direction without silently supplying a graph algorithm, reciprocal guarantee semantics or a simulator migration.

**Current D84/D91/D104 eligibility,2026-10-29.** Initial bootstrap before the FIRST100active participants requires1mutual guarantor for Self-ID/≥Dfor invitations, no Council paths/Chekharda. Outside that initial mode, Self-ID retains the guarantor's Council reachability. D104 requires invitations ALSO to present Dsimple internally vertex-disjoint current mutual Council paths, WITHOUT any mandatory invitation-chain member or ancestry verification. No cascade or ancestry-based Self-ID veto is selected. Neither guarantor count nor path family replaces the other. D remains adopted difficulty. Any admissible Council member is an endpoint, not every member or necessarily the highest-XP account.

D36 remains: issuer/terminal endpoints may be shared, intermediaries may not. For a common Council terminal, §46.15 applies. Mixed terminals/terminal-intermediary conflicts, membership/status snapshots, path length/resource bounds, self/zero-hop and adoption remain contracts. The semantic graph is established mutual guarantees, not invitation lineage, raw reciprocal legacy edges, verified independence or cross-user capacity.

**Dated D35 history,2026-10-23.** The former anchor concept was XP apex/core (“consuls or first place”), with exact anchor and direction OPEN. D84 now selects Council reachability through mutual links; it does not solve canonical authorization/eligibility. D35's two tests, pre-guaranteed genesis and no cluster quotas remain. Reachability/disjointness/XP is not personhood, honesty or usefulness; no native migration or WP-G restart.

**D91 — [SELECTED INITIAL bootstrap],2026-10-29.** Before the network first reaches100active participants, Self-ID requires1established mutual guarantor and invitations at leastDmutual guarantors, WITHOUT Council-path checks; Chekharda is disabled. This resolves the initial no-Council endpoint question, not a singleton anchor or waiver of own-source costs/evidence/K/24h rules. It is a starting impulse for rapid growth, not a perpetual `N<100` mode. A mature network later falling below100is explicitly a DIFFERENT unresolved situation: no automatic bootstrap reentry/dispute shutdown, legitimacy verdict, reset or history/debt erasure. Exact canonical count/phase snapshot, first100/Council/path activation/adoption and pending operations still need contracts. The owner's expectation that startup dispute disablement prevents domination is an OWNER HYPOTHESIS, not verified safety.

**Pre-guaranteed genesis.** The network MUST support starting from an explicit genesis state containing a small initial participant set and its already established guarantees. The owner's example is roughly 7–12 initial participants who already guarantee one another and then begin operation. This is a supplied starting trust assumption, not ordinary funded admission and not proof of Sybil resistance. It replaces the need to manufacture the first guarantee through normal invitations from an empty graph. It does not select an exact population, a complete graph, free money/XP, permanently honest founders or immunity from later correction.

The genesis record MUST identify members and established mutual guarantees under D83/D84; historical directed records need an explicit mapping. Declare prior financing/own sources or the supplied pre-guaranteed assumption; no free mint, retroactive burn/refund or permanent exception is inferred. Initial verification/activity status, XP/balances/emission rights, authorization evidence, financing and activation of ordinary invitation/path checks still require a declared contract. The decade formula is unchanged: 7–9 active verified founders imply `D = 1`; 10–12 imply `D = 2`, not a special bootstrap difficulty of one. No formal Council is created at these sizes under D33. The initial group need not acquire external cluster support: the cluster-boundary gate is deferred below. Applicability of other age/lineage/independence filters to the starting graph remains OPEN and MUST NOT silently make the chosen starting route unusable or create permanent exceptions.

**No cluster quotas for now.** The protocol MUST NOT currently impose a cluster invitation quota, a `B_eff(C) >= D` cluster gate or a `floor(B_eff(C) / D)` capacity budget. D35 defers those parts of §46.7, associated capacity reductions in §46.8 and the corresponding requirement in §46.12; their historical text remains available for reconsideration. Quota windows, source reuse and cluster split/merge accounting are not prerequisites for this current design stage. This is not a promise of unlimited or free invitations: the individual guarantee/path conditions, own-emission cost and selected 24-hour contest/cancellation mechanics remain. No new numerical invitation cap is selected by this clarification; earlier pending-cap suggestions remain unimplemented guidance, not permission to introduce a quota covertly.

**Implementation and follow-up.** No runtime behavior changes with this decision. The simulator remains the labeled legacy reference until a separate migration is authorized. After D36's internal vertex-disjointness selection, the [bounded anchor/traversal preparation](../studies/2026-10-23-topology-contract/README.md) now compares one versus several anchors, directed traversal and apex/genesis self-eligibility with executable graph witnesses. Its historical recommendations remain unselected. D61 (§46.16) now authorizes a named epoch multi-anchor reference, replacing that reference-implementation blocker without silently selecting the remaining general-protocol eligibility/ranking/epoch contracts. Shared-bridge and edge-versus-vertex examples are acceptance controls, not unresolved choices. A subsequent implementation MUST compare any optimized path algorithm with its reference and an independent certificate verifier. No empirical anti-cartel mechanism, safe-bootstrap result or attack probability is claimed.

---

### 46.15 Internally vertex-disjoint invitation paths (D36)

**D103 — [SELECTED current graph only; D104 subsequently resolves removal choice],2026-10-29.** Only currently valid relations in the actual protocol graph count for this path gate, NOT historical invitation records or immutable creation ancestry after the relevant link has ended. Preserve original inviter/provenance, past act-time rosters, pending rights and D34/D54/separate D9 history: excluding an old edge from a current path is not erasing its records/duties. “Actual graph” means canonical currently valid relations, not raw stored reciprocal edges, unanswered paid offers or an indexer's assertion. Exact invitation-kind/episode/direction/termination/member snapshots still need a contract.

**A broken Council path is not automatic downstream deletion.** Under D104 the absence of a compatible D-path current mutual family blocks new invitations outside D91 startup; the break of a particular old invitation chain is no longer an additional veto. Neither failure itself expels people, terminates remaining links, rewrites provenance or annuls historical/pending rights. Self-ID keeps its own D84 support/reachability, so emission is conditional, not guaranteed. D104 chooses removal of the special path, NOT D103's candidate cascade or general current-inviter replacement. D95 bounded unsupported-person re-entry and D99 original creation provenance remain separate.

**Current D104 simplification,2026-10-29:** outside D91 initial bootstrap, retain≥Dqualifying mutual guarantors AND Dqualifying internally vertex-disjoint current mutual Council paths; drop D102's distinguished invitation-chain member entirely. No compulsory long ancestry, cascade or general reparenting. All Dpaths still satisfy D36 together. At D=1one qualifying mutual Council path suffices for the path component, not necessarily an invitation path; the separate guarantor requirement remains. Short compatible-path search is a preference, not a hop limit, fixed-cost guarantee, proof from heuristic failure or authorization to trust an indexer.

**D101 — [EARLIER Self-ID candidates, not adopted; D104 now rejects mandatory invitation ancestry],2026-10-29.** The owner considers requiring a current invitation connection and an unbroken invitation chain to a Council member for Self-ID, motivated by concern about closed communities mutually inviting one another. It also explicitly considers the simpler alternative of any one mutual guarantor. No choice is made: D84 outside-bootstrap reachability and D91 startup remain current. D99's one original creation inviter is a provenance fact, NOT a selected continuous-invite prerequisite. Compare immutable creation ancestry versus current invitation admission episodes/active links, broken-chain repair/re-entry, Council changes and genuine access before choosing a gate. Do not rewrite the original inviter, equate historical ancestry with active responsibility or claim the closed-community concern/safety is empirically established. D96 remains an inquiry, not a new default, hop bound or automatic run.

**D96 — [EARLIER investigation direction; D104 now removes the mandatory invitation-chain condition],2026-10-29.** Study whether invitation ancestry reaching the Council should be the primary chain, with additional short independent mutual-guarantee paths as a second component. The owner distinguishes potentially long invitation chains from short social routes; the few-handshakes example selects no numeric hop bound. Distinguish immutable historical invitation lineage, currently active invitation-origin links and ordinary mutual links, especially after D95 re-entry/D98 closure. D96 itself adopted no new gate; D102 subsequently selected a mandatory invitation-chain member, but D104 now removes that requirement in favor of current mutual paths. D91 bootstrap and D36 whole-family independence remain. Bind direction, closed-versus-historical eligibility, multiple admission episodes/inviters, Council/member snapshots, independence/shared intermediaries and genuine access before a derivation/data/migration. Graph ancestry never proves personhood or collective guilt. This is not automatic WP-G/C3 restart, raw lineage extraction permission or public-data authority.

**D36 — [SELECTED], documented 2026-10-23.** Source: the owner's explicit response “do not count them; all paths are unique” to the shared-intermediary example and the recommendation that only the issuer and final center may be common. This selects **internal vertex disjointness**, not merely different edge sequences or edge-disjoint routes, for D35's path gate.

For an issuer `u` and an admissible single Council endpoint `a != u` (D84/D104; mixed-terminal/self cases still require a contract), qualifying paths MUST be distinct simple paths: a path MUST NOT repeat a vertex, and the same path MUST NOT be counted twice. For every pair of counted paths `p_i`, `p_j`:

```math
V(p_i) ∩ V(p_j) = {u, a}  for i != j
λ_V(u, a) = maximum number of qualifying internally vertex-disjoint paths
λ_V(u, a) >= D
```

**D104 witness contract:** no invitation-kind member or separate ancestry proof is required. Verify a compatible D-family in the supplied canonical CURRENT qualifying mutual graph, including path simplicity, whole-family independence and admissible Council endpoints. An ordinary raw-graph max-flow result alone is not verified independence, current authorization, the separate guarantor gate or full funded admission. A short-path heuristic's failure is not an infeasibility certificate.

The shared endpoints are permitted; every intermediate participant MUST be exclusive to one counted path. Merely changing edges while retaining a shared intermediate vertex MUST NOT provide another unit of support. A direct issuer-to-anchor path has no internal vertex and can count once, not repeatedly. This is a threshold, so finding more than `D` disjoint paths is acceptable; the issuer still separately needs `D` qualifying guarantees.

At `D = 2`, the following pairs illustrate D36 disjointness only, not complete D104 protocol admission (arrows show path order; current canonical mutual authorization, qualified support and Council endpoints need their separate predicates):

```text
Does not satisfy the two-path gate: shared intermediary X
u -> A -> X -> a
u -> B -> X -> a

Does not satisfy it even with different edges: shared intermediary X
u -> A -> X -> C -> a
u -> B -> X -> E -> a

Satisfies the structural two-path condition: no shared intermediary
u -> A -> a
u -> B -> a
```

The examples evaluate the displayed pair; additional paths elsewhere in a graph can change its maximum. They prove neither personhood nor all invitation eligibility. Shared endpoints do not grant unilateral authority to the XP apex. D36 does not select one versus multiple anchors, traversal direction, reciprocal-edge counting, active/verified eligibility, XP tie/snapshot rules or apex/self-path handling. If multiple terminal anchors are selected later, their endpoint and transit treatment MUST preserve the no-shared-intermediary condition rather than silently weakening it. D35's pre-guaranteed genesis and absence of cluster quotas remain unchanged.

This decision changes the specification only. A future reference implementation and independent certificate verifier MUST check path simplicity, distinctness, allowed edges/endpoints, pairwise internal vertex exclusion and the `D` threshold before any optimized algorithm is accepted. No source algorithm, default runtime behavior or empirical security claim changes here.

---

### 46.16 Witness-certified path reference and advisory indexer (D61)

**D61 — [DIRECTION / reference implementation mandate; operational remainder OPEN], documented 2026-10-26.** Source: the owner's “FACETY — WITNESS-CERTIFIED PATH GATE AND INDEXER” direction. It authorizes a named opt-in reference implementation/experiment track, WP-G, with documentation/acceptance criteria before code (D48 pattern). It is not a shipped chain component, proof of Sybil resistance, change to D33's difficulty formula, D35's XP-anchor concept/no-default-cluster-quota rule, D36's internal vertex disjointness or D41's pre-burn qualifying-guarantee barrier. The master condition-map mandate retains research/evidence precedence; this direction supplies graph-gate design. Legacy simulator defaults and historical evidence remain unchanged until a separately explicit named integration.

**Witness rather than search at authorization.** A client/indexer supplies a bounded subject/epoch/path certificate. A pure deterministic verifier reads the declared canonical current state and an eligible epoch snapshot, never an indexer/cache assertion. In the reference, the snapshot fixes adopted D_epoch and a top-A eligible anchor set/commitment, A/D in{2,3}; at least D_epoch simple live paths must reach distinct anchors. Counted paths share only the subject; no intermediate or other counted endpoint can be reused across them. Extra bounded paths supply slack after edge/anchor losses, not additional authority. The old single-center D36 endpoint-sharing permission remains valid for that selected generic case; distinct terminals are the named reference's stricter core contract, not a universal rewrite.

**Epoch/current-state split.** Candidate defaults are weekly epochs, grace1 (candidate1–2), hop limit5 (candidate4/5/6), slack1 and rotation fraction0.15; these are placeholders, not calibrated constants. Snapshot membership/difficulty can remain eligible during grace, but every counted edge must be currently live and authorized emergency removals immediately disqualify their anchor. Future economic authorization must bind one applicable difficulty/epoch policy consistently to the qualifying-guarantee and path conditions before burn/recording. In-flight boundary treatment, hysteresis/ties, rotation/shortage/emergency exceptions and snapshot/finality/authentication remain OPEN. Zero-length/self support creates no D paths; default anchor self-eligibility needs other anchors. An exemption experiment must be labeled separately, not a false path certificate.

**Targets are not a Council.** Anchors have routing/verification-target roles only; neither membership nor path reachability grants adjudication or extra votes. Repo XP is a D35-compatible ranking input, not verified honesty or independent ownership. The owner's own-days Standing default is retained as a proposed comparison, not silently identified with repo XP or selected in place of D35's XP core. Its definition and relation to D35, active/verified eligibility and anti-inflation verification must be clarified before live ranking/enforcement. Evaluator genuine/fake/coalition labels cannot supply them.

**Directions and feasibility.** Run directed-from-anchor and explicitly defined undirected projections, without manufacturing reverse guarantees/consent. Stored voucher→subject edges mean a subject-first witness checks each edge in reverse for the directed-from-anchor arm. D disjoint incoming routes require at least D distinct live incoming neighbors and enough eligible other anchors. If a mode holds a subject to exactly c incoming vouchers, D>c is structurally infeasible; c initial vouchers are not necessarily a lifetime degree cap. Report this condition instead of a silent search failure. Any-live-orientation versus reciprocal-only undirected qualification, and the c/D remedy, remain explicit questions rather than a hidden selected rule.

**Untrusted advisory service.** The requested indexer maintains bounded anchor trees, hot live segments, diversified top-M routing (candidate M12, uniform; compare4/8/16 and best-of-two load), repair/invalidation and an exact fallback. Pool rank is not intermediate acceptance XP unless explicit s_min is enabled (default off). A poisoned, stale or censoring indexer can impair availability, not make a false witness pass an independently canonical verifier. Multiple services/local computation mitigate availability; their keys/URLs do not prove operator independence. Public-graph query privacy and external application proofs (§46.11) remain separate.

**Capacity comparison, not reinstated protocol quota.** A global epoch allocation with flow/accepted-set certificates is authorized only as opt-in research arms G (gate), G+C and C. D35's default quota deferral is not superseded. The source/anchor/transit/terminal capacities, per-target demand, accepted-set/fairness/reset rules, captured-source treatment and authenticated local fraud proofs remain OPEN. Literally unit-capacity anchors limit total injected flow to A; unit-capacity target splitting cannot serve D>1 target demand. A capacity contract must resolve these facts explicitly, not silently exempt nodes or claim a global fake/edge bound. Likewise e>=D raw attack edges alone does not establish D short vertex-disjoint routes; per-user reuse may nonetheless let a suitably connected cluster pass many members, which requires matched funded controls.

**Assurance limits.** Canonical encoding/context binding, exact compatible-slack selection, trusted resource bounds, coherent StateAccessor provenance and an independently implemented second verifier precede indexing optimizations. O(k*r) state access is not a proof of linear CPU for arbitrary slack. Ordinary max-flow does not itself enforce hop limits; a pruned tree subgraph cannot claim full-graph completeness. Decremental-tree and unit-network Dinic complexity claims require their precise update/network assumptions and benchmark evidence, not unconditional epoch promises. No result or parameter recommendation is established by this direction. E1–E8 research, kills/precision/ranges/cost targets and actual v2 methods stay preregistered/master-gated; deterministic unit/property engineering is not human calibration or an implicit G1 pass.

---

### 46.17 Reused bridges, core loops and incremental gate evidence (D73)

**D73 — [OWNER research redirection / hypotheses under test, not established safety or a selected gate removal], documented 2026-10-27.** Source: the owner's detailed critique and T1–T9 brief. Prioritize the growth loop (actual Self-ID,24h maturity, own-funded invitation/24h freeze, qualifying creator guarantees AND paths, new subject) and correction loop (specific-act24h veto, Chekharda, applicable D70–D72 Council route, authorized chain/liability consequences). Core FACY accounting retains actual issue/burn/debt/collection/custody and required funded costs; no outside buyback, price floor or recovery fork may make the baseline safe by assumption.

**Shared support is not a reserved resource.** A per-issuer D-path certificate does not prevent other issuers using the same intermediaries/bridges. D purchased boundary supports may serve many suitable issuers within a declared short-path topology; internally disjoint paths within one query are not disjoint allocations across all users. This establishes an attack hypothesis and the need for an incremental-benefit test, not “all clusters pass” or “the path has no effect.” At fixed r, admissible degree/count limits, graph orientation, d_eff and qualified anchors can change feasibility. D81 now clarifies D74's initially100 ceiling as active mutual bilateral counterparts, not incoming unmatched votes; referendums may raise/lower K without forcing existing effective links to end. D75 valid-end immediate release/D34 retained (§19.4), not a lifetime or measured growth-rate bound; D35 still defers cluster quotas and D61's C remains a separately specified research arm.

The comparison MUST distinguish assumed fake graph nodes, non-oracular effective support, per-issuer path certification, actual funded admission and profitable sustained growth. Invitation lineage, public cluster labels, age and XP do not by themselves identify independent people. A d_eff that compresses one apparent cluster may block genuine families/communities; raw count and source/lineage/cap/age alternatives require explicit observation and genuine-access controls. Neither one-chain bridge exposure (§21.1) nor negligible honest exclusion may be assumed. Daily emission/freeze latency is not a permanent stock cap or the established issuer's universal48h cooldown.

**XP accumulation and correction race.** Mutual edges create no XP: qualifying Self-ID source receipts do. An m-member fully directed guarantee clique with one qualifying Self-ID/person/day can conditionally earn m XP/day/member before cancellation/penalties/eligibility changes. A fixed-rate catch-up estimate is not a moving-rank/Council-capture model. XP-centered targets, the case's eligible Council and individual challenge admission remain distinct; anchors grant no Council votes. Detection before an authority crossing is insufficient without usable evidence, authorized funded case/merits and effective correction. Genuine-person violation coalitions, patient growth and legitimate visible coordination need distinct controls. D42 Self-ID cancellation forgoes unissued credit rather than taking already earned XP; invitation prior-credit effects and role-specific D55 sanctions must remain separate.

**Research priority and inclusion rule.** Prepare static T1 reusable bridges, T2 d_eff/genuine-access frontier, T3 guarantee/path factorial and separately specified capacity controls, and T5 weakly connected genuine emitters before dynamic T4 bridge costs, T6 XP/correction race, T7 preventive incentives and T8 no-formal-Council bootstrap. T9 adds capture/false-health-trigger attacks on D74 controls. Static certificate/software checks may prepare the question; empirical execution still requires the existing master gates, supported committed method/source/RNG/ranges/error/precision/search/kills and permission for any external/personal graph. N_verified<100 has no formal Council under the direct rule; at100 the target becomes11, subject to activation/eligibility contracts, not an automatic no-Council100-subject arm.

A claimed core security mechanism must earn retention through registered incremental benefit against amplification, genuine access/harm or declared collapse/correction endpoints, including interactions and named alternatives. “No effect” means no established effect in those contexts/precision, not universal uselessness or authority to delete selected rules/rights after an underpowered sweep. A nonempty simulated cost/d_eff region is conditional candidate evidence, not proof of a working real-world core; finite empty search is not universal impossibility or automatic authorization to add cluster quotas.

Park financial rescue, detailed biometric/FaceRef/group/hash work, external-application ZK/privacy implementation, indexer optimization, capacity except an explicitly defined control, precedent engine, hysteresis and NFT-index polish until the core baseline is evaluated. This does not remove the identity/evidence-error boundary, historical records, privacy permissions or funded correction. The next priority is discriminating structural/semantic evidence, not further pending-Council plumbing for momentum. No current source migration, gate pass, data result, default ranking rule, calibrated human rate or empirical confirmation accompanies D73.

### 46.18 Evidence core convergence (D76)

**D76 — [OWNER research direction / evidence-minimization mandate, not a new protocol mechanism], documented 2026-10-27.** Source: the owner's explicit Evidence Core Convergence mandate. The target is a minimal reproducible account of when genuine human participation grows sustainably, honest participation is easier and more profitable than fraud, abuse and authority capture can be corrected, and recovery remains possible. Feature, study, document and test counts are not success criteria; smaller untested models are not evidence either.

The candidate causal core connects five obligations, none already established merely by naming it: fallible but accountable genuine-person admission/evidence; funded repeat participation and attainable genuine growth; actual source-based XP and the distinction between accumulated credit and exercisable local authority; publicly accessible, funded disputes with authorized act-specific consequences and historical responsibility; and bounded-cost recovery that preserves honest access. Each retained mechanism needs a stated causal role, falsifiable assumptions, scope and incremental benefit against a matched genuine-growth alternative. Topology/XP do not establish truth, graph reachability is not funded growth, publicity is not effective correction, debt is not recovered cost, and finite failed recovery is not absolute irreversibility.

Prioritize assumptions whose failure would undermine this core, reuse applicable historical evidence without replay/relabeling, and prefer minimal counterexamples to demonstrations of expected operation. Where appropriate, test presence, necessity/ablation and named alternatives against adaptive opponents and matched genuine opportunities, preserving declared resources, uncertainty, access losses and private/external value boundaries. Exact code/accounting checks, graph mathematics, simulation, equilibrium under a stated strategy/valuation model and real human behavior are distinct evidence levels. Statistical/mechanism claims still require the existing supported committed methods, source/randomness/claims/context/error/precision/search/kill and held-out evidence contracts; deterministic diagnostics cannot waive those gates.

**D76 owner depth clarification,2026-10-27 — [RESEARCH PRIORITY, not a numerical safety claim].** The owner requests deeper simulation both through time and across larger participant populations. Small deterministic cases remain checks of individual mechanics, not substitutes for the network's longitudinal life: funded admission and exit, accumulated XP and historical duties, repeated conflict and overlapping response, organized defense and patient adversaries that can change behavior after earning a history, capture and recovery while ordinary participation continues. Test the earlier honest-community head start as a conditional evolving history, not an assigned permanent winning majority. More ticks or copies of a fixed, frozen population do not establish these feedbacks. Greater scale/horizon must preserve matched genuine opportunities, actual budgets, declared observations and chronology; supplied behavior changes are scenario interventions, not calibrated or learned human laws. A long run with no effective opposing actions, suppressed honest growth or missing correction is not evidence of resilience. Population/horizon ranges, attainable growth, behavior/evidence/resource assumptions and supported implementation remain to be bound before a research run; no particular size, duration, empirical result, OPEN-rule answer or infrastructure expansion is selected by this clarification.

**D80 — [OWNER research-scope re-selection, not a protocol-rule selection],2026-10-28 10:08:07Europe/Samara.** In response to the explicit WP1/prior2 parking and local-stop handoff, the owner asks to continue checking and lifts the pause. Resume the existing WP1 prior2 lifetime-quota COUNTERFACTUAL analysis; the previous branch-specific parking is superseded for this check, not erased from history. Lifetime K is not the selected D75 active outgoing guarantee limit or the renewable K/V reference. Begin from existing contracts/evidence and distinguish necessary inventory from attainable distinct-voucher growth before code or data. This authorizes continued bounded checking under D76, not a new lifetime protocol rule, default migration, scientific/G1 pass, changed master order, automatic WP-G/C3/stopped-study restart, or external/personal-data permission.

**D108 — [OWNER research-gate release, not a protocol-rule selection], 2026-10-29 22:30 Europe/Samara.** Source: the owner's reply (in Russian) to the assistant's project review, which named the unbuilt WP1/G1 method as the single blocker and proposed testing the D50 thesis directly: "да, подтверждаю, разрешаю разблокировать гейты" ("yes, I confirm, I allow the gates to be unblocked"). The master-programme order lock (G0→WP1/G1→WP2/WP3/WP5→…) and the WP1/G1 committed-method precondition no longer block research runs. The first released study is the [D50 falsifier](../studies/2026-10-29-d50-falsifier/README.md), with design choices in [Q16](../DECISIONS_NEEDED.md#q16--d50-falsifier-design-d108). Unchanged: every claim still needs a committed registration before its reserved-seed confirmation, with its own kill criterion; results keep their actual evidence level; no OPEN protocol rule, default migration, real/personal-data use or ethics approval follows from this release.

**D109 — [OWNER research-design binding, not a protocol rule], 2026-10-29.** Source: owner reply "по Q16 всё по умолчанию" ("Q16: all defaults"). The [D50 falsifier](../studies/2026-10-29-d50-falsifier/README.md) uses the six [Q16](../DECISIONS_NEEDED.md#q16--d50-falsifier-design-d108) defaults: per-effort FACY-equivalent holdings, honest versus attacker, as a log ratio per paired replica; weak D50 contradicted if any context shows attacker yield ≥ honest; strong 10× only if it holds in every context; fabrication weights {1, 5, 20} as contexts; three defense contexts; 90 days with a 10000-subject cap; legacy cohort engine with D42 maturity XP.

**D114 — [OWNER research-outcome redirection, not a protocol rule], 2026-10-29.** Source: owner reply "пожалуй, тут важно не балансы считать, а процент грязных FACY в обороте, и процент атакующих в сети во времени" ("what matters is not counting balances but the share of dirty FACY in circulation and the share of attackers in the network over time"). The primary D50 outcomes become two trajectories: the share of circulating FACY held by attacker-controlled subjects, and the attacker share of accepted subjects. Per-effort balances become secondary. The remaining D109 balance confirmations are superseded and were not run.

**D115 — [OWNER research-design direction, not a new protocol rule], 2026-10-29.** Source: owner reply "правило 'для приглашения нужно D поручителей и D непересекающихся путей до Совета' является критичным в данной системе, без него нет смысла тестировать!" and "основной тест начинается со 100 честных людей, при этом у них есть фора в 100 дней. совет не всегда состоит из 101! при 100 честных людей совет состоит из 11!". The D104/D36 invitation path gate is the critical defense; takeover tests without it are only a no-barrier baseline. The main takeover test starts from 100 honest people with a 100-day head start before any attacker acts, and the Council follows the selected D33 size lookup (11 members from 100 participants), not the fixed legacy 101. Execution: the [topology takeover study](../studies/2026-10-29-topology-takeover/README.md).

Remove confirmed dead code, redundant context and unnecessary abstractions only after checking their consumers and preservation duties. Do not delete selected protocol rules merely because their empirical benefit is unproved; unsupported proposals remain explicit proposals. Preserve historical packets and reproducibility. Do not optimize or expand a mechanism/harness merely because it is locally implementable: D75/D81 settle current mutual-K meaning and non-destructive parameter changes, not implementation priority or a proved anti-farming effect. Public disputes and real financial custody remain core; auxiliary indexer optimization, rescue and peripheral modules do not acquire priority through availability.

Use one continuing research sequence: select the largest critical uncertainty, state a falsifiable claim, choose the smallest sufficient check, execute only admitted work, retain the result at its actual evidence level, simplify and re-rank. If one branch needs an owner rule or empirical data, pursue another independent useful permitted check without inventing the blocked assumptions or bypassing scientific gates. Stop when all useful admitted work is exhausted; manufacture no scaffolding for continuation. This direction preserves D33–D36/D34/D42/D54–D55/D73–D75, the prior evidence gates and all remaining OPEN contracts; it selects no new personhood oracle, XP reward, hold period, quota, liability remedy, Council rule, default migration or real-data permission.

## Appendix A: Decision log and supersession ledger

This ledger prevents earlier drafts from being mistaken for the latest decisions. Git history holds the exact text changes.

### Decisions of 2026-10-22

| Decision | Status |
| --- | --- |
| One-day windows replace 3-day network use and 7-day Collector conversion. | **[SELECTED]** (§3, §17.3) |
| New invitations are frozen for 24 hours and cancellable by the creator's guarantors. | **[SELECTED]** (§18.5) |
| XP is credited at terminal disposition to the subject and its eligible guarantors; cancelled acts credit nothing. | **[SELECTED then; superseded by D42's 24-hour maturity credit]** (§17.5) |
| The Council is the top-101 XP leaderboard among subjects active in the last 28 days. | **[SELECTED then; fixed size superseded by D33]** (§27.1) |
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

**D33 — [SELECTED / DIRECTION / OPEN], §46.** Source: the owner's explicit directive to permanently record the BrightID-inspired design discussion. Selected design requirements: `D = floor(log10(max(1, N_verified))) + 1`, invitation `k = D`, no size-independent floor of two or more, non-retroactive identity status, `r = round(sqrt(D))` with the lookup `1, 11, 101, 1001, 10001, 100001`, population/eligibility caps, no special authority for the one-consul placeholder, and independent rather than raw support. Guidance includes weighted guarantors, `B_eff`/quota accounting, core/degree/conductance/min-cut/community/temporal/dispute signals, effective-XP Council selection, majority/two-thirds voting, cluster capture limits and hysteresis. External privacy proofs MAY include ZK, refining D15 without selecting an anonymous base ledger. D33 supersedes D3's fixed Council target and refines §18.2/§23; §46.13 records conflicts and proposed resolutions. Verification and factor algorithms, genesis, quotas, epochs, phase transitions, quorum/merits and proof/disclosure contracts remain OPEN. This documentation adds no runtime implementation, new emission schedule or empirical confirmation; the simulator remains an explicitly named legacy reference until a separately validated migration. **Owner clarification, 2026-10-24:** `round(sqrt(D))` means nearest-integer rounding, not ceiling. Exact half-integer ties cannot arise for integer `D`; no new tie rule or changed Council thresholds are selected.

### Historical liability and early correction documented 2026-10-23

**D34 — [SELECTED / DIRECTION / OPEN], §19.3, §20.5–§20.6, §21.1.** Source: the owner's voice clarification after the chain-replay question. Historical guarantees at each relevant event determine liability; link exit does not erase responsibility for previously guaranteed confirmations. This supersedes §19.3's adjudication-time current-link direction, not the ability to leave or the separate relation-XP rule. Early self-initiated dispute/correction should undo the affected event: recover/burn its corresponding emission and revoke that transaction's XP from all historically credited parties, without ordinary punitive treatment for eligible early correction (D29). Eligibility, clock/order boundaries, spent/transferred-value recovery, repeat-abuse safeguards, case/penalty deduplication and overlap remain OPEN. The ordinary greater-XP challenge gate does not itself implement self-correction. The simulator remains the current-link reference; no historical-liability or self-dispute migration, universal immunity, extra burn or empirical finding is introduced by this record.

### XP-centered paths and genesis clarification documented 2026-10-23

**D35 — [SELECTED / DIRECTION / OPEN], §46.14.** Source: the owner's voice response to the D33 blockers. Invitation rights require both `D` qualifying guarantees and `D` qualifying paths toward the highest-XP center / XP-ranked consul core. A small, already mutually guaranteed genesis group is the selected starting route (roughly 7–12 people is an example, not a mandated size). No cluster invitation quotas or external-boundary capacity gate are imposed for now; §46.7 and the capacity language in §46.8/§46.12 are retained as deferred material. Exact anchors, path independence/direction, reciprocity counting, apex self-eligibility and genesis activation fields remain OPEN. This narrows D33's blockers without selecting a verifier, creating single-consul authority or authorizing a runtime migration; D34 is unchanged.

### Invitation-path independence documented 2026-10-23

**D36 — [SELECTED], §46.15.** Source: the owner's explicit rejection of counting routes through a common intermediary. D35's qualifying paths MUST be internally vertex-disjoint: only the issuer and common final center may be shared. Merely distinct routes or edge-disjoint paths with a shared internal vertex do not suffice; duplicate/cyclic walks do not create support. This closes the edge-versus-vertex independence choice, while anchor membership, traversal direction, eligibility/snapshots and apex self-path handling remain OPEN. No runtime migration, cluster quota or proof of personhood is introduced.

### Research contradiction semantics selected 2026-10-23

**D37 — [SELECTED research contract; implemented for new v2 through D38], §47.** Source: the owner's explicit Telegram selection “A” after the calibrated-refutation versus diagnostic-flag comparison. Aggregate contradiction MUST control the one-hypothesis, one-direction registered claim/context family through `min(1, M × min(raw contradiction p))`; support remains the existing maximum-p-value intersection-union rule. Unknowns do not shrink the family; raw quantities and historical artifacts are preserved. This closes E1's inferential-promise choice, not method/version/native/CLI migration, joint-direction or cross-hypothesis control, offline input trust, or a protocol-economic rule. At this decision's initial record the unadjusted native reference remained pending compatibility approval; D38 subsequently supplies that transition, keeping v1 legacy on purpose. No historical confirmation is replayed.

### Versioned research migration approved 2026-10-23

**D38 — [SELECTED implementation contract], §48.** Source: the owner's approval of the concrete transition. New v2 registrations/confirmations bind A's versioned method; existing v1 JSON keeps its original digest and legacy statistics by default. Explicit new-method reanalysis produces a separate identified artifact, not a rewritten registration or retroactive confirmation. Implementation permission is not method permission; method identity travels through native/CLI/study output. No historical study is run automatically, no scalar evidence authentication is inferred, and D33–D36/D34 protocol gates remain unchanged.

### Integrated research mandate documented 2026-10-24

**D39 — [SELECTED research mandate], §49.** Source: the owner's explicit request for a complete root/detailed-direction and combination programme, a canonical backlog task and Grow Loop execution. Priorities order work without deleting untested directions. Sustained genuine guarantee participation/readiness is the immediate outcome; risk of liability is a working hypothesis. Research design/evidence live in `docs/research.en.md` and the existing registers; `BACKLOG.md` remains the only task owner. Bounded cohorts may proceed within their contracts; no new reward, liability, verified-independence, human-study or automatic confirmation/historical-replay permission is implied. Existing selected/OPEN distinctions and scientific validation gates remain.

### Self-contained living protocol documented 2026-10-24

**D40 — [SELECTED documentary role], introduction, “Self-contained living protocol.”** Source: the owner's explicit instruction to strengthen project cohesion, especially its relationship to this document, without making the protocol a hub. The protocol must remain independently intelligible at the intersection of manifesto and specification: purpose, connected mechanisms, current rules, unresolved contracts and limits belong here. Project navigation, implementation APIs, task state and detailed experiment records belong in their own project surfaces and must identify the protocol question/rule they serve. Supporting evidence may challenge the proposal but cannot silently select rules. Earlier decisions and their full research contracts remain preserved; this is not a new edition, an economic/governance change, or permission to fill OPEN mechanics.

### Invitation authorization priority documented 2026-10-24

**D41 — [SELECTED enforcement priority], §18.2.** Source: the owner's explicit instruction to prioritize preventing invitations before the creator reaches the network-difficulty-sized guarantor threshold. The count is an authorization barrier at creation, before burning the own emission or recording an invitation, not just a degree/XP measurement. The separate independent-path requirement remains; this instruction does not supply missing verification, independence, anchor, graph, genesis or difficulty-transition contracts. It authorizes the bounded guarantee-gate implementation/validation, not an inferred full D33/D35/D36 migration or a new research run. Later on 2026-10-24 the owner explicitly resumed Grow Loop for this invitation-authorization scope. That scoped execution mandate does not choose an XP anchor, graph projection, verification or genesis/epoch contract, answer D42's monetary question or resume the whole D39 programme.

### Age-based XP and veto expiry documented 2026-10-24

**D42 — [SELECTED ordinary lifecycle and retained matured own right; asset implementation and disputed cases OPEN], §17.3–§17.6.** Source: the owner's explicit correction that everyone earns 1 XP after one day, not when a coin is withdrawn, and that the guarantor can no longer freely cancel after that day. An uncancelled ordinary Self-ID credits its subject and each eligible guarantor once at age 24 hours, even if unused; invitation use counts without a separate or forfeited reward. This supersedes D2's terminal-disposition trigger and indefinite unspent-right veto, not later adjudicated sanctions, D9/D34, the separate invitation freeze or own-emission invitation provenance. **Later owner clarification, 2026-10-24:** the matured own right remains in place until its holder separately chooses withdrawal or invitation use; automatic Collector conversion is explicitly excluded. XP credit and expiry of the original free veto still occur at age 24 hours independently of that choice. Exact asset representation, locked-case maturation, event ordering and invitation-cancellation effects on prior matured XP remain OPEN. Native migration remains unimplemented pending those contracts; historical results retain their original timing/policies and are not replayed or relabeled as D42 evidence. The owner's subsequent scoped Grow Loop request, documented 2026-10-24, resumes D42 migration work/preparation only: it does not select missing frozen-case/chronology/recipient contracts or resume unrelated research.

### Sub-day simulator design contract documented 2026-10-24

**D43 — [SELECTED design requirements; opt-in sub-day scheduling implemented, legacy daily default retained], Appendix C §50.** Source: the owner's explicit request for a compact scheduler contract (initially six-hour; later refined by the owner to a preferred four-hour draft), separate protocol/decision clocks, preserved daily intensity/resource units, multiple actions per tick, distinct transaction/attention profiles and heterogeneous participants without uncalibrated numeric distributions. Historical daily operation must remain separately identified. This is a simulator-design mandate, not a shorter protocol window, obligation to transact/check on every tick, new reward rule or approval to silently settle D42's disputed-maturity/chronology contracts. The owner's first implementation request authorized the clock-only slice; a subsequent instruction to implement rather than plan authorizes its actor integration. Explicit 4/6-hour modes now run with daily quotas and supplied transaction/attention profiles; omitted/24-hour mode preserves legacy compatibility. Placement is a named simulation assumption, not a calibrated human distribution. Native economy and disputed XP rules remain untouched.

### Preventive responsibility and timed escalation clarified 2026-10-24

**D44 — [SELECTED modeling/research focus; behavioral feedback unconfirmed], §18.5.** Source: the owner's clarification that the four-hour check concerns a root mechanism: a guarantor may recognize misconduct by the person guaranteed and cancel a fake invitation to avoid the resulting exposure. Model attention, fallible evidence, authority, actual paid action and timeliness separately; do not infer endogenous vigilance or immunity for past duties. The simulator now exposes stage and separate evaluator counters, plus a clearly labeled veto-effect counterfactual for diagnostic necessity controls. No new observation probability, reward or historical-liability implementation is selected.

**D45 — [SELECTED scenario capability, not obligatory entries], §26.5.** Source: the owner's statement that a new opposing Chekharda participant can enter every four hours. The simulator supports an explicit regular opportunity schedule, distinct from a batched daily quota, preserving XP/stake/willingness gates, alternation and the seven-day last-move window. Missing entrants are not fabricated; this is not a universal six-entry/day rule or a new court procedure.

### Probabilistic suspicion and low-XP relay clarified 2026-10-24

**D46 — [SELECTED modeling direction; quantitative contracts OPEN], §18.5 and §25.1.** Source: the owner's proposal to model suspicion around Self-ID/invitation/guarantee acts rather than hard inspection limits, with roughly an order-of-magnitude guarantor suspicion advantage, followed by the explicit clarification that low XP belongs to the person who notices and can call a higher-XP participant. This refines D44's research focus and reaffirms D28's discovery/sponsorship separation, not a new truth rule, guaranteed senior response, removal of entry/stake gates, free guarantee cancellation or automatic audience/quorum. Probability/time/XP/evidence/contact contracts and native implementation remain open. Old studies/limits remain pinned reference evidence; no rerun, default/RNG change or general D39 restart follows.

### Intent, act correctness and false suspicion clarified 2026-10-24

**D47 — [SELECTED modeling distinctions; quantitative/evidence contracts OPEN], §25.2.** Source: the owner's explanation that good or bad intent, a valid or invalid Self-ID, suspicion, opening a dispute and its outcome are different events. A good-faith person's act can be defective; a valid act can be wrongly suspected and successfully defended, with the challenging side losing. Later owner clarification on 2026-10-24 expects properly and honestly made photos to be disputed less often in comparable contexts, without zero false accusations, a selected numeric rate or hidden-truth access by challengers. Preserve genuine personhood separately, admit rare false-accusation chains and use conditional stage probabilities without assuming independent rare events or a perfect oracle. D46's low-XP source is not automatically the formal risk-bearing challenger. The owner's subsequent rationale makes formal entry selective on perceived evidence, expected prospects and costs, rather than an unconditional dispute draw; mistaken beliefs and adversarial motives remain possible. This chooses no universal utility threshold, new fault/sanction rule, calibration or adjudication procedure and makes no runtime/history change. **Further owner clarification,2026-10-27:** admitted participants presenting as distinct are handled as distinct responsible participants and presumptively rule-following absent established contrary evidence; possible shared control/coordination is not such evidence. Protocol-visible standing is not evaluator truth about actual people/control, and that hidden truth must not drive defense. This clarifies the existing person/intent/act/evidence distinction, not a perfect-personhood requirement before conditional research, a new admission exemption, ban on legitimate preventive investigation/veto, D33 migration or new proof/quorum rule.

### Changing loyalty and documentation-first development recorded 2026-10-24

**D48 — [OWNER HYPOTHESIS / selected research direction], §9, “Changing participation and network loyalty.”** Source: the owner's statement that participants may become more loyal to the network with time, followed by the explicit request to document all new insights/development lines before developing them. Preserve the possibility of changing behavior rather than a permanent good/bad classification. This selects a research question, not inevitable improvement, an age/XP coefficient, a verified-identity predicate or a new economic rule. Favorable feedback, decline and group attachment must remain separately testable interpretations; update/calibration contracts are OPEN. The documentation alone is not a runtime migration, new experiment, automatic Grow Loop restart or revival of the paused whole D39 programme. **Subsequent owner execution authorization, 2026-10-24:** implement the discussed D46–D48 functionality, add new tests/experiments and continue this scoped work in Grow Loop. This supersedes documentation-only execution status for these lines, not their unresolved quantitative/merits contracts, historical evidence protections or unrelated D33/D34/D42 gates. New experiment methods still precede data; no automatic broad D39 restart or unselected sanction/loyalty law follows.

### Resilience–growth priority recorded 2026-10-24

**D49 — [OWNER HYPOTHESIS / selected research priority], §1, “Structural trust must earn its growth cost.”** Source: the owner's statement that the next major result should show trust-structure complexity increasing resilience faster than it reduces growth capacity, as the decisive test of Facety as a network-effect protocol. Record the favorable proposition as a falsifiable hypothesis, not a required finding. Compare structural benefits and honest-growth overhead with no-attack/attack controls, explicit resources and genuine-harm/capture limits; do not reward a frozen network or infer useful network effects from raw accounts/XP. Metric/normalization, trust-verification and behavior contracts remain open. This reprioritizes the next major research outcome and defers the queued narrow sponsor-pipeline capture, not its committed methods or historical evidence; it does not restart every D39 branch or resolve D33/D34/D42.

### Honest-participation aim and tenfold research target recorded 2026-10-24

**D50 — [SELECTED manifesto intent / research target], §1, “Honest participation and incentive asymmetry.”** Source: the owner's proposed English wording and recommendation to make **10× incentive asymmetry** measurable rather than claim a proven tenfold advantage. Honest participation should be substantially easier/more profitable; existing relationships, earned authority, public accountability, prevention and liability aim to raise fraud costs/reduce expected returns as the network grows. Test genuine-person violation coalitions as well as Sybil farms. Sustained fraud unprofitability with viable honest participation is a significant weaker target, not proof of tenfold superiority; defined common units/denominators, actual recovery and explicit strategy/horizon scope remain necessary. No achieved result, calibration, new reward/sanction or blanket guilt for coordination is selected.

### Recruitment, public scrutiny and preventive maturation clarified 2026-10-24

**D51 — [DIRECTION / HYPOTHESIS], §2.1, “Recruiting existing social capital.”** Source: the owner's explicit A/B/C integration/research task. Clarifies D17/D32's network-building incentive: finite pre-existing acquaintances can supply genuine recruitment opportunities; repeated qualifying Self-ID by guaranteed participants, not invitation alone, can return guarantor XP and motivate maintenance/bridging. Actual endogenous choice, honest-over-coalition advantage, retention and usefulness remain hypotheses; D33/D35/D36 admission gates stay conjunctive and unresolved operational fields remain OPEN. No reward rule or verified-personhood predicate changes.

**D52 — [DIRECTION / HYPOTHESIS], §26.6, “Second-order public accountability.”** Same source task. A public high-XP defense can create audience/notice/work/evidence opportunities for a separately admissible own-history allegation, sponsorship and a new case, even after the first ends. It selects neither automatic guilt/defender sanctions nor a detection guarantee. Honest/mistaken/collusive actors, harassment, local versus outside reach, evidence dependence, routing and capacity remain separate controls. Qualifies the earlier D26 automatic-cluster proposal rather than treating it as the required independent evidence chain.

**D42 further clarification — [SELECTED meaning reaffirmed, no migration].** Same task: valid cancellation within the initial window and ordinary maturity are branches of a single 24-hour condition. Uncancelled maturity credits ordinary subject/eligible-guarantor XP once and matures the retained own right while ending the original free veto. Only the holder's later withdrawal/invitation choice is independent. No automatic Collector transfer, disposition re-credit or automatic retroactive Self-ID cancellation from invitation cancellation; disputed/debt/relation/chronology effects remain OPEN.

### Autonomous economics and conditional external demand recorded 2026-10-24

**D53 — [OWNER economic framing/governance direction, incentive hypothesis and recovery candidate], §8, §29.1 and §33.1–§33.2.** Source: the owner's voice addendum of 2026-10-24: distinguish Facety's original standalone single-token/network-effect thesis from Atmo-supported economics; person-level daily issuance/population saturation and a shrinking relative addition are relevant but do not prove price sustainability. Four billion is illustrative, not a cap. Finite concurrent people/lifetimes do not bound all-time stock, quadratic potential links are not quadratic token value, and no emission end/halving or price floor is selected. Atmo governance using ATMO decides whether to support liquidity/demand and FACY buyback/burn within its own capital/spend permissions; credible withholding/redirection may incentivize genuine integrity, but no benefit or universal awareness is established. A recovery fork without independently evidenced violators and possible redirected sponsorship is a candidate requiring identification, due process, state/asset/liability/migration and funding contracts—not an automatic graph purge or economic guarantee. Existing conditional Bucket D knowledge is refined, not newly invented; native economics and all historical studies remain unchanged.

### Self-ID-sourced XP accounting recorded 2026-10-25

**D54 — [SELECTED accounting architecture / implementation direction], §23.1.** Source: the owner's voice proposal to improve the model with actual XP recipients stored in the Self-ID NFT-like state when XP is issued, including its author, with ordinary credit after24h under D42. Effective XP derives from source credits plus authorized chronological revocations/penalties; balances/indexes are reconstructible caches, not separate credit authorities, and no full-block replay is needed for routine queries. Same-date owner clarification fixes the ordinary guarantor/veto/recipient set at Self-ID creation: later joiners are excluded, any authorized initial guarantor's cancellation prevents everyone's ordinary credit, and successful maturity does not reselect recipients from the live graph. Actual receipts distinguish pending entitlement from issued credit, not a different ordinary recipient group. The owner proposes positive guarantees cooling24h and instant negative termination to avoid hostage membership. The initial discussion left pending-exit effects open; the subsequent same-date owner confirmation preserves pending XP/veto/historical responsibility for already created acts while leaving D9's already-issued-credit treatment intact. Positive activation/cancellation details and frozen/debt/later-remedy contracts remain OPEN; terminal/immediate historical references are not silently migrated. No new reward, sanction, personhood proof or economic finding follows.

### Act-specific penalty roles recorded 2026-10-25

**D55 — [SELECTED sanction direction / OPEN quantitative and procedure contracts], §24.1.** The owner's implementation clarification distinguishes losing Self-ID and invitation acts. Self-ID: author and its fixed initial guarantors bear the declared per-party monetary amount (top act1; deeper affected chain `N`), but only the author receives XP halving. Invitation: creator and its act-time guarantors receive XP halving; invitation monetary amount is not newly chosen. Source-credit revocation remains distinct from XP halving, and actual burn from unpaid debt. Exact `N` counting, overlapping acts, cross-case penalty identity and full merits/remedy/appeal remain OPEN; supplied-case replay protection is not a general deduplication decision. No genuine-person act defect is converted into false-identity enforcement.

### Personal Self-ID NFT chain indexing recorded 2026-10-25

**D56 — [OWNER structural direction / OPEN monetary counting], §21.1.** Source: the owner's voice clarification that Self-IDs are individual NFT-like acts linked into each participant's personal chain, with predecessor/history references and a sequential personal index for traversal and penalty calculation. This refines the existing D7 personal-chain direction rather than inventing another ledger. Index bounds can support suffix counts but do not themselves select charged positions, cancelled/voided/repeated-act handling, a case endpoint or historical duty coverage. `L - i + 1` applies only when every position of that inclusive affected range is chargeable once; it is not a selected universal `N` formula. The owner's subsequent same-date request explicitly authorizes implementation of predecessor/local-index metadata while preserving historical acts, guarantors and XP provenance, without changing `N` or running research experiments. The bounded native metadata slice is now implemented; automatic sanction counting remains pending, with no new monetary rule or scientific finding.

### Historical-chain guarantees and mentoring recorded 2026-10-25

**D57 — [SELECTED historical-chain guarantee meaning / OWNER mentoring direction / HYPOTHESIS], §20.7.** Source: the owner's voice choice to include preceding Self-ID-chain correctness in the guarantee, not only real-person correspondence. The new guarantee affirms the prior personal history without backdating old NFT guarantor snapshots; exact attestation endpoint, risk/fault standard, cancelled/corrected/settled coverage, per-party allocation and case/remedy contracts remain OPEN. The owner describes the inviter as the usual mentor and collective accepted exposure as a reason to teach/prevent violations. New guarantees, continuing profile review and accumulated opportunities are expected to catch defects earlier and make very deep late cuts rare; this is not measured, proof-of-work finality, a100-act cutoff, age/XP-as-truth or automatic guilt by association. D34 attribution, specific-act veto protection and D55 XP-role distinctions remain; no runtime, automatic `N`, new research capture or historical evidence change follows.

### Post-window author self-correction clarified 2026-10-25

**D58 — [SELECTED post-window author self-dispute availability / D34 correction direction / OPEN operational contracts], §20.5–§20.6.** Source: the owner's voice reminder that an author can contest its own erroneous Self-ID after cooling, with opposing participation possible, source XP withdrawn from actual recipients, one-unit author-side economic correction and chain repair. A correct act can defeat that challenge; no-response or authorship does not prove invalidity. D54 chronological source accounting and D56 retained history apply, not blind scalar XP subtraction or physical NFT-history deletion. Timing/eligibility, funding/already burned or debt-used value, dependent-right repair, prior claims, abuse controls and the involved-versus-outside guarantor's procedure remain OPEN. This refines existing self-correction, not ordinary punitive halving, unrestricted amnesty, an implemented court or new research evidence.

### Initiator-dependent correction/cut and implementation authorized 2026-10-25

**D59 — [SELECTED remedy distinction / implementation mandate], §20.5.** Source: the owner's voice instruction to implement the discussed behavior: an upheld author self-dispute corrects its own act, while an upheld dispute by another participant discards the affected chain. §21.1's suffix starts at the challenged act and preserves the earlier valid prefix; guarantors are non-author initiators for this distinction. The author-side correction removes the act's source effects and permits later eligible issuance, without erasing historical records or claiming that uncollected debt is burned value. This authorizes bounded implementation, not hidden truth, an automatic self-win, a general XP-gate bypass, resolved punitive per-party N/fault contracts, or new research captures.

### Invitation-limit research family recorded 2026-10-25

**D60 — [OWNER research direction / HYPOTHESIS], §18.3.** Source: the owner's P/b question and H6: A=(1,1), B=(P,0), H=(P,b in {1,P,2P}) for P in {3,7}, plus no-cost/no-limit0; secondary-only calendar-claim/accumulate/claim_requires/lapse flags. P is a creator cooldown keyed by SubjectId. The proposed `min(1/P,E/b)` is an invitation-capacity prior under explicit funding/demand, not a complete growth/deterrence law. Equality b=P*E co-binds; nominal burn may affect private returns without further throttling. The supplied no-farm-benefit/honest-cost falsifier describes support for that H6 subclaim and must not be silently inverted in registration. Current retained-right bursts are not an independent P1 cooldown. The bounded draft/software controls change no protocol default, allocate no research labels, execute no capture and establish no mechanism confirmation; primary/cost/metric/inference contracts and committed registration remain gates.

### Witness-certified path gate and indexer direction recorded 2026-10-26

**D61 — [DIRECTION / reference implementation mandate; OPEN remainder], §46.16.** Source: the owner's full WP-G implementation-track direction. Authorizes documentation-first, opt-in epoch multi-anchor witness verification, a dependency-separated second verifier, advisory tree/cache/pool/exact-fallback indexing and a separately opt-in global-capacity G/G+C/C research comparison. Snapshot D/anchors, current edge liveness, distinct terminals, bounded slack/grace/hops, immediate authorized emergency removal and no anchor governance authority define the reference direction. Candidate numeric defaults remain placeholders. This supersedes the absence of a named implementation authorization and the old unselected single-apex recommendation for this reference only, not D33/D35/D36/D41, legacy defaults, ordinary funded authorization or D35's no-default-quota rule. Standing-versus-XP/active/verified definitions, direction projection, c/D feasibility remedy, coherent epoch/transaction adoption, canonical codec/slack CPU bounds and capacity source/transit/terminal/demand/fraud-proof semantics remain explicit. O(k*r) accesses, dynamic BFS and unit-network flow bounds are conditional obligations, not proven scalability. No code, benchmark, E1–E8 outcome, new personhood/independence claim, registered method or master-gate pass accompanies M0.

### Majority-conditioned economic resilience direction recorded 2026-10-26

**D62 — [OWNER research direction / conditional resilience target; OPEN contracts], §29.2.** Source: the owner's question about 51% / two-thirds rule-following participation preventing catastrophic devaluation or bounding damage, followed by delegated routine choice/execution. The requested comparison concerns conditional economic resilience, not selection of either fraction as a security threshold or Council quorum. Person/account/authority/response denominators, genuine-person violation coalitions, bounded attack-attributable loss versus price, usable honest growth, horizon/risk and autonomous versus finite Atmo-supported demand remain distinct. Neither fraction alone supplies a guarantee; no empirical result, new voting/issuance rule, filled personhood oracle or default migration follows. Existing master evidence gates and D33/D35/D36/D41/D49/D50/D53/D61 remain unchanged.

### Evidence-led security research continuation recorded 2026-10-27

**D63 — [OWNER research continuation / delegated routine choice; no new selected mechanic], §49.1.** Source: the owner's voice instruction, after the concrete security-feedback/evidence report, to take the most obvious slice and continue implementation in Grow Loop in order. The first work-allocation discriminator is an analyst choice, not an owner-selected reservation policy. Authorizes bounded evidence-led preparation/implementation while preserving master order, selected rules/OPENs, external/privacy gates and immutable historical packets. No old capture, empirical result, G1 pass, calibrated attention/utility or default change is implied.

### Council mobilization and strategic threat brief recorded 2026-10-27

**D64 — [OWNER correction-loop restatement / HYPOTHESIS; earlier time interpretation corrected by D69], §26.5.** Source: the owner's repeated voice counterargument to senior-XP obstruction. Visibility, senior contacts and a Council interested in security/dispute proceeds form the intended corrective loop; no unanimity is required by that hypothesis. The initial documentary record incorrectly interpreted Council entry as an additional separate seven-day interval. D69 explicitly corrects it: Council is the terminal collective entrant using the same ordinary seven-day last-entry clock, no added window. Reward allocation/entry/ballot/merits contracts remain OPEN. Not a quorum, inevitable reaction, calibrated audience or model implementation; XP-only counterexamples do not refute the complete intended route.

**D65 — [OWNER finite threat-research / terminology direction; unsupported claims and enforcement proposals bounded], §31, §40.2.** Source: the strategic brief requesting attention-DDoS fixtures and Threat Model updates. Retain resource/custody/early-burst/genuine-ring/capital controls and scoped Protocol Income, Attention Prioritization, Privatized Collective Defense and Time-Lock Mobilization Window terminology. Its anti-Ponzi/guaranteed-profit/immunity/accuracy claims are not established findings; proposed one-sixth integration lacks an actual funded/authorized asset-flow contract, and graph/flow/low-activity automatic sanctions are not adopted. Conditional Atmo funding, evidence/merits and master gates remain. The brief's late-only Council interpretation is explicitly rejected by D66, not a current or historical implemented default.

**D66 — [SELECTED Council may vote anytime while a dispute remains open], §27.2.** Source: the owner's explicit correction that the Council is not restricted to the final three days. No T-minus3/second-half waiting gate; optional diffusion research and an expected high-XP attention signal must not create one. D69 later corrects the separate-interval interpretation: Council shares the ordinary last-entry clock; referral/quorum/merits and exact collective-entry/ballot recognition still need contracts. No source/default migration or empirical result follows from this documentation.

**D67 — [SELECTED current research abstraction: common-channel near-immediate notice], §27.2.** Source: the owner says dedicated Discord/Telegram dispute channels will include many Council members, so information dissemination need not be studied separately. Use a declared present audience and no material channel-notice delay, not compulsory graph diffusion/attention calibration before this component test. Presence is not universal turnout, funded review, truth, quorum or execution; no actual channel access/creation or deployment fact is supplied. This narrows D66's optional diffusion suggestion for the present inquiry, not its anytime-voting rule, the shared clock clarified by D69, D53 funding or other master evidence gates.

### Core-first survivability priority recorded 2026-10-27

**D68 — [OWNER research redirection / conditional core-survival and recovery target], §29.3.** Source: the owner's voice question whether flow tracing is necessary, followed by direction to concentrate on social graph, human factors, incentives, economics and earned XP. Optional flow/detector/peripheral support must not supply the core's safety by assumption. More than two-thirds of genuine rule-following people and more than two-thirds of XP under rule-following control are separate candidate conditions; neither is selected as a proven threshold/quorum. Survival permits nonzero abuse and imperfect issuance; seek a declared internal recoverability frontier, not assumed perfect purity or a price floor. Current effective versus cumulative earned XP, initial versus maintained shares, concentration/local Council/funded defense, horizons/resources/harms and actual authorized correction remain explicit. D66/D67 timing/notice and all master/method/evidence gates survive; no core implementation, empirical theorem, new oracle or automatic parked-worker/capture restart is implied. **Further owner clarification,2026-10-27:** security substantially rests on people; mechanisms must actually let rule-following participants correct situations and remove established violators where warranted, not only offer attackers usable actions. Test a reachable authorized evidence/decision/execution path even when honest actors already have adequate information, willingness and declared resources; absence of that path is a concrete functional gap, not a missing perfect-personhood oracle. Preserve defense and act-versus-identity remedies; no new quorum, XP exemption or arbitrary sanction follows. The owner's further explanation locates the intended advantage in permissioned invitation-based entry with traceable origin/responsibility and human-operated public disputes, not independent machine recognition of lies. That rationale must earn actual operability/economic evidence; it does not establish guaranteed honesty, automatic upstream guilt or a complete current implementation. **Subsequent owner coalition hypothesis,2026-10-27:** rule-following participants may organize first and use communication/dispute coordination as a defensive head start. Compare organized defense against organized attack with genuine-access/resource controls, not isolated honest reactions against coordinated adversaries; treat early formation as a declared conditional premise, not guaranteed future dominance. No XP pooling, private-group Council authority, quorum/entry exception, extra communication infrastructure or human-rate calibration is selected. Coordinated source-earned individual standing still entails real duties/costs and is not inherently honest-only; financial entry capacity is not an admitted complaint, authorized merits or completed correction.

### Shared Chekharda clock clarification recorded 2026-10-27

**D69 — [SELECTED shared timer / correction of documentary misinterpretation], §26.5.** Source: the owner's explicit voice clarification: no additional seven-day Council window or special clock; each new opposing entrant, including the Council as final collective entrant, renews the common seven-day dispute window. Council voting fits within it, not a further extension; individual ballots do not create successive ladder entries. No need for every member to vote; exact applicable collective-entry/ballot/quorum/merits/finality contracts remain. A suggested shorter three-day Council duration is unselected and differs from the already-rejected final-three-days access gate. This corrects the earlier D64 record rather than claiming the owner changed an established separate-clock rule. Existing native fixture/source-bound checkpoint bytes remain historical; their code did not implement the erroneous additional interval. No default migration, new data or proof follows.

### Council merits referendum clarification recorded 2026-10-27

**D70 — [SELECTED individual-consul initiation and collective merits ballot; execution remainder OPEN], §27.3.** Source: the owner's voice clarification of the prior D70 draft: an open dispute has no Council yet; any formal member may select it and propose the opposing side, triggering a referendum on whether that opposition is right or the previous non-Council participant was already right. This is not merely ratifying permission for a colleague or an administrative decision not to participate. Explicit support for the previous position differs from no quorum/timeout/unknown. It grants no unilateral Council verdict, private-consul immunity, new numerical quorum, example48–72h window, delegation/committee/election system, infallibility or automatic sanctions. The later D72 clarification selects referendum opening as immediate collective entry and restarts the shared seven-day clock, rejecting the earlier assistant-recommended no-clock request/ratification model. Position snapshots, pending/negative/tied/unresolved ballot effects and custody/settlement under that clock remain explicit. D66/D67 timing/notice and D68 core-first/method gates survive; no code, new experiment or claim of a completed Council procedure follows.

### Consul-versus-consul referendum route recorded 2026-10-27

**D71 — [SELECTED direct peer referendum and exclusion of both parties; operational remainder OPEN], §27.6.** Source: the owner's explicit voice instruction to record how Council members dispute each other: ordinary opening transaction, no Chekharda ladder, the remaining Council votes on which of the two sides is right. Both disputing consuls are excluded from that case's voting body, not automatically deprived of seats/XP. This concretizes the no-seniority-immunity route without granting the initiating consul a unilateral verdict. Exact admission/XP/stake treatment, membership/additional conflicts, remaining-member quorum/denominator, insufficient-body/tie/timeout, clock/finality, evidence/remedy/funding and cross-case consequences remain explicit. No new numerical quorum/duration, universal XP bypass, automatic sanction, higher court, source/default migration or empirical safety result follows. D72 later resolves immediate entry on opening the D70 referendum; it does not by itself specify the separate D71 peer-route clock/finality details.

### Immediate Council entry and last-moment safeguard recorded 2026-10-27

**D72 — [SELECTED referendum opening is immediate Council entry / shared-clock restart], §27.3.** Source: the owner's explicit confirmation that opening the Council referendum for an ongoing Chekharda immediately constitutes Council entry and restarts the common seven days, even at the last moment while the dispute is open. No prior collective approval or later ratification is needed for entry; collective merits remain for D70 voting. Deadline is referendum-opening time plus seven days, not an added Council-only window or per-member extension. The owner names this the intended safeguard against ordinary timeout before Council judgment, not an empirical liveness/security proof. Already-participating Council referrals/ballots are not new entrants; exact same-time finalization, custody and negative/no-quorum/tied/unresolved outcome effects remain contracts, not a default time rollback. This closes the general entry-clock OPEN left by D70/D71, without silently choosing D71 peer-case timing, new quorum, rewards, special three-day period or code/default migration. D68 core focus and evidence gates survive; no new study or confirmation follows.

### Core path challenge and four Atmo controls recorded 2026-10-27

**D73 — [OWNER research redirection / conditional structural-economic hypotheses], §46.17 and §21.1.** Source: the owner's detailed path-bridge/core-loop/T1–T9 brief. Prioritizes static reusable-bridge/independence/ablation/genuine-access work before dynamic bridge/XP/incentive/bootstrap/governance tests; parks optional modules and further C3 pending-clock implementation. Individual disjoint paths do not reserve global capacity, but bounded-r/degree/K/anchors/d_eff/economic admission remain explicit. A bridge's liability is not universally limited to one chain; current XP is Self-ID-sourced, detection is not effective correction and small-N ends at the100-person Council boundary. Hypotheses, zero-effect and viable-region criteria need declared context/precision/master-gated method; no capture, rule removal, default quota or G1 pass is selected.

**D74 — [SELECTED Atmo parameter-control scope/defaults; operational contracts OPEN], §8.1/§19.2/§42/invariant47.** Source: the same owner's explicit assignment of four voting levers to Atmo: guarantor limit K100, invitations enabled, emission enabled and opening new disputes enabled. This expressly extends governance beyond D53's support switch, not a consequence of buyback suspension. K counting/renewal/adoption, electorate/weight/quorum/Council-confirmation, activation/authentication/health evidence/time-lock/duration/restoration and pending invite/credit/case/Council/veto effects remain OPEN. It does not identify K with existing probation/lifetime research meanings or cancel history, give automatic graph-based emergency powers, authorize a runtime/default migration or fill in a Council quorum. Autonomous/default-on and separately attacked governance arms remain distinct; no new experiment or real ATMO action accompanies the record. D75 subsequently resolves the counted resource/direction and immediate slot-release rule; the other execution/adoption/governance contracts remain OPEN.

### Active outgoing guarantor limit recorded 2026-10-27

**D75 — [OWNER-selected2026-10-27; counting later clarified/superseded in part by D81; valid-end release/D34 retained], §19.4/§8.1/§19.2/§42.** Source: the owner's explicit choice after the K/reuse/exit/historical-XP discussion: active outgoing distinct SubjectId, immediate slot release once the relation ends, D34 retained; approve this rule before implementing a K-dependent model and researching growth dynamics. Default K=100 remains from D74. This resolves direction/resource/distinct-subject versus acts/lifetime counting and release timing, not effective-active state mapping, valid end authorization/fee funding, pending reservation, same-time operations, positive activation/cooling, over-cap/adoption/governance or continuous support for future emission. Slot reuse cannot erase historical responsibility/rosters or substitute current-edge liability for D34; D54 pending-act rights and separate D9 older-credit treatment are not replaced by a blanket XP rule. No minimum holding period, global quota, proven growth throttling, completed model/default migration, scientific gate pass or new capture accompanies this decision.

### Evidence core convergence recorded 2026-10-27

**D76 — [OWNER research-priority and convergence mandate], §46.18.** Source: the owner's explicit continuous Grow Loop request for a minimum strictly checked viability evidence core: genuine growth, honest incentive advantage, accountable guarantees/XP, public correction, capture resistance and recovery. Prioritize critical falsifiers and incremental necessity under matched genuine access, keep code/math/simulation/equilibrium/human evidence distinct, reuse closed studies, simplify confirmed redundancy while preserving selected semantics/history, and continue independent useful checks when one branch is gated. The existing master/evidence/privacy gates and D75 semantics remain; this is no new mechanism/default/registration, free license for data, blanket deletion or proof that the target is achieved. D75-dependent K implementation is not automatically the next highest-value task. **Further owner depth clarification,2026-10-27:** prioritize longitudinal network life across more participants and longer horizons, with funded growth/exit, accumulated responsibility/XP, patient organized opponents, organized defense and actual correction/recovery during continued participation. Small static cases remain mechanical controls, not a substitute; no numerical horizon/population, behavioral law, new mechanism/default, empirical claim or OPEN-rule waiver is selected.

### Dispute-participant activity restriction recorded 2026-10-27

**D77 — [SELECTED Self-ID/invitation/new-guarantee restriction for ALL open-dispute participants; tentative termination exception NOT SELECTED], §17.4/§26.5.** Source: the owner's voice clarification,2026-10-27 16:48:20 Europe/Samara, after the precise question about new Self-IDs during a dispute over an older converted act. No participant of an open dispute may create Self-IDs, issue new invitations or open new guarantees; it is not restricted to the accused and does not halt uninvolved network participants. This supersedes the proposed fork of permitting new participant Self-IDs and then choosing their freeze treatment. The owner's “probably” about terminating a guarantee remains a proposal, not selected authorization or debt/history erasure. Actual participant/end/Council and operation-phase/ordering bindings, pending/pre-existing rights/converted-principal attachment and frozen/precredited XP remain explicit execution boundaries; ordinary D42 custody/maturity, D34 historical responsibility and other selected procedures are retained. No source/default migration, replay of old evidence, proven growth/defense result or general transaction ban follows.

### Practical defense, public audience and correction clarification recorded2026-10-27

**D78 — [OWNER audience/practical-defense/accountability clarification; early author-cancellation PROPOSAL, not selected], §1/§5/§20.2/§20.5/§25.2/§26.6.** Source: the owner's voice response to the project's evaluation, contrasting real-world person-presence/meetings/vouching/voluntarily offered identity evidence with a supposed inability of genuine people to defend themselves. The owner treats invitation/guarantee/publicity friction as part of the defense and the intended audience's commitment, not Facebook-like universal instant registration; easier access at scale is a hypothesis, not verified accessibility or an instruction to exclude inconvenient genuine controls. A problematic subject/act gives reasons to inspect guarantors, inviter/invitation ancestry and their histories, not automatically judge/charge every neighbor. Existing D34/D47/D52/D57 and D58/D59 early appropriate self-correction retained; person evidence does not settle a genuine person's separate act violation, and recorded liability/traceability is not actual collection. The owner says “I think” the author as well as guarantor may freely cancel its own pending Self-ID before24h without dispute; retain that as a proposed author authorization, NOT an implemented/selected rule, mature free veto, frozen-case escape or automatic Collector conversion. No personal-data authorization, mandatory passport/celebrity/publicity threshold, truth oracle, new penalty/fault/merits/Council/termination rule, default migration or scientific/master gate waiver follows.

### Free author cancellation and original-slot retention recorded2026-10-28

**D79 — [SELECTED basic rule], §5/§17.3/§20.2/§36.2–§36.3.** Source: the owner's explicit voice confirmation2026-10-28 01:31:15Europe/Samara after D78's proposal was separated from existing guarantor cancellation. The author can freely cancel its own eligible pending Self-ID before24h without a dispute or waiting for guarantors, including after noticing its own erroneous act. Cancellation retains the original issued slot: nextSelfID≥originalRecordedAt+24h, NOT cancellationAt+24h and not immediate retry; anti-issue/cancel-spam rationale does not establish total network DoS resistance. Same unspent/unlocked/eligibility/source-disposal/history protections apply; no backdated guarantor role, new fee, second burn/XP credit, identity exoneration, case/hold escape, debt erasure, mature free veto, automatic Collector transfer or new merits/penalty rule. Ordinary Source port implementation is distinct from a general self-dispute controller/maturity migration or default author behavioral policy. D78's2026-10-27 candidate remains historical and is now explicitly confirmed; ordinary D42/D56 and D58/D59 later correction retained, research gates unchanged.

### WP1 prior2 checking pause lifted2026-10-28

**D80 — [OWNER research-scope re-selection], §46.18.** Source: voice2026-10-28 10:08:07Europe/Samara, “Не, ну пожалуйста, можешь продолжать проверять. Снимаю паузу.” In context of the prior2 parking/G1 stop handoff, the owner explicitly resumes checking that existing lifetime-quota counterfactual. The earlier local stop was a truthful prior-scope checkpoint, not an empirical failure or permanent ban. Supersede parking for WP1 prior2 only; preserve D75 active outgoing semantics, renewable-slot distinctions, D76 priorities, actual scientific method/master gates, historical evidence and all other OPEN/data/default boundaries. No lifetime-rule adoption, new engine/study, G1 waiver, stopped sensitivity or WP-G/C3/later-WP restart follows automatically.

### Mutual links, variable K and preserved existing relationships recorded2026-10-28

**D81 — [SELECTED], §8.1/§19.2/§19.4/§42.** Source: owner voice `voice-k1awbot-199814.ogg`, clarifying that one-way incoming guarantor votes/offers may be numerous (a popular subject may have many fans), but reciprocating creates bilateral responsibility and consumes the bounded mutual-link capacity. The current resource is active mutual bilateral relationships per distinct counterpart, initial K100; referendums can raise or lower the common ceiling, with100/150/200/300 as examples rather than automatic growth stages. Lowering MUST preserve existing effective links, including over-cap grandfathered counts, not force termination; normal new mutual activations use the applicable current ceiling. D81 qualifies/supersedes D75's outgoing-only wording where it would include unmatched one-way support, not its immediate valid-end release or D34 history. Exact unilateral-support/active-mutual representation, XP/veto/eligibility/economic effects, pending/cutover/replacement and governance execution remain OPEN; no two-raw-edge/path-projection choice, default/runtime migration, lifetime rule, old-evidence relabel/replay, scientific G1 or external/private-data authority. Current selected meaning is in the main §19.4; D75/D80 and old study records retain their dates.

### No guarantor XP without established mutual guarantee recorded2026-10-28

**D82 — [SELECTED clarification], §17.5/§19.1–§19.4.** Source: the owner's direct text correction after the assistant offered an old directed-code possibility as a protocol question: “взаимного поручения не установлено -- нет XP”. Proposing is not establishing a guarantee. Without established mutual guarantee, unilateral votes/offers or a directed-only acknowledgment do not earn guarantor XP from the other person's Self-ID. This settles the previously OPEN unilateral-versus-mutual XP question; D81's mutual K and variable/reduction rules are unchanged. Actual eligible per-act creation-time roles and ordinary D42 maturity/cancellation still supply credit, not relationship creation itself; no backdated rosters, new author-XP restriction, extra holding period, blanket exit/prior-credit rule, financial/veto/admission/path-projection choice or native/default migration. D54 pending entitlement and separate D9 older-credit treatment retained. Old D31 directed wording/code/evidence remains dated legacy, not authorization to apply that XP rule to D82; canonical mutual/funded activation and other execution contracts remain OPEN.

### Mutual-guarantee economics, eligibility and governance recorded2026-10-29

**D83 — [SELECTED], §17.2/§19.2.** Source: owner's numbered response1. Ordinary mutual establishment burns1self-issued FACY per party,2irreversibly total. One-sided transactions/offers are not established mutual guarantees and carry neither guarantee-derived XP nor mutual guarantee responsibility; author/independent duties remain. Existing maturity/D42/D54/D34 preserved; matching/provenance/unmatched custody OPEN. No B-bond substitution, legacy replay or migration.

**D84 — [SELECTED gates/path/channel direction; optional2FACY invite price NOT SELECTED], §17.1/§18/§46.14–§46.15.** Source: response2. Self-ID needs1mutual guarantor with a mutual path to any admissible Council member; invitations need at leastDguarantors AND independent paths to such a member. D36 vertex disjointness, adopted D, D35 genesis/no quotas retained. Semantic mutual graph/Council endpoint selected, not raw reciprocal projection, snapshots, bounded verification, mixed terminals/self cases or no-Council bootstrap. Invitation opens a mutual channel at the stated1FACY cost;2to cover the invitee is a candidate. Acceptance/channel/K/own-source and special admission versus D83 funding need contracts: no instant pending-invite liability, pre-funded newborn or silent extra charge/subsidy. Old separate-lineage/no-guarantee Native stays legacy.

**D85 — [OWNER alternatives, neither selected], §19.3.** Source: response3. Free termination OR burning1FACY of any permitted origin are offered, reopening the old fixed1FACY fee. Valid-end release/D34 retained; payer/source/debt/order contracts OPEN, old code unchanged.

**D86 — [SELECTED], §19.4.** Source: response4. Restoration needs current-K room from K increase/other closures and a new establishing transaction priced1self-issued FACY for its signer. No automatic restoration, over-cap swap or reuse/refund of burned value. Bind paired authorization, surviving one-way offer/freshness/payment order; no free opposite leg or historical XP/roster/liability rewrite. D83 ordinary per-party cost remains.

**D87 — [OWNER priority/alternatives; SELECTED XP-use boundary], §8.1.** Source: response5. K must be changeable by network referendum; precise governance deferred. Non-FACY base-coin control versus FACY self-governance are alternatives, not adopted voting assets/models. XP is for disputes and relative account familiarity, not parameter-referendum voting money/weight. D74 earlier scope/defaults retained as dated context; no new quorum/electorate/authorization/currency, Council merits/anchor power or external operation. Scientific/master/privacy/default-migration gates remain.

### Conditional internal voting and pre-Council disputes recorded2026-10-29

**D88 — [CONDITIONAL OWNER CANDIDATE], §8.1.** Source: owner's “если внутри Facety будут свои референдумы” proposal. Proposed personal weight is voted/committed FACY multiplied by that voter's XP. This qualifies D87's prior XP-weight exclusion for this possible internal-governance arm, not adoption of FACY ballots, transferable/pooled XP, a Council merits weight or any external action. FACY custody/lock/burn/return/non-reuse, voter/XP snapshots/adjustments and admission/quorum/denominator/execution remain OPEN; no safety/profit/scientific/default claim.

**D89 — [OWNER STARTUP PROPOSAL/DIRECTION], §26/§46.14.** Source: “пока совет не сформирован (<100 активных участников), можно просто отключить механизм споров (чехарды)”. Proposed startup mode disables Chekharda in that phase, not preventive vetoes, actual historical duties, existing cases/holds or D84 support/path gates. Canonical active-count/Council phase, upward/downward transitions, existing cases/rights and later correction need contracts. No Council endpoint, singleton authority, eligibility waiver, raw-count oracle, data replay or native/default change is selected. The no-Council Self-ID/invitation path question remains explicit, not answered by disabling disputes.

### Square-root referendum-weight candidate recorded2026-10-29

**D90 — [OWNER CANDIDATE, NOT SELECTED], §8.1.** Source: “рассмотреть силу голосу ... как квадратный корень из FACY * XP”. Whole-product `sqrt(FACY_committed × personal_XP)` is a working interpretation, not confirmed radical scope; distinguish `sqrt(FACY_committed) × personal_XP` before a model/method. D88 product is retained, not replaced/adopted. Shares/custody/lock/burn/non-reuse, personal-XP snapshots/quorum/denominator and governance choice remain OPEN. Arithmetic compression is not evidence of capture resistance, account-splitting gains, fair access or profitability; do not pool/transfer XP, run a new study or migrate defaults by implication.

### Initial bootstrap, invitation funding and valence lifecycle recorded2026-10-29

**D91 — [SELECTED initial startup; security claim OWNER HYPOTHESIS], §17.1/§18.2/§26/§46.14.** Source: voice `voice-k1awbot-200148.ogg`,2026-10-29 00:46:48Europe/Samara, response1. Before FIRST reaching100active participants, Self-ID needs1mutual guarantor and invitations≥Dmutual guarantors without Council paths; Chekharda off. Rapid mass is intent, no-domination unproved. Mature shrinkage below100is explicitly different/unresolved, not automatic reentry/shutdown/reset/legitimacy verdict. Count/phase/first100activation/pending contracts remain.

**D92 — [SELECTED], §18.** Source: response2's final preference for2FACY. Inviter burns2own eligible FACY; newcomer pays nothing/no minus1debt. Acceptance creates a special first mutual inviter–newcomer link, counted like ordinary mutuality but with distinct/stronger inviter accountability/provenance; not two newcomer-paid transactions. The1+newcomer-debt alternative is not adopted. K/freeze/acceptance/record ordering and exact fault/remedies remain contracts, no instant unaccepted-invite liability/automatic guilt/new numeric sanction. Old1FACY data remains historical.

**D93 — [SELECTED], §19.1–§19.2.** Source: response3. Create a valence/one-sided request and immediately burn1self-issued FACY, even if unanswered; lasting open valence gives no guarantee XP/responsibility. Two valid opposite valences establish ordinary mutuality under K/eligibility. Fresh pair total2is burned per transaction, not deferred/charged again per activation. No unmatched refund/implicit expiry, raw-edge proof, own-act immunity or host-fee choice. Canonical validation/failure/operation phases remain contracts.

**D94 — [SELECTED], §19.3–§19.4.** Source: response4. Remove only one's own valence to break mutuality; the opposite remains open unless withdrawn. Recreate one's valence with a NEW1own-issued-FACY burn; if opposite valid/current K permits, mutuality returns without recharging that opposite, otherwise an open valence results. No refund/reuse, automatic old-XP/roster restoration or erasure of historical duties. D85 withdrawal-price alternatives remain unchosen; D34/D42/D54/D9 retained. No native/default/scientific migration.

### Re-entry, invitation-chain inquiry and capacity admission recorded2026-10-29

**D95 — [SELECTED], §18.4.** Source: voice `voice-k1awbot-200166.ogg`, first case. Loss of the only invitation relationship before a usable own emission leaves the person outside current support/access; another participant can issue a NEW paid invitation, not revive the broken first one or require own FACY before re-entry. Preserve SubjectId/chain/XP/debt/source/act history and D54 pending rights; no identity-false verdict or blanket transaction ban. Bind repeated-target admission and active/episode counters before code, no old Native replay.

**D96 — [OWNER inquiry direction, NOT a selected graph/gate migration], §46.15.** Source: the voice's tentative invitation-chain-first reasoning and “цепочку инвайтов нужно изучить”. Examine Council-reaching invitation ancestry first, plus shorter independent guarantee routes; no fixed five-hop rule or automatic replacement/conjunction with D84/D91. Historical lineage, active invitation-kind edges and ordinary mutual edges differ. Bind episode/closure/direction/anchor/disjointness/access and supported method before new derivation/data; no degree/personhood/XP oracle, upstream guilt or parked-track restart.

**D97 — [SELECTED final capacity/irreversible-burn direction], §19.2.** Source: the voice first suggests accepting valences at full capacity, then revises to blocking a full participant's valence-opening transaction. Final choice: at/above current K, no new initiating valence; pair completion must preserve both endpoint caps. Existing paid opposite offers remain, retry after enough K/slot release; no dormant double-link activation on K increase or extra mutual close/open pass. Unmatched-to-full-target admission, pending invites and atomic ordering remain explicit. Already burned payments NEVER return; rejected creation is not an executed burn and host gas stays separately bound. No CPU/load/DoS result is established.

**D98 — [SELECTED], §18.4/§19.4.** Source: final voice correction. Closed invitations cannot be reopened; create a NEW invitation or NEW valence, with its own authorization/cost. A withdrawn valence record is not revived; D94's still-open opposite record may persist. New ordinary mutuality does not automatically inherit the old invitation's active type, while actual historical provenance/liability/chain records are not erased. No silent special-record-to-unpaid-valence mapping. The user's interpretation of invitation “freeze” as a governance pause is recorded in §18.5 as a terminology question, NOT explicit removal of the earlier24h delay.

### Original inviter, owned-open slots and competing support gates recorded2026-10-29

**D99 — [SELECTED clarification, not the earlier two-invite proposal], §18.4.** Source: voices `voice-k1awbot-200170.ogg` then final clarification `voice-k1awbot-200174.ogg`. Ordinary account creation has one invitation/original inviter. No two-outgoing/pending/lifetime invite quota is adopted; issuance remains bounded by actual own funds, K and eligibility, with D92 price2unchanged. An extra addressed invite is not an ordinary valence or second creation. D95 re-entry is a same-identity episode, not overwriting creation provenance; current episode/acceptance representation remains a contract.

**D100 — [SELECTED counted-resource replacement], §19.2/§19.4.** Source: voice `voice-k1awbot-200172.ogg` counts opened valences AND invitations, including100unanswered requests consuming100slots; voice200174reaffirms own-valence counting. Each owned open authorization consumes a slot from opening, not only on reciprocity. Supersedes D81's mutual-counterpart counter and refines D97 guards. Matching uses already counted sides, withdrawal frees only the withdrawn owned unit, surviving opposite remains counted. No new lifetime/XP/degree quota or free refund; initial100/referendum/non-forced-cuts/history retained. Invitation recipient/accepted-state and duplicate coalescing/atomic cutover remain explicit contracts, not legacy counter migration or performance evidence.

**D101 — [OWNER candidate inquiry, NOT selected eligibility], §46.15.** Source: final voice200174tentatively considers Self-ID requiring a current invitation and unbroken invite chain to Council, then offers the simpler one-guarantor alternative. No gate is chosen. Original creation inviter differs from ongoing episode/support; lineage repair/closure/Council/re-entry/access must be compared. Retain current D84/D91/D36 until a separate decision; no automatic graph replacement, new run, identity oracle or scientific G1.

### Invitation-chain path inside the invitation D-family recorded2026-10-29

**D102 — [OWNER-selected rule/direction; execution contracts OPEN], §18.2/§36.4/§46.14–§46.15.** Source: the owner's text proposing to check a potentially very long invitation chain only when issuing a new invitation: guarantors≥D, independent Council paths D, first path invitation-derived. Count the distinguished invitation-chain path WITHIN D, not D+1; apply retained D36 internal vertex disjointness across the WHOLE family, including that long path. Remaining qualifying mutual routes/guarantor requirement remain, and D91 initial-bootstrap path waiver is not revoked. No new per-Self-ID ancestry check/continuous invite prerequisite or silent removal of existing D84 Self-ID support is selected. Creation-lineage versus live episode/closed links, direction, Council/status snapshots/self/mixed terminals, bounds and independent verification/freshness remain contracts. No algorithm, fixed hop bound, verified-person oracle, CPU guarantee, parked-track restart, default migration, experiment or old-evidence replay follows.

### Current graph and broken-invitation-chain alternatives recorded2026-10-29

**D103 — [SELECTED current graph; remaining alternatives OPEN], §18.2/§46.15.** Source: voice `voice-k1awbot-200199.ogg`,2026-10-29 02:14:44Europe/Samara. Historical records do NOT count in current path eligibility; use actual currently valid relations, preserving old provenance/rights/liability. Owner questions the cost/repair friction of a middle-chain break and considers new-inviter replacement, cascading downstream disconnection, or abandoning special invitation ancestry for ordinary short current paths. No repair/cascade/removal choice is final. D102's mandatory member remains until changed; a failed path is not automatic person/link deletion or a new Self-ID condition. D95 re-entry is not general reparenting, original creation history remains. A short compatible-family search is not a fixed hop cap, cache authority, equivalence/safety proof or permission to restart the indexer/experiments. No executable/default/data/evidence replay follows.

### Simplified invitation paths accepted2026-10-29

**D104 — [SELECTED simplification], §18.2/§36.4/§46.14–§46.15.** Source: voice `voice-k1awbot-200204.ogg`, explicit agreement with the simpler version after D103: “согласен … не надо излишне переусложнять”. New invitations require≥Dqualifying mutual guarantors AND Dinternally vertex-disjoint paths on the CURRENT qualifying mutual graph to admissible Council membership. Remove D102's mandatory invitation-chain member, not D36 independence or the path/guarantor conjunction. D103 current-only state retained; no ancestry verification for invitation/Self-ID, downstream cascade or general reparenting. Original inviter/accountability, invite2/newborn0special admission, own1valences/K, D84 Self-ID and D91 initial bootstrap, rights/history/debt preserved. Short compatible witnesses are desirable, not a selected hop cap/CPU guarantee/cache authority. Canonical state/verification/Council/epoch/source contracts and master gates remain; no native/default/algorithm/data migration, old-evidence replay, proven redundancy/equivalent protection or automatic indexer/research restart. D102/D103 dated history retained.

### Invitation price, both-side slots and pre-registration clarified2026-10-29

**D105 — [SELECTED price revision], §17/§18.** Source: owner text2026-10-29 07:30:42Europe/Samara, point1. Invitation costs1eligible own FACY from inviter, superseding D92's2; recipient0/no debt, irreversible executed burn/source provenance retained. Owner cites genuine-growth friction; this is intent, not calibrated incentive/attack evidence. Ordinary own1valences unchanged; old data not repriced/relabelled.

**D106 — [SELECTED both-side invitation slots], §18/§19.4.** Same source, point2. Invitation occupies1K slot at EACH endpoint—issuer and addressed recipient—from issuance, refining D100's previously unresolved recipient side. Fit new increments under current K, no extra slot at acceptance or extra slot merely for the zero act; no mutual-degree/lifetime counter or automatic forced cuts. Exact canonical record/status/duplicates/termination atomicity remains an implementation contract, not a new open choice about whether to count the recipient.

**D107 — [SELECTED pre-registration/zero Genesis/issuance-only validation], §17.1/§18/§36.4.** Same source, point3. Invite targets an already pre-registered account with required fields and published zero Genesis Self-ID. The zero act conceptually supplies the recipient's channel side but emits/burns NO FACY, creates no spendable right, debt or fabricated ordinary paid valence. Eligibility is checked at issuance only, not at later acceptance; later support/path loss does not retroactively invalidate the issued authorization. Preserve actual cancellation/delay states and ordinary future Self-ID/D77 rules. Initial account record differs from admission/original inviter; founding-network genesis is separate. No chosen zero-act XP/N/ordinary rate-slot semantics or reset on D95 re-entry, instant admission, blanket case-hold bypass or removal of the retained24h delay follows. Point4 rejects the assistant's excessive ordering explanation, not an alternative ordering policy; bind technical sequencing later without reopening the settled check timing. No code/default/data/research migration.

### Research-gate release recorded 2026-10-29

**D108 — [OWNER research-gate release; no protocol rule], §46.18.** Source: owner reply 2026-10-29 22:30 Europe/Samara, "да, подтверждаю, разрешаю разблокировать гейты". The master-programme order lock and the WP1/G1 method precondition no longer block research runs; the first released study is the D50 falsifier. Registration-before-confirmation, kill criteria, evidence levels, OPEN rules, default migration and real-data/ethics gates are unchanged.

### D50 design, link termination, Council vote and re-entry recorded 2026-10-29

**D109 — [OWNER research-design binding], §46.18.** Source: "по Q16 всё по умолчанию". All six Q16 defaults bind the D50 falsifier design.

**D110 — [SELECTED free link termination], §19.3.** Source: "цена разрыва связи бесплатна — отменяет валентность". Selects D85's free branch: no charge; the terminating party's valence is cancelled, its slot released, burned creation FACY not refunded.

**D111 — [OWNER reconfirmation], §27.1.** Source: "в совете, да, один участник — один голос, не важно какой у него XP". One equal vote per Council member regardless of XP; K-referendum weights (D87–D90) await clarification.

**D112 — [SELECTED re-entry by mutual guarantee], §18.4.** Source: "повторный вход может быть без нового приглашения, достаточно установить взаимопоручительские связи, но регистрировать новые Self-ID и заниматься эмиссией FACY можно только при наличии хотя бы одного поручительства — не важно инвайт или нет". Supersedes D95's new-invitation requirement; Self-ID and emission need ≥1 current mutual guarantee of any origin. Valence payment for a re-entrant without own FACY and the D84 path condition remain to bind.

**D113 — [SELECTED no referendum pause; D77 restated], §18.5.** Source: "во время референдумов о смене K никаких заморозок не должно быть по идее... а вот когда открыт спор, то оба участника не должны совершать акты Self-ID и устанавливать новые поручительские связи". K referendums freeze nothing; the per-invitation 24h veto freeze stays; open-dispute parties make no Self-IDs or new guarantees (D77).

**D114 — [OWNER research-outcome redirection], §46.18.** Source: "пожалуй, тут важно не балансы считать, а процент грязных FACY в обороте, и процент атакующих в сети во времени". Primary D50 outcomes: dirty-FACY share of circulation and attacker share of accepted subjects, as trajectories; balances secondary.

**D115 — [OWNER research-design direction], §46.18.** Source: "правило 'для приглашения нужно D поручителей и D непересекающихся путей до Совета' является критичным в данной системе, без него нет смысла тестировать!"; "основной тест начинается со 100 честных людей, при этом у них есть фора в 100 дней. совет не всегда состоит из 101! при 100 честных людей совет состоит из 11!". Takeover tests must include the D104/D36 path gate; main test: 100 honest people, 100-day head start, D33 Council size (11 from 100 participants).

### Earlier supersessions

| Earlier description | Status |
| --- | --- |
| D35 anchor/traversal preparation awaited a named single-center versus core reference choice. | **D61 [DIRECTION]:** epoch multi-anchor witness/indexer reference authorized; general eligibility/ranking/adoption remains OPEN, old study evidence unchanged. |
| D33/D35 deferred cluster-boundary quotas. | **Unchanged default:** D61 authorizes a separate research-only global-capacity comparison, not selected quota enforcement. |
| 24-hour Self-ID cooling period from early discussions. | **Clarified by D42:** 24 hours determines ordinary maturation XP and expiry of the original free veto, separately from reward-frequency and artifact-age limits. |
| Emitter restricted for 28 days before free withdrawal. | **Superseded:** first by 7-day conversion, now by **24-hour** conversion. |
| Network operations at 3 days. | **Superseded:** network operations at **24 hours**; still only special network-building uses, not ordinary transferable spending. |
| Guarantor cancellation during 28 days, or indefinitely while an emission stays unspent. | **Superseded by D42:** the original free veto is confined to the initial 24 hours; leaving the value unused does not extend it. |
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

---

<a id="part-xi-research-evidence-contracts"></a>

## Appendix C: Research and development decisions

These dated owner decisions govern how this proposal is investigated and maintained. They do not add conditions to Self-ID, admission, monetary rights or Council authority. Their full contracts remain here for historical and interpretive completeness; using Facety does not require understanding the simulator's command line, statistical transport or work scheduler.

## 47. Calibrated aggregate contradiction in simulator research (D37)

**D37 — [SELECTED research contract; implemented for new v2 registrations through D38], documented 2026-10-23.** Source: the owner's Telegram reply “A” to the [E1 decision packet](../studies/2026-10-23-e1-contract/README.md), selecting calibrated aggregate refutation rather than diagnostic-only component flags. This governs statistical interpretation of simulator research, not human identity adjudication, Council voting or protocol sanctions.

For one registered hypothesis, the contradiction family MUST include every registered **claim × context**, including presence, necessity and alternative-control claims. Let `M` be that family's size and `p_contradiction,j` each component's raw lower-tail p-value. The aggregate contradiction p-value MUST be `min(1, M × min_j p_contradiction,j)`, or the identical minimum of Holm-adjusted component p-values. It MUST be at most the registered `alpha` before the aggregate is called `contradicted`. Holm's later steps MAY be reported for component attribution, but raw and adjusted quantities MUST remain distinguishable; that reporting does not change the aggregate rule.

The support rule MUST remain the existing intersection-union rule: every component supports, with hypothesis support p-value `max_j p_support,j`. Unknowns MUST remain adverse to each tested direction and MUST NOT reduce the registered family size. Missing registered contexts MUST NOT be silently dropped. No observed-correlation estimate or post-hoc duplicate removal may replace the fixed family.

The selected error guarantee is **per hypothesis and per contradiction direction**, conditional on valid marginal tests and the declared replica/seed model. It is not a joint support-plus-contradiction guarantee and not a cross-hypothesis/study guarantee. The existing support-only `adjustStudy` contract MUST NOT be represented as contradiction correction. This selects neither evidence authentication nor the separate offline retained-input trust model, and proves no empirical error rate, personhood, useful contribution or attack resistance.

**Runtime and history boundary.** D37's initial record selected the target without approving migration; D38 subsequently approves and implements the versioned transition in §48. New v2 registrations use the controlled rule; old v1 registrations deliberately retain the labeled unadjusted method by default. Implementation-drift permission alone MUST NOT switch methods. Historical artifacts MUST remain unchanged. Intentionally requested new-method reanalysis MUST identify the changed method in a separate result rather than claiming retroactive preregistration or automatically replaying confirmation. The [evidence contract](evidence.en.md#versioned-analysis-and-reanalysis-d38) owns the implemented API. D33–D36 topology and D34 liability/correction gates remain unchanged.

## 48. Versioned analysis and historical compatibility (D38)

**D38 — [SELECTED implementation contract], documented 2026-10-23.** Source: the owner's explicit approval of versioned A for new registrations/results, legacy-by-default old v1 JSON in native/CLI analysis, and separately identified explicit A reanalysis without rewriting original registrations/artifacts or automatically running historical studies.

New registrations MUST use `facety-hypothesis/v2` and bind `analysisPolicy: "family-contradiction/v1"` into the design digest and reserved namespace. New confirmations MUST identify `facety-confirmation/v2` and that policy. Ordinary native analysis MUST use the verified registration's bound method; it MUST NOT accept an unrecorded method override.

Historical `facety-hypothesis/v1` digests and their namespaces MUST remain verifiable with their original hash layout. V1's inferred method is `unadjusted-contradiction/v1`: old numeric/statistical classifications stay legacy by default, including in CLI offline analysis. A v1 registration MUST NOT acquire a policy field that was not bound by its digest. The existing explicit permission for implementation drift MAY allow valid historical input; it MUST NOT relax design/namespace/randomness integrity or change its method.

Applying A to old retained data MUST require an explicit separate reanalysis request. Its `facety-reanalysis/v1` result MUST identify the original registration, original/bound and requested methods, current implementation and source-content digest; it MUST NOT claim to be the original confirmation or rewrite/re-digest its registration. No such request may silently launch model runs. The native `reanalyzeConfirmation` API and CLI `--analysis-policy family-contradiction/v1` provide this path. Output method tags and artifact kind MUST remain visible in mixed study summaries; support-only Holm correction remains support-only.

This changes the statistical contract and its transport, not protocol economics or the separate trust/authentication boundary for supplied scalar rows. Source fingerprints change, so old results still require their original source/method for exact reproduction. Frozen synthetic compatibility inputs are regression evidence, not a replay of historical scientific studies.

## 49. Integrated research programme (D39)

**D39 — [SELECTED research mandate, not a protocol mechanic], documented 2026-10-24.** Source: the owner's instruction to develop root and detailed directions in combinations, then explicitly add the work to the canonical backlog and start Grow Loop. Choosing a first branch MUST mean ordering the work, not discarding the other material directions. The mandate is to understand interacting Facety regimes, not to choose one favored mechanism or promise exhaustive enumeration of every numeric combination.

The [integrated programme](research.en.md#integrated-research-programme-d39-2026-10-24) MUST connect root questions, detailed alternatives, known evidence, cross-root/same-root interactions, opposed explanations and falsifiers. Existing domain backlog owners and their gates MUST be reused. The immediate research priority is sustained genuine participation through maintained guarantees and readiness to check/react; liability risk is a working explanation of withdrawal, not a measured fact or the only allowed explanation. Uniqueness, contribution/reputation and distribution remain separate under D32.

The canonical [convergence item](../BACKLOG.md#integrated-research-programme-d39) owns bounded execution, acceptance and stopping criteria. Grow Loop MAY continue through locally actionable or useful preparatory cohorts, without treating an OPEN contract as an implicitly selected default. D33–D36/D34 migration, human calibration, funding/ethics and evidence-authentication gates remain intact. New scientific mechanism claims still require committed registrations and reserved confirmations under the existing evidence contract; historical studies MUST NOT be replayed or relabeled automatically. A repeated checkpoint or exhausted safe preparation is a reason to stop, not to invent another rule or sweep.

### 49.1 Evidence-led security continuation (D63)

**D63 — [OWNER research continuation / delegated engineering choice; not a selected new mechanism], documented 2026-10-27.** After asking which concrete emergent properties, feedbacks and security/failure regions have actually been established, the owner directs work to take the most obvious next slice and implement it in order through Grow Loop. The aim is discriminating knowledge about network security and viable genuine participation, not accumulating passing tests or runtime layers as a substitute for that knowledge. This explicitly resumes bounded evidence-led preparation/implementation after the supplied-state indexer checkpoint; it does not mean replaying closed studies or declaring the global protocol safe.

**Resource quantity and allocation are different hypotheses.** A failed preventive action may reflect no eligible observer, no timely opportunity, no independent usable evidence, no funded work, no procedural authority or failed execution. Counting supporters or repeated observations does not distinguish these causes. As the first analyst-selected discriminator, comparing a shared work pool with an explicitly earmarked review portion of the **same total resource** can expose an allocation trade-off: review may become feasible while ordinary activity, genuine access or growth becomes harder, or resources remain unused. Such earmarking is only a counterfactual research reference, not an owner-selected work obligation, token reserve, fee, quota, reward or funding source. A simulator must retain displaced work, false-positive harm, correlated evidence, unfunded/missing observations and unfinished lifetimes rather than count additional checks alone as safety.

**Authority and evidence boundary.** Routine safe choices and sequential useful implementation/preparation are delegated; human willingness, authentic evidence, personal-data/ethics permission, adversarial merits and economic demand are not thereby supplied. Current selected D33/D35/D36/D41/D42, historical liability/case OPENs, D49 genuine-growth cost, D50 incentive target, D53/D62 economic boundaries and the master dependency/evidence order remain intact. A mechanism claim still requires committed presence/necessity/named-alternative claims and fresh reserved confirmation under an actually supported method before data. Software ticket arithmetic is not empirical self-regulation or a master-gate pass. Once useful preparation is exhausted, report the exact blocker instead of inventing another adapter/sweep or silently adopting an OPEN rule.

## 50. Simulator time resolution and heterogeneous opportunities (D43)

**D43 — [SELECTED design requirements; opt-in sub-day scheduling implemented, legacy daily default retained], documented 2026-10-24.** The owner requests a sub-day simulator design that separates protocol deadlines from participants' opportunities to act. The initial six-hour draft is refined, on the same date, to a preferred four-hour grid (six opportunities/day), with cadence parameterized rather than a participant obligation. One-day emission maturity, invitation freeze and rewarded Self-ID spacing remain 24 hours; the decision grid changes none of those rights or duties. Participants are not required to transact or inspect at every tick.

Daily intensity and daily resource units MUST NOT be silently multiplied by the number of ticks. Existing whole-run resource caps retain their scope. A tick may contain multiple valid operations, subject to authority, own-emission provenance, funds, work and rolling reward limits. Transaction inactivity and unavailability to observe/respond are distinct. Heterogeneous actor plans may be supplied explicitly, but population shares, activity distributions, reaction probabilities and XP-to-responsiveness relationships MUST NOT be invented as measured facts.

The historical daily schedule remains a separately identified reference. New scheduling must retain honest time/measurement semantics, keyed reproducibility and source-bound evidence. Exact sub-day placement and unresolved same-time/disputed-XP consequences need declared contracts; a finer clock cannot select them by accident. The model contract owns the implementation details. After the clock-only slice, the owner explicitly authorized implementation of the next integration rather than further planning. Opt-in 4/6-hour actor scheduling now uses daily quotas and explicit availability profiles, while the historical 24-hour API default remains for compatibility. Exact known deadlines and declared daily-sampling/randomness policies are retained; no new protocol economics, disputed-XP rule, calibrated behavior, automatic study replay or unrelated research continuation follows.

---
