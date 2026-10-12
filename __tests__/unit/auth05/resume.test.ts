import { expect, test } from "bun:test";
import { createResume } from "../../../apps/fe-insta/src/domains/auth-continuation/browser/index";

test("duplicate continuation opens composer once", async () => {
  let opens = 0;
  const resume = createResume({
    openStory: () => {
      throw new Error("Unexpected story target");
    },
    currentGeneration: () => "S1",
    resolveResume: async () => ({
      type: "compose_message",
      conversationId: "conversation",
    }),
    openConversation: () => {
      opens += 1;
    },
  });
  const results = await Promise.all([
    resume({ intentId: "one" }),
    resume({ intentId: "one" }),
  ]);
  expect(results).toEqual([true, true]);
  expect(opens).toBe(1);
});
test("identity changes while continuation is in flight discard callback", async () => {
  let generation = "S1";
  let opens = 0;
  const barrier = Promise.withResolvers<{
    type: "open_conversation";
    conversationId: string;
  }>();
  const resume = createResume({
    openStory: () => {
      throw new Error("Unexpected story target");
    },
    currentGeneration: () => generation,
    resolveResume: () => barrier.promise,
    openConversation: () => {
      opens += 1;
    },
  });
  const pending = resume({ intentId: "one" });
  generation = "S2";
  barrier.resolve({ type: "open_conversation", conversationId: "safe" });
  expect(await pending).toBe(false);
  expect(opens).toBe(0);
});
test("an unknown callback outcome is never reported as a successful replay", async () => {
  let calls = 0;
  const resume = createResume({
    openStory: () => {
      throw new Error("Unexpected story target");
    },
    currentGeneration: () => "S1",
    resolveResume: async () => ({
      type: "open_conversation",
      conversationId: "safe",
    }),
    openConversation: () => {
      calls += 1;
      throw new Error("unknown UI outcome");
    },
  });
  expect(await resume({ intentId: "one" })).toBe(false);
  expect(await resume({ intentId: "one" })).toBe(false);
  expect(calls).toBe(1);
});

test("validated resume callback is fenced across delayed navigation", async () => {
  let generation = "one";
  const navigation = Promise.withResolvers<void>();
  const restored: string[] = [];
  const resume = createResume({
    openStory: () => {
      throw new Error("Unexpected story target");
    },
    resolveResume: async () => ({
      type: "compose_message",
      conversationId: "safe",
    }),
    currentGeneration: () => generation,
    openConversation: () => navigation.promise,
    onResumed: ({ intentId }) => {
      restored.push(intentId);
    },
  });
  const operation = resume({ intentId: "selected" });
  await Promise.resolve();
  generation = "two";
  navigation.resolve();
  expect(await operation).toBe(false);
  expect(restored).toEqual([]);
});

test("failed safe resume reports selected intent only while its generation remains current", async () => {
  const rejected: string[] = [];
  const resume = createResume({
    openStory: () => {
      throw new Error("Unexpected story target");
    },
    resolveResume: async () => undefined,
    currentGeneration: () => "owner",
    openConversation: () => {
      throw new Error("Unsafe open");
    },
    onRejected: (intentId) => {
      rejected.push(intentId);
    },
  });
  expect(await resume({ intentId: "failed" })).toBe(false);
  expect(rejected).toEqual(["failed"]);
});
