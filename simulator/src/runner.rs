//! The takeover runner: an honest valence-mode network grows by ordinary rules; attacker operators enter by ordinary
//! invitation and build a cone of fakes; detection (freeze veto, partner inspection, leaving, public evidence, escalation,
//! follow-up, one-step verdicts with D77 holds) always runs. Detection is not optional: an attack without it is self-evident.
//!
//! Evaluator labels (`Cohort`, `Kind`) are read only by the observation functions that model noisy looks and verdict accuracy;
//! the protocol world never sees them. Behavior rates are scenario assumptions, not calibrated human behavior.
use crate::json;
use crate::paths::{layered_support, NO_LEVEL};
use crate::rng::{hash_seed, Rng};
use crate::world::{Config as WorldConfig, Id, Reject, World, DAY};
use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;

pub const ENGINE: &str = "facety-sim/runner-v1";
/// Version of the saved result layout.
pub const SCHEMA: &str = "facety-sim/result-v2";

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
const CH_DEFENSE: u64 = 14;
const CH_TYPE: u64 = 15;

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
    /// Share of honest accounts that accept stranger requests carelessly (at `careless_accept_far`, never vetting) instead of at `accept_far`.
    pub careless_share: f64,
    pub careless_accept_far: f64,
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
    /// New identity cases (inspection, public evidence, follow-up) open only once this many accounts are active; the freeze veto
    /// and the resolution of open cases are unaffected. D91 disables disputes below 100 active accounts: set 100 to model it.
    pub disputes_from_active: usize,
    /// A real person can prove reality cheaply (a public persona, a meeting in a cafe, a gathering of many witnesses): the chance that an
    /// accused genuine account does, ending the case without invalidation after `defense_days`. Fakes and second accounts cannot.
    pub defense_success: f64,
    pub defense_days: i64,
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
    /// Patient operators: for this many days after entry they only build honest links and reputation, and invite no fakes.
    pub attacker_patience_days: i64,
    /// Stop on the first day the honest accepted population reaches this size (0 = never): a snapshot point.
    pub stop_at_honest: usize,
}

fn prob(name: &str, x: f64) -> Result<(), String> {
    if x.is_finite() && (0.0..=1.0).contains(&x) {
        Ok(())
    } else {
        Err(format!("{name} must be a finite probability in [0, 1], got {x}"))
    }
}

fn at_least(name: &str, x: i64, min: i64) -> Result<(), String> {
    if x >= min {
        Ok(())
    } else {
        Err(format!("{name} must be at least {min}, got {x}"))
    }
}

impl RunConfig {
    /// Consistent validation of every parameter; an invalid configuration is refused, never silently run.
    pub fn validate(&self) -> Result<(), String> {
        if self.seed.is_empty() {
            return Err("seed must not be empty".into());
        }
        at_least("honest_genesis", self.honest_genesis as i64, 6)?;
        at_least("days", self.days, 1)?;
        at_least("attack_start_day", self.attack_start_day, 0)?;
        at_least("detection_start_day", self.detection_start_day, 0)?;
        at_least("attacker_patience_days", self.attacker_patience_days, 0)?;
        if self.max_subjects < self.honest_genesis {
            return Err(format!("max_subjects ({}) must be at least honest_genesis ({})", self.max_subjects, self.honest_genesis));
        }
        if self.genesis_chords > 64 {
            return Err("genesis_chords above 64 is not a sensible genesis".into());
        }
        let w = &self.world;
        at_least("world.k", i64::from(w.k), 1)?;
        at_least("world.freeze_hours", w.freeze_hours, 0)?;
        at_least("world.spend_hours", w.spend_hours, 0)?;
        at_least("world.search_budget", w.search_budget as i64, 1)?;
        if let Some(seats) = w.council_seats {
            if !(3..=100_001).contains(&seats) {
                return Err(format!("world.council_seats must be between 3 and 100001, got {seats}"));
            }
        }
        if let Some(per_d) = w.council_seats_per_d {
            if !(1..=100).contains(&per_d) || w.council_seats.is_some() {
                return Err(format!("world.council_seats_per_d must be between 1 and 100 and cannot be combined with council_seats, got {per_d}"));
            }
        }
        if let Some(cap) = w.max_difficulty {
            if !(1..=8).contains(&cap) {
                return Err(format!("world.max_difficulty must be between 1 and 8, got {cap}"));
            }
        }
        if let Some(n) = w.max_nodes {
            if !(2..=32).contains(&n) {
                return Err(format!("world.max_nodes must be between 2 and 32, got {n}"));
            }
        }
        if w.layered && w.max_nodes.is_none() {
            return Err("layered support needs a path bound (world.max_nodes)".into());
        }
        let h = &self.honest;
        for (name, x) in [
            ("honest.self_id", h.self_id),
            ("honest.invite", h.invite),
            ("honest.befriend", h.befriend),
            ("honest.accept_near", h.accept_near),
            ("honest.accept_far", h.accept_far),
            ("honest.vetting", h.vetting),
            ("honest.met_in_person", h.met_in_person),
            ("honest.double_life", h.double_life),
            ("honest.careless_share", h.careless_share),
            ("honest.careless_accept_far", h.careless_accept_far),
        ] {
            prob(name, x)?;
        }
        for (name, x) in [("honest.vetting_sensitivity", h.vetting_sensitivity), ("honest.vetting_false_positive", h.vetting_false_positive)] {
            if let Some(x) = x {
                prob(name, x)?;
            }
        }
        let d = &self.detection;
        for (name, x) in [
            ("detection.review", d.review),
            ("detection.inspect", d.inspect),
            ("detection.sensitivity", d.sensitivity),
            ("detection.false_positive", d.false_positive),
            ("detection.accuracy", d.accuracy),
            ("detection.public_look", d.public_look),
            ("detection.pattern_closure", d.pattern_closure),
            ("detection.sponsor_willingness", d.sponsor_willingness),
            ("detection.defense_success", d.defense_success),
        ] {
            prob(name, x)?;
        }
        // The dispute clock (D69): a case lasts at least seven days after the last participant joins, so proving reality cannot be quicker either.
        at_least("detection.window_days", d.window_days, 7)?;
        at_least("detection.defense_days", d.defense_days, 7)?;
        at_least("detection.pattern_min_invitees", d.pattern_min_invitees as i64, 1)?;
        Ok(())
    }

