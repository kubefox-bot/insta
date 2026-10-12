import { expect } from "bun:test";
import { MongoClient, ObjectId } from "mongodb";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { createMongoProxy } from "../../../../../__tests__/fixtures/realtime/mongo-proxy";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import {
  createMongoDeliveryJournal,
  createMongoMembership,
} from "../../../src/domains/conversations/server/index";
import { prepareDelivery } from "../../../src/domains/conversations/use-cases/delivery/prepare";
import {
  authorizeActorSession,
  authorizeSession,
  login,
} from "../../../src/domains/users/index";
import { createMongoSessions } from "../../../src/domains/users/server/index";

const f = await createAuthEnvironment();
const proxy = await createMongoProxy(new URL(readTestApiConfig().mongo.url));
const client = new MongoClient(proxy.url, {
  monitorCommands: true,
  maxPoolSize: 1,
  serverSelectionTimeoutMS: 2000,
  connectTimeoutMS: 2000,
});
const id = new ObjectId();
const messageId = new ObjectId();
try {
  await client.connect();
  const db = client.db("insta_api");
  const signed = await login(
    { ...(await f.account()), operationId: f.operation() },
    f.auth,
  );
  if (signed.isError()) throw new Error(signed.getError());
  const authorized = await authorizeSession(
    { accessToken: signed.get().credentials.accessToken },
    f.auth,
  );
  if (authorized.isError()) throw new Error(authorized.getError());
  const actor = authorized.get();
  await f.db.collection(collections.conversations).insertOne({
    _id: id,
    participantIds: [actor.userId, "012345678901234567890123"],
    pairKey: f.runId,
    lastSequence: 1,
    lastActivityAt: new Date(),
    createdAt: new Date(),
  });
  await f.db.collection(collections.messages).insertOne({
    _id: messageId,
    conversationId: id.toHexString(),
    senderId: actor.userId,
    text: "Synthetic cancellation",
    sequence: 1,
    createdAt: new Date(),
  });
  const sessions = createMongoSessions({
    apiDb: db,
    startSession: () => client.startSession(),
    clock: f.clock,
  });
  const membership = createMongoMembership(db);
  const journal = createMongoDeliveryJournal({
    db,
    startSession: () => client.startSession(),
  });
  const probes = [
    (signal: AbortSignal) => sessions.read(actor.backendSessionId, signal),
    (signal: AbortSignal) =>
      membership.permits({
        actorId: actor.userId,
        conversationId: id.toHexString(),
        signal,
      }),
    (signal: AbortSignal) =>
      journal.head({
        stream: { kind: "conversation", id: id.toHexString() },
        signal,
      }),
    (signal: AbortSignal) =>
      prepareDelivery(
        {
          actor,
          target: { kind: "conversation", id: id.toHexString() },
          signal,
        },
        {
          authorize: (input) =>
            authorizeActorSession(input, { ...f.auth, sessions }),
          membership,
          journal,
          clock: Date.now,
          uuid: () => crypto.randomUUID(),
        },
      ),
  ];
  const durations: number[] = [];
  for (const probe of probes) {
    await db.command({ ping: 1 });
    const controller = new AbortController();
    const baseline = proxy.closed();
    const arrived = proxy.arm();
    const operation = probe(controller.signal);
    await arrived;
    const started = performance.now();
    controller.abort(new Error("Owned test cancellation"));
    await expect(operation).rejects.toBeDefined();
    await proxy.waitForClose(baseline);
    const duration = performance.now() - started;
    durations.push(duration);
    expect(duration).toBeLessThan(2000);
    proxy.resume();
  }
  process.stdout.write(
    JSON.stringify({
      cancellation: "passed",
      actualInterruptedOperations: probes.length,
      allCleanedBefore2000Ms: durations.every((duration) => duration < 2000),
    }),
  );
} finally {
  try {
    await client.close();
    await proxy.dispose();
    await f.db.collection(collections.messages).deleteOne({ _id: messageId });
    await f.db.collection(collections.conversations).deleteOne({ _id: id });
  } finally {
    await f.dispose();
  }
}
