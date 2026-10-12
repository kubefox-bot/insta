import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createRecovery } from "../../../apps/fe-insta/src/domains/auth-continuation/browser/recovery/create";
import { createContinuationSelection } from "../../../apps/fe-insta/src/domains/auth-continuation/browser/selection/create";
import { createPendingDrafts } from "../../../apps/fe-insta/src/domains/conversations/browser/drafts/pending";

const alice = { userId: "alice", generation: "g1" };
const next = { userId: "alice", generation: "g2" };

test("pre-cleanup capture survives guest identity, restores only validated same-owner once and explicit logout clears it", async () => {
  const pending = createPendingDrafts();
  const created = Promise.withResolvers<
    Readonly<{ intentId: string; expiresAt: number }> | undefined
  >();
  const restored: string[] = [];
  const recovery = createRecovery({
    pending,
    create: () => created.promise,
    cancel: async () => true,
    uuid: () => "operation",
  });
  recovery.connect({
    capture: () => ({ actor: alice, recipientId: "bob", text: "private" }),
    restore: ({ text }) => restored.push(text),
  });
  recovery.suspend({ actor: alice, status: "authenticated" });
  recovery.reconcile({ actor: null, status: "guest" });
  created.resolve({ intentId: "selected", expiresAt: Date.now() + 60000 });
  await created.promise;
  await Promise.resolve();
  expect(get(recovery.view).kind).toBe("ready");
  recovery.reconcile({ actor: next, status: "authenticated" });
  recovery.restore({
    intentId: "selected",
    target: { type: "compose_message", conversationId: "safe" },
    actor: next,
  });
  recovery.restore({
    intentId: "selected",
    target: { type: "compose_message", conversationId: "safe" },
    actor: next,
  });
  expect(restored).toEqual(["private"]);
  pending.remember({ intentId: "other", text: "discard" });
  recovery.suspend({ actor: null, status: "pending" });
  expect(pending.take({ intentId: "other", actorId: "alice" })).toBeUndefined();
  recovery.dispose();
});

test("late intent completion after logout or actor switch cannot resurrect selected text", async () => {
  for (const changed of [
    { actor: null, status: "pending" as const },
    {
      actor: { userId: "bob", generation: "g2" },
      status: "authenticated" as const,
    },
  ]) {
    const pending = createPendingDrafts();
    const created = Promise.withResolvers<
      Readonly<{ intentId: string; expiresAt: number }> | undefined
    >();
    const cancelled: string[] = [];
    const recovery = createRecovery({
      pending,
      create: () => created.promise,
      cancel: async (id) => {
        cancelled.push(id);
        return true;
      },
      uuid: () => "operation",
    });
    recovery.connect({
      capture: () => ({ actor: alice, recipientId: "bob", text: "private" }),
      restore: () => {
        throw new Error("Unexpected restore");
      },
    });
    recovery.suspend({ actor: alice, status: "authenticated" });
    recovery.reconcile({ actor: null, status: "guest" });
    recovery.reconcile(changed);
    created.resolve({ intentId: "late", expiresAt: Date.now() + 60000 });
    await created.promise;
    await Promise.resolve();
    expect(get(recovery.view)).toEqual({ kind: "idle" });
    expect(
      pending.take({ intentId: "late", actorId: "alice" }),
    ).toBeUndefined();
    expect(cancelled).toEqual(["late"]);
    recovery.dispose();
  }
});

test("selected cancel leaves another intent snapshot intact", async () => {
  const pending = createPendingDrafts();
  const recovery = createRecovery({
    pending,
    create: async () => ({
      intentId: "selected",
      expiresAt: Date.now() + 60000,
    }),
    cancel: async () => true,
    uuid: () => "operation",
  });
  recovery.connect({
    capture: () => ({ actor: alice, recipientId: "bob", text: "one" }),
    restore: () => {},
  });
  recovery.suspend({ actor: alice, status: "authenticated" });
  recovery.reconcile({ actor: null, status: "guest" });
  await Promise.resolve();
  await Promise.resolve();
  pending.remember({
    intentId: "another",
    text: "two",
    expectedUserId: "alice",
  });
  await recovery.cancel("selected");
  expect(pending.take({ intentId: "another", actorId: "alice" })).toBe("two");
  recovery.dispose();
});

