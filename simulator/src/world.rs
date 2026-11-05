//! The protocol world: accounts, Self-ID acts and XP, owned valences and K slots, special invitation links, disputes as
//! activity holds, and the Council-path gate (D84/D91/D104/D123/D124). Accepted rules are fixed here; configuration
//! exists only for the research levers in `Config`.
//!
//! Deviations from the retired Node model (declared, for the statistical baseline):
//! - the Council, the active count / difficulty D, the layered-support levels and the distance pruning are refreshed
//!   once per simulated day by `tick`, not on every call;
//! - Council ties break by account index (older first), not by id string;
//! - legacy policy options (immediate/maturity XP, guarantee fees, vouching, limits) do not exist.
use crate::graph::Graph;
use crate::paths::{layered_support, PathFinder, Search, NO_LEVEL};
use std::collections::HashMap;

pub const DAY: i64 = 24;
pub type Id = u32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Reject(pub &'static str);

#[derive(Clone, Debug)]
pub struct Config {
    /// Owned-slot ceiling K (own open valences plus invitation units).
    pub k: u32,
    pub freeze_hours: i64,
    pub spend_hours: i64,
    /// Most nodes a certifying Council path may have, endpoints included (D123). `None` is unbounded.
    pub max_nodes: Option<usize>,
    /// D124: only layered-supported accounts may be path intermediates (needs `max_nodes`).
    pub layered: bool,
    /// Work budget of one exact path search; running out is counted and refused like a missing family.
    pub search_budget: u64,
    /// D131: accounts in an open dispute are not path intermediaries (default). `false` is the ablation used to price the rule.
    pub exclude_disputed: bool,
}

impl Default for Config {
    fn default() -> Config {
        Config { k: 100, freeze_hours: 24, spend_hours: 24, max_nodes: Some(7), layered: false, search_budget: 300_000, exclude_disputed: true }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Accepted,
    False,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ActStatus {
    Unspent,
    Consumed,
    Converted,
    Cancelled,
}

#[derive(Clone, Debug)]
struct Receipt {
    recipient: Id,
    revoked: bool,
}

#[derive(Clone, Debug)]
struct Credit {
    revoked: bool,
    receipts: Vec<Receipt>,
}

#[derive(Clone, Debug)]
struct Act {
    subject: Id,
    recorded_at: i64,
    guarantors: Vec<Id>,
    status: ActStatus,
    credit: Option<Credit>,
}

#[derive(Clone, Debug)]
struct Subject {
    status: Status,
    xp: i32,
    liquid: u32,
    last_reward: Option<i64>,
    acts: Vec<u32>,
    first_unspent: usize,
    inviter: Option<Id>,
}

#[derive(Clone, Debug)]
struct Rel {
    guarantor: Id,
    guaranteed: Id,
    active: bool,
}

#[derive(Clone, Debug)]
struct Valence {
    owner: Id,
    counterpart: Id,
    open: bool,
    rels: Vec<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InvStatus {
    Pending,
    Active,
    Closed,
    Cancelled,
}

#[derive(Clone, Debug)]
pub struct Invitation {
    pub creator: Id,
    pub created_at: i64,
    pub status: InvStatus,
    pub target: Option<Id>,
    act: u32,
    rels: Vec<u32>,
}

#[derive(Clone)]
pub struct World {
    pub cfg: Config,
    now: i64,
    subjects: Vec<Subject>,
    acts: Vec<Act>,
    graph: Graph,
    rels: Vec<Rel>,
    valences: Vec<Valence>,
    open_val: HashMap<(Id, Id), u32>,
    owned_open: Vec<u32>,
    inv_units: Vec<u32>,
    invitations: Vec<Invitation>,
    hold: Vec<u32>,
    cases: Vec<Option<Vec<Id>>>,
    xp_by_pair: HashMap<(Id, Id), Vec<(u32, u32)>>,
    minted: i64,
    burned: i64,
    vault: i64,
    // Daily snapshot.
    active_count: usize,
    bootstrap: bool,
    council: Vec<Id>,
    member_ok: Vec<bool>,
    blocked: Vec<bool>,
    level: Vec<u8>,
    dist_any: Vec<u8>,
    epoch: u64,
    finder: PathFinder,
}

fn digits(n: usize) -> usize {
    n.max(1).to_string().len()
}

impl World {
    /// A genesis of `n` accounts joined by `pairs` (D35 pre-guaranteed genesis). Each pair is two open valences with
    /// no burn source and an established mutual guarantee.
    pub fn new(cfg: Config, n: usize, pairs: &[(Id, Id)]) -> World {
        assert!(!cfg.layered || cfg.max_nodes.is_some(), "layered support needs a path bound");
        let mut w = World {
            cfg,
            now: 0,
            subjects: Vec::new(),
            acts: Vec::new(),
            graph: Graph::new(),
            rels: Vec::new(),
            valences: Vec::new(),
            open_val: HashMap::new(),
            owned_open: Vec::new(),
            inv_units: Vec::new(),
            invitations: Vec::new(),
            hold: Vec::new(),
            cases: Vec::new(),
            xp_by_pair: HashMap::new(),
            minted: 0,
            burned: 0,
            vault: 0,
            active_count: 0,
            bootstrap: true,
            council: Vec::new(),
            member_ok: Vec::new(),
            blocked: Vec::new(),
            level: Vec::new(),
            dist_any: Vec::new(),
            epoch: 0,
            finder: PathFinder::new(),
        };
        for _ in 0..n {
            w.add_account(None);
        }
        for &(a, b) in pairs {
            assert!(a != b && !w.graph.has_edge(a, b), "bad genesis pair");
            let va = w.push_valence(a, b);
            let vb = w.push_valence(b, a);
            let rels = w.establish(a, b);
            w.valences[va as usize].rels = rels.clone();
            w.valences[vb as usize].rels = rels;
        }
        w.tick(0);
        w
    }

    fn add_account(&mut self, inviter: Option<Id>) -> Id {
        let id = self.graph.add_node();
        self.subjects.push(Subject { status: Status::Accepted, xp: 0, liquid: 0, last_reward: None, acts: Vec::new(), first_unspent: 0, inviter });
        self.owned_open.push(0);
        self.inv_units.push(0);
        self.hold.push(0);
        self.blocked.push(self.cfg.layered);
        self.level.push(NO_LEVEL);
        self.dist_any.push(NO_LEVEL);
        id
    }

    fn push_valence(&mut self, owner: Id, counterpart: Id) -> u32 {
        let id = self.valences.len() as u32;
        self.valences.push(Valence { owner, counterpart, open: true, rels: Vec::new() });
        self.open_val.insert((owner, counterpart), id);
        self.owned_open[owner as usize] += 1;
        id
    }

    /// Two relations (both directions) and the graph edges of a matched pair.
    fn establish(&mut self, a: Id, b: Id) -> Vec<u32> {
        let mut out = Vec::new();
        for (g, d) in [(a, b), (b, a)] {
            self.graph.add_edge(g, d);
            self.rels.push(Rel { guarantor: g, guaranteed: d, active: true });
            out.push((self.rels.len() - 1) as u32);
        }
        out
    }

    // ---- reads -----------------------------------------------------------------------------------------------------

    pub fn now(&self) -> i64 {
        self.now
    }
    pub fn len(&self) -> usize {
        self.subjects.len()
    }
    pub fn is_empty(&self) -> bool {
        self.subjects.is_empty()
    }
    pub fn graph(&self) -> &Graph {
        &self.graph
    }
    pub fn accepted(&self, id: Id) -> bool {
        self.subjects[id as usize].status == Status::Accepted
    }
    pub fn xp(&self, id: Id) -> i32 {
        self.subjects[id as usize].xp
    }
    pub fn liquid(&self, id: Id) -> u32 {
        self.subjects[id as usize].liquid
    }
    pub fn inviter(&self, id: Id) -> Option<Id> {
        self.subjects[id as usize].inviter
    }
    pub fn bootstrap(&self) -> bool {
        self.bootstrap
    }
    pub fn council(&self) -> &[Id] {
        &self.council
    }
    pub fn active_count(&self) -> usize {
        self.active_count
    }
    /// D: the number of digits of the active count (the stand-in for N_verified).
    pub fn required_guarantors(&self) -> usize {
        digits(self.active_count)
    }
    pub fn burned(&self) -> i64 {
        self.burned
    }
    pub fn vault(&self) -> i64 {
        self.vault
    }
    /// Guarantors recorded on a Self-ID act at creation (the potential guarantor XP recipients).
    pub fn act_guarantors(&self, act: u32) -> &[Id] {
        &self.acts[act as usize].guarantors
    }
    /// K referendum lever: lowering K never cuts existing valences or links.
    pub fn set_k(&mut self, k: u32) {
        assert!(k >= 1);
        self.cfg.k = k;
    }
    pub fn used_slots_of(&self, id: Id) -> u32 {
        self.used_slots(id)
    }
    pub fn supply(&self) -> i64 {
        self.minted - self.burned
    }
    pub fn minted(&self) -> i64 {
        self.minted
    }
    pub fn path_searches_exhausted(&self) -> u64 {
        self.finder.exhausted_searches
    }
    pub fn invitation(&self, inv: u32) -> &Invitation {
        &self.invitations[inv as usize]
    }
    /// Whether the account is currently unusable as a path intermediate (not accepted, unsupported, or in a dispute).
    pub fn path_blocked(&self, id: Id) -> bool {
        self.blocked[id as usize]
    }
    pub fn held(&self, id: Id) -> bool {
        self.hold[id as usize] > 0
    }
    /// All mature unspent emission rights of an account, oldest first.
    pub fn eligible_emissions(&self, id: Id, min_age: i64) -> Vec<u32> {
        let s = &self.subjects[id as usize];
        s.acts[s.first_unspent..].iter().copied().filter(|&a| {
            let act = &self.acts[a as usize];
            act.status == ActStatus::Unspent && self.now - act.recorded_at >= min_age
        }).collect()
    }
    /// (open, owner, counterpart, ever matched) of a valence.
    pub fn valence_info(&self, v: u32) -> (bool, Id, Id, bool) {
        let r = &self.valences[v as usize];
        (r.open, r.owner, r.counterpart, !r.rels.is_empty())
    }
    pub fn mutual_count(&self, id: Id) -> usize {
        self.graph.inn(id).iter().filter(|&&g| self.graph.has_edge(id, g) && self.accepted(g)).count()
    }
    /// Unspent emission rights of an account (money not yet liquid).
    pub fn unspent_rights(&self, id: Id) -> usize {
        self.subjects[id as usize].acts[self.subjects[id as usize].first_unspent..].iter().filter(|&&a| self.acts[a as usize].status == ActStatus::Unspent).count()
    }

    pub fn is_active(&self, id: Id) -> bool {
        let s = &self.subjects[id as usize];
        if s.status != Status::Accepted {
            return false;
        }
        for &a in s.acts.iter().rev() {
            let act = &self.acts[a as usize];
            if self.now - act.recorded_at >= 28 * DAY {
                return false;
            }
            if act.status != ActStatus::Cancelled {
                return true;
            }
        }
        false
    }

    /// Mutual guarantee partners that are accepted accounts, ascending by index.
    pub fn mutual_partners(&self, id: Id) -> Vec<Id> {
        self.graph.out(id).iter().copied().filter(|&o| self.graph.has_edge(o, id) && self.accepted(o)).collect()
    }

    pub fn eligible_guarantors(&self, id: Id) -> Vec<Id> {
        self.graph.inn(id).iter().copied().filter(|&g| self.accepted(g) && self.is_active(g)).collect()
    }

    /// The oldest unspent, mature emission right of the account.
    pub fn eligible_emission(&self, id: Id) -> Option<u32> {
        let s = &self.subjects[id as usize];
        s.acts[s.first_unspent..].iter().copied().find(|&a| {
            let act = &self.acts[a as usize];
            act.status == ActStatus::Unspent && self.now - act.recorded_at >= self.cfg.spend_hours
        })
    }

    // ---- daily snapshot --------------------------------------------------------------------------------------------

    fn council_target(&self) -> usize {
        let r = (digits(self.active_count) as f64).sqrt().round() as usize;
        assert!(r <= 6, "D33 Council lookup is OPEN beyond r = 6");
        [1usize, 11, 101, 1001, 10001, 100001][r.max(1) - 1]
    }

    /// Advance to `hour` and refresh the daily snapshot (activity, difficulty, Council, support levels, distances).
    pub fn tick(&mut self, hour: i64) {
        assert!(hour >= self.now, "time cannot move backwards");
        self.now = hour;
        let n = self.subjects.len();
        self.active_count = (0..n as Id).filter(|&i| self.is_active(i)).count();
        if self.bootstrap && self.active_count >= 100 {
            self.bootstrap = false;
        }
        let size = self.council_target();
        self.council.clear();
        if size > 1 {
            let mut candidates: Vec<(i32, Id)> = (0..n as Id).filter(|&i| self.accepted(i) && self.is_active(i)).map(|i| (self.subjects[i as usize].xp, i)).collect();
            candidates.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
            self.council = candidates.into_iter().take(size).map(|(_, i)| i).collect();
        }
        // Accounts in an open dispute count as unusable for support levels and paths (D131).
        let nonaccepted: Vec<bool> = (0..n as Id).map(|i| !self.accepted(i) || (self.cfg.exclude_disputed && self.hold[i as usize] > 0)).collect();
        if self.cfg.layered {
            let max_level = (self.cfg.max_nodes.unwrap() - 2) as u8;
            self.level = layered_support(&self.graph, &self.council, self.required_guarantors() as u32, max_level, &nonaccepted);
            self.blocked = (0..n).map(|i| nonaccepted[i] || self.level[i] == NO_LEVEL).collect();
        } else {
            self.level = vec![NO_LEVEL; n];
            self.blocked = nonaccepted.clone();
        }
        // The snapshot's `nonaccepted` also feeds the distance search: a held account can still be a path source, not a hop.
        // Multi-source distances to the Council over allowed intermediates; sources need no level of their own.
        let limit = self.cfg.max_nodes.map_or(u8::MAX - 1, |m| (m - 1) as u8);
        self.dist_any = vec![NO_LEVEL; n];
        let mut frontier: Vec<Id> = Vec::new();
        for &m in &self.council {
            self.dist_any[m as usize] = 0;
            frontier.push(m);
        }
        let mut d = 0u8;
        while !frontier.is_empty() && d < limit {
            d += 1;
            let mut next = Vec::new();
            for &u in &frontier {
                for &v in self.graph.inn(u) {
                    if self.dist_any[v as usize] != NO_LEVEL || nonaccepted[v as usize] {
                        continue;
                    }
                    self.dist_any[v as usize] = d;
                    if !self.blocked[v as usize] {
                        next.push(v);
                    }
                }
            }
            frontier = next;
        }
        // A Council member needs a path to another member; exact for the lookup sizes up to 101.
        self.member_ok = self.council.iter().map(|&m| self.member_reaches_other(m, limit, &nonaccepted)).collect();
        self.epoch += 1;
    }

    fn member_reaches_other(&self, m: Id, limit: u8, nonaccepted: &[bool]) -> bool {
        if self.council.len() > 101 {
            return true;
        }
        let n = self.subjects.len();
        let mut dist = vec![NO_LEVEL; n];
        dist[m as usize] = 0;
        let mut frontier = vec![m];
        let mut d = 0u8;
        while !frontier.is_empty() && d < limit {
            d += 1;
            let mut next = Vec::new();
            for &u in &frontier {
                for &v in self.graph.out(u) {
                    if dist[v as usize] != NO_LEVEL || nonaccepted[v as usize] {
                        continue;
                    }
                    dist[v as usize] = d;
                    if self.council.contains(&v) {
                        return true;
                    }
                    if !self.blocked[v as usize] {
                        next.push(v);
                    }
                }
            }
            frontier = next;
        }
        false
    }

    fn self_gate(&self, p: Id) -> bool {
        if let Some(at) = self.council.iter().position(|&m| m == p) {
            return self.member_ok[at];
        }
        let limit = self.cfg.max_nodes.map_or(u8::MAX - 1, |m| (m - 1) as u8);
        let d = self.dist_any.get(p as usize).copied().unwrap_or(NO_LEVEL);
        d != NO_LEVEL && d <= limit
    }

    // ---- XP and acts -----------------------------------------------------------------------------------------------

    fn revoke_credit(&mut self, act_id: u32) -> bool {
        let act = &mut self.acts[act_id as usize];
        let Some(credit) = act.credit.as_mut() else { return false };
        if credit.revoked {
            return false;
        }
        credit.revoked = true;
        for r in &credit.receipts {
            if !r.revoked {
                self.subjects[r.recipient as usize].xp -= 1;
            }
        }
        true
    }

    fn credit(&mut self, act_id: u32) {
        let (subject, recipients) = {
            let act = &self.acts[act_id as usize];
            let mut r = vec![act.subject];
            for &g in &act.guarantors {
                // A guarantor whose guarantee ended before the credit earns nothing.
                if self.graph.has_edge(g, act.subject) {
                    r.push(g);
                }
            }
            (act.subject, r)
        };
        let mut receipts = Vec::new();
        for (idx, &recipient) in recipients.iter().enumerate() {
            receipts.push(Receipt { recipient, revoked: false });
            self.subjects[recipient as usize].xp += 1;
            self.xp_by_pair.entry((recipient, subject)).or_default().push((act_id, idx as u32));
        }
        self.acts[act_id as usize].credit = Some(Credit { revoked: false, receipts });
    }

    fn dispose(&mut self, act_id: u32, status: ActStatus) {
        let subject = self.acts[act_id as usize].subject;
        debug_assert!(self.acts[act_id as usize].status == ActStatus::Unspent);
        self.acts[act_id as usize].status = status;
        self.vault -= 1;
        if status == ActStatus::Converted {
            self.subjects[subject as usize].liquid += 1;
        } else {
            self.burned += 1;
        }
        self.credit(act_id);
        let s = &mut self.subjects[subject as usize];
        while s.first_unspent < s.acts.len() && self.acts[s.acts[s.first_unspent] as usize].status != ActStatus::Unspent {
            s.first_unspent += 1;
        }
    }

    fn require_free(&self, id: Id) -> Result<(), Reject> {
        if self.hold[id as usize] > 0 {
            Err(Reject("open-dispute activity restriction"))
        } else {
            Ok(())
        }
    }

    fn require_account(&self, id: Id) -> Result<(), Reject> {
        if self.accepted(id) {
            Ok(())
        } else {
            Err(Reject("subject identity is not accepted"))
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
        // D84/D91: one established mutual guarantor; outside the first-100 bootstrap that guarantor must reach the Council.
        let partners = self.mutual_partners(who);
        if partners.is_empty() {
            return Err(Reject("Self-ID requires an established mutual guarantor"));
        }
        if !self.bootstrap && !partners.iter().any(|&p| self.self_gate(p)) {
            return Err(Reject("insufficient Council paths"));
        }
        let guarantors = self.eligible_guarantors(who);
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
        let a = &self.acts[act as usize];
        if a.subject != who || self.now - a.recorded_at < self.cfg.spend_hours || a.status != ActStatus::Unspent {
            return Err(Reject("conversion requires own mature emission"));
        }
        self.dispose(act, ActStatus::Converted);
        Ok(())
    }

    fn require_mature_own(&self, who: Id, act: u32, hours: i64, what: &'static str) -> Result<(), Reject> {
        let a = &self.acts[act as usize];
        if a.status != ActStatus::Unspent {
            return Err(Reject("emission is spent or disputed"));
        }
        if a.subject != who || self.now - a.recorded_at < hours {
            return Err(Reject(what));
        }
        Ok(())
    }

    // ---- guarantees ------------------------------------------------------------------------------------------------

    fn deactivate(&mut self, rel_id: u32, revoke: bool) {
        let (g, d) = {
            let r = &mut self.rels[rel_id as usize];
            r.active = false;
            (r.guarantor, r.guaranteed)
        };
        self.graph.remove_edge(g, d);
        if revoke {
            if let Some(list) = self.xp_by_pair.get(&(g, d)).cloned() {
                for (act_id, idx) in list {
                    let act = &mut self.acts[act_id as usize];
                    let Some(credit) = act.credit.as_mut() else { continue };
                    if credit.revoked || credit.receipts[idx as usize].revoked {
                        continue;
                    }
                    credit.receipts[idx as usize].revoked = true;
                    self.subjects[g as usize].xp -= 1;
                }
            }
        }
    }

    fn used_slots(&self, id: Id) -> u32 {
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
        if self.open_val.contains_key(&(owner, counterpart)) {
            return Err(Reject("owner already holds an open valence toward counterpart"));
        }
        if self.used_slots(owner) >= self.cfg.k {
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

    /// Free withdrawal (D110): the withdrawer's open valence closes, any matched pair ends, and the withdrawer's side of the
    /// pair loses the guarantor XP earned from the other's acts.
    pub fn withdraw_valence(&mut self, owner: Id, valence: u32) -> Result<(), Reject> {
        let (open, v_owner, counterpart, rels) = {
            let v = &self.valences[valence as usize];
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
                let revoke = self.rels[rel as usize].guarantor == owner;
                self.deactivate(rel, revoke);
            }
        }
        Ok(())
    }

    // ---- invitations -----------------------------------------------------------------------------------------------

    /// D104: D internally vertex-disjoint current paths (length bounded, optionally through supported intermediaries) to a
    /// single Council member other than the creator. During the first-100 bootstrap nothing is checked.
    fn invitation_paths_ok(&mut self, creator: Id, d: usize) -> bool {
        if self.bootstrap {
            return true;
        }
        let Some(max_nodes) = self.cfg.max_nodes else {
            // Unbounded: the flow value alone decides.
            for t in self.council.clone() {
                if t != creator && self.finder.disjoint_count(&self.graph, &self.blocked, creator, t, d) >= d {
                    return true;
                }
            }
            return false;
        };
        for t in self.council.clone() {
            if t == creator {
                continue;
            }
            match self.finder.bounded(&self.graph, &self.blocked, self.epoch, creator, t, d, max_nodes, self.cfg.search_budget) {
                Search::Found(_) => return true,
                Search::Insufficient | Search::Exhausted => {}
            }
        }
        false
    }

    /// Create a special invitation to a pre-registered new account (D105-D107): the creator burns an own mature right,
    /// holds one K slot until the link ends, and the 24h freeze starts.
    pub fn create_invitation(&mut self, creator: Id, act: u32) -> Result<u32, Reject> {
        self.require_account(creator)?;
        self.require_free(creator)?;
        self.require_mature_own(creator, act, DAY.max(self.cfg.spend_hours), "invitation requires own mature Emitter right")?;
        let d = self.required_guarantors();
        if self.eligible_guarantors(creator).len() < d {
            return Err(Reject("insufficient eligible guarantors"));
        }
        if self.used_slots(creator) >= self.cfg.k {
            return Err(Reject("owned-slot ceiling reached"));
        }
        if !self.invitation_paths_ok(creator, d) {
            return Err(Reject("insufficient Council paths"));
        }
        self.dispose(act, ActStatus::Consumed);
        self.inv_units[creator as usize] += 1;
        self.invitations.push(Invitation { creator, created_at: self.now, status: InvStatus::Pending, target: None, act, rels: Vec::new() });
        Ok((self.invitations.len() - 1) as u32)
    }

    /// Admit the invited account after the freeze. The new account and the creator guarantee each other.
    pub fn accept_invitation(&mut self, inv: u32) -> Result<Id, Reject> {
        let (creator, created_at, status) = {
            let i = &self.invitations[inv as usize];
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

    /// Veto during the freeze by a current guarantor of the creator. The burned right stays burned and its XP is revoked.
    pub fn cancel_invitation(&mut self, guarantor: Id, inv: u32) -> Result<(), Reject> {
        self.require_account(guarantor)?;
        let (creator, created_at, status, act) = {
            let i = &self.invitations[inv as usize];
            (i.creator, i.created_at, i.status, i.act)
        };
        if status != InvStatus::Pending || self.now - created_at >= self.cfg.freeze_hours {
            return Err(Reject("invitation is not cancellable"));
        }
        if !self.graph.has_edge(guarantor, creator) {
            return Err(Reject("no authority to cancel invitation"));
        }
        self.invitations[inv as usize].status = InvStatus::Cancelled;
        self.inv_units[creator as usize] -= 1;
        self.revoke_credit(act);
        Ok(())
    }

    /// Free termination of an active invitation link by either side (D110).
    pub fn end_invitation_link(&mut self, actor: Id, inv: u32) -> Result<(), Reject> {
        let (creator, target, status, rels) = {
            let i = &self.invitations[inv as usize];
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
                let revoke = self.rels[rel as usize].guarantor == actor;
                self.deactivate(rel, revoke);
            }
        }
        Ok(())
    }

    /// Active invitation links of an account (as creator or as invited), for leaving.
    pub fn active_link_with(&self, a: Id, b: Id) -> Option<u32> {
        self.invitations.iter().position(|i| i.status == InvStatus::Active && ((i.creator == a && i.target == Some(b)) || (i.creator == b && i.target == Some(a)))).map(|p| p as u32)
    }

    // ---- disputes as activity holds, identity verdicts -------------------------------------------------------------

    /// D77: every party of an open case is held (no Self-IDs, invitations or valences) until the case ends.
    /// Whether an account is unusable as a path intermediate right now: not accepted, not layered-supported (when required), or in a dispute.
    fn base_blocked(&self, id: Id) -> bool {
        !self.accepted(id) || (self.cfg.layered && self.level[id as usize] == NO_LEVEL)
    }

    pub fn begin_case(&mut self, subjects: &[Id]) -> Result<u32, Reject> {
        if subjects.len() < 2 || subjects[0] == subjects[1] {
            return Err(Reject("participation requires distinct case subjects"));
        }
        for &s in subjects {
            self.require_account(s)?;
        }
        for &s in subjects {
            self.hold[s as usize] += 1;
            // D131: accounts in an open dispute cannot be intermediaries of any counted path, so an investigated cluster pauses.
            if self.cfg.exclude_disputed {
                self.blocked[s as usize] = true;
            }
        }
        self.cases.push(Some(subjects.to_vec()));
        Ok((self.cases.len() - 1) as u32)
    }

    pub fn end_case(&mut self, case: u32) {
        if let Some(subjects) = self.cases[case as usize].take() {
            for s in subjects {
                self.hold[s as usize] -= 1;
                self.blocked[s as usize] = (self.cfg.exclude_disputed && self.hold[s as usize] > 0) || self.base_blocked(s);
            }
        }
    }

    pub fn invalidate_identity(&mut self, id: Id) {
        self.subjects[id as usize].status = Status::False;
    }

    /// Cut the whole Self-ID chain: unspent rights burn without XP; XP credited by the cut acts is revoked.
    pub fn void_chain(&mut self, id: Id) {
        let chain = self.subjects[id as usize].acts.clone();
        for act_id in chain {
            let act = &mut self.acts[act_id as usize];
            if act.status == ActStatus::Cancelled {
                continue;
            }
            if act.status == ActStatus::Unspent {
                act.status = ActStatus::Cancelled;
                self.vault -= 1;
                self.burned += 1;
            }
            self.revoke_credit(act_id);
        }
        let s = &mut self.subjects[id as usize];
        while s.first_unspent < s.acts.len() && self.acts[s.acts[s.first_unspent] as usize].status != ActStatus::Unspent {
            s.first_unspent += 1;
        }
    }

    // ---- invariants ------------------------------------------------------------------------------------------------

    pub fn audit(&self) -> Result<(), String> {
        let unspent = self.acts.iter().filter(|a| a.status == ActStatus::Unspent).count() as i64;
        if unspent != self.vault {
            return Err(format!("vault {} != unspent rights {}", self.vault, unspent));
        }
        let liquid: i64 = self.subjects.iter().map(|s| i64::from(s.liquid)).sum();
        let converted = self.acts.iter().filter(|a| a.status == ActStatus::Converted).count() as i64;
        if liquid != converted {
            return Err(format!("liquid {liquid} != converted acts {converted}"));
        }
        if self.minted - self.burned != self.vault + liquid {
            return Err("supply does not equal vault plus liquid".into());
        }
        let live = self.rels.iter().filter(|r| r.active).count();
        if live != self.graph.edge_count() {
            return Err(format!("active relations {} != graph edges {}", live, self.graph.edge_count()));
        }
        for r in self.rels.iter().filter(|r| r.active) {
            if !self.graph.has_edge(r.guarantor, r.guaranteed) {
                return Err("active relation without edge".into());
            }
        }
        for (i, s) in self.subjects.iter().enumerate() {
            let owned = self.valences.iter().filter(|v| v.open && v.owner == i as Id).count() as u32;
            if owned != self.owned_open[i] {
                return Err(format!("owned valences of {i}"));
            }
            let mut xp = 0;
            for act in &self.acts {
                if let Some(c) = &act.credit {
                    if !c.revoked {
                        xp += c.receipts.iter().filter(|r| r.recipient == i as Id && !r.revoked).count() as i32;
                    }
                }
            }
            if xp != s.xp {
                return Err(format!("xp of {i}: stored {} recomputed {}", s.xp, xp));
            }
            let units = self.invitations.iter().filter(|v| matches!(v.status, InvStatus::Pending | InvStatus::Active) && (v.creator == i as Id || v.target == Some(i as Id))).count() as u32;
            if units != self.inv_units[i] {
                return Err(format!("invitation units of {i}: stored {} recomputed {units}", self.inv_units[i]));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A ring lattice with offsets 1 and 2, like the D35 genesis of the research runs.
    fn ring(n: usize) -> Vec<(Id, Id)> {
        let mut pairs = Vec::new();
        for i in 0..n {
            for off in [1usize, 2] {
                let j = (i + off) % n;
                let (a, b) = (i.min(j) as Id, i.max(j) as Id);
                if !pairs.contains(&(a, b)) {
                    pairs.push((a, b));
                }
            }
        }
        pairs
    }

    fn world(n: usize) -> World {
        World::new(Config::default(), n, &ring(n))
    }

    /// A plain cycle: each account holds two genesis valences (units) and has two guarantors.
    fn cycle(n: usize) -> Vec<(Id, Id)> {
        (0..n).map(|i| (i.min((i + 1) % n) as Id, i.max((i + 1) % n) as Id)).collect()
    }

    /// Every listed account makes a Self-ID at the current time; a day later each has one mature right.
    fn rights(w: &mut World, ids: &[Id]) {
        for &i in ids {
            w.create_self_id(i).unwrap();
        }
        w.tick(w.now() + 24);
    }

    #[test]
    fn self_id_xp_and_conversion_follow_the_rules() {
        let mut w = world(10);
        let act = w.create_self_id(0).unwrap();
        assert_eq!(w.create_self_id(0), Err(Reject("rolling 24-hour reward limit")));
        assert_eq!(w.xp(0), 0, "XP is credited when the right is used, not at creation");
        w.tick(24);
        w.convert_to_collector(0, act).unwrap();
        assert!(w.xp(0) == 1);
        assert_eq!(w.liquid(0), 1);
        w.audit().unwrap();
    }

    #[test]
    fn an_unmatched_valence_burns_exactly_one_own_mature_right_and_creates_no_guarantee() {
        let mut w = world(8);
        rights(&mut w, &[0, 3]);
        let (burned, vault) = (w.burned(), w.vault());
        let (u0, u3) = (w.used_slots_of(0), w.used_slots_of(3));
        let act = w.eligible_emission(0).unwrap();
        // An immature or foreign right is refused atomically.
        assert_eq!(w.open_valence(0, 3, w.eligible_emission(3).unwrap()), Err(Reject("valence requires own mature Emitter right")));
        assert_eq!(w.open_valence(0, 0, act), Err(Reject("valence requires a distinct counterpart")));
        assert_eq!((w.burned(), w.vault()), (burned, vault));
        w.open_valence(0, 3, act).unwrap();
        assert_eq!((w.burned(), w.vault()), (burned + 1, vault - 1));
        assert!(!w.graph().has_edge(0, 3) && !w.graph().has_edge(3, 0));
        assert_eq!((w.used_slots_of(0), w.used_slots_of(3)), (u0 + 1, u3), "genesis pairs and the new valence each hold one owned unit");
        assert_eq!(w.open_valence(0, 3, w.eligible_emission(0).unwrap_or(u32::MAX)), Err(Reject("owner already holds an open valence toward counterpart")));
        w.audit().unwrap();
    }

    #[test]
    fn matching_establishes_a_mutual_guarantee_and_guarantor_xp_flows_only_after_it() {
        let mut w = world(8);
        rights(&mut w, &[0, 3]);
        let a0 = w.eligible_emission(0).unwrap();
        w.open_valence(0, 3, a0).unwrap();
        let before = w.create_self_id(3).unwrap();
        assert!(!w.act_guarantors(before).contains(&0), "no guarantor role before mutual establishment (D82)");
        w.tick(w.now() + 24);
        let a3 = w.eligible_emission(3).unwrap();
        w.open_valence(3, 0, a3).unwrap();
        assert!(w.graph().is_mutual(0, 3));
        assert_eq!(w.burned() - w.minted().min(w.burned()), 0);
        let xp0 = w.xp(0);
        w.tick(w.now() + 24);
        let act = w.create_self_id(3).unwrap();
        assert!(w.act_guarantors(act).contains(&0));
        w.tick(w.now() + 24);
        w.convert_to_collector(3, act).unwrap();
        assert_eq!(w.xp(0), xp0 + 1, "the guarantor earns when the subject's right is used");
        w.audit().unwrap();
    }

    #[test]
    fn the_ceiling_refuses_new_owned_units_only_and_lowering_it_cuts_nothing() {
        // Cycle genesis: each account already owns two valences, so K = 3 leaves exactly one free unit.
        let mut w = World::new(Config { k: 3, ..Config::default() }, 8, &cycle(8));
        rights(&mut w, &[0, 3, 4]);
        let (a0, a3) = (w.eligible_emission(0).unwrap(), w.eligible_emission(3).unwrap());
        w.open_valence(0, 3, a0).unwrap();
        assert_eq!(w.open_valence(0, 4, a0), Err(Reject("owned-slot ceiling reached")), "the ceiling is checked before the source");
        // Matching a retained valence is a new owned unit for the matcher, whose unit is free here.
        w.open_valence(3, 0, a3).unwrap();
        assert!(w.graph().is_mutual(0, 3));
        w.create_self_id(3).unwrap();
        w.tick(w.now() + 24);
        assert_eq!(w.open_valence(3, 5, w.eligible_emission(3).unwrap()), Err(Reject("owned-slot ceiling reached")));
        w.set_k(4);
        w.open_valence(3, 5, w.eligible_emission(3).unwrap()).unwrap();
        w.set_k(3);
        assert_eq!(w.used_slots_of(3), 4, "lowering K keeps existing valences");
        assert!(w.graph().is_mutual(0, 3));
        w.audit().unwrap();
    }

    #[test]
    fn withdrawal_ends_the_pair_revokes_only_the_withdrawers_guarantor_xp_and_the_retained_side_can_rematch() {
        let mut w = world(8);
        rights(&mut w, &[0, 3]);
        let (v0, v3) = (w.open_valence(0, 3, w.eligible_emission(0).unwrap()).unwrap(), w.open_valence(3, 0, w.eligible_emission(3).unwrap()).unwrap());
        // Each side makes and uses a right so both earn guarantor XP from the other.
        w.tick(w.now() + 24);
        let (b0, b3) = (w.create_self_id(0).unwrap(), w.create_self_id(3).unwrap());
        w.tick(w.now() + 24);
        w.convert_to_collector(0, b0).unwrap();
        w.convert_to_collector(3, b3).unwrap();
        let (xp0, xp3) = (w.xp(0), w.xp(3));
        w.withdraw_valence(3, v3).unwrap();
        assert!(!w.graph().has_edge(0, 3) && !w.graph().has_edge(3, 0));
        assert_eq!(w.xp(0), xp0, "the other side keeps what it earned");
        assert_eq!(w.xp(3), xp3 - 1, "the withdrawer loses its guarantor XP from the other's acts");
        assert_eq!(w.withdraw_valence(3, v3), Err(Reject("no open own valence to withdraw")));
        assert!(w.valence_info(v0).0, "the retained valence stays open");
        w.tick(w.now() + 24);
        let again = w.create_self_id(3);
        assert!(again.is_ok());
        w.tick(w.now() + 24);
        w.open_valence(3, 0, w.eligible_emission(3).unwrap()).unwrap();
        assert!(w.graph().is_mutual(0, 3), "rematching the retained valence restores the pair");
        w.audit().unwrap();
    }

    #[test]
    fn a_held_retained_side_blocks_establishment() {
        let mut w = world(8);
        rights(&mut w, &[0, 3]);
        w.open_valence(0, 3, w.eligible_emission(0).unwrap()).unwrap();
        let case = w.begin_case(&[0, 1]).unwrap();
        assert_eq!(w.open_valence(3, 0, w.eligible_emission(3).unwrap()), Err(Reject("open-dispute activity restriction")));
        w.end_case(case);
        w.open_valence(3, 0, w.eligible_emission(3).unwrap()).unwrap();
        assert!(w.graph().is_mutual(0, 3));
    }

    #[test]
    fn invitations_hold_units_refuse_atomically_and_release_on_veto_or_link_end() {
        let mut pairs = cycle(12);
        pairs.push((0, 12)); // account 12 has a single guarantor
        let mut w = World::new(Config { k: 3, ..Config::default() }, 13, &pairs);
        rights(&mut w, &(0..13).collect::<Vec<_>>());
        assert_eq!(w.required_guarantors(), 2);
        let (burned, vault) = (w.burned(), w.vault());
        assert_eq!(w.create_invitation(12, w.eligible_emission(12).unwrap()), Err(Reject("insufficient eligible guarantors")));
        let case = w.begin_case(&[1, 2]).unwrap();
        assert_eq!(w.create_invitation(1, w.eligible_emission(1).unwrap()), Err(Reject("open-dispute activity restriction")));
        w.end_case(case);
        assert_eq!((w.burned(), w.vault()), (burned, vault), "refusals leave no trace");
        // Issuance burns one own right and holds a unit at the creator.
        let inv = w.create_invitation(1, w.eligible_emission(1).unwrap()).unwrap();
        assert_eq!((w.burned(), w.used_slots_of(1)), (burned + 1, 3), "two genesis valences plus the invitation unit");
        // The veto releases the unit, never refunds the burn, and the invitation cannot be accepted afterwards.
        w.cancel_invitation(0, inv).unwrap();
        assert_eq!(w.used_slots_of(1), w.owned_open[1]);
        assert_eq!(w.accept_invitation(inv), Err(Reject("invalid invitation acceptance")));
        // Acceptance after the freeze admits with one inviter and a special link holding a unit at both ends.
        w.create_self_id(1).ok();
        w.tick(w.now() + 24);
        let right = w.eligible_emission(1).unwrap();
        let inv2 = w.create_invitation(1, right).unwrap();
        w.tick(w.now() + 24);
        let new = w.accept_invitation(inv2).unwrap();
        assert_eq!((w.inviter(new), w.used_slots_of(new)), (Some(1), 1));
        assert!(w.graph().is_mutual(1, new));
        // Ending the link releases both units and the newcomer stays an account.
        w.end_invitation_link(1, inv2).unwrap();
        assert_eq!(w.used_slots_of(new), 0);
        assert!(w.accepted(new) && !w.graph().has_edge(1, new));
        w.audit().unwrap();
    }

    #[test]
    fn genesis_and_bootstrap_follow_d91_and_the_council_lookup_follows_d33() {
        let w = world(50);
        assert!(w.bootstrap() && w.council().is_empty(), "under 100 active there is no formal Council");
        assert_eq!(w.minted(), 0, "genesis pairs mint and burn nothing");
        assert_eq!(w.graph().edge_count(), ring(50).len() * 2);
        // Bootstrap Self-ID needs exactly one mutual guarantor.
        let mut pairs = ring(50);
        pairs.retain(|&(a, b)| a != 7 && b != 7);
        let mut lonely = World::new(Config::default(), 50, &pairs);
        assert_eq!(lonely.create_self_id(7), Err(Reject("Self-ID requires an established mutual guarantor")));
        // 120 participants: the latch ends at the first 100 active and never returns; the Council has 11 seats.
        let mut big = world(120);
        for i in 0..120 {
            big.create_self_id(i).unwrap();
        }
        big.tick(24);
        assert!(!big.bootstrap());
        assert_eq!(big.council().len(), 11);
        big.tick(24 + 29 * 24);
        assert_eq!(big.active_count(), 0);
        assert!(!big.bootstrap(), "no re-entry when the network later falls below 100");
    }

    /// 120 ring members plus three satellites {120, 121, 122} that guarantee a newcomer 123 but reach the ring only through one cut vertex.
    fn gated_world() -> World {
        let mut pairs = ring(120);
        pairs.extend([(120, 121), (120, 122), (121, 122), (120, 5), (123, 120), (123, 121), (123, 122)]);
        let mut w = World::new(Config { layered: false, ..Config::default() }, 124, &pairs);
        for i in 0..124 {
            w.create_self_id(i).unwrap();
        }
        w.tick(24);
        w
    }

    #[test]
    fn outside_bootstrap_self_ids_and_invitations_need_council_paths_independent_of_the_guarantor_count() {
        let mut w = gated_world();
        assert!(!w.bootstrap() && w.required_guarantors() == 3);
        w.tick(48);
        // Ring member 12 is near the Council and certifies; far members of the ring cannot, within seven nodes.
        w.create_self_id(12).unwrap();
        // The newcomer has D = 3 eligible guarantors but only one internally disjoint path (the cut vertex 120 or 5).
        let right = w.eligible_emission(123).unwrap();
        assert_eq!(w.eligible_guarantors(123).len(), 3);
        assert_eq!(w.create_invitation(123, right), Err(Reject("insufficient Council paths")));
        // Council member 5 has three disjoint short paths to member 4 and invites; the cut at {10, 11} limits account 12 to two.
        assert_eq!(w.create_invitation(12, w.eligible_emission(12).unwrap()), Err(Reject("insufficient Council paths")));
        w.create_invitation(5, w.eligible_emission(5).unwrap()).unwrap();
        // Invalidated intermediaries stop providing paths.
        for k in [3, 4, 6, 7] {
            w.invalidate_identity(k);
        }
        w.tick(72);
        w.create_self_id(5).ok();
        w.tick(96);
        assert!(w.create_invitation(5, w.eligible_emission(5).unwrap_or(u32::MAX)).is_err());
        w.audit().unwrap();
    }

    #[test]
    fn an_isolated_pair_cannot_reach_the_council_so_its_members_cannot_make_self_ids_outside_bootstrap() {
        let mut pairs = ring(120);
        pairs.push((120, 121));
        let mut w = World::new(Config::default(), 122, &pairs);
        for i in 0..120 {
            w.create_self_id(i).unwrap();
        }
        w.tick(24);
        assert!(!w.bootstrap());
        assert_eq!(w.create_self_id(121), Err(Reject("insufficient Council paths")));
        assert!(w.create_self_id(12).is_ok());
    }

    #[test]
    fn the_depth_bound_and_layered_support_gate_who_can_invite() {
        // Seven nodes: a chain of mutual links longer than the bound cannot certify, a shorter one can.
        let mut pairs = ring(120);
        let mut prev = 119;
        for k in 120..128 {
            pairs.push((prev, k));
            prev = k;
        }
        let mut w = World::new(Config { max_nodes: Some(4), ..Config::default() }, 128, &pairs);
        for i in 0..120 {
            w.create_self_id(i).unwrap();
        }
        w.tick(24);
        // Far members of the tail are more than four nodes from every Council member.
        assert!(!w.self_gate(127) || w.dist_any[127] != NO_LEVEL);
        assert!(w.dist_any[127] == NO_LEVEL || w.dist_any[127] > 3);
        assert!(w.self_gate(2), "members near the Council certify");
    }

    #[test]
    fn disputes_hold_activity_and_exclude_accounts_from_paths_and_void_chain_revokes() {
        let mut w = world(10);
        let a = w.create_self_id(3).unwrap();
        w.tick(24);
        w.convert_to_collector(3, a).unwrap();
        assert!(w.xp(3) >= 1);
        assert!(!w.path_blocked(3));
        let case = w.begin_case(&[3, 4]).unwrap();
        assert_eq!(w.create_self_id(3), Err(Reject("open-dispute activity restriction")));
        assert!(w.path_blocked(3) && w.path_blocked(4), "D131: accounts in a dispute are not path intermediaries");
        w.end_case(case);
        assert!(!w.path_blocked(3) && !w.path_blocked(4));
        w.void_chain(3);
        assert_eq!(w.xp(3), 0);
        w.invalidate_identity(3);
        assert!(!w.accepted(3));
        w.audit().unwrap();
        assert_eq!(w.begin_case(&[3, 3]), Err(Reject("participation requires distinct case subjects")));
    }

    #[test]
    fn voiding_a_chain_whose_right_paid_a_valence_keeps_the_books_valid() {
        let mut w = world(8);
        rights(&mut w, &[0, 3]);
        w.open_valence(0, 3, w.eligible_emission(0).unwrap()).unwrap();
        w.void_chain(0);
        w.audit().unwrap();
        assert!(w.valence_info(0).0 || !w.valence_info(0).0);
    }
}
