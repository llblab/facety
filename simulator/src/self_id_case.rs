//! The first independent Self-ID transaction fixture: a typed challenged Self-ID, a 24-hour pending opening, an
//! activation-frozen inclusive count (D189/D190) and the isolated D192 settlement with case-specific restoration.
//!
//! This is an explicitly trusted test subset, not production admission, authentication, collective authority or a
//! general asset-priority rule. The caller states that admission and historical-duty qualification were supplied
//! externally; an evaluator label or a caller's allegation is never accepted as a verdict. Everything outside the
//! declared boundary refuses before mutation instead of inheriting an identity-case or ordinary-case convention.
use super::*;
use crate::chekharda::stake;

/// The declared conventions of this fixture, distinct from the identity-case and ordinary-stake policies.
pub const SELF_ID_CASE_POLICY: &str = "trusted-core-only/typed-self-id-target/activation-frozen-n/isolated-d192-settlement/v1";

/// A premise the caller must supply explicitly. `Missing` is refused before any record allocation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrustedPremise {
    Supplied,
    Missing,
}

/// Externally supplied admission and historical-duty qualification for this fixture.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TrustedAdmissionPremises {
    pub admission: TrustedPremise,
    pub historical_duty: TrustedPremise,
}

/// An externally decided merits outcome. Only the upheld form is executable in this fixture.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrustedMerits {
    UpheldSupplied,
    NotUpheldSupplied,
}

/// The inclusive chain count frozen once at uncancelled activation (D189/D190): 1-based personal positions.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FrozenCount {
    pub violating: u32,
    pub endpoint: u32,
    pub n: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SelfIdCaseStage {
    Pending,
    Activated,
    Cancelled,
    Final,
}

/// The recorded opening transaction and its activation snapshot; the challenged Self-ID is retained by act ID.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SelfIdCaseRecord {
    pub case: u32,
    /// The challenged Self-ID transaction; a numeric ID of another namespace is never an alias for it.
    pub target: u32,
    /// The first ordinary accuser (the opening author).
    pub author: Id,
    /// The author of the challenged Self-ID.
    pub accused: Id,
    pub recorded_at: i64,
    pub matures_at: i64,
    pub author_xp_at_recording: i32,
    pub accused_xp_at_recording: i32,
    /// Established mutual guarantors of the opener at recording.
    pub author_guarantors: Vec<Id>,
    /// The challenged Self-ID's immutable creation-time guarantors, not a current or union roster.
    pub source_guarantors: Vec<Id>,
    pub activated_at: Option<i64>,
    pub cancelled_at: Option<i64>,
    pub stage: SelfIdCaseStage,
    /// Fixed once at uncancelled activation; later verdicts or deferrals cannot reprice it.
    pub frozen: Option<FrozenCount>,
    pub premises: TrustedAdmissionPremises,
}

/// The completed isolated D192 settlement, retained as this case's journal.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SelfIdSettlement {
    pub case: u32,
    pub target: u32,
    pub accuser: Id,
    pub accused: Id,
    pub frozen: FrozenCount,
    /// The challenged act's creation-time roster.
    pub source_guarantors: Vec<Id>,
    /// Original guarantors actually charged; equal to the roster inside this isolated subset.
    pub charged_guarantors: Vec<Id>,
    pub accused_charge: Amount,
    pub accused_collected: Amount,
    pub accuser_award: Amount,
    /// Always zero in this subset: the transferred backing is not burned again.
    pub source_burned: Amount,
    /// Always zero in this subset: actual collection covers the whole frozen charge.
    pub unpaid_accused: Amount,
    /// Nominal charge of the original-guarantor roster.
    pub guarantor_charge: Amount,
    pub guarantor_burned: Amount,
    /// `(credit time, actual recipients)` of the challenged source receipt this case revoked.
    pub revoked_receipt: Option<(i64, Vec<Id>)>,
    pub coefficient_before: u32,
    pub coefficient_after: u32,
    pub settled_at: i64,
    pub reversed: bool,
}

/// Read-only snapshot the settlement preflight validates before any mutation.
struct SelfIdPreflight {
    frozen: FrozenCount,
    target: u32,
    accuser: Id,
    accused: Id,
    source_guarantors: Vec<Id>,
    revoked_receipt: Option<(i64, Vec<Id>)>,
    coefficient_before: u32,
}

