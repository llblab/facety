//! End-to-end selected appeal mechanics through public World APIs. Admission/evidence and collective
//! authorization are supplied fixtures; no test purports to settle the open appeal financial contract.
use facety_sim::amount::Amount;
use facety_sim::chekharda::{CouncilOutcome, Side};
use facety_sim::world::{AppealExecution, AppealInitiator, AppealStage, AppealVote, Config, World, COEF_ONE, DAY};

fn world() -> World {
    let mut pairs = Vec::new();
    for id in 0..12 {
        for offset in [1, 2] {
            let other = (id + offset) % 12;
            let pair = (id.min(other), id.max(other));
            if !pairs.contains(&pair) {
                pairs.push(pair);
            }
        }
    }
    World::new(Config { base_stake: Some(7), ..Config::default() }, 12, &pairs)
}

fn closed_wrongful_case() -> (World, u32) {
    let mut w = world();
    for id in (0..12).filter(|&id| id != 5) {
        w.create_self_id(id).unwrap();
    }
    w.create_self_id(5).unwrap();
    w.tick(DAY);
    for _ in 0..4 {
        for id in 0..5 {
            w.create_self_id(id).unwrap();
        }
        w.tick(w.now() + DAY);
    }
    assert!(w.xp(0) > w.xp(5));
    let prior = w.record_case_opening(&[0, 5]).unwrap();
    w.tick(w.now() + DAY);
    w.tick(w.case_deadline(prior).unwrap());
    assert_eq!(w.settle_case(prior, None).unwrap().winner, Side::Accuser);
    w.apply_case_identity_verdict(prior).unwrap();
    assert!(!w.accepted(5));
    w.audit().unwrap();
    (w, prior)
}

fn opening(w: &mut World, prior: u32, initiator: AppealInitiator) -> u32 {
    let request = w.request_appeal(prior, 5).unwrap();
    let appeal = w.record_appeal_opening_fixture(request, initiator).unwrap();
    w.audit().unwrap();
    appeal
}

fn vote_and_close(w: &mut World, appeal: u32, choice: AppealVote) {
    let round = w.appeal(appeal).unwrap().active_round().unwrap().clone();
    let member = round.members[0];
    assert!(w.appeal_ballot(appeal, member, round.number, choice));
    w.tick(w.appeal(appeal).unwrap().deadline().unwrap());
    w.audit().unwrap();
}

#[test]
fn wrongful_sanction_request_pending_vote_and_precise_restoration_end_to_end() {
    let (mut w, prior) = closed_wrongful_case();
    let debt = w.debt(5);
    let minted = w.minted();
    let supply = w.supply();
    let burned = w.burned();
    let units = w.responsibility_units(5);
    let prior_history = w.case_outcome(prior).unwrap().clone();
    let other = w.begin_case(&[9, 2]).unwrap();
    let appeal = opening(&mut w, prior, AppealInitiator::Participant(2));
    let recorded = w.now();
    assert_eq!(w.appeal(appeal).unwrap().stage, AppealStage::Pending);
    assert!(!w.held(0));
    assert!(w.held(2), "the unrelated case predates the appeal");
    assert!(w.appeal(appeal).unwrap().deadline().is_none());
    assert!(w.resolve_appeal(appeal).is_err());
    assert!(!w.appeal_ballot(appeal, 0, 0, AppealVote::ReverseAndRestore));
    w.tick(recorded + DAY - 1);
    assert!(!w.held(0));
    w.tick(recorded + DAY);
    assert!(w.held(0) && w.held(2));
    assert_eq!(w.appeal(appeal).unwrap().deadline(), Some(recorded + 8 * DAY));
    assert_eq!(w.appeal(appeal).unwrap().active_round().unwrap().members, w.council());
    let financial_state = (w.stats.staked, w.stats.debt_created, w.burned(), w.debt(5));
    vote_and_close(&mut w, appeal, AppealVote::Defer);
    assert_eq!((w.stats.staked, w.stats.debt_created, w.burned(), w.debt(5)), financial_state);
    assert!(!w.accepted(5));
    assert!(w.resolve_appeal(appeal).is_err());
    vote_and_close(&mut w, appeal, AppealVote::ReverseAndRestore);
    assert!(!w.accepted(5), "recognition records authority; execution is a distinct operation");
    let executed = w.resolve_appeal(appeal).unwrap();
    let AppealExecution::Restored(outcome) = &executed else { panic!("restoration failed: {executed:?}") };
    assert!(outcome.status_restored);
    assert_eq!(outcome.responsibility_units, 5, "original author plus four creation-time guarantors");
    assert_eq!(outcome.debt_cancelled, w.stats.debt_cancelled);
    assert!(!debt.is_zero());
    assert!(w.debt(5).is_zero());
    assert_eq!(w.responsibility_units(5), units + 1);
    assert_eq!(w.coefficient(5), COEF_ONE);
    assert!(w.accepted(5));
    assert_eq!(w.case_outcome(prior).unwrap(), &prior_history, "reversal preserves the original decision and accounting history");
    assert!(w.held(2) && w.held(9), "the unrelated case owns its own holds");
    assert!(!w.held(0) && !w.held(5));
    assert_eq!((w.minted(), w.supply(), w.burned()), (minted, supply, burned), "no restored assets or catch-up issuance");
    assert!(w.create_self_id(2).is_err(), "other holds still bar activity");
    let stats = (w.stats.restorations, w.stats.units_restored, w.stats.debt_cancelled);
    assert_eq!(w.resolve_appeal(appeal).unwrap(), executed);
    assert_eq!((w.stats.restorations, w.stats.units_restored, w.stats.debt_cancelled), stats);
    assert!(w.cancel_case_opening(prior, 0).is_err());
    w.end_case(other);
    w.tick(w.now());
    let new_act = w.create_self_id(5).unwrap();
    assert!(!w.act_guarantors(new_act).is_empty());
    w.audit().unwrap();
}

