import {
  deliveryNoticeReceiptSchema,
  deliveryReplySchema,
  realtimeChannels,
} from "@insta/contracts/realtime";
import type { Socket } from "socket.io";
import type { DeliveryTarget } from "../../../ports/delivery/interfaces";
import { exchangeDelivery } from "./exchange";
/** Преобразует результат единственного SDK ACK; notice receipt не подтверждает business cursor. */
export const createDeliveryTarget = (
  transport: Readonly<{ socket: Socket; ackTimeoutMs: number }>,
): DeliveryTarget => ({
  send: async ({ unit, signal }) => {
    const result = await exchangeDelivery({
      ...transport,
      channel: realtimeChannels.event,
      payload: unit,
      signal,
    });
    if (result.kind !== "received") return result;
    const parsed = deliveryReplySchema.safeParse(result.payload);
    return parsed.success ? parsed.data : { kind: "invalid" };
  },
  notify: async ({ notice, signal }) => {
    const result = await exchangeDelivery({
      ...transport,
      channel: realtimeChannels.notice,
      payload: notice,
      signal,
    });
    if (result.kind === "closed") return "closed";
    if (result.kind === "timeout") return "retry";
    const parsed = deliveryNoticeReceiptSchema.safeParse(result.payload);
    if (!parsed.success) return "retry";
    const receipt = parsed.data;
    return receipt.subscriptionId === notice.subscriptionId &&
      receipt.streamId === notice.streamId &&
      receipt.epoch === notice.epoch &&
      receipt.code === notice.code
      ? "received"
      : "retry";
  },
});
