//! Finite deterministic transition witnesses for the evidence-core closure.
//! These are scripted, uncalibrated scenarios, not human behavior or attack probabilities.
use facety_sim::chekharda::Side;
use facety_sim::json;
use facety_sim::world::{CaseOutcome, Config, Id, World, COEF_ONE, DAY};
use std::collections::HashSet;

const N: Id = 64;
const CHALLENGER: Id = 16;
const ACCUSED: Id = 50;
const DEFENDER: Id = 1;
const OBSERVER: Id = 63;

/// Pre-guaranteed ring plus deterministic chords supplies different earned responsibility totals.
/// All value and XP then comes from actual Self-IDs. No graph mutation or synthetic account credit is used.
fn prepared(own_days: u32, second_empty: bool) -> World {
    prepare(own_days, second_empty, false, 32)
}

fn prepare(own_days: u32, second_empty: bool, empty_prefix: bool, accused_days: u32) -> World {
    let mut pairs = HashSet::new();
    for i in 0..N {
        for off in [1, 2] {
            let j = (i + off) % N;
            pairs.insert((i.min(j), i.max(j)));
        }
        for j in i + 1..N {
            if i + j < N {
                pairs.insert((i, j));
            }
        }
    }
    let mut pairs: Vec<_> = pairs.into_iter().collect();
    pairs.sort_unstable();
    let mut w = World::new(Config { layered: true, base_stake: Some(7), ..Config::default() }, N as usize, &pairs);
    for day in 0..32 {
        for id in 0..N {
            let emits = if empty_prefix { id >= 25 } else { (id != CHALLENGER || day >= 32 - own_days) && !(second_empty && id == 18) };
            if emits && (id != ACCUSED || day >= 32 - accused_days) {
                w.create_self_id(id).expect("prepared genesis can emit");
            }
        }
        w.tick(w.now() + DAY);
        withdraw(&mut w);
    }
    assert!(w.xp(CHALLENGER) > w.xp(ACCUSED));
    assert!(w.xp(DEFENDER) > w.xp(CHALLENGER));
    assert_eq!(w.liquid(CHALLENGER), if empty_prefix { 0 } else { own_days });
    w.audit().unwrap();
    w
}

fn withdraw(w: &mut World) {
    for id in 0..N {
        for a in w.eligible_emissions(id, DAY) {
            let _ = w.convert_to_collector(id, a);
        }
    }
}

fn account(w: &World, id: Id) -> String {
    format!(
        "{{\"id\":{id},\"liquid\":{},\"unspent\":{},\"debt\":{},\"debtRepaid\":{},\"units\":{},\"coefficient\":{},\"xp\":{},\"held\":{}}}",
        w.liquid(id),
        w.unspent_rights(id),
        w.debt(id),
        w.debt_repaid(id),
        w.responsibility_units(id),
        w.coefficient(id),
        w.xp(id),
        w.held(id)
    )
}

fn holds(outcomes: &[CaseOutcome]) -> String {
    let parts: Vec<_> = outcomes.iter().flat_map(|o| &o.holds).map(|(id, hours)| format!("{{\"id\":{id},\"hours\":{hours}}}")).collect();
    format!("[{}]", parts.join(","))
}

fn reward(backing: u32) {
    let mut w = prepared(backing, false);
    let start = w.now();
    let before = w.liquid(DEFENDER);
    let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    assert!(w.xp(DEFENDER) > w.case_state(case).unwrap().1);
    w.join_case(case, DEFENDER).unwrap();
    let nominal = w.case_positions(case)[0].stake;
    let own_stake = w.case_positions(case)[1].stake;
    w.tick(w.case_deadline(case).unwrap());
    let out = w.settle_case(case, None).unwrap();
    assert_eq!(out.winner, Side::Accused);
    let received = w.liquid(DEFENDER) - before;
    assert_eq!(received, backing);
    w.audit().unwrap();
    println!(
        "{{\"witness\":\"defender-reward\",\"backing\":{backing},\"nominalReward\":{nominal},\"actualReward\":{received},\"ownStakeReleased\":{own_stake},\"durationHours\":{},\"debtCreated\":{},\"holds\":{},\"challenger\":{},\"defender\":{}}}",
        w.now() - start, w.stats.debt_created, holds(&[out]), account(&w, CHALLENGER), account(&w, DEFENDER)
    );
}

