//! Ordinary dispute cases: stake custody, ladder admission, Council ballots, settlement, identity verdicts, case-specific
//! restoration and the integrity penalty history. World owns every protocol-economic mutation; the appeal and Self-ID
//! fixtures reuse these primitives without inheriting their conventions.
use super::*;

impl World {
    fn reserve_stake(&mut self, who: Id, amount: Amount) -> Amount {
        let reserved = amount.min(self.spendable(who));
        self.subjects[who as usize].reserved += reserved;
        reserved
    }

    /// After other filing checks, reserve the full first stake from spendable Collector FCTY or refuse without mutation.
    pub(super) fn reserve_opening_stake(&mut self, who: Id, required: Amount) -> Result<Amount, Reject> {
        if self.spendable(who) < required {
            return Err(UNFUNDED_OPENING);
        }
        self.subjects[who as usize].reserved += required;
        Ok(required)
    }

    /// Free pending cancellation returns the whole filing-time reservation, exactly once (the caller moves the stage first).
    pub(super) fn release_opening_stake(&mut self, who: Id, reserved: Amount) {
        let subject = &mut self.subjects[who as usize];
        assert!(subject.reserved >= reserved, "a pending opening owns its reservation");
        subject.reserved -= reserved;
    }

    pub(super) fn require_dispute_slot(&self, accused: Id) -> Result<(), Reject> {
        if self.dispute_slots.contains_key(&accused) {
            return Err(Reject("the accused already has an unresolved dispute"));
        }
        Ok(())
    }

    pub(super) fn occupy_dispute_slot(&mut self, accused: Id, case: DisputeId) {
        assert!(self.dispute_slots.insert(accused, case).is_none());
    }

    pub(super) fn free_dispute_slot(&mut self, accused: Id, case: DisputeId) {
        assert_eq!(self.dispute_slots.remove(&accused), Some(case));
    }

    pub(super) fn require_opening_canceller(&self, actor: Id, author: Id, guarantors: &[Id]) -> Result<(), Reject> {
        self.require_account(actor)?;
        if actor != author && !guarantors.contains(&actor) {
            return Err(Reject("not the opening author or a recording-time guarantor"));
        }
        Ok(())
    }

    pub(super) fn stake_at(&self, ordinal: u32) -> Amount {
        self.cfg.base_stake.map_or(Amount::ZERO, |base| chekharda::stake(ordinal, base))
    }

    /// Restrict an account for a case (D77) and, when `path`, exclude it from counted paths (D131/D157).
    pub(super) fn hold_for(&mut self, id: Id, path: bool) {
        self.hold[id as usize] += 1;
        if path && self.cfg.exclude_disputed {
            self.path_hold[id as usize] += 1;
            self.blocked[id as usize] = true;
            self.self_paths = None;
        }
    }

    pub(super) fn release_hold(&mut self, id: Id, path: bool) {
        self.hold[id as usize] -= 1;
        if path && self.cfg.exclude_disputed {
            self.path_hold[id as usize] -= 1;
            self.self_paths = None;
        }
        self.blocked[id as usize] = (self.cfg.exclude_disputed && self.path_hold[id as usize] > 0) || self.base_blocked(id);
    }

    /// Supply an already-active dispute fixture without inventing an earlier raw opening transaction.
    /// Normal transaction recording uses `record_case_opening` and activates only after its 24-hour maturity.
    pub fn begin_case(&mut self, subjects: &[Id]) -> Result<u32, Reject> {
        if subjects.len() != 2 || subjects[0] == subjects[1] {
            return Err(Reject("participation requires distinct case subjects"));
        }
        for &s in subjects {
            self.require_account(s)?;
        }
        let (challenger, accused) = (subjects[0], subjects[1]);
        self.require_dispute_slot(accused)?;
        self.now.checked_add(chekharda::window_hours(1)).ok_or(Reject("opening deadline exceeds the simulator's time representation"))?;
        let backing = self.reserve_opening_stake(challenger, self.stake_at(1))?;
        let case = self.allocate_case();
        self.occupy_dispute_slot(accused, DisputeId::Case(case));
        self.activate_ordinary_case(case, challenger, accused, self.xp(challenger), backing);
        Ok(case)
    }

