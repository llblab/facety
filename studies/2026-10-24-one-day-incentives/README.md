# P23 one-day incentive fixture: software checkpoint

Date: 2026-10-24. Owner: [the existing one-day port item](../../BACKLOG.md). Contract: [incentive direction](../../docs/incentives.en.md#one-day-counterpart-contract-p23). This directory retains implementation/compatibility validation, **not a new research result table, mechanism confirmation or calibrated participation finding**.

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

**Prepared 2026-10-24; report execution is a separate checkpoint.** [`run.mjs`](run.mjs) owns the closed machine-readable `reportDesign()` and pure `analyzeRaw()` transformation. This is a diagnostic execution of an encoded reference plus conditional terminal arithmetic, not a registered emergent-mechanism confirmation or an inferential sample. No study results were collected in this preparation pass; constructed test inputs are software validation, not historical science or authenticated provenance.

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

After the runner/design commit, the later execution command is:

```sh
node studies/2026-10-24-one-day-incentives/run.mjs
```

It accepts no CLI scenario/seed/force overrides and reserves a new `results/` directory atomically. Any existing directory, including a partial one, blocks automatic retry/overwrite. `raw.json` is written before analysis; `report.json` retains all cases; `manifest.json` is written last to mark completion, with byte hashes, source/runtime, runner commit/hash and full design/digest. An unexpected partial failure is evidence to inspect, not permission to delete/replay.

The pure analyzer requires complete/unique mode coverage, exact declared input-source identity, bound design/runner hashes, valid v2 facts and matched physical inputs. Source order, branch order and cached comparison changes do not alter its actual analysis. It records the analyzer's own provenance separately and an explicit `matchesPinnedSource` flag; future offline analysis under different code/runtime is not silently labeled a same-source reproduction. The fresh execution gate is stricter. These structural/hash checks do not authenticate supplied inputs.

Retain the two separate hour-48 snapshots; **do not** infer per-checkpoint work by filtering `atHour <= 48`, which would incorrectly include later same-hour identity work at admission. Report terminal work through the full ownership analysis and retain ordered action records. `firstCreditedCheckpoint` names the earliest retained snapshot with credit, not a newly observed exact continuous-time credit event. Missing people/acts are absent, not zero participation. Do not turn fixed sparse scripts into daily retention or compare annualized returns across the old 11-day and new 3-day horizons.

All raw adverse, null and positive comparisons remain. There are no p-values, confidence intervals or claims of seed-sampled attack probability. A conditional maximum is not observed choice or equilibrium. This design does not resolve duty/history/recovery, pause/risk caps, oracle validity, bootstrap, private loss calibration, useful contribution or the actual cost-of-attack condition. It is not a D33/D34 migration, a real attack, independence/personhood verification or a finding that liability causes withdrawal.

## What remains

The canonical backlog owns the single bounded execution and source-bound reporting/insight reconciliation after this runner/design is committed. No `results/` dataset exists at preparation. Reuse the native implementation/legacy-preservation evidence while those sources are unchanged; runner tests and the rejected uncommitted-execution check are recorded separately in `report-validation.json`. Author validation is not independent review, and the external P16 actor-workflow gate remains unresolved.
