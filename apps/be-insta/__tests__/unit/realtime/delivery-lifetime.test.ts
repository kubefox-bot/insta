import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import type { DeliveryNotice, DeliveryUnit } from "@insta/contracts/realtime";
import { RealtimeErrorCode } from "@insta/contracts/realtime";
import type {
  DeliveryRuntimePorts,
  MaterializedDelivery,
} from "../../../src/domains/conversations/ports/delivery/types";
import { runDelivery } from "../../../src/domains/conversations/use-cases/delivery/run";
import type { Actor } from "../../../src/domains/users/index";

const actor = {
  userId: "alice",
  backendSessionId: "s",
  username: "Alice",
  accessExpiresAt: 100000,
} as Actor;
const baseline = { streamId: "unread:alice", epoch: "e", cursor: 0 };
const row: MaterializedDelivery = {
  ...baseline,
  cursor: 1,
  eventId: "id",
  eventType: "conversations.unread.changed",
  createdAt: 0,
  recordedAt: 0,
  expiresAt: 100000,
  source: { kind: "message", eventId: "id" },
  payload: {
    version: 1,
    kind: "event",
    type: "conversations.unread.changed",
    eventId: "id",
    occurredAt: "2026-10-20T00:00:00.000Z",
    data: { conversationId: "c" },
    meta: { requestId: "id" },
  },
};
const input = (signal: AbortSignal) => ({
  actor,
  target: { kind: "unread" as const, id: "alice" },
  prepared: { subscriptionId: "s", baseline },
  signal,
});
const setup = (controller: AbortController): DeliveryRuntimePorts => ({
  authorize: async () => Result.Ok(actor),
  membership: { permits: async () => true },
  clock: () => 0,
  random: () => 0,
  policy: {
    retentionMs: 100000,
    ackTimeoutMs: 20,
    replayPageSize: 64,
    maxUnreadBatchSize: 64,
    maxApplyFailures: 5,
    deliveryRetryBaseMs: 1000,
    deliveryRetryCapMs: 30000,
    maxSubscriptionsPerSocket: 6,
  },
  recover: async () => "ready",
  wait: async ({ signal }) => {
    signal.throwIfAborted();
  },
  streams: {
    read: async ({ after }) => ({
      kind: "page",
      events: after.cursor ? [] : [row],
      head: { ...baseline, cursor: 1 },
    }),
    watch: async ({ signal }) => {
      if (signal.aborted) return;
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
    },
  },
  target: {
    send: async () => ({ kind: "timeout" }),
    notify: async () => {
      controller.abort();
      return "closed";
    },
  },
});

test("fifth apply-failed stops business delivery while lost terminal notice and receipt retry independently", async () => {
  const controller = new AbortController();
  const sent: DeliveryUnit[] = [];
  const notices: DeliveryNotice[] = [];
  const p = setup(controller);
  p.target.send = async ({ unit }) => {
    sent.push(unit);
    const event = unit.kind === "single" ? unit.event : unit.events.at(-1);
    if (!event) throw new Error("Missing event");
    return { kind: "apply-failed", position: event.delivery };
  };
  p.target.notify = async ({ notice }) => {
    notices.push(notice);
    if (notices.length === 3) {
      controller.abort();
      return "received";
    }
    return "retry";
  };
  await runDelivery(input(controller.signal), p);
  expect(sent).toHaveLength(5);
  expect(notices).toHaveLength(3);
  expect(notices[2]).toEqual(notices[0]);
});

test("six retry-later do not block and Retry-After is preserved before identical unit succeeds", async () => {
  const controller = new AbortController();
  const p = setup(controller);
  const waits: number[] = [];
  const units: DeliveryUnit[] = [];
  const readCursors: number[] = [];
  const notices: DeliveryNotice[] = [];
  const ports = {
    ...p,
    wait: async ({ delayMs }: { delayMs: number }) => {
      waits.push(delayMs);
    },
    streams: {
      ...p.streams,
      read: async (
        input: Parameters<DeliveryRuntimePorts["streams"]["read"]>[0],
      ) => {
        readCursors.push(input.after.cursor);
        if (input.after.cursor === 1) controller.abort();
        return p.streams.read(input);
      },
    },
    target: {
      ...p.target,
      notify: async ({ notice }: { notice: DeliveryNotice }) => {
        notices.push(notice);
        controller.abort();
        return "closed" as const;
      },
      send: async ({ unit }: { unit: DeliveryUnit }) => {
        units.push(unit);
        const event = unit.kind === "single" ? unit.event : unit.events.at(-1);
        if (!event) throw new Error("Missing event");
        if (units.length === 7)
          return { kind: "applied" as const, position: event.delivery };
        return {
          kind: "retry-later" as const,
          position: event.delivery,
          retryAfterMs: 60000,
        };
      },
    },
  };
  await runDelivery(input(controller.signal), ports);
  expect(readCursors).toEqual([0, 1]);
  expect(notices).toHaveLength(0);
  expect(units).toHaveLength(7);
  expect(
    units.every((unit) => JSON.stringify(unit) === JSON.stringify(units[0])),
  ).toBe(true);
  expect(waits).toEqual([60000, 60000, 60000, 60000, 60000, 60000]);
});

import { deliveryPositionSchema } from "@insta/contracts/realtime";

