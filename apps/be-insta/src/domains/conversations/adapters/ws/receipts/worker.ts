import { startOutboxWorker } from "../../../outbox/worker";
import type { ReceiptOutbox, ReceiptSink } from "../../../ports/receipt-outbox";
import { dispatchReceiptOutbox } from "../../../use-cases/receipts/dispatch-outbox";
import { outboxPollIntervalMs } from "../conts";
/**
 * Запускает polling receipt outbox через общий lifecycle worker; возвращённый close
 * отменяет dispatch и ждёт settlement без закрытия заимствованного outbox.
 */
export const startReceiptWorker = ({
  outbox,
  publish,
  onError,
}: Readonly<{
  outbox: ReceiptOutbox;
  publish: ReceiptSink;
  onError: () => void;
}>) =>
  startOutboxWorker({
    /**
     * Выполняет один проход доставки ограниченной пачки receipt outbox с часами
     * процесса и сигналом принадлежащего worker lifetime.
     */
    dispatch: (signal) =>
      dispatchReceiptOutbox({
        outbox,
        publish,
        clock: Date.now,
        /** Выделяет новый случайный leaseId для попытки claim receipt outbox. */
        uuid: () => crypto.randomUUID(),
        signal,
      }),
    intervalMs: outboxPollIntervalMs,
    onError,
  });
