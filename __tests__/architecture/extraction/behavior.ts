import { expect } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import {
  CommonErrorCode,
  ConversationErrorCode,
  ConversationSuccessCode,
  DirectoryErrorCode,
} from "@insta/contracts/errors";
import { get } from "svelte/store";
import type {
  Conversations,
  Directory,
} from "../../../apps/be-insta/src/domains/conversations/index";

type ServerApi =
  typeof import("../../../apps/be-insta/src/domains/conversations/index");
type BrowserApi =
  typeof import("../../../apps/fe-insta/src/domains/conversations/browser/state/index");

export const exerciseConversations = async ({
  server,
  browser,
}: Readonly<{ server: ServerApi; browser: BrowserApi }>) => {
  // Synthetic validated actor supplied by the host auth boundary, never an auth grant.
  const actor: Parameters<ServerApi["startConversation"]>[0]["actor"] = {
    userId: "alice" as Parameters<
      ServerApi["startConversation"]
    >[0]["actor"]["userId"],
    backendSessionId: "synthetic-session" as Parameters<
      ServerApi["startConversation"]
    >[0]["actor"]["backendSessionId"],
    username: "alice",
    accessExpiresAt: 1000,
  };
  let pairs = 0;
  const dependencies: Readonly<{
    directory: Directory;
    conversations: Conversations;
  }> = {
    directory: {
      findPublicUser: async ({
        id,
      }): ReturnType<Directory["findPublicUser"]> =>
        id === "bob"
          ? Result.Ok({ id, username: "bob" })
          : Result.Error(DirectoryErrorCode.UserNotFound),
    },
    conversations: {
      startPair: async ({
        participantIds,
      }): ReturnType<Conversations["startPair"]> => {
        pairs++;
        expect(participantIds).toEqual(["alice", "bob"]);
        return Result.Ok({
          code: ConversationSuccessCode.ConversationCreated,
          conversation: {
            id: "pair",
            participantIds,
            lastSequence: 0,
            lastActivityAt: 0,
          },
        });
      },
      listUnread: async () => Result.Ok({ items: [], totalUnreadCount: 0 }),
      history: async () =>
        Result.Error(ConversationErrorCode.ConversationForbidden),
    },
  };
  const input = { actor, recipientId: "alice", operationId: "operation" };
  const self = await server.startConversation(input, dependencies);
  expect(String(self.isError() && self.getError())).toBe("SELF_CONVERSATION");
  const missing = await server.startConversation(
    { ...input, recipientId: "missing" },
    dependencies,
  );
  expect(String(missing.isError() && missing.getError())).toBe(
    "RECIPIENT_NOT_FOUND",
  );
  const unavailable = await server.startConversation(
    { ...input, recipientId: "bob" },
    {
      ...dependencies,
      directory: {
        findPublicUser: async () =>
          Result.Error(CommonErrorCode.DependencyUnavailable),
      },
    },
  );
  expect(String(unavailable.isError() && unavailable.getError())).toBe(
    "DEPENDENCY_UNAVAILABLE",
  );
  const created = await server.startConversation(
    { ...input, recipientId: "bob" },
    dependencies,
  );
  expect(String(created.isOk() && created.get().code)).toBe(
    "CONVERSATION_CREATED",
  );
  expect(pairs).toBe(1);

  const currentActor = { userId: "alice", generation: "one" };
  const store = browser.createConversationStore({
    initial: [],
    actor: currentActor,
  });
  const independent = browser.createConversationStore({
    initial: [],
    actor: currentActor,
  });
  let releases = 0;
  const history =
    Promise.withResolvers<Parameters<typeof store.hydrate>[0]["history"]>();
  const subscribed = Promise.withResolvers<void>();
  const session = browser.createConversationSession({
    actor: currentActor,
    store,
    currentActor: () => currentActor,
    history: () => history.promise,
    subscribe: async () => {
      subscribed.resolve();
      return () => {
        releases++;
      };
    },
    start: async () => {
      throw new Error("No implicit business mutation");
    },
    openConversation: async () => {
      throw new Error("No implicit navigation");
    },
  });
  const synchronizing = session.synchronize("pair");
  await subscribed.promise;
  store.clear();
  history.resolve({
    items: [
      {
        id: "message",
        conversationId: "pair",
        authorId: "bob",
        text: "synthetic",
        sequence: 1,
        createdAt: "2026-10-09T00:00:00.000Z",
      },
    ],
    baselineCursor: 0,
    watermark: 1,
    pageInfo: { hasMore: false, nextCursor: null },
  });
  await synchronizing;
  expect(releases).toBe(1);
  expect(get(store.view).histories.size).toBe(0);
  expect(get(independent.view).histories.size).toBe(0);
  store.select("pair");
  expect(get(independent.view).selectedId).toBeNull();
  store.clear();
};
