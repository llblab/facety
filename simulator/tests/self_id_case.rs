//! The trusted independent Self-ID transaction fixture (the Q25-A1 authorization). Admission, historical-duty
//! qualification and the upheld merits are supplied externally. These are deterministic software checks of the
//! declared isolated subset, not production admission, human validation or general transaction settlement.
use facety_sim::amount::Amount;
use facety_sim::world::{Config, Id, SelfIdCaseStage, TransactionTarget, TrustedAdmissionPremises, TrustedMerits, TrustedPremise, World, COEF_ONE};

const ACCUSER: Id = 0;
const ACCUSED: Id = 5;
/// The challenged Self-ID's creation-time roster in the ring genesis below.
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

fn supplied() -> TrustedAdmissionPremises {
    TrustedAdmissionPremises { admission: TrustedPremise::Supplied, historical_duty: TrustedPremise::Supplied }
}

fn world(base_stake: Option<u32>) -> World {
    World::new(Config { base_stake, ..Config::default() }, N, &ring(N))
}

/// A world at hour 48: one terminal challenged Self-ID owned by `ACCUSED`, an accuser above it in XP, and the
/// creation-time `ROSTER` funded with one independent liquid coin each.
fn prepared() -> (World, u32) {
    let mut w = world(Some(7));
    for g in ROSTER {
        w.create_self_id(g).unwrap();
    }
    let target = w.create_self_id(ACCUSED).unwrap();
    w.create_self_id(ACCUSER).unwrap();
    w.tick(24);
    for g in ROSTER {
        let act = w.eligible_emission(g).unwrap();
        w.convert_to_collector(g, act).unwrap();
    }
    w.create_self_id(ACCUSER).unwrap();
    w.tick(48);
    assert!(w.xp(ACCUSER) > w.xp(ACCUSED));
    assert_eq!(w.act_guarantors(target), ROSTER);
    assert_eq!(w.liquid(ACCUSED), Amount::ZERO, "the accused holds only the target's unspent right");
    for g in ROSTER {
        assert_eq!(w.spendable(g), Amount::ONE);
    }
    (w, target)
}

fn record(w: &mut World, target: u32) -> u32 {
    w.record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(target), supplied()).unwrap()
}

fn activate(w: &mut World, case: u32) -> i64 {
    let at = w.self_id_case(case).unwrap().matures_at;
    w.tick(at);
    assert_eq!(w.self_id_case(case).unwrap().stage, SelfIdCaseStage::Activated);
    at
}

/// One account's observable state; a rejected operation must leave the whole projection untouched.
type AccountState = (Amount, Amount, Amount, i32, i32, u32, bool, bool);

/// The observable state a rejected operation must leave untouched.
fn projection(w: &World) -> Vec<AccountState> {
    (0..N as Id)
        .map(|id| (w.liquid(id), w.spendable(id), w.debt(id), w.xp(id), w.responsibility_units(id), w.coefficient(id), w.held(id), w.accepted(id)))
        .collect()
}

fn ledger(w: &World) -> (Amount, i64, i64, Amount) {
    (w.burned(), w.minted(), w.vault(), w.supply())
}

