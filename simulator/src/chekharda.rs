//! The Chekharda dispute ladder as a pure rule engine (D158, D159, D161, D162): positions, per-position response windows,
//! the monotonic shared deadline with its provenance, admission, and the settlement of stakes. It knows nothing about accounts,
//! money custody or the graph; `World` supplies XP and funds and applies the settlement.
//!
//! Rules implemented here (protocol §26.5 and the decision log):
//! - Position `n` (the first challenger is `n = 1`) gets its own window `max(3 days, (8 - n) days)`, which starts when that position
//!   is admitted, not at the previous deadline: windows 7, 6, 5, 4, 3, 3, ... days.
//! - `deadline(1) = joined(1) + 7 days`; `deadline(n) = max(deadline(n - 1), joined(n) + window(n))`. A new valid position preserves or
//!   extends the deadline and can never shorten it; position windows supply the initial shared deadline.
//! - Only a newly admitted position counts. A refused attempt, a duplicate, a notification, evidence, an observation or a Council ballot
//!   changes neither the ordinal nor the deadline.
//! - The Council enters once, collectively, as the terminal position on the same clock (D69, D161): one position, no extra Council window,
//!   and ballots never add positions.
//! - The deadline is a cutoff for ordinary entry. An entered Council recognizes its three-choice vote only at that cutoff (D171).
//!   A majority for deferral, or no majority, adds seven days to the current deadline and starts a fresh, empty round. Council
//!   confirmation or opposition ends the case; deferral keeps the Council terminal and supplies no winner. Entries at the same hour are applied in the order
//!   they are submitted, and each must satisfy the XP and alternation conditions against the entry before it.
//! - Stakes (D159, D185): `stake(k) = ceil(base * SCALE * 1.2^(k-1))` atoms, rounded once at the final 10^-12 FCTY quantum; every winner takes the
//!   stake of the position directly below it and gets its own back; a loser forfeits to the position directly above it; the lowest
//!   winning position is paid from the sanction on the accused (base stake); the stake of a losing top position has no winner above it
//!   and is burned (D179); an adjacent Council position likewise receives none of the forfeited stake.
//!
//! Time is in hours, like the world clock.

use crate::amount::{Amount, SCALE};

pub const DAY_HOURS: i64 = 24;
/// Base stake of the first position, in whole FCTY (D159).
pub const BASE_STAKE: u32 = 7;
/// Stake growth per position: 20% (D159).
pub const STAKE_GROWTH: f64 = 0.20;
/// Retained simulator nominal ceiling, independent of the finer currency quantum; this is not a protocol depth or funding limit.
pub const MAX_STAKE: Amount = Amount::coins(u32::MAX as u64);

/// The response window of position `n` in hours: `max(3, 8 - n)` days (D158).
pub fn window_hours(n: u32) -> i64 {
    assert!(n >= 1, "positions are numbered from 1");
    (8 - i64::from(n)).max(3) * DAY_HOURS
}

/// The exact formula in atoms, rounded upward once at the final currency quantum rather than at intermediate positions.
pub fn stake(n: u32, base: u32) -> Amount {
    checked_stake(n, base).expect("stake exceeds the simulator's u32 whole-FCTY nominal ceiling")
}

