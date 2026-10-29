# Chain replay and repeat-penalty authority — 2026-10-23

**Diagnostic boundary classification; runtime unchanged; owner decision required.** Baseline `5f85bff5d46b1dafbcd756f935793e7c8c439fba`. This is the next bounded Facety correctness cohort, not D33 implementation, DEOS work or an empirical confirmation.

## Three different questions

1. **Raw native chain cut:** does the same cut remove money or XP twice when no new acts were appended?
2. **Closed case:** can the actual case owner process the finalized decision again, including reversing its supplied verdict?
3. **New adjudication input:** what authorizes a later penalty for previously considered acts or a different guarantor duty?

The first two have bounded evidence below. The third requires a protocol contract and must not be silently answered by a new deduplication map, per-subject lock or historical-act filter.

## Funded witnesses

`witness.mjs` uses only public native operations and explicitly supplied adjudication outcomes. Raw-cut/helper worlds use the declared `guarantorEligibility: "accepted"` reference; relay controls use the existing funded `causalWorld` walkthrough prefix. No evaluator ownership/uniqueness labels determine protocol actions. Inputs are deterministic, not sampled.

- **Three terminal states:** an unspent right, Collector-converted right and invitation-consumed right. Repeating the same cut without new acts repeats neither a burn nor XP removal. It still emits another `self-id-chain-voided` event. Converted/consumed dispositions change from `collector+voided` / `invitation+voided` to strings ending `+voided+voided`. Thus raw cuts are **not full-state idempotent**. The repeat return reports `acts: 0` for a cancelled unspent right but `acts: 1` for a converted/consumed historical act.
- **Appended suffix:** after a partial cut, another valid native Self-ID can be appended while the raw model identity is still accepted. Repeating the same `fromAct` selects both an already marked converted act and the new unspent right, burning the latter. A blanket subject-level dedup would suppress this new effect. This is a raw adjudication-input scenario, not a claim about production repair/reinstatement policy.
- **Bare helper:** a guarantor earns ten native converted rewards, an independent challenger four, and the target two plus one unspent right. Under normalized chain fines, guarantor liability, reward share 0.5 and no guarantor exclusion, the first supplied `enforceIdentityVerdict` invalidates the target. A new ordinary challenge then refuses because the target is not accepted. Explicitly invoking the lower-level unkeyed helper again nevertheless counts two already marked converted acts, transfers one additional FACY to the challenger, burns one and changes guarantor XP **5→2**; the guarantor loses two liquid FACY and no additional debt arises. Those are recorded protocol movements, not private utility or actual attack costs.
- **Four guarded cases:** upheld/rejected × unsecured/reserved. After a relay case resolves, repeating its verdict and attempting the opposite verdict both return `case-already-resolved`. Native snapshots and relay workflow/custody snapshots remain unchanged. The optional causal trace records the refused attempts; no full trace-idempotence claim is made.

The bare-helper contrast bypasses case ownership. **It is not a demonstrated exploit of the relay or scheduler.** Trusted native sanction inputs intentionally do not prove their own authorization. Calling `penalize` repeatedly is likewise not proof that a network adversary can cause those calls.

## Caller and contract inspection

- `src/accountability.mjs`: sponsorship rejects a simultaneous subject dispute; resolution checks `resolvedAt`, moots unaccepted targets and otherwise settles/enforces once.
- `src/dispute-stakes.mjs`: `#openCase` rejects already settled/mooted cases before stake collection, preventing repeated one-step loser penalties through that path.
- `src/experiment.mjs`: challenge entry rejects an already open timed dispute; `resolveTimedDispute` requires live membership, removes it once and moots an already invalidated target. `applyVerdict` is its internal consequence path, not a public replay API. These are code-inspection findings; this cohort does not inject a second private scheduler resolution.
- `src/disputes.mjs`: `preflightIdentityVerdict` uses the non-cancelled act count (minimum chain fine one), and `enforceIdentityVerdict` has no case/event ID. Already marked converted acts remain selected. Repeated explicit inputs therefore cannot distinguish a replay from an independent later authorization.
- Protocol §37 already requires at most one XP penalty per enforceable penalty event. §21.1 still needs that event/violation identity across distinct cases, overlapping cuts, new suffixes and historical guarantor duties.

No runtime source is changed to choose that contract. Repeated `+voided` metadata is retained as an observed limitation, not silently normalized or presented as an economic double burn.

## Validation and preservation

- New guard coverage passes on the existing implementation; **no fail-before/fix claim**. Focused model/accountability/stake tests: **48/48**; full suite: **215/215** (`tests.txt`).
- All **25 source modules and 174 prior study files** match raw Git blobs (`witness.json`). Implementation remains **`a3a5c26e6e34ece29a967d135ccde81ed132f9e7bd226673b4ef26ba7844e0f8`**, Node v26.8.1. Scheduler generator/key policy is unchanged.
- The [preceding twelve-context scheduler evidence](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-native-id/scheduler-preservation.json) remains applicable through identical runtime, script, baseline and source inputs; it was **reused, not rerun or copied**. No new performance/confirmation campaign was required.
- Documentation/context and whitespace validation are recorded in `validation.json` and `context.txt`. DAG evidence is likewise reused from the unchanged 25-module/57-edge source graph.
- Checks are coordinator execution/inspection, not independent review. There is no new oracle, human-uniqueness, useful-contribution, adoption, sustainable distribution or general attack-probability finding.

## Stop and exact unblocker

The canonical [BACKLOG](../../BACKLOG.md#paused-correctness-loop-repeat-verdict-authority-gate) is paused at the selected stop condition. No Grow Loop continuation is scheduled. D33 implementation remains separately gated.

**Smallest owner question:** may a separately admitted case impose a new penalty on a guarantor for already voided acts, or only for newly adjudicated acts/duties?

The answer must lead to an explicit admissibility/event identity, overlap/fine basis and historical-liability contract before enforcement changes. Alternatively, the owner may explicitly select a different remaining stale-proposal, terminal-lock or numeric-counter cohort without treating this boundary as resolved.

## Reproduce

```sh
node studies/2026-10-23-chain-replay/witness.mjs
node --test test/model.test.mjs test/accountability.test.mjs test/dispute-stakes.test.mjs
npm test
```

The witness prints without overwriting evidence and refuses changed runtime or historical source/artifacts relative to the named baseline. Existing book ownership assumes coherent exclusive scheduler/book custody; out-of-band settlement/recovery and arbitrary future case procedures are not verified.
