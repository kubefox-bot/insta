import { expect, test } from "bun:test";
import { createResume } from "../../../apps/fe-insta/src/domains/auth-continuation/browser/index";
import {
  createIntent,
  type Intent,
  type Intents,
  resolveResume,
} from "../../../apps/fe-insta/src/domains/auth-continuation/server/index";

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
  return { records, intents };
};
test("story selection consumes and replays only its operation, context, actor and generation", async () => {
  const { intents, records } = setup();
  const operationId = crypto.randomUUID();
  await createIntent(
    {
      input: { type: "create_story", operationId },
      context: "protected",
      now: 100,
      registrationExpiresAt: 200,
    },
    { intents, uuid: () => "chosen" },
  );
  const input = {
    intentId: "chosen",
    context: "protected",
    actor: { userId: "owner", generation: "S1" },
    now: 150,
  };
  const target = { type: "create_story" as const, operationId };
  const targets = { resolve: async () => target };
  expect((await resolveResume(input, { intents, targets })).isOk()).toBe(true);
  expect(records.get("chosen")?.target).toEqual(target);
  expect((await resolveResume(input, { intents, targets })).isOk()).toBe(true);
  for (const changed of [
    { ...input, context: "foreign" },
    { ...input, now: 200 },
    { ...input, actor: { userId: "other", generation: "S1" } },
    { ...input, actor: { userId: "owner", generation: "S2" } },
  ])
    expect((await resolveResume(changed, { intents, targets })).isError()).toBe(
      true,
    );
  expect(
    (
      await resolveResume(input, {
        intents,
        targets: {
          resolve: async () => ({
            ...target,
            operationId: crypto.randomUUID(),
          }),
        },
      })
    ).isError(),
  ).toBe(true);
});
test("story resume opens only one ready scenario without conversation effects", async () => {
  const opened: string[] = [];
  const operationId = crypto.randomUUID();
  const resume = createResume({
    currentGeneration: () => "S1",
    resolveResume: async () => ({ type: "create_story", operationId }),
    openConversation: () => {
      throw new Error("Wrong capability");
    },
    openStory: (target) => {
      opened.push(target.operationId);
    },
  });
  expect(
    await Promise.all([
      resume({ intentId: "chosen" }),
      resume({ intentId: "chosen" }),
    ]),
  ).toEqual([true, true]);
  expect(await resume({ intentId: "chosen" })).toBe(true);
  expect(opened).toEqual([operationId]);
});

import { get } from "svelte/store";
import { createRecovery } from "../../../apps/fe-insta/src/domains/auth-continuation/browser/index";
import { createPendingDrafts } from "../../../apps/fe-insta/src/domains/conversations/browser/index";

test("a guest can explicitly select a story action without any text source", async () => {
  const recovery = createRecovery({
    pending: createPendingDrafts(),
    create: async (input) => ({
      intentId: input.operationId,
      expiresAt: Date.now() + 60000,
    }),
    cancel: async () => true,
    uuid: () => crypto.randomUUID(),
  });
  expect(recovery.begin).toBeFunction();
  const input = {
    type: "create_story" as const,
    operationId: crypto.randomUUID(),
  };
  const receipt = await recovery.begin({ input });
  expect(receipt?.intentId).toBe(input.operationId);
  expect(get(recovery.view).kind).toBe("ready");
  recovery.dispose();
});

import * as continuation from "../../../apps/fe-insta/src/domains/auth-continuation/server/index";

test("target dispatcher rechecks active story identity and never calls conversation start", async () => {
  expect(continuation.createTargets).toBeFunction();
  const actor = { userId: "owner", generation: "S1" };
  const intent = {
    type: "create_story" as const,
    operationId: crypto.randomUUID(),
    intentId: crypto.randomUUID(),
    context: "safe",
    createdAt: 100,
    expiresAt: 200,
    state: "pending" as const,
  };
  const calls: string[] = [];
  const targets = continuation.createTargets({
    conversations: {
      resolve: async () => {
        calls.push("conversation");
        return undefined;
      },
    },
    stories: continuation.createStoryTargets({
      resolve: async (input) =>
        input.actor.generation === "S1"
          ? { type: input.type, operationId: input.operationId }
          : undefined,
    }),
  });
  expect(await targets.resolve({ intent, actor })).toEqual({
    type: "create_story",
    operationId: intent.operationId,
  });
  expect(
    await targets.resolve({ intent, actor: { ...actor, generation: "S2" } }),
  ).toBeUndefined();
  expect(calls).toEqual([]);
});

test("story callback from an older generation cannot open or restore", async () => {
  const target = Promise.withResolvers<{
    type: "resume_story";
    operationId: string;
  }>();
  const state = { generation: "old" };
  const opened: string[] = [];
  const resume = createResume({
    resolveResume: () => target.promise,
    currentGeneration: () => state.generation,
    openConversation: () => {
      throw new Error("Wrong capability");
    },
    openStory: ({ operationId }) => {
      opened.push(operationId);
    },
  });
  const pending = resume({ intentId: crypto.randomUUID() });
  state.generation = "new";
  target.resolve({ type: "resume_story", operationId: crypto.randomUUID() });
  expect(await pending).toBe(false);
  expect(opened).toEqual([]);
});

test("late story selection receipt is cancelled after explicit logout", async () => {
  const created = Promise.withResolvers<{
    intentId: string;
    expiresAt: number;
  }>();
  const cancelled: string[] = [];
  const recovery = createRecovery({
    pending: createPendingDrafts(),
    create: () => created.promise,
    cancel: async (id) => {
      cancelled.push(id);
      return true;
    },
    uuid: () => crypto.randomUUID(),
  });
  const pending = recovery.begin({
    input: { type: "create_story", operationId: crypto.randomUUID() },
  });
  recovery.explicitLogout({ actor: null, status: "guest" });
  created.resolve({ intentId: "late", expiresAt: Date.now() + 60000 });
  expect(await pending).toBeUndefined();
  expect(cancelled).toEqual(["late"]);
  expect(get(recovery.view)).toEqual({ kind: "idle" });
  recovery.dispose();
});

test("superseded selection cannot open late targets while its replacement restores across navigation", async () => {
  const delayed = Promise.withResolvers<{
    type: "create_story";
    operationId: string;
  }>();
  const state = { selected: "old" };
  const opened: string[] = [];
  const restored: string[] = [];
  const rejected: string[] = [];
  const resume = createResume({
    currentGeneration: () => "current",
    resolveResume: (id) =>
      id === "old"
        ? delayed.promise
        : Promise.resolve({
            type: "create_story",
            operationId: crypto.randomUUID(),
          }),
    openConversation: () => {
      throw Error("Unexpected conversation");
    },
    openStory: ({ operationId }) => {
      opened.push(operationId);
      state.selected = "navigated";
    },
    onResumed: ({ intentId }) => restored.push(intentId),
    onRejected: (id) => rejected.push(id),
  });
  const previous = resume({
    intentId: "old",
    isSelected: () => state.selected === "old",
  });
  state.selected = "new";
  expect(
    await resume({
      intentId: "new",
      isSelected: () => state.selected === "new",
    }),
  ).toBe(true);
  delayed.resolve({ type: "create_story", operationId: crypto.randomUUID() });
  expect(await previous).toBe(false);
  expect(opened).toHaveLength(1);
  expect(restored).toEqual(["new"]);
  expect(rejected).toEqual([]);
});
