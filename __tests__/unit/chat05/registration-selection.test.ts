import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createRecovery } from "../../../apps/fe-insta/src/domains/auth-continuation/browser/recovery/create";
import { createPendingDrafts } from "../../../apps/fe-insta/src/domains/conversations/browser/drafts/pending";
import { waitUntil } from "../../fixtures/barrier";

test("registration retains chosen ready metadata after new actor confirmation and clears previous private text", async () => {
  const alice = { userId: "alice", generation: "before" };
  const registered = { userId: "registered", generation: "after" };
  const deadline = Date.now() + 60000;
  const pending = createPendingDrafts();
  const restored: string[] = [];
  const recovery = createRecovery({
    pending,
    create: async () => ({ intentId: "chosen", expiresAt: deadline }),
    cancel: async () => true,
    uuid: () => "operation",
  });
  try {
    recovery.connect({
      capture: () => ({
        actor: alice,
        recipientId: "bob",
        text: "old private text",
      }),
      restore: ({ text }) => restored.push(text),
    });
    recovery.suspend({ actor: alice, status: "authenticated" });
    recovery.reconcile({ actor: null, status: "guest" });
    await waitUntil({
      timeoutMs: 1000,
      check: async () => get(recovery.view).kind === "ready",
    });
    recovery.chooseAuthentication({ mode: "register", intentId: "chosen" });
    recovery.confirmRegistration("chosen");
    recovery.reconcile({ actor: registered, status: "authenticated" });
    expect(get(recovery.view)).toEqual({
      kind: "ready",
      intentId: "chosen",
      expiresAt: deadline,
    });
    expect(
      pending.take({ intentId: "chosen", actorId: alice.userId }),
    ).toBeUndefined();
    recovery.restore({
      intentId: "chosen",
      target: { type: "compose_message", conversationId: "new-thread" },
      actor: registered,
    });
    expect(restored).toEqual([]);
    expect(get(recovery.view)).toEqual({ kind: "idle" });
  } finally {
    recovery.dispose();
  }
});

for (const selection of [
  "ordinary-login",
  "register-then-login",
  "other-intent",
] as const) {
  test(`${selection} cannot retain previous actor selection`, async () => {
    const alice = { userId: "alice", generation: "before" };
    const pending = createPendingDrafts();
    const recovery = createRecovery({
      pending,
      create: async () => ({
        intentId: "chosen",
        expiresAt: Date.now() + 60000,
      }),
      cancel: async () => true,
      uuid: () => "operation",
    });
    try {
      recovery.connect({
        capture: () => ({ actor: alice, recipientId: "bob", text: "private" }),
        restore: () => {
          throw new Error("Unexpected private restore");
        },
      });
      recovery.suspend({ actor: alice, status: "authenticated" });
      recovery.reconcile({ actor: null, status: "guest" });
      await waitUntil({
        timeoutMs: 1000,
        check: async () => get(recovery.view).kind === "ready",
      });
      if (selection === "register-then-login")
        recovery.chooseAuthentication({ mode: "register", intentId: "chosen" });
      recovery.chooseAuthentication({
        mode: selection === "other-intent" ? "register" : "login",
        intentId: selection === "other-intent" ? "unselected" : "chosen",
      });
      recovery.reconcile({
        actor: { userId: "foreign", generation: "new" },
        status: "authenticated",
      });
      expect(get(recovery.view)).toEqual({ kind: "idle" });
      expect(
        pending.take({ intentId: "chosen", actorId: alice.userId }),
      ).toBeUndefined();
    } finally {
      recovery.dispose();
    }
  });
}

for (const terminal of ["cancel", "peer-logout", "superseded-actor"] as const) {
  test(`retained registration metadata is fenced by ${terminal}`, async () => {
    const alice = { userId: "alice", generation: "before" };
    const registered = { userId: "registered", generation: "after" };
    const cancelled: string[] = [];
    const recovery = createRecovery({
      pending: createPendingDrafts(),
      create: async () => ({
        intentId: "chosen",
        expiresAt: Date.now() + 60000,
      }),
      cancel: async (id) => {
        cancelled.push(id);
        return true;
      },
      uuid: () => "operation",
    });
    try {
      recovery.connect({
        capture: () => ({ actor: alice, recipientId: "bob", text: "private" }),
        restore: () => {
          throw new Error("Unexpected private restore");
        },
      });
      recovery.suspend({ actor: alice, status: "authenticated" });
      recovery.reconcile({ actor: null, status: "guest" });
      await waitUntil({
        timeoutMs: 1000,
        check: async () => get(recovery.view).kind === "ready",
      });
      recovery.chooseAuthentication({ mode: "register", intentId: "chosen" });
      recovery.confirmRegistration("chosen");
      recovery.reconcile({ actor: registered, status: "authenticated" });
      expect(get(recovery.view).kind).toBe("ready");
      switch (terminal) {
        case "cancel":
          await recovery.cancel("chosen");
          expect(cancelled).toEqual(["chosen"]);
          break;
        case "peer-logout":
          recovery.explicitLogout({
            actor: registered,
            status: "authenticated",
          });
          break;
        case "superseded-actor":
          recovery.reconcile({
            actor: { ...registered, generation: "replacement" },
            status: "authenticated",
          });
          break;
      }
      expect(get(recovery.view)).toEqual({ kind: "idle" });
    } finally {
      recovery.dispose();
    }
  });
}

