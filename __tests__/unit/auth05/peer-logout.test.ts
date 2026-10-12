import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createRecovery } from "../../../apps/fe-insta/src/domains/auth-continuation/browser/recovery/create";
import { createPendingDrafts } from "../../../apps/fe-insta/src/domains/conversations/browser/drafts/pending";
import { createAuthBrowser } from "../../../apps/fe-insta/src/domains/users/browser/store";
import type {
  Actor,
  AuthSynchronization,
} from "../../../apps/fe-insta/src/domains/users/browser/types";

const alice = { userId: "alice", username: "Alice", generation: "one" };
test("explicit peer notice reaches recovery before real identity reader clears guest resources", async () => {
  const callbacks: { logout?: () => void } = {};
  let current: Actor | null = alice;
  const synchronization: AuthSynchronization = {
    exclusive: (execute) => execute(),
    publish: () => {},
    subscribe: (_refresh, logout) => {
      callbacks.logout = logout;
      return () => {};
    },
  };
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
      text: "private draft",
    }),
    restore: () => {},
  });
  const auth = createAuthBrowser({
    initial: { actor: alice, status: "authenticated" },
    read: async () => current,
    synchronization,
    clearPrivate: () => recovery.suspend(get(auth.view)),
    onExplicitLogout: () => recovery.explicitLogout(get(auth.view)),
  });
  const releaseIdentity = auth.view.subscribe(recovery.reconcile);
  const unmount = auth.mount();
  await auth.reconcile();
  callbacks.logout?.();
  current = null;
  await auth.reconcile();
  expect(get(auth.view).actor).toBeNull();
  expect(get(recovery.view)).toEqual({ kind: "idle" });
  releaseIdentity();
  unmount();
  recovery.dispose();
});

import { createAuthNoticeReceiver } from "../../../apps/fe-insta/src/domains/users/browser/lib/notice";

test("finite external notice receiver ignores unknown payloads and keeps changed compatible", () => {
  const order: string[] = [];
  const receive = createAuthNoticeReceiver({
    refresh: () => order.push("read"),
    onExplicitLogout: () => order.push("discard"),
  });
  for (const data of [null, {}, "unknown", ["logout"], { type: "logout" }])
    receive({ data });
  expect(order).toEqual([]);
  receive({ data: "changed" });
  expect(order).toEqual(["read"]);
  receive({ data: "logout" });
  expect(order).toEqual(["read", "discard", "read"]);
});
