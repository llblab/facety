//! The Self-ID emission path gate against the selected rule (D84/D123/D124/D156): one current path from the emitter
//! to a different Council member, at most `max_nodes` nodes counting both ends, intermediates (the guarantor first) accepted,
//! supported under layering and outside a dispute; the issuer and the Council terminal need no support of their own.
//! Deterministic transition checks of the implemented gate, with the independent certificate and family verifiers
//! as the expectation reference. These are not human or production evidence.
use facety_sim::certificate::{verify_certificate, Certificate, CertificateError};
use facety_sim::paths::{verify_family, PathFinder, Search};
use facety_sim::world::{Config, Reject, World};

fn chain(n: usize) -> Vec<(u32, u32)> {
    (0..n as u32 - 1).map(|i| (i, i + 1)).collect()
}

/// Cut one direction of a genesis pair by withdrawing the owner's open valence (both graph edges go with it).
fn cut(w: &mut World, owner: u32, counterpart: u32) {
    let valence = w.open_valence_of(owner, counterpart).unwrap();
    w.withdraw_valence(owner, valence).unwrap();
}

fn council_mask(w: &World) -> Vec<bool> {
    let mut mask = vec![false; w.len()];
    for &m in w.council() {
        mask[m as usize] = true;
    }
    mask
}

/// Record acts with a loose bound, then apply the selected seven-node bound and refresh the snapshot.
fn bound7(w: &mut World) {
    w.cfg.max_nodes = Some(7);
    w.tick(w.now() + 24);
}

/// A chain whose far trio holds the three seats (D133: three seats below 100 active accounts).
fn far_trio(first: u32, layered: bool) -> World {
    let seats = [first, first + 1, first + 2];
    let n = (first + 3) as usize;
    let mut w = World::new(Config { layered, max_nodes: Some(12), ..Config::default() }, n, &chain(n));
    for id in seats {
        w.create_self_id(id).unwrap();
    }
    bound7(&mut w);
    assert_eq!(w.council(), &seats);
    assert_eq!(w.required_guarantors(), 1);
    w
}

fn assert_refused_without_emission(w: &mut World, reason: &'static str) {
    let before = (w.minted(), w.vault(), w.unspent_rights(0), w.is_active(0), w.xp(0));
    assert_eq!(w.create_self_id(0), Err(Reject(reason)));
    assert_eq!((w.minted(), w.vault(), w.unspent_rights(0), w.is_active(0), w.xp(0)), before);
    w.audit().unwrap();
}

#[test]
fn seven_nodes_pass_and_eight_fail_with_or_without_layering() {
    for layered in [true, false] {
        for first in [6, 7] {
            let mut w = far_trio(first, layered);
            assert_eq!(w.mutual_partners(0), [1]);
            // The chain has one route to the nearest seat. When layered, at D=1 a vertex's level is its
            // distance to that seat up to level five. The issuer never has to qualify as an intermediate.
            let blocked: Vec<_> = (0..w.len() as u32).map(|i| layered && first.saturating_sub(i) > 5).collect();
            for i in 0..w.len() as u32 {
                assert_eq!(w.path_blocked(i), blocked[i as usize], "support at vertex {i}");
            }
            let route = vec![(0..=first).collect::<Vec<_>>()];
            let graph = w.graph();
            let mask = council_mask(&w);
            let certificate = Certificate { graph, paths: &route, source: 0, council: w.council(), required: 1, max_nodes: 7, blocked: &blocked };
            let mut finder = PathFinder::new();
            let exact = finder.bounded(graph, &blocked, &mask, w.council(), 0, 0, 1, 7, 1_000);
            if first == 6 {
                assert_eq!(verify_certificate(&certificate), Ok(()));
                assert!(verify_family(graph, &route, 0, &mask, 1, 7, &blocked));
                assert_eq!(exact, Search::Found(route));
                w.create_self_id(0).unwrap();
            } else {
                assert_eq!(verify_certificate(&certificate), Err(CertificateError::PathTooLong));
                assert_eq!(exact, Search::Insufficient);
                if !layered {
                    assert_eq!(verify_certificate(&Certificate { max_nodes: 8, ..certificate }), Ok(()));
                }
                assert_refused_without_emission(&mut w, "insufficient Council paths");
            }
        }
    }
}

#[test]
fn a_short_route_still_needs_a_supported_first_hop_and_an_ordinary_partner() {
    // At D=2, cutting 1-4 leaves the issuer's only partner with just one lower-level guarantor.
    // The short route to seat 3 remains, but the unsupported pair 0-1 cannot bootstrap itself.
    let mut pairs = vec![(0, 1), (1, 3), (1, 4)];
    pairs.extend((3..13).flat_map(|i| (i + 1..13).map(move |j| (i, j))));
    let mut w = World::new(Config::default(), 13, &pairs);
    for id in 3..13 {
        w.create_self_id(id).unwrap();
    }
    w.cfg.layered = true;
    w.tick(24);
    assert_eq!(w.council(), &[3, 4, 5]);
    assert_eq!(w.required_guarantors(), 2);
    assert_eq!(w.mutual_partners(0), [1]);
    assert!(!w.path_blocked(1));
    w.clone().create_self_id(0).unwrap();
    w.create_self_id(1).unwrap(); // Warm the cache before removing exactly one support edge.
    cut(&mut w, 1, 4);
    assert!(w.graph().is_mutual(1, 3), "the short route still exists but its intermediate is unsupported");
    assert_refused_without_emission(&mut w, "insufficient Council paths");
    cut(&mut w, 0, 1);
    assert_refused_without_emission(&mut w, "Self-ID requires an established mutual guarantor");
}

