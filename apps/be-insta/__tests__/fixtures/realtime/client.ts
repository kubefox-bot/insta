import {
  ackSchema,
  deliveryUnitSchema,
  preparedSubscriptionSchema,
} from "@insta/contracts/realtime";
import type { Socket } from "socket.io-client";
/** Отправляет typed fixture command; SDK retry выключен, операция остаётся у вызывающего test owner. */
export const realtimeCommand = async (
  socket: Socket,
  type: string,
  data: unknown,
) =>
  ackSchema.parse(
    await socket.timeout(10000).emitWithAck("command", {
      version: 1,
      kind: "command",
      type,
      data,
      meta: { requestId: crypto.randomUUID() },
    }),
  );
/** Активирует ровно выданный token/baseline после принадлежащего тесту snapshot шага. */
export const activatePrepared = async (
  socket: Socket,
  ack: ReturnType<typeof ackSchema.parse>,
) => {
  if (!ack.ok || !("subscriptionId" in ack.data)) return;
  const prepared = preparedSubscriptionSchema.parse({
    subscriptionId: ack.data.subscriptionId,
    baseline: ack.data.baseline,
  });
  const activated = await realtimeCommand(
    socket,
    "conversations.activate",
    prepared,
  );
  if (!activated.ok) throw new Error(activated.error.code);
};
/** Применяет всю проверенную единицу прежде callback; fixture получает бизнес events, ACK остаётся per-subscription. */
export const receiveDelivery = (
  payload: unknown,
  callback: unknown,
  receive: (
    event: import("zod").infer<
      typeof import("@insta/contracts/realtime").eventSchema
    >,
  ) => void,
) => {
  const unit = deliveryUnitSchema.parse(payload);
  const events = unit.kind === "single" ? [unit.event] : unit.events;
  for (const event of events) receive(event);
  const last = events.at(-1);
  if (last && typeof callback === "function")
    callback({ kind: "applied", position: last.delivery });
};
