//! Suspended Self-ID maturity during an active dispute (D196).
//!
//! An active case suspends the accused participant's not-yet-processed Self-ID maturities without cancelling them and without
//! touching other participants. These are deterministic transition checks of the declared model behaviour: maturity,
//! integrity repair, debt service, cancellation, release and correction ordering. They are not human or production evidence.
use facety_sim::amount::Amount;
use facety_sim::chekharda::Side;
use facety_sim::world::{
    ActStatus, Config, DisputeStats, Id, TransactionTarget, TrustedAdmissionPremises, TrustedMerits, TrustedPremise, World, COEF_ONE, DAY, MATURITY_HOURS,
};

const ACCUSED: Id = 5;
const CHALLENGER: Id = 0;
const ROSTER: [Id; 4] = [3, 4, 6, 7];
const N: usize = 8;

fn ring(n: usize) -> Vec<(Id, Id)> {
    let mut pairs = Vec::new();
    for i in 0..n {
        for offset in [1usize, 2] {
            let j = (i + offset) % n;
            let (a, b) = (i.min(j) as Id, i.max(j) as Id);
            if !pairs.contains(&(a, b)) {
                pairs.push((a, b));
            }
        }
    }
    pairs
}

fn world() -> World {
    World::new(Config { base_stake: Some(7), ..Config::default() }, N, &ring(N))
}

/// Hour 48: the accused has one matured Self-ID and one still pending, the challenger stands above it in XP, and the
/// accused's creation-time roster is active and independently funded.
fn prepared() -> (World, u32) {
    let mut w = world();
    for g in ROSTER {
        w.create_self_id(g).unwrap();
    }
    w.create_self_id(ACCUSED).unwrap();
    w.create_self_id(CHALLENGER).unwrap();
    w.tick(24);
    for g in ROSTER {
        let act = w.eligible_emission(g).unwrap();
        w.convert_to_collector(g, act).unwrap();
    }
    w.create_self_id(CHALLENGER).unwrap();
    w.tick(48);
    assert!(w.xp(CHALLENGER) > w.xp(ACCUSED));
    let pending = w.create_self_id(ACCUSED).unwrap();
    assert_eq!(w.act_guarantors(pending), ROSTER);
    (w, pending)
}

type AccountState = (Amount, Amount, i32, i32, u32, u64, bool);

fn projection(w: &World) -> Vec<AccountState> {
    (0..N as Id).map(|id| (w.liquid(id), w.debt(id), w.xp(id), w.responsibility_units(id), w.coefficient(id), w.own_maturities(id), w.held(id))).collect()
}

fn stats(w: &World) -> &DisputeStats {
    &w.stats
}

#[test]
fn maturity_strictly_before_activation_is_unchanged() {
    let (mut w, _pending) = prepared();
    w.tick(w.now() + DAY);
    let early = w.create_self_id(ACCUSED).unwrap();
    w.tick(w.now() + DAY);
    w.tick(w.now() + 1);
    let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    assert!(w.maturity_hold(early).is_none(), "an act that already matured before activation is not suspended");
    let credits = w.responsibility_units(ACCUSED);
    w.tick(w.case_deadline(case).unwrap());
    let _ = w.settle_case(case, Some(Side::Accused)).unwrap();
    assert_eq!(w.responsibility_units(ACCUSED), credits, "an earlier maturity keeps its XP and its disposition");
    assert_eq!(w.coefficient(ACCUSED), COEF_ONE, "an acquitted accused keeps the integrity it already earned");
    w.audit().unwrap();
}

#[test]
fn maturity_exactly_at_activation_is_suspended_before_credit() {
    let (mut w, pending) = prepared();
    let maturity = w.act_recorded_at(pending) + MATURITY_HOURS;
    // The accusation is recorded exactly one maturity window before its activation, so the act and the case coincide.
    let case = w.record_case_opening(&[CHALLENGER, ACCUSED]).unwrap();
    assert_eq!(w.case_opening(case).unwrap().matures_at, maturity);
    let units = w.responsibility_units(ACCUSED);
    w.tick(maturity);
    assert!(w.held(ACCUSED), "the case activated at this timestamp");
    assert_eq!(w.responsibility_units(ACCUSED), units, "activation precedes the credit of the same-timestamp maturity");
    assert_eq!(w.maturity_hold(pending), Some(case), "the pending act is held by this case");
    assert_eq!(w.acts_status(pending), ActStatus::Unspent, "suspension is not cancellation");
    assert!(w.unspent_rights(ACCUSED) >= 1, "the entitlement is neither spent nor destroyed");
    w.audit().unwrap();
}

