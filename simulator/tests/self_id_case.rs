//! The trusted independent Self-ID transaction fixture (the Q25-A1 authorization). Admission, historical-duty
//! qualification and the upheld merits are supplied externally. These are deterministic software checks of the
//! declared isolated subset, not production admission, human validation or general transaction settlement.
use facety_sim::amount::Amount;
use facety_sim::world::{
    Config, Id, SelfIdCaseStage, TransactionTarget, TrustedAdmissionPremises, TrustedMerits, TrustedPremise, World, COEF_ONE, COEF_STEP, DAY,
};

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
    for right in w.eligible_emissions(ACCUSER, DAY) {
        w.convert_to_collector(ACCUSER, right).unwrap();
    }
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
    assert_eq!(
        opening.frozen,
        Some(facety_sim::world::FrozenCount { violating: 1, endpoint: 1, n: 1 }),
        "the disputed scope is frozen at recording, before any restriction exists"
    );
    assert_eq!(opening.accused_chain_at_recording, 1);

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
    assert_eq!(w.liquid(ACCUSER), Amount::coins(3), "the account keeps its two liquid coins and receives the one-coin award");
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
    assert_eq!(settlement.affected, vec![target], "the frozen affected scope of a terminal one-act suffix");
    assert_eq!(settlement.revoked_receipts.len(), 1);
    assert_eq!((settlement.revoked_receipts[0].act, settlement.revoked_receipts[0].recipients.len()), (target, 5));
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
    w.cfg.base_stake = Some(1);
    let unrelated = w.begin_case(&[ACCUSER, 2]).unwrap();
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
    assert_eq!((w.liquid(ACCUSER), w.burned(), w.vault()), (Amount::coins(3), after.1 .0, after.1 .2));
    assert!(w.self_id_settlement(case).unwrap().reversed);
    assert!(w.restore_self_id_case_effects(case).is_err(), "a repeated reversal refuses");
    assert!(w.held(ACCUSER) && w.held(2), "an unrelated case keeps its own holds");
    assert!(w.apply_case_identity_verdict_to(case, ACCUSED).is_err(), "a Self-ID case is not an identity verdict");
    assert!(w.request_appeal(case, ACCUSED).is_err(), "the fixture selects no appeal admission contract");
    w.audit().unwrap();
    w.settle_case(unrelated, Some(facety_sim::chekharda::Side::Accused)).unwrap();
    w.audit().unwrap();
}

