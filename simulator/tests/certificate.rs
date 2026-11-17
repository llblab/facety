//! Two independent answers to the path-certificate question: a supplied family's validity, and whether any valid
//! family exists. These are deterministic software checks on small and generated graphs, not research evidence.
use facety_sim::certificate::{verify_certificate, Certificate, CertificateError};
use facety_sim::graph::Graph;
use facety_sim::paths::{verify_family, PathFinder, Search};
use std::collections::HashSet;

struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 33) as f64 / (1u64 << 31) as f64
    }
}

fn random_graph(n: usize, p: f64, one_way: f64, rng: &mut Lcg) -> Graph {
    let mut g = Graph::with_nodes(n);
    for i in 0..n {
        for j in (i + 1)..n {
            let r = rng.next();
            if r < p {
                g.add_mutual(i as u32, j as u32);
            } else if r < p + one_way {
                g.add_edge(i as u32, j as u32);
            }
        }
    }
    g
}

fn mask(n: usize, council: &[u32]) -> Vec<bool> {
    let mut m = vec![false; n];
    for &c in council {
        m[c as usize] = true;
    }
    m
}

fn check(g: &Graph, paths: &[Vec<u32>], source: u32, council: &[u32], required: usize, max_nodes: usize, blocked: &[bool]) -> bool {
    verify_certificate(&Certificate { graph: g, paths, source, council, required, max_nodes, blocked }).is_ok()
}

fn finished(g: &Graph, paths: &[Vec<u32>], source: u32, council: &[u32], required: usize, max_nodes: usize, blocked: &[bool]) -> bool {
    verify_family(g, paths, source, &mask(g.len(), council), required, max_nodes, blocked)
}

/// Independent existence reference: enumerate every simple route and search for a vertex-disjoint packing.
fn exists(g: &Graph, source: u32, council: &[u32], required: usize, max_nodes: usize, blocked: &[bool]) -> bool {
    fn routes(g: &Graph, at: u32, walk: &mut Vec<u32>, out: &mut Vec<Vec<u32>>, council: &[u32], max_nodes: usize, blocked: &[bool]) {
        if at != walk[0] && council.contains(&at) && !blocked[at as usize] {
            out.push(walk.clone());
        }
        if walk.len() == max_nodes {
            return;
        }
        for &next in g.out(at) {
            if walk.contains(&next) || blocked[next as usize] {
                continue;
            }
            walk.push(next);
            routes(g, next, walk, out, council, max_nodes, blocked);
            walk.pop();
        }
    }
    fn pack(all: &[Vec<u32>], need: usize, from: usize, used: &mut HashSet<u32>) -> bool {
        if need == 0 {
            return true;
        }
        for i in from..all.len() {
            if all[i][1..].iter().any(|v| used.contains(v)) {
                continue;
            }
            let taken: Vec<u32> = all[i][1..].to_vec();
            used.extend(taken.iter().copied());
            let ok = pack(all, need - 1, i + 1, used);
            used.retain(|v| !taken.contains(v));
            if ok {
                return true;
            }
        }
        false
    }
    let mut all = Vec::new();
    routes(g, source, &mut vec![source], &mut all, council, max_nodes, blocked);
    pack(&all, required, 0, &mut HashSet::new())
}

