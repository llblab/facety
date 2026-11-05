//! `facety-sim grown`: grow an honest network to a target size, then attack clones of that snapshot (detection always on).
use facety_sim::runner::{RunConfig, Sim, Strategy};
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

fn usage() -> ! {
    eprintln!("usage: facety-sim grown [--seeds N] [--first-seed K] [--bound NODES|none] [--layered] [--attackers N] [--horizon DAYS]\n  [--target-honest N] [--strategy cone|honest-first|supported-first] [--vetting P] [--vet-sens P] [--vet-fpr P]\n  [--met P] [--double P] [--acquit] [--detect-prefix] [--allow-disputed] [--inspect P] [--fpr P] [--sens P] [--review P] [--accuracy P] [--public-look P] [--max-subjects N] [--threads N] [--out DIR] [--prefix-only]");
    std::process::exit(2)
}

fn parse() -> (HashMap<String, String>, Vec<String>) {
    let mut opts = HashMap::new();
    let mut flags = Vec::new();
    let args: Vec<String> = std::env::args().skip(2).collect();
    let mut i = 0;
    while i < args.len() {
        let a = &args[i];
        if !a.starts_with("--") {
            usage();
        }
        if ["--layered", "--acquit", "--prefix-only", "--detect-prefix", "--allow-disputed"].contains(&a.as_str()) {
            flags.push(a.clone());
            i += 1;
        } else {
            if i + 1 >= args.len() {
                usage();
            }
            opts.insert(a.clone(), args[i + 1].clone());
            i += 2;
        }
    }
    (opts, flags)
}

fn num<T: std::str::FromStr>(opts: &HashMap<String, String>, key: &str, default: T) -> T {
    opts.get(key).map_or(default, |v| v.parse().unwrap_or_else(|_| usage()))
}

