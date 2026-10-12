import { MongoClient } from "mongodb";
/** Подключает Mongo и проверяет ping; при неудачном старте закрывает собственный клиент перед передачей ошибки. */
export const connectDatabase = async ({
  config,
}: {
  readonly config: {
    readonly url: string;
    readonly database: string;
    readonly timeoutMs: number;
    readonly poolSize: number;
  };
}) => {
  const client = new MongoClient(config.url, {
    serverSelectionTimeoutMS: config.timeoutMs,
    connectTimeoutMS: config.timeoutMs,
    socketTimeoutMS: config.timeoutMs,
    maxPoolSize: config.poolSize,
  });
  try {
    await client.connect();
    const apiDb = client.db(config.database);
    await apiDb.command({ ping: 1 });
    return {
      apiDb,
      /** Открывает Mongo session; получивший её transaction owner обязан вызвать endSession. */
      startSession: () => client.startSession(),
      /** Освобождает Mongo-клиент и его пул после settlement потребителей. */
      close: () => client.close(),
    };
  } catch (error) {
    await client.close();
    throw new Error("API database unavailable", {
      cause: error,
    });
  }
};
