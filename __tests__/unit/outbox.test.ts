import { expect, test } from "bun:test";
import {
  afterAttempt,
  eligibility,
} from "../../apps/fe-insta/src/domains/conversations/browser/outbox/domain/transition";

const message = {
  ownerId: "owner",
  conversationId: "conversation",
  text: "draft",
  key: "key",
  clientMessageId: "client",
  operationId: "op",
  createdAt: 0,
  revision: 0,
  attempts: 0,
  nextAttemptAt: 0,
  lastAuthGeneration: "g1",
  needsConfirmation: false,
  state: "queued",
  manualAttempt: false,
} as const;
test.each([
  { now: 86399999, generation: "g1", online: true, want: "send" },
  { now: 86400000, generation: "g1", online: true, want: "confirm" },
  { now: 0, generation: "g2", online: true, want: "confirm" },
  { now: 0, generation: "g1", online: false, want: "wait" },
])(
  "auto send boundary $want at $now / $generation",
  ({ now, generation, online, want }) => {
    expect(
      eligibility({
        record: message,
        ownerId: "owner",
        authGeneration: generation,
        now,
        online,
      }),
    ).toBe(want);
  },
);
test("different account never sends an old owner's draft", () =>
  expect(
    eligibility({
      record: message,
      ownerId: "other",
      authGeneration: "g1",
      now: 0,
      online: true,
    }),
  ).toBe("wait"));
test("six attempts exhaust automatic retry budget", () =>
  expect(
    eligibility({
      record: { ...message, attempts: 6 },
      ownerId: "owner",
      authGeneration: "g1",
      now: 0,
      online: true,
    }),
  ).toBe("confirm"));
test.each([1, 2, 3, 4, 5])(
  "retry %i has bounded exponential backoff",
  (attempts) => {
    const next = afterAttempt({
      manualAttempt: false,
      record: { ...message, attempts },
      outcome: { kind: "unknown" },
      now: 100,
      jitter: 0,
    });
    expect(next.nextAttemptAt).toBe(
      [1100, 2100, 4100, 8100, 16100][attempts - 1],
    );
  },
);
test("Retry-After takes priority over normal delay", () =>
  expect(
    afterAttempt({
      manualAttempt: false,
      record: { ...message, attempts: 1 },
      outcome: { kind: "retry", retryAfterMs: 30000 },
      now: 100,
      jitter: 0,
    }).nextAttemptAt,
  ).toBe(30100));
test("permission failure stays terminal", () =>
  expect(
    afterAttempt({
      manualAttempt: false,
      record: { ...message, attempts: 1 },
      outcome: { kind: "terminal", code: "CONVERSATION_FORBIDDEN" },
      now: 0,
      jitter: 0,
    }).state,
  ).toBe("terminal"));

import {
  memoryQueue,
  readRecords,
  unavailableQueue,
} from "../../apps/fe-insta/__tests__/fixtures/outbox/memory";
import type { Sender } from "../../apps/fe-insta/src/domains/conversations/browser/outbox/ports/sender";
import { confirmResume } from "../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/confirm-resume";
import { drain } from "../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/drain";
import { enqueue } from "../../apps/fe-insta/src/domains/conversations/browser/outbox/use-cases/enqueue";

