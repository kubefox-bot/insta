import { expect, test } from "bun:test";
import { startRealtimeWorker } from "../../src/domains/conversations/server/index";

test("zero-claim realtime round performs owned maintenance before claims", async () => {
  const claimed = Promise.withResolvers<void>();
  const order: string[] = [];
  const worker = startRealtimeWorker({
    maintenance: async () => {
      order.push("maintenance");
    },
    outbox: {
      claim: async () => {
        order.push("claim");
        claimed.resolve();
        return null;
      },
      complete: async () => {
        throw new Error("No claim to complete");
      },
      fail: async () => {
        throw new Error("No claim to fail");
      },
    },
    publish: async () => {
      throw new Error("No publication");
    },
    onError: () => {
      throw new Error("Unexpected round failure");
    },
  });
  await claimed.promise;
  await worker.close();
  expect(order[0]).toBe("maintenance");
  expect(order.filter((value) => value === "maintenance")).toHaveLength(1);
});

import { dispatchRealtimeRound } from "../../src/domains/conversations/use-cases/delivery/dispatch-round";
import { createDeliveryMaintenance } from "../../src/domains/conversations/use-cases/delivery/maintenance";

for (const dispatchFails of [false, true])
  test(`maintenance failure still attempts dispatch and preserves failures (${dispatchFails})`, async () => {
    const maintenanceError = new Error("prune unavailable");
    const dispatchError = new Error("claim unavailable");
    let claims = 0;
    let publications = 0;
    let completions = 0;
    const result = await dispatchRealtimeRound({
      maintenance: async () => {
        throw maintenanceError;
      },
      outbox: {
        claim: async ({ sink, leaseId }) => {
          claims += 1;
          if (dispatchFails) throw dispatchError;
          if (claims !== 1) return null;
          return {
            sink,
            leaseId,
            attempts: 1,
            event: {
              eventId: "event",
              analyticsEventId: "analytics",
              kind: "message_sent",
              operation: "message.send",
              authority: "server_canonical",
              operationId: "operation",
              messageId: "message",
              conversationId: "conversation",
              actorId: "actor",
              sequence: 1,
              createdAt: 0,
            },
          };
        },
        complete: async () => {
          completions += 1;
          return true;
        },
        fail: async () => {
          throw new Error("Unexpected retry");
        },
      },
      publish: async () => {
        publications += 1;
      },
      clock: () => 1,
      uuid: () => "lease",
      signal: new AbortController().signal,
    }).catch((error: unknown) => error);
    expect(claims).toBeGreaterThan(0);
    if (dispatchFails) {
      expect(result).toBeInstanceOf(AggregateError);
      if (!(result instanceof AggregateError))
        throw new Error("Missing both failures");
      expect(result.errors).toEqual([maintenanceError, dispatchError]);
    } else {
      expect(result).toBe(maintenanceError);
      expect(publications).toBe(1);
      expect(completions).toBe(1);
    }
  });

test("maintenance cadence advances only on success and retries a failed turn", async () => {
  let nowMs = 1000;
  let prune = 0;
  let retain = 0;
  const maintain = createDeliveryMaintenance({
    clock: () => nowMs,
    journal: {
      prune: async () => {
        prune += 1;
        return { removed: 0 };
      },
    },
    streams: {
      retain: async () => {
        retain += 1;
        if (retain === 1) throw new Error("retention failed");
      },
    },
  });
  const input = { signal: new AbortController().signal };
  await expect(maintain(input)).rejects.toThrow("retention failed");
  await maintain(input);
  await maintain(input);
  expect([prune, retain]).toEqual([2, 2]);
  nowMs += 1000;
  await maintain(input);
  expect([prune, retain]).toEqual([3, 3]);
});

test("shutdown waits for pending maintenance settlement and prevents every new claim", async () => {
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  let settled = false;
  let errors = 0;
  let claims = 0;
  const worker = startRealtimeWorker({
    maintenance: async ({ signal }) => {
      signal.addEventListener("abort", () => aborted.resolve(), { once: true });
      started.resolve();
      await finish.promise;
      signal.throwIfAborted();
    },
    outbox: {
      claim: async () => {
        claims += 1;
        return null;
      },
      complete: async () => true,
      fail: async () => true,
    },
    publish: async () => {
      throw new Error("Unexpected publication");
    },
    onError: () => {
      errors += 1;
    },
  });
  await started.promise;
  const closing = worker.close().then(() => {
    settled = true;
  });
  await aborted.promise;
  expect(settled).toBe(false);
  expect(claims).toBe(0);
  finish.resolve();
  await closing;
  expect(claims).toBe(0);
  expect(errors).toBe(1);
});
