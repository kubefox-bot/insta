import { expect, test } from "bun:test";
import {
  createTracing,
  readContext,
  withContext,
} from "../../src/observability/server/index";

test("concurrent scopes restore nesting and read a real active OTel span", async () => {
  const tracing = createTracing({ readPermission: () => "allowed" });
  const barrier = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  let arrivals = 0;
  const records: ReturnType<typeof readContext>[] = [];
  try {
    await Promise.all(
      ids
        .map((requestId) =>
          withContext({
            context: { requestId },
            execute: () =>
              tracing.withSpan({
                name: "http",
                headers: {},
                execute: async () => {
                  arrivals++;
                  if (arrivals === ids.length) entered.resolve();
                  await barrier.promise;
                  records.push(readContext());
                  expect(readContext()?.requestId).toBe(requestId);
                  expect(readContext()?.traceId).toMatch(/^[0-9a-f]{32}$/);
                  await withContext({
                    context: { requestId: crypto.randomUUID() },
                    execute: async () =>
                      expect(readContext()?.requestId).not.toBe(requestId),
                  });
                  expect(readContext()?.requestId).toBe(requestId);
                },
              }),
          }),
        )
        .concat([entered.promise.then(() => barrier.resolve())]),
    );
    expect(records[0]?.traceId).not.toBe(records[1]?.traceId);
    expect(readContext()).toBeUndefined();
    expect(() =>
      withContext({
        context: { requestId: ids[0] },
        execute: () => {
          throw new Error("failure");
        },
      }),
    ).toThrow("failure");
    expect(readContext()).toBeUndefined();
  } finally {
    await tracing.close();
  }
});

test("default denied context does not adopt incoming trace; permission is current per attempt", async () => {
  const denied = createTracing();
  const headers = {
    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
  };
  try {
    await withContext({
      context: { requestId: crypto.randomUUID() },
      execute: () =>
        denied.withSpan({
          name: "http",
          headers,
          execute: () => {
            expect(readContext()?.traceId).toBeUndefined();
            expect(readContext()?.requestId).toBeDefined();
          },
        }),
    });
  } finally {
    await denied.close();
  }
  let permission: "allowed" | "denied" = "allowed";
  const tracing = createTracing({ readPermission: () => permission });
  try {
    await tracing.withSpan({
      name: "http",
      headers,
      execute: () => {
        expect(readContext()?.traceId).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        expect(readContext()?.spanId).not.toBe("bbbbbbbbbbbbbbbb");
      },
    });
    permission = "denied";
    await tracing.withSpan({
      name: "http",
      headers,
      execute: () => expect(readContext()).toBeUndefined(),
    });
  } finally {
    await tracing.close();
  }
});

test("abort restores scope and detached callbacks require explicit fresh ownership", async () => {
  const outer = crypto.randomUUID();
  const controller = new AbortController();
  const task = withContext({
    context: { requestId: outer },
    execute: async () => {
      await new Promise<void>((_resolve, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(controller.signal.reason),
          { once: true },
        ),
      );
    },
  });
  controller.abort(new Error("cancelled"));
  await expect(task).rejects.toThrow("cancelled");
  expect(readContext()).toBeUndefined();
  const attemptId = crypto.randomUUID();
  const callback = () =>
    withContext({
      context: { operationId: attemptId },
      execute: () => readContext(),
    });
  expect(callback()).toEqual({ operationId: attemptId });
  expect(readContext()).toBeUndefined();
});

test("technical context retains UUID spellings and sentinel IDs accepted by the wire contract", () => {
  for (const requestId of [
    crypto.randomUUID().toUpperCase(),
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  ]) {
    withContext({
      context: { requestId },
      execute: () => expect(readContext()?.requestId).toBe(requestId),
    });
  }
});
