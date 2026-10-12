import { expect, test } from "bun:test";

test("shutdown reports its expired budget as failure and keeps actual cleanup owned until it settles", async () => {
  const module = await import(
    "../../apps/be-insta/src/app/lifecycle/shutdown"
  ).catch(() => undefined);
  expect(module).toBeDefined();
  if (!module) return;
  const cleanup = Promise.withResolvers<void>();
  const expired = Promise.withResolvers<void>();
  let forced = 0;
  let settled = false;
  const shutdown = module.createShutdown({
    close: () => cleanup.promise,
    forceClose: () => {
      forced++;
    },
    onFailure: () => expired.resolve(),
    timeoutMs: 20,
  });
  const first = shutdown("SIGTERM").then(() => {
    settled = true;
  });
  const second = shutdown("SIGINT");
  await expired.promise;
  expect(forced).toBe(1);
  expect(settled).toBe(false);
  cleanup.resolve();
  await expect(first).rejects.toThrow("Shutdown deadline exceeded");
  await expect(second).rejects.toThrow("Shutdown deadline exceeded");
});
