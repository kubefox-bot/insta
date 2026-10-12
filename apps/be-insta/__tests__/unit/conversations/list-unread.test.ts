import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import {
  CommonErrorCode,
  ConversationErrorCode,
  DirectoryErrorCode,
} from "@insta/contracts/errors";
import type { Conversation } from "../../../src/domains/conversations/domain/types";
import { listUnreadConversations } from "../../../src/domains/conversations/use-cases/list/read-unread";
import type { SessionId, UserId } from "../../../src/domains/users/index";

const actorId = "000000000000000000000001" as UserId;
const eddId = "000000000000000000000002" as UserId;
const bobId = "000000000000000000000003" as UserId;
const actor = {
  userId: actorId,
  backendSessionId: "fixture-session" as SessionId,
  username: "alice",
  accessExpiresAt: 10,
};
const conversations = [
  {
    id: "100000000000000000000001",
    participantIds: [actorId, eddId] as const,
    lastSequence: 2,
    lastActivityAt: 20,
  },
  {
    id: "100000000000000000000002",
    participantIds: [bobId, actorId] as const,
    lastSequence: 4,
    lastActivityAt: 10,
  },
] as const;
const unused = async (): Promise<never> => {
  throw new Error("Unused conversation port operation");
};
const conversationsReader = (items: readonly Conversation[]) => ({
  startPair: unused,
  history: unused,
  listUnread: async () =>
    Result.Ok({
      items: items.map((item) => ({ ...item, unreadCount: 2 })),
      totalUnreadCount: 7,
    }),
});

test("conversation list carries the other participant username per item", async () => {
  const result = await listUnreadConversations(
    { actor, limit: 20 },
    {
      conversations: conversationsReader(conversations),
      quota: { consume: async () => Result.Ok("allowed" as const) },
      directory: {
        findPublicUser: async ({ id }) =>
          Result.Ok({
            id,
            username: id === eddId ? "edd" : "bob",
          }),
      },
    },
  );

  if (result.isError()) throw new Error(result.getError());
  expect(result.get()).toEqual({
    totalUnreadCount: 7,
    items: [
      { ...conversations[0], unreadCount: 2, recipientUsername: "edd" },
      { ...conversations[1], unreadCount: 2, recipientUsername: "bob" },
    ],
  });
});

test("conversation remains listed when its other participant is unavailable", async () => {
  const result = await listUnreadConversations(
    { actor, limit: 20 },
    {
      conversations: conversationsReader([conversations[0]]),
      quota: { consume: async () => Result.Ok("allowed" as const) },
      directory: {
        findPublicUser: async () =>
          Result.Error(DirectoryErrorCode.UserNotFound),
      },
    },
  );

  if (result.isError()) throw new Error(result.getError());
  expect(result.get()).toEqual({
    totalUnreadCount: 7,
    items: [{ ...conversations[0], unreadCount: 2, recipientUsername: null }],
  });
});

test("conversation list reports directory infrastructure failure", async () => {
  const result = await listUnreadConversations(
    { actor, limit: 20 },
    {
      conversations: conversationsReader([conversations[0]]),
      quota: { consume: async () => Result.Ok("allowed" as const) },
      directory: {
        findPublicUser: async () =>
          Result.Error(CommonErrorCode.DependencyUnavailable),
      },
    },
  );

  expect(result.isError()).toBe(true);
  if (!result.isError()) throw new Error("Expected a directory failure");
  expect(String(result.getError())).toBe("DEPENDENCY_UNAVAILABLE");
});

test("conversation list preserves repository failure rather than unread zero", async () => {
  const result = await listUnreadConversations(
    { actor, limit: 20 },
    {
      conversations: {
        ...conversationsReader([]),
        listUnread: async () =>
          Result.Error(CommonErrorCode.DependencyUnavailable),
      },
      quota: { consume: async () => Result.Ok("allowed" as const) },
      directory: { findPublicUser: unused },
    },
  );
  expect(String(result.isError() && result.getError())).toBe(
    "DEPENDENCY_UNAVAILABLE",
  );
});

test("conversation list rejects a repository row belonging to another actor", async () => {
  const result = await listUnreadConversations(
    { actor, limit: 20 },
    {
      conversations: conversationsReader([
        { ...conversations[0], participantIds: [eddId, bobId] },
      ]),
      quota: { consume: async () => Result.Ok("allowed" as const) },
      directory: { findPublicUser: unused },
    },
  );
  expect(String(result.isError() && result.getError())).toBe(
    "DEPENDENCY_UNAVAILABLE",
  );
});

for (const code of [
  ConversationErrorCode.ConversationsRateLimited,
  CommonErrorCode.DependencyUnavailable,
] as const) {
  test(`unread quota ${code} prevents persistence`, async () => {
    const result = await listUnreadConversations(
      { actor, limit: 20 },
      {
        conversations: { ...conversationsReader([]), listUnread: unused },
        directory: { findPublicUser: unused },
        quota: {
          consume: async () =>
            code === ConversationErrorCode.ConversationsRateLimited
              ? Result.Ok("limited")
              : Result.Error("unavailable"),
        },
      },
    );
    expect(result.isError() && result.getError()).toBe(code);
  });
}
