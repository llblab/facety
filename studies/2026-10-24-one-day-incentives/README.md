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

## What remains

The canonical backlog now owns a source-locked diagnostic reporting design/runner and later execution for this v2 fixture. Commit the finite reporting/valuation/unknown-loss menu before publishing fresh tables. Do not copy legacy values just because terminal accounting may agree; retain sparse physical timing, custody and individual authority. No new report dataset or p-values were produced at this checkpoint. A maximum over finite supplied valuations never becomes endogenous adoption, real retention, personhood, a successful attack or demonstrated useful network growth.
