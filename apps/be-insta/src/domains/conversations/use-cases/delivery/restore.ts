import { deliveryStream } from "../../domain/delivery/stream";
import { restoreOwned } from "./restore-range";
import type {
  DeliveryDependencies,
  RestoreInput,
  RestoreResult,
} from "./types";
/** Владеет lease lifetime; единственный release ждёт settlement и сохраняет одновременно исходный отказ и cleanup failure. */
export const restoreDeliveryStream = async (
  input: RestoreInput,
  ports: DeliveryDependencies,
): Promise<RestoreResult> => {
  const lease = await ports.streams.acquire({
    stream: deliveryStream(input.after.streamId),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const outcome = await restoreOwned({ ...input, lease }, ports).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const cleanup = await ports.streams.release({ lease }).then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!outcome.ok && !cleanup.ok)
    throw new AggregateError(
      [outcome.error, cleanup.error],
      "Delivery restore and lease cleanup failed",
      { cause: outcome.error },
    );
  if (!outcome.ok) throw outcome.error;
  if (!cleanup.ok) throw cleanup.error;
  return outcome.value;
};
