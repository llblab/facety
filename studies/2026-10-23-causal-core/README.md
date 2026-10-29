# Causal core: preservation, visible paths and matched relay

**Documented 2026-10-23. Evidence: diagnostic and exploratory, not a registered confirmation or real-world reliability result.** This is the bounded causal-clarity iteration, not execution of every item in the broader mandate. Canonical meaning and designs live in the [mechanism chapter](../../docs/research.en.md#executable-causal-core) and [structured register](../../docs/mechanisms.json); this folder owns checkpoint evidence.

## Starting and retained state

- HEAD: `af9b12eb34204cdb0a0f6d523aacb44aa9fe5fe5`; existing dirty accountability/stake work was preserved, not mistaken for committed code.
- Start: Node `v26.8.1`, npm `11.19.0`, **184 tests passed**, implementation `9a83b5db8875c6d0c63ef24dc36f5be4875836bafd7b9531ed68b8590fd89504` (23 modules). [baseline.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/baseline.json) records the working tree; the earlier [audit](../2026-10-23-accountability-audit/README.md) retains the original 53-study-file inventory and correctness witnesses.
- Retained source: `1338b35c06a19c668b833b84fa6f15f9152c98082e811efee672ab64f421d3fb` (28 modules), method `sha256-src-mjs-v1`. The digest necessarily includes the separately found untracked `src/relay.mjs`, `src/trace.mjs`, `src/walkthroughs.mjs` prototypes. They were preserved untouched, not imported by this slice, selected as canonical, or independently reviewed. Their different gates/sanctions are inventoried as an unresolved integration boundary.
- Full scheduler randomness stays `sha256-xoshiro128starstar-v2` / `decision-keyed-v1`. Walkthroughs use supplied inputs (`generator: null`); exploration uses the same generator with a separate `causal-relay-input-keyed-v1` layout. Example-source hashes accompany source provenance because fixtures/schedules are outside `src`.

[checkpoint.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/checkpoint.json) retains the complete effective model policy, ablations and normalized one-step rules shared by these runs, plus the named one-seat override. Actor budgets/capacities and stage inputs are retained per run. In particular, guarantee confirmation uses the zero-fee model reference; backing is explicitly reserved, chain fines and inviter-chain liability apply, reward share is 0.5, losing challengers halve XP, and collateral is protected from unrelated fines. These are not new owner selections; media/signature validity and genesis acquisition remain abstract.

No commit, push, publication, human recruitment, reserved-seed confirmation or historical study relabeling occurred.

## Concrete before / after

- **Removed:** the redundant `dispute.taken` participant set. Candidate exclusion derives membership from the owned stake positions through `hasParticipant`, with the accused excluded explicitly.
- **Isolated:** the existing strict challenge gate, one-step stake consequence and identity-verdict consequence in `src/disputes.mjs`. The scheduler and small explanatory reference share them; there is no second economic court implementation.
- **Exposed:** costed event-linked observation→package→route→independent supplied review→qualified challenge→verdict→native consequences. External actors get no membership, XP, private access, free payment or token mint. Weak/conflicted/unavailable/overloaded/fund-poor sponsors can stop it. A later decision actually responds to reduced XP.
- **Added deliberately:** one bounded information/work/journal module, executable compositions and regression evidence. This is not a claim that the repository has fewer total lines or is globally minimal. The register covers **123 normalized experiment-control leaves in 52 annotated groups**, native state/flows, measurements and unintegrated prototype controls. No independent controls were fused and no compatibility fact removed.
- **Preserved:** selected defaults, noisy evidence, scarce capacity, shared errors, wrongful harm, liability, pending custody and distinct debt. The bounded view fixes unit work and supplied policies, not uncertainty in the complete protocol. It does not invent compensation, immunity, endogenous investigation/adoption, an apex route or learning institution.

### Preservation boundary

[preservation.mjs](preservation.mjs) captured [preservation-baseline.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/preservation-baseline.json) before the extraction. It temporarily instruments the scheduler in memory to expose the complete ordered native event log. Twelve declared contexts cross one-step/instant/timed procedures, unsecured/reserved backing and social hooks off/on. All returned fields plus ordered events, excluding implementation provenance, match exactly.

[preservation-current.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/preservation-current.json) binds the current result. [preservation.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/preservation.json) is an earlier intermediate result and is intentionally retained separately. This does not prove universal equivalence or replay a historical full implementation. Numeric failure hardening below is an intentional correctness change, not an equivalence claim for previously partial failures.

## Five questions, ten named variants

[Readable walkthroughs](walkthroughs.md) and [raw native state/traces](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/walkthroughs.json.gz) retain every named variant; selection is by declared name/schedule, not a favorable seed search.

1. **Who earns/withdraws support?** `support-finalized` shows terminal XP and Aster paying one FACY to end Mira→Aster, revoking Mira's attributable historical credits; `support-vetoed` shows no terminal reward from a cancelled act. Consent never creates the reverse edge.
2. **When is correction still preventive?** `early-veto` cancels at age 23 hours. `missed-veto` converts at age 24, then rejects the late veto; later adjudication incurs work, collected penalties and debt. No unlimited forgiveness is invented.
3. **Can outsider evidence reach authority?** `outsider-confirmed` first fails Aster's equal-XP gate, then explicitly routes to Bela; `outsider-refused` stops at weak review. `false-allegation-rejected` burns the stake and halves Bela's XP, causing a later strict gate to fail; `false-allegation-upheld` exposes wrongful exclusion instead of assuming the court is always right.
4. **What does a small authority change mean?** `authority-boundary` uses an explicitly labeled one-seat Council reference: a second terminal XP moves the seat from Aster to Bela. **No ballot is executed.** The selected Council target remains 101 active eligible members with equal votes.
5. **Can processing resume after neglect?** `neglect-restored` preserves the queued package and history across 24 hours of unavailability. Resolution latency is 25 hours versus 1 hour normally. Restoration is exogenous; no endogenous repair/learning or reinstatement claim follows.

The XP-return regression also removes only losing-challenger XP halving in a labeled counterfactual: the next case becomes eligible with the same evidence, work and pre-attempt liquid resources. That is necessity of an encoded gate in one fixture, not emergent self-government or a proposed protocol option.

## Matched-resource exploration

[Readable contrasts](relay-summary.md), [all raw runs](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/relay-exploration.json.gz), and [full tracing/inert-read controls](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/trace-control.json.gz).

**Design:** 32 named exploratory seeds × 3 contexts × 3 arms = **288 runs**. Each arm has the same funded native prefix, public events Mira/Aster (in that order), window **[72,96] hours**, two discovery opportunities, ten total work units and the same sponsor's native XP/liquidity. The member arm assigns all ten units to Bela; external arms split six investigation/routing units to Outside and four review/challenge units to Bela. There is no extra workforce/opportunity effect hidden in relay. Member discovery uses the same measured package/route stages, not the legacy cohort scheduler.

Only the environment owns underlying violation truth: Mira is a violation in **17/32** seed worlds; Aster is genuine in all. Declared illustrative inputs are Mira's violation prevalence 0.5, discovery sensitivity 0.8 / false-positive rate 0.2, review sensitivity 0.85 / false-positive rate 0.2, and adjudication accuracy 0.8. These are stress inputs, not measurements. Contexts are independent review with daily capacity 2, independent review with capacity 1, and capacity 1 with a 0.75 mixture sharing discovery error. Different source labels do not prevent correlated interpretation.

### Retained results

Member and external-relay outcomes are identical under the matched quality/resource design: **zero paired differences** in all reported metrics in all contexts. This is a useful negative/placebo result, not a failure to discover a desired benefit.

Compared with external evidence that has no sponsor route, relay corrects **8/17 underlying violations per context** instead of 0/17. The paired mean contrast is **+0.250 corrections/run**. Descriptive 95% bootstrap intervals (2,000 resamples) are **[0.125, 0.406]** in each independent context and **[0.094, 0.406]** in the correlated context. These intervals are conditional on this synthetic design; contexts reuse the same 32 seed worlds and are not pooled as independent samples.

Costs and adverse results are not omitted (totals across 32 runs/arm/context):

| Relay context | Wrongful invalidations | Unadjudicated packages | Work units | Genuine XP lost | Genuine collected penalties | Actual burns | Added debt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Independent, capacity 2 | 1 | 7 | 149 | 95 | 26 | 41 | 4 |
| Independent, capacity 1 | 0 | 9 | 144 | 88 | 24 | 38 | 0 |
| Correlated, capacity 1 | 0 | 5 | 148 | 104 | 24 | 42 | 0 |

The unrouted arm spends **110** units, leaves **23** unadjudicated packages and applies no sanctions in each context. Equal endowments do not imply equal realized work: missing routing suppresses later review/challenge. Member costs match relay costs. Genuine-party penalties can reflect declared guarantor liability, not necessarily wrongful identity adjudication; they still matter as burdens. Stake burns are in actual burns and are not all included in the narrower collected-fine measure. Debt is never a burn or funded reward.

No funded case remains pending at hour 96; that does **not** mean all evidence was heard. “Unadjudicated packages” includes unrouted or refused evidence as well as capacity-blocked packages, not only an active queue. Missing formal/verdict times remain null. Resolved hearings last one hour, conditional on opening; they cannot substitute for unresolved latency. Dropping the second, genuine-target opportunity can remove a wrongful outcome without improving adjudication. Fixed FIFO target order is an uncontrolled alternative for context comparisons; neither scarce review nor shared error is shown to be beneficial. The correlated context has the same eight corrections but greater genuine XP burden than the independent capacity-one context.

**Interpretation:** a route can make otherwise unusable outsider evidence actionable under supplied review/funding/authority. It does not improve evidence quality by itself, eliminate adverse sanctions, prove responsive adoption, or demonstrate a population-level mechanism. Additional investigators, compensation/funding failures, independent sponsor competition, alternate orders, long horizons and scaling remain untested.

## Review, remediation and evidence accounting

Raw inventory reports are `inventory-005.txt` through `inventory-010.txt`. One reviewer inventories controls/measurement ambiguities, the other implemented return links. Their historical-consumer census is incomplete. The final normalization is degraded; raw reports, not consensus wording, support bounded findings.

Initial implementation review is `causal-slice-review-005.txt` through `-010.txt`. Reviewer 1 and the verifier independently reproduced two Medium findings despite ordinary-path passes:

- A public `null` actor could create/package/route evidence without a registered work budget, attributed falsely to the adjudicator. It did not demonstrate an XP/stake-gate bypass.
- A normalized fixed fine `MAX_SAFE_INTEGER`, inviter-chain liability and zero reward share could release custody/apply one penalty, then overflow aggregate debt, leaving a logically open but financially closed case without a decision record. Native protocol events still existed.

Both were corrected before retention. Public methods require registered actors; internal adjudication is separate. Shared pure arithmetic preflight respects liability order, challenger transfers and the pending stake refund, rejecting before reference economic mutation. Unexpected exceptions are recorded **subject to available trace capacity** and the original error still propagates. This is numeric preflight, not general rollback/callback safety or support for out-of-band settlement.

Remediation reports are `causal-remediation-review-005.txt` through `-010.txt`. Both independent reviewers and the verifier re-exercised the concrete defects on retained digest `1338b35c…`, verified safe rejection, exact maximum-debt acceptance and error propagation, and established no new supported material defect in that scope. One reviewer additionally ran 144 hand-coded sequential-oracle comparisons (not an authenticated historical implementation). The final judge/normalizer remained degraded because raw bodies were absent from their inputs; they ran no product tests. The coordinator retained and read the raw bodies here rather than treating normalization as additional verification.

**Test-count reconciliation:** the coordinator's earlier **34** was a five-file command including the two mechanism-inventory tests. Reviewers' **32** was a four-file command excluding those tests. A subsequent appended XP-return counterfactual made that four-file command **33**; the verifier observed the test-file hash change, while source hashes stayed fixed. The final coordinator five-file command is **35**, and the full suite is **202**. These overlap and must not be added together or attributed to every reviewer. [validation-tests.txt](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/validation-tests.txt) retains the earlier integrated pass; [validation-final.txt](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/validation-final.txt) retains the final 35-test focused and 202-test full pass after code-locator/inventory checks were strengthened. [checkpoint.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-causal-core/checkpoint.json) binds source, files and validation metadata.

## Reproduce

```sh
npm test
node --test test/accountability.test.mjs test/causal-relay.test.mjs test/mechanisms.test.mjs test/disputes.test.mjs test/dispute-stakes.test.mjs
node examples/causal-walkthroughs.mjs
node examples/causal-walkthroughs.mjs --json false-allegation-rejected
node examples/causal-relay.mjs
node studies/2026-10-23-causal-core/preservation.mjs
node studies/2026-10-23-causal-core/run.mjs --check
bash /home/llb/.agents/skills/domain-dag/scripts/validate-domain-dag.sh --root .
NO_COLOR=1 node /home/llb/.agents/skills/abcd-context/scripts/validate-context.mjs /home/llb/Repos/facety
git diff --check
```

`run.mjs --check` replays and compares all raw/Markdown artifacts, including source/runtime identities and **288 exact full-trace plus inert-inspection controls**. Without `--check`, it verifies existing outputs and only creates missing ones; it never overwrites a differing artifact. Compressed files are ordinary gzip JSON, readable with `node:zlib.gunzipSync` or `gzip -dc`. The default reports stay short; all native events, evaluator worlds, actor work and stage histories remain accessible.

## Limits and stopping boundary

This checkpoint closes the bounded causal slice, not the broad research program. No calibrated human time/skill/price, compensated relay, endogenous evidence demand, universal duplicate-content authentication, outcome-driven learning, general reinstatement, reasoned Council merits, apex admission, endogenous loyalty, actual governance obstruction, equilibrium or beneficial emergence has been established. No previous confirmation inherits the changed digest. Trace truncation bounds retained evidence, not semantics, and can omit exception detail. Whole-case safety assumes coherent normalized state and exclusive stake-book ownership. Remaining concrete acceptance criteria and owner choices live only in [BACKLOG.md](../../BACKLOG.md).