impl World {
    /// The isolated settlement requires the selected stake, halving and integrity settings; ablations are outside it.
    fn require_self_id_fixture_settings(&self) -> Result<(), Reject> {
        if self.cfg.base_stake.is_none() {
            return Err(Reject("the Self-ID fixture requires the selected stake setting"));
        }
        if !self.cfg.halve_losers {
            return Err(Reject("the Self-ID fixture requires the selected halving setting"));
        }
        if !self.cfg.integrity || self.cfg.halving_spares_council {
            return Err(Reject("the Self-ID fixture requires the selected integrity setting"));
        }
        Ok(())
    }

    /// Record a trusted-core Self-ID correction opening. Nothing is reserved, held or paid before activation.
    pub fn record_self_id_case_fixture(&mut self, accuser: Id, target: TransactionTarget, premises: TrustedAdmissionPremises) -> Result<u32, Reject> {
        self.require_self_id_fixture_settings()?;
        if premises.admission != TrustedPremise::Supplied || premises.historical_duty != TrustedPremise::Supplied {
            return Err(Reject("admission and historical-duty premises must be supplied externally"));
        }
        let TransactionTarget::SelfId(act) = target else {
            return Err(Reject("a Self-ID fixture opening must target a Self-ID transaction"));
        };
        let source = self.acts.get(act as usize).ok_or(Reject("no such Self-ID transaction"))?;
        let (accused, status, guarantors) = (source.subject, source.status, source.guarantors.clone());
        if accuser as usize >= self.subjects.len() {
            return Err(Reject("no such account"));
        }
        self.require_account(accuser)?;
        self.require_account(accused)?;
        if accuser == accused {
            return Err(Reject("the challenger cannot target its own Self-ID"));
        }
        if status == ActStatus::Cancelled {
            return Err(Reject("a cancelled Self-ID has no live transaction to correct"));
        }
        if self.acts[act as usize].credit.as_ref().is_some_and(|c| c.revoked) || self.xp_revocations.contains_key(&act) {
            return Err(Reject("the challenged Self-ID was already corrected"));
        }
        if self.self_id_cases.iter().flatten().any(|r| r.target == act) {
            return Err(Reject("the Self-ID transaction already has a recorded case"));
        }
        if self.xp(accuser) <= self.xp(accused) {
            return Err(Reject("XP is not above the challenged transaction owner"));
        }
        let matures_at = self.now.checked_add(MATURITY_HOURS).ok_or(Reject("opening maturity exceeds the simulator's time representation"))?;
        let case = self.cases.len() as u32;
        self.cases.push(None);
        self.case_openings.push(None);
        self.case_cancellations.push(None);
        self.case_effects.push(None);
        self.case_outcomes.push(None);
        self.self_id_cases.push(Some(SelfIdCaseRecord {
            case,
            target: act,
            author: accuser,
            accused,
            recorded_at: self.now,
            matures_at,
            author_xp_at_recording: self.xp(accuser),
            accused_xp_at_recording: self.xp(accused),
            author_guarantors: self.mutual_partners(accuser),
            source_guarantors: guarantors.to_vec(),
            activated_at: None,
            cancelled_at: None,
            stage: SelfIdCaseStage::Pending,
            frozen: None,
            premises,
        }));
        self.self_id_settlements.push(None);
        self.stats.self_id_openings_recorded += 1;
        Ok(case)
    }

    pub fn self_id_case(&self, case: u32) -> Option<&SelfIdCaseRecord> {
        self.self_id_cases.get(case as usize).and_then(Option::as_ref)
    }

    pub fn self_id_settlement(&self, case: u32) -> Option<&SelfIdSettlement> {
        self.self_id_settlements.get(case as usize).and_then(Option::as_ref)
    }

    pub fn self_id_cases(&self) -> usize {
        self.self_id_cases.iter().flatten().count()
    }

    /// Free author cancellation before the 24-hour activation. Unsupported opening-guarantor veto authority refuses
    /// explicitly rather than inheriting the identity-case or Self-ID veto roster.
    pub fn cancel_self_id_case_opening(&mut self, case: u32, author: Id) -> Result<(), Reject> {
        let record = self.self_id_cases.get(case as usize).and_then(Option::as_ref).ok_or(Reject("no such Self-ID transaction case"))?;
        let (recorded_author, stage, matures_at) = (record.author, record.stage, record.matures_at);
        if stage != SelfIdCaseStage::Pending || self.now >= matures_at {
            return Err(Reject("not a pending Self-ID opening before its activation"));
        }
        if author != recorded_author {
            if self.acts.get(record.target as usize).is_some_and(|a| a.guarantors.contains(&author)) {
                return Err(Reject("opening-guarantor veto authority is not contracted"));
            }
            return Err(Reject("not the author's pending Self-ID opening"));
        }
        let record = self.self_id_cases[case as usize].as_mut().expect("checked pending record");
        record.stage = SelfIdCaseStage::Cancelled;
        record.cancelled_at = Some(self.now);
        self.stats.self_id_openings_cancelled += 1;
        Ok(())
    }

