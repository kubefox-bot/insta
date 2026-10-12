import { realtimeEventTypes } from "@insta/contracts/realtime";
import type { ConversationActor } from "../../../domains/conversations/browser/index";
import type { EventHandlers } from "../../../lib/realtime/index";
import type { RealtimeBorrower } from "./types";

/**
 * Собирает маршрутизацию событий общего соединения по живому набору borrowers; каждый
 * dispatch проверяет принадлежность listener текущему actor.
 */
export const createBorrowedHandlers = ({
  listeners,
  owned,
}: Readonly<{
  listeners: ReadonlySet<RealtimeBorrower>;
  owned: (actor: ConversationActor) => boolean;
}>): EventHandlers => ({
  /**
   * Доставляет новое сообщение только listeners текущего actor.
   */
  [realtimeEventTypes.messageCreated]: async (event) => {
    for (const listener of listeners) {
      if (!owned(listener.actor)) continue;
      const outcome = await listener.handlers[event.type](event);
      if (outcome !== "stale") return outcome;
    }
    return "stale";
  },
  /**
   * Передаёт обновление receipts только listeners текущего actor.
   */
  [realtimeEventTypes.messageReceiptsUpdated]: async (event) => {
    for (const listener of listeners) {
      if (!owned(listener.actor)) continue;
      const outcome = await listener.handlers[event.type](event);
      if (outcome !== "stale") return outcome;
    }
    return "stale";
  },
  /**
   * Передаёт изменение unread только listeners текущего actor.
   */
  [realtimeEventTypes.unreadChanged]: async (event) => {
    for (const listener of listeners) {
      if (!owned(listener.actor)) continue;
      const outcome = await listener.handlers[event.type](event);
      if (outcome !== "stale") return outcome;
    }
    return "stale";
  },
});
