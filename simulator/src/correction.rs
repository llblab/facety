//! Direct author correction. The caller supplies authenticated scope from an adapter; no merits result or case is created.
use super::*;

#[cfg(test)]
#[path = "correction_tests.rs"]
mod tests;

pub const CORRECTION_NETWORK: &str = "facety-sim/synthetic";
pub const CORRECTION_VERSION: u32 = 1;
pub const CORRECTION_POLICY: &str = "direct-author/one-act/two-funded-components/replay-integrity/v1";

/// Scope attested for a voluntary correction. The type identifies the operation kind. The simulator's trusted
/// adapter supplies the authority premise; this is not a signature verifier or proof of personhood.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CorrectionInput<'a> {
    pub network: &'a str,
    pub version: u32,
    pub author: Id,
    pub target: u32,
    pub nonce: u64,
    pub authority: TrustedPremise,
}

/// Immutable correction event, keyed by the Self-ID's historical ID. The network and version are fixed by the policy.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SelfIdCorrection {
    pub author: Id,
    pub target: u32,
    pub nonce: u64,
    pub recorded_at: i64,
    pub previous_disposition: ActStatus,
    pub emission_burned: Amount,
    pub restitution_burned: Amount,
    pub fee_burned: Amount,
}

/// One preserved recording position. `valid` describes the current interpretation, not a past verdict or capture time.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SelfIdObservation {
    pub act: u32,
    pub recorded_at: i64,
    pub original_predecessor: Option<u32>,
    pub valid: bool,
}

impl World {
    /// Immutable recording order, including cancelled and corrected acts.
    pub fn self_id_history(&self, author: Id) -> Option<&[u32]> {
        self.subjects.get(author as usize).map(|s| s.acts.as_slice())
    }

    /// The predecessor in the original history, not a rewritten reference across a correction.
    pub fn self_id_predecessor(&self, act: u32) -> Result<Option<u32>, Reject> {
        let source = self.acts.get(act as usize).ok_or(Reject("no such Self-ID transaction"))?;
        let chain = &self.subjects[source.subject as usize].acts;
        let position = chain.binary_search(&act).expect("each Self-ID belongs to its author's history");
        Ok(position.checked_sub(1).map(|i| chain[i]))
    }