#[test]
fn maturity_after_activation_is_deferred_without_xp_or_debt_service() {
    let (mut w, pending) = prepared();
    let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    let units = w.responsibility_units(ACCUSED);
    let rights = w.unspent_rights(ACCUSED);
    let debt = w.debt(ACCUSED);
    w.tick(w.now() + 2 * DAY);
    assert_eq!(w.responsibility_units(ACCUSED), units, "a deferred maturity credits nobody");
    assert_eq!(w.unspent_rights(ACCUSED), rights, "and it does not become a spent or repaid entitlement");
    assert_eq!(w.debt(ACCUSED), debt);
    assert_eq!(w.own_maturities(ACCUSED), 1, "no integrity repair is taken from a suspended maturity");
    assert!(w.maturity_hold(pending) == Some(case));
    w.audit().unwrap();
}

#[test]
fn author_and_creation_guarantor_may_cancel_a_suspended_act_after_its_deadline() {
    let (mut w, pending) = prepared();
    let guarantor = w.act_guarantors(pending)[0];
    let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    w.tick(w.now() + 3 * DAY);
    assert!(w.now() - w.act_recorded_at(pending) >= MATURITY_HOURS, "the ordinary window has long closed");
    let vault = w.vault();
    w.cancel_self_id(guarantor, pending).unwrap();
    assert_eq!(w.acts_status(pending), ActStatus::Cancelled);
    assert_eq!(w.vault(), vault - 1, "the backing is burned once, as any cancelled act");
    assert!(w.maturity_hold(pending).is_none(), "a cancelled act is no longer a pending maturity");
    assert_eq!(stats(&w).maturities_cancelled, 1);
    // A stranger still has no authority, and the freeze does not extend anyone else's.
    assert!(w.cancel_self_id(CHALLENGER, pending).is_err());
    w.end_case(case);
    w.audit().unwrap();
}

#[test]
fn cancellation_during_the_freeze_never_credits_later() {
    let (mut w, pending) = prepared();
    let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    let units = w.responsibility_units(ACCUSED);
    w.tick(w.now() + 2 * DAY);
    w.cancel_self_id(ACCUSED, pending).unwrap();
    w.end_case(case);
    assert_eq!(w.responsibility_units(ACCUSED), units, "a cancelled suspended act never earns XP");
    assert_eq!(w.acts_status(pending), ActStatus::Cancelled);
    assert_eq!(stats(&w).maturities_released, 0, "nothing valid was left to release");
    w.audit().unwrap();
}

#[test]
fn withdrawal_or_acquittal_matures_the_suspended_act_once_at_release() {
    for withdraw in [true, false] {
        let (mut w, pending) = prepared();
        let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
        let units = w.responsibility_units(ACCUSED);
        if withdraw {
            // A withdrawal is only available while the case is still open, so it happens before the deadline.
            w.tick(w.now() + 2 * DAY);
            assert_eq!(w.responsibility_units(ACCUSED), units, "still suspended");
            w.cancel_case_opening(case, CHALLENGER).unwrap();
        } else {
            w.tick(w.case_deadline(case).unwrap());
            assert_eq!(w.responsibility_units(ACCUSED), units, "still suspended");
            w.settle_case(case, Some(Side::Accused)).unwrap();
        }
        assert_eq!(w.responsibility_units(ACCUSED), units + 1, "the deferred maturity is credited once at release");
        assert_eq!(w.own_maturities(ACCUSED), 2, "integrity repair happens at the release event, not retroactively");
        assert_eq!(w.coefficient(ACCUSED), COEF_ONE);
        assert!(w.maturity_hold(pending).is_none());
        assert_eq!(stats(&w).maturities_released, 1);
        w.audit().unwrap();
    }
}

