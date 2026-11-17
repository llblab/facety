//! The first independent Self-ID transaction fixture: a typed challenged Self-ID, a 24-hour pending opening, a
//! filing-frozen inclusive count (D189/D195) and the case's own settlement with case-specific restoration.
//!
//! This is an explicitly trusted test subset, not production admission, authentication, collective authority or a
//! general asset-priority rule. The caller states that admission and historical-duty qualification were supplied
//! externally; an evaluator label or a caller's allegation is never accepted as a verdict. Everything outside the
//! declared boundary refuses before mutation instead of inheriting an identity-case or ordinary-case convention.
//!
//! Recording fixes the disputed scope and the money: the inclusive suffix of the accused's personal chain that existed
//! then, the frozen `N`, the accuser's stake and every charge. Self-IDs recorded afterwards are outside this case, so the
//! pendency can delay activation but never raise this case's exposure. Settlement collects the accused's actual backing
//! through the selected soft-backing custody (D166) and pays the first accuser from it; the uncollected remainder is this
//! case's FIFO debt, never an invented payment or burn. Each original creation-time guarantor owes its own frozen `N`,
//! burned from its independent backing with its own shortfall as its own debt. The isolated D192 witness is the special
//! case where the accused holds exactly one mature unspent right and nothing else.
use super::*;
use crate::chekharda::stake;

/// The declared conventions of this fixture, distinct from the identity-case and ordinary-stake policies. Version 2 fixes
/// the endpoint and `N` at recording (D195, superseding D190's activation time for this case kind) and executes any frozen
/// `N` through the model's existing soft-backing collection rather than a case-local collection scope.
pub const SELF_ID_CASE_POLICY: &str = "trusted-core-only/typed-self-id-target/filing-frozen-n/soft-backing-settlement/v2";

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
    /// Fixed once at recording (D195); later Self-IDs, verdicts or deferrals cannot reprice it.
    pub frozen: Option<FrozenCount>,
    /// The accused's recorded Self-ID count at filing, proving the frozen endpoint was not extended later.
    pub accused_chain_at_recording: u32,
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
    /// Always zero: the transferred backing is not burned again.
    pub source_burned: Amount,
    /// Backing of the invalidated unmatured affected acts, removed because it never became an entitlement.
    pub invalidated_burned: Amount,
    /// Charge that no actual collection covered; recorded as this case's FIFO debt.
    pub unpaid_accused: Amount,
    /// Nominal charge of the original-guarantor roster (`N` each).
    pub guarantor_charge: Amount,
    pub guarantor_burned: Amount,
    /// The frozen affected suffix, oldest first: the acts this case corrected.
    pub affected: Vec<u32>,
    /// Affected acts that had not matured yet and were invalidated instead of being credited later; their backing never
    /// became an entitlement, so it is removed at settlement rather than transferred.
    pub invalidated: Vec<u32>,
    /// Every source receipt this case revoked, with its credit time and actual recipients.
    pub revoked_receipts: Vec<SelfIdRevokedReceipt>,
    pub coefficient_before: u32,
    pub coefficient_after: u32,
    pub settled_at: i64,
    pub reversed: bool,
}

/// One revoked source receipt, retained so case-specific restoration returns exactly these units to these recipients.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SelfIdRevokedReceipt {
    pub act: u32,
    pub at: i64,
    pub recipients: Vec<Id>,
}

