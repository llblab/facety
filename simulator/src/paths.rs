//! Council-path machinery: layered support levels (D124), exact length-bounded internally vertex-disjoint paths (D36/D123)
//! and an independent certificate verifier. The search is exact up to an explicit work budget; running out of budget is
//! reported as `Exhausted`, never as a proof that no family exists.
use crate::graph::Graph;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

pub const NO_LEVEL: u8 = u8::MAX;

/// Levels by rounds: seeds are level 0; a node gets level `k` when at least `threshold` of its mutual, unblocked neighbors
/// already have a level (all strictly lower). Rounds stop at `max_level`. Unleveled nodes keep `NO_LEVEL`.
pub fn layered_support(g: &Graph, seeds: &[u32], threshold: u32, max_level: u8, blocked: &[bool]) -> Vec<u8> {
    let n = g.len();
    let mut level = vec![NO_LEVEL; n];
    let mut support = vec![0u32; n];
    let mut frontier: Vec<u32> = Vec::new();
    for &s in seeds {
        if !blocked[s as usize] && level[s as usize] == NO_LEVEL {
            level[s as usize] = 0;
            frontier.push(s);
        }
    }
    for round in 1..=max_level {
        if frontier.is_empty() {
            break;
        }
        let mut reached = Vec::new();
        for &id in &frontier {
            for &other in g.inn(id) {
                let o = other as usize;
                if level[o] != NO_LEVEL || blocked[o] || !g.has_edge(id, other) {
                    continue;
                }
                support[o] += 1;
                if support[o] == threshold {
                    reached.push(other);
                }
            }
        }
        for &id in &reached {
            level[id as usize] = round;
        }
        frontier = reached;
    }
    level
}

/// Independent soundness check of a level map: every level is justified by `threshold` strictly lower mutual neighbors.
pub fn verify_layered_support(g: &Graph, level: &[u8], seeds: &[u32], threshold: u32, max_level: u8, blocked: &[bool]) -> bool {
    let seed_set: HashSet<u32> = seeds.iter().copied().collect();
    for (id, &value) in level.iter().enumerate() {
        if value == NO_LEVEL {
            continue;
        }
        if blocked[id] || value > max_level {
            return false;
        }
        if value == 0 {
            if !seed_set.contains(&(id as u32)) {
                return false;
            }
            continue;
        }
        let lower = g.inn(id as u32).iter().filter(|&&o| g.has_edge(id as u32, o) && level[o as usize] != NO_LEVEL && level[o as usize] < value).count();
        if (lower as u32) < threshold {
            return false;
        }
    }
    true
}

#[derive(Debug, PartialEq, Eq)]
pub enum Search {
    Found(Vec<Vec<u32>>),
    Insufficient,
    Exhausted,
}

/// Checks a family: simple paths along existing edges from `s` to `t`, distinct routes, no shared or blocked intermediate,
/// at most `max_nodes` nodes each, at least `k` paths (a direct link can appear only once as a distinct route).
pub fn verify_family(g: &Graph, paths: &[Vec<u32>], s: u32, t: u32, k: usize, max_nodes: usize, blocked: &[bool]) -> bool {
    if paths.len() < k || s == t || blocked[t as usize] {
        return false;
    }
    let mut internal = HashSet::new();
    let mut routes = HashSet::new();
    for p in paths {
        if p.len() < 2 || p.len() > max_nodes || p[0] != s || *p.last().unwrap() != t || !routes.insert(p.clone()) {
            return false;
        }
        let mut seen = HashSet::new();
        for (i, &v) in p.iter().enumerate() {
            let inner = i != 0 && i != p.len() - 1;
            if !seen.insert(v) || (inner && blocked[v as usize]) {
                return false;
            }
            if i + 1 < p.len() && !g.has_edge(v, p[i + 1]) {
                return false;
            }
            if inner && !internal.insert(v) {
                return false;
            }
        }
    }
    true
}

struct Run<'a> {
    g: &'a Graph,
    source: u32,
    target: u32,
    limit: usize,
    dist: &'a [u8],
    blocked: &'a [bool],
    used: &'a mut [bool],
    on_walk: &'a mut [bool],
    steps: u64,
    budget: u64,
    exhausted: bool,
}

