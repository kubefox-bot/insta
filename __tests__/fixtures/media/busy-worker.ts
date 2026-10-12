import { parentPort, workerData } from "node:worker_threads";

const barrier = new Int32Array(workerData);
parentPort?.on("message", () => {
  Atomics.store(barrier, 0, 1);
  Atomics.notify(barrier, 0);
  while (Atomics.load(barrier, 0) === 1) Atomics.wait(barrier, 0, 1);
});
