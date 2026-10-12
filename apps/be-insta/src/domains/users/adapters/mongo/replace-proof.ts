import { Result } from "@bloodyowl/boxed";
import type { AuthPersistence } from "../../ports/auth-persistence";
import { collections } from "./conts";
import { PersistenceAbort } from "./errors";
import { mongoUserId, pendingUser } from "./mapper";
import { readPendingUser } from "./read-pending";
import { authTransaction } from "./transaction";
import type { MongoConnection, ProofDocument, UserDocument } from "./types";
/**
 * Связывает замену proof с Mongo-транзакцией; сохраняет исходный срок живой регистрации и
 * не допускает подтверждение email из будущего.
 */
export const replaceProofOperation =
  (connection: MongoConnection): AuthPersistence["replaceProof"] =>
  async (input) =>
    authTransaction({
      connection,
      /**
       * Условно обновляет время подтверждения и pending-proof; потеря пользователя или
       * proof вызывает откат, чтобы не оставить половину изменения.
       */
      operation: async (session) => {
        const now = Math.max(input.now, connection.clock());
        const id = mongoUserId(input.userId);
        const users = connection.apiDb.collection<UserDocument>(
          collections.users,
        );
        const user = await readPendingUser({
          db: connection.apiDb,
          id,
          now,
          session,
        });
        if (input.emailVerifiedAt > now)
          return Result.Error("registrationExpired");
        const updated = await users.updateOne(
          {
            _id: id,
            status: "pending_setup",
            registrationExpiresAt: { $gt: new Date(now) },
          },
          { $set: { emailVerifiedAt: new Date(input.emailVerifiedAt) } },
          { session },
        );
        if (updated.matchedCount !== 1) throw new PersistenceAbort("conflict");
        const replaced = await connection.apiDb
          .collection<ProofDocument>(collections.proofs)
          .updateOne(
            { userId: id, state: "pending" },
            {
              $set: {
                tokenDigest: input.tokenDigest,
                expiresAt: user.registrationExpiresAt,
              },
            },
            { session },
          );
        if (replaced.matchedCount !== 1)
          throw new PersistenceAbort("invalidProof");
        return Result.Ok(
          pendingUser({
            ...user,
            emailVerifiedAt: new Date(input.emailVerifiedAt),
          }),
        );
      },
    });
