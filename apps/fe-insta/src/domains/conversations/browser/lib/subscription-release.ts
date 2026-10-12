import type { HistorySubscription } from "../types";
/** Делит один cleanup barrier между cache eviction и завершением читающего snapshot; provider release вызывается один раз. */
export const ownSubscriptionRelease = (
  release: HistorySubscription,
): HistorySubscription => {
  const completion = Promise.withResolvers<void>();
  let started = false;
  const owned = () => {
    if (started) return completion.promise;
    started = true;
    try {
      Promise.resolve(release()).then(completion.resolve, completion.reject);
    } catch (error) {
      completion.reject(error);
    }
    return completion.promise;
  };
  return Object.assign(owned, { activate: release.activate });
};
