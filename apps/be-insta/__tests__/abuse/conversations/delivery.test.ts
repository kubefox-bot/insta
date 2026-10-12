import { expect, test } from "bun:test";
import {
  deliveryNoticeSchema,
  deliveryUnitSchema,
  preparedSubscriptionSchema,
  RealtimeErrorCode,
} from "@insta/contracts/realtime";
import { waitUntil } from "../../../../../__tests__/fixtures/barrier";
import { dispatchMessageOutbox } from "../../../src/domains/conversations/index";
import { readRealtimeConfig } from "../../../src/lib/config/index";
import {
  activatePrepared,
  realtimeCommand,
  receiveDelivery,
} from "../../fixtures/realtime/client";
import { expectSuccess } from "../../fixtures/realtime/outcome";
import { connectRealtimeFixture } from "../../fixtures/realtime/socket";
import { createReceiptHttpFixture } from "../../fixtures/receipts/http";

const policy = {
  ...readRealtimeConfig({}),
  ackTimeoutMs: 80,
  deliveryRetryBaseMs: 20,
  deliveryRetryCapMs: 40,
};
const preparedFrom = (ack: Awaited<ReturnType<typeof realtimeCommand>>) => {
  if (!ack.ok || !("subscriptionId" in ack.data))
    throw new Error("Expected prepared subscription");
  return preparedSubscriptionSchema.parse({
    subscriptionId: ack.data.subscriptionId,
    baseline: ack.data.baseline,
  });
};

