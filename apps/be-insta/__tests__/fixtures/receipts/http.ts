import { createHmac } from "node:crypto";
import { connectDeliveryFixture } from "../../../../../__tests__/fixtures/delivery/runtime";
import { readTestApiConfig } from "../../../../../__tests__/fixtures/environment";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import { createApplication } from "../../../src/app/bootstrap";
import { createConversationsDependencies } from "../../../src/app/composition/conversations/index";
import { createConversationGateway } from "../../../src/domains/conversations/server/index";
import { sessionCredentialsSchema } from "../../../src/domains/users/auth/domain/credentials";
import { authorizeActorSession, login } from "../../../src/domains/users/index";
import { createDragonflyWsTickets } from "../../../src/domains/users/server/index";
import { readRealtimeConfig } from "../../../src/lib/config/index";
import {
  connectDragonfly,
  readGeneration,
} from "../../../src/lib/dragonfly/index";
import { createCommandObserver } from "../../../src/lib/realtime/index";
export const createReceiptHttpFixture = async ({
  policy = readRealtimeConfig({}),
}: Readonly<{ policy?: ReturnType<typeof readRealtimeConfig> }> = {}) => {
  await using resources = new AsyncDisposableStack();
  const f = await createAuthEnvironment({
    collectionNamespace: `test_chat03_runtime_${crypto.randomUUID().replaceAll("-", "")}_`,
  });
  resources.defer(f.dispose);
  const config = readTestApiConfig();
  const broker = await connectDragonfly({ config: config.dragonfly });
  const delivery = await connectDeliveryFixture().catch((error) => {
    broker.close();
    throw error;
  });
  resources.defer(() => broker.close());
  resources.defer(delivery.close);
  const key = createHmac("sha256", Buffer.from(config.authLimitsKey, "hex"))
    .update(f.runId)
    .digest("hex");
  const generation = await readGeneration(broker);
  const quotaKeys = new Set<string>();
  resources.defer(async () => {
    for (const key of quotaKeys) await broker.del(key);
  });
  const chat = delivery.ownChat(
    await createConversationsDependencies({
      deliveryBroker: delivery.provider,
      retentionMs: 86_400_000,
      policy,
      database: f.database,
      broker,
      key,
      directory: {
        findPublicUser: async () => {
          throw new Error("Unused directory");
        },
      },
    }),
  );
  const tickets = createDragonflyWsTickets({ client: broker });
  const app = await createApplication(
    {
      users: { ...f.users, tickets },
      chat,
      checkRequired: async () => true,
      check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
      close: async () => {},
    },
    { mode: "offline" },
  );
  resources.defer(() => app.close());
  const gateway = createConversationGateway({
    server: app.getHttpServer(),
    origin: "https://localhost",
    tickets,
    authorize: (input) => authorizeActorSession(input, f.auth),
    ...chat.realtime,
    observe: createCommandObserver({ uuid: () => crypto.randomUUID() }),
  });
  resources.defer(gateway.close);
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  const lifetime = resources.move();
  return {
    ...f,
    app,
    chat,
    url,
    gateway,
    signIn: async () => {
      const account = await f.account();
      const result = await login(
        { ...account, operationId: f.operation() },
        f.auth,
      );
      if (result.isError()) throw new Error(result.getError());
      const credentials = sessionCredentialsSchema.parse(
        result.get().credentials,
      );
      const digest = createHmac("sha256", Buffer.from(key, "hex"))
        .update(credentials.user.id)
        .digest("hex");
      for (const owner of ["receipts", "message.send", "conversations"])
        quotaKeys.add(`auth:${generation}:${owner}:limit:${digest}`);
      const sessionDigest = createHmac("sha256", Buffer.from(key, "hex"))
        .update(credentials.backendSessionId)
        .digest("hex");
      quotaKeys.add(`auth:${generation}:realtime:limit:${sessionDigest}`);
      return credentials;
    },
    close: () => lifetime.disposeAsync(),
  };
};
