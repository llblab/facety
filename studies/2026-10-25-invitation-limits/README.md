# Invitation limiting family (P, b): H6 primary engineering controls

**2026-10-25; native experimental primary engine and deterministic software controls, not H6 confirmation or a registered empirical study.** [BACKLOG](../../BACKLOG.md#invitation-limiting-family-p-b-h6) owns remaining work; [the research contract](../../docs/research.en.md#invitation-limiting-family-and-h6-d60) owns inference. [`design.json`](design.json) retains the literal owner question/H6/falsifier and separates simulator assumptions from protocol selections. No research labels/captures are allocated.

## Native primary contract

- Opt in once at construction: `new FacetyModel({ invitationLimit: { P: 3, b: 2 }, ... })`. `null` preserves the existing default exactly; P/b cannot be switched between calls. P is integer days after actual invitation creation keyed by immutable SubjectId; null P removes cooldown. Rejected attempts do not advance it; key rotation, veto and inactivity do not refund/bank slots.
- Use existing `createInvitation(creator, source, target)`: b1 accepts one source ID; b>1 accepts an array of exactly b distinct own unspent/unlocked/unreserved matured Self-IDs; b0 accepts null or an empty array. All sources are preflighted before ID allocation, any burn or clock change. Maturity is at least 24h and respects a longer existing spend delay. Model audit checks funding and the reconstructible cooldown index.
- **Explicit primary assumption:** b0 has no own-claim prerequisite. Identity/support, target, invitation freeze and native acceptance/penalty rules remain unchanged. This is a research assumption, not a new protocol default. A secondary claim requirement has not been inferred or implemented silently.
- Own emission remains banked without expiry. This is not calendar-permit accumulation. First use has no initial P wait but still needs the required funding. Receipts expose immutable `sourceSelfIds` and `invitationLimit`; legacy source fields/default receipts stay compatible. Veto handles every funding source, never refunds burned principal/cooldown, and retains existing mode-specific XP behavior. D59 correction does not reburn a source already consumed by an invitation.
- Calendar-claim, accumulate, claim_requires and lapse belong only to a later secondary contract/sweep. They are not accepted by the current closed constructor option.

## Capacity prior and controls

[`contract.mjs`](contract.mjs) inventories the ten immutable arms and `invitationCapacityPrior({P,b,E})`. The stationary prior `min(1/P,E/b)` concerns invitation creation capacity under sufficient eligible demand, retained source income and no other binding gates. It is not a population growth/doubling or deterrence theorem. b0 removes funding; arm0 has no finite P/b capacity measurement (JSON uses an explicit unbounded marker, not a fabricated rate).

[`capacity-controls.mjs`](capacity-controls.mjs) runs fully funded native operations with two accepted genesis subjects, zero initial money/XP/own stock, accepted-reference guarantor qualification, ordinary maturity, greedy daily demand, and emission every1/2/3days (realized E=1,1/2,1/3). Recipients are not admitted. There are no truth labels, random samples, market, detection, private utility or endogenous choices. One opportunity/day suffices for all bounded requested arms. The separate64-same-hour-creation test is a resource-censored witness for arm0, not a measured maximum.

Reproduce the source-identified engineering table without writing any artifact:

```bash
node studies/2026-10-25-invitation-limits/capacity-controls.mjs
```

Twenty-seven504-day controls match independent finite-prefix counts and the stationary prior within one invitation of phase error. With emission every q days, the first funded use is `(b-1)*q+1` for b>0 (zero for b0); spacing is `max(P,b*q)` in this lossless integer-rate control. B's extra initial invitation is recorded, not hidden as noise. At E1, B3/H3b1 produce169/168 invitations, B7/H7b1 produce73/72; H burns an extra168/72 FACY, exactly1 per invitation. These are nominal service costs for a scripted creator, not measured honest adoption or verified private fraud premium. New-node first-use delays may repeat across generations; per-creator capacity alone cannot predict population doubling.

## Inference boundaries

- b=P*E is co-binding; strict extra stationary throttling requires b>P*E. Funding stock, maturation and phase still matter.
- A nonbinding burn still consumes FACY: remaining nominal flow at rate r is E-b*r before other uses/costs. This is not calibrated private utility, but unchanged capacity cannot prove unchanged fraud premium.
- The literal supplied falsifier supports H6's no-farm-benefit/honest-tax subclaim. Equivalence needs fixed margins and uncertainty, not a nonsignificant difference. Growth, work/evidence, actor costs, price, fraud premium and confirmation contracts remain open before empirical capture. Price does not change nominal issuance or make purchased FACY own emission.
- Existing default banked rights still permit bursts: requested A now exists explicitly as an opt-in experimental arm, not a relabeling of current defaults. All variants are research counterfactuals, not adopted protocol options.

Tests: [`invitation-limit-model`](../../test/invitation-limit-model.test.mjs) covers atomic funding, immutable configuration/receipts, key/veto/pause clocks, all XP modes, unchanged non-cost gates and D59 compatibility; [`invitation-limits`](../../test/invitation-limits.test.mjs) covers arithmetic,27 native controls and historical default witnesses. No software result establishes H6, verified personhood, useful network growth or a new emergent mechanism.
