//! The takeover runner: an honest valence-mode network grows by ordinary rules; attacker operators enter by ordinary
//! invitation and build a cone of fakes; detection (freeze veto, partner inspection, leaving, public evidence, escalation,
//! follow-up, one-step verdicts with D77 holds) always runs. Detection is not optional: an attack without it is self-evident.
//!
//! Evaluator labels (`Cohort`, `Kind`) are read only by the observation functions that model noisy looks and verdict accuracy;
//! the protocol world never sees them. Behavior rates are scenario assumptions, not calibrated human behavior.
use crate::rng::{hash_seed, Rng};
use crate::world::{Config as WorldConfig, Id, Reject, Status, World, DAY};
use crate::paths::{layered_support, NO_LEVEL};
use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;

pub const ENGINE: &str = "facety-sim/runner-v1";

const CH_GENESIS: u64 = 1;
const CH_ENTRY: u64 = 2;
const CH_SELFID: u64 = 3;
const CH_ANSWER: u64 = 4;
const CH_SPEND: u64 = 5;
const CH_ATTACK: u64 = 6;
const CH_REVIEW: u64 = 7;
const CH_VERDICT: u64 = 8;
const CH_INSPECT: u64 = 9;
const CH_PUBLIC: u64 = 10;
const CH_FOLLOW: u64 = 11;
const CH_VET: u64 = 12;
const CH_MET: u64 = 13;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Strategy {
    Cone,
    HonestFirst,
    SupportedFirst,
}

#[derive(Clone, Debug)]
pub struct Honest {
    pub self_id: f64,
    pub invite: f64,
    pub befriend: f64,
    pub accept_near: f64,
    pub accept_far: f64,
    pub keep_rights: usize,
    pub vetting: f64,
    pub vetting_sensitivity: Option<f64>,
    pub vetting_false_positive: Option<f64>,
    pub met_in_person: f64,
    pub double_life: f64,
}

#[derive(Clone, Debug)]
pub struct Detection {
    pub review: f64,
    pub inspect: f64,
    pub sensitivity: f64,
    pub false_positive: f64,
    pub window_days: i64,
    pub accuracy: f64,
    pub leave: bool,
    pub public_look: f64,
    pub pattern_min_invitees: usize,
    pub pattern_closure: f64,
    pub sponsor_willingness: f64,
    pub follow_up: bool,
    pub acquit_met: bool,
}

#[derive(Clone, Debug)]
pub struct RunConfig {
    pub seed: String,
    pub honest_genesis: usize,
    pub genesis_chords: usize,
    pub attack_start_day: i64,
    pub days: i64,
    pub attackers: usize,
    pub max_subjects: usize,
    pub world: WorldConfig,
    pub strategy: Strategy,
    pub honest: Honest,
    pub detection: Detection,
    pub detection_start_day: i64,
    /// Stop on the first day the honest accepted population reaches this size (0 = never): a snapshot point.
    pub stop_at_honest: usize,
}

