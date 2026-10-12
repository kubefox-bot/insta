import { dispatchMessageOutbox } from "../messages/dispatch-outbox";
import type { DeliveryRoundInput } from "./types";
/** Сохраняет ошибку maintenance, но даёт независимой business работе шанс завершиться; abort запрещает новые claims. */
export const dispatchRealtimeRound = async (input: DeliveryRoundInput) => {
  const maintenance = await input.maintenance({ signal: input.signal }).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (input.signal.aborted) {
    if (!maintenance.ok) throw maintenance.error;
    input.signal.throwIfAborted();
  }
  const publication = await dispatchMessageOutbox({
    outbox: input.outbox,
    sinks: { realtime: input.publish },
    clock: input.clock,
    uuid: input.uuid,
    signal: input.signal,
  }).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!maintenance.ok && !publication.ok)
    throw new AggregateError(
      [maintenance.error, publication.error],
      "Delivery maintenance and dispatch failed",
      { cause: maintenance.error },
    );
  if (!maintenance.ok) throw maintenance.error;
  if (!publication.ok) throw publication.error;
};
