import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createRecovery } from "../../../apps/fe-insta/src/domains/auth-continuation/browser/index";
import { createPendingDrafts } from "../../../apps/fe-insta/src/domains/conversations/browser/index";
import * as stories from "../../../apps/fe-insta/src/domains/stories/browser/index";

test("preview is instance-owned, restores same owner and releases each URL exactly once", () => {
  expect(stories.createStoryPreview).toBeFunction();
  const released: string[] = [];
  const previews = stories.createStoryPreview({
    uuid: () => "opaque",
    urls: {
      create: () => "blob:local",
      revoke: (url) => {
        released.push(url);
      },
    },
  });
  previews.replace({
    actor: { userId: "one", generation: "S1" },
    blob: new Blob(["private"]),
  });
  expect(previews.capture()).toEqual({
    actor: { userId: "one", generation: "S1" },
    previewId: "opaque",
  });
  expect(
    previews.restore({
      actor: { userId: "two", generation: "S2" },
      previewId: "opaque",
    }),
  ).toBe("missing");
  expect(
    previews.restore({
      actor: { userId: "one", generation: "S2" },
      previewId: "opaque",
    }),
  ).toBe("restored");
  expect(previews.capture()?.actor.generation).toBe("S2");
  const reloaded = stories.createStoryPreview();
  expect(
    reloaded.restore({
      actor: { userId: "one", generation: "S2" },
      previewId: "opaque",
    }),
  ).toBe("missing");
  previews.discard({ previewId: "opaque" });
  previews.dispose();
  expect(released).toEqual(["blob:local"]);
});
test("story expiry recovery stores only opaque handle and same owner restores without publishing", async () => {
  expect(stories.createStoryPreview).toBeFunction();
  const released: string[] = [];
  const created: unknown[] = [];
  const previews = stories.createStoryPreview({
    uuid: () => "opaque",
    urls: {
      create: () => "blob:local",
      revoke: (url) => {
        released.push(url);
      },
    },
  });
  const actor = { userId: "one", generation: "S1" };
  const next = { userId: "one", generation: "S2" };
  const pending = createPendingDrafts();
  const recovery = createRecovery({
    pending,
    uuid: () => crypto.randomUUID(),
    create: async (input) => {
      created.push(input);
      return { intentId: "selected", expiresAt: Date.now() + 60000 };
    },
    cancel: async () => true,
  });
  recovery.connectStory(previews);
  recovery.reconcile({ actor, status: "authenticated" });
  previews.replace({ actor, blob: new Blob(["private"]) });
  recovery.suspend({ actor, status: "authenticated" });
  recovery.reconcile({ actor: null, status: "guest" });
  await Promise.resolve();
  await Promise.resolve();
  expect(get(recovery.view).kind).toBe("ready");
  expect(JSON.stringify(created)).not.toContain("private");
  expect(JSON.stringify(created)).not.toContain("opaque");
  expect(
    pending.take({ intentId: "selected", actorId: "one" }),
  ).toBeUndefined();
  recovery.reconcile({ actor: next, status: "authenticated" });
  recovery.restore({
    intentId: "selected",
    target: { type: "resume_story", operationId: crypto.randomUUID() },
    actor: next,
  });
  expect(previews.capture()?.actor).toEqual(next);
  expect(released).toEqual([]);
  recovery.explicitLogout({ actor: next, status: "authenticated" });
  expect(previews.capture()).toBeUndefined();
  expect(released).toEqual(["blob:local"]);
  recovery.dispose();
});

test("changing account releases an available preview even without a suspended intent", () => {
  const released: string[] = [];
  const previews = stories.createStoryPreview({
    urls: {
      create: () => "blob:local",
      revoke: (url) => {
        released.push(url);
      },
    },
  });
  const recovery = createRecovery({
    pending: createPendingDrafts(),
    create: async () => undefined,
    cancel: async () => true,
    uuid: () => crypto.randomUUID(),
  });
  recovery.connectStory(previews);
  const actor = { userId: "one", generation: "S1" };
  recovery.reconcile({ actor, status: "authenticated" });
  previews.replace({ actor, blob: new Blob(["private"]) });
  recovery.reconcile({
    actor: { userId: "two", generation: "S2" },
    status: "authenticated",
  });
  expect(previews.capture()).toBeUndefined();
  expect(released).toEqual(["blob:local"]);
  recovery.dispose();
});

test("dispose while creating retires opaque preview exactly once and cannot revive view", async () => {
  const created =
    Promise.withResolvers<Readonly<{ intentId: string; expiresAt: number }>>();
  const released: string[] = [];
  const cancelled: string[] = [];
  const previews = stories.createStoryPreview({
    uuid: () => "opaque",
    urls: { create: () => "blob:local", revoke: (url) => released.push(url) },
  });
  const recovery = createRecovery({
    pending: createPendingDrafts(),
    uuid: () => "operation",
    create: () => created.promise,
    cancel: async (id) => {
      cancelled.push(id);
      return true;
    },
  });
  const actor = { userId: "one", generation: "S1" };
  const old = stories.createStoryPreview();
  const disconnect = recovery.connectStory(old);
  recovery.connectStory(previews);
  disconnect();
  previews.replace({ actor, blob: new Blob(["private"]) });
  recovery.suspend({ actor, status: "authenticated" });
  recovery.reconcile({ actor: null, status: "guest" });
  recovery.dispose();
  created.resolve({ intentId: "late", expiresAt: Date.now() + 60000 });
  await created.promise;
  await Promise.resolve();
  await Promise.resolve();
  expect(get(recovery.view)).toEqual({ kind: "idle" });
  expect(released).toEqual(["blob:local"]);
  expect(cancelled).toEqual(["late"]);
  previews.dispose();
  expect(released).toEqual(["blob:local"]);
});
