//! The Q26 integrity-precision comparison: exact halving against the existing millionths grid.
//!
//! Neither candidate below is a selected policy. The selected default stays `grid::GRID_POLICY` (the existing
//! `INTEGRITY_POLICY` convention, unchanged and already stored in saved configurations). The exact candidate is a
//! labeled comparison reference with a declared, checked representable domain; exhausting that domain reports a named
//! limit instead of silently switching to rounding, saturation or the grid.
//!
//! The grid path reuses the model's own primitives (`world::grid_penalty`, `world::grid_repair`); the exact path is a
//! small independent reference, not a generalized arithmetic abstraction.
use crate::world::{grid_penalty, grid_repair, COEF_ONE, COEF_STEP};

/// The selected default convention, re-exported so the comparison cannot drift from the stored identifier.
pub use crate::world::INTEGRITY_POLICY as GRID_POLICY;
/// A candidate identity. It is deliberately not the default and never appears in a saved configuration.
pub const EXACT_CANDIDATE_POLICY: &str = "candidate/exact-rational-halving/own-maturity-1000/cap-one/final-floor/v1";

/// Most coefficient halvings the exact reference promises to represent exactly.
pub const MAX_HALVINGS: u32 = 60;
/// Largest numerator or denominator the exact reference represents (checked; above this it reports a limit).
pub const MAX_TERM: u128 = 1 << 120;

/// One chronological integrity event. `Repairs(n)` is `n` own maturities (each adds 1/1000 of the whole, capped at one).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Step {
    Loss,
    Repairs(u64),
}

/// A named unsupported result of the exact reference. Not a protocol limit and not a rounding rule.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IntegrityLimit {
    /// The sequence halves the coefficient more often than the declared denominator domain represents.
    TooManyHalvings,
    /// A checked intermediate exceeded the reference's declared term bound.
    TermOverflow,
    /// The unit count cannot be represented (units are non-negative responsibility units).
    UnitsOutOfRange,
}

/// An exact coefficient in `[0, 1]`, always reduced.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ExactCoefficient {
    num: u128,
    den: u128,
}

fn gcd(mut a: u128, mut b: u128) -> u128 {
    while b != 0 {
        let t = a % b;
        a = b;
        b = t;
    }
    a.max(1)
}

impl ExactCoefficient {
    pub const ONE: ExactCoefficient = ExactCoefficient { num: 1, den: 1 };

    pub fn ratio(&self) -> (u128, u128) {
        (self.num, self.den)
    }

    fn reduced(num: u128, den: u128) -> Result<ExactCoefficient, IntegrityLimit> {
        let d = gcd(num, den);
        let (num, den) = (num / d, den / d);
        if num > MAX_TERM || den > MAX_TERM {
            return Err(IntegrityLimit::TermOverflow);
        }
        // D165 caps the coefficient at one; the cap is exact, so it reduces to one whole.
        if num >= den {
            return Ok(ExactCoefficient::ONE);
        }
        Ok(ExactCoefficient { num, den })
    }

    /// D165: a lost dispute halves the coefficient; the units are untouched.
    pub fn halve(&self, halvings: u32) -> Result<ExactCoefficient, IntegrityLimit> {
        if halvings > MAX_HALVINGS {
            return Err(IntegrityLimit::TooManyHalvings);
        }
        let den = self.den.checked_mul(2).ok_or(IntegrityLimit::TermOverflow)?;
        Self::reduced(self.num, den)
    }

    /// D165: each valid own maturity adds 1/1000 of the whole coefficient, capped at one.
    pub fn repair(&self, count: u64) -> Result<ExactCoefficient, IntegrityLimit> {
        if count == 0 {
            return Ok(*self);
        }
        let gain = self.den.checked_mul(count as u128).ok_or(IntegrityLimit::TermOverflow)?;
        let num = self.num.checked_mul(COEF_STEP as u128).and_then(|v| v.checked_add(gain)).ok_or(IntegrityLimit::TermOverflow)?;
        let den = self.den.checked_mul(COEF_STEP as u128).ok_or(IntegrityLimit::TermOverflow)?;
        Self::reduced(num, den)
    }

    /// D165's final floor: `floor(units * coefficient)`.
    pub fn effective_xp(&self, units: i32) -> Result<i32, IntegrityLimit> {
        if units < 0 {
            return Err(IntegrityLimit::UnitsOutOfRange);
        }
        let scaled = u128::try_from(units).map_err(|_| IntegrityLimit::UnitsOutOfRange)?.checked_mul(self.num).ok_or(IntegrityLimit::TermOverflow)?;
        i32::try_from(scaled / self.den).map_err(|_| IntegrityLimit::UnitsOutOfRange)
    }

    /// Apply one event to a coefficient.
    pub fn apply(&self, step: Step, halvings: u32) -> Result<ExactCoefficient, IntegrityLimit> {
        match step {
            Step::Loss => self.halve(halvings + 1),
            Step::Repairs(count) => self.repair(count),
        }
    }
}

/// The exact candidate: replay a chronological event sequence and return XP.
pub fn exact_effective_xp(units: i32, steps: &[Step]) -> Result<i32, IntegrityLimit> {
    let mut coef = ExactCoefficient::ONE;
    let mut halvings = 0;
    for &step in steps {
        coef = coef.apply(step, halvings)?;
        if step == Step::Loss {
            halvings += 1;
        }
    }
    coef.effective_xp(units)
}

/// The selected default convention over the same sequence: the existing millionths grid, reused unchanged.
pub fn grid_effective_xp(units: i32, steps: &[Step]) -> i32 {
    let mut coef = COEF_ONE;
    for &step in steps {
        coef = match step {
            Step::Loss => grid_penalty(coef, 0.5),
            Step::Repairs(count) => grid_repair(coef, count),
        };
    }
    if units <= 0 {
        return units;
    }
    ((i64::from(units) * i64::from(coef)) / i64::from(COEF_ONE)) as i32
}

/// Both candidates' XP for one sequence; divergence is reported, not resolved.
pub fn compare(units: i32, steps: &[Step]) -> (i32, Result<i32, IntegrityLimit>) {
    (grid_effective_xp(units, steps), exact_effective_xp(units, steps))
}
