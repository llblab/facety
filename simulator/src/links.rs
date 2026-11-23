//! Guarantee links: owned valences and special invitation links, their K-slot accounting, and the Council-path gate for
//! invitations. World owns the economic mutations; a guarantor who leaves keeps the units already credited (D166).
use super::*;

impl World {
    // ---- guarantees ------------------------------------------------------------------------------------------------

    /// End a guarantee. D166: the guarantor keeps the units of responsibility already credited for past acts of the guaranteed account
    /// (they stay until a dispute refutes the act); only future snapshots are affected.
    fn deactivate(&mut self, rel_id: u32) {
        let (g, d) = {
            let r = &mut self.rels[rel_id as usize];
            r.active = false;
            (r.guarantor, r.guaranteed)
        };
        self.graph.remove_edge(g, d);
    }

    pub(super) fn used_slots(&self, id: Id) -> u32 {
        self.owned_open[id as usize] + self.inv_units[id as usize]
    }

    pub fn open_valence_of(&self, owner: Id, counterpart: Id) -> Option<u32> {
        self.open_val.get(&(owner, counterpart)).copied()
    }

    /// Open a paid valence toward `counterpart`, burning the emission right `act`. A matching opposite valence
    /// establishes the mutual guarantee.
    pub fn open_valence(&mut self, owner: Id, counterpart: Id, act: u32) -> Result<u32, Reject> {
        self.require_account(owner)?;
        self.require_account(counterpart)?;
        if owner == counterpart {
            return Err(Reject("valence requires a distinct counterpart"));
        }
        self.require_free(owner)?;
        self.require_solvent(owner)?;
        if self.open_val.contains_key(&(owner, counterpart)) {
            return Err(Reject("owner already holds an open valence toward counterpart"));
        }
        if self.used_slots(owner) >= self.slot_ceiling(owner) {
            return Err(Reject("owned-slot ceiling reached"));
        }
        self.require_mature_own(owner, act, self.cfg.spend_hours, "valence requires own mature Emitter right")?;
        let opposite = self.open_val.get(&(counterpart, owner)).copied();
        if opposite.is_some() {
            self.require_free(counterpart)?;
            if self.graph.has_edge(owner, counterpart) || self.graph.has_edge(counterpart, owner) {
                return Err(Reject("guarantee edge already active"));
            }
        }
        self.dispose(act, ActStatus::Consumed);
        let id = self.push_valence(owner, counterpart);
        if let Some(op) = opposite {
            let rels = self.establish(owner, counterpart);
            self.valences[id as usize].rels = rels.clone();
            self.valences[op as usize].rels.extend(rels);
        }
        Ok(id)
    }

    /// Free withdrawal (D110): the withdrawer's open valence closes and any matched pair ends.
    /// Previously credited units remain attached to unrefuted historical acts (D166).
    pub fn withdraw_valence(&mut self, owner: Id, valence: u32) -> Result<(), Reject> {
        let (open, v_owner, counterpart, rels) = {
            let v = self.valences.get(valence as usize).ok_or(Reject("no such valence"))?;
            (v.open, v.owner, v.counterpart, v.rels.clone())
        };
        if !open || v_owner != owner {
            return Err(Reject("no open own valence to withdraw"));
        }
        self.require_account(owner)?;
        self.valences[valence as usize].open = false;
        self.open_val.remove(&(owner, counterpart));
        self.owned_open[owner as usize] -= 1;
        for rel in rels {
            if self.rels[rel as usize].active {
                self.deactivate(rel);
            }
        }
        Ok(())
    }

    // ---- invitations -----------------------------------------------------------------------------------------------

    /// H1: a certificate for the invitation question built from the layered-support levels. Every supported account has at least D mutual
    /// neighbors of strictly lower level, so descending chains exist; the family is read off those chains and verified against the graph
    /// at the same revision, so an accepted answer is a valid certificate. `Err(true)` is a proof of impossibility (fewer
    /// than D usable first hops), `Err(false)` means the construction did not settle the question.
    fn structural_family(&mut self, u: Id, d: usize) -> Result<Vec<Vec<Id>>, bool> {
        let Some(max_nodes) = self.cfg.max_nodes else { return Err(false) };
        if !self.cfg.layered || self.council_mask.get(u as usize).copied().unwrap_or(false) {
            return Err(false);
        }
        let max_level = (max_nodes - 2) as u8;
        // Every path starts with a usable first hop: an unblocked neighbor (supported, or a Council member).
        let mut firsts: Vec<Id> = self.graph.out(u).iter().copied().filter(|&w| !self.blocked[w as usize]).collect();
        if firsts.len() < d {
            return Err(true);
        }
        firsts.sort_by_key(|&w| (self.level.get(w as usize).copied().unwrap_or(NO_LEVEL), w));
        let mut used: HashSet<Id> = HashSet::from([u]);
        let mut family: Vec<Vec<Id>> = Vec::new();
        let mut budget = 40 * d as u64 * max_nodes as u64;
        for &first in &firsts {
            if family.len() == d {
                break;
            }
            if used.contains(&first) || self.level.get(first as usize).copied().unwrap_or(NO_LEVEL) > max_level {
                continue;
            }
            let mut walk = vec![u, first];
            used.insert(first);
            if self.descend(first, &mut walk, &mut used, &mut budget) {
                family.push(walk);
            } else {
                used.remove(&first);
            }
        }
        if family.len() == d && verify_family(&self.graph, &family, u, &self.council_mask, d, max_nodes, &self.blocked) {
            Ok(family)
        } else {
            Err(false)
        }
    }

