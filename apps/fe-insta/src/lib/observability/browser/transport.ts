import { intakePolicy } from "../client/conts";
/**
 * Создаёт владеющий запросами sender для снимка revision/policyVersion. Разрешение
 * проверяется внешним lifecycle и intake; stop запрещает новые отправки, отменяет
 * активные и ждёт их settlement.
 */
export const createBrowserSender = ({
  endpoint,
  revision,
  policyVersion,
}: Readonly<{ endpoint: string; revision: number; policyVersion: number }>) => {
  const controllers = new Set<AbortController>();
  const pending = new Set<Promise<void>>();
  let stopped = false;
  /**
   * Отправляет JSON с cookie и версией consent, учитывает Promise и abort deadline. HTTP
   * status не подтверждается, ошибки доставки подавляются; response body отменяется,
   * timer и controller освобождаются в finally. После stop возвращает уже завершённый
   * Promise.
   */
  const send = (payload: Readonly<Record<string, unknown>>) => {
    if (stopped) return Promise.resolve();
    const controller = new AbortController();
    controllers.add(controller);
    const deadline = setTimeout(
      () => controller.abort(),
      intakePolicy.requestTimeoutMs,
    );
    const operation = (async () => {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          signal: controller.signal,
          body: JSON.stringify({ ...payload, revision, policyVersion }),
        });
        await response.body?.cancel();
      } catch {
        /* Optional delivery is best effort; caller UI behavior is independent. */
      } finally {
        clearTimeout(deadline);
        controllers.delete(controller);
      }
    })();
    pending.add(operation);
    operation.then(
      () => pending.delete(operation),
      () => pending.delete(operation),
    );
    return operation;
  };
  return {
    send,
    /**
     * Необратимо останавливает sender, посылает abort всем его запросам и дожидается
     * settlement текущих Promise; сигнал отмены не считается завершением сам по себе.
     */
    stop: async () => {
      stopped = true;
      for (const controller of controllers) controller.abort();
      await Promise.allSettled([...pending]);
    },
  };
};
