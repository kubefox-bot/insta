import {
  ackSchema,
  deliveryReplySchema,
  deliveryUnitSchema,
} from "@insta/contracts/realtime";
import {
  socketAcknowledgementPacket,
  socketAcknowledgementPayload,
  socketDeliveryPacket,
} from "./conts";

/** Проверяет настоящий delivery frame перед внесением тестового fault. */
export const readBusinessDelivery = (frame: string | Uint8Array) => {
  if (typeof frame !== "string") return;
  const match = socketDeliveryPacket.exec(frame);
  if (!match?.[1] || !match[2]) return;
  const packet: unknown = JSON.parse(match[2]);
  if (!Array.isArray(packet) || packet[0] !== "event") return;
  const unit = deliveryUnitSchema.parse(packet[1]);
  return {
    acknowledgementId: match[1],
    events: unit.kind === "single" ? [unit.event] : unit.events,
  };
};
/** Выделяет сообщения из проверенного business frame. */
export const readMessageDelivery = (frame: string | Uint8Array) => {
  const delivery = readBusinessDelivery(frame);
  const event = delivery?.events[0];
  if (!delivery || event?.type !== "messages.created") return;
  return {
    acknowledgementId: delivery.acknowledgementId,
    eventId: event.eventId,
    message: event.data.message,
  };
};
/** Возвращает callback id только для Socket.IO acknowledgement packet. */
export const readAcknowledgementId = (frame: string | Uint8Array) =>
  typeof frame === "string"
    ? socketAcknowledgementPacket.exec(frame)?.[1]
    : undefined;

/** Извлекает payload callback, не принимая произвольный frame за ACK. */
const readAcknowledgementPayload = (frame: string | Uint8Array): unknown => {
  if (typeof frame !== "string") return;
  const payload = socketAcknowledgementPayload.exec(frame)?.[1];
  if (!payload) return;
  const packet: unknown = JSON.parse(payload);
  return Array.isArray(packet) ? packet[0] : undefined;
};
/** Отделяет delivery replies от ACK команд при наблюдении реального соединения. */
export const readDeliveryReply = (frame: string | Uint8Array) => {
  const result = deliveryReplySchema.safeParse(
    readAcknowledgementPayload(frame),
  );
  return result.success ? result.data : undefined;
};
/** Проверяет server command ACK для безопасной диагностики только кода результата. */
export const readCommandOutcome = (frame: string | Uint8Array) => {
  const result = ackSchema.safeParse(readAcknowledgementPayload(frame));
  if (!result.success) return;
  return result.data.ok ? "OK" : result.data.error.code;
};
