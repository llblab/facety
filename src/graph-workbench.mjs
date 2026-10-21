// Owns: Portable graph artifacts and structural/proof workflows; excludes protocol admission and ledger validity.
import { DirectedGraph } from './graph.mjs';
import { generateGraph, mutateGraph } from './generators.mjs';
import { graphMetrics } from './metrics.mjs';
import { findPathBfs, findPathBidirectional, verifyPath } from './proofs.mjs';

export const PATH_ALGORITHMS = Object.freeze({ bfs: findPathBfs, bidirectional: findPathBidirectional });

function record(value, allowed, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(name + ' must be an object');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error('unknown ' + name + ' field: ' + key);
}
function ids(values, label) {
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.length) || new Set(values).size !== values.length) throw new Error(label + ' must contain distinct non-empty strings');
  return [...values];
}
function snapshot(graph, rootRegistry, blockedNodes, provenance) {
  const roots = rootRegistry.filter(id => graph.hasNode(id));
  return {
    schema: 'facety-graph/v1', graph: graph.toJSON(), roots, rootRegistry: [...rootRegistry], blockedNodes: [...blockedNodes],
    metrics: graphMetrics(graph, roots, { blockedNodes }), provenance,
    interpretation: 'Reachability in a supplied graph/anchor policy, not unique personhood, cryptographic inclusion or a validated economic state.',
  };
}

export function createGraphArtifact(options = {}) {
  record(options, ['topology', 'size', 'rootCount', 'degree', 'communitySize', 'seed', 'maxEdges'], 'graph configuration');
  if (Object.hasOwn(options, 'seed') && !['string', 'number'].includes(typeof options.seed)) throw new Error('graph seed must be a string or number');
  if (typeof options.seed === 'number' && !Number.isFinite(options.seed)) throw new Error('graph seed must be finite');
  const generated = generateGraph(options);
  return snapshot(generated.graph, generated.roots, [], {
    kind: 'synthetic', topology: generated.topology, seed: generated.seed, parameters: generated.parameters,
    note: 'Synthetic generation bypasses funded Facety admission; use for graph algorithms, not economic attack-cost claims.',
  });
}

export function readGraphArtifact(artifact, { roots: overrideRoots } = {}) {
  let graph;
  let declaredRoots;
  let rootRegistry;
  let blockedNodes;
  let provenance;
  if (artifact?.schema === 'facety-graph/v1') {
    graph = DirectedGraph.fromJSON(artifact.graph);
    declaredRoots = ids(artifact.roots, 'artifact roots');
    rootRegistry = ids(artifact.rootRegistry ?? declaredRoots, 'root registry');
    blockedNodes = ids(artifact.blockedNodes ?? [], 'blocked nodes');
    if (declaredRoots.some(id => !rootRegistry.includes(id) || !graph.hasNode(id))) throw new Error('artifact roots must be present members of the root registry');
    provenance = artifact.provenance ?? null;
  } else if (artifact?.version === 1 && Array.isArray(artifact.nodes)) {
    if (overrideRoots === undefined) throw new Error('a bare graph requires an independently supplied roots array');
    graph = DirectedGraph.fromJSON(artifact);
    declaredRoots = [];
    rootRegistry = [];
    blockedNodes = [];
    provenance = { kind: 'bare-snapshot' };
  } else throw new Error('expected a facety-graph/v1 artifact or a bare DirectedGraph snapshot');
  if (overrideRoots !== undefined) rootRegistry = ids(overrideRoots, 'root override');
  const roots = overrideRoots === undefined ? declaredRoots : [...rootRegistry];
  if (roots.some(id => !graph.hasNode(id))) throw new Error('query roots must exist in the supplied graph');
  return { graph, roots, rootRegistry, blockedNodes, provenance, rootSource: overrideRoots === undefined ? 'artifact' : 'caller-override' };
}