#[test]
fn a_same_hour_cut_cannot_leave_a_cached_route_usable() {
    let mut cut_route = far_trio(4, false);
    cut_route.clone().create_self_id(0).unwrap();
    cut_route.create_self_id(3).unwrap();
    cut(&mut cut_route, 2, 3);
    assert_eq!(cut_route.mutual_partners(0), [1]);
    assert_refused_without_emission(&mut cut_route, "insufficient Council paths");
}

#[test]
fn a_same_hour_dispute_cannot_leave_a_cached_route_usable() {
    let mut held_route = far_trio(4, false);
    held_route.clone().create_self_id(0).unwrap();
    held_route.create_self_id(3).unwrap();
    // An already-active fixture exercises a path restriction without a tick refreshing the distances.
    held_route.begin_case(&[6, 2]).unwrap();
    assert!(held_route.path_blocked(2));
    assert!(!held_route.path_blocked(1));
    assert_refused_without_emission(&mut held_route, "insufficient Council paths");
}

#[test]
fn a_same_hour_status_change_rechecks_transit_without_changing_links_or_seats() {
    let mut w = far_trio(4, false);
    w.create_self_id(3).unwrap();
    let revision = w.graph().revision();
    w.invalidate_identity(2);
    assert_refused_without_emission(&mut w, "insufficient Council paths");
    assert!(w.reinstate_identity(2));
    assert_eq!(w.graph().revision(), revision);
    assert_eq!(w.council(), &[4, 5, 6]);
    assert_eq!(w.create_self_id(0), Ok(4), "refusal left the next act ID and the issuer's rolling slot untouched");
    w.audit().unwrap();
}

#[test]
fn a_member_cannot_count_a_path_back_to_their_own_seat() {
    for layered in [false, true] {
        let mut w = World::new(Config { layered, ..Config::default() }, 4, &[(0, 3)]);
        assert_eq!(w.council(), &[0, 1, 2]);
        assert_eq!(w.mutual_partners(0), [3]);
        assert_refused_without_emission(&mut w, "insufficient Council paths");
        assert_eq!(w.create_self_id(3), Ok(0), "the same edge leads the nonmember to a distinct seat");
        w.audit().unwrap();
    }
}

#[test]
fn a_member_can_reach_another_member_without_a_direct_guarantee() {
    let pairs = [(0, 3), (3, 4), (4, 1)];
    for max_nodes in [3, 4] {
        let mut w = World::new(Config { layered: true, max_nodes: Some(max_nodes), ..Config::default() }, 5, &pairs);
        assert_eq!(w.council(), &[0, 1, 2]);
        assert_eq!(w.mutual_partners(0), [3]);
        let paths = vec![vec![0, 3, 4, 1]];
        let blocked: Vec<_> = (0..w.len() as u32).map(|i| w.path_blocked(i)).collect();
        let certificate = Certificate { graph: w.graph(), paths: &paths, source: 0, council: w.council(), required: 1, max_nodes, blocked: &blocked };
        if max_nodes == 3 {
            assert_eq!(verify_certificate(&certificate), Err(CertificateError::PathTooLong));
            assert_refused_without_emission(&mut w, "insufficient Council paths");
        } else {
            assert_eq!(verify_certificate(&certificate), Ok(()));
            assert_eq!(w.create_self_id(0), Ok(0));
            w.audit().unwrap();
        }
    }
}

/// A Council-member guarantor is the two-node path's terminal: the selected rule exempts the terminal from support
/// (D124) and asks only for the emitter-rooted path (D156), so the gate accepts it even when the seat is isolated
/// from the rest of the Council. The pre-v10 build required the seat to reach another member; that condition came
/// from the superseded D84 reading and refused valid paths.
#[test]
fn a_member_guarantor_supplies_a_two_node_path() {
    // Setup on a connected chain so every member's own act records, then cut the emitter's chain link and member
    // 6's links to the rest: member 6 keeps only the emitter 0 as its neighbor.
    let mut pairs: Vec<(u32, u32)> = chain(9);
    pairs.push((0, 6));
    let mut w = World::new(Config { layered: true, max_nodes: Some(12), ..Config::default() }, 9, &pairs);
    for id in [6u32, 7, 8] {
        w.create_self_id(id).unwrap();
    }
    w.tick(w.now() + 24);
    assert_eq!(w.council(), &[6, 7, 8], "the trio holds the three seats");
    cut(&mut w, 0, 1);
    cut(&mut w, 6, 5);
    cut(&mut w, 6, 7);
    w.tick(w.now() + 24);
    assert_eq!(w.council(), &[6, 7, 8], "the cut does not change the seats");
    assert_eq!(w.create_self_id(0).err(), None, "the two-node path 0-6 is valid under the selected rule");

    // Independent expectation: the certificate verifier accepts the two-node family on this snapshot.
    let graph = w.graph();
    let mask = council_mask(&w);
    let blocked: Vec<bool> = (0..w.len() as u32).map(|i| w.path_blocked(i)).collect();
    let two = vec![vec![0, 6]];
    assert!(verify_family(graph, &two, 0, &mask, 1, 7, &blocked), "the reference accepts the two-node family");
    verify_certificate(&Certificate { graph, paths: &two, source: 0, council: w.council(), required: 1, max_nodes: 7, blocked: &blocked })
        .expect("the certificate verifier accepts the two-node family");
}
