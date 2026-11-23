//! Deterministic bounded event-log verification around the existing World APIs.
//!
//! This is software verification, not research: finite seeds, finite event counts, a fixed world size and a shrink
//! budget. After every event the declared comparison projection is compared and the structural audit runs. A rejected
//! operation must change no protocol state at all; only the declared diagnostic counters (`DisputeStats`) and the
//! efficiency caches (`World::finder`, the shared `Arc` layout caches) stay outside the projection.
use super::*;
use crate::chekharda::CouncilVote;

/// Seeds, event count and world size are fixed before execution; the shrink budget bounds reduction work.
const SEEDS: [u64; 3] = [11, 29, 47];
const EVENTS: usize = 240;
const ACCOUNTS: usize = 6;
const SHRINK_BUDGET: usize = 400;

struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn below(&mut self, n: usize) -> usize {
        if n == 0 {
            0
        } else {
            (self.next() as usize) % n
        }
    }
}

#[derive(Clone, Copy, Debug)]
enum Event {
    Tick(u64),
    SelfId(Id),
    Convert(Id),
    CancelSelfId(Id, u32),
    CorrectSelfId(Id, u32, u64),
    OpenValence(Id, Id),
    WithdrawValence(Id, u32),
    Invite(Id),
    Accept(u32),
    PendingOpening(Id, Id),
    BeginCase(Id, Id),
    CancelCaseOpening(u32, Id),
    JoinCase(u32, Id),
    CouncilJoin(u32, Id),
    Ballot(u32, Id, u32, u8),
    SettleCase(u32, Option<u8>),
    CancelPending(u32, Id),
    RecordSelfIdCase(Id, u32),
    SettleSelfIdCase(u32, bool),
    RestoreCase(u32),
}

fn draw(rng: &mut Lcg, w: &World) -> Event {
    let who = rng.below(w.len()) as Id;
    let other = rng.below(w.len()) as Id;
    let case = rng.below(w.cases.len().max(1)) as u32;
    let act = rng.below(w.acts.len().max(1)) as u32;
    let inv = rng.below(w.invitations.len().max(1)) as u32;
    let member = rng.below(w.council.len().max(1)) as Id;
    match rng.below(20) {
        0 => Event::Tick(1 + rng.below(50) as u64),
        1 => Event::SelfId(who),
        2 => Event::Convert(who),
        3 => Event::CancelSelfId(who, act),
        4 => Event::OpenValence(who, other),
        5 => Event::WithdrawValence(who, rng.below(w.valences.len().max(1)) as u32),
        6 => Event::Invite(who),
        7 => Event::Accept(inv),
        8 => Event::PendingOpening(who, other),
        9 => Event::BeginCase(who, other),
        10 => Event::CancelCaseOpening(case, who),
        11 => Event::JoinCase(case, who),
        12 => Event::CouncilJoin(case, w.council.get(member as usize).copied().unwrap_or(member)),
        13 => Event::Ballot(case, w.council.get(member as usize).copied().unwrap_or(member), rng.below(3) as u32, rng.below(24) as u8),
        14 => Event::SettleCase(case, if rng.below(3) == 0 { Some(rng.below(2) as u8) } else { None }),
        15 => Event::CancelPending(case, who),
        16 => Event::RecordSelfIdCase(who, act),
        17 => Event::SettleSelfIdCase(case, rng.below(2) == 0),
        18 => Event::RestoreCase(case),
        _ => Event::CorrectSelfId(who, act, rng.below(4) as u64),
    }
}

