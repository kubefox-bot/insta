import { expect, test } from "bun:test";
import { createConversationScroll } from "../../src/domains/conversations/browser/scroll/create";

const alice = { userId: "alice", username: "Alice", generation: "g1" };
const snapshot = {
  topPx: 140,
  nearBottom: false,
  unread: false,
  anchor: { id: "message-7", offsetPx: -12 },
};

test("conversation scroll reopens its captured anchor for the same live actor only", () => {
  const scroll = createConversationScroll();
  scroll.reconcile({ actor: alice, status: "authenticated" });
  const first = scroll.bind({ actor: alice, conversationId: "one" });
  first.capture(snapshot);
  expect(first.read()).toEqual({
    topPx: 140,
    nearBottom: false,
    unread: false,
    anchor: { id: "message-7", offsetPx: -12 },
  });
  expect(
    scroll.bind({ actor: alice, conversationId: "two" }).read(),
  ).toBeNull();
  snapshot.anchor.offsetPx = 90;
  expect(first.read()?.anchor?.offsetPx).toBe(-12);
  scroll.reconcile({ actor: alice, status: "authenticated" });
  expect(first.read()?.topPx).toBe(140);
});

test("generation changes and disposal reject old scroll captures", () => {
  const scroll = createConversationScroll();
  scroll.reconcile({ actor: alice, status: "authenticated" });
  const old = scroll.bind({ actor: alice, conversationId: "one" });
  old.capture({ topPx: 90, nearBottom: false, unread: false, anchor: null });
  const renewed = { ...alice, generation: "g2" };
  scroll.reconcile({ actor: renewed, status: "authenticated" });
  const current = scroll.bind({ actor: renewed, conversationId: "one" });
  old.capture({ topPx: 800, nearBottom: true, unread: false, anchor: null });
  expect(old.read()).toBeNull();
  expect(current.read()).toBeNull();
  current.capture({ topPx: 20, nearBottom: true, unread: false, anchor: null });
  scroll.dispose();
  scroll.reconcile({ actor: renewed, status: "authenticated" });
  current.capture({
    topPx: 300,
    nearBottom: true,
    unread: false,
    anchor: null,
  });
  expect(current.read()).toBeNull();
});

test("unavailable session and explicit cleanup clear private viewport memory", () => {
  const scroll = createConversationScroll();
  scroll.reconcile({ actor: alice, status: "authenticated" });
  const bound = scroll.bind({ actor: alice, conversationId: "one" });
  bound.capture({ topPx: 90, nearBottom: false, unread: false, anchor: null });
  scroll.reconcile({ actor: null, status: "unavailable" });
  expect(bound.read()).toBeNull();
  scroll.reconcile({ actor: alice, status: "authenticated" });
  bound.capture({ topPx: 90, nearBottom: false, unread: false, anchor: null });
  scroll.clear();
  expect(bound.read()).toBeNull();
});
