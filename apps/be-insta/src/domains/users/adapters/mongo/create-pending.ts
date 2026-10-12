import { Result } from "@bloodyowl/boxed";
import { ObjectId } from "mongodb";
import { durations } from "../../domain/conts";
import { emailKey } from "../../domain/policy";
import type { AuthPersistence } from "../../ports/auth-persistence";
import { collections } from "./conts";
import { pendingUser } from "./mapper";
import { authTransaction } from "./transaction";
import type { MongoConnection, ProofDocument, UserDocument } from "./types";
/**
 * Создаёт операцию записи pending-пользователя вместе с proof; отклоняет недопустимые
 * сроки до записи и повторно проверяет истечение внутри транзакции.
 */
export const createPendingOperation =
  (connection: MongoConnection): AuthPersistence["createPending"] =>
  async (input) => {
    if (
      input.registrationExpiresAt <= input.now ||
      input.registrationExpiresAt > input.now + durations.registrationMs ||
      input.emailVerifiedAt > input.now
    )
      return Result.Error("registrationExpired");
    const user: UserDocument = {
      _id: new ObjectId(),
      status: "pending_setup",
      emailKey: emailKey(input.email),
      emailVerifiedAt: new Date(input.emailVerifiedAt),
      registrationExpiresAt: new Date(input.registrationExpiresAt),
    };
    const proof: ProofDocument = {
      _id: new ObjectId(),
      userId: user._id,
      tokenDigest: input.tokenDigest,
      state: "pending",
      expiresAt: user.registrationExpiresAt,
    };
    return authTransaction({
      connection,
      /**
       * Повторно проверяет срок по часам Mongo-адаптера и записывает пользователя и proof
       * атомарно, возвращая проверенную доменную проекцию.
       */
      operation: async (session) => {
        if (
          input.registrationExpiresAt <= Math.max(input.now, connection.clock())
        )
          return Result.Error("registrationExpired");
        await connection.apiDb
          .collection<UserDocument>(collections.users)
          .insertOne(user, { session });
        await connection.apiDb
          .collection<ProofDocument>(collections.proofs)
          .insertOne(proof, { session });
        return Result.Ok(pendingUser(user));
      },
    });
  };
