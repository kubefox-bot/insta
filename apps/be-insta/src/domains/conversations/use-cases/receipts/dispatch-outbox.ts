import { outboxPolicy } from "../../outbox/conts";
import { settlePublication } from "../../outbox/settle";
import type { ReceiptOutbox, ReceiptSink } from "../../ports/receipt-outbox";
/**
 * Последовательно доставляет ограниченную пачку receipt claims через общий settlement;
 * при пустой очереди или abort прекращает новые claims, начатую доставку дожидается.
 */
export const dispatchReceiptOutbox = async ({
  outbox,
  publish,
  clock,
  uuid,
  signal,
}: Readonly<{
  outbox: ReceiptOutbox;
  publish: ReceiptSink;
  clock: () => number;
  uuid: () => string;
  signal?: AbortSignal;
}>) => {
  const expire = outbox.expire;
  for (let index = 0; index < outboxPolicy.maxBatch; index += 1) {
    if (signal?.aborted) return;
    const claim = await outbox.claim({ now: clock(), leaseId: uuid() });
    if (!claim) return;
    await settlePublication({
      /** Публикует receipt event текущего claim под принадлежащим settlement сигналом. */
      publish: (owned) => publish({ event: claim.event, signal: owned }),
      /** Подтверждает текущий receipt lease после завершения sink с переданным временем. */
      complete: (now) => outbox.complete({ ...claim, now }),
      /** Планирует retry текущего receipt lease после неуспешной публикации. */
      fail: (nextAttemptAt) => outbox.fail({ ...claim, nextAttemptAt }),
      ...(expire ? { expire: (now: number) => expire({ ...claim, now }) } : {}),
      attempts: claim.attempts,
      clock,
      ...(signal ? { signal } : {}),
    });
  }
};
