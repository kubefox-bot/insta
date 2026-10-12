import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import type { DeliveryUnit } from "@insta/contracts/realtime";
import { deliverNext } from "../../../src/domains/conversations/use-cases/delivery/deliver";
import type { Actor } from "../../../src/domains/users/index";

const actor = {
  userId: "alice",
  backendSessionId: "session",
  username: "Alice",
  accessExpiresAt: 100000,
} as Actor;
const expected = {
  subscriptionId: "s",
  streamId: "unread:alice",
  epoch: "e",
  cursor: 2,
};
const event = (cursor: number) => ({
  version: 1 as const,
  kind: "event" as const,
  type: "conversations.unread.changed" as const,
  eventId: "id",
  occurredAt: "2026-10-20T00:00:00.000Z",
  meta: { requestId: "id" },
  data: { conversationId: "c" },
  delivery: { ...expected, cursor },
});
const unit: DeliveryUnit = {
  kind: "unread-batch",
  events: [event(1), event(2)],
};
const subscription = {
  actor,
  target: { kind: "unread" as const, id: "alice" },
  attempt: { unit, expected, expiresAt: 10000 },
  failures: 0,
  retries: 0,
};
const ports = {
  authorize: async () => Result.Ok(actor),
  membership: { permits: async () => true },
  clock: () => 0,
  random: () => 0,
  policy: {
    maxApplyFailures: 5,
    deliveryRetryBaseMs: 1000,
    deliveryRetryCapMs: 30000,
  },
  target: {
    send: async () => ({ kind: "applied" as const, position: expected }),
  },
};

test("last event and ACK loss keep identical batch until exact final cursor applies", async () => {
  const sent: DeliveryUnit[] = [];
  const target = {
    send: async ({ unit }: { unit: DeliveryUnit }) => {
      sent.push(unit);
      return sent.length <= 7
        ? { kind: "timeout" as const }
        : { kind: "applied" as const, position: expected };
    },
  };
  for (let index = 0; index < 8; index++) {
    const step = await deliverNext(
      { subscription, signal: new AbortController().signal },
      { ...ports, target },
    );
    expect(step.kind).toBe(index < 7 ? "retry" : "acked");
  }
  expect(sent).toEqual(Array.from({ length: 8 }, () => unit));
  const partial = await deliverNext(
    { subscription, signal: new AbortController().signal },
    {
      ...ports,
      target: {
        send: async () => ({
          kind: "applied",
          position: { ...expected, cursor: 1 },
        }),
      },
    },
  );
  expect(partial.kind).toBe("retry");
});

test("revoked actor and expiry prevent sends; stale callback after abort cannot acknowledge", async () => {
  let sends = 0;
  const target = {
    send: async () => {
      sends++;
      return { kind: "applied" as const, position: expected };
    },
  };
  expect(
    (
      await deliverNext(
        { subscription, signal: new AbortController().signal },
        { ...ports, authorize: async () => Result.Error("revoked"), target },
      )
    ).kind,
  ).toBe("unauthorized");
  expect(
    (
      await deliverNext(
        { subscription, signal: new AbortController().signal },
        { ...ports, clock: () => 10000, target },
      )
    ).kind,
  ).toBe("resync-required");
  expect(sends).toBe(0);
  const controller = new AbortController();
  const step = await deliverNext(
    { subscription, signal: controller.signal },
    {
      ...ports,
      target: {
        send: async () => {
          controller.abort();
          return { kind: "applied", position: expected };
        },
      },
    },
  );
  expect(step.kind).toBe("closed");
});

test("unread replay cannot leak conversation invalidation after membership was removed", async () => {
  let sends = 0;
  const step = await deliverNext(
    { subscription, signal: new AbortController().signal },
    {
      ...ports,
      membership: { permits: async () => false },
      target: {
        send: async () => {
          sends++;
          return { kind: "applied", position: expected };
        },
      },
    },
  );
  expect(step.kind).toBe("resync-required");
  expect(sends).toBe(0);
});
