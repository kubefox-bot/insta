import type { RedisClient } from "bun";
import type { AuthDependencies } from "../../../domains/users/index";
import {
  createBunHasher,
  createDragonflyAuthLimits,
  createDragonflyChallenges,
  createDragonflyWsTickets,
  createJoseTokens,
  createMongoAuthPersistence,
  createMongoRegistrationPersistence,
  createMongoSessions,
  createRegistrationCrypto,
  createSessionId,
  ensureUsersIndexes,
} from "../../../domains/users/server/index";
import type { connectDatabase } from "../../../lib/database/index";
import { readAnalyticsReference } from "../../../lib/observability/analytics/index";
/** Создаёт индексы users и связывает auth/registration порты с Mongo, Dragonfly, Bun password и JOSE адаптерами. */
export const createUsersDependencies = async ({
  database,
  broker,
  limitKey,
  signingKey,
  replayKey,
}: Readonly<{
  database: Awaited<ReturnType<typeof connectDatabase>>;
  broker: RedisClient;
  limitKey: string;
  signingKey: string;
  replayKey: string;
}>) => {
  await ensureUsersIndexes(database.apiDb);
  const passwords = createBunHasher();
  const auth: AuthDependencies = {
    sessions: createMongoSessions({
      ...database,
      clock: Date.now,
      analyticsReference: readAnalyticsReference,
    }),
    tokens: createJoseTokens({ signingKey, replayKey }),
    passwords,
    clock: Date.now,
    sessionId: createSessionId,
    /** Создаёт независимый идентификатор auth-операции на границе композиции. */
    operationId: () => crypto.randomUUID(),
  };
  const persistence = createMongoAuthPersistence({
    ...database,
    clock: Date.now,
    analyticsReference: readAnalyticsReference,
  });
  const registration = {
    auth,
    persistence,
    challenges: createDragonflyChallenges({ client: broker }),
    crypto: createRegistrationCrypto(signingKey),
    registration: createMongoRegistrationPersistence({
      ...database,
      clock: Date.now,
    }),
  };
  return {
    auth,
    registration,
    tickets: createDragonflyWsTickets({ client: broker }),
    persistence,
    passwords,
    limits: createDragonflyAuthLimits({ client: broker, key: limitKey }),
  };
};
