import type { ConversationActor } from "../../../domains/conversations/browser/index";
import type { DeliveryReceiver } from "../../../lib/realtime/index";
import type { RealtimeBorrower } from "./types";
/** Соединяет публичные receivers текущего actor, не перенося их политики в общий transport. */
export const createBorrowedDelivery = ({
  listeners,
  owned,
}: Readonly<{
  listeners: ReadonlySet<RealtimeBorrower>;
  owned: (actor: ConversationActor) => boolean;
}>): DeliveryReceiver => ({
  receive: async (unit, active) => {
    for (const listener of listeners) {
      if (!owned(listener.actor) || !listener.delivery) continue;
      const result = await listener.delivery.receive(unit, active);
      if (result) return result;
    }
    return null;
  },
  notice: (notice, active) => {
    for (const listener of listeners) {
      if (!owned(listener.actor) || !listener.delivery) continue;
      const result = listener.delivery.notice(notice, active);
      if (result) return result;
    }
    return null;
  },
});
