// Owns: Simple directed graph storage and revisioned mutations, not identity truth.
function requireId(id) {
  if (typeof id !== 'string' || !id.length) throw new TypeError('node IDs must be non-empty strings');
}

export class DirectedGraph {
  #out = new Map();
  #in = new Map();
  #nextEdge = 0;
  #revision = 0;
  #edgeCount = 0;
  constructor(name = 'graph') {
    requireId(name);
    Object.defineProperty(this, 'name', { value: name, enumerable: true });
  }
  get size() { return this.#out.size; }
  get edgeCount() { return this.#edgeCount; }
  get revision() { return this.#revision; }
  hasNode(id) { return this.#out.has(id); }
  nodeIds() { return this.#out.keys(); }
  edge(from, to) { return this.#out.get(from)?.get(to); }
  outEdges(id) { return (this.#out.get(id) ?? new Map()).values(); }
  inEdges(id) { return (this.#in.get(id) ?? new Map()).values(); }
  *edges() {
    for (const edges of this.#out.values()) yield* edges.values();
  }
  #requireCapacity(revisions = 1, edgeIds = 0) {
    if (edgeIds > Number.MAX_SAFE_INTEGER - this.#nextEdge) throw new RangeError('graph edge counter exhausted');
    if (revisions > Number.MAX_SAFE_INTEGER - this.#revision) throw new RangeError('graph revision exhausted');
  }
  assertCapacity(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => !['revisions', 'edgeIds'].includes(key))) throw new TypeError('invalid graph capacity options');
    const revisions = Object.hasOwn(options, 'revisions') ? options.revisions : 1;
    const edgeIds = Object.hasOwn(options, 'edgeIds') ? options.edgeIds : 0;
    if ([revisions, edgeIds].some(value => !Number.isSafeInteger(value) || value < 0)) throw new RangeError('graph capacity counts must be non-negative safe integers');
    this.#requireCapacity(revisions, edgeIds);
  }
  addNode(id) {
    requireId(id);
    if (this.hasNode(id)) return false;
    this.#requireCapacity();
    this.#out.set(id, new Map());
    this.#in.set(id, new Map());
    this.#revision++;
    return true;
  }
  addEdge(from, to) {
    if (!this.hasNode(from) || !this.hasNode(to)) throw new Error('both edge endpoints must exist');
    if (from === to) throw new Error('self edges are not allowed');
    if (this.edge(from, to)) throw new Error('duplicate directed edge');
    this.#requireCapacity(1, 1);
    const edge = Object.freeze({ id: `edge:${this.#nextEdge++}`, from, to });
    this.#out.get(from).set(to, edge);
    this.#in.get(to).set(from, edge);
    this.#edgeCount++;
    this.#revision++;
    return edge;
  }
  removeEdge(from, to) {
    if (!this.edge(from, to)) return false;
    this.#requireCapacity();
    this.#out.get(from).delete(to);
    this.#in.get(to).delete(from);
    this.#edgeCount--;
    this.#revision++;
    return true;
  }
  removeNode(id) {
    if (!this.hasNode(id)) return false;
    const edges = [...this.outEdges(id), ...this.inEdges(id)];
    this.#requireCapacity(edges.length + 1);
    for (const edge of edges) this.removeEdge(edge.from, edge.to);
    this.#out.delete(id);
    this.#in.delete(id);
    this.#revision++;
    return true;
  }
  toJSON() {
    return { version: 1, name: this.name, revision: this.#revision, nextEdge: this.#nextEdge, nodes: [...this.nodeIds()], edges: [...this.edges()] };
  }
  clone() { return DirectedGraph.fromJSON(this.toJSON()); }
  static fromJSON(snapshot) {
    if (snapshot?.version !== 1 || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) throw new Error('invalid graph snapshot');
    const graph = new DirectedGraph(snapshot.name);
    for (const node of snapshot.nodes) {
      if (!graph.addNode(node)) throw new Error('duplicate snapshot node');
    }
    const ids = new Set();
    let minimumNext = 0;
    for (const edge of snapshot.edges) {
      if (!/^edge:\d+$/.test(edge.id) || ids.has(edge.id)) throw new Error('invalid or duplicate edge ID');
      const ordinal = Number(edge.id.slice(5));
      if (!Number.isSafeInteger(ordinal)) throw new Error('invalid edge ordinal');
      minimumNext = Math.max(minimumNext, ordinal + 1);
      graph.addEdge(edge.from, edge.to);
      const restored = Object.freeze({ id: edge.id, from: edge.from, to: edge.to });
      graph.#out.get(edge.from).set(edge.to, restored);
      graph.#in.get(edge.to).set(edge.from, restored);
      ids.add(edge.id);
    }
    if (!Number.isSafeInteger(snapshot.nextEdge) || snapshot.nextEdge < minimumNext || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < graph.#revision) throw new Error('invalid graph counters');
    graph.#nextEdge = snapshot.nextEdge;
    graph.#revision = snapshot.revision;
    return graph;
  }
}