    /// Record an accepted opening as one atomic transaction (D199): validate, price the first stake, check spendable
    /// Collector FCTY, then reserve it exclusively, record the pending opening with its frozen XP and guarantor roster,
    /// and occupy the accused's slot. A refusal at any step allocates no case ID and changes no balance or slot.
    pub fn record_case_opening(&mut self, subjects: &[Id]) -> Result<u32, Reject> {
        if subjects.len() != 2 || subjects[0] == subjects[1] {
            return Err(Reject("participation requires distinct case subjects"));
        }
        for &id in subjects {
            if id as usize >= self.subjects.len() {
                return Err(Reject("no such account"));
            }
            self.require_account(id)?;
        }
        let (author, accused) = (subjects[0], subjects[1]);
        self.require_dispute_slot(accused)?;
        let author_xp_at_recording = self.xp(author);
        if author_xp_at_recording <= self.xp(accused) {
            return Err(Reject("XP is not above the challenged transaction owner"));
        }
        let matures_at = self.opening_maturity_at()?;
        let reserved_stake = self.reserve_opening_stake(author, self.stake_at(1))?;
        let opening = OpeningRecord {
            author,
            accused,
            recorded_at: self.now,
            matures_at,
            author_xp_at_recording,
            accused_xp_at_recording: self.xp(accused),
            guarantors: self.mutual_partners(author),
            reserved_stake,
            activated_at: None,
            stage: OpeningStage::Pending,
        };
        let case = self.allocate_case();
        self.case_openings[case as usize] = Some(opening);
        self.occupy_dispute_slot(accused, DisputeId::Case(case));
        self.stats.openings_recorded += 1;
        Ok(case)
    }

    pub(super) fn opening_maturity_at(&self) -> Result<i64, Reject> {
        self.now
            .checked_add(MATURITY_HOURS)
            .filter(|at| at.checked_add(chekharda::window_hours(1)).is_some())
            .ok_or(Reject("opening maturity/deadline exceeds the simulator's time representation"))
    }

    pub(super) fn allocate_case(&mut self) -> u32 {
        let case = self.cases.len() as u32;
        self.cases.push(None);
        self.case_openings.push(None);
        self.case_cancellations.push(None);
        self.case_effects.push(None);
        self.case_outcomes.push(None);
        self.self_id_cases.push(None);
        self.self_id_settlements.push(None);
        case
    }

    pub fn case_opening(&self, case: u32) -> Option<&OpeningRecord> {
        self.case_openings.get(case as usize).and_then(Option::as_ref)
    }

    pub fn pending_openings(&self) -> usize {
        self.case_openings.iter().flatten().filter(|o| o.stage == OpeningStage::Pending).count()
    }

    pub fn cancel_pending_opening(&mut self, case: u32, actor: Id) -> Result<(), Reject> {
        let opening = self.case_opening(case).ok_or(Reject("no recorded opening"))?;
        if opening.pending_activation_at().is_none_or(|at| self.now >= at) {
            return Err(Reject("the opening is not pending before maturity"));
        }
        self.require_opening_canceller(actor, opening.author, &opening.guarantors)?;
        let (author, accused, reserved) = (opening.author, opening.accused, opening.reserved_stake);
        self.case_openings[case as usize].as_mut().expect("recorded opening").stage = OpeningStage::Cancelled;
        self.case_cancellations[case as usize] = Some(CancellationOutcome { case, author, accused, cancelled_by: actor, cancelled_at: self.now });
        self.stats.openings_cancelled += 1;
        self.release_opening_stake(author, reserved);
        self.free_dispute_slot(accused, DisputeId::Case(case));
        Ok(())
    }

    pub fn case_cancellation(&self, case: u32) -> Option<&CancellationOutcome> {
        self.case_cancellations.get(case as usize).and_then(Option::as_ref)
    }

    pub fn case_outcome(&self, case: u32) -> Option<&CaseOutcome> {
        self.case_outcomes.get(case as usize).and_then(Option::as_ref)
    }

    /// Ordinary-case operations do not act on the independent Self-ID transaction fixture, which owns its own lifecycle.
    pub(super) fn require_ordinary_case(&self, case: u32) -> Result<(), Reject> {
        if self.self_id_cases.get(case as usize).is_some_and(Option::is_some) {
            return Err(Reject("Self-ID transaction cases use their own fixture lifecycle"));
        }
        Ok(())
    }

    pub fn cancel_case_opening(&mut self, case: u32, actor: Id) -> Result<CancellationOutcome, Reject> {
        self.require_ordinary_case(case)?;
        self.cancel_pending_opening(case, actor)?;
        Ok(self.case_cancellation(case).expect("just cancelled pending opening").clone())
    }

    /// Activation at 24 hours is deterministic (D199): the filing-time reservation becomes the first position's custody
    /// unchanged. Funding is not rechecked or reserved again, whatever the author's free balance did meanwhile.
    pub(super) fn activate_recorded_case(&mut self, case: u32) {
        let opening = self.case_opening(case).expect("recorded opening");
        let (author, accused, xp, backing) = (opening.author, opening.accused, opening.author_xp_at_recording, opening.reserved_stake);
        self.activate_ordinary_case(case, author, accused, xp, backing);
        let opening = self.case_openings[case as usize].as_mut().expect("recorded opening");
        opening.stage = OpeningStage::Activated;
        opening.activated_at = Some(self.now);
        self.stats.openings_activated += 1;
    }

