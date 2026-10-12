import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createAuthBrowser } from "../../../apps/fe-insta/src/domains/users/browser/store";

const actor = { userId: "one", username: "One", generation: "S1" };
const synchronization = {
  exclusive: async <T>(execute: () => Promise<T>) => execute(),
  publish: () => {},
  subscribe: () => () => {},
};
test("late old-session read cannot replace a new identity; logout clears private UI immediately", async () => {
  const barrier = Promise.withResolvers<typeof actor>();
  let clears = 0;
  const auth = createAuthBrowser({
    initial: { actor, status: "authenticated" },
    read: () => barrier.promise,
    synchronization,
    clearPrivate: () => {
      clears += 1;
    },
  });
  const refreshing = auth.reconcile();
  auth.accept({ userId: "two", username: "Two", generation: "S2" });
  barrier.resolve(actor);
  await refreshing;
  expect(get(auth.view).actor?.generation).toBe("S2");
  auth.beginLogout();
  expect(get(auth.view)).toEqual({ actor: null, status: "pending" });
  expect(clears).toBe(2);
  auth.accept({ userId: "two", username: "Two", generation: "S3" });
  auth.finishLogout("confirmed");
  expect(get(auth.view).actor?.generation).toBe("S3");
});
test("request-scoped stores never share actor state", () => {
  const create = () =>
    createAuthBrowser({
      initial: { actor: null, status: "guest" },
      read: async () => null,
      synchronization,
      clearPrivate: () => {},
    });
  const first = create();
  const second = create();
  first.accept(actor);
  expect(get(first.view).actor).toEqual(actor);
  expect(get(second.view).actor).toBeNull();
});
test("pending server revocation remains visible after SSR guest reconciliation", () => {
  const auth = createAuthBrowser({
    initial: { actor, status: "authenticated" },
    read: async () => null,
    synchronization,
    clearPrivate: () => {},
  });
  auth.beginLogout();
  auth.finishLogout("pending");
  auth.accept(null);
  expect(get(auth.view).revocation).toBe("pending");
});
test("private resource cleanup attempts all owned resources even if one cleanup fails", () => {
  const auth = createAuthBrowser({
    initial: { actor, status: "authenticated" },
    read: async () => null,
    synchronization,
    clearPrivate: () => {},
  });
  let cleaned = 0;
  auth.registerPrivate(() => {
    throw new Error("resource failed");
  });
  auth.registerPrivate(() => {
    cleaned += 1;
  });
  expect(() => auth.beginLogout()).toThrow();
  expect(cleaned).toBe(1);
});
test("registered resource owner releases on logout and can unsubscribe", () => {
  const auth = createAuthBrowser({
    initial: { actor, status: "authenticated" },
    read: async () => null,
    synchronization,
    clearPrivate: () => {},
  });
  let cleared = 0;
  const release = auth.registerPrivate(() => {
    cleared += 1;
  });
  auth.beginLogout();
  expect(cleared).toBe(1);
  release();
  auth.accept(actor);
  expect(cleared).toBe(1);
});

test("navigation snapshot cannot reassert S1 after confirmed S2 and fresh reads retain the generation fence", async () => {
  const current = { ...actor, generation: "S2", username: "Two" };
  const initial = { actor, status: "authenticated" as const };
  const barrier = Promise.withResolvers<typeof actor>();
  let reads = 0;
  const auth = createAuthBrowser({
    initial,
    read: () => {
      reads += 1;
      return reads === 1 ? Promise.resolve(current) : barrier.promise;
    },
    synchronization,
    clearPrivate: () => {},
  });
  await auth.reconcileNavigation(initial);
  expect(reads).toBe(0);
  auth.accept(current);
  await auth.reconcileNavigation({ ...initial });
  expect(get(auth.view).actor?.generation).toBe("S2");
  const navigating = auth.reconcileNavigation({ ...initial });
  auth.accept({ ...current, generation: "S3" });
  barrier.resolve(current);
  await navigating;
  expect(get(auth.view).actor?.generation).toBe("S3");
});