test("real WS rejects foreign/future epoch before resume, reuses lost prepare ACK, caps six slots and revokes current session", async () => {
  const f = await createReceiptHttpFixture({ policy });
  const sockets: Awaited<ReturnType<typeof connectRealtimeFixture>>[] = [];
  try {
    const bob = await f.signIn();
    const ids: string[] = [];
    for (let index = 0; index < 7; index++)
      ids.push(
        expectSuccess(
          await f.chat.conversations.conversations.startPair({
            participantIds: [bob.user.id, crypto.randomUUID()],
            operationId: f.operation(),
          }),
        ).conversation.id,
      );
    const first = ids[0];
    if (!first) throw new Error("Missing conversation");
    const socket = await connectRealtimeFixture(f.url, bob.accessToken);
    sockets.push(socket);
    const prepared = preparedFrom(
      await realtimeCommand(socket, "conversations.subscribe", {
        conversationId: first,
      }),
    );
    expect(
      preparedFrom(
        await realtimeCommand(socket, "conversations.subscribe", {
          conversationId: first,
        }),
      ),
    ).toEqual(prepared);
    for (const [resume, code] of [
      [
        { ...prepared.baseline, streamId: `conversation:${ids[1]}` },
        "FORBIDDEN",
      ],
      [{ ...prepared.baseline, cursor: 500 }, "RESYNC_REQUIRED"],
      [{ ...prepared.baseline, epoch: crypto.randomUUID() }, "RESYNC_REQUIRED"],
    ] as const) {
      const denied = await realtimeCommand(socket, "conversations.subscribe", {
        conversationId: first,
        resume,
      });
      expect(denied.ok ? "unexpected success" : denied.error.code).toBe(code);
    }
    for (const conversationId of ids.slice(1, 6))
      expect(
        (
          await realtimeCommand(socket, "conversations.subscribe", {
            conversationId,
          })
        ).ok,
      ).toBe(true);
    const overflow = await realtimeCommand(socket, "conversations.subscribe", {
      conversationId: ids[6],
    });
    expect(overflow.ok ? "unexpected success" : overflow.error.code).toBe(
      "RATE_LIMITED",
    );
    expect(
      (
        await realtimeCommand(socket, "conversations.unsubscribe", {
          conversationId: first,
        })
      ).ok,
    ).toBe(true);
    const next = preparedFrom(
      await realtimeCommand(socket, "conversations.subscribe", {
        conversationId: first,
      }),
    );
    expect(next.subscriptionId).not.toBe(prepared.subscriptionId);
    const stale = await realtimeCommand(
      socket,
      "conversations.activate",
      prepared,
    );
    expect(stale.ok ? "unexpected success" : stale.error.code).toBe(
      "FORBIDDEN",
    );
    const revoke = await fetch(`${f.url}/v1/auth/sessions/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        backendSessionId: bob.backendSessionId,
        revokeSecret: bob.revokeSecret,
      }),
    });
    expect(revoke.status).toBe(200);
    await waitUntil({ check: async () => !socket.connected, timeoutMs: 5000 });
    expect(socket.connected).toBe(false);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await f.close();
  }
}, 30000);

test("malformed and foreign negative ACK cannot block; fifth valid failure stops business while lost control retries and neighbor advances", async () => {
  const f = await createReceiptHttpFixture({ policy });
  const sockets: Awaited<ReturnType<typeof connectRealtimeFixture>>[] = [];
  try {
    const alice = await f.signIn();
    const bob = await f.signIn();
    const id = expectSuccess(
      await f.chat.conversations.conversations.startPair({
        participantIds: [alice.user.id, bob.user.id],
        operationId: f.operation(),
      }),
    ).conversation.id;
    const blocked = await connectRealtimeFixture(f.url, bob.accessToken);
    sockets.push(blocked);
    const neighbor = await connectRealtimeFixture(f.url, bob.accessToken);
    sockets.push(neighbor);
    const units: unknown[] = [];
    const notices: unknown[] = [];
    const healthy: unknown[] = [];
    blocked.on("event", (payload: unknown, ack: (reply: unknown) => void) => {
      const unit = deliveryUnitSchema.parse(payload);
      const event = unit.kind === "single" ? unit.event : unit.events.at(-1);
      if (!event) throw new Error("Missing event");
      units.push(event.delivery);
      if (units.length === 1) {
        ack({ malformed: true });
        return;
      }
      const position =
        units.length === 2
          ? { ...event.delivery, subscriptionId: crypto.randomUUID() }
          : event.delivery;
      ack({ kind: "apply-failed", position });
    });
    blocked.on(
      "delivery.notice",
      (payload: unknown, ack: (reply: unknown) => void) => {
        const notice = deliveryNoticeSchema.parse(payload);
        notices.push(notice);
        if (notices.length === 1) return;
        if (notices.length === 2) {
          ack({ ...notice, subscriptionId: crypto.randomUUID() });
          return;
        }
        if (notices.length === 3) {
          ack({ kind: "applied" });
          return;
        }
        ack(notice);
      },
    );
    neighbor.on("event", (payload: unknown, ack: unknown) =>
      receiveDelivery(payload, ack, (event) => healthy.push(event)),
    );
    const prepared = await Promise.all(
      sockets.map((socket) =>
        realtimeCommand(socket, "conversations.subscribe", {
          conversationId: id,
        }),
      ),
    );
    const send = async (text: string) => {
      const response = await fetch(`${f.url}/v1/conversations/${id}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${alice.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      expect(response.status).toBe(200);
    };
    await send("terminal attempt");
    for (const [index, socket] of sockets.entries()) {
      const ack = prepared[index];
      if (!ack) throw new Error("Missing prepare");
      await activatePrepared(socket, ack);
    }
    // No outbox dispatch/new publish: initial materialization restores the committed tail.
    await waitUntil({
      check: async () => notices.length >= 4 && healthy.length === 1,
      timeoutMs: 10000,
    });
    expect(units).toHaveLength(7);
    expect(
      units.every((unit) => JSON.stringify(unit) === JSON.stringify(units[0])),
    ).toBe(true);
    expect(notices[3]).toEqual(notices[0]);
    expect(deliveryNoticeSchema.parse(notices[0]).code).toBe(
      RealtimeErrorCode.DeliveryBlocked,
    );
    await send("neighbor remains active");
    await dispatchMessageOutbox({
      outbox: f.chat.realtime.outbox,
      sinks: { realtime: f.chat.realtime.publishers.message },
      clock: Date.now,
      uuid: () => crypto.randomUUID(),
    });
    await waitUntil({
      check: async () => healthy.length === 2,
      timeoutMs: 10000,
    });
    expect(units).toHaveLength(7);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await f.close();
  }
}, 30000);

test("committed unread provenance survives removed membership and reaches reliable resync without private business payload", async () => {
  const f = await createReceiptHttpFixture({ policy });
  const sockets: Awaited<ReturnType<typeof connectRealtimeFixture>>[] = [];
  try {
    const alice = await f.signIn();
    const bob = await f.signIn();
    const id = expectSuccess(
      await f.chat.conversations.conversations.startPair({
        participantIds: [alice.user.id, bob.user.id],
        operationId: f.operation(),
      }),
    ).conversation.id;
    const socket = await connectRealtimeFixture(f.url, bob.accessToken);
    sockets.push(socket);
    const prepared = await realtimeCommand(
      socket,
      "conversations.unread.subscribe",
      {},
    );
    const baseline = preparedFrom(prepared).baseline;
    let business = 0;
    const notices: unknown[] = [];
    socket.on("event", () => {
      business++;
    });
    socket.on(
      "delivery.notice",
      (payload: unknown, ack: (reply: unknown) => void) => {
        const notice = deliveryNoticeSchema.parse(payload);
        notices.push(notice);
        if (notices.length > 1) ack(notice);
      },
    );
    const response = await fetch(`${f.url}/v1/conversations/${id}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "membership loss" }),
    });
    expect(response.status).toBe(200);
    const page = await f.chat.realtime.journal.read({
      after: baseline,
      limit: 64,
      nowMs: Date.now(),
    });
    if (page.kind !== "page" || !page.events[0])
      throw new Error("Missing committed unread reference");
    const event = page.events[0];
    for (const forged of [
      { ...event, cursor: event.cursor + 1 },
      { ...event, epoch: crypto.randomUUID() },
      { ...event, expiresAt: event.expiresAt + 1 },
      { ...event, streamId: `unread:${crypto.randomUUID()}` },
    ])
      await expect(
        f.chat.realtime.journal.materialize({ event: forged }),
      ).rejects.toThrow("Invalid unread message target");
    await f.db
      .collection("conversations")
      .updateOne(
        { pairKey: [alice.user.id, bob.user.id].sort().join(":") },
        { $set: { participantIds: [alice.user.id, crypto.randomUUID()] } },
      );
    expect(
      await f.chat.realtime.membership.permits({
        actorId: bob.user.id,
        conversationId: id,
      }),
    ).toBe(false);
    await dispatchMessageOutbox({
      outbox: f.chat.realtime.outbox,
      sinks: { realtime: f.chat.realtime.publishers.message },
      clock: Date.now,
      uuid: () => crypto.randomUUID(),
    });
    await activatePrepared(socket, prepared);
    await waitUntil({
      check: async () => notices.length >= 2,
      timeoutMs: 10000,
    });
    expect(business).toBe(0);
    expect(deliveryNoticeSchema.parse(notices[0]).code).toBe(
      RealtimeErrorCode.ResyncRequired,
    );
    expect(notices[1]).toEqual(notices[0]);
    expect(
      await f.chat.realtime.membership.permits({
        actorId: bob.user.id,
        conversationId: id,
      }),
    ).toBe(false);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await f.close();
  }
}, 30000);
