import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createAccountNavigation } from "../../../apps/fe-insta/src/app/conversations/browser/account-navigation";
import { ConversationRequestError } from "../../../apps/fe-insta/src/domains/conversations/browser/lib/http/request-error";
import { mergeMessages } from "../../../apps/fe-insta/src/domains/conversations/browser/merge";
import { createConversationStore } from "../../../apps/fe-insta/src/domains/conversations/browser/store";
import { conversationIssues } from "../../../apps/fe-insta/src/domains/conversations/conts";
import { loadConversationHistory } from "../../../apps/fe-insta/src/domains/conversations/server/history";

for (const status of [403, 404])
  test(`history ${status} is inaccessible, not a service outage`, async () => {
    const result = await loadConversationHistory(
      Response.json({ ok: false, error: { code: "FORBIDDEN" } }, { status }),
    );
    expect(result.issue).toBe("HISTORY_FORBIDDEN");
  });
test("503 remains a retryable service error", async () => {
  expect(
    (
      await loadConversationHistory(
        Response.json({ ok: false }, { status: 503 }),
      )
    ).issue,
  ).toBe(conversationIssues.historyUnavailable);
});
for (const failure of [
  new Error("FORBIDDEN"),
  new ConversationRequestError(403, undefined, "CONVERSATION_FORBIDDEN"),
  new ConversationRequestError(404, undefined, "CONVERSATION_NOT_FOUND"),
])
  test(`runtime denial clears cached messages: ${failure.message}`, async () => {
    const actor = { userId: "alice", generation: "one" };
    const store = createConversationStore({ initial: [], actor });
    store.hydrate({
      actor,
      conversationId: "c",
      history: {
        items: [
          {
            id: "m",
            conversationId: "c",
            authorId: "alice",
            text: "private",
            sequence: 1,
            createdAt: new Date(0).toISOString(),
          },
        ],
        watermark: 1,
        baselineCursor: 0,
        pageInfo: { hasMore: false, nextCursor: null },
      },
    });
    await store.synchronize(
      { actor, conversationId: "c" },
      {
        merge: mergeMessages,
        subscribe: async () => {
          throw failure;
        },
        history: async () => {
          throw new Error("Must not read after denial");
        },
      },
    );
    expect(get(store.view).histories.get("c")?.issue).toBe("HISTORY_FORBIDDEN");
    expect(get(store.view).histories.get("c")?.items).toEqual([]);
  });
test("account switch through guest leaves an old detail route; same-user refresh stays", async () => {
  const visits: string[] = [];
  const navigation = createAccountNavigation({
    initialUserId: "alice",
    isDetail: () => true,
    navigate: async (path) => {
      visits.push(path);
    },
  });
  await navigation.reconcile({ userId: "alice" });
  await navigation.reconcile(null);
  await navigation.reconcile({ userId: "edd" });
  await navigation.reconcile({ userId: "edd" });
  expect(visits).toEqual(["/conversations"]);
});
test("initial login and a switch while already in the list do not redirect", async () => {
  const visits: string[] = [];
  const navigation = createAccountNavigation({
    initialUserId: null,
    isDetail: () => false,
    navigate: async (path) => {
      visits.push(path);
    },
  });
  await navigation.reconcile({ userId: "alice" });
  await navigation.reconcile({ userId: "edd" });
  expect(visits).toEqual([]);
});
