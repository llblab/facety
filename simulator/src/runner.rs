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
const CH_ARTIFACT: u64 = 16;
const CH_ACCUSE: u64 = 17;
const CH_LOSS: u64 = 18;
const CH_VOUCH: u64 = 19;

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
    /// Bought or compromised honest accounts (share of honest accounts): they accept every link request from an attacker-side account
    /// and take no part in detection (no veto, inspection, public look, relay or confirming look). The price paid is not modeled.
    pub corrupt_share: f64,
    /// D135 social recovery scenario: yearly chance that an honest account loses its private key (the person is unaffected and keeps the
    /// same identity). The person then needs a new account invited by a previous guarantor, vouched for by enough previous guarantors. 0 = off.
    pub key_loss: f64,
    /// Daily chance that each previous guarantor of a recovering person opens a guarantee toward the new account.
    pub recovery_vouch: f64,
    /// Days between the loss and the recovery invitation.
    pub recovery_delay_days: i64,
    /// D152: chance that an honest inviter holds a jointly signed co-presence artifact for an invitation of a person known to them.
    pub artifact_rate: f64,
    /// D152 collusion risk: share of second-account invitations where the inviter knowingly cooperates and always shows a (fabricated) artifact.
    pub collusion: f64,
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
    /// D151 burden of proof: after a confirmed invalidation, up to this many accepted accounts of the account's invitation subtree are
    /// examined without a noisy look (each must prove reality within the case window). 0 = off; the cap makes the invalidation partial.
    pub subtree_cases: usize,
    /// Verification before a case opens: this many further independent looks, each by another mutual partner of the target (honest
    /// partners look with the declared sensitivity or false-positive rate, attacker partners never confirm), must all agree. 0 = off.
    /// Assumption: the looks are independent and instantaneous, so the setting is optimistic about delay and about uncorrelated errors.
    pub confirm: usize,
    /// The confirming examiners are any independent honest accounts (public evidence) instead of the target's own mutual partners; a
    /// target without enough honest partners (a fake cluster) can then still be confirmed.
    pub confirm_public: bool,
    /// Correlated examiner errors: this share of genuine accounts has an odd public profile, and every examiner's false-positive rate for
    /// such an account is multiplied by `odd_multiplier` (capped at 1), so the same people are suspected again and again. 0 = off.
    pub odd_share: f64,
    pub odd_multiplier: f64,
    /// D151 appeal: chance that a wrongly invalidated (genuine) account appeals successfully; the account is reinstated after `defense_days`. 0 = off.
    pub appeal: f64,
    /// D151 repair: when an appeal reinstates a wrongly invalidated person, the honest links that the false positive cut are restored without a fee.
    pub restore_links: bool,
    /// D151 recovery: the liquid FACY of an invalidated account is burned.
    pub recover_liquid: bool,
    /// D34/D55 (trusted execution): the inviter of an invalidated account loses this fraction of its XP unless acquitted. 0 = off.
    pub xp_penalty: f64,
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
    /// Declared attacker behavior: chance that an operator account converts a mature emission right to liquid FACY (cashing out)
    /// instead of spending it on the attack; a trade-off, since a converted right can no longer grow the cluster. 0 = never.
    pub attacker_cash_out: f64,
    /// Declared attack on the availability of the defense: expected number of false formal cases per operator account per day against
    /// accepted honest accounts with less XP than the operator (the public XP gate); the accuser pays nothing (stakes are not modeled).
    pub attacker_accuse: f64,
    /// The false accusations pick the best-connected of 64 sampled eligible honest accounts instead of a random one.
    pub accuse_hubs: bool,
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
        at_least("honest.recovery_delay_days", self.honest.recovery_delay_days, 0)?;
        prob("attacker_cash_out", self.attacker_cash_out)?;
        if !self.attacker_accuse.is_finite() || self.attacker_accuse < 0.0 {
            return Err(format!("attacker_accuse must be a non-negative number, got {}", self.attacker_accuse));
        }
        if !self.detection.odd_multiplier.is_finite() || self.detection.odd_multiplier < 1.0 {
            return Err(format!("detection.odd_multiplier must be at least 1, got {}", self.detection.odd_multiplier));
        }
        if self.max_subjects < self.honest_genesis {
            return Err(format!("max_subjects ({}) must be at least honest_genesis ({})", self.max_subjects, self.honest_genesis));
        }
        if self.genesis_chords > 64 {
            return Err("genesis_chords above 64 is not a sensible genesis".into());
        }
        let w = &self.world;
        at_least("world.k", i64::from(w.k), 1)?;
        if let Some(step) = w.k_step {
            at_least("world.k_step", i64::from(step), 1)?;
            at_least("world.k_xp_per_level", i64::from(w.k_xp_per_level), 1)?;
        }
        at_least("world.freeze_hours", w.freeze_hours, 0)?;
        at_least("world.spend_hours", w.spend_hours, 0)?;
        at_least("world.search_budget", w.search_budget as i64, 1)?;
        if let Some(seats) = w.council_seats {
            if !(3..=100_001).contains(&seats) {
                return Err(format!("world.council_seats must be between 3 and 100001, got {seats}"));
            }
        }
        let sizing = [w.council_seats.is_some(), w.council_seats_per_d.is_some(), w.council_seats_per_thousand.is_some()].iter().filter(|&&x| x).count();
        if sizing > 1 {
            return Err("council_seats, council_seats_per_d and council_seats_per_thousand are alternatives; give at most one".into());
        }
        if let Some(m) = w.council_seats_per_thousand {
            if !(1..=1000).contains(&m) {
                return Err(format!("world.council_seats_per_thousand must be between 1 and 1000, got {m}"));
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
            ("honest.corrupt_share", h.corrupt_share),
            ("honest.key_loss", h.key_loss),
            ("honest.recovery_vouch", h.recovery_vouch),
            ("honest.artifact_rate", h.artifact_rate),
            ("honest.collusion", h.collusion),
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
            ("detection.odd_share", d.odd_share),
            ("detection.pattern_closure", d.pattern_closure),
            ("detection.sponsor_willingness", d.sponsor_willingness),
            ("detection.defense_success", d.defense_success),
            ("detection.appeal", d.appeal),
            ("detection.xp_penalty", d.xp_penalty),
        ] {
            prob(name, x)?;
        }
        // The dispute clock (D69): a case lasts at least seven days after the last participant joins, so proving reality cannot be quicker either.
        // The protocol window is seven days after the last entry; the owner concept D158 lets it shrink to three days as participants join, so
        // the simulator accepts three as the lower bound of a sensitivity study (participants joining are not modeled; the default stays seven).
        at_least("detection.window_days", d.window_days, 3)?;
        at_least("detection.defense_days", d.defense_days, 3)?;
        at_least("detection.pattern_min_invitees", d.pattern_min_invitees as i64, 1)?;
        Ok(())
    }

    /// The full effective configuration as a JSON object.
    pub fn to_json(&self) -> String {
        let w = &self.world;
        let h = &self.honest;
        let d = &self.detection;
        format!(
            "{{\"seed\":{},\"honestGenesis\":{},\"genesisChords\":{},\"attackStartDay\":{},\"days\":{},\"attackers\":{},\"maxSubjects\":{},\"strategy\":{},\"detectionStartDay\":{},\"attackerPatienceDays\":{},\"attackerCashOut\":{},\"attackerAccuse\":{},\"accuseHubs\":{},\"stopAtHonest\":{},\
\"world\":{{\"k\":{},\"kStep\":{},\"kXpPerLevel\":{},\"freezeHours\":{},\"spendHours\":{},\"maxNodes\":{},\"layered\":{},\"searchBudget\":{},\"excludeDisputed\":{},\"excludeTargetsOnly\":{},\"selfPathFromSubject\":{},\"councilSeats\":{},\"maxDifficulty\":{},\"councilSeatsPerD\":{},\"councilSeatsPerThousand\":{},\"searchOrder\":{}}},\
\"honest\":{{\"selfId\":{},\"invite\":{},\"befriend\":{},\"acceptNear\":{},\"acceptFar\":{},\"keepRights\":{},\"vetting\":{},\"vettingSensitivity\":{},\"vettingFalsePositive\":{},\"metInPerson\":{},\"doubleLife\":{},\"carelessShare\":{},\"carelessAcceptFar\":{},\"corruptShare\":{},\"keyLoss\":{},\"recoveryVouch\":{},\"recoveryDelayDays\":{},\"artifactRate\":{},\"collusion\":{}}},\
\"detection\":{{\"review\":{},\"inspect\":{},\"sensitivity\":{},\"falsePositive\":{},\"windowDays\":{},\"accuracy\":{},\"leave\":{},\"publicLook\":{},\"patternMinInvitees\":{},\"patternClosure\":{},\"sponsorWillingness\":{},\"followUp\":{},\"subtreeCases\":{},\"confirm\":{},\"confirmPublic\":{},\"oddShare\":{},\"oddMultiplier\":{},\"appeal\":{},\"restoreLinks\":{},\"recoverLiquid\":{},\"xpPenalty\":{},\"acquitMet\":{},\"disputesFromActive\":{},\"defenseSuccess\":{},\"defenseDays\":{}}}}}",
            json::string(&self.seed), self.honest_genesis, self.genesis_chords, self.attack_start_day, self.days, self.attackers, self.max_subjects, json::string(&format!("{:?}", self.strategy)), self.detection_start_day, self.attacker_patience_days, json::number(self.attacker_cash_out), json::number(self.attacker_accuse), self.accuse_hubs, self.stop_at_honest,
            w.k, w.k_step.map_or("null".to_string(), |n| n.to_string()), w.k_xp_per_level, w.freeze_hours, w.spend_hours, w.max_nodes.map_or("null".to_string(), |n| n.to_string()), w.layered, w.search_budget, w.exclude_disputed, w.exclude_targets_only, w.self_path_from_subject, w.council_seats.map_or("null".to_string(), |n| n.to_string()), w.max_difficulty.map_or("null".to_string(), |n| n.to_string()), w.council_seats_per_d.map_or("null".to_string(), |n| n.to_string()), w.council_seats_per_thousand.map_or("null".to_string(), |n| n.to_string()), w.search_order.map_or("null".to_string(), |o| json::string(&format!("{o:?}"))),
            json::number(h.self_id), json::number(h.invite), json::number(h.befriend), json::number(h.accept_near), json::number(h.accept_far), h.keep_rights, json::number(h.vetting), json::option_number(h.vetting_sensitivity), json::option_number(h.vetting_false_positive), json::number(h.met_in_person), json::number(h.double_life), json::number(h.careless_share), json::number(h.careless_accept_far), json::number(h.corrupt_share), json::number(h.key_loss), json::number(h.recovery_vouch), h.recovery_delay_days, json::number(h.artifact_rate), json::number(h.collusion),
            json::number(d.review), json::number(d.inspect), json::number(d.sensitivity), json::number(d.false_positive), d.window_days, json::number(d.accuracy), d.leave, json::number(d.public_look), d.pattern_min_invitees, json::number(d.pattern_closure), json::number(d.sponsor_willingness), d.follow_up, d.subtree_cases, d.confirm, d.confirm_public, json::number(d.odd_share), json::number(d.odd_multiplier), json::number(d.appeal), d.restore_links, d.recover_liquid, json::number(d.xp_penalty), d.acquit_met, d.disputes_from_active, json::number(d.defense_success), d.defense_days
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
                corrupt_share: 0.0,
                key_loss: 0.0,
                recovery_vouch: 0.5,
                recovery_delay_days: 3,
                artifact_rate: 1.0,
                collusion: 0.0,
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
                subtree_cases: 0,
                confirm: 0,
                confirm_public: false,
                odd_share: 0.0,
                odd_multiplier: 1.0,
                appeal: 0.0,
                restore_links: false,
                recover_liquid: false,
                xp_penalty: 0.0,
                acquit_met: false,
                disputes_from_active: 0,
                defense_success: 0.95,
                defense_days: 7,
            },
            detection_start_day: 0,
            attacker_patience_days: 0,
            attacker_cash_out: 0.0,
            attacker_accuse: 0.0,
            accuse_hubs: false,
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
    /// D152: 0 none, 1 genuine co-presence artifact, 2 fabricated by a colluding inviter.
    artifact: u8,
    /// D135: the invited account continues this lost account.
    recovers: Option<Id>,
}

