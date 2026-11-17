//! The Q26 integrity-precision package: candidate arithmetic, not a selected policy. These are deterministic
//! conformance witnesses, not research evidence, and nothing here changes the default model behavior.
use facety_sim::integrity::{
    compare, exact_effective_xp, grid_effective_xp, ExactCoefficient, IntegrityLimit, Step, EXACT_CANDIDATE_POLICY, GRID_POLICY, MAX_HALVINGS,
};
use facety_sim::world::{Config, World, COEF_ONE};

fn world() -> World {
    let mut pairs = Vec::new();
    for i in 0..10u32 {
        for offset in [1u32, 2] {
            let j = (i + offset) % 10;
            let (a, b) = (i.min(j), i.max(j));
            if !pairs.contains(&(a, b)) {
                pairs.push((a, b));
            }
        }
    }
    World::new(Config::default(), 10, &pairs)
}

#[test]
fn the_candidates_are_labelled_and_the_default_identifier_is_unchanged() {
    assert_eq!(GRID_POLICY, "millionths/penalty-f64-floor/own-maturity-1000/cap-one/v1");
    assert_ne!(EXACT_CANDIDATE_POLICY, GRID_POLICY, "a candidate must not masquerade as the selected policy");
    assert!(EXACT_CANDIDATE_POLICY.starts_with("candidate/"));
    // Neither candidate enters a configuration or a digest, so no saved result or schema changes.
    let cfg = Config::default();
    assert!(cfg.integrity);
    assert!(!format!("{cfg:?}").contains("exact"));
}

#[test]
fn one_hundred_twenty_eight_units_and_seven_halvings_diverge() {
    let steps = [Step::Loss; 7];
    assert_eq!(grid_effective_xp(128, &steps), 0, "the millionths grid stores 7,812 instead of 7,812.5");
    assert_eq!(exact_effective_xp(128, &steps), Ok(1), "the exact coefficient keeps the true one unit");
    assert_eq!(compare(128, &steps), (0, Ok(1)));
    // With fewer halvings the two agree.
    assert_eq!(compare(128, &[Step::Loss; 3]), (16, Ok(16)));
}

#[test]
fn capped_replay_returns_the_replayed_coefficient_not_an_algebraic_undo() {
    // 1 -> first loss 0.5 -> 300 repairs 0.8 -> second loss 0.4; reversing the first loss yields 0.5, not 0.8.
    // The World's own chronological replay guards this in
    // `world::tests::case_integrity_restoration_replays_capped_maturities_and_preserves_later_losses`.
    let forward = [Step::Loss, Step::Repairs(300), Step::Loss];
    assert_eq!(grid_effective_xp(1_000_000, &forward), 400_000);
    assert_eq!(exact_effective_xp(1_000_000, &forward), Ok(400_000));
    let without_first = [Step::Repairs(300), Step::Loss];
    assert_eq!(grid_effective_xp(1_000_000, &without_first), 500_000);
    assert_eq!(exact_effective_xp(1_000_000, &without_first), Ok(500_000));
    // A smaller unit count turns the divergence into a visible XP difference only after enough halvings.
    assert_eq!(compare(3, &forward), (1, Ok(1)));
    assert_eq!(compare(3, &[Step::Loss; 12]), (0, Ok(0)));
}

#[test]
fn mixed_credits_repairs_losses_and_a_long_domain_sequence_match_an_independent_reference() {
    // An independent reference for uncapped sequences over the common denominator 1000 * 2^h:
    // c = 1000 / (1000 * 2^h) + sum_j (count_j * 2^done_j) / (1000 * 2^h), where `done_j` halvings preceded repair j.
    // It is computed here without the exact coefficient type.
    fn reference(steps: &[Step]) -> (i128, i128) {
        let halvings = steps.iter().filter(|s| **s == Step::Loss).count() as u32;
        let den = 1000i128 * (1i128 << halvings);
        let mut num = 1000i128; // the 2^-h term
        let mut done = 0u32;
        for step in steps {
            match step {
                Step::Loss => done += 1,
                Step::Repairs(count) => num += i128::from(*count) * (1i128 << done),
            }
        }
        (num, den)
    }
    let sequences: Vec<Vec<Step>> = vec![
        vec![Step::Loss, Step::Repairs(5), Step::Loss, Step::Repairs(2)],
        vec![Step::Loss, Step::Repairs(1), Step::Loss, Step::Repairs(3), Step::Loss],
        {
            let mut s = vec![Step::Loss, Step::Repairs(40)];
            for _ in 0..12 {
                s.push(Step::Loss);
                s.push(Step::Repairs(7));
            }
            s
        },
        {
            let mut s = Vec::new();
            for i in 1..=MAX_HALVINGS {
                s.push(Step::Loss);
                s.push(Step::Repairs(u64::from(i % 3)));
            }
            s
        },
    ];
    for steps in sequences {
        let (num, den) = reference(&steps);
        assert!(num < den, "the reference sequences must stay below the cap");
        let mut coef = ExactCoefficient::ONE;
        let mut halvings = 0;
        for &step in &steps {
            coef = coef.apply(step, halvings).expect("inside the declared domain");
            if step == Step::Loss {
                halvings += 1;
            }
        }
        let (n, d) = coef.ratio();
        assert_eq!((n as i128) * den, num * (d as i128), "the exact reference disagrees with the independent fraction");
        for units in [1, 7, 128, 1_000, 250_000] {
            let expected = ((i128::from(units) * num) / den) as i32;
            assert_eq!(exact_effective_xp(units, &steps), Ok(expected));
        }
    }
}

