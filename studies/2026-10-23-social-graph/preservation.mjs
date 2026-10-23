// Owns: Public-graph extraction controls against an archived reference, not Sybil-resistance evidence.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as current from '../../src/experiment.mjs';
import { graphNeighborhood, propagatedTrust } from '../../src/social-graph.mjs';
import { DirectedGraph } from '../../src/graph.mjs';
import { provenance, digestOf } from '../../src/provenance.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const previous = '72bc817';
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const listed = directory => git('ls-tree', '-r', '--name-only', previous, '--', directory).toString().trim().split('\n').filter(Boolean);
const sourceFiles = listed('src').filter(path => path.endsWith('.mjs'));
const actualFiles = readdirSync(join(root, 'src')).filter(path => path.endsWith('.mjs')).map(path => 'src/' + path).sort();
assert.deepEqual(actualFiles.filter(path => !sourceFiles.includes(path)), ['src/social-graph.mjs']);
const changed = sourceFiles.filter(path => hash(readFileSync(join(root, path))) !== hash(git('show', previous + ':' + path)));
assert.deepEqual(changed, ['src/experiment.mjs']);
const oldSource = git('show', previous + ':src/experiment.mjs').toString();
const newSource = readFileSync(join(root, 'src/experiment.mjs'), 'utf8');
const graphSource = readFileSync(join(root, 'src/social-graph.mjs'), 'utf8');
const trust = oldSource.slice(oldSource.indexOf('// SybilRank-style trust:'), oldSource.indexOf('function respondToObservation'));
const neighborhood = oldSource.slice(oldSource.indexOf('  // Undirected social neighborhood'), oldSource.indexOf('  const modelAblations'));
const wrapper = "  // Keep the caller's guarantee-before-lineage graph order explicit.\n  function neighborhood(id, hops) {\n    return graphNeighborhood([model.guarantees, model.lineage], id, hops);\n  }\n";
assert.equal(newSource, oldSource.replace("import { reachableNodes } from './proofs.mjs';", "import { reachableNodes } from './proofs.mjs';\nimport { propagatedTrust, graphNeighborhood } from './social-graph.mjs';")
  .replace(trust, '').replace(neighborhood, wrapper));
assert(graphSource.includes(trust.replace('function propagatedTrust', 'export function propagatedTrust').trimEnd()));
const expectedNeighborhood = neighborhood.replace('  // Undirected social neighborhood over guarantees and invitation lineage.\n', '')
  .split('\n').map(line => line.startsWith('  ') ? line.slice(2) : line).join('\n')
  .replace('function neighborhood(id, hops)', 'export function graphNeighborhood(graphs, id, hops)')
  .replace('[model.guarantees, model.lineage]', 'graphs').trimEnd();
assert(graphSource.endsWith(expectedNeighborhood + '\n'));
assert.equal(/^import\b/m.test(graphSource), false, 'graph owner has no runtime dependencies');

