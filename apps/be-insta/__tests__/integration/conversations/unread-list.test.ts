import { expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import { createUnreadList } from "../../../src/domains/conversations/adapters/mongo/list";
import { createCommitReceipts } from "../../../src/domains/conversations/adapters/mongo/receipts/commit";
import { createReceiptFixture } from "../../fixtures/receipts/mongo";

const readUnread = async (
  list: ReturnType<typeof createUnreadList>,
  input: Parameters<ReturnType<typeof createUnreadList>>[0],
) => {
  const result = await list(input);
  if (result.isError()) throw new Error(result.getError());
  return result.get();
};

test("unread list counts absent and delivered receipts, excludes own messages, and applies partial reads", async () => {
  const fixture = await createReceiptFixture();
  try {
    const list = createUnreadList(fixture);
    const input = { actorId: fixture.bob, limit: 20 };
    const initial = await list(input);
    if (initial.isError()) throw new Error(initial.getError());
    expect(initial.get().totalUnreadCount).toBe(2);
    expect(initial.get().items[0]?.unreadCount).toBe(2);
    const commit = createCommitReceipts(fixture);
    const receipt = {
      actorId: fixture.bob,
      conversationId: fixture.conversationId,
      messageIds: fixture.ids.slice(0, 1),
      nowMs: 500,
    };
    expect((await commit({ ...receipt, status: "delivered" })).isOk()).toBe(
      true,
    );
    expect((await readUnread(list, input)).totalUnreadCount).toBe(2);
    expect((await commit({ ...receipt, status: "read" })).isOk()).toBe(true);
    expect((await readUnread(list, input)).totalUnreadCount).toBe(1);
    expect(
      (await commit({ ...receipt, status: "read", nowMs: 600 })).isOk(),
    ).toBe(true);
    expect((await readUnread(list, input)).totalUnreadCount).toBe(1);
    expect(
      (await readUnread(list, { actorId: fixture.alice, limit: 20 }))
        .totalUnreadCount,
    ).toBe(1);
    expect(
      await readUnread(list, { actorId: fixture.mallory, limit: 20 }),
    ).toEqual({ items: [], totalUnreadCount: 0 });
  } finally {
    await fixture.close();
  }
});

test("total unread includes actor conversations outside the visible list limit", async () => {
  const fixture = await createReceiptFixture();
  try {
    const second = new ObjectId();
    await fixture.db.collection(collections.conversations).insertOne({
      _id: second,
      participantIds: [fixture.bob, fixture.mallory],
      pairKey: `${fixture.bob}:${fixture.mallory}`,
      lastSequence: 1,
      lastActivityAt: new Date(200),
      createdAt: new Date(200),
    });
    await fixture.db.collection(collections.messages).insertOne({
      _id: new ObjectId(),
      conversationId: second.toHexString(),
      senderId: fixture.mallory,
      text: "synthetic unread outside page",
      sequence: 1,
      createdAt: new Date(200),
    });
    const result = await createUnreadList(fixture)({
      actorId: fixture.bob,
      limit: 1,
    });
    if (result.isError()) throw new Error(result.getError());
    expect(result.get().items).toHaveLength(1);
    expect(result.get().items[0]?.id).toBe(second.toHexString());
    expect(result.get().items[0]?.unreadCount).toBe(1);
    expect(result.get().totalUnreadCount).toBe(3);
  } finally {
    await fixture.close();
  }
});

test("reading every incoming message yields zero, including a valid zero timestamp", async () => {
  const fixture = await createReceiptFixture();
  try {
    const committed = await createCommitReceipts(fixture)({
      actorId: fixture.bob,
      conversationId: fixture.conversationId,
      messageIds: fixture.ids.slice(0, 2),
      status: "read",
      nowMs: 0,
    });
    if (committed.isError()) throw new Error(committed.getError());
    const result = await readUnread(createUnreadList(fixture), {
      actorId: fixture.bob,
      limit: 20,
    });
    expect(result.totalUnreadCount).toBe(0);
    expect(result.items[0]?.unreadCount).toBe(0);
  } finally {
    await fixture.close();
  }
});