test("delayed intent creation after explicit peer logout cannot resurrect memory", async () => {
  const created = Promise.withResolvers<
    Readonly<{ intentId: string; expiresAt: number }> | undefined
  >();
  const pending = createPendingDrafts();
  const cancelled: string[] = [];
  const recovery = createRecovery({
    pending,
    create: () => created.promise,
    cancel: async (id) => {
      cancelled.push(id);
      return true;
    },
    uuid: () => "operation",
  });
  recovery.connect({
    capture: () => ({ actor: alice, recipientId: "bob", text: "private" }),
    restore: () => {},
  });
  recovery.suspend({ actor: alice, status: "authenticated" });
  recovery.reconcile({ actor: null, status: "guest" });
  recovery.explicitLogout({ actor: null, status: "guest" });
  recovery.reconcile({ actor: next, status: "authenticated" });
  created.resolve({ intentId: "late", expiresAt: Date.now() + 60000 });
  await created.promise;
  await Promise.resolve();
  expect(get(recovery.view)).toEqual({ kind: "idle" });
  expect(pending.take({ intentId: "late", actorId: "alice" })).toBeUndefined();
  expect(cancelled).toEqual(["late"]);
  recovery.dispose();
});

test("failed creation and expired selected resume discard memory and expose unavailable", async () => {
  for (const receipt of [
    undefined,
    { intentId: "expired", expiresAt: Date.now() - 1 },
  ]) {
    const pending = createPendingDrafts();
    const restored: string[] = [];
    const recovery = createRecovery({
      pending,
      create: async () => receipt,
      cancel: async () => true,
      uuid: () => "operation",
    });
    recovery.connect({
      capture: () => ({ actor: alice, recipientId: "bob", text: "discard" }),
      restore: ({ text }) => restored.push(text),
    });
    recovery.suspend({ actor: alice, status: "authenticated" });
    recovery.reconcile({ actor: null, status: "guest" });
    await Promise.resolve();
    await Promise.resolve();
    recovery.reconcile({ actor: next, status: "authenticated" });
    recovery.restore({
      intentId: "expired",
      target: { type: "compose_message", conversationId: "safe" },
      actor: next,
    });
    expect(get(recovery.view).kind).toBe("unavailable");
    expect(
      pending.take({ intentId: "operation", actorId: "alice" }),
    ).toBeUndefined();
    expect(
      pending.take({ intentId: "expired", actorId: "alice" }),
    ).toBeUndefined();
    expect(restored).toEqual([]);
    recovery.dispose();
  }
});

test("delayed cancel failure after disposal does not revive a prompt", async () => {
  const cancelled = Promise.withResolvers<boolean>();
  const recovery = createRecovery({
    pending: createPendingDrafts(),
    create: async () => undefined,
    cancel: () => cancelled.promise,
    uuid: () => "operation",
  });
  const cancellation = recovery.cancel("foreign");
  recovery.dispose();
  cancelled.resolve(false);
  await cancellation;
  expect(get(recovery.view)).toEqual({ kind: "idle" });
});

test("confirmed recovery of the existing generation retires temporary capture without creating an auth intent", () => {
  const pending = createPendingDrafts();
  const recovery = createRecovery({
    pending,
    create: async () => {
      throw new Error("No guest transition");
    },
    cancel: async () => true,
    uuid: () => "operation",
  });
  recovery.connect({
    capture: () => ({
      actor: alice,
      recipientId: "bob",
      text: "live outage draft",
    }),
    restore: () => {},
  });
  recovery.suspend({ actor: alice, status: "authenticated" });
  recovery.reconcile({ actor: null, status: "unavailable" });
  expect(get(recovery.view).kind).toBe("creating");
  recovery.reconcile({ actor: alice, status: "authenticated" });
  expect(get(recovery.view).kind).toBe("idle");
  expect(
    pending.take({ intentId: "operation", actorId: "alice" }),
  ).toBeUndefined();
  recovery.dispose();
});

test("peer explicit logout suppresses retired generation capture but permits later fresh-session expiry", () => {
  const pending = createPendingDrafts();
  const recovery = createRecovery({
    pending,
    create: async () => undefined,
    cancel: async () => true,
    uuid: () => "operation",
  });
  recovery.connect({
    capture: () => ({
      actor: alice,
      recipientId: "bob",
      text: "private peer draft",
    }),
    restore: () => {},
  });
  expect(recovery.explicitLogout).toBeFunction();
  recovery.explicitLogout({ actor: alice, status: "authenticated" });
  recovery.suspend({ actor: alice, status: "authenticated" });
  recovery.reconcile({ actor: null, status: "guest" });
  expect(get(recovery.view)).toEqual({ kind: "idle" });
  expect(
    pending.take({ intentId: "operation", actorId: "alice" }),
  ).toBeUndefined();
  recovery.connect({
    capture: () => ({ actor: next, recipientId: "bob", text: "fresh draft" }),
    restore: () => {},
  });
  recovery.reconcile({ actor: next, status: "authenticated" });
  recovery.suspend({ actor: next, status: "authenticated" });
  expect(get(recovery.view).kind).toBe("creating");
  expect(pending.take({ intentId: "operation", actorId: "alice" })).toBe(
    "fresh draft",
  );
  recovery.dispose();
});

