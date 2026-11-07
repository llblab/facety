//! Records the commit the binary was built from (local git only, no network) so saved results can name the code that made them.
use std::process::Command;

fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn main() {
    let commit = git(&["rev-parse", "HEAD"]).unwrap_or_default();
    let dirty = git(&["status", "--porcelain", "--untracked-files=no"]).is_some_and(|s| !s.is_empty());
    println!("cargo:rustc-env=FACETY_COMMIT={commit}");
    println!("cargo:rustc-env=FACETY_DIRTY={dirty}");
    println!("cargo:rerun-if-changed=../.git/HEAD");
    println!("cargo:rerun-if-changed=../.git/index");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=src");
    println!("cargo:rerun-if-changed=examples");
    println!("cargo:rerun-if-changed=tests");
    println!("cargo:rerun-if-changed=Cargo.toml");
}