/// Exact stake through the retained nominal ceiling; `None` is a simulator numeric limit, not a protocol admission rule.
pub fn checked_stake(n: u32, base: u32) -> Option<Amount> {
    assert!(n >= 1, "positions are numbered from 1");
    if base == 0 {
        return Some(Amount::ZERO);
    }
    // Even base 1 exceeds the u32 whole-FCTY ceiling at position 123. Bound work before computing large powers.
    if n > 122 {
        return None;
    }
    let scaled_base = u128::from(base) * SCALE;
    let limit = MAX_STAKE.atoms();
    if let (Some(num), Some(den)) = (6u128.checked_pow(n - 1).and_then(|v| v.checked_mul(scaled_base)), 5u128.checked_pow(n - 1)) {
        let atoms = num.div_ceil(den);
        return (atoms <= limit).then(|| Amount::from_atoms(atoms));
    }
    // base*SCALE*6^121 needs at most 385 bits; 5^121*(u32::MAX*SCALE) needs at most 353. Sixteen limbs provide 512 bits.
    // Big-endian limbs compare lexically; each schoolbook column fits u64: (2^32-1)^2 + 2*(2^32-1) = 2^64-1.
    fn multiply(limbs: [u32; 16], factor: u128) -> [u32; 16] {
        let mut product = [0; 16];
        for shift in 0..4 {
            let part = ((factor >> (32 * shift)) & u128::from(u32::MAX)) as u32;
            if part == 0 {
                continue;
            }
            let mut carry = 0u64;
            for destination in (0..16 - shift).rev() {
                let value = u64::from(limbs[destination + shift]) * u64::from(part) + u64::from(product[destination]) + carry;
                product[destination] = value as u32;
                carry = value >> 32;
            }
            assert!(carry == 0 && limbs[..shift].iter().all(|&word| word == 0), "stake intermediate exceeds its proven 512-bit bound");
        }
        product
    }
    let mut den = [0; 16];
    den[15] = 1;
    let mut num = multiply(den, scaled_base);
    for _ in 1..n {
        num = multiply(num, 6);
        den = multiply(den, 5);
    }
    if multiply(den, limit) < num {
        return None;
    }
    let (mut lo, mut hi) = (0, limit);
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if multiply(den, mid) >= num {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    Some(Amount::from_atoms(lo))
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
    /// The exact stake exceeds the simulator's retained nominal ceiling. This is a model limit, not a protocol funding gate.
    StakeOverflow,
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
    pub stake: Amount,
}

impl<W> Position<W> {
    /// Whether this position moved the deadline later (an overlapping window that ends earlier changes nothing).
    pub fn extended(&self) -> bool {
        self.before.is_none_or(|b| self.after > b)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CouncilVote {
    Confirm,
    Oppose,
    Defer,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CouncilOutcome {
    Confirm,
    Oppose,
    Defer,
    AutomaticDefer,
}

/// A ballot record alone changes neither the ordinal nor the deadline. World authenticates its round's electorate.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Ballot<W> {
    pub who: W,
    pub choice: CouncilVote,
    pub cast_at: i64,
}

/// One recognized result, retaining the ballots and logical cutoff even if processing happened later.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CouncilRound<W> {
    pub number: u32,
    pub deadline_before: i64,
    pub deadline_after: i64,
    pub recognized_at: i64,
    pub ballots: Vec<Ballot<W>>,
    pub outcome: CouncilOutcome,
}

#[derive(Clone, Debug)]
pub struct Ladder<W> {
    pub opened_at: i64,
    pub base_stake: u32,
    positions: Vec<Position<W>>,
    ballots: Vec<Ballot<W>>,
    rounds: Vec<CouncilRound<W>>,
}

/// What a closed dispute settles: who wins, and every exact transfer of stake.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Settlement {
    pub winner: Side,
    /// Position numbers (ascending) of the winners and the losers.
    pub winners: Vec<u32>,
    pub losers: Vec<u32>,
    /// `(from position, to position, amount)`: a losing stake forfeited to the position directly above it.
    pub forfeits: Vec<(u32, u32, Amount)>,
    /// `(position, amount)`: a losing stake that has no ordinary position above it to receive it, burned: the stake of a losing top
    /// position, or one forfeited toward a Council entry (D179: no ordinary recipient means burn, not Council proceeds).
    pub burns: Vec<(u32, Amount)>,
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
        Ladder { opened_at: now, base_stake, positions: vec![first], ballots: Vec::new(), rounds: Vec::new() }
    }

    pub fn positions(&self) -> &[Position<W>] {
        &self.positions
    }
    pub fn ballots(&self) -> &[Ballot<W>] {
        self.active_ballots()
    }
    pub fn active_ballots(&self) -> &[Ballot<W>] {
        &self.ballots
    }
    pub fn rounds(&self) -> &[CouncilRound<W>] {
        &self.rounds
    }
    pub fn len(&self) -> u32 {
        self.positions.len() as u32
    }
    pub fn is_empty(&self) -> bool {
        self.positions.is_empty()
    }
    /// The current shared deadline, including every recognized Council deferral.
    pub fn deadline(&self) -> i64 {
        self.rounds.last().map_or_else(|| self.position_deadline(), |r| r.deadline_after)
    }
    /// The maximum end point of position windows, excluding Council deferrals.
    pub fn position_deadline(&self) -> i64 {
        self.positions.last().expect("a ladder has a first position").after
    }
    /// The earliest position supplying the position-window maximum, excluding Council deferrals.
    pub fn deadline_source(&self) -> u32 {
        let d = self.position_deadline();
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
    /// An ordinary cutoff is final; an entered Council also requires a recognized final result.
    pub fn is_final(&self, now: i64) -> bool {
        now >= self.deadline() && (!self.council_entered() || self.winner().is_some())
    }
    /// Whether an unresolved Council round needs cutoff recognition; ordinary ladders use `is_final` directly.
    pub fn is_due(&self, now: i64) -> bool {
        now >= self.deadline() && self.council_round().is_some()
    }
    /// Active round numbering starts at zero; a final result has no active round.
    pub fn council_round(&self) -> Option<u32> {
        if !self.council_entered() || self.rounds.last().is_some_and(|r| matches!(r.outcome, CouncilOutcome::Confirm | CouncilOutcome::Oppose)) {
            None
        } else {
            Some(u32::try_from(self.rounds.len()).expect("Council round number exceeds u32"))
        }
    }
    pub fn stake_of_next(&self) -> Option<Amount> {
        checked_stake(self.next_ordinal(), self.base_stake)
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
        if kind == Kind::Participant && self.stake_of_next().is_none() {
            return Err(Refusal::StakeOverflow);
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
            stake: if kind == Kind::Council { Amount::ZERO } else { stake(n, self.base_stake) },
        };
        self.positions.push(position);
        Ok(self.positions.last().expect("just pushed"))
    }

    /// Record one timely ballot per member in the expected active round; electorate authentication belongs to World.
    pub fn ballot(&mut self, who: W, expected_round: u32, choice: CouncilVote, now: i64) -> bool {
        let starts_at = self.rounds.last().map_or_else(|| self.positions.last().unwrap().joined_at, |r| r.recognized_at);
        if self.council_round() != Some(expected_round) || now < starts_at || now >= self.deadline() || self.ballots.iter().any(|b| b.who == who) {
            return false;
        }
        self.ballots.push(Ballot { who, choice, cast_at: now });
        true
    }

    fn outcome(ballots: &[Ballot<W>]) -> CouncilOutcome {
        for (choice, outcome) in
            [(CouncilVote::Confirm, CouncilOutcome::Confirm), (CouncilVote::Oppose, CouncilOutcome::Oppose), (CouncilVote::Defer, CouncilOutcome::Defer)]
        {
            if ballots.iter().filter(|b| b.choice == choice).count() > ballots.len() / 2 {
                return outcome;
            }
        }
        CouncilOutcome::AutomaticDefer
    }

    /// Recognize exactly one round at its cutoff. Deferral adds seven days to that cutoff, never to processing time.
    pub fn close_round(&mut self, expected_round: u32, now: i64) -> Option<CouncilRound<W>> {
        if self.council_round() != Some(expected_round) || now < self.deadline() {
            return None;
        }
        let before = self.deadline();
        let outcome = Self::outcome(&self.ballots);
        let after = if matches!(outcome, CouncilOutcome::Defer | CouncilOutcome::AutomaticDefer) {
            before.checked_add(7 * DAY_HOURS).expect("Council deadline exceeds i64 time representation")
        } else {
            before
        };
        let round = CouncilRound {
            number: expected_round,
            deadline_before: before,
            deadline_after: after,
            recognized_at: before,
            ballots: std::mem::take(&mut self.ballots),
            outcome,
        };
        self.rounds.push(round.clone());
        Some(round)
    }

    /// An ordinary ladder's provisional winning side, or the entered Council's recognized final side.
    pub fn winner(&self) -> Option<Side> {
        let top = self.positions.last().expect("a ladder has a first position");
        if top.kind != Kind::Council {
            return Some(top.side);
        }
        match self.rounds.last().map(|r| r.outcome) {
            Some(CouncilOutcome::Confirm) => Some(top.side),
            Some(CouncilOutcome::Oppose) => Some(top.side.other()),
            _ => None,
        }
    }

    /// Plan settlement for a decided side. World must additionally gate actual settlement with `is_final(now)`.
    pub fn settle(&self) -> Option<Settlement> {
        self.winner().map(|side| self.settle_for(side))
    }

    /// Check internal position, deadline, round and ballot provenance without authenticating the electorate.
    pub fn audit(&self) -> Result<(), String> {
        let mut before = None;
        let mut previous_xp = None;
        let mut council = false;
        for (i, p) in self.positions.iter().enumerate() {
            let n = u32::try_from(i + 1).map_err(|_| "position number overflow")?;
            if council
                || p.n != n
                || p.side != Side::of(n)
                || p.window != window_hours(n)
                || p.joined_at.checked_add(p.window) != Some(p.proposed)
                || p.before != before
                || p.after != before.map_or(p.proposed, |b: i64| b.max(p.proposed))
                || self.positions[..i].iter().any(|earlier| earlier.who == p.who)
                || (i == 0 && (p.kind != Kind::Participant || p.joined_at != self.opened_at))
                || before.is_some_and(|cutoff| p.joined_at >= cutoff)
            {
                return Err(format!("invalid position {n} provenance"));
            }
            match p.kind {
                Kind::Participant => {
                    if previous_xp.is_some_and(|xp| p.xp <= xp) || checked_stake(n, self.base_stake) != Some(p.stake) {
                        return Err(format!("invalid position {n} XP or stake"));
                    }
                    previous_xp = Some(p.xp);
                }
                Kind::Council => {
                    if p.xp != 0 || !p.stake.is_zero() {
                        return Err("Council position has XP or stake".into());
                    }
                    council = true;
                }
            }
            before = Some(p.after);
        }
        let mut deadline = before.ok_or("missing first position")?;
        let mut round_start = self.positions.last().unwrap().joined_at;
        let mut final_result = false;
        if !council && (!self.rounds.is_empty() || !self.ballots.is_empty()) {
            return Err("Council records without Council entry".into());
        }
        for (i, round) in self.rounds.iter().enumerate() {
            let outcome = Self::outcome(&round.ballots);
            let defers = matches!(outcome, CouncilOutcome::Defer | CouncilOutcome::AutomaticDefer);
            let after = if defers { deadline.checked_add(7 * DAY_HOURS).ok_or("Council deadline overflow")? } else { deadline };
            if final_result
                || usize::try_from(round.number).ok() != Some(i)
                || round.deadline_before != deadline
                || round.recognized_at != deadline
                || round.deadline_after != after
                || round.outcome != outcome
                || Self::duplicate_ballots(&round.ballots)
                || round.ballots.iter().any(|b| b.cast_at < round_start || b.cast_at >= deadline)
            {
                return Err(format!("invalid Council round {i} provenance"));
            }
            deadline = after;
            round_start = round.recognized_at;
            final_result = !defers;
        }
        if Self::duplicate_ballots(&self.ballots)
            || (final_result && !self.ballots.is_empty())
            || self.ballots.iter().any(|b| b.cast_at < round_start || b.cast_at >= deadline)
        {
            return Err("invalid active Council ballots".into());
        }
        Ok(())
    }

    fn duplicate_ballots(ballots: &[Ballot<W>]) -> bool {
        ballots.iter().enumerate().any(|(i, b)| ballots[..i].iter().any(|previous| previous.who == b.who))
    }

    /// Settle for a given winning side (a decision taken outside the ladder, such as an accused's accepted proof of reality).
    pub fn settle_for(&self, winner: Side) -> Settlement {
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
        let mut burns = Vec::new();
        for &j in &losers {
            let amount = self.positions[j as usize - 1].stake;
            if amount.is_zero() {
                continue;
            }
            if j < top && self.positions[j as usize].kind == Kind::Participant {
                forfeits.push((j, j + 1, amount));
            } else {
                burns.push((j, amount));
            }
        }
        Settlement { winner, sanction_to_first: winners.first() == Some(&1), accused_lost: winner == Side::Accuser, winners, losers, forfeits, burns }
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
        let s: Vec<String> = (1..=8).map(|n| stake(n, 7).to_string()).collect();
        assert_eq!(s, vec!["7", "8.4", "10.08", "12.096", "14.5152", "17.41824", "20.901888", "25.0822656"]);
        assert_eq!(stake(1, 10), Amount::coins(10));
        assert_eq!(stake(3, 10), Amount::from_atoms(14_400_000_000_000));
        let iterative = Amount::from_atoms((stake(14, 7).atoms() * 6).div_ceil(5));
        assert_eq!(iterative, stake(15, 7) + Amount::from_atoms(1), "rounding earlier positions would overcharge this position by one quantum");
    }

    /// Independent radix-10 schoolbook arithmetic checks q*5^(n-1) >= base*SCALE*6^(n-1) > (q-1)*5^(n-1).
    fn verify_decimal_reference(n: u32, base: u32, amount: Option<Amount>) {
        fn digits(value: u128) -> Vec<u8> {
            value.to_string().bytes().rev().map(|b| b - b'0').collect()
        }
        fn product(a: &[u8], b: &[u8]) -> Vec<u8> {
            let mut columns = vec![0u32; a.len() + b.len()];
            for (i, &left) in a.iter().enumerate() {
                for (j, &right) in b.iter().enumerate() {
                    columns[i + j] += u32::from(left) * u32::from(right);
                }
            }
            for i in 0..columns.len() - 1 {
                columns[i + 1] += columns[i] / 10;
                columns[i] %= 10;
            }
            while columns.len() > 1 && columns.last() == Some(&0) {
                columns.pop();
            }
            assert!(columns.iter().all(|&d| d < 10));
            columns.into_iter().map(|d| d as u8).collect()
        }
        fn compare(a: &[u8], b: &[u8]) -> std::cmp::Ordering {
            a.len().cmp(&b.len()).then_with(|| a.iter().rev().cmp(b.iter().rev()))
        }
        let (mut numerator, mut denominator) = (digits(u128::from(base) * SCALE), digits(1));
        for _ in 1..n {
            numerator = product(&numerator, &[6]);
            denominator = product(&denominator, &[5]);
        }
        if let Some(amount) = amount {
            assert!(compare(&numerator, &product(&denominator, &digits(amount.atoms()))).is_le(), "n={n}, base={base}, q={amount}: rounded too low");
            if amount.is_zero() {
                assert_eq!(numerator, vec![0]);
            } else {
                assert!(compare(&numerator, &product(&denominator, &digits(amount.atoms() - 1))).is_gt(), "n={n}, base={base}, q={amount}: rounded too high");
            }
            assert!(amount <= MAX_STAKE);
        } else {
            assert!(compare(&numerator, &product(&denominator, &digits(MAX_STAKE.atoms()))).is_gt(), "numeric refusal below the nominal ceiling");
        }
    }

    #[test]
    fn exact_stakes_survive_large_intermediate_powers_and_report_amount_limits() {
        // Independently retained whole-coin brackets; the decimal reference below checks the precise final quantum.
        for (n, base, expected) in [(49, 7, 44_239), (50, 7, 53_086), (51, 7, 63_704), (111, 7, 3_589_509_485), (122, 1, 3_810_050_849)] {
            let amount = checked_stake(n, base).unwrap();
            assert!(amount > Amount::coins(expected - 1) && amount <= Amount::coins(expected));
            verify_decimal_reference(n, base, Some(amount));
        }
        assert_eq!(checked_stake(112, 7), None);
        assert_eq!(checked_stake(123, 1), None);
        assert_eq!(checked_stake(1, u32::MAX), Some(MAX_STAKE));
        assert_eq!(MAX_STAKE.atoms(), 4_294_967_295_000_000_000_000);
        assert_eq!(checked_stake(2, u32::MAX), None);
        assert_eq!(checked_stake(u32::MAX, 1), None);
        assert_eq!(checked_stake(u32::MAX, 0), Some(Amount::ZERO));
        for base in [0, 1, 7, 14, 28, u32::MAX] {
            for n in [1, 2, 8, 14, 15, 21, 49, 50, 51, 111, 112, 122, 123] {
                verify_decimal_reference(n, base, checked_stake(n, base));
            }
        }
        for n in 1..=21 {
            verify_decimal_reference(n, 7, checked_stake(n, 7));
        }
        let mut ladder = Ladder::open(1, 1, 0, 7);
        for n in 2..=111 {
            ladder.admit(n, Kind::Participant, n, 0).unwrap();
        }
        let before = (ladder.len(), ladder.deadline());
        assert_eq!(ladder.admit(112, Kind::Participant, 112, 0).map(|_| ()), Err(Refusal::StakeOverflow));
        assert_eq!((ladder.len(), ladder.deadline()), before, "numeric refusal changes no state");
        ladder.admit(112, Kind::Council, 0, 0).unwrap();
        assert_eq!(ladder.positions().last().unwrap().stake, Amount::ZERO, "Council entry has no stake and remains representable");
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
        assert!(!l.ballot(5, 0, CouncilVote::Confirm, H), "no ballot before the Council entered");
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
        assert_eq!((p.n, p.side, p.stake), (3, Side::Accuser, Amount::ZERO));
        assert_eq!(p.window, 5 * H, "the ordinary window of its ordinal, no Council-specific window");
        assert_eq!(l.deadline(), before.max(6 * H + 5 * H));
        let deadline = l.deadline();
        assert_eq!(l.admit(78, Kind::Council, 0, 7 * H), Err(Refusal::CouncilEntered), "terminal: no second Council entry");
        assert_eq!(l.admit(5, Kind::Participant, 99, 7 * H), Err(Refusal::CouncilEntered), "and no ordinary entrant after it");
        for (member, vote) in [(77, CouncilVote::Confirm), (80, CouncilVote::Oppose), (81, CouncilVote::Oppose), (82, CouncilVote::Confirm)] {
            assert!(l.ballot(member, 0, vote, 7 * H));
        }
        assert!(!l.ballot(80, 0, CouncilVote::Confirm, 7 * H), "one ballot per member");
        assert_eq!((l.len(), l.deadline()), (3, deadline), "ballots change neither the ordinal nor the timer");
    }

    #[test]
    fn council_majorities_are_recognized_only_at_cutoff_with_no_quorum() {
        for (vote, outcome, winner) in
            [(CouncilVote::Confirm, CouncilOutcome::Confirm, Side::Accuser), (CouncilVote::Oppose, CouncilOutcome::Oppose, Side::Accused)]
        {
            let mut l = council_fixture();
            let cutoff = l.deadline();
            assert!(l.ballot(7, 0, vote, cutoff - 1));
            assert_eq!(l.winner(), None);
            assert_eq!(l.settle(), None);
            assert_eq!(l.close_round(0, cutoff - 1), None);
            assert!(!l.is_final(cutoff));
            assert!(l.is_due(cutoff));
            let result = l.close_round(0, cutoff + 10).unwrap();
            assert_eq!((result.outcome, result.recognized_at, result.deadline_before, result.deadline_after), (outcome, cutoff, cutoff, cutoff));
            assert_eq!(l.winner(), Some(winner), "one cast vote is a simple majority without quorum");
            assert!(l.is_final(cutoff));
            assert!(!l.is_due(cutoff));
            assert_eq!(l.council_round(), None);
            assert_eq!(l.settle().unwrap().winner, winner);
            assert_eq!(l.close_round(0, cutoff), None);
            assert!(!l.ballot(8, 0, vote, cutoff - 1));
            l.audit().unwrap();
        }
    }

    fn council_fixture() -> Ladder<u32> {
        let mut l = Ladder::open(1, 10, 0, BASE_STAKE);
        l.admit(2, Kind::Participant, 20, H).unwrap();
        l.admit(7, Kind::Council, 0, 2 * H).unwrap();
        l
    }

    #[test]
    fn deferrals_repeat_on_fresh_rounds_and_replays_cannot_extend_twice() {
        let mut l = council_fixture();
        let original = l.deadline();
        let positions = l.positions().to_vec();
        assert_eq!(l.council_round(), Some(0));
        assert!(!l.ballot(7, 1, CouncilVote::Defer, original - 1));
        assert!(!l.ballot(7, 0, CouncilVote::Defer, H), "not before Council entry");
        assert!(l.ballot(7, 0, CouncilVote::Defer, original - 1));
        assert!(!l.ballot(8, 0, CouncilVote::Confirm, original));
        assert!(!l.ballot(8, 0, CouncilVote::Confirm, original + 1));
        let first = l.close_round(0, original + H).unwrap();
        assert_eq!((first.outcome, first.deadline_after), (CouncilOutcome::Defer, original + 7 * H));
        assert_eq!(first.ballots, vec![Ballot { who: 7, choice: CouncilVote::Defer, cast_at: original - 1 }]);
        assert_eq!(l.close_round(0, original + 20 * H), None);
        assert_eq!(l.council_round(), Some(1));
        assert!(l.active_ballots().is_empty());
        assert!(!l.ballot(7, 0, CouncilVote::Defer, original));
        assert!(l.ballot(7, 1, CouncilVote::Defer, original), "a new round permits the same member anew");
        let second = l.close_round(1, original + 7 * H).unwrap();
        assert_eq!((second.outcome, second.deadline_after), (CouncilOutcome::Defer, original + 14 * H));
        assert_eq!(l.position_deadline(), original);
        assert_eq!(l.deadline_source(), 1);
        assert_eq!(l.positions(), positions);
        assert_eq!(l.winner(), None);
        assert_eq!(l.settle(), None);
        assert!(!l.is_final(original + 14 * H));
        assert_eq!(l.admit(9, Kind::Participant, 100, original + H), Err(Refusal::CouncilEntered));
        let third = l.close_round(2, original + 100 * H).unwrap();
        assert_eq!((third.outcome, third.recognized_at, third.deadline_after), (CouncilOutcome::AutomaticDefer, original + 14 * H, original + 21 * H));
        assert_eq!(l.rounds().len(), 3);
        assert_eq!(l.council_round(), Some(3));
        assert!(l.ballot(7, 3, CouncilVote::Confirm, original + 14 * H));
        assert_eq!(l.close_round(3, original + 21 * H).unwrap().outcome, CouncilOutcome::Confirm, "old deferral votes never carry forward");
        assert_eq!(l.winner(), Some(Side::Accuser));
        assert!(l.is_final(original + 21 * H));
        l.audit().unwrap();
    }

    #[test]
    fn empty_and_split_rounds_automatically_defer_once() {
        for votes in [
            vec![],
            vec![CouncilVote::Confirm, CouncilVote::Oppose],
            vec![CouncilVote::Confirm, CouncilVote::Oppose, CouncilVote::Defer],
            vec![CouncilVote::Confirm, CouncilVote::Confirm, CouncilVote::Oppose, CouncilVote::Defer],
        ] {
            let mut l = council_fixture();
            let cutoff = l.deadline();
            for (i, vote) in votes.into_iter().enumerate() {
                assert!(l.ballot(10 + i as u32, 0, vote, cutoff - 1));
            }
            let result = l.close_round(0, cutoff).unwrap();
            assert_eq!(result.outcome, CouncilOutcome::AutomaticDefer);
            assert_eq!(l.deadline(), cutoff + 7 * H);
            assert_eq!(l.close_round(0, cutoff), None);
            assert_eq!(l.close_round(1, cutoff), None);
            assert!(!l.is_due(cutoff));
            l.audit().unwrap();
        }
    }

    #[test]
    fn ordinary_cutoff_needs_no_council_recognition_and_audit_detects_corruption() {
        let mut l = Ladder::open(1, 10, 0, BASE_STAKE);
        assert!(!l.is_final(l.deadline() - 1));
        assert!(l.is_final(l.deadline()));
        assert!(!l.is_due(l.deadline()));
        assert_eq!(l.winner(), Some(Side::Accuser));
        assert_eq!(l.close_round(0, l.deadline()), None);
        l.audit().unwrap();
        l.positions[0].after += 1;
        assert!(l.audit().is_err());
        let mut c = council_fixture();
        c.close_round(0, c.deadline()).unwrap();
        c.rounds[0].deadline_after += 1;
        assert!(c.audit().is_err());
        let mut c = council_fixture();
        c.ballot(7, 0, CouncilVote::Confirm, 2 * H);
        c.close_round(0, c.deadline()).unwrap();
        c.rounds[0].ballots.push(Ballot { who: 7, choice: CouncilVote::Oppose, cast_at: 2 * H });
        assert!(c.audit().is_err());
        let mut c = council_fixture();
        c.ballot(7, 0, CouncilVote::Defer, 2 * H);
        c.close_round(0, c.deadline()).unwrap();
        c.rounds[0].ballots[0].cast_at = c.rounds[0].deadline_before;
        assert!(c.audit().is_err(), "a ballot exactly at cutoff is not timely");
    }

    #[test]
    fn settlement_pays_each_winner_the_stake_below_and_forfeits_to_the_position_above() {
        // Accuser side wins with three positions: 1 (accuser), 2 (defender), 3 (accuser's backer).
        let mut l = Ladder::open(1, 1, 0, 10);
        l.admit(2, Kind::Participant, 2, H).unwrap();
        l.admit(3, Kind::Participant, 3, 2 * H).unwrap();
        let s = l.settle().unwrap();
        assert_eq!((s.winner, s.winners.clone(), s.losers.clone()), (Side::Accuser, vec![1, 3], vec![2]));
        assert_eq!(s.forfeits, vec![(2, 3, Amount::coins(12))], "the loser at 2 forfeits its stake of 12 to position 3");
        assert!(s.sanction_to_first && s.accused_lost);
        assert!(s.burns.is_empty());
        // The defender's side wins with two positions: the accuser's stake goes to the first defender.
        let mut m = Ladder::open(1, 1, 0, 10);
        m.admit(2, Kind::Participant, 2, H).unwrap();
        let s = m.settle().unwrap();
        assert_eq!((s.winner, s.winners.clone(), s.losers.clone()), (Side::Accused, vec![2], vec![1]));
        assert_eq!(s.forfeits, vec![(1, 2, Amount::coins(10))]);
        assert!(!s.sanction_to_first && !s.accused_lost);
        // The Council overturns the top position: its stake (none) and the loser below it... the council entrant has no stake.
        let mut c = Ladder::open(1, 1, 0, 10);
        c.admit(2, Kind::Participant, 2, H).unwrap();
        c.admit(9, Kind::Council, 0, 2 * H).unwrap();
        c.ballot(10, 0, CouncilVote::Oppose, 2 * H);
        c.ballot(11, 0, CouncilVote::Oppose, 2 * H);
        c.close_round(0, c.deadline()).unwrap();
        let s = c.settle().unwrap();
        assert_eq!((s.winner, s.winners.clone(), s.losers.clone()), (Side::Accused, vec![2], vec![1, 3]));
        assert_eq!(s.forfeits, vec![(1, 2, Amount::coins(10))], "the accuser forfeits to the first defender; the Council entrant staked nothing");
        assert!(s.burns.is_empty());
        // A ladder whose top ordinary position is overturned by the Council: the top participant's stake is burned.
        let mut d = Ladder::open(1, 1, 0, 10);
        d.admit(2, Kind::Participant, 2, H).unwrap();
        d.admit(3, Kind::Participant, 3, 2 * H).unwrap();
        d.admit(9, Kind::Council, 0, 3 * H).unwrap();
        d.ballot(10, 0, CouncilVote::Oppose, 3 * H);
        d.ballot(11, 0, CouncilVote::Oppose, 3 * H);
        d.close_round(0, d.deadline()).unwrap();
        let s = d.settle().unwrap();
        // The Council entrant took position 4 (the defender side); a vote against it hands the win to the accuser side (1, 3).
        assert_eq!((s.winner, s.winners.clone()), (Side::Accuser, vec![1, 3]));
        assert_eq!(s.forfeits, vec![(2, 3, Amount::coins(12))]);
        assert!(s.burns.is_empty(), "the losing Council position staked nothing, so nothing burns");
    }

    #[test]
    fn a_stake_forfeited_toward_the_council_or_lost_at_the_top_is_burned() {
        // 1 accuser, 2 defender (9), Council 3 on the accuser side: the Council wins, so the defender's stake has no ordinary recipient.
        let mut l = Ladder::open(1, 1, 0, 10);
        l.admit(2, Kind::Participant, 2, H).unwrap();
        l.admit(9, Kind::Council, 0, 2 * H).unwrap();
        l.ballot(9, 0, CouncilVote::Confirm, 2 * H);
        l.close_round(0, l.deadline()).unwrap();
        let s = l.settle().unwrap();
        assert_eq!(s.winner, Side::Accuser);
        assert!(s.forfeits.is_empty());
        assert_eq!(s.burns, vec![(2, Amount::coins(12))]);
        // A lone accusation that the accused wins by an outside proof: the top position is the loser, nobody above it.
        let lone = Ladder::open(1, 1, 0, 10);
        let s = lone.settle_for(Side::Accused);
        assert_eq!((s.winners.clone(), s.losers.clone(), s.burns.clone()), (vec![], vec![1], vec![(1, Amount::coins(10))]));
        assert!(!s.accused_lost);
    }

    /// An adversary with a chain of eligible accounts that enters in the last hour before each deadline holds the accused for the sum
    /// of the windows minus one hour per entry: the engine agrees with the closed form of the prolongation study.
    #[test]
    fn last_hour_entries_prolong_a_dispute_by_each_window_minus_an_hour() {
        let mut l = Ladder::open(0, 0, 0, BASE_STAKE);
        let mut expected = 7 * H;
        for n in 2..=21u32 {
            let join = l.deadline() - 1;
            l.admit(n, Kind::Participant, n as i32, join).unwrap();
            expected = expected.max(join + window_hours(n));
            assert_eq!(l.deadline(), expected);
        }
        // 20 entries: 7 days + 6 + 5 + 4 + 3 * 17 days minus 20 hours, with the exact last stake rounded once at the final quantum.
        assert_eq!(l.deadline(), (7 + 6 + 5 + 4 + 3 * 17) * H - 20);
        assert_eq!(stake(21, BASE_STAKE), Amount::from_atoms(268_363_199_471_324));
        let total: Amount = l.positions().iter().map(|p| p.stake).sum();
        assert!(total > Amount::coins(1575) && total < Amount::coins(1576));
        // The Council, entering once, ends the escalation: no further entry is possible.
        l.admit(99, Kind::Council, 0, l.deadline() - 1).unwrap();
        assert_eq!(l.admit(100, Kind::Participant, 1000, l.deadline() - 1), Err(Refusal::CouncilEntered));
    }
}
