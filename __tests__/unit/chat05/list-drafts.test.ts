import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { createConversationDrafts } from "../../../apps/fe-insta/src/domains/conversations/browser/drafts/create";
import { createConversationStore } from "../../../apps/fe-insta/src/domains/conversations/browser/store";
import type { Conversation } from "../../../apps/fe-insta/src/domains/conversations/browser/types";

const actor = { userId: "alice", generation: "g1" };
const item: Conversation = {
  id: "a".repeat(24),
  participantIds: ["alice", "bob"],
  lastSequence: 0,
  lastActivityAt: 1,
};
test("mounted store applies recovered canonical list only to its captured actor/generation", () => {
  const store = createConversationStore({ initial: [item], actor });
  store.reconcileActor(null);
  store.reconcileActor(actor);
  store.applyList({ actor, conversations: [item] });
  expect(get(store.view).conversations).toEqual([item]);
  const next = { ...actor, generation: "g2" };
  store.reconcileActor(next);
  store.applyList({ actor, conversations: [item] });
  expect(get(store.view).conversations).toEqual([]);
  store.applyList({ actor: next, conversations: [item] });
  expect(get(store.view).conversations).toEqual([item]);
  store.reconcileActor({ userId: "bob", generation: "g3" });
  store.applyList({ actor: next, conversations: [item] });
  expect(get(store.view).conversations).toEqual([]);
});
test("draft is unavailable during outage, returns only to same confirmed generation and rejects stale writes", () => {
  const drafts = createConversationDrafts();
  drafts.reconcile({ actor, status: "authenticated" });
  drafts.edit({ actor, conversationId: item.id, text: "not sent" });
  drafts.reconcile({ actor: null, status: "unavailable" });
  expect(get(drafts.view).size).toBe(0);
  drafts.edit({ actor, conversationId: item.id, text: "stale completion" });
  drafts.reconcile({ actor, status: "authenticated" });
  expect(get(drafts.view).get(item.id)).toBe("not sent");
  drafts.reconcile({
    actor: { ...actor, generation: "g2" },
    status: "authenticated",
  });
  expect(get(drafts.view).size).toBe(0);
  drafts.reconcile({ actor, status: "authenticated" });
  drafts.edit({ actor, conversationId: item.id, text: "logout draft" });
  drafts.reconcile({ actor: null, status: "pending" });
  drafts.reconcile({ actor, status: "authenticated" });
  expect(get(drafts.view).size).toBe(0);
  drafts.edit({ actor, conversationId: item.id, text: "private" });
  drafts.reconcile({ actor: null, status: "unavailable" });
  drafts.reconcile({
    actor: { userId: "bob", generation: "g3" },
    status: "authenticated",
  });
  expect(get(drafts.view).size).toBe(0);
});

test("list requests coalesce and ignore aborted, superseded and previous actor results", async () => {
  const { createListSynchronization } = await import(
    "../../../apps/fe-insta/src/domains/conversations/browser/list/create"
  );
  const store = createConversationStore({ initial: [], actor });
  let current: typeof actor | null = actor;
  let visible = true;
  let calls = 0;
  const first =
    Promise.withResolvers<Readonly<{ items: readonly (typeof item)[] }>>();
  const sync = createListSynchronization({
    actor,
    store,
    currentActor: () => current,
    visible: () => visible,
    load: async () => {
      calls++;
      return first.promise;
    },
  });
  const pending = sync.refresh();
  const duplicate = sync.refresh();
  expect(calls).toBe(1);
  store.applyList({ actor, conversations: [{ ...item, lastSequence: 2 }] });
  first.resolve({ items: [item] });
  await Promise.all([pending, duplicate]);
  expect(get(store.view).conversations[0]?.lastSequence).toBe(2);
  visible = false;
  await sync.refresh();
  expect(calls).toBe(1);
  visible = true;
  current = { userId: "bob", generation: "g2" };
  await sync.refresh();
  expect(calls).toBe(1);
  sync.dispose();
  const late =
    Promise.withResolvers<Readonly<{ items: readonly (typeof item)[] }>>();
  current = actor;
  const next = createListSynchronization({
    actor,
    store,
    currentActor: () => current,
    visible: () => true,
    load: async () => late.promise,
  });
  const stopped = next.refresh();
  next.dispose();
  store.clear();
  late.resolve({ items: [item] });
  await stopped;
  expect(get(store.view).conversations).toEqual([]);
});
test("draft capture is selected-recipient and live-owner bound before cleanup", () => {
  const actor = { userId: "alice", generation: "one" };
  const id = "a".repeat(24);
  const store = createConversationStore({
    actor,
    initial: [
      {
        id,
        participantIds: ["alice", "bob"],
        lastSequence: 0,
        lastActivityAt: 0,
      },
    ],
  });
  const drafts = createConversationDrafts();
  drafts.reconcile({ actor, status: "authenticated" });
  drafts.edit({ actor, conversationId: id, text: "private" });
  expect(drafts.capture(get(store.view))).toBeUndefined();
  store.select(id);
  expect(drafts.capture(get(store.view))).toEqual({
    actor,
    recipientId: "bob",
    text: "private",
  });
  drafts.reconcile({ actor: null, status: "guest" });
  expect(drafts.capture(get(store.view))).toBeUndefined();
  drafts.dispose();
});
