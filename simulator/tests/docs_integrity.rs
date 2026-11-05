//! Guards the knowledge surface: every relative Markdown link and heading anchor resolves in the tracked tree, and the
//! repository stays English-only (no Cyrillic text). Std only; reads the file list from git.
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::process::Command;

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).parent().expect("repository root").to_path_buf()
}

fn tracked() -> Vec<String> {
    let out =
        Command::new("git").args(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).current_dir(repo_root()).output().expect("git ls-files");
    assert!(out.status.success(), "git ls-files failed");
    String::from_utf8_lossy(&out.stdout).split('\0').filter(|s| !s.is_empty()).map(str::to_string).filter(|f| repo_root().join(f).is_file()).collect()
}

fn normalize(path: &Path) -> String {
    let mut parts: Vec<String> = Vec::new();
    for c in path.components() {
        match c {
            Component::ParentDir => {
                parts.pop();
            }
            Component::Normal(p) => parts.push(p.to_string_lossy().into_owned()),
            _ => {}
        }
    }
    parts.join("/")
}

/// GitHub-compatible heading slugs, with -1/-2 suffixes for repeated headings, plus explicit `<a name|id>` anchors.
fn anchors(text: &str) -> HashSet<String> {
    let mut result = HashSet::new();
    let mut counts: HashMap<String, usize> = HashMap::new();
    let mut fenced = false;
    for line in text.lines() {
        if line.starts_with("```") {
            fenced = !fenced;
        }
        if fenced {
            continue;
        }
        let hashes = line.chars().take_while(|&c| c == '#').count();
        if hashes == 0 || hashes > 6 || !line[hashes..].starts_with(char::is_whitespace) {
            continue;
        }
        let mut heading = line[hashes..].trim().trim_end_matches('#').trim().to_string();
        // [text](target) -> text
        while let Some(open) = heading.find("](") {
            let Some(start) = heading[..open].rfind('[') else { break };
            let Some(close) = heading[open..].find(')') else { break };
            heading = format!("{}{}{}", &heading[..start], &heading[start + 1..open], &heading[open + close + 1..]);
        }
        let mut slug = String::new();
        let mut in_tag = false;
        for ch in heading.chars().filter(|&c| c != '*' && c != '`').flat_map(char::to_lowercase) {
            match ch {
                '<' => in_tag = true,
                '>' if in_tag => in_tag = false,
                _ if in_tag => {}
                c if c.is_alphanumeric() || c == '_' || c == '-' => slug.push(c),
                c if c.is_whitespace() => slug.push('-'),
                _ => {}
            }
        }
        let seen = counts.entry(slug.clone()).or_insert(0);
        result.insert(if *seen > 0 { format!("{slug}-{seen}") } else { slug });
        *seen += 1;
    }
    for marker in ["<a name=\"", "<a id=\""] {
        let mut rest = text;
        while let Some(at) = rest.find(marker) {
            rest = &rest[at + marker.len()..];
            if let Some(end) = rest.find('"') {
                result.insert(rest[..end].to_string());
            }
        }
    }
    result
}

fn link_targets(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(at) = rest.find("](") {
        rest = &rest[at + 2..];
        let end = rest.find(|c: char| c == ')' || c.is_whitespace()).unwrap_or(rest.len());
        let target = &rest[..end];
        if !target.is_empty() && !target.starts_with("http:") && !target.starts_with("https:") && !target.starts_with("mailto:") {
            out.push(target.to_string());
        }
    }
    out
}

#[test]
fn every_relative_markdown_link_and_anchor_resolves() {
    let files = tracked();
    let file_set: HashSet<&str> = files.iter().map(String::as_str).collect();
    let mut dirs: HashSet<String> = HashSet::new();
    for f in &files {
        let mut d = Path::new(f).parent();
        while let Some(p) = d {
            if p.as_os_str().is_empty() || !dirs.insert(p.to_string_lossy().into_owned()) {
                break;
            }
            d = p.parent();
        }
    }
    let markdown: Vec<&String> = files.iter().filter(|f| f.ends_with(".md")).collect();
    let text: HashMap<&str, String> = markdown.iter().map(|f| (f.as_str(), std::fs::read_to_string(repo_root().join(f)).expect("markdown"))).collect();
    let mut anchor_cache: HashMap<String, HashSet<String>> = HashMap::new();
    let mut broken = Vec::new();
    for (file, body) in &text {
        for target in link_targets(body) {
            let (path_part, anchor) = match target.split_once('#') {
                Some((p, a)) => (p.to_string(), Some(a.to_string())),
                None => (target.clone(), None),
            };
            let resolved = if path_part.is_empty() { file.to_string() } else { normalize(&Path::new(file).parent().unwrap_or(Path::new("")).join(&path_part)) };
            let exists = path_part.is_empty() || file_set.contains(resolved.as_str()) || dirs.contains(resolved.trim_end_matches('/')) || resolved.is_empty();
            if !exists {
                broken.push(format!("{file}: missing {target}"));
                continue;
            }
            if let Some(a) = anchor {
                if resolved.ends_with(".md") {
                    let set = anchor_cache.entry(resolved.clone()).or_insert_with(|| anchors(text.get(resolved.as_str()).map_or("", String::as_str)));
                    if !set.contains(&a) {
                        broken.push(format!("{file}: no anchor #{a} in {resolved}"));
                    }
                }
            }
        }
    }
    broken.sort();
    assert!(broken.is_empty(), "{} broken links:\n{}", broken.len(), broken.iter().take(40).cloned().collect::<Vec<_>>().join("\n"));
}

#[test]
fn the_repository_contains_no_cyrillic_text() {
    let mut offenders = Vec::new();
    for f in tracked() {
        let Ok(body) = std::fs::read_to_string(repo_root().join(&f)) else { continue };
        if body.chars().any(|c| ('\u{0400}'..='\u{04FF}').contains(&c)) {
            offenders.push(f);
        }
    }
    assert!(offenders.is_empty(), "Cyrillic text in: {offenders:?}");
}