const fixture = async () => {
  const queue = memoryQueue();
  await queue.insert(message);
  const current = {
    actor: { ownerId: "owner", generation: "g1" } as {
      ownerId: string;
      generation: string;
    } | null,
    online: true,
  };
  const auth = {
    current: () => current.actor,
    reconcile: async () => {},
    online: () => current.online,
  };
  const locks = {
    run: async <T>(_owner: string, run: () => Promise<T>) => run(),
  };
  return { queue, current, auth, locks };
};
test("manual permission is consumed before sent attempt abort; a fresh drain needs a new confirmation", async () => {
  const f = await fixture();
  const controller = new AbortController();
  let sends = 0;
  const sender: Sender = async (record) => {
    sends++;
    expect(record.key).toBe("key");
    controller.abort();
    return { kind: "confirmed", messageId: "persisted" };
  };
  await drain(
    { ownerId: "owner", authGeneration: "g1", now: 86400000 },
    { ...f, sender, jitter: () => 0 },
  );
  await confirmResume({ ownerId: "owner", operationIds: ["op"] }, f);
  const first = await drain(
    { ownerId: "owner", authGeneration: "g1", now: 86400000 },
    { ...f, sender, signal: controller.signal, jitter: () => 0 },
  );
  expect(first.confirmed).toBe(0);
  expect((await readRecords(f.queue))[0]).toMatchObject({
    manualAttempt: false,
    state: "confirmation",
    needsConfirmation: true,
    attempts: 1,
    key: "key",
    createdAt: 0,
  });
  const next = await drain(
    { ownerId: "owner", authGeneration: "g1", now: 86410000 },
    { ...f, sender, jitter: () => 0 },
  );
  expect(next.sent).toBe(0);
  expect(sends).toBe(1);
  await confirmResume({ ownerId: "owner", operationIds: ["op"] }, f);
  expect(
    (
      await drain(
        { ownerId: "owner", authGeneration: "g1", now: 86410000 },
        {
          ...f,
          sender: async () => ({ kind: "confirmed", messageId: "persisted" }),
          jitter: () => 0,
        },
      )
    ).confirmed,
  ).toBe(1);
  expect(await readRecords(f.queue)).toHaveLength(0);
});
test("enqueue cannot promise durability after storage failure and preserves input", async () => {
  const draft = {
    ownerId: "owner",
    authGeneration: "g1",
    conversationId: "a".repeat(24),
    text: "keep draft",
  };
  const result = await enqueue(draft, {
    queue: unavailableQueue(),
    clock: () => 0,
    uuid: () => crypto.randomUUID(),
  });
  expect(result.isError()).toBe(true);
  expect(draft.text).toBe("keep draft");
});
test("enqueue preserves persisted operation and rejects operation 101", async () => {
  const queue = memoryQueue();
  for (let index = 0; index < 100; index++)
    expect(
      (
        await enqueue(
          {
            ownerId: "owner",
            authGeneration: "g1",
            conversationId: "a".repeat(24),
            text: "message",
          },
          { queue, clock: () => 100, uuid: () => crypto.randomUUID() },
        )
      ).isOk(),
    ).toBe(true);
  const rejected = await enqueue(
    {
      ownerId: "owner",
      authGeneration: "g1",
      conversationId: "a".repeat(24),
      text: "overflow",
    },
    { queue, clock: () => 100, uuid: () => crypto.randomUUID() },
  );
  if (rejected.isOk()) throw new Error("Expected queue overflow");
  expect(rejected.getError()).toBe("QUEUE_FULL");
  expect(await readRecords(queue)).toHaveLength(100);
});
test("lost confirmation persists same immutable payload for retry and removes only confirmed send", async () => {
  const f = await fixture();
  const sender: Sender = async (record) => {
    expect((await readRecords(f.queue))[0]?.attempts).toBe(1);
    expect(record.key).toBe("key");
    return { kind: "unknown" };
  };
  expect(
    (
      await drain(
        { ownerId: "owner", authGeneration: "g1", now: 0 },
        { ...f, sender, jitter: () => 0 },
      )
    ).sent,
  ).toBe(1);
  const persisted = (await readRecords(f.queue))[0];
  expect(persisted?.nextAttemptAt).toBe(1000);
  expect(persisted?.text).toBe("draft");
  expect(
    (
      await drain(
        { ownerId: "owner", authGeneration: "g1", now: 1000 },
        {
          ...f,
          sender: async () => ({ kind: "confirmed", messageId: "server" }),
          jitter: () => 0,
        },
      )
    ).confirmed,
  ).toBe(1);
  expect(await readRecords(f.queue)).toHaveLength(0);
});
test("reauth sends zero before explicit selection and old message gets only one manual attempt", async () => {
  const f = await fixture();
  f.current.actor = { ownerId: "owner", generation: "g2" };
  const sender: Sender = async () => ({ kind: "unknown" });
  expect(
    (
      await drain(
        { ownerId: "owner", authGeneration: "g2", now: 86400000 },
        { ...f, sender, jitter: () => 0 },
      )
    ).sent,
  ).toBe(0);
  expect((await readRecords(f.queue))[0]?.needsConfirmation).toBe(true);
  await confirmResume(
    { ownerId: "owner", operationIds: ["op"] },
    { queue: f.queue, auth: f.auth },
  );
  expect(
    (
      await drain(
        { ownerId: "owner", authGeneration: "g2", now: 86400000 },
        { ...f, sender, jitter: () => 0 },
      )
    ).sent,
  ).toBe(1);
  expect((await readRecords(f.queue))[0]).toMatchObject({
    createdAt: 0,
    key: "key",
    attempts: 1,
    needsConfirmation: true,
  });
  expect(
    (
      await drain(
        { ownerId: "owner", authGeneration: "g2", now: 86400001 },
        { ...f, sender, jitter: () => 0 },
      )
    ).sent,
  ).toBe(0);
});
test("logout during in-flight unknown result does not resurrect cleared owner data", async () => {
  const f = await fixture();
  const sender: Sender = async () => {
    await f.queue.clear("owner");
    f.current.actor = null;
    return { kind: "unknown" };
  };
  await drain(
    { ownerId: "owner", authGeneration: "g1", now: 0 },
    { ...f, sender, jitter: () => 0 },
  );
  expect(await readRecords(f.queue)).toHaveLength(0);
});

