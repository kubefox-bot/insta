import type { Db } from "mongodb";
import { createCanonicalOutbox } from "../../../../lib/observability/analytics/index";
import { conversationGoalCatalog } from "../../business/conts";
import { collections } from "./conts";
/**
 * Подключает отдельные канонические outbox для conversation.start и message.send к
 * соответствующим коллекциям и mappings; Db остаётся заимствованным.
 */
export const createConversationAnalyticsOutboxes = (db: Db) => [
  createCanonicalOutbox({
    db,
    collection: collections.events,
    mappings: conversationGoalCatalog.filter(
      (value) => value.operation === "conversation.start",
    ),
  }),
  createCanonicalOutbox({
    db,
    collection: collections.outbox,
    mappings: conversationGoalCatalog.filter(
      (value) => value.operation === "message.send",
    ),
  }),
];