impl Default for RunConfig {
    fn default() -> RunConfig {
        RunConfig {
            seed: "topology".into(),
            honest_genesis: 100,
            genesis_chords: 1,
            attack_start_day: 100,
            days: 200,
            attackers: 10,
            max_subjects: 20_000,
            world: WorldConfig::default(),
            strategy: Strategy::Cone,
            honest: Honest {
                self_id: 0.9,
                invite: 0.01,
                befriend: 0.05,
                accept_near: 0.5,
                accept_far: 0.05,
                keep_rights: 2,
                vetting: 0.0,
                vetting_sensitivity: None,
                vetting_false_positive: None,
                met_in_person: 0.0,
                double_life: 0.0,
            },
            detection: Detection {
                review: 0.5,
                inspect: 0.1,
                sensitivity: 0.8,
                false_positive: 0.01,
                window_days: 7,
                accuracy: 0.9,
                leave: true,
                public_look: 0.02,
                pattern_min_invitees: 5,
                pattern_closure: 0.8,
                sponsor_willingness: 0.5,
                follow_up: true,
                acquit_met: false,
            },
            detection_start_day: 0,
            stop_at_honest: 0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Cohort {
    Honest,
    Attacker,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    Genuine,
    Operator,
    Fake,
    Double,
}

fn false_identity(kind: Kind) -> bool {
    matches!(kind, Kind::Fake | Kind::Double)
}

#[derive(Clone, Debug)]
struct Pending {
    inv: u32,
    cohort: Cohort,
    kind: Kind,
    owner: Option<Id>,
}

#[derive(Clone, Debug)]
struct CaseRec {
    case: u32,
    target: Id,
    challenger: Id,
    opened_at: i64,
    id: u64,
}

#[derive(Clone, Debug, Default)]
pub struct DetectionCounters {
    pub cases_opened: u64,
    pub false_invalidated: u64,
    pub genuine_invalidated: u64,
    pub vetoed_false: u64,
    pub vetoed_genuine: u64,
    pub cases_dismissed: u64,
    pub links_left: u64,
    pub patterns_found: u64,
    pub escalations: u64,
    pub sponsor_refusals: u64,
    pub follow_up_cases: u64,
    pub honest_inviter_cascades: u64,
    pub honest_inviter_acquitted: u64,
    pub holders_invalidated: u64,
}

#[derive(Clone, Debug)]
pub struct Row {
    pub day: i64,
    pub subjects: usize,
    pub honest: usize,
    pub attackers: usize,
    pub supply: i64,
    pub dirty: i64,
    pub active: usize,
    pub d: usize,
    pub bootstrap: bool,
    pub council: usize,
    pub council_attackers: usize,
    pub attack_edges: usize,
}

impl Row {
    pub fn attacker_share(&self) -> Option<f64> {
        if self.subjects == 0 { None } else { Some(self.attackers as f64 / self.subjects as f64) }
    }
    pub fn dirty_share(&self) -> Option<f64> {
        if self.supply > 0 { Some(self.dirty as f64 / self.supply as f64) } else { None }
    }
}

#[derive(Clone)]
pub struct Sim {
    pub cfg: RunConfig,
    seed: u64,
    pub world: World,
    cohort: Vec<Cohort>,
    kind: Vec<Kind>,
    owner_of: HashMap<Id, Id>,
    honest: Vec<Id>,
    attackers: Vec<Id>,
    children: Vec<Vec<Id>>,
    pending: Vec<Pending>,
    answers: Vec<u32>,
    decided: HashMap<u32, bool>,
    open_cases: Vec<CaseRec>,
    targeted: HashSet<Id>,
    pub det: DetectionCounters,
    pub invitations: [u64; 2],
    pub admitted: [u64; 2],
    pub valences_opened: [u64; 2],
    pub pairs: u64,
    pub refusals: [HashMap<&'static str, u64>; 2],
    pub history: Vec<Row>,
    pub day: i64,
    pub censored: Option<&'static str>,
    sequence: u64,
    case_sequence: u64,
}

fn ci(c: Cohort) -> usize {
    c as usize
}

impl Sim {
    pub fn new(cfg: RunConfig) -> Sim {
        let seed = hash_seed(&cfg.seed);
        let n = cfg.honest_genesis;
        // D35 genesis: ring lattice with offsets 1 and 2 plus seeded random chords.
        let mut set: HashSet<(Id, Id)> = HashSet::new();
        let mut add = |a: usize, b: usize| {
            if a != b {
                set.insert((a.min(b) as Id, a.max(b) as Id));
            }
        };
        for i in 0..n {
            for off in [1usize, 2] {
                add(i, (i + off) % n);
            }
        }
        let mut rng = Rng::keyed(seed, CH_GENESIS, 0, 0);
        for i in 0..n {
            for _ in 0..cfg.genesis_chords {
                add(i, rng.below(n as u64) as usize);
            }
        }
        let mut pairs: Vec<(Id, Id)> = set.into_iter().collect();
        pairs.sort();
        let world = World::new(cfg.world.clone(), n, &pairs);
        Sim {
            seed,
            world,
            cohort: vec![Cohort::Honest; n],
            kind: vec![Kind::Genuine; n],
            owner_of: HashMap::new(),
            honest: (0..n as Id).collect(),
            attackers: Vec::new(),
            children: vec![Vec::new(); n],
            pending: Vec::new(),
            answers: Vec::new(),
            decided: HashMap::new(),
            open_cases: Vec::new(),
            targeted: HashSet::new(),
            det: DetectionCounters::default(),
            invitations: [0; 2],
            admitted: [0; 2],
            valences_opened: [0; 2],
            pairs: 0,
            refusals: [HashMap::new(), HashMap::new()],
            history: Vec::new(),
            day: 0,
            censored: None,
            sequence: 0,
            case_sequence: 0,
            cfg,
        }
    }

    fn stream(&self, channel: u64, actor: u64) -> Rng {
        Rng::keyed(self.seed, channel, actor, self.day as u64)
    }

    fn note<T>(&mut self, actor: Id, r: Result<T, Reject>) -> Option<T> {
        match r {
            Ok(v) => Some(v),
            Err(Reject(msg)) => {
                *self.refusals[ci(self.cohort[actor as usize])].entry(msg).or_insert(0) += 1;
                None
            }
        }
    }

    fn linked(&self, a: Id, b: Id) -> bool {
        self.world.graph().has_edge(a, b) || self.world.graph().has_edge(b, a)
    }

    /// A noisy look at an account: suspicious with the declared sensitivity for a false identity, else the false-positive rate.
    fn look(&self, rng: &mut Rng, id: Id) -> bool {
        rng.chance(if false_identity(self.kind[id as usize]) { self.cfg.detection.sensitivity } else { self.cfg.detection.false_positive })
    }

    fn invite(&mut self, creator: Id, right: u32, cohort: Cohort, kind: Kind, owner: Option<Id>) -> bool {
        if self.world.len() + self.pending.len() >= self.cfg.max_subjects {
            self.censored = Some("maxSubjects");
            return false;
        }
        let r = self.world.create_invitation(creator, right);
        match self.note(creator, r) {
            Some(inv) => {
                self.pending.push(Pending { inv, cohort, kind, owner });
                self.invitations[ci(self.cohort[creator as usize])] += 1;
                true
            }
            None => false,
        }
    }

    fn open_valence(&mut self, owner: Id, counterpart: Id, right: u32) -> bool {
        let before = self.world.graph().has_edge(owner, counterpart);
        let r = self.world.open_valence(owner, counterpart, right);
        match self.note(owner, r) {
            Some(v) => {
                self.valences_opened[ci(self.cohort[owner as usize])] += 1;
                if !before && self.world.graph().has_edge(owner, counterpart) {
                    self.pairs += 1;
                } else {
                    self.answers.push(v);
                }
                true
            }
            None => false,
        }
    }

    fn admit_due(&mut self) {
        let pending = std::mem::take(&mut self.pending);
        for p in pending {
            let inv = self.world.invitation(p.inv);
            if inv.status != crate::world::InvStatus::Pending {
                continue;
            }
            if self.world.now() - inv.created_at < self.cfg.world.freeze_hours {
                self.pending.push(p);
                continue;
            }
            let creator = inv.creator;
            match self.world.accept_invitation(p.inv) {
                Ok(id) => {
                    debug_assert_eq!(id as usize, self.cohort.len());
                    self.cohort.push(p.cohort);
                    self.kind.push(p.kind);
                    self.children.push(Vec::new());
                    self.children[creator as usize].push(id);
                    if let Some(o) = p.owner {
                        self.owner_of.insert(id, o);
                    }
                    match p.cohort {
                        Cohort::Honest => self.honest.push(id),
                        Cohort::Attacker => self.attackers.push(id),
                    }
                    self.admitted[ci(p.cohort)] += 1;
                }
                Err(Reject(msg)) => *self.refusals[ci(p.cohort)].entry(msg).or_insert(0) += 1,
            }
        }
    }

    fn pick_where(&self, rng: &mut Rng, pool: &[Id], ok: impl Fn(Id) -> bool) -> Option<Id> {
        if pool.is_empty() {
            return None;
        }
        for _ in 0..64 {
            let c = pool[rng.below(pool.len() as u64) as usize];
            if ok(c) {
                return Some(c);
            }
        }
        let valid: Vec<Id> = pool.iter().copied().filter(|&c| ok(c)).collect();
        rng.pick(&valid).copied()
    }

    // ---- one simulated day -----------------------------------------------------------------------------------------

    pub fn step_day(&mut self) -> bool {
        if self.day >= self.cfg.days || self.censored.is_some() {
            return false;
        }
        let day = self.day;
        self.world.tick(day * DAY);
        if day == self.cfg.attack_start_day {
            self.attack_entry();
        }
        self.admit_due();
        self.self_ids();
        self.answer_valences();
        self.honest_spend();
        if self.censored.is_none() {
            self.attackers_act();
        }
        if self.censored.is_none() && day >= self.cfg.detection_start_day {
            self.detect();
        }
        self.sample();
        self.day += 1;
        if self.cfg.stop_at_honest > 0 && self.history.last().is_some_and(|r| r.honest >= self.cfg.stop_at_honest) {
            self.censored = Some("stopAtHonest");
        }
        self.censored.is_none() && self.day < self.cfg.days
    }

    pub fn run(&mut self) {
        while self.step_day() {}
    }

    fn attack_entry(&mut self) {
        let mut inviters: Vec<Id> = self.honest.iter().copied().filter(|&i| self.world.accepted(i)).collect();
        let mut rng = self.stream(CH_ENTRY, 0);
        rng.shuffle(&mut inviters);
        let mut entered = 0;
        for inviter in inviters {
            if entered >= self.cfg.attackers {
                break;
            }
            if let Some(right) = self.world.eligible_emission(inviter) {
                if self.invite(inviter, right, Cohort::Attacker, Kind::Operator, None) {
                    entered += 1;
                }
            }
        }
    }

    fn self_ids(&mut self) {
        let ids: Vec<Id> = self.honest.iter().chain(self.attackers.iter()).copied().filter(|&i| self.world.accepted(i)).collect();
        for id in ids {
            let p = if self.cohort[id as usize] == Cohort::Honest { self.cfg.honest.self_id } else { 1.0 };
            if self.stream(CH_SELFID, u64::from(id)).chance(p) {
                let r = self.world.create_self_id(id);
                self.note(id, r);
            }
        }
    }

    fn answer_valences(&mut self) {
        let list = std::mem::take(&mut self.answers);
        for v in list {
            let (open, owner, answerer, matched) = self.world.valence_info(v);
            if !open || matched {
                continue;
            }
            if !self.world.accepted(answerer) || !self.world.accepted(owner) || self.world.open_valence_of(answerer, owner).is_some() {
                self.answers.push(v);
                continue;
            }
            let yes = match self.decided.get(&v) {
                Some(&y) => y,
                None => {
                    let y = if self.cohort[answerer as usize] == Cohort::Attacker {
                        true
                    } else {
                        let g = self.world.graph();
                        let near = g.out(answerer).iter().any(|&x| x == owner || g.has_edge(x, owner));
                        let h = &self.cfg.honest;
                        let met = h.met_in_person > 0.0 && self.kind[owner as usize] != Kind::Fake && Rng::keyed(self.seed, CH_MET, u64::from(v), 0).chance(h.met_in_person);
                        let mut rng = Rng::keyed(self.seed, CH_ANSWER, u64::from(v), 0);
                        let mut yes = rng.chance(if near || met { h.accept_near } else { h.accept_far });
                        if yes && !met && h.vetting > 0.0 {
                            let mut careful = Rng::keyed(self.seed, CH_VET, u64::from(v), 0);
                            let d = &self.cfg.detection;
                            let quality = if false_identity(self.kind[owner as usize]) { h.vetting_sensitivity.unwrap_or(d.sensitivity) } else { h.vetting_false_positive.unwrap_or(d.false_positive) };
                            if careful.chance(h.vetting) && careful.chance(quality) {
                                yes = false;
                            }
                        }
                        yes
                    };
                    self.decided.insert(v, y);
                    y
                }
            };
            if !yes {
                continue;
            }
            match self.world.eligible_emission(answerer) {
                Some(right) => {
                    if !self.open_valence(answerer, owner, right) {
                        self.answers.push(v);
                    }
                }
                None => self.answers.push(v),
            }
        }
    }

    fn honest_spend(&mut self) {
        let ids: Vec<Id> = self.honest.iter().copied().filter(|&i| self.world.accepted(i)).collect();
        for id in ids {
            let mut rng = self.stream(CH_SPEND, u64::from(id));
            let rights = self.world.eligible_emissions(id, self.cfg.world.spend_hours);
            for right in rights {
                if rng.chance(self.cfg.honest.invite) {
                    let dual = self.cfg.honest.double_life > 0.0 && rng.chance(self.cfg.honest.double_life);
                    self.sequence += 1;
                    let owner = if dual {
                        let honest = self.honest.clone();
                        self.pick_where(&mut rng, &honest, |o| o != id && self.world.accepted(o) && self.kind[o as usize] != Kind::Double)
                    } else {
                        None
                    };
                    self.invite(id, right, Cohort::Honest, if dual { Kind::Double } else { Kind::Genuine }, owner);
                    if self.censored.is_some() {
                        return;
                    }
                    continue;
                }
                if rng.chance(self.cfg.honest.befriend) {
                    let g = self.world.graph();
                    let mut candidates: Vec<Id> = Vec::new();
                    for &friend in g.out(id) {
                        for &other in g.out(friend) {
                            if other != id && self.world.accepted(other) && !self.linked(id, other) {
                                candidates.push(other);
                            }
                        }
                    }
                    candidates.sort_unstable();
                    candidates.dedup();
                    if let Some(&c) = rng.pick(&candidates) {
                        self.open_valence(id, c, right);
                    }
                }
            }
            // Keep a reserve of mature rights; convert the rest to Collector money.
            let unspent = self.world.eligible_emissions(id, self.cfg.world.spend_hours);
            let keep = self.cfg.honest.keep_rights;
            if unspent.len() > keep {
                for &a in &unspent[..unspent.len() - keep] {
                    let r = self.world.convert_to_collector(id, a);
                    self.note(id, r);
                }
            }
        }
    }

    fn attackers_act(&mut self) {
        let d = self.world.required_guarantors();
        let levels: Option<Vec<u8>> = if self.cfg.strategy == Strategy::SupportedFirst && !self.attackers.is_empty() {
            let w = &self.world;
            let n = w.len();
            let nonaccepted: Vec<bool> = (0..n as Id).map(|i| !w.accepted(i)).collect();
            Some(layered_support(w.graph(), w.council(), d as u32, (self.cfg.world.max_nodes.unwrap_or(7) - 2) as u8, &nonaccepted))
        } else {
            None
        };
        let ids: Vec<Id> = self.attackers.iter().copied().filter(|&i| self.world.accepted(i)).collect();
        let attackers_all = self.attackers.clone();
        let honest_all = self.honest.clone();
        for id in ids {
            let mut rng = self.stream(CH_ATTACK, u64::from(id));
            let rights = self.world.eligible_emissions(id, self.cfg.world.spend_hours);
            for right in rights {
                self.sequence += 1;
                if self.invite(id, right, Cohort::Attacker, Kind::Fake, None) {
                    continue;
                }
                if self.censored.is_some() {
                    return;
                }
                if let Some(levels) = &levels {
                    let pick = self.pick_where(&mut rng, &attackers_all, |o| o != id && self.world.accepted(o) && levels.get(o as usize).copied().unwrap_or(NO_LEVEL) != NO_LEVEL && !self.linked(id, o));
                    if let Some(o) = pick {
                        if self.open_valence(id, o, right) {
                            continue;
                        }
                    }
                }
                if self.cfg.strategy != Strategy::Cone {
                    let honest_partners: Vec<Id> = self.world.mutual_partners(id).into_iter().filter(|&o| self.cohort[o as usize] == Cohort::Honest).collect();
                    if honest_partners.len() < d {
                        let mut near: Vec<Id> = honest_partners.iter().flat_map(|&p| self.world.mutual_partners(p)).filter(|&o| o != id && self.cohort[o as usize] == Cohort::Honest && !self.linked(id, o)).collect();
                        near.sort_unstable();
                        near.dedup();
                        let target = if near.is_empty() { self.pick_where(&mut rng, &honest_all, |o| self.world.accepted(o) && !self.linked(id, o)) } else { rng.pick(&near).copied() };
                        if let Some(t) = target {
                            if self.open_valence(id, t, right) {
                                continue;
                            }
                        }
                    }
                }
                let cone = self.pick_where(&mut rng, &attackers_all, |o| o != id && self.world.accepted(o) && !self.linked(id, o) && self.world.mutual_count(o) < d);
                if let Some(o) = cone {
                    if self.open_valence(id, o, right) {
                        continue;
                    }
                }
                if let Some(h) = self.pick_where(&mut rng, &honest_all, |o| self.world.accepted(o) && !self.linked(id, o)) {
                    self.open_valence(id, h, right);
                }
            }
        }
    }

    // ---- detection -------------------------------------------------------------------------------------------------

    fn leave(&mut self, actor: Id, partner: Id) -> bool {
        let r = if let Some(v) = self.world.open_valence_of(actor, partner).filter(|&v| self.world.valence_info(v).3) {
            self.world.withdraw_valence(actor, v)
        } else if let Some(inv) = self.world.active_link_with(actor, partner) {
            self.world.end_invitation_link(actor, inv)
        } else {
            return false;
        };
        match self.note(actor, r) {
            Some(()) => {
                self.det.links_left += 1;
                true
            }
            None => false,
        }
    }

    fn subtree(&self, id: Id) -> HashSet<Id> {
        let mut seen: HashSet<Id> = HashSet::from([id]);
        let mut queue = vec![id];
        while let Some(u) = queue.pop() {
            for &c in &self.children[u as usize] {
                if seen.insert(c) {
                    queue.push(c);
                }
            }
        }
        seen
    }

    fn invitees(&self, id: Id) -> Vec<Id> {
        let mut v: Vec<Id> = self.children[id as usize].iter().copied().filter(|&c| self.world.accepted(c)).collect();
        v.sort_unstable();
        v
    }

    /// Public record only: invitees whose mutual partners lie inside the examined account's own invitation subtree.
    fn pattern(&self, id: Id) -> bool {
        let kids = self.invitees(id);
        if kids.len() < self.cfg.detection.pattern_min_invitees {
            return false;
        }
        let inside = self.subtree(id);
        let (mut total, mut closed) = (0usize, 0usize);
        for k in kids {
            for p in self.world.mutual_partners(k) {
                total += 1;
                if inside.contains(&p) {
                    closed += 1;
                }
            }
        }
        total > 0 && closed as f64 / total as f64 >= self.cfg.detection.pattern_closure
    }

    fn open_case(&mut self, sponsor: Id, target: Id, follow_up: bool) -> bool {
        let Ok(case) = self.world.begin_case(&[sponsor, target]) else { return false };
        self.case_sequence += 1;
        self.open_cases.push(CaseRec { case, target, challenger: sponsor, opened_at: self.world.now(), id: self.case_sequence });
        self.det.cases_opened += 1;
        if follow_up {
            self.det.follow_up_cases += 1;
        }
        true
    }

    /// D46 relay: the highest-XP accepted account within two mutual hops whose XP exceeds the target's; honest sponsors are
    /// willing with the declared probability.
    fn escalate(&mut self, observer: Id, target: Id, rng: &mut Rng) -> bool {
        let mut near: HashSet<Id> = HashSet::from([observer]);
        for p in self.world.mutual_partners(observer) {
            near.insert(p);
            near.extend(self.world.mutual_partners(p));
        }
        near.remove(&target);
        let floor = self.world.xp(target);
        let sponsor = near.into_iter().filter(|&i| self.world.accepted(i) && self.world.xp(i) > floor).max_by(|&a, &b| self.world.xp(a).cmp(&self.world.xp(b)).then(b.cmp(&a)));
        let Some(sponsor) = sponsor else { return false };
        self.det.escalations += 1;
        if self.cohort[sponsor as usize] != Cohort::Honest || !rng.chance(self.cfg.detection.sponsor_willingness) {
            self.det.sponsor_refusals += 1;
            return false;
        }
        self.open_case(sponsor, target, false)
    }

    fn detect(&mut self) {
        let det = self.cfg.detection.clone();
        let mut targeted: HashSet<Id> = self.open_cases.iter().map(|c| c.target).collect();
        // Freeze veto: honest current guarantors of the creator review invitations created today.
        let pending = std::mem::take(&mut self.pending);
        for p in pending {
            let (created_at, creator, status) = {
                let i = self.world.invitation(p.inv);
                (i.created_at, i.creator, i.status)
            };
            if status == crate::world::InvStatus::Pending && created_at == self.world.now() {
                let mut vetoed = false;
                let reviewers: Vec<Id> = self.world.graph().inn(creator).iter().copied().filter(|&g| self.cohort[g as usize] == Cohort::Honest && self.world.accepted(g)).collect();
                for reviewer in reviewers {
                    let mut rng = Rng::keyed(self.seed, CH_REVIEW, (u64::from(p.inv) << 32) | u64::from(reviewer), 0);
                    let target_label = false_identity(p.kind);
                    let look = rng.chance(if target_label { det.sensitivity } else { det.false_positive });
                    if !rng.chance(det.review) || !look {
                        // The look draw happens only when the review draw succeeds in the retired model; order is irrelevant statistically.
                        continue;
                    }
                    if self.world.cancel_invitation(reviewer, p.inv).is_ok() {
                        if target_label { self.det.vetoed_false += 1 } else { self.det.vetoed_genuine += 1 }
                        vetoed = true;
                        if det.leave {
                            self.leave(reviewer, creator);
                        }
                        break;
                    }
                }
                if vetoed {
                    continue;
                }
            }
            self.pending.push(p);
        }
        // Resolve due identity cases: verdict correct with the declared accuracy; a false verdict invalidates and voids the chain.
        let cases = std::mem::take(&mut self.open_cases);
        for rec in cases {
            if self.world.now() - rec.opened_at < det.window_days * DAY {
                self.open_cases.push(rec);
                continue;
            }
            let correct = Rng::keyed(self.seed, CH_VERDICT, rec.id, 0).chance(det.accuracy);
            let label = false_identity(self.kind[rec.target as usize]);
            let verdict_false = if label { correct } else { !correct };
            self.world.end_case(rec.case);
            targeted.remove(&rec.target);
            if !verdict_false || !self.world.accepted(rec.target) {
                self.det.cases_dismissed += 1;
                continue;
            }
            self.world.invalidate_identity(rec.target);
            self.world.void_chain(rec.target);
            if label { self.det.false_invalidated += 1 } else { self.det.genuine_invalidated += 1 }
            // D127: a true duplicate verdict also reaches the holder of the second account.
            if let Some(&holder) = self.owner_of.get(&rec.target) {
                if label && self.world.accepted(holder) {
                    self.world.invalidate_identity(holder);
                    self.world.void_chain(holder);
                    self.det.holders_invalidated += 1;
                }
            }
            let Some(inviter) = self.world.inviter(rec.target).filter(|&i| self.world.accepted(i)) else { continue };
            if self.cohort[inviter as usize] == Cohort::Honest && (det.acquit_met || self.cfg.honest.double_life > 0.0) {
                if det.acquit_met {
                    self.det.honest_inviter_acquitted += 1;
                    continue;
                }
                self.det.honest_inviter_cascades += 1;
            }
            if det.leave {
                for partner in self.world.mutual_partners(inviter) {
                    if self.cohort[partner as usize] == Cohort::Honest {
                        self.leave(partner, inviter);
                    }
                }
            }
            if det.follow_up && self.world.accepted(rec.challenger) {
                let mut rng = Rng::keyed(self.seed, CH_FOLLOW, rec.id, 0);
                for sibling in self.invitees(inviter) {
                    if !targeted.contains(&sibling) && self.look(&mut rng, sibling) && self.open_case(rec.challenger, sibling, true) {
                        targeted.insert(sibling);
                    }
                }
            }
        }
        // Partner inspection: a suspicious look opens one identity case per target (D77 hold on both parties).
        let honest_ids: Vec<Id> = self.honest.iter().copied().filter(|&i| self.world.accepted(i)).collect();
        for &id in &honest_ids {
            let mut rng = self.stream(CH_INSPECT, u64::from(id));
            for partner in self.world.mutual_partners(id) {
                if !rng.chance(det.inspect) || !self.look(&mut rng, partner) || targeted.contains(&partner) {
                    continue;
                }
                if self.open_case(id, partner, false) {
                    targeted.insert(partner);
                }
            }
        }
        // D68 public evidence: anyone may examine a random account's public pattern, then escalate suspicious invitees.
        if det.public_look > 0.0 {
            let everyone: Vec<Id> = self.honest.iter().chain(self.attackers.iter()).copied().filter(|&i| self.world.accepted(i)).collect();
            for &id in &honest_ids {
                let mut rng = self.stream(CH_PUBLIC, u64::from(id));
                if !self.world.accepted(id) || !rng.chance(det.public_look) {
                    continue;
                }
                let Some(&examined) = rng.pick(&everyone) else { continue };
                if examined == id {
                    continue;
                }
                if !targeted.contains(&examined) && self.look(&mut rng, examined) && self.escalate(id, examined, &mut rng) {
                    targeted.insert(examined);
                }
                if !self.pattern(examined) {
                    continue;
                }
                self.det.patterns_found += 1;
                let mut kids = self.invitees(examined);
                rng.shuffle(&mut kids);
                for child in kids.into_iter().take(3) {
                    if targeted.contains(&child) || !self.look(&mut rng, child) {
                        continue;
                    }
                    if self.escalate(id, child, &mut rng) {
                        targeted.insert(child);
                    }
                }
            }
        }
    }

    // ---- sampling and output ---------------------------------------------------------------------------------------

    fn sample(&mut self) {
        let w = &self.world;
        let accepted: Vec<Id> = (0..w.len() as Id).filter(|&i| w.accepted(i)).collect();
        let attackers_accepted = accepted.iter().filter(|&&i| self.cohort[i as usize] == Cohort::Attacker).count();
        let mut dirty = 0i64;
        let mut attack_edges = 0usize;
        for &a in &self.attackers {
            dirty += i64::from(w.liquid(a)) + w.unspent_rights(a) as i64;
            for &o in w.graph().out(a) {
                if self.cohort[o as usize] == Cohort::Honest && w.graph().has_edge(o, a) {
                    attack_edges += 1;
                }
            }
        }
        let council_attackers = w.council().iter().filter(|&&m| self.cohort[m as usize] == Cohort::Attacker).count();
        self.history.push(Row {
            day: self.day,
            subjects: accepted.len(),
            honest: accepted.len() - attackers_accepted,
            attackers: attackers_accepted,
            supply: w.supply(),
            dirty,
            active: w.active_count(),
            d: w.required_guarantors(),
            bootstrap: w.bootstrap(),
            council: w.council().len(),
            council_attackers,
            attack_edges,
        });
    }

    pub fn false_status_count(&self) -> usize {
        (0..self.world.len() as Id).filter(|&i| !self.world.accepted(i)).count()
    }

    /// Final result as JSON text (hand-written, std only).
    pub fn to_json(&self) -> String {
        let mut s = String::new();
        let c = &self.cfg;
        let _ = write!(s, "{{\"engine\":\"{ENGINE}\",\"randomness\":\"{}\",\"seed\":{:?},\"days\":{},\"completedDays\":{},\"censored\":{},", crate::rng::RANDOMNESS_POLICY, c.seed, c.days, self.day, self.censored.map_or("null".to_string(), |x| format!("{x:?}")));
        let _ = write!(s, "\"attackers\":{},\"attackStartDay\":{},\"maxPathNodes\":{},\"layered\":{},\"strategy\":\"{:?}\",", c.attackers, c.attack_start_day, c.world.max_nodes.map_or("null".to_string(), |x| x.to_string()), c.world.layered, c.strategy);
        let d = &self.det;
        let _ = write!(s, "\"detection\":{{\"casesOpened\":{},\"falseInvalidated\":{},\"genuineInvalidated\":{},\"vetoedFalse\":{},\"vetoedGenuine\":{},\"casesDismissed\":{},\"linksLeft\":{},\"patternsFound\":{},\"escalations\":{},\"sponsorRefusals\":{},\"followUpCases\":{},\"honestInviterCascades\":{},\"honestInviterAcquitted\":{},\"holdersInvalidated\":{}}},",
            d.cases_opened, d.false_invalidated, d.genuine_invalidated, d.vetoed_false, d.vetoed_genuine, d.cases_dismissed, d.links_left, d.patterns_found, d.escalations, d.sponsor_refusals, d.follow_up_cases, d.honest_inviter_cascades, d.honest_inviter_acquitted, d.holders_invalidated);
        let _ = write!(s, "\"counts\":{{\"invitationsHonest\":{},\"invitationsAttackers\":{},\"admittedHonest\":{},\"admittedAttackers\":{},\"valencesHonest\":{},\"valencesAttackers\":{},\"pairs\":{},\"pathSearchesExhausted\":{}}},",
            self.invitations[0], self.invitations[1], self.admitted[0], self.admitted[1], self.valences_opened[0], self.valences_opened[1], self.pairs, self.world.path_searches_exhausted());
        s.push_str("\"history\":[");
        for (i, r) in self.history.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            let f = |x: Option<f64>| x.map_or("null".to_string(), |v| format!("{v:.6}"));
            let _ = write!(s, "{{\"day\":{},\"subjects\":{},\"honest\":{},\"attackers\":{},\"attackerShare\":{},\"supply\":{},\"dirty\":{},\"dirtyShare\":{},\"active\":{},\"D\":{},\"bootstrap\":{},\"councilSize\":{},\"councilAttackers\":{},\"attackEdges\":{}}}",
                r.day, r.subjects, r.honest, r.attackers, f(r.attacker_share()), r.supply, r.dirty, f(r.dirty_share()), r.active, r.d, r.bootstrap, r.council, r.council_attackers, r.attack_edges);
        }
        s.push_str("],\"refusals\":{");
        for (k, name) in ["honest", "attackers"].iter().enumerate() {
            if k > 0 {
                s.push(',');
            }
            let mut items: Vec<_> = self.refusals[k].iter().collect();
            items.sort();
            let _ = write!(s, "\"{name}\":{{");
            for (j, (msg, n)) in items.iter().enumerate() {
                if j > 0 {
                    s.push(',');
                }
                let _ = write!(s, "{:?}:{}", msg, n);
            }
            s.push('}');
        }
        s.push_str("}}");
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn small(seed: &str, attackers: usize, layered: bool) -> RunConfig {
        let mut c = RunConfig { seed: seed.into(), honest_genesis: 30, attack_start_day: 60, days: 100, attackers, max_subjects: 3000, ..RunConfig::default() };
        c.world.layered = layered;
        c
    }

    #[test]
    fn honest_growth_is_deterministic_audited_and_clones_replay() {
        let mut a = Sim::new(small("det", 0, false));
        a.run();
        a.world.audit().unwrap();
        let mut b = Sim::new(small("det", 0, false));
        b.run();
        assert_eq!(a.to_json(), b.to_json());
        assert!(a.history.last().unwrap().honest > 30, "the honest network must grow");
        // A mid-run clone continues exactly like the original.
        let mut c = Sim::new(small("det", 0, false));
        for _ in 0..40 {
            c.step_day();
        }
        let mut d = c.clone();
        c.run();
        d.run();
        assert_eq!(c.to_json(), d.to_json());
        assert_eq!(c.to_json(), a.to_json());
    }

    #[test]
    fn attack_runs_keep_the_books_and_layered_support_constrains_the_cone() {
        for layered in [false, true] {
            let mut s = Sim::new(small("atk", 5, layered));
            s.run();
            s.world.audit().unwrap();
            let last = s.history.last().unwrap();
            assert!(last.attackers <= last.subjects);
            assert_eq!(last.council_attackers, 0, "fakes do not reach the Council");
        }
    }

    #[test]
    fn levers_are_opt_in_and_the_baseline_is_unchanged_by_them() {
        let base = small("lev", 3, false);
        let mut a = Sim::new(base.clone());
        a.run();
        let mut zero = base.clone();
        zero.honest.vetting = 0.0;
        zero.honest.met_in_person = 0.0;
        zero.honest.double_life = 0.0;
        let mut b = Sim::new(zero);
        b.run();
        assert_eq!(a.to_json(), b.to_json());
        let mut cautious = base.clone();
        cautious.honest.vetting = 1.0;
        let mut c = Sim::new(cautious);
        c.run();
        c.world.audit().unwrap();
        let mut dl = base;
        dl.honest.double_life = 0.2;
        dl.honest.met_in_person = 0.3;
        dl.detection.acquit_met = true;
        let mut d = Sim::new(dl);
        d.run();
        d.world.audit().unwrap();
    }
}