#[test]
fn isolated_d192_settlement_executes_the_selected_effects_end_to_end() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    let opening = w.self_id_case(case).unwrap().clone();
    assert_eq!(opening.stage, SelfIdCaseStage::Pending);
    assert_eq!((opening.target, opening.accused, opening.author), (target, ACCUSED, ACCUSER));
    assert_eq!(opening.source_guarantors, ROSTER);
    assert_eq!(opening.matures_at, opening.recorded_at + 24);
    assert!(!w.held(ACCUSER) && !w.held(ACCUSED), "a pending opening restricts nobody");
    assert_eq!(opening.frozen, None);

    activate(&mut w, case);
    let frozen = w.self_id_case(case).unwrap().frozen.unwrap();
    assert_eq!((frozen.violating, frozen.endpoint, frozen.n), (1, 1, 1), "a terminal one-act suffix has N = 1");
    assert!(w.held(ACCUSER) && w.held(ACCUSED));
    assert!(!w.case_final(case), "the ordinary cutoff has not arrived");

    let deadline = w.case_deadline(case).unwrap();
    assert_eq!(deadline, w.self_id_case(case).unwrap().matures_at + 7 * 24);
    w.tick(deadline);
    let units = w.responsibility_units(ACCUSED);
    let burned = w.burned();
    let vault = w.vault();
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();

    // D192 accounting: actual collection and award 1 FCTY each, no second source burn, no unpaid charge.
    assert_eq!((settlement.accused_charge, settlement.accused_collected, settlement.accuser_award), (Amount::ONE, Amount::ONE, Amount::ONE));
    assert_eq!((settlement.source_burned, settlement.unpaid_accused), (Amount::ZERO, Amount::ZERO));
    // The original creation-time roster is charged and burned; no guarantor-funded top-up of the award.
    assert_eq!(settlement.charged_guarantors, ROSTER.to_vec());
    assert_eq!((settlement.guarantor_charge, settlement.guarantor_burned), (Amount::coins(4), Amount::coins(4)));
    assert_eq!(w.burned(), burned + Amount::coins(4));
    assert_eq!((w.stats.self_id_source_burned, w.stats.self_id_awarded), (Amount::ZERO, Amount::ONE));
    // The losing author keeps the identity, loses the receipt and one coefficient halving.
    assert_eq!(settlement.coefficient_before, COEF_ONE);
    assert_eq!(settlement.coefficient_after, COEF_ONE / 2);
    assert_eq!(w.coefficient(ACCUSED), COEF_ONE / 2);
    assert_eq!(w.responsibility_units(ACCUSED), units - 1, "only the challenged source's actual receipt is revoked");
    assert_eq!(w.liquid(ACCUSER), Amount::ONE, "the accuser's award is the transmitted target backing");
    assert_eq!((w.liquid(ACCUSED), w.debt(ACCUSED)), (Amount::ZERO, Amount::ZERO));
    for g in ROSTER {
        assert_eq!(w.liquid(g), Amount::ZERO, "the original guarantor charge is burned");
        assert_eq!(w.coefficient(g), COEF_ONE, "financial liability alone does not halve a guarantor");
    }
    assert!(w.accepted(ACCUSED), "the identity status and the valid prefix are preserved");
    assert_eq!(w.vault(), vault - 1, "the consumed entitlement is not recreated");
    let receipt = w.transaction_provenance(TransactionTarget::SelfId(target)).unwrap().xp_receipt.unwrap();
    assert!(receipt.revoked, "the source cut is keyed to this case");
    assert_eq!(receipt.recipients, &[ACCUSED, 3, 4, 6, 7]);
    let outcome = w.case_outcome(case).unwrap();
    assert_eq!((outcome.winner, outcome.forced_winner), (facety_sim::chekharda::Side::Accuser, Some(facety_sim::chekharda::Side::Accuser)));
    assert_eq!(outcome.positions, 1);
    assert!(outcome.debts.is_empty());
    assert!(!w.held(ACCUSER) && !w.held(ACCUSED), "the case releases only its own restrictions");
    w.audit().unwrap();
}