    fn activate_ordinary_case(&mut self, case_id: u32, challenger: Id, accused: Id, admission_xp: i32, backed: Amount) {
        let stake = self.stake_at(1);
        let ladder = Ladder::open(challenger, admission_xp, self.now, self.cfg.base_stake.unwrap_or(0));
        self.stats.staked += stake;
        self.stats.opened += 1;
        self.stats.max_positions = self.stats.max_positions.max(1);
        self.install_active_case(case_id, accused, ladder, backed);
    }

    /// Install a newly opened ladder using its existing reservation and the first position's activation time.
    /// Ordinary and Self-ID cases share activity, path and maturity holds, but price and count their openings separately.
    pub(super) fn install_active_case(&mut self, id: u32, accused: Id, ladder: Ladder<Id>, backed: Amount) {
        let first = &ladder.positions()[0];
        let at = first.joined_at;
        let holds = vec![(first.who, at, !self.cfg.exclude_targets_only), (accused, at, true)];
        for &(subject, _, path) in &holds {
            self.hold_for(subject, path);
        }
        self.suspend_accused(DisputeId::Case(id), accused, at);
        self.cases[id as usize] = Some(Case { ladder, electorates: Vec::new(), accused, backed: vec![backed], holds });
    }

    pub(super) fn case_ref(&self, case: u32) -> Result<&Case, Reject> {
        self.cases.get(case as usize).and_then(Option::as_ref).ok_or(Reject("no such open case"))
    }

    /// The shared deadline of an open case (hours).
    pub fn case_deadline(&self, case: u32) -> Option<i64> {
        self.case_ref(case).ok().map(|c| c.ladder.deadline())
    }
    /// Whether the case is final now: the deadline is the cutoff (D167).
    pub fn case_final(&self, case: u32) -> bool {
        self.case_ref(case).is_ok_and(|c| c.ladder.is_final(self.now))
    }
    /// `(positions, XP the next entrant must exceed, stake of the next position, side of the next position, Council entered)`.
    pub fn case_state(&self, case: u32) -> Option<(u32, i32, Option<Amount>, Side, bool)> {
        let c = self.case_ref(case).ok()?;
        let next = self.cfg.base_stake.map_or(Some(Amount::ZERO), |base| chekharda::checked_stake(c.ladder.next_ordinal(), base));
        Some((c.ladder.len(), c.ladder.xp_to_beat(), next, c.ladder.next_side(), c.ladder.council_entered()))
    }
    /// Provenance of a case's deadline: every position with its window, proposal and the deadline before and after it.
    pub fn case_positions(&self, case: u32) -> Vec<chekharda::Position<Id>> {
        self.case_ref(case).map_or_else(|_| Vec::new(), |c| c.ladder.positions().to_vec())
    }
    /// The current voting round and its frozen electorate; final Council decisions have no active round.
    pub fn case_council_round(&self, case: u32) -> Option<&CouncilElectorate> {
        let c = self.case_ref(case).ok()?;
        let number = c.ladder.council_round()?;
        c.electorates.iter().find(|e| e.number == number)
    }
    pub fn case_council_rounds(&self, case: u32) -> &[CouncilRound<Id>] {
        self.case_ref(case).map_or(&[], |c| c.ladder.rounds())
    }
    pub fn case_accused(&self, case: u32) -> Option<Id> {
        self.case_ref(case).ok().map(|c| c.accused)
    }

    /// An ordinary entry: the next position takes the side opposite to the last one, needs more XP than the last ordinary participant,
    /// and reserves available liquid FCTY. Returns the ordinal. Only an admitted position changes the ordinal, the deadline,
    /// the custody and the restrictions; a refusal changes nothing.
    pub fn join_case(&mut self, case: u32, who: Id) -> Result<u32, Reject> {
        self.require_ordinary_case(case)?;
        self.require_account(who)?;
        let xp = self.subjects[who as usize].xp;
        let (check, ordinal) = {
            let c = self.case_ref(case)?;
            (c.ladder.check(who, PositionKind::Participant, xp, self.now), c.ladder.next_ordinal())
        };
        if let Err(r) = check {
            return Err(self.refuse(r));
        }
        let stake = self.stake_at(ordinal);
        let backed = self.reserve_stake(who, stake);
        self.stats.refused_funds += u64::from(backed < stake);
        self.admit(case, who, PositionKind::Participant, xp, stake, backed)
    }

