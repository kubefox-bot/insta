import { expect, test } from "bun:test";
import { eventSchema } from "@insta/contracts/realtime";
import { ObjectId } from "mongodb";
import { io, type Socket } from "socket.io-client";
import { waitUntil } from "../../../../../__tests__/fixtures/barrier";
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

test("native sockets receive durable receipt snapshot only after authorized subscription", async () => {
  const f = await createReceiptHttpFixture();
  const sockets: Socket[] = [];
  try {
    const alice = await f.signIn();
    const bob = await f.signIn();
    const mallory = await f.signIn();
    const pair = await f.chat.conversations.conversations.startPair({
      participantIds: [alice.user.id, bob.user.id],
      operationId: crypto.randomUUID(),
    });
    if (pair.isError()) throw new Error(pair.getError());
    const conversationId = pair.get().conversation.id;
    const messageId = new ObjectId();
    await f.db.collection("conversations_messages").insertOne({
      _id: messageId,
      conversationId,
      senderId: alice.user.id,
      text: "ws receipt",
      sequence: 1,
      createdAt: new Date(),
    });
    const received: unknown[][] = [];
    for (const credentials of [alice, bob, mallory]) {
      const response = await fetch(`${f.url}/v1/auth/ws-ticket`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${credentials.accessToken}`,
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
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      const events: unknown[] = [];
      received.push(events);
      socket.on("event", (event: unknown, ack: unknown) =>
        receiveDelivery(event, ack, (value) => events.push(value)),
      );
      const ack = await socket.timeout(2000).emitWithAck("command", {
        version: 1,
        kind: "command",
        type: "conversations.subscribe",
        data: { conversationId },
        meta: { requestId: crypto.randomUUID() },
      });
      expect(ack.ok).toBe(credentials !== mallory);
      await activatePrepared(socket, ack);
    }
    const result = await f.chat.receipts.commitReceipts({
      actorId: bob.user.id,
      conversationId,
      messageIds: [messageId.toHexString()],
      status: "read",
      nowMs: Date.now(),
    });
    expect(result.isOk()).toBe(true);
    await dispatchReceiptOutbox({
      outbox: f.chat.receiptOutbox,
      publish: f.chat.realtime.publishers.receipt,
      clock: Date.now,
      uuid: () => crypto.randomUUID(),
    });
    await waitUntil({
      check: async () => received[0]?.length === 1 && received[1]?.length === 1,
      timeoutMs: 2000,
    });
    const event = eventSchema.parse(received[0]?.[0]);
    expect(event.type).toBe("messages.receipts.updated");
    if (event.type !== "messages.receipts.updated")
      throw new Error("Wrong event");
    expect(event.data.receipts[0]?.messageId).toBe(messageId.toHexString());
    expect(event.data.receipts[0]?.recipientId).toBe(bob.user.id);
    expect(received[2]).toEqual([]);
    const revoked = await revokeSession(
      {
        backendSessionId: alice.backendSessionId as SessionId,
        revokeSecret: alice.revokeSecret,
      },
      f.auth,
    );
    expect(revoked.isOk()).toBe(true);
    const secondId = new ObjectId();
    await f.db.collection("conversations_messages").insertOne({
      _id: secondId,
      conversationId,
      senderId: alice.user.id,
      text: "after logout",
      sequence: 2,
      createdAt: new Date(),
    });
    await f.chat.receipts.commitReceipts({
      actorId: bob.user.id,
      conversationId,
      messageIds: [secondId.toHexString()],
      status: "read",
      nowMs: Date.now(),
    });
    await dispatchReceiptOutbox({
      outbox: f.chat.receiptOutbox,
      publish: f.chat.realtime.publishers.receipt,
      clock: Date.now,
      uuid: () => crypto.randomUUID(),
    });
    await waitUntil({
      check: async () =>
        received[1]?.length === 2 && sockets[0]?.connected === false,
      timeoutMs: 2000,
    });
    expect(received[0]).toHaveLength(1);
    expect(received[2]).toEqual([]);
    expect(
      (
        await f.db
          .collection("conversations_receipt_outbox")
          .findOne({ conversationId })
      )?.state,
    ).toBe("delivered");
  } finally {
    for (const socket of sockets) socket.disconnect();
    await f.close();
  }
}, 30000);