    /// Activate in its existing slot: fix the endpoint and inclusive N once, reserve the `N` FCTY first stake and
    /// begin the ordinary holds. Recording already fixed admission; later XP or membership changes cannot reject it.
    pub(crate) fn activate_self_id_case(&mut self, case: u32, at: i64) {
        let record = self.self_id_cases[case as usize].as_ref().expect("pending Self-ID case").clone();
        let acts = &self.subjects[record.accused as usize].acts;
        let violating = acts.iter().position(|&a| a == record.target).expect("the challenged act is recorded") as u32 + 1;
        let endpoint = acts.len() as u32;
        let frozen = FrozenCount { violating, endpoint, n: endpoint - violating + 1 };
        let backing = self.reserve_stake(record.author, stake(1, frozen.n));
        let ladder = Ladder::open(record.author, record.author_xp_at_recording, at, frozen.n);
        let mut held = Case { ladder, electorates: Vec::new(), accused: record.accused, backed: vec![backing], holds: Vec::new() };
        let (author_path, accused_path) = (self.path_held(&held, record.author), self.path_held(&held, record.accused));
        held.holds = vec![(record.author, at, author_path), (record.accused, at, accused_path)];
        self.hold_for(record.author, author_path);
        self.hold_for(record.accused, accused_path);
        self.frozen[record.accused as usize] += 1;
        self.cases[case as usize] = Some(held);
        let record = self.self_id_cases[case as usize].as_mut().expect("pending record");
        record.stage = SelfIdCaseStage::Activated;
        record.activated_at = Some(at);
        record.frozen = Some(frozen);
        self.stats.self_id_openings_activated += 1;
    }

