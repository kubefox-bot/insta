import { RedisClient } from "bun";
import {
  readTestApiConfig,
  readTestWebConfig,
} from "../../../../../__tests__/fixtures/environment";
import { createAuthEnvironment } from "../../../../../__tests__/fixtures/users/auth-environment";
import { connectDatabase as connectWeb } from "../../../../../apps/fe-insta/src/lib/database/server/index";
import { createApplication } from "../../../src/app/bootstrap";
import { createDomainDependencies } from "../../../src/app/composition/runtime/domains";
import { createInfrastructureReadiness } from "../../../src/app/health/readiness/index";
import { deliveryStreamsNamespace } from "../../../src/domains/conversations/server/index";
import {
  bootstrapGeneration,
  bootstrapNamespaceGeneration,
  connectDragonfly,
  createDeliveryConnection,
  readBrokerIdentity,
} from "../../../src/lib/dragonfly/index";

const config = readTestApiConfig();
const resources = new AsyncDisposableStack();
try {
  const broker = await connectDragonfly({ config: config.dragonfly });
  resources.defer(() => broker.close());
  await bootstrapGeneration(broker);
  const authIdentity = await readBrokerIdentity(broker);
  const delivery = createDeliveryConnection({
    config: { ...config.deliveryDragonfly, timeoutMs: 500 },
    authIdentity,
  });
  resources.defer(delivery.close);
  const fixture = await createAuthEnvironment({
    collectionNamespace:
      "test_chat03_runtime_" + crypto.randomUUID().replaceAll("-", "") + "_",
  });
  resources.defer(fixture.dispose);
  const domains = await createDomainDependencies({
    config,
    database: fixture.database,
    broker,
    deliveryBroker: delivery,
  });
  resources.defer(() => domains.chat.realtime.streams.close());
  const web = await connectWeb({ config: readTestWebConfig().mongo });
  resources.defer(() => web.close());
  const accounts = await Promise.all([fixture.account(), fixture.account()]);
  const ids = await Promise.all(
    accounts.map(async (account) => {
      const user = await fixture.db
        .collection("users")
        .findOne({ emailKey: account.email.toLowerCase() });
      if (!user) throw new Error("Synthetic account missing");
      return user._id.toString();
    }),
  );
  resources.defer(async () => {
    await web.webDb
      .collection("bff_sessions")
      .deleteMany({ "user.id": { $in: ids } });
  });
  const readiness = createInfrastructureReadiness({
    database: fixture.database,
    broker,
    timeoutMs: 1000,
    mailpitUrl: config.mailpitUrl,
    mailStatus: () => "ok",
    deliveryProbe: {
      authIdentity,
      namespace: deliveryStreamsNamespace,
      timeoutMs: 150,
      open: () =>
        new RedisClient(config.deliveryDragonfly.url, {
          autoReconnect: false,
          enableOfflineQueue: false,
          connectionTimeout: 150,
        }),
    },
  });
  const app = await createApplication(
    {
      ...domains,
      directory: domains.directory,
      ...readiness,
      close: async () => {},
    },
    { mode: "offline" },
  );
  resources.defer(() => app.close());
  await app.listen(3001, "0.0.0.0");
  const control = Bun.serve({
    hostname: "0.0.0.0",
    port: 3002,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      if (path === "/accounts") return Response.json({ accounts, ids });
      if (path === "/count")
        return Response.json({
          messages: await fixture.db
            .collection("conversations_messages")
            .countDocuments({}),
        });
      if (path === "/bootstrap") {
        const client = await connectDragonfly({
          config: config.deliveryDragonfly,
        });
        try {
          await bootstrapNamespaceGeneration({
            client,
            namespace: deliveryStreamsNamespace,
          });
          return Response.json({ ok: true });
        } finally {
          client.close();
        }
      }
      if (path === "/delivery-ping")
        return Response.json({ pong: await delivery.client.send("PING", []) });
      if (path === "/consume") {
        const { ticket } = await request.json();
        const actor = await domains.users.tickets.consume({
          ticket,
          now: Date.now(),
        });
        return Response.json({ consumed: actor !== null });
      }
      if (path === "/auth-generation")
        return Response.json({
          identity: await broker.get("infra:auth-generation"),
        });
      return new Response("missing", { status: 404 });
    },
  });
  resources.defer(() => control.stop(true));
  const lifetime = resources.move();
  process.once("SIGTERM", () => {
    lifetime.disposeAsync().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
} catch (error) {
  await resources.disposeAsync();
  throw error;
}
