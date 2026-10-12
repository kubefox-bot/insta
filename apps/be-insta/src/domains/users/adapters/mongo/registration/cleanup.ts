import type { RegistrationPersistence } from "../../../auth/ports/registration/persistence";
import { collections } from "../conts";
import { mongoUserId } from "../mapper";
import { usersTransaction } from "../transaction";
import type { MongoConnection, UserDocument } from "../types";
/**
 * Создаёт условную очистку истёкшего pending-пользователя и его proofs в одной
 * транзакции; активированные записи сохраняются.
 */
export const cleanupPending =
  (connection: MongoConnection): RegistrationPersistence["cleanup"] =>
  async ({ userId, now: requestedNow }) =>
    usersTransaction({
      connection,
      /**
       * Удаляет пользователя только при всё ещё истёкшем pending-статусе, затем его
       * proofs; возвращает число удалённых пользователей.
       */
      operation: async (session) => {
        const now = new Date(Math.max(requestedNow, connection.clock()));
        const id = mongoUserId(userId);
        const deleted = await connection.apiDb
          .collection<UserDocument>(collections.users)
          .deleteOne(
            {
              _id: id,
              status: "pending_setup",
              registrationExpiresAt: { $lte: now },
            },
            { session },
          );
        if (deleted.deletedCount === 1)
          await connection.apiDb
            .collection(collections.proofs)
            .deleteMany({ userId: id }, { session });
        return deleted.deletedCount;
      },
    });
