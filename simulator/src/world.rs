//! The protocol world: accounts, Self-ID acts and XP, owned valences and K slots, special invitation links, disputes as
//! activity holds, and the Council-path gate (D84/D91/D104/D123/D124). Accepted rules are fixed here; configuration
//! exists only for the research levers in `Config`.
//!
//! Deviations from the retired Node model (declared, for the statistical baseline):
//! - the Council, the active count / difficulty D, the layered-support levels and the distance pruning are refreshed
//!   on daily ticks and due Council cutoffs, not on every call;
//! - Council ties break by account index (older first), not by id string;
//! - legacy policy options (immediate or spend-triggered XP, guarantee fees, vouching, limits) do not exist; ordinary XP is the D42
//!   maturity credit (`settle`).
use crate::amount::{Amount, SignedAmount};
use crate::chekharda::{self, CouncilOutcome, CouncilRound, CouncilVote, Kind as PositionKind, Ladder, Refusal, Side};
use crate::graph::Graph;
use crate::hash::FastMap;
use crate::paths::{layered_support, verify_family, PathFinder, Search, NO_LEVEL};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

#[path = "appeal.rs"]
mod appeal;
pub use appeal::{AppealExecution, AppealInitiator, AppealRecord, AppealRequest, AppealStage, AppealVote, APPEAL_FIXTURE_POLICY};

pub const DAY: i64 = 24;
/// Model assumptions while production authentication, ballot revision and same-hour membership ordering remain open.
pub const COUNCIL_EXECUTION_POLICY: &str = "trusted-ids/first-ballot/whole-hour-maturity-before-round/daily-entry-cache/v1";
/// Recording-time eligibility and roster, later activation, and trusted author cancellation; appeal adjudication remains separate.
pub const CASE_ADMISSION_POLICY: &str = "trusted-ids/recording-xp-and-mutual-roster/24h-activation/author-cancellation/v2";
/// D42: a valid, uncancelled Self-ID matures, and its ordinary XP is earned, exactly this many hours after creation.
pub const MATURITY_HOURS: i64 = 24;
/// The integrity coefficient is kept in millionths: 1,000,000 is 1 (integer arithmetic keeps results reproducible).
pub const COEF_ONE: u32 = 1_000_000;
/// Each matured Self-ID of the account itself restores this much integrity (1/1000, D165 variant).
pub const COEF_STEP: u32 = 1_000;
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

#[derive(Clone, Debug, PartialEq, Eq)]
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
    /// D131 (owner rule, D157): only the accused party of a case (the second subject) is excluded from paths and from layered support; the
    /// challenger stays usable. Both parties keep the D77 activity hold either way. `false` is the earlier reading (both parties excluded),
    /// kept as an ablation.
    pub exclude_targets_only: bool,
    /// The emission check (D84, owner rule): every Self-ID needs one current path from the emitter to a Council member of at most
    /// `max_nodes` nodes including both ends, whose intermediates (the guarantor first) are accepted, supported (D124) and not in a
    /// dispute (D131). `false` is the earlier reading used as an ablation: the bound counts from the guarantor and the guarantor needs no
    /// support of its own (the emitter one node further out).
    pub self_path_from_subject: bool,
    /// Base stake of the dispute ladder in whole FCTY (D159: 7). `None` switches stakes, custody and the sanction off: a case is then only
    /// an activity hold with a deadline (the unit tests and the ablation `--no-stakes`).
    pub base_stake: Option<u32>,
    /// The XP halving of losing participants (D159). `false` is an ablation (a counterfactual to attribute effects, not a protocol option).
    pub halve_losers: bool,
    /// Diagnostic ablation: current Council members keep their XP when they lose (isolates Council churn as the channel of the halving effect).
    pub halving_spares_council: bool,
    /// The integrity coefficient (D165, selected): XP is the number of live credits times an integrity coefficient in [0, 1] rounded down;
    /// a lost dispute halves the coefficient instead of the balance, and each matured Self-ID of the account itself restores 1/1000 of it,
    /// up to 1. `false` is the ablation that halves the balance as in the first reading of D159.
    pub integrity: bool,
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
            exclude_targets_only: true,
            self_path_from_subject: true,
            base_stake: None,
            halve_losers: true,
            halving_spares_council: false,
            integrity: true,
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

/// XP credited for one act: one unit of responsibility per recipient (the author first, then the guarantors of the creation-time
/// snapshot). The recipient list is shared between acts of one account while it does not change (an efficiency layout, D145).
#[derive(Clone, Debug)]
struct Credit {
    /// The logical credit time, `recorded_at + MATURITY_HOURS`, whenever the credit was materialized (D42).
    at: i64,
    revoked: bool,
    recipients: Arc<[Id]>,
}

/// An attributed obligation; repayment and cancellation retain the original amount as history.
#[derive(Clone, Debug)]
struct DebtTranche {
    case: u32,
    amount: Amount,
    remaining: Amount,
    repaid: Amount,
    cancelled: Amount,
}

#[derive(Clone, Debug)]
struct CaseEffects {
    accused: Id,
    winner: Side,
    reversed: bool,
    identity_subjects: Vec<Id>,
    source_acts: Vec<u32>,
    penalized_subjects: Vec<Id>,
}

/// Effects actually restored by a trusted, already authorized reversal; this is not appeal admission or adjudication.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RestorationOutcome {
    pub status_restored: bool,
    pub statuses_restored: u64,
    pub responsibility_units: u64,
    pub penalty_events: u64,
    pub debt_cancelled: Amount,
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
enum IntegrityAdjustmentKind {
    Penalty { fraction: f64, flat_cut: i32 },
    InheritedCap(u32),
}

#[derive(Clone, Debug)]
struct IntegrityAdjustment {
    at_maturities: u64,
    kind: IntegrityAdjustmentKind,
    case: Option<u32>,
    reversed: bool,
}

#[derive(Clone, Debug)]
struct Subject {
    status: Status,
    /// Effective XP: `raw` when the integrity variant is off, otherwise `floor(raw * coef)`. Always a cache of those two.
    xp: i32,
    /// Live credits (receipts not revoked, plus restored, minus balance penalties when the variant is off).
    raw: i32,
    /// Integrity coefficient in millionths (`COEF_ONE` unless the variant is on and the account lost disputes).
    coef: u32,
    own_maturities: u64,
    integrity_adjustments: Vec<IntegrityAdjustment>,
    /// The lowest coefficient the account ever had (diagnostic: how many accounts are recovering).
    low_coef: u32,
    liquid: Amount,
    /// Part of `liquid` locked as stakes of open dispute positions (D159 custody); never spendable or collectible meanwhile.
    reserved: Amount,
    /// Outstanding debt, repaid by burning later matured emission; never counted as a collected loss before repayment.
    debt: Amount,
    debt_tranches: Vec<DebtTranche>,
    debt_repaid: Amount,
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OpeningStage {
    Pending,
    Activated,
    Cancelled,
    Final,
    Moot,
}

/// The recorded opening transaction, distinct from the active dispute and any Self-ID receipt.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OpeningRecord {
    pub author: Id,
    pub accused: Id,
    pub recorded_at: i64,
    pub matures_at: i64,
    pub author_xp_at_recording: i32,
    pub accused_xp_at_recording: i32,
    /// Established current mutual guarantors at recording, not historical identity-case XP recipients.
    pub guarantors: Vec<Id>,
    pub activated_at: Option<i64>,
    pub stage: OpeningStage,
}

/// An open dispute: the ladder of positions, the accused, and every account
/// whose D77 activity hold it owns, with the hour the hold began.
#[derive(Clone, Debug)]
struct Case {
    ladder: Ladder<Id>,
    electorates: Vec<CouncilElectorate>,
    accused: Id,
    /// Per position (index = ordinal - 1): the part of its stake that is actually blocked in custody (D166: what exists is blocked, the
    /// rest of a lost stake becomes debt).
    backed: Vec<Backing>,
    /// `(account, hour the restriction began, whether it also excludes the account from paths)`.
    holds: Vec<(Id, i64, bool)>,
}

/// The Council membership fixed at the start of one voting round, retained with its result for review.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CouncilElectorate {
    pub number: u32,
    pub started_at: i64,
    pub members: Vec<Id>,
}

#[derive(Clone, Debug, Default)]
struct Backing {
    liquid: Amount,
    rights: Vec<u32>,
    limit: Amount,
}

impl Backing {
    fn total(&self) -> Amount {
        (self.liquid + Amount::coins(self.rights.len() as u64)).min(self.limit)
    }
}

/// Counters of the dispute economics, for results. Money is exact to 12 decimal places; durations are hours.
#[derive(Clone, Debug, Default)]
pub struct DisputeStats {
    pub openings_recorded: u64,
    pub openings_activated: u64,
    pub openings_cancelled: u64,
    pub opened: u64,
    /// Positions admitted after the first (the first is the opening).
    pub joined: u64,
    /// Entries refused, by the ladder or by funds.
    pub refused_closed: u64,
    pub refused_xp: u64,
    /// Entries whose liquid and mature Emitter backing was short (D166 allows entry; a loss creates debt).
    pub refused_funds: u64,
    /// FCTY of lost stakes that could not be collected and became debt, and debt later repaid from matured emission.
    pub debt_repaid: Amount,
    pub suspended_acts: u64,
    pub council_entries: u64,
    pub ballots: u64,
    pub council_rounds: u64,
    pub majority_deferrals: u64,
    pub automatic_deferrals: u64,
    /// Positions that moved the deadline later (an entry whose own window ended after the deadline in force).
    pub extensions: u64,
    pub settled: u64,
    pub author_cancelled: u64,
    pub moot: u64,
    pub accuser_won: u64,
    pub accused_won: u64,
    pub max_positions: u32,
    /// Total hours from opening to settlement, and hours of D77 activity restriction summed over every restricted account.
    pub duration_hours: i64,
    pub hold_hours: i64,
    pub staked: Amount,
    pub forfeited: Amount,
    pub stake_burned: Amount,
    pub sanction_collected: Amount,
    pub sanction_burned: Amount,
    pub debt_created: Amount,
    pub debt_cancelled: Amount,
    pub restorations: u64,
    pub statuses_restored: u64,
    pub units_restored: u64,
    pub xp_halved: u64,
    /// Council seats that changed hands, summed over the daily refreshes (members that left; the size changes are not counted).
    pub council_turnover: u64,
}

/// What settling a case did. `holds` lists every restricted account with the hours it was restricted.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CaseOutcome {
    pub settled_at: i64,
    /// Supplied trusted proof/evaluator override, distinct from the ladder's own result.
    pub forced_winner: Option<Side>,
    pub winner: Side,
    pub accuser: Id,
    pub accused: Id,
    pub positions: u32,
    pub position_history: Vec<chekharda::Position<Id>>,
    pub holds: Vec<(Id, i64)>,
    pub losers: Vec<Id>,
    /// Net actually collected value moved per account (liquid or mature Emitter backing; never uncollected debt).
    pub net: Vec<(Id, SignedAmount)>,
    /// New debt per account (the uncollectible part of a sanction).
    pub debts: Vec<(Id, Amount)>,
    pub council_rounds: Vec<CouncilRound<Id>>,
    pub council_electorates: Vec<CouncilElectorate>,
}

