// Owns: Portable graph artifacts and structural/proof workflows; excludes protocol admission and ledger validity.
import { performance } from 'node:perf_hooks';
import { DirectedGraph } from './graph.mjs';
import { generateGraph, mutateGraph } from './generators.mjs';
import { graphMetrics } from './metrics.mjs';
import { findPathBfs, findPathBidirectional, verifyPath } from './proofs.mjs';
import { digestOf, provenance } from './provenance.mjs';

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

function checkedBenchmarkResult(graph, request, result, reference) {
  if (!['found', 'unreachable', 'budget-exceeded'].includes(result.status)) throw new Error('invalid benchmark search status');
  if (result.status === 'found') {
    if (!verifyPath(graph, result.proof, { ...request, requireRevision: true })) throw new Error('benchmark certificate rejected by independent verifier');
    if (reference.status !== 'found' || result.proof.edgeIds.length !== reference.proof.edgeIds.length) throw new Error('benchmark shortest path disagrees with unbounded BFS reference');
  } else {
    if (result.proof !== null) throw new Error('non-found benchmark result contains a proof');
    if (result.status === 'unreachable' && reference.status !== 'unreachable') throw new Error('benchmark reachability disagrees with unbounded BFS reference');
  }
  return result;
}

export function benchmarkGraphArtifact(artifact, options = {}) {
  record(options, ['queries', 'roots', 'iterations', 'warmup', 'measureTime'], 'benchmark');
  const { queries, roots, iterations = 5, warmup = 1, measureTime = false } = options;
  if (!Array.isArray(queries) || !queries.length) throw new Error('benchmark queries must be a non-empty array');
  if (!Number.isSafeInteger(iterations) || iterations < 1) throw new RangeError('iterations must be a positive safe integer');
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new RangeError('warmup must be a non-negative safe integer');
  if (typeof measureTime !== 'boolean') throw new TypeError('measureTime must be boolean');
  if (queries.length * (1 + 2 * (1 + warmup + iterations)) > 1_000_000) throw new RangeError('benchmark exceeds one million search executions');
  const base = readGraphArtifact(artifact, { roots });
  const graphSnapshot = base.graph.toJSON();
  const snapshotDigest = digestOf(graphSnapshot);
  const names = Object.keys(PATH_ALGORITHMS);
  const prepared = Array.from(queries, query => {
    record(query, ['target', 'roots', 'blockedNodes', 'maxVisited'], 'benchmark query');
    const context = queryContext(artifact, { ...query, roots: query.roots === undefined ? roots : query.roots });
    if (!context.graph.hasNode(query.target)) throw new Error('benchmark target must exist in the supplied graph');
    const maxVisited = query.maxVisited === undefined ? Infinity : query.maxVisited;
    if (maxVisited !== Infinity && (!Number.isSafeInteger(maxVisited) || maxVisited < 1)) throw new RangeError('maxVisited must be positive');
    const request = Object.freeze({ roots: Object.freeze(context.roots), target: query.target,
      blockedNodes: Object.freeze(context.blockedNodes), maxVisited });
    const reference = findPathBfs(context.graph, { ...request, maxVisited: Infinity });
    checkedBenchmarkResult(context.graph, request, reference, reference);
    const results = Object.fromEntries(names.map(name => [name,
      checkedBenchmarkResult(context.graph, request, PATH_ALGORITHMS[name](context.graph, request), reference)]));
    return { context, request, reference, results };
  });
  // Every query is reference/certificate-checked before any warmup or timing begins.
  const cases = prepared.map(({ context, request, reference, results }, queryIndex) => {
    const samples = Object.fromEntries(names.map(name => [name, []]));
    for (let round = -warmup; round < iterations; round++) {
      const order = (round + warmup + queryIndex) % 2 ? [...names].reverse() : names;
      for (const [position, name] of order.entries()) {
        const started = measureTime && round >= 0 ? performance.now() : null;
        const result = PATH_ALGORITHMS[name](context.graph, request);
        const elapsedMs = started === null ? null : performance.now() - started;
        checkedBenchmarkResult(context.graph, request, result, reference);
        if (digestOf(result) !== digestOf(results[name])) throw new Error('benchmark search changed across repeated identical queries');
        if (round >= 0) samples[name].push({ iteration: round, position, elapsedMs, ...result.stats });
      }
    }
    if (digestOf(context.graph.toJSON()) !== snapshotDigest) throw new Error('benchmark mutated its graph snapshot');
    return {
      query: { ...request, roots: [...request.roots], blockedNodes: [...request.blockedNodes],
        maxVisited: request.maxVisited === Infinity ? null : request.maxVisited, rootSource: context.rootSource },
      reference: { status: reference.status, pathLength: reference.proof?.edgeIds.length ?? null },
      performanceComparable: names.every(name => results[name].status !== 'budget-exceeded'),
      algorithms: Object.fromEntries(names.map(name => {
        const result = results[name];
        const rows = samples[name];
        return [name, { status: result.status, proof: result.proof, verified: result.proof ? true : null,
          pathLength: result.proof?.edgeIds.length ?? null, samples: rows,
          totals: { visited: rows.reduce((sum, row) => sum + row.visited, 0),
            edgeChecks: rows.reduce((sum, row) => sum + row.edgeChecks, 0),
            elapsedMs: measureTime ? rows.reduce((sum, row) => sum + row.elapsedMs, 0) : null } }];
      })),
    };
  });
  return {
    schema: 'facety-graph-benchmark/v1', provenance: provenance(),
    input: { graph: graphSnapshot, roots: base.roots, blockedNodes: base.blockedNodes, snapshotDigest,
      source: base.provenance },
    settings: { iterations, warmup, measureTime, searchExecutions: queries.length * (1 + 2 * (1 + warmup + iterations)) },
    cases,
    interpretation: 'Directed reachability only, not D36 disjoint support or identity/admission. Generation, restore, reference checks, verification and warmup are outside timing. Bidirectional visited counts include both search trees. Budget exhaustion is unknown, not unreachable or performance-equivalent. Timings are local noisy samples, not universal speedups.',
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
