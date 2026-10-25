# Invitation limiting family (P, b): H6 preparation

**2026-10-25; design and deterministic software controls only. No research capture or confirmation registration.** [The canonical backlog](../../BACKLOG.md#invitation-limiting-family-p-b-h6) owns remaining implementation/method work. [The research contract](../../docs/research.en.md#invitation-limiting-family-and-h6-d60) owns the inference boundary. This folder is not a replacement protocol or a runnable registered study.

[`design.json`](design.json) retains the owner's question/H6/falsifier verbatim in separate fields, the ten requested arms and currently unbound capture contracts. [`contract.mjs`](contract.mjs) exposes immutable `invitationLimitArms()` and the mathematical `invitationCapacityPrior({ P, b, E })`; `P: null` denotes no cooldown. An unbounded result uses `unbounded: true` with a null numeric rate, never a fabricated finite limit. These functions do not implement policy in the native economic model.

## Important distinctions

- The stationary bound `min(1/P, E/b)` describes invitation creation capacity with sufficient eligible demand, stationary usable own-emission income and no other binding gates. It does not determine accepted-population growth, detection time or doubling time. At `b=0` the funding bound is absent; arm0 is unbounded absent other explicit resource limits.
- `b=P*E` is the co-binding boundary, not strict additional asymptotic throttling. Initial stock, maturation and first-use/phase can matter on finite horizons, including at `b=1`.
- A nonbinding burn can still reduce cash available from own emission: at invitation rate `r`, the nominal remaining flow is `E-b*r` before other uses/costs. This is not calibrated private utility, but it prevents equating unchanged capacity with zero effect on fraud premium.
- Original H6's supplied falsifier describes support for its no-farm-benefit/honest-tax subclaim. Non-significance is not equivalence: margins and sampling units must be fixed before data.
- The current protocol retains matured own rights. Native `createInvitation` has no independent invitation cooldown, so banked rights can fund same-hour invitations. Requested A=(1,1) cannot be silently called exact current behavior. The test witness is engineering diagnosis, not a mechanism claim or a growth experiment.
- Falling FACY price and private fresh-media expense do not themselves reduce nominal own-FACY issuance or authorize purchases of own-emission rights. Any net-resource or utility channel needs its own units/funding model; no market is imported for free.

The native software witnesses use two supplied accepted genesis subjects with zero initial money/XP, `guarantorEligibility: 'accepted'` and ordinary maturity mode. All own rights are minted through funded native operations; invitations are recorded but recipients are not admitted. No verified-path/personhood, detection, actor-choice or cluster-growth result is implied.

[`test/invitation-limits.test.mjs`](../../test/invitation-limits.test.mjs) checks the immutable arm list/arithmetic prior and native fully funded one-unit capacity, banking and key-rotation witnesses without randomness, case simulation, accepted-population growth or planned research labels. The generalized P/b native engine, secondary flags, honest/fraud study and confirmation remain pending. Do not execute a capture, infer a safe policy or label deviations as emergence before separating implementation defects, finite-horizon/phase effects, other gates and genuine residual outcomes.