#[test]
fn frozen_n_is_reserved_at_filing_and_a_later_filing_recalculates_its_own_scope() {
    let (mut w, target) = prepared();
    let due = w.create_self_id(ACCUSED).unwrap();
    // D199: zero and partial Collector backing are refused atomically, before any case ID, slot or custody exists.
    let mut empty = w.clone();
    empty.burn_liquid(ACCUSER);
    let mut partial = empty.clone();
    partial.create_self_id(ACCUSER).unwrap();
    partial.tick(partial.now() + DAY);
    let right = partial.eligible_emission(ACCUSER).unwrap();
    partial.convert_to_collector(ACCUSER, right).unwrap();
    assert_eq!(partial.spendable(ACCUSER), Amount::ONE, "one of the two FCTY the frozen N = 2 needs");
    for refused in [&mut empty, &mut partial] {
        let before = (projection(refused), ledger(refused));
        let result = refused.record_self_id_case_fixture(ACCUSER, TransactionTarget::SelfId(target), supplied());
        assert_eq!(result, Err(facety_sim::world::UNFUNDED_OPENING));
        assert_eq!((projection(refused), ledger(refused)), before);
        assert_eq!((refused.self_id_cases(), refused.stats.self_id_openings_recorded), (0, 0));
        assert!(refused.maturity_hold(due).is_none());
        refused.audit().unwrap();
    }

    let opening = record(&mut w, target);
    assert_eq!(opening, 0, "a successful filing takes the first case ID");
    let at = w.self_id_case(opening).unwrap().matures_at;
    assert_eq!(w.self_id_case(opening).unwrap().frozen.unwrap().n, 2);
    assert_eq!(w.self_id_case(opening).unwrap().reserved_stake, Amount::coins(2), "the frozen N is reserved at filing");
    assert_eq!((w.liquid(ACCUSER), w.spendable(ACCUSER)), (Amount::coins(2), Amount::ZERO));
    assert!(w.record_case_opening(&[ACCUSER, ACCUSED]).is_err(), "the funded opening occupies the accused's slot");
    let other = (1..N as Id).find(|&id| id != ACCUSED && w.xp(id) < w.xp(ACCUSER)).unwrap();
    assert_eq!(w.record_case_opening(&[ACCUSER, other]), Err(facety_sim::world::UNFUNDED_OPENING), "reserved FCTY cannot back a second filing");
    assert_eq!(w.burn_liquid(ACCUSER), Amount::ZERO, "reserved FCTY cannot be burned or spent meanwhile");

    // Cancel inside the pendency in one branch; the other activates on the filing-time reservation.
    let mut cancelled = w.clone();
    w.create_self_id(ACCUSER).unwrap(); // Matures exactly at activation: unrelated to the funded collateral.
    w.tick(at);
    assert_eq!(w.self_id_case(opening).unwrap().stage, SelfIdCaseStage::Activated);
    assert_eq!(w.case_positions(opening)[0].stake, Amount::coins(2));
    assert_eq!((w.liquid(ACCUSER), w.spendable(ACCUSER)), (Amount::coins(2), Amount::ZERO), "activation reuses the reservation, never charges twice");
    assert!(w.eligible_emission(ACCUSER).is_some(), "the author's own new maturity stays a separate emission right");
    assert!(w.cancel_self_id_case_opening(opening, ACCUSER).is_err());
    // The accused's maturity at the activation hour is suspended and cannot become collateral or liquid.
    assert!(w.maturity_hold(due).is_some());
    assert!(w.convert_to_collector(ACCUSED, due).is_err());
    assert_eq!(w.spendable(ACCUSED), Amount::ZERO);
    assert_eq!(w.self_id_case(opening).unwrap().frozen.unwrap().n, 2, "activation cannot reprice the filing snapshot");
    w.audit().unwrap();

    cancelled.cancel_self_id_case_opening(opening, ACCUSER).unwrap();
    assert_eq!(cancelled.spendable(ACCUSER), Amount::coins(2), "pending cancellation returns the whole reservation");
    assert!(cancelled.cancel_self_id_case_opening(opening, ACCUSER).is_err(), "a cancellation cannot be replayed");
    assert_eq!(cancelled.spendable(ACCUSER), Amount::coins(2), "and releases nothing twice");
    cancelled.tick(at);
    assert_eq!(cancelled.transaction_provenance(TransactionTarget::SelfId(due)).unwrap().xp_receipt.unwrap().credited_at, at);
    cancelled.create_self_id(ACCUSED).unwrap();
    for _ in 0..3 {
        cancelled.create_self_id(ACCUSER).unwrap();
        cancelled.tick(cancelled.now() + DAY);
    }
    for right in cancelled.eligible_emissions(ACCUSER, DAY) {
        cancelled.convert_to_collector(ACCUSER, right).unwrap();
    }
    let fresh = record(&mut cancelled, target);
    assert_ne!(fresh, opening);
    assert_eq!(cancelled.self_id_case(fresh).unwrap().frozen.unwrap().n, 3);
    assert_eq!(cancelled.self_id_case(opening).unwrap().frozen.unwrap().n, 2);
    activate(&mut cancelled, fresh);
    cancelled.audit().unwrap();
}

