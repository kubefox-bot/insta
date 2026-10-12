import { expect, test } from "bun:test";
import {
  createIntent,
  type Intent,
  type Intents,
  resolveResume,
} from "../../../apps/fe-insta/src/domains/auth-continuation/server/index";
import { requireFailure, requireSuccess } from "../../fixtures/outcome";

const setup = () => {
  const records = new Map<string, Intent>();
  const intents: Intents = {
    create: async (intent) => {
      records.set(intent.intentId, intent);
      return true;
    },
    find: async (id) => records.get(id),
    compare: async ({ previous, next }) => {
      if (records.get(previous.intentId) !== previous) return false;
      records.set(previous.intentId, next);
      return true;
    },
  };
  return { intents, records };
};
test("create and resume preserve selected recipient and bind replay to actor and context", async () => {
  const { intents, records } = setup();
  const created = await createIntent(
    {
      input: {
        type: "compose_message",
        recipientId: "recipient",
        operationId: crypto.randomUUID(),
      },
      context: "context",
      now: 100,
      registrationExpiresAt: 200,
    },
    { intents, uuid: () => "intent" },
  );
  expect(created.isOk()).toBe(true);
  expect(requireSuccess(created)).toEqual({
    intentId: "intent",
    expiresAt: 200,
  });
  const targets = {
    resolve: async () => ({
      type: "compose_message" as const,
      conversationId: "conversation",
    }),
  };
  const input = {
    intentId: "intent",
    context: "context",
    actor: { userId: "actor", generation: "S1" },
    now: 150,
  };
  expect(
    requireSuccess(await resolveResume(input, { intents, targets })),
  ).toEqual({
    type: "compose_message",
    conversationId: "conversation",
  });
  expect((await resolveResume(input, { intents, targets })).isOk()).toBe(true);
  expect(
    (
      await resolveResume(
        { ...input, context: "foreign" },
        { intents, targets },
      )
    ).isError(),
  ).toBe(true);
  expect(
    (
      await resolveResume(
        { ...input, actor: { userId: "other", generation: "S2" } },
        { intents, targets },
      )
    ).isError(),
  ).toBe(true);
  expect(
    (
      await resolveResume({ ...input, now: 200 }, { intents, targets })
    ).isError(),
  ).toBe(true);
  expect(records.get("intent")?.expiresAt).toBe(200);
});

import { cancelIntent } from "../../../apps/fe-insta/src/domains/auth-continuation/server/index";

test("cancel selected tab leaves the other pending; owner, expiry and future actions are denied", async () => {
  const { intents, records } = setup();
  for (const id of ["first", "second"]) {
    await createIntent(
      {
        input: {
          type: "open_conversation",
          recipientId: "recipient",
          operationId: crypto.randomUUID(),
        },
        context: "context",
        actor: { userId: "owner", generation: "S1" },
        now: 100,
      },
      { intents, uuid: () => id },
    );
  }
  expect(
    (
      await cancelIntent(
        { intentId: "first", context: "foreign", now: 120 },
        { intents },
      )
    ).isError(),
  ).toBe(true);
  expect(
    (
      await cancelIntent(
        {
          intentId: "first",
          context: "context",
          actor: { userId: "owner", generation: "S1" },
          now: 120,
        },
        { intents },
      )
    ).isOk(),
  ).toBe(true);
  expect(records.get("first")?.state).toBe("cancelled");
  expect(records.get("second")?.state).toBe("pending");
  const targets = {
    resolve: async () => ({
      type: "open_conversation" as const,
      conversationId: "safe",
    }),
  };
  expect(
    (
      await resolveResume(
        {
          intentId: "first",
          context: "context",
          actor: { userId: "owner", generation: "S1" },
          now: 130,
        },
        { intents, targets },
      )
    ).isError(),
  ).toBe(true);
  expect(
    (
      await resolveResume(
        {
          intentId: "second",
          context: "context",
          actor: { userId: "other", generation: "S2" },
          now: 130,
        },
        { intents, targets },
      )
    ).isError(),
  ).toBe(true);
  await createIntent(
    {
      input: { type: "create_story", operationId: crypto.randomUUID() },
      context: "context",
      now: 100,
    },
    { intents, uuid: () => "story" },
  );
  expect(
    (
      await resolveResume(
        {
          intentId: "story",
          context: "context",
          actor: { userId: "actor", generation: "S1" },
          now: 130,
        },
        { intents, targets },
      )
    ).isError(),
  ).toBe(true);
});
test("store failures, target disappearance and external redirect never consume", async () => {
  const { intents, records } = setup();
  await createIntent(
    {
      input: {
        type: "open_conversation",
        recipientId: "recipient",
        operationId: crypto.randomUUID(),
      },
      context: "context",
      now: 100,
    },
    { intents, uuid: () => "intent" },
  );
  const input = {
    intentId: "intent",
    context: "context",
    actor: { userId: "actor", generation: "S1" },
    now: 120,
  };
  const external = {
    resolve: async () => ({
      type: "open_conversation" as const,
      conversationId: "https://evil.test",
    }),
  };
  expect(
    (await resolveResume(input, { intents, targets: external })).isError(),
  ).toBe(true);
  expect(records.get("intent")?.state).toBe("pending");
  const unavailable = { resolve: async () => undefined };
  expect(
    (await resolveResume(input, { intents, targets: unavailable })).isError(),
  ).toBe(true);
  const down = {
    ...intents,
    find: async () => {
      throw new Error("unavailable");
    },
  };
  expect(
    String(
      requireFailure(
        await resolveResume(input, { intents: down, targets: external }),
      ),
    ),
  ).toBe("INTENT_UNAVAILABLE");
});
test("same protected context can close a pending S1 intent after actor expiry, but cannot cancel consumed replay", async () => {
  const { intents, records } = setup();
  const create = async (id: string) =>
    createIntent(
      {
        input: {
          type: "compose_message",
          recipientId: "recipient",
          operationId: crypto.randomUUID(),
        },
        context: "protected",
        actor: { userId: "owner", generation: "S1" },
        now: 100,
      },
      { intents, uuid: () => id },
    );
  await create("pending");
  expect(
    (
      await cancelIntent(
        { intentId: "pending", context: "foreign", now: 120 },
        { intents },
      )
    ).isError(),
  ).toBe(true);
  expect(
    (
      await cancelIntent(
        { intentId: "pending", context: "protected", now: 120 },
        { intents },
      )
    ).isOk(),
  ).toBe(true);
  expect(records.get("pending")?.state).toBe("cancelled");
  await create("consumed");
  const targets = {
    resolve: async () => ({
      type: "compose_message" as const,
      conversationId: "safe",
    }),
  };
  expect(
    (
      await resolveResume(
        {
          intentId: "consumed",
          context: "protected",
          actor: { userId: "owner", generation: "S1" },
          now: 120,
        },
        { intents, targets },
      )
    ).isOk(),
  ).toBe(true);
  expect(
    (
      await cancelIntent(
        { intentId: "consumed", context: "protected", now: 130 },
        { intents },
      )
    ).isError(),
  ).toBe(true);
  expect(records.get("consumed")?.state).toBe("consumed");
});
