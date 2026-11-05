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
    let out = run(&["grown", "--seeds", "1", "--target-honest", "160", "--attackers", "3", "--horizon", "20", "--bound", "7", "--threads", "1"]);
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let text = String::from_utf8(out.stdout).unwrap();
    assert!(text.contains("\"attackerShare\":0.") || text.contains("\"attackerShare\":null"), "{text}");
}

#[test]
fn unknown_arguments_fail_with_usage() {
    let out = run(&["grown", "--nonsense"]);
    assert!(!out.status.success());
}

fn refused(args: &[&str]) {
    let out = run(args);
    assert_eq!(out.status.code(), Some(2), "{args:?} must be refused with exit code 2");
    assert!(String::from_utf8_lossy(&out.stderr).contains("error:"), "{args:?} must explain why");
    assert!(out.stdout.is_empty(), "a refused run prints no results");
}

#[test]
fn invalid_arguments_are_refused_with_a_diagnostic_and_a_nonzero_exit() {
    refused(&["grown", "--fpr", "-0.1"]);
    refused(&["grown", "--fpr", "2"]);
    refused(&["grown", "--fpr", "NaN"]);
    refused(&["grown", "--threads", "0"]);
    refused(&["grown", "--seeds", "0"]);
    refused(&["grown", "--horizon", "0"]);
    refused(&["grown", "--bogus", "3"]);
    refused(&["grown", "--bogus"]);
    refused(&["grown", "--seeds"]);
    refused(&["grown", "--fpr", "0.1", "--fpr", "0.2"]);
    refused(&["grown", "--bound", "none"]);
    refused(&["grown", "--layered"]);
    refused(&["grown", "--defense-days", "3"]);
    refused(&["grown", "--bound", "1"]);
    refused(&["grown", "--strategy", "clever"]);
    refused(&["grown", "--target-honest", "50"]);
    refused(&["grown", "--patience", "-3"]);
    refused(&["grown", "--careless", "2"]);
    refused(&["frobnicate"]);
}

fn temp_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("facety-sim-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    dir
}

fn files(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut v: Vec<_> = std::fs::read_dir(dir).unwrap().map(|e| e.unwrap().path()).collect();
    v.sort();
    v
}

#[test]
fn saved_results_are_valid_complete_reproducible_and_never_overwritten_silently() {
    let (a, b, c) = (temp_dir("a"), temp_dir("b"), temp_dir("c"));
    let args = |dir: &std::path::Path, extra: &[&str]| {
        let mut v: Vec<String> =
            ["grown", "--seeds", "2", "--target-honest", "130", "--attackers", "2", "--horizon", "10", "--threads", "2", "--out", dir.to_str().unwrap()]
                .iter()
                .map(|s| s.to_string())
                .collect();
        v.extend(extra.iter().map(|s| s.to_string()));
        v
    };
    let go = |dir: &std::path::Path, extra: &[&str]| Command::new(env!("CARGO_BIN_EXE_facety-sim")).args(args(dir, extra)).output().unwrap();
    assert!(go(&a, &[]).status.success());
    let saved = files(&a);
    assert_eq!(saved.len(), 2);
    let text = std::fs::read_to_string(&saved[0]).unwrap();
    facety_sim::json::validate(&text).expect("saved file is valid JSON");
    for key in ["meta", "commit", "elapsedSeconds", "argv", "result", "schema", "randomness", "effectiveConfig", "phases", "completedDays", "censored"] {
        assert!(text.contains(&format!("\"{key}\":")), "saved file lacks {key}");
    }
    assert!(text.contains("\"phases\":[{\"name\":\"attack\""), "the attack phase keeps its own configuration");
    // The same experiment again in the same directory is refused, not overwritten; --overwrite replaces it knowingly.
    let again = go(&a, &[]);
    assert_eq!(again.status.code(), Some(3));
    assert!(String::from_utf8_lossy(&again.stderr).contains("already exists"));
    assert_eq!(std::fs::read_to_string(&saved[0]).unwrap(), text, "the original file is untouched");
    assert!(go(&a, &["--overwrite"]).status.success());
    // The same seed with a different setting gets its own file instead of replacing the first.
    assert!(go(&a, &["--fpr", "0.02"]).status.success());
    assert_eq!(files(&a).len(), 4);
    // An identical run elsewhere produces an identical result section (only the meta differs).
    assert!(go(&b, &[]).status.success());
    let result_of = |p: &std::path::Path| {
        let t = std::fs::read_to_string(p).unwrap();
        t[t.find("\"result\":").unwrap()..].to_string()
    };
    assert_eq!(result_of(&files(&b)[0]), result_of(&saved[0]), "deterministic");
    // A refused configuration saves nothing.
    let bad = Command::new(env!("CARGO_BIN_EXE_facety-sim")).args(["grown", "--fpr", "3", "--out", c.to_str().unwrap()]).output().unwrap();
    assert_eq!(bad.status.code(), Some(2));
    assert!(!c.exists() || files(&c).is_empty());
    for d in [a, b, c] {
        let _ = std::fs::remove_dir_all(d);
    }
}

#[test]
fn the_attacker_and_honest_levers_are_accepted_and_recorded() {
    let dir = temp_dir("levers");
    let out = run(&[
        "grown",
        "--seeds",
        "1",
        "--target-honest",
        "130",
        "--attackers",
        "2",
        "--horizon",
        "10",
        "--patience",
        "5",
        "--careless",
        "0.5",
        "--careless-accept",
        "0.4",
        "--threads",
        "1",
        "--out",
        dir.to_str().unwrap(),
    ]);
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let text = std::fs::read_to_string(files(&dir)[0].clone()).unwrap();
    assert!(text.contains("\"attackerPatienceDays\":5") && text.contains("\"carelessShare\":0.5") && text.contains("\"carelessAcceptFar\":0.4"));
    let _ = std::fs::remove_dir_all(dir);
}
