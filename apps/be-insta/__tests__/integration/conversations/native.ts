import { expect } from "bun:test";
import { createHmac } from "node:crypto";
import { ObjectId } from "mongodb";
import { connectDeliveryFixture } from "../../../../../__tests__/fixtures/delivery/runtime";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import { listHistory200Schema as historySuccessSchema } from "../../../../../apps/fe-insta/src/lib/api/generated/schemas/listHistorySchema";
import { listUnreadConversations200Schema as unreadSuccessSchema } from "../../../../../apps/fe-insta/src/lib/api/generated/schemas/listUnreadConversationsSchema";
import { searchUsers200Schema as directorySuccessSchema } from "../../../../../apps/fe-insta/src/lib/api/generated/schemas/searchUsersSchema";
import { startConversation200Schema as startSuccessSchema } from "../../../../../apps/fe-insta/src/lib/api/generated/schemas/startConversationSchema";
import { createApplication } from "../../../src/app/bootstrap";
import { createConversationsDependencies } from "../../../src/app/composition/conversations/index";
import { createDirectoryDependencies } from "../../../src/app/composition/users/index";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
import { encodeCursor } from "../../../src/domains/conversations/domain/history/cursor";
import { listHistory } from "../../../src/domains/conversations/index";
import { sessionCredentialsSchema } from "../../../src/domains/users/auth/domain/credentials";
import { authorizeSession, login } from "../../../src/domains/users/index";
import { readRealtimeConfig } from "../../../src/lib/config/index";
import {
  connectDragonfly,
  readGeneration,
} from "../../../src/lib/dragonfly/index";

