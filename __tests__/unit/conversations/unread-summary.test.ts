import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createUnreadSummary } from "../../../apps/fe-insta/src/domains/conversations/browser/unread/create";
import type { UnreadList } from "../../../apps/fe-insta/src/domains/conversations/browser/unread/types";
import { listSchema } from "../../../apps/fe-insta/src/domains/conversations/contracts/schema";

const actor = { userId: "alice", generation: "one" };
const item = {
  id: "a".repeat(24),
  participantIds: ["alice", "bob"] as [string, string],
  lastSequence: 100,
  lastActivityAt: 1,
  recipientUsername: "bob",
  unreadCount: 2,
};
test("old backend fields stay unknown; partial page never determines canonical total", async () => {
  const legacy = listSchema.parse({
    items: [{ ...item, unreadCount: undefined }],
  });
  expect(legacy.totalUnreadCount).toBeUndefined();
  expect(legacy.items[0]?.unreadCount).toBeUndefined();
  const summary = createUnreadSummary({
    visible: () => true,
    load: async () => ({ items: [item], totalUnreadCount: 137 }),
  });
  summary.reconcileActor(actor);
  expect(get(summary.view).list).toBeNull();
  await summary.refresh();
  expect(get(summary.view).list?.totalUnreadCount).toBe(137);
  expect(get(summary.view).list?.items[0]?.unreadCount).toBe(2);
  summary.dispose();
});
test("concurrent refresh shares work; confirmed invalidation queues one subsequent canonical read", async () => {
  const first = Promise.withResolvers<UnreadList>();
  let calls = 0;
  const summary = createUnreadSummary({
    visible: () => true,
    load: async () => {
      calls += 1;
      return calls === 1 ? first.promise : { items: [], totalUnreadCount: 0 };
    },
  });
  summary.reconcileActor(actor);
  const operation = summary.refresh();
  expect(summary.refresh()).toBe(operation);
  summary.invalidate();
  summary.invalidate();
  expect(calls).toBe(1);
  first.resolve({ items: [item], totalUnreadCount: 2 });
  await operation;
  expect(calls).toBe(2);
  expect(get(summary.view).list?.totalUnreadCount).toBe(0);
  summary.dispose();
});
test("identity change aborts and synchronously clears cached count, fences ignored abort and SSR seeds", async () => {
  const first = Promise.withResolvers<UnreadList>();
  const signals: AbortSignal[] = [];
  const summary = createUnreadSummary({
    visible: () => true,
    load: async (_actor, current) => {
      signals.push(current);
      return first.promise;
    },
  });
  summary.reconcileActor(actor);
  summary.seed(actor, { items: [item], totalUnreadCount: 2 });
  const operation = summary.refresh();
  summary.reconcileActor({ ...actor, generation: "two" });
  expect(signals[0]?.aborted).toBe(true);
  expect(get(summary.view).list).toBeNull();
  summary.seed(actor, { items: [item], totalUnreadCount: 9 });
  first.resolve({ items: [item], totalUnreadCount: 99 });
  await operation;
  expect(get(summary.view).list).toBeNull();
  summary.dispose();
});
test("summary survives route unsubscribe; private cleanup isolates instances and disables old reads", async () => {
  const first = createUnreadSummary({
    visible: () => true,
    load: async () => ({ items: [item], totalUnreadCount: 2 }),
  });
  const second = createUnreadSummary({
    visible: () => true,
    load: async () => ({ items: [], totalUnreadCount: 0 }),
  });
  first.reconcileActor(actor);
  second.reconcileActor(actor);
  await first.refresh();
  const release = first.view.subscribe(() => {});
  release();
  expect(get(first.view).list?.totalUnreadCount).toBe(2);
  expect(get(second.view).list).toBeNull();
  first.clear();
  expect(get(first.view).actor).toBeNull();
  await first.refresh();
  expect(get(first.view).list).toBeNull();
  first.dispose();
  second.dispose();
});
test("hidden surface does not poll; failed refresh preserves explicit stale authoritative snapshot", async () => {
  let visible = false;
  const summary = createUnreadSummary({
    visible: () => visible,
    load: async () => {
      throw new Error("offline");
    },
  });
  summary.reconcileActor(actor);
  summary.seed(actor, { items: [item], totalUnreadCount: 2 });
  await summary.refresh();
  expect(get(summary.view).stale).toBe(false);
  visible = true;
  await expect(summary.refresh()).rejects.toThrow("offline");
  expect(get(summary.view).stale).toBe(true);
  expect(get(summary.view).list?.totalUnreadCount).toBe(2);
  summary.dispose();
});

test.each(["hidden", "identity", "dispose"])(
  "expected %s cancellation settles without reporting stale/failure",
  async (reason) => {
    let visible = true;
    const summary = createUnreadSummary({
      visible: () => visible,
      load: async (_actor, signal) =>
        new Promise<UnreadList>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    });
    summary.reconcileActor(actor);
    summary.seed(actor, { items: [item], totalUnreadCount: 2 });
    const operation = summary.refresh();
    if (reason === "hidden") {
      visible = false;
      summary.suspend();
    }
    if (reason === "identity")
      summary.reconcileActor({ ...actor, generation: "two" });
    if (reason === "dispose") summary.dispose();
    await operation;
    expect(get(summary.view).stale).toBe(false);
    if (reason !== "hidden") expect(get(summary.view).list).toBeNull();
    summary.dispose();
  },
);

test.each([true, false])(
  "queued latest canonical outcome owns background error status (success=%s)",
  async (success) => {
    const first = Promise.withResolvers<UnreadList>();
    let calls = 0;
    const errors: string[] = [];
    const summary = createUnreadSummary({
      visible: () => true,
      load: async () => {
        calls += 1;
        if (calls === 1) return first.promise;
        if (!success) throw new Error("latest failure");
        return { items: [], totalUnreadCount: 0 };
      },
    });
    summary.reconcileActor(actor);
    summary.seed(actor, { items: [item], totalUnreadCount: 2 });
    const background = summary.refresh().catch((error: unknown) => {
      errors.push(error instanceof Error ? error.message : String(error));
      summary.reportUnavailable();
    });
    summary.invalidate();
    first.reject(new Error("superseded failure"));
    await background;
    expect(calls).toBe(2);
    expect(errors).toEqual(success ? [] : ["latest failure"]);
    expect(get(summary.view).stale).toBe(!success);
    expect(get(summary.view).list?.totalUnreadCount).toBe(success ? 0 : 2);
    summary.dispose();
  },
);
