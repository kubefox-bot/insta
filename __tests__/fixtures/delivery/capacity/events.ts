import type { DeliveryJournal } from "../../../../apps/be-insta/src/domains/conversations/ports/delivery/interfaces";
import type {
  DeliveryStream,
  MaterializedDelivery,
} from "../../../../apps/be-insta/src/domains/conversations/ports/delivery/types";
export const capacityEpoch = "00000000-0000-4000-8000-000000000001";
export const capacityDayMs = 86400000;
export const capacityStreams = {
  fanout: [
    { kind: "conversation", id: "capacity" },
    { kind: "unread", id: "alice" },
    { kind: "unread", id: "bob" },
  ],
  conversation: [{ kind: "conversation", id: "capacity" }],
} as const;
export const capacityEvent = ({
  stream,
  cursor,
  count,
  nowMs,
}: Readonly<{
  stream: DeliveryStream;
  cursor: number;
  count: number;
  nowMs: number;
}>): MaterializedDelivery => {
  const eventId = `00000000-0000-4000-8000-${String(cursor).padStart(12, "0")}`;
  const recordedAt =
    nowMs - capacityDayMs + Math.ceil((cursor * capacityDayMs) / count);
  const common = {
    version: 1 as const,
    kind: "event" as const,
    eventId,
    occurredAt: new Date(recordedAt).toISOString(),
    meta: { requestId: eventId },
  };
  const payload =
    stream.kind === "conversation"
      ? {
          ...common,
          type: "messages.created" as const,
          data: {
            message: {
              id: String(cursor),
              conversationId: "capacity",
              authorId: "alice",
              text: String(cursor).padStart(16, "0") + "x".repeat(1008),
              sequence: cursor,
              createdAt: new Date(recordedAt).toISOString(),
            },
          },
        }
      : {
          ...common,
          type: "conversations.unread.changed" as const,
          data: { conversationId: "capacity" },
        };
  return {
    streamId: `${stream.kind}:${stream.id}`,
    epoch: capacityEpoch,
    cursor,
    eventId,
    eventType: payload.type,
    source: { kind: "message", eventId },
    createdAt: recordedAt,
    recordedAt,
    expiresAt: recordedAt + capacityDayMs,
    payload,
  };
};
export const capacityJournal = ({
  stream,
  count,
  nowMs,
}: Readonly<{
  stream: DeliveryStream;
  count: number;
  nowMs: number;
}>): DeliveryJournal => {
  const head = {
    streamId: `${stream.kind}:${stream.id}`,
    epoch: capacityEpoch,
    cursor: count,
  };
  return {
    head: async () => head,
    range: async () => ({ kind: "range", after: { ...head, cursor: 0 }, head }),
    prune: async () => ({ removed: 0 }),
    forSource: async () => {
      throw new Error("Capacity restore does not claim sources");
    },
    materialize: async ({ event }) =>
      capacityEvent({ stream, cursor: event.cursor, count, nowMs }).payload,
    read: async ({ after, limit }) => ({
      kind: "page",
      head,
      events: Array.from(
        { length: Math.min(limit, count - after.cursor) },
        (_, offset) =>
          capacityEvent({
            stream,
            cursor: after.cursor + offset + 1,
            count,
            nowMs,
          }),
      ),
    }),
  };
};
