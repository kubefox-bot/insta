import { expect } from "bun:test";
import { createHmac } from "node:crypto";
import { eventSchema } from "@insta/contracts/realtime";
import { ObjectId } from "mongodb";
import { io, type Socket } from "socket.io-client";
import { waitUntil } from "../../../../../__tests__/fixtures/barrier";
import { connectDeliveryFixture } from "../../../../../__tests__/fixtures/delivery/runtime";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import { createApplication } from "../../../src/app/bootstrap";
import { createConversationsDependencies } from "../../../src/app/composition/conversations/index";
import { createDirectoryDependencies } from "../../../src/app/composition/users/index";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import { outboxDocumentSchema } from "../../../src/domains/conversations/adapters/mongo/outbox-schema";
import { dispatchMessageOutbox } from "../../../src/domains/conversations/index";
import {
  createConversationGateway,
  createMongoMembership,
  createMongoOutbox,
} from "../../../src/domains/conversations/server/index";
import { sessionCredentialsSchema } from "../../../src/domains/users/auth/domain/credentials";
import {
  authorizeActorSession,
  authorizeSession,
  login,
} from "../../../src/domains/users/index";
import { createDragonflyWsTickets } from "../../../src/domains/users/server/index";
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

const collectionNamespace = `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`;
const f = await createAuthEnvironment({ collectionNamespace });
try {
  const broker = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  const delivery = await connectDeliveryFixture().catch((error) => {
    broker.close();
    throw error;
  });
  const keys = new Set<string>();
  const sockets: Socket[] = [];
  const conversationIds: string[] = [];
  const ownedActors: string[] = [];
  try {
    const generation = await readGeneration(broker);
    const key = createHmac(
      "sha256",
      Buffer.from(readTestApiConfig().authLimitsKey, "hex"),
    )
      .update(f.runId)
      .digest("hex");
    const tickets = createDragonflyWsTickets({ client: broker });
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
        directory: directory.directory,
        chat,
        checkRequired: async () => true,
        check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
        close: async () => {},
      },
      { mode: "offline" },
    );
    try {
      const quota = createActorQuota({
        client: broker,
        key,
        namespace: "realtime",
        maximum: realtimePolicy.commandsPerMinute,
      });
      const gateway = createConversationGateway({
        server: app.getHttpServer(),
        origin: "https://localhost",
        tickets,
        authorize: (input) => authorizeActorSession(input, f.auth),
        membership: createMongoMembership(f.db),
        journal: chat.realtime.journal,
        streams: chat.realtime.streams,
        policy: chat.realtime.policy,
        quota,
        observe: createCommandObserver({ uuid: () => crypto.randomUUID() }),
      });
      try {
        const signIn = async () => {
          const account = await f.account();
          const result = await login(
            { ...account, operationId: f.operation() },
            f.auth,
          );
          if (result.isError()) throw new Error(result.getError());
          const credentials = sessionCredentialsSchema.parse(
            result.get().credentials,
          );
          ownedActors.push(credentials.user.id);
          for (const [namespace, subject] of [
            ["realtime", credentials.backendSessionId],
            ["conversations", credentials.user.id],
            ["message.send", credentials.user.id],
          ] as const)
            keys.add(
              `auth:${generation}:${namespace}:limit:${createHmac("sha256", Buffer.from(key, "hex")).update(subject).digest("hex")}`,
            );
          return credentials;
        };
        await app.listen(0, "127.0.0.1");
        const url = await app.getUrl();
        const alice = await signIn();
        const bob = await signIn();
        const mallory = await signIn();
        const request = (
          path: string,
          token = alice.accessToken,
          body?: unknown,
        ) =>
          fetch(`${url}/v1/${path}`, {
            method: body === undefined ? "GET" : "POST",
            headers: {
              authorization: `Bearer ${token}`,
              ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
        const issue = async (token = alice.accessToken) => {
          const response = await request("auth/ws-ticket", token, {});
          expect(response.status).toBe(200);
          const data = (await response.json()).data as {
            ticket: string;
            expiresAt: number;
          };
          keys.add(`auth:${generation}:users:ws-ticket:${data.ticket}`);
          expect(data.expiresAt - f.clock()).toBe(30000);
          expect(
            await broker.send("PTTL", [
              `auth:${generation}:users:ws-ticket:${data.ticket}`,
            ]),
          ).toBeGreaterThan(0);
          return data.ticket;
        };
        const connect = (ticket: string, origin = "https://localhost") => {
          const socket = io(url, {
            path: "/event",
            transports: ["websocket"],
            auth: { ticket },
            extraHeaders: { origin: origin },
            reconnection: false,
            forceNew: true,
            timeout: 2000,
          });
          sockets.push(socket);
          return socket;
        };
        const connected = (socket: Socket) =>
          new Promise<void>((resolve, reject) => {
            socket.once("connect", resolve);
            socket.once("connect_error", reject);
          });
        const rejected = (socket: Socket) =>
          new Promise<void>((resolve, reject) => {
            socket.once("connect_error", () => resolve());
            socket.once("connect", () =>
              reject(new Error("Unauthorized socket connected")),
            );
          });
        const reused = await issue();
        const aliceSocket = connect(reused);
        await connected(aliceSocket);
        await rejected(connect(reused));
        const foreignOrigin = await issue();
        await rejected(connect(foreignOrigin, "https://foreign.test"));
        const actorResult = await authorizeSession(
          { accessToken: alice.accessToken },
          f.auth,
        );
        if (actorResult.isError()) throw new Error(actorResult.getError());
        const expired = crypto.randomUUID();
        keys.add(`auth:${generation}:users:ws-ticket:${expired}`);
        await tickets.issue({
          ticket: expired,
          actor: actorResult.get(),
          expiresAt: f.clock() - 1,
        });
        expect(
          await tickets.consume({ ticket: expired, now: f.clock() }),
        ).toBeNull();
        expect(
          await tickets.consume({
            ticket: crypto.randomUUID(),
            now: f.clock(),
          }),
        ).toBeNull();
        const bobSocket = connect(await issue(bob.accessToken));
        await connected(bobSocket);
        const mallorySocket = connect(await issue(mallory.accessToken));
        await connected(mallorySocket);
        const extras: Socket[] = [];
        for (let index = 0; index < 4; index++) {
          const socket = connect(await issue());
          await connected(socket);
          extras.push(socket);
        }
        await rejected(connect(await issue()));
        for (const socket of extras) socket.disconnect();
        const pair = await request("conversations", alice.accessToken, {
          recipientId: bob.user.id,
        });
        expect(pair.status).toBe(200);
        const conversationId = (await pair.json()).data.conversation
          .id as string;
        conversationIds.push(conversationId);
        const command = {
          version: 1,
          kind: "command",
          type: "conversations.subscribe",
          data: { conversationId },
          meta: { requestId: crypto.randomUUID() },
        };
        const first = await aliceSocket
          .timeout(2000)
          .emitWithAck("command", command);
        const second = await aliceSocket
          .timeout(2000)
          .emitWithAck("command", command);
        expect(first.ok).toBe(true);
        await activatePrepared(aliceSocket, first);
        expect(second.meta.requestId).not.toBe(first.meta.requestId);
        const bobPrepared = await bobSocket
          .timeout(2000)
          .emitWithAck("command", command);
        expect(bobPrepared.ok).toBe(true);
        await activatePrepared(bobSocket, bobPrepared);
        expect(
          (await mallorySocket.timeout(2000).emitWithAck("command", command))
            .error.code,
        ).toBe("FORBIDDEN");
        expect(
          (
            await aliceSocket
              .timeout(2000)
              .emitWithAck("command", { ...command, version: 2 })
          ).error.code,
        ).toBe("PROTOCOL_UNSUPPORTED");
        expect(
          (
            await aliceSocket
              .timeout(2000)
              .emitWithAck("command", { ...command, type: "messages.send" })
          ).error.code,
        ).toBe("UNSUPPORTED_COMMAND");
        const aliceEvents: unknown[] = [];
        const bobEvents: unknown[] = [];
        const malloryEvents: unknown[] = [];
        aliceSocket.on("event", (event: unknown, ack: unknown) =>
          receiveDelivery(event, ack, (value) => aliceEvents.push(value)),
        );
        bobSocket.on("event", (event: unknown, ack: unknown) =>
          receiveDelivery(event, ack, (value) => bobEvents.push(value)),
        );
        mallorySocket.on("event", (event: unknown) =>
          malloryEvents.push(event),
        );
        const send = await request(
          `conversations/${conversationId}/messages`,
          alice.accessToken,
          {
            text: "Synthetic private message",
            clientMessageId: crypto.randomUUID(),
          },
        );
        expect(send.status).toBe(200);
        const canonical = await f.db
          .collection(collections.outbox)
          .findOne({ conversationId });
        if (!canonical) throw new Error("No persisted event");
        // A canonical live worker must not be able to see this run's persisted event.
        expect(
          await f.db.client
            .db(f.db.databaseName)
            .collection(collections.outbox)
            .findOne({ conversationId }, { projection: { _id: 1 } }),
        ).toBeNull();
        const outbox = createMongoOutbox({ db: f.db, conversationIds });
        await dispatchMessageOutbox({
          outbox,
          sinks: { realtime: chat.realtime.publishers.message },
          clock: Date.now,
          uuid: () => crypto.randomUUID(),
        });
        await waitUntil({
          check: async () => aliceEvents.length === 1 && bobEvents.length === 1,
        });
        expect(malloryEvents).toHaveLength(0);
        const storedEvent = outboxDocumentSchema.parse(canonical);
        // Schema narrows persisted canonical data, which contains additional outbox fields.
        const event = {
          eventId: storedEvent.eventId,
          analyticsEventId: storedEvent.analyticsEventId,
          kind: storedEvent.kind,
          operation: storedEvent.operation,
          authority: storedEvent.authority,
          operationId: storedEvent.operationId,
          messageId: storedEvent.messageId,
          conversationId: storedEvent.conversationId,
          actorId: storedEvent.actorId,
          sequence: storedEvent.sequence,
          createdAt: storedEvent.createdAt,
        };
        await chat.realtime.publishers.message({
          event,
          signal: new AbortController().signal,
        });
        // Materialization replay is idempotent; later auth probe provides a causal barrier.
        const received = aliceEvents.map((value) => eventSchema.parse(value));
        expect(received[0]?.eventId).toBe(event.eventId);
        expect(received[0]?.meta.operationId).toBe(event.operationId);
        expect(received).toHaveLength(1);
        const revocation = await request(
          "auth/sessions/revoke",
          bob.accessToken,
          {
            backendSessionId: bob.backendSessionId,
            revokeSecret: bob.revokeSecret,
          },
        );
        expect(revocation.status).toBe(200);
        await chat.realtime.publishers.message({
          event,
          signal: new AbortController().signal,
        });
        await waitUntil({ check: async () => !bobSocket.connected });
        expect(bobEvents).toHaveLength(1);
        const aborted = new AbortController();
        aborted.abort();
        await expect(
          chat.realtime.publishers.message({ event, signal: aborted.signal }),
        ).rejects.toBeDefined();
        expect(malloryEvents).toHaveLength(0);
        for (let index = 0; index < 56; index++)
          await aliceSocket.timeout(2000).emitWithAck("command", command);
        expect(
          (await aliceSocket.timeout(2000).emitWithAck("command", command))
            .error.code,
        ).toBe("RATE_LIMITED");
      } finally {
        for (const socket of sockets) socket.disconnect();
        await gateway.close();
      }
    } finally {
      await app.close();
    }
  } finally {
    try {
      for (const collection of [
        collections.messages,
        collections.events,
        collections.identities,
        collections.outbox,
      ]) {
        await f.db
          .collection(collection)
          .deleteMany({ conversationId: { $in: conversationIds } });
        expect(
          await f.db
            .collection(collection)
            .countDocuments({ conversationId: { $in: conversationIds } }),
        ).toBe(0);
      }
      await f.db.collection(collections.conversations).deleteMany({
        _id: { $in: conversationIds.map((id) => new ObjectId(id)) },
      });
      for (const key of keys) {
        await broker.del(key);
        expect(await broker.get(key)).toBeNull();
      }
    } finally {
      await delivery.close();
      broker.close();
    }
  }
} finally {
  await f.dispose();
}
process.stdout.write(
  JSON.stringify({
    realtime: "passed",
    namespaceIsolated: true,
    namespaceCleaned: true,
    canonicalWorkerCannotSeeFixtureEvent: true,
  }),
);
