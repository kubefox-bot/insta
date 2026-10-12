import { expect, test } from "bun:test";
import type { Server } from "node:http";
import { createApplication } from "../../../src/app/bootstrap";
import { shutdownTimeoutMs } from "../../../src/app/lifecycle/conts";
import { createShutdown } from "../../../src/app/lifecycle/shutdown";

test("G04 shutdown stops HTTP admission and drains real in-flight handlers before closing owned dependencies once", async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const stopped = Promise.withResolvers<void>();
  const cleanupStarted = Promise.withResolvers<void>();
  const cleanupRelease = Promise.withResolvers<void>();
  let handlerSettled = false;
  let shutdownSettled = false;
  let closed = 0;
  let workersStopped = 0;
  const app = await createApplication({
    checkRequired: async () => true,
    check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
    close: async () => {
      expect(handlerSettled).toBe(true);
      cleanupStarted.resolve();
      await cleanupRelease.promise;
      closed++;
    },
    stopWorkers: async () => {
      workersStopped++;
      stopped.resolve();
    },
  });
  app
    .getHttpAdapter()
    .get(
      "/owned-pending",
      async (_request: unknown, response: { send: (body: string) => void }) => {
        started.resolve();
        await release.promise;
        response.send("settled");
        handlerSettled = true;
      },
    );
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  const pending = fetch(`${url}/owned-pending`).then((response) =>
    response.text(),
  );
  await started.promise;
  const httpServer: Server = app.getHttpServer();
  const shutdown = createShutdown({
    close: () => app.close(),
    forceClose: () => httpServer.closeAllConnections(),
    onFailure: () => {},
  });
  const before = performance.now();
  const closing = shutdown("SIGTERM").then(() => {
    shutdownSettled = true;
  });
  const repeated = shutdown("SIGINT");
  try {
    await stopped.promise;
    expect(closed).toBe(0);
    expect(workersStopped).toBe(1);
    await expect(fetch(`${url}/health/live`)).rejects.toThrow();
    release.resolve();
    expect(await pending).toBe("settled");
    await cleanupStarted.promise;
    expect(shutdownSettled).toBe(false);
    expect(closed).toBe(0);
  } finally {
    release.resolve();
    cleanupRelease.resolve();
    await Promise.all([pending, closing, repeated]);
  }
  expect(closed).toBe(1);
  expect(workersStopped).toBe(1);
  expect(shutdownSettled).toBe(true);
  expect(performance.now() - before).toBeLessThan(shutdownTimeoutMs);
});
