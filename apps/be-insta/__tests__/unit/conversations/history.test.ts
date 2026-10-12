import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import {
  CommonErrorCode,
  ConversationErrorCode,
} from "@insta/contracts/errors";
import { listHistory } from "../../../src/domains/conversations/index";
import type { SessionId, UserId } from "../../../src/domains/users/index";

const actorId = "000000000000000000000001" as UserId;
const input = {
  actor: {
    userId: actorId,
    backendSessionId: "fixture-session" as SessionId,
    username: "alice",
    accessExpiresAt: 100,
  },
  conversationId: "100000000000000000000001",
  range: { direction: "recent" as const },
  limit: 50,
};
const history = {
  items: [],
  pageInfo: { nextCursor: null, hasMore: false },
  baselineCursor: 0,
  watermark: 0,
};

for (const [admission, expected] of [
  ["unavailable", CommonErrorCode.DependencyUnavailable],
  ["limited", ConversationErrorCode.ConversationsRateLimited],
] as const) {
  test(`direct history read blocks ${expected} before persistence`, async () => {
    const calls: string[] = [];
    const result = await listHistory(input, {
      quota: {
        consume: async (
          actor,
        ): Promise<Result<"allowed" | "limited", "unavailable">> => {
          calls.push(`quota:${actor}`);
          return admission === "unavailable"
            ? Result.Error("unavailable")
            : Result.Ok("limited");
        },
      },
      conversations: {
        startPair: async () =>
          Result.Error(CommonErrorCode.DependencyUnavailable),
        listUnread: async () =>
          Result.Error(CommonErrorCode.DependencyUnavailable),
        history: async () => {
          calls.push("history");
          return Result.Ok(history);
        },
      },
    });
    expect(result.isError()).toBe(true);
    if (!result.isError())
      throw new Error("Expected history admission failure");
    expect(result.getError()).toBe(expected);
    expect(calls).toEqual([`quota:${actorId}`]);
  });
}

test("direct history read consumes quota before persistence", async () => {
  const calls: string[] = [];
  const result = await listHistory(input, {
    quota: {
      consume: async (actor) => {
        calls.push(`quota:${actor}`);
        return Result.Ok("allowed");
      },
    },
    conversations: {
      startPair: async () =>
        Result.Error(CommonErrorCode.DependencyUnavailable),
      listUnread: async () =>
        Result.Error(CommonErrorCode.DependencyUnavailable),
      history: async () => {
        calls.push("history");
        return Result.Ok(history);
      },
    },
  });
  expect(result.isOk()).toBe(true);
  expect(calls).toEqual([`quota:${actorId}`, "history"]);
});
