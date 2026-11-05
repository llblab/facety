//! The command line produces one JSON line per seed, as each seed finishes, and refuses unknown arguments.
use std::process::Command;

fn run(args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_facety-sim")).args(args).output().expect("run facety-sim")
}

#[test]
fn prefix_only_prints_one_json_line_per_seed_with_the_snapshot_day() {
    let out = run(&["grown", "--seeds", "2", "--target-honest", "160", "--prefix-only", "--threads", "2"]);
    assert!(out.status.success());
    let text = String::from_utf8(out.stdout).unwrap();
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 2);
    for line in &lines {
        assert!(line.starts_with("{\"seed\":\"grown-") && line.ends_with('}'), "{line}");
        assert!(line.contains("\"censored\":\"stopAtHonest\""), "the prefix must stop at the target: {line}");
    }
    assert!(lines.iter().any(|l| l.contains("\"seed\":\"grown-1\"")) && lines.iter().any(|l| l.contains("\"seed\":\"grown-2\"")));
}

#[test]
fn a_short_attack_run_reports_shares_and_keeps_the_books() {
    let out = run(&["grown", "--seeds", "1", "--target-honest", "160", "--attackers", "3", "--horizon", "20", "--bound", "7", "--layered", "--threads", "1"]);
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let text = String::from_utf8(out.stdout).unwrap();
    assert!(text.contains("\"attackerShare\":0.") || text.contains("\"attackerShare\":null"), "{text}");
}

#[test]
fn unknown_arguments_fail_with_usage() {
    let out = run(&["grown", "--nonsense"]);
    assert!(!out.status.success());
}