export function extractGraphArtifact(experiment, layer) {
  if (!['guarantees', 'lineage'].includes(layer)) throw new Error('layer must be guarantees or lineage');
  if (experiment?.schema !== 'facety-experiment/v1' || !experiment.state) throw new Error('graph extraction requires a single experiment exported with includeState = true');
  const state = experiment.state;
  const graph = DirectedGraph.fromJSON(state[layer]);
  const registry = ids(state.roots, 'subject root registry');
  if (!Array.isArray(state.subjects)) throw new Error('subject records are required for identity exclusions');
  const subjects = new Map();
  for (const subject of state.subjects) {
    if (!subject || typeof subject.id !== 'string' || !['accepted', 'false'].includes(subject.identityStatus) || subjects.has(subject.id)) throw new Error('invalid or duplicate exported subject');
    subjects.set(subject.id, subject);
  }
  if ([...graph.nodeIds()].some(id => !subjects.has(id)) || registry.some(id => !graph.hasNode(id))) throw new Error('exported graph nodes/roots lack matching subject records');
  const blockedNodes = [...subjects.values()].filter(subject => subject.identityStatus === 'false').map(subject => subject.id);
  return snapshot(graph, registry, blockedNodes, {
    kind: 'protocol-snapshot', layer, seed: experiment.config?.seed ?? null, randomness: experiment.randomness ?? null,
    note: 'Extracted graph view only; this does not validate or restore the source economic simulation.',
  });
}

export function mutateGraphArtifact(artifact, options = {}) {
  record(options, ['kind', 'count', 'seed', 'protectedNodes', 'protectRoots', 'roots'], 'mutation');
  if (options.protectRoots !== undefined && typeof options.protectRoots !== 'boolean') throw new Error('protectRoots must be boolean');
  const context = readGraphArtifact(artifact, { roots: options.roots });
  const protectedNodes = ids(options.protectedNodes ?? [], 'protected nodes');
  const protectedSet = new Set([...protectedNodes, ...(options.protectRoots ? context.roots : [])]);
  const before = { name: context.graph.name, revision: context.graph.revision };
  const journal = mutateGraph(context.graph, {
    kind: options.kind, count: options.count, seed: options.seed, protectedNodes: [...protectedSet],
  });
  return snapshot(context.graph, context.rootRegistry, context.blockedNodes, {
    kind: 'structural-mutation', parentGraph: before, rootSource: context.rootSource, journal,
    note: 'Only a cloned graph changed. No guarantee-break fee, identity verdict or other protocol-economic transition was executed.',
  });
}

function queryContext(artifact, options) {
  const context = readGraphArtifact(artifact, { roots: options.roots });
  const additional = ids(options.blockedNodes ?? [], 'additional blocked nodes');
  const blockedNodes = [...new Set([...context.blockedNodes, ...additional])];
  if (typeof options.target !== 'string' || !options.target.length) throw new Error('an independent non-empty target is required');
  return { ...context, blockedNodes };
}

export function searchGraphArtifact(artifact, options) {
  record(options, ['algorithm', 'target', 'roots', 'blockedNodes', 'maxVisited'], 'path query');
  const algorithm = options.algorithm ?? 'bfs';
  if (!Object.hasOwn(PATH_ALGORITHMS, algorithm)) throw new Error('algorithm must be bfs or bidirectional');
  const context = queryContext(artifact, options);
  const maxVisited = options.maxVisited ?? Infinity;
  const request = { roots: context.roots, target: options.target, blockedNodes: context.blockedNodes, maxVisited };
  const found = PATH_ALGORITHMS[algorithm](context.graph, request);
  const verified = found.proof ? verifyPath(context.graph, found.proof, request) : null;
  if (verified === false) throw new Error('path finder returned a certificate rejected by the independent verifier');
  return {
    schema: 'facety-path-search/v1', algorithm,
    graph: { name: context.graph.name, revision: context.graph.revision },
    query: { ...request, maxVisited: maxVisited === Infinity ? null : maxVisited, rootSource: context.rootSource },
    ...found, verified,
  };
}

export function verifyGraphArtifact(artifact, proofDocument, options) {
  record(options, ['target', 'roots', 'blockedNodes', 'requireRevision'], 'verification query');
  if (options.requireRevision !== undefined && typeof options.requireRevision !== 'boolean') throw new Error('requireRevision must be boolean');
  const context = queryContext(artifact, options);
  const proof = proofDocument && Object.hasOwn(proofDocument, 'proof') ? proofDocument.proof : proofDocument;
  const request = { roots: context.roots, target: options.target, blockedNodes: context.blockedNodes, requireRevision: options.requireRevision ?? false };
  return {
    schema: 'facety-path-verification/v1',
    graph: { name: context.graph.name, revision: context.graph.revision },
    query: { ...request, rootSource: context.rootSource },
    valid: verifyPath(context.graph, proof, request),
    interpretation: 'The target, roots and exclusions came from the caller/canonical graph, never from the certificate query.',
  };
}
