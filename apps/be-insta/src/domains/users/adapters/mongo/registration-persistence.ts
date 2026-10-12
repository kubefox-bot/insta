import type { RegistrationPersistence } from "../../auth/ports/registration/persistence";
import { emailKey } from "../../domain/policy";
import type { UserId } from "../../domain/types";
import { collections } from "./conts";
import { cleanupPending } from "./registration/cleanup";
import { confirmEmailOperation } from "./registration/confirm";
import { registrationCleanupBatch } from "./registration/conts";
import type { MongoConnection, UserDocument } from "./types";
/**
 * Собирает чтение срока, подтверждение email и пакетную очистку pending-регистраций на
 * заимствованном Mongo-соединении.
 */
export const createMongoRegistrationPersistence = (
  connection: MongoConnection,
): RegistrationPersistence => ({
  /**
   * Возвращает срок живой pending-регистрации по нормализованному email; null означает
   * отсутствие подходящей записи, ошибки Mongo пробрасываются.
   */
  deadline: async ({ email, now }) => {
    const pending = await connection.apiDb
      .collection<UserDocument>(collections.users)
      .findOne({
        emailKey: emailKey(email),
        status: "pending_setup",
        registrationExpiresAt: { $gt: new Date(now) },
      });
    return pending?.registrationExpiresAt.getTime() ?? null;
  },
  /**
   * Выбирает ограниченную политикой пачку идентификаторов истёкших pending-регистраций
   * для последующей условной очистки.
   */
  expired: async (now) =>
    (
      await connection.apiDb
        .collection(collections.users)
        .find(
          {
            status: "pending_setup",
            registrationExpiresAt: { $lte: new Date(now) },
          },
          { projection: { _id: 1 } },
        )
        .limit(registrationCleanupBatch)
        .toArray()
    ).map((user) => user._id.toHexString() as UserId),
  confirmEmail: confirmEmailOperation(connection),
  cleanup: cleanupPending(connection),
});
