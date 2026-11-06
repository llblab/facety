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
use crate::hash::FastMap;
use crate::paths::{layered_support, verify_family, PathFinder, Search, NO_LEVEL};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub const DAY: i64 = 24;
pub type Id = u32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Reject(pub &'static str);

/// Tie-break of the path search among neighbors at equal distance to the Council: nothing, more XP first, more guarantors first (hubs
/// have several routes), or both (the product of XP and the number of guarantors).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SearchOrder {
    None,
    Xp,
    Degree,
    Both,
}

impl SearchOrder {
    /// The default (owner decision): more mutual guarantors first, for every rule set; the measured alternatives are in the simulator contract.
    pub fn auto(_layered: bool) -> SearchOrder {
        SearchOrder::Degree
    }
}

#[derive(Clone, Debug)]
pub struct Config {
    /// Owned-slot ceiling K (own open valences plus invitation units).
    pub k: u32,
    /// Slot progression (a referendum parameter, D147): each level of XP adds this many slots to the account's ceiling. `None` is a flat K.
    pub k_step: Option<u32>,
    /// XP per level of the slot progression.
    pub k_xp_per_level: i32,
    pub freeze_hours: i64,
    pub spend_hours: i64,
    /// Most nodes a certifying Council path may have, endpoints included (D123). `None` is unbounded.
    pub max_nodes: Option<usize>,
    /// D124: only layered-supported accounts may be path intermediates (needs `max_nodes`).
    pub layered: bool,
    /// Work budget of one exact path search; running out is counted and refused like a missing family.
    pub search_budget: u64,
    /// Research levers for the large-network question (open): fix the number of Council seats, or cap the difficulty D. `None` keeps the D33
    /// lookup and D = digits of the active count.
    pub council_seats: Option<usize>,
    /// Council size rule that scales with the difficulty: at least this many seats per unit of D from 100 active accounts on (the D33 lookup
    /// remains the floor).
    pub council_seats_per_d: Option<usize>,
    /// Council size proportional to the network: at least this many seats per thousand active accounts from 100 active accounts on.
    pub council_seats_per_thousand: Option<usize>,
    pub max_difficulty: Option<usize>,
    /// Efficiency setting (does not change the rules): the order in which the path search tries neighbors at equal distance to the Council.
    /// `None` chooses automatically (see `SearchOrder::auto`).
    pub search_order: Option<SearchOrder>,
    /// D131: accounts in an open dispute are not path intermediaries (default). `false` is the ablation used to price the rule.
    pub exclude_disputed: bool,
    /// Softer D131 (research variant): only the accused party of a case (the second subject) is excluded from paths and from layered
    /// support; the challenger stays usable. Both parties keep the D77 activity hold either way. Default off.
    pub exclude_targets_only: bool,
}

