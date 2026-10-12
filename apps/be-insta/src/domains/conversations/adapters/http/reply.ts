import { ConversationErrorCode } from "@insta/contracts/errors";
import type { Correlation } from "@insta/contracts/http";
import type { NativeResponse } from "../../../../lib/http/index";
import type { ConversationError } from "../../domain/types";
import { conversationErrorStatus, retryAfterSeconds } from "./conts";
/**
 * Ставит HTTP-статус по conversation-коду и Retry-After для rate limit; возвращает
 * безопасный error envelope с корреляцией.
 */
export const conversationFailure = ({
  code,
  response,
  meta,
}: Readonly<{
  code: ConversationError;
  response: NativeResponse;
  meta: Correlation;
}>) => {
  response.status(conversationErrorStatus[code]);
  if (code === ConversationErrorCode.ConversationsRateLimited)
    response.setHeader("Retry-After", String(retryAfterSeconds));
  return {
    ok: false as const,
    error: { code, message: "Conversation request failed" },
    meta,
  };
};
