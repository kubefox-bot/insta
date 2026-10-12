import type { DeliveryAck } from "@insta/contracts/realtime";
import type { Event } from "../types";
import type { DeliveryCursorStore } from "./state";
import type { ApplyOutcome, DeliveryResult } from "./types";
/** Применяет непрочитанный суффикс строго один раз, подтверждая дубликаты новым token. */
export const applyUnreadBatch = (
  {
    events,
    currentActor,
    apply,
  }: Readonly<{
    events: readonly Event[];
    currentActor: () => boolean;
    apply: (events: readonly Event[]) => Promise<ApplyOutcome>;
  }>,
  state: DeliveryCursorStore,
): Promise<DeliveryResult | null> => {
  const owned = state.guard();
  const active = () => owned() && currentActor();
  return state.ordered(async () => {
    const last = events.at(-1);
    if (
      !last ||
      !active() ||
      !events.every(({ delivery }) => state.owns(delivery))
    )
      return null;
    const cursor = state.position()?.cursor;
    if (cursor === undefined) return null;
    const remaining = events.filter(({ delivery }) => delivery.cursor > cursor);
    if (!remaining.length)
      return { reply: { kind: "applied", position: last.delivery } };
    if (remaining[0]?.delivery.cursor !== cursor + 1)
      return { reply: { kind: "apply-failed", position: last.delivery } };
    return settleApply({
      apply: () => apply(remaining),
      active,
      position: last.delivery,
      state,
    });
  });
};
/** Преобразует внутренний исход в wire reply без подтверждения неприменённого состояния. */
const complete = ({
  result,
  position,
  state,
}: Readonly<{
  result: ApplyOutcome;
  position: DeliveryAck;
  state: DeliveryCursorStore;
}>): DeliveryResult | null => {
  if (result === "stale") return null;
  if (result === "applied") {
    state.commit(position);
    return { reply: { kind: "applied", position } };
  }
  if (result.kind === "apply-failed")
    return { reply: { kind: "apply-failed", position } };
  return {
    reply: {
      kind: "retry-later",
      position,
      ...(result.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: result.retryAfterMs }),
    },
    ...(result.afterReply ? { afterReply: result.afterReply } : {}),
  };
};
/** Использует ту же очередь и cursor для одиночного сообщения либо receipt. */
export const applyDelivery = (
  {
    event,
    currentActor,
    apply,
  }: Readonly<{
    event: Event;
    currentActor: () => boolean;
    apply: () => Promise<ApplyOutcome>;
  }>,
  state: DeliveryCursorStore,
) => applyUnreadBatch({ events: [event], currentActor, apply }, state);

/** Ошибка handler не подтверждает cursor, а утративший lifetime результат не получает reply. */
const settleApply = async ({
  apply,
  active,
  position,
  state,
}: Readonly<{
  apply: () => Promise<ApplyOutcome>;
  active: () => boolean;
  position: DeliveryAck;
  state: DeliveryCursorStore;
}>): Promise<DeliveryResult | null> => {
  try {
    const result = await apply();
    return active() ? complete({ result, position, state }) : null;
  } catch {
    return active() ? { reply: { kind: "apply-failed", position } } : null;
  }
};
