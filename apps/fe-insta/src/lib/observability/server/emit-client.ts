import type { ClientEvent, ClientObservation } from "../client/types";
/**
 * Публикует неповторяющиеся события в порядке партии с authority client_observed. Claim
 * делается до emit; исключение прерывает партию и не откатывает ни claim, ни предыдущие
 * публикации.
 */
export const emitAcceptedClientEvents = ({
  events,
  duplicate,
  emit,
}: Readonly<{
  events: readonly ClientEvent[];
  duplicate: (id: string) => boolean;
  emit: (event: ClientObservation) => void;
}>) => {
  for (const event of events)
    if (!duplicate(event.analyticsEventId))
      emit({ ...event, authority: "client_observed" });
};