/// The complete read-only effect plan of one activated case: either it is executable now, or `Err` names why it is not.
/// A refusal here is a capability or OPEN-contract boundary, never a verdict, expiry, acquittal or zero-valued settlement.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SelfIdEffectPlan {
    pub case: u32,
    pub target: u32,
    pub accuser: Id,
    pub accused: Id,
    pub frozen: FrozenCount,
    /// The frozen affected suffix (positions `violating`..=`endpoint`), oldest first.
    pub affected: Vec<u32>,
    /// Frozen nominal charge of the accused (`N`).
    pub accused_charge: Amount,
    /// Affected backing this case may collect right now: mature, unspent and not reserved by another case.
    pub accused_collectible: Amount,
    /// `accused_charge - accused_collectible`, recorded as this case's FIFO debt.
    pub accused_unpaid: Amount,
    pub source_guarantors: Vec<Id>,
    /// Frozen nominal charge of each original creation-time guarantor (`N` each).
    pub guarantor_charge_each: Amount,
    pub coefficient_before: u32,
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
        // Role conflicts that would make this case unexecutable are refused here, while the case owns no custody, hold or
        // restriction, instead of stranding an activated case later. Multiple-role overlap remains OPEN (Q25-B1).
        let mut roster: Vec<Id> = guarantors.to_vec();
        roster.sort_unstable();
        roster.dedup();
        if roster.len() != guarantors.len() {
            return Err(Reject("the challenged Self-ID's creation roster has duplicate roles"));
        }
        if guarantors.contains(&accuser) {
            return Err(Reject("the opener cannot be a creation-time guarantor of the challenged Self-ID"));
        }
        if guarantors.iter().any(|&g| g as usize >= self.subjects.len()) {
            return Err(Reject("the challenged Self-ID's creation roster names an unknown account"));
        }
        // D195: the disputed scope and its monetary liability are frozen here, at recording. The 24-hour pending period
        // still only delays activation; later Self-IDs cannot increase this case's stake, charges or financial exposure.
        let acts = &self.subjects[accused as usize].acts;
        let violating = acts.iter().position(|&a| a == act).ok_or(Reject("the challenged Self-ID is not in the owner's chain"))? as u32 + 1;
        let endpoint = acts.len() as u32;
        let frozen = FrozenCount { violating, endpoint, n: endpoint - violating + 1 };
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
            frozen: Some(frozen),
            accused_chain_at_recording: endpoint,
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

    /// Activate in its existing slot: reserve the recording-frozen `N` FCTY first stake and begin the ordinary holds.
    /// Recording fixed admission and the disputed scope; later XP, membership or Self-ID changes cannot reprice it.
    pub(crate) fn activate_self_id_case(&mut self, case: u32, at: i64) {
        let record = self.self_id_cases[case as usize].as_ref().expect("pending Self-ID case").clone();
        let frozen = record.frozen.expect("recording fixed the disputed scope");
        let backing = self.reserve_stake(record.author, stake(1, frozen.n));
        let ladder = Ladder::open(record.author, record.author_xp_at_recording, at, frozen.n);
        let mut held = Case { ladder, electorates: Vec::new(), accused: record.accused, backed: vec![backing], holds: Vec::new() };
        let (author_path, accused_path) = (self.path_held(&held, record.author), self.path_held(&held, record.accused));
        held.holds = vec![(record.author, at, author_path), (record.accused, at, accused_path)];
        self.hold_for(record.author, author_path);
        self.hold_for(record.accused, accused_path);
        self.frozen[record.accused as usize] += 1;
        // D196: the accused's not-yet-processed maturities are suspended for the whole active case.
        self.establish_maturity_hold(case, record.accused, at);
        self.cases[case as usize] = Some(held);
        let record = self.self_id_cases[case as usize].as_mut().expect("pending record");
        record.stage = SelfIdCaseStage::Activated;
        record.activated_at = Some(at);
        self.stats.self_id_openings_activated += 1;
    }

    /// Read-only effect plan of one activated case. `Ok` means the case settles now; `Err` names why it does not, and is a
    /// capability or OPEN-contract boundary, never a verdict, expiry, acquittal or completed settlement.
    ///
    /// Asset state is a plan input, not an admissibility test: a consumed, burned, transferred or otherwise unavailable
    /// affected right lowers actual collection and raises this case's debt instead of stranding an activated case.
    pub fn self_id_case_plan(&self, case: u32) -> Result<SelfIdEffectPlan, Reject> {
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
        let (accuser, accused, target) = (record.author, record.accused, record.target);
        if accuser == accused || accuser as usize >= self.subjects.len() || accused as usize >= self.subjects.len() {
            return Err(Reject("the Self-ID case has unusable parties"));
        }
        let frozen = record.frozen.ok_or(Reject("the Self-ID case has no frozen chain count"))?;
        let chain = &self.subjects[accused as usize].acts;
        if frozen.violating == 0
            || frozen.endpoint < frozen.violating
            || frozen.endpoint as usize > chain.len()
            || chain[(frozen.violating - 1) as usize] != target
            || frozen.n != frozen.endpoint - frozen.violating + 1
        {
            return Err(Reject("the frozen chain count does not match the accused's recorded chain"));
        }
        let affected: Vec<u32> = chain[(frozen.violating - 1) as usize..frozen.endpoint as usize].to_vec();
        let source_guarantors = record.source_guarantors.clone();
        let mut distinct = source_guarantors.clone();
        distinct.sort_unstable();
        distinct.dedup();
        if distinct.len() != source_guarantors.len() || source_guarantors.iter().any(|&g| g as usize >= self.subjects.len() || g == accuser || g == accused) {
            return Err(Reject("the original guarantor roster has an unusable role"));
        }
        // A completed key recovery moved receipts and liability to a successor under a separate OPEN contract (Q25-C1).
        let recovered = |id: Id| {
            let s = &self.subjects[id as usize];
            s.recovers.is_some() || s.lost_key || s.restored_xp != 0 || self.recovery_log.iter().any(|&(successor, source, _)| successor == id || source == id)
        };
        let mut touched: Vec<Id> = Vec::with_capacity(2 * affected.len() + source_guarantors.len() + 1);
        touched.push(accused);
        touched.extend(source_guarantors.iter().copied());
        for &act in &affected {
            if let Some(credit) = self.acts[act as usize].credit.as_ref() {
                touched.extend(credit.recipients.iter().copied());
            }
        }
        if touched.iter().copied().any(recovered) {
            return Err(Reject("a completed key recovery interacts with this case"));
        }
        // Collection uses the existing selected soft-backing custody (D166): spendable liquid, then unreserved mature own
        // rights, and the remainder as this case's FIFO debt. No case-local asset priority is introduced.
        let charge = Amount::coins(u64::from(frozen.n));
        let afford = self.spendable(accused) + Amount::coins(self.eligible_emissions(accused, MATURITY_HOURS).len() as u64);
        let collectible = charge.min(afford);
        Ok(SelfIdEffectPlan {
            case,
            target,
            accuser,
            accused,
            frozen,
            affected,
            accused_charge: charge,
            accused_collectible: collectible,
            accused_unpaid: charge.checked_sub(collectible).unwrap_or(Amount::ZERO),
            source_guarantors,
            guarantor_charge_each: charge,
            coefficient_before: self.subjects[accused as usize].coef,
        })
    }

    /// Execute the plan in one World-owned effect path. A repeated call with the upheld premise returns the retained
    /// journal without a second payment, burn, penalty or receipt removal; a non-upheld premise refuses even on replay.
    pub fn settle_self_id_case_fixture(&mut self, case: u32, merits: TrustedMerits) -> Result<SelfIdSettlement, Reject> {
        if merits != TrustedMerits::UpheldSupplied {
            return Err(Reject("only an upheld supplied merits result is executable in this fixture"));
        }
        let record = self.self_id_case(case).ok_or(Reject("no such Self-ID transaction case"))?.clone();
        if record.stage == SelfIdCaseStage::Final {
            return self.self_id_settlement(case).cloned().ok_or(Reject("the final Self-ID case has no settlement journal"));
        }
        let plan = self.self_id_case_plan(case)?;
        let held = self.cases[case as usize].take().expect("the plan found an active Self-ID case");
        // 1. Collect the accused's actual backing for the first accuser before the source cut, using the selected
        //    soft-backing custody; anything uncollected becomes this case's debt inside `charge`.
        let collected = self.charge(plan.accused, plan.accused_charge, case);
        self.subjects[plan.accuser as usize].liquid += collected;
        // 2. Cut only the affected scope's actual receipts, keyed to this case; history outside it is untouched.
        let mut receipts = Vec::with_capacity(plan.affected.len());
        for &act in &plan.affected {
            if let Some(credit) = self.acts[act as usize].credit.as_ref() {
                receipts.push(SelfIdRevokedReceipt { act, at: credit.at, recipients: credit.recipients.to_vec() });
                self.revoke_source_for(act, Some(case));
            }
        }
        let sources: Vec<u32> = receipts.iter().map(|r| r.act).collect();
        // 2b. An affected act that has not been credited yet must never be credited: the correction invalidates its source, so its
        //     unmatured backing is removed at settlement instead of becoming an entitlement and a deferred reward later.
        let mut invalidated = Vec::new();
        for &act in &plan.affected {
            if self.acts[act as usize].credit.is_none() && self.acts[act as usize].status == ActStatus::Unspent {
                self.dispose(act, ActStatus::Cancelled);
                invalidated.push(act);
            }
        }
        let invalidated_burned = Amount::coins(invalidated.len() as u64);
        // 3. Apply the selected losing-author coefficient consequence under the declared arithmetic. The journal records the
        //    coefficient immediately after this case's own penalty; later release credits repair integrity on their own terms.
        self.penalize_xp_for_case(plan.accused, 0.5, case);
        let coefficient_after = self.subjects[plan.accused as usize].coef;
        // 4. Charge each original creation-time guarantor its frozen share and burn the actual collection.
        let mut guarantor_burned = Amount::ZERO;
        let mut debts = Vec::new();
        let mut net = Vec::with_capacity(plan.source_guarantors.len() + 2);
        let unpaid_accused = plan.accused_charge.checked_sub(collected).unwrap_or(Amount::ZERO);
        if !unpaid_accused.is_zero() {
            debts.push((plan.accused, unpaid_accused));
        }
        if !collected.is_zero() {
            net.push((plan.accused, SignedAmount::negative(collected).expect("collected value fits signed accounting")));
            net.push((plan.accuser, SignedAmount::from_amount(collected).expect("collected value fits signed accounting")));
        }
        for &g in &plan.source_guarantors {
            let paid = self.charge(g, plan.guarantor_charge_each, case);
            self.destroy_liquid(paid);
            guarantor_burned += paid;
            let unpaid = plan.guarantor_charge_each.checked_sub(paid).unwrap_or(Amount::ZERO);
            if !unpaid.is_zero() {
                debts.push((g, unpaid));
            }
            if !paid.is_zero() {
                net.push((g, SignedAmount::negative(paid).expect("burned value fits signed accounting")));
            }
        }
        // 5. Release the accuser's own backing and this case's restrictions; every other case keeps its own.
        let holds = self.release_case(&held);
        // The correction already ran, so only the accused's remaining valid maturities may be credited, exactly once.
        self.release_maturity_hold(case);
        self.process_deferred_maturities();
        // 6. Journal the completed effects under this case.
        self.case_effects[case as usize] = Some(CaseEffects {
            kind: CaseKind::SelfIdTransaction,
            accused: plan.accused,
            winner: Side::Accuser,
            reversed: false,
            identity_subjects: Vec::new(),
            source_acts: sources,
            penalized_subjects: vec![plan.accused],
        });
        self.case_outcomes[case as usize] = Some(CaseOutcome {
            settled_at: self.now,
            forced_winner: Some(Side::Accuser),
            winner: Side::Accuser,
            accuser: plan.accuser,
            accused: plan.accused,
            positions: held.ladder.len(),
            position_history: held.ladder.positions().to_vec(),
            holds,
            losers: vec![plan.accused],
            net,
            debts,
            council_rounds: Vec::new(),
            council_electorates: Vec::new(),
        });
        let guarantor_charge = Amount::coins(u64::from(plan.frozen.n).saturating_mul(plan.source_guarantors.len() as u64));
        let settlement = SelfIdSettlement {
            case,
            target: plan.target,
            accuser: plan.accuser,
            accused: plan.accused,
            frozen: plan.frozen,
            affected: plan.affected,
            invalidated,
            source_guarantors: plan.source_guarantors.clone(),
            charged_guarantors: plan.source_guarantors,
            accused_charge: plan.accused_charge,
            accused_collected: collected,
            accuser_award: collected,
            source_burned: Amount::ZERO,
            invalidated_burned,
            unpaid_accused,
            guarantor_charge,
            guarantor_burned,
            revoked_receipts: receipts,
            coefficient_before: plan.coefficient_before,
            coefficient_after,
            settled_at: self.now,
            reversed: false,
        };
        self.self_id_settlements[case as usize] = Some(settlement.clone());
        let record = self.self_id_cases[case as usize].as_mut().expect("recorded Self-ID case");
        record.stage = SelfIdCaseStage::Final;
        self.stats.self_id_settled += 1;
        self.stats.self_id_awarded += settlement.accuser_award;
        self.stats.self_id_unpaid += settlement.unpaid_accused;
        self.stats.self_id_guarantor_burned += settlement.guarantor_burned;
        self.stats.self_id_source_burned += settlement.source_burned;
        self.stats.self_id_invalidated_burned += settlement.invalidated_burned;
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
                    || frozen.endpoint > record.accused_chain_at_recording
                    || record.accused_chain_at_recording > self.subjects[record.accused as usize].acts.len() as u32
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
                        || self.cases[id as usize].is_some()
                        || effects.is_some()
                        || settlement.is_some()
                    {
                        return Err(format!("Self-ID case {id} has invalid pending state"));
                    }
                }
                SelfIdCaseStage::Cancelled => {
                    if record.activated_at.is_some()
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
                        || effects.accused != record.accused
                        || outcome.accused != record.accused
                        || outcome.accuser != record.author
                        || outcome.winner != Side::Accuser
                        || outcome.forced_winner != Some(Side::Accuser)
                        || outcome.positions != 1
                    {
                        return Err(format!("Self-ID case {id} has an invalid settlement"));
                    }
                    let frozen = settlement.frozen;
                    let chain = &self.subjects[record.accused as usize].acts;
                    let suffix: Vec<u32> = chain[(frozen.violating - 1) as usize..frozen.endpoint as usize].to_vec();
                    let charge = Amount::coins(u64::from(frozen.n));
                    if settlement.case != id
                        || settlement.target != record.target
                        || settlement.affected != suffix
                        || effects.source_acts != settlement.revoked_receipts.iter().map(|r| r.act).collect::<Vec<u32>>()
                        || settlement.accused_charge != charge
                        || settlement.accuser_award != settlement.accused_collected
                        || settlement.accused_collected > settlement.accused_charge
                        || settlement.unpaid_accused != charge.checked_sub(settlement.accused_collected).unwrap_or(Amount::ZERO)
                        || !settlement.source_burned.is_zero()
                        || settlement.charged_guarantors != settlement.source_guarantors
                        || settlement.guarantor_charge != Amount::coins(u64::from(frozen.n).saturating_mul(settlement.source_guarantors.len() as u64))
                        || settlement.guarantor_burned > settlement.guarantor_charge
                        || settlement.invalidated_burned != Amount::coins(settlement.invalidated.len() as u64)
                        || settlement.invalidated.windows(2).any(|w| w[0] >= w[1])
                        || settlement.invalidated.iter().any(|act| {
                            !settlement.affected.contains(act)
                                || self.acts[*act as usize].status != ActStatus::Cancelled
                                || self.acts[*act as usize].credit.is_some()
                        })
                        || settlement.settled_at != outcome.settled_at
                        || settlement.coefficient_before > COEF_ONE
                        || settlement.coefficient_after != grid_penalty(settlement.coefficient_before, 0.5)
                        || settlement.reversed != effects.reversed
                    {
                        return Err(format!("Self-ID case {id} violates the frozen-scope settlement accounting"));
                    }
                    for receipt in &settlement.revoked_receipts {
                        if receipt.act as usize >= self.acts.len()
                            || !effects.source_acts.contains(&receipt.act)
                            || Some(receipt.at) != self.acts[receipt.act as usize].credit.as_ref().map(|c| c.at)
                            || (!effects.reversed && !self.acts[receipt.act as usize].credit.as_ref().is_some_and(|c| c.revoked))
                        {
                            return Err(format!("Self-ID case {id} has an invalid revoked receipt"));
                        }
                    }
                }
            }
        }
        let recorded = self.self_id_cases.iter().flatten().count() as u64;
        let activated = self.self_id_cases.iter().flatten().filter(|r| r.activated_at.is_some()).count() as u64;
        let cancelled = self.self_id_cases.iter().flatten().filter(|r| r.stage == SelfIdCaseStage::Cancelled).count() as u64;
        let settled = self.self_id_cases.iter().flatten().filter(|r| r.stage == SelfIdCaseStage::Final).count() as u64;
        if (recorded, activated, cancelled, settled)
            != (self.stats.self_id_openings_recorded, self.stats.self_id_openings_activated, self.stats.self_id_openings_cancelled, self.stats.self_id_settled)
        {
            return Err("Self-ID case records differ from lifecycle counters".into());
        }
        let awarded: Amount = self.self_id_settlements.iter().flatten().map(|s| s.accuser_award).sum();
        let guarantor_burned: Amount = self.self_id_settlements.iter().flatten().map(|s| s.guarantor_burned).sum();
        let unpaid: Amount = self.self_id_settlements.iter().flatten().map(|s| s.unpaid_accused).sum();
        if awarded != self.stats.self_id_awarded || guarantor_burned != self.stats.self_id_guarantor_burned || unpaid != self.stats.self_id_unpaid {
            return Err("Self-ID settlement journals differ from the monetary counters".into());
        }
        Ok(())
    }
}
