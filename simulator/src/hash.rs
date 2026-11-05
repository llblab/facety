//! A fast, deterministic hasher for small integer keys (the standard hasher is built for untrusted input and is several times slower).
//! Only used for lookups; no result depends on hash-table iteration order.
use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasherDefault, Hasher};

#[derive(Default, Clone, Copy)]
pub struct FastHasher(u64);

const K: u64 = 0x517c_c1b7_2722_0a95;

impl Hasher for FastHasher {
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 = (self.0.rotate_left(5) ^ u64::from(b)).wrapping_mul(K);
        }
    }
    fn write_u32(&mut self, i: u32) {
        self.0 = (self.0.rotate_left(5) ^ u64::from(i)).wrapping_mul(K);
    }
    fn write_u64(&mut self, i: u64) {
        self.0 = (self.0.rotate_left(5) ^ i).wrapping_mul(K);
    }
    fn write_usize(&mut self, i: usize) {
        self.write_u64(i as u64);
    }
    fn finish(&self) -> u64 {
        // Spread the high bits so tables that use the low bits see the whole key.
        self.0 ^ (self.0 >> 32)
    }
}

pub type FastMap<K, V> = HashMap<K, V, BuildHasherDefault<FastHasher>>;
pub type FastSet<K> = HashSet<K, BuildHasherDefault<FastHasher>>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn behaves_like_a_map_and_a_set() {
        let mut m: FastMap<(u32, u32), u32> = FastMap::default();
        for a in 0..300u32 {
            for b in 0..30u32 {
                m.insert((a, b), a * 31 + b);
            }
        }
        assert_eq!(m.len(), 9000);
        assert_eq!(m[&(299, 29)], 299 * 31 + 29);
        assert!(m.remove(&(1, 1)).is_some() && !m.contains_key(&(1, 1)));
        let s: FastSet<u32> = (0..1000).collect();
        assert!(s.contains(&999) && !s.contains(&1000));
    }
}