    /// The full effective configuration as a JSON object.
    pub fn to_json(&self) -> String {
        let w = &self.world;
        let h = &self.honest;
        let d = &self.detection;
        format!(
            "{{\"seed\":{},\"honestGenesis\":{},\"genesisChords\":{},\"attackStartDay\":{},\"days\":{},\"attackers\":{},\"maxSubjects\":{},\"strategy\":{},\"detectionStartDay\":{},\"attackerPatienceDays\":{},\"stopAtHonest\":{},\
\"world\":{{\"k\":{},\"freezeHours\":{},\"spendHours\":{},\"maxNodes\":{},\"layered\":{},\"searchBudget\":{},\"excludeDisputed\":{},\"councilSeats\":{},\"maxDifficulty\":{},\"councilSeatsPerD\":{},\"xpPriority\":{}}},\
\"honest\":{{\"selfId\":{},\"invite\":{},\"befriend\":{},\"acceptNear\":{},\"acceptFar\":{},\"keepRights\":{},\"vetting\":{},\"vettingSensitivity\":{},\"vettingFalsePositive\":{},\"metInPerson\":{},\"doubleLife\":{},\"carelessShare\":{},\"carelessAcceptFar\":{}}},\
\"detection\":{{\"review\":{},\"inspect\":{},\"sensitivity\":{},\"falsePositive\":{},\"windowDays\":{},\"accuracy\":{},\"leave\":{},\"publicLook\":{},\"patternMinInvitees\":{},\"patternClosure\":{},\"sponsorWillingness\":{},\"followUp\":{},\"acquitMet\":{},\"disputesFromActive\":{},\"defenseSuccess\":{},\"defenseDays\":{}}}}}",
            json::string(&self.seed), self.honest_genesis, self.genesis_chords, self.attack_start_day, self.days, self.attackers, self.max_subjects, json::string(&format!("{:?}", self.strategy)), self.detection_start_day, self.attacker_patience_days, self.stop_at_honest,
            w.k, w.freeze_hours, w.spend_hours, w.max_nodes.map_or("null".to_string(), |n| n.to_string()), w.layered, w.search_budget, w.exclude_disputed, w.council_seats.map_or("null".to_string(), |n| n.to_string()), w.max_difficulty.map_or("null".to_string(), |n| n.to_string()), w.council_seats_per_d.map_or("null".to_string(), |n| n.to_string()), w.xp_priority.map_or("null".to_string(), |b| b.to_string()),
            json::number(h.self_id), json::number(h.invite), json::number(h.befriend), json::number(h.accept_near), json::number(h.accept_far), h.keep_rights, json::number(h.vetting), json::option_number(h.vetting_sensitivity), json::option_number(h.vetting_false_positive), json::number(h.met_in_person), json::number(h.double_life), json::number(h.careless_share), json::number(h.careless_accept_far),
            json::number(d.review), json::number(d.inspect), json::number(d.sensitivity), json::number(d.false_positive), d.window_days, json::number(d.accuracy), d.leave, json::number(d.public_look), d.pattern_min_invitees, json::number(d.pattern_closure), json::number(d.sponsor_willingness), d.follow_up, d.acquit_met, d.disputes_from_active, json::number(d.defense_success), d.defense_days
        )
    }
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
            // Baseline (D124 adopted): intermediaries of counted paths must be layered-supported.
            world: WorldConfig { layered: true, ..WorldConfig::default() },
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
                careless_share: 0.2,
                careless_accept_far: 0.5,
            },
            detection: Detection {
                review: 0.5,
                inspect: 0.03,
                sensitivity: 0.8,
                false_positive: 0.003,
                window_days: 7,
                accuracy: 0.9,
                leave: true,
                public_look: 0.02,
                pattern_min_invitees: 5,
                pattern_closure: 0.8,
                sponsor_willingness: 0.5,
                follow_up: true,
                acquit_met: false,
                disputes_from_active: 0,
                defense_success: 0.95,
                defense_days: 7,
            },
            detection_start_day: 0,
            attacker_patience_days: 0,
            stop_at_honest: 0,
        }
    }
}