    /// Collective Council entry (D161): any Council member, no XP condition and no stake, one terminal position on the shared clock.
    pub fn council_join(&mut self, case: u32, member: Id) -> Result<u32, Reject> {
        self.require_ordinary_case(case)?;
        self.require_account(member)?;
        if !self.council_mask.get(member as usize).copied().unwrap_or(false) {
            return Err(Reject("not a Council member"));
        }
        let check = self.case_ref(case)?.ladder.check(member, PositionKind::Council, 0, self.now);
        if let Err(r) = check {
            return Err(self.refuse(r));
        }
        let ordinal = self.admit(case, member, PositionKind::Council, 0, Amount::ZERO, Amount::ZERO)?;
        let c = self.cases[case as usize].as_mut().expect("admitted case");
        c.electorates.push(CouncilElectorate {
            number: c.ladder.council_round().expect("Council entry starts a round"),
            started_at: self.now,
            members: self.council.clone(),
        });
        self.stats.council_entries += 1;
        Ok(ordinal)
    }

    fn refuse(&mut self, r: Refusal) -> Reject {
        match r {
            Refusal::Closed => {
                self.stats.refused_closed += 1;
                Reject("the dispute is final")
            }
            Refusal::AlreadyParticipant => Reject("already a participant"),
            Refusal::XpNotAbove => {
                self.stats.refused_xp += 1;
                Reject("XP is not above the previous participant")
            }
            Refusal::CouncilEntered => Reject("the Council entered; it is the terminal entrant"),
            Refusal::StakeOverflow => Reject("stake exceeds the simulator's retained nominal ceiling"),
        }
    }

    fn admit(&mut self, case: u32, who: Id, kind: PositionKind, xp: i32, stake: Amount, backed: Amount) -> Result<u32, Reject> {
        let now = self.now;
        let c = self.cases[case as usize].as_mut().expect("checked open");
        let (n, extended) = {
            let p = c.ladder.admit(who, kind, xp, now).map_err(|_| Reject("entry refused"))?;
            (p.n, p.extended())
        };
        c.holds.push((who, now, false));
        c.backed.push(backed);
        self.stats.staked += stake;
        self.stats.joined += 1;
        self.stats.extensions += u64::from(extended);
        self.stats.max_positions = self.stats.max_positions.max(n);
        self.hold_for(who, false);
        Ok(n)
    }

    /// A Council ballot (D66, D111): recorded for the vote only; it never changes the ordinal or the deadline.
    pub fn council_ballot(&mut self, case: u32, member: Id, expected_round: u32, choice: CouncilVote) -> bool {
        let Some(c) = self.cases.get_mut(case as usize).and_then(Option::as_mut) else { return false };
        if !c.electorates.last().is_some_and(|e| e.number == expected_round && e.members.contains(&member)) {
            return false;
        }
        let ok = c.ladder.ballot(member, expected_round, choice, self.now);
        if ok {
            self.stats.ballots += 1;
        }
        ok
    }

    /// Release the restrictions and the custody of a case; returns the hours each restricted account was held.
    pub(super) fn release_case(&mut self, case: &Case) -> Vec<(Id, i64)> {
        let mut held = Vec::with_capacity(case.holds.len());
        for &(id, since, path) in &case.holds {
            held.push((id, self.now - since));
            self.release_hold(id, path);
        }
        self.frozen[case.accused as usize] -= 1;
        for (p, b) in case.ladder.positions().iter().zip(&case.backed) {
            self.subjects[p.who as usize].reserved -= *b;
        }
        self.stats.hold_hours += held.iter().map(|&(_, h)| h).sum::<i64>();
        held
    }

    /// Collect liquid and mature Emitter rights; any shortfall becomes debt. Returns actual collection.
    pub(super) fn charge(&mut self, id: Id, amount: Amount, case: u32) -> Amount {
        let mut collected = amount.min(self.spendable(id));
        if collected < amount {
            for act in self.eligible_emissions(id, MATURITY_HOURS) {
                self.dispose(act, ActStatus::Converted);
                collected += (amount - collected).min(Amount::ONE);
                if collected == amount {
                    break;
                }
            }
        }
        self.subjects[id as usize].liquid -= collected;
        self.record_debt(id, amount - collected, case);
        collected
    }

    pub(super) fn record_debt(&mut self, id: Id, amount: Amount, case: u32) {
        if !amount.is_zero() {
            let subject = &mut self.subjects[id as usize];
            subject.debt_tranches.push(DebtTranche { case, amount, remaining: amount, repaid: Amount::ZERO, cancelled: Amount::ZERO });
            subject.debt += amount;
            self.stats.debt_created += amount;
        }
    }

    fn add_debt(&mut self, id: Id, amount: Amount, case: u32, debts: &mut Vec<(Id, Amount)>) {
        if !amount.is_zero() {
            self.record_debt(id, amount, case);
            debts.push((id, amount));
        }
    }

    pub(super) fn destroy_liquid(&mut self, amount: Amount) {
        self.liquid_destroyed += amount;
        self.burned += amount;
    }

