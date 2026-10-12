import {
  realtimeEventTypes,
  replayPayloadSchema,
} from "@insta/contracts/realtime";
import type { DeliveryPayload } from "../../../../ports/delivery/types";
import { mapReceiptSnapshot } from "../../../receipts/map";
import { receiptCollections } from "../../receipts/conts";
import { receiptOutboxSchema } from "../../receipts/schema";
import type { ReceiptOutboxDocument } from "../../receipts/types";
import { deliveryReadOptions } from "../conts";
import { replayEnvelope } from "./payload";
import type { MaterializeInput } from "./types";
/** Восстанавливает исходный receipt snapshot или адресную read-инвалидацию; более поздние изменения receipts не подменяют payload. */
export const materializeReceipt = async ({
  db,
  event,
  signal,
}: MaterializeInput): Promise<DeliveryPayload> => {
  const source = receiptOutboxSchema.parse(
    await db
      .collection<ReceiptOutboxDocument>(
        receiptCollections.outbox,
        deliveryReadOptions,
      )
      .findOne({ _id: event.source.eventId }, { signal }),
  );
  const base = replayEnvelope({ event, source, operationId: source.eventId });
  if (event.eventType === realtimeEventTypes.unreadChanged) {
    if (
      !source.receipts.some(
        (receipt) =>
          receipt.readAt !== null &&
          event.streamId === `unread:${receipt.recipientId}`,
      )
    )
      throw new Error("Invalid unread receipt target");
    return replayPayloadSchema.parse({
      ...base,
      type: event.eventType,
      data: { conversationId: source.conversationId },
    });
  }
  if (event.eventType !== realtimeEventTypes.messageReceiptsUpdated)
    throw new Error("Invalid receipt delivery type");
  return replayPayloadSchema.parse({
    ...base,
    type: event.eventType,
    data: mapReceiptSnapshot(source),
  });
};
