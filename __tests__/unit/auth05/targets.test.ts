import { expect, test } from "bun:test";
import type { Intent } from "../../../apps/fe-insta/src/domains/auth-continuation/server/index";
import { createConversationTargets } from "../../../apps/fe-insta/src/domains/auth-continuation/server/index";
import { loadStartedConversation } from "../../../apps/fe-insta/src/domains/conversations/server/targets/index";

const actor = { userId: "a".repeat(24), generation: crypto.randomUUID() };
const recipientId = "b".repeat(24);
const intent: Intent = {
  type: "compose_message",
  recipientId,
  intentId: crypto.randomUUID(),
  context: "browser",
  operationId: crypto.randomUUID(),
  createdAt: 100,
  expiresAt: 200,
  state: "pending",
};
const reply = (participants = [actor.userId, recipientId]) =>
  loadStartedConversation(
    Response.json({
      ok: true,
      data: {
        conversation: {
          id: "c".repeat(24),
          participantIds: participants,
          lastSequence: 0,
          lastActivityAt: 100,
        },
        code: "CONVERSATION_CREATED",
      },
    }),
  );
test("continuation target uses selected recipient and current actor through owned conversation API", async () => {
  const inputs: unknown[] = [];
  const targets = createConversationTargets({
    start: async (input) => {
      inputs.push(input);
      return reply();
    },
  });
  expect(await targets.resolve({ intent, actor })).toEqual({
    type: "compose_message",
    conversationId: "c".repeat(24),
  });
  expect(inputs).toEqual([{ recipientId, actor }]);
});
test("foreign participant or missing recipient cannot become a continuation target", async () => {
  expect(
    await createConversationTargets({
      start: async () => reply(["foreign", recipientId]),
    }).resolve({ intent, actor }),
  ).toBeUndefined();
  const missing = { ...intent, recipientId: undefined };
  expect(
    await createConversationTargets({
      start: async () => {
        throw new Error("Missing target must not call provider");
      },
    }).resolve({ intent: missing, actor }),
  ).toBeUndefined();
});
test("provider failure is not silent target absence; unknown wire shape fails validation", async () => {
  for (const response of [
    Response.json(
      {
        ok: false,
        error: { code: "DEPENDENCY_UNAVAILABLE", message: "Failure" },
        meta: { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      },
      { status: 503 },
    ),
    Response.json({ ok: true, data: { arbitrary: "not a conversation" } }),
  ]) {
    await expect(
      createConversationTargets({
        start: async () => loadStartedConversation(response),
      }).resolve({
        intent,
        actor,
      }),
    ).rejects.toThrow();
  }
  expect(
    await createConversationTargets({
      start: async () =>
        loadStartedConversation(
          Response.json(
            {
              ok: false,
              error: { code: "RECIPIENT_NOT_FOUND", message: "Failure" },
              meta: { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
            },
            { status: 404 },
          ),
        ),
    }).resolve({ intent, actor }),
  ).toBeUndefined();
});

test("consumed continuation rejects changed actor/generation before calling effectful start provider", async () => {
  const consumed: Intent = {
    ...intent,
    state: "consumed",
    actorId: actor.userId,
    actorGeneration: actor.generation,
    target: { type: "compose_message", conversationId: "c".repeat(24) },
  };
  const targets = createConversationTargets({
    start: async () => {
      throw new Error("Rejected replay must not start a conversation");
    },
  });
  for (const changed of [
    { ...actor, userId: "d".repeat(24) },
    { ...actor, generation: crypto.randomUUID() },
  ]) {
    await expect(
      targets.resolve({ intent: consumed, actor: changed }),
    ).resolves.toBeUndefined();
  }
});