test("applied ACK maps only stream coordinates before next strict reader call", async () => {
  const controller = new AbortController();
  const p = setup(controller);
  let sends = 0;
  let recoveryWaits = 0;
  const ports = {
    ...p,
    wait: async () => {
      recoveryWaits++;
      if (recoveryWaits === 3) controller.abort();
    },
    streams: {
      ...p.streams,
      read: async ({
        after,
      }: {
        after: import("@insta/contracts/realtime").DeliveryPosition;
      }) => {
        deliveryPositionSchema.parse(after);
        return {
          kind: "page" as const,
          events: [{ ...row, cursor: after.cursor + 1 }],
          head: { ...after, cursor: after.cursor + 1 },
        };
      },
    },
    target: {
      ...p.target,
      send: async ({ unit }: { unit: DeliveryUnit }) => {
        const event = unit.kind === "single" ? unit.event : unit.events.at(-1);
        if (!event) throw new Error("Missing event");
        sends++;
        if (sends === 2) controller.abort();
        return { kind: "applied" as const, position: event.delivery };
      },
    },
  };
  const prepared = {
    ...baseline,
    epoch: "7ee32a62-1281-4ac6-83e8-7f10d0112244",
  };
  const validRow = { ...row, epoch: prepared.epoch };
  ports.streams.read = async ({ after }) => {
    deliveryPositionSchema.parse(after);
    return {
      kind: "page",
      events: [{ ...validRow, cursor: after.cursor + 1 }],
      head: { ...after, cursor: after.cursor + 1 },
    };
  };
  await runDelivery(
    {
      ...input(controller.signal),
      prepared: { subscriptionId: "s", baseline: prepared },
    },
    ports,
  );
  expect(sends).toBe(2);
  expect(recoveryWaits).toBe(0);
});

test("expired business deadline sends no expired unit, but lost RESYNC notice continues until receipt", async () => {
  const controller = new AbortController();
  const p = setup(controller);
  let now = 0;
  let sends = 0;
  const notices: DeliveryNotice[] = [];
  const waits: number[] = [];
  await runDelivery(input(controller.signal), {
    ...p,
    clock: () => now,
    wait: async ({ delayMs }) => {
      waits.push(delayMs);
      now += delayMs;
    },
    streams: {
      ...p.streams,
      read: async () => ({
        kind: "page",
        events: [{ ...row, expiresAt: 100 }],
        head: { ...baseline, cursor: 1 },
      }),
    },
    target: {
      send: async ({ unit }) => {
        sends++;
        const event = unit.kind === "single" ? unit.event : unit.events.at(-1);
        if (!event) throw new Error("Missing event");
        return {
          kind: "retry-later",
          position: event.delivery,
          retryAfterMs: 60000,
        };
      },
      notify: async ({ notice }) => {
        notices.push(notice);
        return notices.length === 3 ? "received" : "retry";
      },
    },
  });
  expect(sends).toBe(1);
  expect(waits[0]).toBe(100);
  expect(now).toBeGreaterThan(100);
  expect(notices).toHaveLength(3);
  expect(notices.every((notice) => notice.code === "RESYNC_REQUIRED")).toBe(
    true,
  );
  expect(notices[2]).toEqual(notices[0]);
});

test("actor generation changed during control backoff stops notice attempts", async () => {
  const controller = new AbortController();
  const p = setup(controller);
  let changed = false;
  let notices = 0;
  await runDelivery(input(controller.signal), {
    ...p,
    authorize: async () =>
      Result.Ok(
        changed
          ? {
              ...actor,
              backendSessionId: "replacement" as Actor["backendSessionId"],
            }
          : actor,
      ),
    recover: async () => "resync-required",
    wait: async () => {
      changed = true;
    },
    target: {
      ...p.target,
      notify: async () => {
        notices++;
        return "retry";
      },
    },
  });
  expect(notices).toBe(1);
});

test("Retry-After holds one owned wait; abort settles without another attempt", async () => {
  const controller = new AbortController();
  const p = setup(controller);
  const waiting = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let now = 0;
  let sends = 0;
  const operation = runDelivery(input(controller.signal), {
    ...p,
    clock: () => now,
    wait: async ({ delayMs, signal }) => {
      expect(delayMs).toBe(60000);
      waiting.resolve();
      await release.promise;
      signal.throwIfAborted();
    },
    target: {
      ...p.target,
      send: async ({ unit }) => {
        sends++;
        const event = unit.kind === "single" ? unit.event : unit.events.at(-1);
        if (!event) throw new Error("Missing event");
        return {
          kind: "retry-later",
          position: event.delivery,
          retryAfterMs: 60000,
        };
      },
    },
  });
  await waiting.promise;
  now = 59999;
  await Promise.resolve();
  expect(sends).toBe(1);
  controller.abort();
  release.resolve();
  await operation;
  expect(sends).toBe(1);
});

test("lost unread membership sends no private invalidation but reliably requests resync while neighbors continue", async () => {
  const controller = new AbortController();
  const p = setup(controller);
  let sends = 0;
  const notices: DeliveryNotice[] = [];
  const neighborController = new AbortController();
  let neighborSends = 0;
  await Promise.all([
    runDelivery(input(controller.signal), {
      ...p,
      membership: { permits: async () => false },
      target: {
        send: async () => {
          sends++;
          return { kind: "timeout" };
        },
        notify: async ({ notice }) => {
          notices.push(notice);
          return notices.length === 2 ? "received" : "retry";
        },
      },
    }),
    runDelivery(input(neighborController.signal), {
      ...setup(neighborController),
      target: {
        ...p.target,
        send: async () => {
          neighborSends++;
          neighborController.abort();
          return { kind: "closed" };
        },
      },
    }),
  ]);
  expect(sends).toBe(0);
  expect(notices).toHaveLength(2);
  expect(notices[0]?.code).toBe(RealtimeErrorCode.ResyncRequired);
  expect(notices[1]).toEqual(notices[0]);
  expect(neighborSends).toBe(1);
});
