// Owns: Worker-thread adapter for parallel.mjs; executes one named pure export per message.
import { parentPort, workerData } from 'node:worker_threads';

const run = (await import(workerData.module))[workerData.exportName];
parentPort.on('message', ({ index, task }) => {
  try {
    parentPort.postMessage({ index, result: run(task) });
  } catch (error) {
    parentPort.postMessage({ index, error: { message: error.message, stack: error.stack } });
  }
});
