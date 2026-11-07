//! Decision-keyed randomness (policy `facety-sim-rng/v2`): every decision draws from its own stream, keyed by
//! (root seed, channel, actor, day), so unrelated decisions never share a stream offset.
//! Generator: splitmix64 seeding into xoshiro256**. Not compatible with the retired Node generator.

/// V2 adds channel 22 for optional persistent target errors; channels 1-21 retain the v1 layout.
pub const RANDOMNESS_POLICY: &str = "facety-sim-rng/v2:splitmix64-xoshiro256starstar:keyed(seed,channel,actor,day)";

fn splitmix(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// 64-bit hash of a text seed (FNV-1a, then a splitmix finalizer).
pub fn hash_seed(text: &str) -> u64 {
    let mut h: u64 = 0xCBF2_9CE4_8422_2325;
    for byte in text.bytes() {
        h ^= u64::from(byte);
        h = h.wrapping_mul(0x0000_0100_0000_01B3);
    }
    let mut s = h;
    splitmix(&mut s)
}

#[derive(Clone, Debug)]
pub struct Rng {
    s: [u64; 4],
}

impl Rng {
    /// A fresh stream for one keyed decision.
    pub fn keyed(seed: u64, channel: u64, actor: u64, day: u64) -> Rng {
        let mut state = seed;
        for part in [channel, actor, day] {
            state ^= part.wrapping_mul(0xD6E8_FEB8_6659_FD93);
            let mixed = splitmix(&mut state);
            state = mixed;
        }
        let mut s = [0u64; 4];
        for slot in &mut s {
            *slot = splitmix(&mut state);
        }
        Rng { s }
    }

    pub fn next_u64(&mut self) -> u64 {
        let result = self.s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);
        result
    }

    /// Uniform in [0, 1).
    pub fn unit(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    pub fn chance(&mut self, p: f64) -> bool {
        self.unit() < p
    }

    /// Uniform in 0..n (rejection sampling, no modulo bias). `n` must be positive.
    pub fn below(&mut self, n: u64) -> u64 {
        assert!(n > 0, "below(0)");
        let zone = u64::MAX - (u64::MAX % n + 1) % n;
        loop {
            let v = self.next_u64();
            if v <= zone {
                return v % n;
            }
        }
    }

    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> Option<&'a T> {
        if items.is_empty() {
            None
        } else {
            Some(&items[self.below(items.len() as u64) as usize])
        }
    }

    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.below(i as u64 + 1) as usize;
            items.swap(i, j);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_key_same_stream_and_distinct_keys_differ() {
        let seed = hash_seed("test");
        let a: Vec<u64> = {
            let mut r = Rng::keyed(seed, 1, 2, 3);
            (0..4).map(|_| r.next_u64()).collect()
        };
        let b: Vec<u64> = {
            let mut r = Rng::keyed(seed, 1, 2, 3);
            (0..4).map(|_| r.next_u64()).collect()
        };
        let c: Vec<u64> = {
            let mut r = Rng::keyed(seed, 1, 2, 4);
            (0..4).map(|_| r.next_u64()).collect()
        };
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn unit_is_uniform_enough_and_below_is_in_range() {
        let mut r = Rng::keyed(hash_seed("u"), 0, 0, 0);
        let n = 200_000;
        let mean: f64 = (0..n).map(|_| r.unit()).sum::<f64>() / n as f64;
        assert!((mean - 0.5).abs() < 0.005, "mean {mean}");
        let mut counts = [0u32; 7];
        for _ in 0..70_000 {
            counts[r.below(7) as usize] += 1;
        }
        for c in counts {
            assert!((c as f64 - 10_000.0).abs() < 600.0, "{counts:?}");
        }
    }

    #[test]
    fn chance_matches_probability() {
        let mut r = Rng::keyed(hash_seed("c"), 9, 9, 9);
        let hits = (0..100_000).filter(|_| r.chance(0.05)).count();
        assert!((hits as f64 - 5_000.0).abs() < 400.0, "{hits}");
    }
}