#[test]
fn frozen_n_above_one_settles_with_actual_collection_and_recorded_debt() {
    let (mut w, target) = prepared();
    // A filing against a deep chain freezes N above one at recording, however long the pendency lasts.
    let deeper = w.create_self_id(ACCUSED).unwrap();
    let standing = w.create_self_id(ACCUSER).unwrap();
    assert!(deeper != target && standing != target);
    w.tick(w.now() + 24);
    let case = record(&mut w, target);
    let later = w.create_self_id(ACCUSED).unwrap();
    activate(&mut w, case);
    let frozen = w.self_id_case(case).unwrap().frozen.unwrap();
    assert_eq!((frozen.violating, frozen.endpoint, frozen.n), (1, 2, 2), "filing fixed the endpoint; the pending drift is outside it");
    assert_ne!(later, deeper);
    let deadline = w.case_deadline(case).unwrap();
    w.tick(deadline);

    // The plan is readable before any effect and names the frozen scope, the charge and what is collectible now.
    let plan = w.self_id_case_plan(case).unwrap();
    assert_eq!((plan.affected.clone(), plan.accused_charge, plan.accused_collectible), (vec![target, deeper], Amount::coins(2), Amount::coins(2)));
    assert_eq!(plan.accused_unpaid, Amount::ZERO);

    let units_before: Vec<i32> = (0..N as Id).map(|id| w.responsibility_units(id)).collect();
    let burned = w.burned();
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    // Both frozen-suffix receipts are cut; the act recorded after the filing is outside the scope and matures at release.
    assert_eq!(w.responsibility_units(ACCUSED), units_before[ACCUSED as usize] - 2 + 1, "only the filing-frozen suffix is cut");
    assert_eq!(w.unspent_rights(ACCUSED), 1, "the later act keeps its own entitlement, outside this case");

    // D189: the accused owes N; only actual collection from the frozen affected scope pays the first accuser.
    assert_eq!((settlement.accused_charge, settlement.accused_collected, settlement.accuser_award), (Amount::coins(2), Amount::coins(2), Amount::coins(2)));
    assert_eq!(settlement.unpaid_accused, Amount::ZERO);
    assert_eq!((settlement.source_burned, settlement.affected.clone()), (Amount::ZERO, vec![target, deeper]));
    assert_eq!(w.liquid(ACCUSER), Amount::coins(4), "two existing liquid coins plus two collected");
    assert_eq!((w.liquid(ACCUSED), w.debt(ACCUSED)), (Amount::ZERO, Amount::ZERO));
    // Each original creation-time guarantor owes its own N: 1 liquid is burned and the rest is its own debt.
    assert_eq!((settlement.guarantor_charge, settlement.guarantor_burned), (Amount::coins(8), Amount::coins(4)));
    assert_eq!(w.burned(), burned + Amount::coins(4));
    for g in ROSTER {
        assert_eq!((w.liquid(g), w.debt(g)), (Amount::ZERO, Amount::ONE), "independent backing burns, the rest is debt");
    }
    // Both frozen-suffix receipts are cut, and the act recorded after the filing matures at release, so the net change is
    // minus two plus one for the author and for each creation-time guarantor of that later act.
    for id in [ACCUSED, ROSTER[0]] {
        assert_eq!(w.responsibility_units(id), units_before[id as usize] - 2 + 1);
    }
    assert_eq!(settlement.coefficient_after, COEF_ONE / 2, "the journal records this case's own penalty");
    assert_eq!(w.coefficient(ACCUSED), COEF_ONE / 2 + COEF_STEP, "the released out-of-scope maturity repairs integrity");
    assert!(w.accepted(ACCUSED), "the identity stays; only this case's effects apply");
    let outcome = w.case_outcome(case).unwrap();
    assert_eq!(outcome.debts, vec![(ROSTER[0], Amount::ONE), (ROSTER[1], Amount::ONE), (ROSTER[2], Amount::ONE), (ROSTER[3], Amount::ONE)]);
    assert!(!w.held(ACCUSER) && !w.held(ACCUSED), "the case reaches its authorized result and releases only its own holds");
    w.audit().unwrap();
}

#[test]
fn spent_target_backing_yields_no_invented_award_and_a_recorded_debt() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    // The accused spends the sole target right during the pending interval: the case must still reach an authorized result.
    w.convert_to_collector(ACCUSED, target).unwrap();
    w.burn_liquid(ACCUSED);
    assert_eq!(w.liquid(ACCUSED), Amount::ZERO);
    for g in ROSTER {
        assert_eq!(w.spendable(g), Amount::ONE, "the guarantors stay funded");
    }
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    let burned = w.burned();
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    // Unavailable affected value is not recovered from anyone else (transferred-value recovery stays OPEN).
    assert_eq!((settlement.accused_collected, settlement.accuser_award, settlement.unpaid_accused), (Amount::ZERO, Amount::ZERO, Amount::ONE));
    assert_eq!(w.liquid(ACCUSER), Amount::coins(2), "no award was added to the existing balance");
    assert_eq!(w.debt(ACCUSED), Amount::ONE, "the uncollected charge is this case's FIFO debt, not a burn");
    // The guarantor charges are independent of the accused's collection and still burn actual backing.
    assert_eq!((settlement.guarantor_burned, w.burned()), (Amount::coins(4), burned + Amount::coins(4)));
    assert_eq!(w.stats.self_id_unpaid, Amount::ONE);
    w.audit().unwrap();
}

