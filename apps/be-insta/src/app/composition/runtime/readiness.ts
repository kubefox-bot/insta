import { RedisClient } from "bun";
import { deliveryStreamsNamespace } from "../../../domains/conversations/server/index";
import type { readRuntimeConfig } from "../../../lib/config/index";
import type { connectDatabase } from "../../../lib/database/index";
import { createInfrastructureReadiness } from "../../health/readiness/index";
/** Создаёт независимые короткоживущие delivery probes; required admission сохраняет auth/Mongo. */
export const createRuntimeReadiness = ({
  config,
  database,
  broker,
  authIdentity,
  mailStatus,
}: Readonly<{
  config: ReturnType<typeof readRuntimeConfig>;
  database: Awaited<ReturnType<typeof connectDatabase>>;
  broker: RedisClient;
  authIdentity: string;
  mailStatus: () => "ok" | "degraded";
}>) =>
  createInfrastructureReadiness({
    database,
    broker,
    timeoutMs: config.dragonfly.timeoutMs,
    mailpitUrl: config.mailpitUrl,
    mailStatus,
    deliveryProbe: {
      namespace: deliveryStreamsNamespace,
      authIdentity,
      timeoutMs: config.deliveryDragonfly.probeTimeoutMs,
      open: () =>
        new RedisClient(config.deliveryDragonfly.url, {
          autoReconnect: false,
          enableOfflineQueue: false,
          connectionTimeout: config.deliveryDragonfly.probeTimeoutMs,
        }),
    },
  });
