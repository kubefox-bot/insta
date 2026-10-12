export const conversationIssues = {
  conversationsUnavailable: "CONVERSATIONS_UNAVAILABLE",
  historyForbidden: "HISTORY_FORBIDDEN",
  historyUnavailable: "HISTORY_UNAVAILABLE",
  subscriptionUnavailable: "SUBSCRIPTION_UNAVAILABLE",
  outboxUnavailable: "OUTBOX_UNAVAILABLE",
  messageProjectionFailed: "MESSAGE_PROJECTION_FAILED",
} as const;

export const historyAccessStatuses = { forbidden: 403, notFound: 404 } as const;
