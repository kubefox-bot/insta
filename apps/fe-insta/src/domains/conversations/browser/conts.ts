export const historyCachePolicy = {
  maxConversations: 5,
  maxMessages: 200,
} as const;
// Optional per-host Readable<boolean>: false while another surface covers the chat.
export const conversationForegroundContextKey =
  "insta/conversations/foreground";
export const conversationsContextKey = "insta/conversations";
export const unreadSummaryContextKey = "insta/conversations/unread";

export const olderWindowLimit = 100;

export const conversationConnectionStates = {
  offline: "offline",
  connecting: "connecting",
  connected: "connected",
  error: "error",
} as const;

export const historyStates = {
  ready: "ready",
  loading: "loading",
  error: "error",
} as const;
