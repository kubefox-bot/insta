import { expect, test } from "bun:test";
import { runtimeClose } from "../../../src/app/composition/runtime/lifetime";

test("concurrent runtime closes all await actual resource settlement", async () => {
  const resources = new AsyncDisposableStack();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  resources.defer(async () => {
    entered.resolve();
    await release.promise;
  });
  const close = runtimeClose(resources);
  const first = close();
  await entered.promise;
  const second = close();
  expect(second).toBe(first);
  release.resolve();
  await Promise.all([first, second]);
});

test("runtime cleanup requests both worker cancellations and retains clients until actual settlement", async () => {
  const { stopRuntimeWorkers } = await import(
    "../../../src/app/composition/runtime/stop-workers"
  );
  const resources = new AsyncDisposableStack();
  const cancelled = new Set<string>();
  const release = Promise.withResolvers<void>();
  const bothCancelled = Promise.withResolvers<void>();
  const released: string[] = [];
  resources.defer(() => {
    released.push("clients");
  });
  const stop = async (name: string) => {
    cancelled.add(name);
    if (cancelled.size === 2) bothCancelled.resolve();
    await release.promise;
  };
  resources.defer(() =>
    stopRuntimeWorkers({
      mail: () => stop("mail"),
      stories: () => stop("stories"),
    }),
  );
  const close = runtimeClose(resources);
  const closing = close();
  await bothCancelled.promise;
  try {
    expect(cancelled).toEqual(new Set(["mail", "stories"]));
    expect(released).toEqual([]);
    expect(close()).toBe(closing);
  } finally {
    release.resolve();
  }
  await closing;
  expect(released).toEqual(["clients"]);
});
