import { ConversationRequestError } from "../lib/http/request-error";
import { retryableUnreadStatuses, unreadHttpStatuses } from "./conts";
import type { UnreadRefreshOutcome } from "./types";
/** Отличает повторяемый транспортный отказ от нарушения контракта canonical response. */
export const classifyUnreadFailure = (error: unknown): UnreadRefreshOutcome => {
  if (error instanceof ConversationRequestError) {
    if (
      error.status === unreadHttpStatuses.unauthorized ||
      error.status === unreadHttpStatuses.forbidden
    )
      return { kind: "unauthorized" };
    if (retryableUnreadStatuses.includes(error.status))
      return {
        kind: "retry-later",
        ...(error.retryAfterMs === undefined
          ? {}
          : { retryAfterMs: error.retryAfterMs }),
      };
  }
  return error instanceof TypeError
    ? { kind: "retry-later" }
    : { kind: "apply-failed" };
};