fn recovery(continues: bool) {
    let mut w = prepared(0, false);
    let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    let mut held_days = 0;
    let mut debt_days = 0;
    let mut own_acts = 0;
    let mut suppressed_units = 0;
    let mut outsider_acts = 0;
    let mut solvent_day = None;
    let mut restored_day = None;
    let mut outcomes = Vec::new();
    for elapsed in 0..800 {
        held_days += u32::from(w.held(CHALLENGER));
        debt_days += u32::from(w.debt(CHALLENGER) > 0);
        let mut own_created = false;
        for id in 0..N {
            if id == CHALLENGER && !continues {
                continue;
            }
            let emitted = w.create_self_id(id).is_ok();
            if id == CHALLENGER && emitted {
                own_created = true;
                own_acts += 1;
            }
            outsider_acts += u32::from(id == OBSERVER && emitted);
        }
        suppressed_units += u32::from(own_created && w.debt(CHALLENGER) > 0);
        w.tick(w.now() + DAY);
        if elapsed == 6 {
            // The accepted proof is the declared D136 external-evidence abstraction, not guaranteed human truth.
            outcomes.push(w.settle_case(case, Some(Side::Accused)).unwrap());
            assert_eq!(w.debt(CHALLENGER), 7);
            assert_eq!(w.coefficient(CHALLENGER), COEF_ONE / 2);
        }
        if elapsed >= 6 && solvent_day.is_none() && w.debt(CHALLENGER) == 0 {
            solvent_day = Some(elapsed + 1);
        }
        if elapsed >= 6 && restored_day.is_none() && w.coefficient(CHALLENGER) == COEF_ONE {
            restored_day = Some(elapsed + 1);
        }
        withdraw(&mut w);
    }
    w.audit().unwrap();
    assert_eq!(held_days, 7);
    if continues {
        assert_eq!(w.debt(CHALLENGER), 0);
        assert_eq!(w.coefficient(CHALLENGER), COEF_ONE);
    } else {
        assert_eq!(w.debt(CHALLENGER), 7);
        assert_eq!(w.coefficient(CHALLENGER), COEF_ONE / 2);
    }
    let opt = |v: Option<u32>| v.map_or("null".into(), |n| n.to_string());
    println!(
        "{{\"witness\":\"lost-accusation-recovery\",\"continues\":{continues},\"horizonDays\":800,\"caseLossCollected\":{},\"debtCreated\":{},\"debtRepaid\":{},\"outstandingDebt\":{},\"restrictionDays\":{held_days},\"blockedDailyEmissionCapacity\":{held_days},\"debtRestrictedDays\":{debt_days},\"ownActs\":{own_acts},\"ownActsWithoutNewUnits\":{suppressed_units},\"usableEmissionForgoneToDebt\":{},\"solventDayFromOpening\":{},\"integrityRestoredDayFromOpening\":{},\"outsiderActs\":{outsider_acts},\"holds\":{},\"account\":{}}}",
        w.stats.stake_burned, w.stats.debt_created, w.debt_repaid(CHALLENGER), w.debt(CHALLENGER), w.debt_repaid(CHALLENGER), opt(solvent_day), opt(restored_day), holds(&outcomes), account(&w, CHALLENGER)
    );
}

