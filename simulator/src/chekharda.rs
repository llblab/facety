//! The Chekharda dispute ladder as a pure rule engine (D158, D159, D161, D162): positions, per-position response windows,
//! the monotonic shared deadline with its provenance, admission, and the settlement of stakes. It knows nothing about accounts,
//! money custody or the graph; `World` supplies XP and funds and applies the settlement.
//!
//! Rules implemented here (protocol §26.5 and the decision log):
//! - Position `n` (the first challenger is `n = 1`) gets its own window `max(3 days, (8 - n) days)`, which starts when that position
//!   is admitted, not at the previous deadline: windows 7, 6, 5, 4, 3, 3, ... days.
//! - `deadline(1) = joined(1) + 7 days`; `deadline(n) = max(deadline(n - 1), joined(n) + window(n))`. A new valid position preserves or
//!   extends the deadline and can never shorten it; the deadline equals the maximum end point of all position windows.
//! - Only a newly admitted position counts. A refused attempt, a duplicate, a notification, evidence, an observation or a Council ballot
//!   changes neither the ordinal nor the deadline.
//! - The Council enters once, collectively, as the terminal position on the same clock (D69, D161): one position, no extra Council window,
//!   and ballots never add positions.
//! - Boundary (a simulation convention, OPEN in the protocol): the dispute is open on the half-open interval `[opened, deadline)`; an
//!   entry at exactly the deadline hour is refused (the closing is processed first). Entries at the same hour are applied in the order
//!   they are submitted, and each must satisfy the XP and alternation conditions against the entry before it.
//! - Stakes (D159): `stake(k) = ceil(base * 1.2^(k-1))` whole FACY (declared rounding of the compound growth); every winner takes the
//!   stake of the position directly below it and gets its own back; a loser forfeits to the position directly above it; the lowest
//!   winning position is paid from the sanction on the accused (base stake); the stake of a losing top position has no winner above it
//!   and is burned (the legacy assumption, OPEN in the protocol).
//!
//! Time is in hours, like the world clock.

pub const DAY_HOURS: i64 = 24;
/// Base stake of the first position, in whole FACY (D159).
pub const BASE_STAKE: u32 = 7;
/// Stake growth per position: 20% (D159).
pub const STAKE_GROWTH: f64 = 0.20;

/// The response window of position `n` in hours: `max(3, 8 - n)` days (D158).
pub fn window_hours(n: u32) -> i64 {
    assert!(n >= 1, "positions are numbered from 1");
    (8 - i64::from(n)).max(3) * DAY_HOURS
}

/// The stake of position `n` in whole FACY: `ceil(base * 1.2^(n-1))` computed from the formula, so rounding never compounds.
pub fn stake(n: u32, base: u32) -> u32 {
    assert!(n >= 1, "positions are numbered from 1");
    // Integer arithmetic in 1/5 steps keeps the ceiling exact: base * 6^(n-1) / 5^(n-1).
    let num = u128::from(base) * 6u128.pow(n - 1);
    let den = 5u128.pow(n - 1);
    num.div_ceil(den) as u32
}

/// Which side of the dispute a position takes: odd positions stand with the accuser, even positions with the accused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Accuser,
    Accused,
}

impl Side {
    pub fn of(n: u32) -> Side {
        if n % 2 == 1 {
            Side::Accuser
        } else {
            Side::Accused
        }
    }
    pub fn other(self) -> Side {
        match self {
            Side::Accuser => Side::Accused,
            Side::Accused => Side::Accuser,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// An ordinary participant who needs more XP than the previous participant and posts the stake.
    Participant,
    /// The collective Council entry (D161): no XP condition, no stake, one position, terminal.
    Council,
}

/// Why an attempted entry was refused. A refusal changes nothing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refusal {
    /// The deadline has been reached: the dispute is final.
    Closed,
    /// The account already holds a position.
    AlreadyParticipant,
    /// The entrant's XP is not above the previous participant's XP.
    XpNotAbove,
    /// The Council already entered; it is the terminal entrant.
    CouncilEntered,
}

/// One admitted position with the deadline provenance a reviewer needs to explain the final deadline.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Position<W> {
    pub n: u32,
    pub who: W,
    pub kind: Kind,
    pub side: Side,
    pub joined_at: i64,
    /// This position's own response window in hours.
    pub window: i64,
    /// `joined_at + window`: the deadline this position proposes.
    pub proposed: i64,
    /// The deadline before this position was admitted (`None` for the first position).
    pub before: Option<i64>,
    /// The deadline after: `max(before, proposed)`.
    pub after: i64,
    /// XP of the entrant at admission (the condition for the next entrant); 0 for the Council.
    pub xp: i32,
    pub stake: u32,
}

