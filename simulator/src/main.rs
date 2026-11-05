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
    "--careless-accept",
];
const FLAG_KEYS: &[&str] = &["--no-layered", "--acquit", "--prefix-only", "--detect-prefix", "--allow-disputed", "--overwrite"];

const USAGE: &str = "usage: facety-sim grown [--seeds N] [--first-seed K] [--bound NODES|none] [--no-layered] [--search-order none|xp|degree|both] [--attackers N] [--horizon DAYS]
  [--target-honest N] [--honest-genesis N] [--strategy cone|honest-first|supported-first] [--vetting P] [--vet-sens P] [--vet-fpr P]
  [--met P] [--double P] [--acquit] [--detect-prefix] [--allow-disputed] [--inspect P] [--fpr P] [--sens P] [--review P] [--accuracy P]
  [--public-look P] [--defense P] [--defense-days N] [--disputes-from N] [--council-seats N] [--council-seats-per-d N] [--council-per-thousand N] [--max-d N] [--k N] [--k-step N] [--k-xp-per-level N] [--patience DAYS] [--careless P] [--careless-accept P] [--max-subjects N] [--threads N] [--out DIR] [--overwrite] [--prefix-only]";

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
    base.honest_genesis = num(&opts, "--honest-genesis", base.honest_genesis)?;
    base.honest.vetting = num(&opts, "--vetting", 0.0)?;
    base.honest.vetting_sensitivity = opt_num(&opts, "--vet-sens")?;
    base.honest.vetting_false_positive = opt_num(&opts, "--vet-fpr")?;
    base.honest.met_in_person = num(&opts, "--met", 0.0)?;
    base.honest.double_life = num(&opts, "--double", 0.0)?;
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
    base.honest.careless_accept_far = num(&opts, "--careless-accept", base.honest.careless_accept_far)?;
    base.attacker_patience_days = num(&opts, "--patience", 0)?;
    base.detection.acquit_met = flags.contains("--acquit");
    base.detection.inspect = num(&opts, "--inspect", base.detection.inspect)?;
    base.detection.false_positive = num(&opts, "--fpr", base.detection.false_positive)?;
    base.detection.sensitivity = num(&opts, "--sens", base.detection.sensitivity)?;
    base.detection.review = num(&opts, "--review", base.detection.review)?;
    base.detection.accuracy = num(&opts, "--accuracy", base.detection.accuracy)?;
    base.detection.public_look = num(&opts, "--public-look", base.detection.public_look)?;
    base.detection.defense_success = num(&opts, "--defense", base.detection.defense_success)?;
    base.detection.defense_days = num(&opts, "--defense-days", base.detection.defense_days)?;
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
                    sim.run();
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
                    "{{\"seed\":{},\"configDigest\":{},\"prefixDays\":{},\"prefixHonest\":{},\"honest\":{},\"attackers\":{},\"attackerShare\":{},\"dirtyShare\":{},\"daysTo33pct\":{},\"daysTo50pct\":{},\"genuineInvalidated\":{},\"falseInvalidated\":{},\"linksLeft\":{},\"casesRefusedXp\":{},\"pathSearchesExhausted\":{},\"pathSearchSteps\":{},\"censored\":{},\"seconds\":{:.1}}}",
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
                    d.genuine_invalidated,
                    d.false_invalidated,
                    d.links_left,
                    d.cases_refused_xp,
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
