# Owned valences V3 — Council paths and bootstrap implementation checkpoint

**2026-10-29 · opt-in reference engineering after the [pre-code contract](council-paths-contract.md) (`702466c`); not a default, migration or empirical result.** The remaining OPEN contracts (mixed terminals, D33 Council, verified independence, mature decline below 100, D95 re-entry) stay in [BACKLOG](../../BACKLOG.md#trust-topology-condition-map-master-programme).

## What exists

With `valences.reference.eligibility: 'v3-council-paths'` and the exact `councilPaths` object, `src/model.mjs`:

- establishes `valences.genesisPairs` at construction as open genesis-supplied valence records (`burnSource: null`) plus established pairs, counted against K, with no mint or burn;
- exposes `initialBootstrap` (`true` until 100 active participants are first observed at a gate check or `advanceTo`, then permanently `false`, event `bootstrap-ended`; `null` when V3 is off);
- gates `createSelfId` on ≥1 established mutual partner and, outside bootstrap, on one partner having a current mutual path to an admissible member other than itself (certificate stored as `act.councilPath`);
- gates valence-mode `createInvitation`, outside bootstrap, on D internally vertex-disjoint current mutual paths to one admissible member other than the creator (certificate stored as `invitation.councilPath`), in addition to the unchanged ≥D guarantor count;
- searches with `findInternallyDisjointPaths` over the current guarantee graph (valence pairs and active invitation links only), blocking non-accepted identities, and re-verifies each family with `verifyInternallyDisjointPaths` before use.

`eligibility: 'off'` (with `councilPaths: null`, `genesisPairs: []`) keeps V2; V1/V2 tests changed only those bindings.

## Deviation recorded at implementation

- **D84 guarantor count ignores the activity filter.** The contract named `eligibleGuarantors` for the Self-ID support count; under the default `guarantorEligibility: 'active'` a genesis that has not yet acted has no active guarantor, so the first Self-ID could never be created. The reference therefore counts accepted established mutual partners for the D84 gate (D84 says "established mutual guarantor", not "active"); XP recipients and the invitation guarantor count still follow `eligibleGuarantors`.

## Validation

`test/valence-council-paths.test.mjs` (8 tests) covers the contract's eight groups: exact bindings; genesis pairs; bootstrap Self-ID support; the 99/100 latch and no re-entry after decline; outside-bootstrap Self-ID reachability including the no-self-terminal case; disjoint versus shared-intermediary invitation families with stored, independently verified certificates; withdrawn links and invalidated intermediaries; and independence of the guarantor-count and path conditions. Removing the self skip, the intermediary blocking, the latch, the invitation path gate or the D84 partner requirement each fails at least one test. Structural replay additionally refuses `bootstrap-ended`.
