#!/usr/bin/env node
// Owns: Command-line composition of the native APIs; stdout carries JSON only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runExperiment } from '../src/experiment.mjs';
import { runTrials, sweepParameter } from '../src/trials.mjs';
import { runLandscape, runLandscapeParallel, diagnoseLandscape } from '../src/discovery.mjs';
import { compareExperiments, analyzePairs } from '../src/controls.mjs';
import { registerHypothesis, confirmHypothesis, analyzeConfirmation, verifyRegistration, adjustStudy } from '../src/evidence.mjs';
import { runGame, runGameGrid, analyzeGame, sweepValuation, assessViability } from '../src/games.mjs';
import { createGraphArtifact, extractGraphArtifact, mutateGraphArtifact, searchGraphArtifact, verifyGraphArtifact, benchmarkGraphArtifact } from '../src/graph-workbench.mjs';

const USAGE = `Usage: facety <command> [input.json ...] [--out file] [--force] [--workers n|auto]

Simulation (input files hold the documented native API arguments):
  run <experiment.json>                 One seeded run.
  trials <{experiment, trials}.json>    Replicas; trials = { trials, seed }.
  sweep <{experiment, sweep}.json>      One-parameter sweep.
  landscape <{experiment, landscape}.json>   Exploratory grid with diagnostics (--workers).
  reanalyze-landscape <result.json> [settings.json]
  compare <{experiment, comparison}.json>    Paired control/treatment runs.
  reanalyze-pairs <result.json> [settings.json]

Evidence (preregistered confirmation on reserved seeds):
  register <hypothesis.json>            Normalize, validate and digest a design.
  confirm <registration.json>           Run the registered design (--workers).
  reanalyze-confirmation <registration.json> <confirmation.json>
  study <confirmation.json ...>         Holm adjustment across hypotheses.

Strategy games (payoff facts from simulation, utilities from explicit valuations):
  game <game.json>                      Run all strategy profiles and deviations (--workers).
  game-analyze <result.json> <valuation.json>   Equilibria and incentives, no reruns.
  game-sweep <result.json> <sweep.json> Vary one valuation weight: { valuation, role, kind, key, values }.
  game-grid <game.json> <axes.json>     Rerun the game over simulation-parameter axes; deterrence per cell (--workers).
  grid-viability <grid.json> [criteria.json]   Re-assess grid cells under declared viability criteria.

Graphs (synthetic or extracted views; never protocol admission):
  graph-create <options.json>
  graph-extract <experiment-with-state.json> guarantees|lineage
  graph-mutate <artifact.json> <mutation.json>
  graph-search <artifact.json> <query.json>
  graph-verify <artifact.json> <proof.json> <query.json>
  graph-benchmark <artifact.json> <{queries, iterations?, warmup?, measureTime?}.json>

Output goes to stdout unless --out is given; existing files are refused without --force.`;

function read(path) {
  if (!path) throw new Error('missing input file\n\n' + USAGE);
  return JSON.parse(readFileSync(path, 'utf8'));
}
function workers(value) {
  if (value === undefined) return 0;
  if (value === 'auto') return value;
  const count = Number(value);
  if (!Number.isSafeInteger(count)) throw new Error('--workers must be an integer or auto');
  return count;
}

const COMMANDS = {
  run: ([file]) => runExperiment(read(file)),
  trials: ([file]) => { const input = read(file); return runTrials(input.experiment, input.trials ?? {}); },
  sweep: ([file]) => { const input = read(file); return sweepParameter(input.experiment, input.sweep); },
  landscape: ([file], options) => {
    const input = read(file);
    return options.workers === undefined ? runLandscape(input.experiment, input.landscape) : runLandscapeParallel(input.experiment, { ...input.landscape, workers: workers(options.workers) });
  },
  'reanalyze-landscape': ([file, settings]) => {
    const result = read(file);
    return diagnoseLandscape(result.cells, result.axes, settings ? read(settings) : result.diagnostics.settings);
  },
  compare: ([file]) => { const input = read(file); return compareExperiments(input.experiment, input.comparison); },
  'reanalyze-pairs': ([file, settings]) => {
    const result = read(file);
    return analyzePairs(result.pairs, settings ? read(settings) : result.analysis.settings);
  },
  register: ([file]) => registerHypothesis(read(file)),
  confirm: ([file], options) => confirmHypothesis(read(file), { workers: workers(options.workers), allowImplementationChange: options['allow-implementation-change'] }),
  'reanalyze-confirmation': ([registrationFile, confirmationFile]) => {
    const registration = read(registrationFile);
    verifyRegistration(registration, { allowImplementationChange: true });
    const confirmation = read(confirmationFile);
    if (confirmation.registrationHash !== registration.hash) throw new Error('confirmation does not belong to this registration');
    return analyzeConfirmation(registration, confirmation.values);
  },
  study: files => adjustStudy(files.map(read)),
  game: ([file], options) => runGame(read(file), { workers: workers(options.workers) }),
  'game-analyze': ([result, valuation]) => analyzeGame(read(result), read(valuation)),
  'game-grid': ([file, axes], options) => runGameGrid(read(file), { axes: read(axes), workers: workers(options.workers) }),
  'grid-viability': ([file, criteria]) => {
    const grid = read(file);
    return grid.cells.map(cell => ({ coordinates: cell.coordinates, verdict: cell.deterrence.verdict, ...assessViability(cell.deterrence, criteria ? read(criteria) : {}) }));
  },
  'game-sweep': ([result, file]) => {
    const { valuation, ...sweep } = read(file);
    return sweepValuation(read(result), valuation, sweep);
  },
  'graph-create': ([file]) => createGraphArtifact(read(file)),
  'graph-extract': ([file, layer]) => extractGraphArtifact(read(file), layer),
  'graph-mutate': ([artifact, mutation]) => mutateGraphArtifact(read(artifact), read(mutation)),
  'graph-search': ([artifact, query]) => searchGraphArtifact(read(artifact), read(query)),
  'graph-verify': ([artifact, proof, query]) => verifyGraphArtifact(read(artifact), read(proof), read(query)),
  'graph-benchmark': ([artifact, options]) => benchmarkGraphArtifact(read(artifact), read(options)),
};

async function main(argv) {
  const { values: options, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      out: { type: 'string' }, force: { type: 'boolean', default: false }, workers: { type: 'string' },
      'allow-implementation-change': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
    },
  });
  const [command, ...args] = positionals;
  if (options.help || !command) {
    process.stderr.write(USAGE + '\n');
    return options.help ? 0 : 2;
  }
  if (!Object.hasOwn(COMMANDS, command)) throw new Error('unknown command: ' + command + '\n\n' + USAGE);
  if (options.out && existsSync(options.out) && !options.force) throw new Error('refusing to overwrite existing output: ' + options.out);
  const result = await COMMANDS[command](args, options);
  const json = JSON.stringify(result, null, 2) + '\n';
  if (options.out) writeFileSync(options.out, json, { flag: options.force ? 'w' : 'wx' });
  else process.stdout.write(json);
  return 0;
}

main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
  process.stderr.write('facety: ' + error.message + '\n');
  process.exitCode = 1;
});
