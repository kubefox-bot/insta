import type { RedisClient } from "bun";
import { directoryPolicy, findPublicUser } from "../../../domains/users/index";
import { createMongoReadUsers } from "../../../domains/users/server/index";
import type { connectDatabase } from "../../../lib/database/index";
import { createActorQuota } from "../../../lib/dragonfly/index";
/** Связывает directory read-model с его квотой и предоставляет узкий публичный поиск пользователя для других capabilities. */
export const createDirectoryDependencies = ({
  database,
  broker,
  key,
}: Readonly<{
  database: Awaited<ReturnType<typeof connectDatabase>>;
  broker: RedisClient;
  key: string;
}>) => {
  const users = createMongoReadUsers(database.apiDb);
  return {
    directory: {
      users,
      quota: createActorQuota({
        client: broker,
        key,
        namespace: "directory",
        maximum: directoryPolicy.requestsPerMinute,
      }),
    },
    /** Читает публичного пользователя через directory use case, не раскрывая другим capabilities Mongo-коллекцию. */
    findPublicUser: (input: Parameters<typeof findPublicUser>[0]) =>
      findPublicUser(input, { users }),
  };
};