async function instrument(url, source, extra = '') {
  const marker = '    observations, rejections, money, agents, system,';
  assert.equal(source.split(marker).length, 2);
  const code = (source.replace(marker, marker + '\n    protocolEventsForControl: model.events(),') + extra)
    .replace(/from '(\.\/[^']+)'/g, (_, relative) => 'from ' + JSON.stringify(new URL(relative, url).href));
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const strip = ({ provenance: ignored, ...run }) => run;
const temporary = mkdtempSync(join(tmpdir(), 'facety-social-graph-'));
try {
  execFileSync('tar', ['-x', '-C', temporary], { input: git('archive', previous, 'src') });
  const oldUrl = pathToFileURL(join(temporary, 'src/experiment.mjs'));
  const oldFacade = await import(oldUrl);
  assert.deepEqual(Object.keys(current).sort(), Object.keys(oldFacade).sort());
  const before = await instrument(oldUrl, oldSource, '\nexport { propagatedTrust };\nexport function legacyNeighborhood(guarantees, lineage, id, hops) {\n  const model = { guarantees, lineage };\n' + neighborhood + '\n  return neighborhood(id, hops);\n}\n');
  const after = await instrument(pathToFileURL(join(root, 'src/experiment.mjs')), newSource);
  const nodes = ['0', '1', '2'];
  const possible = nodes.flatMap(from => nodes.filter(to => to !== from).map(to => [from, to]));
  const graphs = Array.from({ length: 2 ** possible.length }, (_, mask) => {
    const graph = new DirectedGraph('literal-reference-control');
    nodes.forEach(id => graph.addNode(id));
    possible.forEach(([from, to], bit) => { if (mask & (1 << bit)) graph.addEdge(from, to); });
    return graph;
  });
  let neighborhoodChecks = 0;
  for (const guarantees of graphs) for (const lineage of graphs) for (const id of [...nodes, 'missing']) for (const hops of [0, 1, 2, 3]) {
    assert.deepEqual([...graphNeighborhood([guarantees, lineage], id, hops)], [...before.legacyNeighborhood(guarantees, lineage, id, hops)]);
    neighborhoodChecks++;
  }
  let trustChecks = 0;
  for (const graph of graphs) for (const seeds of [[], ['0'], ['missing'], ['0', '1'], ['0', '0']]) {
    assert.deepEqual([...propagatedTrust(graph, seeds)], [...before.propagatedTrust(graph, seeds)]);
    trustChecks++;
  }
  const prior = JSON.parse(readFileSync(new URL('../2026-10-23-experiment-config/preservation.json', import.meta.url), 'utf8'));
  const contexts = [...prior.runs.map(row => row.config), { ...prior.runs[0].config, seed: 'social-graph-preservation:screening',
    social: { screening: true, screeningShare: 1, screeningQuantile: 0.3, scope: 'acquaintances', hops: 2,
      strangerRate: 0.1, verification: true, investigation: true, gossipHops: 2, gossipShare: 1, attentionFeedback: true } }];
  const runs = contexts.map((config, index) => {
    const original = before.runExperiment(config);
    const result = after.runExperiment(config);
    assert.deepEqual(strip(result), strip(original));
    assert.equal(JSON.stringify(strip(result)), JSON.stringify(strip(original)));
    if (index < prior.runs.length) assert.equal(digestOf(strip(original)), prior.runs[index].digest);
    return { config, digest: digestOf(strip(result)), events: result.protocolEventsForControl.length,
      cases: result.disputes.cases.length, trust: result.system.trust, censored: result.outcome.censored };
  });
  const historical = listed('studies');
  for (const path of historical) assert.equal(hash(readFileSync(join(root, path))), hash(git('show', previous + ':' + path)), path);
  const oldProvenance = await import(pathToFileURL(join(temporary, 'src/provenance.mjs')));
  console.log(JSON.stringify({
    baseline: previous, level: 'diagnostic', before: oldProvenance.provenance(), after: provenance(), randomness: current.RANDOMNESS_POLICY,
    sourceProof: { added: ['src/social-graph.mjs'], changed, unchangedExistingSourceModules: sourceFiles.length - 1,
      exactImportRemovalWrapperTransformation: true, literalHelperBodiesPreserved: true, graphOwnerImports: 0,
      experimentLinesBefore: oldSource.split('\n').length - 1, experimentLinesAfter: newSource.split('\n').length - 1 },
    directControls: { directedGraphs: graphs.length, orderedGraphPairs: graphs.length ** 2, neighborhoodChecks, trustChecks,
      note: 'Finite standalone graph inputs, including empty support, isolated nodes and duplicate supplied seeds; not verified people.' },
    exportedNames: Object.keys(current).sort(), runs, historicalFilesUnchanged: historical.length,
    serializedBytesIdenticalExceptProvenance: true,
    method: 'Literal archived helper reference and full trajectory/event comparison; no economic graph mutation, new random keys, timing claim or historical confirmation replay.',
  }, null, 2));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
