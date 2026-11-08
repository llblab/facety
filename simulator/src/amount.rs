//! Exact FCTY amounts in indivisible 10^-12 FCTY quanta. Floating-point views are for reported ratios only.

use std::fmt;
use std::iter::Sum;
use std::ops::{Add, AddAssign, Neg, Sub, SubAssign};

pub const SCALE: u128 = 1_000_000_000_000;

/// Unsigned currency; constructors distinguish whole coins from indivisible atoms.
///
/// ```compile_fail
/// use facety_sim::amount::Amount;
/// let smaller_than_one_atom = Amount::from_atoms(0.5);
/// ```
#[derive(Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Amount(u128);

impl Amount {
    pub const ZERO: Self = Self(0);
    pub const ONE: Self = Self(SCALE);

    pub const fn coins(coins: u64) -> Self {
        Self(coins as u128 * SCALE)
    }
    pub const fn from_atoms(atoms: u128) -> Self {
        Self(atoms)
    }
    pub const fn atoms(self) -> u128 {
        self.0
    }
    pub const fn is_zero(self) -> bool {
        self.0 == 0
    }
    /// Approximate FCTY for ratios and reporting, never currency arithmetic.
    pub fn as_f64(self) -> f64 {
        self.0 as f64 / SCALE as f64
    }
    pub fn checked_add(self, rhs: Self) -> Option<Self> {
        self.0.checked_add(rhs.0).map(Self)
    }
    pub fn checked_sub(self, rhs: Self) -> Option<Self> {
        self.0.checked_sub(rhs.0).map(Self)
    }
    pub fn checked_times(self, count: u64) -> Option<Self> {
        self.0.checked_mul(u128::from(count)).map(Self)
    }
    pub fn times(self, count: u64) -> Self {
        self.checked_times(count).expect("FCTY amount multiplication exceeds u128 atoms")
    }
    /// Floor share and remaining atoms. The caller owns the policy assigning the remainder to recipients.
    pub fn split_evenly(self, count: usize) -> Option<(Self, usize)> {
        if count == 0 {
            return None;
        }
        let divisor = count as u128;
        Some((Self(self.0 / divisor), (self.0 % divisor) as usize))
    }
}

#[derive(Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SignedAmount(i128);

impl SignedAmount {
    pub const ZERO: Self = Self(0);

    pub const fn from_atoms(atoms: i128) -> Self {
        Self(atoms)
    }
    pub fn from_amount(amount: Amount) -> Option<Self> {
        i128::try_from(amount.atoms()).ok().map(Self)
    }
    pub fn negative(amount: Amount) -> Option<Self> {
        if amount.atoms() == i128::MIN.unsigned_abs() {
            Some(Self(i128::MIN))
        } else {
            Self::from_amount(amount)?.checked_neg()
        }
    }
    pub const fn atoms(self) -> i128 {
        self.0
    }
    pub const fn is_zero(self) -> bool {
        self.0 == 0
    }
    pub const fn is_negative(self) -> bool {
        self.0 < 0
    }
    pub const fn unsigned_abs(self) -> Amount {
        Amount::from_atoms(self.0.unsigned_abs())
    }
    /// Approximate FCTY for ratios and reporting, never currency arithmetic.
    pub fn as_f64(self) -> f64 {
        self.0 as f64 / SCALE as f64
    }
    pub fn checked_add(self, rhs: Self) -> Option<Self> {
        self.0.checked_add(rhs.0).map(Self)
    }
    pub fn checked_sub(self, rhs: Self) -> Option<Self> {
        self.0.checked_sub(rhs.0).map(Self)
    }
    pub fn checked_neg(self) -> Option<Self> {
        self.0.checked_neg().map(Self)
    }
}

impl TryFrom<Amount> for SignedAmount {
    type Error = &'static str;

    fn try_from(amount: Amount) -> Result<Self, Self::Error> {
        Self::from_amount(amount).ok_or("FCTY amount exceeds i128 positive atoms")
    }
}

