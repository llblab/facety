use super::*;

const B: usize = 15;
const LENGTH: usize = 32;
const PREMISES: TrustedAdmissionPremises = TrustedAdmissionPremises { admission: TrustedPremise::Supplied, historical_duty: TrustedPremise::Supplied };

fn input(author: Id, target: u32, nonce: u64) -> CorrectionInput<'static> {
    CorrectionInput { network: CORRECTION_NETWORK, version: CORRECTION_VERSION, author, target, nonce, authority: TrustedPremise::Supplied }
}

fn advance(w: &mut World, to: i64, incremental: bool) {
    if incremental {
        for hour in w.now() + 1..=to {
            w.tick(hour);
        }
    } else {
        w.tick(to);
    }
}

fn history(interval: i64, incremental: bool) -> (World, Vec<u32>) {
    let mut w = World::new(Config { base_stake: Some(7), ..Config::default() }, 6, &[(0, 1), (0, 2), (1, 2), (1, 3), (1, 4), (2, 4)]);
    let mut acts = Vec::new();
    for i in 0..LENGTH {
        let time = i as i64 * interval;
        advance(&mut w, time, incremental);
        w.create_self_id(1).unwrap();
        w.create_self_id(2).unwrap();
        acts.push(w.create_self_id(0).unwrap());
        advance(&mut w, time + DAY, incremental);
        if i == 7 || i == B {
            w.penalize_xp(0, 0.5);
        }
        if i == B {
            w.withdraw_valence(1, w.open_valence_of(1, 0).unwrap()).unwrap();
        }
    }
    w.audit().unwrap();
    (w, acts)
}

fn reject_unchanged(w: &mut World, command: CorrectionInput<'_>, message: &'static str) {
    let before = w.snapshot();
    assert_eq!(w.correct_own_self_id(command), Err(Reject(message)));
    assert_eq!(before, w.snapshot());
    w.audit().unwrap();
}

// Independent, chronological one-step rule. Removal before the second loss costs 500 millionths, not 1,000.
fn expected_integrity(skip_b: bool) -> u32 {
    let mut value: u32 = 1_000_000;
    for i in 0..LENGTH {
        if !skip_b || i != B {
            value = (value + 1_000).min(1_000_000);
        }
        if i == 7 || i == B {
            value /= 2;
        }
    }
    value
}

#[derive(Clone, Copy, Debug)]
enum Disposition {
    Unspent,
    Converted,
    Invitation,
    PreviouslyBurned,
}

#[test]
fn daily_and_monthly_gaps_preserve_timestamps_receipts_and_the_original_links_under_all_dispositions() {
    for interval in [DAY, 30 * DAY] {
        let (base, acts) = history(interval, false);
        let target = acts[B];
        let chronology = base.self_id_chronology(0).unwrap().collect::<Vec<_>>();
        let receipt = base.transaction_provenance(TransactionTarget::SelfId(target)).unwrap().xp_receipt.unwrap();
        assert_eq!(receipt.recipients, [0, 1, 2]);
        assert_eq!(base.mutual_partners(0), [2]);
        assert_eq!(base.coefficient(0), expected_integrity(false));
        assert!(base.has_valid_self_id_at(0, B as i64 * interval));
        for disposition in [Disposition::Unspent, Disposition::Converted, Disposition::Invitation, Disposition::PreviouslyBurned] {
            let mut w = base.clone();
            let invitation = match disposition {
                Disposition::Unspent => None,
                Disposition::Converted => {
                    w.convert_to_collector(0, target).unwrap();
                    None
                }
                Disposition::Invitation => Some(w.create_invitation(0, target).unwrap()),
                Disposition::PreviouslyBurned => {
                    w.convert_to_collector(0, target).unwrap();
                    assert_eq!(w.burn_liquid(0), Amount::ONE);
                    None
                }
            };
            let unspent = matches!(disposition, Disposition::Unspent);
            let needed = if unspent { Amount::ONE } else { Amount::coins(2) };
            if !unspent && w.liquid(0).is_zero() {
                w.convert_to_collector(0, acts[0]).unwrap();
            }
            assert_eq!(w.spendable(0), needed - Amount::ONE, "{disposition:?}");
            reject_unchanged(&mut w, input(0, target, 77), "insufficient spendable Collector funds for voluntary correction");
            w.convert_to_collector(0, acts[1]).unwrap();
            let before = (w.minted(), w.burned(), w.vault(), w.acts.len());
            let units: Vec<_> = (0..w.len() as Id).map(|id| w.responsibility_units(id)).collect();
            let journal = w.correct_own_self_id(input(0, target, 77)).unwrap();
            assert_eq!(w.self_id_correction(target), Some(&journal));
            assert_eq!(
                (journal.emission_burned, journal.restitution_burned, journal.fee_burned),
                (if unspent { Amount::ONE } else { Amount::ZERO }, needed - Amount::ONE, Amount::ONE)
            );
            assert_eq!(w.minted(), before.0);
            assert_eq!(w.burned() - before.1, Amount::coins(2));
            assert_eq!(w.vault(), before.2 - i64::from(unspent));
            assert_eq!(w.acts.len(), before.3);
            assert_eq!(w.spendable(0), Amount::ZERO);
            assert_eq!(w.debt(0), Amount::ZERO);
            assert!(!w.eligible_emissions(0, DAY).contains(&target));
            assert_eq!(w.self_id_history(0).unwrap(), acts);
            for (i, row) in w.self_id_chronology(0).unwrap().enumerate() {
                assert_eq!(row, SelfIdObservation { valid: i != B, ..chronology[i] });
                assert_eq!(row.recorded_at, i as i64 * interval);
            }
            let canonical = w.valid_self_ids(0).unwrap().collect::<Vec<_>>();
            assert_eq!(canonical, [&acts[..B], &acts[B + 1..]].concat());
            assert_eq!(canonical[B - 1..=B], [acts[B - 1], acts[B + 1]]);
            assert_eq!(w.self_id_predecessor(acts[B + 1]), Ok(Some(target)), "C's original reference still names B");
            assert_eq!(
                w.has_valid_self_id_at(0, B as i64 * interval),
                interval == DAY,
                "B cannot supply its own recording window; only the daily trace has another observation in it"
            );
            let after_receipt = w.transaction_provenance(TransactionTarget::SelfId(target)).unwrap().xp_receipt.unwrap();
            assert_eq!(after_receipt, XpReceipt { revoked: true, ..receipt });
            for (id, &original) in units.iter().enumerate() {
                assert_eq!(w.responsibility_units(id as Id), original - i32::from(receipt.recipients.contains(&(id as Id))));
            }
            assert_eq!(w.coefficient(0), expected_integrity(true));
            assert_eq!(expected_integrity(false) - expected_integrity(true), 500);
            assert_eq!(i64::from(w.xp(0)), i64::from(w.responsibility_units(0)) * i64::from(expected_integrity(true)) / 1_000_000);
            reject_unchanged(&mut w, input(0, target, 78), "the Self-ID was already voluntarily corrected");
            reject_unchanged(&mut w, input(0, acts[B + 1], 77), "correction nonce already used");
            if let Some(inv) = invitation {
                w.tick(w.now() + DAY);
                let invitee = w.accept_invitation(inv).unwrap();
                assert_eq!(w.inviter(invitee), Some(0));
                assert_eq!(w.transaction_provenance(TransactionTarget::Invitation(inv)).unwrap().funding_source, Some(TransactionTarget::SelfId(target)));
            }
            w.audit().unwrap();
        }
    }
}