#[test]
fn both_verifiers_agree_and_exact_search_certificates_pass_both() {
    let mut rng = Lcg(4242);
    let mut finder = PathFinder::new();
    let (mut families, mut refusals, mut exhaustive) = (0, 0, 0);
    for trial in 0..400 {
        let n = 10;
        let g = random_graph(n, [0.2, 0.3, 0.45][trial % 3], 0.1, &mut rng);
        let mut blocked = vec![false; n];
        if trial % 5 == 0 {
            blocked[4] = true;
        }
        let council: Vec<u32> = [9u32, 8, 7].into_iter().take(1 + trial % 3).collect();
        for max_nodes in 2..=7usize {
            for required in 1..=3usize {
                let result = finder.bounded(&g, &blocked, &mask(n, &council), &council, trial as u64 + 1, 0, required, max_nodes, 2_000_000);
                match result {
                    Search::Found(family) => {
                        families += 1;
                        assert!(finished(&g, &family, 0, &council, required, max_nodes, &blocked), "the existing verifier rejects {family:?}");
                        assert!(check(&g, &family, 0, &council, required, max_nodes, &blocked), "the second verifier rejects {family:?}");
                        assert!(family.len() >= required);
                    }
                    Search::Insufficient => refusals += 1,
                    Search::Exhausted => exhaustive += 1,
                }
            }
        }
    }
    assert!(families > 100 && refusals > 100 && exhaustive == 0, "the sample must exercise both answers: {families}/{refusals}/{exhaustive}");
}

#[test]
fn exact_search_agrees_with_an_independent_brute_force_existence_reference() {
    let mut rng = Lcg(77);
    let mut finder = PathFinder::new();
    let (mut yes, mut no) = (0, 0);
    for trial in 0..180 {
        let n = 8;
        let g = random_graph(n, [0.2, 0.3][trial % 2], 0.15, &mut rng);
        let mut blocked = vec![false; n];
        if trial % 4 == 0 {
            blocked[2] = true;
        }
        let council: Vec<u32> = [7u32, 6].into_iter().take(1 + trial % 2).collect();
        for max_nodes in 2..=5usize {
            for required in 1..=2usize {
                let expected = exists(&g, 0, &council, required, max_nodes, &blocked);
                match finder.bounded(&g, &blocked, &mask(n, &council), &council, trial as u64 + 1, 0, required, max_nodes, 2_000_000) {
                    Search::Found(family) => {
                        assert!(expected, "search found a family the reference denies: {family:?}");
                        yes += 1;
                    }
                    Search::Insufficient => {
                        assert!(!expected, "search missed an existing family (trial {trial})");
                        no += 1;
                    }
                    Search::Exhausted => panic!("the small reference graphs must be decidable"),
                }
            }
        }
    }
    assert!(yes > 20 && no > 20, "the sample must contain both answers: {yes}/{no}");
}

