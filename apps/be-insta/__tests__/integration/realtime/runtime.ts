import { expect } from "bun:test";
import { createHmac } from "node:crypto";
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
import { startConversation } from "../../../src/domains/conversations/index";
import { createMongoOutbox } from "../../../src/domains/conversations/server/index";
import { authorizeSession, login } from "../../../src/domains/users/index";
import { createDragonflyWsTickets } from "../../../src/domains/users/server/index";
import { readRealtimeConfig } from "../../../src/lib/config/index";
import {
  connectDragonfly,
  readGeneration,
} from "../../../src/lib/dragonfly/index";
import {
  activatePrepared,
  receiveDelivery,
} from "../../fixtures/realtime/client";

const collectionNamespace = `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`;
const f = await createAuthEnvironment({ collectionNamespace });
try {
  expect(f.db.collection(collections.outbox).collectionName).toBe(
    `${collectionNamespace}${collections.outbox}`,
  );
  const broker = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  const delivery = await connectDeliveryFixture().catch((error) => {
    broker.close();
    throw error;
  });
  const keys = new Set<string>();
  const ids: string[] = [];
  let socket: Socket | undefined;
  try {
    const generation = await readGeneration(broker);
    const key = createHmac(
      "sha256",
      Buffer.from(readTestApiConfig().authLimitsKey, "hex"),
    )
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
    const signed = await login(
      { ...(await f.account()), operationId: f.operation() },
      f.auth,
    );
    if (signed.isError()) throw new Error(signed.getError());
    const recipient = await login(
      { ...(await f.account()), operationId: f.operation() },
      f.auth,
    );
    if (recipient.isError()) throw new Error(recipient.getError());
    const current = await authorizeSession(
      { accessToken: signed.get().credentials.accessToken },
      f.auth,
    );
    if (current.isError()) throw new Error(current.getError());
    const actor = current.get();
    const pair = await startConversation(
      {
        actor,
        recipientId: recipient.get().credentials.user.id,
        operationId: f.operation(),
      },
      chat.conversations,
    );
    if (pair.isError()) throw new Error(pair.getError());
    const conversationId = pair.get().conversation.id;
    ids.push(conversationId);
    for (const [namespace, subject] of [
      ["conversations", actor.userId],
      ["message.send", actor.userId],
      ["realtime", actor.backendSessionId],
    ] as const)
      keys.add(
        `auth:${generation}:${namespace}:limit:${createHmac("sha256", Buffer.from(key, "hex")).update(subject).digest("hex")}`,
      );
    let infrastructureClosed = false;
    const app = await createApplication(
      {
        realtimeOrigin: "https://localhost",
        users: {
          ...f.users,
          tickets: createDragonflyWsTickets({ client: broker }),
        },
        directory: directory.directory,
        chat: {
          ...chat,
          realtime: {
            ...chat.realtime,
            outbox: createMongoOutbox({ db: f.db, conversationIds: ids }),
          },
        },
        checkRequired: async () => true,
        check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
        close: async () => {
          expect(socket?.connected).toBe(false);
          expect(await broker.send("PING", [])).toBe("PONG");
          infrastructureClosed = true;
        },
      },
      { mode: "offline" },
    );
    try {
      await app.listen(0, "127.0.0.1");
      const url = await app.getUrl();
      const request = (path: string, body: unknown) =>
        fetch(`${url}/v1/${path}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${signed.get().credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      const ticket = await request("auth/ws-ticket", {});
      expect(ticket.status).toBe(200);
      const data = (await ticket.json()).data as { ticket: string };
      keys.add(`auth:${generation}:users:ws-ticket:${data.ticket}`);
      const active = io(url, {
        path: "/event",
        transports: ["websocket"],
        auth: { ticket: data.ticket },
        extraHeaders: { origin: "https://localhost" },
        reconnection: false,
        timeout: 2000,
      });
      socket = active;
      const events: unknown[] = [];
      active.on("event", (event: unknown, ack: unknown) =>
        receiveDelivery(event, ack, (value) => events.push(value)),
      );
      await new Promise<void>((resolve, reject) => {
        active.once("connect", resolve);
        active.once("connect_error", reject);
      });
      const ack = await active.timeout(2000).emitWithAck("command", {
        version: 1,
        kind: "command",
        type: "conversations.subscribe",
        data: { conversationId },
        meta: { requestId: crypto.randomUUID() },
      });
      expect(ack.ok).toBe(true);
      await activatePrepared(active, ack);
      await waitUntil({
        check: async () => active.io.engine.transport.name === "websocket",
      });
      const sent = await request(`conversations/${conversationId}/messages`, {
        text: "Synthetic runtime",
        clientMessageId: crypto.randomUUID(),
      });
      expect(sent.status).toBe(200);
      await sent.body?.cancel();
      await waitUntil({ check: async () => events.length === 1 });
      await waitUntil({
        check: async () =>
          (
            await f.db
              .collection(collections.outbox)
              .findOne({ conversationId })
          )?.deliveries.realtime.state === "delivered",
      });
      const revoked = await request("auth/sessions/revoke", {
        backendSessionId: signed.get().credentials.backendSessionId,
        revokeSecret: signed.get().credentials.revokeSecret,
      });
      expect(revoked.status).toBe(200);
      await revoked.body?.cancel();
      await waitUntil({ check: async () => !active.connected });
    } finally {
      await app.close();
    }
    expect(infrastructureClosed).toBe(true);
  } finally {
    socket?.disconnect();
    try {
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
      for (const key of keys) await broker.del(key);
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
    runtime: "passed",
    workerDeliveryPersisted: true,
    liveRevocation: true,
    closeBeforeInfrastructure: true,
    namespaceIsolated: true,
    namespaceCleaned: true,
  }),
);