#[test]
fn correcting_after_incremental_or_batched_maturity_processing_agrees() {
    for interval in [DAY, 30 * DAY] {
        let (mut batched, acts) = history(interval, false);
        let (mut incremental, other) = history(interval, true);
        assert_eq!(acts, other);
        for w in [&mut batched, &mut incremental] {
            w.convert_to_collector(0, acts[0]).unwrap();
            w.correct_own_self_id(input(0, acts[B], 1)).unwrap();
            w.audit().unwrap();
        }
        assert_eq!(batched.snapshot(), incremental.snapshot());
    }
}

#[test]
fn rejected_authority_and_preventive_cancellation_leave_the_paid_route_for_mature_acts_only() {
    let mut w = World::new(Config::default(), 4, &[(0, 1), (0, 2), (1, 2)]);
    let target = w.create_self_id(0).unwrap();
    let command = input(0, target, 1);
    for malformed in [
        CorrectionInput { authority: TrustedPremise::Missing, ..command },
        CorrectionInput { network: "elsewhere", ..command },
        CorrectionInput { version: 0, ..command },
    ] {
        reject_unchanged(&mut w, malformed, "missing authority or wrong correction scope");
    }
    reject_unchanged(&mut w, input(1, target, 1), "voluntary correction requires the Self-ID author");
    reject_unchanged(&mut w, input(0, u32::MAX, 1), "no such Self-ID transaction");
    let mut lost_key = w.clone();
    lost_key.lose_key(0).unwrap();
    reject_unchanged(&mut lost_key, command, "the private key is lost");
    w.tick(DAY - 1);
    reject_unchanged(&mut w, command, "voluntary correction requires an already matured Self-ID");
    let mut cancelled = w.clone();
    cancelled.cancel_self_id(0, target).unwrap();
    assert_eq!(cancelled.burned(), Amount::ONE);
    assert_eq!(cancelled.self_id_correction(target), None);
    assert_eq!(cancelled.self_id_chronology(0).unwrap().map(|r| r.valid).collect::<Vec<_>>(), [false]);
    let mut suspended = w.clone();
    suspended.begin_case(&[3, 0]).unwrap();
    suspended.tick(DAY + 1);
    assert!(suspended.maturity_hold(target).is_some());
    reject_unchanged(&mut suspended, command, "voluntary correction requires an already matured Self-ID");
    suspended.cancel_self_id(0, target).unwrap();
    assert_eq!(suspended.burned(), Amount::ONE);
    assert_eq!(suspended.self_id_correction(target), None);
    suspended.audit().unwrap();
    w.tick(DAY);
    assert_eq!(w.cancel_self_id(0, target), Err(Reject("the free cancellation window ended at maturity")));
    reject_unchanged(&mut w, command, "insufficient spendable Collector funds for voluntary correction");
    assert_eq!(w.create_self_id(0), Ok(1));
    w.tick(2 * DAY);
    w.convert_to_collector(0, 1).unwrap();
    w.correct_own_self_id(command).unwrap();
    w.audit().unwrap();
}

