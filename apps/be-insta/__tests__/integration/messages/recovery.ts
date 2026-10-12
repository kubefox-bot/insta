import { expect } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { ObjectId } from "mongodb";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import {
  dispatchMessageOutbox,
  sendMessage,
} from "../../../src/domains/conversations/index";
import {
  createCommitMessage,
  createMongoConversations,
  createMongoOutbox,
  ensureConversationsIndexes,
  messageIdentity,
} from "../../../src/domains/conversations/server/index";
import { sessionCredentialsSchema } from "../../../src/domains/users/auth/domain/credentials";
import { authorizeSession, login } from "../../../src/domains/users/index";
import { verifyTransactionFaults } from "./transaction-faults";

const f = await createAuthEnvironment({
  collectionNamespace: `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
});
const owned: string[] = [];
const actors: string[] = [];
try {
  await ensureConversationsIndexes(f.db);
  const credentials = await Promise.all(
    [f.account(), f.account()].map(async (pending) => {
      const account = await pending;
      const result = await login(
        { ...account, operationId: f.operation() },
        f.auth,
      );
      if (result.isError()) throw new Error(result.getError());
      return sessionCredentialsSchema.parse(result.get().credentials);
    }),
  );
  const alice = credentials[0];
  const bob = credentials[1];
  if (!alice || !bob) throw new Error("Missing synthetic credentials");
  actors.push(alice.user.id, bob.user.id);
  const actor = await authorizeSession(
    { accessToken: alice.accessToken },
    f.auth,
  );
  if (actor.isError()) throw new Error(actor.getError());
  const store = createMongoConversations({
    ...f.database,
    db: f.db,
    clock: f.clock,
  });
  const started = await store.startPair({
    participantIds: [alice.user.id, bob.user.id],
    operationId: f.operation(),
  });
  if (started.isError()) throw new Error(started.getError());
  const conversationId = started.get().conversation.id;
  owned.push(conversationId);
  const commit = createCommitMessage({
    clock: Date.now,
    retentionMs: 86_400_000,
    db: f.db,
    startSession: f.database.startSession,
  });
  const dependencies = {
    commit,
    identity: messageIdentity,
    quota: { consume: async () => Result.Ok("allowed" as const) },
    clock: f.clock,
    uuid: () => crypto.randomUUID(),
  };
  const input = {
    actor: actor.get(),
    conversationId,
    text: "persisted before response lost",
    idempotencyKey: crypto.randomUUID(),
    operationId: f.operation(),
  };
  const unknown = await sendMessage(input, {
    ...dependencies,
    commit: async (value) => {
      const result = await commit(value);
      expect(result.isOk()).toBe(true);
      return Result.Error("unknown");
    },
  });
  expect(unknown.isError()).toBe(true);
  if (unknown.isOk()) throw new Error("Expected unknown response outcome");
  expect(String(unknown.getError())).toBe("OPERATION_OUTCOME_UNKNOWN");
  expect(
    await f.db
      .collection(collections.messages)
      .countDocuments({ conversationId }),
  ).toBe(1);
  const replay = await sendMessage(input, dependencies);
  expect(replay.isOk()).toBe(true);
  if (replay.isError()) throw new Error(replay.getError());
  expect(replay.get().sequence).toBe(1);
  expect(
    await f.db
      .collection(collections.events)
      .countDocuments({ conversationId, kind: "message_sent" }),
  ).toBe(1);
  const outbox = createMongoOutbox({ db: f.db, conversationIds: owned });
  const published = new Set<string>();
  const analytics = new Set<string>();
  const sinks = {
    realtime: async ({
      event,
    }: {
      readonly event: { readonly eventId: string };
    }) => {
      published.add(event.eventId);
    },
    analytics: async ({
      event,
    }: {
      readonly event: { readonly analyticsEventId: string };
    }) => {
      analytics.add(event.analyticsEventId);
    },
  };
  // Failure before publish keeps that sink pending while another can finish.
  await dispatchMessageOutbox({
    outbox,
    sinks: {
      ...sinks,
      realtime: async () => {
        throw new Error("before publish");
      },
    },
    clock: f.clock,
    uuid: () => crypto.randomUUID(),
  });
  const row = await f.db
    .collection(collections.outbox)
    .findOne({ conversationId });
  expect(row?.deliveries.realtime.state).toBe("pending");
  expect(row?.deliveries.analytics.state).toBe("delivered");
  expect(row?.deliveries.realtime.nextAttemptAt).toBeGreaterThan(f.clock());
  expect(analytics.size).toBe(1);
  expect(published.size).toBe(0);
  f.advance(1001);
  // Crash after publish but before durable acknowledgement redelivers stable ID.
  const claim = await outbox.claim({
    sink: "realtime",
    now: f.clock(),
    leaseId: crypto.randomUUID(),
  });
  if (!claim) throw new Error("No pending event reclaimed");
  await sinks.realtime({ event: claim.event });
  expect(published.size).toBe(1);
  expect(
    await outbox.claim({
      sink: "realtime",
      now: f.clock(),
      leaseId: crypto.randomUUID(),
    }),
  ).toBeNull();
  f.advance(30001);
  // New process/adapter discovers durable work without any stream task.
  const restarted = createMongoOutbox({ db: f.db, conversationIds: owned });
  await dispatchMessageOutbox({
    outbox: restarted,
    sinks,
    clock: f.clock,
    uuid: () => crypto.randomUUID(),
  });
  expect(published.size).toBe(1);
  expect(analytics.size).toBe(1);
  const delivered = await f.db
    .collection(collections.outbox)
    .findOne({ conversationId });
  expect(delivered?.deliveries.realtime.state).toBe("delivered");
  expect(delivered?.deliveries.analytics.attempts).toBe(1);
  expect(delivered?.deliveries.realtime.attempts).toBe(3);
  // Late old lease cannot acknowledge or fail work owned by a new attempt.
  expect(await restarted.complete({ ...claim, now: f.clock() })).toBe(false);
  expect(await restarted.fail({ ...claim, nextAttemptAt: f.clock() })).toBe(
    false,
  );
  expect(
    await f.db
      .collection(collections.messages)
      .countDocuments({ conversationId }),
  ).toBe(1);
  expect(
    (
      await f.db
        .collection(collections.conversations)
        .findOne({ _id: new ObjectId(conversationId) })
    )?.lastSequence,
  ).toBe(1);
  const timeoutKey = crypto.randomUUID();
  const timeoutResult = await sendMessage(
    { ...input, text: "attempt timeout persisted", idempotencyKey: timeoutKey },
    dependencies,
  );
  if (timeoutResult.isError()) throw new Error(timeoutResult.getError());
  const cancellation = Promise.withResolvers<void>();
  const cleanup = Promise.withResolvers<void>();
  let publicationActive = false;
  let dispatchReturned = false;
  const timeoutSinks = {
    ...sinks,
    realtime: async ({ signal }: { readonly signal: AbortSignal }) => {
      publicationActive = true;
      signal.addEventListener("abort", () => cancellation.resolve(), {
        once: true,
      });
      try {
        await cleanup.promise;
      } finally {
        publicationActive = false;
      }
    },
  };
  const beforeTimeout = await f.db
    .collection(collections.outbox)
    .findOne({ messageId: timeoutResult.get().id });
  const dispatching = dispatchMessageOutbox({
    outbox: restarted,
    sinks: timeoutSinks,
    clock: f.clock,
    uuid: () => crypto.randomUUID(),
  }).finally(() => {
    dispatchReturned = true;
  });
  const watchdog = setTimeout(() => {
    cleanup.resolve();
    cancellation.reject(new Error("Cancellation barrier not reached"));
  }, 25000);
  try {
    await cancellation.promise;
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(publicationActive).toBe(true);
    expect(dispatchReturned).toBe(false);
    const held = await f.db
      .collection(collections.outbox)
      .findOne({ messageId: timeoutResult.get().id });
    expect(held?.deliveries.realtime.state).toBe("pending");
    expect(held?.deliveries.realtime.leaseUntil).toBeGreaterThan(f.clock());
    expect(held?.eventId).toBe(beforeTimeout?.eventId);
    cleanup.resolve();
    await dispatching;
    expect(publicationActive).toBe(false);
  } finally {
    cleanup.resolve();
    clearTimeout(watchdog);
    await dispatching;
  }
  const timedOut = await f.db
    .collection(collections.outbox)
    .findOne({ messageId: timeoutResult.get().id });
  expect(timedOut?.deliveries.realtime.state).toBe("pending");
  expect(timedOut?.deliveries.realtime.nextAttemptAt).toBeGreaterThan(
    f.clock(),
  );
  expect(timedOut?.deliveries.analytics.state).toBe("delivered");
  expect(timedOut?.eventId).toBe(beforeTimeout?.eventId);
  expect(timedOut?.deliveries.realtime.deliveredAt).toBeUndefined();
  expect(timedOut?.deliveries.realtime.attempts).toBe(1);
  await verifyTransactionFaults({
    db: f.db,
    startSession: f.database.startSession,
    actor: actor.get(),
    conversationId,
    clock: f.clock,
  });
  process.stdout.write(
    JSON.stringify({
      nativeRecovery: "passed",
      persisted: 1,
      stableEventIds: 1,
      independentSinks: true,
      backendOwner: process.cwd().endsWith("/apps/be-insta"),
    }),
  );
} finally {
  try {
    const remaining = await f.db
      .collection(collections.conversations)
      .find({ participantIds: { $in: actors } })
      .toArray();
    owned.push(...remaining.map((row) => row._id.toHexString()));
    for (const name of [
      collections.messages,
      collections.events,
      collections.identities,
      collections.outbox,
    ]) {
      await f.db
        .collection(name)
        .deleteMany({ conversationId: { $in: owned } });
      expect(
        await f.db
          .collection(name)
          .countDocuments({ conversationId: { $in: owned } }),
      ).toBe(0);
    }
    await f.db
      .collection(collections.conversations)
      .deleteMany({ _id: { $in: owned.map((id) => new ObjectId(id)) } });
  } finally {
    await f.dispose();
  }
}
