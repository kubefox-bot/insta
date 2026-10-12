import { eventSchema, realtimeEventTypes } from "@insta/contracts/realtime";
import type { EventHandlers, RealtimeObservation } from "./types";
/**
 * Проверяет входящий wire event и передаёт его обработчику соответствующего варианта.
 * Невалидный payload отмечается как invalid;
 * handled записывается после обработчика, чьи исключения не перехватываются.
 */
export const dispatchEvent = async ({
  payload,
  handlers,
  observe,
}: Readonly<{
  payload: unknown;
  handlers: EventHandlers;
  observe: (value: RealtimeObservation) => void;
}>) => {
  const result = eventSchema.safeParse(payload, { jitless: true });
  if (!result.success) {
    observe({ kind: "invalid" });
    return "invalid" as const;
  }
  const event = result.data;
  const apply = async () => {
    switch (event.type) {
      case realtimeEventTypes.storiesChanged:
        return "stale" as const;
      case realtimeEventTypes.messageCreated:
        return await handlers[event.type](event);
      case realtimeEventTypes.messageReceiptsUpdated:
        return await handlers[event.type](event);
      case realtimeEventTypes.unreadChanged:
        return await handlers[event.type](event);
      default:
        return event satisfies never;
    }
  };
  const outcome = await apply();
  if (outcome === "applied")
    observe({ kind: "handled", type: event.type, eventId: event.eventId });
  return outcome;
};