    /// Settle a case at its deadline (D159, D161, D162): `forced` overrides the winning side when a process outside the ladder decided it
    /// (the proof of reality of a genuine accused, D136); otherwise the last unopposed side wins, or the Council's equal-vote majority once
    /// it entered. Every winner takes its stake back and the stake of the position directly below it; every loser forfeits to the position
    /// directly above it (the stake of a losing top position is burned); losing participants lose half their XP; when the accused lost, the
    /// base stake is charged to the accused (paid to the accuser) and to each actual historical XP-receiving guarantor (burned), the uncollectible
    /// part becoming debt. Refused before the deadline.
    pub fn settle_case(&mut self, case: u32, forced: Option<Side>) -> Result<CaseOutcome, Reject> {
        self.require_ordinary_case(case)?;
        if !self.case_final(case) {
            return Err(Reject("the dispute is not final yet"));
        }
        let c = self.cases[case as usize].take().expect("final implies open");
        let mut settlement = c.ladder.settle().expect("final Council decision or ordinary cutoff");
        if let Some(side) = forced {
            if side != settlement.winner {
                // Recompute the settlement for the forced side with the same ladder.
                settlement = c.ladder.settle_for(side);
            }
        }
        let positions: Vec<chekharda::Position<Id>> = c.ladder.positions().to_vec();
        let who_at = |n: u32| positions[n as usize - 1].who;
        let holds = self.release_case(&c);
        let mut net: Vec<(Id, SignedAmount)> = Vec::new();
        let mut debts: Vec<(Id, Amount)> = Vec::new();
        // D166: a lost stake pays what was blocked; the unblocked part is debt of the loser (a negative emission balance, repaid from later
        // emission) and is never paid to the winner.
        for &(from, to, amount) in &settlement.forfeits {
            let (f, t) = (who_at(from), who_at(to));
            let paid = c.backed[from as usize - 1];
            self.subjects[f as usize].liquid -= paid;
            self.subjects[t as usize].liquid += paid;
            self.stats.forfeited += paid;
            net.push((f, SignedAmount::negative(paid).expect("collected value fits signed accounting")));
            net.push((t, SignedAmount::from_amount(paid).expect("collected value fits signed accounting")));
            self.add_debt(f, amount - paid, case, &mut debts);
        }
        for &(position, amount) in &settlement.burns {
            let loser = who_at(position);
            let paid = c.backed[position as usize - 1];
            self.subjects[loser as usize].liquid -= paid;
            self.destroy_liquid(paid);
            self.stats.stake_burned += paid;
            net.push((loser, SignedAmount::negative(paid).expect("collected value fits signed accounting")));
            self.add_debt(loser, amount - paid, case, &mut debts);
        }
        let mut losers = Vec::new();
        for &n in &settlement.losers {
            let p = &positions[n as usize - 1];
            if self.cfg.halve_losers && !(self.cfg.halving_spares_council && self.council_mask.get(p.who as usize).copied().unwrap_or(false)) {
                let cut = self.penalize_xp_for_case(p.who, 0.5, case);
                self.stats.xp_halved += cut as u64;
                losers.push(p.who);
            }
        }
        if settlement.accused_lost {
            // The accused is the losing transaction owner even without a staked ladder position (D55/D165).
            if self.cfg.halve_losers
                && !losers.contains(&c.accused)
                && !(self.cfg.halving_spares_council && self.council_mask.get(c.accused as usize).copied().unwrap_or(false))
            {
                let cut = self.penalize_xp_for_case(c.accused, 0.5, case);
                self.stats.xp_halved += cut as u64;
                losers.push(c.accused);
            }
            let base = positions[0].stake;
            if !base.is_zero() {
                let accuser = c.ladder.positions()[0].who;
                let got = self.charge(c.accused, base, case);
                self.subjects[accuser as usize].liquid += got;
                self.stats.sanction_collected += got;
                net.push((c.accused, SignedAmount::negative(got).expect("collected value fits signed accounting")));
                net.push((accuser, SignedAmount::from_amount(got).expect("collected value fits signed accounting")));
                debts.push((c.accused, base - got));
                // Liability uses actual receipts before the verdict, not the opening roster or suspended maturities.
                for g in self.liable_guarantors(c.accused) {
                    if g != c.accused {
                        let burned = self.charge(g, base, case);
                        self.destroy_liquid(burned);
                        self.stats.sanction_burned += burned;
                        net.push((g, SignedAmount::negative(burned).expect("collected value fits signed accounting")));
                        debts.push((g, base - burned));
                    }
                }
            }
        }
        self.stats.settled += 1;
        self.stats.duration_hours += self.now - c.ladder.opened_at;
        if settlement.winner == Side::Accuser {
            self.stats.accuser_won += 1;
        } else {
            self.stats.accused_won += 1;
        }
        self.case_effects[case as usize] = Some(CaseEffects {
            kind: CaseKind::Identity,
            accused: c.accused,
            winner: settlement.winner,
            reversed: false,
            identity_subjects: Vec::new(),
            source_acts: Vec::new(),
            penalized_subjects: losers.clone(),
        });
        let outcome = CaseOutcome {
            settled_at: self.now,
            forced_winner: forced,
            winner: settlement.winner,
            accuser: positions[0].who,
            accused: c.accused,
            positions: positions.len() as u32,
            position_history: positions.clone(),
            holds,
            losers,
            net,
            debts,
            council_rounds: c.ladder.rounds().to_vec(),
            council_electorates: c.electorates,
        };
        self.case_outcomes[case as usize] = Some(outcome.clone());
        if settlement.accused_lost {
            self.apply_case_identity_verdict_to(case, c.accused).expect("a new adverse verdict authorizes its own identity correction");
        }
        self.resume_maturities(DisputeId::Case(case));
        if let Some(opening) = self.case_openings[case as usize].as_mut() {
            opening.stage = OpeningStage::Final;
        }
        self.free_dispute_slot(c.accused, DisputeId::Case(case));
        Ok(outcome)
    }