#[test]
fn an_upheld_violation_invalidates_the_suspended_acts_and_keeps_unaffected_ones() {
    let (mut w, pending) = prepared();
    let bystander = 2;
    let theirs = w.create_self_id(bystander).unwrap();
    let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    let units = w.responsibility_units(ACCUSED);
    let guarantor_units = w.responsibility_units(ROSTER[0]);
    let bystander_units = w.responsibility_units(bystander);
    w.tick(w.case_deadline(case).unwrap());
    let outcome = w.settle_case(case, None).unwrap();
    assert_eq!(outcome.winner, Side::Accuser);
    assert_eq!(w.responsibility_units(ACCUSED), units, "the adverse settlement itself credits nothing");
    w.apply_case_identity_verdict(case).unwrap();
    assert_eq!(w.acts_status(pending), ActStatus::Cancelled, "the suspended act never receives its deferred reward");
    assert!(w.responsibility_units(ACCUSED) <= units, "the invalidated chain loses its receipts and gains none");
    assert!(w.transaction_provenance(TransactionTarget::SelfId(pending)).unwrap().xp_receipt.is_none(), "the suspended act never receives a receipt");
    assert!(w.responsibility_units(ROSTER[0]) <= guarantor_units, "the invalidated source never credits its guarantor");
    assert_eq!(w.responsibility_units(bystander), bystander_units + 1, "an unaffected account matures under the authorized rules");
    assert_eq!(w.acts_status(theirs), ActStatus::Unspent);
    assert_eq!(stats(&w).maturities_released, 0);
    w.audit().unwrap();
}

#[test]
fn overlapping_cases_release_only_after_the_last_applicable_hold() {
    let (mut w, pending) = prepared();
    let first = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    let units = w.responsibility_units(ACCUSED);
    w.tick(w.now() + DAY);
    let second = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    assert_eq!(w.maturity_hold(pending), Some(first), "the earliest hold is reported first");
    w.tick(w.case_deadline(first).unwrap());
    assert_eq!(w.responsibility_units(ACCUSED), units, "two holds suspend the same maturity");
    w.settle_case(first, Some(Side::Accused)).unwrap();
    assert_eq!(w.responsibility_units(ACCUSED), units, "the second case still holds it");
    assert_eq!(w.maturity_hold(pending), Some(second));
    w.tick(w.case_deadline(second).unwrap());
    w.settle_case(second, Some(Side::Accused)).unwrap();
    assert_eq!(w.responsibility_units(ACCUSED), units + 1, "the last hold releases it exactly once");
    assert!(w.maturity_hold(pending).is_none());
    w.audit().unwrap();
}

#[test]
fn other_participants_mature_normally_during_the_hold() {
    let (mut w, pending) = prepared();
    let bystander = 2;
    let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    let their_act = w.create_self_id(bystander).unwrap();
    let units = w.responsibility_units(bystander);
    w.tick(w.now() + 2 * DAY);
    assert_eq!(w.responsibility_units(bystander), units + 1, "an unrelated account is unaffected");
    assert!(w.maturity_hold(their_act).is_none());
    assert_eq!(w.maturity_hold(pending), Some(case));
    w.end_case(case);
    w.audit().unwrap();
}

#[test]
fn a_large_time_jump_equals_stepwise_processing() {
    fn run(stepwise: bool) -> (Vec<AccountState>, u64, u64, i64) {
        let (mut w, pending) = prepared();
        let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
        w.create_self_id(2).unwrap();
        let target = w.now() + 5 * DAY;
        if stepwise {
            let mut at = w.now();
            while at + DAY <= target {
                at += DAY;
                w.tick(at);
            }
        }
        w.tick(target);
        let state = projection(&w);
        let deferred = stats(&w).maturities_deferred;
        let released = stats(&w).maturities_released;
        w.cancel_case_opening(case, CHALLENGER).unwrap();
        assert_eq!(w.acts_status(pending), ActStatus::Unspent);
        w.audit().unwrap();
        (state, deferred, released, w.responsibility_units(ACCUSED) as i64)
    }
    let batched = run(false);
    let stepped = run(true);
    assert_eq!(batched, stepped, "a jump preserves the deferred set and the released result");
}

