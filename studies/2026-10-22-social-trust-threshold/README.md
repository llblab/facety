# Social trust and the deterrence threshold (2026-10-22, exploratory)

This reruns the [deterrence-threshold](../2026-10-22-deterrence-threshold/README.md) game with the social trust behavior described by the protocol owner:

- **Guarantee scope:** honest people guarantee only invitees and friends of friends, and accept only acquaintances' guarantees. They engage strangers at a 2% rate.
- **Screening and verification:** public graph screening picks whom to inspect, and a call or meeting (90% hit, 1% false alarm) precedes any veto or challenge.
- **Investigation:** proven fakes trigger checks of their inviter and that inviter's other invitees.
- **Stakes and bribes:** challenges require a stake of 1 FACY, and 5% of honest strangers accept off-protocol bribes to guarantee fakes.

Coalition strategies add `farm-and-bribe`. Everything else matches the earlier study: illustrative valuation, 30 days, 16 replicas, exploratory and unregistered.

Files: `game.json` with its axes files and grid results. Re-assess any grid with `grid-viability`.

## 1. Honest people are much better off; harassment and bribery stop paying

Fine 5, false suspicions 5%. Each cell gives the viability verdict, honest retention r (equilibrium value divided by fraud-free value) and wrongful invalidations w per run.

| Sensitivity \ Accuracy | 0.6 | 0.7 | 0.8 | 0.9 |
| --- | --- | --- | --- | --- |
| 0.2 | fraud (r 0.57, w 0) | fraud (0.60) | fraud (0.65) | fraud (0.64) |
| 0.5 | fraud (0.63, w 1.6) | fraud (0.69) | fraud (0.73) | fraud (0.81) |
| 0.8 | wrong (0.70, w 3.7) | fraud (0.79) | fraud (0.83) | **viable (0.96)** |

Compared with the public-matching study:

- Wrongful invalidations fall to about zero from accuracy 0.7 upward.
- Honest retention rises from about 0.6 to 0.65–0.96.
- `farm-and-bribe` is never in an equilibrium support.
- `farm-and-harass` appears only at accuracy ≤ 0.6.

Verification removes most false vetoes, and the stake plus verification make harassment unprofitable.

## 2. But vigilance becomes a public good that nobody needs to buy

Every honest strategy that inspects heavily still deters all fraud (gains −62 to −155 per coalition operator). Because acquaintance-only guarantees, screening and investigation protect the network anyway, honest people's best response is `lax`, and plain farming against `lax` earns a premium (+12 to +184). The protocol protects honest *welfare* without heavy vigilance. It does not make fraud *unprofitable* unless the expected sanction is large enough.

## 3. Sanction size is the decisive lever

At sensitivity 0.5, accuracy 0.9, false suspicions 5% (`grid-incentive-levers.json`):

| Fine per liable party | Reward share 0.5 | Reward share 1 |
| --- | --- | --- |
| 5 | fraud pays (+49), r 0.81 | fraud pays (+49), r 0.89 |
| 10 | **viable**: fraud probability 0.12, r 0.95 | **viable**: 0.09, r 0.96 |
| 20 | **viable**: 0.13, r 0.94 | **viable**: 0.09, r 0.96 |

With fine 10 across the grids (`grid-*-fine10.json`), viability needs sensitivity ≥ 0.5 with accuracy 0.9, or sensitivity 0.8 with accuracy ≥ 0.8. A larger fine does not substitute for poor detection.

## 4. Chain-proportional fines work; the liability wave to the inviter's guarantors backfires in this model

`disputes.fineMode: "chain"` voids the false subject's whole Self-ID chain. Unspent rights burn, and XP credited from the chain is revoked from the subject and its guarantors. Each liable party then owes one coin per voided act. `liability: "inviter-chain"` additionally fines the inviter and the inviter's guarantors (`grid-chain-fines.json`, accuracy 0.9, false suspicions 5%):

| Sensitivity | Fixed 5, guarantors | Chain, guarantors | Fixed 5, inviter-chain | Chain, inviter-chain |
| --- | --- | --- | --- | --- |
| 0.2 | fraud +124 | fraud +100 | fraud +183, honest passive | fraud +183, honest passive |
| 0.35 | fraud +75 | fraud +40 | fraud +184, honest passive | fraud +184, honest passive |
| 0.5 | fraud +49 | **viable** (fraud 13%, r 0.94) | fraud +184, honest passive | fraud +184, honest passive |

