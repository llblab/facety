//! Self-ID emission transactions: creation, free early cancellation, the 24-hour maturity credit and its debt repayment,
//! consumption, and authorized source revocation. World owns every XP and money effect; the scheduler calls `settle` at
//! every tick so a batch equals chronological processing (D42/D54/D163).
use super::*;

impl World {
    /// Authorized source revocation (a separately authorized correction, never a side effect of consumption): the credit of one source
    /// Self-ID is withdrawn from every recipient, once. Other sources keep their credits; nothing is replayed. Returns whether it changed.
    pub fn revoke_source_xp(&mut self, act_id: u32) -> bool {
        self.revoke_source_for(act_id, None)
    }

    pub(super) fn revoke_source_for(&mut self, act_id: u32, case: Option<u32>) -> bool {
        let act = &mut self.acts[act_id as usize];
        let Some(credit) = act.credit.as_mut() else { return false };
        let causes = self.xp_revocations.entry(act_id).or_default();
        if !causes.contains(&case) {
            causes.push(case);
        }
        if credit.revoked {
            return false;
        }
        credit.revoked = true;
        let live: Vec<Id> = credit.recipients.to_vec();
        for recipient in live {
            self.bump(recipient, -1);
        }
        true
    }

    /// Materialize the ordinary XP of every Self-ID that matured at or before `now` (D42). The logical credit time is
    /// `recorded_at + MATURITY_HOURS`; the recipients are the author and the creation-time guarantor snapshot (D54), never the current
    /// graph. Cancelled acts (free early cancellation) earn nothing. Spending, withdrawal or burning the entitlement is not an input.
    /// Time moves only through `tick`, which settles first, so every decision reads exactly the XP that a credit at the maturity
    /// timestamp would have produced; settling a batch is the chronological processing of its acts.
    pub(super) fn settle(&mut self) {
        while self.settled < self.acts.len() {
            let act_id = self.settled as u32;
            let (recorded_at, status) = {
                let a = &self.acts[self.settled];
                (a.recorded_at, a.status)
            };
            if recorded_at + MATURITY_HOURS > self.now {
                break;
            }
            self.settled += 1;
            if status != ActStatus::Cancelled {
                if !self.subjects[self.acts[act_id as usize].subject as usize].debt.is_zero() {
                    self.stats.suspended_acts += 1;
                    // D167: while the author's emission balance is negative nobody earns XP for its acts (a suspended, empty credit).
                    let at = self.acts[act_id as usize].recorded_at + MATURITY_HOURS;
                    self.acts[act_id as usize].credit = Some(Credit { at, revoked: false, recipients: Arc::from(Vec::new()) });
                } else {
                    self.credit(act_id);
                }
                // D165 restores integrity for a valid own maturity even when D167 suspends its new responsibility units.
                let subject = self.acts[act_id as usize].subject;
                self.subjects[subject as usize].own_maturities += 1;
                if self.cfg.integrity {
                    let c = &mut self.subjects[subject as usize].coef;
                    *c = (*c + COEF_STEP).min(COEF_ONE);
                    self.refresh_xp(subject);
                }
                // D166/D4: a negative emission balance (debt) is repaid from the matured entitlement of the account, burned.
                if status == ActStatus::Unspent && !self.subjects[self.acts[act_id as usize].subject as usize].debt.is_zero() {
                    self.repay_debt_from(act_id);
                }
            }
        }
    }

    fn repay_debt_from(&mut self, act_id: u32) {
        let subject = self.acts[act_id as usize].subject;
        let paid = self.subjects[subject as usize].debt.min(Amount::ONE);
        if paid == Amount::ONE {
            self.acts[act_id as usize].status = ActStatus::Consumed;
            self.vault -= 1;
            self.burned += paid;
        } else {
            // Materialize the whole right, burn only the remaining debt and retain exact fractional change in the Collector.
            self.dispose(act_id, ActStatus::Converted);
            self.subjects[subject as usize].liquid -= paid;
            self.destroy_liquid(paid);
        }
        let mut remaining = paid;
        for tranche in &mut self.subjects[subject as usize].debt_tranches {
            let part = remaining.min(tranche.remaining);
            tranche.remaining -= part;
            tranche.repaid += part;
            remaining -= part;
            if remaining.is_zero() {
                break;
            }
        }
        debug_assert!(remaining.is_zero());
        self.subjects[subject as usize].debt -= paid;
        self.subjects[subject as usize].debt_repaid += paid;
        self.stats.debt_repaid += paid;
        let s = &mut self.subjects[subject as usize];
        while s.first_unspent < s.acts.len() && self.acts[s.acts[s.first_unspent] as usize].status != ActStatus::Unspent {
            s.first_unspent += 1;
        }
    }

    fn credit(&mut self, act_id: u32) {
        let (subject, at, recipients) = {
            let act = &self.acts[act_id as usize];
            debug_assert!(act.credit.is_none(), "an act is credited at most once");
            let mut r = Vec::with_capacity(1 + act.guarantors.len());
            r.push(act.subject);
            r.extend(act.guarantors.iter().copied());
            (act.subject, act.recorded_at + MATURITY_HOURS, r)
        };
        for &recipient in &recipients {
            self.bump(recipient, 1);
        }
        let shared = match &self.subjects[subject as usize].last_recipients {
            Some(last) if **last == *recipients => last.clone(),
            _ => {
                let fresh: Arc<[Id]> = recipients.into();
                self.subjects[subject as usize].last_recipients = Some(fresh.clone());
                fresh
            }
        };
        self.acts[act_id as usize].credit = Some(Credit { at, revoked: false, recipients: shared });
    }