fn decimal(atoms: u128, negative: bool, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    if negative {
        write!(f, "-")?;
    }
    write!(f, "{}", atoms / SCALE)?;
    let mut fractional = atoms % SCALE;
    if fractional != 0 {
        let mut width = 12;
        while fractional.is_multiple_of(10) {
            fractional /= 10;
            width -= 1;
        }
        write!(f, ".{fractional:0width$}")?;
    }
    Ok(())
}

impl fmt::Display for Amount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        decimal(self.0, false, f)
    }
}
impl fmt::Debug for Amount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}
impl fmt::Display for SignedAmount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        decimal(self.0.unsigned_abs(), self.is_negative(), f)
    }
}
impl fmt::Debug for SignedAmount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

impl Add for Amount {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        self.checked_add(rhs).expect("FCTY amount addition exceeds u128 atoms")
    }
}
impl Sub for Amount {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        self.checked_sub(rhs).expect("FCTY amount subtraction would be negative")
    }
}
impl AddAssign for Amount {
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}
impl SubAssign for Amount {
    fn sub_assign(&mut self, rhs: Self) {
        *self = *self - rhs;
    }
}
impl Sum for Amount {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.fold(Self::ZERO, |sum, amount| sum + amount)
    }
}
impl<'a> Sum<&'a Self> for Amount {
    fn sum<I: Iterator<Item = &'a Self>>(iter: I) -> Self {
        iter.copied().sum()
    }
}

impl Add for SignedAmount {
    type Output = Self;

    fn add(self, rhs: Self) -> Self {
        self.checked_add(rhs).expect("signed FCTY addition exceeds i128 atoms")
    }
}
impl Sub for SignedAmount {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self {
        self.checked_sub(rhs).expect("signed FCTY subtraction exceeds i128 atoms")
    }
}
impl AddAssign for SignedAmount {
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}
impl SubAssign for SignedAmount {
    fn sub_assign(&mut self, rhs: Self) {
        *self = *self - rhs;
    }
}
impl Neg for SignedAmount {
    type Output = Self;

    fn neg(self) -> Self {
        self.checked_neg().expect("signed FCTY negation exceeds i128 positive atoms")
    }
}
impl Sum for SignedAmount {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        iter.fold(Self::ZERO, |sum, amount| sum + amount)
    }
}
impl<'a> Sum<&'a Self> for SignedAmount {
    fn sum<I: Iterator<Item = &'a Self>>(iter: I) -> Self {
        iter.copied().sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_decimal_formatting_preserves_every_quantum_and_is_json_numeric() {
        for (atoms, expected) in
            [(0, "0"), (1, "0.000000000001"), (10, "0.00000000001"), (SCALE, "1"), (SCALE + 1, "1.000000000001"), (7 * SCALE + 125_000_000_000, "7.125")]
        {
            let amount = Amount::from_atoms(atoms);
            assert_eq!(format!("{amount}"), expected);
            assert_eq!(format!("{amount:?}"), expected);
        }
        assert_eq!(format!("{}", Amount::from_atoms(u128::MAX)), "340282366920938463463374607.431768211455");
        assert_eq!(format!("{:?}", [Amount::ZERO, Amount::ONE, Amount::from_atoms(1)]), "[0, 1, 0.000000000001]");
        assert_eq!(Amount::coins(u64::MAX).atoms(), u128::from(u64::MAX) * SCALE);
    }

    #[test]
    fn equal_shares_conserve_atoms_and_leave_only_the_exact_remainder() {
        let total = Amount::coins(7);
        let (share, remainder) = total.split_evenly(3).unwrap();
        assert_eq!(format!("{share}"), "2.333333333333");
        assert_eq!(remainder, 1);
        assert_eq!(share.times(3) + Amount::from_atoms(remainder as u128), total);
        assert_eq!(total.split_evenly(0), None);
        assert_eq!(Amount::from_atoms(2).split_evenly(3), Some((Amount::ZERO, 2)));
        assert_eq!(Amount::ZERO.split_evenly(3), Some((Amount::ZERO, 0)));
    }