impl<W> Position<W> {
    /// Whether this position moved the deadline later (an overlapping window that ends earlier changes nothing).
    pub fn extended(&self) -> bool {
        self.before.is_none_or(|b| self.after > b)
    }
}

/// A recorded Council ballot: recorded for the vote, with no effect on the ordinals or the timer.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Ballot<W> {
    pub who: W,
    /// `true` for the first Council member who joined (the side the Council entry took), `false` for the opposing side.
    pub for_entrant: bool,
}

#[derive(Clone, Debug)]
pub struct Ladder<W> {
    pub opened_at: i64,
    pub base_stake: u32,
    positions: Vec<Position<W>>,
    ballots: Vec<Ballot<W>>,
}

/// What a closed dispute settles: who wins, and every transfer of stake in whole FACY.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Settlement {
    pub winner: Side,
    /// Position numbers (ascending) of the winners and the losers.
    pub winners: Vec<u32>,
    pub losers: Vec<u32>,
    /// `(from position, to position, amount)`: a losing stake forfeited to the position directly above it.
    pub forfeits: Vec<(u32, u32, u32)>,
    /// Stake of a losing top position that has no winner above it (burned).
    pub burned_stake: u32,
    /// The winning first position, if any, is paid the base stake from the sanction on the accused rather than from a position below.
    pub sanction_to_first: bool,
    /// Whether the accused lost (the accuser side won): the base stake is charged to the accused and to each of its guarantors.
    pub accused_lost: bool,
}

impl<W: Copy + PartialEq> Ladder<W> {
    /// Open the dispute with position 1 (the accuser) at `now`.
    pub fn open(accuser: W, xp: i32, now: i64, base_stake: u32) -> Ladder<W> {
        let window = window_hours(1);
        let first = Position {
            n: 1,
            who: accuser,
            kind: Kind::Participant,
            side: Side::Accuser,
            joined_at: now,
            window,
            proposed: now + window,
            before: None,
            after: now + window,
            xp,
            stake: stake(1, base_stake),
        };
        Ladder { opened_at: now, base_stake, positions: vec![first], ballots: Vec::new() }
    }

    pub fn positions(&self) -> &[Position<W>] {
        &self.positions
    }
    pub fn ballots(&self) -> &[Ballot<W>] {
        &self.ballots
    }
    pub fn len(&self) -> u32 {
        self.positions.len() as u32
    }
    pub fn is_empty(&self) -> bool {
        self.positions.is_empty()
    }
    /// The current shared deadline: the maximum end point of all position windows.
    pub fn deadline(&self) -> i64 {
        self.positions.last().expect("a ladder has a first position").after
    }
    /// The position whose window ends at the current deadline (the earliest such position), for provenance.
    pub fn deadline_source(&self) -> u32 {
        let d = self.deadline();
        self.positions.iter().find(|p| p.proposed == d).map(|p| p.n).expect("the deadline is some position's end point")
    }
    /// The ordinal the next entrant would take.
    pub fn next_ordinal(&self) -> u32 {
        self.len() + 1
    }
    /// The side the next entrant would take (the side opposite to the last position).
    pub fn next_side(&self) -> Side {
        self.positions.last().expect("a ladder has a first position").side.other()
    }
    pub fn council_entered(&self) -> bool {
        self.positions.iter().any(|p| p.kind == Kind::Council)
    }
    /// The XP the next ordinary entrant must exceed: that of the last ordinary participant.
    pub fn xp_to_beat(&self) -> i32 {
        self.positions.iter().rev().find(|p| p.kind == Kind::Participant).map_or(0, |p| p.xp)
    }
    /// Whether the dispute is final at `now` (the deadline hour itself is already final).
    pub fn is_final(&self, now: i64) -> bool {
        now >= self.deadline()
    }
    pub fn stake_of_next(&self) -> u32 {
        stake(self.next_ordinal(), self.base_stake)
    }