    /// Execute the same authorized verdict for an explicitly supplied related account, such as D127's duplicate holder.
    pub fn apply_case_identity_verdict_to(&mut self, case: u32, accused: Id) -> Result<(), Reject> {
        let effects = self.case_effects.get(case as usize).and_then(Option::as_ref).ok_or(Reject("no settled case effects"))?;
        if effects.kind != CaseKind::Identity {
            return Err(Reject("identity verdicts do not apply to a Self-ID transaction case"));
        }
        if effects.reversed || effects.winner != Side::Accuser || effects.identity_subjects.contains(&accused) || accused as usize >= self.subjects.len() {
            return Err(Reject("no unapplied adverse identity verdict"));
        }
        self.identity_cases.entry(accused).or_default().push(case);
        self.set_status(accused, Status::False);
        let chain = self.subjects[accused as usize].acts.clone();
        let mut sources = Vec::new();
        for act_id in chain {
            self.void_source_backing(act_id);
            if self.acts[act_id as usize].credit.is_some() {
                sources.push(act_id);
                self.revoke_source_for(act_id, Some(case));
            }
        }
        let effects = self.case_effects[case as usize].as_mut().expect("checked settled effects");
        effects.identity_subjects.push(accused);
        effects.source_acts.extend(sources);
        effects.source_acts.sort_unstable();
        Ok(())
    }

    /// Attribute a separately authorized role-specific penalty to its settled case, including the runner's optional inviter penalty.
    pub fn apply_case_xp_penalty(&mut self, case: u32, subject: Id, fraction: f64) -> Result<i32, Reject> {
        if !fraction.is_finite() || !(0.0..=1.0).contains(&fraction) {
            return Err(Reject("XP penalty fraction must be finite and between zero and one"));
        }
        let effects = self.case_effects.get_mut(case as usize).and_then(Option::as_mut).ok_or(Reject("no settled case effects"))?;
        if effects.kind != CaseKind::Identity {
            return Err(Reject("role-specific identity penalties do not apply to a Self-ID transaction case"));
        }
        if effects.reversed || subject as usize >= self.subjects.len() {
            return Err(Reject("no active case penalty target"));
        }
        if !effects.penalized_subjects.contains(&subject) {
            effects.penalized_subjects.push(subject);
        }
        Ok(self.penalize_xp_for_case(subject, fraction, case))
    }

    /// Trusted execution of D177/D178 after an authorized reversal, not a way to admit or win an appeal.
    pub fn restore_case_effects(&mut self, case: u32) -> Result<RestorationOutcome, Reject> {
        self.require_ordinary_case(case)?;
        self.restore_effects(case)
    }

