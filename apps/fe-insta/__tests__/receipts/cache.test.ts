import { expect, test } from "bun:test";
import { get } from "svelte/store";
import { cacheHistory } from "../../src/domains/conversations/browser/lib/cache";
import { ReceiptSnapshots } from "../../src/domains/conversations/browser/receipts/snapshots";
import {
  createConversationStore,
  type History,
  type Message,
  type ReceiptBatchWireSnapshot,
} from "../../src/domains/conversations/browser/state/index";
import type { CachedHistory } from "../../src/domains/conversations/browser/types";

const actor = { userId: "sender", generation: "login1" };
const deliveredAt = "2026-10-11T10:00:00.000Z";
const readAt = "2026-10-11T10:00:01.000Z";
const message = (conversationId: string, sequence: number): Message => ({
  id: `${conversationId}-${sequence}`,
  conversationId,
  authorId: actor.userId,
  text: "hello",
  sequence,
  createdAt: deliveredAt,
});
const messages = (conversationId: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    message(conversationId, index + 1),
  );
const history = (items: readonly Message[]): History => ({
  items,
  baselineCursor: 0,
  watermark: items.at(-1)?.sequence ?? 0,
  pageInfo: { hasMore: false, nextCursor: null },
});
const batch = (
  conversationId: string,
  sequences: readonly number[],
): ReceiptBatchWireSnapshot => ({
  conversationId,
  receipts: sequences.map((sequence) => ({
    messageId: `${conversationId}-${sequence}`,
    recipientId: "recipient",
    sequence,
    deliveredAt,
    readAt: null,
  })),
});
const sequences = Array.from({ length: 50 }, (_, index) => index + 1);

test("evicting a sixth history drops its receipts before a later history restores that dialogue", () => {
  const store = createConversationStore({ actor, initial: [] });
  for (let index = 0; index < 6; index++) {
    const conversationId = `c${index}`;
    store.hydrate({
      actor,
      conversationId,
      history: history(
        messages(conversationId, 250).map((value) => ({
          ...value,
          receipt: { deliveredAt, readAt },
        })),
      ),
    });
  }
  expect(get(store.view).histories.has("c0")).toBe(false);
  store.hydrate({
    actor,
    conversationId: "c0",
    history: history([message("c0", 250)]),
  });
  expect(
    get(store.view).histories.get("c0")?.items[0]?.receipt,
  ).toBeUndefined();
});

test("six dialogues of 250 messages retain at most 1000 observable snapshots", () => {
  const snapshots = new ReceiptSnapshots();
  let histories: ReadonlyMap<string, CachedHistory> = new Map();
  const dialogues = Array.from({ length: 6 }, (_, index) => `c${index}`);
  for (const conversationId of dialogues) {
    const items = snapshots.project(
      conversationId,
      messages(conversationId, 250).map((value) => ({
        ...value,
        receipt: { deliveredAt, readAt },
      })),
    );
    histories = cacheHistory({
      current: histories,
      conversationId,
      history: {
        items,
        status: "ready",
        verifiedCursor: 250,
        earlierCursor: null,
      },
    });
    snapshots.retain({ histories });
  }
  // Probe only receipt-free inputs: every returned receipt was actually retained.
  const retainedCount = dialogues
    .flatMap((id) => {
      const projected = snapshots.project(id, messages(id, 250));
      snapshots.retain({ histories });
      return projected;
    })
    .filter(({ receipt }) => receipt !== undefined).length;
  expect(retainedCount).toBeLessThanOrEqual(1_000);
  expect(retainedCount).toBe(1_000);
});

test("trimming the latest window removes receipts of messages restored by earlier pagination", async () => {
  const store = createConversationStore({ actor, initial: [] });
  store.hydrate({
    actor,
    conversationId: "c",
    history: history(
      messages("c", 250).map((value) => ({
        ...value,
        receipt: { deliveredAt, readAt },
      })),
    ),
  });
  await store.earlier({ actor, conversationId: "c" }, async () =>
    history(messages("c", 100)),
  );
  const items = get(store.view).histories.get("c")?.items;
  expect(items?.[0]?.sequence).toBe(1);
  expect(
    items?.find(({ sequence }) => sequence === 1)?.receipt,
  ).toBeUndefined();
  expect(items?.find(({ sequence }) => sequence === 51)?.receipt).toEqual({
    deliveredAt,
    readAt,
  });
});