    /// Validate every isolated D192 premise without mutating anything. Refusal here is not a verdict, an expiry, a
    /// deferral or a zero-valued settlement.
    fn self_id_settlement_preflight(&self, case: u32) -> Result<SelfIdPreflight, Reject> {
        self.require_self_id_fixture_settings()?;
        let record = self.self_id_case(case).ok_or(Reject("no such Self-ID transaction case"))?;
        if record.stage != SelfIdCaseStage::Activated {
            return Err(Reject("the Self-ID case is not active"));
        }
        let active = self.case_ref(case)?;
        if active.ladder.len() != 1 || active.ladder.council_entered() {
            return Err(Reject("the fixture supports one ordinary accuser and no later entry"));
        }
        if !active.ladder.is_final(self.now) {
            return Err(Reject("the Self-ID case cutoff has not arrived"));
        }
        let frozen = record.frozen.ok_or(Reject("the Self-ID case has no frozen chain count"))?;
        if frozen.n != 1 {
            return Err(Reject("the isolated settlement requires frozen N = 1"));
        }
        let (accuser, accused, target) = (record.author, record.accused, record.target);
        let source = self.acts.get(target as usize).ok_or(Reject("no such Self-ID transaction"))?;
        if source.subject != accused {
            return Err(Reject("the challenged Self-ID belongs to another account"));
        }
        if source.status != ActStatus::Unspent {
            return Err(Reject("the target backing is spent, revoked or otherwise unavailable"));
        }
        if self.now - source.recorded_at < MATURITY_HOURS {
            return Err(Reject("the target backing is not mature"));
        }
        let credit = source.credit.as_ref().ok_or(Reject("the target Self-ID has no maturity receipt"))?;
        if credit.revoked {
            return Err(Reject("the target receipt was already revoked"));
        }
        if self.xp_revocations.get(&target).is_some_and(|causes| !causes.is_empty()) {
            return Err(Reject("the target receipt has a recording correction cause"));
        }
        if self.reserved_rights.contains(&target) {
            return Err(Reject("the target backing is reserved by another case"));
        }
        let subject = &self.subjects[accused as usize];
        if subject.status != Status::Accepted || self.identity_cases.get(&accused).is_some_and(|c| !c.is_empty()) {
            return Err(Reject("the accused has an overlapping identity invalidation"));
        }
        if !subject.debt.is_zero() {
            return Err(Reject("the accused has outstanding debt"));
        }
        if !subject.reserved.is_zero() || !self.spendable(accused).is_zero() {
            return Err(Reject("the accused holds liquid value or competing reservation"));
        }
        let unspent: Vec<u32> = subject.acts.iter().copied().filter(|&a| self.acts[a as usize].status == ActStatus::Unspent).collect();
        if unspent != vec![target] {
            return Err(Reject("the accused does not hold exactly the target's single unspent backing"));
        }
        if accuser == accused {
            return Err(Reject("the accuser and the accused must be distinct accounts"));
        }
        if self.hold[accused as usize] != 1 || self.frozen[accused as usize] != 1 || self.hold[accuser as usize] != 1 {
            return Err(Reject("another open case overlaps this Self-ID case"));
        }
        if !self.accepted(accuser) {
            return Err(Reject("the accuser is not an accepted account"));
        }
        let source_guarantors = record.source_guarantors.clone();
        if source_guarantors.is_empty() {
            return Err(Reject("the challenged Self-ID has no original guarantor roster"));
        }
        let mut distinct: Vec<Id> = source_guarantors.clone();
        distinct.sort_unstable();
        distinct.dedup();
        if distinct.len() != source_guarantors.len() {
            return Err(Reject("the original guarantor roster has duplicate roles"));
        }
        if source_guarantors.contains(&accuser) || source_guarantors.contains(&accused) {
            return Err(Reject("the isolated settlement requires distinct party and guarantor roles"));
        }
        let recovered = |id: Id| {
            let s = &self.subjects[id as usize];
            s.recovers.is_some() || s.lost_key || s.restored_xp != 0 || self.recovery_log.iter().any(|&(successor, source, _)| successor == id || source == id)
        };
        if recovered(accused) || recovered(accuser) || source_guarantors.iter().copied().any(recovered) {
            return Err(Reject("a completed key recovery interacts with this case"));
        }
        for &g in &source_guarantors {
            if g as usize >= self.subjects.len() || g == accuser || g == accused {
                return Err(Reject("the original guarantor roster has an unusable role"));
            }
            if self.spendable(g) < Amount::ONE {
                return Err(Reject("an original guarantor lacks independent uncharged backing"));
            }
        }
        Ok(SelfIdPreflight {
            frozen,
            target,
            accuser,
            accused,
            source_guarantors,
            revoked_receipt: Some((credit.at, credit.recipients.to_vec())),
            coefficient_before: self.subjects[accused as usize].coef,
        })
    }

