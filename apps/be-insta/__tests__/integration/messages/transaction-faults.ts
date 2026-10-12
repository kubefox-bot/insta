import { expect } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { type ClientSession, type Db, MongoServerError } from "mongodb";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import { sendMessage } from "../../../src/domains/conversations/index";
import {
  createCommitMessage,
  messageIdentity,
} from "../../../src/domains/conversations/server/index";
import type { Actor } from "../../../src/domains/users/index";
export const verifyTransactionFaults = async ({
  db,
  startSession,
  actor,
  conversationId,
  clock,
}: Readonly<{
  db: Db;
  startSession: () => ClientSession;
  actor: Actor;
  conversationId: string;
  clock: () => number;
}>) => {
  const input = () => ({
    actor,
    conversationId,
    text: "fault-controlled persisted effect",
    operationId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
  });
  const deps = {
    identity: messageIdentity,
    quota: { consume: async () => Result.Ok("allowed" as const) },
    clock,
    uuid: () => crypto.randomUUID(),
  };
  const before = await db
    .collection(collections.messages)
    .countDocuments({ conversationId });
  // Driver commits on the real server; its returned outcome is then lost.
  const uncertainCommit = createCommitMessage({
    clock: Date.now,
    retentionMs: 86_400_000,
    db,
    startSession: () => {
      const session = startSession();
      const original = session.withTransaction.bind(session);
      session.withTransaction = async (callback, options) => {
        await original(callback, options);
        throw new Error("Committed outcome lost before adapter response");
      };
      return session;
    },
  });
  const uncertainInput = input();
  const recovered = await sendMessage(uncertainInput, {
    ...deps,
    commit: uncertainCommit,
  });
  if (recovered.isError()) throw new Error(recovered.getError());
  const normal = createCommitMessage({
    clock: Date.now,
    retentionMs: 86_400_000,
    db,
    startSession,
  });
  const replay = await sendMessage(uncertainInput, { ...deps, commit: normal });
  if (replay.isError()) throw new Error(replay.getError());
  expect(replay.get()).toEqual(recovered.get());
  // UnknownTransactionCommitResult retries commit, not the business callback.
  let commits = 0;
  let callbacks = 0;
  const unknownCommit = createCommitMessage({
    clock: Date.now,
    retentionMs: 86_400_000,
    db,
    startSession: () => {
      const session = startSession();
      const original = session.commitTransaction.bind(session);
      session.commitTransaction = async (options) => {
        await original(options);
        commits++;
        if (commits === 1)
          throw new MongoServerError({
            message: "Commit response lost",
            errorLabels: ["UnknownTransactionCommitResult"],
          });
      };
      const transaction = session.withTransaction.bind(session);
      session.withTransaction = (callback, options) =>
        transaction((current) => {
          callbacks++;
          return callback(current);
        }, options);
      return session;
    },
  });
  const committed = await sendMessage(input(), {
    ...deps,
    commit: unknownCommit,
  });
  expect(committed.isOk()).toBe(true);
  expect(commits).toBe(2);
  expect(callbacks).toBe(1);
  // A transient conflict aborts all callback effects then retries the callback.
  let attempts = 0;
  const transient = createCommitMessage({
    clock: Date.now,
    retentionMs: 86_400_000,
    db,
    startSession: () => {
      const session = startSession();
      const original = session.withTransaction.bind(session);
      session.withTransaction = (callback, options) =>
        original(async (current) => {
          const outcome = await callback(current);
          attempts++;
          if (attempts === 1)
            throw new MongoServerError({
              message: "Transient conflict",
              errorLabels: ["TransientTransactionError"],
            });
          return outcome;
        }, options);
      return session;
    },
  });
  const retried = await sendMessage(input(), { ...deps, commit: transient });
  expect(retried.isOk()).toBe(true);
  expect(attempts).toBe(2);
  // Failure after all callback writes, before commit, leaves no partial effect.
  const aborted = createCommitMessage({
    clock: Date.now,
    retentionMs: 86_400_000,
    db,
    startSession: () => {
      const session = startSession();
      const original = session.withTransaction.bind(session);
      session.withTransaction = (callback, options) =>
        original(async (current) => {
          await callback(current);
          throw new Error("Before commit rollback");
        }, options);
      return session;
    },
  });
  const failed = await sendMessage(input(), { ...deps, commit: aborted });
  expect(failed.isError()).toBe(true);
  expect(
    await db
      .collection(collections.messages)
      .countDocuments({ conversationId }),
  ).toBe(before + 3);
  expect(
    await db
      .collection(collections.identities)
      .countDocuments({ conversationId }),
  ).toBe(before + 3);
  expect(
    await db.collection(collections.outbox).countDocuments({ conversationId }),
  ).toBe(before + 3);
  expect(
    await db
      .collection(collections.events)
      .countDocuments({ conversationId, kind: "message_sent" }),
  ).toBe(before + 3);
  expect(
    (
      await db
        .collection(collections.messages)
        .find({ conversationId })
        .sort({ sequence: 1 })
        .toArray()
    ).map((row) => row.sequence),
  ).toEqual(Array.from({ length: before + 3 }, (_, index) => index + 1));
};