/// Why a formal case was not admitted.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaseRefusal {
    Disabled,
    SameAccount,
    NotAccepted,
    ChallengerXpNotAbove,
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
    defended: bool,
    challenger_xp: i32,
    target_xp: i32,
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
    pub defended: u64,
    /// Formal cases refused by the common procedure (XP gate, disabled disputes, invalid parties); no state changed for them.
    pub cases_refused: u64,
    pub cases_refused_xp: u64,
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
    pub council: usize,
    pub council_attackers: usize,
    pub attack_edges: usize,
}

impl Row {
    pub fn attacker_share(&self) -> Option<f64> {
        if self.subjects == 0 {
            None
        } else {
            Some(self.attackers as f64 / self.subjects as f64)
        }
    }
    pub fn dirty_share(&self) -> Option<f64> {
        if self.supply > 0 {
            Some(self.dirty as f64 / self.supply as f64)
        } else {
            None
        }
    }
}

#[derive(Clone)]
pub struct Sim {
    pub cfg: RunConfig,
    initial_cfg: String,
    phases: Vec<(String, i64, String)>,
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
    /// Build a simulation; an invalid configuration is refused with a diagnostic.
    pub fn try_new(cfg: RunConfig) -> Result<Sim, String> {
        cfg.validate()?;
        Ok(Sim::build(cfg))
    }

    /// Build a simulation from a configuration that must be valid (panics with the diagnostic otherwise).
    pub fn new(cfg: RunConfig) -> Sim {
        Sim::try_new(cfg).unwrap_or_else(|e| panic!("invalid configuration: {e}"))
    }

    /// Change the configuration at the current day and record the change as a named phase of the experiment (the growing phase and the
    /// attack phase keep distinct, saved configurations).
    pub fn begin_phase(&mut self, name: &str, change: impl FnOnce(&mut RunConfig)) -> Result<(), String> {
        let mut next = self.cfg.clone();
        change(&mut next);
        next.validate()?;
        self.cfg = next;
        self.censored = None;
        self.phases.push((name.to_string(), self.day, self.cfg.to_json()));
        Ok(())
    }

