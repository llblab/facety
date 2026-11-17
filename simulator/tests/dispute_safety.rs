//! The bounded dispute-safety package's discriminating probes (Q26 preparation).
//!
//! These are small deterministic references over the already selected behavior, not research runs, not a scenario
//! matrix and not a verdict about an attack. They measure *recorded* consequences (actual collection, burns, created
//! debt, imposed restriction hours) so a nominal claim is never reported as a realized cost.
use facety_sim::amount::Amount;
use facety_sim::chekharda::Side;
use facety_sim::world::{Config, Id, TransactionTarget, TrustedAdmissionPremises, TrustedMerits, TrustedPremise, World, DAY};

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
    World::new(Config { base_stake: Some(7), ..Config::default() }, 12, &ring(12))
}

/// `own` one-per-day Self-IDs (matured), then `liquid` Collector conversions. Returns the created act IDs.
fn build(w: &mut World, id: Id, own: usize, liquid: usize) -> Vec<u32> {
    let mut acts = Vec::with_capacity(own);
    for _ in 0..own {
        acts.push(w.create_self_id(id).unwrap());
        w.tick(w.now() + DAY);
    }
    for _ in 0..liquid {
        let act = w.eligible_emission(id).unwrap();
        w.convert_to_collector(id, act).unwrap();
    }
    acts
}

#[test]
fn accusation_pricing_probe_separates_rejected_pending_active_and_merits_loss() {
    // ---------------- a rejected attempt changes nothing ----------------
    let mut w = world();
    build(&mut w, 0, 1, 0); // the challenged owner: one matured act
    build(&mut w, 6, 1, 0); // a non-partner with equal XP: below the ordinary gate
    let before = (w.liquid(6), w.debt(6), w.held(0), w.held(6), w.stats.refused_xp);
    assert!(w.record_case_opening(&[6, 0]).is_err(), "equal XP is below the ordinary gate");
    assert_eq!((w.liquid(6), w.debt(6), w.held(0), w.held(6)), (before.0, before.1, before.2, before.3));
    println!("rejected attempt: realized cost 0 FCTY, restrictions imposed 0 h, own restriction 0 h, XP-gate refusals {}", w.stats.refused_xp - before.4);

    // ---------------- a pending filing and its free withdrawal ----------------
    build(&mut w, 6, 1, 0); // now 2 XP > 1 XP, still without cross guarantee credit
    let pending = w.record_case_opening(&[6, 0]).unwrap();
    assert!(!w.held(0) && !w.held(6), "a pending filing restricts nobody");
    let before = (w.liquid(6), w.debt(6), w.supply());
    w.cancel_case_opening(pending, 6).unwrap();
    assert_eq!((w.liquid(6), w.debt(6), w.supply()), before, "a pending withdrawal forfeits nothing");
    println!("pending filing then withdrawal: realized cost 0 FCTY, restrictions imposed 0 h, own restriction 0 h");

    // ---------------- an active case, then author cancellation ----------------
    // The accuser holds exactly its actual two coins; the nominal stake is 7 FCTY.
    let mut w = world();
    build(&mut w, 0, 1, 0);
    build(&mut w, 6, 2, 2); // the accuser, funded with exactly its two actual coins
    build(&mut w, 3, 3, 0); // an ordinary defender above the accuser in XP, not a partner of the accuser
    assert!(w.xp(6) > w.xp(0) && w.xp(3) > w.xp(6));
    let case = w.record_case_opening(&[6, 0]).unwrap();
    w.tick(w.case_opening(case).unwrap().matures_at);
    w.join_case(case, 3).unwrap();
    w.tick(w.now() + 2 * DAY);
    let (accuser_restricted, accused_restricted) = (w.held(6), w.held(0));
    let (liquid, defender_liquid, burned) = (w.liquid(6), w.liquid(3), w.burned());
    let out = w.cancel_case_opening(case, 6).unwrap();
    let realized = liquid - w.liquid(6);
    println!(
        "active case, then author cancellation: nominal stake 7 FCTY, actual collection {} FCTY, realized outflow {} FCTY, created debt {} FCTY, defender received {} FCTY, burned {} FCTY, own restriction {}, other-side restriction {}",
        out.collected,
        realized,
        out.debt_created,
        w.liquid(3) - defender_liquid,
        w.burned() - burned,
        accuser_restricted,
        accused_restricted
    );
    assert_eq!(realized, out.collected, "only actually collected value leaves the author");
    assert_eq!(out.debt_created, Amount::coins(7) - out.collected, "the nominal remainder is debt, not a realized loss");
    assert!(accuser_restricted && accused_restricted, "the restriction is real on both sides while the case is open");

    // ---------------- a merits loss ----------------
    let mut w = world();
    build(&mut w, 0, 2, 0);
    build(&mut w, 2, 1, 1);
    assert!(w.xp(0) > w.xp(2));
    let case = w.record_case_opening(&[0, 2]).unwrap();
    w.tick(w.case_opening(case).unwrap().matures_at);
    let (liquid, rights, burned, debt) = (w.liquid(0), w.unspent_rights(0), w.burned(), w.debt(0));
    w.tick(w.case_deadline(case).unwrap());
    let outcome = w.settle_case(case, Some(Side::Accused)).unwrap();
    let collected = Amount::coins((rights - w.unspent_rights(0)) as u64) + (liquid - w.liquid(0));
    println!(
        "merits loss: forced winner {:?}, actual collection {} FCTY, burned {} FCTY, created debt {} FCTY, coefficient {} millionths",
        outcome.winner,
        collected,
        w.burned() - burned,
        w.debt(0) - debt,
        w.coefficient(0)
    );
    assert_eq!(outcome.forced_winner, Some(Side::Accused));
    assert_eq!(w.debt(0), debt + Amount::coins(7) - collected, "uncollected stake is debt, not collection");
    assert_eq!(w.burned() - burned, collected, "with no ordinary recipient above it, the collected stake burns");
    w.audit().unwrap();
}

