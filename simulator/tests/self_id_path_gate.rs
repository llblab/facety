//! The Self-ID emission path gate against the selected rule (D84/D123/D124/D156): one current path from the emitter
//! to a Council member, at most `max_nodes` nodes counting both ends, intermediates (the guarantor first) accepted,
//! supported under layering and outside a dispute; the issuer and the Council terminal need no support of their own.
//! Deterministic transition checks of the implemented gate, with the independent certificate and family verifiers
//! as the expectation reference. These are not human or production evidence.
use facety_sim::certificate::{verify_certificate, Certificate, CertificateError};
use facety_sim::paths::verify_family;
use facety_sim::world::{Config, World};

fn chain(n: usize) -> Vec<(u32, u32)> {
    (0..n as u32 - 1).map(|i| (i, i + 1)).collect()
}

/// Cut one direction of a genesis pair by withdrawing the owner's open valence (both graph edges go with it).
fn cut(w: &mut World, owner: u32, counterpart: u32) {
    if let Some(v) = w.open_valence_of(owner, counterpart) {
        let (open, o, _, _) = w.valence_info(v);
        if open && o == owner {
            w.withdraw_valence(owner, v).unwrap();
        }
    }
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

/// A chain 0-1-...-9 whose far trio {6,7,8} holds the three seats (D133: three seats below 100 active accounts).
fn far_trio() -> World {
    let mut w = World::new(Config { layered: true, max_nodes: Some(12), ..Config::default() }, 10, &chain(10));
    for id in [6u32, 7, 8] {
        w.create_self_id(id).unwrap();
    }
    bound7(&mut w);
    assert_eq!(w.council(), &[6, 7, 8], "the far trio holds the three seats");
    assert_eq!(w.required_guarantors(), 1);
    w
}

/// A valid seven-node path from the emitter to the Council terminal is accepted exactly at the bound, including
/// with the issuer itself unsupported (D124 exempts the issuer and the terminal), and an eight-node path is refused.
#[test]
fn seven_node_path_is_accepted_and_eight_is_refused_with_layering_on() {
    let mut w = far_trio();
    // The guarantor 1 is a supported intermediate five links from the terminal; the issuer 0 has no level of its own.
    assert!(w.path_blocked(0), "the issuer is unsupported under layering, which the selected rule allows");
    assert!(!w.path_blocked(1), "the guarantor is a supported intermediate");
    assert_eq!(w.create_self_id(0).err(), None, "the seven-node path 0-1-2-3-4-5-6 is valid");

    // Independent expectation: the same snapshot accepts exactly this family and rejects the eight-node one.
    let graph = w.graph();
    let mask = council_mask(&w);
    let blocked: Vec<bool> = (0..w.len() as u32).map(|i| w.path_blocked(i)).collect();
    let seven = vec![vec![0, 1, 2, 3, 4, 5, 6]];
    assert!(verify_family(graph, &seven, 0, &mask, 1, 7, &blocked), "the reference accepts the seven-node family");
    assert!(verify_family(graph, &seven, 0, &mask, 1, 8, &blocked), "the reference accepts it under a looser bound too");
    verify_certificate(&Certificate { graph, paths: &seven, source: 0, council: w.council(), required: 1, max_nodes: 7, blocked: &blocked })
        .expect("the certificate verifier accepts the family: the emitter is the exempt source and the intermediates are supported");
    let eight = vec![vec![0, 1, 2, 3, 4, 5, 6, 7]];
    assert!(!verify_family(graph, &eight, 0, &mask, 1, 7, &blocked), "the reference refuses the eight-node family");
    assert_eq!(
        verify_certificate(&Certificate { graph, paths: &eight, source: 0, council: w.council(), required: 1, max_nodes: 7, blocked: &blocked }),
        Err(CertificateError::PathTooLong),
        "the certificate verifier names the bound"
    );
}

/// The node bound does not depend on layering: without support levels the same seven-node path is accepted and the
/// eight-node path is refused by the bound alone.
#[test]
fn the_node_bound_applies_without_layering() {
    let mut w = World::new(Config { layered: false, max_nodes: Some(12), ..Config::default() }, 10, &chain(10));
    for id in [6u32, 7, 8] {
        w.create_self_id(id).unwrap();
    }
    bound7(&mut w);
    assert_eq!(w.council(), &[6, 7, 8]);
    assert_eq!(w.create_self_id(0).err(), None, "seven nodes without layering");
    let mut w8 = World::new(Config { layered: false, max_nodes: Some(12), ..Config::default() }, 12, &chain(10));
    for id in [7u32, 8, 9] {
        w8.create_self_id(id).unwrap();
    }
    bound7(&mut w8);
    assert_eq!(w8.council(), &[7, 8, 9]);
    assert_eq!(w8.create_self_id(0).err(), Some(facety_sim::world::Reject("insufficient Council paths")), "eight nodes exceed the bound");
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
    let mut w = World::new(Config { layered: false, max_nodes: Some(12), ..Config::default() }, 12, &pairs);
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