    fn build(cfg: RunConfig) -> Sim {
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
            initial_cfg: cfg.to_json(),
            phases: Vec::new(),
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
                        let met = h.met_in_person > 0.0
                            && self.kind[owner as usize] != Kind::Fake
                            && Rng::keyed(self.seed, CH_MET, u64::from(v), 0).chance(h.met_in_person);
                        // Some honest accounts are careless with strangers: they accept at a higher rate and never take a second look.
                        let careless = h.careless_share > 0.0 && Rng::keyed(self.seed, CH_TYPE, u64::from(answerer), 0).chance(h.careless_share);
                        let far = if careless { h.careless_accept_far } else { h.accept_far };
                        let mut rng = Rng::keyed(self.seed, CH_ANSWER, u64::from(v), 0);
                        let mut yes = rng.chance(if near || met { h.accept_near } else { far });
                        if yes && !met && !careless && h.vetting > 0.0 {
                            let mut careful = Rng::keyed(self.seed, CH_VET, u64::from(v), 0);
                            let d = &self.cfg.detection;
                            let quality = if false_identity(self.kind[owner as usize]) {
                                h.vetting_sensitivity.unwrap_or(d.sensitivity)
                            } else {
                                h.vetting_false_positive.unwrap_or(d.false_positive)
                            };
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
        // Patient operators only build honest links and reputation until the patience ends.
        let waiting = self.day < self.cfg.attack_start_day + self.cfg.attacker_patience_days;
        for id in ids {
            let mut rng = self.stream(CH_ATTACK, u64::from(id));
            let rights = self.world.eligible_emissions(id, self.cfg.world.spend_hours);
            for right in rights {
                self.sequence += 1;
                if !waiting && self.invite(id, right, Cohort::Attacker, Kind::Fake, None) {
                    continue;
                }
                if self.censored.is_some() {
                    return;
                }
                if let Some(levels) = &levels {
                    let pick = self.pick_where(&mut rng, &attackers_all, |o| {
                        o != id && self.world.accepted(o) && levels.get(o as usize).copied().unwrap_or(NO_LEVEL) != NO_LEVEL && !self.linked(id, o)
                    });
                    if let Some(o) = pick {
                        if self.open_valence(id, o, right) {
                            continue;
                        }
                    }
                }
                if self.cfg.strategy != Strategy::Cone || waiting {
                    let honest_partners: Vec<Id> = self.world.mutual_partners(id).into_iter().filter(|&o| self.cohort[o as usize] == Cohort::Honest).collect();
                    if honest_partners.len() < d {
                        let mut near: Vec<Id> = honest_partners
                            .iter()
                            .flat_map(|&p| self.world.mutual_partners(p))
                            .filter(|&o| o != id && self.cohort[o as usize] == Cohort::Honest && !self.linked(id, o))
                            .collect();
                        near.sort_unstable();
                        near.dedup();
                        let target = if near.is_empty() {
                            self.pick_where(&mut rng, &honest_all, |o| self.world.accepted(o) && !self.linked(id, o))
                        } else {
                            rng.pick(&near).copied()
                        };
                        if let Some(t) = target {
                            if self.open_valence(id, t, right) {
                                continue;
                            }
                        }
                    }
                }
                let cone =
                    self.pick_where(&mut rng, &attackers_all, |o| o != id && self.world.accepted(o) && !self.linked(id, o) && self.world.mutual_count(o) < d);
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

    /// The common procedure for a formal case (§25 ordinary direct challenge): the challenger must hold more XP than the owner of the
    /// challenged transaction (here: the challenged account), both parties must be accepted and distinct, and disputes must be enabled
    /// at the current network size. Suspicion, finding a sponsor and opening a case are separate steps; only this check admits a case.
    /// Model deviation: the identity-case abstraction has no stake or Chekharda ladder, and the challenged account stands for the transaction owner.
    pub fn case_gate(&self, challenger: Id, target: Id) -> Result<(), CaseRefusal> {
        if self.world.active_count() < self.cfg.detection.disputes_from_active {
            return Err(CaseRefusal::Disabled);
        }
        if challenger == target {
            return Err(CaseRefusal::SameAccount);
        }
        if !self.world.accepted(challenger) || !self.world.accepted(target) {
            return Err(CaseRefusal::NotAccepted);
        }
        if self.world.xp(challenger) <= self.world.xp(target) {
            return Err(CaseRefusal::ChallengerXpNotAbove);
        }
        Ok(())
    }

    /// Open a formal case through the common procedure; a refusal changes nothing (no hold, record or counter other than the refusal count).
    fn open_case(&mut self, challenger: Id, target: Id, follow_up: bool) -> bool {
        if let Err(reason) = self.case_gate(challenger, target) {
            self.det.cases_refused += 1;
            if reason == CaseRefusal::ChallengerXpNotAbove {
                self.det.cases_refused_xp += 1;
            }
            return false;
        }
        let Ok(case) = self.world.begin_case(&[challenger, target]) else {
            self.det.cases_refused += 1;
            return false;
        };
        self.case_sequence += 1;
        let can_defend = matches!(self.kind[target as usize], Kind::Genuine | Kind::Operator);
        let defended = can_defend && Rng::keyed(self.seed, CH_DEFENSE, self.case_sequence, 0).chance(self.cfg.detection.defense_success);
        self.open_cases.push(CaseRec {
            case,
            target,
            challenger,
            opened_at: self.world.now(),
            id: self.case_sequence,
            defended,
            challenger_xp: self.world.xp(challenger),
            target_xp: self.world.xp(target),
        });
        self.det.cases_opened += 1;
        if follow_up {
            self.det.follow_up_cases += 1;
        }
        true
    }

    /// An observer suspects `target`. If the observer qualifies as a challenger the case opens directly; otherwise the observer can only pass
    /// the information on (D46 relay) and a qualified, willing sponsor may open the case.
    fn submit_suspicion(&mut self, observer: Id, target: Id, rng: &mut Rng, follow_up: bool) -> bool {
        match self.case_gate(observer, target) {
            Ok(()) => self.open_case(observer, target, follow_up),
            Err(CaseRefusal::ChallengerXpNotAbove) => self.escalate(observer, target, rng),
            Err(_) => false,
        }
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
        let sponsor = near
            .into_iter()
            .filter(|&i| self.world.accepted(i) && self.world.xp(i) > floor)
            .max_by(|&a, &b| self.world.xp(a).cmp(&self.world.xp(b)).then(b.cmp(&a)));
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
                let reviewers: Vec<Id> =
                    self.world.graph().inn(creator).iter().copied().filter(|&g| self.cohort[g as usize] == Cohort::Honest && self.world.accepted(g)).collect();
                for reviewer in reviewers {
                    let mut rng = Rng::keyed(self.seed, CH_REVIEW, (u64::from(p.inv) << 32) | u64::from(reviewer), 0);
                    let target_label = false_identity(p.kind);
                    let look = rng.chance(if target_label { det.sensitivity } else { det.false_positive });
                    if !rng.chance(det.review) || !look {
                        // The look draw happens only when the review draw succeeds in the retired model; order is irrelevant statistically.
                        continue;
                    }
                    if self.world.cancel_invitation(reviewer, p.inv).is_ok() {
                        if target_label {
                            self.det.vetoed_false += 1
                        } else {
                            self.det.vetoed_genuine += 1
                        }
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
            let days = if rec.defended { det.defense_days } else { det.window_days };
            if self.world.now() - rec.opened_at < days * DAY {
                self.open_cases.push(rec);
                continue;
            }
            if rec.defended {
                // The accused proved reality in person or in public: the case ends, nothing is invalidated.
                self.world.end_case(rec.case);
                targeted.remove(&rec.target);
                self.det.defended += 1;
                self.det.cases_dismissed += 1;
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
            if label {
                self.det.false_invalidated += 1
            } else {
                self.det.genuine_invalidated += 1
            }
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
                    if !targeted.contains(&sibling) && self.look(&mut rng, sibling) && self.submit_suspicion(rec.challenger, sibling, &mut rng, true) {
                        targeted.insert(sibling);
                    }
                }
            }
        }
        if self.world.active_count() < det.disputes_from_active {
            return;
        }
        // Partner inspection: a suspicious look opens one identity case per target (D77 hold on both parties).
        let honest_ids: Vec<Id> = self.honest.iter().copied().filter(|&i| self.world.accepted(i)).collect();
        for &id in &honest_ids {
            let mut rng = self.stream(CH_INSPECT, u64::from(id));
            for partner in self.world.mutual_partners(id) {
                if !rng.chance(det.inspect) || !self.look(&mut rng, partner) || targeted.contains(&partner) {
                    continue;
                }
                if self.submit_suspicion(id, partner, &mut rng, false) {
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
            council: w.council().len(),
            council_attackers,
            attack_edges,
        });
    }

    /// Open cases as (challenger, target, challenger XP at opening, target XP at opening).
    pub fn open_case_records(&self) -> Vec<(Id, Id, i32, i32)> {
        self.open_cases.iter().map(|c| (c.challenger, c.target, c.challenger_xp, c.target_xp)).collect()
    }

    pub fn false_status_count(&self) -> usize {
        (0..self.world.len() as Id).filter(|&i| !self.world.accepted(i)).count()
    }

    /// A short stable digest of the experiment's effective configuration (seed, initial configuration and every later phase). The
    /// same seed with different settings never shares a digest, so saved results cannot collide silently.
    pub fn config_digest(&self) -> String {
        let mut text = self.initial_cfg.clone();
        for (name, day, cfg) in &self.phases {
            text.push_str(&format!("|{name}@{day}:{cfg}"));
        }
        format!("{:016x}", hash_seed(&text))
    }

    /// Final result as JSON text (hand-written, std only). Deterministic: no clocks, paths or host data.
    pub fn to_json(&self) -> String {
        let mut s = String::new();
        let _ = write!(
            s,
            "{{\"schema\":{},\"engine\":{},\"randomness\":{},\"configDigest\":{},",
            json::string(SCHEMA),
            json::string(ENGINE),
            json::string(crate::rng::RANDOMNESS_POLICY),
            json::string(&self.config_digest())
        );
        let _ = write!(s, "\"config\":{},\"phases\":[", self.initial_cfg);
        for (i, (name, day, cfg)) in self.phases.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            let _ = write!(s, "{{\"name\":{},\"startDay\":{},\"config\":{}}}", json::string(name), day, cfg);
        }
        let _ = write!(
            s,
            "],\"effectiveConfig\":{},\"completedDays\":{},\"censored\":{},",
            self.cfg.to_json(),
            self.day,
            self.censored.map_or("null".to_string(), json::string)
        );
        let d = &self.det;
        let _ = write!(s, "\"detection\":{{\"casesOpened\":{},\"falseInvalidated\":{},\"genuineInvalidated\":{},\"vetoedFalse\":{},\"vetoedGenuine\":{},\"casesDismissed\":{},\"linksLeft\":{},\"patternsFound\":{},\"escalations\":{},\"sponsorRefusals\":{},\"followUpCases\":{},\"honestInviterCascades\":{},\"honestInviterAcquitted\":{},\"holdersInvalidated\":{},\"defended\":{},\"casesRefused\":{},\"casesRefusedXp\":{}}},",
            d.cases_opened, d.false_invalidated, d.genuine_invalidated, d.vetoed_false, d.vetoed_genuine, d.cases_dismissed, d.links_left, d.patterns_found, d.escalations, d.sponsor_refusals, d.follow_up_cases, d.honest_inviter_cascades, d.honest_inviter_acquitted, d.holders_invalidated, d.defended, d.cases_refused, d.cases_refused_xp);
        let _ = write!(s, "\"counts\":{{\"invitationsHonest\":{},\"invitationsAttackers\":{},\"admittedHonest\":{},\"admittedAttackers\":{},\"valencesHonest\":{},\"valencesAttackers\":{},\"pairs\":{},\"pathSearchesExhausted\":{},\"pathSearchSteps\":{}}},",
            self.invitations[0], self.invitations[1], self.admitted[0], self.admitted[1], self.valences_opened[0], self.valences_opened[1], self.pairs, self.world.path_searches_exhausted(), self.world.path_search_steps());
        s.push_str("\"history\":[");
        for (i, r) in self.history.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            let f = |x: Option<f64>| x.map_or("null".to_string(), |v| format!("{v:.6}"));
            let _ = write!(s, "{{\"day\":{},\"subjects\":{},\"honest\":{},\"attackers\":{},\"attackerShare\":{},\"supply\":{},\"dirty\":{},\"dirtyShare\":{},\"active\":{},\"D\":{},\"councilSize\":{},\"councilAttackers\":{},\"attackEdges\":{}}}",
                r.day, r.subjects, r.honest, r.attackers, f(r.attacker_share()), r.supply, r.dirty, f(r.dirty_share()), r.active, r.d, r.council, r.council_attackers, r.attack_edges);
        }
        s.push_str("],\"refusals\":{");
        for (k, name) in ["honest", "attackers"].iter().enumerate() {
            if k > 0 {
                s.push(',');
            }
            let mut items: Vec<_> = self.refusals[k].iter().collect();
            items.sort();
            let _ = write!(s, "{}:{{", json::string(name));
            for (j, (msg, n)) in items.iter().enumerate() {
                if j > 0 {
                    s.push(',');
                }
                let _ = write!(s, "{}:{}", json::string(msg), n);
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

    /// A grown honest network with XP spread across accounts, plus a pair finder over accepted, free accounts.
    fn grown_honest(seed: &str) -> Sim {
        let mut sim = Sim::new(RunConfig {
            seed: seed.into(),
            honest_genesis: 30,
            attackers: 0,
            attack_start_day: 10_000,
            days: 70,
            max_subjects: 3000,
            ..RunConfig::default()
        });
        sim.cfg.detection.review = 0.0;
        sim.cfg.detection.inspect = 0.0;
        sim.cfg.detection.public_look = 0.0;
        sim.run();
        sim
    }

    fn find_pair(sim: &Sim, ok: impl Fn(i32, i32) -> bool) -> Option<(Id, Id)> {
        let free: Vec<Id> = (0..sim.world.len() as Id).filter(|&i| sim.world.accepted(i) && !sim.world.held(i)).collect();
        for &a in &free {
            for &b in &free {
                if a != b && ok(sim.world.xp(a), sim.world.xp(b)) {
                    return Some((a, b));
                }
            }
        }
        None
    }

    #[test]
    fn a_formal_case_needs_a_challenger_with_more_xp_and_a_refusal_changes_nothing() {
        let mut sim = grown_honest("gate");
        let lower = find_pair(&sim, |a, b| a < b).expect("a pair with less XP exists");
        let equal = find_pair(&sim, |a, b| a == b).expect("a pair with equal XP exists");
        let higher = find_pair(&sim, |a, b| a > b).expect("a pair with more XP exists");
        assert_eq!(sim.case_gate(lower.0, lower.1), Err(CaseRefusal::ChallengerXpNotAbove));
        assert_eq!(sim.case_gate(equal.0, equal.1), Err(CaseRefusal::ChallengerXpNotAbove));
        assert_eq!(sim.case_gate(higher.0, higher.1), Ok(()));
        for (a, b) in [lower, equal] {
            let (cases, opened, refused) = (sim.open_cases.len(), sim.det.cases_opened, sim.det.cases_refused);
            assert!(!sim.open_case(a, b, false), "XP {} against {} must be refused", sim.world.xp(a), sim.world.xp(b));
            assert_eq!((sim.open_cases.len(), sim.det.cases_opened, sim.det.cases_refused), (cases, opened, refused + 1));
            assert!(!sim.world.held(a) && !sim.world.held(b), "a refused case holds nobody");
            assert_eq!((sim.det.false_invalidated, sim.det.genuine_invalidated, sim.det.links_left), (0, 0, 0));
        }
        sim.world.audit().unwrap();
        // The qualified accusation stays possible.
        assert!(sim.open_case(higher.0, higher.1, false));
        assert!(sim.world.held(higher.0) && sim.world.held(higher.1));
        assert_eq!(sim.open_case_records().len(), 1);
        let (c, t, cx, tx) = sim.open_case_records()[0];
        assert!(cx > tx && c == higher.0 && t == higher.1);
        // Same account and unaccepted parties are refused too.
        assert_eq!(sim.case_gate(higher.0, higher.0), Err(CaseRefusal::SameAccount));
        sim.world.invalidate_identity(lower.1);
        assert_eq!(sim.case_gate(higher.0, lower.1), Err(CaseRefusal::NotAccepted));
        sim.world.audit().unwrap();
    }

    #[test]
    fn disabled_disputes_refuse_even_a_qualified_challenger() {
        let mut sim = grown_honest("gate-disabled");
        let higher = find_pair(&sim, |a, b| a > b).unwrap();
        sim.cfg.detection.disputes_from_active = 1_000_000;
        assert_eq!(sim.case_gate(higher.0, higher.1), Err(CaseRefusal::Disabled));
        let before = sim.open_cases.len();
        assert!(!sim.open_case(higher.0, higher.1, true));
        assert!(!sim.submit_suspicion(higher.0, higher.1, &mut Rng::keyed(1, 2, 3, 4), true));
        assert_eq!((sim.open_cases.len(), sim.det.cases_opened), (before, 0));
        assert!(!sim.world.held(higher.0));
    }

    #[test]
    fn an_observer_with_too_little_xp_can_only_pass_the_information_on() {
        let mut sim = grown_honest("gate-relay");
        sim.cfg.detection.sponsor_willingness = 1.0;
        let mut rng = Rng::keyed(7, 7, 7, 7);
        let mut relayed = 0;
        for target in 0..sim.world.len() as Id {
            for observer in 0..sim.world.len() as Id {
                if observer == target || !sim.world.accepted(observer) || !sim.world.accepted(target) || sim.world.held(observer) || sim.world.held(target) {
                    continue;
                }
                if sim.world.xp(observer) > sim.world.xp(target) {
                    continue;
                }
                let before = sim.open_cases.len();
                if sim.submit_suspicion(observer, target, &mut rng, false) {
                    relayed += 1;
                    let record = sim.open_case_records()[before];
                    assert_ne!(record.0, observer, "the unqualified observer is not the challenger");
                    assert!(record.2 > record.3, "the sponsor qualifies by XP");
                }
                if relayed >= 5 {
                    break;
                }
            }
            if relayed >= 5 {
                break;
            }
        }
        assert!(relayed >= 1, "a qualified, willing sponsor exists in this network");
        for (_, _, challenger_xp, target_xp) in sim.open_case_records() {
            assert!(challenger_xp > target_xp);
        }
        sim.world.audit().unwrap();
    }

    #[test]
    fn every_case_a_whole_attack_run_opens_passes_the_gate() {
        let mut sim = Sim::new(RunConfig {
            seed: "gate-run".into(),
            honest_genesis: 30,
            attack_start_day: 40,
            days: 100,
            attackers: 4,
            max_subjects: 3000,
            ..RunConfig::default()
        });
        let mut checked = 0;
        while sim.step_day() {
            for (challenger, target, cx, tx) in sim.open_case_records() {
                assert!(cx > tx, "case {challenger} against {target} opened with XP {cx} against {tx}");
                checked += 1;
            }
        }
        assert!(sim.det.cases_opened > 0 && checked > 0, "the run must open cases to be a test");
        sim.world.audit().unwrap();
    }

    #[test]
    fn invalid_configurations_are_refused_with_a_diagnostic() {
        let ok = RunConfig { honest_genesis: 30, ..RunConfig::default() };
        assert!(ok.validate().is_ok());
        type Break = Box<dyn Fn(&mut RunConfig)>;
        let cases: Vec<(&str, Break)> = vec![
            ("honest.invite", Box::new(|c| c.honest.invite = -0.1)),
            ("honest.accept_far", Box::new(|c| c.honest.accept_far = 1.5)),
            ("detection.false_positive", Box::new(|c| c.detection.false_positive = f64::NAN)),
            ("detection.accuracy", Box::new(|c| c.detection.accuracy = f64::INFINITY)),
            ("honest.vetting_sensitivity", Box::new(|c| c.honest.vetting_sensitivity = Some(2.0))),
            ("detection.window_days", Box::new(|c| c.detection.window_days = 0)),
            ("detection.defense_days", Box::new(|c| c.detection.defense_days = -1)),
            ("world.k", Box::new(|c| c.world.k = 0)),
            ("world.max_nodes", Box::new(|c| c.world.max_nodes = Some(1))),
            (
                "layered support needs",
                Box::new(|c| {
                    c.world.max_nodes = None;
                    c.world.layered = true;
                }),
            ),
            ("council_seats_per_d", Box::new(|c| c.world.council_seats_per_d = Some(0))),
            (
                "council_seats_per_d",
                Box::new(|c| {
                    c.world.council_seats = Some(21);
                    c.world.council_seats_per_d = Some(3);
                }),
            ),
            ("world.max_difficulty", Box::new(|c| c.world.max_difficulty = Some(0))),
            ("world.council_seats", Box::new(|c| c.world.council_seats = Some(2))),
            ("max_subjects", Box::new(|c| c.max_subjects = 5)),
            ("honest_genesis", Box::new(|c| c.honest_genesis = 3)),
            ("days", Box::new(|c| c.days = 0)),
            ("seed", Box::new(|c| c.seed = String::new())),
        ];
        for (needle, break_it) in cases {
            let mut c = ok.clone();
            break_it(&mut c);
            let err = c.validate().expect_err(needle);
            assert!(err.contains(needle), "{needle}: {err}");
            assert!(Sim::try_new(c).is_err(), "{needle}: try_new must refuse");
        }
    }

    #[test]
    fn saved_results_are_valid_json_complete_deterministic_and_distinguishable() {
        let base = RunConfig {
            seed: "q\"uote\\ \n\u{e9}".into(),
            honest_genesis: 30,
            attack_start_day: 20,
            days: 40,
            attackers: 2,
            max_subjects: 2000,
            ..RunConfig::default()
        };
        let mut a = Sim::new(base.clone());
        a.run();
        let mut b = Sim::new(base.clone());
        b.run();
        let text = a.to_json();
        assert_eq!(text, b.to_json(), "identical runs give identical results");
        json::validate(&text).expect("the result is valid JSON even with a nasty seed");
        for key in [
            "schema",
            "engine",
            "randomness",
            "configDigest",
            "config",
            "phases",
            "effectiveConfig",
            "completedDays",
            "censored",
            "world",
            "honest",
            "detection",
            "defenseSuccess",
            "disputesFromActive",
            "excludeDisputed",
            "maxNodes",
            "strategy",
            "stopAtHonest",
            "history",
            "refusals",
        ] {
            assert!(text.contains(&format!("\"{key}\":")), "missing {key}");
        }
        // A different setting with the same seed has a different digest; the same settings the same digest.
        let mut other = base.clone();
        other.detection.false_positive = 0.5;
        let mut c = Sim::new(other);
        c.run();
        assert_ne!(a.config_digest(), c.config_digest());
        assert_eq!(a.config_digest(), b.config_digest());
        // The growing phase and the attack phase keep distinct configurations.
        let mut grown = Sim::new(RunConfig { attackers: 0, attack_start_day: 1_000, days: 1_000, stop_at_honest: 40, ..base });
        grown.run();
        let before = grown.config_digest();
        grown
            .begin_phase("attack", |c| {
                c.attackers = 3;
                c.stop_at_honest = 0;
            })
            .unwrap();
        grown.run();
        let saved = grown.to_json();
        json::validate(&saved).unwrap();
        assert_ne!(before, grown.config_digest(), "a phase change changes the digest");
        assert!(saved.contains("\"phases\":[{\"name\":\"attack\"") && saved.contains("\"attackers\":3"));
        assert!(grown.begin_phase("bad", |c| c.detection.review = 7.0).is_err(), "an invalid phase is refused and changes nothing");
        assert_eq!(grown.cfg.detection.review, RunConfig::default().detection.review);
    }

    #[test]
    fn patient_operators_invite_no_fakes_until_the_patience_ends() {
        let mut sim = Sim::new(RunConfig {
            seed: "patience".into(),
            honest_genesis: 30,
            attack_start_day: 30,
            attacker_patience_days: 25,
            days: 90,
            attackers: 4,
            max_subjects: 3000,
            ..RunConfig::default()
        });
        let mut waiting_invitations = 0;
        while sim.step_day() {
            if sim.day <= 30 + 25 {
                waiting_invitations = sim.invitations[1];
            }
        }
        assert_eq!(waiting_invitations, 0, "no operator invitation before the patience ends");
        assert!(sim.cfg.validate().is_ok());
        let mut bad = sim.cfg.clone();
        bad.attacker_patience_days = -1;
        assert!(bad.validate().is_err());
        sim.world.audit().unwrap();
    }

    #[test]
    fn careless_honest_accounts_give_operators_more_links() {
        let links = |share: f64| -> usize {
            (1..=6)
                .map(|k| {
                    let mut sim = Sim::new(RunConfig {
                        seed: format!("careless-{k}"),
                        honest_genesis: 30,
                        attack_start_day: 30,
                        days: 80,
                        attackers: 4,
                        strategy: Strategy::HonestFirst,
                        max_subjects: 3000,
                        ..RunConfig::default()
                    });
                    sim.cfg.honest.careless_share = share;
                    sim.cfg.honest.careless_accept_far = 0.9;
                    sim.cfg.honest.accept_far = 0.02;
                    sim.run();
                    sim.history.iter().map(|r| r.attack_edges).max().unwrap()
                })
                .sum()
        };
        assert!(links(1.0) > links(0.0), "carelessness toward strangers raises the number of honest links an operator obtains");
        let mut bad = RunConfig::default();
        bad.honest.careless_share = 1.5;
        assert!(bad.validate().is_err());
    }

    #[test]
    fn the_efficiency_setting_for_the_search_order_does_not_change_the_outcome() {
        // With layered support (the baseline) no search runs out of budget, so the search order only changes the work.
        let run = |priority: Option<bool>| {
            let mut sim = Sim::new(RunConfig {
                seed: "efficiency".into(),
                honest_genesis: 30,
                attack_start_day: 30,
                days: 90,
                attackers: 4,
                max_subjects: 3000,
                ..RunConfig::default()
            });
            sim.cfg.world.xp_priority = priority;
            sim.run();
            sim
        };
        let (on, off) = (run(Some(true)), run(Some(false)));
        assert_eq!(on.world.path_searches_exhausted(), 0);
        let key = |s: &Sim| s.history.iter().map(|r| (r.day, r.honest, r.attackers, r.supply, r.dirty, r.attack_edges)).collect::<Vec<_>>();
        assert_eq!(key(&on), key(&off));
        assert_eq!((on.det.cases_opened, on.det.genuine_invalidated), (off.det.cases_opened, off.det.genuine_invalidated));
    }
}
