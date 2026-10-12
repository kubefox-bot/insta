import { ObjectId } from "mongodb";
import type { PendingUser, SessionId, UserId } from "../../domain/types";
import { userSchema } from "./schema";
import type { UserDocument } from "./types";
/**
 * Переводит доменный идентификатор в Mongo ObjectId; некорректную строку не превращает в
 * отсутствие пользователя.
 */
export const mongoUserId = (id: UserId) => new ObjectId(id);
/**
 * Проверяет сохранённую pending-запись и строит независимую доменную проекцию с временем
 * в миллисекундах; иной статус или повреждённые данные вызывают ошибку.
 */
export const pendingUser = (document: UserDocument): PendingUser => {
  if (document.status !== "pending_setup")
    throw new Error("Expected pending user");
  const { _id, ...stored } = document;
  userSchema.parse(stored);
  return {
    id: _id.toHexString() as UserId,
    status: document.status,
    emailKey: document.emailKey,
    emailVerifiedAt: document.emailVerifiedAt.getTime(),
    registrationExpiresAt: document.registrationExpiresAt.getTime(),
  };
};
/** Выделяет случайный UUID для backend-сессии без записи в хранилище. */
export const createSessionId = (): SessionId =>
  crypto.randomUUID() as SessionId;
