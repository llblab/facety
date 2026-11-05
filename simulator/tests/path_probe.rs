//! Council-path discovery study: methods compared on identical graph snapshots.
//! The exactness test runs with the normal suite; the measurement is a research instrument
//! (`cargo test --release --test path_probe -- --ignored --nocapture`).
use facety_sim::runner::{RunConfig, Sim};
use facety_sim::world::{PathMethod, Probe};
use std::time::Instant;

fn grown(layered: bool, honest: usize, attackers: usize, days: i64, seed: &str) -> Sim {
    let mut cfg = RunConfig {
        seed: seed.into(),
        honest_genesis: 30.max(honest / 4),
        attackers,
        attack_start_day: days / 2,
        days,
        max_subjects: 200_000,
        ..RunConfig::default()
    };
    cfg.world.layered = layered;
    cfg.stop_at_honest = 0;
    let mut sim = Sim::new(cfg);
    sim.run();
    sim
}

fn accounts(sim: &Sim) -> Vec<u32> {
    (0..sim.world.len() as u32).filter(|&i| sim.world.accepted(i)).collect()
}

#[test]
fn every_method_gives_the_exact_answer_and_valid_certificates_on_identical_snapshots() {
    for layered in [true, false] {
        let mut sim = grown(layered, 300, 6, 90, if layered { "probe-a" } else { "probe-b" });
        let (mut exact_yes, mut shortcut_resolved) = (0, 0);
        for u in accounts(&sim) {
            let exact = sim.world.probe_invitation_paths(u, PathMethod::Exact);
            let relaxed = sim.world.probe_invitation_paths(u, PathMethod::Relaxed);
            let shortcut = sim.world.probe_invitation_paths(u, PathMethod::Shortcut);
            if exact.exhausted || relaxed.exhausted || shortcut.exhausted {
                continue; // an exhausted search proves nothing; compare only settled answers
            }
            assert_eq!(exact.accepted, relaxed.accepted, "relaxation changed an answer for {u} (layered {layered})");
            assert_eq!(exact.accepted, shortcut.accepted, "the shortcut changed an answer for {u} (layered {layered}): {shortcut:?} vs {exact:?}");
            for p in [&exact, &relaxed, &shortcut] {
                assert!(p.certificate_valid.unwrap_or(true), "invalid certificate for {u}: {p:?}");
            }
            exact_yes += usize::from(exact.accepted);
            shortcut_resolved += usize::from(shortcut.resolved_by.starts_with("structural") || shortcut.resolved_by.starts_with("too few"));
        }
        assert!(exact_yes > 0, "the snapshot must contain accounts that pass (layered {layered})");
        if layered {
            assert!(shortcut_resolved > 0, "the structural shortcut must settle some questions");
        }
    }
}

fn rss_mb() -> f64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|s| s.lines().find(|l| l.starts_with("VmRSS:")).and_then(|l| l.split_whitespace().nth(1).and_then(|v| v.parse::<f64>().ok())))
        .map_or(0.0, |kb| kb / 1024.0)
}

fn measure(label: &str, sim: &mut Sim, repeats: usize) {
    let users = accounts(sim);
    println!("--- {label}: {} accounts, D = {}, Council {} seats", users.len(), sim.world.required_guarantors(), sim.world.council().len());
    let mut reference: Vec<Probe> = Vec::new();
    for (name, method) in [("exact", PathMethod::Exact), ("relaxed", PathMethod::Relaxed), ("shortcut", PathMethod::Shortcut)] {
        let rss0 = rss_mb();
        let start = Instant::now();
        let (mut yes, mut steps, mut exhausted, mut invalid) = (0usize, 0u64, 0usize, 0usize);
        let mut by: std::collections::BTreeMap<&str, usize> = Default::default();
        let mut results: Vec<Probe> = Vec::new();
        for _ in 0..repeats {
            results.clear();
            for &u in &users {
                let p = sim.world.probe_invitation_paths(u, method);
                yes += usize::from(p.accepted);
                steps += p.steps;
                exhausted += usize::from(p.exhausted);
                invalid += usize::from(p.certificate_valid == Some(false));
                *by.entry(p.resolved_by).or_default() += 1;
                results.push(p);
            }
        }
        let secs = start.elapsed().as_secs_f64();
        let differing = if reference.is_empty() {
            0
        } else {
            results.iter().zip(&reference).filter(|(a, b)| a.accepted != b.accepted && !a.exhausted && !b.exhausted).count()
        };
        println!("{name:9} cpu {secs:7.3}s  per probe {:7.1}us  steps {steps:>11}  exhausted {exhausted:>5}  accepted {:>6}  invalid certificates {invalid}  answers differing from exact {differing}  rss +{:.1} MB  resolved by {by:?}", secs * 1e6 / (users.len() * repeats) as f64, yes / repeats, rss_mb() - rss0);
        if reference.is_empty() {
            reference = results.clone();
        }
    }
}

#[test]
#[ignore = "research measurement, takes minutes"]
fn path_discovery_study() {
    let mut baseline = grown(true, 3000, 100, 260, "study-a");
    measure("baseline (layered support), year-scale snapshot", &mut baseline, 3);
    let mut heavy = grown(false, 800, 20, 110, "study-b");
    measure("ablation without layered support, cone snapshot", &mut heavy, 1);
}
