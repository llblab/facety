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
