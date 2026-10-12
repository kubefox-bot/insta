import type {
  DeliverySource,
  PublicationOutcome,
} from "../../ports/delivery/types";
import { restoreDeliveryStream } from "./restore";
import type { DeliveryDependencies } from "./types";
/** Материализует только живые target streams; полное expiry завершает recovery явно и никогда не подтверждает browser delivery. */
export const materializeDelivery = async (
  input: Readonly<{ source: DeliverySource; signal?: AbortSignal }>,
  ports: DeliveryDependencies,
): Promise<PublicationOutcome> => {
  const source = await ports.journal.forSource({
    source: input.source,
    nowMs: ports.clock(),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (source.kind === "expired") return source;
  for (const event of source.events) {
    const result = await restoreDeliveryStream(
      {
        after: {
          streamId: event.streamId,
          epoch: event.epoch,
          cursor: event.cursor - 1,
        },
        through: event,
        ...(input.signal ? { signal: input.signal } : {}),
      },
      ports,
    );
    if ("kind" in result)
      throw new Error("Delivery source expired during materialization");
  }
};