const f = await createAuthEnvironment();
const ownedIds: string[] = [];
const ownedActors: string[] = [];
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
    const quotaKeys: string[] = [];
    try {
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
          ownedActors.push(credentials.user.id);
          const digest = createHmac("sha256", Buffer.from(key, "hex"))
            .update(credentials.user.id)
            .digest("hex");
          quotaKeys.push(
            ...["directory", "conversations"].map(
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
          accessToken = alice.accessToken,
          body?: unknown,
        ) =>
          fetch(`${url}/v1/${path}`, {
            headers: {
              authorization: `Bearer ${accessToken}`,
              ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
            },
            method: body === undefined ? "GET" : "POST",
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
        const starts = await Promise.all(
          Array.from({ length: 12 }, (_, index) =>
            request(
              "conversations",
              index % 2 ? bob.accessToken : alice.accessToken,
              { recipientId: index % 2 ? alice.user.id : bob.user.id },
            ),
          ),
        );
        const results = await Promise.all(
          starts.map(async (response) => {
            expect(response.status).toBe(200);
            return startSuccessSchema.parse(await response.json()).data;
          }),
        );
        const conversationId = results[0]?.conversation.id;
        if (!conversationId) throw new Error("Missing pair conversation");
        ownedIds.push(conversationId);
        const pairConversations = await f.db
          .collection(collections.conversations)
          .find({ participantIds: { $all: [alice.user.id, bob.user.id] } })
          .toArray();
        expect(pairConversations).toHaveLength(1);
        expect(
          results.filter((result) => result.code === "CONVERSATION_CREATED"),
        ).toHaveLength(1);
        expect(
          new Set(results.map((result) => result.conversation.id)).size,
        ).toBe(1);
        expect(
          await f.db
            .collection(collections.events)
            .countDocuments({ conversationId, kind: "conversation_created" }),
        ).toBe(1);
        const self = await request("conversations", alice.accessToken, {
          recipientId: alice.user.id,
        });
        expect((await self.json()).error.code).toBe("SELF_CONVERSATION");
        const pending = await f.persistence.createPending({
          email: f.email("inactive"),
          now: Date.now(),
          emailVerifiedAt: Date.now(),
          registrationExpiresAt: Date.now() + 86400000,
          tokenDigest: crypto.randomUUID(),
        });
        if (pending.isError()) throw new Error(pending.getError());
        const inactive = await request("conversations", alice.accessToken, {
          recipientId: pending.get().id,
        });
        expect((await inactive.json()).error.code).toBe("RECIPIENT_NOT_FOUND");
        const search = await request(
          `users?q=${encodeURIComponent(bob.user.username.slice(0, 12).toLowerCase())}`,
        );
        expect(
          directorySuccessSchema.parse(await search.json()).data.items,
        ).toEqual([bob.user]);
        const literal = await request("users?q=%2E%2A");
        expect(
          directorySuccessSchema.parse(await literal.json()).data.items,
        ).toEqual([]);
        const unknownSearch = await request("users?q=a&other=1");
        expect(unknownSearch.status).toBe(400);
        await unknownSearch.body?.cancel();
        const privateList = await request(
          "conversations/unread",
          outsider.accessToken,
        );
        expect(privateList.status).toBe(200);
        const unread = unreadSuccessSchema.parse(await privateList.json()).data;
        expect(unread.items).toEqual([]);
        expect(unread.totalUnreadCount).toBe(0);
        const forbidden = await request(
          `conversations/${conversationId}/messages`,
          outsider.accessToken,
        );
        expect(forbidden.status).toBe(403);
        expect((await forbidden.json()).error.code).toBe(
          "CONVERSATION_FORBIDDEN",
        );
        const ownList = await request("conversations/unread");
        expect(
          unreadSuccessSchema
            .parse(await ownList.json())
            .data.items.map((item: { id: string }) => item.id),
        ).toContain(conversationId);
        const secondStart = await request("conversations", alice.accessToken, {
          recipientId: outsider.user.id,
        });
        const secondConversationId = startSuccessSchema.parse(
          await secondStart.json(),
        ).data.conversation.id;
        ownedIds.push(secondConversationId);
        await f.db
          .collection(collections.conversations)
          .updateOne(
            { _id: new ObjectId(conversationId) },
            { $set: { lastActivityAt: new Date(1) } },
          );
        await f.db
          .collection(collections.conversations)
          .updateOne(
            { _id: new ObjectId(secondConversationId) },
            { $set: { lastActivityAt: new Date(2) } },
          );
        const ordered = await request("conversations/unread?limit=1");
        expect(
          unreadSuccessSchema
            .parse(await ordered.json())
            .data.items.map((item: { id: string }) => item.id),
        ).toEqual([secondConversationId]);
        for (const path of [
          "users?q=",
          `users?q=${"a".repeat(33)}`,
          "users?q=a&limit=51",
          "conversations/unread?limit=51",
          `conversations/${conversationId}/messages?limit=101`,
        ]) {
          const invalid = await request(path);
          expect(invalid.status).toBe(400);
          await invalid.body?.cancel();
        }

        const session = f.database.startSession();
        try {
          await session.withTransaction(async () => {
            await f.db.collection(collections.messages).insertMany(
              Array.from({ length: 120 }, (_, offset) => ({
                _id: new ObjectId(),
                conversationId,
                senderId: alice.user.id,
                text: `synthetic-${offset + 1}`,
                sequence: offset + 1,
                createdAt: new Date(100000 + offset),
              })),
              { session },
            );
            await f.db
              .collection(collections.conversations)
              .updateOne(
                { _id: new ObjectId(conversationId) },
                { $set: { lastSequence: 120 } },
                { session },
              );
          });
          session.startTransaction();
          await f.db.collection(collections.messages).insertOne(
            {
              conversationId,
              senderId: bob.user.id,
              text: "synthetic-late-commit",
              sequence: 121,
              createdAt: new Date(1),
            },
            { session },
          );
          await f.db
            .collection(collections.conversations)
            .updateOne(
              { _id: new ObjectId(conversationId) },
              { $set: { lastSequence: 121 } },
              { session },
            );
          const recent = historySuccessSchema.parse(
            await (
              await request(`conversations/${conversationId}/messages`)
            ).json(),
          ).data;
          expect(recent.watermark).toBe(120);
          expect(recent.baselineCursor).toBe(70);
          expect(recent.items.map((item) => item.sequence)).toEqual(
            Array.from({ length: 50 }, (_, offset) => 71 + offset),
          );
          expect(recent.pageInfo.hasMore).toBe(true);
          for (const query of [
            "after=9007199254740991.1",
            "after=1.0000000000000001",
            "limit=10",
            "limit=100",
          ]) {
            const rejected = await request(
              `conversations/${conversationId}/messages?${query}`,
            );
            expect(rejected.status).toBe(400);
            expect((await rejected.json()).error.code).toBe(
              "VALIDATION_FAILED",
            );
          }
          const actor = await authorizeSession(
            { accessToken: alice.accessToken },
            f.auth,
          );
          if (actor.isError()) throw new Error(actor.getError());
          for (const limit of [10, 100]) {
            const direct = await listHistory(
              {
                actor: actor.get(),
                conversationId,
                range: { direction: "recent" },
                limit,
              },
              chat.conversations,
            );
            if (direct.isError()) throw new Error(direct.getError());
            expect(direct.get().items.map((item) => item.sequence)).toEqual(
              Array.from({ length: 50 }, (_, offset) => 71 + offset),
            );
            expect(direct.get().baselineCursor).toBe(70);
            expect(direct.get().watermark).toBe(120);
          }
          const validMaximum = await request(
            `conversations/${conversationId}/messages?after=9007199254740991`,
          );
          expect(validMaximum.status).toBe(400);
          expect((await validMaximum.json()).error.code).toBe("INVALID_CURSOR");
          const smallAfter = historySuccessSchema.parse(
            await (
              await request(
                `conversations/${conversationId}/messages?after=70&limit=10`,
              )
            ).json(),
          ).data;
          expect(smallAfter.items.map((item) => item.sequence)).toEqual(
            Array.from({ length: 10 }, (_, offset) => 71 + offset),
          );
          expect(smallAfter.baselineCursor).toBe(70);
          const first = historySuccessSchema.parse(
            await (
              await request(
                `conversations/${conversationId}/messages?after=70&limit=20`,
              )
            ).json(),
          ).data;
          expect(first.items.at(-1)?.sequence).toBe(90);
          expect(first.watermark).toBe(120);
          if (!first.pageInfo.nextCursor || !recent.pageInfo.nextCursor)
            throw new Error("Expected bounded cursors");
          await session.commitTransaction();
          const second = historySuccessSchema.parse(
            await (
              await request(
                `conversations/${conversationId}/messages?cursor=${first.pageInfo.nextCursor}&limit=20`,
              )
            ).json(),
          ).data;
          expect(second.watermark).toBe(120);
          expect(second.items.map((item) => item.sequence)).toEqual(
            Array.from({ length: 20 }, (_, offset) => 91 + offset),
          );
          const older = historySuccessSchema.parse(
            await (
              await request(
                `conversations/${conversationId}/messages?cursor=${recent.pageInfo.nextCursor}`,
              )
            ).json(),
          ).data;
          expect(older.watermark).toBe(120);
          expect(older.baselineCursor).toBe(70);
          expect(older.items.map((item) => item.sequence)).toEqual(
            Array.from({ length: 50 }, (_, offset) => 21 + offset),
          );
          const smallBefore = historySuccessSchema.parse(
            await (
              await request(
                `conversations/${conversationId}/messages?cursor=${recent.pageInfo.nextCursor}&limit=10`,
              )
            ).json(),
          ).data;
          expect(smallBefore.items.map((item) => item.sequence)).toEqual(
            Array.from({ length: 10 }, (_, offset) => 61 + offset),
          );
          expect(smallBefore.baselineCursor).toBe(70);
          expect(smallBefore.watermark).toBe(120);
          if (!smallBefore.pageInfo.nextCursor)
            throw new Error("Expected before cursor");
          const olderRemaining = historySuccessSchema.parse(
            await (
              await request(
                `conversations/${conversationId}/messages?cursor=${smallBefore.pageInfo.nextCursor}&limit=100`,
              )
            ).json(),
          ).data;
          expect(olderRemaining.items.map((item) => item.sequence)).toEqual(
            Array.from({ length: 60 }, (_, offset) => 1 + offset),
          );
          expect(olderRemaining.baselineCursor).toBe(70);
          expect(olderRemaining.watermark).toBe(120);
          const recovery = historySuccessSchema.parse(
            await (
              await request(
                `conversations/${conversationId}/messages?after=120`,
              )
            ).json(),
          ).data;
          expect(recovery.watermark).toBe(121);
          expect(
            recovery.items.map((item) => [item.sequence, item.createdAt]),
          ).toEqual([[121, new Date(1).toISOString()]]);
          expect(recovery.pageInfo).toEqual({
            nextCursor: null,
            hasMore: false,
          });
          const swapped = encodeCursor({
            direction: "after",
            conversationId: "000000000000000000000001",
            sequence: 0,
            watermark: 120,
          });
          const swappedResult = await request(
            `conversations/${conversationId}/messages?cursor=${swapped}`,
          );
          expect((await swappedResult.json()).error.code).toBe(
            "INVALID_CURSOR",
          );
          const future = encodeCursor({
            direction: "after",
            conversationId,
            sequence: 0,
            watermark: 122,
          });
          const futureResult = await request(
            `conversations/${conversationId}/messages?cursor=${future}`,
          );
          expect((await futureResult.json()).error.code).toBe("INVALID_CURSOR");
          const forbiddenPage = await request(
            `conversations/${conversationId}/messages?cursor=${recent.pageInfo.nextCursor}`,
            outsider.accessToken,
          );
          expect(forbiddenPage.status).toBe(403);
          await forbiddenPage.body?.cancel();
          const unsafe = await request(
            `conversations/${conversationId}/messages?after=9007199254740992`,
          );
          expect(unsafe.status).toBe(400);
          await unsafe.body?.cancel();
          expect(
            await f.db
              .collection(collections.messages)
              .countDocuments({ conversationId }),
          ).toBe(121);
          await expect(
            f.db.collection(collections.messages).insertOne({
              conversationId,
              senderId: alice.user.id,
              text: "synthetic-duplicate",
              sequence: 121,
              createdAt: new Date(),
            }),
          ).rejects.toMatchObject({ code: 11000 });
          expect(
            await f.db
              .collection(collections.messages)
              .countDocuments({ conversationId }),
          ).toBe(121);
          expect(
            await f.db
              .collection(collections.events)
              .countDocuments({ conversationId }),
          ).toBe(1);
        } finally {
          if (session.inTransaction()) await session.abortTransaction();
          await session.endSession();
        }
        for (let index = 0; index < 101; index += 1) {
          const response = await request(
            `conversations/${conversationId}/messages`,
            bob.accessToken,
          );
          expect(response.status).toBe(index < 100 ? 200 : 429);
          await response.body?.cancel();
        }
        for (let index = 0; index < 31; index += 1) {
          const response = await request("users?q=a", bob.accessToken);
          expect(response.status).toBe(index < 30 ? 200 : 429);
          await response.body?.cancel();
        }
        process.stdout.write(
          JSON.stringify({
            nativeChat: "passed",
            pairRace: 12,
            canonicalCreated: 1,
            lateCommitSequence: 121,
            heldWatermark: 120,
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
    }
  } finally {
    await delivery.close();
    broker.close();
  }
} finally {
  try {
    const remaining = await f.db
      .collection(collections.conversations)
      .find(
        { participantIds: { $in: ownedActors } },
        { projection: { _id: 1 } },
      )
      .toArray();
    ownedIds.push(...remaining.map((row) => row._id.toHexString()));
    for (const collection of [collections.messages, collections.events]) {
      await f.db
        .collection(collection)
        .deleteMany({ conversationId: { $in: ownedIds } });
      expect(
        await f.db
          .collection(collection)
          .countDocuments({ conversationId: { $in: ownedIds } }),
      ).toBe(0);
    }
    await f.db
      .collection(collections.conversations)
      .deleteMany({ _id: { $in: ownedIds.map((id) => new ObjectId(id)) } });
    expect(
      await f.db.collection(collections.conversations).countDocuments({
        _id: { $in: ownedIds.map((id) => new ObjectId(id)) },
      }),
    ).toBe(0);
  } finally {
    await f.dispose();
  }
}
