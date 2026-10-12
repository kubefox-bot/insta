import { expect, test } from "bun:test";
import {
  messageSchema,
  receiptBatchSnapshotSchema,
} from "@insta/contracts/messages";
import {
  revokeSession,
  type SessionId,
} from "../../../src/domains/users/index";
import { createReceiptHttpFixture } from "../../fixtures/receipts/http";

test("protected receipt REST maps canonical server timestamps and enforces actor quota", async () => {
  const f = await createReceiptHttpFixture();
  try {
    const alice = await f.signIn();
    const bob = await f.signIn();
    const conversation = await f.chat.conversations.conversations.startPair({
      participantIds: [alice.user.id, bob.user.id],
      operationId: crypto.randomUUID(),
    });
    if (conversation.isError()) throw new Error(conversation.getError());
    const id = conversation.get().conversation.id;
    const sent = await fetch(`${f.url}/v1/conversations/${id}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${alice.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "receipt" }),
    });
    expect(sent.status).toBe(200);
    const messageId = messageSchema.parse((await sent.json()).data).id;
    const post = (token: string, body: unknown) =>
      fetch(`${f.url}/v1/conversations/${id}/receipts`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const body = { messageIds: [messageId], status: "read" };
    const success = await post(bob.accessToken, body);
    expect(success.status).toBe(200);
    const snapshot = receiptBatchSnapshotSchema.parse(
      (await success.json()).data,
    );
    expect(snapshot.receipts[0]?.recipientId).toBe(bob.user.id);
    expect(snapshot.receipts[0]?.readAt).toBe(
      snapshot.receipts[0]?.deliveredAt,
    );
    const historyResponse = await fetch(
      `${f.url}/v1/conversations/${id}/messages`,
      { headers: { authorization: `Bearer ${alice.accessToken}` } },
    );
    expect(historyResponse.status).toBe(200);
    const historical = messageSchema.parse(
      (await historyResponse.json()).data.items[0],
    );
    const firstReceipt = snapshot.receipts[0];
    if (!firstReceipt) throw new Error("Missing acknowledged receipt");
    expect(historical.receipt).toEqual({
      deliveredAt: firstReceipt.deliveredAt,
      readAt: firstReceipt.readAt,
    });
    expect((await post("invalid", body)).status).toBe(401);
    for (const forged of [
      { ...body, recipientId: alice.user.id },
      { ...body, readAt: new Date().toISOString() },
      { ...body, status: "sent" },
      {
        ...body,
        messageIds: Array.from({ length: 51 }, () => messageId),
      },
    ])
      expect((await post(bob.accessToken, forged)).status).toBe(400);
    for (let index = 1; index < 120; index += 1)
      expect((await post(bob.accessToken, body)).status).toBe(200);
    const revoked = await revokeSession(
      {
        backendSessionId: alice.backendSessionId as SessionId,
        revokeSecret: alice.revokeSecret,
      },
      f.auth,
    );
    expect(revoked.isOk()).toBe(true);
    expect((await post(alice.accessToken, body)).status).toBe(401);
    const limited = await post(bob.accessToken, body);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(
      await f.db
        .collection("conversations_receipt_outbox")
        .countDocuments({ conversationId: id }),
    ).toBe(1);
  } finally {
    await f.close();
  }
}, 30000);
