import type { HistorySubscription, Message, SyncDependencies } from "../types";
import { ownSubscriptionRelease } from "./subscription-release";
/** Передаёт provisional slot cache owner до prepare ACK; поздний результат использует тот же cleanup barrier. */
export const acquireHistorySubscription = async ({
  id,
  receive,
  subscribe,
  active,
  retain,
}: Readonly<{
  id: string;
  receive: (message: Message) => void;
  subscribe: SyncDependencies["subscribe"];
  active: () => boolean;
  retain: (id: string, release: HistorySubscription) => void;
}>): Promise<HistorySubscription> => {
  let reserved: HistorySubscription | undefined;
  const onReserved = (release: HistorySubscription) => {
    if (!active()) throw new Error("Stale history subscription");
    reserved = ownSubscriptionRelease(release);
    retain(id, reserved);
  };
  const result = await subscribe(id, receive, { onReserved });
  const release = reserved ?? ownSubscriptionRelease(result);
  if (!active()) {
    await release();
    throw new Error("Stale history subscription");
  }
  if (!reserved) retain(id, release);
  return release;
};
