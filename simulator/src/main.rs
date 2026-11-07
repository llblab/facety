//! `facety-sim grown`: grow an honest network to a target size, then attack clones of that snapshot (detection always on).
//! Invalid or unknown arguments are refused with a diagnostic and exit code 2; a result file that already exists is never
//! overwritten silently (exit code 3).
use facety_sim::json;
use facety_sim::runner::{RunConfig, Sim, Strategy};
use facety_sim::world::SearchOrder;
use std::collections::{HashMap, HashSet};
use std::io::Write as _;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

const VALUE_KEYS: &[&str] = &[
    "--seeds",
    "--first-seed",
    "--bound",
    "--attackers",
    "--horizon",
    "--target-honest",
    "--strategy",
    "--vetting",
    "--vet-sens",
    "--vet-fpr",
    "--met",
    "--double",
    "--artifact",
    "--subtree-cases",
    "--confirm",
    "--appeal",
    "--cash-out",
    "--accuse",
    "--svg",
    "--shock-day",
    "--shock-days",
    "--shock-fpr-x",
    "--odd-share",
    "--odd-mult",
    "--xp-penalty",
    "--collusion",
    "--max-subjects",
    "--threads",
    "--out",
    "--inspect",
    "--fpr",
    "--sens",
    "--review",
    "--accuracy",
    "--public-look",
    "--defense",
    "--defense-days",
    "--base-stake",
    "--keep-rights",
    "--join-rate",
    "--council-rate",
    "--council-turnout",
    "--disputes-from",
    "--honest-genesis",
    "--search-order",
    "--council-seats",
    "--council-seats-per-d",
    "--council-per-thousand",
    "--max-d",
    "--k",
    "--k-step",
    "--k-xp-per-level",
    "--patience",
    "--careless",
    "--corrupt",
    "--befriend",
    "--key-loss",
    "--recovery-vouch",
    "--recovery-delay",
    "--invite",
    "--accept-far",
    "--careless-accept",
];
const FLAG_KEYS: &[&str] = &[
    "--restore-links",
    "--confirm-public",
    "--recover-liquid",
    "--no-layered",
    "--acquit",
    "--prefix-only",
    "--detect-prefix",
    "--allow-disputed",
    "--accuse-hubs",
    "--self-path-from-guarantor",
    "--targets-only",
    "--exclude-challengers",
    "--overwrite",
    "--no-stakes",
    "--no-halving",
    "--halving-spares-council",
    "--no-attacker-ladder",
];

const USAGE: &str = "usage: facety-sim grown [--seeds N] [--first-seed K] [--bound NODES|none] [--no-layered] [--search-order none|xp|degree|both] [--attackers N] [--horizon DAYS]
  [--target-honest N] [--honest-genesis N] [--strategy cone|honest-first|supported-first] [--vetting P] [--vet-sens P] [--vet-fpr P]
  [--met P] [--double P] [--artifact P] [--subtree-cases N] [--confirm N] [--confirm-public] [--appeal P] [--cash-out P] [--svg DIR] [--accuse R] [--accuse-hubs] [--shock-day N --shock-days N --shock-fpr-x X] [--odd-share P] [--odd-mult X] [--restore-links] [--recover-liquid] [--xp-penalty F] [--collusion P] [--acquit] [--detect-prefix] [--allow-disputed] [--targets-only] [--exclude-challengers] [--self-path-from-guarantor] [--inspect P] [--fpr P] [--sens P] [--review P] [--accuracy P]
  [--public-look P] [--defense P] [--defense-days N] [--base-stake N] [--keep-rights N] [--no-stakes] [--no-halving] [--halving-spares-council] [--join-rate P] [--council-rate P] [--council-turnout P] [--no-attacker-ladder] [--disputes-from N] [--council-seats N] [--council-seats-per-d N] [--council-per-thousand N] [--max-d N] [--k N] [--k-step N] [--k-xp-per-level N] [--patience DAYS] [--careless P] [--corrupt P] [--key-loss P] [--recovery-vouch P] [--recovery-delay DAYS] [--befriend P] [--invite P] [--accept-far P] [--careless-accept P] [--max-subjects N] [--threads N] [--out DIR] [--overwrite] [--prefix-only]";

