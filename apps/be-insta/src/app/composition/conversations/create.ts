import type { RedisClient } from "bun";
import {
  conversationPolicy,
  type Directory,
} from "../../../domains/conversations/index";
import {
  createCommitMessage,
  createMongoConversations,
  ensureConversationsIndexes,
  ensureDeliveryIndexes,
  ensureReceiptIndexes,
  messageIdentity,
} from "../../../domains/conversations/server/index";
import type { RealtimeConfig } from "../../../lib/config/index";
import type { connectDatabase } from "../../../lib/database/index";
import type { DeliveryConnection } from "../../../lib/dragonfly/index";
import { createActorQuota } from "../../../lib/dragonfly/index";
import { readAnalyticsReference } from "../../../lib/observability/analytics/index";
import { createRealtimeDependencies } from "./realtime";
import { createReceiptsDependencies } from "./receipts";
/** Создаёт conversation/receipt индексы и связывает отдельные порты сообщений, чтения, receipts и realtime с инфраструктурой. */
export const createConversationsDependencies = async ({
  database,
  broker,
  deliveryBroker,
  key,
  directory,
  retentionMs,
  policy,
}: Readonly<{
  database: Awaited<ReturnType<typeof connectDatabase>>;
  broker: RedisClient;
  deliveryBroker: DeliveryConnection;
  key: string;
  directory: Directory;
  retentionMs: number;
  policy: RealtimeConfig;
}>) => {
  await ensureConversationsIndexes(database.apiDb);
  await ensureReceiptIndexes(database.apiDb);
  await ensureDeliveryIndexes(database.apiDb);
  return {
    ...createReceiptsDependencies({ database, broker, key, retentionMs }),
    realtime: {
      policy,
      ...createRealtimeDependencies({
        database,
        broker,
        deliveryBroker,
        key,
      }),
    },
    messages: {
      commit: createCommitMessage({
        db: database.apiDb,
        startSession: database.startSession,
        clock: Date.now,
        retentionMs,
        analyticsReference: readAnalyticsReference,
      }),
      identity: messageIdentity,
      quota: createActorQuota({
        client: broker,
        key,
        namespace: "message.send",
        maximum: conversationPolicy.sendsPerMinute,
      }),
      clock: Date.now,
      /** Создаёт идентификатор нового сообщения независимо от клиентского operationId. */
      uuid: () => crypto.randomUUID(),
    },
    conversations: {
      directory,
      conversations: createMongoConversations({
        db: database.apiDb,
        startSession: database.startSession,
        clock: Date.now,
        analyticsReference: readAnalyticsReference,
      }),
      quota: createActorQuota({
        client: broker,
        key,
        namespace: "conversations",
        maximum: conversationPolicy.readsPerMinute,
      }),
      /** Создаёт идентификатор серверной conversation-операции для canonical audit. */
      operationId: () => crypto.randomUUID(),
    },
  };
};
