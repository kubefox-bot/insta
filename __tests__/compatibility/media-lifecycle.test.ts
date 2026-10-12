import { expect, spyOn, test } from "bun:test";
import { Worker } from "node:worker_threads";
import { Result } from "@bloodyowl/boxed";
import { StoryErrorCode } from "@insta/contracts/errors";
import { verifyDecoding } from "../../apps/be-insta/src/domains/stories/adapters/media/decode";
import { inspectPackets } from "../../apps/be-insta/src/domains/stories/adapters/media/inspect-packets";
import { createInspectionPool } from "../../apps/be-insta/src/domains/stories/adapters/media/pool";

const input = () => ({
  source: new Blob([]).stream(),
  maxBytes: 20971520,
  maxDurationMs: 15000,
  deadline: Date.now() + 10000,
});
const until = async (condition: () => boolean) => {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) throw Error("Lifecycle barrier timeout");
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
};

test("busy worker termination retains both slots and close waits for actual exit settlement", async () => {
  const release = Promise.withResolvers<void>();
  const abort = new AbortController();
  const workers: {
    worker: Worker;
    barrier: Int32Array;
    exited: Promise<void>;
  }[] = [];
  const pool = createInspectionPool({
    inspectSource: ({ signal }) =>
      inspectPackets({
        maxDurationMs: 15000,
        bytes: new Uint8Array(),
        signal: AbortSignal.any([signal, abort.signal]),
        createWorker: () => {
          const shared = new SharedArrayBuffer(4);
          const worker = new Worker(
            new URL("../fixtures/media/busy-worker.ts", import.meta.url),
            { workerData: shared },
          );
          const exited = new Promise<void>((resolve) =>
            worker.once("exit", () => resolve()),
          );
          const terminate = worker.terminate.bind(worker);
          spyOn(worker, "terminate").mockImplementation(async () => {
            const result = await terminate();
            await release.promise;
            return result;
          });
          workers.push({ worker, barrier: new Int32Array(shared), exited });
          return worker;
        },
      }),
  });
  const first = pool.inspect(input());
  const second = pool.inspect(input());
  try {
    await until(
      () =>
        workers.length === 2 &&
        workers.every(({ barrier }) => Atomics.load(barrier, 0) === 1),
    );
    abort.abort();
    await Promise.all(workers.map(({ exited }) => exited));
    expect((await pool.inspect(input())).toJSON()).toMatchObject({
      tag: "Error",
      error: "BUSY",
    });
    let closed = false;
    const close = pool.close().then(() => {
      closed = true;
    });
    expect(closed).toBe(false);
    expect((await pool.inspect(input())).toJSON()).toMatchObject({
      tag: "Error",
      error: "INSPECTOR_UNAVAILABLE",
    });
    release.resolve();
    await close;
    expect((await first).toJSON()).toMatchObject({
      tag: "Error",
      error: "DEADLINE",
    });
    expect((await second).toJSON()).toMatchObject({
      tag: "Error",
      error: "DEADLINE",
    });
    expect(closed).toBe(true);
  } finally {
    release.resolve();
    await pool.close();
  }
});

test("active decoder children hold capacity after kill until exited settles; close waits", async () => {
  const release = Promise.withResolvers<void>();
  const children: {
    child: ReturnType<typeof Bun.spawn>;
    ready: Promise<void>;
  }[] = [];
  const pool = createInspectionPool({
    inspectSource: async ({ signal }) => {
      await verifyDecoding({
        bytes: new Uint8Array(),
        signal,
        launch: () => {
          const ready = Promise.withResolvers<void>();
          const child = Bun.spawn(
            [
              process.execPath,
              "-e",
              "process.send('ready');setInterval(()=>{},1000)",
            ],
            {
              stdout: "pipe",
              stderr: "pipe",
              ipc: (message) => {
                if (message === "ready") ready.resolve();
              },
            },
          );
          children.push({ child, ready: ready.promise });
          return {
            stdout: child.stdout,
            stderr: child.stderr,
            kill: (value) => child.kill(value),
            get exitCode() {
              return child.exitCode;
            },
            exited: child.exited.then(async (code) => {
              await release.promise;
              return code;
            }),
          };
        },
      });
      return Result.Error(StoryErrorCode.Deadline);
    },
  });
  const first = pool.inspect(input());
  const second = pool.inspect(input());
  try {
    await Promise.all(children.map(({ ready }) => ready));
    expect(children).toHaveLength(2);
    for (const { child } of children) expect(child.exitCode).toBeNull();
    let closed = false;
    const close = pool.close().then(() => {
      closed = true;
    });
    await Promise.all(children.map(({ child }) => child.exited));
    for (const { child } of children) expect(child.signalCode).toBe("SIGKILL");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(closed).toBe(false);
    release.resolve();
    await close;
    expect((await first).isError()).toBe(true);
    expect((await second).isError()).toBe(true);
  } finally {
    release.resolve();
    for (const { child } of children)
      if (child.exitCode === null) child.kill("SIGKILL");
    await pool.close();
  }
});
