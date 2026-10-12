import { z } from "zod";
import { createConversationsDependencies } from "../../../apps/be-insta/src/app/composition/conversations/index";
import { createDirectoryDependencies } from "../../../apps/be-insta/src/app/composition/users/index";
import { sendMessage } from "../../../apps/be-insta/src/domains/conversations/index";
import { createCommitMessage } from "../../../apps/be-insta/src/domains/conversations/server/index";
import {
  authorizeSession,
  login,
} from "../../../apps/be-insta/src/domains/users/index";
import { readRealtimeConfig } from "../../../apps/be-insta/src/lib/config/index";
import {
  connectDragonfly,
  readGeneration,
} from "../../../apps/be-insta/src/lib/dragonfly/index";
import { readOwnedCanonical } from "../analytics/canonical";
import { createAnalyticsConsent } from "../analytics/consent";
import { replayOwnedCanonical } from "../analytics/replay";
import { createBffEnvironment } from "../bff-session/environment";
import { connectDeliveryFixture } from "../delivery/runtime";
import { readTestApiConfig } from "../environment";
import { setupFailure } from "../lifecycle/setup-failure";
import { cleanupChatFixture } from "./cleanup";
import { expireOwnedSession } from "./expire";
import { readOwnedMarks } from "./marks/snapshot";

const config = readTestApiConfig();
const fixture = await createBffEnvironment();
const state: {
  delivery?: Awaited<ReturnType<typeof connectDeliveryFixture>>;
  broker?: Awaited<ReturnType<typeof connectDragonfly>>;
  server?: ReturnType<typeof Bun.serve>;
  release?: () => void;
  pending?: Promise<void>;
  late?: unknown;
} = {};
const ownedKeys = new Set<string>();
const dispose = async () => {
  state.release?.();
  const failures: unknown[] = [];
  for (const release of [
    () => state.server?.stop(true),
    () => state.pending,
    () =>
      cleanupChatFixture({
        fixture,
        broker: state.broker,
        config,
        keys: ownedKeys,
      }),
    () => state.delivery?.close(),
    () => fixture.dispose(),
  ]) {
    try {
      await release();
    } catch (error) {
      failures.push(error);
    }
  }
  state.broker?.close();
  if (failures.length)
    throw new AggregateError(failures, "CHAT05 disposal failed");
};
try {
  state.broker = await connectDragonfly({ config: config.dragonfly });
  const broker = state.broker;
  const delivery = await connectDeliveryFixture();
  state.delivery = delivery;
  const directory = createDirectoryDependencies({
    database: fixture.native.database,
    broker: state.broker,
    key: config.authLimitsKey,
  });
  const chat = delivery.ownChat(
    await createConversationsDependencies({
      deliveryBroker: delivery.provider,
      retentionMs: 86_400_000,
      policy: readRealtimeConfig({}),
      database: fixture.native.database,
      broker: state.broker,
      key: config.authLimitsKey,
      directory: { findPublicUser: directory.findPublicUser },
    }),
  );
  const account = async () => {
    const credentials = await fixture.native.account();
    const logged = await login(
      { ...credentials, operationId: fixture.native.operation() },
      fixture.native.auth,
    );
    if (logged.isError()) throw new Error(logged.getError());
    return {
      account: credentials,
      user: logged.get().credentials.user,
      accessToken: logged.get().credentials.accessToken,
    };
  };
  const alice = await account();
  const bob = await account();
  const mallory = await account();
  const actor = await authorizeSession(
    { accessToken: alice.accessToken },
    fixture.native.auth,
  );
  if (actor.isError()) throw new Error(actor.getError());
  const endpoints = new Map<
    string,
    (request: Request) => Response | Promise<Response>
  >([
    [
      "/",
      () =>
        Response.json({
          alice: { ...alice.account, ...alice.user },
          bob: { ...bob.account, ...bob.user },
          mallory: { ...mallory.account, ...mallory.user },
        }),
    ],
    [
      "/marks",
      (request) =>
        readOwnedMarks({
          request,
          conversations: chat.conversations.conversations,
          db: fixture.native.db,
          actorId: alice.user.id,
        }),
    ],
    [
      "/expire-alice",
      (request) =>
        expireOwnedSession({ fixture, actorId: alice.user.id, request }),
    ],
  ]);
  state.server = Bun.serve({
    hostname: "0.0.0.0",
    port: 3002,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      const endpoint = endpoints.get(path);
      if (endpoint) return endpoint(request);
      if (path === "/track-ticket") {
        const value = z
          .object({ ticket: z.uuid() })
          .parse(await request.json());
        const generation = await readGeneration(
          state.broker ??
            (() => {
              throw new Error("Broker missing");
            })(),
        );
        ownedKeys.add(`auth:${generation}:users:ws-ticket:${value.ticket}`);
        return Response.json({ ok: true });
      }
      if (path === "/analytics-consent") {
        return Response.json(
          await createAnalyticsConsent({
            broker,
            source: fixture.native.runId,
            ownedKeys,
          }),
        );
      }
      if (path === "/canonical")
        return readOwnedCanonical({
          request,
          conversations: chat.conversations.conversations,
          db: fixture.native.db,
          actorId: alice.user.id,
        });
      if (path === "/replay-canonical")
        return replayOwnedCanonical({
          request,
          conversations: chat.conversations.conversations,
          db: fixture.native.db,
          actorId: alice.user.id,
        });
      if (path === "/late-start") {
        if (state.pending) return new Response(null, { status: 409 });
        const { conversationId } = z
          .object({ conversationId: z.string().regex(/^[a-f0-9]{24}$/) })
          .parse(await request.json());
        const reached = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        state.release = () => release.resolve();
        const commit = createCommitMessage({
          clock: Date.now,
          retentionMs: 86_400_000,
          db: fixture.native.db,
          startSession: () => {
            const session = fixture.native.database.startSession();
            const original = session.commitTransaction.bind(session);
            session.commitTransaction = async () => {
              reached.resolve();
              await release.promise;
              await original();
            };
            return session;
          },
        });
        state.pending = sendMessage(
          {
            actor: actor.get(),
            conversationId,
            text: "A14 late persisted commit",
            clientMessageId: crypto.randomUUID(),
            operationId: fixture.native.operation(),
          },
          { ...chat.messages, commit, clock: () => 1 },
        ).then((result) => {
          if (result.isError()) throw new Error(result.getError());
          state.late = result.get();
        });
        await reached.promise;
        return Response.json({ held: true });
      }
      if (path === "/late-release") {
        state.release?.();
        await state.pending;
        return Response.json({ message: state.late });
      }
      return new Response(null, { status: 404 });
    },
  });
  process.once("SIGTERM", () => {
    dispose().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
} catch (error) {
  try {
    await dispose();
  } catch (cleanup) {
    throw setupFailure({
      error,
      cleanupError: cleanup,
      message: "CHAT05 setup and cleanup failed",
    });
  }
  throw error;
}