#[test]
fn malformed_certificates_are_rejected_safely_with_the_failing_predicate() {
    let n = 7;
    let mut g = Graph::with_nodes(n);
    for (a, b) in [(0u32, 1u32), (1, 5), (0, 2), (2, 6), (1, 6), (1, 3), (3, 2), (0, 4), (4, 5), (1, 0), (2, 5)] {
        g.add_edge(a, b);
    }
    let council = [5u32, 6];
    let valid = vec![vec![0u32, 1, 5], vec![0u32, 2, 6]];
    assert_eq!(
        verify_certificate(&Certificate { graph: &g, paths: &valid, source: 0, council: &council, required: 2, max_nodes: 7, blocked: &vec![false; n] }),
        Ok(())
    );
    assert!(finished(&g, &valid, 0, &council, 2, 7, &vec![false; n]));

    type Case = (Vec<Vec<u32>>, usize, Vec<bool>, usize, CertificateError);
    let cases: Vec<Case> = vec![
        (vec![vec![0, 1, 5]], 7, vec![false; n], 2, CertificateError::TooFewPaths),
        (vec![vec![0], vec![0, 2, 6]], 7, vec![false; n], 2, CertificateError::PathTooShort),
        (vec![vec![0, 1, 3, 2, 6], vec![0, 2, 6]], 3, vec![false; n], 1, CertificateError::PathTooLong),
        (vec![vec![1, 5], vec![0, 2, 6]], 7, vec![false; n], 1, CertificateError::WrongSource),
        (vec![vec![0, 99, 5]], 7, vec![false; n], 1, CertificateError::UnknownNode),
        (vec![vec![0, 2, 1, 5]], 7, vec![false; n], 1, CertificateError::MissingEdge),
        (vec![vec![0, 1, 0, 2, 6]], 7, vec![false; n], 1, CertificateError::NotSimple),
        (
            vec![vec![0, 1, 5], vec![0, 2, 6]],
            7,
            {
                let mut b = vec![false; n];
                b[1] = true;
                b
            },
            1,
            CertificateError::BlockedIntermediate,
        ),
        (vec![vec![0, 1, 5], vec![0, 1, 6]], 7, vec![false; n], 1, CertificateError::SharedVertex),
        (vec![vec![0, 1, 5], vec![0, 2, 5]], 7, vec![false; n], 1, CertificateError::ReusedEndpoint),
        (vec![vec![0, 1, 5], vec![0, 1, 5]], 7, vec![false; n], 1, CertificateError::DuplicateRoute),
        (vec![vec![0, 1, 3], vec![0, 2, 6]], 7, vec![false; n], 1, CertificateError::InvalidTerminal),
    ];
    for (paths, max_nodes, blocked, required, expected) in cases {
        let certificate = Certificate { graph: &g, paths: &paths, source: 0, council: &council, required, max_nodes, blocked: &blocked };
        assert_eq!(verify_certificate(&certificate), Err(expected), "{paths:?} should fail with {expected:?}");
        assert!(!finished(&g, &paths, 0, &council, required, max_nodes, &blocked), "the existing verifier must also reject {paths:?}");
    }
    assert_eq!(
        verify_certificate(&Certificate { graph: &g, paths: &valid, source: 0, council: &council, required: 2, max_nodes: 7, blocked: &[false; 3] }),
        Err(CertificateError::DimensionMismatch)
    );
    // A rejected supplied certificate does not mean that no valid family exists.
    let mut finder = PathFinder::new();
    let bogus = vec![vec![0u32, 1, 6], vec![0u32, 2, 6]];
    assert!(verify_certificate(&Certificate { graph: &g, paths: &bogus, source: 0, council: &council, required: 1, max_nodes: 7, blocked: &vec![false; n] })
        .is_err());
    assert!(matches!(finder.bounded(&g, &vec![false; n], &mask(n, &council), &council, 1, 0, 1, 7, 2_000_000), Search::Found(_)));
    // An exhausted search is not a refusal and proves nothing either way: with a small work budget the same question
    // can end undecided instead of being answered `Insufficient`.
    let big = random_graph(12, 0.18, 0.12, &mut Lcg(9));
    let council_all = [11u32, 10, 9];
    let blocked_all = vec![false; 12];
    let mut exhausted = 0;
    let mut answered = 0;
    for budget in 1..=2u64 {
        for required in 1..=3usize {
            match finder.bounded(&big, &blocked_all, &mask(12, &council_all), &council_all, 1, 0, required, 5, budget) {
                Search::Exhausted => exhausted += 1,
                _ => answered += 1,
            }
        }
    }
    assert!(exhausted > 0 && answered > 0, "a work budget must distinguish an undecided search from a refusal: {exhausted}/{answered}");
    assert_ne!(Search::Exhausted, Search::Insufficient);
}

#[test]
fn a_blocked_endpoint_that_is_not_the_source_is_an_unusable_terminal() {
    let mut g = Graph::with_nodes(4);
    g.add_edge(0, 2);
    let council = [2u32];
    let blocked = vec![false, false, true, false];
    assert_eq!(
        verify_certificate(&Certificate { graph: &g, paths: &[vec![0, 2]], source: 0, council: &council, required: 1, max_nodes: 3, blocked: &blocked }),
        Err(CertificateError::InvalidTerminal)
    );
    assert!(!finished(&g, &[vec![0, 2]], 0, &council, 1, 3, &blocked));
    // The source may itself be a Council member; it is still not its own terminal.
    let source_member = vec![false, false, false, false];
    assert_eq!(
        verify_certificate(&Certificate { graph: &g, paths: &[vec![0, 2]], source: 0, council: &[0, 2], required: 1, max_nodes: 3, blocked: &source_member }),
        Ok(())
    );
}
