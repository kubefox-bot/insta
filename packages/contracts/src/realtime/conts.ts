export const realtimePath = "/event";
export const realtimeChannels = {
  command: "command",
  event: "event",
  notice: "delivery.notice",
} as const;

export const realtimeProtocolVersion = 1;
export const realtimeKinds = {
  command: "command",
  event: "event",
  ack: "ack",
  deliveryNotice: "delivery-notice",
} as const;
export const realtimeCommandTypes = {
  storiesSubscribe: "stories.feed.subscribe",
  storiesUnsubscribe: "stories.feed.unsubscribe",
  activate: "conversations.activate",
  subscribe: "conversations.subscribe",
  unsubscribe: "conversations.unsubscribe",
  unreadSubscribe: "conversations.unread.subscribe",
  unreadUnsubscribe: "conversations.unread.unsubscribe",
} as const;
export const realtimeEventTypes = {
  storiesChanged: "stories.feed.changed",
  messageCreated: "messages.created",
  messageReceiptsUpdated: "messages.receipts.updated",
  unreadChanged: "conversations.unread.changed",
} as const;

export const maxUnreadBatchSize = 64;
export const deliveryReplyKinds = {
  applied: "applied",
  retryLater: "retry-later",
  applyFailed: "apply-failed",
} as const;
export const deliveryUnitKinds = {
  single: "single",
  unreadBatch: "unread-batch",
} as const;

export const storiesFeedStream = { kind: "stories", id: "public" } as const;
