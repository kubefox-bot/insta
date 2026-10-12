import type { RedisClient } from "bun";
import {
  createDeliveryMaintenance,
  createDeliveryPublishers,
} from "../../../domains/conversations/index";
import {
  createDragonflyDeliveryStreams,
  createMongoDeliveryJournal,
  createMongoMembership,
  createMongoOutbox,
  deliveryStreamsNamespace,
} from "../../../domains/conversations/server/index";
import type { connectDatabase } from "../../../lib/database/index";
import type { DeliveryConnection } from "../../../lib/dragonfly/index";
import { createActorQuota } from "../../../lib/dragonfly/index";
import { realtimePolicy } from "../../../lib/realtime/index";
/** Связывает Mongo journal и Streams с существующими workers; blocking clients создаются только для активных streams. */
export const createRealtimeDependencies = ({
  database,
  broker,
  deliveryBroker,
  key,
}: Readonly<{
  database: Awaited<ReturnType<typeof connectDatabase>>;
  broker: RedisClient;
  deliveryBroker: DeliveryConnection;
  key: string;
}>) => {
  const journal = createMongoDeliveryJournal({
    db: database.apiDb,
    startSession: database.startSession,
  });
  const streams = createDragonflyDeliveryStreams({
    client: deliveryBroker.client,
    namespace: deliveryStreamsNamespace,
    openReader: deliveryBroker.openReader,
    clock: Date.now,
  });
  return {
    journal,
    streams,
    maintenance: createDeliveryMaintenance({
      journal,
      streams,
      clock: Date.now,
    }),
    publishers: createDeliveryPublishers({ journal, streams, clock: Date.now }),
    membership: createMongoMembership(database.apiDb),
    outbox: createMongoOutbox({ db: database.apiDb }),
    quota: createActorQuota({
      client: broker,
      key,
      namespace: "realtime",
      maximum: realtimePolicy.commandsPerMinute,
    }),
  };
};
