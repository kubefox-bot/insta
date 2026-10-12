import type {
  DeliveryInFlight,
  DeliverySendPorts,
} from "../../ports/delivery/types";
/** Повторно проверяет membership каждого invalidation в bounded unread batch до отправки; provider errors не маскирует. */
export const authorizeUnreadAttempt = async (
  subscription: DeliveryInFlight,
  signal: AbortSignal,
  ports: DeliverySendPorts,
) => {
  if (subscription.target.kind !== "unread") return true;
  const unit = subscription.attempt.unit;
  const events = unit.kind === "single" ? [unit.event] : unit.events;
  const conversations = new Set(
    events.map((event) => {
      if (event.type !== "conversations.unread.changed")
        throw new Error("Unexpected unread delivery payload");
      return event.data.conversationId;
    }),
  );
  for (const conversationId of conversations) {
    const permitted = await ports.membership.permits({
      actorId: subscription.actor.userId,
      conversationId,
      signal,
    });
    signal.throwIfAborted();
    if (!permitted) return false;
  }
  return true;
};
