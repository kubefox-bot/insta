import type { RedisClient } from "bun";
import { readGeneration } from "../../../../lib/dragonfly/index";
// The lifecycle owner invalidates an unresponsive connection; no command is replayed.
/** Проверяет generation Dragonfly; при таймауте закрывает клиент, возвращает неготовность и всегда очищает таймер. */
export const checkBrokerReadiness = async (
  client: RedisClient,
  timeoutMs: number,
) => {
  const deadline = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => {
    client.close();
    deadline.resolve(false);
  }, timeoutMs);
  try {
    return await Promise.race([
      readGeneration(client).then(
        () => true,
        () => false,
      ),
      deadline.promise,
    ]);
  } finally {
    clearTimeout(timer);
  }
};