/// Author cancellation is a distinct terminal event, with no winning side or merits penalties.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CancellationOutcome {
    pub case: u32,
    pub author: Id,
    pub accused: Id,
    pub cancelled_at: i64,
    pub activated: bool,
    pub positions: Vec<chekharda::Position<Id>>,
    pub holds: Vec<(Id, i64)>,
    pub collected: Amount,
    pub debt_created: Amount,
    pub payouts: Vec<(Id, Amount)>,
    pub burned: Amount,
    pub net: Vec<(Id, SignedAmount)>,
    pub council_rounds: Vec<CouncilRound<Id>>,
    pub council_electorates: Vec<CouncilElectorate>,
    pub active_ballots: Vec<chekharda::Ballot<Id>>,
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
    /// Open cases in which the account is the accused: its unspent rights are frozen (protocol §17.4) until the last of them ends.
    frozen: Vec<u32>,
    cases: Vec<Option<Case>>,
    case_openings: Vec<Option<OpeningRecord>>,
    case_cancellations: Vec<Option<CancellationOutcome>>,
    case_effects: Vec<Option<CaseEffects>>,
    case_outcomes: Vec<Option<CaseOutcome>>,
    appeal_requests: Vec<AppealRequest>,
    appeals: Vec<AppealRecord>,
    /// Independent causes coexist: removing one case cannot erase another case or a separately authorized revocation.
    xp_revocations: FastMap<u32, Vec<Option<u32>>>,
    identity_cases: FastMap<Id, Vec<u32>>,
    independent_invalid: Vec<bool>,
    reserved_rights: HashSet<u32>,
    /// Liquid FCTY destroyed by disputes (burned stakes and sanction charges, D151 recovery); `sum(liquid) + liquid_destroyed` equals the
    /// converted entitlements.
    liquid_destroyed: Amount,
    pub stats: DisputeStats,
    /// Acts before this index are settled: matured and credited (or cancelled before maturity). Acts are recorded in time order, so the
    /// maturity queue is the act table itself and one cursor is the whole index.
    settled: usize,
    minted: i64,
    burned: Amount,
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
            frozen: Vec::new(),
            cases: Vec::new(),
            case_openings: Vec::new(),
            case_cancellations: Vec::new(),
            case_effects: Vec::new(),
            case_outcomes: Vec::new(),
            appeal_requests: Vec::new(),
            appeals: Vec::new(),
            xp_revocations: FastMap::default(),
            identity_cases: FastMap::default(),
            independent_invalid: Vec::new(),
            reserved_rights: HashSet::new(),
            liquid_destroyed: Amount::ZERO,
            stats: DisputeStats::default(),
            settled: 0,
            minted: 0,
            burned: Amount::ZERO,
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
            raw: 0,
            coef: COEF_ONE,
            own_maturities: 0,
            integrity_adjustments: Vec::new(),
            low_coef: COEF_ONE,
            liquid: Amount::ZERO,
            reserved: Amount::ZERO,
            debt: Amount::ZERO,
            debt_tranches: Vec::new(),
            debt_repaid: Amount::ZERO,
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
        self.independent_invalid.push(false);
        self.inv_units.push(0);
        self.hold.push(0);
        self.path_hold.push(0);
        self.frozen.push(0);
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
    pub fn liquid(&self, id: Id) -> Amount {
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
    pub fn burned(&self) -> Amount {
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
    pub fn supply(&self) -> Amount {
        Amount::coins(self.minted as u64) - self.burned
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
                act.status == ActStatus::Unspent && self.now - act.recorded_at >= min_age && !self.reserved_rights.contains(&a)
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
            act.status == ActStatus::Unspent && self.now - act.recorded_at >= self.cfg.spend_hours && !self.reserved_rights.contains(&a)
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
        // Self-ID maturity precedes each event time; simultaneous opening activations and Council results follow case ID order.
        loop {
            let opening = self.case_openings.iter().flatten().filter(|o| o.stage == OpeningStage::Pending && o.matures_at <= hour).map(|o| o.matures_at).min();
            let council = self.cases.iter().flatten().filter(|c| c.ladder.is_due(hour)).map(|c| c.ladder.deadline()).min();
            let appeals = self
                .appeals
                .iter()
                .filter_map(|a| match a.stage {
                    AppealStage::Pending => Some(a.matures_at),
                    AppealStage::Active => a.deadline(),
                    _ => None,
                })
                .filter(|&at| at <= hour)
                .min();
            let Some(at) = opening.into_iter().chain(council).chain(appeals).min() else { break };
            self.refresh_snapshot(at);
            for id in 0..self.cases.len() {
                if let Some(o) = self.case_openings[id].as_ref().filter(|o| o.stage == OpeningStage::Pending && o.matures_at == at) {
                    let (author, accused, xp) = (o.author, o.accused, o.author_xp_at_recording);
                    self.activate_case(id as u32, author, accused, xp);
                    let o = self.case_openings[id].as_mut().expect("recorded opening");
                    o.stage = OpeningStage::Activated;
                    o.activated_at = Some(at);
                    self.stats.openings_activated += 1;
                    continue;
                }
                let Some(c) = self.cases[id].as_mut().filter(|c| c.ladder.is_due(at)) else { continue };
                let number = c.ladder.council_round().expect("due Council round");
                let result = c.ladder.close_round(number, at).expect("due round closes once");
                self.stats.council_rounds += 1;
                match result.outcome {
                    CouncilOutcome::Defer => self.stats.majority_deferrals += 1,
                    CouncilOutcome::AutomaticDefer => self.stats.automatic_deferrals += 1,
                    _ => {}
                }
                if let Some(number) = c.ladder.council_round() {
                    c.electorates.push(CouncilElectorate { number, started_at: at, members: self.council.clone() });
                }
            }
            self.process_appeal_events(at);
        }
        self.refresh_snapshot(hour);
    }

    fn refresh_snapshot(&mut self, hour: i64) {
        self.now = hour;
        // Every Self-ID that matured up to `hour` earns its XP before any decision of this moment reads it (D42).
        self.settle();
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
        let previous = std::mem::take(&mut self.council);
        self.council = candidates.into_iter().take(size).map(|(_, _, i)| i).collect();
        self.stats.council_turnover += previous.iter().filter(|m| !self.council.contains(m)).count() as u64;
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
        let from_guarantor = self.cfg.max_nodes.map_or(u8::MAX - 1, |m| (m - 1) as u8);
        if self.cfg.self_path_from_subject && self.blocked.get(p as usize).copied().unwrap_or(true) {
            return false;
        }
        let limit = if self.cfg.self_path_from_subject { from_guarantor.saturating_sub(1) } else { from_guarantor };
        let d = self.dist_any.get(p as usize).copied().unwrap_or(NO_LEVEL);
        d != NO_LEVEL && d <= limit
    }

    // ---- XP and acts -----------------------------------------------------------------------------------------------

    fn refresh_xp(&mut self, id: Id) {
        let integrity = self.cfg.integrity;
        let s = &mut self.subjects[id as usize];
        s.xp = if integrity && s.raw > 0 { (i64::from(s.raw) * i64::from(s.coef) / i64::from(COEF_ONE)) as i32 } else { s.raw };
    }

    fn bump(&mut self, id: Id, delta: i32) {
        self.subjects[id as usize].raw += delta;
        self.refresh_xp(id);
    }

    /// `(accounts that ever lost integrity, of those how many have recovered some, how many are back at one)`.
    pub fn integrity_counts(&self) -> (usize, usize, usize) {
        let lost = self.subjects.iter().filter(|s| s.low_coef < COEF_ONE);
        let (mut n, mut up, mut full) = (0, 0, 0);
        for s in lost {
            n += 1;
            up += usize::from(s.coef > s.low_coef);
            full += usize::from(s.coef == COEF_ONE);
        }
        (n, up, full)
    }

    /// The integrity coefficient of an account in millionths (`COEF_ONE` when the variant is off or nothing was lost).
    pub fn coefficient(&self, id: Id) -> u32 {
        self.subjects[id as usize].coef
    }

    /// Authorized source revocation (a separately authorized correction, never a side effect of consumption): the credit of one source
    /// Self-ID is withdrawn from every recipient, once. Other sources keep their credits; nothing is replayed. Returns whether it changed.
    pub fn revoke_source_xp(&mut self, act_id: u32) -> bool {
        self.revoke_source_for(act_id, None)
    }

    fn revoke_source_for(&mut self, act_id: u32, case: Option<u32>) -> bool {
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
    fn settle(&mut self) {
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

    fn dispose(&mut self, act_id: u32, status: ActStatus) {
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

    fn require_free(&self, id: Id) -> Result<(), Reject> {
        if self.hold[id as usize] > 0 {
            Err(Reject("open-dispute activity restriction"))
        } else {
            Ok(())
        }
    }

    /// D167: an account with a negative emission balance (debt) cannot open invitations or guarantees from its side until it is repaid.
    fn require_solvent(&self, id: Id) -> Result<(), Reject> {
        if !self.subjects[id as usize].debt.is_zero() {
            Err(Reject("negative emission balance blocks invitations and guarantees"))
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
        if self.frozen[who as usize] > 0 {
            return Err(Reject("unspent rights are frozen while the account is accused"));
        }
        let a = &self.acts[act as usize];
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
        let a = &self.acts[act as usize];
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

    fn require_mature_own(&self, who: Id, act: u32, hours: i64, what: &'static str) -> Result<(), Reject> {
        let a = &self.acts[act as usize];
        if a.status != ActStatus::Unspent || self.reserved_rights.contains(&act) {
            return Err(Reject("emission is spent or disputed"));
        }
        if a.subject != who || self.now - a.recorded_at < hours {
            return Err(Reject(what));
        }
        Ok(())
    }

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
                self.deactivate(rel);
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
        self.require_solvent(creator)?;
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
        self.invitations.push(Invitation { creator, created_at: self.now, status: InvStatus::Pending, target: None, rels: Vec::new() });
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

    /// Veto during the freeze by a current guarantor of the creator. The burned right stays burned; the matured XP of the source Self-ID
    /// stays earned (D42: consumption neither earns nor loses it; a separate revocation needs a separately authorized source correction).
    pub fn cancel_invitation(&mut self, guarantor: Id, inv: u32) -> Result<(), Reject> {
        self.require_account(guarantor)?;
        let (creator, created_at, status) = {
            let i = &self.invitations[inv as usize];
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

    // ---- disputes as activity holds, identity verdicts -------------------------------------------------------------

    /// D77: every party of an open case is held (no Self-IDs, invitations or valences) until the case ends.
    /// Whether an account is unusable as a path intermediate right now: not accepted, not layered-supported (when required), or in a dispute.
    fn base_blocked(&self, id: Id) -> bool {
        !self.accepted(id) || (self.cfg.layered && self.level[id as usize] == NO_LEVEL)
    }

    /// D167 (D34 for an identity case): the guarantors liable for an account are exactly those who earned XP for its Self-ID acts, whether
    /// or not they still guarantee it. Acts whose credit is revoked or suspended contribute nobody.
    fn liable_guarantors(&self, accused: Id) -> Vec<Id> {
        let mut roster: Vec<Id> = Vec::new();
        for &a in &self.subjects[accused as usize].acts {
            if let Some(c) = &self.acts[a as usize].credit {
                if !c.revoked && c.recipients.len() > 1 {
                    roster.extend(c.recipients[1..].iter().copied().filter(|&g| g != accused));
                }
            }
        }
        roster.sort_unstable();
        roster.dedup();
        roster
    }

    /// Spendable liquid FCTY: what the account holds minus the stakes locked in open disputes.
    pub fn spendable(&self, id: Id) -> Amount {
        let s = &self.subjects[id as usize];
        s.liquid - s.reserved
    }
    pub fn debt(&self, id: Id) -> Amount {
        self.subjects[id as usize].debt
    }
    pub fn debt_repaid(&self, id: Id) -> Amount {
        self.subjects[id as usize].debt_repaid
    }
    pub fn responsibility_units(&self, id: Id) -> i32 {
        self.subjects[id as usize].raw
    }

    /// D166 custody: liquid first, then mature own Emitter rights, without withdrawing a winning stake's rights.
    fn reserve_stake(&mut self, who: Id, amount: Amount) -> Backing {
        let liquid = amount.min(self.spendable(who));
        let needed = (amount - liquid).atoms().div_ceil(crate::amount::SCALE);
        let rights: Vec<u32> = self.eligible_emissions(who, MATURITY_HOURS).into_iter().take(usize::try_from(needed).unwrap_or(usize::MAX)).collect();
        self.subjects[who as usize].reserved += liquid;
        self.reserved_rights.extend(rights.iter().copied());
        Backing { liquid, rights, limit: amount }
    }

    /// Materialize only rights actually collected by a settlement. Credit history is untouched.
    fn collect_backing(&mut self, who: Id, backing: &Backing) -> Amount {
        let mut paid = backing.liquid;
        for &a in &backing.rights {
            if self.acts[a as usize].status == ActStatus::Unspent {
                self.dispose(a, ActStatus::Converted);
                paid += (backing.limit - paid).min(Amount::ONE);
            }
        }
        self.subjects[who as usize].liquid -= paid;
        paid
    }

    fn stake_at(&self, ordinal: u32) -> Amount {
        self.cfg.base_stake.map_or(Amount::ZERO, |base| chekharda::stake(ordinal, base))
    }

    /// Restrict an account for a case (D77) and, when `path`, exclude it from counted paths (D131/D157).
    fn hold_for(&mut self, id: Id, path: bool) {
        self.hold[id as usize] += 1;
        if path && self.cfg.exclude_disputed {
            self.path_hold[id as usize] += 1;
            self.blocked[id as usize] = true;
        }
    }

    fn release_hold(&mut self, id: Id, path: bool) {
        self.hold[id as usize] -= 1;
        if path && self.cfg.exclude_disputed {
            self.path_hold[id as usize] -= 1;
        }
        self.blocked[id as usize] = (self.cfg.exclude_disputed && self.path_hold[id as usize] > 0) || self.base_blocked(id);
    }

    /// Whether an account of a case is excluded from paths (D157: the accused; D131 earlier reading: the challenger as well).
    fn path_held(&self, case: &Case, id: Id) -> bool {
        id == case.accused || (!self.cfg.exclude_targets_only && id == case.ladder.positions()[0].who)
    }

    /// Supply an already-active dispute fixture without inventing an earlier raw opening transaction.
    /// Normal transaction recording uses `record_case_opening` and activates only after its 24-hour maturity.
    pub fn begin_case(&mut self, subjects: &[Id]) -> Result<u32, Reject> {
        if subjects.len() < 2 || subjects[0] == subjects[1] {
            return Err(Reject("participation requires distinct case subjects"));
        }
        for &s in subjects {
            self.require_account(s)?;
        }
        let (challenger, accused) = (subjects[0], subjects[1]);
        let case = self.cases.len() as u32;
        self.cases.push(None);
        self.case_openings.push(None);
        self.case_cancellations.push(None);
        self.case_effects.push(None);
        self.case_outcomes.push(None);
        self.activate_case(case, challenger, accused, self.subjects[challenger as usize].xp);
        Ok(case)
    }

    /// Record an accepted opening. XP eligibility and the event-time guarantor roster are frozen here, once.
    pub fn record_case_opening(&mut self, subjects: &[Id]) -> Result<u32, Reject> {
        if subjects.len() != 2 || subjects[0] == subjects[1] {
            return Err(Reject("participation requires distinct case subjects"));
        }
        for &id in subjects {
            if id as usize >= self.subjects.len() {
                return Err(Reject("no such account"));
            }
            self.require_account(id)?;
        }
        let (author, accused) = (subjects[0], subjects[1]);
        let author_xp_at_recording = self.xp(author);
        if author_xp_at_recording <= self.xp(accused) {
            return Err(Reject("XP is not above the challenged transaction owner"));
        }
        let matures_at = self.now.checked_add(MATURITY_HOURS).ok_or(Reject("opening maturity exceeds the simulator's time representation"))?;
        let opening = OpeningRecord {
            author,
            accused,
            recorded_at: self.now,
            matures_at,
            author_xp_at_recording,
            accused_xp_at_recording: self.xp(accused),
            guarantors: self.mutual_partners(author),
            activated_at: None,
            stage: OpeningStage::Pending,
        };
        let case = self.cases.len() as u32;
        self.cases.push(None);
        self.case_openings.push(Some(opening));
        self.case_cancellations.push(None);
        self.case_effects.push(None);
        self.case_outcomes.push(None);
        self.stats.openings_recorded += 1;
        Ok(case)
    }

    pub fn case_opening(&self, case: u32) -> Option<&OpeningRecord> {
        self.case_openings.get(case as usize).and_then(Option::as_ref)
    }

    pub fn pending_openings(&self) -> usize {
        self.case_openings.iter().flatten().filter(|o| o.stage == OpeningStage::Pending).count()
    }

    /// Before maturity only the recorded author can cancel; the pending opening owns no stake or restriction to release.
    pub fn cancel_pending_opening(&mut self, case: u32, author: Id) -> Result<(), Reject> {
        let opening = self.case_openings.get_mut(case as usize).and_then(Option::as_mut).ok_or(Reject("no recorded opening"))?;
        if opening.author != author || opening.stage != OpeningStage::Pending || self.now >= opening.matures_at {
            return Err(Reject("not the author's pending opening before maturity"));
        }
        opening.stage = OpeningStage::Cancelled;
        self.case_cancellations[case as usize] = Some(CancellationOutcome {
            case,
            author,
            accused: opening.accused,
            cancelled_at: self.now,
            activated: false,
            positions: Vec::new(),
            holds: Vec::new(),
            collected: Amount::ZERO,
            debt_created: Amount::ZERO,
            payouts: Vec::new(),
            burned: Amount::ZERO,
            net: Vec::new(),
            council_rounds: Vec::new(),
            council_electorates: Vec::new(),
            active_ballots: Vec::new(),
        });
        self.stats.openings_cancelled += 1;
        Ok(())
    }

    pub fn case_cancellation(&self, case: u32) -> Option<&CancellationOutcome> {
        self.case_cancellations.get(case as usize).and_then(Option::as_ref)
    }

    pub fn case_outcome(&self, case: u32) -> Option<&CaseOutcome> {
        self.case_outcomes.get(case as usize).and_then(Option::as_ref)
    }

    /// Cancel this author's own pending opening or still-open active dispute, including Council deferrals.
    pub fn cancel_case_opening(&mut self, case: u32, author: Id) -> Result<CancellationOutcome, Reject> {
        if self.case_opening(case).is_some_and(|o| o.stage == OpeningStage::Pending) {
            self.cancel_pending_opening(case, author)?;
            return Ok(self.case_cancellation(case).expect("just cancelled pending opening").clone());
        }
        let c = self.case_ref(case)?;
        if c.ladder.positions()[0].who != author || c.ladder.is_final(self.now) {
            return Err(Reject("not the author of an open dispute"));
        }
        let c = self.cases[case as usize].take().expect("checked active case");
        let positions = c.ladder.positions().to_vec();
        let holds = self.release_case(&c);
        let collected = self.collect_backing(author, &c.backed[0]);
        let debt_created = positions[0].stake - collected;
        self.record_debt(author, debt_created, case);
        let defenders: Vec<Id> = positions.iter().filter(|p| p.kind == PositionKind::Participant && p.side == Side::Accused).map(|p| p.who).collect();
        let mut payouts = Vec::with_capacity(defenders.len());
        let mut net = vec![(author, SignedAmount::negative(collected).expect("stake fits signed accounting"))];
        let mut burned = Amount::ZERO;
        if let Some((share, remainder)) = collected.split_evenly(defenders.len()) {
            for (index, defender) in defenders.into_iter().enumerate() {
                let paid = share + Amount::from_atoms(u128::from(index < remainder));
                self.subjects[defender as usize].liquid += paid;
                payouts.push((defender, paid));
                net.push((defender, SignedAmount::from_amount(paid).expect("stake share fits signed accounting")));
            }
            self.stats.forfeited += collected;
        } else {
            self.destroy_liquid(collected);
            self.stats.stake_burned += collected;
            burned = collected;
        }
        if let Some(opening) = self.case_openings[case as usize].as_mut() {
            opening.stage = OpeningStage::Cancelled;
        }
        let outcome = CancellationOutcome {
            case,
            author,
            accused: c.accused,
            cancelled_at: self.now,
            activated: true,
            positions,
            holds,
            collected,
            debt_created,
            payouts,
            burned,
            net,
            council_rounds: c.ladder.rounds().to_vec(),
            active_ballots: c.ladder.active_ballots().to_vec(),
            council_electorates: c.electorates,
        };
        self.stats.author_cancelled += 1;
        self.case_cancellations[case as usize] = Some(outcome.clone());
        Ok(outcome)
    }

    /// Activate in its existing case slot. Recording already fixed admission; later XP or membership changes cannot reject it.
    fn activate_case(&mut self, case_id: u32, challenger: Id, accused: Id, admission_xp: i32) {
        debug_assert!(self.cases[case_id as usize].is_none() && self.case_effects[case_id as usize].is_none());
        let stake = self.stake_at(1);
        let backed = self.reserve_stake(challenger, stake);
        self.stats.refused_funds += u64::from(backed.total() < stake);
        let ladder = Ladder::open(challenger, admission_xp, self.now, self.cfg.base_stake.unwrap_or(0));
        let mut case = Case { ladder, electorates: Vec::new(), accused, backed: vec![backed], holds: Vec::new() };
        self.stats.staked += stake;
        self.stats.opened += 1;
        self.stats.max_positions = self.stats.max_positions.max(1);
        let (path_challenger, path_accused) = (self.path_held(&case, challenger), self.path_held(&case, accused));
        case.holds = vec![(challenger, self.now, path_challenger), (accused, self.now, path_accused)];
        self.hold_for(challenger, path_challenger);
        self.hold_for(accused, path_accused);
        self.frozen[accused as usize] += 1;
        self.cases[case_id as usize] = Some(case);
    }

    fn case_ref(&self, case: u32) -> Result<&Case, Reject> {
        self.cases.get(case as usize).and_then(Option::as_ref).ok_or(Reject("no such open case"))
    }

    /// The shared deadline of an open case (hours).
    pub fn case_deadline(&self, case: u32) -> Option<i64> {
        self.case_ref(case).ok().map(|c| c.ladder.deadline())
    }
    /// Whether the case is final now: the deadline is the cutoff (D167).
    pub fn case_final(&self, case: u32) -> bool {
        self.case_ref(case).is_ok_and(|c| c.ladder.is_final(self.now))
    }
    /// `(positions, XP the next entrant must exceed, stake of the next position, side of the next position, Council entered)`.
    pub fn case_state(&self, case: u32) -> Option<(u32, i32, Option<Amount>, Side, bool)> {
        let c = self.case_ref(case).ok()?;
        let next = self.cfg.base_stake.map_or(Some(Amount::ZERO), |base| chekharda::checked_stake(c.ladder.next_ordinal(), base));
        Some((c.ladder.len(), c.ladder.xp_to_beat(), next, c.ladder.next_side(), c.ladder.council_entered()))
    }
    /// Provenance of a case's deadline: every position with its window, proposal and the deadline before and after it.
    pub fn case_positions(&self, case: u32) -> Vec<chekharda::Position<Id>> {
        self.case_ref(case).map_or_else(|_| Vec::new(), |c| c.ladder.positions().to_vec())
    }
    /// The current voting round and its frozen electorate; final Council decisions have no active round.
    pub fn case_council_round(&self, case: u32) -> Option<&CouncilElectorate> {
        let c = self.case_ref(case).ok()?;
        let number = c.ladder.council_round()?;
        c.electorates.iter().find(|e| e.number == number)
    }
    pub fn case_council_rounds(&self, case: u32) -> &[CouncilRound<Id>] {
        self.case_ref(case).map_or(&[], |c| c.ladder.rounds())
    }
    pub fn case_accused(&self, case: u32) -> Option<Id> {
        self.case_ref(case).ok().map(|c| c.accused)
    }

    /// An ordinary entry: the next position takes the side opposite to the last one, needs more XP than the last ordinary participant,
    /// and reserves liquid and mature Emitter backing. Returns the ordinal. Only an admitted position changes the ordinal, the deadline,
    /// the custody and the restrictions; a refusal changes nothing.
    pub fn join_case(&mut self, case: u32, who: Id) -> Result<u32, Reject> {
        self.require_account(who)?;
        let xp = self.subjects[who as usize].xp;
        let (check, ordinal) = {
            let c = self.case_ref(case)?;
            (c.ladder.check(who, PositionKind::Participant, xp, self.now), c.ladder.next_ordinal())
        };
        if let Err(r) = check {
            return Err(self.refuse(r));
        }
        let stake = self.stake_at(ordinal);
        let backed = self.reserve_stake(who, stake);
        self.stats.refused_funds += u64::from(backed.total() < stake);
        self.admit(case, who, PositionKind::Participant, xp, stake, backed)
    }

    /// Collective Council entry (D161): any Council member, no XP condition and no stake, one terminal position on the shared clock.
    pub fn council_join(&mut self, case: u32, member: Id) -> Result<u32, Reject> {
        self.require_account(member)?;
        if !self.council_mask.get(member as usize).copied().unwrap_or(false) {
            return Err(Reject("not a Council member"));
        }
        let check = self.case_ref(case)?.ladder.check(member, PositionKind::Council, 0, self.now);
        if let Err(r) = check {
            return Err(self.refuse(r));
        }
        let ordinal = self.admit(case, member, PositionKind::Council, 0, Amount::ZERO, Backing::default())?;
        let c = self.cases[case as usize].as_mut().expect("admitted case");
        c.electorates.push(CouncilElectorate {
            number: c.ladder.council_round().expect("Council entry starts a round"),
            started_at: self.now,
            members: self.council.clone(),
        });
        self.stats.council_entries += 1;
        Ok(ordinal)
    }

    fn refuse(&mut self, r: Refusal) -> Reject {
        match r {
            Refusal::Closed => {
                self.stats.refused_closed += 1;
                Reject("the dispute is final")
            }
            Refusal::AlreadyParticipant => Reject("already a participant"),
            Refusal::XpNotAbove => {
                self.stats.refused_xp += 1;
                Reject("XP is not above the previous participant")
            }
            Refusal::CouncilEntered => Reject("the Council entered; it is the terminal entrant"),
            Refusal::StakeOverflow => Reject("stake exceeds the simulator's retained nominal ceiling"),
        }
    }

    fn admit(&mut self, case: u32, who: Id, kind: PositionKind, xp: i32, stake: Amount, backed: Backing) -> Result<u32, Reject> {
        let now = self.now;
        let c = self.cases[case as usize].as_mut().expect("checked open");
        let (n, extended) = {
            let p = c.ladder.admit(who, kind, xp, now).map_err(|_| Reject("entry refused"))?;
            (p.n, p.extended())
        };
        c.holds.push((who, now, false));
        c.backed.push(backed);
        self.stats.staked += stake;
        self.stats.joined += 1;
        self.stats.extensions += u64::from(extended);
        self.stats.max_positions = self.stats.max_positions.max(n);
        self.hold_for(who, false);
        Ok(n)
    }

    /// A Council ballot (D66, D111): recorded for the vote only; it never changes the ordinal or the deadline.
    pub fn council_ballot(&mut self, case: u32, member: Id, expected_round: u32, choice: CouncilVote) -> bool {
        let Some(c) = self.cases.get_mut(case as usize).and_then(Option::as_mut) else { return false };
        if !c.electorates.last().is_some_and(|e| e.number == expected_round && e.members.contains(&member)) {
            return false;
        }
        let ok = c.ladder.ballot(member, expected_round, choice, self.now);
        if ok {
            self.stats.ballots += 1;
        }
        ok
    }

    /// Release the restrictions and the custody of a case; returns the hours each restricted account was held.
    fn release_case(&mut self, case: &Case) -> Vec<(Id, i64)> {
        let mut held = Vec::with_capacity(case.holds.len());
        for &(id, since, path) in &case.holds {
            held.push((id, self.now - since));
            self.release_hold(id, path);
        }
        self.frozen[case.accused as usize] -= 1;
        for (p, b) in case.ladder.positions().iter().zip(&case.backed) {
            self.subjects[p.who as usize].reserved -= b.liquid;
            for a in &b.rights {
                self.reserved_rights.remove(a);
            }
        }
        self.stats.hold_hours += held.iter().map(|&(_, h)| h).sum::<i64>();
        held
    }

    /// End a case without a verdict (mooted: the accused was dealt with elsewhere, or the process ended it): custody is released, nothing
    /// is paid or charged and no XP changes.
    pub fn end_case(&mut self, case: u32) {
        if let Some(c) = self.cases[case as usize].take() {
            self.release_case(&c);
            self.stats.moot += 1;
            if let Some(opening) = self.case_openings[case as usize].as_mut() {
                opening.stage = OpeningStage::Moot;
            }
        }
    }

    /// Collect liquid and mature Emitter rights; any shortfall becomes debt. Returns actual collection.
    fn charge(&mut self, id: Id, amount: Amount, case: u32) -> Amount {
        let backing = self.reserve_stake(id, amount);
        self.subjects[id as usize].reserved -= backing.liquid;
        for a in &backing.rights {
            self.reserved_rights.remove(a);
        }
        let collected = self.collect_backing(id, &backing);
        let owed = amount - collected;
        self.record_debt(id, owed, case);
        collected
    }

    fn record_debt(&mut self, id: Id, amount: Amount, case: u32) {
        if !amount.is_zero() {
            let subject = &mut self.subjects[id as usize];
            subject.debt_tranches.push(DebtTranche { case, amount, remaining: amount, repaid: Amount::ZERO, cancelled: Amount::ZERO });
            subject.debt += amount;
            self.stats.debt_created += amount;
        }
    }

    fn add_debt(&mut self, id: Id, amount: Amount, case: u32, debts: &mut Vec<(Id, Amount)>) {
        if !amount.is_zero() {
            self.record_debt(id, amount, case);
            debts.push((id, amount));
        }
    }

    fn destroy_liquid(&mut self, amount: Amount) {
        self.liquid_destroyed += amount;
        self.burned += amount;
    }

    /// Settle a case at its deadline (D159, D161, D162): `forced` overrides the winning side when a process outside the ladder decided it
    /// (the proof of reality of a genuine accused, D136); otherwise the last unopposed side wins, or the Council's equal-vote majority once
    /// it entered. Every winner takes its stake back and the stake of the position directly below it; every loser forfeits to the position
    /// directly above it (the stake of a losing top position is burned); losing participants lose half their XP; when the accused lost, the
    /// base stake is charged to the accused (paid to the accuser) and to each guarantor of the accused at opening (burned), the uncollectible
    /// part becoming debt. Refused before the deadline.
    pub fn settle_case(&mut self, case: u32, forced: Option<Side>) -> Result<CaseOutcome, Reject> {
        if !self.case_final(case) {
            return Err(Reject("the dispute is not final yet"));
        }
        let c = self.cases[case as usize].take().expect("final implies open");
        if let Some(opening) = self.case_openings[case as usize].as_mut() {
            opening.stage = OpeningStage::Final;
        }
        let mut settlement = c.ladder.settle().expect("final Council decision or ordinary cutoff");
        if let Some(side) = forced {
            if side != settlement.winner {
                // Recompute the settlement for the forced side with the same ladder.
                settlement = c.ladder.settle_for(side);
            }
        }
        let positions: Vec<chekharda::Position<Id>> = c.ladder.positions().to_vec();
        let who_at = |n: u32| positions[n as usize - 1].who;
        let holds = self.release_case(&c);
        let mut net: Vec<(Id, SignedAmount)> = Vec::new();
        let mut debts: Vec<(Id, Amount)> = Vec::new();
        // D166: a lost stake pays what was blocked; the unblocked part is debt of the loser (a negative emission balance, repaid from later
        // emission) and is never paid to the winner.
        for &(from, to, amount) in &settlement.forfeits {
            let (f, t) = (who_at(from), who_at(to));
            let paid = self.collect_backing(f, &c.backed[from as usize - 1]).min(amount);
            self.subjects[t as usize].liquid += paid;
            self.stats.forfeited += paid;
            net.push((f, SignedAmount::negative(paid).expect("collected value fits signed accounting")));
            net.push((t, SignedAmount::from_amount(paid).expect("collected value fits signed accounting")));
            self.add_debt(f, amount - paid, case, &mut debts);
        }
        for &(position, amount) in &settlement.burns {
            let loser = who_at(position);
            let paid = self.collect_backing(loser, &c.backed[position as usize - 1]).min(amount);
            self.destroy_liquid(paid);
            self.stats.stake_burned += paid;
            net.push((loser, SignedAmount::negative(paid).expect("collected value fits signed accounting")));
            self.add_debt(loser, amount - paid, case, &mut debts);
        }
        let mut losers = Vec::new();
        for &n in &settlement.losers {
            let p = &positions[n as usize - 1];
            if self.cfg.halve_losers && !(self.cfg.halving_spares_council && self.council_mask.get(p.who as usize).copied().unwrap_or(false)) {
                let cut = self.penalize_xp_for_case(p.who, 0.5, case);
                self.stats.xp_halved += cut as u64;
                losers.push(p.who);
            }
        }
        if settlement.accused_lost {
            // The accused is the losing transaction owner even without a staked ladder position (D55/D165).
            if self.cfg.halve_losers
                && !losers.contains(&c.accused)
                && !(self.cfg.halving_spares_council && self.council_mask.get(c.accused as usize).copied().unwrap_or(false))
            {
                let cut = self.penalize_xp_for_case(c.accused, 0.5, case);
                self.stats.xp_halved += cut as u64;
                losers.push(c.accused);
            }
            if let Some(base) = self.cfg.base_stake {
                let base = Amount::coins(u64::from(base));
                let accuser = c.ladder.positions()[0].who;
                let got = self.charge(c.accused, base, case);
                self.subjects[accuser as usize].liquid += got;
                self.stats.sanction_collected += got;
                net.push((c.accused, SignedAmount::negative(got).expect("collected value fits signed accounting")));
                net.push((accuser, SignedAmount::from_amount(got).expect("collected value fits signed accounting")));
                debts.push((c.accused, base - got));
                // Pending acts can mature during the hold: liability uses all actual receipts before the verdict/cut, not an opening snapshot.
                for g in self.liable_guarantors(c.accused) {
                    if g != c.accused {
                        let burned = self.charge(g, base, case);
                        self.destroy_liquid(burned);
                        self.stats.sanction_burned += burned;
                        net.push((g, SignedAmount::negative(burned).expect("collected value fits signed accounting")));
                        debts.push((g, base - burned));
                    }
                }
            }
        }
        self.stats.settled += 1;
        self.stats.duration_hours += self.now - c.ladder.opened_at;
        if settlement.winner == Side::Accuser {
            self.stats.accuser_won += 1;
        } else {
            self.stats.accused_won += 1;
        }
        self.case_effects[case as usize] = Some(CaseEffects {
            accused: c.accused,
            winner: settlement.winner,
            reversed: false,
            identity_subjects: Vec::new(),
            source_acts: Vec::new(),
            penalized_subjects: losers.clone(),
        });
        let outcome = CaseOutcome {
            settled_at: self.now,
            forced_winner: forced,
            winner: settlement.winner,
            accuser: positions[0].who,
            accused: c.accused,
            positions: positions.len() as u32,
            position_history: positions.clone(),
            holds,
            losers,
            net,
            debts,
            council_rounds: c.ladder.rounds().to_vec(),
            council_electorates: c.electorates,
        };
        self.case_outcomes[case as usize] = Some(outcome.clone());
        Ok(outcome)
    }

    /// Apply a settled identity verdict with its case provenance; no evaluator labels or appeal powers enter World.
    pub fn apply_case_identity_verdict(&mut self, case: u32) -> Result<(), Reject> {
        let accused = self.case_effects.get(case as usize).and_then(Option::as_ref).ok_or(Reject("no settled case effects"))?.accused;
        self.apply_case_identity_verdict_to(case, accused)
    }

    /// Execute the same authorized verdict for an explicitly supplied related account, such as D127's duplicate holder.
    pub fn apply_case_identity_verdict_to(&mut self, case: u32, accused: Id) -> Result<(), Reject> {
        let effects = self.case_effects.get(case as usize).and_then(Option::as_ref).ok_or(Reject("no settled case effects"))?;
        if effects.reversed || effects.winner != Side::Accuser || effects.identity_subjects.contains(&accused) || accused as usize >= self.subjects.len() {
            return Err(Reject("no unapplied adverse identity verdict"));
        }
        self.identity_cases.entry(accused).or_default().push(case);
        self.subjects[accused as usize].status = Status::False;
        let chain = self.subjects[accused as usize].acts.clone();
        let mut sources = Vec::new();
        for act_id in chain {
            let act = &mut self.acts[act_id as usize];
            if act.status == ActStatus::Unspent {
                act.status = ActStatus::Cancelled;
                self.vault -= 1;
                self.burned += Amount::ONE;
            }
            if act.credit.is_some() {
                sources.push(act_id);
                self.revoke_source_for(act_id, Some(case));
            }
        }
        let effects = self.case_effects[case as usize].as_mut().expect("checked settled effects");
        effects.identity_subjects.push(accused);
        effects.source_acts.extend(sources);
        effects.source_acts.sort_unstable();
        let subject = &mut self.subjects[accused as usize];
        while subject.first_unspent < subject.acts.len() && self.acts[subject.acts[subject.first_unspent] as usize].status != ActStatus::Unspent {
            subject.first_unspent += 1;
        }
        Ok(())
    }

    /// Attribute a separately authorized role-specific penalty to its settled case, including the runner's optional inviter penalty.
    pub fn apply_case_xp_penalty(&mut self, case: u32, subject: Id, fraction: f64) -> Result<i32, Reject> {
        if !fraction.is_finite() || !(0.0..=1.0).contains(&fraction) {
            return Err(Reject("XP penalty fraction must be finite and between zero and one"));
        }
        let effects = self.case_effects.get_mut(case as usize).and_then(Option::as_mut).ok_or(Reject("no settled case effects"))?;
        if effects.reversed || subject as usize >= self.subjects.len() {
            return Err(Reject("no active case penalty target"));
        }
        if !effects.penalized_subjects.contains(&subject) {
            effects.penalized_subjects.push(subject);
        }
        Ok(self.penalize_xp_for_case(subject, fraction, case))
    }

    /// Trusted execution of D177/D178 after an authorized reversal, not a way to admit or win an appeal.
    pub fn restore_case_effects(&mut self, case: u32) -> Result<RestorationOutcome, Reject> {
        let effects = self.case_effects.get(case as usize).and_then(Option::as_ref).ok_or(Reject("no settled case effects"))?.clone();
        if effects.reversed {
            return Err(Reject("case effects already reversed"));
        }
        // A completed key recovery moved XP under a separate contract. Do not silently redirect historical receipts or an inherited cap.
        let mut affected = effects.penalized_subjects.clone();
        affected.push(effects.accused);
        affected.extend(&effects.identity_subjects);
        for &act in &effects.source_acts {
            affected.extend(self.acts[act as usize].credit.as_ref().expect("recorded receipt").recipients.iter().copied());
        }
        if self.recovery_log.iter().any(|&(_, source, _)| affected.contains(&source)) {
            return Err(Reject("restoration across completed key recovery needs its migration contract"));
        }
        let mut restored = RestorationOutcome::default();
        for &subject in &effects.identity_subjects {
            let causes = self.identity_cases.get_mut(&subject).expect("recorded identity cause");
            causes.retain(|&id| id != case);
            if causes.is_empty() && !self.independent_invalid[subject as usize] {
                self.subjects[subject as usize].status = Status::Accepted;
                restored.statuses_restored += 1;
                restored.status_restored |= subject == effects.accused;
            }
        }
        for &act in &effects.source_acts {
            let causes = self.xp_revocations.get_mut(&act).expect("recorded source cause");
            causes.retain(|&id| id != Some(case));
            if causes.is_empty() {
                self.xp_revocations.remove(&act);
                let credit = self.acts[act as usize].credit.as_mut().expect("recorded receipt");
                credit.revoked = false;
                let recipients = credit.recipients.to_vec();
                for recipient in recipients {
                    self.bump(recipient, 1);
                    restored.responsibility_units += 1;
                }
            }
        }
        restored.penalty_events = self.restore_case_xp_penalties(case);
        for subject in &mut self.subjects {
            for debt in subject.debt_tranches.iter_mut().filter(|d| d.case == case) {
                let cancelled = debt.remaining;
                subject.debt -= cancelled;
                debt.cancelled += cancelled;
                debt.remaining = Amount::ZERO;
                restored.debt_cancelled += cancelled;
            }
        }
        self.case_effects[case as usize].as_mut().expect("checked effects").reversed = true;
        self.stats.restorations += 1;
        self.stats.statuses_restored += restored.statuses_restored;
        self.stats.units_restored += restored.responsibility_units;
        self.stats.debt_cancelled += restored.debt_cancelled;
        Ok(restored)
    }

    pub fn invalidate_identity(&mut self, id: Id) {
        self.independent_invalid[id as usize] = true;
        self.subjects[id as usize].status = Status::False;
    }

    /// D151 appeal: a wrongly invalidated person who proves reality is an account again. Credit revoked with the cut chain stays revoked,
    /// and links that others left are not restored. A retired lost-key account (D135) is never reinstated. Returns whether anything changed.
    pub fn reinstate_identity(&mut self, id: Id) -> bool {
        let s = &mut self.subjects[id as usize];
        if s.status == Status::False && !s.lost_key && self.identity_cases.get(&id).is_none_or(|cases| cases.is_empty()) {
            self.independent_invalid[id as usize] = false;
            s.status = Status::Accepted;
            return true;
        }
        false
    }

    /// D34/D55 (trusted execution, not adjudication): the account loses `fraction` of its current XP, recorded as an authorized adjustment.
    /// Deviation: the snapshot of the losing act is not kept; the penalty applies to the XP the account holds now. Returns the XP removed.
    pub fn penalize_xp(&mut self, id: Id, fraction: f64) -> i32 {
        self.apply_xp_penalty(id, fraction, None)
    }

    fn penalize_xp_for_case(&mut self, id: Id, fraction: f64, case: u32) -> i32 {
        self.apply_xp_penalty(id, fraction, Some(case))
    }

    fn apply_xp_penalty(&mut self, id: Id, fraction: f64, case: Option<u32>) -> i32 {
        assert!(fraction.is_finite() && (0.0..=1.0).contains(&fraction), "XP penalty fraction must be finite and between zero and one");
        let s = &mut self.subjects[id as usize];
        let flat_cut = if self.cfg.integrity { 0 } else { (f64::from(s.xp.max(0)) * fraction).floor() as i32 };
        s.integrity_adjustments.push(IntegrityAdjustment {
            at_maturities: s.own_maturities,
            kind: IntegrityAdjustmentKind::Penalty { fraction, flat_cut },
            case,
            reversed: false,
        });
        if self.cfg.integrity {
            // The integrity variant: the coefficient is cut, the credits stay; the XP removed is the visible drop (rounded down).
            let before = s.xp;
            s.coef = (f64::from(s.coef) * (1.0 - fraction)).floor() as u32;
            s.low_coef = s.low_coef.min(s.coef);
            self.refresh_xp(id);
            return before - self.subjects[id as usize].xp;
        }
        self.bump(id, -flat_cut);
        self.subjects[id as usize].penalized_xp += flat_cut;
        flat_cut
    }

    fn replay_integrity(s: &Subject) -> Option<u32> {
        fn repair(coef: u32, count: u64) -> u32 {
            let steps = count.min(u64::from(COEF_ONE / COEF_STEP));
            (u64::from(coef) + steps * u64::from(COEF_STEP)).min(u64::from(COEF_ONE)) as u32
        }
        let (mut coef, mut maturities) = (COEF_ONE, 0);
        for adjustment in &s.integrity_adjustments {
            if adjustment.at_maturities < maturities || adjustment.at_maturities > s.own_maturities {
                return None;
            }
            coef = repair(coef, adjustment.at_maturities - maturities);
            maturities = adjustment.at_maturities;
            if !adjustment.reversed {
                coef = match adjustment.kind {
                    IntegrityAdjustmentKind::Penalty { fraction, .. } => (f64::from(coef) * (1.0 - fraction)).floor() as u32,
                    IntegrityAdjustmentKind::InheritedCap(cap) => coef.min(cap),
                };
            }
        }
        Some(repair(coef, s.own_maturities - maturities))
    }

    /// Remove this case's penalty events once. The balance-halving ablation returns recorded cuts without repricing later cuts.
    fn restore_case_xp_penalties(&mut self, case: u32) -> u64 {
        let mut removed = 0;
        for id in 0..self.subjects.len() {
            let s = &mut self.subjects[id];
            let (mut count, mut flat_restored) = (0, 0);
            for adjustment in &mut s.integrity_adjustments {
                if adjustment.case == Some(case) && !adjustment.reversed {
                    if let IntegrityAdjustmentKind::Penalty { flat_cut, .. } = adjustment.kind {
                        adjustment.reversed = true;
                        count += 1;
                        flat_restored += flat_cut;
                    }
                }
            }
            if count != 0 {
                if self.cfg.integrity {
                    s.coef = Self::replay_integrity(s).expect("ordered integrity history");
                } else {
                    s.raw += flat_restored;
                    s.penalized_xp -= flat_restored;
                }
                self.refresh_xp(id as Id);
                removed += count;
            }
        }
        removed
    }

    fn audit_integrity(&self) -> Result<(), String> {
        let mut maturities = vec![0u64; self.subjects.len()];
        for act in &self.acts {
            if act.credit.is_some() {
                maturities[act.subject as usize] += 1;
            }
        }
        for (id, s) in self.subjects.iter().enumerate() {
            if s.own_maturities != maturities[id] {
                return Err(format!("own maturity count of {id} differs from original credits"));
            }
            let mut flat_penalties = 0i64;
            for adjustment in &s.integrity_adjustments {
                match adjustment.kind {
                    IntegrityAdjustmentKind::Penalty { flat_cut, .. } if !adjustment.reversed => flat_penalties += i64::from(flat_cut),
                    IntegrityAdjustmentKind::InheritedCap(cap) if cap > COEF_ONE || adjustment.case.is_some() || adjustment.reversed => {
                        return Err(format!("invalid inherited integrity cap of {id}"));
                    }
                    _ => {}
                }
            }
            let replay = Self::replay_integrity(s).ok_or_else(|| format!("unordered integrity history of {id}"))?;
            if (self.cfg.integrity && replay != s.coef) || (!self.cfg.integrity && flat_penalties != i64::from(s.penalized_xp)) {
                return Err(format!("integrity history of {id} differs from cached state"));
            }
        }
        Ok(())
    }

    /// D151 recovery: the liquid FCTY of an invalidated account is burned (FCTY already transferred out cannot be un-minted, D53; here
    /// nothing is transferable, so all liquid FCTY of the account is burned). Returns the amount burned.
    pub fn burn_liquid(&mut self, id: Id) -> Amount {
        let burned = self.spendable(id);
        self.subjects[id as usize].liquid -= burned;
        self.destroy_liquid(burned);
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
        self.require_solvent(a)?;
        self.require_solvent(b)?;
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
            if act.status == ActStatus::Unspent {
                act.status = ActStatus::Cancelled;
                self.vault -= 1;
                self.burned += Amount::ONE;
            }
            self.revoke_source_xp(act_id);
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
        // The earned credits move (in the integrity variant the raw credits, and the lower coefficient follows the person).
        let amount = self.subjects[old as usize].raw;
        let old_coef = self.subjects[old as usize].coef;
        self.recovery_log.push((new, old, amount));
        self.subjects[new as usize].recovers = None;
        self.subjects[new as usize].restored_xp += amount;
        self.subjects[new as usize].coef = self.subjects[new as usize].coef.min(old_coef);
        let successor = &mut self.subjects[new as usize];
        successor.integrity_adjustments.push(IntegrityAdjustment {
            at_maturities: successor.own_maturities,
            kind: IntegrityAdjustmentKind::InheritedCap(old_coef),
            case: None,
            reversed: false,
        });
        self.bump(new, amount);
        self.subjects[old as usize].status = Status::False;
        self.independent_invalid[old as usize] = true;
        Ok(())
    }

    // ---- invariants ------------------------------------------------------------------------------------------------

    fn audit_cancellations(&self) -> Result<(), String> {
        let mut attributed_debt = vec![Amount::ZERO; self.cases.len()];
        for (subject, account) in self.subjects.iter().enumerate() {
            for debt in &account.debt_tranches {
                if let Some(cancellation) = self.case_cancellation(debt.case) {
                    if !cancellation.activated || cancellation.author as usize != subject {
                        return Err("cancellation debt has no matching author".into());
                    }
                    attributed_debt[debt.case as usize] += debt.amount;
                }
            }
        }
        let mut active = 0;
        for (case, cancellation) in self.case_cancellations.iter().enumerate().filter_map(|(case, c)| c.as_ref().map(|c| (case, c))) {
            if cancellation.case as usize != case
                || cancellation.author as usize >= self.subjects.len()
                || cancellation.accused as usize >= self.subjects.len()
                || cancellation.cancelled_at > self.now
                || self.cases[case].is_some()
                || self.case_effects[case].is_some()
                || cancellation.debt_created != attributed_debt[case]
            {
                return Err(format!("case {case} has invalid cancellation provenance"));
            }
            if !cancellation.activated {
                if !cancellation.positions.is_empty()
                    || !cancellation.holds.is_empty()
                    || !cancellation.collected.is_zero()
                    || !cancellation.debt_created.is_zero()
                    || !cancellation.payouts.is_empty()
                    || !cancellation.burned.is_zero()
                    || !cancellation.net.is_empty()
                    || !cancellation.council_rounds.is_empty()
                    || !cancellation.council_electorates.is_empty()
                    || !cancellation.active_ballots.is_empty()
                {
                    return Err(format!("pending cancellation {case} has active effects"));
                }
                continue;
            }
            active += 1;
            let Some(first) = cancellation.positions.first() else { return Err(format!("active cancellation {case} has no positions")) };
            let deadline = cancellation.council_rounds.last().map_or_else(|| cancellation.positions.last().unwrap().after, |r| r.deadline_after);
            if first.who != cancellation.author
                || first.kind != PositionKind::Participant
                || first.n != 1
                || first.side != Side::Accuser
                || first.stake != cancellation.collected + cancellation.debt_created
                || first.joined_at > cancellation.cancelled_at
                || cancellation.cancelled_at >= deadline
                || cancellation.council_rounds.iter().any(|r| !matches!(r.outcome, CouncilOutcome::Defer | CouncilOutcome::AutomaticDefer))
            {
                return Err(format!("active cancellation {case} has invalid stake or clock provenance"));
            }
            if cancellation.positions.last().is_some_and(|p| p.kind == PositionKind::Council) {
                let Some(electorate) = cancellation.council_electorates.last() else { return Err("cancelled Council case has no electorate".into()) };
                let start = cancellation.council_rounds.last().map_or_else(|| cancellation.positions.last().unwrap().joined_at, |r| r.recognized_at);
                let distinct: HashSet<Id> = cancellation.active_ballots.iter().map(|b| b.who).collect();
                if cancellation.council_electorates.len() != cancellation.council_rounds.len() + 1
                    || electorate.number as usize != cancellation.council_rounds.len()
                    || electorate.started_at != start
                    || distinct.len() != cancellation.active_ballots.len()
                    || cancellation
                        .active_ballots
                        .iter()
                        .any(|b| !electorate.members.contains(&b.who) || b.cast_at < start || b.cast_at >= deadline || b.cast_at > cancellation.cancelled_at)
                {
                    return Err("cancelled Council case has invalid unfinished ballots".into());
                }
            } else if !cancellation.council_rounds.is_empty() || !cancellation.council_electorates.is_empty() || !cancellation.active_ballots.is_empty() {
                return Err("cancelled ordinary case has Council records".into());
            }
            let defenders: Vec<Id> =
                cancellation.positions.iter().filter(|p| p.kind == PositionKind::Participant && p.side == Side::Accused).map(|p| p.who).collect();
            let Some(outflow) = SignedAmount::negative(cancellation.collected) else { return Err("cancellation exceeds signed accounting".into()) };
            let mut net = vec![(cancellation.author, outflow)];
            let mut payouts = Vec::new();
            let burned = if let Some((share, remainder)) = cancellation.collected.split_evenly(defenders.len()) {
                for (index, defender) in defenders.into_iter().enumerate() {
                    let paid = share + Amount::from_atoms(u128::from(index < remainder));
                    payouts.push((defender, paid));
                    let Some(inflow) = SignedAmount::from_amount(paid) else { return Err("cancellation share exceeds signed accounting".into()) };
                    net.push((defender, inflow));
                }
                Amount::ZERO
            } else {
                cancellation.collected
            };
            if cancellation.payouts != payouts || cancellation.burned != burned || cancellation.net != net {
                return Err(format!("cancellation {case} has invalid equal-share accounting"));
            }
        }
        if active != self.stats.author_cancelled {
            return Err("active cancellation history differs from its counter".into());
        }
        Ok(())
    }

    pub fn audit(&self) -> Result<(), String> {
        self.audit_integrity()?;
        self.audit_appeals()?;
        if self.case_effects.len() != self.cases.len()
            || self.case_outcomes.len() != self.cases.len()
            || self.case_openings.len() != self.cases.len()
            || self.case_cancellations.len() != self.cases.len()
            || self.independent_invalid.len() != self.subjects.len()
        {
            return Err("case effects or independent status history has no matching owner".into());
        }
        self.audit_cancellations()?;
        for (id, opening) in self.case_openings.iter().enumerate().filter_map(|(id, opening)| opening.as_ref().map(|opening| (id, opening))) {
            let distinct: HashSet<Id> = opening.guarantors.iter().copied().collect();
            if opening.author as usize >= self.subjects.len()
                || opening.accused as usize >= self.subjects.len()
                || opening.author == opening.accused
                || opening.author_xp_at_recording <= opening.accused_xp_at_recording
                || opening.recorded_at > self.now
                || opening.recorded_at.checked_add(MATURITY_HOURS) != Some(opening.matures_at)
                || distinct.len() != opening.guarantors.len()
                || distinct.contains(&opening.author)
                || opening.guarantors.iter().any(|&g| g as usize >= self.subjects.len())
            {
                return Err(format!("opening {id} has invalid recording provenance"));
            }
            match opening.stage {
                OpeningStage::Pending => {
                    if opening.activated_at.is_some()
                        || self.cases[id].is_some()
                        || self.case_effects[id].is_some()
                        || (opening.stage == OpeningStage::Pending && opening.matures_at <= self.now)
                    {
                        return Err(format!("opening {id} has invalid pending or cancelled state"));
                    }
                }
                OpeningStage::Cancelled => {
                    let Some(cancellation) = self.case_cancellations[id].as_ref() else { return Err(format!("opening {id} has no cancellation journal")) };
                    if self.cases[id].is_some()
                        || self.case_effects[id].is_some()
                        || cancellation.author != opening.author
                        || cancellation.accused != opening.accused
                        || cancellation.activated != opening.activated_at.is_some()
                        || opening.activated_at.is_some_and(|at| at != opening.matures_at || at > cancellation.cancelled_at)
                        || (opening.activated_at.is_none() && cancellation.cancelled_at >= opening.matures_at)
                    {
                        return Err(format!("opening {id} has invalid cancellation provenance"));
                    }
                }
                OpeningStage::Activated => {
                    let Some(case) = &self.cases[id] else { return Err(format!("opening {id} has no active dispute")) };
                    if opening.activated_at != Some(opening.matures_at)
                        || opening.matures_at > self.now
                        || case.ladder.opened_at != opening.matures_at
                        || case.accused != opening.accused
                        || case.ladder.positions()[0].who != opening.author
                        || case.ladder.positions()[0].xp != opening.author_xp_at_recording
                        || self.case_effects[id].is_some()
                    {
                        return Err(format!("opening {id} has invalid activation provenance"));
                    }
                }
                OpeningStage::Final | OpeningStage::Moot => {
                    if opening.activated_at != Some(opening.matures_at)
                        || opening.matures_at > self.now
                        || self.cases[id].is_some()
                        || (opening.stage == OpeningStage::Final) != self.case_effects[id].is_some()
                    {
                        return Err(format!("opening {id} has invalid final or moot state"));
                    }
                }
            }
        }
        let recorded = self.case_openings.iter().flatten().count() as u64;
        let activated = self.case_openings.iter().flatten().filter(|o| o.activated_at.is_some()).count() as u64;
        let cancelled = self.case_openings.iter().flatten().filter(|o| o.stage == OpeningStage::Cancelled && o.activated_at.is_none()).count() as u64;
        if (recorded, activated, cancelled) != (self.stats.openings_recorded, self.stats.openings_activated, self.stats.openings_cancelled) {
            return Err("opening records differ from lifecycle counters".into());
        }
        let unspent = self.acts.iter().filter(|a| a.status == ActStatus::Unspent).count() as i64;
        if unspent != self.vault {
            return Err(format!("vault {} != unspent rights {}", self.vault, unspent));
        }
        let liquid: Amount = self.subjects.iter().map(|s| s.liquid).sum();
        let converted = Amount::coins(self.acts.iter().filter(|a| a.status == ActStatus::Converted).count() as u64);
        if liquid + self.liquid_destroyed != converted {
            return Err(format!("liquid {liquid} + destroyed {} != converted acts {converted}", self.liquid_destroyed));
        }
        if self.minted < 0 || self.vault < 0 || Amount::coins(self.minted as u64).checked_sub(self.burned) != Some(Amount::coins(self.vault as u64) + liquid) {
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
        for (idx, act) in self.acts.iter().enumerate() {
            // D42: an act is credited exactly when it matured and was not cancelled before; the credit stamp is the maturity time and
            // the recipients are the author and the creation-time snapshot, whatever happened to the entitlement later.
            let matured = act.recorded_at + MATURITY_HOURS <= self.now;
            if matured != (idx < self.settled) {
                return Err(format!("act {idx} maturity does not match the settlement cursor"));
            }
            match (&act.credit, matured) {
                (Some(c), true) => {
                    if c.at != act.recorded_at + MATURITY_HOURS
                        || (!c.recipients.is_empty() && (c.recipients[0] != act.subject || c.recipients[1..] != *act.guarantors))
                    {
                        return Err(format!("act {idx} credit is not the maturity credit of its snapshot"));
                    }
                }
                (Some(_), false) => return Err(format!("act {idx} earned XP before maturity")),
                (None, true) if act.status != ActStatus::Cancelled => return Err(format!("matured act {idx} has no credit")),
                _ => {}
            }
            let causes = self.xp_revocations.get(&(idx as u32));
            if act.credit.as_ref().is_some_and(|c| c.revoked) != causes.is_some_and(|c| !c.is_empty()) {
                return Err(format!("act {idx} revocation has no matching causes"));
            }
            if let Some(causes) = causes {
                let distinct: HashSet<Option<u32>> = causes.iter().copied().collect();
                if distinct.len() != causes.len()
                    || causes.iter().flatten().any(|&case| {
                        self.case_effects
                            .get(case as usize)
                            .and_then(Option::as_ref)
                            .is_none_or(|e| e.reversed || e.source_acts.binary_search(&(idx as u32)).is_err())
                    })
                {
                    return Err(format!("act {idx} has invalid revocation causes"));
                }
            }
            if let Some(c) = &act.credit {
                for &recipient in c.recipients.iter() {
                    ever[recipient as usize] += 1;
                    if !c.revoked {
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
        // Dispute custody and restrictions: the reserved stakes, the holds and the path exclusions are exactly those of the open cases.
        let mut reserved = vec![Amount::ZERO; n];
        let mut reserved_rights = HashSet::new();
        let mut holds = vec![0u32; n];
        let mut path_holds = vec![0u32; n];
        let mut frozen = vec![0u32; n];
        for appeal in self.appeals.iter().filter(|a| a.activated_at.is_some() && !a.released) {
            frozen[appeal.accused as usize] += 1;
            for &(id, _, path) in &appeal.holds {
                holds[id as usize] += 1;
                path_holds[id as usize] += u32::from(path && self.cfg.exclude_disputed);
            }
        }
        for c in self.cases.iter().flatten() {
            c.ladder.audit()?;
            if c.backed.len() != c.ladder.positions().len() {
                return Err("case custody has no matching position".into());
            }
            let periods = c.ladder.rounds().len() + usize::from(c.ladder.council_round().is_some());
            if c.electorates.len() != periods {
                return Err("Council round has no matching electorate".into());
            }
            for (i, electorate) in c.electorates.iter().enumerate() {
                let start = if i == 0 { c.ladder.positions().last().expect("Council position").joined_at } else { c.ladder.rounds()[i - 1].recognized_at };
                let distinct: HashSet<Id> = electorate.members.iter().copied().collect();
                if electorate.number as usize != i
                    || electorate.started_at != start
                    || distinct.len() != electorate.members.len()
                    || electorate.members.iter().any(|&m| m as usize >= n)
                {
                    return Err("invalid Council electorate snapshot".into());
                }
                let ballots = c.ladder.rounds().get(i).map_or_else(|| c.ladder.active_ballots(), |r| r.ballots.as_slice());
                if ballots.iter().any(|b| !distinct.contains(&b.who)) {
                    return Err("Council ballot outside its round electorate".into());
                }
            }
            frozen[c.accused as usize] += 1;
            for (p, b) in c.ladder.positions().iter().zip(&c.backed) {
                reserved[p.who as usize] += b.liquid;
                for &a in &b.rights {
                    if !reserved_rights.insert(a) || self.acts[a as usize].subject != p.who || self.acts[a as usize].recorded_at + MATURITY_HOURS > self.now {
                        return Err("invalid or duplicated Emitter stake custody".into());
                    }
                }
            }
            for &(id, _, path) in &c.holds {
                holds[id as usize] += 1;
                if path && self.cfg.exclude_disputed {
                    path_holds[id as usize] += 1;
                }
            }
            let mut last = i64::MIN;
            for p in c.ladder.positions() {
                if p.after < last {
                    return Err("a case deadline decreased".into());
                }
                last = p.after;
            }
        }
        if reserved_rights != self.reserved_rights {
            return Err("Emitter stake custody does not match open cases".into());
        }
        for (case, effects) in self.case_effects.iter().enumerate().filter_map(|(case, e)| e.as_ref().map(|e| (case as u32, e))) {
            let Some(outcome) = self.case_outcome(case) else { return Err(format!("case {case} has no retained verdict")) };
            if outcome.accused != effects.accused
                || outcome.winner != effects.winner
                || outcome.settled_at > self.now
                || self.cases[case as usize].is_some()
                || self.case_cancellation(case).is_some()
                || outcome.position_history.first().is_none_or(|p| p.who != outcome.accuser)
                || outcome.positions as usize != outcome.position_history.len()
                || self.case_opening(case).is_some_and(|o| o.stage != OpeningStage::Final || o.author != outcome.accuser || o.matures_at > outcome.settled_at)
            {
                return Err(format!("case {case} verdict differs from its retained effects or opening"));
            }
            if effects.source_acts.windows(2).any(|pair| pair[0] >= pair[1]) {
                return Err(format!("case {case} has unordered or duplicated receipt references"));
            }
            if !effects.reversed
                && (effects.identity_subjects.iter().any(|subject| !self.identity_cases.get(subject).is_some_and(|causes| causes.contains(&case)))
                    || effects.source_acts.iter().any(|act| !self.xp_revocations.get(act).is_some_and(|causes| causes.contains(&Some(case)))))
            {
                return Err(format!("case {case} has missing identity or receipt effects"));
            }
        }
        if self.case_outcomes.iter().zip(&self.case_effects).any(|(outcome, effects)| outcome.is_some() != effects.is_some()) {
            return Err("retained verdicts differ from settled effects".into());
        }
        let created: Amount = self.subjects.iter().flat_map(|s| &s.debt_tranches).map(|d| d.amount).sum();
        let repaid: Amount = self.subjects.iter().flat_map(|s| &s.debt_tranches).map(|d| d.repaid).sum();
        let cancelled: Amount = self.subjects.iter().flat_map(|s| &s.debt_tranches).map(|d| d.cancelled).sum();
        if (created, repaid, cancelled) != (self.stats.debt_created, self.stats.debt_repaid, self.stats.debt_cancelled) {
            return Err("debt history differs from creation/repayment/cancellation counters".into());
        }
        for (i, s) in self.subjects.iter().enumerate() {
            let identity_causes = self.identity_cases.get(&(i as Id)).map_or(&[][..], Vec::as_slice);
            let false_status = self.independent_invalid[i] || !identity_causes.is_empty();
            if (s.status == Status::False) != false_status
                || identity_causes.iter().any(|&case| {
                    self.case_effects.get(case as usize).and_then(Option::as_ref).is_none_or(|e| e.reversed || !e.identity_subjects.contains(&(i as Id)))
                })
            {
                return Err(format!("status of {i} has no matching causes"));
            }
            let outstanding: Amount = s.debt_tranches.iter().map(|d| d.remaining).sum();
            let repaid: Amount = s.debt_tranches.iter().map(|d| d.repaid).sum();
            let mut later_repayment = false;
            for debt in s.debt_tranches.iter().rev() {
                if !debt.remaining.is_zero() && later_repayment {
                    return Err(format!("debt of {i} was repaid outside FIFO order"));
                }
                later_repayment |= !debt.repaid.is_zero();
            }
            if outstanding != s.debt
                || repaid != s.debt_repaid
                || s.debt_tranches.iter().any(|d| {
                    d.amount != d.remaining + d.repaid + d.cancelled
                        || match self.case_effects.get(d.case as usize).and_then(Option::as_ref) {
                            Some(effects) => effects.reversed && !d.remaining.is_zero(),
                            None => !self.case_cancellation(d.case).is_some_and(|c| c.activated && c.author as usize == i),
                        }
                })
            {
                return Err(format!("debt of {i} has no matching creation/repayment/cancellation history"));
            }
            if reserved[i] != s.reserved || s.reserved > s.liquid {
                return Err(format!("reserved stake of {i}: stored {} recomputed {} liquid {}", s.reserved, reserved[i], s.liquid));
            }
            if holds[i] != self.hold[i] || path_holds[i] != self.path_hold[i] || frozen[i] != self.frozen[i] {
                return Err(format!("dispute restrictions of {i} do not match the open cases"));
            }
            if owned[i] != self.owned_open[i] {
                return Err(format!("owned valences of {i}"));
            }
            if xp[i] + s.restored_xp - s.penalized_xp != s.raw {
                return Err(format!("credits of {i}: stored {} recomputed {}", s.raw, xp[i]));
            }
            let derived = if self.cfg.integrity && s.raw > 0 { (i64::from(s.raw) * i64::from(s.coef) / i64::from(COEF_ONE)) as i32 } else { s.raw };
            if s.xp != derived || s.coef > COEF_ONE || (!self.cfg.integrity && s.coef != COEF_ONE) {
                return Err(format!("xp of {i}: stored {} derived {} (coefficient {})", s.xp, derived, s.coef));
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

    fn signed(amount: Amount) -> SignedAmount {
        SignedAmount::try_from(amount).unwrap()
    }

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
        assert_eq!(w.xp(0), 0, "no ordinary XP at creation");
        w.tick(24);
        assert_eq!(w.xp(0), 1, "XP is earned at maturity, before any use of the right");
        w.convert_to_collector(0, act).unwrap();
        assert_eq!(w.xp(0), 1, "conversion credits nothing more");
        assert_eq!(w.liquid(0), Amount::ONE);
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
        assert_eq!((w.burned(), w.vault()), (burned + Amount::ONE, vault - 1));
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
        assert_eq!(w.burned() - Amount::coins(u64::try_from(w.minted()).unwrap()).min(w.burned()), Amount::ZERO);
        let xp0 = w.xp(0);
        w.tick(w.now() + 24);
        let act = w.create_self_id(3).unwrap();
        assert!(w.act_guarantors(act).contains(&0));
        w.tick(w.now() + 24);
        w.convert_to_collector(3, act).unwrap();
        assert_eq!(w.xp(0), xp0 + 1, "the guarantor earned at the maturity of the subject's act, not at its use");
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
    fn withdrawal_ends_the_pair_both_sides_keep_the_units_already_credited_and_the_retained_side_can_rematch() {
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
        assert_eq!(w.xp(3), xp3, "the withdrawer keeps the units already credited for past acts that nobody refuted (D166)");
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
        assert_eq!((w.burned(), w.used_slots_of(1)), (burned + Amount::ONE, 3), "two genesis valences plus the invitation unit");
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
        // The earlier reading of D131 (both parties excluded); the default spares the challenger (D157, tested below).
        let mut w = World::new(Config { exclude_targets_only: false, ..Config::default() }, 10, &ring(10));
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

    // ---- D42 maturity credit: the retroactive-XP exploit and the maturity invariants (goal §1.3, §1.6) ---------------------

    /// Independent reference of the XP rule: recompute every balance from the act table, the maturity time and the creation-time
    /// snapshots only (no cache, no credit records). Valid while no revocation or penalty ran.
    fn reference_xp(w: &World) -> Vec<i32> {
        let mut xp = vec![0i32; w.len()];
        for a in &w.acts {
            if a.status != ActStatus::Cancelled && a.recorded_at + MATURITY_HOURS <= w.now() {
                xp[a.subject as usize] += 1;
                for &g in a.guarantors.iter() {
                    xp[g as usize] += 1;
                }
            }
        }
        xp
    }

    fn xps(w: &World) -> Vec<i32> {
        (0..w.len() as Id).map(|i| w.xp(i)).collect()
    }

    /// Twelve accounts on the ring, all active: every account recorded a Self-ID at hour 0 and the world stands at hour 24, so every
    /// account holds one matured unspent entitlement and has earned its first credits.
    fn live_world() -> World {
        let mut w = world(12);
        for i in 0..12 {
            w.create_self_id(i).unwrap();
        }
        w.tick(24);
        w
    }

    #[test]
    fn xp_is_earned_exactly_at_the_maturity_boundary_and_not_before() {
        let mut w = live_world();
        let act = w.create_self_id(0).unwrap();
        assert!(!w.act_guarantors(act).is_empty());
        let before = xps(&w);
        w.tick(47);
        assert_eq!(xps(&w), before, "no ordinary XP one hour before maturity");
        assert_ne!(w.eligible_emission(0), Some(act), "and the entitlement is not spendable yet");
        w.tick(48);
        let mut expected = before.clone();
        expected[0] += 1;
        for &g in w.act_guarantors(act).to_vec().iter() {
            expected[g as usize] += 1;
        }
        assert_eq!(xps(&w), expected, "the author and each snapshot guarantor earn at the boundary, nobody else");
        assert!(w.eligible_emissions(0, 24).contains(&act));
        assert_eq!(w.acts[act as usize].credit.as_ref().unwrap().at, 48, "the credit stamp is the maturity time");
        w.audit().unwrap();
    }

    #[test]
    fn matured_entitlement_left_on_the_emitter_keeps_its_xp_and_consumption_never_credits_again() {
        let mut w = live_world();
        let mut acts = w.eligible_emissions(0, 24);
        for _ in 0..3 {
            acts.push(w.create_self_id(0).unwrap());
            w.tick(w.now() + 24);
        }
        w.tick(w.now() + 24 * 10);
        let at_rest = xps(&w)[..12].to_vec();
        assert_eq!(at_rest, reference_xp(&w)[..12].to_vec(), "unused entitlements earned their XP at maturity, without any operation");
        let n = w.len();
        let same = |w: &World| xps(w)[..n].to_vec();
        w.convert_to_collector(0, acts[0]).unwrap();
        assert_eq!(same(&w), at_rest, "withdrawal after maturity: no second credit");
        assert_eq!(w.convert_to_collector(0, acts[0]), Err(Reject("conversion requires own mature emission")), "one entitlement is consumed once");
        let inv = w.create_invitation(0, acts[1]).unwrap();
        assert_eq!(same(&w), at_rest, "invitation burn after maturity: no second credit");
        assert_eq!(w.create_invitation(0, acts[1]), Err(Reject("emission is spent or disputed")));
        w.tick(w.now() + 24);
        assert_eq!(same(&w), at_rest, "the freeze period earns nothing either");
        w.accept_invitation(inv).unwrap();
        w.open_valence(0, 6, acts[2]).unwrap();
        assert_eq!(same(&w), at_rest, "valence burn after maturity: no second credit");
        assert_eq!(
            w.supply(),
            Amount::coins(u64::try_from(w.vault()).unwrap()) + (0..w.len() as Id).map(|i| w.liquid(i)).sum::<Amount>(),
            "FCTY accounting is conserved"
        );
        w.audit().unwrap();
    }

    #[test]
    fn a_failed_consumption_changes_neither_the_entitlement_nor_its_xp() {
        let mut w = World::new(Config { k: 3, ..Config::default() }, 8, &cycle(8));
        rights(&mut w, &[0, 3]);
        let act = w.eligible_emission(0).unwrap();
        let (xp, vault, burned, liquid) = (xps(&w), w.vault(), w.burned(), w.liquid(0));
        assert!(w.open_valence(0, 0, act).is_err(), "no valence toward oneself");
        assert!(w.convert_to_collector(3, act).is_err(), "not the owner");
        assert!(w.open_valence(0, 3, w.eligible_emission(3).unwrap()).is_err(), "not the owner's right");
        assert!(w.create_invitation(0, w.eligible_emission(3).unwrap()).is_err());
        let held = w.begin_case(&[0, 1]).unwrap();
        assert!(w.open_valence(0, 4, act).is_err(), "disputed");
        w.end_case(held);
        assert_eq!((xps(&w), w.vault(), w.burned(), w.liquid(0)), (xp, vault, burned, liquid));
        assert_eq!(w.eligible_emission(0), Some(act), "the entitlement is still unspent");
        w.audit().unwrap();
    }

    #[test]
    fn free_cancellation_inside_the_window_prevents_both_the_entitlement_and_the_xp() {
        for canceller in [0u32, 1] {
            let mut w = live_world();
            let before = xps(&w);
            let rights_before = w.unspent_rights(0);
            let act = w.create_self_id(0).unwrap();
            assert!(w.act_guarantors(act).contains(&1));
            assert_eq!(w.cancel_self_id(5, act), Err(Reject("no authority to cancel the Self-ID")), "a stranger cannot cancel");
            w.tick(47);
            w.cancel_self_id(canceller, act).unwrap();
            assert_eq!(w.cancel_self_id(canceller, act), Err(Reject("only an unspent Self-ID can be cancelled")));
            w.tick(48);
            assert_eq!(xps(&w), before, "no XP for anyone, including the author");
            assert_eq!(w.unspent_rights(0), rights_before, "no matured FCTY from the cancelled act");
            assert!(w.create_self_id(0).is_ok(), "the original slot expired at t0+24 (D79)");
            w.audit().unwrap();
        }
        let mut w = live_world();
        let act = w.create_self_id(0).unwrap();
        w.tick(48);
        let matured = xps(&w);
        assert_eq!(w.cancel_self_id(0, act), Err(Reject("the free cancellation window ended at maturity")));
        assert_eq!(xps(&w), matured);
    }

    #[test]
    fn a_cancelled_self_id_keeps_the_original_rolling_slot() {
        let mut w = world(12);
        let act = w.create_self_id(0).unwrap();
        w.tick(1);
        w.cancel_self_id(0, act).unwrap();
        assert_eq!(w.create_self_id(0), Err(Reject("rolling 24-hour reward limit")), "no instant retry (D79)");
        w.tick(24);
        assert!(w.create_self_id(0).is_ok());
    }

    #[test]
    fn retroactive_xp_exploit_a_new_relationship_never_acquires_xp_from_earlier_self_ids() {
        // Alice (0) repeatedly makes Self-IDs and leaves ten matured entitlements on her Emitter account.
        let mut w = live_world();
        let alice = 0;
        let mut acts = Vec::new();
        for _ in 0..10 {
            acts.push(w.create_self_id(alice).unwrap());
            w.tick(w.now() + 24);
        }
        let recipients: Vec<Vec<Id>> = acts.iter().map(|&a| w.acts[a as usize].credit.as_ref().unwrap().recipients.to_vec()).collect();
        let earned = xps(&w);
        assert_eq!(earned, reference_xp(&w));
        // Alice invites Bob, burning one matured entitlement; after the freeze Bob is admitted and the special mutual link is active.
        let inv = w.create_invitation(alice, acts[0]).unwrap();
        assert_eq!(xps(&w), earned, "creating the invitation reissues nothing");
        w.tick(w.now() + 24);
        let bob = w.accept_invitation(inv).unwrap();
        assert!(w.graph().is_mutual(alice, bob), "the special mutual relationship is active");
        w.tick(w.now() + 24);
        let after_link = xps(&w);
        assert_eq!(after_link[bob as usize], 0, "Bob receives no XP from Alice's historical Self-IDs");
        // Alice withdraws every remaining matured entitlement.
        for &a in &acts[1..] {
            w.convert_to_collector(alice, a).unwrap();
        }
        assert_eq!(xps(&w), after_link, "withdrawal does not reissue the historical credits");
        for (i, &a) in acts.iter().enumerate() {
            let credit = w.acts[a as usize].credit.as_ref().unwrap();
            assert_eq!(credit.recipients.to_vec(), recipients[i], "the recipient set of act {i} is unchanged");
            assert!(!credit.recipients.contains(&bob));
        }
        assert_eq!(xps(&w), reference_xp(&w));
        // Bob becomes active by his own Self-ID; a later qualifying Self-ID of Alice then credits him as a guarantor.
        w.create_self_id(bob).unwrap();
        w.tick(w.now() + 24);
        let own = w.xp(bob);
        let later = w.create_self_id(alice).unwrap();
        assert!(w.act_guarantors(later).contains(&bob), "Bob is in the creation-time snapshot of the later act");
        w.tick(w.now() + 24);
        assert_eq!(w.xp(bob), own + 1, "Bob earns guarantor XP from Alice's later act, and only from it");
        assert_eq!(xps(&w), reference_xp(&w));
        w.audit().unwrap();
    }

    #[test]
    fn retroactive_xp_exploit_also_fails_through_an_owned_valence_that_becomes_mutual_later() {
        let mut w = world(12);
        let (alice, carol) = (0, 6);
        assert!(!w.graph().has_edge(carol, alice) && !w.graph().has_edge(alice, carol));
        let mut acts = Vec::new();
        for _ in 0..5 {
            acts.push(w.create_self_id(alice).unwrap());
            w.tick(w.now() + 24);
        }
        // Carol is active through her own Self-ID, so she would be an eligible guarantor if the relation existed at creation.
        let carol_act = w.create_self_id(carol).unwrap();
        w.tick(w.now() + 24);
        let before = xps(&w);
        // Alice opens a valence toward Carol with a matured entitlement; nothing is mutual yet.
        w.open_valence(alice, carol, acts[0]).unwrap();
        assert_eq!(xps(&w), before);
        w.tick(w.now() + 24);
        // Carol opens the opposite valence: the pair becomes mutual only now.
        w.open_valence(carol, alice, carol_act).unwrap();
        assert!(w.graph().is_mutual(alice, carol));
        for &a in &acts {
            assert!(!w.acts[a as usize].credit.as_ref().unwrap().recipients.contains(&carol));
        }
        let at_link = xps(&w);
        for &a in &acts[1..] {
            w.convert_to_collector(alice, a).unwrap();
        }
        assert_eq!(xps(&w), at_link, "withdrawing the remaining entitlements credits nobody");
        assert_eq!(xps(&w), reference_xp(&w));
        w.audit().unwrap();
    }

    #[test]
    fn a_guarantor_who_leaves_before_maturity_stays_in_the_creation_time_snapshot() {
        let mut w = live_world();
        let (g, alice) = (1, 0);
        let vals: Vec<u32> = (0..w.valences.len() as u32)
            .filter(|&v| w.valences[v as usize].owner == g && w.valences[v as usize].counterpart == alice && w.valences[v as usize].open)
            .collect();
        let act = w.create_self_id(alice).unwrap();
        assert!(w.act_guarantors(act).contains(&g));
        w.tick(34);
        w.withdraw_valence(g, vals[0]).unwrap();
        assert!(!w.graph().has_edge(g, alice), "the relation ended");
        let before = w.xp(g);
        w.tick(48);
        assert_eq!(w.xp(g), before + 1, "the pending credit still reaches the initial guarantor (D54)");
        w.audit().unwrap();
    }

    #[test]
    fn a_guarantor_joining_after_creation_gets_no_credit_for_that_act() {
        let mut w = live_world();
        let (alice, carol) = (0, 6);
        let act = w.create_self_id(alice).unwrap();
        let before = w.xp(carol);
        w.open_valence(alice, carol, w.eligible_emissions(alice, 24)[0]).unwrap();
        w.open_valence(carol, alice, w.eligible_emission(carol).unwrap()).unwrap();
        assert!(w.graph().is_mutual(alice, carol));
        w.tick(48);
        assert_eq!(w.xp(carol), before, "joined after the act: no credit");
        assert!(!w.act_guarantors(act).contains(&carol));
    }

    /// XP as the owner defined it (D165): live credits times the integrity coefficient, rounded down.
    fn derived(w: &World, id: Id) -> i32 {
        let s = &w.subjects[id as usize];
        (i64::from(s.raw) * i64::from(s.coef) / i64::from(COEF_ONE)) as i32
    }

    #[test]
    fn source_revocation_and_the_integrity_penalty_follow_the_chronology_of_credits() {
        let mut w = live_world();
        let a1 = w.create_self_id(0).unwrap();
        w.tick(48);
        let a2 = w.create_self_id(0).unwrap();
        w.tick(54);
        // A lost dispute halves the coefficient; the credits (the units of responsibility) stay untouched.
        let (raw, before) = (w.subjects[0].raw, w.xp(0));
        w.penalize_xp(0, 0.5);
        assert_eq!((w.subjects[0].raw, w.coefficient(0)), (raw, COEF_ONE / 2));
        assert_eq!(w.xp(0), derived(&w, 0));
        assert_eq!(w.xp(0), before / 2, "XP is rounded down");
        // The credit that matures later is scaled by the lowered coefficient, and the own act restores 1/1000 of integrity.
        w.tick(72);
        assert_eq!(w.subjects[0].raw, raw + 1);
        assert_eq!(w.coefficient(0), COEF_ONE / 2 + COEF_STEP);
        assert_eq!(w.xp(0), derived(&w, 0));
        // Authorized revocation of one source removes exactly one unit of responsibility from each recipient and touches nobody else.
        let others: Vec<i32> = (0..w.len() as Id).map(|i| w.subjects[i as usize].raw).collect();
        let recipients = w.acts[a1 as usize].credit.as_ref().unwrap().recipients.to_vec();
        assert!(w.revoke_source_xp(a1));
        assert!(!w.revoke_source_xp(a1), "revoked once");
        let mut expected = others.clone();
        for r in recipients {
            expected[r as usize] -= 1;
        }
        assert_eq!((0..w.len() as Id).map(|i| w.subjects[i as usize].raw).collect::<Vec<_>>(), expected);
        assert!((0..w.len() as Id).all(|i| w.xp(i) == derived(&w, i)));
        assert!(w.acts[a2 as usize].credit.as_ref().is_some_and(|c| !c.revoked), "other sources keep their credits");
        w.audit().unwrap();
    }

    #[test]
    fn case_integrity_restoration_replays_maturities_and_is_inert_on_repeat() {
        let mut w = live_world();
        w.penalize_xp(0, 0.2);
        assert_eq!(w.coefficient(0), 800_000);
        w.penalize_xp_for_case(0, 0.5, 71);
        assert_eq!(w.coefficient(0), 400_000);
        for _ in 0..20 {
            w.create_self_id(0).unwrap();
            w.tick(w.now() + DAY);
        }
        assert_eq!(w.coefficient(0), 420_000);
        let units = w.subjects[0].raw;
        assert_eq!(w.restore_case_xp_penalties(71), 1);
        assert_eq!(w.coefficient(0), 820_000, "the generic 0.8 coefficient retains twenty own maturities without the reversed loss");
        assert_eq!(w.subjects[0].raw, units, "restoring integrity creates no responsibility units");
        assert_eq!(w.subjects[0].low_coef, 400_000, "the historical minimum remains recorded");
        assert_eq!(w.restore_case_xp_penalties(71), 0);
        assert_eq!(w.coefficient(0), 820_000);
        w.audit_integrity().unwrap();
        w.audit().unwrap();
    }

    #[test]
    fn integrity_replay_preserves_saturation_other_losses_and_same_count_order() {
        let mut w = live_world();
        w.penalize_xp_for_case(0, 0.001, 71);
        for _ in 0..2 {
            w.create_self_id(0).unwrap();
            w.tick(w.now() + DAY);
        }
        assert_eq!(w.coefficient(0), COEF_ONE, "repair saturates before the later losses");
        w.penalize_xp(0, 0.5);
        w.penalize_xp_for_case(0, 0.5, 72);
        assert_eq!(w.restore_case_xp_penalties(71), 1);
        assert_eq!(w.coefficient(0), 250_000, "removing an already repaired loss cannot undo later losses");
        assert_eq!(w.restore_case_xp_penalties(72), 1);
        assert_eq!(w.coefficient(0), 500_000);
        w.penalize_xp_for_case(0, 0.5, 73);
        w.penalize_xp(0, 0.333333);
        let expected = (500_000f64 * (1.0 - 0.333333)).floor() as u32;
        assert_eq!(w.restore_case_xp_penalties(73), 1);
        assert_eq!(w.coefficient(0), expected, "uncased fractions retain the original f64 rounding and insertion order");
        w.audit_integrity().unwrap();
        w.subjects[0].integrity_adjustments[0].at_maturities = w.subjects[0].own_maturities + 1;
        assert!(w.audit_integrity().is_err());
    }

    #[test]
    fn balance_halving_ablation_restores_recorded_cuts_without_repricing_other_cuts() {
        let mut w = live_world();
        w.cfg.integrity = false;
        let units = w.subjects[0].raw;
        let first = w.penalize_xp_for_case(0, 0.5, 75);
        let second = w.penalize_xp_for_case(0, 0.5, 76);
        let generic = w.penalize_xp(0, 0.25);
        assert_eq!(w.restore_case_xp_penalties(75), 1);
        assert_eq!(w.subjects[0].raw, units - second - generic);
        assert_eq!(w.subjects[0].penalized_xp, second + generic);
        assert_eq!(w.restore_case_xp_penalties(75), 0);
        assert_eq!(w.restore_case_xp_penalties(76), 1);
        assert_eq!(w.subjects[0].raw, units - generic);
        assert!(first > 0 && second > 0);
        w.audit_integrity().unwrap();
        w.audit().unwrap();
    }

    #[test]
    fn integrity_returns_slowly_by_playing_by_the_rules_and_never_exceeds_one() {
        let mut w = live_world();
        w.penalize_xp(0, 0.5);
        w.penalize_xp(0, 0.5);
        assert_eq!(w.coefficient(0), COEF_ONE / 4);
        let low = w.xp(0);
        let mut last = w.coefficient(0);
        // One Self-ID a day: 750 days restore 750/1000 of the whole, so the coefficient reaches exactly one.
        for day in 0..800 {
            w.tick(w.now() + 24);
            // Keep the guarantors active so that the account keeps qualifying.
            if day % 20 == 0 {
                for i in 1..12 {
                    let _ = w.create_self_id(i);
                }
            }
            let _ = w.create_self_id(0);
            assert!(w.coefficient(0) >= last, "never falls by playing");
            assert!(w.coefficient(0) <= COEF_ONE, "never above one");
            last = w.coefficient(0);
        }
        assert_eq!(w.coefficient(0), COEF_ONE, "the coefficient is back to one");
        assert!(w.xp(0) > low);
        assert_eq!(w.xp(0), w.subjects[0].raw, "XP equals the credits again");
        w.audit().unwrap();
    }

    #[test]
    fn effective_xp_matches_the_reference_after_random_event_orders_and_batch_settlement() {
        // Deterministic pseudo-random sequences of Self-IDs, valences, conversions, cancellations and time jumps; after every step the
        // balances equal the independent chronological recomputation, so lazy settlement of a batch equals processing one by one.
        for seed in 1..=6u64 {
            let mut state = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15);
            let mut next = move |m: u64| {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                state % m
            };
            let mut w = world(14);
            for _ in 0..120 {
                let who = next(14) as Id;
                match next(6) {
                    0 | 1 => {
                        let _ = w.create_self_id(who);
                    }
                    2 => {
                        if let Some(a) = w.eligible_emission(who) {
                            let _ = w.convert_to_collector(who, a);
                        }
                    }
                    3 => {
                        let other = next(14) as Id;
                        if let Some(a) = w.eligible_emission(who) {
                            let _ = w.open_valence(who, other, a);
                        }
                    }
                    4 => {
                        let act = (0..w.acts.len() as u32).find(|&a| w.acts[a as usize].subject == who && w.acts[a as usize].status == ActStatus::Unspent);
                        if let Some(a) = act {
                            let _ = w.cancel_self_id(who, a);
                        }
                    }
                    _ => {
                        w.tick(w.now() + 1 + next(60) as i64);
                    }
                }
                assert_eq!(xps(&w), reference_xp(&w), "seed {seed}, hour {}", w.now());
            }
            w.audit().unwrap();
        }
    }

    #[test]
    fn one_batch_settlement_equals_day_by_day_processing() {
        let build = |step: i64| {
            let mut w = world(12);
            for i in 0..12 {
                w.create_self_id(i).unwrap();
            }
            let mut t = 0;
            while t < 100 {
                t += step;
                w.tick(t.min(100));
            }
            xps(&w)
        };
        assert_eq!(build(1), build(100), "ticking hour by hour or once gives identical effective XP");
        assert_eq!(build(24), build(7));
    }

    // ---- Chekharda cases with stakes, custody and settlement (D158, D159, D161, D162) ------------------------------------

    /// Twelve ring accounts after forty days of Self-IDs at different rates (so XP differs) with every matured entitlement converted to
    /// liquid FCTY; stakes are on (base 7). Returns the world standing at an exact day boundary.
    fn rich_world() -> World {
        let mut w = World::new(Config { base_stake: Some(7), ..Config::default() }, 12, &ring(12));
        for day in 0..40i64 {
            for i in 0..12 {
                if day % (1 + i64::from(i) % 3) == 0 {
                    let _ = w.create_self_id(i);
                }
            }
            w.tick((day + 1) * 24);
            for i in 0..12 {
                for a in w.eligible_emissions(i, 24) {
                    let _ = w.convert_to_collector(i, a);
                }
            }
        }
        w
    }

    /// Accounts ordered by XP with distinct values: (accused, challenger, defender) with strictly increasing XP.
    fn xp_ladder(w: &World) -> (Id, Id, Id) {
        let mut ids: Vec<Id> = (0..w.len() as Id).collect();
        ids.sort_by_key(|&i| (w.xp(i), i));
        let lo = ids[0];
        let mid = *ids.iter().find(|&&i| w.xp(i) > w.xp(lo)).unwrap();
        let hi = *ids.iter().find(|&&i| w.xp(i) > w.xp(mid)).unwrap();
        (lo, mid, hi)
    }

    fn total_liquid(w: &World) -> Amount {
        (0..w.len() as Id).map(|i| w.liquid(i)).sum()
    }

    #[test]
    fn recorded_openings_activate_only_at_24_hours_and_start_their_clock_then() {
        let mut w = rich_world();
        let (accused, author, _) = xp_ladder(&w);
        let recorded_at = w.now();
        let before = (w.minted, w.supply(), w.xp(author), w.spendable(author), w.stats.staked, w.stats.opened);
        let case = w.record_case_opening(&[author, accused]).unwrap();
        assert_eq!(case, 0);
        let opening = w.case_opening(case).unwrap().clone();
        assert_eq!(
            (opening.recorded_at, opening.matures_at, opening.stage, opening.activated_at),
            (recorded_at, recorded_at + DAY, OpeningStage::Pending, None)
        );
        assert_eq!(w.pending_openings(), 1);
        assert_eq!(w.case_deadline(case), None);
        assert!(!w.held(author) && !w.held(accused));
        assert_eq!((w.minted, w.supply(), w.xp(author), w.spendable(author), w.stats.staked, w.stats.opened), before);
        assert!(w.join_case(case, author).is_err());
        assert!(w.settle_case(case, None).is_err());
        w.tick(recorded_at + DAY - 1);
        assert_eq!(w.case_opening(case).unwrap().stage, OpeningStage::Pending);
        assert!(!w.held(author) && !w.held(accused));
        w.audit().unwrap();
        w.tick(recorded_at + DAY);
        assert_eq!(w.pending_openings(), 0);
        assert_eq!((w.case_opening(case).unwrap().stage, w.case_opening(case).unwrap().activated_at), (OpeningStage::Activated, Some(recorded_at + DAY)));
        assert_eq!(w.case_deadline(case), Some(recorded_at + 8 * DAY));
        assert_eq!(w.case_positions(case)[0].joined_at, recorded_at + DAY);
        assert!(w.held(author) && w.held(accused));
        assert_eq!(w.spendable(author), before.3 - Amount::coins(7));
        assert_eq!((w.minted, w.supply(), w.xp(author)), (before.0, before.1, before.2), "opening maturity creates neither a Self-ID nor its credit");
        assert_eq!((w.stats.openings_recorded, w.stats.openings_activated, w.stats.opened), (1, 1, 1));
        assert!(w.cancel_pending_opening(case, author).is_err());
        w.tick(recorded_at + 8 * DAY);
        w.settle_case(case, Some(Side::Accused)).unwrap();
        assert_eq!(w.case_opening(case).unwrap().stage, OpeningStage::Final);
        assert!(w.cancel_pending_opening(case, author).is_err());
        w.audit().unwrap();
    }

    #[test]
    fn opening_admission_xp_and_mutual_guarantors_are_frozen_at_recording() {
        let mut w = rich_world();
        let (accused, author, _) = xp_ladder(&w);
        let case = w.record_case_opening(&[author, accused]).unwrap();
        let opening = w.case_opening(case).unwrap().clone();
        let guarantor = opening.guarantors[0];
        let valence = w.valences.iter().position(|v| v.open && v.owner == guarantor && v.counterpart == author).unwrap() as u32;
        w.withdraw_valence(guarantor, valence).unwrap();
        assert!(!w.mutual_partners(author).contains(&guarantor));
        w.penalize_xp(author, 1.0);
        assert!(w.xp(author) <= w.xp(accused));
        w.tick(opening.matures_at);
        assert_eq!(w.case_opening(case).unwrap().guarantors, opening.guarantors);
        assert_eq!(w.case_positions(case)[0].xp, opening.author_xp_at_recording, "activation does not revalidate the recording-time gate");
        assert_eq!(w.case_positions(case)[0].who, author);
        assert!(w.held(author));
        w.end_case(case);
        assert_eq!(w.case_opening(case).unwrap().stage, OpeningStage::Moot);
        assert!(w.cancel_pending_opening(case, author).is_err());
        w.audit().unwrap();
    }

    #[test]
    fn pending_opening_cancellation_is_owner_only_atomic_and_releases_nothing_else() {
        let mut w = rich_world();
        let (accused, author, _) = xp_ladder(&w);
        let fixture = w.begin_case(&[author, accused]).unwrap();
        assert!(w.case_opening(fixture).is_none(), "already-active fixtures have no invented recording time");
        let case = w.record_case_opening(&[author, accused]).unwrap();
        let opening = w.case_opening(case).unwrap().clone();
        let before = (w.hold.clone(), w.frozen.clone(), w.reserved_rights.clone(), w.spendable(author), w.supply(), w.xp(author), w.stats.staked);
        assert!(w.cancel_pending_opening(case, accused).is_err());
        assert!(w.cancel_pending_opening(u32::MAX, author).is_err());
        assert!(w.cancel_pending_opening(fixture, author).is_err());
        assert_eq!(w.case_opening(case), Some(&opening));
        w.tick(opening.matures_at - 1);
        w.cancel_pending_opening(case, author).unwrap();
        assert_eq!(w.case_opening(case).unwrap().stage, OpeningStage::Cancelled);
        assert_eq!((w.hold.clone(), w.frozen.clone(), w.reserved_rights.clone(), w.spendable(author), w.supply(), w.xp(author), w.stats.staked), before);
        assert!(w.cancel_pending_opening(case, author).is_err());
        w.tick(opening.matures_at + 10 * DAY);
        assert_eq!(w.case_deadline(case), None);
        assert!(w.held(author) && w.held(accused));
        assert_eq!((w.stats.openings_recorded, w.stats.openings_activated, w.stats.openings_cancelled, w.stats.moot), (1, 0, 1, 0));
        assert_eq!(w.pending_openings(), 0);
        w.audit().unwrap();
    }

    #[test]
    fn opening_recording_refuses_invalid_or_unqualified_accounts_without_allocating_a_case() {
        let mut w = rich_world();
        let (accused, author, _) = xp_ladder(&w);
        for subjects in [&[][..], &[author][..], &[author, author][..], &[accused, author][..], &[author, u32::MAX][..], &[author, accused, author][..]] {
            assert!(w.record_case_opening(subjects).is_err());
            assert!(w.cases.is_empty() && w.case_openings.is_empty() && w.case_effects.is_empty());
            assert_eq!(w.stats.openings_recorded, 0);
        }
        w.lose_key(author).unwrap();
        assert!(w.record_case_opening(&[author, accused]).is_err());
        assert!(w.cases.is_empty());
        w.audit().unwrap();
    }

    #[test]
    fn opening_activations_use_matured_collateral_and_stable_case_id_order() {
        let mut w = rich_world();
        let (accused, author, _) = xp_ladder(&w);
        w.burn_liquid(author);
        let backing = w.create_self_id(author).unwrap();
        let a = w.record_case_opening(&[author, accused]).unwrap();
        let b = w.record_case_opening(&[author, accused]).unwrap();
        let at = w.case_opening(a).unwrap().matures_at;
        let mut stepped = w.clone();
        while stepped.now() < at {
            stepped.tick(stepped.now() + 1);
        }
        w.tick(at);
        assert_eq!((a, b, w.cases.len()), (0, 1, 2), "activation never allocates another ID");
        assert!(w.acts[backing as usize].credit.is_some(), "Self-ID maturity runs before activation at the same hour");
        assert_eq!(w.case_ref(a).unwrap().backed[0].rights, vec![backing]);
        assert_eq!(w.case_ref(b).unwrap().backed[0].total(), Amount::ZERO);
        assert_eq!(w.case_ref(a).unwrap().backed[0].rights, stepped.case_ref(a).unwrap().backed[0].rights);
        assert_eq!(w.case_opening(a), stepped.case_opening(a));
        assert_eq!(w.hold, stepped.hold);
        assert_eq!((w.stats.openings_activated, w.stats.opened), (2, 2));
        w.tick(at);
        assert_eq!(w.stats.openings_activated, 2, "replaying the maturity hour cannot activate twice");
        w.audit().unwrap();
        stepped.audit().unwrap();
    }

    #[test]
    fn opening_activation_and_council_cutoffs_share_the_chronological_scheduler() {
        let mut w = rich_world();
        let (accused, author, _) = xp_ladder(&w);
        let council_case = w.begin_case(&[author, accused]).unwrap();
        let member = w.council().iter().copied().find(|&id| id != author && id != accused).unwrap();
        w.council_join(council_case, member).unwrap();
        assert!(w.council_ballot(council_case, member, 0, CouncilVote::Defer));
        let cutoff = w.case_deadline(council_case).unwrap();
        w.tick(cutoff - DAY);
        let opening = w.record_case_opening(&[author, accused]).unwrap();
        assert_eq!(w.case_opening(opening).unwrap().matures_at, cutoff);
        let mut stepped = w.clone();
        let endpoint = cutoff + 15 * DAY;
        while stepped.now() < endpoint {
            stepped.tick((stepped.now() + 1).min(endpoint));
        }
        w.tick(endpoint);
        assert_eq!(w.case_opening(opening), stepped.case_opening(opening));
        assert_eq!(w.case_positions(opening), stepped.case_positions(opening));
        assert_eq!(w.case_council_rounds(council_case), stepped.case_council_rounds(council_case));
        assert_eq!(w.case_ref(council_case).unwrap().electorates, stepped.case_ref(council_case).unwrap().electorates);
        assert_eq!(w.case_council_rounds(council_case).len(), 3);
        assert_eq!(w.case_deadline(opening), Some(cutoff + 7 * DAY));
        assert_eq!(w.hold, stepped.hold);
        assert_eq!((w.stats.openings_activated, w.stats.majority_deferrals, w.stats.automatic_deferrals), (1, 1, 2));
        w.audit().unwrap();
        stepped.audit().unwrap();
    }

    #[test]
    fn an_unopposed_accusation_reserves_the_stake_holds_both_parties_and_charges_the_accused_when_it_wins() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        let (liquid_c, spendable_c) = (w.liquid(challenger), w.spendable(challenger));
        assert!(spendable_c >= Amount::coins(7));
        let guarantors = w.eligible_guarantors(accused);
        assert!(!guarantors.is_empty());
        let before_total = total_liquid(&w);
        let before_guarantors: Vec<(Amount, Amount)> = guarantors.iter().map(|&g| (w.liquid(g), w.debt(g))).collect();
        let case = w.begin_case(&[challenger, accused]).unwrap();
        assert_eq!((w.liquid(challenger), w.spendable(challenger)), (liquid_c, spendable_c - Amount::coins(7)), "the stake is reserved, not moved");
        assert!(w.held(challenger) && w.held(accused));
        assert_eq!(w.create_self_id(challenger), Err(Reject("open-dispute activity restriction")));
        let opened = w.now();
        assert_eq!(w.case_deadline(case), Some(opened + 7 * 24));
        w.audit().unwrap();
        w.tick(opened + 7 * 24 - 1);
        assert_eq!(w.settle_case(case, None).map(|_| ()), Err(Reject("the dispute is not final yet")));
        w.tick(opened + 7 * 24);
        let out = w.settle_case(case, None).unwrap();
        assert_eq!((out.winner, out.positions), (Side::Accuser, 1), "the last unopposed side wins");
        assert!(!w.held(challenger) && !w.held(accused) && w.spendable(challenger) >= liquid_c, "restrictions and custody are released");
        // The accused is charged the base stake (paid to the accuser) and so is each guarantor (burned); the uncollectible part is debt.
        assert_eq!(w.stats.sanction_collected + w.debt(accused), Amount::coins(7), "the accused owes exactly the base stake: collected or debt");
        for (k, &g) in guarantors.iter().enumerate() {
            let (l0, d0) = before_guarantors[k];
            let charged = signed(l0) - signed(w.liquid(g)) + signed(w.debt(g)) - signed(d0);
            // A guarantor may itself be the accused's own accuser or hold the stake: only check the plain case.
            if g != challenger && g != accused {
                assert_eq!(charged, signed(Amount::coins(7)), "each guarantor is charged the base stake once");
            }
        }
        assert!(total_liquid(&w) <= before_total, "liquid FCTY can only be burned by the sanction, never created");
        w.audit().unwrap();
    }

    #[test]
    fn a_late_defender_extends_the_deadline_wins_and_takes_the_accusers_forfeited_stake() {
        let mut w = rich_world();
        let (accused, challenger, defender) = xp_ladder(&w);
        let start = w.now();
        let case = w.begin_case(&[challenger, accused]).unwrap();
        // The accused cannot stand for themselves: less XP than the accuser. A defender with more XP can, on day 6, with the 8.4 FCTY stake.
        assert_eq!(w.join_case(case, accused), Err(Reject("XP is not above the previous participant")));
        w.tick(start + 6 * 24);
        let total = total_liquid(&w);
        let spend_d = w.spendable(defender);
        assert_eq!(w.join_case(case, defender), Ok(2));
        assert_eq!(w.spendable(defender), spend_d - Amount::from_atoms(8_400_000_000_000));
        assert_eq!(w.case_deadline(case), Some(start + 12 * 24), "own window of six days from day 6");
        assert_eq!(w.join_case(case, defender), Err(Reject("already a participant")));
        let provenance = w.case_positions(case);
        assert_eq!((provenance[1].before, provenance[1].after, provenance[1].extended()), (Some(start + 7 * 24), start + 12 * 24, true));
        w.audit().unwrap();
        w.tick(start + 12 * 24 - 1);
        assert!(w.settle_case(case, None).is_err());
        w.tick(start + 12 * 24);
        let (lc, ld, xp_before) = (w.liquid(challenger), w.liquid(defender), w.xp(challenger));
        let out = w.settle_case(case, None).unwrap();
        assert_eq!((out.winner, out.positions, out.losers.clone()), (Side::Accused, 2, vec![challenger]));
        assert_eq!(w.liquid(challenger), lc - Amount::coins(7), "the accuser forfeits its stake");
        assert_eq!(w.liquid(defender), ld + Amount::coins(7), "to the first participant who stood for the accused");
        assert_eq!(w.xp(challenger), xp_before / 2, "the losing accuser halved its integrity coefficient: XP is rounded down");
        assert_eq!(total_liquid(&w), total, "stakes only move between participants");
        assert_eq!((w.stats.extensions, w.stats.accused_won), (1, 1));
        assert!(!w.held(challenger) && !w.held(defender) && !w.held(accused));
        w.audit().unwrap();
    }

    #[test]
    fn entries_after_the_deadline_change_nothing_and_an_unbacked_entry_is_allowed() {
        let mut w = rich_world();
        let (accused, challenger, defender) = xp_ladder(&w);
        let rival = (0..12).find(|&i| i != accused && i != challenger && i != defender && w.xp(i) > w.xp(challenger)).expect("another richer-in-XP account");
        let start = w.now();
        let case = w.begin_case(&[challenger, accused]).unwrap();
        // D166: a participant without funds may still stand; it blocks what exists and a lost stake becomes debt.
        w.burn_liquid(defender);
        assert_eq!(w.spendable(defender), Amount::ZERO);
        assert_eq!(w.join_case(case, defender), Ok(2));
        assert_eq!((w.spendable(defender), w.liquid(defender)), (Amount::ZERO, Amount::ZERO));
        assert_eq!(w.stats.refused_funds, 1, "one unbacked entry was counted");
        w.audit().unwrap();
        w.tick(start + 6 * 24 + 23);
        assert!(w.spendable(rival) >= Amount::from_atoms(8_400_000_000_000));
        w.tick(start + 13 * 24);
        assert_eq!(w.join_case(case, rival), Err(Reject("the dispute is final")), "an entry at the deadline hour is refused");
        assert!(w.stats.refused_closed >= 1);
        assert_eq!(w.case_state(case).unwrap().0, 2);
        // The unbacked defender wins here, so it owes nothing; the accuser loses its backed stake.
        w.settle_case(case, None).unwrap();
        assert_eq!(w.debt(defender), Amount::ZERO);
        w.audit().unwrap();
    }

    #[test]
    fn a_lost_unbacked_stake_becomes_debt_that_later_emission_repays() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        let start = w.now();
        w.burn_liquid(challenger);
        let case = w.begin_case(&[challenger, accused]).unwrap();
        assert_eq!(w.stats.refused_funds, 1);
        w.tick(start + 7 * 24);
        let supply = w.supply();
        // The accused proves reality: the lone accuser loses a stake of 7 that was never blocked, so all of it is debt.
        w.settle_case(case, Some(Side::Accused)).unwrap();
        assert_eq!(w.debt(challenger), Amount::coins(7));
        assert_eq!(w.supply(), supply, "nothing was destroyed: the stake had no backing");
        // Each matured entitlement of the indebted account is burned against the debt before it can be spent.
        let rights_before = w.unspent_rights(challenger);
        w.tick(w.now() + 24);
        w.create_self_id(challenger).ok();
        for _ in 0..8 {
            w.tick(w.now() + 24);
            let _ = w.create_self_id(challenger);
        }
        assert!(w.debt(challenger) < Amount::coins(7), "emission repaid part of the debt");
        assert!(w.stats.debt_repaid > Amount::ZERO);
        let _ = rights_before;
        w.audit().unwrap();
    }

    #[test]
    fn overlapping_cases_keep_each_restriction_until_the_last_one_closes() {
        let mut w = rich_world();
        let (accused, c1, c2) = xp_ladder(&w);
        let a = w.begin_case(&[c1, accused]).unwrap();
        let b = w.begin_case(&[c2, accused]).unwrap();
        assert!(w.path_blocked(accused));
        w.end_case(a);
        assert!(w.held(accused) && w.path_blocked(accused), "the second case still restricts the accused");
        assert!(!w.held(c1) && w.held(c2));
        w.audit().unwrap();
        w.end_case(b);
        assert!(!w.held(accused) && !w.held(c2), "released only when the last case ends");
        assert_eq!((w.spendable(c1), w.spendable(c2)), (w.liquid(c1), w.liquid(c2)), "custody released");
        w.audit().unwrap();
    }

    #[test]
    fn the_accused_cannot_withdraw_unspent_rights_until_the_last_case_ends() {
        let mut w = rich_world();
        let (accused, c1, c2) = xp_ladder(&w);
        // A fresh matured right on the accused.
        let own = w.create_self_id(accused);
        w.tick(w.now() + 24);
        let right = own.ok().and_then(|_| w.eligible_emission(accused)).expect("a matured right");
        let a = w.begin_case(&[c1, accused]).unwrap();
        let b = w.begin_case(&[c2, accused]).unwrap();
        assert_eq!(w.convert_to_collector(accused, right), Err(Reject("unspent rights are frozen while the account is accused")));
        w.end_case(a);
        assert!(w.convert_to_collector(accused, right).is_err(), "still frozen by the second case");
        w.audit().unwrap();
        w.end_case(b);
        w.convert_to_collector(accused, right).unwrap();
        w.audit().unwrap();
    }

    #[test]
    fn a_negative_emission_balance_blocks_invitations_and_guarantees_and_suspends_xp_until_repaid() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        // The held mature right backs one unit of the stake; six units remain unbacked.
        let right = w.create_self_id(challenger).unwrap();
        w.tick(w.now() + 24);
        let start = w.now();
        w.burn_liquid(challenger);
        let case = w.begin_case(&[challenger, accused]).unwrap();
        w.tick(start + 7 * 24);
        w.settle_case(case, Some(Side::Accused)).unwrap();
        assert_eq!(w.debt(challenger), Amount::coins(6));
        assert_eq!(w.create_invitation(challenger, right), Err(Reject("negative emission balance blocks invitations and guarantees")));
        assert_eq!(w.open_valence(challenger, 11, right), Err(Reject("negative emission balance blocks invitations and guarantees")));
        // Acts that mature while the balance is negative earn nobody XP; each is burned against the debt.
        let mut suspended = 0;
        while w.debt(challenger) > Amount::ZERO {
            let act = w.create_self_id(challenger).unwrap();
            let guarantors = w.act_guarantors(act).to_vec();
            let before: Vec<i32> = (0..w.len() as Id).map(|i| w.responsibility_units(i)).collect();
            let coef = w.coefficient(challenger);
            w.tick(w.now() + 24);
            assert_eq!((0..w.len() as Id).map(|i| w.responsibility_units(i)).collect::<Vec<_>>(), before, "no new units for anyone during debt");
            assert_eq!(w.coefficient(challenger), coef + COEF_STEP, "own maturity still repairs integrity");
            assert!(guarantors.len() <= 12);
            suspended += 1;
            assert!(suspended <= 7, "seven units repay a debt of seven");
        }
        assert_eq!(suspended, 6);
        // Back in the black: the next act earns XP again and invitations are possible again.
        let act = w.create_self_id(challenger).unwrap();
        let before = w.xp(challenger);
        w.tick(w.now() + 24);
        assert!(w.xp(challenger) >= before, "new units and coefficient repair resume effective XP growth");
        let _ = act;
        assert!(w.create_invitation(challenger, w.eligible_emission(challenger).unwrap()).is_ok());
        w.audit().unwrap();
    }

    #[test]
    fn the_liable_roster_of_an_identity_case_is_everyone_who_earned_xp_for_its_acts_even_after_leaving() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        let current = w.eligible_guarantors(accused);
        assert!(!current.is_empty());
        // One guarantor leaves; it still earned XP for past acts and so stays liable.
        let leaver = current[0];
        let v: Vec<u32> = (0..w.valences.len() as u32)
            .filter(|&v| w.valences[v as usize].owner == leaver && w.valences[v as usize].counterpart == accused && w.valences[v as usize].open)
            .collect();
        if let Some(&val) = v.first() {
            w.withdraw_valence(leaver, val).unwrap();
            assert!(!w.eligible_guarantors(accused).contains(&leaver));
            assert!(w.liable_guarantors(accused).contains(&leaver), "a departed guarantor stays on the roster of the acts it earned XP for");
        }
        let roster = w.liable_guarantors(accused);
        assert!(roster.len() >= current.len() - 1);
        let case = w.begin_case(&[challenger, accused]).unwrap();
        w.end_case(case);
        w.audit().unwrap();
    }

    #[test]
    fn emitter_custody_is_exclusive_releases_in_kind_and_a_forfeit_collects_without_rewriting_xp() {
        let mut w = rich_world();
        let (accused, challenger, defender) = xp_ladder(&w);
        w.burn_liquid(challenger);
        for _ in 0..3 {
            w.create_self_id(challenger).unwrap();
            w.tick(w.now() + DAY);
        }
        let rights = w.eligible_emissions(challenger, DAY);
        let units = w.responsibility_units(challenger);
        let a = w.begin_case(&[challenger, accused]).unwrap();
        assert!(w.eligible_emissions(challenger, DAY).is_empty());
        assert!(w.convert_to_collector(challenger, rights[0]).is_err());
        let b = w.begin_case(&[challenger, defender]).unwrap();
        assert_eq!(w.case_ref(b).unwrap().backed[0].total(), Amount::ZERO, "no collateral reuse");
        w.end_case(b);
        w.end_case(a);
        assert_eq!(w.eligible_emissions(challenger, DAY), rights, "moot custody returns Emitter rights without withdrawing");
        assert_eq!(w.liquid(challenger), Amount::ZERO);
        let a = w.begin_case(&[challenger, accused]).unwrap();
        w.tick(w.case_deadline(a).unwrap());
        w.settle_case(a, Some(Side::Accused)).unwrap();
        assert_eq!((w.debt(challenger), w.unspent_rights(challenger)), (Amount::coins(4), 0));
        assert_eq!(w.responsibility_units(challenger), units, "economic collection does not rewrite XP provenance");
        assert_eq!(w.stats.stake_burned, Amount::coins(3));
        w.audit().unwrap();
    }

    #[test]
    fn sanctions_collect_frozen_emitter_rights_and_revoked_collateral_cannot_pay_twice() {
        let mut w = rich_world();
        let (accused, challenger, defender) = xp_ladder(&w);
        w.burn_liquid(accused);
        w.create_self_id(accused).unwrap();
        w.tick(w.now() + DAY);
        let a = w.begin_case(&[challenger, accused]).unwrap();
        let units = w.responsibility_units(accused);
        w.tick(w.case_deadline(a).unwrap());
        let paid = w.stats.sanction_collected;
        w.settle_case(a, None).unwrap();
        assert_eq!(w.stats.sanction_collected - paid, Amount::ONE);
        assert_eq!(w.debt(accused), Amount::coins(6));
        assert_eq!(w.responsibility_units(accused), units);
        w.burn_liquid(defender);
        w.create_self_id(defender).unwrap();
        w.tick(w.now() + DAY);
        let b = w.begin_case(&[defender, challenger]).unwrap();
        assert_eq!(w.case_ref(b).unwrap().backed[0].total(), Amount::ONE);
        w.void_chain(defender);
        w.audit().unwrap();
        let supply = w.supply();
        w.tick(w.case_deadline(b).unwrap());
        w.settle_case(b, Some(Side::Accused)).unwrap();
        assert_eq!(w.debt(defender), Amount::coins(7));
        assert_eq!(w.supply(), supply, "revoked Emitter collateral has already burned; settlement creates debt only");
        w.audit().unwrap();
    }

    #[test]
    fn a_previously_invalidated_xp_recipient_stays_liable_and_a_losing_council_entrant_is_halved() {
        let mut w = rich_world();
        let (accused, challenger, defender) = xp_ladder(&w);
        let old = w.liable_guarantors(accused).into_iter().find(|&g| g != challenger && g != defender).unwrap();
        w.invalidate_identity(old);
        assert!(w.liable_guarantors(accused).contains(&old));
        let case = w.begin_case(&[challenger, accused]).unwrap();
        assert!(w.liable_guarantors(accused).contains(&old));
        w.end_case(case);
        w.reinstate_identity(old);
        let case = w.begin_case(&[challenger, accused]).unwrap();
        w.join_case(case, defender).unwrap();
        let member = w.council().iter().copied().find(|&m| m != accused && m != challenger && m != defender).unwrap();
        w.council_join(case, member).unwrap();
        for m in w.council().to_vec() {
            w.council_ballot(case, m, 0, CouncilVote::Confirm);
        }
        w.tick(w.case_deadline(case).unwrap());
        let coef = w.coefficient(member);
        let out = w.settle_case(case, Some(Side::Accused)).unwrap();
        assert!(out.losers.contains(&member));
        assert_eq!(w.coefficient(member), coef / 2, "D164 includes the Council entrant");
        w.audit().unwrap();
    }

    #[test]
    fn liability_includes_receipts_matured_during_the_case_and_the_losing_owner_is_halved_once() {
        let mut w = rich_world();
        let (accused, _, _) = xp_ladder(&w);
        let g = (0..12).find(|&g| g != accused && !w.liable_guarantors(accused).contains(&g)).unwrap();
        let a = w.create_self_id(accused).unwrap();
        let b = w.create_self_id(g).unwrap();
        w.tick(w.now() + DAY);
        w.open_valence(accused, g, a).unwrap();
        w.open_valence(g, accused, b).unwrap();
        w.create_self_id(accused).unwrap();
        assert!(!w.liable_guarantors(accused).contains(&g));
        let challenger = (0..12).filter(|&i| i != accused && i != g && w.xp(i) > w.xp(accused)).max_by_key(|&i| w.xp(i)).unwrap();
        let case = w.begin_case(&[challenger, accused]).unwrap();
        w.tick(w.case_deadline(case).unwrap());
        assert!(w.liable_guarantors(accused).contains(&g));
        let before = signed(w.liquid(g) + Amount::coins(w.unspent_rights(g) as u64)) - signed(w.debt(g));
        let coefficient = w.coefficient(accused);
        let out = w.settle_case(case, None).unwrap();
        let after = signed(w.liquid(g) + Amount::coins(w.unspent_rights(g) as u64)) - signed(w.debt(g));
        assert_eq!(before - after, signed(Amount::coins(7)), "the newly credited guarantor is liable");
        assert_eq!(w.coefficient(accused), coefficient / 2);
        assert_eq!(out.losers.iter().filter(|&&i| i == accused).count(), 1);
        w.audit().unwrap();
    }

    #[test]
    fn the_council_enters_once_without_stake_and_its_ballots_decide_on_the_shared_clock() {
        let mut w = rich_world();
        let (accused, challenger, defender) = xp_ladder(&w);
        let start = w.now();
        let case = w.begin_case(&[challenger, accused]).unwrap();
        w.join_case(case, defender).unwrap();
        let council = w.council().to_vec();
        assert!(council.len() >= 3);
        let outsider = (0..12).find(|i| !council.contains(i)).map(|i| i as Id);
        if let Some(o) = outsider {
            assert_eq!(w.council_join(case, o), Err(Reject("not a Council member")));
            assert!(!w.council_ballot(case, o, 0, CouncilVote::Confirm));
        }
        let entrant = council.iter().copied().find(|&m| m != accused && m != challenger && m != defender).unwrap();
        let deadline_before = w.case_deadline(case).unwrap();
        w.tick(start + 24);
        let spend = w.spendable(entrant);
        assert_eq!(w.council_join(case, entrant), Ok(3), "the Council entry is one position");
        assert_eq!(w.spendable(entrant), spend, "no stake for the Council entry");
        assert_eq!(w.council_join(case, council[0]), Err(Reject("the Council entered; it is the terminal entrant")));
        let deadline_after = w.case_deadline(case).unwrap();
        assert!(deadline_after >= deadline_before, "the deadline never shortens");
        assert_eq!(deadline_after, deadline_before.max(start + 24 + 5 * 24));
        let positions = w.stats.max_positions;
        for &m in council.iter().take(3) {
            w.council_ballot(case, m, 0, CouncilVote::Oppose);
        }
        assert_eq!(w.case_deadline(case), Some(deadline_after), "ballots do not move the deadline");
        assert_eq!(w.stats.max_positions, positions);
        w.tick(deadline_after);
        // The Council entry stood on the accuser's side (position 3); a majority against it hands the dispute to the accused's side.
        let out = w.settle_case(case, None).unwrap();
        assert_eq!(out.winner, Side::Accused);
        w.audit().unwrap();
    }

    #[test]
    fn council_deferrals_preserve_custody_and_restrictions_until_a_final_round() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        let case = w.begin_case(&[challenger, accused]).unwrap();
        let member = w.council().iter().copied().find(|&m| m != accused && m != challenger).unwrap();
        w.council_join(case, member).unwrap();
        let cutoff = w.case_deadline(case).unwrap();
        let before = (w.supply(), w.liquid(challenger), w.subjects[challenger as usize].reserved, w.coefficient(challenger));
        assert!(before.2 > Amount::ZERO, "real stake custody is reserved");
        assert!(w.council_ballot(case, member, 0, CouncilVote::Defer));
        w.tick(cutoff - 1);
        assert_eq!(w.case_deadline(case), Some(cutoff));
        assert!(w.settle_case(case, Some(Side::Accused)).is_err(), "outside proof cannot bypass an unresolved Council round");
        w.tick(cutoff);
        assert_eq!(w.case_deadline(case), Some(cutoff + 7 * DAY));
        assert_eq!(w.case_council_round(case).unwrap().number, 1);
        assert!(!w.council_ballot(case, member, 0, CouncilVote::Defer), "old ballot cannot extend the fresh round");
        assert_eq!((w.supply(), w.liquid(challenger), w.subjects[challenger as usize].reserved, w.coefficient(challenger)), before);
        assert!(w.held(challenger) && w.held(accused) && w.held(member));
        assert!(w.create_self_id(accused).is_err());
        assert!(w.join_case(case, accused).is_err(), "deferral never reopens ordinary entry");
        w.tick(cutoff);
        assert_eq!(w.stats.majority_deferrals, 1, "reprocessing a cutoff cannot add another extension");
        w.tick(cutoff + 7 * DAY);
        assert_eq!(w.case_deadline(case), Some(cutoff + 14 * DAY));
        assert_eq!(w.stats.automatic_deferrals, 1, "the earlier majority was not carried forward");
        assert_eq!(w.stats.settled, 0);
        assert_eq!(w.stats.xp_halved, 0);
        assert!(w.settle_case(case, None).is_err());
        let final_member = w.case_council_round(case).unwrap().members[0];
        assert!(w.council_ballot(case, final_member, 2, CouncilVote::Confirm));
        w.tick(cutoff + 14 * DAY);
        assert!(w.case_final(case));
        assert!(!w.council_ballot(case, final_member, 2, CouncilVote::Oppose), "cutoff ballots are too late");
        let out = w.settle_case(case, None).unwrap();
        assert_eq!(out.winner, Side::Accused);
        assert_eq!(out.council_rounds.iter().map(|r| r.ballots.len()).collect::<Vec<_>>(), vec![1, 0, 1]);
        assert_eq!(out.council_electorates.len(), 3);
        assert!(!w.held(challenger) && !w.held(accused) && !w.held(member));
        assert_eq!(w.stats.council_rounds, 3);
        assert!(w.settle_case(case, None).is_err());
        w.audit().unwrap();
    }

    #[test]
    fn council_electorates_are_frozen_per_round_and_jumped_cutoffs_match_chronological_processing() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        let case = w.begin_case(&[challenger, accused]).unwrap();
        let member = w.council().iter().copied().find(|&m| m != accused && m != challenger).unwrap();
        w.council_join(case, member).unwrap();
        let initial = w.case_council_round(case).unwrap().clone();
        let cutoff = w.case_deadline(case).unwrap();
        w.penalize_xp(member, 1.0);
        w.tick(w.now() + 1);
        assert!(!w.council().contains(&member));
        let newcomer = *w.council().iter().find(|m| !initial.members.contains(m)).unwrap();
        assert!(!w.council_ballot(case, newcomer, 0, CouncilVote::Confirm));
        assert!(w.council_ballot(case, member, 0, CouncilVote::Defer), "old member keeps this round's vote");
        assert_eq!(w.case_council_round(case), Some(&initial));
        w.tick(cutoff);
        assert_eq!(w.case_council_round(case).unwrap().members, w.council());
        assert!(!w.council_ballot(case, member, 1, CouncilVote::Confirm));
        let mut batch = w.clone();
        let endpoint = cutoff + 22 * DAY;
        while w.now() < endpoint {
            w.tick((w.now() + DAY).min(endpoint));
        }
        batch.tick(endpoint);
        assert_eq!(w.case_council_rounds(case), batch.case_council_rounds(case));
        assert_eq!(w.case_ref(case).unwrap().electorates, batch.case_ref(case).unwrap().electorates);
        assert_eq!(w.case_deadline(case), batch.case_deadline(case));
        assert_eq!(w.stats.automatic_deferrals, 3);
        assert_eq!(batch.stats.automatic_deferrals, 3);
        assert!(batch.held(challenger) && batch.held(accused));
        w.audit().unwrap();
        batch.audit().unwrap();
    }

    #[test]
    fn case_restoration_preserves_other_verdicts_and_independent_revocations() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        let original: Vec<i32> = (0..w.len() as Id).map(|id| w.responsibility_units(id)).collect();
        let separately_penalized = (0..w.len() as Id).find(|&id| id != accused && id != challenger).unwrap();
        w.penalize_xp(separately_penalized, 0.2);
        let source = w.subjects[accused as usize].acts[0];
        assert!(w.revoke_source_xp(source));
        let expected: Vec<i32> = (0..w.len() as Id).map(|id| w.responsibility_units(id)).collect();
        let a = w.begin_case(&[challenger, accused]).unwrap();
        let b = w.begin_case(&[challenger, accused]).unwrap();
        w.tick(w.case_deadline(a).unwrap());
        w.settle_case(a, None).unwrap();
        w.settle_case(b, None).unwrap();
        let ongoing = w.begin_case(&[challenger, accused]).unwrap();
        w.apply_case_identity_verdict(a).unwrap();
        w.apply_case_identity_verdict(b).unwrap();
        w.apply_case_xp_penalty(a, separately_penalized, 0.5).unwrap();
        let mut independently_invalid = w.clone();
        independently_invalid.invalidate_identity(accused);
        let money = (w.supply(), w.burned, total_liquid(&w));
        let first = w.restore_case_effects(a).unwrap();
        assert!(!first.status_restored);
        assert_eq!(first.responsibility_units, 0, "the other verdict still blocks the same receipts");
        assert!(!w.accepted(accused));
        assert_eq!(w.coefficient(accused), COEF_ONE / 2);
        assert_eq!(w.coefficient(separately_penalized), 800_000, "the case's role penalty is removed, its independent loss remains");
        let second = w.restore_case_effects(b).unwrap();
        assert!(second.status_restored && second.responsibility_units > 0);
        for (id, &units) in expected.iter().enumerate() {
            assert_eq!(w.responsibility_units(id as Id), units);
        }
        assert!(original[accused as usize] > expected[accused as usize]);
        assert_eq!(w.coefficient(accused), COEF_ONE);
        assert!(w.held(accused), "restoration never releases another case's hold");
        assert_eq!((w.supply(), w.burned, total_liquid(&w)), money, "no burned or transferred money is refunded");
        assert!(w.restore_case_effects(a).is_err());
        assert!(w.apply_case_xp_penalty(a, separately_penalized, 0.5).is_err());
        assert!(w.restore_case_effects(ongoing).is_err());
        assert!(w.restore_case_effects(u32::MAX).is_err());
        independently_invalid.restore_case_effects(a).unwrap();
        independently_invalid.restore_case_effects(b).unwrap();
        assert!(!independently_invalid.accepted(accused));
        w.audit().unwrap();
        independently_invalid.audit().unwrap();
        w.end_case(ongoing);
        w.audit().unwrap();
    }

    #[test]
    fn case_restoration_covers_an_authorized_related_identity_without_undoing_its_independent_cause() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        let related = (0..w.len() as Id).find(|&id| id != accused && id != challenger).unwrap();
        let original = (w.responsibility_units(accused), w.responsibility_units(related));
        let case = w.begin_case(&[challenger, accused]).unwrap();
        w.tick(w.case_deadline(case).unwrap());
        w.settle_case(case, None).unwrap();
        w.apply_case_identity_verdict(case).unwrap();
        w.apply_case_identity_verdict_to(case, related).unwrap();
        assert!(w.apply_case_identity_verdict_to(case, related).is_err());
        let mut independent = w.clone();
        independent.invalidate_identity(related);
        let restored = w.restore_case_effects(case).unwrap();
        assert_eq!(restored.statuses_restored, 2);
        assert!(w.accepted(accused) && w.accepted(related));
        assert_eq!((w.responsibility_units(accused), w.responsibility_units(related)), original);
        let restored = independent.restore_case_effects(case).unwrap();
        assert_eq!(restored.statuses_restored, 1);
        assert!(independent.accepted(accused) && !independent.accepted(related));
        w.audit().unwrap();
        independent.audit().unwrap();
    }

    #[test]
    fn case_debt_cancellation_follows_fifo_and_preserves_paid_burns_and_other_debt() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        w.burn_liquid(challenger);
        let a = w.begin_case(&[challenger, accused]).unwrap();
        let b = w.begin_case(&[challenger, accused]).unwrap();
        w.tick(w.case_deadline(a).unwrap());
        w.settle_case(a, Some(Side::Accused)).unwrap();
        w.settle_case(b, Some(Side::Accused)).unwrap();
        assert_eq!(w.debt(challenger), Amount::coins(14));
        let burned = w.burned;
        let mut suspended = Vec::new();
        for _ in 0..5 {
            suspended.push(w.create_self_id(challenger).unwrap());
            w.tick(w.now() + DAY);
        }
        assert_eq!(w.subjects[challenger as usize].debt_tranches.iter().map(|d| d.remaining).collect::<Vec<_>>(), vec![Amount::coins(2), Amount::coins(7)]);
        let units = w.responsibility_units(challenger);
        let outcome = w.restore_case_effects(a).unwrap();
        assert_eq!(outcome.debt_cancelled, Amount::coins(2));
        assert_eq!(w.debt(challenger), Amount::coins(7));
        assert_eq!(w.debt_repaid(challenger), Amount::coins(5));
        assert_eq!(w.burned, burned + Amount::coins(5));
        assert_eq!(w.stats.debt_created, Amount::coins(14));
        assert_eq!(w.stats.debt_cancelled, Amount::coins(2));
        assert_eq!(w.coefficient(challenger), COEF_ONE / 2 + 5 * COEF_STEP);
        assert_eq!(w.responsibility_units(challenger), units, "debt-suspended receipts are never backfilled");
        assert!(suspended.iter().all(|&a| w.acts[a as usize].credit.as_ref().unwrap().recipients.is_empty()));
        assert!(w.restore_case_effects(a).is_err());
        assert_eq!(w.debt(challenger), Amount::coins(7));
        w.audit().unwrap();
    }

    #[test]
    fn case_restoration_returns_original_receipts_without_resurrecting_cancelled_rights() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        let guarantor = w.acts[w.subjects[accused as usize].acts[0] as usize].credit.as_ref().unwrap().recipients[1];
        let valence = w.valences.iter().position(|v| v.open && v.owner == guarantor && v.counterpart == accused).unwrap() as u32;
        w.withdraw_valence(guarantor, valence).unwrap();
        let before = (w.responsibility_units(accused), w.responsibility_units(guarantor));
        let case = w.begin_case(&[challenger, accused]).unwrap();
        w.tick(w.case_deadline(case).unwrap());
        w.settle_case(case, None).unwrap();
        let young = w.create_self_id(accused).unwrap();
        w.apply_case_identity_verdict(case).unwrap();
        assert!(w.acts[young as usize].credit.is_none());
        let burned = w.burned;
        w.restore_case_effects(case).unwrap();
        assert_eq!((w.responsibility_units(accused), w.responsibility_units(guarantor)), before);
        assert_eq!(w.burned, burned);
        assert_eq!(w.acts[young as usize].status, ActStatus::Cancelled);
        w.tick(w.now() + DAY);
        assert!(w.acts[young as usize].credit.is_none(), "no unit is invented for an act cancelled before maturity");
        w.audit().unwrap();
    }

    #[test]
    fn a_proof_of_reality_decides_for_the_accused_and_the_lone_accusers_stake_is_burned() {
        let mut w = rich_world();
        let (accused, challenger, _) = xp_ladder(&w);
        let start = w.now();
        let (lc, supply) = (w.liquid(challenger), w.supply());
        let case = w.begin_case(&[challenger, accused]).unwrap();
        w.tick(start + 7 * 24);
        let out = w.settle_case(case, Some(Side::Accused)).unwrap();
        assert_eq!(out.winner, Side::Accused);
        assert_eq!(w.liquid(challenger), lc - Amount::coins(7), "no ordinary position above the lone accuser receives the stake");
        assert_eq!(w.supply(), supply - Amount::coins(7), "it is burned");
        assert_eq!(w.stats.stake_burned, Amount::coins(7));
        w.audit().unwrap();
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
        // The lost account keeps earning guarantor XP from matured acts of others (account 4's act matured at hour 72); what moves is all of it.
        let earned = w.xp(5);
        assert!(earned > 1, "the lost account earned its own XP and guarantor XP at maturity");
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
    fn restoring_a_case_across_consumed_key_recovery_is_blocked_before_any_mutation() {
        let mut w = World::new(Config::default(), 12, &ring(12));
        for id in 0..12 {
            w.create_self_id(id).unwrap();
        }
        w.tick(DAY);
        w.create_self_id(5).unwrap();
        w.tick(2 * DAY);
        assert!(w.xp(0) > w.xp(5));
        let case = w.begin_case(&[0, 5]).unwrap();
        w.tick(w.case_deadline(case).unwrap());
        w.settle_case(case, Some(Side::Accuser)).unwrap();
        w.lose_key(5).unwrap();
        let new = successor(&mut w, 5, 3);
        vouch(&mut w, new, 4);
        w.complete_recovery(new).unwrap();
        let before = (w.xp(new), w.coefficient(new), w.xp(5), w.coefficient(5), w.stats.restorations);
        assert_eq!(w.restore_case_effects(case), Err(Reject("restoration across completed key recovery needs its migration contract")));
        assert_eq!((w.xp(new), w.coefficient(new), w.xp(5), w.coefficient(5), w.stats.restorations), before);
        assert!(!w.accepted(5));
        assert!(!w.reinstate_identity(5), "a consumed key-recovery source cannot be revived");
        w.audit().unwrap();
    }

    #[test]
    fn integrity_restoration_preserves_the_actual_inherited_recovery_cap() {
        let (mut w, old, _) = recovery_world();
        w.penalize_xp(old, 0.4);
        let new = successor(&mut w, old, 3);
        vouch(&mut w, new, 4);
        w.penalize_xp_for_case(new, 0.5, 74);
        w.complete_recovery(new).unwrap();
        assert_eq!(w.coefficient(new), 500_000);
        assert_eq!(w.restore_case_xp_penalties(74), 1);
        assert_eq!(w.coefficient(new), 600_000, "removing the successor's loss keeps the actual inherited cap");
        assert_eq!(w.coefficient(old), 600_000);
        assert_eq!(w.restore_case_xp_penalties(74), 0);
        w.audit_integrity().unwrap();
        w.audit().unwrap();
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
        w.subjects[0].liquid += Amount::ONE;
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

#[cfg(test)]
mod cancellation_tests {
    use super::*;

    fn active_world(days: i64, convert: bool) -> World {
        let pairs: Vec<(Id, Id)> = (0..12).flat_map(|id| [(id, (id + 1) % 12), (id, (id + 2) % 12)]).collect();
        let mut w = World::new(Config { base_stake: Some(7), max_nodes: None, ..Config::default() }, 12, &pairs);
        for _ in 0..days {
            for id in 0..12 {
                w.create_self_id(id).unwrap();
            }
            w.tick(w.now() + DAY);
            if convert {
                for id in 0..12 {
                    for act in w.eligible_emissions(id, MATURITY_HOURS) {
                        w.convert_to_collector(id, act).unwrap();
                    }
                }
            }
        }
        w
    }

    fn graded_world() -> (World, Vec<Id>) {
        let mut w = active_world(10, true);
        for day in 0..12 {
            for id in day..12 {
                w.create_self_id(id).unwrap();
            }
            w.tick(w.now() + DAY);
            for id in 0..12 {
                for act in w.eligible_emissions(id, MATURITY_HOURS) {
                    w.convert_to_collector(id, act).unwrap();
                }
            }
        }
        let mut ids: Vec<Id> = (0..12).collect();
        ids.sort_by_key(|&id| (w.xp(id), id));
        ids.dedup_by(|a, b| w.xp(*a) == w.xp(*b));
        assert!(ids.len() >= 7);
        (w, ids)
    }

    fn activate(w: &mut World, author: Id, accused: Id) -> u32 {
        let case = w.record_case_opening(&[author, accused]).unwrap();
        w.tick(w.case_opening(case).unwrap().matures_at);
        case
    }

    #[test]
    fn author_cancellation_splits_actual_stake_by_joining_order_and_preserves_other_holds() {
        let (mut w, ids) = graded_world();
        let (author, accused) = (ids[1], ids[0]);
        let case = activate(&mut w, author, accused);
        for &id in &ids[2..7] {
            w.join_case(case, id).unwrap();
        }
        let other = w.begin_case(&[author, accused]).unwrap();
        let other_reserved = w.case_ref(other).unwrap().backed[0].liquid;
        let liquid: Vec<Amount> = (0..12).map(|id| w.liquid(id)).collect();
        let responsibility: Vec<(i32, u32)> = (0..12).map(|id| (w.responsibility_units(id), w.coefficient(id))).collect();
        let supply = w.supply();
        let out = w.cancel_case_opening(case, author).unwrap();
        assert_eq!(out.collected, Amount::coins(7));
        assert_eq!(out.debt_created, Amount::ZERO);
        assert_eq!(
            out.payouts,
            vec![
                (ids[2], Amount::from_atoms(2_333_333_333_334)),
                (ids[4], Amount::from_atoms(2_333_333_333_333)),
                (ids[6], Amount::from_atoms(2_333_333_333_333))
            ]
        );
        assert_eq!(out.payouts.iter().map(|p| p.1).sum::<Amount>(), out.collected);
        assert_eq!(out.burned, Amount::ZERO);
        for id in 0..12 {
            let payout = out.payouts.iter().find(|p| p.0 == id).map_or(Amount::ZERO, |p| p.1);
            let expected = if id == author { liquid[id as usize] - Amount::coins(7) } else { liquid[id as usize] + payout };
            assert_eq!(w.liquid(id), expected, "other participants keep their own stake");
        }
        assert_eq!((0..12).map(|id| (w.responsibility_units(id), w.coefficient(id))).collect::<Vec<_>>(), responsibility);
        assert_eq!(w.supply(), supply);
        assert_eq!(w.subjects[author as usize].reserved, other_reserved);
        assert!(w.held(author) && w.held(accused));
        assert!(!w.held(ids[2]));
        assert_eq!((w.stats.author_cancelled, w.stats.settled, w.stats.xp_halved), (1, 0, 0));
        assert_eq!(w.case_opening(case).unwrap().stage, OpeningStage::Cancelled);
        assert!(w.case_opening(case).unwrap().activated_at.is_some());
        assert_eq!(w.case_cancellation(case), Some(&out));
        assert!(w.cancel_case_opening(case, author).is_err());
        assert!(w.apply_case_identity_verdict(case).is_err());
        assert!(w.restore_case_effects(case).is_err());
        w.audit().unwrap();
    }

    #[test]
    fn author_cancellation_is_free_while_pending_and_rejected_for_wrong_author_or_final_case() {
        let (mut w, ids) = graded_world();
        let (author, accused) = (ids[1], ids[0]);
        let pending = w.record_case_opening(&[author, accused]).unwrap();
        let before = (w.liquid(author), w.supply(), w.stats.staked, w.stats.opened);
        assert!(w.cancel_case_opening(pending, accused).is_err());
        assert!(w.cancel_case_opening(u32::MAX, author).is_err());
        let out = w.cancel_case_opening(pending, author).unwrap();
        assert!(!out.activated && out.collected.is_zero() && out.debt_created.is_zero());
        assert_eq!((w.liquid(author), w.supply(), w.stats.staked, w.stats.opened), before);
        assert_eq!((w.stats.openings_cancelled, w.stats.author_cancelled), (1, 0));
        let case = activate(&mut w, author, accused);
        let before = (w.liquid(author), w.subjects[author as usize].reserved, w.hold.clone());
        assert!(w.cancel_case_opening(case, accused).is_err());
        assert_eq!((w.liquid(author), w.subjects[author as usize].reserved, w.hold.clone()), before);
        w.tick(w.case_deadline(case).unwrap());
        assert!(w.cancel_case_opening(case, author).is_err());
        assert!(w.held(author));
        w.settle_case(case, Some(Side::Accused)).unwrap();
        assert!(w.cancel_case_opening(case, author).is_err());
        w.audit().unwrap();
    }

    #[test]
    fn author_cancellation_during_council_deferral_excludes_council_and_keeps_unfinished_ballots() {
        let (mut w, ids) = graded_world();
        let (author, accused, defender) = (ids[1], ids[0], ids[2]);
        let case = activate(&mut w, author, accused);
        w.join_case(case, defender).unwrap();
        let member = w.council().iter().copied().find(|&id| id != author && id != defender && id != accused).unwrap();
        w.council_join(case, member).unwrap();
        let mut final_case = w.clone();
        final_case.council_ballot(case, member, 0, CouncilVote::Confirm);
        final_case.tick(final_case.case_deadline(case).unwrap());
        assert!(final_case.cancel_case_opening(case, author).is_err(), "a recognized Council final result cannot be cancelled");
        w.council_ballot(case, member, 0, CouncilVote::Defer);
        w.tick(w.case_deadline(case).unwrap());
        let current = w.case_council_round(case).unwrap().clone();
        assert!(w.council_ballot(case, current.members[0], current.number, CouncilVote::Confirm));
        let out = w.cancel_case_opening(case, author).unwrap();
        assert_eq!(out.payouts, vec![(defender, Amount::coins(7))]);
        assert_eq!(out.council_rounds.len(), 1);
        assert_eq!(out.active_ballots.len(), 1);
        assert_eq!(out.active_ballots[0].who, current.members[0]);
        assert!(!w.held(member));
        w.audit().unwrap();
        w.case_cancellations[case as usize].as_mut().unwrap().active_ballots[0].cast_at = out.cancelled_at + 1;
        assert!(w.audit().is_err(), "unfinished ballots cannot appear after the cancellation");
    }

    #[test]
    fn author_cancellation_uses_only_actual_backing_and_burns_it_without_ordinary_defenders() {
        let (mut w, ids) = graded_world();
        let (author, accused) = (ids[1], ids[0]);
        w.burn_liquid(author);
        w.create_self_id(author).unwrap();
        let case = activate(&mut w, author, accused);
        let mut defended = w.clone();
        defended.join_case(case, ids[2]).unwrap();
        let distributed = defended.cancel_case_opening(case, author).unwrap();
        assert_eq!(distributed.payouts, vec![(ids[2], Amount::ONE)], "only the one actually backed coin funds the payout");
        assert_eq!((distributed.debt_created, distributed.burned), (Amount::coins(6), Amount::ZERO));
        defended.audit().unwrap();
        let before = (w.burned, w.supply(), w.coefficient(author));
        let out = w.cancel_case_opening(case, author).unwrap();
        assert_eq!((out.collected, out.debt_created, out.burned), (Amount::ONE, Amount::coins(6), Amount::ONE));
        assert!(out.payouts.is_empty());
        assert_eq!(w.debt(author), Amount::coins(6));
        assert_eq!(w.burned, before.0 + Amount::ONE);
        assert_eq!(w.supply(), before.1 - Amount::ONE);
        assert_eq!(w.coefficient(author), before.2);
        assert!(w.case_effects[case as usize].is_none());
        w.audit().unwrap();
    }

    #[test]
    fn defending_council_position_receives_no_cancelled_author_stake() {
        let (mut w, ids) = graded_world();
        let (author, accused) = (ids[1], ids[0]);
        let case = activate(&mut w, author, accused);
        let member = w.council().iter().copied().find(|&id| id != author && id != accused).unwrap();
        assert_eq!(w.council_join(case, member).unwrap(), 2);
        let liquid = w.liquid(member);
        let out = w.cancel_case_opening(case, author).unwrap();
        assert!(out.payouts.is_empty());
        assert_eq!(out.burned, Amount::coins(7));
        assert_eq!(w.liquid(member), liquid);
        w.audit().unwrap();
    }

    #[test]
    fn partial_collection_of_a_last_emission_preserves_exact_collector_change() {
        let mut w = active_world(9, false);
        w.create_self_id(0).unwrap();
        w.tick(w.now() + DAY);
        let case = w.begin_case(&[5, 6]).unwrap();
        w.join_case(case, 0).unwrap();
        assert_eq!(w.case_ref(case).unwrap().backed[1].rights.len(), 9);
        let original_units = w.responsibility_units(0);
        w.tick(w.case_deadline(case).unwrap());
        w.settle_case(case, Some(Side::Accuser)).unwrap();
        assert_eq!(w.liquid(0), Amount::from_atoms(600_000_000_000));
        assert_eq!(w.debt(0), Amount::ZERO);
        assert_eq!(w.responsibility_units(0), original_units, "collection never revokes source receipts");
        w.audit().unwrap();
    }

    #[test]
    fn sub_coin_debt_repayment_burns_only_the_debt_and_retains_change_without_backfill() {
        let mut w = active_world(8, false);
        w.create_self_id(1).unwrap();
        w.tick(w.now() + DAY);
        let case = w.begin_case(&[5, 6]).unwrap();
        w.join_case(case, 0).unwrap();
        w.tick(w.case_deadline(case).unwrap());
        w.settle_case(case, Some(Side::Accuser)).unwrap();
        assert_eq!(w.debt(0), Amount::from_atoms(400_000_000_000));
        let act = w.create_self_id(0).unwrap();
        let before = (w.burned, w.supply(), w.responsibility_units(0));
        w.tick(w.now() + DAY);
        assert_eq!(w.acts[act as usize].status, ActStatus::Converted);
        assert!(w.acts[act as usize].credit.as_ref().unwrap().recipients.is_empty());
        assert_eq!(w.debt(0), Amount::ZERO);
        assert_eq!(w.debt_repaid(0), Amount::from_atoms(400_000_000_000));
        assert_eq!(w.liquid(0), Amount::from_atoms(600_000_000_000));
        assert_eq!(w.burned, before.0 + Amount::from_atoms(400_000_000_000));
        assert_eq!(w.supply(), before.1 - Amount::from_atoms(400_000_000_000));
        assert_eq!(w.responsibility_units(0), before.2);
        w.audit().unwrap();
    }
}
