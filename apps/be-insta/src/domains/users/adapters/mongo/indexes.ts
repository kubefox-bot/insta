import type { Db } from "mongodb";
import { collections } from "./conts";
/**
 * Создаёт ограничения уникальности email, username, proof, сессий и операций; TTL
 * применяется к replay, а не к pending-пользователям.
 */
export const ensureUsersIndexes = async (db: Db) => {
  await db.collection(collections.users).createIndexes([
    { key: { emailKey: 1 }, unique: true, name: "email_unique" },
    {
      key: { usernameKey: 1 },
      unique: true,
      partialFilterExpression: { usernameKey: { $type: "string" } },
      name: "username_unique",
    },
  ]);
  await db.collection(collections.proofs).createIndexes([
    { key: { tokenDigest: 1 }, unique: true, name: "proof_unique" },
    { key: { userId: 1 }, unique: true, name: "user_proof_unique" },
  ]);
  await db
    .collection(collections.sessions)
    .createIndex(
      { backendSessionId: 1 },
      { unique: true, name: "session_unique" },
    );
  await db.collection(collections.replays).createIndexes([
    {
      key: { owner: 1, operation: 1, keyDigest: 1 },
      unique: true,
      name: "replay_unique",
    },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: "replay_cleanup" },
  ]);
  await db
    .collection(collections.outbox)
    .createIndex(
      { operationId: 1 },
      { unique: true, name: "operation_unique" },
    );
};
