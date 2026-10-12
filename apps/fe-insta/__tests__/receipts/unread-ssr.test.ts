import { expect, test } from "bun:test";
import { loadConversationSnapshot } from "../../src/domains/conversations/server/snapshot";
import { createRefreshScenario } from "./ssr/refresh";

test("SSR snapshot is request-owned and carries exact canonical totals; guest, failure and zero remain distinct", async () => {
  const alice = { userId: "alice", generation: "a" };
  const bob = { userId: "bob", generation: "b" };
  const aliceResponse = Promise.withResolvers<Response>();
  const first = loadConversationSnapshot({
    actor: alice,
    read: () => aliceResponse.promise,
  });
  const second = await loadConversationSnapshot({
    actor: bob,
    read: async () =>
      Response.json({ ok: true, data: { items: [], totalUnreadCount: 0 } }),
  });
  aliceResponse.resolve(
    Response.json({ ok: true, data: { items: [], totalUnreadCount: 7 } }),
  );
  expect(await first).toMatchObject({
    conversationsActor: alice,
    conversationsTotalUnreadCount: 7,
  });
  expect(second).toMatchObject({
    conversationsActor: bob,
    conversationsTotalUnreadCount: 0,
  });
  expect(
    await loadConversationSnapshot({
      actor: null,
      read: async () => {
        throw new Error("Guest must not load private state");
      },
    }),
  ).toMatchObject({
    conversationsActor: null,
    conversationsTotalUnreadCount: undefined,
    conversationsIssue: undefined,
  });
  expect(
    await loadConversationSnapshot({
      actor: alice,
      read: async () => {
        throw new Error("Unavailable");
      },
    }),
  ).toMatchObject({
    conversationsActor: alice,
    conversationsTotalUnreadCount: undefined,
    conversationsIssue: "CONVERSATIONS_UNAVAILABLE",
  });
});

test("parallel private SSR reads share refresh coordination and a cached actor cannot bypass generation/logout guards", async () => {
  const scenario = createRefreshScenario();
  const actor = { userId: "alice", generation: "login1" };
  const first = loadConversationSnapshot({
    actor,
    read: async () => {
      const result = await scenario.read(actor);
      if (result.isError()) throw new Error(result.getError().code);
      return Response.json({ ok: true, data: result.get() });
    },
  });
  const second = scenario.read(actor);
  const deadline = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => deadline.resolve(false), 1000);
  try {
    expect(
      await Promise.race([scenario.waiting.then(() => true), deadline.promise]),
    ).toBe(true);
    expect(scenario.refreshCalls()).toBe(1);
  } finally {
    clearTimeout(timer);
    scenario.release();
    await Promise.all([first, second]);
  }
  expect(await first).toMatchObject({
    conversationsActor: actor,
    conversationsTotalUnreadCount: 7,
    conversationsIssue: undefined,
  });
  expect((await second).isOk()).toBe(true);
  expect(scenario.tokens).toEqual([
    "access",
    "access",
    "rotated-access",
    "rotated-access",
  ]);
  expect(scenario.state.binding).toMatchObject({
    revision: 1,
    backendSessionId: "login1",
    credentials: "rotated-cipher",
  });
  const changed = await scenario.read({
    ...actor,
    generation: "another-login",
  });
  expect(changed).toMatchObject({
    tag: "Error",
    error: { code: "ACTOR_CHANGED", status: 409 },
  });
  const current = scenario.state.binding;
  if (!current) throw new Error("Missing binding after refresh");
  scenario.state.binding = { ...current, blocked: true };
  expect(await scenario.read(actor)).toMatchObject({
    tag: "Error",
    error: { code: "SESSION_REQUIRED", status: 401 },
  });
  expect(scenario.tokens).toHaveLength(4);
});
