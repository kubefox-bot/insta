import { expect } from "bun:test";
import { createHmac } from "node:crypto";
import { ObjectId } from "mongodb";
import { connectDeliveryFixture } from "../../../../../__tests__/fixtures/delivery/runtime";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import { sendMessage200Schema } from "../../../../../apps/fe-insta/src/lib/api/generated/schemas/sendMessageSchema";
import { createApplication } from "../../../src/app/bootstrap";
import { createConversationsDependencies } from "../../../src/app/composition/conversations/index";
import { createDirectoryDependencies } from "../../../src/app/composition/users/index";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import { sessionCredentialsSchema } from "../../../src/domains/users/auth/domain/credentials";
import { login } from "../../../src/domains/users/index";
import { readRealtimeConfig } from "../../../src/lib/config/index";
import {
  connectDragonfly,
  readGeneration,
} from "../../../src/lib/dragonfly/index";
import { verifyLostHttpResponse } from "./lost-response";

const f = await createAuthEnvironment();
const actors: string[] = [];
const conversations: string[] = [];
const quotaKeys: string[] = [];
try {
  const config = readTestApiConfig();
  const broker = await connectDragonfly({ config: config.dragonfly });
  const delivery = await connectDeliveryFixture().catch((error) => {
    broker.close();
    throw error;
  });
  try {
    const key = createHmac("sha256", Buffer.from(config.authLimitsKey, "hex"))
      .update(f.runId)
      .digest("hex");
    const generation = await readGeneration(broker);
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
        users: f.users,
        chat,
        directory: directory.directory,
        checkRequired: async () => true,
        check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
        close: async () => {},
      },
      { mode: "offline" },
    );
    try {
      await app.listen(0, "127.0.0.1");
      const url = await app.getUrl();
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
        actors.push(credentials.user.id);
        const digest = createHmac("sha256", Buffer.from(key, "hex"))
          .update(credentials.user.id)
          .digest("hex");
        quotaKeys.push(
          ...["directory", "conversations", "message.send"].map(
            (owner) => `auth:${generation}:${owner}:limit:${digest}`,
          ),
        );
        return credentials;
      };
      const alice = await signIn();
      const bob = await signIn();
      const outsider = await signIn();
      const request = (
        path: string,
        body: unknown,
        idempotencyKey?: string,
        options: Readonly<{ accessToken?: string; operationId?: string }> = {},
      ) =>
        fetch(`${url}/v1/${path}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.accessToken ?? alice.accessToken}`,
            "content-type": "application/json",
            "x-operation-id": options.operationId ?? crypto.randomUUID(),
            ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
          },
          body: JSON.stringify(body),
        });
      const start = async (recipientId: string) => {
        const response = await request("conversations", { recipientId });
        expect(response.status).toBe(200);
        const body = await response.json();
        const id: string = body.data.conversation.id;
        conversations.push(id);
        return id;
      };
      const conversationId = await start(bob.user.id);
      const otherId = await start(outsider.user.id);
      const path = `conversations/${conversationId}/messages`;
      const keyOne = crypto.randomUUID();
      const original = "  Значимый текст 😀\n ";
      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(
            path,
            { text: original, clientMessageId: "local-one" },
            keyOne,
          ),
        ),
      );
      const messages = await Promise.all(
        responses.map(async (response) => {
          expect(response.status).toBe(200);
          return sendMessage200Schema.parse(await response.json()).data;
        }),
      );
      expect(new Set(messages.map((message) => message.id)).size).toBe(1);
      expect(new Set(messages.map((message) => message.sequence)).size).toBe(1);
      const first = messages[0];
      if (!first) throw new Error("Missing concurrent message result");
      expect(first.text).toBe(original);
      const persisted = await f.db
        .collection(collections.messages)
        .find({ conversationId })
        .toArray();
      expect(persisted).toHaveLength(1);
      expect(persisted[0]?.text).toBe(original);
      const canonical = await f.db
        .collection(collections.events)
        .find({ conversationId, kind: "message_sent" })
        .toArray();
      expect(canonical).toHaveLength(1);
      expect(new Set(canonical.map((event) => event.eventId)).size).toBe(1);
      const conflict = await request(path, { text: "different" }, keyOne);
      expect(conflict.status).toBe(409);
      expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
      const cross = await request(
        `conversations/${otherId}/messages`,
        { text: original },
        keyOne,
      );
      expect(cross.status).toBe(409);
      await cross.body?.cancel();
      const sameOperationId = crypto.randomUUID();
      for (const key of [crypto.randomUUID(), crypto.randomUUID()]) {
        const response = await request(
          path,
          { text: "two effects", clientMessageId: "same-local-id" },
          key,
          { accessToken: alice.accessToken, operationId: sameOperationId },
        );
        expect(response.status).toBe(200);
        await response.body?.cancel();
      }
      const two = await f.db
        .collection(collections.events)
        .find({
          conversationId,
          kind: "message_sent",
          operationId: sameOperationId,
        })
        .toArray();
      expect(two).toHaveLength(2);
      expect(new Set(two.map((event) => event.analyticsEventId)).size).toBe(2);
      for (let index = 0; index < 2; index++) {
        const response = await request(path, {
          text: "without key",
          clientMessageId: "same-local-id",
        });
        expect(response.status).toBe(200);
        await response.body?.cancel();
      }
      expect(
        await f.db
          .collection(collections.messages)
          .countDocuments({ conversationId }),
      ).toBe(5);
      expect(
        (
          await f.db
            .collection(collections.conversations)
            .findOne({ _id: new ObjectId(conversationId) })
        )?.lastSequence,
      ).toBe(5);
      const forbidden = await request(
        path,
        { text: "forbidden" },
        crypto.randomUUID(),
        { accessToken: outsider.accessToken },
      );
      expect(forbidden.status).toBe(403);
      await forbidden.body?.cancel();
      for (const text of [" \n\t", "😀".repeat(4001)]) {
        const response = await request(path, { text });
        expect(response.status).toBe(400);
        await response.body?.cancel();
      }
      const maximum = await request(
        path,
        { text: "😀".repeat(4000) },
        crypto.randomUUID(),
      );
      expect(maximum.status).toBe(200);
      await maximum.body?.cancel();
      for (let index = 0; index < 61; index++) {
        const response = await request(
          path,
          { text: "rate bounded" },
          crypto.randomUUID(),
          { accessToken: bob.accessToken },
        );
        expect(response.status).toBe(index < 60 ? 200 : 429);
        await response.body?.cancel();
      }
      expect(
        await f.db
          .collection(collections.messages)
          .countDocuments({ conversationId }),
      ).toBe(66);
      await verifyLostHttpResponse({
        url,
        db: f.db,
        conversationId,
        accessToken: alice.accessToken,
      });
      process.stdout.write(
        JSON.stringify({
          nativeMessages: "passed",
          concurrent: 10,
          persistedFirst: 1,
          backendOwner: process.cwd().endsWith("/apps/be-insta"),
        }),
      );
    } finally {
      await app.close();
    }
  } finally {
    for (const key of quotaKeys) {
      await broker.del(key);
      expect(await broker.get(key)).toBeNull();
    }
    await delivery.close();
    broker.close();
  }
} finally {
  try {
    const remaining = await f.db
      .collection(collections.conversations)
      .find({ participantIds: { $in: actors } })
      .toArray();
    conversations.push(...remaining.map((row) => row._id.toHexString()));
    for (const name of [
      collections.messages,
      collections.events,
      "conversations_identities",
      "conversations_outbox",
    ]) {
      await f.db
        .collection(name)
        .deleteMany({ conversationId: { $in: conversations } });
      expect(
        await f.db
          .collection(name)
          .countDocuments({ conversationId: { $in: conversations } }),
      ).toBe(0);
    }
    await f.db.collection(collections.conversations).deleteMany({
      _id: { $in: conversations.map((id) => new ObjectId(id)) },
    });
  } finally {
    await f.dispose();
  }
}