    /// Execute the one authorized isolated settlement path after a complete preflight, or refuse atomically.
    /// A repeated call returns the retained journal without a second payment, burn, penalty or receipt removal.
    pub fn settle_self_id_case_fixture(&mut self, case: u32, merits: TrustedMerits) -> Result<SelfIdSettlement, Reject> {
        let record = self.self_id_case(case).ok_or(Reject("no such Self-ID transaction case"))?.clone();
        if record.stage == SelfIdCaseStage::Final {
            return self.self_id_settlement(case).cloned().ok_or(Reject("the final Self-ID case has no settlement journal"));
        }
        if merits != TrustedMerits::UpheldSupplied {
            return Err(Reject("only an upheld supplied merits result is executable in this fixture"));
        }
        let pre = self.self_id_settlement_preflight(case)?;
        let held = self.cases[case as usize].take().expect("preflight found an active Self-ID case");
        // 1. Collect the target's existing backing for the first accuser before the source cut.
        self.dispose(pre.target, ActStatus::Converted);
        self.subjects[pre.accused as usize].liquid -= Amount::ONE;
        self.subjects[pre.accuser as usize].liquid += Amount::ONE;
        // 2. Cut the source: revoke only the challenged act's actual receipts, keyed to this case.
        self.revoke_source_for(pre.target, Some(case));
        // 3. Apply the selected losing-author coefficient consequence under the declared arithmetic.
        self.penalize_xp_for_case(pre.accused, 0.5, case);
        // 4. Collect and burn the original guarantors' one-unit charges from their independent backing.
        let mut guarantor_burned = Amount::ZERO;
        for &g in &pre.source_guarantors {
            let paid = self.charge(g, Amount::ONE, case);
            debug_assert_eq!(paid, Amount::ONE, "preflight guarantees full independent guarantor backing");
            self.destroy_liquid(paid);
            guarantor_burned += paid;
        }
        // 5. Release the accuser's own backing and the case restrictions separately.
        let holds = self.release_case(&held);
        // 6. Journal the completed effects under this case.
        let mut net = Vec::with_capacity(pre.source_guarantors.len() + 2);
        net.push((pre.accused, SignedAmount::negative(Amount::ONE).expect("one coin fits signed accounting")));
        net.push((pre.accuser, SignedAmount::from_amount(Amount::ONE).expect("one coin fits signed accounting")));
        for &g in &pre.source_guarantors {
            net.push((g, SignedAmount::negative(Amount::ONE).expect("one coin fits signed accounting")));
        }
        self.case_effects[case as usize] = Some(CaseEffects {
            kind: CaseKind::SelfIdTransaction,
            accused: pre.accused,
            winner: Side::Accuser,
            reversed: false,
            identity_subjects: Vec::new(),
            source_acts: vec![pre.target],
            penalized_subjects: vec![pre.accused],
        });
        self.case_outcomes[case as usize] = Some(CaseOutcome {
            settled_at: self.now,
            forced_winner: Some(Side::Accuser),
            winner: Side::Accuser,
            accuser: pre.accuser,
            accused: pre.accused,
            positions: held.ladder.len(),
            position_history: held.ladder.positions().to_vec(),
            holds,
            losers: vec![pre.accused],
            net,
            debts: Vec::new(),
            council_rounds: Vec::new(),
            council_electorates: Vec::new(),
        });
        let settlement = SelfIdSettlement {
            case,
            target: pre.target,
            accuser: pre.accuser,
            accused: pre.accused,
            frozen: pre.frozen,
            source_guarantors: pre.source_guarantors.clone(),
            charged_guarantors: pre.source_guarantors.clone(),
            accused_charge: Amount::ONE,
            accused_collected: Amount::ONE,
            accuser_award: Amount::ONE,
            source_burned: Amount::ZERO,
            unpaid_accused: Amount::ZERO,
            guarantor_charge: Amount::coins(pre.source_guarantors.len() as u64),
            guarantor_burned,
            revoked_receipt: pre.revoked_receipt,
            coefficient_before: pre.coefficient_before,
            coefficient_after: self.subjects[pre.accused as usize].coef,
            settled_at: self.now,
            reversed: false,
        };
        self.self_id_settlements[case as usize] = Some(settlement.clone());
        let record = self.self_id_cases[case as usize].as_mut().expect("recorded Self-ID case");
        record.stage = SelfIdCaseStage::Final;
        self.stats.self_id_settled += 1;
        self.stats.self_id_awarded += settlement.accuser_award;
        self.stats.self_id_guarantor_burned += settlement.guarantor_burned;
        self.stats.self_id_source_burned += settlement.source_burned;
        Ok(settlement)
    }

    /// Case-specific restoration of this fixture's authorized receipt and penalty effects. It does not recreate a
    /// consumed entitlement, refund a transfer or burn, or claim an appeal admission contract.
    pub fn restore_self_id_case_effects(&mut self, case: u32) -> Result<RestorationOutcome, Reject> {
        let effects = self.case_effects.get(case as usize).and_then(Option::as_ref).ok_or(Reject("no settled case effects"))?;
        if effects.kind != CaseKind::SelfIdTransaction {
            return Err(Reject("not an independent Self-ID transaction case"));
        }
        let restored = self.restore_case_effects(case)?;
        let settlement = self.self_id_settlements[case as usize].as_mut().expect("settled Self-ID case journal");
        settlement.reversed = true;
        Ok(restored)
    }