#[test]
fn strategic_filing_delay_probe_separates_nominal_count_from_actual_recovery() {
    // The accused (0) and the accuser (6) are not mutual partners, so neither earns the other's guarantee credit.
    fn frozen_for(delay: usize) -> (u32, Amount, Amount, bool) {
        let mut w = World::new(Config { base_stake: Some(7), ..Config::default() }, 12, &ring(12));
        // The two original guarantors are active and independently funded before the challenged act exists.
        build(&mut w, 1, 1, 1);
        build(&mut w, 2, 1, 1);
        let target = build(&mut w, 0, 1, 0)[0];
        build(&mut w, 6, delay + 4, 0); // the accuser keeps an XP lead
                                        // The accused extends its own chain one mature act per day before the filing.
        for _ in 0..delay {
            w.create_self_id(0).unwrap();
            w.tick(w.now() + DAY);
        }
        assert!(w.xp(6) > w.xp(0), "the filing stays admissible at this filing day");
        let case = w
            .record_self_id_case_fixture(
                6,
                TransactionTarget::SelfId(target),
                TrustedAdmissionPremises { admission: TrustedPremise::Supplied, historical_duty: TrustedPremise::Supplied },
            )
            .unwrap();
        let at = w.self_id_case(case).unwrap().matures_at;
        w.tick(at);
        let frozen = w.self_id_case(case).unwrap().frozen.unwrap();
        let nominal = Amount::coins(u64::from(frozen.n));
        let collectible = w.liquid(0) + Amount::coins(w.unspent_rights(0) as u64);
        w.tick(w.case_deadline(case).unwrap());
        let executable = w.settle_self_id_case_fixture(case, TrustedMerits::UpheldSupplied).is_ok();
        assert_eq!(executable, frozen.n == 1, "only the isolated one-act suffix is executable in this fixture");
        (frozen.n, nominal, collectible, executable)
    }
    let early = frozen_for(0);
    let late = frozen_for(5);
    println!("filed at once: frozen N = {}, nominal charge {} FCTY, potential accused backing {} FCTY, executable {}", early.0, early.1, early.2, early.3);
    println!("filed five days later: frozen N = {}, nominal charge {} FCTY, potential accused backing {} FCTY, executable {}", late.0, late.1, late.2, late.3);
    // A later filing freezes the longer inclusive suffix; the nominal claim grows with the accumulated chain.
    assert!(late.0 >= early.0 + 5, "later filing freezes a longer inclusive suffix");
    assert!(late.1 > early.1);
    // The accused's own emission also grows with its chain, but that is potential backing, not realized recovery.
    assert_eq!(early.2, Amount::ONE);
    assert!(late.2 > early.2);
    // Within the approved subset only N = 1 executes, so a larger nominal claim recovers no more today.
    assert!(early.3 && !late.3);
    println!("under D192's isolated witness the executable recovery is the target's 1 FCTY; a larger N is nominal plus debt");
}