    /// The condition check for an entry without applying it (used to test eligibility before money moves).
    pub fn check(&self, who: W, kind: Kind, xp: i32, now: i64) -> Result<(), Refusal> {
        if self.is_final(now) {
            return Err(Refusal::Closed);
        }
        if self.council_entered() {
            return Err(Refusal::CouncilEntered);
        }
        if self.positions.iter().any(|p| p.who == who) {
            return Err(Refusal::AlreadyParticipant);
        }
        if kind == Kind::Participant && xp <= self.xp_to_beat() {
            return Err(Refusal::XpNotAbove);
        }
        Ok(())
    }

    /// Admit a new position. Only an admitted position changes the ordinal and the deadline; on a refusal nothing changes.
    pub fn admit(&mut self, who: W, kind: Kind, xp: i32, now: i64) -> Result<&Position<W>, Refusal> {
        self.check(who, kind, xp, now)?;
        let n = self.next_ordinal();
        let before = self.deadline();
        let window = window_hours(n);
        let proposed = now + window;
        let position = Position {
            n,
            who,
            kind,
            side: Side::of(n),
            joined_at: now,
            window,
            proposed,
            before: Some(before),
            after: before.max(proposed),
            xp: if kind == Kind::Council { 0 } else { xp },
            stake: if kind == Kind::Council { 0 } else { stake(n, self.base_stake) },
        };
        self.positions.push(position);
        Ok(self.positions.last().expect("just pushed"))
    }

    /// Record a Council ballot. A ballot is not an entry: it cannot alter the ordinals or the deadline. Only after the Council entered,
    /// one ballot per member.
    pub fn ballot(&mut self, who: W, for_entrant: bool) -> bool {
        if !self.council_entered() || self.ballots.iter().any(|b| b.who == who) {
            return false;
        }
        self.ballots.push(Ballot { who, for_entrant });
        true
    }

    /// The side that wins at the deadline: the side of the last unopposed ordinary position, or, once the Council entered, the side the
    /// equal-vote majority of the Council chose (D111). Ties and an empty vote leave the entrant's side (the Council member who joined first
    /// is taken to be right unless a majority says otherwise; OPEN in the protocol).
    pub fn winner(&self) -> Side {
        let top = self.positions.last().expect("a ladder has a first position");
        if top.kind != Kind::Council {
            return top.side;
        }
        let for_entrant = self.ballots.iter().filter(|b| b.for_entrant).count();
        let against = self.ballots.len() - for_entrant;
        if against > for_entrant {
            top.side.other()
        } else {
            top.side
        }
    }