fn accused_recovery() {
    let mut w = prepare(0, false, false, 3);
    let case = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    let before = account(&w, ACCUSED);
    let mut outcome = None;
    let mut restriction_days = 0;
    let mut unavailable_days = 0;
    let mut own_acts = 0;
    let mut outsider_acts = 0;
    let mut solvent_day = None;
    let mut invitation_day = None;
    let mut restored_day = None;
    for elapsed in 0..800u32 {
        restriction_days += u32::from(w.held(ACCUSED));
        unavailable_days += u32::from(w.held(ACCUSED) || !w.accepted(ACCUSED));
        for id in 0..N {
            let emitted = w.create_self_id(id).is_ok();
            own_acts += u32::from(id == ACCUSED && emitted);
            outsider_acts += u32::from(id == OBSERVER && emitted);
        }
        w.tick(w.now() + DAY);
        if elapsed == 6 {
            outcome = Some(w.settle_case(case, None).unwrap());
            assert_eq!(w.coefficient(ACCUSED), COEF_ONE / 2, "the wrongly losing owner receives its selected coefficient penalty once");
            w.invalidate_identity(ACCUSED);
            w.void_chain(ACCUSED);
        }
        if elapsed == 13 {
            // A declared successful appeal, seven days after a mistaken identity verdict.
            assert!(w.reinstate_identity(ACCUSED));
        }
        if elapsed >= 6 && w.debt(ACCUSED) == 0 && solvent_day.is_none() {
            solvent_day = Some(elapsed + 1);
        }
        if elapsed >= 6 && restored_day.is_none() && w.coefficient(ACCUSED) == COEF_ONE {
            restored_day = Some(elapsed + 1);
        }
        if elapsed >= 13 && invitation_day.is_none() {
            if let Some(right) = w.eligible_emission(ACCUSED) {
                let mut probe = w.clone();
                if probe.create_invitation(ACCUSED, right).is_ok() {
                    probe.audit().unwrap();
                    invitation_day = Some(elapsed + 1);
                }
            }
        }
        withdraw(&mut w);
    }
    w.audit().unwrap();
    assert_eq!(restriction_days, 7);
    assert_eq!(unavailable_days, 14);
    assert_eq!(w.debt(ACCUSED), 0);
    assert_eq!(w.coefficient(ACCUSED), COEF_ONE);
    assert!(restored_day.is_some());
    let opt = |v: Option<u32>| v.map_or("null".into(), |n| n.to_string());
    println!(
        "{{\"witness\":\"wrongly-lost-accused-recovery\",\"horizonDays\":800,\"appealAcceptedDay\":14,\"restrictionDays\":{restriction_days},\"identityUnavailableOrHeldDays\":{unavailable_days},\"blockedDailyEmissionCapacity\":{unavailable_days},\"ownActs\":{own_acts},\"postLossCoefficient\":{},\"integrityRestoredDayFromOpening\":{},\"accusedSanctionCollected\":{},\"guarantorSanctionsBurned\":{},\"totalDebtCreated\":{},\"accusedDebtRepaid\":{},\"accusedOutstandingDebt\":{},\"solventDay\":{},\"invitationActuallyAdmissibleDay\":{},\"outsiderActs\":{outsider_acts},\"before\":{before},\"after\":{},\"holds\":{}}}",
        COEF_ONE / 2, opt(restored_day), w.stats.sanction_collected, w.stats.sanction_burned, w.stats.debt_created, w.debt_repaid(ACCUSED), w.debt(ACCUSED), opt(solvent_day), opt(invitation_day), account(&w, ACCUSED), holds(&[outcome.unwrap()])
    );
}

/// Ordinary life continues on whole-day boundaries; entry and settlement clocks retain whole-hour resolution.
fn advance(w: &mut World, until: i64, outsider: Id, outsider_acts: &mut u32) {
    advance_with_abstention(w, until, outsider, outsider_acts, &HashSet::new());
}

fn advance_with_abstention(w: &mut World, until: i64, outsider: Id, outsider_acts: &mut u32, abstain: &HashSet<Id>) {
    assert!(until >= w.now());
    while w.now() < until {
        let next = ((w.now() / DAY + 1) * DAY).min(until);
        w.tick(next);
        if next % DAY == 0 {
            for id in 0..N {
                if abstain.contains(&id) {
                    continue;
                }
                let emitted = w.create_self_id(id).is_ok();
                *outsider_acts += u32::from(id == outsider && emitted);
            }
            withdraw(w);
        }
    }
}