fn apply(w: &mut World, event: &Event) -> Result<(), Reject> {
    match *event {
        Event::Tick(days) => {
            w.tick(w.now() + days as i64 * DAY);
            Ok(())
        }
        // A refused operation must change nothing; a successful one must leave the audit intact.
        Event::SelfId(who) => w.create_self_id(who).map(|_| ()),
        Event::Convert(who) => match w.eligible_emission(who) {
            Some(act) => w.convert_to_collector(who, act),
            None => Err(Reject("no eligible emission")),
        },
        Event::CancelSelfId(actor, act) => w.cancel_self_id(actor, act),
        Event::CorrectSelfId(author, target, nonce) => w
            .correct_own_self_id(CorrectionInput {
                network: CORRECTION_NETWORK,
                version: CORRECTION_VERSION,
                author,
                target,
                nonce,
                authority: TrustedPremise::Supplied,
            })
            .map(|_| ()),
        Event::OpenValence(owner, counterpart) => match w.eligible_emission(owner) {
            Some(act) => w.open_valence(owner, counterpart, act).map(|_| ()),
            None => Err(Reject("no eligible emission")),
        },
        Event::WithdrawValence(owner, valence) => w.withdraw_valence(owner, valence),
        Event::Invite(creator) => match w.eligible_emission(creator) {
            Some(act) => w.create_invitation(creator, act).map(|_| ()),
            None => Err(Reject("no eligible emission")),
        },
        Event::Accept(inv) => w.accept_invitation(inv).map(|_| ()),
        Event::PendingOpening(author, accused) => w.record_case_opening(&[author, accused]).map(|_| ()),
        Event::BeginCase(a, b) => w.begin_case(&[a, b]).map(|_| ()),
        Event::CancelCaseOpening(case, author) => w.cancel_case_opening(case, author).map(|_| ()),
        Event::JoinCase(case, who) => w.join_case(case, who).map(|_| ()),
        Event::CouncilJoin(case, member) => w.council_join(case, member).map(|_| ()),
        Event::Ballot(case, member, round, vote) => {
            let choice = match vote % 3 {
                0 => CouncilVote::Confirm,
                1 => CouncilVote::Oppose,
                _ => CouncilVote::Defer,
            };
            if w.council_ballot(case, member, round, choice) {
                Ok(())
            } else {
                Err(Reject("ballot refused"))
            }
        }
        Event::SettleCase(case, forced) => {
            let side = match forced {
                Some(0) => Some(Side::Accuser),
                Some(_) => Some(Side::Accused),
                None => None,
            };
            w.settle_case(case, side).map(|_| ())
        }
        Event::CancelPending(case, actor) => w.cancel_pending_opening(case, actor),
        Event::RecordSelfIdCase(accuser, act) => w
            .record_self_id_case_fixture(
                accuser,
                TransactionTarget::SelfId(act),
                TrustedAdmissionPremises { admission: TrustedPremise::Supplied, historical_duty: TrustedPremise::Supplied },
            )
            .map(|_| ()),
        Event::SettleSelfIdCase(case, upheld) => {
            let merits = if upheld { TrustedMerits::UpheldSupplied } else { TrustedMerits::NotUpheldSupplied };
            w.settle_self_id_case_fixture(case, merits).map(|_| ())
        }
        Event::RestoreCase(case) => {
            if w.self_id_case(case).is_some() {
                w.restore_self_id_case_effects(case).map(|_| ())
            } else {
                w.restore_case_effects(case).map(|_| ())
            }
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct SubjectSnap {
    status: Status,
    xp: i32,
    raw: i32,
    coef: u32,
    own_maturities: u64,
    low_coef: u32,
    liquid: Amount,
    reserved: Amount,
    debt: Amount,
    debt_repaid: Amount,
    last_reward: Option<i64>,
    penalized_xp: i32,
    restored_xp: i32,
    lost_key: bool,
    acts: Vec<u32>,
    first_unspent: usize,
    inviter: Option<Id>,
    recovers: Option<Id>,
    tranches: Vec<(u32, Amount, Amount, Amount, Amount)>,
    integrity: Vec<(u64, String, Option<u32>, bool)>,
}

#[derive(Debug, PartialEq, Eq)]
struct CaseSnap {
    accused: Id,
    positions: Vec<chekharda::Position<Id>>,
    rounds: Vec<CouncilRound<Id>>,
    electorates: Vec<CouncilElectorate>,
    backed: Vec<Amount>,
    holds: Vec<(Id, i64, bool)>,
}

/// One recorded act and its receipt: `(subject, recorded_at, roster, status, invalidated-before-credit, receipt)`.
type ActSnap = (Id, i64, Vec<Id>, ActStatus, bool, Option<(i64, u64, bool, Vec<Id>)>);

/// One settled case's effect causes.
type EffectSnap = (String, Id, Side, bool, Vec<Id>, Vec<u32>, Vec<Id>);

/// The declared comparison projection: every protocol-semantic field of World.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct Snap {
    now: i64,
    minted: i64,
    burned: Amount,
    vault: i64,
    liquid_destroyed: Amount,
    settled: usize,
    active_count: usize,
    council: Vec<Id>,
    council_mask: Vec<bool>,
    config: Config,
    subjects: Vec<SubjectSnap>,
    acts: Vec<ActSnap>,
    graph: (usize, Vec<Vec<u32>>),
    rels: Vec<(Id, Id, bool)>,
    valences: Vec<(Id, Id, bool, Vec<u32>)>,
    invitations: Vec<Invitation>,
    held: Vec<u32>,
    path_held: Vec<u32>,
    frozen: Vec<u32>,
    owned_open: Vec<u32>,
    inv_units: Vec<u32>,
    cases: Vec<Option<CaseSnap>>,
    openings: Vec<Option<OpeningRecord>>,
    slots: Vec<(Id, DisputeId)>,
    maturity_holds: Vec<MaturityHold>,
    deferred_maturities: Vec<u32>,
    cancellations: Vec<Option<CancellationOutcome>>,
    outcomes: Vec<Option<CaseOutcome>>,
    effects: Vec<Option<EffectSnap>>,
    self_id_cases: Vec<Option<SelfIdCaseRecord>>,
    self_id_settlements: Vec<Option<SelfIdSettlement>>,
    appeal_requests: Vec<AppealRequest>,
    appeals: Vec<AppealRecord>,
    corrections: BTreeMap<u32, SelfIdCorrection>,
    revocations: Vec<(u32, Vec<RevocationCause>)>,
    identity_cases: Vec<(Id, Vec<u32>)>,
    independent_invalid: Vec<bool>,
    recovery_log: Vec<(Id, Id, i32)>,
    previous_guarantors: Vec<(Id, Vec<Id>)>,
}

impl World {
    /// The comparison excludes diagnostic counters and derived path caches (finder scratch and distances,
    /// support levels, blocked mask, path revisions and reachability).
    pub(super) fn snapshot(&self) -> Snap {
        let mut revocations: Vec<_> = self.xp_revocations.iter().map(|(k, v)| (*k, v.clone())).collect();
        revocations.sort();
        let mut identity_cases: Vec<(Id, Vec<u32>)> = self.identity_cases.iter().map(|(k, v)| (*k, v.clone())).collect();
        identity_cases.sort();
        let mut previous_guarantors: Vec<(Id, Vec<Id>)> = self.previous_guarantors.iter().map(|(k, v)| (*k, v.clone())).collect();
        previous_guarantors.sort();
        Snap {
            now: self.now,
            minted: self.minted,
            burned: self.burned,
            vault: self.vault,
            liquid_destroyed: self.liquid_destroyed,
            settled: self.settled,
            active_count: self.active_count,
            council: self.council.clone(),
            council_mask: self.council_mask.clone(),
            config: self.cfg.clone(),
            subjects: self
                .subjects
                .iter()
                .map(|s| SubjectSnap {
                    status: s.status,
                    xp: s.xp,
                    raw: s.raw,
                    coef: s.coef,
                    own_maturities: s.own_maturities,
                    low_coef: s.low_coef,
                    liquid: s.liquid,
                    reserved: s.reserved,
                    debt: s.debt,
                    debt_repaid: s.debt_repaid,
                    last_reward: s.last_reward,
                    penalized_xp: s.penalized_xp,
                    restored_xp: s.restored_xp,
                    lost_key: s.lost_key,
                    acts: s.acts.clone(),
                    first_unspent: s.first_unspent,
                    inviter: s.inviter,
                    recovers: s.recovers,
                    tranches: s.debt_tranches.iter().map(|d| (d.case, d.amount, d.remaining, d.repaid, d.cancelled)).collect(),
                    integrity: s
                        .integrity_adjustments
                        .iter()
                        .map(|a| {
                            let kind = match a.kind {
                                IntegrityAdjustmentKind::Penalty { fraction, flat_cut } => format!("penalty:{:?}:{flat_cut}", fraction.to_bits()),
                                IntegrityAdjustmentKind::InheritedCap(cap) => format!("cap:{cap}"),
                            };
                            (a.at_maturities, kind, a.case, a.reversed)
                        })
                        .collect(),
                })
                .collect(),
            acts: self
                .acts
                .iter()
                .map(|a| {
                    (
                        a.subject,
                        a.recorded_at,
                        a.guarantors.to_vec(),
                        a.status,
                        a.invalidated_before_credit,
                        a.credit.as_ref().map(|c| (c.at, c.maturity_number, c.revoked, c.recipients.to_vec())),
                    )
                })
                .collect(),
            graph: (self.graph.edge_count(), (0..self.graph.len() as Id).map(|v| self.graph.out(v).to_vec()).collect()),
            rels: self.rels.iter().map(|r| (r.guarantor, r.guaranteed, r.active)).collect(),
            valences: self.valences.iter().map(|v| (v.owner, v.counterpart, v.open, v.rels.clone())).collect(),
            invitations: self.invitations.clone(),
            held: self.hold.clone(),
            path_held: self.path_hold.clone(),
            frozen: self.frozen.clone(),
            owned_open: self.owned_open.clone(),
            inv_units: self.inv_units.clone(),
            cases: self
                .cases
                .iter()
                .map(|c| {
                    c.as_ref().map(|c| CaseSnap {
                        accused: c.accused,
                        positions: c.ladder.positions().to_vec(),
                        rounds: c.ladder.rounds().to_vec(),
                        electorates: c.electorates.clone(),
                        backed: c.backed.clone(),
                        holds: c.holds.clone(),
                    })
                })
                .collect(),
            openings: self.case_openings.clone(),
            slots: {
                let mut slots: Vec<_> = self.dispute_slots.iter().map(|(&who, &case)| (who, case)).collect();
                slots.sort_unstable();
                slots
            },
            maturity_holds: self.maturity_holds.clone(),
            deferred_maturities: self.deferred_maturities.clone(),
            cancellations: self.case_cancellations.clone(),
            outcomes: self.case_outcomes.clone(),
            effects: self
                .case_effects
                .iter()
                .map(|e| {
                    e.as_ref().map(|e| {
                        let kind = match e.kind {
                            CaseKind::Identity => "identity",
                            CaseKind::SelfIdTransaction => "self-id",
                        };
                        (kind.to_string(), e.accused, e.winner, e.reversed, e.identity_subjects.clone(), e.source_acts.clone(), e.penalized_subjects.clone())
                    })
                })
                .collect(),
            self_id_cases: self.self_id_cases.clone(),
            self_id_settlements: self.self_id_settlements.clone(),
            appeal_requests: self.appeal_requests.clone(),
            appeals: self.appeals.clone(),
            corrections: self.corrections.clone(),
            revocations,
            identity_cases,
            independent_invalid: self.independent_invalid.clone(),
            recovery_log: self.recovery_log.clone(),
            previous_guarantors,
        }
    }
}

/// Invariants that hold after every accepted event, in addition to the structural audit.
fn invariants(w: &World) {
    w.audit().expect("structural audit");
    // Money is conserved exactly: minted minus burned equals unspent rights plus liquid holdings.
    let liquid: Amount = (0..w.len() as Id).map(|id| w.liquid(id)).sum();
    assert_eq!(w.supply(), liquid + Amount::coins(w.vault() as u64), "supply differs from vault plus liquid");
    assert!(w.stats.self_id_source_burned.is_zero(), "the isolated settlement must never burn the transferred backing");
    // D196: a deferred maturity is a pending act, never a credited, cancelled or consumed one; its case always owns a hold.
    for &act in w.deferred_maturities() {
        assert_eq!(w.acts_status(act), ActStatus::Unspent, "a deferred maturity must still be pending");
        assert!(w.maturity_hold(act).is_some(), "a deferred maturity is always held by a case");
    }
    // Exclusive custody: the audit reconstructs reserved liquid from positions; it cannot exceed the balance.
    for id in 0..w.len() as Id {
        assert!(w.spendable(id) <= w.liquid(id), "custody exceeds the account's liquid balance");
    }
    // D199: every pending funded opening owns exactly its full first stake, and the total reservation is exactly the
    // pending openings plus the active positions' custody, never more and never counted twice across activation.
    let pending: Amount = w.case_openings.iter().flatten().filter(|o| o.stage == OpeningStage::Pending).map(|o| o.reserved_stake).sum::<Amount>()
        + w.self_id_cases.iter().flatten().filter(|r| r.stage == SelfIdCaseStage::Pending).map(|r| r.reserved_stake).sum::<Amount>();
    let custody: Amount = w.cases.iter().flatten().flat_map(|c| c.backed.iter().copied()).sum();
    let reserved: Amount = w.subjects.iter().map(|s| s.reserved).sum();
    assert_eq!(reserved, pending + custody, "reservations differ from pending openings plus active custody");
    for o in w.case_openings.iter().flatten().filter(|o| o.stage == OpeningStage::Pending) {
        assert_eq!(o.reserved_stake, w.stake_at(1), "a pending opening holds its full first stake");
    }
}

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

fn fresh() -> World {
    World::new(Config { base_stake: Some(7), ..Config::default() }, ACCOUNTS, &ring(ACCOUNTS))
}

/// Replay a recorded event log; `Err((index, event))` is the first counterexample.
fn replay(log: &[Event]) -> Result<World, (usize, Event)> {
    let mut w = fresh();
    for (index, event) in log.iter().enumerate() {
        let before = w.snapshot();
        match apply(&mut w, event) {
            Ok(()) => invariants(&w),
            Err(_) => {
                if w.snapshot() != before {
                    return Err((index, *event));
                }
            }
        }
    }
    Ok(w)
}

/// Remove events greedily while the counterexample survives: a reduced trace, not a proven minimal one.
fn shrink(mut log: Vec<Event>) -> (Vec<Event>, usize) {
    let mut budget = SHRINK_BUDGET;
    let mut index = match replay(&log) {
        Err((at, _)) => at,
        Ok(_) => return (log, 0),
    };
    while budget > 0 && log.len() > 1 {
        let mut reduced = log.clone();
        reduced.remove(index);
        match replay(&reduced) {
            Err((at, _)) => {
                log = reduced;
                index = at;
            }
            Ok(_) => {
                if index == 0 {
                    break;
                }
                index -= 1;
            }
        }
        budget -= 1;
    }
    (log, index)
}

/// A fixed prologue that builds one complete isolated settlement, so the generated logs also cover a successful
/// D192 execution, its journal and later case-specific restoration. Identifiers are the deterministic creation order.
fn prologue() -> Vec<Event> {
    vec![
        Event::SelfId(0),
        Event::SelfId(1),
        Event::SelfId(3),
        Event::SelfId(4),
        // Act 4 is the challenged terminal Self-ID of account 2; its creation-time roster is [0, 1, 3, 4].
        Event::SelfId(2),
        Event::SelfId(5),
        Event::Tick(1),
        Event::Convert(0),
        Event::Convert(1),
        Event::Convert(3),
        Event::Convert(4),
        Event::SelfId(5),
        Event::Tick(1),
        Event::SelfId(5),
        // Case 0: one ordinary accuser, frozen N = 1, the ordinary cutoff, an upheld supplied merits result.
        Event::Convert(5),
        Event::RecordSelfIdCase(5, 4),
        Event::Tick(1),
        Event::Tick(7),
        Event::SettleSelfIdCase(0, true),
        Event::RestoreCase(0),
        // Case 1 exercises the filing-frozen deep scope: account 2 already holds a second Self-ID when the accusation is
        // recorded, so filing freezes N = 2 (D195). The target right is converted to collected value inside the pendency
        // and the third act is outside the frozen scope, so settlement collects actual backing and records the rest as
        // its own debt. Then case-specific reversal.
        Event::SelfId(2),
        Event::SelfId(5),
        Event::Tick(1),
        Event::SelfId(2),
        Event::Convert(5),
        Event::RecordSelfIdCase(5, 8),
        // Two ordinary disposition changes inside the pendency: the target right becomes collected value and the third
        // act (outside the frozen scope) is freely cancelled, so its backing is burned rather than available.
        Event::Convert(2),
        Event::CancelSelfId(2, 10),
        Event::Tick(1),
        Event::Tick(7),
        Event::SettleSelfIdCase(1, true),
        Event::RestoreCase(1),
        // Case 2 exercises suspended maturity (D196): an account's still-pending Self-ID is held by an immediate case, its
        // own maturity passes without credit, and the authorized release credits it exactly once.
        Event::SelfId(5),
        Event::Tick(1),
        Event::SelfId(5),
        Event::Tick(1),
        Event::SelfId(5),
        Event::Tick(1),
        Event::SelfId(4),
        Event::Convert(5),
        Event::Convert(5),
        Event::Convert(5),
        Event::Convert(5),
        Event::Convert(5),
        Event::BeginCase(5, 4),
        Event::Tick(7),
        Event::SettleCase(2, Some(1)),
        // D199: the funded filing lifecycle. Account 0 first files with too little Collector FCTY, which is refused
        // atomically (no case ID, slot or custody). It then withdraws seven FCTY, files case 3 (full reservation),
        // cancels it for free, replays the cancellation (refused, releasing nothing twice), files case 4 and
        // activates it on the same reservation at 24 hours, and the verdict settles from that custody.
        Event::PendingOpening(0, 3),
        Event::SelfId(0),
        Event::Tick(1),
        Event::SelfId(0),
        Event::Tick(1),
        Event::SelfId(0),
        Event::Tick(1),
        Event::SelfId(0),
        Event::Tick(1),
        Event::SelfId(0),
        Event::Tick(1),
        Event::SelfId(0),
        Event::Tick(1),
        Event::SelfId(0),
        Event::Tick(1),
        Event::Convert(0),
        Event::Convert(0),
        Event::Convert(0),
        Event::Convert(0),
        Event::Convert(0),
        Event::Convert(0),
        Event::Convert(0),
        Event::PendingOpening(0, 3),
        Event::CancelCaseOpening(3, 0),
        Event::CancelCaseOpening(3, 0),
        Event::PendingOpening(0, 3),
        Event::Tick(1),
        Event::Tick(7),
        Event::SettleCase(4, None),
    ]
}

fn step(w: &mut World, log: &mut Vec<Event>, event: Event) -> bool {
    log.push(event);
    let before = w.snapshot();
    match apply(w, &event) {
        Ok(()) => {
            invariants(w);
            true
        }
        Err(_) => {
            if w.snapshot() != before {
                let (reduced, at) = shrink(log.clone());
                panic!("a rejected event changed protocol state; reduced to {} events, failure at {at}: {:?}", reduced.len(), reduced[at]);
            }
            false
        }
    }
}

#[test]
fn deterministic_event_logs_preserve_conservation_custody_fifo_xp_and_atomic_refusal() {
    let mut total = (0usize, 0usize);
    // The prologue's first D199 filing passes every admission check and is refused only for missing Collector FCTY.
    let first = prologue().iter().position(|e| matches!(e, Event::PendingOpening(0, 3))).expect("funded-filing segment");
    let mut probe = fresh();
    for event in &prologue()[..first] {
        let _ = apply(&mut probe, event);
    }
    assert!(probe.xp(0) > probe.xp(3) && probe.dispute_slots.is_empty(), "the refused filing is otherwise admissible");
    assert_eq!(probe.record_case_opening(&[0, 3]), Err(UNFUNDED_OPENING));
    for seed in SEEDS {
        let mut rng = Lcg(seed);
        let mut w = fresh();
        let mut log: Vec<Event> = Vec::with_capacity(EVENTS + prologue().len());
        for event in prologue() {
            step(&mut w, &mut log, event);
        }
        assert_eq!(w.stats.self_id_settled, 2, "the prologue must execute the isolated and the drifted settlement (seed {seed})");
        assert!(w.self_id_settlement(0).is_some_and(|s| s.reversed), "the prologue must exercise case-specific restoration");
        let deep = w.self_id_settlement(1).expect("the deep-scope case settled");
        assert_eq!((deep.frozen.violating, deep.frozen.endpoint, deep.frozen.n), (2, 3, 2), "filing froze the deep scope (seed {seed})");
        assert!(deep.accused_collected < deep.accused_charge, "a converted target right leaves a recorded shortfall (seed {seed})");
        assert_eq!(deep.unpaid_accused, deep.accused_charge - deep.accused_collected, "the shortfall is this case's debt (seed {seed})");
        assert!(deep.reversed, "the deep-scope case is reversed without duplicating value");
        assert_eq!(w.stats.self_id_unpaid, deep.unpaid_accused, "only the deep case's shortfall counts as unpaid (seed {seed})");
        assert!(w.stats.maturities_deferred >= 1, "the prologue suspends a pending maturity (seed {seed})");
        assert!(w.stats.maturities_released >= 1, "the prologue releases it exactly once (seed {seed})");
        assert!(w.maturity_holds().is_empty(), "the prologue leaves no leaked hold (seed {seed})");
        // D199: the refused filing allocated nothing; the cancelled one released its reservation once; the activated
        // one reused its reservation and settled.
        assert_eq!(w.cases.len(), 5, "the unfunded filing consumed no case ID (seed {seed})");
        assert_eq!(
            (w.stats.openings_recorded, w.stats.openings_cancelled, w.stats.openings_activated, w.stats.settled),
            (2, 1, 1, 2),
            "the prologue records, cancels, activates and settles funded openings (seed {seed})"
        );
        assert_eq!(w.case_cancellation(3).map(|c| c.cancelled_by), Some(0));
        assert_eq!(w.case_opening(4).map(|o| (o.stage, o.reserved_stake)), Some((OpeningStage::Final, Amount::coins(7))));
        assert_eq!(w.case_outcome(4).map(|o| o.positions), Some(1));
        assert_eq!(w.subjects[0].reserved, Amount::ZERO, "settlement released the activated reservation (seed {seed})");
        for _ in 0..EVENTS {
            let event = draw(&mut rng, &w);
            if step(&mut w, &mut log, event) {
                total.0 += 1;
            } else {
                total.1 += 1;
            }
        }
        invariants(&w);
        assert!(w.audit().is_ok());
    }
    assert!(total.0 > 100 && total.1 > 100, "the run must exercise accepted and rejected events: {}/{}", total.0, total.1);
    assert_eq!(total.0 + total.1, SEEDS.len() * EVENTS, "every generated event is accounted for");
}