#[test]
fn incomplete_guarantor_backing_records_that_guarantor_debt() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    let stripped = ROSTER[0];
    w.burn_liquid(stripped);
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    assert_eq!(settlement.guarantor_burned, Amount::coins(3), "only the funded guarantors' actual collection burns");
    assert_eq!(w.debt(stripped), Amount::ONE, "the unfunded guarantor owes its own charge as debt");
    assert_eq!(w.debt(ROSTER[1]), Amount::ZERO);
    assert_eq!(settlement.accused_collected, Amount::ONE, "an unfunded guarantor cannot block or top up the award");
    w.audit().unwrap();
}

#[test]
fn overlapping_open_case_keeps_its_own_custody_through_this_settlement() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    w.cfg.base_stake = Some(1);
    assert!(w.record_case_opening(&[ACCUSER, ACCUSED]).is_err());
    let other = w.begin_case(&[ACCUSER, 2]).unwrap();
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    assert!(w.held(ACCUSER) && w.held(ACCUSED));
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    assert_eq!(settlement.accused_collected, Amount::ONE, "the frozen scope right is not the other case's custody");
    assert!(w.held(ACCUSER) && w.held(2) && !w.held(ACCUSED), "the other case keeps its own restrictions");
    assert!(w.case_outcome(other).is_none(), "no penalty, settlement or restoration of the other case");
    w.settle_case(other, Some(facety_sim::chekharda::Side::Accused)).unwrap();
    assert!(!w.held(ACCUSER) && !w.held(ACCUSED), "only the other case's own holds end");
    assert_eq!(w.coefficient(ACCUSED), COEF_ONE / 2, "ending the other case does not undo this case's penalty");
    w.audit().unwrap();
}

#[test]
fn a_separate_liquid_stake_is_not_collected_for_a_self_id_sanction() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    w.cfg.base_stake = Some(1);
    w.convert_to_collector(ACCUSED, target).unwrap();
    let blocker = w.begin_case(&[ACCUSED, 4]).unwrap();
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    let plan = w.self_id_case_plan(case).unwrap();
    assert_eq!((plan.accused_collectible, plan.accused_unpaid), (Amount::ZERO, Amount::ONE));
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    assert_eq!((settlement.accused_collected, settlement.unpaid_accused), (Amount::ZERO, Amount::ONE));
    assert_eq!((w.liquid(ACCUSED), w.spendable(ACCUSED), w.debt(ACCUSED)), (Amount::ONE, Amount::ZERO, Amount::ONE));
    assert!(w.held(ACCUSED), "the independent case keeps its own restriction");
    w.settle_case(blocker, Some(facety_sim::chekharda::Side::Accuser)).unwrap();
    assert!(w.liquid(ACCUSED) >= Amount::ONE);
    w.audit().unwrap();
}

#[test]
fn key_recovery_interaction_stays_a_named_open_contract_boundary() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    w.lose_key(ACCUSED).unwrap();
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    let before = (projection(&w), ledger(&w));
    assert!(w.self_id_case_plan(case).is_err(), "a completed key recovery moves receipts under Q25-C1");
    assert_eq!(
        w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied),
        Err(facety_sim::world::Reject("a completed key recovery interacts with this case"))
    );
    assert_eq!((projection(&w), ledger(&w)), before);
    w.audit().unwrap();
}

