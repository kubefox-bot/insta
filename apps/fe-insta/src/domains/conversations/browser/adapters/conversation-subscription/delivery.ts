import {
  RealtimeErrorCode,
  realtimeEventTypes,
} from "@insta/contracts/realtime";
import {
  type ApplyOutcome,
  applyDelivery,
  type DeliveryReceiver,
  type EventHandlers,
} from "../../../../../lib/realtime/index";
import type { DeliveryDependencies } from "./types";
/** Сопоставляет validated business deliveries с retained history; transport остаётся domain-neutral. */
export class ConversationDelivery {
  /** Заимствует registry и typed receipt owner, не владея их lifecycle. */
  constructor(private readonly dependencies: DeliveryDependencies) {}
  readonly handlers: EventHandlers = {
    [realtimeEventTypes.messageCreated]: async ({ data }) => {
      const entry = this.dependencies.entries.get(data.message.conversationId);
      if (!this.dependencies.owned() || !entry?.receivers.size) return "stale";
      for (const receive of entry.receivers) receive(data.message);
      return "applied";
    },
    [realtimeEventTypes.unreadChanged]: async () => "stale" as const,
    [realtimeEventTypes.messageReceiptsUpdated]: async ({ data }) => {
      const { entries, owned, store, actor, claim } = this.dependencies;
      const entry = entries.get(data.conversationId);
      if (!owned() || !entry?.receivers.size) return "stale";
      const result = store.receiveReceipts(data, actor);
      if (result.kind !== "resync-required") return result.kind;
      const afterReply = claim(data.conversationId, entry);
      return { kind: "retry-later", ...(afterReply ? { afterReply } : {}) };
    },
  };
  /** Notice относится только к текущей identity; duplicate не получает второго recovery. */
  readonly notice: DeliveryReceiver["notice"] = (value, active) => {
    const { entries, claim, report } = this.dependencies;
    const found = [...entries].find(([, entry]) => entry.lifecycle.owns(value));
    if (!found || !active()) return null;
    const [id, entry] = found;
    const guard = entry.lifecycle.guard();
    const current = () => active() && guard() && entries.get(id) === entry;
    const afterReply =
      value.code === RealtimeErrorCode.ResyncRequired
        ? claim(id, entry)
        : undefined;
    if (
      value.code === RealtimeErrorCode.DeliveryBlocked &&
      entry.issue !== value.code
    )
      report(id, entry, value.code);
    return { receipt: value, current, ...(afterReply ? { afterReply } : {}) };
  };
  /** ACK выдаётся после actual apply и проверки actor/attempt/token; blocked cursor не движется. */
  readonly receive: DeliveryReceiver["receive"] = async (unit, active) => {
    if (
      unit.kind !== "single" ||
      unit.event.type === realtimeEventTypes.unreadChanged ||
      unit.event.type === realtimeEventTypes.storiesChanged
    )
      return null;
    const event = unit.event;
    const id =
      event.type === realtimeEventTypes.messageCreated
        ? event.data.message.conversationId
        : event.data.conversationId;
    const { entries } = this.dependencies;
    const entry = entries.get(id);
    if (!entry?.lifecycle.owns(event.delivery)) return null;
    const guard = entry.lifecycle.guard();
    const current = () => active() && guard() && entries.get(id) === entry;
    if (!entry.lifecycle.ready() || entry.issue)
      return {
        reply: { kind: "retry-later", position: event.delivery },
        current,
      };
    const result = await applyDelivery(
      {
        event,
        currentActor: current,
        apply: async (): Promise<ApplyOutcome> =>
          event.type === realtimeEventTypes.messageCreated
            ? this.handlers[realtimeEventTypes.messageCreated](event)
            : this.handlers[realtimeEventTypes.messageReceiptsUpdated](event),
      },
      entry.lifecycle.cursor,
    );
    return result ? { ...result, current } : null;
  };
}