impl Run<'_> {
    fn within(&self, v: u32, nodes_before: usize) -> bool {
        let d = self.dist.get(v as usize).copied().unwrap_or(NO_LEVEL);
        d != NO_LEVEL && nodes_before + d as usize <= self.limit
    }

    fn solve(&mut self, need: usize, after: Option<u32>, chosen: &mut Vec<Vec<u32>>) -> bool {
        if need == 0 {
            return true;
        }
        if self.exhausted {
            return false;
        }
        let mut hops: Vec<u32> = Vec::new();
        for &to in self.g.out(self.source) {
            if to == self.source || after.is_some_and(|a| to <= a) {
                continue;
            }
            if to != self.target && (self.used[to as usize] || self.blocked[to as usize] || !self.within(to, 1)) {
                continue;
            }
            hops.push(to);
        }
        if hops.len() < need {
            return false;
        }
        for i in 0..=(hops.len() - need) {
            let first = hops[i];
            if first == self.target {
                chosen.push(vec![self.source, self.target]);
                if self.solve(need - 1, Some(first), chosen) {
                    return true;
                }
                chosen.pop();
                continue;
            }
            let mut walk = vec![self.source, first];
            self.on_walk[self.source as usize] = true;
            self.on_walk[first as usize] = true;
            let found = self.extend(first, &mut walk, need, first, chosen);
            self.on_walk[self.source as usize] = false;
            self.on_walk[first as usize] = false;
            if found {
                return true;
            }
            if self.exhausted {
                return false;
            }
        }
        false
    }

    fn extend(&mut self, at: u32, walk: &mut Vec<u32>, need: usize, first: u32, chosen: &mut Vec<Vec<u32>>) -> bool {
        self.steps += 1;
        if self.steps > self.budget {
            self.exhausted = true;
            return false;
        }
        if at == self.target {
            let internals: Vec<u32> = walk[1..walk.len() - 1].to_vec();
            for &v in &internals {
                self.used[v as usize] = true;
            }
            chosen.push(walk.clone());
            // The next path of the family walks on its own: release this walk's markers while it is searched.
            for &v in walk.iter() {
                self.on_walk[v as usize] = false;
            }
            let found = self.solve(need - 1, Some(first), chosen);
            for &v in walk.iter() {
                self.on_walk[v as usize] = true;
            }
            if found {
                return true;
            }
            chosen.pop();
            for &v in &internals {
                self.used[v as usize] = false;
            }
            return false;
        }
        let mut options: Vec<u32> = Vec::new();
        for &to in self.g.out(at) {
            if self.on_walk[to as usize] || (to != self.target && (self.used[to as usize] || self.blocked[to as usize])) || !self.within(to, walk.len()) {
                continue;
            }
            options.push(to);
        }
        options.sort_by_key(|&v| (self.dist.get(v as usize).copied().unwrap_or(NO_LEVEL), v));
        for to in options {
            walk.push(to);
            self.on_walk[to as usize] = true;
            let found = self.extend(to, walk, need, first, chosen);
            walk.pop();
            self.on_walk[to as usize] = false;
            if found {
                return true;
            }
            if self.exhausted {
                return false;
            }
        }
        false
    }
}

/// Reusable search state: scratch buffers and a shared distance cache keyed by graph revision and blocked-set epoch.
#[derive(Default, Clone)]
pub struct PathFinder {
    cache_key: (u64, u64),
    dist_cache: HashMap<(u32, usize), Rc<Vec<u8>>>,
    stamp: Vec<u32>,
    parent: Vec<u32>,
    epoch: u32,
    used: Vec<bool>,
    on_walk: Vec<bool>,
    pub exhausted_searches: u64,
}

impl PathFinder {
    pub fn new() -> PathFinder {
        PathFinder::default()
    }

    fn ensure(&mut self, n: usize) {
        if self.stamp.len() < 2 * n {
            self.stamp.resize(2 * n, 0);
            self.parent.resize(2 * n, 0);
        }
        if self.used.len() < n {
            self.used.resize(n, false);
            self.on_walk.resize(n, false);
        }
    }

