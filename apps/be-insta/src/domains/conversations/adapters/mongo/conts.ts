export const collections = {
  conversations: "conversations",
  messages: "conversations_messages",
  events: "conversations_events",
  identities: "conversations_identities",
  outbox: "conversations_outbox",
} as const;
export const transactionOptions = {
  readPreference: "primary",
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" },
} as const;
export const duplicateKeyCode = 11000;
