import type { DeliveryPosition } from "@insta/contracts/realtime";
import type { DeliveryLease, StoredDelivery } from "../../ports/delivery/types";
import { deliveryRecoveryPolicy } from "./conts";
import type { DeliveryDependencies } from "./types";

/** Проверяет последовательную страницу до зафиксированного H и сохраняет неизменённые payload/coordinates. */
const appendPage = async (
  {
    events,
    after,
    head,
    lease,
    signal,
  }: Readonly<{
    events: readonly StoredDelivery[];
    after: DeliveryPosition;
    head: DeliveryPosition;
    lease: DeliveryLease;
    signal?: AbortSignal;
  }>,
  ports: DeliveryDependencies,
) => {
  let position = after;
  let expiresAt = 0;
  const cancellation = signal ? { signal } : {};
  for (const event of events) {
    if (
      event.cursor !== position.cursor + 1 ||
      event.cursor > head.cursor ||
      event.epoch !== head.epoch ||
      event.streamId !== head.streamId
    )
      throw new Error("Invalid restore range");
    const payload = await ports.journal.materialize({ event, ...cancellation });
    const appended = await ports.streams.append({
      lease,
      event: { ...event, payload },
      ...cancellation,
    });
    if (appended === "gap") throw new Error("Unexpected stream append gap");
    position = {
      streamId: event.streamId,
      epoch: event.epoch,
      cursor: event.cursor,
    };
    expiresAt = event.expiresAt;
  }
  return { position, expiresAt };
};
/** Наполняет диапазон ограниченными страницами; gap/expiry остаются явным resync и не публикуют ready. */
export const restoreRows = async (
  {
    after,
    head,
    lease,
    signal,
  }: Readonly<{
    after: DeliveryPosition;
    head: DeliveryPosition;
    lease: DeliveryLease;
    signal?: AbortSignal;
  }>,
  ports: DeliveryDependencies,
) => {
  let position = after;
  let expiresAt = 0;
  const cancellation = signal ? { signal } : {};
  if (position.cursor > head.cursor)
    throw new Error("Stream tail exceeds canonical head");
  while (position.cursor < head.cursor) {
    signal?.throwIfAborted();
    const page = await ports.journal.read({
      after: position,
      limit: Math.min(
        deliveryRecoveryPolicy.pageSize,
        head.cursor - position.cursor,
      ),
      nowMs: ports.clock(),
      ...cancellation,
    });
    if (page.kind === "resync-required") return page;
    if (!page.events.length) throw new Error("Incomplete journal restore page");
    const appended = await appendPage(
      { events: page.events, after: position, head, lease, ...cancellation },
      ports,
    );
    position = appended.position;
    expiresAt = appended.expiresAt;
  }
  return { kind: "restored" as const, expiresAt };
};
