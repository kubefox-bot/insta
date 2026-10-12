import { expect, test } from "bun:test";
import type { CanonicalMessage } from "../../../src/domains/conversations/business/types";
import { dispatchMessageOutbox } from "../../../src/domains/conversations/index";
import type { MessageOutbox } from "../../../src/domains/conversations/ports/outbox";

const event = (index: number): CanonicalMessage => ({
  eventId: `event-${index}`,
  analyticsEventId: `analytics-${index}`,
  kind: "message_sent",
  operation: "message.send",
  authority: "server_canonical",
  operationId: "external-correlation",
  messageId: `message-${index}`,
  conversationId: "conversation",
  actorId: "actor",
  sequence: index + 1,
  createdAt: 0,
});
test("outbox wave limits acquired/published effects to twenty with at most four concurrent sinks", async () => {
  const pending = Array.from({ length: 40 }, (_, index) => event(index));
  const delivered = new Set<string>();
  let active = 0;
  let maximum = 0;
  const outbox: MessageOutbox = {
    claim: async ({ sink, leaseId }) => {
      const next = pending.shift();
      return next ? { event: next, sink, leaseId, attempts: 1 } : null;
    },
    complete: async ({ event }) => {
      delivered.add(event.eventId);
      return true;
    },
    fail: async () => {
      throw new Error("Unexpected failure");
    },
  };
  await dispatchMessageOutbox({
    outbox,
    sinks: {
      realtime: async () => {
        active++;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active--;
      },
    },
    clock: () => 0,
    uuid: () => crypto.randomUUID(),
  });
  expect(delivered.size).toBe(20);
  expect(pending).toHaveLength(20);
  expect(maximum).toBe(4);
  expect(active).toBe(0);
});
test("absence of a configured sink preserves durable pending work without claiming acknowledgement", async () => {
  const outbox: MessageOutbox = {
    claim: async () => {
      throw new Error("No sink may claim work");
    },
    complete: async () => {
      throw new Error("No delivery occurred");
    },
    fail: async () => {
      throw new Error("No attempt occurred");
    },
  };
  await dispatchMessageOutbox({
    outbox,
    sinks: {},
    clock: () => 0,
    uuid: () => crypto.randomUUID(),
  });
});
test("claim failure drains acquired sibling effects before dispatcher rejects and caller closes resources", async () => {
  let release: () => void = () => {
    throw new Error("Missing barrier");
  };
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: () => void = () => {
    throw new Error("Missing start condition");
  };
  const allStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let claims = 0;
  let active = 0;
  let settled = false;
  const outbox: MessageOutbox = {
    claim: async ({ sink, leaseId }) => {
      const index = claims++;
      if (index === 0) throw new Error("Provider unavailable");
      return { event: event(index), sink, leaseId, attempts: 1 };
    },
    complete: async () => true,
    fail: async () => true,
  };
  const running = dispatchMessageOutbox({
    outbox,
    sinks: {
      realtime: async () => {
        active++;
        if (active === 3) started();
        await barrier;
        active--;
      },
    },
    clock: () => 0,
    uuid: () => crypto.randomUUID(),
  }).then(
    () => {
      settled = true;
      return "success";
    },
    (error) => {
      settled = true;
      return error;
    },
  );
  await allStarted;
  expect(settled).toBe(false);
  expect(active).toBe(3);
  release();
  expect(await running).toBeInstanceOf(Error);
  expect(active).toBe(0);
  expect(claims).toBe(4);
});

test("timeout retains four publication slots until delayed cleanup settles and never acknowledges late success", async () => {
  const pending = Array.from({ length: 8 }, (_, index) => event(index));
  const cleanup = Promise.withResolvers<void>();
  const allAborted = Promise.withResolvers<void>();
  const delivered = new Set<string>();
  const failed = new Map<string, number>();
  let claims = 0;
  let active = 0;
  let maximum = 0;
  let aborted = 0;
  let returned = false;
  const outbox: MessageOutbox = {
    claim: async ({ sink, leaseId }) => {
      const next = pending.shift();
      if (!next) return null;
      claims++;
      return { event: next, sink, leaseId, attempts: 1 };
    },
    complete: async ({ event }) => {
      delivered.add(event.eventId);
      return true;
    },
    fail: async ({ event, nextAttemptAt }) => {
      failed.set(event.eventId, nextAttemptAt);
      return true;
    },
  };
  const running = dispatchMessageOutbox({
    outbox,
    sinks: {
      realtime: async ({ signal }) => {
        active++;
        maximum = Math.max(maximum, active);
        signal.addEventListener(
          "abort",
          () => {
            aborted++;
            if (aborted === 4) allAborted.resolve();
          },
          { once: true },
        );
        try {
          await cleanup.promise;
        } finally {
          active--;
        }
      },
    },
    clock: () => 0,
    uuid: () => crypto.randomUUID(),
  }).finally(() => {
    returned = true;
  });
  const watchdog = setTimeout(() => {
    cleanup.resolve();
    allAborted.reject(new Error("Timeout cancellation barrier not reached"));
  }, 25000);
  try {
    await allAborted.promise;
    // Advance to the next event-loop turn after all due abort/microtasks: old
    // wrappers have enough opportunity to start their next wave while cleanup
    // remains held by this observable barrier.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(maximum).toBe(4);
    expect(active).toBe(4);
    expect(claims).toBe(4);
    expect(returned).toBe(false);
    expect(delivered.size).toBe(0);
    cleanup.resolve();
    await running;
    expect(maximum).toBe(4);
    expect(active).toBe(0);
    expect(claims).toBe(8);
    expect(delivered).toEqual(
      new Set(["event-4", "event-5", "event-6", "event-7"]),
    );
    expect([...failed.keys()]).toEqual([
      "event-0",
      "event-1",
      "event-2",
      "event-3",
    ]);
    expect(
      [...failed.values()].every((nextAttemptAt) => nextAttemptAt > 0),
    ).toBe(true);
  } finally {
    cleanup.resolve();
    clearTimeout(watchdog);
    await running;
  }
}, 30000);