    /// Settle the dispute (call at or after the deadline).
    pub fn settle(&self) -> Settlement {
        let winner = self.winner();
        let mut winners = Vec::new();
        let mut losers = Vec::new();
        for p in &self.positions {
            if p.side == winner {
                winners.push(p.n);
            } else {
                losers.push(p.n);
            }
        }
        let top = self.len();
        let mut forfeits = Vec::new();
        let mut burned_stake = 0;
        for &j in &losers {
            let amount = self.positions[j as usize - 1].stake;
            if amount == 0 {
                continue;
            }
            if j < top {
                forfeits.push((j, j + 1, amount));
            } else {
                burned_stake += amount;
            }
        }
        Settlement {
            winner,
            sanction_to_first: winners.first() == Some(&1),
            accused_lost: winner == Side::Accuser,
            winners,
            losers,
            forfeits,
            burned_stake,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const H: i64 = DAY_HOURS;

    #[test]
    fn windows_follow_the_ordinal_down_to_the_three_day_floor() {
        let days: Vec<i64> = (1..=9).map(|n| window_hours(n) / H).collect();
        assert_eq!(days, vec![7, 6, 5, 4, 3, 3, 3, 3, 3]);
    }

    #[test]
    fn stakes_grow_by_twenty_percent_from_the_base_and_round_up_once() {
        let s: Vec<u32> = (1..=8).map(|n| stake(n, 7)).collect();
        // 7, 8.4, 10.08, 12.096, 14.5152, 17.418, 20.90, 25.08
        assert_eq!(s, vec![7, 9, 11, 13, 15, 18, 21, 26]);
        assert_eq!(stake(1, 10), 10);
        assert_eq!(stake(3, 10), 15, "exact 14.4 rounds up to 15");
    }

    fn at(l: &mut Ladder<u32>, who: u32, xp: i32, day: f64) -> Result<(), Refusal> {
        l.admit(who, Kind::Participant, xp, (day * H as f64) as i64).map(|_| ())
    }

    /// Example A of the goal: late joining extends the deadline each time.
    #[test]
    fn example_a_late_joining_extends() {
        let mut l = Ladder::open(1, 10, 0, BASE_STAKE);
        assert_eq!(l.deadline(), 7 * H);
        at(&mut l, 2, 20, 6.0).unwrap();
        assert_eq!(l.positions()[1].proposed, 12 * H, "position 2 proposes day 12");
        assert_eq!(l.deadline(), 12 * H);
        at(&mut l, 3, 30, 11.0).unwrap();
        assert_eq!(l.positions()[2].proposed, 16 * H, "position 3 proposes day 16");
        assert_eq!(l.deadline(), 16 * H);
    }

    /// Example B: ten positions in the first day still cannot finish the dispute before day 7.
    #[test]
    fn example_b_rapid_escalation_cannot_finish_before_the_first_window() {
        let mut l = Ladder::open(1, 1, 0, BASE_STAKE);
        for k in 2..=10u32 {
            // Every hour of the first day brings a new entrant with more XP.
            l.admit(k, Kind::Participant, k as i32, i64::from(k)).unwrap();
        }
        assert_eq!(l.len(), 10);
        assert!(l.deadline() >= 7 * H, "never before day 7");
        // Position 10 joined at hour 10 with a three-day window: day ~3.4; the first window (day 7) still governs.
        assert_eq!(l.deadline(), 7 * H, "the shorter windows overlap the first one and move nothing");
        assert!(!l.is_final(7 * H - 1));
        assert!(l.is_final(7 * H));
        assert!(l.positions().iter().skip(1).all(|p| !p.extended()), "none of them extended the deadline");
    }

    /// Example C: overlapping windows, only the late position extends.
    #[test]
    fn example_c_overlapping_windows_extend_only_when_they_end_later() {
        let mut l = Ladder::open(1, 1, 0, BASE_STAKE);
        at(&mut l, 2, 2, 1.0).unwrap(); // own deadline day 1 + 6 = 7
        assert_eq!(l.positions()[1].proposed, 7 * H);
        assert!(!l.positions()[1].extended());
        at(&mut l, 3, 3, 2.0).unwrap(); // day 2 + 5 = 7
        assert_eq!(l.positions()[2].proposed, 7 * H);
        assert!(!l.positions()[2].extended());
        assert_eq!(l.deadline(), 7 * H);
        at(&mut l, 4, 4, 6.0).unwrap(); // day 6 + 4 = 10
        assert_eq!(l.deadline(), 10 * H);
        assert!(l.positions()[3].extended());
        assert_eq!(l.deadline_source(), 4, "provenance: position 4 sets the final deadline");
    }

    /// Example D: the floor applies to each window, not to the total duration.
    #[test]
    fn example_d_each_position_after_the_floor_extends_to_its_own_join_plus_three_days() {
        let mut l = Ladder::open(1, 1, 0, BASE_STAKE);
        let mut xp = 1;
        let mut t = 0;
        for _ in 2..=5 {
            xp += 1;
            t += 1;
            l.admit(xp as u32, Kind::Participant, xp, t).unwrap();
        }
        assert_eq!(l.len(), 5);
        // Now every further position has a three-day window: join late and the deadline moves to join + 3 days each time.
        let mut join = 6 * H;
        for n in 6..=9u32 {
            xp += 1;
            l.admit(n + 100, Kind::Participant, xp, join).unwrap();
            assert_eq!(l.deadline(), join + 3 * H, "position {n}");
            join += 2 * H;
        }
        assert!(l.deadline() > 7 * H + 3 * H, "the dispute outlives a naive three-day maximum");
    }

    #[test]
    fn the_deadline_never_decreases_and_equals_the_maximum_window_end() {
        // Exhaustive small-state check: every sequence of up to six entries over hours 0..=24 with increasing hours.
        fn walk(l: &Ladder<u32>, depth: u32, last_hour: i64, xp: i32, count: &mut u64) {
            let max_end = l.positions().iter().map(|p| p.proposed).max().unwrap();
            assert_eq!(l.deadline(), max_end);
            for w in l.positions().windows(2) {
                assert!(w[1].after >= w[0].after, "deadline never shortens");
                assert_eq!(w[1].before, Some(w[0].after));
            }
            *count += 1;
            if depth == 0 {
                return;
            }
            for hour in [last_hour, last_hour + 1, last_hour + 24, last_hour + 70, last_hour + 150] {
                let mut next = l.clone();
                if next.admit(1000 + l.len(), Kind::Participant, xp + 1, hour).is_ok() {
                    walk(&next, depth - 1, hour, xp + 1, count);
                }
            }
        }
        let mut count = 0;
        walk(&Ladder::open(1, 1, 0, BASE_STAKE), 6, 0, 1, &mut count);
        assert!(count > 1000, "{count} sequences");
    }

    #[test]
    fn refusals_change_neither_the_ordinal_nor_the_timer() {
        let mut l = Ladder::open(1, 10, 0, BASE_STAKE);
        let before = (l.len(), l.deadline(), l.positions().to_vec());
        assert_eq!(l.admit(2, Kind::Participant, 10, H), Err(Refusal::XpNotAbove), "equal XP is not more");
        assert_eq!(l.admit(2, Kind::Participant, 5, H), Err(Refusal::XpNotAbove));
        assert_eq!(l.admit(1, Kind::Participant, 99, H), Err(Refusal::AlreadyParticipant), "a duplicate submission");
        assert_eq!(l.admit(9, Kind::Participant, 99, 7 * H), Err(Refusal::Closed), "at the deadline hour the dispute is final");
        assert_eq!(l.admit(9, Kind::Participant, 99, 8 * H), Err(Refusal::Closed));
        assert!(!l.ballot(5, true), "no ballot before the Council entered");
        assert_eq!((l.len(), l.deadline(), l.positions().to_vec()), before);
        // One hour before the deadline the entry is still admitted.
        l.admit(9, Kind::Participant, 99, 7 * H - 1).unwrap();
        assert_eq!(l.deadline(), 7 * H - 1 + 6 * H, "position 2 window of six days from its own join");
    }

    #[test]
    fn same_hour_entries_apply_in_submission_order_and_each_must_beat_the_one_before() {
        let mut l = Ladder::open(1, 10, 0, BASE_STAKE);
        l.admit(2, Kind::Participant, 20, 5).unwrap();
        // Same hour: a rival with XP 15 is behind the entry just admitted, a rival with 25 is on top of it.
        assert_eq!(l.admit(3, Kind::Participant, 15, 5), Err(Refusal::XpNotAbove));
        l.admit(4, Kind::Participant, 25, 5).unwrap();
        assert_eq!(l.len(), 3);
        assert_eq!(l.positions()[2].who, 4);
        // The opposite submission order gives a different, equally deterministic result.
        let mut m = Ladder::open(1, 10, 0, BASE_STAKE);
        m.admit(4, Kind::Participant, 25, 5).unwrap();
        assert_eq!(m.admit(2, Kind::Participant, 20, 5), Err(Refusal::XpNotAbove));
        assert_eq!(m.len(), 2);
    }

    #[test]
    fn the_council_enters_once_as_one_position_on_the_shared_clock_and_ballots_do_not_move_it() {
        let mut l = Ladder::open(1, 10, 0, BASE_STAKE);
        l.admit(2, Kind::Participant, 20, 2 * H).unwrap();
        let before = l.deadline();
        // A Council member needs no XP: a member with less XP than the last participant still enters, once.
        let p = l.admit(77, Kind::Council, 0, 6 * H).unwrap().clone();
        assert_eq!((p.n, p.side, p.stake), (3, Side::Accuser, 0));
        assert_eq!(p.window, 5 * H, "the ordinary window of its ordinal, no Council-specific window");
        assert_eq!(l.deadline(), before.max(6 * H + 5 * H));
        let deadline = l.deadline();
        assert_eq!(l.admit(78, Kind::Council, 0, 7 * H), Err(Refusal::CouncilEntered), "terminal: no second Council entry");
        assert_eq!(l.admit(5, Kind::Participant, 99, 7 * H), Err(Refusal::CouncilEntered), "and no ordinary entrant after it");
        for (member, vote) in [(77, true), (80, false), (81, false), (82, true)] {
            assert!(l.ballot(member, vote));
        }
        assert!(!l.ballot(80, true), "one ballot per member");
        assert_eq!((l.len(), l.deadline()), (3, deadline), "ballots change neither the ordinal nor the timer");
    }

    #[test]
    fn a_council_majority_decides_and_the_entrant_wins_ties() {
        let mut l = Ladder::open(1, 10, 0, BASE_STAKE);
        l.admit(2, Kind::Participant, 20, H).unwrap();
        l.admit(7, Kind::Council, 0, 2 * H).unwrap();
        assert_eq!(l.winner(), Side::Accuser, "no ballots: the entrant's side");
        l.ballot(7, true);
        l.ballot(8, false);
        assert_eq!(l.winner(), Side::Accuser, "a tie keeps the entrant");
        l.ballot(9, false);
        assert_eq!(l.winner(), Side::Accused, "the equal-vote majority overturns the entrant");
    }

    #[test]
    fn settlement_pays_each_winner_the_stake_below_and_forfeits_to_the_position_above() {
        // Accuser side wins with three positions: 1 (accuser), 2 (defender), 3 (accuser's backer).
        let mut l = Ladder::open(1, 1, 0, 10);
        l.admit(2, Kind::Participant, 2, H).unwrap();
        l.admit(3, Kind::Participant, 3, 2 * H).unwrap();
        let s = l.settle();
        assert_eq!((s.winner, s.winners.clone(), s.losers.clone()), (Side::Accuser, vec![1, 3], vec![2]));
        assert_eq!(s.forfeits, vec![(2, 3, 12)], "the loser at 2 forfeits its stake of 12 to position 3");
        assert!(s.sanction_to_first && s.accused_lost);
        assert_eq!(s.burned_stake, 0);
        // The defender's side wins with two positions: the accuser's stake goes to the first defender.
        let mut m = Ladder::open(1, 1, 0, 10);
        m.admit(2, Kind::Participant, 2, H).unwrap();
        let s = m.settle();
        assert_eq!((s.winner, s.winners.clone(), s.losers.clone()), (Side::Accused, vec![2], vec![1]));
        assert_eq!(s.forfeits, vec![(1, 2, 10)]);
        assert!(!s.sanction_to_first && !s.accused_lost);
        // The Council overturns the top position: its stake (none) and the loser below it... the council entrant has no stake.
        let mut c = Ladder::open(1, 1, 0, 10);
        c.admit(2, Kind::Participant, 2, H).unwrap();
        c.admit(9, Kind::Council, 0, 2 * H).unwrap();
        c.ballot(10, false);
        c.ballot(11, false);
        let s = c.settle();
        assert_eq!((s.winner, s.winners.clone(), s.losers.clone()), (Side::Accused, vec![2], vec![1, 3]));
        assert_eq!(s.forfeits, vec![(1, 2, 10)], "the accuser forfeits to the first defender; the Council entrant staked nothing");
        // A ladder whose top ordinary position is overturned by the Council: the top participant's stake is burned.
        let mut d = Ladder::open(1, 1, 0, 10);
        d.admit(2, Kind::Participant, 2, H).unwrap();
        d.admit(3, Kind::Participant, 3, 2 * H).unwrap();
        d.admit(9, Kind::Council, 0, 3 * H).unwrap();
        d.ballot(10, false);
        d.ballot(11, false);
        let s = d.settle();
        // The Council entrant took position 4 (the defender side); a vote against it hands the win to the accuser side (1, 3).
        assert_eq!((s.winner, s.winners.clone()), (Side::Accuser, vec![1, 3]));
        assert_eq!(s.forfeits, vec![(2, 3, 12)]);
        assert_eq!(s.burned_stake, 0, "the losing Council position staked nothing, so nothing burns");
    }
}
