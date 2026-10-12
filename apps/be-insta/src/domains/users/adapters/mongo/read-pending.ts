import type { ClientSession, Db, ObjectId } from "mongodb";
import { collections } from "./conts";
import { PersistenceAbort } from "./errors";
import type { UserDocument } from "./types";
/**
 * Читает пользователя внутри заимствованной транзакции; отсутствие, иной статус или
 * истечение регистрации вызывают бизнес-откат.
 */
export const readPendingUser = async ({
  db,
  id,
  now,
  session,
}: Readonly<{ db: Db; id: ObjectId; now: number; session: ClientSession }>) => {
  const user = await db
    .collection<UserDocument>(collections.users)
    .findOne({ _id: id }, { session });
  if (user?.status !== "pending_setup")
    throw new PersistenceAbort("invalidProof");
  if (user.registrationExpiresAt.getTime() <= now)
    throw new PersistenceAbort("registrationExpired");
  return user;
};
