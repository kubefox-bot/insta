import { expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import {
  startSuccessSchema,
  unreadConversationListItemSchema,
  unreadListSuccessSchema,
} from "../../../src/domains/conversations/adapters/http/conversations/dto";
import { createUnreadList } from "../../../src/domains/conversations/adapters/mongo/list";

test("unread persistence failure ends its session and never returns empty success", async () => {
  const client = new MongoClient("mongodb://127.0.0.1:27017");
  const session = client.startSession();
  const db = new Proxy(client.db("synthetic_unread_failure"), {
    get(target, property) {
      if (property === "collection")
        return () => {
          throw new Error("Synthetic unavailable persistence");
        };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  try {
    const result = await createUnreadList({ db, startSession: () => session })({
      actorId: "000000000000000000000001",
      limit: 20,
    });
    expect(String(result.isError() && result.getError())).toBe(
      "DEPENDENCY_UNAVAILABLE",
    );
    expect(session.hasEnded).toBe(true);
  } finally {
    await client.close();
  }
});

test("list-only unread fields are required finite safe integers and do not expand start DTO", () => {
  const item = {
    id: "100000000000000000000001",
    participantIds: ["000000000000000000000001", "000000000000000000000002"],
    lastSequence: 2,
    lastActivityAt: 1,
    recipientUsername: "bob",
    unreadCount: 2,
  };
  expect(unreadConversationListItemSchema.safeParse(item).success).toBe(true);
  for (const unreadCount of [
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
    undefined,
  ]) {
    expect(
      unreadConversationListItemSchema.safeParse({ ...item, unreadCount })
        .success,
    ).toBe(false);
  }
  const base = {
    id: item.id,
    participantIds: item.participantIds,
    lastSequence: 2,
    lastActivityAt: 1,
  };
  const meta = {
    requestId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
  };
  expect(
    startSuccessSchema.safeParse({
      ok: true,
      data: { conversation: base, code: "CONVERSATION_CREATED" },
      meta,
    }).success,
  ).toBe(true);
  expect(
    unreadListSuccessSchema.safeParse({
      ok: true,
      data: { items: [item], totalUnreadCount: 7 },
      meta,
    }).success,
  ).toBe(true);
  expect(
    unreadListSuccessSchema.safeParse({
      ok: true,
      data: { items: [item] },
      meta,
    }).success,
  ).toBe(false);
});
