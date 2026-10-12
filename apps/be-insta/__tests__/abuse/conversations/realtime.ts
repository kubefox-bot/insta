import { expect } from "bun:test";
import { createHmac } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";
import { io, type Socket } from "socket.io-client";
import { waitUntil } from "../../../../../__tests__/fixtures/barrier";
import { connectDeliveryFixture } from "../../../../../__tests__/fixtures/delivery/runtime";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { createMongoProxy } from "../../../../../__tests__/fixtures/realtime/mongo-proxy";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import { createApplication } from "../../../src/app/bootstrap";
import { createConversationsDependencies } from "../../../src/app/composition/conversations/index";
import { createDirectoryDependencies } from "../../../src/app/composition/users/index";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import { deliveryCollections } from "../../../src/domains/conversations/adapters/mongo/delivery/conts";
import type {
  DeliveryDocument,
  DeliveryMetadata,
} from "../../../src/domains/conversations/adapters/mongo/delivery/types";
import { outboxDocumentSchema } from "../../../src/domains/conversations/adapters/mongo/outbox-schema";
import { startConversation } from "../../../src/domains/conversations/index";
import {
  createConversationGateway,
  createMongoMembership,
} from "../../../src/domains/conversations/server/index";
import {
  authorizeActorSession,
  authorizeSession,
  login,
} from "../../../src/domains/users/index";
import {
  createDragonflyWsTickets,
  createMongoSessions,
} from "../../../src/domains/users/server/index";
import { readRealtimeConfig } from "../../../src/lib/config/index";
import {
  connectDragonfly,
  createActorQuota,
  readGeneration,
} from "../../../src/lib/dragonfly/index";
import {
  createCommandObserver,
  realtimePolicy,
} from "../../../src/lib/realtime/index";
import {
  activatePrepared,
  receiveDelivery,
} from "../../fixtures/realtime/client";

await using deliveryResources = new AsyncDisposableStack();
const f = await createAuthEnvironment();
const config = readTestApiConfig();
const broker = await connectDragonfly({ config: config.dragonfly });
const delivery = await connectDeliveryFixture().catch((error) => {
  broker.close();
  throw error;
});
deliveryResources.defer(delivery.close);
const proxy = await createMongoProxy(new URL(config.mongo.url));
const client = new MongoClient(proxy.url, {
  maxPoolSize: 2,
  serverSelectionTimeoutMS: 2000,
  connectTimeoutMS: 2000,
});
const sockets: Socket[] = [];
const ids: string[] = [];
const actorIds = new Set<string>();
const foreignStreamId = `unread:${new ObjectId().toHexString()}`;
/** Формирует точный scope из ID, созданных этим запуском; произвольный filter не принимается. */
const ownedStreamIds = () => {
  if (![...ids, ...actorIds].every((id) => ObjectId.isValid(id)))
    throw new Error("Invalid owned fixture identity");
  return [
    ...ids.map((id) => `conversation:${id}`),
    ...[...actorIds].map((id) => `unread:${id}`),
  ];
};
const keys = new Set<string>();
await client.connect();
const sessions = createMongoSessions({
  apiDb: client.db("insta_api"),
  startSession: () => client.startSession(),
  clock: f.clock,
});
const tickets = createDragonflyWsTickets({ client: broker });
const generation = await readGeneration(broker);
const key = createHmac("sha256", Buffer.from(config.authLimitsKey, "hex"))
  .update(f.runId)
  .digest("hex");
