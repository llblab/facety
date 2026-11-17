//! A second, independently written verifier for a supplied family of Council paths.
//!
//! It answers a different question from the search: *is this supplied family valid under the selected conditions?*
//! The search answers *does any valid family exist in this graph?*. A rejected certificate therefore implies
//! nothing about existence, and an exhausted search proves nothing at all.
//!
//! This verifier shares no acceptance logic with `paths::verify_family`: it reads the predicates directly from the
//! specification, uses its own data structures and reports which predicate failed. It is deliberately written for
//! clarity, not speed; the search remains the only producer of families.
use crate::graph::Graph;

/// Which certificate predicate failed. Each variant names the violated condition, not a graph property.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CertificateError {
    /// `council` or `blocked` do not describe the same graph as `paths`.
    DimensionMismatch,
    /// The source identifier is outside the graph.
    UnknownSource,
    /// Fewer paths than the required number `k`.
    TooFewPaths,
    /// A path with fewer than two nodes (no link).
    PathTooShort,
    /// A path with more than `max_nodes` nodes, endpoints included.
    PathTooLong,
    /// A path that does not start at the source.
    WrongSource,
    /// An identifier outside the graph.
    UnknownNode,
    /// A link that is not an edge of the graph.
    MissingEdge,
    /// A vertex repeated inside one path: not a simple path.
    NotSimple,
    /// A blocked vertex used as an intermediate (the endpoints are exempt).
    BlockedIntermediate,
    /// A vertex other than the source shared by two paths.
    SharedVertex,
    /// Two paths ending at the same Council member.
    ReusedEndpoint,
    /// The last node is not a usable Council member (source, non-member or blocked).
    InvalidTerminal,
    /// The same route supplied twice.
    DuplicateRoute,
}

/// The declared conditions of one certificate question.
#[derive(Clone, Copy, Debug)]
pub struct Certificate<'a> {
    pub graph: &'a Graph,
    /// One simple route per path, starting at `source`.
    pub paths: &'a [Vec<u32>],
    pub source: u32,
    /// Council members; a usable terminal is a member that is neither the source nor blocked.
    pub council: &'a [u32],
    /// How many vertex-disjoint routes the family must contain.
    pub required: usize,
    /// Most nodes one route may have, endpoints included.
    pub max_nodes: usize,
    pub blocked: &'a [bool],
}

/// Check a supplied family. The first violated predicate is reported.
pub fn verify_certificate(c: &Certificate<'_>) -> Result<(), CertificateError> {
    let n = c.graph.len();
    if c.blocked.len() != n {
        return Err(CertificateError::DimensionMismatch);
    }
    if c.source as usize >= n {
        return Err(CertificateError::UnknownSource);
    }
    if c.paths.len() < c.required {
        return Err(CertificateError::TooFewPaths);
    }
    let mut members: Vec<u32> = c.council.to_vec();
    members.sort_unstable();
    let is_member = |v: u32| members.binary_search(&v).is_ok();
    // Every vertex other than the source is used at most once across the whole family.
    let mut occupied: Vec<u32> = Vec::new();
    let mut terminals: Vec<u32> = Vec::new();
    let mut routes: Vec<&[u32]> = Vec::new();
    for path in c.paths {
        if path.len() < 2 {
            return Err(CertificateError::PathTooShort);
        }
        if path.len() > c.max_nodes {
            return Err(CertificateError::PathTooLong);
        }
        if path[0] != c.source {
            return Err(CertificateError::WrongSource);
        }
        if path.iter().any(|&v| v as usize >= n) {
            return Err(CertificateError::UnknownNode);
        }
        if routes.contains(&path.as_slice()) {
            return Err(CertificateError::DuplicateRoute);
        }
        let last = path.len() - 1;
        for (index, window) in path.windows(2).enumerate() {
            if !c.graph.has_edge(window[0], window[1]) {
                return Err(CertificateError::MissingEdge);
            }
            if index > 0 && path[..index].contains(&window[0]) {
                return Err(CertificateError::NotSimple);
            }
        }
        if path[..last].contains(&path[last]) {
            return Err(CertificateError::NotSimple);
        }
        for &v in &path[1..last] {
            if c.blocked[v as usize] {
                return Err(CertificateError::BlockedIntermediate);
            }
        }
        let terminal = path[last];
        if terminal == c.source || !is_member(terminal) || c.blocked[terminal as usize] {
            return Err(CertificateError::InvalidTerminal);
        }
        if terminals.contains(&terminal) {
            return Err(CertificateError::ReusedEndpoint);
        }
        for &v in &path[1..] {
            if occupied.contains(&v) {
                return Err(CertificateError::SharedVertex);
            }
            occupied.push(v);
        }
        terminals.push(terminal);
        routes.push(path);
    }
    Ok(())
}
