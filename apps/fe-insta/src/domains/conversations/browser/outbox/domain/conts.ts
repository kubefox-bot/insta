import { MessageErrorCode, SessionErrorCode } from "@insta/contracts/errors";
export const queueLimit = 100;
export const autoSendAgeMs = 86400000;
export const retryDelaysMs = {
  "0": 1000,
  "1": 2000,
  "2": 4000,
  "3": 8000,
  "4": 16000,
} as const;
export const maxAttempts = 6;
export const retryJitterMs = 250;
export const sendTimeoutMs = 10000;
export const outboxDatabaseName = "insta-conversations-outbox";
export const outboxDatabaseVersion = 1;
export const outboxStoreName = "operations";
export const outboxOwnerIndex = "ownerId";
export const outboxChannelName = "insta-conversations-outbox";
export const authReadTimeoutMs = 10000;

export const queueErrors = {
  full: "QUEUE_FULL",
  persistenceFailed: "PERSISTENCE_FAILED",
  invalidMessage: MessageErrorCode.InvalidMessage,
  actorChanged: SessionErrorCode.ActorChanged,
  authUnavailable: SessionErrorCode.AuthUnavailable,
} as const;
