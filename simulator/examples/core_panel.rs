//! Finite evidence-core panel: every arm clones the same default grown snapshot for a seed.
use facety_sim::json;
use facety_sim::runner::{RunConfig, Sim, Strategy};
use std::io::Write;
use std::time::{Duration, Instant};

fn observation(c: &mut RunConfig, mode: &str) {
    c.detection.repeat_correlation = match mode {
        "independent" | "persistent" => 0.0,
        "partial" => 0.5,
        "reread" => 1.0,
        _ => panic!("unknown observation mode"),
    };
    c.detection.persistent_errors = mode == "persistent";
}

fn environment(c: &mut RunConfig) {
    c.detection.odd_share = 0.05;
    c.detection.odd_multiplier = 10.0;
    c.detection.defense_success = 0.7;
    c.detection.defense_days = 14;
}

fn attack(c: &mut RunConfig, accusations: bool) {
    environment(c);
    c.attackers = 100;
    c.strategy = Strategy::SupportedFirst;
    c.attacker_patience_days = 120;
    c.honest.corrupt_share = 0.2;
    if accusations {
        c.attacker_accuse = 3.0;
        c.attacker_cash_out = 0.5;
    }
}

fn main() {
    let args: Vec<_> = std::env::args().collect();
    assert!(args.len() == 4 || args.len() == 6, "usage: core_panel local SEED DIR | final SEED DIR x5|accuse independent|partial|reread|persistent");
    let final_panel = args[1] == "final";
    assert!(final_panel || args[1] == "local");
    assert_eq!(args.len(), if final_panel { 6 } else { 4 });
    let seed: u32 = args[2].parse().expect("numeric seed");
    assert!(if final_panel { (8001..=8004).contains(&seed) } else { (7001..=7002).contains(&seed) }, "only registered seed families");
    if final_panel {
        assert!(["x5", "accuse"].contains(&args[4].as_str()));
        let mut validate = RunConfig::default();
        observation(&mut validate, &args[5]);
    }
    std::fs::create_dir_all(&args[3]).unwrap();
    let prefix = RunConfig {
        seed: format!("grown-{seed}"),
        attackers: 0,
        attack_start_day: i64::MAX / 4,
        detection_start_day: i64::MAX / 4,
        days: 2000,
        stop_at_honest: 1000,
        max_subjects: 200_000,
        ..RunConfig::default()
    };
    prefix.validate().unwrap();
    let mut snapshot = Sim::new(prefix.clone());
    snapshot.run();
    assert_eq!(snapshot.censored, Some("stopAtHonest"), "prefix must reach its target");
    snapshot.world.audit().unwrap();
    let prefix_days = snapshot.day;
    let prefix_identity = format!("{:016x}", facety_sim::rng::hash_seed(&snapshot.to_json()));
    let horizon = if final_panel { 730 } else { 365 };
    let arms: Vec<(String, String)> = if final_panel {
        ["default-control", "attack", "attack-control", "joint", "joint-control"].iter().map(|s| ((*s).into(), args[5].clone())).collect()
    } else {
        let mut arms = Vec::new();
        for mode in ["independent", "partial", "reread", "persistent"] {
            arms.push((format!("control-{mode}"), mode.into()));
            arms.push((format!("x5-{mode}"), mode.into()));
        }
        arms.push(("accuse-independent".into(), "independent".into()));
        arms
    };
    for (arm, mode) in arms {
        let started = Instant::now();
        let mut sim = snapshot.clone();
        sim.begin_phase(&arm, |c| {
            c.days = prefix_days + horizon;
            c.attack_start_day = prefix_days;
            c.detection_start_day = prefix_days;
            c.stop_at_honest = 0;
            if !final_panel {
                observation(c, &mode);
                if arm.starts_with("x5-") || arm.starts_with("accuse-") {
                    attack(c, arm.starts_with("accuse-"));
                }
            } else {
                if arm != "default-control" {
                    environment(c);
                }
                if arm == "attack" || arm == "joint" {
                    attack(c, arm == "joint" || args[4] == "accuse");
                }
                if arm == "joint" || arm == "joint-control" {
                    observation(c, &mode);
                    c.detection.council_rate = 0.1;
                    c.detection.council_turnout = 0.3;
                }
            }
        })
        .unwrap();
        while sim.step_day() {
            if started.elapsed() >= Duration::from_secs(1800) {
                sim.censored = Some("wallBudget");
                break;
            }
        }
        sim.world.audit().unwrap();
        let body = format!(
            "{{\"meta\":{{\"commit\":{},\"dirty\":{},\"arm\":{},\"prefixIdentity\":{},\"prefixDays\":{prefix_days},\"horizon\":{horizon},\"elapsedSeconds\":{},\"argv\":{}}},\"result\":{}}}",
            json::string(env!("FACETY_COMMIT")), env!("FACETY_DIRTY"), json::string(&arm), json::string(&prefix_identity), started.elapsed().as_secs_f64(), json::string(&args.join(" ")), sim.to_json()
        );
        json::validate(&body).unwrap();
        let path = format!("{}/{}-{arm}.json", args[3], prefix.seed);
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&path).expect("new result path; never overwrite evidence");
        file.write_all(body.as_bytes()).unwrap();
        println!("{path} completedDays={} censored={:?} seconds={:.1}", sim.day - prefix_days, sim.censored, started.elapsed().as_secs_f64());
        std::io::stdout().flush().unwrap();
    }
}