#[test]
fn a_prior_filing_controls_its_frozen_scope_and_cancellation_does_not_keep_priority() {
    let (mut w, acts) = history(DAY, false);
    let target = acts[B];
    w.convert_to_collector(0, acts[0]).unwrap();
    for _ in 0..LENGTH {
        let funding = w.create_self_id(4).unwrap();
        w.tick(w.now() + DAY);
        w.convert_to_collector(4, funding).unwrap();
    }
    let cmd = input(0, target, 1);
    let a = acts[B - 1];
    let frozen_n = (LENGTH - B + 1) as u32;
    let earlier = w.record_self_id_case_fixture(4, TransactionTarget::SelfId(a), PREMISES).unwrap();
    reject_unchanged(&mut w, cmd, "an earlier external proceeding controls this Self-ID or its backing");
    let mut activated = w.clone();
    activated.tick(activated.now() + DAY);
    reject_unchanged(&mut activated, cmd, "an earlier external proceeding controls this Self-ID or its backing");
    activated.tick(activated.case_deadline(earlier).unwrap());
    let settled = activated.settle_self_id_case_fixture(earlier, TrustedMerits::UpheldSupplied).unwrap();
    assert_eq!(settled.frozen.n, frozen_n);
    reject_unchanged(&mut activated, cmd, "an earlier external proceeding controls this Self-ID or its backing");
    w.cancel_self_id_case_opening(earlier, 4).unwrap();
    w.correct_own_self_id(cmd).unwrap();
    assert_eq!(w.self_id_case(earlier).unwrap().frozen.unwrap().n, frozen_n, "prior recorded scope was not recalculated");
    assert_eq!(w.record_self_id_case_fixture(4, TransactionTarget::SelfId(target), PREMISES), Err(Reject("the challenged Self-ID was already corrected")));
    let later = w.record_self_id_case_fixture(4, TransactionTarget::SelfId(a), PREMISES).unwrap();
    let case = w.self_id_case(later).unwrap();
    assert_eq!(case.frozen.unwrap().n, frozen_n - 1);
    assert!(!case.affected.contains(&target));
    w.tick(w.now() + DAY);
    w.tick(w.case_deadline(later).unwrap());
    let result = w.settle_self_id_case_fixture(later, TrustedMerits::UpheldSupplied).unwrap();
    assert!(!result.affected.contains(&target));
    w.restore_self_id_case_effects(later).unwrap();
    assert!(!w.valid_self_ids(0).unwrap().any(|id| id == target));
    w.audit().unwrap();
}

#[test]
fn independent_revocation_and_reserved_funds_survive_author_correction() {
    let (mut w, acts) = history(DAY, false);
    let target = acts[B];
    for &act in &acts[..7] {
        w.convert_to_collector(0, act).unwrap();
    }
    let case = w.begin_case(&[0, 3]).unwrap();
    for act in w.eligible_emissions(2, DAY).into_iter().take(7) {
        w.convert_to_collector(2, act).unwrap();
    }
    let other_case = w.begin_case(&[2, 5]).unwrap();
    assert_eq!(w.liquid(2) - w.spendable(2), Amount::coins(7));
    assert_eq!(w.liquid(0), Amount::coins(7));
    assert_eq!(w.spendable(0), Amount::ZERO);
    let cmd = input(0, target, 1);
    reject_unchanged(&mut w, cmd, "insufficient spendable Collector funds for voluntary correction");
    assert!(w.revoke_source_xp(target));
    let units = (0..w.len() as Id).map(|id| w.responsibility_units(id)).collect::<Vec<_>>();
    w.convert_to_collector(0, acts[7]).unwrap();
    let positions = w.case_positions(case);
    let other_positions = w.case_positions(other_case);
    let debt = w.debt(0);
    let others = (1..w.len() as Id).map(|id| w.liquid(id)).collect::<Vec<_>>();
    w.correct_own_self_id(cmd).unwrap();
    assert_eq!(w.case_positions(case), positions);
    assert_eq!(w.case_positions(other_case), other_positions);
    assert_eq!(w.liquid(2) - w.spendable(2), Amount::coins(7));
    assert_eq!(w.liquid(0), Amount::coins(7));
    assert_eq!(w.spendable(0), Amount::ZERO);
    assert_eq!(w.debt(0), debt);
    assert_eq!((1..w.len() as Id).map(|id| w.liquid(id)).collect::<Vec<_>>(), others);
    assert_eq!((0..w.len() as Id).map(|id| w.responsibility_units(id)).collect::<Vec<_>>(), units);
    assert_eq!(w.xp_revocations[&target], [RevocationCause::Independent, RevocationCause::VoluntaryCorrection]);
    w.audit().unwrap();
}