#[test]
fn the_cap_stops_repairs_at_exactly_one() {
    let steps = [Step::Repairs(300)];
    let mut coef = ExactCoefficient::ONE;
    coef = coef.apply(Step::Repairs(300), 0).unwrap();
    assert_eq!(coef.ratio(), (1, 1));
    assert_eq!(exact_effective_xp(4_000, &steps), Ok(4_000));
    assert_eq!(grid_effective_xp(4_000, &steps), 4_000);
    // After the cap a further loss halves exactly.
    assert_eq!(exact_effective_xp(4_000, &[Step::Repairs(300), Step::Loss]), Ok(2_000));
}

#[test]
fn exhausting_the_declared_domain_reports_a_named_limit_without_partial_state() {
    let too_many = vec![Step::Loss; MAX_HALVINGS as usize + 1];
    assert_eq!(exact_effective_xp(1, &too_many), Err(IntegrityLimit::TooManyHalvings));
    // The limit never falls back to rounding, saturation or the grid: the grid still answers, the reference refuses.
    assert_eq!(grid_effective_xp(1, &too_many), 0);
    // At the declared bound the reference still succeeds exactly.
    let at_bound = vec![Step::Loss; MAX_HALVINGS as usize];
    assert_eq!(exact_effective_xp(1_000_000_000, &at_bound), Ok(0));
    assert_eq!(exact_effective_xp(1, &at_bound), Ok(0));
    // Negative units are not responsibility units.
    assert_eq!(ExactCoefficient::ONE.effective_xp(-1), Err(IntegrityLimit::UnitsOutOfRange));
    assert_eq!(exact_effective_xp(-5, &[]), Err(IntegrityLimit::UnitsOutOfRange));
}

#[test]
fn divergence_can_change_eligibility_and_ranking_in_deterministic_examples() {
    // Eligibility: an ordinary XP gate of one. 128 units and seven losses reach the gate only under exact arithmetic.
    let deep = [Step::Loss; 7];
    assert_eq!(grid_effective_xp(128, &deep), 0);
    assert_eq!(exact_effective_xp(128, &deep), Ok(1));
    // Ranking: under the grid the untouched single unit outranks the deep holder; under exact they tie.
    let untouched = grid_effective_xp(1, &[]);
    assert!(untouched > grid_effective_xp(128, &deep));
    assert_eq!(1, exact_effective_xp(1, &[]).unwrap());
    assert_eq!(untouched, 1);
    // A wider gap needs a larger unit count: three deep losses keep the ordering identical in both.
    let shallow = [Step::Loss; 3];
    assert_eq!(grid_effective_xp(1_000, &shallow), 125);
    assert_eq!(exact_effective_xp(1_000, &shallow), Ok(125));
    // The unit count is what turns a half-quantum of coefficient into a whole XP.
    assert_eq!((grid_effective_xp(127, &deep), exact_effective_xp(127, &deep)), (0, Ok(0)));
}

#[test]
fn the_selected_world_convention_reproduces_the_grid_candidate() {
    let mut w = world();
    for id in 1..6u32 {
        w.create_self_id(id).unwrap();
    }
    w.tick(24);
    for _ in 0..3 {
        w.penalize_xp(1, 0.5);
    }
    assert_eq!(w.coefficient(1), COEF_ONE / 8);
    let units = w.responsibility_units(1);
    assert_eq!(grid_effective_xp(units, &[Step::Loss; 3]), w.xp(1), "the grid candidate is the model's own arithmetic");
    assert_eq!(exact_effective_xp(units, &[Step::Loss; 3]), Ok(w.xp(1)), "three halvings still agree");
    w.audit().unwrap();
}