fn fail(message: &str) -> ! {
    eprintln!("error: {message}\n{USAGE}");
    std::process::exit(2)
}

fn parse(args: &[String]) -> Result<(HashMap<String, String>, HashSet<String>), String> {
    let mut opts = HashMap::new();
    let mut flags = HashSet::new();
    let mut i = 0;
    while i < args.len() {
        let a = args[i].as_str();
        if FLAG_KEYS.contains(&a) {
            if !flags.insert(a.to_string()) {
                return Err(format!("{a} given twice"));
            }
            i += 1;
        } else if VALUE_KEYS.contains(&a) {
            let Some(value) = args.get(i + 1) else { return Err(format!("{a} needs a value")) };
            if value.starts_with("--") {
                return Err(format!("{a} needs a value, got the option {value}"));
            }
            if opts.insert(a.to_string(), value.clone()).is_some() {
                return Err(format!("{a} given twice"));
            }
            i += 2;
        } else {
            return Err(format!("unknown option {a}"));
        }
    }
    Ok((opts, flags))
}

fn num<T: std::str::FromStr>(opts: &HashMap<String, String>, key: &str, default: T) -> Result<T, String> {
    match opts.get(key) {
        None => Ok(default),
        Some(v) => v.parse().map_err(|_| format!("{key}: invalid value {v:?}")),
    }
}

fn opt_usize(opts: &HashMap<String, String>, key: &str) -> Result<Option<usize>, String> {
    opts.get(key).map(|v| v.parse().map_err(|_| format!("{key}: invalid value {v:?}"))).transpose()
}

fn opt_num(opts: &HashMap<String, String>, key: &str) -> Result<Option<f64>, String> {
    opts.get(key).map(|v| v.parse().map_err(|_| format!("{key}: invalid value {v:?}"))).transpose()
}

struct Plan {
    base: RunConfig,
    seeds: usize,
    first: usize,
    attackers: usize,
    horizon: i64,
    threads: usize,
    out_dir: Option<String>,
    prefix_only: bool,
    overwrite: bool,
    /// Temporary burst of false positives: from `shock_day` days after the snapshot for `shock_days` days the false-positive rate is
    /// multiplied (capped at 1). `shock_days` 0 = no shock.
    svg_dir: Option<String>,
    shock_day: i64,
    shock_days: i64,
    shock_x: f64,
}

