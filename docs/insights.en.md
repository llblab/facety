# Insight register

This register keeps every design insight and research finding in one place. A **decision** comes from the protocol owner and is recorded in the [protocol](facety.protocol.en.md) with its label. A **finding** comes from the simulator and states its evidence level:

- **Confirmed:** supported by a preregistered test on reserved seeds ([evidence](evidence.en.md)).
- **Exploratory:** a grid, screen or game on one seed batch. It is a map, not a result.
- **Diagnostic:** a small targeted probe that explains a mechanism.

All findings are conditional on the simulator's declared assumptions, horizons and valuations. None is a real-world measurement. Update this file whenever a decision is made or a study ends.

## Owner decisions and design insights

| # | Insight | Protocol | Simulator |
| --- | --- | --- | --- |
| D1 | All contest windows are one day: 24 h to contest a Self-ID emission before it can be spent or withdrawn, and 24 h to contest an invitation before it applies. One day is understandable, and long delays discourage people. | §3, §17.3, §18.5 [SELECTED] | `spendMaturityHours`, `conversionMaturityHours`, `invitationFreezeHours` = 24 (defaults) |
| D2 | XP is credited when the emission is spent or withdrawn without cancellation: +1 to the subject and +1 to each guarantor eligible at recording. A cancelled act credits nothing. | §17.5 [SELECTED] | `xpFinality: "terminal"` |
| D3 | The Council is the top-101 XP leaderboard among subjects active in the last 28 days. | §27.1 [SELECTED] | `councilEligibility: "active"` |
| D4 | Debt repayment keeps the guarantor veto window. | §17.3 [SELECTED] | `debtRecovery: "reserve-until-mature"` |
| D5 | No mandatory media type; group media whenever possible; the same media cannot be reused. Optional varied formats or beacon-bound challenges raise the cost of faking. | §14.4 [SELECTED/DIRECTION] | `registerArtifact({ contentHash })` rejects reuse; `fakeSelfId` work weight |
| D6 | A Self-ID proves key control plus fresh presence; a group Self-ID is a public act of co-presence. | §14.4 | — |
| D7 | A personal Self-ID chain is like a private ledger of confirmations. Proving step X invalid cuts everything after it: illegitimate coins and XP are removed, and each liable party owes one coin per cut act. For fraud from the invitation, the liability spreads to the inviter and the inviter's guarantors. | §21.1 [DIRECTION] | `voidSelfIdChain`, `disputes.fineMode: "chain"`, `liability: "inviter-chain"` (dispute defaults) |
| D8 | The liability wave exists so that guarantors watch their people. Someone who sees their person inviting non-real people cancels the invitations and leaves the relation. | §18.5, §19.3 [SELECTED/DIRECTION] | `cancelInvitation`, `activity.honest.review`, `social.exitOnFraud` |
| D9 | XP earned through a relation is revoked when the guarantor leaves it. | §19.3 [DIRECTION] | `linkBreakXp: "revoke"` (default) |
| D10 | People vouch first for long-time acquaintances, then for friends of friends; a stranger's request is blocked like spam. | §20.4 [DIRECTION] | `social.scope: "acquaintances"`, `strangerRate` |
| D11 | Detection is imperfect but has many public channels: generated-media detectors, graph analysis of narrowly connected regions, lineage tracing to the root, money-flow tracing, and calls or meetings before any sanction. | §40.1 [DIRECTION] | `social.screening`, `investigation`, `flowTracing`, `verification` |
| D12 | A fake operator eventually exposes itself through cash flow on the public chain. | §40.1 | `activity.attackers.cashout`, `social.flowTracing` |
| D13 | Chekharda stakes grow by a fixed percentage per position (10–20%), and each winner takes the stake of the position directly below. The bottom winner is paid from the rule-breaker's sanction. It resembles a prediction market. | §26.5 [DIRECTION] | `disputes.procedure: "chekharda"`, `stakeGrowth` |
| D14 | Fakes rarely open disputes against honest players, because it draws attention and invites a counter-dispute. Supporters of fakes are mostly other fakes; the side with reputation draws more support. | §26.5 [HYPOTHESIS] | `social.attentionFeedback`, `disputes.reputationWeight` |
| D15 | Facety is a public, accountable market of trust, the opposite of anonymous currencies, with no ZK layers. Transparency is the defense and must be balanced against personal safety. | §9 [DIRECTION] | — |
| D16 | Facety distributes emission to reward the network effect. Ordinary users earn modestly; long-term contributors earn large returns. Knowing whom you deal with is the core of it. | §9 [DIRECTION] | — |
| D18 | A dispute is final 7 days after the last move; any entry restarts the clock. | §26.5 [SELECTED] | `disputes.procedure: "chekharda-timed"`, `disputeWindowHours` = 168 |
| D19 | Real disputes escalate fast: many entrants a day, XP jumping by multiples, so senior members with reputation give the last word. Attention grows with the dispute's height and audience; someone always takes the right side, and winning needs evidence. | §26.5 [HYPOTHESIS] | `roundsPerDay`, `entrantChoice: "highest"`, `noticeBase`, `evidenceGain`, `civicValue` |
| D20 | Few defend an obviously wrong side except local accomplices, and that draws more attention. Opening a dispute in order to lose halves one's XP. | §26.5 [HYPOTHESIS] | `activity.attackers.defend`, `attentionFeedback` on challengers and entrants |
| D21 | Design principle: following the rules must be easy and profitable; breaking them hard and very unprofitable, at every step. | §44 [DIRECTION] | viability criteria (`assessViability`) |
| D22 | Dispute regulars form a community, sometimes friendly coalitions; each person's dispute record is public in an explorer, creating an adjudication reputation separate from identity reputation. | §26.5 [DIRECTION] | `disputes.regularsNotice`, `disputes.trackRecordWeight` |
| D23 | A participant can call a senior with about 10× the XP; with roughly 10% probability such a person joins if one exists. Stakes might be required only to be at least the stake below, if the distribution stays fair. | §26.5 [HYPOTHESIS/OPEN] | backlog |
| D24 | Honest people have the stronger network effect: their network is denser, information spreads faster and they see more. Its efficiency is roughly quadratic, and the network effect should prevail. Model it as a mechanism (information traveling through acquaintance), not as an imposed n² formula. | §9 [HYPOTHESIS] | `social.gossipHops`, `social.gossipShare` |
| D25 | Disputes are opened when proof exists, and with public proof the violating side cannot win unless it prevails in XP, which should be impossible. Opening disputes against witnesses without proof is irrational. | §26.5 [HYPOTHESIS] | `disputes.evidence: "public-proof"`, `proofStrength` |
| D26 | Whoever defends a proven violator without evidence becomes a suspect. Disputes can be automated and run in parallel against the whole defending cluster. Other prediction-market designs (parimutuel pools, market makers, Schelling-point juries) are candidates for resolving sides. | §26.5 [DIRECTION/CANDIDATE] | `disputes.clusterFollowUp`; other markets in the backlog |
| D27 | Bounded fraud is tolerable: if, say, 80% of circulating coins were minted honestly and 20% by undetected fakes, the system still works, much like real payment systems that operate with a fraud rate. Harm can be capped as a share. Refinements: watch the authority share (XP, Council) as well as the money share, because authority concentrates faster; watch the trend, since a stable share is tolerable and a growing one is not; and outside money (Atmo buyback) is shared with fakes in proportion. | §9 [DIRECTION] | `system.falseMintedShare`, `falseCirculatingShare`; `assessViability({ maxFalseMintedShare, maxCoalitionCouncilShare })` |
| D17 | Rewarding guarantees is necessary for the network effect. That a cartel can maximize it too is a property of the rules; the largest "cartel" should be the committed early honest community. | §23 | H1 / pilot game |

