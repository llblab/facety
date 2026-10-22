# Timed Chekharda game (2026-10-22, exploratory)

**Question:** do defending fakes and harassing honest people pay under the owner's timed Chekharda?

Rules as implemented:

- the last move wins after 7 days without a counter-entry, and every entry restarts the clock;
- the accused's unspent rights are frozen during the dispute;
- attention and evidence grow with dispute height (largest entrant XP over mean network XP);
- stakes grow 20% per position, and each winner takes the stake below;
- losers lose half their XP;
- honest people have a civic value of 2.

Other settings: sybil-cone, 40 initial people (4 in the coalition), 60 days, acquaintance-only guarantees, screening, call/meeting verification, investigation, attention to every challenger and entrant, one-day windows. Eight replicas per profile; the valuation is as in the social-trust study.

```sh
node bin/facety.mjs game studies/2026-10-22-timed-chekharda/game.json --workers auto        # one entrant a day, lowest eligible XP
node bin/facety.mjs game studies/2026-10-22-timed-chekharda/game-fast.json --workers auto   # up to 20 entrants a day, most senior willing noticer first
```

Coalition strategies: `abstain`, `farm` (never defends), `farm-and-defend`, and `farm-defend-harass` (also challenges honest acts).

## Result (fast escalation)

Each cell is honest / coalition payoff per initial operator.

| Honest \ Coalition | abstain | farm | farm-and-defend | farm-defend-harass |
| --- | --- | --- | --- | --- |
| vigilant | 28.7 / 44.3 | −41.8 / −1497 | −83.3 / −1304 | −203.6 / **354** (54.6 wrongful invalidations) |
| lax | 37.3 / 44.4 | −54.0 / 22.9 | −89.0 / **865** | −179.1 / 792 |
| passive | 38.2 / 44.4 | −89.6 / 875 | −89.6 / 875 | −172.4 / 714 |

Fraud pays. In the mixed equilibrium the coalition defends its fakes (83%) and harasses (17%), and honest people are mostly passive. Slow escalation gives the same picture: equilibrium `lax` / `farm-and-defend`, coalition 866 versus 44 for rule-following.

- **Defense works:** a coalition that does not defend its fakes loses everything against vigilant people (−1497).
- **Harassment works too:** against vigilant people, harassment defeats them by invalidating about 55 genuine people per run.

## Why, in this model

1. **Who notices.** Noticers are sampled uniformly from the whole population. Once fakes outnumber real people, the "crowd" that notices a dispute is mostly fakes, and they always back the coalition.
2. **Senior honest people weigh their own XP.** They join only when their noisy evidence makes the expected stake gain exceed the risk of halving their XP. Civic value 2 is small next to that risk.
3. **Defending a fake is cheap.** A defender risks a small stake and the XP of a disposable identity. Chain-cut liability does not reach ladder participants.
4. **Coalition behavior is scripted.** `defend` and `challenge` act regardless of the attention they draw. Attention only prioritizes inspections; it does not sanction.

## What the design must ensure, in the owner's words: easy to follow the rules, costly to break them

Levers to test next:

- **Targeted attention.** Disputes are noticed first by active, reputable people, for example through notifications to the Council and to guarantors near the accused, not by a random crowd.
- **Decisive evidence.** An accused real person can produce near-conclusive evidence (a meeting, co-signed group media), so confident senior people risk little.
- **Liability for defenders.** Whoever defends a subject later proven false shares the chain-cut liability, as guarantors do.
- **Scale with stakes.** Base stakes and growth large enough that defending fakes at depth costs real money.
- **Early Council intervention** (F13).
- **Coalition behavior as a strategy.** Make `defend` and `challenge` respond to observed losses and attention rather than run as scripts.

The owner's hypotheses (§26.5: few defend an obviously wrong side, losing a dispute halves XP, and every accomplice who joins draws more attention) are not refuted. They depend on these levers, which the current model does not yet give them.

## Follow-up: dispute-resolution reputation (`game-reputation.json`)

The owner observed that dispute regulars form their own community and that each person's dispute history is public, so their statistical record of standing on the right side becomes a reputation. Two settings implement this: `regularsNotice: 0.5` (regulars notice disputes) and `trackRecordWeight: 0.5` (a candidate weighs the opposed entrant's win/loss record).

The equilibrium is unchanged: lax honest people, `farm-and-defend`, coalition 865 versus 44. Against a defended farm, honest payoffs are about −90 whether vigilant or lax. Few disputes are opened, and each defended dispute keeps a fake alive for at least a week. At this horizon the bottleneck is dispute volume and duration, not who wins a dispute. Reputation and attention only matter once disputes are opened and resolved fast enough.

## Assumption audit (`assumption-audit.json`)

The owner suspected wrong parameters, unrealistic behavior, or both. Each suspect assumption of the fast game was changed one at a time; everything else stayed as above.

| Change | Verdict | Fraud premium | Coalition equilibrium | Honest value / fraud-free |
| --- | --- | --- | --- | --- |
| None (fast game) | fraud pays | 865 − 44 | defend 0.83, harass 0.17 | −104 / 38 |
| **Fabricating a fresh Self-ID costs 10× an honest one** (`weights.fakeSelfId: 10`) | **deterred** | 0 | **abstain 1.0** | **38.2 / 38.2** |
| Realistic operator capacity (`budgets.attackers: 5000`) | fraud pays, barely | 17 | farm | 32.3 / 38.2 |
| Honest people invite four times as often (`activity.honest.invite: 0.2`) | premium-free | 0 | defend 0.92 | −80 / 30 |
| Ten times more noticers per dispute | fraud pays | 823 | defend | −89 / 38 |
| Civic value 20 | fraud pays | 638 | defend / harass | −104 / 38 |

The decisive assumption was the economics of faking. Earlier games charged a fabricated daily Self-ID the same single effort unit as an honest one, and let four operators run thousands of fakes. Once fresh, never-reused fake media costs ten times an honest act, farming disappears entirely and honest people keep their full value without even inspecting. This is exactly the barrier the protocol builds through daily presence and the ban on media reuse (§14.4). Dispute-side levers (attention, civic motivation) do not matter while faking is cheap. A growing honest network removes the fraud premium but not the fraud.

## Fake-cost threshold and the honest network effect (`grid-fake-cost.json`)

| Fake Self-ID cost (× honest) | No gossip | Gossip within 2 hops |
| --- | --- | --- |
| 2 | fraud pays (+668) | fraud pays (+530) |
| 3 | fraud pays (+310) | fraud pays (+296) |
| 5 | premium 0; fraud 22%; honest value −0.9 / 38.2 | **premium 0; fraud 2%; honest 36.8 / 38.2** |
| 10 (audit) | fully deterred | — |

From about five times the cost of an honest Self-ID, the honest network effect (information traveling through acquaintance) decides the outcome: fraud almost disappears, and honest people keep 96% of their value. Below that threshold, gossip helps catch undefended farms (−3129 instead of −1497 against vigilant people) but also helps a coalition: the accused's own acquaintances, who are the coalition, hear of the dispute first.

## Why violators can win a dispute in the model (`grid-public-proof.json`)

With public proof and cluster follow-ups enabled, cheap fakes still won every resolved dispute in a diagnostic run (89 of 89, all at depth 2). The defender was the highest-XP coalition noticer. The farm had grown to about 2,900 fakes whose mutual guarantees inflated their XP above every honest person's, so the XP gate let nobody honest top them, even though the public proof showed the truth. As the owner argued, the violating side can win only when it prevails in XP. In the model it prevailed only because fakes were cheap. With realistic fake costs the coalition cannot grow, and the dispute question does not arise.