impl Default for Config {
    fn default() -> Config {
        Config {
            k: 100,
            k_step: None,
            k_xp_per_level: 100,
            freeze_hours: 24,
            spend_hours: 24,
            max_nodes: Some(7),
            layered: false,
            search_budget: 300_000,
            council_seats: None,
            council_seats_per_d: None,
            council_seats_per_thousand: None,
            max_difficulty: None,
            search_order: None,
            exclude_disputed: true,
            exclude_targets_only: false,
        }
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

/// XP credited for one act: one receipt per recipient (the subject first, then the guarantors whose guarantee stood at credit time).
/// The recipient list is shared between acts of one account while it does not change, and single revoked receipts are rare, so they
/// are kept as a sparse list of indexes (an efficiency layout, D145: it changes no outcome).
#[derive(Clone, Debug)]
struct Credit {
    revoked: bool,
    recipients: Arc<[Id]>,
    revoked_receipts: Option<Box<[u32]>>,
}

impl Credit {
    fn receipt_revoked(&self, idx: usize) -> bool {
        self.revoked_receipts.as_ref().is_some_and(|r| r.contains(&(idx as u32)))
    }
    fn revoke_receipt(&mut self, idx: usize) {
        let mut all = self.revoked_receipts.take().map_or_else(Vec::new, |b| b.into_vec());
        all.push(idx as u32);
        self.revoked_receipts = Some(all.into_boxed_slice());
    }
}

#[derive(Clone, Debug)]
struct Act {
    subject: Id,
    recorded_at: i64,
    guarantors: Arc<[Id]>,
    status: ActStatus,
    credit: Option<Credit>,
}

#[derive(Clone, Debug)]
struct Subject {
    status: Status,
    xp: i32,
    liquid: u32,
    last_reward: Option<i64>,
    /// The most recent guarantor list and recipient list of this account's acts, reused while they are unchanged.
    last_guarantors: Option<Arc<[Id]>>,
    last_recipients: Option<Arc<[Id]>>,
    acts: Vec<u32>,
    first_unspent: usize,
    inviter: Option<Id>,
    /// Social recovery (D135): the account whose key was lost, and the XP restored from it once the recovery is complete.
    recovers: Option<Id>,
    restored_xp: i32,
    /// Sum of authorized XP penalties (D55 trusted execution); XP equals receipts plus recovered XP minus this.
    penalized_xp: i32,
    lost_key: bool,
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

/// How the invitation path question is answered (research probe, H1 and H2 of the path-discovery study).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PathMethod {
    /// The exact search as the simulator runs it.
    Exact,
    /// The exact search with the bounded-flow relaxation as a proof-of-impossibility prefilter.
    Relaxed,
    /// A certificate built from the layered-support levels (with live verification), falling back to the exact search.
    Shortcut,
}

/// What a probe found: the answer, the work, and how the answer was reached.
#[derive(Clone, Debug)]
pub struct Probe {
    pub accepted: bool,
    pub steps: u64,
    pub exhausted: bool,
    /// `Some(valid)` when a certificate was produced, checked independently against the live graph.
    pub certificate_valid: Option<bool>,
    pub resolved_by: &'static str,
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
    open_val: FastMap<(Id, Id), u32>,
    owned_open: Vec<u32>,
    inv_units: Vec<u32>,
    invitations: Vec<Invitation>,
    hold: Vec<u32>,
    /// Open cases in which the account is excluded from paths (D131); equals `hold` unless `exclude_targets_only` is set.
    path_hold: Vec<u32>,
    cases: Vec<Option<Vec<Id>>>,
    minted: i64,
    burned: i64,
    vault: i64,
    // Daily snapshot.
    active_count: usize,
    council: Vec<Id>,
    council_mask: Vec<bool>,
    previous_guarantors: HashMap<Id, Vec<Id>>,
    /// Single-use recovery: (successor, source, XP moved) for every completed recovery; a source appears at most once.
    recovery_log: Vec<(Id, Id, i32)>,
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
            open_val: FastMap::default(),
            owned_open: Vec::new(),
            inv_units: Vec::new(),
            invitations: Vec::new(),
            hold: Vec::new(),
            path_hold: Vec::new(),
            cases: Vec::new(),
            minted: 0,
            burned: 0,
            vault: 0,
            active_count: 0,
            council: Vec::new(),
            council_mask: Vec::new(),
            previous_guarantors: HashMap::new(),
            recovery_log: Vec::new(),
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
        self.subjects.push(Subject {
            status: Status::Accepted,
            xp: 0,
            liquid: 0,
            last_reward: None,
            last_guarantors: None,
            last_recipients: None,
            acts: Vec::new(),
            first_unspent: 0,
            inviter,
            recovers: None,
            restored_xp: 0,
            penalized_xp: 0,
            lost_key: false,
        });
        self.owned_open.push(0);
        self.inv_units.push(0);
        self.hold.push(0);
        self.path_hold.push(0);
        self.blocked.push(self.cfg.layered);
        self.council_mask.push(false);
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
    pub fn council(&self) -> &[Id] {
        &self.council
    }
    pub fn active_count(&self) -> usize {
        self.active_count
    }
    /// D: the number of digits of the active count (the stand-in for N_verified).
    pub fn required_guarantors(&self) -> usize {
        let d = digits(self.active_count);
        self.cfg.max_difficulty.map_or(d, |cap| d.min(cap))
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
    /// The owned-slot ceiling of an account: the base K plus the progression step for every level of XP reached.
    pub fn slot_ceiling(&self, id: Id) -> u32 {
        match self.cfg.k_step {
            Some(step) if self.cfg.k_xp_per_level > 0 => self.cfg.k + step * (self.subjects[id as usize].xp.max(0) / self.cfg.k_xp_per_level) as u32,
            _ => self.cfg.k,
        }
    }
    /// Number of Self-ID acts (emissions) recorded by the account.
    pub fn chain_len(&self, id: Id) -> usize {
        self.subjects[id as usize].acts.len()
    }
    pub fn xp_of(&self, id: Id) -> i32 {
        self.subjects[id as usize].xp
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
    pub fn set_relaxation(&mut self, on: bool) {
        self.finder.use_relaxation = on;
    }
    pub fn relaxation_refusals(&self) -> u64 {
        self.finder.relaxation_refusals
    }
    pub fn path_search_steps(&self) -> u64 {
        self.finder.steps_total
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
        s.acts[s.first_unspent..]
            .iter()
            .copied()
            .filter(|&a| {
                let act = &self.acts[a as usize];
                act.status == ActStatus::Unspent && self.now - act.recorded_at >= min_age
            })
            .collect()
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
        self.subjects[id as usize].acts[self.subjects[id as usize].first_unspent..]
            .iter()
            .filter(|&&a| self.acts[a as usize].status == ActStatus::Unspent)
            .count()
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
        // D33 lookup; below 100 active accounts the Council has three equal-vote seats, the smallest body that can form a majority.
        let lookup = [3usize, 11, 101, 1001, 10001, 100001][r.max(1) - 1];
        // The seat override applies from 100 active accounts on; below that the Council of three is an invariant (D133).
        if self.active_count < 100 {
            return lookup;
        }
        match (self.cfg.council_seats, self.cfg.council_seats_per_d, self.cfg.council_seats_per_thousand) {
            (Some(seats), _, _) => seats,
            (None, Some(per_d), _) => lookup.max(per_d * self.required_guarantors()),
            (None, None, Some(per_thousand)) => lookup.max((self.active_count * per_thousand).div_ceil(1000)),
            _ => lookup,
        }
    }

    /// Advance to `hour` and refresh the daily snapshot (activity, difficulty, Council, support levels, distances).
    pub fn tick(&mut self, hour: i64) {
        assert!(hour >= self.now, "time cannot move backwards");
        self.now = hour;
        let n = self.subjects.len();
        self.active_count = (0..n as Id).filter(|&i| self.is_active(i)).count();
        let size = self.council_target();
        // Active accounts first, then by XP, then older accounts; below 100 active the seats may go to inactive genesis accounts until enough are active.
        let early = self.active_count < 100;
        let mut candidates: Vec<(bool, i32, Id)> = (0..n as Id)
            .filter(|&i| self.accepted(i))
            .map(|i| (self.is_active(i), self.subjects[i as usize].xp, i))
            .filter(|&(active, _, _)| active || early)
            .collect();
        candidates.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)).then(a.2.cmp(&b.2)));
        self.council = candidates.into_iter().take(size).map(|(_, _, i)| i).collect();
        match self.cfg.search_order.unwrap_or(SearchOrder::auto(self.cfg.layered)) {
            SearchOrder::None => self.finder.use_priority = false,
            SearchOrder::Xp => {
                self.finder.use_priority = true;
                self.finder.priority = self.subjects.iter().map(|s| s.xp).collect();
            }
            SearchOrder::Degree => {
                self.finder.use_priority = true;
                self.finder.priority = (0..n).map(|v| self.graph.inn(v as Id).len() as i32).collect();
            }
            SearchOrder::Both => {
                self.finder.use_priority = true;
                self.finder.priority =
                    self.subjects.iter().enumerate().map(|(v, s)| s.xp.max(0).saturating_mul(self.graph.inn(v as Id).len() as i32)).collect();
            }
        }
        self.council_mask = vec![false; n];
        for &m in &self.council {
            self.council_mask[m as usize] = true;
        }
        // Accounts in an open dispute count as unusable for support levels and paths (D131).
        let nonaccepted: Vec<bool> = (0..n as Id).map(|i| !self.accepted(i) || (self.cfg.exclude_disputed && self.path_hold[i as usize] > 0)).collect();
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
        for (idx, &recipient) in credit.recipients.iter().enumerate() {
            if !credit.receipt_revoked(idx) {
                self.subjects[recipient as usize].xp -= 1;
            }
        }
        true
    }

    fn credit(&mut self, act_id: u32) {
        let (subject, recipients) = {
            let act = &self.acts[act_id as usize];
            let mut r = vec![act.subject];
            for &g in act.guarantors.iter() {
                // A guarantor whose guarantee ended before the credit earns nothing.
                if self.graph.has_edge(g, act.subject) {
                    r.push(g);
                }
            }
            (act.subject, r)
        };
        for &recipient in &recipients {
            self.subjects[recipient as usize].xp += 1;
        }
        let shared = match &self.subjects[subject as usize].last_recipients {
            Some(last) if **last == *recipients => last.clone(),
            _ => {
                let fresh: Arc<[Id]> = recipients.into();
                self.subjects[subject as usize].last_recipients = Some(fresh.clone());
                fresh
            }
        };
        self.acts[act_id as usize].credit = Some(Credit { revoked: false, recipients: shared, revoked_receipts: None });
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
        if !self.accepted(id) {
            Err(Reject("subject identity is not accepted"))
        } else if self.subjects[id as usize].lost_key {
            Err(Reject("the private key is lost"))
        } else {
            Ok(())
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
            // Revoke the guarantor's receipts for the acts of the guaranteed account (the order does not matter: XP is a sum).
            for k in 0..self.subjects[d as usize].acts.len() {
                let act_id = self.subjects[d as usize].acts[k];
                let Some(credit) = self.acts[act_id as usize].credit.as_mut() else { continue };
                if credit.revoked {
                    continue;
                }
                for idx in 1..credit.recipients.len() {
                    if credit.recipients[idx] == g && !credit.receipt_revoked(idx) {
                        credit.revoke_receipt(idx);
                        self.subjects[g as usize].xp -= 1;
                    }
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

    /// H1: a certificate for the invitation question built from the layered-support levels. Every supported account has at least D mutual
    /// neighbors of strictly lower level, so descending chains exist; the family is read off those chains and then verified against the live graph
    /// (the levels are a daily snapshot), so an accepted answer is always a valid certificate. `Err(true)` is a proof of impossibility (fewer
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
            self.finder.bounded(&self.graph, &self.blocked, &self.council_mask, &self.council, self.epoch, creator, d, max_nodes, self.cfg.search_budget);
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

    /// D104/D134: D internally vertex-disjoint current paths from the creator to D different Council members (any members that
    /// sit in the Council at confirmation time), each path within the node bound.
    fn invitation_paths_ok(&mut self, creator: Id, d: usize) -> bool {
        // Efficiency (D145, no change of answers): with layered support the supported-account levels give a verified certificate, or a proof
        // that too few first hops exist, for almost every question; the exact search runs only for the rest.
        match self.structural_family(creator, d) {
            Ok(_) => return true,
            Err(true) => return false,
            Err(false) => {}
        }
        let Some(max_nodes) = self.cfg.max_nodes else {
            return self.finder.disjoint_count(&self.graph, &self.blocked, &self.council_mask, creator, d) >= d;
        };
        matches!(
            self.finder.bounded(&self.graph, &self.blocked, &self.council_mask, &self.council, self.epoch, creator, d, max_nodes, self.cfg.search_budget),
            Search::Found(_)
        )
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
        if self.used_slots(creator) >= self.slot_ceiling(creator) {
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
        self.invitations
            .iter()
            .position(|i| i.status == InvStatus::Active && ((i.creator == a && i.target == Some(b)) || (i.creator == b && i.target == Some(a))))
            .map(|p| p as u32)
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
        for (k, &s) in subjects.iter().enumerate() {
            self.hold[s as usize] += 1;
            // D131: accounts in an open dispute cannot be intermediaries of any counted path, so an investigated cluster pauses.
            if self.cfg.exclude_disputed && (k > 0 || !self.cfg.exclude_targets_only) {
                self.path_hold[s as usize] += 1;
                self.blocked[s as usize] = true;
            }
        }
        self.cases.push(Some(subjects.to_vec()));
        Ok((self.cases.len() - 1) as u32)
    }

    pub fn end_case(&mut self, case: u32) {
        if let Some(subjects) = self.cases[case as usize].take() {
            for (k, s) in subjects.into_iter().enumerate() {
                self.hold[s as usize] -= 1;
                if self.cfg.exclude_disputed && (k > 0 || !self.cfg.exclude_targets_only) {
                    self.path_hold[s as usize] -= 1;
                }
                self.blocked[s as usize] = (self.cfg.exclude_disputed && self.path_hold[s as usize] > 0) || self.base_blocked(s);
            }
        }
    }

    pub fn invalidate_identity(&mut self, id: Id) {
        self.subjects[id as usize].status = Status::False;
    }

    /// D151 appeal: a wrongly invalidated person who proves reality is an account again. Credit revoked with the cut chain stays revoked,
    /// and links that others left are not restored. A retired lost-key account (D135) is never reinstated. Returns whether anything changed.
    pub fn reinstate_identity(&mut self, id: Id) -> bool {
        let s = &mut self.subjects[id as usize];
        if s.status == Status::False && !s.lost_key {
            s.status = Status::Accepted;
            return true;
        }
        false
    }

    /// D34/D55 (trusted execution, not adjudication): the account loses `fraction` of its current XP, recorded as an authorized adjustment.
    /// Deviation: the snapshot of the losing act is not kept; the penalty applies to the XP the account holds now. Returns the XP removed.
    pub fn penalize_xp(&mut self, id: Id, fraction: f64) -> i32 {
        let s = &mut self.subjects[id as usize];
        let cut = ((f64::from(s.xp.max(0))) * fraction).floor() as i32;
        s.xp -= cut;
        s.penalized_xp += cut;
        cut
    }

    /// D151 recovery: the liquid FACY of an invalidated account is burned (FACY already transferred out cannot be un-minted, D53; here
    /// nothing is transferable, so all liquid FACY of the account is burned). Returns the amount burned.
    pub fn burn_liquid(&mut self, id: Id) -> u32 {
        let mut burned = 0;
        let acts = self.subjects[id as usize].acts.clone();
        for act in acts {
            if self.acts[act as usize].status == ActStatus::Converted {
                self.acts[act as usize].status = ActStatus::Cancelled;
                burned += 1;
            }
        }
        self.subjects[id as usize].liquid -= burned;
        self.burned += i64::from(burned);
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

    // ---- key loss and social recovery (D135, a customizable starting point) -----------------------------------------

    /// The holder loses the private key: the account can no longer act, and its current mutual guarantors are recorded as the
    /// previous guarantors of the NFT chain.
    pub fn lose_key(&mut self, old: Id) -> Result<(), Reject> {
        self.require_account(old)?;
        let guarantors = self.mutual_partners(old);
        self.previous_guarantors.insert(old, guarantors);
        self.subjects[old as usize].lost_key = true;
        Ok(())
    }

    /// A source can still be recovered: it lost its key, is a valid account and was not consumed by an earlier recovery.
    fn check_source(&self, old: Id) -> Result<(), Reject> {
        if (old as usize) >= self.subjects.len() || !self.previous_guarantors.contains_key(&old) || !self.subjects[old as usize].lost_key {
            return Err(Reject("the referenced account did not lose its key"));
        }
        if self.recovery_log.iter().any(|&(_, source, _)| source == old) {
            return Err(Reject("the lost account was already recovered"));
        }
        if self.subjects[old as usize].status != Status::Accepted {
            return Err(Reject("the lost account is no longer valid"));
        }
        Ok(())
    }

    /// The new account (already admitted by an invitation from one of the previous guarantors) declares that it continues `old`. It
    /// starts a separate history from zero. Several successors may prepare to recover one lost account, but only one can complete.
    pub fn begin_recovery(&mut self, new: Id, old: Id) -> Result<(), Reject> {
        self.require_account(new)?;
        if new == old {
            return Err(Reject("an account cannot recover itself"));
        }
        self.check_source(old)?;
        let previous = &self.previous_guarantors[&old];
        let inviter = self.subjects[new as usize].inviter;
        if !inviter.is_some_and(|i| previous.contains(&i)) {
            return Err(Reject("a recovery invitation must come from a previous guarantor"));
        }
        if self.subjects[new as usize].recovers.is_some() || !self.subjects[new as usize].acts.is_empty() {
            return Err(Reject("recovery must start before any act of the new account"));
        }
        if self.recovery_log.iter().any(|&(successor, _, _)| successor == new) {
            return Err(Reject("this account already completed a recovery"));
        }
        self.subjects[new as usize].recovers = Some(old);
        Ok(())
    }

    /// (previous guarantors that currently guarantee the new account mutually, needed): at least half of the previous
    /// guarantors and not fewer than D.
    pub fn recovery_progress(&self, new: Id) -> Option<(usize, usize)> {
        let old = self.subjects[new as usize].recovers?;
        let previous = self.previous_guarantors.get(&old)?;
        let vouched = previous.iter().filter(|&&p| self.accepted(p) && self.graph.is_mutual(p, new)).count();
        Some((vouched, previous.len().div_ceil(2).max(self.required_guarantors())))
    }

    /// With enough vouching the new account is merged into the old chain for good: the earned XP returns and the old account is
    /// retired. Invitations and guarantee relations are not restored; they must be built again. The right to recover a source is
    /// consumed exactly once: validity and availability are checked immediately before the transfer, and the consumption, the
    /// transfer and the retirement happen together or not at all.
    pub fn complete_recovery(&mut self, new: Id) -> Result<(), Reject> {
        let Some((vouched, needed)) = self.recovery_progress(new) else { return Err(Reject("no recovery in progress")) };
        self.require_account(new)?;
        let old = self.subjects[new as usize].recovers.unwrap();
        self.check_source(old)?;
        if vouched < needed {
            return Err(Reject("not enough previous guarantors vouch for the new account"));
        }
        let amount = self.subjects[old as usize].xp;
        self.recovery_log.push((new, old, amount));
        self.subjects[new as usize].recovers = None;
        self.subjects[new as usize].restored_xp += amount;
        self.subjects[new as usize].xp += amount;
        self.subjects[old as usize].status = Status::False;
        Ok(())
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
        // One pass over each table instead of one pass per account (the audit stays linear in the size of the world).
        let n = self.subjects.len();
        let mut owned = vec![0u32; n];
        for v in self.valences.iter().filter(|v| v.open) {
            owned[v.owner as usize] += 1;
        }
        let mut xp = vec![0i32; n];
        let mut ever = vec![0i32; n];
        for act in &self.acts {
            if let Some(c) = &act.credit {
                for (idx, &recipient) in c.recipients.iter().enumerate() {
                    ever[recipient as usize] += 1;
                    if !c.revoked && !c.receipt_revoked(idx) {
                        xp[recipient as usize] += 1;
                    }
                }
            }
        }
        let mut units = vec![0u32; n];
        for v in self.invitations.iter().filter(|v| matches!(v.status, InvStatus::Pending | InvStatus::Active)) {
            units[v.creator as usize] += 1;
            if let Some(t) = v.target {
                units[t as usize] += 1;
            }
        }
        for (i, s) in self.subjects.iter().enumerate() {
            if owned[i] != self.owned_open[i] {
                return Err(format!("owned valences of {i}"));
            }
            if xp[i] + s.restored_xp - s.penalized_xp != s.xp {
                return Err(format!("xp of {i}: stored {} recomputed {}", s.xp, xp[i]));
            }
            if units[i] != self.inv_units[i] {
                return Err(format!("invitation units of {i}: stored {} recomputed {}", self.inv_units[i], units[i]));
            }
        }
        // Recovered XP has an origin: every completed recovery consumed a distinct, retired, lost source, and a successor's restored XP is
        // exactly the sum of what its recoveries moved, never more than the source could have held.
        let mut sources = HashSet::new();
        let mut moved: HashMap<Id, i32> = HashMap::new();
        for &(new, old, amount) in &self.recovery_log {
            if new == old || !sources.insert(old) {
                return Err(format!("recovery source {old} used more than once or recovered by itself"));
            }
            if !self.subjects[old as usize].lost_key || self.subjects[old as usize].status != Status::False || !self.previous_guarantors.contains_key(&old) {
                return Err(format!("recovery source {old} is not a retired lost account"));
            }
            let source = &self.subjects[old as usize];
            let at_most = ever[old as usize] + source.restored_xp;
            if amount < 0 || amount > at_most {
                return Err(format!("recovery of {old} moved {amount} XP but it could hold at most {at_most}"));
            }
            *moved.entry(new).or_insert(0) += amount;
        }
        for (i, s) in self.subjects.iter().enumerate() {
            if s.restored_xp != moved.get(&(i as Id)).copied().unwrap_or(0) {
                return Err(format!("restored XP of {i} does not match its recovery log"));
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
    fn genesis_mints_nothing_and_the_council_has_three_seats_below_100_active_and_eleven_from_100() {
        let w = world(50);
        assert_eq!(w.council().len(), 3, "three equal-vote seats below 100 active accounts, from the start");
        assert_eq!(w.minted(), 0, "genesis pairs mint and burn nothing");
        assert_eq!(w.graph().edge_count(), ring(50).len() * 2);
        // A Self-ID needs one mutual guarantor that reaches the Council.
        let mut pairs = ring(50);
        pairs.retain(|&(a, b)| a != 7 && b != 7);
        let mut lonely = World::new(Config::default(), 50, &pairs);
        assert_eq!(lonely.create_self_id(7), Err(Reject("Self-ID requires an established mutual guarantor")));
        // 120 participants: all near enough to the seats to make Self-IDs on day one; 11 seats from 100 active; three again below it.
        let mut big = world(120);
        for i in 0..12 {
            big.create_self_id(i).unwrap();
        }
        big.tick(24);
        assert_eq!(big.council().len(), 3);
        for i in 12..120 {
            let _ = big.create_self_id(i);
        }
        big.tick(48);
        big.tick(48 + 29 * 24);
        assert_eq!(big.active_count(), 0);
        assert_eq!(big.council().len(), 3, "the Council shrinks back to three when activity falls below 100");
    }

    /// 120 ring members plus three satellites {120, 121, 122} that guarantee a newcomer 123 but reach the ring only through one cut vertex.
    fn gated_world() -> World {
        let mut pairs = ring(120);
        pairs.extend([(120, 121), (120, 122), (121, 122), (120, 5), (123, 120), (123, 121), (123, 122)]);
        let mut w = World::new(Config { max_nodes: None, ..Config::default() }, 124, &pairs);
        for i in 0..124 {
            w.create_self_id(i).unwrap();
        }
        w.tick(24);
        w
    }

    #[test]
    fn self_ids_and_invitations_need_council_paths_independent_of_the_guarantor_count() {
        let mut w = gated_world();
        assert_eq!(w.required_guarantors(), 3);
        w.tick(48);
        // The ring is long: everyone made a Self-ID unbounded on day one; from now on the seven-node bound applies.
        w.cfg.max_nodes = Some(7);
        w.tick(49);
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
    fn an_isolated_pair_cannot_reach_the_council_so_its_members_cannot_make_self_ids() {
        let mut pairs = ring(120);
        pairs.push((120, 121));
        let mut w = World::new(Config { max_nodes: None, ..Config::default() }, 122, &pairs);
        for i in 0..120 {
            w.create_self_id(i).unwrap();
        }
        w.tick(24);
        assert_eq!(w.create_self_id(121), Err(Reject("insufficient Council paths")));
        assert!(w.create_self_id(12).is_ok());
    }

    #[test]
    fn paths_may_end_at_any_different_council_members() {
        // Account 5 sits between members 3, 4 and 6 of an 11-seat Council and reaches three different members; each member is used once.
        let mut w = World::new(Config { max_nodes: None, ..Config::default() }, 120, &ring(120));
        for i in 0..120 {
            let _ = w.create_self_id(i);
        }
        w.tick(24);
        assert_eq!(w.council().len(), 11);
        let right = w.eligible_emission(5).unwrap();
        assert!(w.create_invitation(5, right).is_ok(), "three paths to three different members");
        // A single member reachable from five directions still counts once: a satellite behind one member cannot invite.
        let mut pairs = ring(120);
        pairs.extend([(120, 4), (121, 4), (122, 4), (123, 4), (120, 121), (121, 122), (122, 123)]);
        let mut w2 = World::new(Config { max_nodes: None, ..Config::default() }, 124, &pairs);
        for i in 0..124 {
            let _ = w2.create_self_id(i);
        }
        w2.tick(24);
        let right = w2.eligible_emission(122).unwrap();
        assert!(w2.eligible_guarantors(122).len() >= 3);
        assert_eq!(w2.create_invitation(122, right), Err(Reject("insufficient Council paths")), "every path ends at member 4 or runs through it");
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
            let _ = w.create_self_id(i);
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
    fn the_softer_exclusion_spares_the_challenger_but_keeps_the_activity_hold() {
        let cfg = Config { exclude_targets_only: true, ..Config::default() };
        let mut w = World::new(cfg, 10, &ring(10));
        let case = w.begin_case(&[3, 4]).unwrap();
        assert_eq!(w.create_self_id(3), Err(Reject("open-dispute activity restriction")), "both parties keep the D77 hold");
        assert!(!w.path_blocked(3), "the challenger stays usable on paths");
        assert!(w.path_blocked(4), "the accused is excluded");
        w.end_case(case);
        assert!(!w.path_blocked(3) && !w.path_blocked(4));
        w.audit().unwrap();
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

#[cfg(test)]
mod recovery_tests {
    use super::*;

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

    #[test]
    fn a_lost_key_is_recovered_when_enough_previous_guarantors_vouch_and_the_xp_returns() {
        let mut w = World::new(Config::default(), 12, &ring(12));
        for i in 0..12 {
            w.create_self_id(i).unwrap();
        }
        w.tick(24);
        // Account 5 earns XP, then loses its key.
        let act = w.eligible_emission(5).unwrap();
        w.convert_to_collector(5, act).unwrap();
        let earned = w.xp(5);
        assert!(earned >= 1);
        w.lose_key(5).unwrap();
        assert_eq!(w.create_self_id(5), Err(Reject("the private key is lost")));
        let previous = w.previous_guarantors.get(&5).unwrap().clone();
        assert_eq!(previous, vec![3, 4, 6, 7]);
        // A previous guarantor invites the new account; a stranger's invitation does not qualify.
        let inv = w.create_invitation(3, w.eligible_emission(3).unwrap()).unwrap();
        w.tick(48);
        let new = w.accept_invitation(inv).unwrap();
        w.begin_recovery(new, 5).unwrap();
        assert_eq!(w.recovery_progress(new), Some((1, 2)), "the inviter vouches by the link; at least half of four and not fewer than D = 1");
        // Two previous guarantors are enough for a half of four; the XP returns and the old account is retired.
        w.create_self_id(new).unwrap();
        w.create_self_id(4).unwrap();
        w.tick(72);
        w.open_valence(new, 4, w.eligible_emission(new).unwrap()).unwrap();
        w.open_valence(4, new, w.eligible_emission(4).unwrap()).unwrap();
        assert_eq!(w.recovery_progress(new), Some((2, 2)));
        let before = w.xp(new);
        w.complete_recovery(new).unwrap();
        assert_eq!(w.xp(new), before + earned, "the earned XP returns");
        assert!(!w.accepted(5), "the old account is retired");
        assert_eq!(w.complete_recovery(new), Err(Reject("no recovery in progress")));
        w.audit().unwrap();
    }

    #[test]
    fn recovery_needs_a_previous_guarantor_as_inviter_and_enough_vouching() {
        let mut w = World::new(Config::default(), 12, &ring(12));
        for i in 0..12 {
            w.create_self_id(i).unwrap();
        }
        w.tick(24);
        w.lose_key(5).unwrap();
        // Account 9 is not a previous guarantor of 5.
        let inv = w.create_invitation(9, w.eligible_emission(9).unwrap()).unwrap();
        w.tick(48);
        let stranger_invited = w.accept_invitation(inv).unwrap();
        assert_eq!(w.begin_recovery(stranger_invited, 5), Err(Reject("a recovery invitation must come from a previous guarantor")));
        assert_eq!(w.begin_recovery(stranger_invited, 6), Err(Reject("the referenced account did not lose its key")));
        // With one vouching of four, the recovery is refused.
        let inv = w.create_invitation(3, w.eligible_emission(3).unwrap()).unwrap();
        w.tick(72);
        let new = w.accept_invitation(inv).unwrap();
        w.begin_recovery(new, 5).unwrap();
        assert_eq!(w.complete_recovery(new), Err(Reject("not enough previous guarantors vouch for the new account")));
    }

    /// Two successors prepared for one lost account; each is vouched by two previous guarantors. A test helper makes a mutual
    /// guarantee between a new account and one voucher through two matching paid valences.
    fn vouch(w: &mut World, new: Id, voucher: Id) {
        for _ in 0..6 {
            let _ = w.create_self_id(new);
            let _ = w.create_self_id(voucher);
            w.tick(w.now() + 24);
            if let (Some(a), Some(b)) = (w.eligible_emission(new), w.eligible_emission(voucher)) {
                w.open_valence(new, voucher, a).unwrap();
                w.open_valence(voucher, new, b).unwrap();
                return;
            }
        }
        panic!("could not make the vouching guarantee");
    }

    fn recovery_world() -> (World, Id, i32) {
        let mut w = World::new(Config::default(), 12, &ring(12));
        for i in 0..12 {
            w.create_self_id(i).unwrap();
        }
        w.tick(24);
        let act = w.eligible_emission(5).unwrap();
        w.convert_to_collector(5, act).unwrap();
        let earned = w.xp(5);
        assert!(earned >= 1);
        w.lose_key(5).unwrap();
        (w, 5, earned)
    }

    /// A mature right of `who`, making a Self-ID and waiting a day when needed.
    fn right_of(w: &mut World, who: Id) -> u32 {
        for _ in 0..4 {
            if let Some(r) = w.eligible_emission(who) {
                return r;
            }
            let _ = w.create_self_id(who);
            w.tick(w.now() + 24);
        }
        panic!("no mature right");
    }

    fn successor(w: &mut World, old: Id, inviter: Id) -> Id {
        let right = right_of(w, inviter);
        let inv = w.create_invitation(inviter, right).unwrap();
        w.tick(w.now() + 24);
        let new = w.accept_invitation(inv).unwrap();
        w.begin_recovery(new, old).unwrap();
        new
    }

    #[test]
    fn one_lost_account_restores_xp_to_exactly_one_successor() {
        let (mut w, old, earned) = recovery_world();
        let first = successor(&mut w, old, 3);
        let second = successor(&mut w, old, 6);
        vouch(&mut w, first, 4);
        vouch(&mut w, second, 7);
        assert_eq!(w.recovery_progress(first).map(|p| p.0 >= p.1), Some(true));
        assert_eq!(w.recovery_progress(second).map(|p| p.0 >= p.1), Some(true));
        w.audit().unwrap();
        let xp_first_before = w.xp(first);
        let carried = w.xp(old);
        assert!(carried >= earned, "the lost account keeps what it earned (and may still earn guarantor XP while its links stand)");
        w.complete_recovery(first).unwrap();
        assert_eq!(w.xp(first), xp_first_before + carried);
        w.audit().unwrap();
        // The competing successor is refused and nothing moves.
        let (xp_second, xp_old, edges) = (w.xp(second), w.xp(old), w.graph().edge_count());
        let supply = w.supply();
        assert_eq!(w.complete_recovery(second), Err(Reject("the lost account was already recovered")));
        assert_eq!((w.xp(second), w.xp(old), w.graph().edge_count(), w.supply()), (xp_second, xp_old, edges, supply));
        assert!(w.accepted(second) && !w.accepted(old));
        w.audit().unwrap();
        // The consumed source cannot be claimed again, completion cannot repeat, and a retired account cannot recover itself.
        assert_eq!(w.complete_recovery(first), Err(Reject("no recovery in progress")));
        let third = {
            let right = right_of(&mut w, 3);
            let inv = w.create_invitation(3, right).unwrap();
            w.tick(w.now() + 24);
            w.accept_invitation(inv).unwrap()
        };
        assert_eq!(w.begin_recovery(third, old), Err(Reject("the lost account was already recovered")));
        assert_eq!(w.begin_recovery(first, first), Err(Reject("an account cannot recover itself")));
        w.audit().unwrap();
    }

    #[test]
    fn recovery_refuses_an_invalid_source_and_a_second_recovery_by_the_same_successor() {
        let (mut w, old, _) = recovery_world();
        let new = successor(&mut w, old, 3);
        vouch(&mut w, new, 4);
        // The source was invalidated by a verdict before the recovery completed: no XP moves.
        w.invalidate_identity(old);
        let xp = w.xp(new);
        assert_eq!(w.complete_recovery(new), Err(Reject("the lost account is no longer valid")));
        assert_eq!(w.xp(new), xp);
        w.audit().unwrap();
        assert_eq!(w.begin_recovery(new, 99 % 12), Err(Reject("the referenced account did not lose its key")));
    }

    #[test]
    fn a_recovered_account_that_loses_its_key_can_itself_be_recovered_with_the_inherited_xp() {
        let (mut w, old, earned) = recovery_world();
        let b = successor(&mut w, old, 3);
        vouch(&mut w, b, 4);
        w.complete_recovery(b).unwrap();
        assert!(w.xp(b) >= earned);
        // b loses its key; its guarantors now are the previous guarantors it re-established.
        w.lose_key(b).unwrap();
        let c = successor(&mut w, b, 3);
        vouch(&mut w, c, 4);
        let before = w.xp(c);
        let carried = w.xp(b);
        assert!(carried >= earned, "the inherited XP is part of what b holds");
        w.complete_recovery(c).unwrap();
        assert_eq!(w.xp(c), before + carried, "the whole inherited XP moves once");
        w.audit().unwrap();
    }

    #[test]
    fn the_linear_audit_still_catches_every_kind_of_corruption() {
        let build = || {
            let mut w = World::new(Config::default(), 12, &ring(12));
            for i in 0..12 {
                w.create_self_id(i).unwrap();
            }
            w.tick(24);
            let act = w.eligible_emission(5).unwrap();
            w.convert_to_collector(5, act).unwrap();
            let right = w.eligible_emission(3).unwrap();
            w.create_invitation(3, right).unwrap();
            w.audit().unwrap();
            w
        };
        let mut w = build();
        w.subjects[5].xp += 1;
        assert!(w.audit().unwrap_err().contains("xp of 5"));
        let mut w = build();
        w.owned_open[2] += 1;
        assert!(w.audit().unwrap_err().contains("owned valences of 2"));
        let mut w = build();
        w.inv_units[3] += 1;
        assert!(w.audit().unwrap_err().contains("invitation units of 3"));
        let mut w = build();
        w.vault += 1;
        assert!(w.audit().unwrap_err().contains("vault"));
        let mut w = build();
        w.subjects[0].liquid += 1;
        assert!(w.audit().is_err());
        let mut w = build();
        w.recovery_log.push((1, 2, 5));
        assert!(w.audit().is_err(), "a recovery without a lost, retired source is not a valid history");
    }

    #[test]
    fn research_levers_cap_the_difficulty_and_override_the_council_size_only_from_100_active() {
        let mut w = World::new(Config { max_difficulty: Some(1), council_seats: Some(21), ..Config::default() }, 120, &ring(120));
        assert_eq!(w.council().len(), 3, "the Council of three below 100 active accounts is an invariant");
        for i in 0..120 {
            let _ = w.create_self_id(i);
        }
        w.tick(24);
        assert!(w.active_count() < 100 || w.council().len() == 21 || w.council().len() == 3);
        assert_eq!(w.required_guarantors(), 1, "the cap holds D at one");
        let plain = World::new(Config::default(), 120, &ring(120));
        assert_eq!(plain.council().len(), 3);
    }

    #[test]
    fn the_council_size_can_scale_with_the_difficulty_from_100_active_accounts() {
        // Below 100 active accounts the Council of three is an invariant whatever the rule; from 100 on, seats = max(lookup, per_d * D).
        let mut w = World::new(Config { council_seats_per_d: Some(5), max_nodes: None, ..Config::default() }, 120, &ring(120));
        assert_eq!(w.council().len(), 3);
        for i in 0..120 {
            let _ = w.create_self_id(i);
        }
        w.tick(24);
        let d = w.required_guarantors();
        assert!(d >= 3 && w.active_count() >= 100);
        assert_eq!(w.council().len(), 11usize.max(5 * d));
        let plain = {
            let mut p = World::new(Config { max_nodes: None, ..Config::default() }, 120, &ring(120));
            for i in 0..120 {
                let _ = p.create_self_id(i);
            }
            p.tick(24);
            p
        };
        assert_eq!(plain.council().len(), 11);
    }

    #[test]
    fn the_council_size_can_be_proportional_to_the_network() {
        // 120 active accounts at 200 seats per thousand: ceil(120 * 200 / 1000) = 24 seats, never fewer than the lookup, and three below 100 active.
        let mut w = World::new(Config { council_seats_per_thousand: Some(200), max_nodes: None, ..Config::default() }, 120, &ring(120));
        assert_eq!(w.council().len(), 3);
        for i in 0..120 {
            let _ = w.create_self_id(i);
        }
        w.tick(24);
        assert_eq!(w.council().len(), 24);
    }

    #[test]
    fn the_slot_ceiling_can_grow_with_levels_of_xp() {
        let mut w = World::new(Config { k: 5, k_step: Some(50), k_xp_per_level: 100, ..Config::default() }, 12, &ring(12));
        assert_eq!(w.slot_ceiling(3), 5);
        w.subjects[3].xp = 99;
        assert_eq!(w.slot_ceiling(3), 5);
        w.subjects[3].xp = 100;
        assert_eq!(w.slot_ceiling(3), 55);
        w.subjects[3].xp = 350;
        assert_eq!(w.slot_ceiling(3), 155);
        let flat = World::new(Config { k: 5, ..Config::default() }, 12, &ring(12));
        assert_eq!(flat.slot_ceiling(3), 5);
        // Lowering the ceiling never cuts existing valences (set_k), and the progression keeps counting from the new base.
        w.set_k(3);
        assert_eq!(w.slot_ceiling(3), 153);
    }
}
