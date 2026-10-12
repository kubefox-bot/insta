import type { Db } from "mongodb";
import type { Account, AuthSession } from "../../../auth/domain/types";
import { emailKey } from "../../../domain/policy";
import type { SessionId, UserId } from "../../../domain/types";
import { collections } from "../conts";
import type { SessionDocument, UserDocument } from "../types";
/**
 * Находит active-аккаунт по нормализованному email и возвращает hash для аутентификации;
 * отсутствие даёт null, отказ Mongo пробрасывается.
 */
export const findAccount = async (
  db: Db,
  email: string,
): Promise<Account | null> => {
  const user = await db
    .collection<UserDocument>(collections.users)
    .findOne({ emailKey: emailKey(email), status: "active" });
  return user?.status === "active"
    ? {
        id: user._id.toHexString() as UserId,
        username: user.username,
        passwordHash: user.passwordHash,
      }
    : null;
};
/**
 * Читает сессию и её active-пользователя с одним сигналом отмены; null означает
 * отсутствие подходящей пары, сроки переводятся из Date в миллисекунды.
 */
export const readSession = async (
  db: Db,
  id: SessionId,
  signal?: AbortSignal,
): Promise<AuthSession | null> => {
  const session = await db
    .collection<SessionDocument>(collections.sessions)
    .findOne({ backendSessionId: id }, { signal });
  if (!session) return null;
  const user = await db
    .collection<UserDocument>(collections.users)
    .findOne({ _id: session.userId, status: "active" }, { signal });
  if (user?.status !== "active") return null;
  return {
    backendSessionId: id,
    user: { id: user._id.toHexString() as UserId, username: user.username },
    refreshDigest: session.refreshDigest,
    revokeDigest: session.revokeDigest,
    generation: session.generation,
    state: session.state,
    issuedAt: session.issuedAt.getTime(),
    expiresAt: session.expiresAt.getTime(),
    absoluteExpiresAt: session.absoluteExpiresAt.getTime(),
  };
};
