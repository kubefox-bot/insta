import {
  CommonErrorCode,
  ConversationErrorCode,
} from "@insta/contracts/errors";
import { conversationIssues, historyAccessStatuses } from "../../conts";
import { ConversationRequestError } from "./http/request-error";
/** Separates authorization/absence from transient provider failure at HTTP and WS boundaries. */
export const historyFailureIssue = (error: unknown) => {
  if (
    error instanceof ConversationRequestError &&
    Object.values(historyAccessStatuses).some(
      (status) => status === error.status,
    )
  )
    return conversationIssues.historyForbidden;
  if (
    error instanceof Error &&
    (error.message === CommonErrorCode.Forbidden ||
      error.message === ConversationErrorCode.ConversationForbidden ||
      error.message === ConversationErrorCode.ConversationNotFound)
  )
    return conversationIssues.historyForbidden;
  return conversationIssues.historyUnavailable;
};
