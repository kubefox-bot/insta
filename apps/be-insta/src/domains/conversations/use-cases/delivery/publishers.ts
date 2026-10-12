import type { MessageSink } from "../../ports/outbox";
import type { ReceiptSink } from "../../ports/receipt-outbox";
import { materializeDelivery } from "./materialize";
import type { DeliveryDependencies } from "./types";
/** Связывает существующие outbox workers с Streams; cleanup принадлежит отдельному шагу существующего round. */
export const createDeliveryPublishers = (
  ports: DeliveryDependencies,
): Readonly<{ message: MessageSink; receipt: ReceiptSink }> => {
  return {
    message: async ({ event, signal }) => {
      return materializeDelivery(
        { source: { kind: "message", eventId: event.eventId }, signal },
        ports,
      );
    },
    receipt: async ({ event, signal }) => {
      return materializeDelivery(
        { source: { kind: "receipt", eventId: event.eventId }, signal },
        ports,
      );
    },
  };
};
