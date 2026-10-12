import { httpHeaderNames } from "@insta/contracts/http";
import { webSessionHeaders } from "../../../../../lib/session/contracts/index";
import { sendTimeoutMs } from "../domain/conts";
import type { QueuedMessage } from "../domain/types";
import { createCancellation } from "../lib/cancellation/create";
import type { Sender, SendHttp } from "../ports/sender";
import { decodeSend } from "./lib/sender/decode";
import type { ConfirmationObserver } from "./types";

/** Отправляет сообщение через BFF с сохранёнными ключами идемпотентности и поколением; после отмены не вызывает наблюдателя подтверждения. */
const send = async ({
  record,
  request,
  clock,
  signal,
  onConfirmed,
  onConsumerError,
}: ConfirmationObserver &
  Readonly<{
    record: QueuedMessage;
    request: SendHttp;
    clock: () => number;
    signal: AbortSignal;
  }>) => {
  const response = await request(
    `/api/conversations/${record.conversationId}/messages`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        [webSessionHeaders.ownerId]: record.ownerId,
        [webSessionHeaders.generation]: record.lastAuthGeneration,
        [httpHeaderNames.idempotencyKey]: record.key,
        [httpHeaderNames.operationId]: record.operationId,
      },
      body: JSON.stringify({
        text: record.text,
        clientMessageId: record.clientMessageId,
      }),
      signal,
    },
  );
  const raw: unknown = await response.json();
  return decodeSend({
    response,
    raw,
    record,
    now: clock(),
    onConfirmed: signal.aborted ? undefined : onConfirmed,
    onConsumerError,
  });
};
/** Создаёт отправитель с таймаутом и родительской отменой; исключения дают unknown, поскольку серверный эффект мог состояться, ресурсы отмены освобождаются всегда. */
export const createOutboxSender =
  ({
    request = fetch,
    clock = Date.now,
    onConfirmed,
    onConsumerError,
  }: ConfirmationObserver &
    Readonly<{ request?: SendHttp; clock?: () => number }> = {}): Sender =>
  async (record, { signal } = {}) => {
    const cancellation = createCancellation({
      parent: signal,
      timeoutMs: sendTimeoutMs,
    });
    try {
      return await Promise.race([
        send({
          record,
          request,
          clock,
          signal: cancellation.signal,
          onConfirmed,
          onConsumerError,
        }),
        cancellation.stopped,
      ]);
    } catch {
      return { kind: "unknown" };
    } finally {
      cancellation.close();
    }
  };
