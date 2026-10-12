import { expect, test } from "bun:test";
import {
  ackSchema,
  type eventSchema,
  realtimeChannels,
  realtimeCommandTypes,
  realtimeEventTypes,
} from "@insta/contracts/realtime";
import { io, type Socket } from "socket.io-client";
import { waitUntil } from "../../../../../__tests__/fixtures/barrier";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import { outboxDocumentSchema } from "../../../src/domains/conversations/adapters/mongo/outbox-schema";
import { dispatchMessageOutbox } from "../../../src/domains/conversations/use-cases/messages/dispatch-outbox";
import { dispatchReceiptOutbox } from "../../../src/domains/conversations/use-cases/receipts/dispatch-outbox";
import {
  revokeSession,
  type SessionId,
} from "../../../src/domains/users/index";
import {
  activatePrepared,
  receiveDelivery,
} from "../../fixtures/realtime/client";
import { createReceiptHttpFixture } from "../../fixtures/receipts/http";

test("account unread sockets receive durable invalidation outside selected chats and preserve legacy delivery", async () => {
  const f = await createReceiptHttpFixture();
  const sockets: Socket[] = [];
  try {
    const alice = await f.signIn();
    const bob = await f.signIn();
    const mallory = await f.signIn();
    const pair = await f.chat.conversations.conversations.startPair({
      participantIds: [alice.user.id, bob.user.id],
      operationId: f.operation(),
    });
    if (pair.isError()) throw new Error(pair.getError());
    const conversationId = pair.get().conversation.id;
    const connect = async (accessToken: string) => {
      const response = await fetch(`${f.url}/v1/auth/ws-ticket`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(response.status).toBe(200);
      const ticket = (await response.json()).data.ticket;
      const socket = io(f.url, {
        path: "/event",
        transports: ["websocket"],
        auth: { ticket },
        extraHeaders: { origin: "https://localhost" },
        reconnection: false,
        forceNew: true,
        timeout: 2000,
      });
      sockets.push(socket);
      const events: ReturnType<typeof eventSchema.parse>[] = [];
      socket.on(realtimeChannels.event, (event: unknown, ack: unknown) =>
        receiveDelivery(event, ack, (value) => events.push(value)),
      );
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      return { socket, events };
    };
    const aliceClient = await connect(alice.accessToken);
    const bobClient = await connect(bob.accessToken);
    const bobOtherClient = await connect(bob.accessToken);
    const malloryClient = await connect(mallory.accessToken);
    const legacyClient = await connect(alice.accessToken);
    const command = async (
      socket: Socket,
      type: string,
      data: Readonly<Record<string, string>>,
    ) => {
      const ack = ackSchema.parse(
        await socket.timeout(2000).emitWithAck(realtimeChannels.command, {
          version: 1,
          kind: "command",
          type,
          data,
          meta: { requestId: crypto.randomUUID() },
        }),
      );
      if (
        type === realtimeCommandTypes.subscribe ||
        type === realtimeCommandTypes.unreadSubscribe
      )
        await activatePrepared(socket, ack);
      return ack;
    };
    for (const client of [
      aliceClient,
      bobClient,
      bobOtherClient,
      malloryClient,
    ]) {
      const ack = await command(
        client.socket,
        realtimeCommandTypes.unreadSubscribe,
        {},
      );
      expect(ack.ok).toBe(true);
      if (ack.ok) expect(ack.data).toMatchObject({ subscription: "unread" });
    }
    expect(
      (
        await command(legacyClient.socket, realtimeCommandTypes.subscribe, {
          conversationId,
        })
      ).ok,
    ).toBe(true);
    const dispatchMessage = () =>
      dispatchMessageOutbox({
        outbox: f.chat.realtime.outbox,
        sinks: { realtime: f.chat.realtime.publishers.message },
        clock: Date.now,
        uuid: () => crypto.randomUUID(),
      });
    const dispatchReceipt = () =>
      dispatchReceiptOutbox({
        outbox: f.chat.receiptOutbox,
        publish: f.chat.realtime.publishers.receipt,
        clock: Date.now,
        uuid: () => crypto.randomUUID(),
      });
    const send = async () => {
      const response = await fetch(
        `${f.url}/v1/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${alice.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: "Synthetic unread WS acceptance",
            clientMessageId: crypto.randomUUID(),
          }),
        },
      );
      expect(response.status).toBe(200);
      await response.body?.cancel();
      return outboxDocumentSchema.parse(
        await f.db
          .collection(collections.outbox)
          .findOne({ conversationId }, { sort: { sequence: -1 } }),
      );
    };
    const stored = await send();
    expect(aliceClient.events).toEqual([]);
    expect(bobClient.events).toEqual([]);
    await dispatchMessage();
    await waitUntil({
      check: async () =>
        aliceClient.events.length === 1 &&
        bobClient.events.length === 1 &&
        bobOtherClient.events.length === 1 &&
        legacyClient.events.length === 1,
      timeoutMs: 2000,
    });
    expect(aliceClient.events[0]?.type).toBe(realtimeEventTypes.unreadChanged);
    expect(aliceClient.events[0]?.data).toEqual({ conversationId });
    expect(bobClient.events[0]?.eventId).toBe(stored.eventId);
    expect(legacyClient.events[0]?.type).toBe(
      realtimeEventTypes.messageCreated,
    );
    expect(malloryClient.events).toEqual([]);
    expect(
      (
        await f.db
          .collection(collections.outbox)
          .findOne({ eventId: stored.eventId })
      )?.deliveries.realtime.state,
    ).toBe("delivered");
    const acknowledge = async (status: "delivered" | "read") => {
      const result = await f.chat.receipts.commitReceipts({
        actorId: bob.user.id,
        conversationId,
        messageIds: [stored.messageId],
        status,
        nowMs: Date.now(),
      });
      expect(result.isOk()).toBe(true);
      await dispatchReceipt();
    };
    await acknowledge("delivered");
    await waitUntil({
      check: async () => legacyClient.events.length === 2,
      timeoutMs: 2000,
    });
    expect(aliceClient.events).toHaveLength(1);
    expect(bobClient.events).toHaveLength(1);
    expect(bobOtherClient.events).toHaveLength(1);
    await acknowledge("read");
    await waitUntil({
      check: async () =>
        bobClient.events.length === 2 &&
        bobOtherClient.events.length === 2 &&
        legacyClient.events.length === 3,
      timeoutMs: 2000,
    });
    expect(aliceClient.events).toHaveLength(1);
    expect(bobClient.events[1]?.data).toEqual({ conversationId });
    expect(bobOtherClient.events[1]?.data).toEqual({ conversationId });
    expect(malloryClient.events).toEqual([]);
    const unsubscribe = await command(
      bobClient.socket,
      realtimeCommandTypes.unreadUnsubscribe,
      {},
    );
    expect(unsubscribe.ok).toBe(true);
    if (unsubscribe.ok)
      expect(unsubscribe.data).toEqual({
        subscription: "unread",
        subscribed: false,
      });
    await send();
    await dispatchMessage();
    await waitUntil({
      check: async () =>
        aliceClient.events.length === 2 &&
        bobOtherClient.events.length === 3 &&
        legacyClient.events.length === 4,
      timeoutMs: 2000,
    });
    expect(bobClient.events).toHaveLength(2);
    const revoked = await revokeSession(
      {
        backendSessionId: alice.backendSessionId as SessionId,
        revokeSecret: alice.revokeSecret,
      },
      f.auth,
    );
    expect(revoked.isOk()).toBe(true);
    await f.chat.realtime.publishers.message({
      event: stored,
      signal: new AbortController().signal,
    });
    await waitUntil({
      check: async () =>
        !aliceClient.socket.connected && !legacyClient.socket.connected,
      timeoutMs: 2000,
    });
    expect(aliceClient.events).toHaveLength(2);
    expect(legacyClient.events).toHaveLength(4);
    expect(malloryClient.events).toEqual([]);
    const controller = new AbortController();
    controller.abort(new Error("Owned unread cancellation"));
    await expect(
      f.chat.realtime.publishers.message({
        event: stored,
        signal: controller.signal,
      }),
    ).rejects.toBeDefined();
  } finally {
    for (const socket of sockets) socket.disconnect();
    await f.close();
  }
}, 30000);
