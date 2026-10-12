import { parentPort, workerData } from "node:worker_threads";

parentPort?.on("message", () => parentPort?.postMessage(workerData));