test("A begin then B begin cancels only late A and preserves selected B", async () => {
  const first =
    Promise.withResolvers<Readonly<{ intentId: string; expiresAt: number }>>();
  const cancelled: string[] = [];
  const recovery = createRecovery({
    pending: createPendingDrafts(),
    uuid: () => "operation",
    create: (input) =>
      input.operationId === "A"
        ? first.promise
        : Promise.resolve({ intentId: "B", expiresAt: Date.now() + 60000 }),
    cancel: async (id) => {
      cancelled.push(id);
      return true;
    },
  });
  const a = recovery.begin({
    input: { type: "create_story", operationId: "A" },
  });
  await recovery.begin({ input: { type: "create_story", operationId: "B" } });
  first.resolve({ intentId: "A", expiresAt: Date.now() + 60000 });
  await a;
  expect(cancelled).toEqual(["A"]);
  expect(get(recovery.view)).toMatchObject({ kind: "ready", intentId: "B" });
  recovery.dispose();
});

test("disconnect of old source cannot disconnect new source", async () => {
  const pending = createPendingDrafts();
  const recovery = createRecovery({
    pending,
    uuid: () => "operation",
    create: async () => ({
      intentId: "selected",
      expiresAt: Date.now() + 60000,
    }),
    cancel: async () => true,
  });
  const restored: string[] = [];
  const disconnect = recovery.connect({
    capture: () => ({ actor: alice, recipientId: "bob", text: "old" }),
    restore: () => {
      throw new Error("old source restored");
    },
  });
  recovery.connect({
    capture: () => ({ actor: alice, recipientId: "bob", text: "new" }),
    restore: ({ text }) => restored.push(text),
  });
  disconnect();
  recovery.suspend({ actor: alice, status: "authenticated" });
  recovery.reconcile({ actor: null, status: "guest" });
  await Promise.resolve();
  await Promise.resolve();
  recovery.reconcile({ actor: next, status: "authenticated" });
  recovery.restore({
    intentId: "selected",
    target: { type: "compose_message", conversationId: "safe" },
    actor: next,
  });
  expect(restored).toEqual(["new"]);
  recovery.dispose();
});

for (const outcome of ["false", "throw"] as const) {
  test(`stale A cancellation ${outcome} cannot replace still-creating B`, async () => {
    const created =
      Promise.withResolvers<
        Readonly<{ intentId: string; expiresAt: number }>
      >();
    const cancelled: string[] = [];
    const recovery = createRecovery({
      pending: createPendingDrafts(),
      uuid: () => "operation",
      create: () => created.promise,
      cancel: async (id) => {
        cancelled.push(id);
        if (outcome === "throw") throw new Error("transport");
        return false;
      },
    });
    const b = recovery.begin({
      input: { type: "create_story", operationId: "B" },
    });
    await recovery.cancel("A");
    expect(get(recovery.view)).toEqual({ kind: "creating" });
    expect(cancelled).toEqual(["A"]);
    created.resolve({ intentId: "B", expiresAt: Date.now() + 60000 });
    await b;
    expect(get(recovery.view)).toMatchObject({
      kind: "ready",
      intentId: "B",
    });
    recovery.dispose();
  });
}

for (const outcome of ["false", "throw"] as const) {
  test(`selected UI cancel ${outcome} stays dismissed, reports once and preserves resolved cancellation contract`, async () => {
    const failures: string[] = [];
    const recovery = createRecovery({
      pending: createPendingDrafts(),
      uuid: () => "unused",
      create: async () => ({
        intentId: "selected",
        expiresAt: Date.now() + 60000,
      }),
      cancel: async () => {
        if (outcome === "throw") throw new Error("transport");
        return false;
      },
      onCleanupFailure: () => failures.push("cleanup"),
    });
    const selection = createContinuationSelection({ cancel: recovery.cancel });
    try {
      await recovery.begin({
        input: { type: "create_story", operationId: "operation" },
      });
      const cancel = selection.cancel("selected");
      expect(get(selection.view)).toBe("selected");
      expect(get(recovery.view)).toEqual({ kind: "idle" });
      expect(await cancel).toBeUndefined();
      expect(failures).toEqual(["cleanup"]);
      expect(get(recovery.view)).toEqual({ kind: "unavailable" });
      expect(
        selection.select({
          recovery: get(recovery.view),
          projectedIntent: "selected",
          dismissedIntent: get(selection.view),
          cancelled: false,
        }),
      ).toBeNull();
    } finally {
      recovery.dispose();
    }
  });
}