import { createAuthBrowser } from "../../apps/fe-insta/src/domains/users/browser/store";
import { submitAuthAction } from "../../apps/fe-insta/src/domains/users/browser/use-cases/submit";

test("async logout owner cleanup precedes revoke, failures still allow revoke", async () => {
  const account = { userId: "owner", username: "owner", generation: "g1" };
  const auth = createAuthBrowser({
    initial: { actor: account, status: "authenticated" },
    read: async () => null,
    clearPrivate: () => {},
    synchronization: {
      exclusive: async <T>(run: () => Promise<T>) => run(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  const order: string[] = [];
  auth.registerLogout(async (actor) => {
    expect(actor?.userId).toBe("owner");
    await Promise.resolve();
    order.push("clear");
    throw new Error("storage");
  });
  const result = await submitAuthAction({
    logout: true,
    ports: {
      auth,
      post: async () => {
        order.push("revoke");
        return { receipt: null, successful: true, revocation: "confirmed" };
      },
      apply: async () => {},
      refresh: async () => {},
      reset: () => {},
      onPending: () => {},
    },
  });
  expect(order).toEqual(["clear", "revoke"]);
  expect(result.isError()).toBe(true);
});
test("logout cleanup timeout still reaches backend revoke and reports uncertainty", async () => {
  const account = { userId: "owner", username: "owner", generation: "g1" };
  const auth = createAuthBrowser({
    initial: { actor: account, status: "authenticated" },
    read: async () => null,
    clearPrivate: () => {},
    synchronization: {
      exclusive: async <T>(run: () => Promise<T>) => run(),
      publish: () => {},
      subscribe: () => () => {},
    },
  });
  auth.registerLogout(() => new Promise(() => {}));
  let revoked = false;
  const result = await submitAuthAction({
    logout: true,
    ports: {
      auth,
      post: async () => {
        revoked = true;
        return { receipt: null, successful: true, revocation: "confirmed" };
      },
      apply: async () => {},
      refresh: async () => {},
      reset: () => {},
      onPending: () => {},
    },
  });
  expect(revoked).toBe(true);
  expect(result.isError()).toBe(true);
});
test("offline drain does not consume attempts or remove durable records", async () => {
  const f = await fixture();
  f.current.online = false;
  await drain(
    { ownerId: "owner", authGeneration: "g1", now: 100 },
    {
      ...f,
      sender: async () => {
        throw new Error("offline sender ran");
      },
      jitter: () => 0,
    },
  );
  expect((await readRecords(f.queue))[0]).toMatchObject({
    attempts: 0,
    key: "key",
    text: "draft",
  });
});
test("late old-generation persisted confirmation cannot remove old owner's retained record", async () => {
  const f = await fixture();
  const result = await drain(
    { ownerId: "owner", authGeneration: "g1", now: 0 },
    {
      ...f,
      sender: async () => {
        f.current.actor = { ownerId: "other", generation: "g2" };
        return { kind: "confirmed", messageId: "persisted" };
      },
      jitter: () => 0,
    },
  );
  expect(result.confirmed).toBe(0);
  expect(await readRecords(f.queue)).toHaveLength(1);
});
test("new login before first attempt requires confirmation without changing identity or creation time", async () => {
  const f = await fixture();
  await f.queue.clear("owner");
  const queued = await enqueue(
    {
      ownerId: "owner",
      authGeneration: "g1",
      conversationId: "a".repeat(24),
      text: "first draft",
    },
    { queue: f.queue, clock: () => 25, uuid: () => crypto.randomUUID() },
  );
  if (queued.isError()) throw new Error(queued.getError());
  f.current.actor = { ownerId: "owner", generation: "g2" };
  const result = await drain(
    { ownerId: "owner", authGeneration: "g2", now: 100 },
    {
      ...f,
      sender: async () => {
        throw new Error("sent before confirm");
      },
      jitter: () => 0,
    },
  );
  expect(result.sent).toBe(0);
  expect((await readRecords(f.queue))[0]).toMatchObject({
    key: queued.get().key,
    createdAt: 25,
    attempts: 0,
    needsConfirmation: true,
  });
});