/// D135 scenario record of one lost key.
#[derive(Clone, Debug)]
struct LostRec {
    old: Id,
    lost_day: i64,
    guarantors: Vec<Id>,
    inv: Option<u32>,
    successor: Option<Id>,
    done: bool,
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
    /// Cases opened by the declared false-accusation attack.
    pub accusations: u64,
    /// Cases whose target is a genuine person or an operator account: the burden that detection puts on honest people.
    pub cases_on_genuine: u64,
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
    /// Acquitted inviters whose artifact was fabricated (collusion leak, D152).
    pub colluders_acquitted: u64,
    /// Wrongly invalidated accounts reinstated on appeal (D151).
    pub appeals_restored: u64,
    /// Honest links restored without a fee after an appeal (D151).
    pub links_restored: u64,
    /// Recorded consequences of caught second accounts, index 0 unwitting inviter, 1 colluding inviter (D152 incentive ledger):
    /// caught, emissions of the second account, inviter acquitted, links the inviter's partners left, XP removed from the inviter.
    pub ledger: [[u64; 5]; 2],
    /// Liquid FACY burned on invalidated accounts (D151).
    pub liquid_burned: u64,
    /// XP removed from inviters of invalidated accounts (D34/D55 trusted execution).
    pub xp_penalized: u64,
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
    /// XP of accepted accounts: median, 90th percentile and maximum.
    pub xp_p50: i32,
    pub xp_p90: i32,
    pub xp_max: i32,
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
    /// Accounts whose inviter holds a co-presence artifact (D152): 1 genuine, 2 fabricated.
    artifact: HashMap<Id, u8>,
    honest: Vec<Id>,
    attackers: Vec<Id>,
    children: Vec<Vec<Id>>,
    pending: Vec<Pending>,
    answers: Vec<u32>,
    decided: HashMap<u32, bool>,
    mark: Vec<u32>,
    mark_epoch: u32,
    scratch: Vec<Id>,
    open_cases: Vec<CaseRec>,
    /// Appeals due (hour, account) after a wrong invalidation (D151).
    appeals: Vec<(i64, Id)>,
    /// Honest links cut by the cascade of a verdict, per invalidated account, kept for restoration on appeal (D151).
    cuts: HashMap<Id, Vec<(Id, Id)>>,
    pub det: DetectionCounters,
    pub invitations: [u64; 2],
    /// Units of emission minted by Self-IDs, honest and attacker side (cumulative, whatever happens to them later).
    pub emitted: [u64; 2],
    /// D135 scenario counters: key losses, recoveries completed, days from loss to recovery (sum), accounts a bought coalition could capture.
    pub recovery: [u64; 6],
    lost: Vec<LostRec>,
    lost_set: HashSet<Id>,
    recovering: HashMap<Id, usize>,
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
            artifact: HashMap::new(),
            honest: (0..n as Id).collect(),
            attackers: Vec::new(),
            children: vec![Vec::new(); n],
            pending: Vec::new(),
            answers: Vec::new(),
            decided: HashMap::new(),
            mark: Vec::new(),
            mark_epoch: 0,
            scratch: Vec::new(),
            open_cases: Vec::new(),
            appeals: Vec::new(),
            cuts: HashMap::new(),
            det: DetectionCounters::default(),
            invitations: [0; 2],
            emitted: [0; 2],
            recovery: [0; 6],
            lost: Vec::new(),
            lost_set: HashSet::new(),
            recovering: HashMap::new(),
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
        let d = &self.cfg.detection;
        if false_identity(self.kind[id as usize]) {
            return rng.chance(d.sensitivity);
        }
        let odd = d.odd_share > 0.0 && Rng::keyed(self.seed, CH_TYPE, u64::from(id), 2).chance(d.odd_share);
        rng.chance(if odd { (d.false_positive * d.odd_multiplier).min(1.0) } else { d.false_positive })
    }

    /// A suspicious look at `id` that must also survive the declared confirming looks of other mutual partners (`Detection::confirm`).
    fn look_confirmed(&self, rng: &mut Rng, observer: Id, id: Id) -> bool {
        if !self.look(rng, id) {
            return false;
        }
        let need = self.cfg.detection.confirm;
        if need == 0 {
            return true;
        }
        if self.cfg.detection.confirm_public {
            let share = self.cfg.honest.corrupt_share;
            return (0..need).all(|_| (share <= 0.0 || !rng.chance(share)) && self.look(rng, id));
        }
        let mut confirmers: Vec<Id> = self
            .world
            .mutual_partners(id)
            .into_iter()
            .filter(|&p| p != observer && self.world.accepted(p) && self.cohort[p as usize] == Cohort::Honest && !self.corrupt(p))
            .collect();
        confirmers.sort_unstable();
        confirmers.len() >= need && confirmers.into_iter().take(need).all(|_| self.look(rng, id))
    }

    /// Whether an honest account is bought or compromised (declared share, fixed per account).
    fn corrupt(&self, id: Id) -> bool {
        let share = self.cfg.honest.corrupt_share;
        share > 0.0 && self.cohort[id as usize] == Cohort::Honest && Rng::keyed(self.seed, CH_TYPE, u64::from(id), 1).chance(share)
    }

    fn invite(&mut self, creator: Id, right: u32, cohort: Cohort, kind: Kind, owner: Option<Id>, artifact: u8) -> bool {
        if self.world.len() + self.pending.len() >= self.cfg.max_subjects {
            self.censored = Some("maxSubjects");
            return false;
        }
        let r = self.world.create_invitation(creator, right);
        match self.note(creator, r) {
            Some(inv) => {
                self.pending.push(Pending { inv, cohort, kind, owner, artifact, recovers: None });
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
                    if p.artifact > 0 {
                        self.artifact.insert(id, p.artifact);
                    }
                    if let Some(old) = p.recovers {
                        if self.world.begin_recovery(id, old).is_ok() {
                            if let Some(k) = self.lost.iter().position(|r| r.old == old) {
                                self.lost[k].successor = Some(id);
                                self.recovery[5] += 1;
                                self.recovering.insert(id, k);
                            }
                        }
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
        self.social_recovery();
        if self.censored.is_none() && day >= self.cfg.detection_start_day {
            self.detect();
            self.accuse();
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
                if self.invite(inviter, right, Cohort::Attacker, Kind::Operator, None, 0) {
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
                if self.note(id, r).is_some() {
                    self.emitted[ci(self.cohort[id as usize])] += 1;
                }
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
                    let vouched_back = self.recovering.get(&answerer).is_some_and(|&k| self.lost[k].guarantors.contains(&owner));
                    let y = if vouched_back
                        || self.cohort[answerer as usize] == Cohort::Attacker
                        || (self.cohort[owner as usize] == Cohort::Attacker && self.corrupt(answerer))
                    {
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
                    // D152: the inviter knows the person, so a jointly signed co-presence artifact exists with `artifact_rate`; a colluding inviter
                    // (a share of second-account invitations) always shows one, genuine or not.
                    let artifact = {
                        let mut a = Rng::keyed(self.seed, CH_ARTIFACT, u64::from(id), u64::from(right));
                        let colluding = dual && self.cfg.honest.collusion > 0.0 && a.chance(self.cfg.honest.collusion);
                        if colluding {
                            2
                        } else if a.chance(self.cfg.honest.artifact_rate) {
                            1
                        } else {
                            0
                        }
                    };
                    self.invite(id, right, Cohort::Honest, if dual { Kind::Double } else { Kind::Genuine }, owner, artifact);
                    if self.censored.is_some() {
                        return;
                    }
                    continue;
                }
                if rng.chance(self.cfg.honest.befriend) {
                    // Friends of friends who are accepted and not yet linked, each counted once. A stamp array replaces sorting and
                    // deduplicating the whole list, and selecting the k-th smallest replaces the full sort; the pick is the same one.
                    if self.mark.len() < self.world.len() {
                        self.mark.resize(self.world.len(), 0);
                    }
                    self.mark_epoch = self.mark_epoch.wrapping_add(1);
                    if self.mark_epoch == 0 {
                        self.mark.iter_mut().for_each(|m| *m = 0);
                        self.mark_epoch = 1;
                    }
                    let epoch = self.mark_epoch;
                    let mut candidates = std::mem::take(&mut self.scratch);
                    candidates.clear();
                    {
                        let g = self.world.graph();
                        let world = &self.world;
                        let mark = &mut self.mark;
                        for &friend in g.out(id) {
                            for &other in g.out(friend) {
                                if mark[other as usize] == epoch {
                                    continue;
                                }
                                mark[other as usize] = epoch;
                                if other != id && world.accepted(other) && !g.has_edge(id, other) && !g.has_edge(other, id) {
                                    candidates.push(other);
                                }
                            }
                        }
                    }
                    if !candidates.is_empty() {
                        let k = rng.below(candidates.len() as u64) as usize;
                        candidates.select_nth_unstable(k);
                        let c = candidates[k];
                        self.open_valence(id, c, right);
                    }
                    self.scratch = candidates;
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
                if self.cfg.attacker_cash_out > 0.0 && rng.chance(self.cfg.attacker_cash_out) && self.world.convert_to_collector(id, right).is_ok() {
                    continue;
                }
                if !waiting && self.invite(id, right, Cohort::Attacker, Kind::Fake, None, 0) {
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

    // ---- social recovery scenario (D135) ----------------------------------------------------------------------------

    /// Honest accounts lose keys; the person recovers through a new account invited by a previous guarantor and vouched for by enough of them.
    fn social_recovery(&mut self) {
        let cfg = self.cfg.honest.clone();
        if cfg.key_loss <= 0.0 {
            return;
        }
        let now_day = self.day;
        let hazard = 1.0 - (1.0 - cfg.key_loss).powf(1.0 / 365.0);
        let candidates: Vec<Id> = self.honest.iter().copied().filter(|&i| self.world.accepted(i) && !self.lost_set.contains(&i)).collect();
        for id in candidates {
            if !Rng::keyed(self.seed, CH_LOSS, u64::from(id), now_day as u64).chance(hazard) {
                continue;
            }
            let guarantors = self.world.mutual_partners(id);
            if self.world.lose_key(id).is_err() {
                continue;
            }
            let needed = guarantors.len().div_ceil(2).max(self.world.required_guarantors());
            if guarantors.iter().filter(|&&g| self.corrupt(g)).count() >= needed {
                self.recovery[3] += 1;
            }
            self.recovery[0] += 1;
            self.lost_set.insert(id);
            self.lost.push(LostRec { old: id, lost_day: now_day, guarantors, inv: None, successor: None, done: false });
        }
        for k in 0..self.lost.len() {
            if self.lost[k].done {
                continue;
            }
            let rec = self.lost[k].clone();
            if let Some(new) = rec.successor {
                let mut rng = Rng::keyed(self.seed, CH_VOUCH, u64::from(new), now_day as u64);
                for &g in &rec.guarantors {
                    if self.world.accepted(g) && !self.lost_set.contains(&g) && !self.linked(g, new) && rng.chance(cfg.recovery_vouch) {
                        if let Some(right) = self.world.eligible_emission(g) {
                            self.open_valence(g, new, right);
                        }
                    }
                }
                let ready = self.world.recovery_progress(new).is_some_and(|(vouched, needed)| vouched >= needed);
                if ready && self.world.complete_recovery(new).is_ok() {
                    self.lost[k].done = true;
                    self.recovering.remove(&new);
                    self.recovery[1] += 1;
                    self.recovery[2] += (now_day - rec.lost_day) as u64;
                }
                continue;
            }
            if let Some(inv) = rec.inv {
                if self.world.invitation(inv).status == crate::world::InvStatus::Cancelled {
                    self.lost[k].inv = None;
                }
                continue;
            }
            if now_day - rec.lost_day < cfg.recovery_delay_days {
                continue;
            }
            let mut rng = Rng::keyed(self.seed, CH_VOUCH, u64::from(rec.old), now_day as u64 + (1 << 40));
            let inviter = rec
                .guarantors
                .iter()
                .copied()
                .filter(|&g| self.world.accepted(g) && !self.lost_set.contains(&g) && self.world.eligible_emission(g).is_some())
                .collect::<Vec<Id>>();
            if let Some(&g) = rng.pick(&inviter) {
                let right = self.world.eligible_emission(g).expect("filtered");
                if self.invite(g, right, Cohort::Honest, Kind::Genuine, None, 0) {
                    let last = self.pending.last_mut().expect("just pushed");
                    last.recovers = Some(rec.old);
                    self.lost[k].inv = Some(last.inv);
                    self.recovery[4] += 1;
                }
            }
        }
    }

    // ---- detection -------------------------------------------------------------------------------------------------

    /// Declared attack on the availability of the defense: operators file false formal cases through the ordinary procedure (the public
    /// XP gate applies; nothing is staked).
    fn accuse(&mut self) {
        let rate = self.cfg.attacker_accuse;
        if rate <= 0.0 {
            return;
        }
        let operators: Vec<Id> = self.attackers.iter().copied().filter(|&a| self.kind[a as usize] == Kind::Operator && self.world.accepted(a)).collect();
        let honest_all = self.honest.clone();
        for op in operators {
            let mut rng = self.stream(CH_ACCUSE, u64::from(op));
            let count = rate.floor() as usize + usize::from(rng.chance(rate.fract()));
            for _ in 0..count {
                let targeted: HashSet<Id> = self.open_cases.iter().map(|c| c.target).collect();
                let eligible = |s: &Sim, o: Id| s.world.accepted(o) && !targeted.contains(&o) && s.world.xp(op) > s.world.xp(o);
                let target = if self.cfg.accuse_hubs {
                    let mut best: Option<Id> = None;
                    for _ in 0..64 {
                        let Some(&c) = rng.pick(&honest_all) else { break };
                        if eligible(self, c) && best.is_none_or(|b| self.world.mutual_count(c) > self.world.mutual_count(b)) {
                            best = Some(c);
                        }
                    }
                    best
                } else {
                    self.pick_where(&mut rng, &honest_all, |o| eligible(self, o))
                };
                if let Some(t) = target {
                    if self.open_case(op, t, false) {
                        self.det.accusations += 1;
                    }
                }
            }
        }
    }

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
        if can_defend {
            self.det.cases_on_genuine += 1;
        }
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
        if self.cohort[sponsor as usize] != Cohort::Honest || self.corrupt(sponsor) || !rng.chance(self.cfg.detection.sponsor_willingness) {
            self.det.sponsor_refusals += 1;
            return false;
        }
        self.open_case(sponsor, target, false)
    }

    fn detect(&mut self) {
        let det = self.cfg.detection.clone();
        let mut targeted: HashSet<Id> = self.open_cases.iter().map(|c| c.target).collect();
        // D151 appeal: due appeals reinstate the wrongly invalidated person.
        let now = self.world.now();
        let due: Vec<Id> = self.appeals.iter().filter(|a| a.0 <= now).map(|a| a.1).collect();
        self.appeals.retain(|a| a.0 > now);
        for id in due {
            if self.world.reinstate_identity(id) {
                self.det.appeals_restored += 1;
                for (a, b) in self.cuts.remove(&id).unwrap_or_default() {
                    if self.world.accepted(a) && self.world.accepted(b) && self.world.restore_link(a, b).is_ok() {
                        self.det.links_restored += 1;
                    }
                }
            }
        }
        // Freeze veto: honest current guarantors of the creator review invitations created today.
        let pending = std::mem::take(&mut self.pending);
        for p in pending {
            let (created_at, creator, status) = {
                let i = self.world.invitation(p.inv);
                (i.created_at, i.creator, i.status)
            };
            if status == crate::world::InvStatus::Pending && created_at == self.world.now() {
                let mut vetoed = false;
                let reviewers: Vec<Id> = self
                    .world
                    .graph()
                    .inn(creator)
                    .iter()
                    .copied()
                    .filter(|&g| self.cohort[g as usize] == Cohort::Honest && self.world.accepted(g) && !self.corrupt(g))
                    .collect();
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
            if det.recover_liquid {
                self.det.liquid_burned += u64::from(self.world.burn_liquid(rec.target));
            }
            if label {
                self.det.false_invalidated += 1
            } else {
                self.det.genuine_invalidated += 1;
                if det.appeal > 0.0 && Rng::keyed(self.seed, CH_DEFENSE, rec.id, 1).chance(det.appeal) {
                    self.appeals.push((self.world.now() + det.defense_days * DAY, rec.target));
                }
            }
            // D127: a true duplicate verdict also reaches the holder of the second account.
            if let Some(&holder) = self.owner_of.get(&rec.target) {
                if label && self.world.accepted(holder) {
                    self.world.invalidate_identity(holder);
                    self.world.void_chain(holder);
                    if det.recover_liquid {
                        self.det.liquid_burned += u64::from(self.world.burn_liquid(holder));
                    }
                    self.det.holders_invalidated += 1;
                }
            }
            // D151: heightened handling of a cluster node; its invitation subtree must prove reality, partially (capped), without a look.
            if det.subtree_cases > 0 && self.world.accepted(rec.challenger) {
                let mut members: Vec<Id> =
                    self.subtree(rec.target).into_iter().filter(|&m| m != rec.target && self.world.accepted(m) && !targeted.contains(&m)).collect();
                members.sort_unstable();
                members.truncate(det.subtree_cases);
                let mut rng = Rng::keyed(self.seed, CH_FOLLOW, rec.id, 1);
                for member in members {
                    if self.submit_suspicion(rec.challenger, member, &mut rng, true) {
                        targeted.insert(member);
                    }
                }
            }
            let Some(inviter) = self.world.inviter(rec.target).filter(|&i| self.world.accepted(i)) else { continue };
            // Incentive ledger: what a caught second account earned and what its inviter then lost.
            let ledger = (label && self.kind[rec.target as usize] == Kind::Double && self.cohort[inviter as usize] == Cohort::Honest)
                .then(|| usize::from(self.artifact.get(&rec.target) == Some(&2)));
            if let Some(c) = ledger {
                self.det.ledger[c][0] += 1;
                self.det.ledger[c][1] += self.world.chain_len(rec.target) as u64;
            }
            if self.cohort[inviter as usize] == Cohort::Honest && (det.acquit_met || self.cfg.honest.double_life > 0.0) {
                // D152: only a co-presence artifact acquits; without one the ordinary chain liability stands.
                if det.acquit_met {
                    if let Some(&a) = self.artifact.get(&rec.target) {
                        self.det.honest_inviter_acquitted += 1;
                        if a == 2 {
                            self.det.colluders_acquitted += 1;
                        }
                        if let Some(c) = ledger {
                            self.det.ledger[c][2] += 1;
                        }
                        continue;
                    }
                }
                self.det.honest_inviter_cascades += 1;
            }
            if det.xp_penalty > 0.0 {
                let cut = self.world.penalize_xp(inviter, det.xp_penalty) as u64;
                self.det.xp_penalized += cut;
                if let Some(c) = ledger {
                    self.det.ledger[c][4] += cut;
                }
            }
            if det.leave {
                for partner in self.world.mutual_partners(inviter) {
                    if self.cohort[partner as usize] == Cohort::Honest && self.leave(partner, inviter) {
                        if let Some(c) = ledger {
                            self.det.ledger[c][3] += 1;
                        }
                        if det.restore_links && !label {
                            self.cuts.entry(rec.target).or_default().push((partner, inviter));
                        }
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
        let honest_ids: Vec<Id> = self.honest.iter().copied().filter(|&i| self.world.accepted(i) && !self.corrupt(i)).collect();
        for &id in &honest_ids {
            let mut rng = self.stream(CH_INSPECT, u64::from(id));
            for partner in self.world.mutual_partners(id) {
                if !rng.chance(det.inspect) || !self.look_confirmed(&mut rng, id, partner) || targeted.contains(&partner) {
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
                if !targeted.contains(&examined) && self.look_confirmed(&mut rng, id, examined) && self.escalate(id, examined, &mut rng) {
                    targeted.insert(examined);
                }
                if !self.pattern(examined) {
                    continue;
                }
                self.det.patterns_found += 1;
                let mut kids = self.invitees(examined);
                rng.shuffle(&mut kids);
                for child in kids.into_iter().take(3) {
                    if targeted.contains(&child) || !self.look_confirmed(&mut rng, id, child) {
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
        let mut xps: Vec<i32> = accepted.iter().map(|&i| w.xp_of(i)).collect();
        xps.sort_unstable();
        let pick = |q: usize| if xps.is_empty() { 0 } else { xps[(xps.len() - 1) * q / 100] };
        let (xp_p50, xp_p90, xp_max) = (pick(50), pick(90), xps.last().copied().unwrap_or(0));
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
            xp_p50,
            xp_p90,
            xp_max,
        });
    }

    /// Open cases as (challenger, target, challenger XP at opening, target XP at opening).
    pub fn open_case_records(&self) -> Vec<(Id, Id, i32, i32)> {
        self.open_cases.iter().map(|c| (c.challenger, c.target, c.challenger_xp, c.target_xp)).collect()
    }

    /// Named phases of the experiment with the day each began (for plots).
    pub fn phase_marks(&self) -> Vec<(String, i64)> {
        self.phases.iter().map(|(n, d, _)| (n.clone(), *d)).collect()
    }

    /// A plain SVG of the run (std only): honest accounts, attacker share and dirty-FACY share by day; phase starts are dashed lines.
    pub fn to_svg(&self, title: &str) -> String {
        let (w, h, left, panel) = (900.0f64, 740.0f64, 70.0f64, 180.0f64);
        let last = self.history.last().map_or(1, |r| r.day).max(1) as f64;
        let x = |d: i64| left + (w - left - 20.0) * d as f64 / last;
        let series: [(&str, Vec<f64>, &str); 3] = [
            ("honest accounts", self.history.iter().map(|r| r.honest as f64).collect(), "#1f6f8b"),
            ("attacker share of accounts (%)", self.history.iter().map(|r| 100.0 * r.attacker_share().unwrap_or(0.0)).collect(), "#b5453a"),
            ("dirty-FACY share (%)", self.history.iter().map(|r| 100.0 * r.dirty_share().unwrap_or(0.0)).collect(), "#7a5195"),
        ];
        let mut s = format!("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {w} {h}\" font-family=\"sans-serif\" font-size=\"12\">\n<rect width=\"{w}\" height=\"{h}\" fill=\"white\"/>\n<text x=\"{left}\" y=\"20\" font-size=\"14\">{title}</text>\n");
        for (k, (name, ys, color)) in series.iter().enumerate() {
            let top = 40.0 + k as f64 * (panel + 40.0);
            let max = ys.iter().cloned().fold(0.0f64, f64::max).max(1e-9);
            let y = |v: f64| top + panel - panel * v / max;
            s.push_str(&format!("<text x=\"{left}\" y=\"{}\">{name} (max {max:.3})</text>\n<rect x=\"{left}\" y=\"{top}\" width=\"{}\" height=\"{panel}\" fill=\"none\" stroke=\"#999\"/>\n", top - 6.0, w - left - 20.0));
            let pts: Vec<String> = self.history.iter().zip(ys).map(|(r, &v)| format!("{:.1},{:.1}", x(r.day), y(v))).collect();
            s.push_str(&format!("<polyline fill=\"none\" stroke=\"{color}\" stroke-width=\"1.5\" points=\"{}\"/>\n", pts.join(" ")));
            for (n, d) in self.phase_marks() {
                if d > 0 {
                    s.push_str(&format!("<line x1=\"{0:.1}\" x2=\"{0:.1}\" y1=\"{top}\" y2=\"{1}\" stroke=\"#555\" stroke-dasharray=\"4 3\"/>\n<text x=\"{2:.1}\" y=\"{3}\" fill=\"#555\">{n}</text>\n", x(d), top + panel, x(d) + 3.0, top + 12.0));
                }
            }
        }
        s.push_str(&format!("<text x=\"{left}\" y=\"{}\">day (0 to {last})</text>\n</svg>\n", h - 8.0));
        s
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
        let _ = write!(s, "\"detection\":{{\"casesOpened\":{},\"accusations\":{},\"casesOnGenuine\":{},\"falseInvalidated\":{},\"genuineInvalidated\":{},\"vetoedFalse\":{},\"vetoedGenuine\":{},\"casesDismissed\":{},\"linksLeft\":{},\"patternsFound\":{},\"escalations\":{},\"sponsorRefusals\":{},\"followUpCases\":{},\"honestInviterCascades\":{},\"honestInviterAcquitted\":{},\"colludersAcquitted\":{},\"appealsRestored\":{},\"linksRestored\":{},\"doubleLedger\":{{\"unwitting\":{:?},\"colluding\":{:?}}},\"liquidBurned\":{},\"xpPenalized\":{},\"holdersInvalidated\":{},\"defended\":{},\"casesRefused\":{},\"casesRefusedXp\":{}}},",
            d.cases_opened, d.accusations, d.cases_on_genuine, d.false_invalidated, d.genuine_invalidated, d.vetoed_false, d.vetoed_genuine, d.cases_dismissed, d.links_left, d.patterns_found, d.escalations, d.sponsor_refusals, d.follow_up_cases, d.honest_inviter_cascades, d.honest_inviter_acquitted, d.colluders_acquitted, d.appeals_restored, d.links_restored, d.ledger[0], d.ledger[1], d.liquid_burned, d.xp_penalized, d.holders_invalidated, d.defended, d.cases_refused, d.cases_refused_xp);
        let _ = write!(s, "\"counts\":{{\"invitationsHonest\":{},\"invitationsAttackers\":{},\"admittedHonest\":{},\"admittedAttackers\":{},\"keyLosses\":{},\"recoveriesCompleted\":{},\"recoveryDaysSum\":{},\"recoveriesCapturable\":{},\"recoveriesInvited\":{},\"recoveriesStarted\":{},\"emissionHonest\":{},\"emissionAttackers\":{},\"attackerLiquid\":{},\"attackerUnspent\":{},\"valencesHonest\":{},\"valencesAttackers\":{},\"pairs\":{},\"pathSearchesExhausted\":{},\"pathSearchSteps\":{}}},",
            self.invitations[0], self.invitations[1], self.admitted[0], self.admitted[1], self.recovery[0], self.recovery[1], self.recovery[2], self.recovery[3], self.recovery[4], self.recovery[5], self.emitted[0], self.emitted[1], self.attackers.iter().map(|&a| i64::from(self.world.liquid(a))).sum::<i64>(), self.attackers.iter().map(|&a| self.world.unspent_rights(a) as i64).sum::<i64>(), self.valences_opened[0], self.valences_opened[1], self.pairs, self.world.path_searches_exhausted(), self.world.path_search_steps());
        s.push_str("\"history\":[");
        for (i, r) in self.history.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            let f = |x: Option<f64>| x.map_or("null".to_string(), |v| format!("{v:.6}"));
            let _ = write!(s, "{{\"day\":{},\"subjects\":{},\"honest\":{},\"attackers\":{},\"attackerShare\":{},\"supply\":{},\"dirty\":{},\"dirtyShare\":{},\"active\":{},\"D\":{},\"councilSize\":{},\"councilAttackers\":{},\"attackEdges\":{},\"xpP50\":{},\"xpP90\":{},\"xpMax\":{}}}",
                r.day, r.subjects, r.honest, r.attackers, f(r.attacker_share()), r.supply, r.dirty, f(r.dirty_share()), r.active, r.d, r.council, r.council_attackers, r.attack_edges, r.xp_p50, r.xp_p90, r.xp_max);
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
    use crate::world::SearchOrder;

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

    /// D152: the inviter is acquitted only with a co-presence artifact; a colluding inviter shows a fabricated one.
    #[test]
    fn acquittal_needs_a_co_presence_artifact() {
        let run = |artifact: f64, collusion: f64| {
            let mut c = small("art", 4, false);
            c.honest.double_life = 0.3;
            c.honest.met_in_person = 0.3;
            c.detection.acquit_met = true;
            c.honest.artifact_rate = artifact;
            c.honest.collusion = collusion;
            let mut sim = Sim::new(c);
            sim.run();
            sim.world.audit().unwrap();
            (sim.det.honest_inviter_acquitted, sim.det.honest_inviter_cascades, sim.det.colluders_acquitted)
        };
        let (none_acquitted, none_cascades, _) = run(0.0, 0.0);
        assert_eq!(none_acquitted, 0, "no artifact, no acquittal");
        let (all_acquitted, all_cascades, honest_colluders) = run(1.0, 0.0);
        assert_eq!(honest_colluders, 0);
        assert!(all_acquitted > 0 && all_cascades <= none_cascades);
        let (_, _, colluders) = run(0.0, 1.0);
        assert!(colluders > 0, "colluders always show an artifact and are acquitted");
    }

    /// D151: the burden of proof on the invitation subtree opens more cases than follow-up alone and keeps the state consistent.
    #[test]
    fn the_subtree_burden_opens_more_cases_and_keeps_the_audit() {
        let run = |cap: usize| {
            let mut c = small("sub", 5, false);
            c.world.layered = false;
            c.detection.subtree_cases = cap;
            let mut sim = Sim::new(c);
            sim.run();
            sim.world.audit().unwrap();
            sim.det.follow_up_cases
        };
        assert!(run(20) >= run(0));
    }

    /// Verification before a case opens: every extra independent look multiplies the false-positive load on genuine people by about the
    /// false-positive rate, and the state stays consistent.
    #[test]
    fn confirming_looks_cut_the_cases_on_genuine_people() {
        let run = |confirm: usize| {
            let mut c = small("conf", 8, false);
            c.detection.false_positive = 0.05;
            c.detection.confirm = confirm;
            let mut sim = Sim::new(c);
            sim.run();
            sim.world.audit().unwrap();
            sim.det.cases_on_genuine
        };
        let (none, one) = (run(0), run(1));
        assert!(none > 0, "the noisy baseline opens cases on genuine people");
        assert!(one < none, "a confirming look removes most of them ({one} against {none})");
    }

    /// Bought honest accounts accept attacker links and do not detect: with a full share no honest veto or inspection happens, and the state
    /// stays consistent.
    #[test]
    fn bought_honest_accounts_do_not_detect_and_keep_the_audit() {
        let run = |share: f64| {
            let mut c = small("corrupt", 9, false);
            c.honest.corrupt_share = share;
            let mut sim = Sim::new(c);
            sim.run();
            sim.world.audit().unwrap();
            (sim.det.vetoed_false + sim.det.vetoed_genuine, sim.det.cases_opened)
        };
        let (vetoes, cases) = run(0.0);
        assert!(vetoes + cases > 0, "an honest network detects");
        assert_eq!(run(1.0), (0, 0), "a fully bought network neither vetoes nor opens cases");
    }

    /// Correlated examiner errors concentrate false suspicion on odd-profile accounts: with every account odd and the rate multiplied, far
    /// more cases open against genuine people than with independent errors at the base rate.
    #[test]
    fn odd_profiles_raise_the_cases_on_genuine_people() {
        let run = |share: f64, mult: f64| {
            let mut c = small("odd", 10, false);
            c.detection.false_positive = 0.01;
            c.detection.odd_share = share;
            c.detection.odd_multiplier = mult;
            let mut sim = Sim::new(c);
            sim.run();
            sim.world.audit().unwrap();
            sim.det.cases_on_genuine
        };
        assert!(run(1.0, 10.0) > run(0.0, 1.0));
    }

    /// The false-accusation attack goes through the ordinary case procedure (the XP gate applies), is counted, keeps the audit and is off by default.
    #[test]
    fn false_accusations_use_the_ordinary_procedure_and_are_counted() {
        let run = |rate: f64| {
            let mut c = small("accuse", 11, false);
            c.attacker_accuse = rate;
            c.attacker_patience_days = 0;
            let mut sim = Sim::new(c);
            sim.run();
            sim.world.audit().unwrap();
            (sim.det.accusations, sim.det.cases_opened)
        };
        assert_eq!(run(0.0).0, 0);
        let (accusations, opened) = run(3.0);
        assert!(accusations <= opened);
    }

    /// D135 scenario: honest people lose keys and recover through previous guarantors; the books stay consistent, recoveries complete and
    /// take time, and the lever is off by default.
    #[test]
    fn lost_keys_are_recovered_through_previous_guarantors() {
        let run = |loss: f64| {
            let mut c = small("loss", 12, false);
            c.honest.key_loss = loss;
            let mut sim = Sim::new(c);
            sim.run();
            sim.world.audit().unwrap();
            sim.recovery
        };
        assert_eq!(run(0.0), [0; 6]);
        let r = run(0.99999);
        assert!(r[0] > 0, "keys are lost");
        assert!(r[1] > 0, "some people recover");
        assert!(r[1] <= r[0]);
    }

    /// The SVG of a run holds one polyline per panel and a dashed line per phase start.
    #[test]
    fn the_svg_plots_the_history_and_the_phases() {
        let mut sim = Sim::new(small("svg", 3, false));
        sim.run();
        let svg = sim.to_svg("test");
        assert!(svg.starts_with("<svg") && svg.trim_end().ends_with("</svg>"));
        assert_eq!(svg.matches("<polyline").count(), 3);
    }

    /// D151 appeal: wrongly invalidated people are reinstated, the state stays consistent and the lever is opt-in.
    #[test]
    fn appeals_reinstate_wrongly_invalidated_people() {
        let run = |appeal: f64| {
            let mut c = small("app", 6, false);
            c.detection.false_positive = 0.05;
            c.detection.appeal = appeal;
            let mut sim = Sim::new(c);
            sim.run();
            sim.world.audit().unwrap();
            (sim.det.genuine_invalidated, sim.det.appeals_restored)
        };
        let (wrong, none) = run(0.0);
        assert_eq!(none, 0);
        let (_, restored) = run(1.0);
        assert!(wrong == 0 || restored > 0, "with appeals every wrongly invalidated person is restored");
    }

    /// D151/D34: restoration, liquid recovery and the XP penalty keep the world consistent (audit) and are opt-in.
    #[test]
    fn the_remedy_levers_keep_the_audit() {
        let mut c = small("rem", 7, false);
        c.detection.false_positive = 0.05;
        c.detection.appeal = 1.0;
        c.detection.restore_links = true;
        c.detection.recover_liquid = true;
        c.detection.xp_penalty = 0.5;
        c.detection.subtree_cases = 10;
        let mut sim = Sim::new(c);
        sim.run();
        sim.world.audit().unwrap();
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
            ("world.k_step", Box::new(|c| c.world.k_step = Some(0))),
            (
                "world.k_xp_per_level",
                Box::new(|c| {
                    c.world.k_step = Some(50);
                    c.world.k_xp_per_level = 0;
                }),
            ),
            ("council_seats_per_thousand", Box::new(|c| c.world.council_seats_per_thousand = Some(0))),
            (
                "alternatives",
                Box::new(|c| {
                    c.world.council_seats_per_thousand = Some(2);
                    c.world.council_seats_per_d = Some(5);
                }),
            ),
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
        let run = |priority: Option<SearchOrder>| {
            let mut sim = Sim::new(RunConfig {
                seed: "efficiency".into(),
                honest_genesis: 30,
                attack_start_day: 30,
                days: 90,
                attackers: 4,
                max_subjects: 3000,
                ..RunConfig::default()
            });
            sim.cfg.world.search_order = priority;
            sim.run();
            sim
        };
        let (on, off) = (run(Some(SearchOrder::Both)), run(Some(SearchOrder::None)));
        assert_eq!(on.world.path_searches_exhausted(), 0);
        let key = |s: &Sim| s.history.iter().map(|r| (r.day, r.honest, r.attackers, r.supply, r.dirty, r.attack_edges)).collect::<Vec<_>>();
        assert_eq!(key(&on), key(&off));
        assert_eq!((on.det.cases_opened, on.det.genuine_invalidated), (off.det.cases_opened, off.det.genuine_invalidated));
    }
}