    pub(super) fn dispose(&mut self, act_id: u32, status: ActStatus) {
        let subject = self.acts[act_id as usize].subject;
        debug_assert!(self.acts[act_id as usize].status == ActStatus::Unspent);
        self.acts[act_id as usize].status = status;
        self.vault -= 1;
        if status == ActStatus::Converted {
            self.subjects[subject as usize].liquid += Amount::ONE;
        } else {
            self.burned += Amount::ONE;
        }
        let s = &mut self.subjects[subject as usize];
        while s.first_unspent < s.acts.len() && self.acts[s.acts[s.first_unspent] as usize].status != ActStatus::Unspent {
            s.first_unspent += 1;
        }
    }

    pub fn create_self_id(&mut self, who: Id) -> Result<u32, Reject> {
        self.require_account(who)?;
        self.require_free(who)?;
        if let Some(t) = self.subjects[who as usize].last_reward {
            if self.now - t < DAY {
                return Err(Reject("rolling 24-hour reward limit"));
            }
        }
        // D84: one established mutual guarantor that reaches a Council member within the path bound.
        let partners = self.mutual_partners(who);
        if partners.is_empty() {
            return Err(Reject("Self-ID requires an established mutual guarantor"));
        }
        if !partners.iter().any(|&p| self.self_gate(p)) {
            return Err(Reject("insufficient Council paths"));
        }
        let guarantors = self.eligible_guarantors(who);
        let guarantors: Arc<[Id]> = match &self.subjects[who as usize].last_guarantors {
            Some(last) if **last == *guarantors => last.clone(),
            _ => {
                let fresh: Arc<[Id]> = guarantors.into();
                self.subjects[who as usize].last_guarantors = Some(fresh.clone());
                fresh
            }
        };
        let id = self.acts.len() as u32;
        self.acts.push(Act { subject: who, recorded_at: self.now, guarantors, status: ActStatus::Unspent, credit: None });
        let s = &mut self.subjects[who as usize];
        s.acts.push(id);
        s.last_reward = Some(self.now);
        self.minted += 1;
        self.vault += 1;
        Ok(id)
    }

    pub fn convert_to_collector(&mut self, who: Id, act: u32) -> Result<(), Reject> {
        self.require_account(who)?;
        if self.frozen[who as usize] > 0 {
            return Err(Reject("unspent rights are frozen while the account is accused"));
        }
        let a = self.acts.get(act as usize).ok_or(Reject("no such Self-ID transaction"))?;
        if a.subject != who || self.now - a.recorded_at < self.cfg.spend_hours || a.status != ActStatus::Unspent || self.reserved_rights.contains(&act) {
            return Err(Reject("conversion requires own mature emission"));
        }
        self.dispose(act, ActStatus::Converted);
        Ok(())
    }

    /// D42/D79 free early cancellation of an unspent Self-ID inside its initial 24 hours, by its author or by a guarantor of its creation-time
    /// snapshot. The emission right and its backing are destroyed and no ordinary XP is ever earned; the rolling 24-hour slot of the
    /// recording stays used (`last_reward` is not reset). A disputed author cannot cancel (the dispute freeze takes precedence; the
    /// precedence rule itself is OPEN, so the smallest reading is taken: refused).
    pub fn cancel_self_id(&mut self, actor: Id, act: u32) -> Result<(), Reject> {
        self.require_account(actor)?;
        let a = self.acts.get(act as usize).ok_or(Reject("no such Self-ID transaction"))?;
        let (subject, recorded_at, status) = (a.subject, a.recorded_at, a.status);
        if status != ActStatus::Unspent {
            return Err(Reject("only an unspent Self-ID can be cancelled"));
        }
        if self.now - recorded_at >= MATURITY_HOURS {
            return Err(Reject("the free cancellation window ended at maturity"));
        }
        if actor != subject && !self.acts[act as usize].guarantors.contains(&actor) {
            return Err(Reject("no authority to cancel the Self-ID"));
        }
        if self.hold[subject as usize] > 0 {
            return Err(Reject("open-dispute activity restriction"));
        }
        self.acts[act as usize].status = ActStatus::Cancelled;
        self.vault -= 1;
        self.burned += Amount::ONE;
        let s = &mut self.subjects[subject as usize];
        while s.first_unspent < s.acts.len() && self.acts[s.acts[s.first_unspent] as usize].status != ActStatus::Unspent {
            s.first_unspent += 1;
        }
        Ok(())
    }

    pub(super) fn require_mature_own(&self, who: Id, act: u32, hours: i64, what: &'static str) -> Result<(), Reject> {
        let a = self.acts.get(act as usize).ok_or(Reject("no such Self-ID transaction"))?;
        if a.status != ActStatus::Unspent || self.reserved_rights.contains(&act) {
            return Err(Reject("emission is spent or disputed"));
        }
        if a.subject != who || self.now - a.recorded_at < hours {
            return Err(Reject(what));
        }
        Ok(())
    }
}
