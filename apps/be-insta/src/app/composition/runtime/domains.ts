import type { RedisClient } from "bun";
import type { readRuntimeConfig } from "../../../lib/config/index";
import type { connectDatabase } from "../../../lib/database/index";
import type { DeliveryConnection } from "../../../lib/dragonfly/index";
import { createConversationsDependencies } from "../conversations/index";
import { createSupportDependencies } from "../support-reports/index";
import {
  createDirectoryDependencies,
  createUsersDependencies,
} from "../users/index";
/** Собирает users, support, directory и conversations с узкими cross-capability портами; инфраструктурные клиенты заимствованы у runtime. */
export const createDomainDependencies = async ({
  config,
  database,
  broker,
  deliveryBroker,
}: Readonly<{
  config: ReturnType<typeof readRuntimeConfig>;
  database: Awaited<ReturnType<typeof connectDatabase>>;
  broker: RedisClient;
  deliveryBroker: DeliveryConnection;
}>) => {
  const users = await createUsersDependencies({
    database,
    broker,
    limitKey: config.authLimitsKey,
    signingKey: config.authSigningKey,
    replayKey: config.authReplayKey,
  });
  const support = await createSupportDependencies({
    database,
    broker,
    auth: users.auth,
    key: config.authSigningKey,
  });
  const directory = createDirectoryDependencies({
    database,
    broker,
    key: config.authLimitsKey,
  });
  const chat = await createConversationsDependencies({
    retentionMs: config.realtime.retentionMs,
    policy: config.realtime,
    deliveryBroker,
    database,
    broker,
    key: config.authLimitsKey,
    directory: { findPublicUser: directory.findPublicUser },
  });
  return {
    users,
    support,
    chat,
    directory: directory.directory,
    findPublicUser: directory.findPublicUser,
  };
};
