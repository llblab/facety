# M1-A: canonical witness wire and trusted software envelope

**D61 opt-in reference, engineering contract frozen before this slice's code; not a graph-gate acceptance result.** [M0](README.md) and [the design](../../docs/indexer.en.md) precede this implementation. BACKLOG alone owns tasks. This checkpoint implements the codec/policy boundary only; primary live-state verification, ref2 and I1–I7 graph properties remain unimplemented. No economic/default/Standing/anchor/capacity choice is made.

## Version and API contract

Owner module: `src/path-witness.mjs`, independent of graph/search/Model/indexer/provenance/filesystem modules. It exports `pathWitnessPolicy`, `pathWitnessPolicyId`, `encodePathWitness`, `decodePathWitness` and immutable `PATH_WITNESS_LIMITS`. Encoding returns Uint8Array-compatible Buffer bytes; decoding accepts Uint8Array/Buffer, not a JSON string or arbitrary object. Malformed data raises TypeError, resource/policy limits RangeError; success returns frozen **data, not eligible:true**. No signature, Merkle verification, canonical-state authentication or graph/path soundness is claimed.

Semantic witness has exactly `{subject,epoch,paths}`. Context has exactly `{domain,subject,policy}`, all supplied by the caller/application rather than the witness. Epoch is nonnegative safe integer, not negative zero; freshness is checked by the future verifier, **not** the codec. Domain/IDs are nonempty exact Unicode scalar strings bounded by UTF-8 bytes: no normalization, aliasing, unpaired surrogates or coercion. Subject must equal the expected context subject.

Policy is complete and flat: direction (`directed-from-anchor`/`undirected`), undirectedProjection (`any-live-orientation`/`reciprocal-only`, explicit even when not used by the directed arm), maxHops, graceEpochs, maxSlack, maxDifficulty, maxIdBytes, maxWitnessBytes, minStanding(null or nonnegative safe integer). The two undirected values expose rather than silently choose the unresolved projection. minStanding is only a future declared-observation condition, never invented XP/verified truth.

**First software envelope, not protocol/empirical ranges:** maxHops/maxDifficulty1…64, graceEpochs0…1024, maxSlack0…1, maxIdBytes1…256 and maxWitnessBytes1…65536. Larger/general-slack policies fail explicitly, not approximately or with changed acceptance. These fixed ceilings bound parser/encoder memory and prepare the slack1 verifier; they are engineering limits, not changes to D33, selected difficulty or owner candidate r5/g1/s1. Every policy field is explicit; no field defaults are filled. A future expanded envelope/codec requires its own version/validation before claiming coverage.

## Canonical bytes

Policy identity is lowercase SHA-256 of UTF-8 `facety-path-policy/v1` followed by one NUL byte and canonical JSON of the policy. Policy object keys are lexicographically sorted ASCII names; primitive values use JSON.stringify with no spaces. The hash binds **all** fields, including implementation/resource bounds. It is a content/domain binding, not authenticated policy authority.

Wire is exact UTF-8 JSON, no BOM/whitespace/trailer, with keys in this order:

```text
{"domain":DOMAIN,"policy":POLICY_HASH,"version":"facety-path-witness/v1","witness":{"epoch":EPOCH,"paths":PATHS,"subject":SUBJECT}}
```

Paths are ordered by lexicographic unsigned UTF-8 bytes of their own canonical JSON array. The client encoder normalizes order and deduplicates identical paths; strict wire decoding rejects noncanonical order, duplicates, duplicate object keys, alternate number/string escapes or unknown fields. Thus normalized semantic data has one byte encoding under the context. The raw supplied candidate count is bounded **before** deduplication by maxDifficulty+maxSlack. Each path has0…maxHops edges (at least one vertex) with valid bounded IDs. A well-formed zero-hop candidate remains data for exact slack selection and will not qualify for the graph threshold; it must not invalidate an otherwise sufficient family merely at codec level. Wrong start/endpoint, cycles, liveness, shared vertices/anchors, required D and snapshot count limits are future verifier semantics, not silently certified here.

Input byte length is checked before copying/UTF-8 decoding/JSON parsing; malformed UTF-8 is rejected, not replacement-decoded. Output size is checked while sizing component encodings before building the final buffer. Canonical re-encoding and exact byte equality reject parse-equivalent alternate transports. Arbitrary accessors/proxies/host objects, concurrent shared-memory mutation and runtime allocation failures are outside this JSON/ordinary Uint8Array contract; no callback safety or universal sandbox is promised.

## Acceptance and limits of evidence

Fixed literal vectors in `wire-vectors.json` expose policy/context, semantic data and canonical wire for another implementation. Policy hash/byte grammar are separately recomputed by a test-side flat serializer, not accepted solely by encode/decode round trip. Tests cover schema, context/policy substitution, Unicode, byte/count/hop limits, negative zero/nonfinite values, raw duplicates, ordering, invalid UTF-8, duplicate keys/escapes/trailers and systematic truncation/byte mutation. A successfully decoded mutated epoch is still data, not a live path certificate.

No StateAccessor is called, no graph verifier/ref2/algorithm/routing/runtime integration is present, and no new research/E1 capture or v2 method is registered. The independent graph/ref2 milestone must parse/check the wire independently; it must not import this decoder as its acceptance oracle. Same-author test-side serialization is not independent authorship/assurance. All source changes alter implementation identity, not child randomness/old defaults. [Validation](m1-wire-validation.json) separates software checks/current tests/pinned historical compatibility from graph/security/economic evidence.