#[test]
fn settlement_release_and_reversal_replay_never_duplicates_value() {
    let (mut w, pending) = prepared();
    let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    w.tick(w.case_deadline(case).unwrap());
    let settlement = w.settle_case(case, Some(Side::Accused)).unwrap();
    let after_settle = (projection(&w), w.burned(), w.vault(), w.supply());
    let units = w.responsibility_units(ACCUSED);
    assert_eq!(w.responsibility_units(ACCUSED), units);
    // A second settlement refuses and changes nothing.
    assert!(w.settle_case(case, Some(Side::Accused)).is_err());
    assert_eq!((projection(&w), w.burned(), w.vault(), w.supply()), after_settle);
    // The released maturity is not re-processed by any later release or tick.
    w.end_case(case);
    w.tick(w.now() + 3 * DAY);
    assert_eq!(w.responsibility_units(ACCUSED), units, "no duplicate XP after release");
    assert_eq!((w.burned(), w.vault(), w.supply()), (after_settle.1, after_settle.2, after_settle.3));
    assert!(w.acts_status(pending) == ActStatus::Unspent);
    assert_eq!(settlement.positions, 1);
    w.audit().unwrap();
}

#[test]
fn the_filing_frozen_scope_and_charges_survive_every_maturity_transition() {
    let (mut w, pending) = prepared();
    // The filing challenges the accused's already matured act; the still-pending act is inside the same frozen scope.
    let target = w.eligible_emission(ACCUSED).unwrap();
    let premises = TrustedAdmissionPremises { admission: TrustedPremise::Supplied, historical_duty: TrustedPremise::Supplied };
    let case = w.record_self_id_case_fixture(CHALLENGER, TransactionTarget::SelfId(target), premises).unwrap();
    let frozen = w.self_id_case(case).unwrap().frozen.unwrap();
    assert_eq!((frozen.violating, frozen.endpoint, frozen.n), (1, 2, 2), "filing freezes the depth that exists then");
    let at = w.self_id_case(case).unwrap().matures_at;
    w.tick(at);
    assert_eq!(w.self_id_case(case).unwrap().frozen, Some(frozen), "activation cannot reprice the filing snapshot");
    assert_eq!(w.maturity_hold(pending), Some(case), "the in-scope pending act is suspended with the case");
    w.tick(w.case_deadline(case).unwrap());
    let plan = w.self_id_case_plan(case).unwrap();
    assert_eq!((plan.frozen, plan.accused_charge), (frozen, Amount::coins(2)), "no maturity transition reprices the charge");
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    assert_eq!(settlement.frozen, frozen);
    assert_eq!(settlement.accused_charge, Amount::coins(2));
    assert_eq!(settlement.guarantor_charge, Amount::coins(2 * settlement.source_guarantors.len() as u64));
    // The matured affected act is corrected by revocation; the suspended one is invalidated instead of being credited.
    assert_eq!(settlement.affected, vec![target, pending]);
    assert_eq!(settlement.invalidated, vec![pending]);
    assert_eq!(settlement.revoked_receipts.len(), 1);
    assert_eq!(w.acts_status(pending), ActStatus::Cancelled);
    assert!(w.maturity_hold(pending).is_none());
    w.audit().unwrap();
}

#[test]
fn an_unmatured_affected_source_is_invalidated_rather_than_credited_at_release() {
    let (mut w, target) = prepared();
    // File while the target is still unmatured: the case then holds its own challenged source.
    let premises = TrustedAdmissionPremises { admission: TrustedPremise::Supplied, historical_duty: TrustedPremise::Supplied };
    let frozen_before = w.now();
    let case = w.record_self_id_case_fixture(CHALLENGER, TransactionTarget::SelfId(target), premises).unwrap();
    assert!(w.now() < w.act_recorded_at(target) + MATURITY_HOURS, "the challenged act has not matured yet");
    w.tick(w.self_id_case(case).unwrap().matures_at);
    assert_eq!(w.maturity_hold(target), Some(case));
    w.tick(w.case_deadline(case).unwrap());
    let units = w.responsibility_units(ACCUSED);
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    assert_eq!(settlement.invalidated, vec![target], "the unmatured affected source is invalidated at settlement");
    assert_eq!(settlement.invalidated_burned, Amount::ONE);
    assert_eq!(w.acts_status(target), ActStatus::Cancelled);
    assert_eq!(w.stats.self_id_invalidated_burned, Amount::ONE);
    assert_eq!(w.stats.maturities_released, 0, "the invalidated source never receives its deferred reward");
    assert!(w.responsibility_units(ACCUSED) <= units, "neither the author nor its guarantors gain a deferred reward");
    assert!(frozen_before <= settlement.settled_at);
    w.audit().unwrap();
}