fn chain(rapid: bool, council_day: Option<i64>, unbacked: bool) {
    let mut w = if unbacked { prepare(0, false, true, 32) } else { prepared(32, false) };
    let start = w.now();
    let mut ranked: Vec<_> = (0..N).filter(|id| !unbacked || *id < 25).collect();
    ranked.sort_by_key(|&id| (w.xp(id), id));
    ranked.dedup_by_key(|id| w.xp(*id));
    assert!(ranked.len() >= if unbacked { 21 } else { 24 }, "the preparation must supply 21 distinct increasing procedural ranks");
    let accused = if unbacked { (25..N).min_by_key(|&id| (w.xp(id), id)).unwrap() } else { ranked[0] };
    let candidates = if unbacked { &ranked[..21] } else { &ranked[1..22] };
    let coalition: HashSet<_> = candidates.iter().copied().collect();
    let abstain: HashSet<_> = if unbacked { (0..25).collect() } else { HashSet::new() };
    let outsider = (0..N).find(|id| *id != accused && !coalition.contains(id) && !abstain.contains(id) && !w.council().contains(id)).unwrap();
    assert!(w.xp(candidates[0]) > w.xp(accused));
    let case = w.begin_case(&[candidates[0], accused]).unwrap();
    let mut outsider_acts = 0;
    let mut attention_at = None;
    for &who in &candidates[1..] {
        let join_at = if rapid { start } else { w.case_deadline(case).unwrap() - 1 };
        if let Some(day) = council_day {
            let attention = start + day * DAY;
            if w.case_state(case).unwrap().0 >= 2 && attention <= join_at {
                let hour = attention.max(w.now());
                advance_with_abstention(&mut w, hour, outsider, &mut outsider_acts, &abstain);
                attention_at = Some(w.now() - start);
                break;
            }
        }
        advance_with_abstention(&mut w, join_at, outsider, &mut outsider_acts, &abstain);
        assert!(w.xp(who) > w.case_state(case).unwrap().1, "a willingness script still needs actual XP eligibility");
        w.join_case(case, who).unwrap();
        if council_day == Some(0) {
            attention_at = Some(w.now() - start);
            break;
        }
    }
    if attention_at.is_some() {
        let member = w.council().iter().copied().find(|&id| id != accused && !coalition.contains(&id)).expect("an available Council member");
        w.council_join(case, member).unwrap();
        for id in w.council().to_vec() {
            w.council_ballot(case, id, true);
        }
    }
    let positions = w.case_positions(case);
    let actual_members: HashSet<_> = positions.iter().filter(|p| p.kind == facety_sim::chekharda::Kind::Participant).map(|p| p.who).collect();
    let stake_total: u64 = positions.iter().map(|p| u64::from(p.stake)).sum();
    let last_stake = positions.last().unwrap().stake;
    let timeline: Vec<_> = positions
        .iter()
        .map(|p| {
            format!(
                "{{\"id\":{},\"n\":{},\"xpAtEntry\":{},\"joinedHour\":{},\"deadlineHour\":{},\"stake\":{}}}",
                p.who,
                p.n,
                p.xp,
                p.joined_at - start,
                p.after - start,
                p.stake
            )
        })
        .collect();
    let deadline = w.case_deadline(case).unwrap();
    advance_with_abstention(&mut w, deadline, outsider, &mut outsider_acts, &abstain);
    let out = w.settle_case(case, None).unwrap();
    let expense: i64 = -out.net.iter().filter(|(id, _)| actual_members.contains(id)).map(|(_, amount)| amount).sum::<i64>();
    let coalition_debt: i64 = actual_members.iter().map(|&id| w.debt(id)).sum();
    w.audit().unwrap();
    let attention = attention_at.map_or("null".into(), |h| h.to_string());
    println!(
        "{{\"witness\":\"dispute-chain\",\"rapid\":{rapid},\"unbackedGuarantors\":{unbacked},\"councilScheduledDay\":{},\"councilActualHour\":{attention},\"durationHours\":{},\"positions\":{},\"nominalStakeTotal\":{stake_total},\"lastNominalStake\":{last_stake},\"collectedForfeits\":{},\"collectedStakeBurn\":{},\"sanctionCollected\":{},\"sanctionBurned\":{},\"coalitionNetExpense\":{expense},\"coalitionOutstandingDebt\":{coalition_debt},\"totalDebtCreated\":{},\"outsider\":{outsider},\"outsiderActs\":{outsider_acts},\"timeline\":[{}],\"holds\":{}}}",
        council_day.map_or("null".into(), |d| d.to_string()), deadline - start, positions.len(), w.stats.forfeited, w.stats.stake_burned, w.stats.sanction_collected, w.stats.sanction_burned, w.stats.debt_created, timeline.join(","), holds(&[out])
    );
}

fn overlaps() {
    let mut w = prepared(0, true);
    let start = w.now();
    let a = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    let mut outsider_acts = 0;
    advance(&mut w, start + 3 * DAY, OBSERVER, &mut outsider_acts);
    assert!(w.xp(18) > w.xp(ACCUSED));
    let b = w.begin_case(&[18, ACCUSED]).unwrap();
    advance(&mut w, start + 7 * DAY, OBSERVER, &mut outsider_acts);
    let first = w.settle_case(a, Some(Side::Accused)).unwrap();
    assert!(w.held(ACCUSED), "closing the first case cannot release the second hold");
    advance(&mut w, start + 10 * DAY, OBSERVER, &mut outsider_acts);
    let second = w.settle_case(b, Some(Side::Accused)).unwrap();
    assert!(!w.held(ACCUSED));
    let repeat_eligible = w.xp(CHALLENGER) > w.xp(ACCUSED);
    assert!(repeat_eligible, "the repeated allegation still passes the public XP gate");
    let c = w.begin_case(&[CHALLENGER, ACCUSED]).unwrap();
    advance(&mut w, start + 17 * DAY, OBSERVER, &mut outsider_acts);
    let third = w.settle_case(c, Some(Side::Accused)).unwrap();
    let out = [first, second, third];
    w.audit().unwrap();
    println!(
        "{{\"witness\":\"overlap-and-repeat\",\"durationHours\":{},\"targetRestrictedUnionHours\":{},\"caseTargetHoursSum\":{},\"repeatEligible\":{repeat_eligible},\"collectedStakeBurn\":{},\"debtCreated\":{},\"outsiderActs\":{outsider_acts},\"holds\":{},\"firstChallenger\":{},\"secondChallenger\":{},\"accused\":{}}}",
        w.now() - start, 17 * DAY, 21 * DAY, w.stats.stake_burned, w.stats.debt_created, holds(&out), account(&w, CHALLENGER), account(&w, 18), account(&w, ACCUSED)
    );
}

