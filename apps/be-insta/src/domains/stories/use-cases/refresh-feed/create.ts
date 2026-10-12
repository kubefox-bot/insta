import type {
  PublicationFeedIdentity,
  PublicationFeedRefresh,
} from "../../ports/feed/types";
import { publicationFeedPolicy } from "./conts";
import { createConfirmedFeedRefreshes } from "./lib/confirmed";
import { createFeedRefreshQueue } from "./lib/queue";
import type { PublicationFeedDependencies } from "./types";

/**
 * Ограничивает ожидание немедленной инвалидации и владеет очередью provider Promise до
 * settlement. Ошибка, deadline и заполненная очередь дают deferred: durable outbox
 * остаётся pending для maintenance. Разные commit требуют последовательных SET.
 */
export const createPublicationFeedRefresh = (
  dependencies: PublicationFeedDependencies,
) => {
  const confirmed = createConfirmedFeedRefreshes(
    dependencies.clock ?? Date.now,
  );
  const queue = createFeedRefreshQueue({
    invalidate: dependencies.invalidate,
    confirmed,
  });
  const after =
    dependencies.after ??
    ((callback, timeoutMs) => {
      const timer = setTimeout(callback, timeoutMs);
      return () => clearTimeout(timer);
    });
  /** Возвращает recovery outcome даже при отказе диагностического sink. */
  const reportDeferred = (): PublicationFeedRefresh => {
    try {
      dependencies.onDeferred();
    } catch {
      // Диагностика необязательна для durable recovery и не меняет исход commit.
      return "deferred";
    }
    return "deferred";
  };
  return {
    /**
     * Ждёт новую инвалидацию до deadline; deferred диагностируется без исходной ошибки
     * провайдера. Успешный commit не отменяется, outbox здесь не подтверждается.
     */
    refresh: async (
      input: PublicationFeedIdentity,
    ): Promise<PublicationFeedRefresh> => {
      const operation = queue.enqueue(
        JSON.stringify([input.actorId, input.operationId]),
      );
      if (!operation) return reportDeferred();
      const deadline = Promise.withResolvers<PublicationFeedRefresh>();
      const cancelDeadline = after(
        () => deadline.resolve("deferred"),
        publicationFeedPolicy.timeoutMs,
      );
      try {
        const result = await Promise.race([operation, deadline.promise]);
        return result === "deferred" ? reportDeferred() : result;
      } finally {
        cancelDeadline();
      }
    },
    /**
     * Прекращает новые SET и ждёт фактический settlement owned очереди до
     * освобождения заимствованного клиента внешним lifecycle.
     */
    close: queue.close,
  };
};
