import { startOutboxWorker } from "../../outbox/worker";
import type { MessageOutbox, MessageSink } from "../../ports/outbox";
import { dispatchRealtimeRound } from "../../use-cases/delivery/dispatch-round";
import type { DeliveryMaintenance } from "../../use-cases/delivery/types";
import { outboxPollIntervalMs } from "./conts";
/**
 * Запускает polling только realtime sink message outbox через общий lifecycle worker;
 * инфраструктурные клиенты остаются у composition.
 */
export const startRealtimeWorker = ({
  outbox,
  publish,
  maintenance,
  onError,
}: Readonly<{
  outbox: MessageOutbox;
  publish: MessageSink;
  maintenance: DeliveryMaintenance;
  onError: () => void;
}>) =>
  startOutboxWorker({
    /**
     * Запускает один проход доставки ограниченной пачки message outbox в realtime
     * с текущими часами и сигналом остановки worker.
     */
    dispatch: (signal) =>
      dispatchRealtimeRound({
        outbox,
        publish,
        maintenance,
        clock: Date.now,
        /** Генерирует отдельный случайный leaseId для попытки доставки message outbox. */
        uuid: () => crypto.randomUUID(),
        signal,
      }),
    intervalMs: outboxPollIntervalMs,
    onError,
  });
