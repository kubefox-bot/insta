import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createConversationTransport } from "../../../apps/fe-insta/src/domains/conversations/browser/transport";
import { createUnreadSummary } from "../../../apps/fe-insta/src/domains/conversations/browser/unread/create";

const actor = { userId: "alice", generation: "one" };
test("delivery refresh distinguishes hidden, transient HTTP, unauthorized and malformed success", async () => {
  for (const [status, body, want] of [
    [429, "", "retry-later"],
    [503, "<html>busy</html>", "retry-later"],
    [401, "", "unauthorized"],
    [403, "", "unauthorized"],
    [200, "{}", "apply-failed"],
  ] as const) {
    const transport = createConversationTransport({
      actor,
      request: async () =>
        new Response(body, { status, headers: { "Retry-After": "3" } }),
    });
    const summary = createUnreadSummary({
      visible: () => true,
      load: (_actor, signal) => transport.list(signal),
    });
    summary.reconcileActor(actor);
    const result = await summary.refreshForDelivery({
      signal: new AbortController().signal,
    });
    expect(result.kind).toBe(want);
    if (result.kind === "retry-later") expect(result.retryAfterMs).toBe(3000);
    expect(get(summary.view).list).toBeNull();
    summary.dispose();
  }
  const hidden = createUnreadSummary({
    visible: () => false,
    load: async () => ({ items: [] }),
  });
  hidden.reconcileActor(actor);
  expect(
    (await hidden.refreshForDelivery({ signal: new AbortController().signal }))
      .kind,
  ).toBe("stale");
  hidden.dispose();
});
test("late delivery refresh cannot replace another actor summary", async () => {
  const pending = Promise.withResolvers<{ items: [] }>();
  const summary = createUnreadSummary({
    visible: () => true,
    load: () => pending.promise,
  });
  summary.reconcileActor(actor);
  const refresh = summary.refreshForDelivery({
    signal: new AbortController().signal,
  });
  summary.reconcileActor({ ...actor, generation: "two" });
  pending.resolve({ items: [] });
  expect((await refresh).kind).toBe("stale");
  expect(get(summary.view).list).toBeNull();
  summary.dispose();
});
