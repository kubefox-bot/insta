import { Result } from "@bloodyowl/boxed";
import { ObjectId } from "mongodb";
import type { RegistrationPersistence } from "../../../auth/ports/registration/persistence";
import { durations } from "../../../domain/conts";
import { emailKey } from "../../../domain/policy";
import { collections } from "../conts";
import { pendingUser } from "../mapper";
import { authTransaction } from "../transaction";
import type { MongoConnection, ProofDocument, UserDocument } from "../types";
import { confirmedPending } from "./document";
/**
 * Создаёт транзакционное подтверждение email: активный аккаунт оставляет прежним, для
 * pending атомарно заменяет запись и proof.
 */
export const confirmEmailOperation =
  (connection: MongoConnection): RegistrationPersistence["confirmEmail"] =>
  async (input) => {
    if (input.registrationExpiresAt > input.now + durations.registrationMs)
      return Result.Error("registrationExpired");
    const proposedId = new ObjectId();
    const proofId = new ObjectId();
    return authTransaction({
      connection,
      /**
       * Перепроверяет срок, сохраняет pending-регистрацию с непродлённым живым deadline и
       * заменяет все её proofs; существующий active возвращает без изменений.
       */
      operation: async (session) => {
        const now = Math.max(input.now, connection.clock());
        if (input.registrationExpiresAt <= now)
          return Result.Error("registrationExpired");
        const users = connection.apiDb.collection<UserDocument>(
          collections.users,
        );
        const existing = await users.findOne(
          { emailKey: emailKey(input.email) },
          { session },
        );
        if (existing && existing.status === "active")
          return Result.Ok({ status: "active" as const });
        const user = confirmedPending({ input, existing, proposedId, now });
        await users.replaceOne(
          { _id: user._id, status: "pending_setup" },
          user,
          { session, upsert: true },
        );
        const proofs = connection.apiDb.collection<ProofDocument>(
          collections.proofs,
        );
        await proofs.deleteMany({ userId: user._id }, { session });
        await proofs.insertOne(
          {
            _id: proofId,
            userId: user._id,
            tokenDigest: input.tokenDigest,
            state: "pending",
            expiresAt: user.registrationExpiresAt,
          },
          { session },
        );
        return Result.Ok(pendingUser(user));
      },
    });
  };