    #[test]
    fn signed_conversion_formatting_and_negation_handle_representation_boundaries() {
        let one_atom = Amount::from_atoms(1);
        assert_eq!(SignedAmount::negative(one_atom).unwrap().to_string(), "-0.000000000001");
        assert_eq!(SignedAmount::negative(Amount::ZERO), Some(SignedAmount::ZERO));
        let minimum = SignedAmount::from_atoms(i128::MIN);
        assert_eq!(minimum.to_string(), "-170141183460469231731687303.715884105728");
        assert_eq!(format!("{minimum:?}"), minimum.to_string());
        assert_eq!(minimum.unsigned_abs().atoms(), 1u128 << 127);
        assert_eq!(SignedAmount::negative(minimum.unsigned_abs()), Some(minimum));
        assert_eq!(minimum.checked_neg(), None);
        assert!(std::panic::catch_unwind(|| -minimum).is_err());
        assert!(SignedAmount::from_amount(Amount::from_atoms(i128::MAX as u128)).is_some());
        assert_eq!(SignedAmount::from_amount(minimum.unsigned_abs()), None);
        assert!(SignedAmount::try_from(minimum.unsigned_abs()).is_err());
        assert_eq!(SignedAmount::negative(Amount::from_atoms((1u128 << 127) + 1)), None);
    }

    #[test]
    fn checked_arithmetic_refuses_overflow_and_operators_never_wrap() {
        let atom = Amount::from_atoms(1);
        let maximum = Amount::from_atoms(u128::MAX);
        assert_eq!(maximum.checked_add(atom), None);
        assert_eq!(Amount::ZERO.checked_sub(atom), None);
        assert_eq!(maximum.checked_times(2), None);
        assert_eq!(maximum.checked_times(0), Some(Amount::ZERO));
        assert!(std::panic::catch_unwind(|| maximum + atom).is_err());
        assert!(std::panic::catch_unwind(|| Amount::ZERO - atom).is_err());
        assert!(std::panic::catch_unwind(|| maximum.times(2)).is_err());
        let signed_max = SignedAmount::from_atoms(i128::MAX);
        let signed_min = SignedAmount::from_atoms(i128::MIN);
        let signed_atom = SignedAmount::from_atoms(1);
        assert_eq!(signed_max.checked_add(signed_atom), None);
        assert_eq!(signed_min.checked_sub(signed_atom), None);
        assert!(std::panic::catch_unwind(|| signed_max + signed_atom).is_err());
        assert!(std::panic::catch_unwind(|| signed_min - signed_atom).is_err());
    }

    #[test]
    fn sums_and_assignments_keep_currency_units_exact() {
        let values = [Amount::ONE, Amount::from_atoms(1), Amount::coins(2)];
        assert_eq!(values.iter().sum::<Amount>(), Amount::from_atoms(3 * SCALE + 1));
        assert_eq!(values.into_iter().sum::<Amount>(), Amount::from_atoms(3 * SCALE + 1));
        let mut total = Amount::ZERO;
        total += values[0];
        total += values[1];
        total -= values[0];
        assert_eq!(total, Amount::from_atoms(1));
        let signed = [SignedAmount::from_amount(Amount::ONE).unwrap(), SignedAmount::negative(Amount::from_atoms(1)).unwrap()];
        assert_eq!(signed.iter().sum::<SignedAmount>().atoms(), SCALE as i128 - 1);
        assert_eq!(signed.into_iter().sum::<SignedAmount>().atoms(), SCALE as i128 - 1);
        let mut net = SignedAmount::ZERO;
        net += signed[0];
        net -= signed[1];
        assert_eq!(net.atoms(), SCALE as i128 + 1);
        assert_eq!((-signed[1]).atoms(), 1);
    }
}
