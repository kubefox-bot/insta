import {
  realtimeEventTypes,
  realtimeKinds,
  realtimeProtocolVersion,
} from "@insta/contracts/realtime";
import type { StoredDelivery } from "../../../../ports/delivery/types";
/** Проверяет связь journal/source и возвращает стабильный wire-конверт без новой transport-позиции. */
export const replayEnvelope = ({
  event,
  source,
  operationId,
}: Readonly<{
  event: StoredDelivery;
  source: { eventId: string; conversationId: string; createdAt: number };
  operationId: string;
}>) => {
  if (
    event.eventId !== event.source.eventId ||
    event.eventId !== source.eventId ||
    event.createdAt !== source.createdAt ||
    (event.eventType !== realtimeEventTypes.unreadChanged &&
      event.streamId !== `conversation:${source.conversationId}`)
  )
    throw new Error("Invalid delivery source identity");
  return {
    version: realtimeProtocolVersion,
    kind: realtimeKinds.event,
    eventId: event.eventId,
    occurredAt: new Date(event.createdAt).toISOString(),
    meta: { requestId: event.eventId, operationId },
  };
};
