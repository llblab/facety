# Paired controls, activity perturbations and finite-window return

This document owns `src/controls.mjs`, the scheduled activity behavior in `src/experiment.mjs`, and the experimental random-coupling policy. [Discovery](discovery.en.md) owns exploratory pattern selection; [cohort experiments](experiments.en.md) owns the underlying agent/observation assumptions. These controls do not add a court or prove network health.

## Run a paired example

```js
import { readFile } from 'node:fs/promises';
import { compareExperiments, analyzePairs } from './src/controls.mjs';

const example = JSON.parse(await readFile('examples/controls.json', 'utf8'));
const result = compareExperiments(example.experiment, example.comparison);
console.log(result.analysis.outcomes);
console.log(result.analysis.summaries);

// Reanalysis changes no simulated state and consumes no new replica randomness.
const reanalyzed = analyzePairs(result.pairs, result.analysis.settings);
console.log(reanalyzed.summaries);
```

The example runs eight pairs over 24 days. In the treatment only, honest inspection and veto-response activity pause on days 8 through 11 and restore on day 12. Other activity remains configured normally. The saved result retains both configurations, named parameter changes, actual replica seeds, randomness manifests, histories, money and effort ledgers.

The example is a controlled disturbance, not a preselected demonstration of an emergent property. A return to a compromised baseline does not establish security. Returning inspection activity and continued success of the false-liquidity goal can coexist.

## Activity schedule

The experiment accepts `perturbations`, for example:

```json
{
  "perturbations": [
    {
      "id": "inspection-blackout",
      "startDay": 8,
      "endDay": 12,
      "activity": { "honest": { "inspect": 0, "respond": 0 } }
    }
  ]
}
```

Events use start-inclusive, end-exclusive integer day ranges inside the declared horizon. IDs are unique; an omitted ID gets a deterministic input-position label. Each event specifies only the activity fields it overrides. The normal configured profile, not the global defaults, is restored after the event.

At most 128 events are accepted. Overlapping events may affect different fields. Overlapping assignments to the same cohort/action are rejected, even if the values agree, rather than resolved through an implicit priority rule. Unknown fields, protocol-rule changes and invalid rates fail validation.

`activityAtDay(config, day)` exposes the normalized effective profile and active IDs, including the horizon boundary. Every history point records them. Initial trust/topology setup precedes the daily schedule. Horizon-only measurements restore an event that ended at the horizon but do not execute extra actions.

A schedule is not a rollback or a protocol freeze. Clocks continue, guarantees remain recorded, XP/money/work persist, and a missed reward slot does not become a catch-up reward. The activity profile controls configured opportunities: guarantee frequency controls proposals, while counterparty matching retains its existing automatic vetting/authorization policy. Setting proposal frequency to zero is not a claim that a subject has gone completely offline.

## Counterfactual random coupling

The former consumed behavior stream allowed inert inspections to shift unrelated invitation/guarantee choices and therefore change population and XP under the same seed. That was a simulation artifact, not evidence of a collective mechanism.

The current manifest is:

```json
{
  "generator": "sha256-xoshiro128starstar-v2",
  "decisions": "decision-keyed-v1"
}
```

Daily decision draws are derived from the seed, logical clock, decision channel, actor and slot/context. Ordering, submission, guarantee work, inspection, response, invitation work and conversion do not consume one another's stream offsets. Observations also use explicit contexts; more inspections cannot shift unrelated guarantee-vetting errors.

Matching contexts share draws. Different candidate sets, entities or histories can still yield different actions; those are not forced to remain identical. Initial roles and topology use their separately seeded generation paths. Randomness remains non-cryptographic and is a research sampling mechanism, not a security primitive. Seed labels are hashed with SHA-256 into a 128-bit xoshiro128** state. The former `fnv1a32-mulberry32-v1` generator had only 2^32 seed states, so distinct decision keys shared identical streams within one large run; its results are not interchangeable with v2 replays.

Regression tests require exact protocol-state equality when inspections cannot cause a response or exhaust a budget. They separately verify that a future intervention cannot change its pre-intervention history, that no-op schedules have no economic effect, and that real veto behavior remains possible.

