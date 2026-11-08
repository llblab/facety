//! Council appeal records and voting, separate from the ordinary stake ladder.
//! World owns admission, time, restrictions and restoration. These records do not authenticate evidence,
//! authorize production execution, or choose the still-open appeal financial contract.
use super::*;
use crate::chekharda::{council_outcome, Ballot, CouncilOutcome, CouncilRound, CouncilVote, DAY_HOURS};

pub const APPEAL_FIXTURE_POLICY: &str = "trusted-core-only/canonical-opening/recording-xp/24h/council-rounds/no-financial-execution/v1";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppealRequest {
    pub prior_case: u32,
    pub affected: Id,
    pub requested_at: i64,
}

/// Explicitly supplied authorization for an admitted simulator fixture, never proof of collective consent.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppealInitiator {
    Participant(Id),
    TrustedCollectiveCouncil,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppealVote {
    ConfirmPriorVerdict,
    ReverseAndRestore,
    Defer,
}

impl AppealVote {
    fn council_vote(self) -> CouncilVote {
        match self {
            Self::ConfirmPriorVerdict => CouncilVote::Confirm,
            Self::ReverseAndRestore => CouncilVote::Oppose,
            Self::Defer => CouncilVote::Defer,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppealStage {
    Pending,
    Active,
    Confirmed,
    ReversalAuthorized,
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AppealExecution {
    Confirmed,
    Restored(RestorationOutcome),
    AlreadyRestored,
    Blocked(Reject),
}

/// Append-only provenance and recognized rounds; all mutations go through World.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppealRecord {
    pub request: u32,
    pub prior_case: u32,
    pub accused: Id,
    pub initiator: AppealInitiator,
    pub recorded_at: i64,
    pub matures_at: i64,
    pub author_xp_at_recording: Option<i32>,
    pub accused_xp_at_recording: i32,
    pub guarantors: Vec<Id>,
    pub activated_at: Option<i64>,
    pub cancelled_at: Option<i64>,
    pub stage: AppealStage,
    pub electorates: Vec<CouncilElectorate>,
    pub rounds: Vec<CouncilRound<Id>>,
    pub active_ballots: Vec<Ballot<Id>>,
    pub execution: Option<AppealExecution>,
    pub(crate) holds: Vec<(Id, i64, bool)>,
    pub(crate) released: bool,
}

impl AppealRecord {
    pub fn deadline(&self) -> Option<i64> {
        self.rounds.last().map(|r| r.deadline_after).or_else(|| self.activated_at.map(|at| at + 7 * DAY_HOURS))
    }

    pub fn active_round(&self) -> Option<&CouncilElectorate> {
        (self.stage == AppealStage::Active).then(|| self.electorates.last()).flatten()
    }

    pub(crate) fn ballot(&mut self, member: Id, round: u32, choice: AppealVote, now: i64) -> bool {
        let Some(electorate) = self.active_round() else { return false };
        if electorate.number != round
            || !electorate.members.contains(&member)
            || now < electorate.started_at
            || now >= self.deadline().expect("active appeal deadline")
            || self.active_ballots.iter().any(|b| b.who == member)
        {
            return false;
        }
        self.active_ballots.push(Ballot { who: member, choice: choice.council_vote(), cast_at: now });
        true
    }

    pub(crate) fn close_round(&mut self, now: i64, members: Vec<Id>) {
        let deadline = self.deadline().expect("active appeal deadline");
        assert!(self.stage == AppealStage::Active && now == deadline);
        let outcome = council_outcome(&self.active_ballots);
        let next_deadline = match outcome {
            CouncilOutcome::Confirm => {
                self.stage = AppealStage::Confirmed;
                deadline
            }
            CouncilOutcome::Oppose => {
                self.stage = AppealStage::ReversalAuthorized;
                deadline
            }
            CouncilOutcome::Defer | CouncilOutcome::AutomaticDefer => deadline.checked_add(7 * DAY_HOURS).expect("appeal deadline exceeds i64"),
        };
        self.rounds.push(CouncilRound {
            number: self.electorates.last().expect("active electorate").number,
            deadline_before: deadline,
            deadline_after: next_deadline,
            recognized_at: deadline,
            ballots: std::mem::take(&mut self.active_ballots),
            outcome,
        });
        if self.stage == AppealStage::Active {
            self.electorates.push(CouncilElectorate { number: self.rounds.len().try_into().expect("appeal round exceeds u32"), started_at: now, members });
        }
    }

    pub(crate) fn audit(&self) -> Result<(), String> {
        if self.recorded_at.checked_add(MATURITY_HOURS) != Some(self.matures_at)
            || self.matures_at.checked_add(7 * DAY_HOURS).is_none()
            || self.activated_at.is_some_and(|at| at != self.matures_at)
        {
            return Err("invalid appeal maturity provenance".into());
        }
        let activated = !matches!(self.stage, AppealStage::Pending | AppealStage::Cancelled);
        if activated != self.activated_at.is_some()
            || (self.stage == AppealStage::Cancelled) != self.cancelled_at.is_some()
            || self.cancelled_at.is_some_and(|at| at < self.recorded_at || at >= self.matures_at)
        {
            return Err("invalid appeal lifecycle".into());
        }
        if !activated {
            if !self.rounds.is_empty()
                || !self.electorates.is_empty()
                || !self.holds.is_empty()
                || !self.active_ballots.is_empty()
                || self.execution.is_some()
                || self.released
            {
                return Err("inactive appeal has effects".into());
            }
            return Ok(());
        }
        let active = self.stage == AppealStage::Active;
        if self.electorates.len() != self.rounds.len() + usize::from(active)
            || (!active && !self.active_ballots.is_empty())
            || (active && (self.released || self.execution.is_some()))
            || (!active && self.released != self.execution.is_some())
        {
            return Err("appeal review/execution provenance differs".into());
        }
        let mut deadline = self.matures_at + 7 * DAY_HOURS;
        let mut started_at = self.matures_at;
        for (index, electorate) in self.electorates.iter().enumerate() {
            let distinct: std::collections::HashSet<Id> = electorate.members.iter().copied().collect();
            if electorate.number as usize != index || electorate.started_at != started_at || distinct.len() != electorate.members.len() {
                return Err("invalid appeal electorate".into());
            }
            let ballots = self.rounds.get(index).map_or(self.active_ballots.as_slice(), |r| r.ballots.as_slice());
            let voters: std::collections::HashSet<Id> = ballots.iter().map(|b| b.who).collect();
            if voters.len() != ballots.len() || ballots.iter().any(|b| !distinct.contains(&b.who) || b.cast_at < started_at || b.cast_at >= deadline) {
                return Err("invalid appeal ballots".into());
            }
            if let Some(round) = self.rounds.get(index) {
                let deferred = matches!(round.outcome, CouncilOutcome::Defer | CouncilOutcome::AutomaticDefer);
                let after = if deferred { deadline.checked_add(7 * DAY_HOURS).ok_or("appeal deadline overflow")? } else { deadline };
                if round.number as usize != index
                    || round.deadline_before != deadline
                    || round.recognized_at != deadline
                    || round.deadline_after != after
                    || round.outcome != council_outcome(ballots)
                    || (!deferred && index + 1 != self.electorates.len())
                {
                    return Err("invalid appeal round result".into());
                }
                started_at = deadline;
                deadline = after;
            }
        }
        let expected = match self.rounds.last().map(|r| r.outcome) {
            Some(CouncilOutcome::Confirm) => AppealStage::Confirmed,
            Some(CouncilOutcome::Oppose) => AppealStage::ReversalAuthorized,
            _ => AppealStage::Active,
        };
        if self.stage != expected
            || (self.stage == AppealStage::Confirmed && self.execution.as_ref().is_some_and(|e| *e != AppealExecution::Confirmed))
            || (self.stage == AppealStage::ReversalAuthorized && self.execution == Some(AppealExecution::Confirmed))
        {
            return Err("appeal result differs from recognized vote".into());
        }
        Ok(())
    }
}

impl World {
    /// Affected accounts may request even while invalidated or unable to sign ordinary account acts.
    /// Trusted IDs stand in for the still-open production request authentication contract.
    pub fn request_appeal(&mut self, prior_case: u32, affected: Id) -> Result<u32, Reject> {
        let effects = self.case_effects.get(prior_case as usize).and_then(Option::as_ref).ok_or(Reject("appeal requires a settled case"))?;
        if affected as usize >= self.subjects.len() || effects.reversed {
            return Err(Reject("no unreversed case for this requester"));
        }
        let affected_by_case = effects.accused == affected
            || self
                .case_outcome(prior_case)
                .is_some_and(|o| o.position_history.iter().any(|p| p.who == affected) || o.net.iter().any(|&(id, delta)| id == affected && delta.atoms() < 0))
            || effects.identity_subjects.contains(&affected)
            || effects.penalized_subjects.contains(&affected)
            || effects.source_acts.iter().any(|&act| self.acts[act as usize].credit.as_ref().is_some_and(|c| c.recipients.contains(&affected)))
            || self.subjects[affected as usize].debt_tranches.iter().any(|d| d.case == prior_case);
        if !affected_by_case {
            return Err(Reject("requester has no recorded effect from this case"));
        }
        let id = self.appeal_requests.len().try_into().map_err(|_| Reject("appeal request ID exceeds u32"))?;
        self.appeal_requests.push(AppealRequest { prior_case, affected, requested_at: self.now });
        Ok(id)
    }

    pub fn appeal_request(&self, request: u32) -> Option<&AppealRequest> {
        self.appeal_requests.get(request as usize)
    }

    /// Core-only admitted fixture: the caller supplies evidence admission and, for collective initiation,
    /// collective authority. No individual consul grants that authority. Appeal financial scope is not executed.
    pub fn record_appeal_opening_fixture(&mut self, request: u32, initiator: AppealInitiator) -> Result<u32, Reject> {
        let request_record = self.appeal_request(request).ok_or(Reject("no such appeal request"))?;
        let prior_case = request_record.prior_case;
        let prior = self.case_opening(prior_case).ok_or(Reject("prior case has no recorded opening transaction"))?;
        let effects = self.case_effects[prior_case as usize].as_ref().ok_or(Reject("prior case is not settled"))?;
        if prior.stage != OpeningStage::Final || effects.reversed {
            return Err(Reject("prior opening has no unreversed final verdict"));
        }
        let accused = prior.author;
        let (author_xp_at_recording, guarantors) = match initiator {
            AppealInitiator::Participant(author) => {
                if author as usize >= self.subjects.len() {
                    return Err(Reject("no such account"));
                }
                self.require_account(author)?;
                if author == accused || self.xp(author) <= self.xp(accused) {
                    return Err(Reject("XP is not above the challenged opening owner"));
                }
                (Some(self.xp(author)), self.mutual_partners(author))
            }
            AppealInitiator::TrustedCollectiveCouncil => (None, Vec::new()),
        };
        let matures_at = self
            .now
            .checked_add(MATURITY_HOURS)
            .filter(|at| at.checked_add(7 * DAY_HOURS).is_some())
            .ok_or(Reject("appeal maturity/deadline exceeds time representation"))?;
        let id = self.appeals.len().try_into().map_err(|_| Reject("appeal ID exceeds u32"))?;
        self.appeals.push(AppealRecord {
            request,
            prior_case,
            accused,
            initiator,
            recorded_at: self.now,
            matures_at,
            author_xp_at_recording,
            accused_xp_at_recording: self.xp(accused),
            guarantors,
            activated_at: None,
            cancelled_at: None,
            stage: AppealStage::Pending,
            electorates: Vec::new(),
            rounds: Vec::new(),
            active_ballots: Vec::new(),
            execution: None,
            holds: Vec::new(),
            released: false,
        });
        Ok(id)
    }

    pub fn appeal(&self, appeal: u32) -> Option<&AppealRecord> {
        self.appeals.get(appeal as usize)
    }

    /// Free author cancellation before activation. Active cancellation needs the open appeal stake contract.
    pub fn cancel_appeal_opening(&mut self, appeal: u32, author: Id) -> Result<(), Reject> {
        let now = self.now;
        let record = self.appeals.get_mut(appeal as usize).ok_or(Reject("no such appeal"))?;
        if record.initiator != AppealInitiator::Participant(author) {
            return Err(Reject("not the appeal opening author"));
        }
        if record.stage == AppealStage::Cancelled {
            return Ok(());
        }
        if record.stage == AppealStage::Active {
            return Err(Reject("active appeal cancellation needs its financial scope contract"));
        }
        if record.stage != AppealStage::Pending || now >= record.matures_at {
            return Err(Reject("appeal is not pending before maturity"));
        }
        record.stage = AppealStage::Cancelled;
        record.cancelled_at = Some(now);
        Ok(())
    }

    pub fn appeal_ballot(&mut self, appeal: u32, member: Id, expected_round: u32, choice: AppealVote) -> bool {
        self.appeals.get_mut(appeal as usize).is_some_and(|a| a.ballot(member, expected_round, choice, self.now))
    }

    pub(super) fn process_appeal_events(&mut self, at: i64) {
        for id in 0..self.appeals.len() {
            if self.appeals[id].stage == AppealStage::Pending && self.appeals[id].matures_at == at {
                let record = &mut self.appeals[id];
                record.stage = AppealStage::Active;
                record.activated_at = Some(at);
                record.electorates.push(CouncilElectorate { number: 0, started_at: at, members: self.council.clone() });
                record.holds.push((record.accused, at, true));
                if let AppealInitiator::Participant(author) = record.initiator {
                    record.holds.push((author, at, !self.cfg.exclude_targets_only));
                }
                let accused = record.accused;
                let holds = record.holds.clone();
                for (subject, _, path) in holds {
                    self.hold_for(subject, path);
                }
                self.frozen[accused as usize] += 1;
            } else if self.appeals[id].stage == AppealStage::Active && self.appeals[id].deadline() == Some(at) {
                self.appeals[id].close_round(at, self.council.clone());
            }
        }
    }

    /// Execute only a recognized Council result. Repeated successful execution is inert. A blocked remedy
    /// retains its reversal authorization for a later retry and never partially restores the prior case.
    pub fn resolve_appeal(&mut self, appeal: u32) -> Result<AppealExecution, Reject> {
        let record = self.appeal(appeal).ok_or(Reject("no such appeal"))?;
        if let Some(result) = record.execution.as_ref().filter(|e| !matches!(e, AppealExecution::Blocked(_))) {
            return Ok(result.clone());
        }
        if !matches!(record.stage, AppealStage::Confirmed | AppealStage::ReversalAuthorized) {
            return Err(Reject("appeal has no recognized final Council result"));
        }
        let result = if record.stage == AppealStage::Confirmed {
            AppealExecution::Confirmed
        } else if self.case_effects[record.prior_case as usize].as_ref().expect("settled prior case").reversed {
            AppealExecution::AlreadyRestored
        } else {
            match self.restore_case_effects(record.prior_case) {
                Ok(outcome) => AppealExecution::Restored(outcome),
                Err(reason) => AppealExecution::Blocked(reason),
            }
        };
        if !self.appeals[appeal as usize].released {
            let record = &mut self.appeals[appeal as usize];
            record.released = true;
            let accused = record.accused;
            let holds = record.holds.clone();
            for (subject, _, path) in holds {
                self.release_hold(subject, path);
            }
            self.frozen[accused as usize] -= 1;
        }
        self.appeals[appeal as usize].execution = Some(result.clone());
        Ok(result)
    }

    pub(super) fn audit_appeals(&self) -> Result<(), String> {
        for request in &self.appeal_requests {
            if request.affected as usize >= self.subjects.len()
                || request.requested_at > self.now
                || self.case_effects.get(request.prior_case as usize).and_then(Option::as_ref).is_none()
            {
                return Err("invalid appeal request provenance".into());
            }
        }
        for appeal in &self.appeals {
            appeal.audit()?;
            let Some(request) = self.appeal_request(appeal.request) else { return Err("appeal has no request".into()) };
            let Some(prior) = self.case_opening(appeal.prior_case) else { return Err("appeal has no challenged opening".into()) };
            if request.prior_case != appeal.prior_case
                || prior.author != appeal.accused
                || prior.stage != OpeningStage::Final
                || request.requested_at > appeal.recorded_at
                || appeal.recorded_at > self.now
                || (appeal.stage == AppealStage::Pending && appeal.matures_at <= self.now)
                || appeal.activated_at.is_some_and(|at| at > self.now)
                || appeal.rounds.iter().any(|r| r.recognized_at > self.now)
                || appeal.electorates.iter().any(|e| e.members.iter().any(|&id| id as usize >= self.subjects.len()))
            {
                return Err("invalid appeal opening linkage or time".into());
            }
            let expected_holds = match appeal.initiator {
                AppealInitiator::Participant(author) => {
                    if author as usize >= self.subjects.len()
                        || author == appeal.accused
                        || appeal.author_xp_at_recording.is_none_or(|xp| xp <= appeal.accused_xp_at_recording)
                        || appeal.guarantors.contains(&author)
                        || appeal.guarantors.iter().any(|&g| g as usize >= self.subjects.len())
                        || appeal.guarantors.iter().copied().collect::<HashSet<_>>().len() != appeal.guarantors.len()
                    {
                        return Err("invalid appeal participant provenance".into());
                    }
                    vec![(appeal.accused, appeal.matures_at, true), (author, appeal.matures_at, !self.cfg.exclude_targets_only)]
                }
                AppealInitiator::TrustedCollectiveCouncil => {
                    if appeal.author_xp_at_recording.is_some() || !appeal.guarantors.is_empty() {
                        return Err("collective appeal has an ordinary author".into());
                    }
                    vec![(appeal.accused, appeal.matures_at, true)]
                }
            };
            if appeal.activated_at.is_some() && appeal.holds != expected_holds {
                return Err("appeal restrictions differ from its participants".into());
            }
            if matches!(appeal.execution, Some(AppealExecution::Restored(_) | AppealExecution::AlreadyRestored))
                && !self.case_effects[appeal.prior_case as usize].as_ref().expect("settled prior").reversed
            {
                return Err("executed appeal has no reversed effects".into());
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recorded_case() -> (World, u32) {
        let pairs: Vec<_> = (0..12).flat_map(|id| [1, 2].map(move |offset| (id, (id + offset) % 12))).collect();
        let mut w = World::new(Config::default(), 12, &pairs);
        w.create_self_id(5).unwrap();
        for _ in 0..4 {
            for id in 0..3 {
                w.create_self_id(id).unwrap();
            }
            w.tick(w.now() + DAY);
        }
        let case = w.record_case_opening(&[0, 5]).unwrap();
        w.tick(w.now() + DAY);
        w.tick(w.case_deadline(case).unwrap());
        w.settle_case(case, None).unwrap();
        (w, case)
    }

    #[test]
    fn reversal_authority_survives_a_completed_key_migration_without_partial_restoration() {
        let (mut w, case) = recorded_case();
        w.lose_key(5).unwrap();
        w.create_self_id(3).unwrap();
        w.tick(w.now() + DAY);
        let right = w.eligible_emission(3).unwrap();
        let invitation = w.create_invitation(3, right).unwrap();
        w.tick(w.now() + DAY);
        let successor = w.accept_invitation(invitation).unwrap();
        w.begin_recovery(successor, 5).unwrap();
        for id in [successor, 4] {
            w.create_self_id(id).unwrap();
        }
        w.tick(w.now() + DAY);
        let a = w.eligible_emission(successor).unwrap();
        let b = w.eligible_emission(4).unwrap();
        w.open_valence(successor, 4, a).unwrap();
        w.open_valence(4, successor, b).unwrap();
        w.complete_recovery(successor).unwrap();
        let request = w.request_appeal(case, 5).unwrap();
        let appeal = w.record_appeal_opening_fixture(request, AppealInitiator::TrustedCollectiveCouncil).unwrap();
        w.tick(w.now() + DAY);
        let member = w.appeal(appeal).unwrap().active_round().unwrap().members[0];
        w.appeal_ballot(appeal, member, 0, AppealVote::ReverseAndRestore);
        w.tick(w.appeal(appeal).unwrap().deadline().unwrap());
        let state = (format!("{:?}", w.subjects), format!("{:?}", w.acts), format!("{:?}", w.case_effects), w.burned(), w.stats.restorations);
        let expected = AppealExecution::Blocked(Reject("restoration across completed key recovery needs its migration contract"));
        assert_eq!(w.resolve_appeal(appeal), Ok(expected.clone()));
        assert_eq!((format!("{:?}", w.subjects), format!("{:?}", w.acts), format!("{:?}", w.case_effects), w.burned(), w.stats.restorations), state);
        assert_eq!(w.appeal(appeal).unwrap().stage, AppealStage::ReversalAuthorized);
        assert_eq!(w.resolve_appeal(appeal), Ok(expected));
        assert!(!w.accepted(5));
        assert!(!w.reinstate_identity(5));
        assert_eq!(w.subjects[successor as usize].coef, COEF_ONE / 2);
        assert!(!w.case_effects[case as usize].as_ref().unwrap().reversed);
        w.audit().unwrap();
    }

    #[test]
    fn invalid_case_penalty_fractions_are_rejected_before_recording_any_effect() {
        let (mut w, case) = recorded_case();
        for fraction in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -0.01, 1.01] {
            let before = (format!("{:?}", w.subjects), format!("{:?}", w.case_effects));
            assert!(w.apply_case_xp_penalty(case, 3, fraction).is_err());
            assert_eq!((format!("{:?}", w.subjects), format!("{:?}", w.case_effects)), before);
        }
        w.audit().unwrap();
    }

    #[test]
    fn fully_paid_affected_roles_can_request_without_debt_penalties_or_identity_execution() {
        let (mut w, _) = recorded_case();
        w.cfg.base_stake = Some(7);
        w.cfg.halve_losers = false;
        for _ in 0..7 {
            w.create_self_id(3).unwrap();
            w.create_self_id(4).unwrap();
            w.tick(w.now() + DAY);
        }
        w.create_self_id(5).unwrap();
        w.tick(w.now() + DAY);
        let case = w.record_case_opening(&[2, 5]).unwrap();
        w.tick(w.now() + DAY);
        w.tick(w.case_deadline(case).unwrap());
        let original = w.settle_case(case, None).unwrap();
        assert!(original.net.iter().any(|&(id, delta)| id == 3 && delta.atoms() < 0));
        assert!(w.debt(3).is_zero());
        assert!(w.case_effects[case as usize].as_ref().unwrap().penalized_subjects.is_empty());
        assert!(w.case_effects[case as usize].as_ref().unwrap().source_acts.is_empty());
        w.request_appeal(case, 3).unwrap();
        assert_eq!(w.case_outcome(case), Some(&original));
        w.audit().unwrap();

        let (mut w, _) = recorded_case();
        w.cfg.base_stake = Some(1);
        w.cfg.halve_losers = false;
        let case = w.record_case_opening(&[0, 5]).unwrap();
        w.tick(w.now() + DAY);
        w.tick(w.case_deadline(case).unwrap());
        let original = w.settle_case(case, Some(Side::Accused)).unwrap();
        assert!(w.debt(0).is_zero());
        assert!(original.losers.is_empty(), "the halving ablation recorded no XP penalties");
        assert_eq!(original.forced_winner, Some(Side::Accused));
        w.request_appeal(case, 0).unwrap();
        w.audit().unwrap();
    }

    #[test]
    fn appeal_audit_rejects_corrupt_linkage_ballots_results_and_execution() {
        let (mut w, case) = recorded_case();
        let request = w.request_appeal(case, 5).unwrap();
        let appeal = w.record_appeal_opening_fixture(request, AppealInitiator::TrustedCollectiveCouncil).unwrap();
        w.tick(w.now() + DAY);
        w.audit().unwrap();
        let mut bad = w.clone();
        bad.appeals[appeal as usize].prior_case = u32::MAX;
        assert!(bad.audit().is_err());
        let mut bad = w.clone();
        bad.appeals[appeal as usize].active_ballots.push(Ballot { who: u32::MAX, choice: CouncilVote::Oppose, cast_at: w.now() });
        assert!(bad.audit().is_err());
        let mut bad = w.clone();
        bad.appeals[appeal as usize].stage = AppealStage::ReversalAuthorized;
        assert!(bad.audit().is_err());
        let mut bad = w.clone();
        bad.case_outcomes[case as usize].as_mut().unwrap().winner = Side::Accused;
        assert!(bad.audit().is_err());
        let member = w.appeal(appeal).unwrap().active_round().unwrap().members[0];
        w.appeal_ballot(appeal, member, 0, AppealVote::ConfirmPriorVerdict);
        w.tick(w.appeal(appeal).unwrap().deadline().unwrap());
        w.resolve_appeal(appeal).unwrap();
        let mut bad = w.clone();
        bad.appeals[appeal as usize].rounds[0].deadline_after += DAY;
        assert!(bad.audit().is_err());
        w.appeals[appeal as usize].execution = Some(AppealExecution::AlreadyRestored);
        assert!(w.audit().is_err());
    }
}