#[test]
fn replay_returns_the_journal_and_case_specific_reversal_restores_only_this_case() {
    let (mut w, target) = prepared();
    let unrelated = w.begin_case(&[1, 2]).unwrap();
    let case = record(&mut w, target);
    activate(&mut w, case);
    let units_before = (0..N as Id).map(|id| w.responsibility_units(id)).collect::<Vec<_>>();
    w.tick(w.case_deadline(case).unwrap());
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    let after = (projection(&w), ledger(&w), w.stats.self_id_settled);

    // Replay: the retained journal is returned and no second payment, burn, penalty or removal happens.
    assert_eq!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap(), settlement);
    assert_eq!((projection(&w), ledger(&w), w.stats.self_id_settled), after);
    // A non-upheld merits premise refuses even on replay: the journal records an upheld result.
    assert!(w.settle_self_id_case_fixture(case, TrustedMerits::NotUpheldSupplied).is_err());
    assert_eq!((projection(&w), ledger(&w), w.stats.self_id_settled), after);

    let units = (0..N as Id).map(|id| w.responsibility_units(id)).collect::<Vec<_>>();
    assert_ne!(units, units_before, "the settlement revoked the challenged source's receipts");
    let restored = w.restore_self_id_case_effects(case).unwrap();
    assert!(!restored.status_restored, "no identity status was invalidated, so only receipts and the penalty are restored");
    assert_eq!(restored.responsibility_units, 5, "the author plus four creation-time guarantors");
    assert_eq!(restored.penalty_events, 1);
    assert_eq!(w.coefficient(ACCUSED), COEF_ONE);
    assert_eq!((0..N as Id).map(|id| w.responsibility_units(id)).collect::<Vec<_>>(), units_before, "only this case's receipt effects return");
    assert!(!w.transaction_provenance(TransactionTarget::SelfId(target)).unwrap().xp_receipt.unwrap().revoked);
    // Transfers and burns are not refunded, and the consumed entitlement is not recreated.
    assert_eq!((w.liquid(ACCUSER), w.burned(), w.vault()), (Amount::ONE, after.1 .0, after.1 .2));
    assert!(w.self_id_settlement(case).unwrap().reversed);
    assert!(w.restore_self_id_case_effects(case).is_err(), "a repeated reversal refuses");
    assert!(w.held(1) && w.held(2), "an unrelated case keeps its own holds");
    assert!(w.apply_case_identity_verdict(case).is_err(), "a Self-ID case is not an identity verdict");
    assert!(w.request_appeal(case, ACCUSED).is_err(), "the fixture selects no appeal admission contract");
    w.audit().unwrap();
    w.end_case(unrelated);
    w.audit().unwrap();
}

#[test]
fn frozen_n_above_one_is_a_supported_lifecycle_with_an_unsupported_settlement() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    // A Self-ID recorded during the pending interval extends the affected suffix through the activation snapshot.
    let later = w.create_self_id(ACCUSED).unwrap();
    assert_ne!(later, target);
    activate(&mut w, case);
    let frozen = w.self_id_case(case).unwrap().frozen.unwrap();
    assert_eq!((frozen.violating, frozen.endpoint, frozen.n), (1, 2, 2));
    w.tick(w.case_deadline(case).unwrap());
    let before = (projection(&w), ledger(&w));
    assert!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).is_err());
    assert_eq!((projection(&w), ledger(&w)), before, "an unsupported settlement mutates nothing");
    assert!(w.self_id_settlement(case).is_none());
    assert!(w.case_outcome(case).is_none());
    assert_eq!(w.stats.self_id_settled, 0);
    w.audit().unwrap();
}

#[test]
fn unavailable_target_backing_refuses_without_guarantor_burns() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    // The accused spends the sole target right during the pending interval: zero accused collection, funded guarantors.
    w.convert_to_collector(ACCUSED, target).unwrap();
    w.burn_liquid(ACCUSED);
    assert_eq!(w.liquid(ACCUSED), Amount::ZERO);
    for g in ROSTER {
        assert_eq!(w.spendable(g), Amount::ONE, "the guarantors stay funded");
    }
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    let before = (projection(&w), ledger(&w), w.stats.self_id_settled);
    assert!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).is_err());
    assert_eq!((projection(&w), ledger(&w), w.stats.self_id_settled), before);
    assert!(w.self_id_settlement(case).is_none());
    // The spent target also leaves the activated case without an exit: holds and custody continue (Q26 duration is open).
    assert_no_exit(&mut w, case);
    w.audit().unwrap();
}

/// Every ordinary exit refuses for the fixture kind, so an activated case with failed premises keeps its restrictions.
fn assert_no_exit(w: &mut World, case: u32) {
    assert!(w.settle_case(case, None).is_err());
    assert!(w.cancel_case_opening(case, ACCUSER).is_err());
    assert!(w.cancel_self_id_case_opening(case, ACCUSER).is_err());
    w.end_case(case);
    assert!(w.held(ACCUSER) && w.held(ACCUSED), "the restrictions continue with no selected expiry");
    assert!(w.self_id_settlement(case).is_none());
}