    pub(super) fn restore_effects(&mut self, case: u32) -> Result<RestorationOutcome, Reject> {
        let effects = self.case_effects.get(case as usize).and_then(Option::as_ref).ok_or(Reject("no settled case effects"))?.clone();
        if effects.reversed {
            return Err(Reject("case effects already reversed"));
        }
        // A completed key recovery moved XP under a separate contract. Do not silently redirect historical receipts or an inherited cap.
        let mut affected = effects.penalized_subjects.clone();
        affected.push(effects.accused);
        affected.extend(&effects.identity_subjects);
        for &act in &effects.source_acts {
            affected.extend(self.acts[act as usize].credit.as_ref().expect("recorded receipt").recipients.iter().copied());
        }
        if self.recovery_log.iter().any(|&(_, source, _)| affected.contains(&source)) {
            return Err(Reject("restoration across completed key recovery needs its migration contract"));
        }
        let mut restored = RestorationOutcome::default();
        for &subject in &effects.identity_subjects {
            let causes = self.identity_cases.get_mut(&subject).expect("recorded identity cause");
            causes.retain(|&id| id != case);
            if causes.is_empty() && !self.independent_invalid[subject as usize] {
                self.set_status(subject, Status::Accepted);
                restored.statuses_restored += 1;
                restored.status_restored |= subject == effects.accused;
            }
        }
        for &act in &effects.source_acts {
            let causes = self.xp_revocations.get_mut(&act).expect("recorded source cause");
            causes.retain(|&id| id != Some(case));
            if causes.is_empty() {
                self.xp_revocations.remove(&act);
                let credit = self.acts[act as usize].credit.as_mut().expect("recorded receipt");
                credit.revoked = false;
                let recipients = credit.recipients.to_vec();
                for recipient in recipients {
                    self.bump(recipient, 1);
                    restored.responsibility_units += 1;
                }
            }
        }
        restored.penalty_events = self.restore_case_xp_penalties(case);
        for subject in &mut self.subjects {
            for debt in subject.debt_tranches.iter_mut().filter(|d| d.case == case) {
                let cancelled = debt.remaining;
                subject.debt -= cancelled;
                debt.cancelled += cancelled;
                debt.remaining = Amount::ZERO;
                restored.debt_cancelled += cancelled;
            }
        }
        self.case_effects[case as usize].as_mut().expect("checked effects").reversed = true;
        self.stats.restorations += 1;
        self.stats.statuses_restored += restored.statuses_restored;
        self.stats.units_restored += restored.responsibility_units;
        self.stats.debt_cancelled += restored.debt_cancelled;
        Ok(restored)
    }

    pub fn invalidate_identity(&mut self, id: Id) {
        if id as usize >= self.subjects.len() {
            return;
        }
        self.independent_invalid[id as usize] = true;
        self.set_status(id, Status::False);
    }

    /// D151 appeal: a wrongly invalidated person who proves reality is an account again. Credit revoked with the cut chain stays revoked,
    /// and links that others left are not restored. A retired lost-key account (D135) is never reinstated. Returns whether anything changed.
    pub fn reinstate_identity(&mut self, id: Id) -> bool {
        if id as usize >= self.subjects.len() {
            return false;
        }
        let s = &mut self.subjects[id as usize];
        if s.status == Status::False && !s.lost_key && self.identity_cases.get(&id).is_none_or(|cases| cases.is_empty()) {
            self.independent_invalid[id as usize] = false;
            self.set_status(id, Status::Accepted);
            return true;
        }
        false
    }

    /// D34/D55 (trusted execution, not adjudication): the account loses `fraction` of its current XP, recorded as an authorized adjustment.
    /// Deviation: the snapshot of the losing act is not kept; the penalty applies to the XP the account holds now. Returns the XP removed.
    pub fn penalize_xp(&mut self, id: Id, fraction: f64) -> i32 {
        if id as usize >= self.subjects.len() || !fraction.is_finite() || !(0.0..=1.0).contains(&fraction) {
            return 0;
        }
        self.apply_xp_penalty(id, fraction, None)
    }

    pub(super) fn penalize_xp_for_case(&mut self, id: Id, fraction: f64, case: u32) -> i32 {
        self.apply_xp_penalty(id, fraction, Some(case))
    }

    fn penalized_coefficient(coef: u32, fraction: f64) -> u32 {
        grid_penalty(coef, fraction)
    }

    fn apply_xp_penalty(&mut self, id: Id, fraction: f64, case: Option<u32>) -> i32 {
        assert!(fraction.is_finite() && (0.0..=1.0).contains(&fraction), "XP penalty fraction must be finite and between zero and one");
        let s = &mut self.subjects[id as usize];
        let flat_cut = if self.cfg.integrity { 0 } else { (f64::from(s.xp.max(0)) * fraction).floor() as i32 };
        s.integrity_adjustments.push(IntegrityAdjustment {
            at_maturities: s.own_maturities,
            kind: IntegrityAdjustmentKind::Penalty { fraction, flat_cut },
            case,
            reversed: false,
        });
        if self.cfg.integrity {
            // The integrity variant: the coefficient is cut, the credits stay; the XP removed is the visible drop (rounded down).
            let before = s.xp;
            s.coef = Self::penalized_coefficient(s.coef, fraction);
            s.low_coef = s.low_coef.min(s.coef);
            self.refresh_xp(id);
            return before - self.subjects[id as usize].xp;
        }
        self.bump(id, -flat_cut);
        self.subjects[id as usize].penalized_xp += flat_cut;
        flat_cut
    }

    pub(super) fn replay_integrity(s: &Subject) -> Option<u32> {
        let (mut coef, mut maturities) = (COEF_ONE, 0);
        for adjustment in &s.integrity_adjustments {
            if adjustment.at_maturities < maturities || adjustment.at_maturities > s.own_maturities {
                return None;
            }
            coef = grid_repair(coef, adjustment.at_maturities - maturities);
            maturities = adjustment.at_maturities;
            if !adjustment.reversed {
                coef = match adjustment.kind {
                    IntegrityAdjustmentKind::Penalty { fraction, .. } => Self::penalized_coefficient(coef, fraction),
                    IntegrityAdjustmentKind::InheritedCap(cap) => coef.min(cap),
                };
            }
        }
        Some(grid_repair(coef, s.own_maturities - maturities))
    }