const directory = createDirectoryDependencies({
  database: f.database,
  broker,
  key,
});
const chat = delivery.ownChat(
  await createConversationsDependencies({
    deliveryBroker: delivery.provider,
    retentionMs: 86_400_000,
    policy: readRealtimeConfig({}),
    database: f.database,
    broker,
    key,
    directory: { findPublicUser: directory.findPublicUser },
  }),
);
const app = await createApplication(
  {
    users: { ...f.users, tickets },
    chat,
    directory: directory.directory,
    checkRequired: async () => true,
    check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
    close: async () => {},
  },
  { mode: "offline" },
);
const gateway = createConversationGateway({
  server: app.getHttpServer(),
  origin: "https://localhost",
  tickets,
  authorize: (input) => authorizeActorSession(input, { ...f.auth, sessions }),
  membership: createMongoMembership(f.db),
  journal: chat.realtime.journal,
  streams: chat.realtime.streams,
  policy: chat.realtime.policy,
  quota: createActorQuota({
    client: broker,
    key,
    namespace: "realtime",
    maximum: realtimePolicy.commandsPerMinute,
  }),
  observe: createCommandObserver({ uuid: () => crypto.randomUUID() }),
});
const signIn = async () => {
  const signed = await login(
    { ...(await f.account()), operationId: f.operation() },
    f.auth,
  );
  if (signed.isError()) throw new Error(signed.getError());
  const actor = await authorizeSession(
    { accessToken: signed.get().credentials.accessToken },
    f.auth,
  );
  if (actor.isError()) throw new Error(actor.getError());
  actorIds.add(actor.get().userId);
  for (const [namespace, subject] of [
    ["conversations", actor.get().userId],
    ["message.send", actor.get().userId],
    ["realtime", actor.get().backendSessionId],
  ] as const)
    keys.add(
      `auth:${generation}:${namespace}:limit:${createHmac("sha256", Buffer.from(key, "hex")).update(subject).digest("hex")}`,
    );
  return { actor: actor.get(), credentials: signed.get().credentials };
};
const sentinelEpoch = crypto.randomUUID();
const sentinelEventId = crypto.randomUUID();
const sentinelNow = Date.now();
try {
  await f.db
    .collection<DeliveryMetadata>(deliveryCollections.metadata)
    .insertOne({
      _id: foreignStreamId,
      streamId: foreignStreamId,
      epoch: sentinelEpoch,
      cursor: 1,
      trimmedThrough: 0,
      lastRecordedAt: sentinelNow,
      lastExpiresAt: sentinelNow + 60_000,
    });
  await f.db
    .collection<DeliveryDocument>(deliveryCollections.journal)
    .insertOne({
      _id: new ObjectId(),
      streamId: foreignStreamId,
      epoch: sentinelEpoch,
      cursor: 1,
      eventId: sentinelEventId,
      eventType: "conversations.unread.changed",
      source: { kind: "message", eventId: sentinelEventId },
      createdAt: sentinelNow,
      recordedAt: new Date(sentinelNow),
      expiresAt: new Date(sentinelNow + 60_000),
    });
  const alice = await signIn();
  const bob = await signIn();
  const started = await startConversation(
    {
      actor: alice.actor,
      recipientId: bob.actor.userId,
      operationId: f.operation(),
    },
    chat.conversations,
  );
  if (started.isError()) throw new Error(started.getError());
  const conversationId = started.get().conversation.id;
  ids.push(conversationId);
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  const connect = async (actor: typeof alice.actor) => {
    const ticket = crypto.randomUUID();
    await tickets.issue({ ticket, actor, expiresAt: Date.now() + 30000 });
    keys.add(`auth:${generation}:users:ws-ticket:${ticket}`);
    const socket = io(url, {
      path: "/event",
      transports: ["websocket"],
      auth: { ticket },
      reconnection: false,
      extraHeaders: { origin: "https://localhost" },
      timeout: 2000,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  };
  const socket = await connect(bob.actor);
  const events: unknown[] = [];
  socket.on("event", (value: unknown, ack: unknown) =>
    receiveDelivery(value, ack, (event) => events.push(event)),
  );
  const command = {
    version: 1,
    kind: "command",
    type: "conversations.subscribe",
    data: { conversationId },
    meta: { requestId: crypto.randomUUID() },
  };
  const prepared = await socket.timeout(2000).emitWithAck("command", command);
  expect(prepared.ok).toBe(true);
  await activatePrepared(socket, prepared);
  const sent = await fetch(
    `${url}/v1/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${alice.credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Synthetic fault",
        clientMessageId: crypto.randomUUID(),
      }),
    },
  );
  expect(sent.status).toBe(200);
  await sent.body?.cancel();
  const stored = outboxDocumentSchema.parse(
    await f.db.collection(collections.outbox).findOne({ conversationId }),
  );
  const { _id: _rowId, deliveries: _deliveries, ...event } = stored;
  await chat.realtime.publishers.message({
    event,
    signal: new AbortController().signal,
  });
  await waitUntil({ check: async () => events.length === 1 }).catch((error) => {
    throw new Error(
      `Initial push count=${events.length}, transport=${socket.io.engine.transport.name}`,
      { cause: error },
    );
  });
  await f.db.collection(collections.conversations).updateOne(
    { _id: new ObjectId(conversationId) },
    {
      $set: {
        participantIds: [alice.actor.userId, "012345678901234567890123"],
      },
    },
  );
  await chat.realtime.publishers.message({
    event,
    signal: new AbortController().signal,
  });
  expect(events).toHaveLength(1);
  expect(
    (await socket.timeout(2000).emitWithAck("command", command)).error.code,
  ).toBe("FORBIDDEN");
  await f.db
    .collection(collections.conversations)
    .updateOne(
      { _id: new ObjectId(conversationId) },
      { $set: { participantIds: [alice.actor.userId, bob.actor.userId] } },
    );
  expect((await socket.timeout(2000).emitWithAck("command", command)).ok).toBe(
    true,
  );
  const arrived = proxy.arm();
  const began = performance.now();
  const publication = socket.timeout(3000).emitWithAck("command", command);
  await arrived;
  expect((await publication).ok).toBe(false);
  expect(performance.now() - began).toBeLessThan(3000);
  expect(events).toHaveLength(1);
  proxy.resume();
  await waitUntil({ check: async () => !socket.connected }).catch((error) => {
    throw new Error("Auth outage disconnect barrier", { cause: error });
  });
  const payloadSocket = await connect(alice.actor);
  await waitUntil({
    check: async () => payloadSocket.io.engine.transport.name === "websocket",
  }).catch((error) => {
    throw new Error(
      `Upgrade transport=${payloadSocket.io.engine.transport.name}`,
      { cause: error },
    );
  });
  payloadSocket.emit("command", {
    ...command,
    padding: "x".repeat(realtimePolicy.maxPayloadBytes + 1),
  });
  await waitUntil({ check: async () => !payloadSocket.connected }).catch(
    (error) => {
      throw new Error("24KiB close barrier", { cause: error });
    },
  );
} finally {
  proxy.resume();
  for (const socket of sockets) socket.disconnect();
  try {
    await gateway.close();
    await app.close();
    await deliveryResources.disposeAsync();
    await client.close();
    await proxy.dispose();
    for (const collection of [
      collections.messages,
      collections.events,
      collections.identities,
      collections.outbox,
    ]) {
      await f.db
        .collection(collection)
        .deleteMany({ conversationId: { $in: ids } });
      expect(
        await f.db
          .collection(collection)
          .countDocuments({ conversationId: { $in: ids } }),
      ).toBe(0);
    }
    await f.db
      .collection(collections.conversations)
      .deleteMany({ _id: { $in: ids.map((id) => new ObjectId(id)) } });
    expect(
      await f.db
        .collection(collections.conversations)
        .countDocuments({ _id: { $in: ids.map((id) => new ObjectId(id)) } }),
    ).toBe(0);
    for (const key of keys) await broker.del(key);
    for (const collection of Object.values(deliveryCollections)) {
      await f.db
        .collection(collection)
        .deleteMany({ streamId: { $in: ownedStreamIds() } });
      expect(
        await f.db
          .collection(collection)
          .countDocuments({ streamId: { $in: ownedStreamIds() } }),
      ).toBe(0);
      expect(
        await f.db
          .collection(collection)
          .countDocuments({ streamId: foreignStreamId }),
      ).toBe(1);
    }
  } finally {
    try {
      // Sentinel принадлежит этому тесту, но намеренно находится вне scope его business cleanup.
      for (const collection of Object.values(deliveryCollections)) {
        await f.db
          .collection(collection)
          .deleteOne({ streamId: foreignStreamId });
        expect(
          await f.db
            .collection(collection)
            .countDocuments({ streamId: foreignStreamId }),
        ).toBe(0);
      }
    } finally {
      broker.close();
      await f.dispose();
    }
  }
}

process.stdout.write(
  JSON.stringify({
    abuse: "passed",
    membershipRemoved: true,
    actualAuthIoOutage: true,
    noEmitOnAuthFailure: true,
    oversizedTransportClosed: true,
    ownedDeliveryStateRemoved: true,
    foreignDeliveryStatePreserved: true,
  }),
);