#[test]
fn appeal_admission_checks_canonical_transaction_and_qualification_atomically() {
    let (mut w, prior) = closed_wrongful_case();
    assert!(w.request_appeal(u32::MAX, 5).is_err());
    assert!(w.request_appeal(prior, u32::MAX).is_err());
    assert!(w.request_appeal(prior, 11).is_err());
    let request = w.request_appeal(prior, 5).unwrap();
    for initiator in [0, 5, 11, u32::MAX] {
        assert!(w.record_appeal_opening_fixture(request, AppealInitiator::Participant(initiator)).is_err());
        assert!(w.appeal(0).is_none());
    }
    assert_eq!(w.record_appeal_opening_fixture(request, AppealInitiator::TrustedCollectiveCouncil).unwrap(), 0);
    let fixture = w.begin_case(&[8, 10]).unwrap();
    w.tick(w.case_deadline(fixture).unwrap());
    w.settle_case(fixture, None).unwrap();
    let fixture_request = w.request_appeal(fixture, 10).unwrap();
    assert!(w.record_appeal_opening_fixture(fixture_request, AppealInitiator::TrustedCollectiveCouncil).unwrap_err().0.contains("no recorded opening"));
    w.audit().unwrap();
}

#[test]
fn pre_maturity_cancellation_is_free_and_active_financial_scope_is_explicitly_blocked() {
    let (mut w, prior) = closed_wrongful_case();
    let cancelled = opening(&mut w, prior, AppealInitiator::Participant(2));
    let state = (w.supply(), w.stats.staked, w.stats.debt_created);
    assert!(w.cancel_appeal_opening(cancelled, 1).is_err());
    w.cancel_appeal_opening(cancelled, 2).unwrap();
    w.cancel_appeal_opening(cancelled, 2).unwrap();
    w.tick(w.now() + DAY);
    assert_eq!(w.appeal(cancelled).unwrap().stage, AppealStage::Cancelled);
    assert_eq!((w.supply(), w.stats.staked, w.stats.debt_created), state);
    assert!(!w.held(0) && !w.held(2));
    let active = opening(&mut w, prior, AppealInitiator::Participant(2));
    w.tick(w.now() + DAY);
    let record = w.appeal(active).unwrap().clone();
    assert!(w.cancel_appeal_opening(active, 2).unwrap_err().0.contains("financial scope"));
    assert_eq!(w.appeal(active).unwrap(), &record);
    vote_and_close(&mut w, active, AppealVote::ConfirmPriorVerdict);
    assert!(w.cancel_appeal_opening(active, 2).is_err());
    let state = (w.xp(5), w.debt(5), w.supply(), w.stats.restorations);
    assert_eq!(w.resolve_appeal(active), Ok(AppealExecution::Confirmed));
    assert_eq!((w.xp(5), w.debt(5), w.supply(), w.stats.restorations), state);
    assert!(!w.accepted(5));
    w.audit().unwrap();
}