test("retained registration metadata keeps the original deadline and expires without replay", async () => {
  const alice = { userId: "alice", generation: "before" };
  const deadline = Date.now() + 250;
  const recovery = createRecovery({
    pending: createPendingDrafts(),
    create: async () => ({ intentId: "chosen", expiresAt: deadline }),
    cancel: async () => true,
    uuid: () => "operation",
  });
  try {
    recovery.connect({
      capture: () => ({ actor: alice, recipientId: "bob", text: "private" }),
      restore: () => {
        throw new Error("Unexpected replay");
      },
    });
    recovery.suspend({ actor: alice, status: "authenticated" });
    recovery.reconcile({ actor: null, status: "guest" });
    await waitUntil({
      timeoutMs: 1000,
      check: async () => get(recovery.view).kind === "ready",
    });
    recovery.chooseAuthentication({ mode: "register", intentId: "chosen" });
    recovery.confirmRegistration("chosen");
    recovery.reconcile({
      actor: { userId: "registered", generation: "after" },
      status: "authenticated",
    });
    expect(get(recovery.view)).toEqual({
      kind: "ready",
      intentId: "chosen",
      expiresAt: deadline,
    });
    await waitUntil({
      timeoutMs: 1000,
      check: async () => get(recovery.view).kind === "unavailable",
    });
    expect(get(recovery.view)).toEqual({ kind: "unavailable" });
  } finally {
    recovery.dispose();
  }
});

test("register mode alone cannot preserve selection for an unrelated actor without confirmed registration", async () => {
  const alice = { userId: "alice", generation: "before" };
  const recovery = createRecovery({
    pending: createPendingDrafts(),
    create: async () => ({ intentId: "chosen", expiresAt: Date.now() + 60000 }),
    cancel: async () => true,
    uuid: () => "operation",
  });
  try {
    recovery.connect({
      capture: () => ({ actor: alice, recipientId: "bob", text: "private" }),
      restore: () => {
        throw new Error("Unexpected restore");
      },
    });
    recovery.suspend({ actor: alice, status: "authenticated" });
    recovery.reconcile({ actor: null, status: "guest" });
    await waitUntil({
      timeoutMs: 1000,
      check: async () => get(recovery.view).kind === "ready",
    });
    recovery.chooseAuthentication({ mode: "register", intentId: "chosen" });
    recovery.reconcile({
      actor: { userId: "unrelated", generation: "other" },
      status: "authenticated",
    });
    expect(get(recovery.view)).toEqual({ kind: "idle" });
  } finally {
    recovery.dispose();
  }
});

for (const terminal of [
  "switch-login",
  "cancel",
  "dispose",
  "superseded-actor",
] as const) {
  test(`late registration receipt cannot restore selection after ${terminal}`, async () => {
    const alice = { userId: "alice", generation: "before" };
    const recovery = createRecovery({
      pending: createPendingDrafts(),
      create: async () => ({
        intentId: "chosen",
        expiresAt: Date.now() + 60000,
      }),
      cancel: async () => true,
      uuid: () => "operation",
    });
    try {
      recovery.connect({
        capture: () => ({ actor: alice, recipientId: "bob", text: "private" }),
        restore: () => {
          throw new Error("Unexpected private replay");
        },
      });
      recovery.suspend({ actor: alice, status: "authenticated" });
      recovery.reconcile({ actor: null, status: "guest" });
      await waitUntil({
        timeoutMs: 1000,
        check: async () => get(recovery.view).kind === "ready",
      });
      recovery.chooseAuthentication({ mode: "register", intentId: "chosen" });
      switch (terminal) {
        case "switch-login":
          recovery.chooseAuthentication({ mode: "login", intentId: "chosen" });
          break;
        case "cancel":
          await recovery.cancel("chosen");
          break;
        case "dispose":
          recovery.dispose();
          break;
        case "superseded-actor":
          recovery.reconcile({
            actor: { userId: "other", generation: "replacement" },
            status: "authenticated",
          });
          break;
      }
      recovery.confirmRegistration("chosen");
      recovery.reconcile({
        actor: { userId: "registered", generation: "new" },
        status: "authenticated",
      });
      expect(get(recovery.view)).toEqual({ kind: "idle" });
    } finally {
      recovery.dispose();
    }
  });
}