fn council_queue() {
    let mut w = prepared(32, false);
    let start = w.now();
    let mut cases = Vec::new();
    for (challenger, accused, defender, backer) in [(30, 50, 10, None), (31, 51, 11, Some(4)), (32, 52, 12, Some(5))] {
        assert!(w.xp(challenger) > w.xp(accused));
        let case = w.begin_case(&[challenger, accused]).unwrap();
        assert!(w.xp(defender) > w.case_state(case).unwrap().1);
        w.join_case(case, defender).unwrap();
        if let Some(backer) = backer {
            assert!(w.xp(backer) > w.case_state(case).unwrap().1);
            w.join_case(case, backer).unwrap();
        }
        cases.push((case, accused));
    }
    let mut outsider_acts = 0;
    advance(&mut w, start + 6 * DAY, OBSERVER, &mut outsider_acts);
    let eligible = cases.iter().filter(|(case, _)| !w.case_final(*case)).count();
    assert_eq!(eligible, 3);
    // One aggregate unit of Council attention, not one independent chance per open case.
    let (served_case, _) = cases[1];
    let member = w.council().iter().copied().find(|id| !w.held(*id)).unwrap();
    w.council_join(served_case, member).unwrap();
    for id in w.council().to_vec() {
        w.council_ballot(served_case, id, true);
    }
    let mut deadlines: Vec<_> = cases.iter().map(|(case, accused)| (w.case_deadline(*case).unwrap(), *case, *accused)).collect();
    deadlines.sort_unstable();
    let mut results = Vec::new();
    let mut outcomes = Vec::new();
    for (deadline, case, accused) in deadlines {
        advance(&mut w, deadline, OBSERVER, &mut outsider_acts);
        let out = w.settle_case(case, None).unwrap();
        results.push(format!(
            "{{\"case\":{case},\"target\":{accused},\"served\":{},\"declaredClaimValid\":true,\"accusedWon\":{},\"durationHours\":{}}}",
            case == served_case,
            out.winner == Side::Accused,
            deadline - start
        ));
        outcomes.push(out);
    }
    w.audit().unwrap();
    println!(
        "{{\"witness\":\"finite-council-attention\",\"contestedCases\":3,\"eligibleAtDay6\":{eligible},\"aggregateEntryBudget\":1,\"served\":1,\"unserved\":2,\"entryDay\":6,\"furtherAttentionBeforeDeadlines\":0,\"outsiderActs\":{outsider_acts},\"results\":[{}],\"holds\":{}}}",
        results.join(","), holds(&outcomes)
    );
}

fn main() {
    println!(
        "{{\"witness\":\"metadata\",\"schema\":\"facety-core-witness/v1\",\"commit\":{},\"dirty\":{},\"randomness\":{},\"sampling\":\"deterministic; no random draws\",\"genesisAccounts\":64,\"preparationDays\":32,\"maxOrdinaryPositions\":21,\"baseStake\":7,\"layered\":true,\"detection\":\"declared allegations and external proof scripts, never disabled\",\"recoveryHorizonDays\":800}}",
        json::string(option_env!("FACETY_COMMIT").unwrap_or("unknown")), option_env!("FACETY_DIRTY").unwrap_or("false"), json::string(facety_sim::rng::RANDOMNESS_POLICY)
    );
    for backing in [0, 3, 7] {
        reward(backing);
    }
    for continues in [false, true] {
        recovery(continues);
    }
    accused_recovery();
    chain(true, None, false);
    chain(false, None, false);
    chain(false, None, true);
    chain(false, Some(0), false);
    chain(false, Some(14), false);
    overlaps();
    council_queue();
}
