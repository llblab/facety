// Owns: Ordered public-graph neighborhoods and seed propagation; excludes truth labels, random observations, sanctions and admission.

// SybilRank-style trust: early-terminated random walk from public seeds over the undirected
// guarantee graph, normalized by degree. Uses public graph data only.
export function propagatedTrust(graph, seeds) {
  const nodes = [...graph.nodeIds()];
  const neighbors = new Map(nodes.map(id => [id, new Set([...graph.outEdges(id)].map(edge => edge.to).concat([...graph.inEdges(id)].map(edge => edge.from)))]));
  const live = seeds.filter(id => graph.hasNode(id));
  let trust = new Map(nodes.map(id => [id, 0]));
  for (const id of live) trust.set(id, 1 / live.length);
  for (let step = 0, steps = Math.ceil(Math.log2(Math.max(2, nodes.length))); step < steps; step++) {
    const next = new Map(nodes.map(id => [id, 0]));
    for (const [id, value] of trust) {
      if (!value) continue;
      const around = neighbors.get(id);
      if (!around.size) next.set(id, next.get(id) + value);
      else for (const other of around) next.set(other, next.get(other) + value / around.size);
    }
    trust = next;
  }
  return new Map(nodes.map(id => [id, trust.get(id) / Math.max(1, neighbors.get(id).size)]));
}

// Graph order, outgoing-before-incoming traversal and discovery order are observable to callers.
export function graphNeighborhood(graphs, id, hops) {
  const seenIds = new Set([id]);
  let frontier = [id];
  for (let depth = 0; depth < hops; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const graph of graphs) {
        for (const edge of graph.outEdges(node)) if (!seenIds.has(edge.to)) { seenIds.add(edge.to); next.push(edge.to); }
        for (const edge of graph.inEdges(node)) if (!seenIds.has(edge.from)) { seenIds.add(edge.from); next.push(edge.from); }
      }
    }
    frontier = next;
  }
  seenIds.delete(id);
  return seenIds;
}