    /// Follow strictly descending levels from `x` to an unused Council member, backtracking within the chain only.
    fn descend(&self, x: Id, walk: &mut Vec<Id>, used: &mut HashSet<Id>, budget: &mut u64) -> bool {
        let lx = self.level.get(x as usize).copied().unwrap_or(NO_LEVEL);
        if lx == 0 {
            return self.council_mask[x as usize] && !self.blocked[x as usize];
        }
        if *budget == 0 || lx == NO_LEVEL {
            return false;
        }
        *budget -= 1;
        let mut options: Vec<Id> = self
            .graph
            .out(x)
            .iter()
            .copied()
            .filter(|&y| !self.blocked[y as usize] && !used.contains(&y) && self.level.get(y as usize).copied().unwrap_or(NO_LEVEL) < lx)
            .collect();
        options.sort_by_key(|&y| (self.level[y as usize], y));
        for y in options {
            walk.push(y);
            used.insert(y);
            if self.descend(y, walk, used, budget) {
                return true;
            }
            used.remove(&y);
            walk.pop();
        }
        false
    }

    /// Research probe: answer the invitation path question for `creator` by the named method on the current snapshot, without changing the
    /// world. Used to compare methods on identical graph snapshots.
    pub fn probe_invitation_paths(&mut self, creator: Id, method: PathMethod) -> Probe {
        if creator as usize >= self.subjects.len() {
            return Probe { accepted: false, steps: 0, exhausted: false, certificate_valid: None, resolved_by: "unknown account" };
        }
        self.refresh_live_paths();
        let d = self.required_guarantors();
        let Some(max_nodes) = self.cfg.max_nodes else {
            let ok = self.finder.disjoint_count(&self.graph, &self.blocked, &self.council_mask, creator, d) >= d;
            return Probe { accepted: ok, steps: 0, exhausted: false, certificate_valid: None, resolved_by: "unbounded flow" };
        };
        let (steps0, exhausted0, refusals0) = (self.finder.steps_total, self.finder.exhausted_searches, self.finder.relaxation_refusals);
        if method == PathMethod::Shortcut {
            match self.structural_family(creator, d) {
                Ok(family) => {
                    let valid = verify_family(&self.graph, &family, creator, &self.council_mask, d, max_nodes, &self.blocked);
                    return Probe { accepted: true, steps: 0, exhausted: false, certificate_valid: Some(valid), resolved_by: "structural certificate" };
                }
                Err(true) => return Probe { accepted: false, steps: 0, exhausted: false, certificate_valid: None, resolved_by: "too few first hops" },
                Err(false) => {}
            }
        }
        let relaxed = method == PathMethod::Relaxed;
        let before = self.finder.use_relaxation;
        self.finder.use_relaxation = relaxed;
        let result =
            self.finder.bounded(&self.graph, &self.blocked, &self.council_mask, &self.council, self.path_epoch, creator, d, max_nodes, self.cfg.search_budget);
        self.finder.use_relaxation = before;
        let exhausted = self.finder.exhausted_searches > exhausted0;
        let (accepted, valid) = match &result {
            Search::Found(family) => (true, Some(verify_family(&self.graph, family, creator, &self.council_mask, d, max_nodes, &self.blocked))),
            _ => (false, None),
        };
        let resolved_by = if self.finder.relaxation_refusals > refusals0 {
            "relaxation proof"
        } else if method == PathMethod::Shortcut {
            "shortcut fallback to the exact search"
        } else {
            "exact search"
        };
        Probe { accepted, steps: self.finder.steps_total - steps0, exhausted, certificate_valid: valid, resolved_by }
    }

    /// D current paths sharing only the issuer, within the node bound and to distinct eligible Council members.
    fn require_invitation_paths(&mut self, creator: Id, d: usize) -> Result<(), Reject> {
        self.refresh_live_paths();
        let insufficient = Reject("insufficient Council paths");
        match self.structural_family(creator, d) {
            Ok(_) => return Ok(()),
            Err(true) => return Err(insufficient),
            Err(false) => {}
        }
        let Some(max_nodes) = self.cfg.max_nodes else {
            return if self.finder.disjoint_count(&self.graph, &self.blocked, &self.council_mask, creator, d) >= d { Ok(()) } else { Err(insufficient) };
        };
        match self.finder.bounded(&self.graph, &self.blocked, &self.council_mask, &self.council, self.path_epoch, creator, d, max_nodes, self.cfg.search_budget)
        {
            Search::Found(_) => Ok(()),
            Search::Insufficient => Err(insufficient),
            Search::Exhausted => Err(Reject("Council path search exhausted")),
        }
    }