    /// Maximum number (capped at `k`) of internally vertex-disjoint paths, no length bound (unit-capacity flow on the
    /// implicit vertex-split graph; states are `2v` for the in-copy and `2v + 1` for the out-copy).
    pub fn disjoint_count(&mut self, g: &Graph, blocked: &[bool], s: u32, t: u32, k: usize) -> usize {
        assert!(s != t, "distinct endpoints required");
        self.ensure(g.len());
        if blocked[t as usize] {
            return 0;
        }
        let mut flow: HashSet<(u32, u32)> = HashSet::new();
        let mut pred: HashMap<u32, u32> = HashMap::new();
        let mut succ: HashMap<u32, u32> = HashMap::new();
        let mut count = 0;
        while count < k {
            self.epoch = self.epoch.wrapping_add(1);
            if self.epoch == 0 {
                self.stamp.iter_mut().for_each(|x| *x = 0);
                self.epoch = 1;
            }
            let epoch = self.epoch;
            let start = s * 2 + 1;
            let mut queue = vec![start];
            self.stamp[start as usize] = epoch;
            let mut reached = false;
            let mut head = 0;
            while head < queue.len() {
                let state = queue[head];
                head += 1;
                let v = state / 2;
                let mut next_states: Vec<u32> = Vec::new();
                if state % 2 == 0 {
                    if v == t {
                        reached = true;
                        break;
                    }
                    match pred.get(&v) {
                        None => next_states.push(v * 2 + 1),
                        Some(&u) => next_states.push(u * 2 + 1),
                    }
                } else {
                    for &w in g.out(v) {
                        if blocked[w as usize] || w == s || flow.contains(&(v, w)) {
                            continue;
                        }
                        next_states.push(w * 2);
                    }
                    if v != s && pred.contains_key(&v) {
                        next_states.push(v * 2);
                    }
                }
                for next in next_states {
                    if self.stamp[next as usize] != epoch {
                        self.stamp[next as usize] = epoch;
                        self.parent[next as usize] = state;
                        queue.push(next);
                    }
                }
            }
            if !reached {
                break;
            }
            let mut states = vec![t * 2];
            while *states.last().unwrap() != start {
                let last = *states.last().unwrap();
                states.push(self.parent[last as usize]);
            }
            states.reverse();
            for pair in states.windows(2) {
                let (a, b) = (pair[0], pair[1]);
                let (va, vb) = (a / 2, b / 2);
                match (a % 2, b % 2) {
                    (1, 0) if va != vb => {
                        flow.insert((va, vb));
                        if va != s {
                            succ.insert(va, vb);
                        }
                        if vb != t {
                            pred.insert(vb, va);
                        }
                    }
                    (0, 1) if va != vb => {
                        // Cancel the flow on the edge vb -> va.
                        flow.remove(&(vb, va));
                        if succ.get(&vb) == Some(&va) {
                            succ.remove(&vb);
                        }
                        if pred.get(&va) == Some(&vb) {
                            pred.remove(&va);
                        }
                    }
                    _ => {}
                }
            }
            count += 1;
        }
        count
    }

    fn distances(&mut self, g: &Graph, blocked: &[bool], cache_key: u64, target: u32, limit: usize) -> Rc<Vec<u8>> {
        let key = (0, cache_key);
        if self.cache_key != key {
            self.dist_cache.clear();
            self.cache_key = key;
        }
        if let Some(d) = self.dist_cache.get(&(target, limit)) {
            return Rc::clone(d);
        }
        let mut dist = vec![NO_LEVEL; g.len()];
        dist[target as usize] = 0;
        let mut frontier = vec![target];
        let mut d = 1usize;
        while !frontier.is_empty() && d <= limit {
            let mut next = Vec::new();
            for &id in &frontier {
                for &from in g.inn(id) {
                    let f = from as usize;
                    if blocked[f] || dist[f] != NO_LEVEL || from == target {
                        continue;
                    }
                    dist[f] = d as u8;
                    next.push(from);
                }
            }
            frontier = next;
            d += 1;
        }
        let rc = Rc::new(dist);
        self.dist_cache.insert((target, limit), Rc::clone(&rc));
        rc
    }

