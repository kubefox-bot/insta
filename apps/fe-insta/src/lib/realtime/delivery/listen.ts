import {
  deliveryNoticeSchema,
  deliveryUnitSchema,
  realtimeChannels,
} from "@insta/contracts/realtime";
import type { Socket } from "socket.io-client";
import type { DeliveryReceiver, DeliveryResult, NoticeResult } from "./types";
/** Подтверждает только проверенное и применённое состояние; recovery запускается после синхронного callback. */
export const listenForDelivery = ({
  client,
  receiver,
  active,
  protocolError,
  track,
}: Readonly<{
  client: Socket;
  receiver: DeliveryReceiver | undefined;
  active: () => boolean;
  protocolError: () => void;
  track: (operation: Promise<void>) => void;
}>) => {
  client.on(realtimeChannels.event, (payload: unknown, callback: unknown) => {
    if (!active()) return;
    const parsed = deliveryUnitSchema.safeParse(payload, { jitless: true });
    if (!parsed.success || typeof callback !== "function" || !receiver) {
      protocolError();
      return;
    }
    const operation = receiver
      .receive(parsed.data, active)
      .then((result) => {
        replyBeforeRecovery({
          result,
          active,
          reply: (value) => callback(value),
        });
      })
      .catch(() => {
        if (active()) protocolError();
      });
    track(operation);
  });
  client.on(realtimeChannels.notice, (payload: unknown, callback: unknown) => {
    if (!active()) return;
    const parsed = deliveryNoticeSchema.safeParse(payload, { jitless: true });
    if (!parsed.success || typeof callback !== "function" || !receiver) {
      protocolError();
      return;
    }
    try {
      const result = receiver.notice(parsed.data, active);
      replyBeforeRecovery({
        result,
        active,
        reply: (value) => callback(value),
      });
    } catch {
      if (active()) protocolError();
    }
  });
};

/** Socket.IO callback завершается синхронно до owned recovery, повторно сверяя lifetime после callback. */
const replyBeforeRecovery = ({
  result,
  active,
  reply,
}: Readonly<{
  result: DeliveryResult | NoticeResult | null;
  active: () => boolean;
  reply: (value: unknown) => void;
}>) => {
  if (!result || !active() || result.current?.() === false) return;
  reply("reply" in result ? result.reply : result.receipt);
  if (active() && result.current?.() !== false) result.afterReply?.();
};
