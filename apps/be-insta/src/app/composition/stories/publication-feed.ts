import type { RedisClient } from "bun";
import { createPublicationFeedRefresh } from "../../../domains/stories/index";
import { createFeedInvalidation } from "../../../domains/stories/server/index";
import { publicationFeedDiagnostic } from "./conts";

/** Связывает ограниченную инвалидацию с Redis и безопасной operational диагностикой. */
export const createPublicationFeed = (broker: RedisClient) => {
  const invalidate = createFeedInvalidation(broker);
  const deferred = () => {
    process.stderr.write(`${publicationFeedDiagnostic}\n`);
  };
  return {
    ...createPublicationFeedRefresh({
      invalidate,
      /** Сообщает безопасным кодом о deferred эффекте; повтор обеспечит durable outbox. */
      onDeferred: () => {
        process.stderr.write(`${publicationFeedDiagnostic}\n`);
      },
    }),
    invalidate,
    delivery: (dispatch: (signal: AbortSignal) => Promise<void>) => ({
      dispatch: (signal?: AbortSignal) =>
        dispatch(signal ?? new AbortController().signal),
      deferred,
    }),
  };
};
