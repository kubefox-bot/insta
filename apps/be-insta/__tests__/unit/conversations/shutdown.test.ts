import { expect, test } from "bun:test";
import { startRealtimeWorker } from "../../../src/domains/conversations/server/index";

test("shutdown aborts the owned outbox wave, waits for sink cleanup and preserves unknown work without acquiring another wave", async () => {
  const started = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  const cleanup = Promise.withResolvers<void>();
  let claims = 0;
  let completed = 0;
  let retried = 0;
  let returned = false;
  const worker = startRealtimeWorker({
    maintenance: async () => {},
    outbox: {
      claim: async ({ sink, leaseId }) => {
        claims++;
        return {
          sink,
          leaseId,
          attempts: 1,
          event: {
            eventId: `event-${claims}`,
            analyticsEventId: `analytics-${claims}`,
            kind: "message_sent",
            operation: "message.send",
            authority: "server_canonical",
            operationId: "operation",
            messageId: `message-${claims}`,
            conversationId: "conversation",
            actorId: "actor",
            sequence: claims,
            createdAt: 0,
          },
        };
      },
      complete: async () => {
        completed++;
        return true;
      },
      fail: async () => {
        retried++;
        return true;
      },
    },
    publish: async ({ signal }) => {
      signal.addEventListener("abort", () => aborted.resolve(), { once: true });
      started.resolve();
      await cleanup.promise;
    },
    onError: () => {
      throw new Error("Unexpected dispatcher failure");
    },
  });
  await started.promise;
  const closing = worker.close().then(() => {
    returned = true;
  });
  const watchdog = setTimeout(
    () => aborted.reject(new Error("Shutdown did not abort publication")),
    100,
  );
  try {
    await aborted.promise;
    expect(returned).toBe(false);
    expect(claims).toBe(4);
    expect(completed).toBe(0);
  } finally {
    cleanup.resolve();
    clearTimeout(watchdog);
    await closing;
  }
  expect(claims).toBe(4);
  expect(retried).toBe(4);
  expect(completed).toBe(0);
  await worker.close();
});
