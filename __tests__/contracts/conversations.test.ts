import { expect, test } from "bun:test";
import { unreadListSuccessSchema } from "../../apps/be-insta/src/domains/conversations/adapters/http/conversations/dto";
import { directoryQuerySchema } from "../../apps/be-insta/src/domains/users/directory/adapters/http/directory.dto";
import {
  listHistory200Schema,
  listHistoryQueryParamsSchema,
} from "../../apps/fe-insta/src/lib/api/generated/schemas/listHistorySchema";
import {
  listUnreadConversations200Schema,
  listUnreadConversationsQueryParamsSchema,
} from "../../apps/fe-insta/src/lib/api/generated/schemas/listUnreadConversationsSchema";
import { searchUsersQueryParamsSchema } from "../../apps/fe-insta/src/lib/api/generated/schemas/searchUsersSchema";

test("unread list source and generated wire preserve per-chat counts and an independent account total", () => {
  const item = {
    id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    participantIds: [
      "bbbbbbbbbbbbbbbbbbbbbbbb",
      "cccccccccccccccccccccccc",
    ] satisfies [string, string],
    lastSequence: 4,
    lastActivityAt: 0,
    recipientUsername: "bob",
    unreadCount: 2,
  };
  const value = {
    ok: true as const,
    data: { items: [item], totalUnreadCount: 7 },
    meta: { requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9" },
  };
  expect(unreadListSuccessSchema.parse(value)).toEqual(value);
  expect(listUnreadConversations200Schema.parse(value)).toEqual(value);
  for (const schema of [
    unreadListSuccessSchema,
    listUnreadConversations200Schema,
  ]) {
    for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, undefined]) {
      expect(
        schema.safeParse({
          ...value,
          data: { ...value.data, totalUnreadCount: count },
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          ...value,
          data: { ...value.data, items: [{ ...item, unreadCount: count }] },
        }).success,
      ).toBe(false);
    }
  }
});

test("history generated wire keeps closed snapshot fields and the existing author/ISO message contract", () => {
  const value = {
    ok: true as const,
    data: {
      items: [
        {
          id: "message",
          conversationId: "conversation",
          authorId: "author",
          text: "synthetic",
          sequence: 1,
          createdAt: "2026-10-08T00:00:00.000Z",
        },
      ],
      pageInfo: { nextCursor: null, hasMore: false },
      baselineCursor: 0,
      watermark: 1,
    },
    meta: { requestId: "ab6c77d6-fbd6-4d22-9780-84a6e284cde9" },
  };
  expect(listHistory200Schema.parse(value)).toEqual(value);
  expect(
    listHistory200Schema.safeParse({
      ...value,
      data: { ...value.data, watermark: Number.MAX_SAFE_INTEGER + 1 },
    }).success,
  ).toBe(false);
  expect(
    listHistory200Schema.safeParse({
      ...value,
      data: {
        ...value.data,
        pageInfo: { ...value.data.pageInfo, unexpected: true },
      },
    }).success,
  ).toBe(false);
  expect(
    listHistory200Schema.safeParse({
      ...value,
      data: {
        ...value.data,
        items: [{ ...value.data.items[0], createdAt: 1 }],
      },
    }).success,
  ).toBe(false);
});
test("generated query schemas preserve integer positions and page limits", () => {
  expect(
    listHistoryQueryParamsSchema.parse({ after: Number.MAX_SAFE_INTEGER })
      ?.after,
  ).toBe(Number.MAX_SAFE_INTEGER);
  expect(
    listHistoryQueryParamsSchema.safeParse({
      after: Number.MAX_SAFE_INTEGER + 1,
    }).success,
  ).toBe(false);
  expect(listHistoryQueryParamsSchema.safeParse({ after: 1.5 }).success).toBe(
    false,
  );
  expect(listHistoryQueryParamsSchema.safeParse({ limit: 1.5 }).success).toBe(
    false,
  );
  expect(
    listUnreadConversationsQueryParamsSchema.safeParse({ limit: 1.5 }).success,
  ).toBe(false);
  expect(
    searchUsersQueryParamsSchema.safeParse({ q: "a", limit: 1.5 }).success,
  ).toBe(false);
});

test("directory source and generated query preserve independent search length boundaries", () => {
  for (const [q, expected] of [
    ["", false],
    ["a", true],
    ["a".repeat(32), true],
    ["a".repeat(33), false],
  ] as const) {
    expect(directoryQuerySchema.safeParse({ q }).success).toBe(expected);
    expect(searchUsersQueryParamsSchema.safeParse({ q }).success).toBe(
      expected,
    );
  }
});
