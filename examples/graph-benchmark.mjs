// Owns: A reproducible directed-path benchmark example, not protocol growth or D36 support.
import { createGraphArtifact, benchmarkGraphArtifact } from '../src/graph-workbench.mjs';

const artifact = createGraphArtifact({
  topology: 'preferential', size: 120, rootCount: 2, degree: 3, seed: 'graph-benchmark-example',
});
const result = benchmarkGraphArtifact(artifact, {
  iterations: 3, warmup: 1,
  queries: [
    { target: 'n119' },
    { target: 'n0' },
    { target: 'n0', roots: ['n119'] },
    { target: 'n119', blockedNodes: ['n119'] },
    { target: 'n119', maxVisited: 1 },
  ],
});
console.log(JSON.stringify(result, null, 2));
