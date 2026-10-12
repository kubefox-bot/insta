import { expect } from "bun:test";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import type { OutboxDocument } from "../../../src/domains/conversations/adapters/mongo/types";
import {
  createMongoOutbox,
  startRealtimeWorker,
} from "../../../src/domains/conversations/server/index";
import { connectDatabase } from "../../../src/lib/database/index";
import {
  createDatabaseNamespace,
  runtimeCollectionNamespaceSchema,
} from "../../fixtures/realtime/database-namespace";

const config = readTestApiConfig();
const database = await connectDatabase({ config: config.mongo });
const prefix = runtimeCollectionNamespaceSchema.parse(
  `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
);
const namespace = createDatabaseNamespace({ db: database.apiDb, prefix });
const eventId = crypto.randomUUID();
const started = Promise.withResolvers<void>();
const aborted = Promise.withResolvers<void>();
const cleanup = Promise.withResolvers<void>();
let providerSettled = false;
let workerClosed = false;
const documents = namespace.db.collection<OutboxDocument>(collections.outbox);
try {
  const delivery = {
    state: "pending",
    attempts: 0,
    leaseUntil: 0,
    nextAttemptAt: 0,
  } as const;
  await documents.insertOne({
    _id: eventId,
    eventId,
    analyticsEventId: crypto.randomUUID(),
    kind: "message_sent",
    operation: "message.send",
    authority: "server_canonical",
    operationId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    conversationId: crypto.randomUUID(),
    actorId: crypto.randomUUID(),
    sequence: 1,
    createdAt: Date.now(),
    deliveries: { realtime: delivery, analytics: delivery },
  });
  const outbox = createMongoOutbox({ db: namespace.db });
  const worker = startRealtimeWorker({
    maintenance: async () => {},
    outbox,
    publish: async ({ signal }) => {
      signal.addEventListener("abort", () => aborted.resolve(), { once: true });
      started.resolve();
      await cleanup.promise;
      providerSettled = true;
    },
    onError: () => {
      throw new Error("Unexpected provider failure");
    },
  });
  await started.promise;
  const before = performance.now();
  const closing = worker.close().then(() => {
    expect(providerSettled).toBe(true);
    workerClosed = true;
  });
  const watchdog = setTimeout(
    () => aborted.reject(new Error("Provider shutdown did not abort sink")),
    2000,
  );
  try {
    await aborted.promise;
    expect(providerSettled).toBe(false);
    expect(workerClosed).toBe(false);
    const held = await documents.findOne({ _id: eventId });
    expect(held?.deliveries.realtime.state).toBe("pending");
    expect(held?.deliveries.realtime.leaseUntil).toBeGreaterThan(Date.now());
  } finally {
    clearTimeout(watchdog);
    cleanup.resolve();
    await closing;
  }
  expect(performance.now() - before).toBeLessThan(15_000);
  expect(workerClosed).toBe(true);
  const pending = await documents.findOne({ _id: eventId });
  expect(pending?.deliveries.realtime.state).toBe("pending");
  expect(pending?.deliveries.realtime.leaseUntil).toBe(0);
  expect(pending?.deliveries.realtime.attempts).toBe(1);
  const restarted = await connectDatabase({ config: config.mongo });
  try {
    const resumedNamespace = createDatabaseNamespace({
      db: restarted.apiDb,
      prefix,
    });
    const resumed = createMongoOutbox({ db: resumedNamespace.db });
    const now = Date.now() + 2000;
    const claim = await resumed.claim({
      sink: "realtime",
      now,
      leaseId: crypto.randomUUID(),
    });
    expect(claim?.event.eventId).toBe(eventId);
    expect(claim?.attempts).toBe(2);
    if (!claim) throw new Error("Pending event absent after reconnect");
    expect(await resumed.complete({ ...claim, now })).toBe(true);
    expect(
      (await documents.findOne({ _id: eventId }))?.deliveries.realtime.state,
    ).toBe("delivered");
  } finally {
    await restarted.close();
  }
  process.stdout.write(
    JSON.stringify({
      persistedPending: true,
      sameEventAfterRestart: true,
      boundedSettlement: true,
    }),
  );
} finally {
  try {
    await namespace.dispose();
  } finally {
    await database.close();
  }
}