    /// Exact search for `k` internally vertex-disjoint paths of at most `max_nodes` nodes (endpoints included).
    /// `cache_key` keys the shared distance cache: change it whenever the graph or `blocked` set changes enough to matter
    /// (the world passes a daily epoch, so new edges added within the day are not seen by the distance pruning).
    /// The source may itself be blocked: only intermediates and the target are filtered.
    #[allow(clippy::too_many_arguments)]
    pub fn bounded(&mut self, g: &Graph, blocked: &[bool], cache_key: u64, s: u32, t: u32, k: usize, max_nodes: usize, budget: u64) -> Search {
        assert!(s != t && k >= 1 && max_nodes >= 2);
        self.ensure(g.len());
        if blocked[t as usize] {
            return Search::Insufficient;
        }
        let limit = max_nodes - 1;
        let dist = self.distances(g, blocked, cache_key, t, limit);
        // The source needs no distance of its own: it must reach some neighbor within the bound.
        let source_reach = g.out(s).iter().filter_map(|&w| if w == t { Some(1usize) } else { dist.get(w as usize).filter(|&&d| d != NO_LEVEL).map(|&d| d as usize + 1) }).min();
        if source_reach.is_none_or(|d| d > limit) {
            return Search::Insufficient;
        }
        if self.disjoint_count(g, blocked, s, t, k) < k {
            return Search::Insufficient;
        }
        let mut run = Run { g, source: s, target: t, limit, dist: &dist, blocked, used: &mut self.used, on_walk: &mut self.on_walk, steps: 0, budget, exhausted: false };
        let mut chosen = Vec::new();
        let found = run.solve(k, None, &mut chosen);
        let exhausted = run.exhausted;
        if found {
            for p in &chosen {
                for &v in &p[1..p.len() - 1] {
                    self.used[v as usize] = false;
                }
            }
            Search::Found(chosen)
        } else if exhausted {
            self.exhausted_searches += 1;
            Search::Exhausted
        } else {
            Search::Insufficient
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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

    fn all_simple_routes(g: &Graph, s: u32, t: u32, max_nodes: usize, blocked: &[bool]) -> Vec<Vec<u32>> {
        fn go(g: &Graph, at: u32, t: u32, max_nodes: usize, blocked: &[bool], walk: &mut Vec<u32>, out: &mut Vec<Vec<u32>>) {
            if at == t {
                out.push(walk.clone());
                return;
            }
            for &to in g.out(at) {
                if walk.contains(&to) || (blocked[to as usize] && to != t) || walk.len() >= max_nodes {
                    continue;
                }
                walk.push(to);
                go(g, to, t, max_nodes, blocked, walk, out);
                walk.pop();
            }
        }
        let mut out = Vec::new();
        go(g, s, t, max_nodes, blocked, &mut vec![s], &mut out);
        out
    }

    fn pack(routes: &[Vec<u32>], need: usize, used: &mut HashSet<u32>) -> bool {
        if need == 0 {
            return true;
        }
        for (i, r) in routes.iter().enumerate() {
            if r[1..r.len() - 1].iter().any(|v| used.contains(v)) {
                continue;
            }
            let added: Vec<u32> = r[1..r.len() - 1].to_vec();
            used.extend(added.iter().copied());
            let ok = pack(&routes[i + 1..], need - 1, used);
            for v in &added {
                used.remove(v);
            }
            if ok {
                return true;
            }
        }
        false
    }

    #[test]
    fn bounded_search_matches_brute_force_and_certifies() {
        let mut rng = Lcg(987);
        let mut finder = PathFinder::new();
        let (mut checks, mut feasible) = (0, 0);
        for trial in 0..300 {
            let n = 11;
            let p = [0.15, 0.2, 0.3][trial % 3];
            let g = random_graph(n, p, 0.1, &mut rng);
            let mut blocked = vec![false; n];
            if rng.next() < 0.3 {
                blocked[3] = true;
            }
            let (s, t) = (0u32, 10u32);
            for max_nodes in 2..=8usize {
                let routes = all_simple_routes(&g, s, t, max_nodes, &blocked);
                for k in 1..=4usize {
                    let got = finder.bounded(&g, &blocked, trial as u64 * 100 + 1, s, t, k, max_nodes, 2_000_000);
                    // Distinct routes share no intermediate; the direct link is a single distinct route, so plain packing is exact.
                    let expected = pack(&routes, k, &mut HashSet::new());
                    checks += 1;
                    if expected {
                        feasible += 1;
                    }
                    match &got {
                        Search::Found(paths) => {
                            assert!(expected, "trial {trial} L{max_nodes} k{k}: found but brute force disagrees");
                            assert!(verify_family(&g, paths, s, t, k, max_nodes, &blocked), "bad certificate");
                        }
                        Search::Insufficient => assert!(!expected, "trial {trial} L{max_nodes} k{k}: missed a family"),
                        Search::Exhausted => panic!("budget exhausted on a tiny graph"),
                    }
                }
            }
            let flow = finder.disjoint_count(&g, &blocked, s, t, 4);
            let routes = all_simple_routes(&g, s, t, n, &blocked);
            let best = (1..=4usize).filter(|&k| pack(&routes, k, &mut HashSet::new())).max().unwrap_or(0);
            assert_eq!(flow, best, "flow count disagrees on trial {trial}");
        }
        assert!(feasible > 500 && checks - feasible > 500, "test must see both outcomes: {feasible}/{checks}");
    }

    #[test]
    fn layered_support_matches_naive_fixed_point() {
        let mut rng = Lcg(4242);
        for trial in 0..120 {
            let n = 14;
            let g = random_graph(n, 0.3, 0.1, &mut rng);
            let seeds = [0u32, 1u32];
            let mut blocked = vec![false; n];
            if trial % 4 == 0 {
                blocked[5] = true;
            }
            for threshold in 1..=3u32 {
                for max_level in [0u8, 1, 2, 5] {
                    let got = layered_support(&g, &seeds, threshold, max_level, &blocked);
                    let mut want = vec![NO_LEVEL; n];
                    for &s in &seeds {
                        want[s as usize] = 0;
                    }
                    for round in 1..=max_level {
                        let add: Vec<usize> = (0..n)
                            .filter(|&i| want[i] == NO_LEVEL && !blocked[i])
                            .filter(|&i| (0..n).filter(|&j| want[j] != NO_LEVEL && want[j] < round && g.is_mutual(i as u32, j as u32)).count() as u32 >= threshold)
                            .collect();
                        for i in add {
                            want[i] = round;
                        }
                    }
                    assert_eq!(got, want, "trial {trial} t{threshold} L{max_level}");
                    assert!(verify_layered_support(&g, &got, &seeds, threshold, max_level, &blocked));
                }
            }
        }
    }
}

