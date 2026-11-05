//! Directed graph with sorted adjacency lists. Node ids are dense `u32` indices.

#[derive(Clone, Debug, Default)]
pub struct Graph {
    out: Vec<Vec<u32>>,
    inn: Vec<Vec<u32>>,
    edges: usize,
    revision: u64,
}

impl Graph {
    pub fn new() -> Graph {
        Graph::default()
    }

    pub fn with_nodes(n: usize) -> Graph {
        Graph { out: vec![Vec::new(); n], inn: vec![Vec::new(); n], edges: 0, revision: 0 }
    }

    pub fn len(&self) -> usize {
        self.out.len()
    }

    pub fn is_empty(&self) -> bool {
        self.out.is_empty()
    }

    pub fn edge_count(&self) -> usize {
        self.edges
    }

    /// Increases on every structural change; caches key on it.
    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn add_node(&mut self) -> u32 {
        self.out.push(Vec::new());
        self.inn.push(Vec::new());
        self.revision += 1;
        (self.out.len() - 1) as u32
    }

    pub fn has_edge(&self, from: u32, to: u32) -> bool {
        self.out[from as usize].binary_search(&to).is_ok()
    }

    pub fn is_mutual(&self, a: u32, b: u32) -> bool {
        self.has_edge(a, b) && self.has_edge(b, a)
    }

    /// Returns false when the edge exists already or is a self edge.
    pub fn add_edge(&mut self, from: u32, to: u32) -> bool {
        if from == to {
            return false;
        }
        match self.out[from as usize].binary_search(&to) {
            Ok(_) => false,
            Err(at) => {
                self.out[from as usize].insert(at, to);
                let at_in = self.inn[to as usize].binary_search(&from).unwrap_err();
                self.inn[to as usize].insert(at_in, from);
                self.edges += 1;
                self.revision += 1;
                true
            }
        }
    }

    pub fn remove_edge(&mut self, from: u32, to: u32) -> bool {
        match self.out[from as usize].binary_search(&to) {
            Err(_) => false,
            Ok(at) => {
                self.out[from as usize].remove(at);
                let at_in = self.inn[to as usize].binary_search(&from).unwrap();
                self.inn[to as usize].remove(at_in);
                self.edges -= 1;
                self.revision += 1;
                true
            }
        }
    }

    pub fn out(&self, v: u32) -> &[u32] {
        &self.out[v as usize]
    }

    pub fn inn(&self, v: u32) -> &[u32] {
        &self.inn[v as usize]
    }

    /// Add both directions (a mutual guarantee).
    pub fn add_mutual(&mut self, a: u32, b: u32) {
        self.add_edge(a, b);
        self.add_edge(b, a);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edges_are_unique_sorted_and_removable() {
        let mut g = Graph::with_nodes(4);
        assert!(g.add_edge(0, 2));
        assert!(g.add_edge(0, 1));
        assert!(!g.add_edge(0, 1));
        assert!(!g.add_edge(3, 3));
        assert_eq!(g.out(0), &[1, 2]);
        assert_eq!(g.inn(2), &[0]);
        assert!(g.has_edge(0, 2) && !g.has_edge(2, 0));
        assert!(g.remove_edge(0, 2) && !g.remove_edge(0, 2));
        assert_eq!(g.edge_count(), 1);
    }
}