    /// Remove this case's penalty events once. The balance-halving ablation returns recorded cuts without repricing later cuts.
    pub(super) fn restore_case_xp_penalties(&mut self, case: u32) -> u64 {
        let mut removed = 0;
        for id in 0..self.subjects.len() {
            let s = &mut self.subjects[id];
            let (mut count, mut flat_restored) = (0, 0);
            for adjustment in &mut s.integrity_adjustments {
                if adjustment.case == Some(case) && !adjustment.reversed {
                    if let IntegrityAdjustmentKind::Penalty { flat_cut, .. } = adjustment.kind {
                        adjustment.reversed = true;
                        count += 1;
                        flat_restored += flat_cut;
                    }
                }
            }
            if count != 0 {
                if self.cfg.integrity {
                    s.coef = Self::replay_integrity(s).expect("ordered integrity history");
                } else {
                    s.raw += flat_restored;
                    s.penalized_xp -= flat_restored;
                }
                self.refresh_xp(id as Id);
                removed += count;
            }
        }
        removed
    }

    pub(super) fn audit_integrity(&self) -> Result<(), String> {
        let mut maturities = vec![0u64; self.subjects.len()];
        for act in &self.acts {
            if act.credit.is_some() {
                maturities[act.subject as usize] += 1;
            }
        }
        for (id, s) in self.subjects.iter().enumerate() {
            if s.own_maturities != maturities[id] {
                return Err(format!("own maturity count of {id} differs from original credits"));
            }
            let mut flat_penalties = 0i64;
            for adjustment in &s.integrity_adjustments {
                match adjustment.kind {
                    IntegrityAdjustmentKind::Penalty { flat_cut, .. } if !adjustment.reversed => flat_penalties += i64::from(flat_cut),
                    IntegrityAdjustmentKind::InheritedCap(cap) if cap > COEF_ONE || adjustment.case.is_some() || adjustment.reversed => {
                        return Err(format!("invalid inherited integrity cap of {id}"));
                    }
                    _ => {}
                }
            }
            let replay = Self::replay_integrity(s).ok_or_else(|| format!("unordered integrity history of {id}"))?;
            if (self.cfg.integrity && replay != s.coef) || (!self.cfg.integrity && flat_penalties != i64::from(s.penalized_xp)) {
                return Err(format!("integrity history of {id} differs from cached state"));
            }
        }
        Ok(())
    }

    /// D151 recovery: the liquid FCTY of an invalidated account is burned (FCTY already transferred out cannot be un-minted, D53; here
    /// nothing is transferable, so all liquid FCTY of the account is burned). Returns the amount burned.
    pub fn burn_liquid(&mut self, id: Id) -> Amount {
        if id as usize >= self.subjects.len() {
            return Amount::ZERO;
        }
        let burned = self.spendable(id);
        self.subjects[id as usize].liquid -= burned;
        self.destroy_liquid(burned);
        burned
    }

    /// D151 repair: a pair of honest accounts whose link was cut by a false positive is restored without a fee (no emission right is burned).
    /// The usual limits hold: both accounts are free, slots are available and no link or open valence exists between them.
    pub fn restore_link(&mut self, a: Id, b: Id) -> Result<(), Reject> {
        self.require_account(a)?;
        self.require_account(b)?;
        if a == b {
            return Err(Reject("restoration requires a distinct counterpart"));
        }
        self.require_free(a)?;
        self.require_free(b)?;
        self.require_solvent(a)?;
        self.require_solvent(b)?;
        if self.graph.has_edge(a, b) || self.graph.has_edge(b, a) || self.open_val.contains_key(&(a, b)) || self.open_val.contains_key(&(b, a)) {
            return Err(Reject("a link or an open valence already exists"));
        }
        if self.used_slots(a) >= self.slot_ceiling(a) || self.used_slots(b) >= self.slot_ceiling(b) {
            return Err(Reject("owned-slot ceiling reached"));
        }
        let va = self.push_valence(a, b);
        let vb = self.push_valence(b, a);
        let rels = self.establish(a, b);
        self.valences[va as usize].rels = rels.clone();
        self.valences[vb as usize].rels = rels;
        Ok(())
    }

    /// Cut the whole Self-ID chain: unspent rights burn without XP; XP credited by the cut acts is revoked.
    pub fn void_chain(&mut self, id: Id) {
        if id as usize >= self.subjects.len() {
            return;
        }
        let chain = self.subjects[id as usize].acts.clone();
        for act_id in chain {
            self.void_source_backing(act_id);
            self.revoke_source_xp(act_id);
        }
    }
}
