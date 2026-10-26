# WP1 prior3: closed Native P/b capacity backend and independent recurrence

**DIAGNOSTIC software reference; not G1, H6, growth, fraud payback or WP5 economics.** This is the missing capacity-only execution slice identified by [the prior audit](wp1-priors.md). It reuses existing Native invitationLimit, not a new admission/reward rule. No historical controls/packets are recaptured and no programme experiment/confirmation is run. [BACKLOG](../../BACKLOG.md#trust-topology-condition-map-master-programme) owns remaining work; [DECISIONS_NEEDED](../../DECISIONS_NEEDED.md) owns policy/range/kill choices.

## Closed execution contract

`native-pb-capacity/v1`, reference `native-own-source-daily-capacity-reference/v1`, is an explicit **standalone** backend. Root config requires engine/reference, days, string seed, includeState, positive maxActions, successCriterion:'unbound', emissionEveryDays and complete Model options. Days0…3650 and emissionEveryDays1…3650 are engineering execution bounds, not plausible human ranges or requested research levels. Seed is retained for interface/provenance only: there are no random draws or fake independent seed samples.

Model options require genesis exactly['creator','support'], complete Native policy (ordinary defaults except maturity XP and accepted guarantor qualification), all ablations off, explicit invitationLimit:{P,b}, vouching:null and vouchAdmission:null. Constructor validates immutable integer P>=1 or null and b>=0. There are no hidden overrides/endowments, external input callbacks or configurable authority/market/evidence facts.

At time0 the backend proposes support→creator and confirms it **through Model**, before emission/invitation operations. These two ordinary Native calls count against maxActions. Genesis membership/support eligibility is a diagnostic initial-access assumption, not verified humans or free verified independence. Money/XP/source stock start at zero. Native guaranteeFee0 is an explicit existing reference; bootstrap/action labor is unmodeled, not measured free. This is not the funded c-vouch bond mode or CORE Standing.

For integer day d in[0,days), in this fixed order:

1. Advance to24*d (automatic maturities occur first). Sample any daily endpoint at that hour **before** its commands.
2. If d is divisible by q=emissionEveryDays, register one fresh creator artifact and create one creator Self-ID through Model (two counted calls). Each emits one actual own right, maturing24h later; no pre-issued initial stock, lapse or imported/purchased emission exists.
3. Offer exactly one invitation to a new symbolic target for day d. Choose up to b oldest currently eligible own sources; b0 passes an empty list and has **no own-Claim prerequisite** under this explicit existing Native reference. Creation still requires Native identity/support/funding/target checks. P cooldown begins only on successful creation and is keyed by SubjectId; no initial P wait or banking of permits.

Own unspent emission **is** banked indefinitely. Failed offers spend neither sources nor cooldown. Only the two expected cooldown/insufficient-source refusals are recorded; unexpected errors propagate rather than becoming clean outcomes. Invitations are never accepted/cancelled, no new member earns emission, and no conversions/debt/cases/penalties/treasury/payout/market/trust judgment occur. Existing invitation freeze remains recorded but does not gate mere creation. A finite created-invitation count is not admission/population/usefulness or incremental attack revenue. Excluded acceptance/veto/other APIs remain Native capabilities; this workload is not an attacker allowlist.

Daily endpoints24…H include maturity then precede same-hour commands; commands are[0,H), with **no terminal-day offer**. H0 has no bootstrap/action/sample. This differs deliberately from the historical504-day helper's inclusive terminal offer; it is not an off-by-one recapture or a change to old results. At H, advance/sample remaining uncensored maturities only.

maxActions counts each bootstrap/artifact/issue/offer call, including refused offers, not reads/clock/maturity or hypothetical human work. Stop **before** the unresolved next call, retain completed partial bootstrap/artifact operations and actual stopped hour, and omit future endpoints. Reaching the cap exactly after the final planned call is not censoring. No last-row carry-forward or safe zeros are invented.

## Accounting, output and policy versus workload capacity

Output is `facety-native-pb-capacity-run/v1`, classification diagnostic, with immutable config, assumptions, provenance, deterministic manifest, action outcomes, history, unbound/null success and optional actual state. `pb.*` measurements count created/offered invitations, cooldown/funding rejections, minted/burned/Emitter stock, mature/immature unspent rights and total XP. They are nominal protocol quantities, not private utility/net attacker loss/calibrated participation. XP total is not concentration/usefulness.

One offered invitation/day limits this **workload** to1/day. For P=null,b0 the policy has no finite P/b service cap: this workload cannot measure its unrestricted maximum. For bounded requested arms, no other demand is asserted. Similarly a scripted creator retaining E≈1/q own emission does not prove a reproducing-population exponent. The sink is actual burned source principal b, not refunded bond B; existing creator income is not newly enabled recipient payback. Prior3's survival/incremental-benefit/wage/price assumptions remain outside this backend.

## Independent reference and verification scope

[`pb-reference.mjs`](pb-reference.mjs) imports **nothing**, including no Model/config/schedule/old study helper. It maintains its own symbolic source inventory, maturation/XP accounting, cooldown and oldest-source consumption, constructing chronological actions/endpoints with an independent daily recurrence. It derives logical stock/flow outcomes, not expected values from Native events. Native implementation uses actual Model eligibility/funding and maps opaque IDs only in test projections.

Fixed software tests compare actual accepted/denied calls and daily/final stocks, funding provenance and source dispositions over a small declared software partition and cap prefixes. They also check immutable/closed config, boundary/terminal behavior, dormant/zero-cost banking (day0 still issues an act; the underlying Native no-own-Claim permission is separately covered by invitation-limit-model tests), deterministic seed invariance, unlimited-policy versus finite demand, inert reads and unchanged current v2 refusal. This is algorithmic/dependency separation, not independent authorship/acceptance, a whole-Native proof or master parameter sampling.

## Admission and gate boundary

Actual owners are [`src/pb-experiment-config.mjs`](../../src/pb-experiment-config.mjs) and [`src/pb-experiment.mjs`](../../src/pb-experiment.mjs). This checkpoint deliberately **does not yet** add common experiment dispatch, global observable/statistic/metric compatibility, mixed-engine manifest composition or real v2 registration/tasks. The existing registry rejects this mode; no accepted-looking schema/registration is manufactured. The next bounded integration must wire those real paths and preserve unbound-success/engine/horizon/source/family guards before any programme method can use the mode.

Software-only reproduction:

```sh
node --test test/pb-experiment.test.mjs
npm test
```

[Validation](wp1-pb-validation.json) records8 focused/460 current and21 separately pinned historical passes,180 fixed software partitions plus a safe-large cost boundary and30 cap prefixes, and DAG37 files/96 local edges (acyclic, no errors/warnings). It binds actual source/reference/test/contract identities and separates current versus pinned historical tests. It is not `facety-hypothesis/v2`. Real G1 claims/ranges/precision/numeric kills/error/search/seed contracts and independent written prior confirmation remain unbound/unrun. Lifetime-quota/ownership-cut/fake-admission/CORE gaps also remain; later WPs stay gated. No H6/PURCHASE/BOND/market/real-world inference or selected rule migration follows.
