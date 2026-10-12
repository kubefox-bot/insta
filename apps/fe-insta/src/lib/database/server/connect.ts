import { MongoClient } from "mongodb";
/**
 * Создаёт Mongo client для BFF и проверяет доступность ping перед передачей владельцу.
 * Abort действует во время приобретения; при успехе вызывающий код обязан дождаться close
 * при shutdown.
 */
export const connectDatabase = async ({
  config,
  signal,
}: {
  readonly signal?: AbortSignal;
  readonly config: {
    readonly url: string;
    readonly database: string;
    readonly timeoutMs: number;
    readonly poolSize: number;
  };
}) => {
  signal?.throwIfAborted();
  const client = new MongoClient(config.url, {
    serverSelectionTimeoutMS: config.timeoutMs,
    connectTimeoutMS: config.timeoutMs,
    socketTimeoutMS: config.timeoutMs,
    maxPoolSize: config.poolSize,
  });
  const acquisition: { closing?: Promise<void> } = {};
  /**
   * Начинает закрытие приобретаемого Mongo client при отмене. Сохраняет Promise, чтобы
   * ветка ошибки подключения могла дождаться его результата.
   */
  const abort = () => {
    acquisition.closing = client.close();
    // The acquisition catch owns the original close promise and its failure.
    acquisition.closing.catch(() => undefined);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await client.connect();
    signal?.throwIfAborted();
    const webDb = client.db(config.database);
    await webDb.command({ ping: 1 });
    return {
      webDb,
      /**
       * Закрывает принадлежащий BFF Mongo client; возвращённый Promise должен дождаться
       * владелец runtime.
       */
      close: () => client.close(),
    };
  } catch (error) {
    await (acquisition.closing ?? client.close());
    throw new Error("Web database unavailable", {
      cause: error,
    });
  } finally {
    signal?.removeEventListener("abort", abort);
  }
};