/// Diagnostic witness for Q26's restriction-duration choice: one ordinary extra Self-ID by the accused during the
/// pending interval freezes N above one, and the activated case then has no settlement and no exit inside the subset.
/// This records a lifecycle consequence of the selected rules; it is not an exploit proof or a permission to add one.
#[test]
fn defender_induced_pending_drift_leaves_an_activated_case_without_an_exit() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    let later = w.create_self_id(ACCUSED).unwrap();
    assert_ne!(later, target, "the drift act is an ordinary Self-ID, not a special operation");
    activate(&mut w, case);
    assert_eq!(w.self_id_case(case).unwrap().frozen.unwrap().n, 2);
    assert_eq!(w.spendable(ACCUSER), Amount::ZERO, "the accuser's first stake stays in custody");
    w.tick(w.case_deadline(case).unwrap());
    let before = (projection(&w), ledger(&w));
    assert!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).is_err());
    assert_eq!((projection(&w), ledger(&w)), before);
    assert_no_exit(&mut w, case);
    w.tick(w.now() + 30 * 24);
    assert!(w.held(ACCUSER) && w.held(ACCUSED), "no expiry is selected: the holds survive an arbitrary horizon");
    assert_eq!(w.spendable(ACCUSER), Amount::ZERO);
    w.audit().unwrap();
}

#[test]
fn incomplete_guarantor_backing_refuses_atomically() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    let stripped = ROSTER[0];
    w.burn_liquid(stripped);
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    let before = (projection(&w), ledger(&w));
    assert!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).is_err());
    assert_eq!((projection(&w), ledger(&w)), before);
    w.audit().unwrap();
}

#[test]
fn overlapping_open_case_refuses_atomically() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    let other = w.begin_case(&[ACCUSER, ACCUSED]).unwrap();
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    let before = (projection(&w), ledger(&w));
    assert!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).is_err());
    assert_eq!((projection(&w), ledger(&w)), before);
    w.audit().unwrap();
    w.end_case(other);
    assert!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).is_ok(), "the held target again rejects the unsafe transition");
}

#[test]
fn key_recovery_interaction_refuses_atomically() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    w.lose_key(ACCUSED).unwrap();
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    let before = (projection(&w), ledger(&w));
    assert!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).is_err());
    assert_eq!((projection(&w), ledger(&w)), before);
    w.audit().unwrap();
}

#[test]
fn identity_verdict_and_role_penalty_apis_refuse_for_the_self_id_case() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    assert!(w.apply_case_identity_verdict(case).is_err(), "no settled effects exist yet");
    assert!(w.apply_case_identity_verdict_to(case, ACCUSED).is_err());
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    assert!(w.apply_case_identity_verdict(case).is_err(), "an identity chain cut is not a proxy for this correction");
    assert!(w.apply_case_identity_verdict_to(case, 4).is_err());
    assert!(w.apply_case_xp_penalty(case, ACCUSED, 0.5).is_err());
    assert!(w.accepted(ACCUSED) && w.accepted(4));
    assert_eq!(w.coefficient(4), COEF_ONE);
    w.audit().unwrap();
}

#[test]
fn typed_targets_and_aliases_refuse_before_allocating() {
    let (mut w, target) = prepared();
    let own = w.create_self_id(ACCUSER).unwrap();
    let before = (projection(&w), ledger(&w));
    let supplied = supplied();
    assert!(w.record_self_id_case_fixture(ACCUSER, TransactionTarget::Invitation(0), supplied).is_err());
    assert!(w.record_self_id_case_fixture(ACCUSER, TransactionTarget::Opening(0), supplied).is_err());
    assert!(w.record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(u32::MAX), supplied).is_err());
    assert!(w.record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(own), supplied).is_err(), "own target is not a challenge");
    assert!(w.record_self_id_case_fixture(ACCUSED, TransactionTarget::SelfId(own), supplied).is_err(), "an alias is not a target");
    assert_eq!((projection(&w), ledger(&w)), before);
    assert_eq!(w.self_id_cases(), 0, "no case ID, hold, custody or effect was allocated");
    assert_eq!(w.audit(), Ok(()));
    assert!(w.record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(target), supplied).is_ok());
    assert!(w.record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(target), supplied).is_err(), "one case per transaction");
    w.audit().unwrap();
}