## Simulator findings

| # | Finding | Level | Source |
| --- | --- | --- | --- |
| F1 | Guarantor-XP coupling raises a dense coalition's Council share by +0.14 to +0.17. It requires coalition-level guarantee intensity and survives equal Self-ID rates. | Confirmed (mechanism, within model; population-size confound open) | [coalition study](../studies/2026-10-22-coalition-council/README.md) H1 |
| F2 | A fast-growing Sybil cone is under-represented on the Council (seats − subjects ≈ −0.3) only while it grows. Halting growth makes it over-represented, and immediate XP finality explains only part of the effect. | Confirmed (within model, accepted-Council era) | same, H2 |
| F3 | Deterrence works when someone checks: against vigilant honest people, farming loses about 140 per coalition operator; against passive ones it gains about ×10 honest income. | Exploratory | [inspection game](../studies/2026-10-22-inspection-game/README.md) |
| F4 | Vigilance is a public good. There is no pure equilibrium; in the mixed equilibrium the coalition is indifferent between fraud and honest play, so **fraud earns no premium over playing by the rules**, while honest people pay a policing cost. | Exploratory | inspection game, threshold studies |
| F5 | Challenger rewards make individual vigilance pay while others are lax, and free-riding pay while others are vigilant, so individuals settle at an intermediate level (a social dilemma). | Exploratory | inspection game |
| F6 | With the one-step dispute abstraction, viability needs verdict accuracy ≥ ~0.8 and raw false suspicion ≈ 1%. Detection per inspection can be as low as 0.2–0.35. Below 0.8 accuracy, dispute abuse (harassment) harms honest people more than fakes do. | Exploratory | [deterrence threshold](../studies/2026-10-22-deterrence-threshold/README.md) |
| F7 | The free veto is a damage channel. At 5% false suspicion, vigilant guarantors cancel about 131 genuine Self-IDs per run, so honest people stop checking and farming pays. A second-stage call or meeting removes this. | Diagnostic + exploratory | deterrence and social-trust studies |
| F8 | Acquaintance-only guarantees plus verification nearly eliminate wrongful invalidations, make bribery and harassment unprofitable, and raise honest retention to 0.65–0.96. Because the network is then safe without heavy vigilance, honest people stay lax, and fraud needs a larger expected sanction. | Exploratory | [social-trust study](../studies/2026-10-22-social-trust-threshold/README.md) §1–2 |
| F9 | Sanction size is decisive: fine 5 lets fraud pay, while fine 10 or chain-proportional fines make the network viable. A larger fine does not substitute for poor detection. | Exploratory | social-trust §3–4 |
| F10 | A liability wave without a way to prevent the fraud backfires. Honest friends of a real cheater are fined for each exposed fake, so the community prefers not to look (the protocol's §22 concealment risk). A reviewable invitation freeze fixes it: fraud premium about 190 → 3–12, honest retention 0.5 → 0.85. | Exploratory | social-trust §4–5 |
| F11 | Leaving a relation escapes liability but removes a watcher; at low detection it pushes honest people back to passivity. | Exploratory | social-trust §5 |
| F12 | One-day windows (24/24/24 h) are viable with mostly vigilant honest people (retention ≈ 0.72). 24 h spend / 7 d withdraw / 72 h freeze is viable with lax vigilance and higher retention (0.88–0.93). Mismatched windows fail. One-day windows assume guarantors check daily. | Exploratory | social-trust §6 |
| F13 | A Chekharda ladder settled only by the last unopposed side favors whoever can field a higher-XP participant at no personal risk. One fake defender with more XP than the challenger ends the dispute unless a more senior honest person dares to join. Verdict accuracy: 0.2–0.4. Council intervention early in the ladder (depth 2–4) restores 0.83–0.89 with coalition harassment, and 1.0 without harassment. Intervention at depth 6 comes too late (≈ 0.46). A public reputation prior barely helps, because mutual guarantees give fakes reputation too. | Diagnostic | [disputes tests](../test/disputes.test.mjs); this register |
| F14 | Graph screening (SybilRank-style) separates fakes from real people with an AUC of about 0.92 without camouflage and 0.80 with it. It also flags 9–20% of real people, so it must guide verification, not sanctions. | Diagnostic | this register; `social.screening` |
| F15 | Money-flow tracing flags coalition hubs with >95% precision when fakes consolidate earnings. Ordinary honest payments dilute the signal. | Diagnostic | `test/social.test.mjs` |
| F17 | Under timed Chekharda (slow or fast escalation), a coalition that defends its fakes and harasses honest people earns about 20× rule-following income. Reasons: noticers are sampled from a fake-dominated population; senior honest people weigh their own XP risk against noisy evidence; defending a fake costs only a small stake and a disposable identity's XP. Not defending loses everything against vigilant people. The owner's hypotheses D19–D20 need targeted attention, decisive evidence, defender liability, larger stakes or early Council intervention, none of which the model provides yet. | Exploratory | [timed Chekharda game](../studies/2026-10-22-timed-chekharda/README.md) |
| F18 | Adjudication reputation (regulars noticing disputes, opposed-entrant records) did not change the timed-Chekharda equilibrium. Against a defended farm, vigilance does not pay honest people; few disputes are opened, and each defended dispute keeps fakes active for a week or more. Dispute volume and duration are the bottleneck at a 60-day horizon. | Exploratory | timed Chekharda study, follow-up |
| F19 | **The economics of faking is decisive.** In the fast timed-Chekharda game, making a fabricated daily Self-ID cost 10× an honest one turns fraud pays (+821) into full deterrence: the coalition abstains, and honest people keep 100% of their value without inspecting. Realistic operator capacity alone cuts the premium to 17. Dispute-side levers (10× attention, civic value 20) change nothing while faking is cheap. Earlier pessimistic games assumed fakes as cheap as honest acts. | Exploratory | [assumption audit](../studies/2026-10-22-timed-chekharda/README.md#assumption-audit-assumption-auditjson) |
| F20 | **Fake-cost threshold with the honest network effect.** At ≥5× the cost of an honest Self-ID, fraud earns no premium. With gossip within 2 hops, fraud falls to 2% and honest people keep 96% of their value; without gossip it is 22% and honest value collapses. Below 5×, gossip helps catch undefended farms but also helps the accused's coalition hear of disputes. | Exploratory | [timed Chekharda study](../studies/2026-10-22-timed-chekharda/README.md#fake-cost-threshold-and-the-honest-network-effect-grid-fake-costjson) |
| F21 | Violators win disputes only when their identities out-rank honest people in XP. With cheap fakes the farm reached about 2,900 identities whose mutual guarantees put their XP above every honest person, so one top-XP fake defender ended every dispute at depth 2, even under public proof. The XP gate is safe only while the coalition cannot dominate XP, which realistic fake costs ensure. | Diagnostic | same study |
| F16 | A debtor's immediate-burn repayment would bypass the guarantor veto and finalize XP sooner. This was fixed as D4. | Diagnostic | `test/model.test.mjs` |

## Method lessons

- Random scripted runs cannot model incentives. Use strategy menus, payoff facts and equilibrium or deviation analysis ([games](games.en.md)).
- A strategy menu that is too small misleads: adding `farm-and-harass` reversed the apparent safety of inaccurate verdicts.
- Check valuation traps: debt left on abandoned fakes is not a cost to the attacker (`falseDebt: +1`).
- Exploratory candidate counts are not discoveries (228 candidates, two of them confirmed).
- Confirm on reserved seeds before calling anything a mechanism; record what was not tested.

## Open questions carried forward

See [BACKLOG.md](../BACKLOG.md). The main ones:

- confirm F9–F12 and F13;
- patient and camouflaged coalitions;
- adaptive agents;
- guarantors who check less often than daily;
- leniency for first reporters;
- calibration of detection and false-alarm rates with real reviewers;
- the endgame of a captured Council.
