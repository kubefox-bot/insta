import { collections } from "../conts";
import { receiptCollections } from "../receipts/conts";
export const deliveryCollections = {
  notifications: "delivery_notifications",
  metadata: "conversations_delivery_metadata",
  journal: "conversations_delivery_journal",
} as const;
export const deliveryReadOptions = {
  readPreference: "primary",
  readConcern: { level: "majority" },
} as const;

export const deliveryCleanupPolicy = {
  batchSize: 64,
  queryTimeoutMs: 5000,
} as const;

export const deliverySourceCollections = {
  message: collections.outbox,
  receipt: receiptCollections.outbox,
  notification: deliveryCollections.notifications,
} as const;