fn plan(args: &[String]) -> Result<Plan, String> {
    let (opts, flags) = parse(args)?;
    let seeds: usize = num(&opts, "--seeds", 3)?;
    let threads: usize = num(&opts, "--threads", std::thread::available_parallelism().map_or(4, |n| n.get()))?;
    let horizon: i64 = num(&opts, "--horizon", 365)?;
    let target: usize = num(&opts, "--target-honest", 1000)?;
    if seeds < 1 {
        return Err("--seeds must be at least 1".into());
    }
    if threads < 1 {
        return Err("--threads must be at least 1".into());
    }
    if horizon < 1 {
        return Err("--horizon must be at least 1 day".into());
    }
    let bound = match opts.get("--bound").map(String::as_str) {
        None => Some(7usize),
        Some("none") => None,
        Some(v) => Some(v.parse().map_err(|_| format!("--bound: invalid value {v:?}"))?),
    };
    let strategy = match opts.get("--strategy").map(String::as_str) {
        None | Some("cone") => Strategy::Cone,
        Some("honest-first") => Strategy::HonestFirst,
        Some("supported-first") => Strategy::SupportedFirst,
        Some(other) => return Err(format!("--strategy: unknown strategy {other:?}")),
    };
    let mut base = RunConfig {
        attackers: 0,
        attack_start_day: i64::MAX / 4,
        days: 2000,
        stop_at_honest: target,
        max_subjects: num(&opts, "--max-subjects", 100_000)?,
        strategy,
        ..RunConfig::default()
    };
    base.world.max_nodes = bound;
    // Layered support is part of the baseline (D124 adopted); --no-layered is the ablation.
    if flags.contains("--no-layered") {
        base.world.layered = false;
    }
    base.world.exclude_disputed = !flags.contains("--allow-disputed");
    // D157: the default excludes only the accused from paths; `--targets-only` is the (now redundant) explicit form, `--exclude-challengers` the ablation.
    base.world.exclude_targets_only = !flags.contains("--exclude-challengers");
    base.world.self_path_from_subject = !flags.contains("--self-path-from-guarantor");
    base.honest_genesis = num(&opts, "--honest-genesis", base.honest_genesis)?;
    base.honest.vetting = num(&opts, "--vetting", 0.0)?;
    base.honest.vetting_sensitivity = opt_num(&opts, "--vet-sens")?;
    base.honest.vetting_false_positive = opt_num(&opts, "--vet-fpr")?;
    base.honest.met_in_person = num(&opts, "--met", 0.0)?;
    base.honest.double_life = num(&opts, "--double", 0.0)?;
    base.honest.artifact_rate = num(&opts, "--artifact", base.honest.artifact_rate)?;
    base.honest.collusion = num(&opts, "--collusion", 0.0)?;
    base.detection.subtree_cases = num(&opts, "--subtree-cases", 0usize)?;
    base.detection.confirm = num(&opts, "--confirm", 0usize)?;
    base.detection.confirm_public = flags.contains("--confirm-public");
    base.detection.appeal = num(&opts, "--appeal", 0.0)?;
    base.detection.xp_penalty = num(&opts, "--xp-penalty", 0.0)?;
    base.detection.restore_links = flags.contains("--restore-links");
    base.detection.recover_liquid = flags.contains("--recover-liquid");
    base.world.search_order = match opts.get("--search-order").map(String::as_str) {
        None => None,
        Some("none") => Some(SearchOrder::None),
        Some("xp") => Some(SearchOrder::Xp),
        Some("degree") => Some(SearchOrder::Degree),
        Some("both") => Some(SearchOrder::Both),
        Some(other) => return Err(format!("--search-order: unknown order {other:?}")),
    };
    base.world.council_seats = opt_usize(&opts, "--council-seats")?;
    base.world.council_seats_per_d = opt_usize(&opts, "--council-seats-per-d")?;
    base.world.council_seats_per_thousand = opt_usize(&opts, "--council-per-thousand")?;
    base.world.max_difficulty = opt_usize(&opts, "--max-d")?;
    base.world.k = num(&opts, "--k", base.world.k)?;
    base.world.k_step = opt_usize(&opts, "--k-step")?.map(|v| v as u32);
    base.world.k_xp_per_level = num(&opts, "--k-xp-per-level", base.world.k_xp_per_level)?;
    base.honest.careless_share = num(&opts, "--careless", base.honest.careless_share)?;
    base.honest.corrupt_share = num(&opts, "--corrupt", 0.0)?;
    base.honest.befriend = num(&opts, "--befriend", base.honest.befriend)?;
    base.honest.key_loss = num(&opts, "--key-loss", 0.0)?;
    base.honest.recovery_vouch = num(&opts, "--recovery-vouch", base.honest.recovery_vouch)?;
    base.honest.recovery_delay_days = num(&opts, "--recovery-delay", base.honest.recovery_delay_days)?;
    base.honest.invite = num(&opts, "--invite", base.honest.invite)?;
    base.honest.keep_rights = num(&opts, "--keep-rights", base.honest.keep_rights)?;
    base.honest.accept_far = num(&opts, "--accept-far", base.honest.accept_far)?;
    base.honest.careless_accept_far = num(&opts, "--careless-accept", base.honest.careless_accept_far)?;
    base.attacker_patience_days = num(&opts, "--patience", 0)?;
    base.attacker_cash_out = num(&opts, "--cash-out", 0.0)?;
    base.attacker_accuse = num(&opts, "--accuse", 0.0)?;
    base.accuse_hubs = flags.contains("--accuse-hubs");
    base.detection.odd_share = num(&opts, "--odd-share", 0.0)?;
    base.detection.odd_multiplier = num(&opts, "--odd-mult", 1.0)?;
    base.detection.acquit_met = flags.contains("--acquit");
    base.detection.inspect = num(&opts, "--inspect", base.detection.inspect)?;
    base.detection.false_positive = num(&opts, "--fpr", base.detection.false_positive)?;
    base.detection.sensitivity = num(&opts, "--sens", base.detection.sensitivity)?;
    base.detection.review = num(&opts, "--review", base.detection.review)?;
    base.detection.accuracy = num(&opts, "--accuracy", base.detection.accuracy)?;
    base.detection.public_look = num(&opts, "--public-look", base.detection.public_look)?;
    base.detection.defense_success = num(&opts, "--defense", base.detection.defense_success)?;
    base.detection.defense_days = num(&opts, "--defense-days", base.detection.defense_days)?;
    // Chekharda economics (D159): stakes are on with the selected base of 7 FACY; `--no-stakes` is the ablation. Who joins a dispute and
    // when are research assumptions (`--join-rate`, `--council-rate`, `--council-turnout`, `--no-attacker-ladder`).
    base.world.base_stake = if flags.contains("--no-stakes") { None } else { Some(num(&opts, "--base-stake", facety_sim::chekharda::BASE_STAKE)?) };
    base.world.halve_losers = !flags.contains("--no-halving");
    base.world.halving_spares_council = flags.contains("--halving-spares-council");
    base.detection.join_rate = num(&opts, "--join-rate", base.detection.join_rate)?;
    base.detection.council_rate = num(&opts, "--council-rate", base.detection.council_rate)?;
    base.detection.council_turnout = num(&opts, "--council-turnout", base.detection.council_turnout)?;
    base.detection.attacker_ladder = !flags.contains("--no-attacker-ladder");
    base.detection.disputes_from_active = num(&opts, "--disputes-from", 0)?;
    // The retired baseline grew the honest prefix without detection and switched it on at the snapshot; --detect-prefix runs it from day 0.
    base.detection_start_day = if flags.contains("--detect-prefix") { 0 } else { i64::MAX / 4 };
    if target < base.honest_genesis {
        return Err(format!("--target-honest ({target}) must be at least --honest-genesis ({})", base.honest_genesis));
    }
    base.validate()?;
    let attackers: usize = num(&opts, "--attackers", 10)?;
    // The attack phase must be valid too: check it on a copy now rather than after the growth.
    let mut probe = base.clone();
    probe.attackers = attackers;
    probe.attack_start_day = 0;
    probe.days = horizon;
    probe.stop_at_honest = 0;
    probe.detection_start_day = 0;
    probe.validate()?;
    Ok(Plan {
        base,
        seeds,
        first: num(&opts, "--first-seed", 1)?,
        attackers,
        horizon,
        threads,
        out_dir: opts.get("--out").cloned(),
        prefix_only: flags.contains("--prefix-only"),
        overwrite: flags.contains("--overwrite"),
        svg_dir: opts.get("--svg").cloned(),
        shock_day: num(&opts, "--shock-day", 100)?,
        shock_days: num(&opts, "--shock-days", 0)?,
        shock_x: num(&opts, "--shock-fpr-x", 10.0)?,
    })
}