test("early capacity refuses an entire overflowing batch and preserves previously accepted state", () => {
  const snapshots = new ReceiptSnapshots();
  expect(snapshots.receive(batch("c", sequences))).toEqual({ kind: "applied" });
  const overflow = snapshots.receive({
    conversationId: "c",
    receipts: [
      { ...batch("c", [1]).receipts[0], readAt },
      ...batch("c", [51]).receipts,
    ],
  });
  expect(overflow.kind).toBe("resync-required");
  expect(overflow).toEqual({ kind: "resync-required", conversationId: "c" });
  const projected = snapshots.project("c", [message("c", 1), message("c", 51)]);
  expect(projected[0]?.receipt).toEqual({ deliveredAt, readAt: null });
  expect(projected[1]?.receipt).toBeUndefined();
});

test("pending receipts are bounded to five dialogues and 250 messages without evicting accepted entries", () => {
  const snapshots = new ReceiptSnapshots();
  for (let index = 0; index < 5; index++)
    snapshots.receive(batch(`c${index}`, sequences));
  const overflow = snapshots.receive(batch("c5", [1]));
  expect(overflow).toEqual({ kind: "resync-required", conversationId: "c5" });
  const pendingCount = Array.from({ length: 6 }, (_, index) => `c${index}`)
    .flatMap((id) => snapshots.project(id, messages(id, 50)))
    .filter(({ receipt }) => receipt !== undefined).length;
  expect(pendingCount).toBeLessThanOrEqual(250);
  expect(pendingCount).toBe(250);
});

test("projecting early receipts frees capacity and loaded messages do not consume the early buffer", () => {
  const store = createConversationStore({ actor, initial: [] });
  expect(store.receiveReceipts(batch("c", sequences), actor)).toEqual({
    kind: "applied",
  });
  store.hydrate({
    actor,
    conversationId: "c",
    history: history(messages("c", 200)),
  });
  expect(
    store.receiveReceipts(
      batch(
        "c",
        Array.from({ length: 200 }, (_, index) => index + 1),
      ),
      actor,
    ),
  ).toEqual({ kind: "applied" });
  expect(
    store.receiveReceipts(
      batch(
        "c",
        sequences.map((sequence) => sequence + 200),
      ),
      actor,
    ),
  ).toEqual({ kind: "applied" });
  expect(get(store.view).histories.get("c")?.items[0]?.receipt).toEqual({
    deliveredAt,
    readAt: null,
  });
  expect(store.receiveReceipts(batch("c", [251]), actor)).toEqual({
    kind: "resync-required",
    conversationId: "c",
  });
});

test("identity conflicts reject every staged receipt including updates to retained messages", () => {
  const snapshots = new ReceiptSnapshots();
  snapshots.receive(batch("c", [1]));
  expect(() =>
    snapshots.receive({
      conversationId: "c",
      receipts: [
        ...batch("c", [2]).receipts,
        { ...batch("c", [1]).receipts[0], recipientId: "other", readAt },
      ],
    }),
  ).toThrow("Conflicting receipt identity");
  const projected = snapshots.project("c", [message("c", 1), message("c", 2)]);
  expect(projected[0]?.receipt).toEqual({ deliveredAt, readAt: null });
  expect(projected[1]?.receipt).toBeUndefined();
});

test("retained identities without receipts reject conflicting sequence without poisoning later valid updates", () => {
  const store = createConversationStore({ actor, initial: [] });
  store.hydrate({
    actor,
    conversationId: "c",
    history: history([message("c", 1)]),
  });
  expect(() =>
    store.receiveReceipts(
      {
        ...batch("c", [1]),
        receipts: [{ ...batch("c", [1]).receipts[0], sequence: 2 }],
      },
      actor,
    ),
  ).toThrow();
  expect(store.receiveReceipts(batch("c", [1]), actor)).toEqual({
    kind: "applied",
  });
  expect(get(store.view).histories.get("c")?.items[0]?.receipt).toEqual({
    deliveredAt,
    readAt: null,
  });
});

test("clear and actor replacement remove retained and early receipts and report stale callers explicitly", () => {
  const store = createConversationStore({ actor, initial: [] });
  store.receiveReceipts(batch("early", [1]), actor);
  store.hydrate({
    actor,
    conversationId: "loaded",
    history: history([
      { ...message("loaded", 1), receipt: { deliveredAt, readAt } },
    ]),
  });
  store.clear();
  store.hydrate({
    actor,
    conversationId: "early",
    history: history([message("early", 1)]),
  });
  store.hydrate({
    actor,
    conversationId: "loaded",
    history: history([message("loaded", 1)]),
  });
  expect(
    get(store.view).histories.get("early")?.items[0]?.receipt,
  ).toBeUndefined();
  expect(
    get(store.view).histories.get("loaded")?.items[0]?.receipt,
  ).toBeUndefined();
  store.receiveReceipts(batch("early", [1]), actor);
  const next = { ...actor, generation: "login2" };
  store.reconcileActor(next);
  expect(store.receiveReceipts(batch("early", [1]), actor)).toEqual({
    kind: "stale",
  });
  store.hydrate({
    actor: next,
    conversationId: "early",
    history: history([message("early", 1)]),
  });
  expect(
    get(store.view).histories.get("early")?.items[0]?.receipt,
  ).toBeUndefined();
  store.reconcileActor(null);
  expect(store.receiveReceipts(batch("early", [1]), next)).toEqual({
    kind: "stale",
  });
});