    /// Structural audit of the fixture's provenance, money and lifecycle. It checks the subset's declared invariants,
    /// not a general production execution contract.
    pub(crate) fn audit_self_id_cases(&self) -> Result<(), String> {
        if self.self_id_cases.len() != self.cases.len() || self.self_id_settlements.len() != self.cases.len() {
            return Err("Self-ID case tables have no matching owner".into());
        }
        if !self.stats.self_id_source_burned.is_zero() {
            return Err("the isolated Self-ID settlement may not burn the transferred target backing".into());
        }
        for (id, record) in self.self_id_cases.iter().enumerate().filter_map(|(id, r)| r.as_ref().map(|r| (id as u32, r))) {
            if record.case != id
                || record.author as usize >= self.subjects.len()
                || record.accused as usize >= self.subjects.len()
                || record.author == record.accused
                || record.target as usize >= self.acts.len()
                || self.acts[record.target as usize].subject != record.accused
                || record.recorded_at > self.now
                || record.recorded_at.checked_add(MATURITY_HOURS) != Some(record.matures_at)
                || record.author_xp_at_recording <= record.accused_xp_at_recording
                || record.source_guarantors.iter().any(|&g| g as usize >= self.subjects.len() || g == record.accused)
                || record.author_guarantors.iter().any(|&g| g as usize >= self.subjects.len())
            {
                return Err(format!("Self-ID case {id} has invalid recording provenance"));
            }
            if let Some(frozen) = record.frozen {
                if frozen.violating == 0
                    || frozen.endpoint < frozen.violating
                    || frozen.endpoint > self.subjects[record.accused as usize].acts.len() as u32
                    || frozen.n != frozen.endpoint - frozen.violating + 1
                    || self.subjects[record.accused as usize].acts[(frozen.violating - 1) as usize] != record.target
                {
                    return Err(format!("Self-ID case {id} has an invalid frozen chain count"));
                }
            }
            let effects = self.case_effects[id as usize].as_ref();
            let outcome = self.case_outcomes[id as usize].as_ref();
            let settlement = self.self_id_settlements[id as usize].as_ref();
            match record.stage {
                SelfIdCaseStage::Pending => {
                    if record.activated_at.is_some()
                        || record.cancelled_at.is_some()
                        || record.frozen.is_some()
                        || self.cases[id as usize].is_some()
                        || effects.is_some()
                        || settlement.is_some()
                    {
                        return Err(format!("Self-ID case {id} has invalid pending state"));
                    }
                }
                SelfIdCaseStage::Cancelled => {
                    if record.activated_at.is_some()
                        || record.frozen.is_some()
                        || record.cancelled_at.is_none_or(|at| at >= record.matures_at)
                        || self.cases[id as usize].is_some()
                        || effects.is_some()
                        || settlement.is_some()
                    {
                        return Err(format!("Self-ID case {id} has invalid cancelled state"));
                    }
                }
                SelfIdCaseStage::Activated => {
                    let Some(held) = self.cases[id as usize].as_ref() else { return Err(format!("Self-ID case {id} has no active dispute")) };
                    if record.activated_at != Some(record.matures_at)
                        || record.matures_at > self.now
                        || record.cancelled_at.is_some()
                        || held.accused != record.accused
                        || held.ladder.opened_at != record.matures_at
                        || held.ladder.len() != 1
                        || effects.is_some()
                        || settlement.is_some()
                    {
                        return Err(format!("Self-ID case {id} has invalid activation provenance"));
                    }
                }
                SelfIdCaseStage::Final => {
                    let (Some(effects), Some(outcome), Some(settlement)) = (effects, outcome, settlement) else {
                        return Err(format!("Self-ID case {id} has no retained settlement journal"));
                    };
                    if record.activated_at != Some(record.matures_at)
                        || self.cases[id as usize].is_some()
                        || effects.kind != CaseKind::SelfIdTransaction
                        || effects.source_acts != vec![record.target]
                        || effects.accused != record.accused
                        || outcome.accused != record.accused
                        || outcome.accuser != record.author
                        || outcome.winner != Side::Accuser
                        || outcome.forced_winner != Some(Side::Accuser)
                        || outcome.positions != 1
                        || !outcome.debts.is_empty()
                    {
                        return Err(format!("Self-ID case {id} has an invalid settlement"));
                    }
                    if settlement.case != id
                        || settlement.target != record.target
                        || settlement.frozen != record.frozen.expect("final case has a frozen count")
                        || settlement.accused_collected != Amount::ONE
                        || settlement.accuser_award != Amount::ONE
                        || !settlement.source_burned.is_zero()
                        || !settlement.unpaid_accused.is_zero()
                        || settlement.charged_guarantors.len() != settlement.source_guarantors.len()
                        || settlement.guarantor_burned != settlement.guarantor_charge
                        || settlement.reversed != effects.reversed
                    {
                        return Err(format!("Self-ID case {id} violates the isolated D192 accounting"));
                    }
                }
            }
        }
        let recorded = self.self_id_cases.iter().flatten().count() as u64;
        let activated = self.self_id_cases.iter().flatten().filter(|r| r.activated_at.is_some()).count() as u64;
        let cancelled = self.self_id_cases.iter().flatten().filter(|r| r.stage == SelfIdCaseStage::Cancelled).count() as u64;
        if (recorded, activated, cancelled)
            != (self.stats.self_id_openings_recorded, self.stats.self_id_openings_activated, self.stats.self_id_openings_cancelled)
        {
            return Err("Self-ID case records differ from lifecycle counters".into());
        }
        Ok(())
    }
}