**Seed-only outputs from the earlier consumed-stream implementation are not interchangeable with current replays.** Retain the full configuration, manifest, implementation revision and histories. New seeds used to check a hypothesis should be reserved separately from exploratory selection. A change to the logical key layout requires a new policy identifier.

## Comparison contract

`compareExperiments(base, options)` accepts named `parameters`, such as `activity.honest.inspect` or a replacement `perturbations` array, plus trials, master seed, metrics, practical tolerances, windows and return settings.

Both arms must use the same horizon and success-criterion definition. Seed/state-output metadata cannot be treatment parameters. Nested parameter values replace that field; use dotted leaf paths to avoid accidentally replacing an entire profile. The two arms are separate model instances, never a mutated shared model.

The default is eight pairs. `maxRecordedSamples` bounds both arms' planned histories before any run executes. Full protocol snapshots are excluded from this batch API; replay one witness with `runExperiment({ ...config, seed, includeState: true })` when a graph/state artifact is needed.

A single newly added event on an otherwise unperturbed base automatically supplies nonempty `pre`, `perturbation` and `post` windows and a return-search boundary at its end. Other comparisons use the full horizon unless explicit windows or a return boundary are supplied. Multiple events do not invent one causal episode automatically.

`analyzePairs(pairs, settings)` reanalyzes retained data. Branch seeds, horizons and randomness manifests must agree. Its output contains aligned daily measurements and differences, phase summaries, outcome contrasts and optional return descriptors.

## Paired measurement and uncertainty

A difference always means treatment minus baseline. Daily series use the same after-action-batch convention and horizon-alignment implementation as discovery. Missing or undefined values remain `null`, never zero; there is no interpolation over gaps. In particular, XP Gini is undefined while effective total XP is zero. Even an exact no-effect control has unknown XP-Gini differences on those days, not numerical zero effects; equal positive authority can instead yield an observed zero difference.

Window summaries are means of paired daily metric-level differences, not differences between unrelated replica averages. For a cumulative metric such as false conversions, a window mean is not the number of new events during that window. Use the raw trajectory and appropriate flow metric for that question.

A full-ensemble window mean requires every requested pair to have complete finite measurements for every day in the window. Otherwise it is withheld. The descriptive distribution of available pair means retains its actual count and must not be substituted for a full-ensemble estimate. Fully observed early windows remain usable after later computational truncation.

Boolean outcomes retain both marginal Wilson summaries and matched counts: both succeeded, both failed, baseline only, treatment only and unresolved. The paired risk-difference estimate is withheld when a pair's outcome difference is unknown. Identification bounds concern possible sampled-outcome assignments, not sampling confidence.

The reported conservative 95% paired-difference interval uses a Hoeffding bound. Each paired outcome difference lies in [-1, 1]; its radius is `sqrt(2 * log(40) / number_of_pairs)`. Unknown outcomes widen the possible sample-mean range before this radius is applied. This assumes independent idealized replica sampling, not independence of the two arms. It is not a subtraction of marginal Wilson intervals, and it remains wide when all observed paired differences are zero. It does not account for uncertainty in behavioral calibration or pseudorandom-model adequacy.

Numeric phase distributions and standard errors are descriptive; they are not causal confidence intervals. Multiple metrics, phase windows and exploratory choices do not become independent corroboration.

## Return criterion, not a health verdict

`describeReturn` searches after a declared day for `holdDays` consecutive daily differences within the metric's absolute tolerance of baseline. Defaults are three samples and the practical tolerances listed in `OBSERVABLES`.

It records the first matching window start, its confirmation day and whether all remaining observations stayed within the band. A later observed breach makes the latter false; a later missing tail can make it unknown. An observed return window remains an observed event even if later data are censored.

No observed return is false only when the post-window is adequately long and fully observed. Missing post data give an unknown result. Too few remaining days give `insufficient-window`, not a failure to recover. Aggregation reports the probability of this explicit return criterion, not a general probability that Facety heals.

Restored parameters can leave residual state. Conversely, a metric can return within its band even if the network is still compromised, a different metric has not returned, or the selected tolerance permits a small residual. Finite persistence is not proof of hysteresis, an attractor or permanent damage. Those remain hypotheses requiring additional controlled perturbations and held-out replicas.