test("overflow also refuses updates to retained receipts while preserving the full early buffer", () => {
  const store = createConversationStore({ actor, initial: [] });
  store.hydrate({
    actor,
    conversationId: "c",
    history: history([
      { ...message("c", 1000), receipt: { deliveredAt, readAt: null } },
    ]),
  });
  store.receiveReceipts(batch("c", sequences), actor);
  const overflow = store.receiveReceipts(
    {
      conversationId: "c",
      receipts: [
        { ...batch("c", [1000]).receipts[0], readAt },
        ...batch("c", [51]).receipts,
      ],
    },
    actor,
  );
  expect(overflow).toEqual({ kind: "resync-required", conversationId: "c" });
  expect(get(store.view).histories.get("c")?.items[0]?.receipt).toEqual({
    deliveredAt,
    readAt: null,
  });
  store.hydrate({
    actor,
    conversationId: "c",
    history: history([message("c", 1), message("c", 51)]),
  });
  const items = get(store.view).histories.get("c")?.items;
  expect(items?.find(({ sequence }) => sequence === 1)?.receipt).toEqual({
    deliveredAt,
    readAt: null,
  });
  expect(
    items?.find(({ sequence }) => sequence === 51)?.receipt,
  ).toBeUndefined();
});

test("duplicate early receipts occupy one slot and conflicting duplicates commit no prefix", () => {
  const snapshots = new ReceiptSnapshots();
  const duplicate = batch("c", sequences);
  expect(
    snapshots.receive({
      ...duplicate,
      receipts: [...duplicate.receipts, { ...duplicate.receipts[0], readAt }],
    }),
  ).toEqual({ kind: "applied" });
  expect(snapshots.project("c", [message("c", 1)])[0]?.receipt).toEqual({
    deliveredAt,
    readAt,
  });
  expect(() =>
    snapshots.receive({
      conversationId: "other",
      receipts: [
        ...batch("other", [1]).receipts,
        { ...batch("other", [1]).receipts[0], sequence: 2 },
      ],
    }),
  ).toThrow("Conflicting receipt identity");
  expect(
    snapshots.project("other", [message("other", 1)])[0]?.receipt,
  ).toBeUndefined();
});

test("a conflicting projection leaves pending receipts and earlier projected entries unchanged", () => {
  const snapshots = new ReceiptSnapshots();
  snapshots.receive(batch("c", [1]));
  expect(() =>
    snapshots.project("c", [
      { ...message("c", 2), receipt: { deliveredAt, readAt } },
      { ...message("c", 1), sequence: 3 },
    ]),
  ).toThrow("Conflicting receipt sequence");
  expect(
    snapshots
      .project("c", [message("c", 1), message("c", 2)])
      .map(({ receipt }) => receipt),
  ).toEqual([{ deliveredAt, readAt: null }, undefined]);
});

test("received and projected caller objects stay independent and stale receipt state never downgrades read", () => {
  const snapshots = new ReceiptSnapshots();
  const incoming = batch("c", [1]);
  const original = structuredClone(incoming);
  snapshots.receive(incoming);
  expect(incoming).toEqual(original);
  const first = incoming.receipts[0];
  if (!first) throw new Error("Missing fixture receipt");
  first.deliveredAt = null;
  const source = { ...message("c", 1), receipt: { deliveredAt: null, readAt } };
  const projected = snapshots.project("c", [source]);
  expect(source.receipt).toEqual({ deliveredAt: null, readAt });
  source.receipt.readAt = "2026-10-12T00:00:00.000Z";
  snapshots.receive({
    ...batch("c", [1]),
    receipts: [{ ...batch("c", [1]).receipts[0], deliveredAt: null }],
  });
  expect(projected[0]?.receipt).toEqual({ deliveredAt, readAt });
  expect(snapshots.project("c", [message("c", 1)])[0]?.receipt).toEqual({
    deliveredAt,
    readAt,
  });
});