Chain fines beat the fixed fine wherever the fake lived long enough. The inviter-chain wave turns the honest population passive. Honest people who guarantee a real coalition member, through ordinary bootstrap friendships, are fined for every fake that member invited. Exposing fakes then costs the honest cohort more than it gains, so the population prefers not to look. This is the concealment risk named in protocol §22 ("threatened guarantors collude to conceal an upstream violation"), arising here without any collusion script.

**Caveat:** in the model the inviter's guarantors cannot see or cancel an invitation of a fake before it is accepted, so the wave fines them for something they could not prevent. In the owner's design, the invitation sits in a cancellable freeze where guarantors can stop it. Modeling that freeze, together with leniency for guarantors who report first, is the next step before judging the wave.

## Limits

- Exploratory; boundary cells need confirmation on reserved seeds.
- Population best responses treat the honest cohort as one player. Individually, unexposed honest people may still profit from catching fakes.
- Verification quality, bribe acceptance and stranger rate are assumptions, not measurements.

## 5. Invitation freeze, guardian review and exit (`game-guardian.json`, `grid-guardian.json`)

Settings: chain fines, inviter-chain liability, `linkBreakXp: "revoke"`. Honest strategies now include invitation review: vigilant 100%, lax 30%, passive 0%. Accuracy 0.9, false suspicions 5%.

| Sensitivity | No freeze | 72 h freeze, review | 72 h freeze, review + exit |
| --- | --- | --- | --- |
| 0.2 | fraud +192, honest passive, r 0.51 | fraud +9, honest lax, r 0.78 | fraud +55, honest passive, r 0.77 |
| 0.35 | fraud +193, r 0.51 | fraud +12, r 0.86 | fraud +10, r 0.86 |
| 0.5 | fraud +193, r 0.50 | fraud +5, r 0.85 | fraud +3, r 0.85 |

A cancellable freeze is what makes the wave workable. Guarantors who review their subject's invitations cancel fake admissions before the wave can reach them. The premium falls from about 190 to single digits, and honest retention rises from 0.5 to about 0.85; the coalition's best remaining strategy is `farm-then-hide`. Exiting the relation escapes the wave but also removes that guarantor's oversight; at low detection this pushes honest people back to passivity.

## 6. One-day windows (`axes-timing.json`, `grid-timing.json`)

The owner proposed one day for every window: a Self-ID is contestable for 24 h before it can be spent, and an invitation is contestable for 24 h before it can be applied. The grid crosses spend maturity (24/72 h), conversion maturity (24/168 h) and invitation freeze (24/72 h). Settings are as in section 5, without exit.

| Spend / convert / freeze (h) | Sensitivity 0.35 | Sensitivity 0.5 |
| --- | --- | --- |
| **24 / 24 / 24 (owner)** | **viable**: fraud 7%, r 0.73, honest 89% vigilant | **viable**: fraud 10%, r 0.72, honest 78% vigilant |
| 72 / 168 / 72 (current text + freeze) | fraud +12, r 0.86 | fraud +5, r 0.85 |
| 24 / 168 / 72 | **viable**: fraud 26%, r 0.88 | **viable**: fraud 16%, r 0.93 |
| 24 / 168 / 24 | fraud +232, r 0.29 | fraud +232, r 0.29 |
| 72 / 24 / any | fraud +7 with harassment, wrongful invalidations | same |

Reading:

- The owner's 24/24/24 scheme is viable at both sensitivities. With fast spending and withdrawal, an unchecked farm grows and pays out so quickly (+274 per coalition operator against lax honest people) that honest people's best response is to stay vigilant. Vigilant honest people deter every fraud strategy, and liquid coalition money can actually be collected by fines. The price is constant vigilance: honest retention is about 0.72.
- A longer withdrawal delay paired with a longer invitation freeze (24/168/72) is also viable, with lax vigilance and higher retention (0.88–0.93). Mismatched windows fail badly: fast invitations with slow withdrawal and a short freeze (24/168/24) let fake cones grow unchecked while fines turn into uncollectible debt.
- One simulated day contains one inspection round. One-day windows therefore assume guarantors look at new activity every day, for example through app notifications. If real people check less often, the effective window is shorter than their checking interval.

These interactions are non-monotone and exploratory; confirm the 24/24/24 and 24/168/72 cells on reserved seeds before adopting either.