    /// Record an invitation without a target in this model. Burn the creator's mature right, count the creator's slot,
    /// and start the freeze. Acceptance creates the recipient and counts its slot; the protocol requires both at issuance.
    pub fn create_invitation(&mut self, creator: Id, act: u32) -> Result<u32, Reject> {
        self.require_account(creator)?;
        self.require_free(creator)?;
        self.require_solvent(creator)?;
        self.require_mature_own(creator, act, DAY.max(self.cfg.spend_hours), "invitation requires own mature Emitter right")?;
        let d = self.required_guarantors();
        if self.eligible_guarantors(creator).len() < d {
            return Err(Reject("insufficient eligible guarantors"));
        }
        if self.used_slots(creator) >= self.slot_ceiling(creator) {
            return Err(Reject("owned-slot ceiling reached"));
        }
        self.require_invitation_paths(creator, d)?;
        let guarantors = self.mutual_partners(creator);
        self.dispose(act, ActStatus::Consumed);
        self.inv_units[creator as usize] += 1;
        self.invitations.push(Invitation {
            creator,
            created_at: self.now,
            funding_act: act,
            guarantors,
            status: InvStatus::Pending,
            target: None,
            rels: Vec::new(),
        });
        Ok((self.invitations.len() - 1) as u32)
    }

    /// Admit the invited account after the freeze. The new account and the creator guarantee each other.
    pub fn accept_invitation(&mut self, inv: u32) -> Result<Id, Reject> {
        let (creator, created_at, status) = {
            let i = self.invitations.get(inv as usize).ok_or(Reject("no such invitation"))?;
            (i.creator, i.created_at, i.status)
        };
        if status != InvStatus::Pending {
            return Err(Reject("invalid invitation acceptance"));
        }
        if self.now - created_at < self.cfg.freeze_hours {
            return Err(Reject("invitation is frozen"));
        }
        let id = self.add_account(Some(creator));
        let rels = self.establish(creator, id);
        self.inv_units[id as usize] += 1;
        let i = &mut self.invitations[inv as usize];
        i.status = InvStatus::Active;
        i.target = Some(id);
        i.rels = rels;
        Ok(id)
    }

    /// Veto during the freeze by a current guarantor of the creator. The burned right stays burned; the matured XP of the source Self-ID
    /// stays earned (D42: consumption neither earns nor loses it; a separate revocation needs a separately authorized source correction).
    pub fn cancel_invitation(&mut self, guarantor: Id, inv: u32) -> Result<(), Reject> {
        self.require_account(guarantor)?;
        let (creator, created_at, status) = {
            let i = self.invitations.get(inv as usize).ok_or(Reject("no such invitation"))?;
            (i.creator, i.created_at, i.status)
        };
        if status != InvStatus::Pending || self.now - created_at >= self.cfg.freeze_hours {
            return Err(Reject("invitation is not cancellable"));
        }
        if !self.graph.has_edge(guarantor, creator) {
            return Err(Reject("no authority to cancel invitation"));
        }
        self.invitations[inv as usize].status = InvStatus::Cancelled;
        self.inv_units[creator as usize] -= 1;
        Ok(())
    }

    /// Free termination of an active invitation link by either side (D110).
    pub fn end_invitation_link(&mut self, actor: Id, inv: u32) -> Result<(), Reject> {
        let (creator, target, status, rels) = {
            let i = self.invitations.get(inv as usize).ok_or(Reject("no such invitation"))?;
            (i.creator, i.target, i.status, i.rels.clone())
        };
        if status != InvStatus::Active || (actor != creator && Some(actor) != target) {
            return Err(Reject("no active invitation link to end"));
        }
        self.require_account(actor)?;
        self.invitations[inv as usize].status = InvStatus::Closed;
        self.inv_units[creator as usize] -= 1;
        if let Some(t) = target {
            self.inv_units[t as usize] -= 1;
        }
        for rel in rels {
            if self.rels[rel as usize].active {
                self.deactivate(rel);
            }
        }
        Ok(())
    }

    /// Active invitation links of an account (as creator or as invited), for leaving.
    pub fn active_link_with(&self, a: Id, b: Id) -> Option<u32> {
        self.invitations
            .iter()
            .position(|i| i.status == InvStatus::Active && ((i.creator == a && i.target == Some(b)) || (i.creator == b && i.target == Some(a))))
            .map(|p| p as u32)
    }
}
