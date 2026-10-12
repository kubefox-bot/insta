import type { DeliveryJournal } from "../../../apps/be-insta/src/domains/conversations/ports/delivery/interfaces";
import type { MaterializedDelivery } from "../../../apps/be-insta/src/domains/conversations/ports/delivery/types";
export const retainedJournal = (
  events: readonly MaterializedDelivery[],
): DeliveryJournal => {
  const first = events[0];
  const last = events.at(-1);
  if (!first || !last) throw new Error("Fixture requires rows");
  const head = {
    streamId: last.streamId,
    epoch: last.epoch,
    cursor: last.cursor,
  };
  return {
    head: async () => head,
    range: async () => ({
      kind: "range",
      after: { ...head, cursor: first.cursor - 1 },
      head,
    }),
    prune: async () => ({ removed: 0 }),
    forSource: async ({ source, nowMs }) => {
      const rows = events.filter(
        (event) =>
          event.source.eventId === source.eventId &&
          event.source.kind === source.kind &&
          event.expiresAt > nowMs,
      );
      return rows.length
        ? { kind: "active", events: rows }
        : { kind: "expired" };
    },
    materialize: async ({ event }) => {
      const found = events.find((row) => row.cursor === event.cursor);
      if (!found) throw new Error("Missing fixture row");
      return found.payload;
    },
    read: async ({ after, limit }) => ({
      kind: "page",
      head,
      events: events.filter((row) => row.cursor > after.cursor).slice(0, limit),
    }),
  };
};
