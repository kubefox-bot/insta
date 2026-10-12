import type { DeliveryPosition, DeliveryUnit } from "@insta/contracts/realtime";
import type { DeliveryAttempt } from "../../domain/delivery/types";
import type { MaterializedDelivery } from "../../ports/delivery/types";
/** Создаёт bounded immutable единицу; unread сохраняет порядок всех событий и ACK только последнего cursor. */
export const createDeliveryAttempt = ({
  events,
  after,
  subscriptionId,
  limit,
  unread,
}: Readonly<{
  events: readonly MaterializedDelivery[];
  after: DeliveryPosition;
  subscriptionId: string;
  limit: number;
  unread: boolean;
}>): DeliveryAttempt | undefined => {
  const selected = events.slice(0, unread ? limit : 1);
  const first = selected[0];
  const last = selected.at(-1);
  if (!first || !last) return undefined;
  for (const [index, event] of selected.entries()) {
    if (
      event.streamId !== after.streamId ||
      event.epoch !== after.epoch ||
      event.cursor !== after.cursor + index + 1
    )
      throw new Error("Delivery range is not consecutive");
  }
  const expected = {
    subscriptionId,
    streamId: last.streamId,
    epoch: last.epoch,
    cursor: last.cursor,
  };
  const unit: DeliveryUnit = unread
    ? {
        kind: "unread-batch",
        events: selected.map((event) => {
          if (event.payload.type !== "conversations.unread.changed")
            throw new Error("Unexpected unread payload");
          return {
            ...event.payload,
            delivery: { ...expected, cursor: event.cursor },
          };
        }),
      }
    : { kind: "single", event: { ...first.payload, delivery: expected } };
  return { unit, expected, expiresAt: first.expiresAt };
};
