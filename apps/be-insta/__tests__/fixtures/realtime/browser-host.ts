import { createHmac } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { createBffEnvironment } from "../../../../../__tests__/fixtures/bff-session/environment";
import { connectDeliveryFixture } from "../../../../../__tests__/fixtures/delivery/runtime";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { createConversationsDependencies } from "../../../src/app/composition/conversations/index";
import { createDirectoryDependencies } from "../../../src/app/composition/users/index";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import { startConversation } from "../../../src/domains/conversations/index";
import { authorizeSession, login } from "../../../src/domains/users/index";
import { readRealtimeConfig } from "../../../src/lib/config/index";
import {
  connectDragonfly,
  readGeneration,
} from "../../../src/lib/dragonfly/index";

await using deliverySetup = new AsyncDisposableStack();
const fixture = await createBffEnvironment();
const config = readTestApiConfig();
const broker = await connectDragonfly({ config: config.dragonfly });
const delivery = await connectDeliveryFixture().catch((error) => {
  broker.close();
  throw error;
});
deliverySetup.defer(delivery.close);
const generation = await readGeneration(broker);
const key = createHmac("sha256", Buffer.from(config.authLimitsKey, "hex"))
  .update(fixture.native.runId)
  .digest("hex");
const keys = new Set<string>();
const ticketKeys = new Set<string>();
const conversations: string[] = [];
const signIn = async () => {
  const account = await fixture.native.account();
  const result = await login(
    { ...account, operationId: fixture.native.operation() },
    fixture.native.auth,
  );
  if (result.isError()) throw new Error(result.getError());
  return { account, credentials: result.get().credentials };
};
const alice = await signIn();
const bob = await signIn();
const actor = await authorizeSession(
  { accessToken: alice.credentials.accessToken },
  fixture.native.auth,
);
if (actor.isError()) throw new Error(actor.getError());
const directory = createDirectoryDependencies({
  database: fixture.native.database,
  broker,
  key,
});
const chat = delivery.ownChat(
  await createConversationsDependencies({
    deliveryBroker: delivery.provider,
    retentionMs: 86_400_000,
    policy: readRealtimeConfig({}),
    database: fixture.native.database,
    broker,
    key,
    directory: { findPublicUser: directory.findPublicUser },
  }),
);
const pair = await startConversation(
  {
    actor: actor.get(),
    recipientId: bob.credentials.user.id,
    operationId: fixture.native.operation(),
  },
  chat.conversations,
);
if (pair.isError()) throw new Error(pair.getError());
const conversationId = pair.get().conversation.id;
conversations.push(conversationId);
for (const [namespace, subject, quotaKey] of [
  ["conversations", alice.credentials.user.id, key],
  ["message.send", alice.credentials.user.id, config.authLimitsKey],
  ["conversations", alice.credentials.user.id, config.authLimitsKey],
] as const)
  keys.add(
    `auth:${generation}:${namespace}:limit:${createHmac("sha256", Buffer.from(quotaKey, "hex")).update(subject).digest("hex")}`,
  );
const nativeRequest = async (path: string, body?: unknown) =>
  fetch(`${fixture.config.api.baseURL}/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${alice.credentials.accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: 3002,
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    switch (path) {
      case "/":
        return Response.json({ account: alice.account, conversationId });
      case "/send": {
        const response = await nativeRequest(
          `conversations/${conversationId}/messages`,
          {
            text: "Synthetic browser recovery",
            clientMessageId: crypto.randomUUID(),
          },
        );
        return new Response(response.body, {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      case "/history": {
        const response = await nativeRequest(
          `conversations/${conversationId}/messages`,
        );
        return new Response(response.body, {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      case "/track-ticket": {
        const input = z
          .object({ ticket: z.uuid(), sessionId: z.uuid() })
          .parse(await request.json());
        ticketKeys.add(`auth:${generation}:users:ws-ticket:${input.ticket}`);
        keys.add(
          `auth:${generation}:realtime:limit:${createHmac("sha256", Buffer.from(config.authLimitsKey, "hex")).update(input.sessionId).digest("hex")}`,
        );
        return Response.json({ ok: true });
      }
      default:
        return new Response(null, { status: 404 });
    }
  },
});
const stop = async () => {
  await server.stop(true);
  try {
    const users = await fixture.native.db
      .collection("users")
      .find({ emailKey: alice.account.email })
      .toArray();
    const ids = users.map((user) => user._id.toHexString());
    const bindings = await fixture.web.webDb
      .collection("bff_sessions")
      .find({ "user.id": { $in: ids } })
      .toArray();
    for (const binding of bindings) {
      const sessionId = z.string().parse(binding.backendSessionId);
      keys.add(
        `auth:${generation}:realtime:limit:${createHmac("sha256", Buffer.from(config.authLimitsKey, "hex")).update(sessionId).digest("hex")}`,
      );
    }
    await fixture.web.webDb
      .collection("bff_sessions")
      .deleteMany({ "user.id": { $in: ids } });
    for (const collection of [
      collections.messages,
      collections.events,
      collections.identities,
      collections.outbox,
    ])
      await fixture.native.db
        .collection(collection)
        .deleteMany({ conversationId: { $in: conversations } });
    await fixture.native.db.collection(collections.conversations).deleteMany({
      _id: { $in: conversations.map((id) => new ObjectId(id)) },
    });
    for (const owned of [...keys, ...ticketKeys]) {
      await broker.del(owned);
      if (await broker.get(owned))
        throw new Error("Realtime browser quota cleanup incomplete");
    }
  } finally {
    await deliveryLifetime.disposeAsync();
    broker.close();
    await fixture.dispose();
  }
};
const deliveryLifetime = deliverySetup.move();
process.once("SIGTERM", () => {
  stop().then(
    () => process.exit(0),
    () => process.exit(1),
  );
});