fn meta(elapsed: f64, argv: &[String], threads: usize) -> String {
    let commit = option_env!("FACETY_COMMIT").filter(|c| !c.is_empty());
    let dirty = option_env!("FACETY_DIRTY") == Some("true");
    let argv: Vec<String> = argv.iter().map(|a| json::string(a)).collect();
    format!(
        "{{\"commit\":{},\"dirtyWhenBuilt\":{},\"elapsedSeconds\":{:.3},\"threads\":{},\"argv\":[{}]}}",
        commit.map_or("null".to_string(), json::string),
        dirty,
        elapsed,
        threads,
        argv.join(",")
    )
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    if argv.first().map(String::as_str) != Some("grown") {
        fail("the only command is grown");
    }
    let plan = match plan(&argv[1..]) {
        Ok(p) => p,
        Err(e) => fail(&e),
    };
    if let Some(dir) = &plan.out_dir {
        if let Err(e) = std::fs::create_dir_all(dir) {
            eprintln!("error: cannot create {dir}: {e}");
            std::process::exit(3);
        }
    }
    let next = AtomicUsize::new(0);
    let conflict = AtomicBool::new(false);
    std::thread::scope(|scope| {
        for _ in 0..plan.threads.min(plan.seeds) {
            scope.spawn(|| loop {
                let k = next.fetch_add(1, Ordering::SeqCst);
                if k >= plan.seeds {
                    break;
                }
                let mut cfg = plan.base.clone();
                cfg.seed = format!("grown-{}", plan.first + k);
                let started = std::time::Instant::now();
                let mut sim = match Sim::try_new(cfg) {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("error: {e}");
                        conflict.store(true, Ordering::SeqCst);
                        continue;
                    }
                };
                sim.run();
                let prefix_days = sim.day;
                let prefix_honest = sim.history.last().map_or(0, |r| r.honest);
                let (mut share, mut dirty, mut att, mut honest, mut first50, mut first33) = (None, None, 0usize, prefix_honest, None::<i64>, None::<i64>);
                if !plan.prefix_only {
                    let (attackers, horizon) = (plan.attackers, plan.horizon);
                    sim.begin_phase("attack", |c| {
                        c.attackers = attackers;
                        c.attack_start_day = prefix_days;
                        c.days = prefix_days + horizon;
                        c.stop_at_honest = 0;
                        c.detection_start_day = c.detection_start_day.min(prefix_days);
                    })
                    .expect("the attack phase was validated up front");
                    if plan.shock_days > 0 {
                        let (from, to) = (prefix_days + plan.shock_day, prefix_days + plan.shock_day + plan.shock_days);
                        let normal = sim.cfg.detection.false_positive;
                        let burst = (normal * plan.shock_x).min(1.0);
                        while sim.step_day() {
                            if sim.day == from {
                                sim.begin_phase("shock", |c| c.detection.false_positive = burst).expect("valid shock");
                            } else if sim.day == to {
                                sim.begin_phase("recovery", |c| c.detection.false_positive = normal).expect("valid recovery");
                            }
                        }
                    } else {
                        sim.run();
                    }
                    let last = sim.history.last().unwrap();
                    share = last.attacker_share();
                    dirty = last.dirty_share();
                    att = last.attackers;
                    honest = last.honest;
                    first50 = sim.history.iter().find(|r| r.attacker_share().is_some_and(|s| s >= 0.5)).map(|r| r.day - prefix_days);
                    first33 = sim.history.iter().find(|r| r.attacker_share().is_some_and(|s| s >= 1.0 / 3.0)).map(|r| r.day - prefix_days);
                }
                sim.world.audit().expect("books must balance");
                let elapsed = started.elapsed().as_secs_f64();
                if let Some(dir) = &plan.svg_dir {
                    let _ = std::fs::create_dir_all(dir);
                    let name = format!("{dir}/{}-{}.svg", sim.cfg.seed, sim.config_digest());
                    if let Err(e) = std::fs::write(&name, sim.to_svg(&format!("{} (digest {})", sim.cfg.seed, sim.config_digest()))) {
                        eprintln!("error: cannot write {name}: {e}");
                        conflict.store(true, Ordering::SeqCst);
                    }
                }
                if let Some(dir) = &plan.out_dir {
                    let name = format!("{dir}/{}-{}.json", sim.cfg.seed, sim.config_digest());
                    let body = format!("{{\"meta\":{},\"result\":{}}}", meta(elapsed, &argv, plan.threads), sim.to_json());
                    if let Err(e) = json::validate(&body) {
                        eprintln!("error: internal: result for {name} is not valid JSON: {e}");
                        conflict.store(true, Ordering::SeqCst);
                        continue;
                    }
                    let mut options = std::fs::OpenOptions::new();
                    options.write(true);
                    if plan.overwrite {
                        options.create(true).truncate(true);
                    } else {
                        options.create_new(true);
                    }
                    match options.open(&name).and_then(|mut f| f.write_all(body.as_bytes())) {
                        Ok(()) => {}
                        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                            eprintln!("error: {name} already exists (same seed and configuration); pass --overwrite to replace it");
                            conflict.store(true, Ordering::SeqCst);
                        }
                        Err(e) => {
                            eprintln!("error: cannot write {name}: {e}");
                            conflict.store(true, Ordering::SeqCst);
                        }
                    }
                }
                let f = |x: Option<f64>| x.map_or("null".into(), |v| format!("{v:.5}"));
                let g = |x: Option<i64>| x.map_or("null".into(), |v| v.to_string());
                let d = &sim.det;
                let line = format!(
                    "{{\"seed\":{},\"configDigest\":{},\"prefixDays\":{},\"prefixHonest\":{},\"honest\":{},\"attackers\":{},\"attackerShare\":{},\"dirtyShare\":{},\"daysTo33pct\":{},\"daysTo50pct\":{},\"supply\":{},\"emissionHonest\":{},\"emissionAttackers\":{},\"attackerHeld\":{},\"accusations\":{},\"keyLosses\":{},\"recoveriesCompleted\":{},\"recoveryDaysSum\":{},\"recoveriesCapturable\":{},\"recoveriesInvited\":{},\"recoveriesStarted\":{},\"casesOnGenuine\":{},\"genuineInvalidated\":{},\"falseInvalidated\":{},\"linksLeft\":{},\"casesRefusedXp\":{},\"casesSettled\":{},\"caseDaysMean\":{},\"maxPositions\":{},\"deadlineExtensions\":{},\"councilEntries\":{},\"refusedFunds\":{},\"holdDaysHonest\":{},\"holdDaysAttackers\":{},\"stakeLostHonest\":{},\"stakeLostAttackers\":{},\"debtHonest\":{},\"debtAttackers\":{},\"xpHalved\":{},\"councilTurnover\":{},\"pathSearchesExhausted\":{},\"pathSearchSteps\":{},\"censored\":{},\"seconds\":{:.1}}}",
                    json::string(&sim.cfg.seed),
                    json::string(&sim.config_digest()),
                    prefix_days,
                    prefix_honest,
                    honest,
                    att,
                    f(share),
                    f(dirty),
                    g(first33),
                    g(first50),
                    sim.history.last().map_or(0, |r| r.supply),
                    sim.emitted[0],
                    sim.emitted[1],
                    sim.history.last().map_or(0, |r| r.dirty),
                    d.accusations,
                    sim.recovery[0],
                    sim.recovery[1],
                    sim.recovery[2],
                    sim.recovery[3],
                    sim.recovery[4],
                    sim.recovery[5],
                    d.cases_on_genuine,
                    d.genuine_invalidated,
                    d.false_invalidated,
                    d.links_left,
                    d.cases_refused_xp,
                    sim.world.stats.settled,
                    f(if sim.world.stats.settled > 0 { Some(sim.world.stats.duration_hours as f64 / 24.0 / sim.world.stats.settled as f64) } else { None }),
                    sim.world.stats.max_positions,
                    sim.world.stats.extensions,
                    sim.world.stats.council_entries,
                    sim.world.stats.refused_funds,
                    sim.ladder.hold_hours[0] / 24,
                    sim.ladder.hold_hours[1] / 24,
                    sim.ladder.lost[0],
                    sim.ladder.lost[1],
                    sim.ladder.debt[0],
                    sim.ladder.debt[1],
                    sim.world.stats.xp_halved,
                    sim.world.stats.council_turnover,
                    sim.world.path_searches_exhausted(),
                    sim.world.path_search_steps(),
                    sim.censored.map_or("null".to_string(), json::string),
                    elapsed
                );
                // Printed as soon as the seed finishes (stdout is line-buffered), so long runs report progress; order is by completion.
                println!("{line}");
            });
        }
    });
    if conflict.load(Ordering::SeqCst) {
        std::process::exit(3);
    }
}