fn main() {
    if std::env::args().nth(1).as_deref() != Some("grown") {
        usage();
    }
    let (opts, flags) = parse();
    let seeds: usize = num(&opts, "--seeds", 3);
    let first: usize = num(&opts, "--first-seed", 1);
    let attackers: usize = num(&opts, "--attackers", 10);
    let horizon: i64 = num(&opts, "--horizon", 60);
    let target: usize = num(&opts, "--target-honest", 1000);
    let threads: usize = num(&opts, "--threads", std::thread::available_parallelism().map_or(4, |n| n.get()));
    let bound = match opts.get("--bound").map(String::as_str) {
        None => Some(7usize),
        Some("none") => None,
        Some(v) => Some(v.parse().unwrap_or_else(|_| usage())),
    };
    let strategy = match opts.get("--strategy").map(String::as_str) {
        None | Some("cone") => Strategy::Cone,
        Some("honest-first") => Strategy::HonestFirst,
        Some("supported-first") => Strategy::SupportedFirst,
        _ => usage(),
    };
    let out_dir = opts.get("--out").cloned();
    let mut base = RunConfig { attackers: 0, attack_start_day: i64::MAX / 4, days: 2000, stop_at_honest: target, max_subjects: num(&opts, "--max-subjects", 100_000), strategy, ..RunConfig::default() };
    base.world.max_nodes = bound;
    base.world.layered = flags.contains(&"--layered".to_string());
    base.honest.vetting = num(&opts, "--vetting", 0.0);
    base.honest.vetting_sensitivity = opts.get("--vet-sens").map(|v| v.parse().unwrap_or_else(|_| usage()));
    base.honest.vetting_false_positive = opts.get("--vet-fpr").map(|v| v.parse().unwrap_or_else(|_| usage()));
    base.honest.met_in_person = num(&opts, "--met", 0.0);
    base.honest.double_life = num(&opts, "--double", 0.0);
    base.detection.acquit_met = flags.contains(&"--acquit".to_string());
    // The retired baseline grew the honest prefix without detection and switched it on at the snapshot; --detect-prefix runs it from day 0.
    base.detection_start_day = if flags.contains(&"--detect-prefix".to_string()) { 0 } else { i64::MAX / 4 };
    base.world.exclude_disputed = !flags.contains(&"--allow-disputed".to_string());
    base.detection.inspect = num(&opts, "--inspect", base.detection.inspect);
    base.detection.false_positive = num(&opts, "--fpr", base.detection.false_positive);
    base.detection.sensitivity = num(&opts, "--sens", base.detection.sensitivity);
    base.detection.review = num(&opts, "--review", base.detection.review);
    base.detection.accuracy = num(&opts, "--accuracy", base.detection.accuracy);
    base.detection.public_look = num(&opts, "--public-look", base.detection.public_look);
    let prefix_only = flags.contains(&"--prefix-only".to_string());
    if let Some(dir) = &out_dir {
        std::fs::create_dir_all(dir).expect("output directory");
    }

    let next = AtomicUsize::new(0);
    std::thread::scope(|scope| {
        for _ in 0..threads.min(seeds) {
            scope.spawn(|| loop {
                let k = next.fetch_add(1, Ordering::SeqCst);
                if k >= seeds {
                    break;
                }
                let mut cfg = base.clone();
                cfg.seed = format!("grown-{}", first + k);
                let started = std::time::Instant::now();
                let mut sim = Sim::new(cfg);
                sim.run();
                let prefix_days = sim.day;
                let prefix_honest = sim.history.last().map_or(0, |r| r.honest);
                let prefix_secs = started.elapsed().as_secs_f64();
                let (mut share, mut dirty, mut att, mut honest, mut first50, mut first33) = (None, None, 0usize, prefix_honest, None::<i64>, None::<i64>);
                let mut secs = prefix_secs;
                if !prefix_only {
                    sim.cfg.attackers = attackers;
                    sim.cfg.attack_start_day = sim.day;
                    sim.cfg.days = sim.day + horizon;
                    sim.cfg.stop_at_honest = 0;
                    sim.cfg.detection_start_day = sim.cfg.detection_start_day.min(sim.day);
                    sim.censored = None;
                    sim.run();
                    secs = started.elapsed().as_secs_f64();
                    let last = sim.history.last().unwrap();
                    share = last.attacker_share();
                    dirty = last.dirty_share();
                    att = last.attackers;
                    honest = last.honest;
                    first50 = sim.history.iter().find(|r| r.attacker_share().is_some_and(|s| s >= 0.5)).map(|r| r.day - prefix_days);
                    first33 = sim.history.iter().find(|r| r.attacker_share().is_some_and(|s| s >= 1.0 / 3.0)).map(|r| r.day - prefix_days);
                    sim.world.audit().expect("books must balance");
                }
                if let Some(dir) = &out_dir {
                    std::fs::write(format!("{dir}/{}.json", sim.cfg.seed), sim.to_json()).expect("write result");
                }
                let f = |x: Option<f64>| x.map_or("null".into(), |v| format!("{v:.5}"));
                let g = |x: Option<i64>| x.map_or("null".into(), |v| v.to_string());
                let d = &sim.det;
                let line = format!("{{\"seed\":\"{}\",\"prefixDays\":{},\"prefixHonest\":{},\"honest\":{},\"attackers\":{},\"attackerShare\":{},\"dirtyShare\":{},\"daysTo33pct\":{},\"daysTo50pct\":{},\"genuineInvalidated\":{},\"falseInvalidated\":{},\"linksLeft\":{},\"pathSearchesExhausted\":{},\"censored\":{},\"seconds\":{:.1}}}",
                    sim.cfg.seed, prefix_days, prefix_honest, honest, att, f(share), f(dirty), g(first33), g(first50), d.genuine_invalidated, d.false_invalidated, d.links_left, sim.world.path_searches_exhausted(), sim.censored.map_or("null".to_string(), |c| format!("{c:?}")), secs);
                // Printed as soon as the seed finishes (stdout is line-buffered), so long runs report progress; order is by completion.
                println!("{line}");
            });
        }
    });
}
