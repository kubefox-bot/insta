import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { get } from "svelte/store";
import { outboxHarness } from "../../apps/fe-insta/__tests__/fixtures/outbox/harness";
import {
  memoryQueue,
  readRecords,
  unavailableQueue,
} from "../../apps/fe-insta/__tests__/fixtures/outbox/memory";
import type { SendOutcome } from "../../apps/fe-insta/src/domains/conversations/browser/outbox/domain/types";
import { enqueue } from "../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/enqueue";

test.each(["dispose", "reauth"] as const)(
  "pending durable confirmation update after %s cannot commit selection",
  async (scenario) => {
    const base = memoryQueue();
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let sends = 0;
    const h = outboxHarness({
      sender: async () => {
        sends++;
        return { kind: "unknown" };
      },
      queue: {
        ...base,
        update: async (
          record,
          revision,
          options?: Readonly<{ signal?: AbortSignal }>,
        ) => {
          started.resolve();
          await release.promise;
          return base.update(record, revision, options);
        },
      },
    });
    try {
      const queued = await enqueue(
        {
          ownerId: "owner",
          authGeneration: "g1",
          conversationId: "a".repeat(24),
          text: "pending durable selection",
        },
        { queue: base, clock: () => 0, uuid: () => crypto.randomUUID() },
      );
      if (queued.isError()) throw Error(queued.getError());
      const record = queued.get();
      await base.update(
        {
          ...record,
          state: "confirmation",
          needsConfirmation: true,
          revision: 1,
        },
        0,
      );
      const before = await readRecords(base);
      const pending = h.outbox.confirmResume([record.operationId]);
      await started.promise;
      if (scenario === "dispose") h.outbox.dispose();
      else h.change({ ownerId: "owner", generation: "g2" });
      release.resolve();
      expect((await pending).isError()).toBe(true);
      expect(await readRecords(base)).toEqual(before);
      expect(sends).toBe(0);
    } finally {
      release.resolve();
      h.outbox.dispose();
    }
  },
);

