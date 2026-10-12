import { CommonErrorCode, SessionErrorCode } from "@insta/contracts/errors";
import { messageSchema } from "@insta/contracts/messages";
import { z } from "zod";
import { readRetryAfter } from "../../../../lib/http/retry-after";
import type { QueuedMessage, SendOutcome } from "../../../domain/types";
import type { ConfirmationObserver } from "../../types";
import {
  rateLimitedStatus,
  terminalStatuses,
  unauthorizedStatus,
} from "./conts";

const successSchema = z.object({ ok: z.literal(true), data: messageSchema });
const failureSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string() }),
});
/** Проверяет схему и идентичность подтверждённого сообщения; ошибки наблюдателей не меняют подтверждённый серверный исход. */
const confirmed = ({
  raw,
  record,
  onConfirmed,
  onConsumerError,
}: ConfirmationObserver &
  Readonly<{ raw: unknown; record: QueuedMessage }>): SendOutcome => {
  const parsed = successSchema.safeParse(raw, { jitless: true });
  if (!parsed.success) return { kind: "unknown" };
  const message = parsed.data.data;
  if (
    message.authorId !== record.ownerId ||
    message.conversationId !== record.conversationId ||
    message.clientMessageId !== record.clientMessageId
  )
    return { kind: "unknown" };
  try {
    onConfirmed?.(message, {
      ownerId: record.ownerId,
      generation: record.lastAuthGeneration,
    });
  } catch (error) {
    try {
      onConsumerError?.(error);
    } catch {
      /* Consumer diagnostics cannot change persisted confirmation. */
    }
  }
  return { kind: "confirmed", messageId: message.id };
};
/** Различает подтверждение, смену auth, ограничение частоты и окончательный отказ; непроверенный контракт и неизвестный серверный эффект остаются unknown. */
export const decodeSend = ({
  response,
  raw,
  record,
  now,
  onConfirmed,
  onConsumerError,
}: ConfirmationObserver &
  Readonly<{
    response: Response;
    raw: unknown;
    record: QueuedMessage;
    now: number;
  }>): SendOutcome => {
  if (response.ok)
    return confirmed({ raw, record, onConfirmed, onConsumerError });
  const parsed = failureSchema.safeParse(raw, { jitless: true });
  if (!parsed.success) return { kind: "unknown" };
  if (
    response.status === unauthorizedStatus ||
    parsed.data.error.code === SessionErrorCode.ActorChanged
  )
    return { kind: "auth" };
  if (response.status === rateLimitedStatus)
    return {
      kind: "retry",
      retryAfterMs: readRetryAfter({
        header: response.headers.get("Retry-After"),
        now,
      }),
    };
  if (
    Object.values(terminalStatuses).some(
      (status) => status === response.status,
    ) &&
    parsed.data.error.code !== CommonErrorCode.OperationOutcomeUnknown
  )
    return { kind: "terminal", code: parsed.data.error.code };
  return { kind: "unknown" };
};
