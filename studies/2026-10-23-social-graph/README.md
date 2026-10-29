# Public social-graph ownership — 2026-10-23

**Bounded behavior-preserving extraction; diagnostic evidence.** Reference: `72bc817`. This is the next responsibility-split slice, not implementation of D33/D35/D36 topology gates, cluster quotas or a new trust policy.

## Owner and boundary

`src/social-graph.mjs` owns two read-only graph calculations:

- `propagatedTrust(graph, seeds)`: the existing root-seeded structural propagation, moved verbatim apart from export visibility.
- `graphNeighborhood(graphs, id, hops)`: the existing breadth-first undirected neighborhood body, parameterized by an ordered graph list instead of closing over the model.

The 40-line module has **no imports**. It receives graph read interfaces and supplied IDs/hops, not a model, evaluator ownership/genuineness labels, random streams, observations, dispute records, work budgets or economic mutation callbacks. Its rank is not evidence of personhood, useful contribution or independently verified guarantors.

`experiment.mjs` retains its existing `neighborhood(id, hops)` wrapper, explicitly passing guarantees before lineage. Existing call sites and public experiment exports do not change. The file shrinks **990 → 957 lines**; stateful gossip/attention, sensing, cohort filters, adjudication and scheduler decisions remain local. Total source does not shrink and no runtime speedup is claimed.

Graph order, outgoing-before-incoming adjacency, insertion/discovery order, seed filtering, walk steps and floating-point accumulation order are preserved. No sorting, deduplication policy, graph screening threshold or random-key layout is introduced. This preserves the explicitly labeled legacy screening reference, not D33's unimplemented verified-independence contract.

## Source and direct-helper controls

`preservation.mjs` archives the exact reference source and checks:

- Only `experiment.mjs` changes among existing source modules; the other **25** are byte-identical.
- Only `social-graph.mjs` is added.
- The entire new experiment source equals the reference after exactly adding one import, removing the old propagation function and replacing the old neighborhood body with the wrapper.
- Both helper bodies retain their reference operations, apart from export visibility and explicit graph parameters.
- Experiment public export names remain unchanged.

An instrumented archived module exposes its old private propagation function and old neighborhood body solely for diagnostic comparison. Across all **64** directed simple graphs on three ordered nodes, **4,096** ordered guarantee/lineage pairs, four starting IDs including an absent ID, and hop counts 0–3, **65,536** neighborhood arrays match exactly in order. Five seed lists over those graphs produce **320** propagation comparisons, retaining node order and exact numbers. Duplicate supplied seeds are a reference-behavior control, not a selected valid-root policy.

Two permanent native helper tests separately cover expected discovery order, graph-list order reversal, zero hops, root exclusion, overlapping graph edges, missing IDs, isolated nodes, empty support, exact propagation values, input-seed preservation and unchanged graph snapshots/revisions.

## Full scheduler controls

The fresh archive/current comparison reuses the sixteen declared configuration-extraction controls, including three dispute procedures, both stake backings, social hooks, honest growth, genuine cartel, schedules/deviants, explicit legacy timing/ablations and censoring. Their archived outputs also reproduce the retained diagnostic digests. A seventeenth context enables structural screening, acquaintance filtering, verification, gossip and attention together so the new rank owner is exercised through scheduler callers.

Read-only instrumentation returns the complete ordered native event log. Every result field plus **29,528 ordered events** is identical both by deep equality and serialized bytes after removing only provenance. Configurations, counters and digests are retained in [preservation.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-social-graph/preservation.json). No old empirical confirmation is rerun or transferred.

## Validation and provenance

```sh
node studies/2026-10-23-social-graph/preservation.mjs
node --test test/social-graph.test.mjs test/social.test.mjs test/experiment.test.mjs test/perturbations.test.mjs
npm test
```

Observed: **28 focused tests** and **228 full-suite tests** pass (overlapping counts). Domain DAG: **27 source modules / 65 local edges**, zero errors/warnings. Context, whitespace, source/history guards and full test output are retained in [validation.json](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-social-graph/validation.json) and [tests.txt](https://github.com/llblab/facety/blob/8b77cd8319f8613269586d1ce665828410e9fd03/studies/2026-10-23-social-graph/tests.txt).

All **215** files already tracked under `studies/` at the reference commit remain byte-identical. The source-content fingerprint changes because a module is added; the generator and decision-key policy do not. This is coordinator source/reference/regression evidence, not an independent review, universal behavioral proof, optimization result or scientific mechanism confirmation.

Remaining work is the stateful lifecycle boundary assessment in `BACKLOG.md`: enumerate actual state and cross-calls before further extraction. Do not hide wide coupling in a context object or callback bag just to lower line count. D33/D35/D36 operational contracts, D34 historical/correction contracts and E1/offline-input methodology choices remain gated. No safe-bootstrap, attack-probability, personhood or useful-distribution conclusion follows.