#[test]
fn identity_verdict_and_role_penalty_apis_refuse_for_the_self_id_case() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    assert!(w.apply_case_identity_verdict_to(case, ACCUSED).is_err(), "no settled effects exist yet");
    assert!(w.apply_case_identity_verdict_to(case, ACCUSED).is_err());
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    assert!(w.apply_case_identity_verdict_to(case, ACCUSED).is_err(), "an identity chain cut is not a proxy for this correction");
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
fn pending_cancellation_uses_the_openers_roster_not_the_challenged_acts_roster() {
    let (mut w, target) = prepared();
    let filed = (projection(&w), ledger(&w));
    let case = record(&mut w, target);
    assert_eq!(w.spendable(ACCUSER), filed.0[ACCUSER as usize].1 - Amount::ONE, "the pending opening owns its frozen-N stake");
    let before = (projection(&w), ledger(&w));
    assert!(w.cancel_self_id_case_opening(case, ACCUSED).is_err());
    let opening = w.self_id_case(case).unwrap().clone();
    let source_only = ROSTER.into_iter().find(|g| !opening.author_guarantors.contains(g)).unwrap();
    assert!(w.cancel_self_id_case_opening(case, source_only).is_err());
    assert_eq!((projection(&w), ledger(&w)), before);
    let actor = opening.author_guarantors[0];
    w.cancel_self_id_case_opening(case, actor).unwrap();
    assert_eq!(w.self_id_case(case).unwrap().cancelled_by, Some(actor));
    assert_eq!(w.self_id_case(case).unwrap().stage, SelfIdCaseStage::Cancelled);
    assert_eq!((w.stats.self_id_openings_cancelled, w.stats.self_id_openings_activated), (1, 0));
    assert_eq!((projection(&w), ledger(&w)), filed, "a pending cancellation forfeits nothing and returns the whole reservation");
    w.tick(w.now() + 48);
    assert_eq!(w.self_id_case(case).unwrap().stage, SelfIdCaseStage::Cancelled, "a cancelled opening never activates");
    assert!(!w.held(ACCUSER) && !w.held(ACCUSED));
    assert!(w.cancel_self_id_case_opening(case, ACCUSER).is_err());
    w.audit().unwrap();
}

/// The original lifecycle-gap witness: ordinary permitted actions between recording and activation used to strand the
/// case. Under the frozen-scope contract the same trace reaches an authorized settlement and nothing is invented.
#[test]
fn defender_induced_pending_drift_reaches_an_authorized_settlement() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    let later = w.create_self_id(ACCUSED).unwrap();
    assert_ne!(later, target, "the drift act is an ordinary Self-ID, not a special operation");
    // A second ordinary disposition change inside the pending interval: the target right becomes collected value.
    w.convert_to_collector(ACCUSED, target).unwrap();
    activate(&mut w, case);
    // D195: the pending drift and the disposition change cannot touch this case's frozen exposure.
    assert_eq!(w.self_id_case(case).unwrap().frozen.unwrap().n, 1, "the endpoint was frozen at filing");
    w.tick(w.case_deadline(case).unwrap());
    let plan = w.self_id_case_plan(case).unwrap();
    assert_eq!((plan.accused_charge, plan.accused_collectible, plan.accused_unpaid), (Amount::ONE, Amount::ONE, Amount::ZERO));
    let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    // The converted target right is now collected value, so the selected soft backing still pays the accuser.
    assert_eq!((settlement.accused_collected, settlement.accuser_award, settlement.unpaid_accused), (Amount::ONE, Amount::ONE, Amount::ZERO));
    assert_eq!(w.debt(ACCUSED), Amount::ZERO, "the disposition change is collected, not turned into debt");
    assert_eq!(w.unspent_rights(ACCUSED), 1, "the drift act is outside this case's exposure");
    assert!(!w.held(ACCUSER) && !w.held(ACCUSED), "the case is no longer an implementation dead end");
    assert_eq!(w.spendable(ACCUSER), w.liquid(ACCUSER), "the accuser's own stake is released");
    // The case reaches its authorized result once, and no ordinary-case exit silently substitutes for it.
    assert_eq!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap(), settlement);
    assert!(w.settle_case(case, None).is_err());
    assert!(w.cancel_case_opening(case, ACCUSER).is_err());
    assert!(w.cancel_self_id_case_opening(case, ACCUSER).is_err());
    w.audit().unwrap();
}