    /// Show the original time and link even at a position that no longer has a valid observation.
    pub fn self_id_chronology(&self, author: Id) -> Option<impl Iterator<Item = SelfIdObservation> + '_> {
        self.self_id_history(author).map(|chain| {
            chain.iter().enumerate().map(|(i, &act)| SelfIdObservation {
                act,
                recorded_at: self.acts[act as usize].recorded_at,
                original_predecessor: i.checked_sub(1).map(|previous| chain[previous]),
                valid: self.valid_self_id(act),
            })
        })
    }

    /// Derive the valid chain from the historical order and recorded invalidations; the skip is not a new Self-ID.
    pub fn valid_self_ids(&self, author: Id) -> Option<impl Iterator<Item = u32> + '_> {
        self.self_id_history(author).map(|chain| chain.iter().copied().filter(|&act| self.valid_self_id(act)))
    }

    /// Check the 28-day recording window using current validity. This does not replay historical authority or change a decision.
    pub fn has_valid_self_id_at(&self, author: Id, at: i64) -> bool {
        self.self_id_history(author).is_some_and(|chain| {
            chain
                .iter()
                .rev()
                .copied()
                .skip_while(|&act| self.acts[act as usize].recorded_at > at)
                .take_while(|&act| self.acts[act as usize].recorded_at > at.saturating_sub(28 * DAY))
                .any(|act| self.valid_self_id(act))
        })
    }

    pub(super) fn valid_self_id(&self, act: u32) -> bool {
        let source = &self.acts[act as usize];
        source.status != ActStatus::Cancelled && !source.invalidated_before_credit && !source.credit.as_ref().is_some_and(|c| c.revoked)
    }

    pub fn self_id_correction(&self, act: u32) -> Option<&SelfIdCorrection> {
        self.corrections.get(&act)
    }

    /// Fully fund both components, then remove the claim from the valid chain and revoke only its actual receipt and repair.
    pub fn correct_own_self_id(&mut self, input: CorrectionInput<'_>) -> Result<SelfIdCorrection, Reject> {
        if input.authority != TrustedPremise::Supplied || input.network != CORRECTION_NETWORK || input.version != CORRECTION_VERSION {
            return Err(Reject("missing authority or wrong correction scope"));
        }
        if !self.cfg.integrity {
            return Err(Reject("voluntary correction requires the integrity policy"));
        }
        let author = input.author;
        let act = input.target;
        let subject = self.subjects.get(author as usize).ok_or(Reject("no such account"))?;
        if subject.lost_key {
            return Err(Reject("the private key is lost"));
        }
        let source = self.acts.get(act as usize).ok_or(Reject("no such Self-ID transaction"))?;
        if source.subject != author {
            return Err(Reject("voluntary correction requires the Self-ID author"));
        }
        if self.corrections.contains_key(&act) {
            return Err(Reject("the Self-ID was already voluntarily corrected"));
        }
        if self.corrections.values().any(|c| c.author == author && c.nonce == input.nonce) {
            return Err(Reject("correction nonce already used"));
        }
        let credit = source.credit.as_ref().ok_or(Reject("voluntary correction requires an already matured Self-ID"))?;
        // An accused account's rights cannot be disposed during its freeze. Pending identity cases can already
        // claim the chain. A specific earlier Self-ID case keeps its frozen scope and any executed remedy.
        let identity_pending = self.case_openings.iter().flatten().any(|r| r.accused == author && r.stage == OpeningStage::Pending);
        let external_priority =
            self.self_id_cases.iter().flatten().any(|r| r.stage != SelfIdCaseStage::Cancelled && (r.target == act || r.affected.binary_search(&act).is_ok()));
        if self.frozen[author as usize] != 0 || identity_pending || external_priority {
            return Err(Reject("an earlier external proceeding controls this Self-ID or its backing"));
        }
        if self.recovery_log.iter().any(|&(_, retired, _)| credit.recipients.contains(&retired)) {
            return Err(Reject("voluntary correction across completed key recovery requires migration"));
        }
        // Only Collector can secure stakes. The active freeze and prior-proceeding checks above exclude
        // concurrent custody on the unspent source. Historical dispositions are never used as new payment.
        let previous_disposition = source.status;
        let own_backing = previous_disposition == ActStatus::Unspent;
        let restitution_burned = if own_backing { Amount::ZERO } else { Amount::ONE };
        let collector_charge = restitution_burned + Amount::ONE;
        if self.spendable(author) < collector_charge {
            return Err(Reject("insufficient spendable Collector funds for voluntary correction"));
        }
        let correction = SelfIdCorrection {
            author,
            target: act,
            nonce: input.nonce,
            recorded_at: self.now,
            previous_disposition,
            emission_burned: if own_backing { Amount::ONE } else { Amount::ZERO },
            restitution_burned,
            fee_burned: Amount::ONE,
        };
        if own_backing {
            self.dispose(act, ActStatus::Consumed);
        }
        self.subjects[author as usize].liquid -= collector_charge;
        self.destroy_liquid(collector_charge);
        self.revoke_source_for(act, RevocationCause::VoluntaryCorrection);
        self.corrections.insert(act, correction);
        self.subjects[author as usize].coef = self.replay_integrity(author).expect("ordered integrity history");
        self.refresh_xp(author);
        Ok(correction)
    }

    pub(super) fn audit_corrections(&self) -> Result<(), String> {
        let mut nonces = HashSet::new();
        for (&act, c) in &self.corrections {
            let source = self.acts.get(act as usize).ok_or_else(|| format!("correction {act} has no source"))?;
            let backed = c.previous_disposition == ActStatus::Unspent;
            if c.target != act
                || c.author != source.subject
                || !nonces.insert((c.author, c.nonce))
                || c.recorded_at > self.now
                || source.credit.as_ref().is_none_or(|r| r.at > c.recorded_at)
                || source.status != if backed { ActStatus::Consumed } else { c.previous_disposition }
                || c.emission_burned != if backed { Amount::ONE } else { Amount::ZERO }
                || c.restitution_burned != if backed { Amount::ZERO } else { Amount::ONE }
                || c.fee_burned != Amount::ONE
                || !self.xp_revocations.get(&act).is_some_and(|causes| causes.contains(&RevocationCause::VoluntaryCorrection))
            {
                return Err(format!("inconsistent correction {act}"));
            }
        }
        Ok(())
    }
}
