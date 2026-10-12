import {
  createDatabaseNamespace,
  runtimeCollectionNamespaceSchema,
} from "../../../apps/be-insta/__tests__/fixtures/realtime/database-namespace";
import { loseFirstCommitReply } from "../../../apps/be-insta/__tests__/integration/users/commit-loss";
import { createMongoAuthPersistence } from "../../../apps/be-insta/src/domains/users/adapters/mongo/auth-persistence";
import { ensureUsersIndexes } from "../../../apps/be-insta/src/domains/users/adapters/mongo/indexes";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import { readTestApiConfig } from "../environment";
import { setupFailure } from "../lifecycle/setup-failure";
export const createUsersEnvironment = async ({
  collectionNamespace,
}: Readonly<{ collectionNamespace?: string }> = {}) => {
  const prefix =
    collectionNamespace === undefined
      ? undefined
      : runtimeCollectionNamespaceSchema.parse(collectionNamespace);
  const connected = await connectDatabase({
    config: readTestApiConfig().mongo,
  });
  const namespace = prefix
    ? createDatabaseNamespace({
        db: connected.apiDb,
        prefix,
      })
    : undefined;
  const database = namespace
    ? {
        ...connected,
        apiDb: namespace.db,
        close: async () => {
          try {
            await namespace.dispose();
          } finally {
            await connected.close();
          }
        },
      }
    : connected;
  const emails: string[] = [];
  const operationIds: string[] = [];
  try {
    await ensureUsersIndexes(database.apiDb);
  } catch (error) {
    try {
      await database.close();
    } catch (cleanupError) {
      throw setupFailure({
        error,
        cleanupError,
        message: "Users fixture setup and cleanup failed",
      });
    }
    throw error;
  }
  const runId = `auth01-${crypto.randomUUID()}`;
  const commitLoss = loseFirstCommitReply(database);
  return {
    database,
    db: database.apiDb,
    persistence: createMongoAuthPersistence({ ...database, clock: Date.now }),
    persistenceWithClock: (clock: () => number) =>
      createMongoAuthPersistence({ ...database, clock }),
    commitLossPersistence: createMongoAuthPersistence({
      ...commitLoss.connection,
      clock: Date.now,
    }),
    observedCommitLoss: commitLoss.observed,
    runId,
    email: (name: string) => {
      const email = `${runId}-${name}@example.test`;
      emails.push(email);
      return email;
    },
    operation: () => {
      const id = crypto.randomUUID();
      operationIds.push(id);
      return id;
    },
    dispose: async () => {
      try {
        const users = await database.apiDb
          .collection("users")
          .find({ emailKey: { $in: emails } }, { projection: { _id: 1 } })
          .toArray();
        const ids = users.map((user) => user._id);
        await database.apiDb
          .collection("users_registration_proofs")
          .deleteMany({ userId: { $in: ids } });
        await database.apiDb
          .collection("users_sessions")
          .deleteMany({ userId: { $in: ids } });
        await database.apiDb
          .collection("users_auth_replays")
          .deleteMany({ owner: { $in: ids } });
        await database.apiDb
          .collection("users_outbox")
          .deleteMany({ operationId: { $in: operationIds } });
        await database.apiDb
          .collection("users")
          .deleteMany({ _id: { $in: ids } });
        for (const [collection, filter] of [
          ["users", { emailKey: { $in: emails } }],
          ["users_registration_proofs", { userId: { $in: ids } }],
          ["users_sessions", { userId: { $in: ids } }],
          ["users_auth_replays", { owner: { $in: ids } }],
          ["users_outbox", { operationId: { $in: operationIds } }],
        ] as const)
          if (
            await database.apiDb.collection(collection).countDocuments(filter)
          )
            throw new Error("Users test cleanup incomplete");
      } finally {
        await database.close();
      }
    },
  };
};