/// A later Self-ID that depends on an invalidated predecessor needs its own filing; this case never grows to cover it.
#[test]
fn a_later_act_needs_its_own_case_and_never_reopens_this_exposure() {
    let (mut w, target) = prepared();
    let case = record(&mut w, target);
    let later = w.create_self_id(ACCUSED).unwrap();
    activate(&mut w, case);
    w.tick(w.case_deadline(case).unwrap());
    let first = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
    assert_eq!(first.frozen.n, 1, "the filing froze a one-act suffix");
    let units = w.responsibility_units(ACCUSED);
    let debt = w.debt(ACCUSED);

    // The later act keeps its own receipt and entitlement; correcting it is a separate accusation with its own scope.
    let receipt = w.transaction_provenance(TransactionTarget::SelfId(later)).unwrap().xp_receipt.unwrap();
    assert_eq!(receipt.credited_at, first.settled_at);
    assert!(!receipt.revoked);
    assert_eq!(w.self_id_case(case).unwrap().frozen.unwrap().n, 1, "no retroactive growth");
    assert_eq!((w.responsibility_units(ACCUSED), w.debt(ACCUSED)), (units, debt), "this case's money and units never change later");
    assert_eq!(w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap(), first, "replay keeps the frozen scope");

    // The later act is corrected only by its own filing: its own snapshot, charge and roster, and it leaves the first case untouched.
    let second = record(&mut w, later);
    assert_eq!(w.self_id_case(second).unwrap().frozen.unwrap(), facety_sim::world::FrozenCount { violating: 2, endpoint: 2, n: 1 });
    activate(&mut w, second);
    w.tick(w.case_deadline(second).unwrap());
    let follow = w.settle_self_id_case_fixture(second, TrustedMerits::UpheldSupplied).unwrap();
    assert_eq!((follow.accused_charge, follow.accused_collected), (Amount::ONE, Amount::ONE), "the later act has its own exposure");
    assert_eq!(w.self_id_settlement(case).unwrap(), &first, "the earlier case's journal never changes");
    assert_eq!(w.self_id_case(case).unwrap().frozen.unwrap().n, 1);
    w.audit().unwrap();
}

#[test]
fn frozen_count_and_journal_do_not_drift_with_batched_time() {
    fn settle(stepwise: bool) -> (facety_sim::world::FrozenCount, facety_sim::world::SelfIdSettlement) {
        let (mut w, target) = prepared();
        let case = record(&mut w, target);
        w.create_self_id(ACCUSED).unwrap();
        activate(&mut w, case);
        let deadline = w.case_deadline(case).unwrap();
        if stepwise {
            let mut at = w.now();
            while at + 24 < deadline {
                at += 24;
                w.tick(at);
            }
        }
        w.tick(deadline);
        let frozen = w.self_id_case(case).unwrap().frozen.unwrap();
        let settlement = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).unwrap();
        w.audit().unwrap();
        (frozen, settlement)
    }
    assert_eq!(settle(false), settle(true), "batched and stepwise time reach the same frozen count and journal");
}

#[test]
fn recording_refuses_a_role_conflict_before_any_restriction_exists() {
    let (mut w, target) = prepared();
    // A creation-time guarantor of the challenged Self-ID cannot open the case that would charge itself.
    let opener = ROSTER[0];
    assert!(w.xp(opener) > w.xp(ACCUSED), "the ordinary XP gate is the only other obstacle");
    let before = (projection(&w), ledger(&w));
    assert_eq!(
        w.record_self_id_case_fixture(opener, TransactionTarget::SelfId(target), supplied()),
        Err(facety_sim::world::Reject("the opener cannot be a creation-time guarantor of the challenged Self-ID"))
    );
    assert_eq!((projection(&w), ledger(&w)), before);
    assert_eq!(w.self_id_cases(), 0, "the refused case owns no record, hold or custody");
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
fn the_fixture_policy_identifiers_name_the_implemented_semantics() {
    // The contract page names these exact strings; a silent rename would otherwise let documentation drift from code.
    assert_eq!(
        facety_sim::world::SELF_ID_CASE_POLICY,
        "trusted-core-only/typed-self-id-target/filing-frozen-n/liquid-reserved-at-filing/prior-correction-exclusion/v6"
    );
    let (w, target) = prepared();
    let mut w = w;
    let case = record(&mut w, target);
    let doc = include_str!("../../docs/simulator.en.md");
    assert!(doc.contains(facety_sim::world::SELF_ID_CASE_POLICY), "the model contract must name the implemented fixture policy");
    assert_eq!(w.self_id_case(case).unwrap().frozen.unwrap().endpoint, 1);
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
