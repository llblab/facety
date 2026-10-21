// Owns: Order-preserving execution of independent pure tasks, optionally on worker threads; excludes task semantics.
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

const WORKER = new URL('./task-worker.mjs', import.meta.url);

export function workerCount(requested, tasks) {
  if (requested === 'auto') requested = Math.max(1, availableParallelism() - 1);
  if (!Number.isSafeInteger(requested) || requested < 0 || requested > 256) throw new RangeError('workers must be "auto" or an integer in [0, 256]');
  return Math.min(requested, tasks);
}

// Runs `exportName` from `module` on every task. Results keep task order, so a parallel
// run returns exactly what the sequential run returns for deterministic tasks.
export async function mapTasks(tasks, { workers = 0, module, exportName }) {
  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
  const count = workerCount(workers, tasks.length);
  if (count <= 1) {
    const run = (await import(module))[exportName];
    if (typeof run !== 'function') throw new TypeError('task export must be a function');
    return tasks.map(task => run(task));
  }
  const results = new Array(tasks.length);
  const pool = Array.from({ length: count }, () => new Worker(WORKER, { workerData: { module, exportName } }));
  let next = 0;
  let done = 0;
  try {
    await new Promise((resolve, reject) => {
      const dispatch = worker => {
        if (next < tasks.length) {
          const index = next++;
          worker.postMessage({ index, task: tasks[index] });
        }
      };
      for (const worker of pool) {
        worker.on('message', ({ index, result, error }) => {
          if (error) return reject(Object.assign(new Error(error.message), { stack: error.stack }));
          results[index] = result;
          if (++done === tasks.length) return resolve();
          dispatch(worker);
        });
        worker.on('error', reject);
        worker.on('exit', code => { if (code !== 0 && done < tasks.length) reject(new Error('task worker exited with code ' + code)); });
        dispatch(worker);
      }
      if (!tasks.length) resolve();
    });
  } finally {
    await Promise.all(pool.map(worker => worker.terminate()));
  }
  return results;
}