#[test]
fn round_snapshots_cutoffs_and_ballot_replays_preserve_all_timely_choices() {
    let (mut w, prior) = closed_wrongful_case();
    let appeal = opening(&mut w, prior, AppealInitiator::TrustedCollectiveCouncil);
    w.tick(w.now() + DAY);
    let members = w.appeal(appeal).unwrap().active_round().unwrap().members.clone();
    assert_eq!(members.len(), 3);
    let deadline = w.appeal(appeal).unwrap().deadline().unwrap();
    assert!(!w.appeal_ballot(appeal, 11, 0, AppealVote::ReverseAndRestore));
    assert!(w.appeal_ballot(appeal, members[0], 0, AppealVote::ReverseAndRestore));
    assert!(!w.appeal_ballot(appeal, members[0], 0, AppealVote::ConfirmPriorVerdict));
    w.tick(deadline - 1);
    assert_eq!(w.appeal(appeal).unwrap().stage, AppealStage::Active);
    assert!(w.appeal_ballot(appeal, members[1], 0, AppealVote::ConfirmPriorVerdict));
    assert!(w.appeal_ballot(appeal, members[2], 0, AppealVote::Defer));
    w.tick(deadline);
    let record = w.appeal(appeal).unwrap().clone();
    assert_eq!(record.rounds[0].outcome, CouncilOutcome::AutomaticDefer);
    assert_eq!(record.deadline(), Some(deadline + 7 * DAY));
    assert_eq!(record.active_round().unwrap().members, w.council());
    assert!(record.active_ballots.is_empty());
    assert!(!w.appeal_ballot(appeal, members[0], 0, AppealVote::ReverseAndRestore));
    w.tick(deadline);
    assert_eq!(w.appeal(appeal).unwrap(), &record, "replaying a cutoff adds no interval");
    vote_and_close(&mut w, appeal, AppealVote::ConfirmPriorVerdict);
    let deadline = w.appeal(appeal).unwrap().deadline().unwrap();
    assert_eq!(w.now(), deadline);
    assert!(!w.appeal_ballot(appeal, members[0], 1, AppealVote::ReverseAndRestore));
    w.resolve_appeal(appeal).unwrap();
    w.audit().unwrap();
}

#[test]
fn concurrent_reversals_restore_once_and_later_confirmation_does_not_reapply_loss() {
    let (mut w, prior) = closed_wrongful_case();
    let appeals: Vec<_> = (0..3).map(|_| opening(&mut w, prior, AppealInitiator::TrustedCollectiveCouncil)).collect();
    w.tick(w.now() + DAY);
    for (index, &appeal) in appeals.iter().enumerate() {
        let member = w.appeal(appeal).unwrap().active_round().unwrap().members[0];
        assert!(w.appeal_ballot(appeal, member, 0, if index == 2 { AppealVote::ConfirmPriorVerdict } else { AppealVote::ReverseAndRestore }));
    }
    w.tick(w.appeal(appeals[0]).unwrap().deadline().unwrap());
    assert!(matches!(w.resolve_appeal(appeals[0]), Ok(AppealExecution::Restored(_))));
    let state = (w.responsibility_units(5), w.coefficient(5), w.stats.restorations, w.supply());
    assert_eq!(w.resolve_appeal(appeals[1]), Ok(AppealExecution::AlreadyRestored));
    assert_eq!(w.resolve_appeal(appeals[2]), Ok(AppealExecution::Confirmed));
    assert_eq!((w.responsibility_units(5), w.coefficient(5), w.stats.restorations, w.supply()), state);
    assert!(w.accepted(5));
    w.audit().unwrap();
}

#[test]
fn batched_time_equals_incremental_rounds_and_recording_has_no_new_revalidation_gate() {
    let (mut w, prior) = closed_wrongful_case();
    let appeal = opening(&mut w, prior, AppealInitiator::Participant(2));
    let request_council = w.council().to_vec();
    w.penalize_xp(2, 1.0);
    w.invalidate_identity(2);
    let start = w.now();
    let mut stepped = w.clone();
    w.tick(start + 24 * DAY);
    for hour in start + 1..=start + 24 * DAY {
        stepped.tick(hour);
    }
    assert_eq!(w.appeal(appeal), stepped.appeal(appeal));
    let record = w.appeal(appeal).unwrap();
    assert_eq!(record.activated_at, Some(start + DAY));
    assert_eq!(record.rounds.len(), 3);
    assert_ne!(record.electorates[0].members, request_council, "electorate taken at activation after the membership change");
    assert!(!record.electorates[0].members.contains(&2));
    assert!(w.held(2), "accepted recording activates without a new eligibility veto");
    w.audit().unwrap();
    stepped.audit().unwrap();
}

#[test]
fn fee_free_link_repair_preserves_unrelated_debt_restrictions_at_both_endpoints() {
    let (w, _) = closed_wrongful_case();
    assert!(w.debt(6) > Amount::ZERO);
    for (a, b) in [(6, 1), (1, 6)] {
        let mut trial = w.clone();
        let before = (trial.used_slots_of(a), trial.used_slots_of(b), trial.burned(), trial.graph().edge_count());
        assert!(trial.restore_link(a, b).is_err());
        assert_eq!((trial.used_slots_of(a), trial.used_slots_of(b), trial.burned(), trial.graph().edge_count()), before);
        trial.audit().unwrap();
    }
}