#[test]
fn missing_premises_and_unupheld_merits_refuse() {
    let (mut w, target) = prepared();
    let before = (projection(&w), ledger(&w));
    let missing = TrustedAdmissionPremises { admission: TrustedPremise::Missing, historical_duty: TrustedPremise::Supplied };
    assert!(w.record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(target), missing).is_err());
    let partial = TrustedAdmissionPremises { admission: TrustedPremise::Supplied, historical_duty: TrustedPremise::Missing };
    assert!(w.record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(target), partial).is_err());
    assert_eq!((projection(&w), ledger(&w)), before);
    assert_eq!(w.self_id_cases(), 0);
    let case = record(&mut w, target);
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    let before = (projection(&w), ledger(&w));
    assert!(w.settle_self_id_case_fixture(case, TrustedMerits::NotUpheldSupplied).is_err());
    assert_eq!((projection(&w), ledger(&w)), before);
    w.audit().unwrap();
}

#[test]
fn pending_cancellation_is_free_and_unsupported_vetoes_refuse() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    let before = (projection(&w), ledger(&w));
    assert!(w.cancel_self_id_case_opening(case, ACCUSED).is_err());
    assert_eq!(w.cancel_self_id_case_opening(case, ROSTER[0]), Err(facety_sim::world::Reject("opening-guarantor veto authority is not contracted")));
    assert_eq!((projection(&w), ledger(&w)), before);
    w.cancel_self_id_case_opening(case, ACCUSER).unwrap();
    assert_eq!(w.self_id_case(case).unwrap().stage, SelfIdCaseStage::Cancelled);
    assert_eq!((w.stats.self_id_openings_cancelled, w.stats.self_id_openings_activated), (1, 0));
    assert_eq!((projection(&w), ledger(&w)), before, "a pending cancellation forfeits nothing");
    w.tick(w.now() + 48);
    assert_eq!(w.self_id_case(case).unwrap().stage, SelfIdCaseStage::Cancelled, "a cancelled opening never activates");
    assert!(!w.held(ACCUSER) && !w.held(ACCUSED));
    assert!(w.cancel_self_id_case_opening(case, ACCUSER).is_err());
    w.audit().unwrap();
}

#[test]
fn settlement_before_the_cutoff_refuses_atomically() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    let at = activate(&mut w, case);
    w.tick(at + 1);
    let before = (projection(&w), ledger(&w));
    assert!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).is_err());
    assert_eq!((projection(&w), ledger(&w)), before);
    w.audit().unwrap();
}

#[test]
fn departed_original_guarantors_are_charged_not_the_current_roster() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    activate(&mut w, case);
    // Two original guarantors leave their guarantee with the accused: the current graph shrinks to {6, 7}.
    for gone in [ROSTER[0], ROSTER[1]] {
        let valence = w.open_valence_of(ACCUSED, gone).unwrap();
        w.withdraw_valence(ACCUSED, valence).unwrap();
    }
    assert_eq!(w.mutual_partners(ACCUSED), vec![6, 7]);
    w.tick(w.case_deadline(case).unwrap());
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    assert_eq!(settlement.charged_guarantors, ROSTER.to_vec(), "the recorded creation-time roster, not today's graph");
    for g in ROSTER {
        assert_eq!(w.liquid(g), Amount::ZERO, "the departed guarantor stays liable for the act it guaranteed");
    }
    w.audit().unwrap();
}

#[test]
fn the_selected_stake_halving_and_integrity_settings_are_required() {
    assert!(world(None).record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(0), supplied()).is_err());
    let mut no_halving = world(Some(7));
    no_halving.cfg.halve_losers = false;
    assert!(no_halving.record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(0), supplied()).is_err());
    let mut no_integrity = world(Some(7));
    no_integrity.cfg.integrity = false;
    assert!(no_integrity.record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(0), supplied()).is_err());
}