test("durable facade reports persistence failure without promising queued draft", async () => {
  const h = outboxHarness({
    queue: unavailableQueue(),
    sender: async () => ({ kind: "unknown" }),
  });
  try {
    const draft = { conversationId: "a".repeat(24), text: "open draft" };
    const result = await h.outbox.enqueue(draft);
    expect(result.isError()).toBe(true);
    expect(draft.text).toBe("open draft");
    expect(get(h.outbox.view)).toMatchObject({
      records: [],
      issue: "PERSISTENCE_FAILED",
      issueSource: "enqueue",
    });
  } finally {
    h.outbox.dispose();
  }
});
test("failed queue read retains a read-specific retry cause", async () => {
  const h = outboxHarness({
    queue: {
      ...memoryQueue(),
      list: async () => Result.Error("PERSISTENCE_FAILED"),
    },
    sender: async () => ({ kind: "unknown" }),
  });
  try {
    await h.outbox.wake();
    expect(get(h.outbox.view)).toMatchObject({
      records: [],
      issue: "PERSISTENCE_FAILED",
      issueSource: "read",
    });
  } finally {
    h.outbox.dispose();
  }
});
test("logout clears persistence and late pending confirmation cannot recreate queue or view", async () => {
  const sent = Promise.withResolvers<void>();
  const response = Promise.withResolvers<SendOutcome>();
  const h = outboxHarness({
    sender: async () => {
      sent.resolve();
      return response.promise;
    },
  });
  try {
    await h.outbox.enqueue({
      conversationId: "a".repeat(24),
      text: "synthetic",
    });
    await sent.promise;
    await h.logout();
    expect(await readRecords(h.queue)).toHaveLength(0);
    response.resolve({ kind: "confirmed", messageId: "persisted" });
    await h.outbox.wake();
    expect(get(h.outbox.view).records).toHaveLength(0);
  } finally {
    response.resolve({ kind: "unknown" });
    h.outbox.dispose();
  }
});
test("identity change during active pass projects new owner's queue after late response", async () => {
  const sent = Promise.withResolvers<void>();
  const response = Promise.withResolvers<SendOutcome>();
  const projected = Promise.withResolvers<void>();
  const h = outboxHarness({
    sender: async () => {
      sent.resolve();
      return response.promise;
    },
  });
  const release = h.outbox.view.subscribe((view) => {
    if (view.ownerId === "other") projected.resolve();
  });
  try {
    await h.outbox.enqueue({
      conversationId: "a".repeat(24),
      text: "synthetic",
    });
    await sent.promise;
    h.change({ ownerId: "other", generation: "g2" });
    response.resolve({ kind: "confirmed", messageId: "persisted" });
    await h.outbox.wake();
    await Promise.race([
      projected.promise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("New owner never projected")), 100),
      ),
    ]);
    expect(get(h.outbox.view).ownerId).toBe("other");
    expect(await readRecords(h.queue)).toHaveLength(1);
  } finally {
    release();
    response.resolve({ kind: "unknown" });
    h.outbox.dispose();
  }
});
test("focus/reconnect wake recovers unavailable actor before selecting that account's durable queue", async () => {
  const h = outboxHarness({
    sender: async () => ({ kind: "confirmed", messageId: "persisted" }),
  });
  try {
    await enqueue(
      {
        ownerId: "owner",
        authGeneration: "g1",
        conversationId: "a".repeat(24),
        text: "recover queued",
      },
      { queue: h.queue, clock: () => 0, uuid: () => crypto.randomUUID() },
    );
    h.state.actor = null;
    h.state.recoverActor = { ownerId: "owner", generation: "g1" };
    const result = await h.outbox.wake();
    expect(get(h.outbox.view).ownerId).toBe("owner");
    expect(result.confirmed).toBe(1);
    expect(await readRecords(h.queue)).toHaveLength(0);
  } finally {
    h.outbox.dispose();
  }
});
test("dispose aborts owned pending auth read and ignores its late state effects", async () => {
  const started = Promise.withResolvers<AbortSignal>();
  const h = outboxHarness({
    sender: async () => ({ kind: "unknown" }),
    reconcile: async (options) =>
      new Promise<void>((_resolve, reject) => {
        const signal = options?.signal;
        if (!signal) throw new Error("Owned auth signal missing");
        started.resolve(signal);
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  });
  const pending = h.outbox.wake();
  const signal = await started.promise;
  h.outbox.dispose();
  await pending;
  expect(signal.aborted).toBe(true);
  expect(get(h.outbox.view)).toEqual({
    ownerId: null,
    records: [],
    busy: false,
  });
});
test.each(["dispose", "reauth"] as const)(
  "held confirmation after %s retains selection state, immutable identity and sends nothing",
  async (scenario) => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let sends = 0;
    const h = outboxHarness({
      sender: async () => {
        sends++;
        return { kind: "confirmed", messageId: "persisted" };
      },
      reconcile: async () => {
        started.resolve();
        await release.promise;
      },
    });
    try {
      const queued = await enqueue(
        {
          ownerId: "owner",
          authGeneration: "g1",
          conversationId: "a".repeat(24),
          text: "must confirm",
        },
        { queue: h.queue, clock: () => 0, uuid: () => crypto.randomUUID() },
      );
      if (queued.isError()) throw new Error(queued.getError());
      const record = queued.get();
      await h.queue.update(
        {
          ...record,
          state: "confirmation",
          needsConfirmation: true,
          revision: 1,
        },
        0,
      );
      const pending = h.outbox.confirmResume([record.operationId]);
      await started.promise;
      if (scenario === "dispose") h.outbox.dispose();
      else h.change({ ownerId: "owner", generation: "g2" });
      release.resolve();
      const result = await pending;
      expect(result.isError()).toBe(true);
      expect((await readRecords(h.queue))[0]).toMatchObject({
        state: "confirmation",
        needsConfirmation: true,
        key: record.key,
        clientMessageId: record.clientMessageId,
        operationId: record.operationId,
        createdAt: 0,
        lastAuthGeneration: "g1",
        attempts: 0,
      });
      expect(sends).toBe(0);
    } finally {
      release.resolve();
      h.outbox.dispose();
    }
  },
);
