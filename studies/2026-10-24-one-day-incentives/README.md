# P23 one-day incentive fixture: software checkpoint

Date: 2026-10-24. Owner: [the existing one-day port item](../../BACKLOG.md). Contract: [incentive direction](../../docs/incentives.en.md#one-day-counterpart-contract-p23). This directory retains implementation/compatibility validation and the source-bound **diagnostic** results below, not a mechanism confirmation or calibrated participation finding.

## Implemented boundary

- `runIncentiveForks` and v1 data/analysis behavior remain legacy 72/168-hour, zero-freeze, relation-XP-kept reference behavior. Existing examples remain unchanged.
- `runOneDayIncentiveForks({ xpFinality })` is a separate explicit factory: `facety-incentive-forks/v2`, `marginal-admission-24h-v1`. It pins the complete one-day reference policy; zero guarantee fee and trusted two-person genesis remain named assumptions. Default terminal XP is selected; immediate XP is a counterfactual comparison, not a protocol option.
- Each strategy replays funded Model operations independently: setup at 0 h, own-right disposition/invitation at 24 h, admission then fresh newcomer work at 48 h, and newcomer conversion at 72 h. The two 48-hour checkpoints retain invitations and distinct native event cursors. No balance injection, live graph cloning, invented sub-hour clock or D34 legal-event convention is used.
- The shared reader admits only the two declared schema/fixture tuples. V2 checks every snapshot's used accounting, fixed actor/action sequence, native-event projection and horizon; v1 retains its original optional-event behavior. These checks are not source authentication, human truth or a general transition-replay engine.
- Both existing pure analyses accept v2, preserve its declared source provenance without replacing it with the analyzer's identity, and keep unknown utility/losses. Operator custody/work stays separate from subject XP and protocol state. The new example is a thin v2 JSON runner, not a new general CLI.

The fixed-101/current-link runtime is still **not D33/D34**. No suspension, risk cap, self-correction funding, verdict/reward rule or useful-contribution oracle is added. A3/A4 remain hypotheses/design arguments about responses; A8's narrow timing deduction has diagnostic software checks, not evidence of willingness. Extra daily work, liability realization and voluntary choices are not scripted into this fixture.

## Validation

`controls.mjs` uses `git archive` of the preparation commit `30093eca9c844ac047b41c12b0595b2dba53f7e9` into an owned temporary directory and compares public **legacy** outputs on the same Node runtime. It does not replay stored scientific registrations/studies or generate current v2 tables. It prints a JSON report; `controls.json` retains the executed result.

- Both XP modes: **2 complete v1 factory artifacts**, **6 checked fact arrays**, **18 payoff analyses**, **6 ownership analyses** over native, reordered/cached-override and optional-eventless transports remain byte-identical. The complete comparison payload is 420,078 bytes; the report retains its SHA-256.
- All **three existing example stdout streams** are byte-identical, including formatting; their byte counts/digests are retained.
- **247/247 native tests pass**, including eight new one-day families: reproducible closed versioning, before/at maturity/freeze funding, equal-hour admission and guarantor snapshots/A8 timing, corrupt temporal/accounting/version evidence, reaccounted wrong work, pure provenance/valuation/unknown/ownership boundaries, unchanged v1 optional evidence and the new thin example.
- The dependency DAG is **27 modules / 66 local edges**, acyclic with no reverse entrypoint imports or shared buckets. Only `incentives → provenance` was added. No extra native module or public policy bag was introduced.
- Native source changes are limited to `incentives.mjs` and the two consumers' source-metadata projections. `model.mjs`, all other native modules, existing examples/tests and historical study files remain unchanged. The implementation digest changes from `0313a30912eb2a1caffeec361e769debc47750cceece0946c49d367d0ed84d9a` to `6e94fb9d4c886078011b08aae0e8a701267c9984d90fa03353a4661ee95d1d19` (`sha256-src-mjs-v1`, 27 modules; Node v26.8.1). This is a new source implementation, not permission to reuse/reclassify old confirmations.

```sh
node --test test/incentive-one-day.test.mjs
node studies/2026-10-24-one-day-incentives/controls.mjs
npm test
bash /home/llb/.agents/skills/domain-dag/scripts/validate-domain-dag.sh --root . --json
```

`validation.json` records the context/whitespace/source-boundary checks as well. Tests and differential controls are author-coordinated software evidence. **No independent review is claimed**: the previously recorded P16 actor-workflow qualification remains unresolved and was not rerun, bypassed or repaired here.

## Pre-execution report design

**Prepared 2026-10-24 and committed as `5f4ec1b` before the recorded execution below.** [`run.mjs`](run.mjs) owns the closed machine-readable `reportDesign()` and pure `analyzeRaw()` transformation. This is a diagnostic execution of an encoded reference plus conditional terminal arithmetic, not a registered emergent-mechanism confirmation or an inferential sample. No study results were collected in the preparation pass; its constructed test inputs are software validation, not historical science or authenticated provenance.

### Bound and source

- **Source:** native implementation `6e94fb9d4c886078011b08aae0e8a701267c9984d90fa03353a4661ee95d1d19`, 27 modules, Node v26.8.1. Fresh execution refuses a changed implementation/runtime and an uncommitted/modified runner before generating fixtures. It does not offer an implementation override.
- **Worlds:** two mode artifacts (`terminal`, selected reference; `immediate`, counterfactual), each containing exactly the three existing funded scripts. This means **six native branch replays**, not six independent human observations. No sampled seeds, replicate expansion, error model or randomness is introduced.
- **Time/resources:** declared 72-hour horizon and ordered checkpoints `[0,24,48,48,72]`; retain the full provider's policy, funding, work weights/budgets, actor actions, native events, snapshots, individual XP, invitations and custody. Physical projections across XP modes must match after removing only subject XP, act-credit state and the XP-derived Council view; all those removed fields remain in the raw data and report.
- **Denominators:** two artifacts, six native branches, 30 checkpoint rows, 28 payoff analyses / 56 sponsor comparisons, and two ownership analyses exposing four evaluator worlds / 12 overlay branch outcomes. Evaluator overlays are not additional admitted worlds or fabricated-identity executions.

### Fixed valuation and unknown-loss contrasts

The 14 named cases are fixed **before report execution**, not fitted to yield a favorable comparison. Values 0/1/10 are zero, unit and decade illustrations in caller-declared common utility units, not market prices or measured preferences. Default illustrated case is FACY value 1, XP value 0, work cost 1, both private benefits 0 and both incremental expected losses 0; zeros are supplied for that illustration, never inferred from no scripted debt.

- **Zero/cash/work:** `zero-value-control` sets FACY/work to zero; `cash-only` sets work cost zero; `cash-and-work` retains the default; `cash-tenfold` sets FACY value 10.
- **Authority/connection:** `xp-unit` and `xp-tenfold` set XP value 1/10; `admission-unit` and `guarantee-unit` separately set the corresponding private benefit to 1. Other components stay at the illustrated default.
- **Signed expected losses:** `added-loss-unit` supplies +1 for each invitation alternative relative to waiting; `avoided-loss-unit` supplies −1. These are explicit utility hypotheses, not measured duties, prevention or a new sanction/insurance rule.
- **Unknowns:** `unknown-xp`, `unknown-losses`, `unknown-benefits` and `all-unknown` preserve explicit nulls in the named inputs. Keep every unknown score/candidate and zero-exposure rule from the existing analyzer; do not prune inconclusive cases.

The existing payoff analyzer computes terminal differences, components and break-even thresholds **from newly checked facts**, not copied legacy tables. There is no Cartesian sweep, endogenous optimizer, calibrated risk response or new operator utility aggregator. The ownership analyzer retains its independent/controlled-newcomer evaluator worlds, actual custody assumptions, counterfactual work and per-subject authority without treating control as proof of false personhood.

### Outputs, checks and inference limits

The recorded single execution command was (do not rerun over the retained directory):

```sh
node studies/2026-10-24-one-day-incentives/run.mjs
```

It accepts no CLI scenario/seed/force overrides and reserves a new `results/` directory atomically. Any existing directory, including a partial one, blocks automatic retry/overwrite. `raw.json` is written before analysis; `report.json` retains all cases; `manifest.json` is written last to mark completion, with byte hashes, source/runtime, runner commit/hash and full design/digest. An unexpected partial failure is evidence to inspect, not permission to delete/replay.

The pure analyzer requires complete/unique mode coverage, exact declared input-source identity, bound design/runner hashes, valid v2 facts and matched physical inputs. Source order, branch order and cached comparison changes do not alter its actual analysis. It records the analyzer's own provenance separately and an explicit `matchesPinnedSource` flag; future offline analysis under different code/runtime is not silently labeled a same-source reproduction. The fresh execution gate is stricter. These structural/hash checks do not authenticate supplied inputs.

Retain the two separate hour-48 snapshots; **do not** infer per-checkpoint work by filtering `atHour <= 48`, which would incorrectly include later same-hour identity work at admission. Report terminal work through the full ownership analysis and retain ordered action records. `firstCreditedCheckpoint` names the earliest retained snapshot with credit, not a newly observed exact continuous-time credit event. Missing people/acts are absent, not zero participation. Do not turn fixed sparse scripts into daily retention or compare annualized returns across the old 11-day and new 3-day horizons.

All raw adverse, null and positive comparisons remain. There are no p-values, confidence intervals or claims of seed-sampled attack probability. A conditional maximum is not observed choice or equilibrium. This design does not resolve duty/history/recovery, pause/risk caps, oracle validity, bootstrap, private loss calibration, useful contribution or the actual cost-of-attack condition. It is not a D33/D34 migration, a real attack, independence/personhood verification or a finding that liability causes withdrawal.

## Executed diagnostic results (F45)

**Executed once, 2026-10-24**, from committed runner/design `5f4ec1b014a49ba062bd68f4a749c961109d9e8e`, with the pinned native digest/runtime above. The [completion manifest](results/manifest.json), [complete raw inputs](results/raw.json) and [full report](results/report.json) retain exactly the declared bound. These are encoded-rule accounting and conditional arithmetic, not emergent discovery, a statistical sample or human observations. No cases were added after inspecting output.

### Funded protocol accounting

Fresh terminal facts, equal in both declared XP modes:

| Script | Sponsor FACY | Sponsor XP | Sponsor work | Newcomer FACY | Newcomer XP | Entry burn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Wait | 1 | 1 | 3 | Absent | Absent | 0 |
| Invite only | 0 | 1 | 4 | 1 | 1 | 1 |
| Invite + guarantee | 0 | 2 | 5 | 1 | 1 | 1 |

Work uses the supplied illustrative source units, not measured human labor. The invitation burns an own matured right; it is not a fee paid from an injected initial wallet. Peer custody remains 1 FACY in every branch. At the endpoint waiting has two minted rights/no burn; admission has three rights/one entry burn, leaving the same total two-FACY supply in this sparse script. Adding a subject is not demonstrated useful demand or net external value.

Relative to waiting, sponsor `(FACY, XP, work)` is **`(-1,0,+1)`** for invitation alone and **`(-1,+1,+2)`** with the separate guarantee. These were recomputed from fresh raw ledgers/actions, not copied from the old tables. They happen to agree with the historical endpoint vector, but not its physical clock or source identity.

With selected terminal XP, the first retained own-credit checkpoint is **24 h for waiting and both invitation scripts**. Newcomer and eligible sponsor-guarantor credit first appear at 72 h. The immediate-XP counterfactual instead records own credit at 0 h and newcomer/guarantor credit at 48 h. Equal-hour admission/work remain separate. Thus A8's no-inherited-day-3-versus-day-7 timing premium is visible in this executed reference; equal terminal values do **not** show finality timing is irrelevant to future options, rank or disputes, which the terminal utility functional excludes.

### Every declared private-valuation case

The following sponsor differences relative to waiting are identical in the two modes because the functional prices terminal facts, not earlier authority:

| Case | Invite only | Invite + guarantee |
| --- | ---: | ---: |
| Zero-value control | 0 | 0 |
| Cash only | -1 | -1 |
| Cash and work | -2 | -3 |
| Cash tenfold | -11 | -12 |
| XP unit | -2 | -2 |
| XP tenfold | -2 | 7 |
| Admission unit | -1 | -2 |
| Guarantee unit | -2 | -2 |
| Added-loss unit | -3 | -4 |
| Avoided-loss unit | -1 | -2 |
| Unknown XP | -2 | Unknown |
| Unknown losses | Unknown | Unknown |
| Unknown benefits | Unknown | Unknown |
| All unknown | Unknown | Unknown |

Across the **56 arithmetic comparison rows**, 36 are negative, 4 zero, 2 positive and 14 unknown. These are not success frequencies or independent replications: the same 14 supplied preference cases appear in two mode contexts. The only positive row per mode is the supplied tenfold-XP guarantee illustration; zero-value controls tie. Unknown losses stay unknown even though every scripted observed debt is zero. Unknown XP leaves invitation-only's zero XP exposure priced at zero, without imputing XP's actual value.

For supplied FACY value `P`, own-XP value `v`, work cost `c`, admission benefit `A`, guarantee benefit `G` and incremental expected losses `L_i/L_g`, the freshly reconstructed differences are:

```text
Invite only:          -P     - c  + A     - L_i
Invite + guarantee:   -P + v - 2c  + A + G - L_g
Guarantee versus invitation alone: v - c + G - (L_g - L_i)
```

At `P=c=1`, zero benefits and explicitly supplied zero losses, the guarantee threshold is `v=3` (strict preference only above it). This is conditional arithmetic, not a measured preference, a willingness threshold or evidence that liabilities are negligible. Both strategies can lose to waiting even when extra guarantee work and XP are locally indifferent (`v=c=1`). Stay/report/exit opportunities and history-dependent exposure are absent, so these tables cannot decide A3's increasing-tail guarantee-selection question.

### Custody/work overlay, not a second admission

| Script | Independent FACY | Independent work | Controlled FACY | Controlled work |
| --- | ---: | ---: | ---: | ---: |
| Wait | 1 | 3 | 1 | 3 |
| Invite only | 0 | 4 | 1 | 7 |
| Invite + guarantee | 0 | 5 | 1 | 9 |

These are sponsor-**operator** totals. The controlled overlay counts newcomer-wallet custody under the sponsor's assumed control, not an executed transfer or extra minting. Relative to waiting it retains FACY delta 0 but costs +4/+6 work, versus independent admission's FACY -1 and work +1/+2. Sponsor/newcomer XP stays `{1,1}` or `{2,1}` in separate subjects, never one identity's summed authority. No operator utility is aggregated. The fabricated-identity label and fabrication-work substitution are evaluator assumptions; neither actual fabrication feasibility nor control-implies-false-personhood is established. Real attack cost, oracle validity and calibration remain open.

### Retained-data audit and assurance

[`audit.mjs`](audit.mjs) is a **post-data author audit**, not a preregistered test or independent reviewer. Without calling the model or either payoff/ownership analyzer it reconstructs raw sponsor deltas, micro-unit work, all 56 scores/components/thresholds/choice summaries, 30 checkpoint accounts/credit views, 12 evaluator branch outcomes and eight operator comparisons. It verifies completion/file/code hashes against the recorded Git source and retains [its full result](execution-audit.json). It shares only standard hashing/identity support, not the economic analyzers being checked. This is bounded software/data consistency, not input authentication or proof of every protocol event.

The manifest records raw JSON **244,549 bytes**, SHA-256 `c77ecd596e3478596336bf7bfb01328f0b47bb15ac52f2a2de41ebb61595aabc`, and report JSON **556,966 bytes**, SHA-256 `38024006fcae97e8eecd8acc43770384e6809b592ba3b6a142942477f00726c9`. Source/design/code/raw bindings and every case passed the retained-data audit. The repository's generic `results/` ignore rule is unchanged; these three exact dated study artifacts are intentionally force-tracked, not transient output. Native source, frozen runner and prior controls are unchanged; the 252-test and 27-module/66-edge DAG evidence is reused under exact source identity, not rerun for new confidence. See `execution-validation.json` for the final evidence boundary.

## What remains

The bounded fixture port/reporting item is complete; broader P23 relation selection remains with its existing guarantee-selection/alignment owners. Next useful preparation must distinguish conditional private losses from an implemented D34 duty engine and specify credible competing choices, future opportunities and falsifiers before execution. Do not expand this menu or replay these worlds merely to improve a finding. D33/D34, calibration, voluntary retention, useful contribution and input-authenticity gates remain intact. Author validation is not independent review; the P16 actor-workflow gate was not retried, bypassed or repaired.
